# -*- coding: utf-8 -*-
"""price-match-audit.py — 「거래처 x 품목 직전가」 제안의 품질을 실측한다 (읽기 전용)

왜 이게 필요한가:
  주문서 금액 제안의 정본은 `/api/prices` 의 **직전가**(recent > matched > base)다.
  2026-09-04 에 구간표·거래처 단가표보다 직전가가 낫다는 것까지는 재 봤는데,
  **직전가 자체가 얼마나 맞는지**는 안 재 봤다. 이 스크립트가 그걸 백테스트로 잰다.

무엇을 재나:
  ① 커버리지 — 새 라인이 들어올 때 그 거래처+품목의 직전 거래가 실제로 있나
  ② 신선도  — 직전 거래가 얼마나 오래됐나(`/api/prices` 는 **기간 제한이 없다**)
  ③ 정확도  — 직전가로 예측하면 실제 금액과 얼마나 갈리나(품목별)
  ④ 수량축  — 같은 거래처·품목이라도 수량이 다르면 단가가 갈리는가(직전가는 수량을 못 본다)
  ⑤ 분리후보 — 한 품목 안에 가격체계가 둘 이상인가(현수막 3분할 `0568` 과 같은 축 탐색)

사용법:
  python scripts/price-match-audit.py            # 전체
  python scripts/price-match-audit.py --since 2026-01-01 --min-lines 80
"""
import argparse, json, math, os, re, statistics as st, subprocess, sys
from collections import defaultdict, Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = "webapp-production"

# 청구면적 = 10cm 올림 + 변당 최소 1m (utils/orderLineAmount.ts 와 같은 규칙)
def billing_area(w, h):
    return (max(1.0, math.ceil(w / 10.0) / 10.0)) * (max(1.0, math.ceil(h / 10.0) / 10.0))


def d1(sql):
    p = subprocess.run(['npx', 'wrangler', 'd1', 'execute', DB, '--remote', '--json',
                        '--command', ' '.join(sql.split())],
                       cwd=ROOT, capture_output=True, shell=(os.name == 'nt'))
    t = p.stdout.decode('utf-8', 'replace')
    dec, d = json.JSONDecoder(), None
    for i, ch in enumerate(t):
        if ch == '[':
            try:
                d, _ = dec.raw_decode(t[i:])
                break
            except ValueError:
                continue
    if d is None:
        sys.exit(f'[D1 실패] {t[:400]}')
    return d[0]['results']


def rate_of(r):
    """라인 1건의 실효단가. AREA=원/㎡(청구면적) · FIXED=원/EA. 못 믿을 라인은 None."""
    q, amt = r.get('q') or 0, r.get('amt') or 0
    if q <= 0 or amt <= 0:
        return None
    w, h = r.get('w') or 0, r.get('h') or 0
    if r.get('pm') == 'AREA':
        # 규격 없음·자(尺) 규격 = `/api/prices` 가 제외하는 것과 같은 조건
        if w <= 0 or h <= 0 or (w <= 10 and h <= 10):
            return None
        return amt / (billing_area(w, h) * q)
    return amt / q


def pct(v, p):
    v = sorted(v)
    if not v:
        return 0.0
    k = (len(v) - 1) * p
    lo, hi = int(math.floor(k)), int(math.ceil(k))
    return v[lo] if lo == hi else v[lo] + (v[hi] - v[lo]) * (k - lo)


def days(a, b):
    """'YYYY-MM-DD' 두 개의 차이(일)."""
    import datetime as dt
    try:
        return (dt.date(*map(int, b[:10].split('-'))) - dt.date(*map(int, a[:10].split('-')))).days
    except Exception:
        return None


def fetch(since):
    return d1(f"""
      SELECT oi.item_id iid, i.item_name nm, i.pricing_method pm,
             o.client_id cid, o.order_date od, o.id oid,
             oi.width w, oi.height h, oi.quantity q, oi.amount amt
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN items  i ON i.id = oi.item_id
       WHERE o.order_date >= '{since}'
         AND o.status NOT IN ('CANCELLED','DRAFT')
         AND COALESCE(o.is_voucher,0) = 0
         AND oi.quantity > 0 AND oi.amount > 0""")


