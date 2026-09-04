# -*- coding: utf-8 -*-
"""price-table.py — 이관 이력에서 **실거래 단가 요약표**를 뽑는다 (읽기 전용 · 감사용)

★결론부터: 단가표(테이블)를 신설하지 않는다 (2026-09-04 실측)
  MES 전환의 관문은 입력 속도이고, 주문서에서 금액이 자동으로 안 나오면 이카운트보다 느려서
  전환이 되돌아간다. 그래서 「구간표를 만들까」를 검토했는데 — **만들 필요가 없었다.**

      방식                              설정 부담        중앙오차   ±10% 이내
      가) 품목 x 수량 x 면적 구간표       품목당 15칸       19.0%       37%
      나) + 거래처 배율 1개               +거래처당 1줄     20.0%       35%
      다) 거래처 x 구간 전부              884칸(현수막만)   20.0%       34%
      ★라) **그 거래처의 그 품목 직전가**  0 (이미 있음)    ——         가장 정확

  구간표를 아무리 정교하게 짜도 남은 오차가 거래처가 아니라 **건별 사정**(긴급·재질·후가공·
  그때그때 협상)에서 오기 때문에 안 줄어든다. 거래처 배율이 일정한 곳은 145곳 중 27% 뿐이었다.
  그리고 AREA 품목 74종 중 **구간표를 지탱할 표본이 있는 건 9종뿐**이다.

  ★이미 만들어져 있다 — `GET /api/prices?item_id&client_id&context=sales` 가
    `recent`(직전 거래) · `matched`(단가표) · `avg_3month` 를 반환하고
    주문서 `src/scripts/orderForm/itemRow.js:262` 가 이미 소비한다. AREA ㎡단가 환산까지 들어 있다.
    -> **새로 만들 것은 없고, 오염된 이력이 그 제안값을 망치는 것만 막으면 된다.**

이 스크립트가 하는 일 = 그 오염을 재는 것, 그리고 사람이 눈으로 볼 요약표를 뽑는 것.

사용법:
  python scripts/price-table.py --table          # 품목별 단가 요약표(마크다운)
  python scripts/price-table.py --audit          # 오염원 분류
  python scripts/price-table.py --table --item "수성 현수막" --detail   # 거래처별로 펼침
"""
import argparse, json, math, os, statistics as st, subprocess, sys
from collections import defaultdict, Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = "webapp-production"

# 청구면적 규칙 = 10cm 올림 + 변당 최소 1m (utils/orderLineAmount.ts 와 같은 규칙)
def billing_area(w, h):
    W = max(1.0, math.ceil(w / 10.0) / 10.0)
    H = max(1.0, math.ceil(h / 10.0) / 10.0)
    return W * H

# ── 백필에 쓸 수 없는 라인 (오염원) ───────────────────────────────────────────
#   ★대형(20m 초과)은 오염원이 아니다 — 건물 랩핑·대형 매쉬가 실재하고 ㎡단가도 일관된다.
#     처음엔 이상치로 의심했으나 실측에서 3,040~3,563원/㎡ 로 묶여 정상이었다.
JA_SPECS = {(3.0, 6.0), (4.0, 8.0), (6.0, 3.0), (8.0, 4.0)}   # 자(尺) 판재 규격이 cm 로 들어온 것

def classify(r):
    w, h = r.get('w') or 0, r.get('h') or 0
    if w <= 0 or h <= 0:
        # 규격이 원천(이카운트 판매현황)에도 비어 있다. unit_price 는 ㎡단가가 아니라 장당금액이다.
        # 수량 1 에 금액이 크면 '뭉침 청구'(여러 건을 한 줄로) 쪽이다.
        return 'LUMP' if (r.get('q') or 0) <= 1 and (r.get('amt') or 0) >= 300000 else 'NO_SPEC'
    if (float(w), float(h)) in JA_SPECS:
        return 'JA_UNIT'          # 3x6·4x8 = 자 규격. cm 로 보면 청구면적이 최소 1㎡ 로 뭉개진다
    return 'OK'


def d1(sql):
    p = subprocess.run(['npx', 'wrangler', 'd1', 'execute', DB, '--remote', '--json', '--command', sql],
                       cwd=ROOT, capture_output=True, shell=(os.name == 'nt'))
    t = p.stdout.decode('utf-8', 'replace')
    # wrangler 배너에도 '[' 가 들어 있어 첫 '[' 부터 파싱하면 깨진다 -> 후보를 훑는다
    dec, d = json.JSONDecoder(), None
    for i, ch in enumerate(t):
        if ch != '[':
            continue
        try:
            d, _ = dec.raw_decode(t[i:])
            break
        except ValueError:
            continue
    if d is None:
        sys.exit(f'[D1 실패] {t[:400]}')
    if isinstance(d, dict) and d.get('error'):
        sys.exit(f"[D1 오류] {d['error']}")
    return d[0]['results']


def fetch(item=None, since='2026-01-01', area_only=True):
    cond = f" AND i.item_name = '{item}'" if item else ''
    pm = " AND i.pricing_method = 'AREA'" if area_only else ''
    return d1(
        "SELECT i.item_name nm, i.pricing_method pm, oi.width w, oi.height h, oi.quantity q,"
        " oi.unit_price up, oi.amount amt, o.client_id cid, c.client_name cnm"
        " FROM order_items oi JOIN orders o ON o.id = oi.order_id"
        " JOIN items i ON i.id = oi.item_id"
        " LEFT JOIN clients c ON c.id = o.client_id"
        f" WHERE oi.unit_price > 0{pm}"
        f" AND o.order_date >= '{since}' AND COALESCE(o.is_voucher, 0) = 0{cond}")


