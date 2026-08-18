# -*- coding: utf-8 -*-
"""「평판」 계열 파일 전량 덤프 — 용준님이 규칙을 정하실 근거.

덤으로 이번에 확정된 것들의 축도 확인한다:
  · 게시대 = 현수막 「게시대 마감」(후가공) → 품목은 현수막. **어느 인쇄방식인지 축으로 정한다.**
  · UV그레이후렉스 = 비조명후렉스
  · 비접착유포지 = 비점착 합성지
  · 가로등현수막 = 신규 품목
"""
import csv, io, os, re, sys
from collections import Counter, defaultdict
from datetime import date
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
S = os.path.dirname(os.path.abspath(__file__))

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

print('══ 「평판」 파일 전량 ' + '═' * 62)
pp = [r for r in rows if '평판' in (r.get('ptype') or '')]
print(f'{len(pp)}건\n')
for r in sorted(pp, key=lambda x: (x.get('ptype') or '', x['name'])):
    print(f"  [{r['ptype']}]  {r['client'] or '-':<14} {r.get('w') or '?'}x{r.get('h') or '?'}")
    print(f"      {r['axis']}\\{r['rel']}")

print('\n══ 참고: 「포맥스」 표기 파일 (평판과 같은 소재일 가능성) ' + '═' * 24)
fm = [r for r in rows if re.search(r'포맥스|포멕스|품보드|폼보드', r.get('ptype') or '')]
byt = Counter(r['ptype'] for r in fm)
for t, c in byt.most_common(14):
    ex = next(x for x in fm if x['ptype'] == t)
    print(f'  {c:>4}  {t:<24} 예: {ex["name"][:52]}')

print('\n══ 확정분 축 확인 (품목의 인쇄방식을 정해야 하므로) ' + '═' * 28)
for key, label in (('게시대', '게시대'), ('그레이후렉스', 'UV그레이후렉스'),
                   ('유포지', '비접착유포지'), ('가로등현수막', '가로등현수막')):
    sel = [r for r in rows if key in (r.get('ptype') or '')]
    if not sel:
        continue
    ax = Counter(r['axis'] for r in sel)
    print(f'  {label:<14} {len(sel):>4}건  축: {dict(ax)}')
    for r in sel[:3]:
        print(f'      예: {r["name"][:66]}')
