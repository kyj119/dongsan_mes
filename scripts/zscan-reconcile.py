# -*- coding: utf-8 -*-
"""zscan-reconcile.py — Z: 작업파일 ↔ 이카운트 주문 대사(對査)

무엇을 뒤집었나:
  1차 백테스트에서 나는 불일치를 **노이즈**로 취급했다("링키지는 76%에서 포화, 표본 검증용으로만").
  그건 「정확도 지표」로 볼 때의 얘기고, 용준님 지적대로 **불일치 자체가 산출물**이다:

    · 파일은 있는데 주문이 없다  → 청구 누락 후보. **실제로 못 받은 돈일 수 있다**
    · 주문은 있는데 파일이 없다  → 원자재·상품 판매(정상)거나, 파일 미생성/다른 축(점검 대상)

  MES 전환 전 병행 기간에 이 대사를 돌리면, 전환이 끝나기 전에 누락을 잡고
  문제 유형을 기록으로 남길 수 있다.

★핵심은 **분류**다. 「파일 없는 주문」을 전부 이상으로 보면 쓸모가 없다 —
  택배비·부자재·상품 판매는 애초에 출력 파일이 없는 게 정상이다.
  이카운트 품목명에 규격 `[가로*세로]` 가 붙어 있는 라인만 「출력물」로 보고 대사한다.

사용법:
  python scripts/zscan-reconcile.py --from 2026-07-01 --to 2026-08-11
  python scripts/zscan-reconcile.py --from … --to … --truth <주문서현황.xlsx> --out <디렉터리>

입력:
  · docs/order-file-matching/parsed.csv · parsed_jeonsa.csv  (Z: 파일 파싱 결과)
  · 이카운트 ▸ 재고I ▸ 영업관리 ▸ 주문 ▸ **주문서현황** 엑셀 (메뉴=현황·필터 해제)

출력(CSV 3종 + 콘솔 요약):
  recon_missing_order.csv  파일 있는데 주문 없음  ← 청구 누락 후보
  recon_missing_file.csv   주문 있는데 파일 없음  ← 파일 미생성·축 누락
  recon_qty_mismatch.csv   붙었는데 수량이 다름   ← 과소·과대 청구 후보
"""
import argparse, csv, io, json, os, re, sys, urllib.request
from collections import Counter, defaultdict
from datetime import date

try:
    import pandas as pd
except ImportError:
    sys.exit('pandas 가 필요합니다: pip install pandas openpyxl')

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, 'docs', 'order-file-matching')
DEFAULT_TRUTH = os.path.join(ROOT, '품목마스터', '원천주문데이터', '동산_주문서현황_2607-2608.xlsx')

RX_KEY = re.compile(r'^2026/(\d\d)/(\d\d)\s*-\s*(\d+)$')
RX_GSPEC = re.compile(r'\[\s*(\d+(?:\.\d+)?)\s*[*xX]\s*(\d+(?:\.\d+)?)\s*\]')
RX_NORM = re.compile(r'(주식회사|\(주\)|㈜|유한회사|주\)|\s|\.|,|-)')
norm = lambda s: RX_NORM.sub('', str(s or ''))
WINDOW = 7
# 축 코드 — zscan-intake.cjs 의 AXIS_CODE 와 같아야 한다(그룹 키 문자열이 갈리면 되쓰기 0건).
AXIS_CODE = {'★UV솔벤★': 'U', '★현수막-수성출력★': 'A', '메인1': 'J'}
W_SPEC, W_CLIENT, W_DATE = 3.0, 2.0, 0.4
LEFTOVER_MIN = 3.0
# 재출력·수정·샘플은 **새 주문이 아니다**(docs/REWORK_RULES.md) → 청구 누락 후보에서 뺀다
REWORK_FLAGS = {'수정', '재출력', '재', '샘플'}


def skey(w, h):
    a, b = sorted([round(float(w)), round(float(h))])
    return (a, b)


