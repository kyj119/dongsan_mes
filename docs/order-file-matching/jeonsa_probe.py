# -*- coding: utf-8 -*-
"""전사축 품목을 무엇으로 정할 수 있나 — 폴더·거래처·규격 어디에 단서가 있나."""
import csv, io, os, re, sys
from collections import Counter, defaultdict
from datetime import date
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
S = os.path.dirname(os.path.abspath(__file__))

rows = []
for r in csv.DictReader(open(os.path.join(S, 'parsed_jeonsa.csv'), encoding='utf-8')):
    if not (r.get('y') and r.get('m') and r.get('d')):
        continue
    try:
        dt = date(int(r['y']), int(r['m']), int(r['d']))
    except Exception:
        continue
    if date(2026, 7, 1) <= dt <= date(2026, 8, 11):
        rows.append(r)

print(f'전사 파일 {len(rows):,}\n')
lvl = defaultdict(Counter)
for r in rows:
    parts = r['rel'].split('\\')
    for i, seg in enumerate(parts[:-1]):
        lvl[i][seg] += 1
for i in sorted(lvl):
    print(f'── 경로 {i}단계 (상위 12 / 총 {len(lvl[i])}종) ' + '─' * 26)
    for nm, c in lvl[i].most_common(12):
        print(f'  {c:>5,}  {nm[:52]}')
    print()

# 거래처별 규격 다양성 — 거래처가 품목을 결정하는가
byc = defaultdict(Counter)
for r in rows:
    if r.get('client') and r.get('w'):
        byc[r['client']][(round(float(r['w'])), round(float(r['h'])))] += 1
one = sum(1 for k, v in byc.items() if len(v) == 1)
print(f'── 거래처 {len(byc):,}곳 중 규격이 1종뿐인 곳 {one:,} ({one/max(len(byc),1):.0%})')
print('  다품종 상위 8:')
for k, v in sorted(byc.items(), key=lambda kv: -sum(kv[1].values()))[:8]:
    print(f'    {k[:18]:<20} 파일 {sum(v.values()):>4,} · 규격 {len(v):>3}종')

print('\n── 파일명 샘플 20 (품목 단서가 있나) ' + '─' * 30)
for r in rows[:20]:
    print(f'  {r["rel"][:78]}')
