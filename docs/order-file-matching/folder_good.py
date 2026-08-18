# -*- coding: utf-8 -*-
"""하위 폴더를 **의미 있게** 쓰고 있는 사례를 뽑는다 — 금지 대상과 구분하기 위해."""
import csv, io, os, re, sys
from collections import Counter
from datetime import date
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
S = os.path.dirname(os.path.abspath(__file__))
RX_DAY = re.compile(r'^\s*\d{1,2}\s*일')
BAD = re.compile(r'^(새 폴더|새폴더|무제|제목 없음|폴더|new folder)', re.I)

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


def below_day(rel):
    parts = rel.split('\\')[:-1]
    di = -1
    for i, seg in enumerate(parts):
        if RX_DAY.match(seg):
            di = i
    return parts[di + 1:]


print('══ 전사축 — 하위 폴더를 품목 구분에 쓰는 사례 ' + '═' * 30)
seen = set(); k = 0
for r in rows:
    if r['axis'] != '메인1':
        continue
    sub = below_day(r['rel'])
    if len(sub) < 2:
        continue
    key = '\\'.join(sub)
    if key in seen:
        continue
    seen.add(key)
    cnt = sum(1 for x in rows if '\\'.join(below_day(x['rel'])) == key)
    print(f'  {key:<58} 파일 {cnt}개')
    k += 1
    if k >= 14:
        break

print('\n══ 1단계 주문 폴더 — 순번이 붙은 좋은 예 ' + '═' * 32)
seen = set(); k = 0
for r in rows:
    sub = below_day(r['rel'])
    if len(sub) != 1 or not re.match(r'^\s*\d{1,3}\s*-', sub[0]) or BAD.match(sub[0]):
        continue
    if sub[0] in seen:
        continue
    seen.add(sub[0])
    cnt = sum(1 for x in rows if below_day(x['rel'])[:1] == sub)
    print(f'  [{r["axis"][:8]}] {sub[0][:56]:<58} 파일 {cnt}개')
    k += 1
    if k >= 8:
        break

print('\n══ 순번이 없는 1단계 폴더 (개선 대상) ' + '═' * 34)
seen = set(); k = 0
for r in rows:
    sub = below_day(r['rel'])
    if len(sub) != 1 or re.match(r'^\s*\d{1,3}\s*-', sub[0]) or BAD.match(sub[0]):
        continue
    if sub[0] in seen:
        continue
    seen.add(sub[0])
    cnt = sum(1 for x in rows if below_day(x['rel'])[:1] == sub)
    print(f'  [{r["axis"][:8]}] {sub[0][:56]:<58} 파일 {cnt}개')
    k += 1
    if k >= 8:
        break