# ── MES 되쓰기 ────────────────────────────────────────────────
# CSV 로만 남기면 다음 주엔 잊힌다. 주문에 붙여야 화면에서 보이고 이력이 쌓인다.
# ★대사는 판정이 아니라 **표시**다 — 주문 금액·상태를 건드리지 않는다.
def _api(base, path, token=None, payload=None):
    req = urllib.request.Request(base.rstrip('/') + path,
                                 data=json.dumps(payload).encode() if payload is not None else None,
                                 headers={'Content-Type': 'application/json',
                                          **({'Authorization': 'Bearer ' + token} if token else {})},
                                 method='POST' if payload is not None else 'GET')
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


def writeback(base, user, pw, verdicts):
    """verdicts = [{batch_key, status, note}] → POST /api/orders/recon-status"""
    tok = _api(base, '/api/auth/login', payload={'username': user, 'password': pw})['data']['token']
    up = sk = un = 0
    for i in range(0, len(verdicts), 200):
        d = _api(base, '/api/orders/recon-status', tok, {'items': verdicts[i:i + 200]})['data']
        up += d.get('updated', 0); sk += d.get('skipped', 0); un += d.get('unresolved', 0)
    return up, sk, un


def load_truth(path):
    df = pd.read_excel(path, header=1)
    df.columns = [str(c).strip() for c in df.columns]
    kc = df.columns[0]
    orders = defaultdict(lambda: {'lines': [], 'client': '', 'dt': None, 'amount': 0.0})
    for _, r in df.iterrows():
        mo = RX_KEY.match(str(r[kc]).strip())
        if not mo:
            continue
        dt = date(2026, int(mo.group(1)), int(mo.group(2)))
        label = str(r.get('품목명(규격)', '') or '')
        sp = RX_GSPEC.search(label)
        o = orders[(dt, int(mo.group(3)))]
        o['dt'] = dt
        o['client'] = str(r.get('거래처명', '') or '').strip()
        try:
            q = float(r.get('수량')) if r.get('수량') is not None else None
        except Exception:
            q = None
        try:
            # 엑셀 빈칸은 NaN 으로 온다 — 그대로 더하면 합계 전체가 NaN 이 되어 round() 가 죽는다
            v = float(r.get('공급가액') or 0)
            if v == v:                      # NaN 은 자기 자신과 다르다
                o['amount'] += v
        except Exception:
            pass
        o['lines'].append({'w': float(sp.group(1)) if sp else None,
                           'h': float(sp.group(2)) if sp else None,
                           'item': RX_GSPEC.sub('', label).strip(), 'qty': q})
    return orders


