# -*- coding: utf-8 -*-
"""규격 없는 그룹 339개(16%) — 진짜 정보 갭. 복원 가능한가.

파일명에 규격이 없으면 남은 길은 BoundingBox×배율 하나다.
배율표(scale_table.csv)에 제품유형이 있어야 쓸 수 있으니, 먼저 커버되는지 센다.
"""
import csv, os, re, sys
from collections import Counter
from datetime import date
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import score_v4 as V

S = os.path.dirname(os.path.abspath(__file__))
ROOT = {'★UV솔벤★': r'Z:\★UV솔벤★', '★현수막-수성출력★': r'Z:\★현수막-수성출력★',
        '메인1': r'Z:\메인1\메인1\2026'}
RX_BB = re.compile(rb'%%(?:HiRes)?BoundingBox:\s*([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)')

scale = {}
with open(os.path.join(S, 'scale_table.csv'), encoding='utf-8') as f:
    for r in csv.DictReader(f):
        if int(r['support']) / max(int(r['read']), 1) >= 0.85:
            scale[r['ptype'].lower()] = float(r['scale'])

noSpec = []
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
        if V.D0 <= dt <= V.D1 and not r.get('w'):
            noSpec.append(r)

n = len(noSpec)
has_pt = sum(1 for r in noSpec if r.get('ptype'))
in_tbl = sum(1 for r in noSpec if (r.get('ptype') or '').lower() in scale)
print(f'규격 없는 파일 {n:,}건')
print(f'  제품유형 있음        {has_pt:,} ({has_pt/n:.0%})')
print(f'  배율표에 있는 유형    {in_tbl:,} ({in_tbl/n:.0%})   ← 바로 복원 가능')

# BoundingBox 자체가 읽히는가 (표본 150)
ok = tot = 0
for r in noSpec[:150]:
    p = os.path.join(ROOT.get(r['axis'], ''), r['rel'])
    tot += 1
    try:
        with open(p, 'rb') as f:
            head = f.read(65536)
        if RX_BB.search(head):
            ok += 1
    except Exception:
        pass
print(f'  BoundingBox 판독(표본 {tot}) {ok} = {ok/max(tot,1):.0%}')

print('\n규격 없는 파일의 제품유형 TOP 12:')
for t, c in Counter((r.get('ptype') or '(없음)') for r in noSpec).most_common(12):
    mark = '✓배율표' if t.lower() in scale else ''
    print(f'  {c:>5,}  {t:<22} {mark}')