# ── ①②③④ 백테스트 ────────────────────────────────────────────────────────
def backtest(rows, min_lines):
    rows.sort(key=lambda r: (r['od'] or '', r['oid'] or 0))
    last = {}                       # (cid,iid) -> (rate, date, qty)
    stat = defaultdict(lambda: {'n': 0, 'hit': 0, 'err': [], 'age': [], 'qratio': []})
    cover_n = cover_hit = 0
    for r in rows:
        v = rate_of(r)
        key = (r['cid'], r['iid'])
        if v:
            cover_n += 1
            prev = last.get(key)
            if prev:
                cover_hit += 1
                s = stat[r['nm']]
                s['n'] += 1
                e = abs(v - prev[0]) / prev[0]
                s['err'].append(e)
                s['hit'] += 1 if e <= 0.10 else 0
                a = days(prev[1], r['od'] or '')
                if a is not None:
                    s['age'].append(a)
                if prev[2] and r['q']:
                    s['qratio'].append((max(prev[2], r['q']) / min(prev[2], r['q']), e))
            last[key] = (v, r['od'] or '', r['q'])
    return stat, cover_n, cover_hit


# ── ⑤ 분리 후보 ──────────────────────────────────────────────────────────
def split_candidates(rows, min_lines):
    """한 품목 안에 가격체계가 둘 이상인지 — 폭축·수량축으로 갈라 중앙값 비율을 본다."""
    by = defaultdict(list)
    for r in rows:
        v = rate_of(r)
        if v:
            by[r['nm']].append((v, r))
    out = []
    for nm, lst in by.items():
        if len(lst) < min_lines:
            continue
        rates = [v for v, _ in lst]
        spread = pct(rates, .75) / pct(rates, .25) if pct(rates, .25) > 0 else 0
        axes = []
        # 폭축 — 짧은변 152cm(원단 상용폭) 초과
        # ⚠️w 만 있고 h 가 비는 라인이 있다 — 둘 다 확인하지 않으면 min() 이 터진다
        sized = [(v, min(r['w'], r['h'])) for v, r in lst if (r['w'] or 0) > 0 and (r['h'] or 0) > 0]
        a = [v for v, m in sized if m > 152]
        b = [v for v, m in sized if m <= 152]
        if len(a) >= 20 and len(b) >= 20:
            axes.append(('폭>152', st.median(a) / st.median(b), len(a), len(b)))
        # 수량축 — 20장 경계
        a = [v for v, r in lst if (r['q'] or 0) >= 20]
        b = [v for v, r in lst if 0 < (r['q'] or 0) < 20]
        if len(a) >= 20 and len(b) >= 20:
            axes.append(('수량≥20', st.median(b) / max(st.median(a), 1e-9), len(b), len(a)))
        # 거래처축 — 상위 거래처 중앙값의 최대/최소 (같은 품목인데 거래처마다 체계가 다른가)
        cl = defaultdict(list)
        for v, r in lst:
            cl[r['cid']].append(v)
        meds = sorted(st.median(v) for v in cl.values() if len(v) >= 5)
        if len(meds) >= 5:
            axes.append(('거래처', pct(meds, .9) / max(pct(meds, .1), 1e-9), len(meds), 0))
        out.append((nm, len(lst), spread, st.median(rates), axes))
    return sorted(out, key=lambda x: -x[1])


# ── ⑥ 매칭 축 비교 — 수량·규격을 넣으면 나아지나 ─────────────────────────────
QBANDS = [(2, '1~2'), (9, '3~9'), (49, '10~49'), (10 ** 9, '50+')]


def qband(q):
    for hi, nm in QBANDS:
        if (q or 0) <= hi:
            return nm
    return QBANDS[-1][1]