def load_groups(d0, d1):
    groups = defaultdict(lambda: {'files': [], 'dt': None, 'clients': Counter(),
                                  'axes': set(), 'flags': Counter()})
    for fn in ('parsed.csv', 'parsed_jeonsa.csv'):
        p = os.path.join(DOCS, fn)
        if not os.path.exists(p):
            continue
        for r in csv.DictReader(open(p, encoding='utf-8')):
            if not (r.get('y') and r.get('m') and r.get('d')):
                continue
            try:
                dt = date(int(r['y']), int(r['m']), int(r['d']))
            except Exception:
                continue
            if not (d0 <= dt <= d1):
                continue
            seq, client = r.get('seq'), (r.get('client') or None)
            # ★그룹 키는 zscan-intake.cjs 의 groupKey() 와 **글자 하나까지 같아야** 한다.
            #   거기 저장된 batch_key 로 주문을 되찾기 때문이다. 거래처는 **공백만** 지운다
            #   (여기서 norm() 을 쓰면 `(주)`·`-` 까지 지워져 문자열이 갈리고, 되쓰기가 0건이 된다).
            #   ★축 코드도 넣는다 — 순번이 축마다 따로 매겨져 안 넣으면 다른 주문이 뭉친다.
            ax = AXIS_CODE.get(r['axis'], 'X')
            if seq:
                key = (ax + 'S', dt, int(seq))
            elif client:
                key = (ax + 'C', dt, re.sub(r'\s', '', client))
            else:
                key = (ax + 'D', dt, r['rel'].split('\\')[-2] if '\\' in r['rel'] else '')
            g = groups[key]
            g['dt'] = dt
            g['axes'].add(r['axis'])
            if client:
                g['clients'][client] += 1
            if r.get('flag'):
                g['flags'][r['flag']] += 1
            g['files'].append({'name': r['name'], 'rel': r['rel'], 'axis': r['axis'],
                               'w': float(r['w']) if r.get('w') else None,
                               'h': float(r['h']) if r.get('h') else None,
                               'qty': int(r['qty']) if r.get('qty') else None,
                               'flag': r.get('flag') or ''})
    return dict(groups)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--from', dest='d0', required=True)
    ap.add_argument('--to', dest='d1', required=True)
    ap.add_argument('--truth', default=DEFAULT_TRUTH)
    ap.add_argument('--out', default=DOCS)
    ap.add_argument('--writeback', action='store_true',
                    help='대사 결과를 MES 주문에 기록한다(orders.recon_status). 없으면 CSV 만.')
    ap.add_argument('--url', default=os.environ.get('ZSCAN_URL', 'http://localhost:3000'))
    ap.add_argument('--user', default=os.environ.get('ZSCAN_USER', 'admin'))
    ap.add_argument('--pass', dest='pw', default=os.environ.get('ZSCAN_PASS', 'password'))
    a = ap.parse_args()
    d0 = date(*[int(x) for x in a.d0.split('-')])
    d1 = date(*[int(x) for x in a.d1.split('-')])

    orders = load_truth(a.truth)
    orders = {k: v for k, v in orders.items() if d0 <= v['dt'] <= d1}
    groups = load_groups(d0, d1)

    # ── ① 출력물 주문 / 비출력 주문 분리 ─────────────────────
    # 이게 대사의 전부다. 원자재·상품·택배비는 파일이 없는 게 정상이라 대사 대상이 아니다.
    o_spec = {k: v for k, v in orders.items() if any(l['w'] for l in v['lines'])}
    o_nospec = {k: v for k, v in orders.items() if k not in o_spec}
    g_spec = {k: v for k, v in groups.items() if any(f['w'] for f in v['files'])}

    idx = defaultdict(set)
    for k, o in o_spec.items():
        for l in o['lines']:
            if l['w']:
                idx[skey(l['w'], l['h'])].add(k)

    def client_hit(g, ok):
        if not g['clients']:
            return False
        tc = norm(o_spec[ok]['client'])
        for fc, _ in g['clients'].most_common(3):
            f = norm(fc)
            if f and tc and (f in tc or tc in f):
                return True
        return False

    pairs = []
    for gk, g in g_spec.items():
        cnt = Counter()
        for f in g['files']:
            if f['w']:
                for ok in idx.get(skey(f['w'], f['h']), ()):
                    if abs((o_spec[ok]['dt'] - g['dt']).days) <= WINDOW:
                        cnt[ok] += 1
        for ok, n in cnt.items():
            sc = (W_SPEC * n + W_CLIENT * client_hit(g, ok)
                  - W_DATE * abs((o_spec[ok]['dt'] - g['dt']).days))
            pairs.append((sc, gk, ok))
    pairs.sort(key=lambda t: -t[0])
    has_cand = {gk for _, gk, _ in pairs}          # 후보가 하나라도 있었나 — 판정 강도를 가른다
    matched, used = {}, set()
    for sc, gk, ok in pairs:                       # 전역 1:1 (쏠림 방지)
        if gk not in matched and ok not in used:
            matched[gk] = ok; used.add(ok)
    for sc, gk, ok in pairs:                       # 잔여
        if gk not in matched and sc >= LEFTOVER_MIN:
            matched[gk] = ok

    os.makedirs(a.out, exist_ok=True)

    # ── ② 파일 있는데 주문 없음 = 청구 누락 후보 ───────────────
    rows = []
    for gk, g in g_spec.items():
        if gk in matched:
            continue
        rework = [f for f, _ in g['flags'].most_common() if f in REWORK_FLAGS]
        # ★판정 강도를 가른다. 「후보는 있었는데 배정에서 밀린 것」을 청구 누락이라 부르면 오탐이다 —
        #   같은 규격을 여러 그룹이 놓고 경쟁해 하나만 이긴 경우이고, 실제론 같은 주문의 일부일 수 있다.
        if rework:
            verdict = '재출력·수정·샘플(정상)'
        elif gk in has_cand:
            verdict = '△중복 배정 의심(같은 주문 분할 가능)'
        else:
            verdict = '★청구 누락 후보(대응 주문 없음)'
        rows.append({
            '판정': verdict,
            '일자': g['dt'].isoformat(),
            '그룹키': f'{gk[0]}-{gk[2]}',
            '축': '/'.join(sorted(g['axes'])),
            '거래처(파일)': g['clients'].most_common(1)[0][0] if g['clients'] else '',
            '파일수': len(g['files']),
            '규격': ' · '.join(sorted({f"{int(f['w'])}x{int(f['h'])}"
                                      for f in g['files'] if f['w']})[:5]),
            '수량합': sum(f['qty'] or 1 for f in g['files']),
            '상태플래그': '·'.join(rework),
            '대표파일': g['files'][0]['rel'],
        })
    rows.sort(key=lambda r: (not r['판정'].startswith('★'), r['일자']))
    write_csv(os.path.join(a.out, 'recon_missing_order.csv'), rows)
    susp = [r for r in rows if r['판정'].startswith('★')]
    dupsusp = [r for r in rows if r['판정'].startswith('△')]

    # ── ③ 주문 있는데 파일 없음 ──────────────────────────────
    # 규격이 붙어 있어도 **파일이 없는 게 정상인 품목**이 있다 — 깃대·국기봉·배너대 같은 조립/부자재는
    # 규격 표기(`[R-150(120*80)]`)만 있고 출력 도안이 없다. 이걸 안 거르면 상위 금액이 전부 이것들이다.
    RX_ASSY = re.compile(r'깃대|국기봉|봉\b|밴드|배너대|세트|조립|거치|받침|프레임|고리|끈|용품|부속')
    rows2 = []
    for ok, o in o_spec.items():
        if ok in set(matched.values()):
            continue
        items = [l['item'] for l in o['lines'] if l['item']]
        assy = sum(1 for it in items if RX_ASSY.search(it))
        verdict = ('부자재·조립(파일 없어도 정상)' if items and assy == len(items)
                   else '△일부 부자재 포함' if assy
                   else '★파일 없음(출력물 주문)')
        rows2.append({
            '판정': verdict,
            '일자': o['dt'].isoformat(), '주문No': ok[1], '거래처': o['client'],
            '라인수': len(o['lines']),
            '품목': ' · '.join(sorted({l['item'] for l in o['lines'] if l['item']})[:4]),
            '규격': ' · '.join(sorted({f"{int(l['w'])}x{int(l['h'])}"
                                      for l in o['lines'] if l['w']})[:5]),
            '공급가액': round(o['amount']),
        })
    rows2.sort(key=lambda r: (not r['판정'].startswith('★'), -r['공급가액']))
    write_csv(os.path.join(a.out, 'recon_missing_file.csv'), rows2)
    real2 = [r for r in rows2 if r['판정'].startswith('★')]

    # ── ④ 붙었는데 수량이 다름 ───────────────────────────────
    by_order = defaultdict(list)
    for gk, ok in matched.items():
        by_order[ok].append(gk)
    rows3 = []
    for ok, gks in by_order.items():
        fs = Counter()
        for gk in gks:
            for f in g_spec[gk]['files']:
                if f['w']:
                    fs[skey(f['w'], f['h'])] += (f['qty'] or 1)
        for l in o_spec[ok]['lines']:
            if not l['w'] or l['qty'] is None:
                continue
            s = skey(l['w'], l['h'])
            if s not in fs or abs(fs[s] - l['qty']) < 0.01:
                continue
            rows3.append({
                '판정': '수량 불일치',
                '일자': o_spec[ok]['dt'].isoformat(), '주문No': ok[1],
                '거래처': o_spec[ok]['client'], '품목': l['item'],
                '규격': f'{s[0]}x{s[1]}',
                '이카운트수량': l['qty'], '파일수량': fs[s],
                '차이': round(fs[s] - l['qty'], 2),
            })
    rows3.sort(key=lambda r: -abs(r['차이']))
    write_csv(os.path.join(a.out, 'recon_qty_mismatch.csv'), rows3)

    # ── 요약 ────────────────────────────────────────────────
    print(f'대사 구간 {d0} ~ {d1}')
    print(f'  이카운트 주문 {len(orders):,}  (출력물 {len(o_spec):,} · 비출력 {len(o_nospec):,})')
    print(f'  파일 그룹     {len(groups):,}  (규격보유 {len(g_spec):,})')
    print(f'  연결됨        {len(set(matched.values())):,} 주문 ↔ {len(matched):,} 그룹\n')

    print('── ① 파일 있는데 주문 없음 ' + '─' * 40)
    print(f'  ★청구 누락 후보(대응 주문 없음)  {len(susp):>5,}   ← 먼저 볼 것')
    print(f'  △중복 배정 의심(주문 분할 가능)  {len(dupsusp):>5,}')
    print(f'  재출력·수정·샘플(정상)          {len(rows)-len(susp)-len(dupsusp):>5,}')
    print('── ② 주문 있는데 파일 없음 ' + '─' * 40)
    amt = sum(r['공급가액'] for r in real2)
    print(f'  ★출력물 주문인데 파일 없음      {len(real2):>5,}   공급가액 {amt:,.0f}원  ← 먼저 볼 것')
    print(f'  △일부 부자재 포함              {sum(1 for r in rows2 if r["판정"].startswith("△")):>5,}')
    print(f'  부자재·조립(파일 없어도 정상)    {sum(1 for r in rows2 if r["판정"].startswith("부")):>5,}')
    print('── ③ 수량 불일치 ' + '─' * 48)
    print(f'  {len(rows3):>5,}건   ⚠️오탐 많음 — 파일 수량을 규격별로 **합산**하므로'
          f' 여러 주문이 같은 규격을 쓰면 부풀려진다. 큰 차이부터 눈으로 볼 것.')

    print('\n── 참고: 파일이 없는 게 정상인 주문(비출력) 품목 TOP 10 ' + '─' * 12)
    ni = Counter()
    for o in o_nospec.values():
        for l in o['lines']:
            if l['item']:
                ni[l['item'][:26]] += 1
    for it, c in ni.most_common(10):
        print(f'  {c:>5,}  {it}')
    print(f'\n저장 → {a.out}\\recon_missing_order.csv · recon_missing_file.csv · recon_qty_mismatch.csv')

    # ── MES 되쓰기 ──────────────────────────────────────────
    # 그룹 키 기준으로 보낸다. 서버가 대기물→주문 라인→주문으로 해소한다.
    # 아직 주문서가 안 된 그룹은 unresolved 로 조용히 건너뛴다(정상).
    if a.writeback:
        mismatch_keys = {}
        for r in rows3:
            k = (r['일자'], r['주문No'])
            mismatch_keys.setdefault(k, []).append(
                f"{r['품목'][:14]} {r['규격']} 이카운트 {r['이카운트수량']}↔파일 {r['파일수량']}")
        verdicts = []
        for gk, ok in matched.items():
            notes = mismatch_keys.get((o_spec[ok]['dt'].isoformat(), ok[1]))
            verdicts.append({'batch_key': _batch_key(gk),
                             'status': 'MISMATCH' if notes else 'MATCHED',
                             'note': (' · '.join(notes[:3]) if notes else None)})
        for gk, g in g_spec.items():
            if gk in matched:
                continue
            rework = any(f in REWORK_FLAGS for f in g['flags'])
            verdicts.append({'batch_key': _batch_key(gk), 'status': 'NO_ECOUNT',
                             'note': '재출력·수정·샘플' if rework else '대응 이카운트 주문 없음'})
        try:
            up, sk, un = writeback(a.url, a.user, a.pw, verdicts)
            print(f'\n[MES 기록] 갱신 {up:,} · 건너뜀 {sk:,} · 미해소(주문 미생성) {un:,}')
        except Exception as e:
            print(f'\n[MES 기록] 실패: {e}  — CSV 는 정상 저장됐습니다', file=sys.stderr)


def _batch_key(gk):
    """zscan-intake.cjs 의 groupKey() 와 **같은 문자열**이어야 한다. 다르면 하나도 안 붙는다.
    gk[0] 이 이미 `US`/`AC`/`JD` 처럼 축코드+종류다."""
    dt, kind = gk[1].isoformat(), gk[0]
    tail = gk[2] if not kind.endswith('D') else (gk[2] or 'root')
    return f'{dt}#{kind}{tail}'


def write_csv(path, rows):
    if not rows:
        rows = [{'(해당 없음)': ''}]
    with open(path, 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)


if __name__ == '__main__':
    main()