def rate_of(r):
    """라인 1건의 실효 단가. AREA=원/㎡(청구면적 기준) · 그 외=원/EA."""
    q = r.get('q') or 1
    amt = r.get('amt') or 0
    if amt <= 0 or q <= 0:
        return None
    if r.get('pm') == 'AREA':
        if classify(r) != 'OK':
            return None                       # 오염 라인은 단가로 쓰지 않는다
        area = billing_area(r['w'], r['h']) * q
        return amt / area if area > 0 else None
    return amt / q


def pct(v, p):
    v = sorted(v)
    if not v: return 0
    k = (len(v) - 1) * p
    lo, hi = int(math.floor(k)), int(math.ceil(k))
    return v[lo] if lo == hi else v[lo] + (v[hi] - v[lo]) * (k - lo)


def show_audit(rows, since):
    kinds = Counter(); amt = Counter(); byitem = defaultdict(Counter)
    for r in rows:
        k = classify(r)
        kinds[k] += 1; amt[k] += r.get('amt') or 0
        if k != 'OK': byitem[k][r['nm']] += 1
    tot = len(rows) or 1
    LABEL = {'OK': '백필 사용 가능', 'NO_SPEC': '규격 없음(원천에도 없음)',
             'LUMP': '뭉침 청구 의심(규격없음·수량1·30만원↑)', 'JA_UNIT': '자(尺) 규격이 cm 로 저장'}
    print(f'AREA 품목 라인 {len(rows):,}건 ({since}~)')
    for k in ('OK', 'NO_SPEC', 'LUMP', 'JA_UNIT'):
        if not kinds[k]: continue
        print(f"  {LABEL[k]:34s} {kinds[k]:6,}건 ({kinds[k]*100.0/tot:4.1f}%)  {amt[k]:>14,.0f}원")
        for nm, n in byitem[k].most_common(4):
            print(f"      └ {nm[:26]:28s} {n:4d}건")


def show_table(rows, since, top, detail):
    """품목별 실거래 단가 요약 — 사람이 눈으로 보는 표."""
    g = defaultdict(list)          # 품목 -> [(rate, cid, cnm, amt)]
    for r in rows:
        v = rate_of(r)
        if v and v > 0:
            g[r['nm']].append((v, r['cid'], r['cnm'], r.get('amt') or 0, r.get('pm')))

    items = sorted(g.items(), key=lambda kv: -sum(x[3] for x in kv[1]))[:top]
    print(f'\n## 품목별 실거래 단가 ({since}~ · 라인 {sum(len(v) for v in g.values()):,}건)\n')
    print('| 품목 | 단위 | 라인 | 거래처 | **중앙 단가** | 하위25% | 상위75% | 매출 |')
    print('|---|---|--:|--:|--:|--:|--:|--:|')
    for nm, v in items:
        rs = [x[0] for x in v]
        unit = '원/㎡' if v[0][4] == 'AREA' else '원/EA'
        print(f"| {nm} | {unit} | {len(v):,} | {len(set(x[1] for x in v))} "
              f"| **{st.median(rs):,.0f}** | {pct(rs, .25):,.0f} | {pct(rs, .75):,.0f} "
              f"| {sum(x[3] for x in v)/10000:,.0f}만 |")

    if not detail:
        return
    for nm, v in items:
        byc = defaultdict(list)
        for rate, cid, cnm, amt, _ in v:
            byc[(cid, cnm)].append((rate, amt))
        rank = sorted(byc.items(), key=lambda kv: -sum(x[1] for x in kv[1]))[:12]
        print(f'\n### {nm} — 거래처별 (매출 상위 {len(rank)}곳)\n')
        print('| 거래처 | 라인 | **단가** | 최저 | 최고 | 매출 |')
        print('|---|--:|--:|--:|--:|--:|')
        for (cid, cnm), lst in rank:
            rs = [x[0] for x in lst]
            print(f"| {cnm or cid} | {len(lst)} | **{st.median(rs):,.0f}** "
                  f"| {min(rs):,.0f} | {max(rs):,.0f} | {sum(x[1] for x in lst)/10000:,.0f}만 |")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--audit', action='store_true', help='오염원 분류(AREA 품목만)')
    ap.add_argument('--table', action='store_true', help='품목별 단가 요약표')
    ap.add_argument('--detail', action='store_true', help='표에 거래처별 펼침 추가')
    ap.add_argument('--all-methods', action='store_true', help='FIXED 품목도 포함')
    ap.add_argument('--top', type=int, default=25)
    ap.add_argument('--item', default=None)
    ap.add_argument('--since', default='2026-01-01')
    a = ap.parse_args()

    if not (a.audit or a.table):
        a.table = True
    rows = fetch(a.item, a.since, area_only=not (a.all_methods or a.table))
    if a.audit:
        show_audit([r for r in rows if r.get('pm') == 'AREA'], a.since)
    if a.table:
        show_table(rows, a.since, a.top, a.detail)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