def variant_backtest(rows):
    """현행(직전가) vs 수량대·규격을 맞춘 직전가.

    ★공정하게 비교하려면 **폴백을 포함해야** 한다 — 「같은 수량대 직전가」는 못 찾을 때가 있고,
      실제 구현도 그때는 그냥 직전가로 떨어질 것이기 때문이다.
      그래서 두 가지를 같이 낸다: 좁힌 조건이 **맞은 경우만**(적중률) / **폴백 포함 전체**(실효).
    """
    rows.sort(key=lambda r: (r['od'] or '', r['oid'] or 0))
    hist = defaultdict(list)          # (cid,iid) -> [(rate,q,w,h)]
    res = {k: {'n': 0, 'err': [], 'strict_n': 0, 'strict_err': []}
           for k in ('V0 직전가(현행)', 'V1 +수량대', 'V2 +규격', 'V3 +수량대+규격')}
    for r in rows:
        v = rate_of(r)
        if not v:
            continue
        key = (r['cid'], r['iid'])
        h = hist[key]
        if h:
            base = h[-1][0]
            spec = (r['w'], r['h'])
            band = qband(r['q'])
            cand = {
                'V0 직전가(현행)': base,
                'V1 +수량대': next((x[0] for x in reversed(h) if qband(x[1]) == band), None),
                'V2 +규격': next((x[0] for x in reversed(h) if (x[2], x[3]) == spec), None),
                'V3 +수량대+규격': next((x[0] for x in reversed(h)
                                    if qband(x[1]) == band and (x[2], x[3]) == spec), None),
            }
            for k, p in cand.items():
                d = res[k]
                d.setdefault('by', defaultdict(list))
                if p:
                    d['strict_n'] += 1
                    d['strict_err'].append(abs(v - p) / p)
                use = p if p else base                 # 폴백 = 현행 직전가
                d['n'] += 1
                d['err'].append(abs(v - use) / use)
                d['by'][r['nm']].append(abs(v - use) / use)
        h.append((v, r['q'], r['w'], r['h']))
        if len(h) > 400:                               # 메모리 상한(거래처x품목당)
            del h[:200]
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--since', default='2026-01-01')
    ap.add_argument('--min-lines', type=int, default=80)
    ap.add_argument('--top', type=int, default=18)
    a = ap.parse_args()

    # fetch()가 이 값을 SQL 문자열에 직접 삽입해 `wrangler d1 execute --remote --command`로
    # 넘긴다(prod DB, Windows에선 shell=True) — 형식을 강제하지 않으면 SQL/셸 인젝션이 된다.
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', a.since):
        sys.exit(f"[--since 형식 오류] 'YYYY-MM-DD'만 허용: {a.since!r}")

    rows = fetch(a.since)
    print(f'대상 라인 {len(rows):,}건 ({a.since}~ · 취소/전표 제외)')

    stat, cover_n, cover_hit = backtest(rows, a.min_lines)
    print(f'\n## ① 커버리지 — 직전가가 있었나')
    print(f'  단가로 쓸 수 있는 라인 {cover_n:,}건 중 **직전 거래 있음 {cover_hit:,}건 '
          f'({cover_hit*100.0/max(cover_n,1):.1f}%)** · 나머지는 base_price 로 떨어진다')

    tot_err = [e for s in stat.values() for e in s['err']]
    tot_age = [x for s in stat.values() for x in s['age']]
    print(f'\n## ②③ 정확도·신선도 (전체 {len(tot_err):,}건)')
    print(f'  중앙 오차 **{st.median(tot_err)*100:.1f}%** · ±10% 적중 '
          f'**{sum(1 for e in tot_err if e<=.10)*100.0/len(tot_err):.1f}%** · '
          f'±20% {sum(1 for e in tot_err if e<=.20)*100.0/len(tot_err):.1f}% · '
          f'2배 이상 빗나감 {sum(1 for e in tot_err if e>1.0)*100.0/len(tot_err):.1f}%')
    print(f'  직전 거래 경과일 중앙 **{st.median(tot_age):.0f}일** · '
          f'90일 초과 {sum(1 for x in tot_age if x>90)*100.0/len(tot_age):.1f}% · '
          f'180일 초과 {sum(1 for x in tot_age if x>180)*100.0/len(tot_age):.1f}%')

    print(f'\n| 품목 | 예측건 | 중앙오차 | ±10% | 경과일 | 수량 10배차 때 오차 |')
    print(f'|---|--:|--:|--:|--:|--:|')
    for nm, s in sorted(stat.items(), key=lambda kv: -kv[1]['n'])[:a.top]:
        if s['n'] < 20:
            continue
        big = [e for ratio, e in s['qratio'] if ratio >= 10]
        small = [e for ratio, e in s['qratio'] if ratio < 2]
        cmp_ = (f"{st.median(big)*100:.0f}% vs {st.median(small)*100:.0f}%"
                if len(big) >= 5 and len(small) >= 5 else '-')
        print(f"| {nm[:26]} | {s['n']:,} | **{st.median(s['err'])*100:.1f}%** "
              f"| {s['hit']*100.0/s['n']:.0f}% | {st.median(s['age']):.0f}일 | {cmp_} |")

    print(f'\n## ⑤ 분리 후보 — 한 품목에 가격체계가 둘 이상인가 (라인 {a.min_lines}+)')
    print(f'| 품목 | 라인 | 중앙단가 | P75/P25 | 갈리는 축(배율) |')
    print(f'|---|--:|--:|--:|---|')
    for nm, n, spread, med, axes in split_candidates(rows, a.min_lines)[:a.top]:
        hot = [f'**{k} {r:.2f}배**' if r >= 1.5 else f'{k} {r:.2f}' for k, r, x, y in axes]
        print(f"| {nm[:26]} | {n:,} | {med:,.0f} | {spread:.2f} | {' · '.join(hot) or '-'} |")

    print('\n## ⑥ 매칭 축 비교 — 수량·규격을 조건에 넣으면 나아지나')
    vb = variant_backtest(rows)
    print('| 방식 | 조건 적중 | 적중 시 중앙오차 | 적중 시 ±10% | 폴백포함 중앙오차 | 폴백포함 ±10% |')
    print('|---|--:|--:|--:|--:|--:|')
    base_n = vb['V0 직전가(현행)']['n'] or 1
    for k, d in vb.items():
        se, e = d['strict_err'], d['err']
        print(f"| {k} | {d['strict_n']*100.0/base_n:.0f}% "
              f"| **{st.median(se)*100:.1f}%** | {sum(1 for x in se if x<=.10)*100.0/len(se):.0f}% "
              f"| {st.median(e)*100:.1f}% | {sum(1 for x in e if x<=.10)*100.0/len(e):.0f}% |")

    print('\n## ⑥-B 품목별 — 현행 vs 규격 맞춤(폴백 포함)')
    print('| 품목 | 건수 | 현행 중앙오차 | 규격맞춤 | 현행 ±10% | 규격맞춤 ±10% | 2배이상 빗나감 |')
    print('|---|--:|--:|--:|--:|--:|--:|')
    v0, v2 = vb['V0 직전가(현행)']['by'], vb['V2 +규격']['by']
    for nm in sorted(v0, key=lambda k: -len(v0[k]))[:14]:
        a_, b_ = v0[nm], v2.get(nm) or v0[nm]
        if len(a_) < 30:
            continue
        print(f"| {nm[:26]} | {len(a_):,} | {st.median(a_)*100:.1f}% | **{st.median(b_)*100:.1f}%** "
              f"| {sum(1 for x in a_ if x<=.10)*100.0/len(a_):.0f}% "
              f"| **{sum(1 for x in b_ if x<=.10)*100.0/len(b_):.0f}%** "
              f"| {sum(1 for x in a_ if x>1)*100.0/len(a_):.1f}% → "
              f"{sum(1 for x in b_ if x>1)*100.0/len(b_):.1f}% |")


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
