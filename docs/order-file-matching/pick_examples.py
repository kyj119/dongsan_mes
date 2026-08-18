# -*- coding: utf-8 -*-
"""규칙 위반 유형별로 **실제 파일명**을 뽑는다 — 지어낸 예시는 현장에서 안 먹힌다."""
import csv, io, os, re, sys
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

RULES = [
    ('§2 후가공이 제품유형 괄호 안', lambda r: r.get('ptype') and re.search(r'[+＋]|재단|돔보|바니쉬|코팅|앱손|앱슨|중국산|유광|무광|출력만', r['ptype'])),
    ('§2 평판 오기', lambda r: '평판' in (r.get('ptype') or '')),
    ('§2 후렉스 조명/비조명 분리표기', lambda r: r.get('ptype') and re.search(r'후렉스\s*[-+]', r['ptype'])),
    ('§2 uv 소문자', lambda r: r.get('ptype') and 'uv' in r['ptype']),
    ('§3 대문자 X 구분자', lambda r: re.search(r'\d\s*X\s*\d', r['name'])),
    ('§3 대시 구분자', lambda r: re.search(r'\(\s*\d{2,4}(?:\.\d+)?\s*-\s*\d{2,4}(?:\.\d+)?\s*[-)]', r['name'])),
    ('§4 수량 단위 없음', lambda r: r.get('w') and not r.get('qty')),
    ('§5 원단 폭을 제품유형으로', lambda r: r.get('ptype') and re.search(r'(\d{3}|한|장)\s*폭', r['ptype'])),
    ('§6 순번 없음(2축)', lambda r: not r.get('seq') and r['axis'] != '메인1'),
    ('§6 순번 없음(전사)', lambda r: not r.get('seq') and r['axis'] == '메인1'),
    ('§7 거래처 못 읽음', lambda r: not r.get('client')),
    ('§8 전사 품목 단서 없음', lambda r: r['axis'] == '메인1' and not re.search(
        r'가로등배너|자이언트배너|워킹배너|윈드배너|외국기배너|태극기배너|어구실명제|만장기|군부대기|대대기|중대기|깃발|태극기|새마을기|민방위기|무재해기|노인회기|만국기|근조기|수기|H형|S형|F형|게양용|정기', r['rel'])),
]

for label, f in RULES:
    hits = [r for r in rows if f(r)]
    print(f'══ {label}  ({len(hits):,}건) ' + '═' * max(0, 46 - len(label)))
    seen = set()
    n = 0
    for r in hits:
        key = (r.get('ptype'), r['name'][:12])
        if key in seen:
            continue
        seen.add(key)
        print(f'   {r["name"][:86]}')
        n += 1
        if n >= 4:
            break
    print()
