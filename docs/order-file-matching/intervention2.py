# -*- coding: utf-8 -*-
"""개입량 2차 — ① 제품유형을 「품목+후가공」으로 분해 ② 그룹(=주문) 단위로 환산.

왜 분해하나:
  미매핑 상위가 `솔벤시트+재단` `솔벤시트+돔보` `UV후렉스-조` 같은 **조합 표기**다.
  품목은 `솔벤시트` 하나고 뒤는 후가공이다. 붙은 채로 매칭하니 11.7% 밖에 안 잡혔다.

왜 그룹 단위로 보나:
  사람은 파일 하나하나가 아니라 **주문 하나**를 확인한다. 공수는 그룹 수로 세야 맞다.
"""
import csv, io, json, os, re, sys
from collections import Counter, defaultdict
from datetime import date

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
S = os.path.dirname(os.path.abspath(__file__))
TMP = os.environ.get('TEMP', S)
RX_NORM = re.compile(r'(주식회사|\(주\)|㈜|유한회사|주\)|\s|\.|,|-|\(|\)|_)')
norm = lambda s: RX_NORM.sub('', s or '').lower()
# 후가공·부가 토큰 — 품목이 아니다
RX_POST = re.compile(r'[+＋]|재단|돔보|조명용|앱슨|자동바니쉬|가운데출력|\d+폭')


def load(fn):
    d = json.load(io.open(os.path.join(TMP, fn), encoding='utf-8-sig'))
    return d[0]['results'] if isinstance(d, list) else d['result'][0]['results']


clients, items = load('prod_clients.json'), load('prod_items.json')
cmap, imap = {}, {}
for c in clients:
    cmap.setdefault(norm(c['client_name']), c)
for it in items:
    imap.setdefault(norm(it['item_name']), it)
cmap.pop('', None); imap.pop('', None)


def base_type(t):
    """`솔벤시트+재단` → `솔벤시트` · `UV후렉스-조` → `UV후렉스`"""
    t = re.split(r'[+＋]', t or '', 1)[0]
    t = re.sub(r'[-_]\s*(조|비|재단|돔보|앱슨).*$', '', t)
    return t.strip()


def match_client(s):
    k = norm(s)
    if not k:
        return 'none'
    if k in cmap:
        return 'exact'
    hits = [kk for kk in cmap if (k in kk or kk in k) and len(kk) >= 2]
    return 'partial' if len(hits) == 1 else ('ambiguous' if hits else 'miss')


rows = []
for fn in ('parsed.csv', 'parsed_jeonsa.csv'):
    p = os.path.join(S, fn)
    if not os.path.exists(p):
        continue
    for r in csv.DictReader(open(p, encoding='utf-8')):
        if not (r.get('y') and r.get('m') and r.get('d')):
            continue
        try:
            dt = date(int(r['y']), int(r['m']), int(r['d']))
        except Exception:
            continue
        if date(2026, 7, 1) <= dt <= date(2026, 8, 11):
            r['_dt'] = dt
            rows.append(r)

# ── 품목 매핑: 원형 vs 분해 ──────────────────────────────
raw_hit = base_hit = 0
base_un = Counter()
for r in rows:
    t = r.get('ptype') or ''
    if not t:
        continue
    if norm(t) in imap:
        raw_hit += 1
    b = base_type(t)
    if norm(b) in imap:
        base_hit += 1
    else:
        base_un[b] += 1
withpt = sum(1 for r in rows if r.get('ptype'))
print(f'제품유형 있는 파일 {withpt:,}')
print(f'  원형 그대로 매칭   {raw_hit:,}  ({raw_hit/withpt:.1%})')
print(f'  ★품목+후가공 분해   {base_hit:,}  ({base_hit/withpt:.1%})')
print(f'  분해 후 미매핑 종류 {len(base_un):,}종 / 파일 {sum(base_un.values()):,}')
print('\n  분해 후에도 미매핑 상위 12 (= 손으로 만들 매핑표):')
for t, c in base_un.most_common(12):
    print(f'    {c:>5,}  {t}')

# ── 그룹(주문) 단위 개입량 ───────────────────────────────
groups = defaultdict(list)
for r in rows:
    seq, cl = r.get('seq'), (r.get('client') or None)
    if seq:
        k = ('S', r['_dt'], int(seq))
    elif cl:
        k = ('C', r['_dt'], norm(cl))
    else:
        k = ('D', r['_dt'], r['rel'].split('\\')[-2] if '\\' in r['rel'] else '')
    groups[k].append(r)

buckets = Counter()
for k, fs in groups.items():
    cl = next((f['client'] for f in fs if f.get('client')), None)
    cs = match_client(cl)
    spec_all = all(f.get('w') for f in fs)
    spec_any = any(f.get('w') for f in fs)
    if cs in ('exact', 'partial') and spec_all:
        buckets['확인만'] += 1
    elif cs in ('exact', 'partial') and spec_any:
        buckets['규격 일부 보완'] += 1
    elif cs in ('exact', 'partial'):
        buckets['규격 전부 입력'] += 1
    elif cs in ('ambiguous',) and spec_any:
        buckets['거래처 선택'] += 1
    elif cs == 'miss' and spec_any:
        buckets['거래처 신규등록'] += 1
    else:
        buckets['손입력 다수'] += 1
g = len(groups)
print(f'\n── 그룹(=주문 후보) {g:,}건의 개입 등급 ' + '─' * 24)
for lbl in ('확인만', '규격 일부 보완', '거래처 선택', '거래처 신규등록', '규격 전부 입력', '손입력 다수'):
    if buckets[lbl]:
        print(f'  {lbl:<16} {buckets[lbl]:>5,}  {buckets[lbl]/g:>6.1%}')
print(f'\n  하루 평균 그룹 {g/42:.0f}건 (42일 기준)')
