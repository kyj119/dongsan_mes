# -*- coding: utf-8 -*-
"""배선 효과 예측 — prod 마스터로 거래처·품목 해소율을 오프라인 계산.

왜 오프라인인가: 로컬 D1 은 시드(거래처 63·품목 70)라 해소율이 구조적으로 0이다.
prod 에 적재해보기 전에 **얼마나 채워질지** 미리 알아야 한다.
zscan-intake.cjs 의 해소 규칙(정확일치 → 유일 부분일치)을 그대로 옮겨 잰다.

입력: %TEMP%\\prod_clients.json · prod_items_all.json (wrangler --remote --json 으로 받은 것)
      parsed.csv · parsed_jeonsa.csv · item_map_draft.csv
"""
import csv, io, json, os, re, sys
from collections import Counter
from datetime import date

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
S = os.path.dirname(os.path.abspath(__file__))
TMP = os.environ.get('TEMP', S)
RX_NORM = re.compile(r'(주식회사|\(주\)|㈜|유한회사|주\)|\s|\.|,|-|\(|\)|_)')
norm = lambda s: RX_NORM.sub('', str(s or '')).lower()


def load(fn):
    d = json.load(io.open(os.path.join(TMP, fn), encoding='utf-8-sig'))
    return d[0]['results'] if isinstance(d, list) else d['result'][0]['results']


clients, items = load('prod_clients.json'), load('prod_items_all.json')
exact = {}
for c in clients:
    k = norm(c['client_name'])
    if k and k not in exact:
        exact[k] = c['id']
by_code = {}
for it in items:
    if it.get('item_code') and it['item_code'] not in by_code:
        by_code[it['item_code']] = it['id']


def resolve_client(name):
    k = norm(name)
    if not k:
        return None
    if k in exact:
        return exact[k]
    hit = None
    for kk, i in exact.items():           # 유일 부분일치만 인정 (zscan 과 동일)
        if len(kk) >= 2 and (k in kk or kk in k):
            if hit is not None and hit != i:
                return None
            hit = i
    return hit


imap = {}
with open(os.path.join(S, 'item_map_draft.csv'), encoding='utf-8-sig') as f:
    for r in csv.DictReader(f):
        code = (r.get('제안_품목코드') or '').strip()
        t = (r.get('파일표기') or '').strip()
        if t and code and not code.startswith('('):
            imap[norm(t)] = code

rows = []
for fn in ('parsed.csv', 'parsed_jeonsa.csv'):
    p = os.path.join(S, fn)
    if not os.path.exists(p):
        print(f'  ! {fn} 없음 — 스크래치패드에서 복사해 두면 재현된다', file=sys.stderr)
        continue
    for r in csv.DictReader(open(p, encoding='utf-8')):
        if not (r.get('y') and r.get('m') and r.get('d')):
            continue
        try:
            dt = date(int(r['y']), int(r['m']), int(r['d']))
        except Exception:
            continue
        if date(2026, 7, 1) <= dt <= date(2026, 8, 11):
            rows.append(r)
if not rows:
    sys.exit('parsed.csv 가 없어 예측할 수 없습니다.')

n = len(rows)
cache = {}
c_hit = i_hit = both = 0
miss_client, miss_item = Counter(), Counter()
for r in rows:
    cl = r.get('client') or ''
    if cl not in cache:
        cache[cl] = resolve_client(cl)
    cid = cache[cl]
    code = imap.get(norm(r.get('ptype') or ''))
    iid = by_code.get(code) if code else None
    if cid:
        c_hit += 1
    elif cl:
        miss_client[cl] += 1
    if iid:
        i_hit += 1
    elif r.get('ptype'):
        miss_item[r['ptype']] += 1
    if cid and iid:
        both += 1

print(f'대상 파일 {n:,}  (prod 거래처 {len(clients):,} · 품목 {len(items):,} · 매핑표 {len(imap):,}종)\n')
print(f'  거래처 id 해소   {c_hit:>6,}  {c_hit/n:>6.1%}')
print(f'  품목 id 해소     {i_hit:>6,}  {i_hit/n:>6.1%}')
print(f'  둘 다 해소       {both:>6,}  {both/n:>6.1%}   ← 프리필이 단가까지 채우는 건')
print('\n── 거래처 미해소 상위 12 (별칭 등록 대상) ' + '─' * 24)
for k, v in miss_client.most_common(12):
    print(f'  {v:>4,}  {k}')
print('\n── 품목 미해소 상위 12 ' + '─' * 40)
for k, v in miss_item.most_common(12):
    print(f'  {v:>4,}  {k}')
