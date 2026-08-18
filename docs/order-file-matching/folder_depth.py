# -*- coding: utf-8 -*-
"""폴더를 실제로 어떻게 쓰고 있나 — 깊이별 역할을 확인한다.

용준님 지적: 전사·수성 폴더 안에 거래처명·내용으로 하위 폴더를 만들어 파일을 묶는다.
그게 금지되는 건지 물으셨다. **답은 아니오** 인데, 근거를 숫자로 확인하고 답한다.
날짜 폴더 아래 몇 단계까지 쓰는지, 각 단계가 무슨 역할인지 본다.
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
            rows.append(r)

RX_DAY = re.compile(r'^\s*\d{1,2}\s*일')
RX_SHIP = re.compile(r'(택배|화물|직배|방문|간판팀|퀵|출력실|현수막실|^완$|^끝)')
RX_SEQ = re.compile(r'^\s*\d{1,3}\s*-')


def below_day(rel):
    """날짜 폴더 아래의 경로 조각들(파일명 제외)."""
    parts = rel.split('\\')[:-1]
    di = -1
    for i, seg in enumerate(parts):
        if RX_DAY.match(seg):
            di = i
    return parts[di + 1:]


depth = Counter()
per_axis = defaultdict(Counter)
lvl_role = defaultdict(Counter)
for r in rows:
    sub = below_day(r['rel'])
    sub = [s for s in sub if not RX_SHIP.search(s)]      # 배송·완료 폴더는 층으로 세지 않는다
    depth[len(sub)] += 1
    per_axis[r['axis']][len(sub)] += 1
    for i, s in enumerate(sub):
        role = '순번-거래처' if RX_SEQ.match(s) else '이름만'
        lvl_role[i][role] += 1

n = len(rows)
print(f'파일 {n:,} · 날짜/배송 폴더를 제외한 **주문용 하위 폴더 깊이**\n')
for k in sorted(depth):
    print(f'  {k}단계  {depth[k]:>6,}  {depth[k]/n:>6.1%}')
print('\n축별:')
for ax, c in per_axis.items():
    t = sum(c.values())
    s = ' · '.join(f'{k}단계 {v/t:.0%}' for k, v in sorted(c.items()))
    print(f'  {ax:<16} {s}')

print('\n단계별 이름 형태 (순번이 붙어 있나):')
for i in sorted(lvl_role):
    t = sum(lvl_role[i].values())
    if t < 20:
        continue
    seq = lvl_role[i]['순번-거래처']
    print(f'  {i+1}단계  순번 있음 {seq:>5,}/{t:<6,} = {seq/t:>5.1%}')

print('\n── 2단계 이상 쓰는 실제 경로 샘플 12 ' + '─' * 30)
seen = set()
k = 0
for r in rows:
    sub = [s for s in below_day(r['rel']) if not RX_SHIP.search(s)]
    if len(sub) < 2:
        continue
    key = '\\'.join(sub)
    if key in seen:
        continue
    seen.add(key)
    print(f'  [{r["axis"]}]  {key}')
    k += 1
    if k >= 12:
        break

print('\n── 「의미 없는 이름」 실태 ' + '─' * 40)
BAD = re.compile(r'^(새 폴더|새폴더|무제|제목 없음|폴더|new folder)', re.I)
bad = [r for r in rows if any(BAD.match(s.strip()) for s in below_day(r['rel']))]
print(f'  중간에 자동생성 폴더명이 낀 파일 {len(bad):,}건 ({len(bad)/n:.1%})')
for r in bad[:5]:
    print(f'    {r["rel"][:88]}')
