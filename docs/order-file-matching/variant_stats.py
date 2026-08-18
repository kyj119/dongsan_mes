# -*- coding: utf-8 -*-
"""파일명 작성 규칙을 정하려면 **무엇이 얼마나 흔들리는지** 숫자가 있어야 한다.

규칙 후보별로 "지금 몇 %가 어긋나는가"를 잰다. 근거 없는 규칙은 안 지켜진다.
"""
import csv, io, os, re, sys
from collections import Counter
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
            rows.append(r)
n = len(rows)
print(f'대상 파일 {n:,}\n')

# ① 규격 구분자
sep = Counter()
for r in rows:
    mo = re.search(r'\d\s*([xX*×])\s*\d', r['name'])
    if mo:
        sep[mo.group(1)] += 1
    elif re.search(r'\(\s*\d{2,4}\s*-\s*\d{2,4}\s*[-)]', r['name']):
        sep['-(대시)'] += 1
    else:
        sep['(규격 없음/기타)'] += 1
print('① 규격 구분자')
for k, v in sep.most_common():
    print(f'   {k:<14}{v:>6,}  {v/n:>6.1%}')

# ② 제품유형 괄호 대소문자
pt = [r['ptype'] for r in rows if r.get('ptype')]
uv = [t for t in pt if 'uv' in t.lower()]
low = sum(1 for t in uv if 'uv' in t)
print(f'\n② UV 대소문자 — UV 표기 {len(uv):,}건 중 소문자 `uv` {low:,} ({low/max(len(uv),1):.1%})')

# ③ 제품유형에 후가공이 섞인 비율
POSTMARK = re.compile(r'[+＋]|재단|돔보|바니쉬|코팅|앱손|앱슨|중국산|유광|무광|출력만|컷팅|양면|단면|양출|단출')
mixed = sum(1 for t in pt if POSTMARK.search(t))
print(f'③ 제품유형 괄호에 후가공이 섞임 {mixed:,}/{len(pt):,} ({mixed/max(len(pt),1):.1%})')

# ④ 수량 단위
q = Counter()
for r in rows:
    mo = re.search(r'(\d+)\s*(장|조|벌|개|번|EA|ea)', r['name'])
    q[mo.group(2) if mo else '(없음)'] += 1
print('\n④ 수량 단위')
for k, v in q.most_common(8):
    print(f'   {k:<10}{v:>6,}  {v/n:>6.1%}')

# ⑤ 오타·변종 실태
TYPOS = [('포멕스', '포맥스'), ('품보드', '폼보드'), ('패트베너', '패트배너'),
         ('매쉬베너', '매쉬배너'), ('메쉬', '매쉬'), ('평판', '(소재명)'), ('엡손', '앱손')]
print('\n⑤ 오타·변종 (파일명 전체 기준)')
for bad, good in TYPOS:
    c = sum(1 for r in rows if bad in r['name'])
    if c:
        print(f'   {bad:<10}→ {good:<12}{c:>5,}건')

# ⑥ 접수순번 유무
seq = sum(1 for r in rows if r.get('seq'))
print(f'\n⑥ 접수순번 있음 {seq:,}/{n:,} ({seq/n:.1%})')
ax = Counter(r['axis'] for r in rows if not r.get('seq'))
print(f'   순번 없는 파일의 축: {dict(ax)}')

# ⑦ 거래처 파싱 실패
noc = sum(1 for r in rows if not r.get('client'))
print(f'\n⑦ 거래처를 못 읽은 파일 {noc:,} ({noc/n:.1%})')
