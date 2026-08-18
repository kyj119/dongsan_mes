# -*- coding: utf-8 -*-
"""미커버 주문을 두 부류로 가른다.

  (A) 규격이 스캔 파일에 **아예 없다**      → 축이 진짜 빠졌다. 스캔 확대가 답.
  (B) 규격은 있는데 날짜창/그룹에서 놓쳤다  → 조인 문제. 축을 늘려도 안 고쳐진다.

이 구분 없이 963개 파일을 더 파싱하면 헛수고를 한다.
"""
import sys, os
from collections import Counter, defaultdict
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import score_group as SG

orders = SG.load_truth()
groups = SG.load_groups()
o_spec = {k: v for k, v in orders.items() if any(l['w'] for l in v['lines'])}
g_spec = {k: v for k, v in groups.items() if any(f['w'] for f in v['files'])}

# 날짜 무시하고 규격만 → 그룹
spec_any = defaultdict(set)
for gk, g in g_spec.items():
    for f in g['files']:
        if f['w']:
            spec_any[SG.skey(f['w'], f['h'])].add(gk)

idx = defaultdict(set)
for k, o in o_spec.items():
    for l in o['lines']:
        if l['w']:
            idx[SG.skey(l['w'], l['h'])].add(k)


def candidates(g):
    cnt = Counter()
    for f in g['files']:
        if f['w']:
            for k in idx.get(SG.skey(f['w'], f['h']), ()):
                if abs((o_spec[k]['dt'] - g['dt']).days) <= SG.WINDOW:
                    cnt[k] += 1
    return cnt


covered = set()
for gk, g in g_spec.items():
    c = candidates(g)
    if c:
        top = c.most_common(); best = top[0][1]
        tied = sorted([o for o, n in top if n == best],
                      key=lambda o: abs((o_spec[o]['dt'] - g['dt']).days))
        covered.add(tied[0])

un = {k: v for k, v in o_spec.items() if k not in covered}

catA = catB = catB_near = 0
itemA, itemB = Counter(), Counter()
lagd = Counter()
for k, o in un.items():
    specs = [SG.skey(l['w'], l['h']) for l in o['lines'] if l['w']]
    hits = set()
    for s in specs:
        hits |= spec_any.get(s, set())
    if not hits:
        catA += 1
        for l in o['lines']:
            if l['w']:
                itemA[l['item'][:26]] += 1
    else:
        catB += 1
        d = min(abs((g_spec[gk]['dt'] - o['dt']).days) for gk in hits)
        lagd[min(d, 60)] += 1
        if d <= 14:
            catB_near += 1
        for l in o['lines']:
            if l['w']:
                itemB[l['item'][:26]] += 1

n = len(un)
print(f'미커버 주문 {n:,}건')
print(f'  (A) 규격이 스캔 파일에 아예 없음   {catA:,} ({catA/n:.0%})  ← 축 누락')
print(f'  (B) 규격은 있는데 못 붙음         {catB:,} ({catB/n:.0%})  ← 조인 문제')
print(f'      그중 ±14일 안에 파일 있음     {catB_near:,} ({catB_near/n:.0%})')

print('\n── (A) 축 누락 의심 품목 TOP 15 ' + '─' * 20)
for it, c in itemA.most_common(15):
    print(f'  {it:<28}{c:>6,}')
print('\n── (B) 조인 실패 품목 TOP 15 ' + '─' * 20)
for it, c in itemB.most_common(15):
    print(f'  {it:<28}{c:>6,}')

print('\n── (B) 가장 가까운 파일까지의 날짜차 분포 ' + '─' * 12)
for d in sorted(lagd):
    if d <= 20 or d % 10 == 0:
        print(f'  {d:>3}일  {lagd[d]:>4,}')
