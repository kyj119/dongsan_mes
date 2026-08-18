# -*- coding: utf-8 -*-
"""수급 대조 — 「정보가 있는데 못 붙이는가」 vs 「애초에 파일이 모자라는가」.

앞 진단에서 실패의 68% 를 「다른 그룹에 있음」으로 분류했는데, 회수 패스는 61건밖에 못 건졌다.
분류가 과대계상이었다 — 그 규격 파일이 그날 **있긴 한데 이미 다른 주문이 정당하게 쓴** 경우까지 셌다.

그래서 매칭을 빼고 **총량만** 센다. 규격별로 정답지가 요구하는 수량과 Z: 파일이 공급하는 수량을 맞대면,
아무리 잘 붙여도 못 채우는 양(=진짜 부재)이 나온다. 이게 도달 가능한 상한의 실제 근거다.
"""
import csv, io, os, re, sys
from collections import Counter, defaultdict
from datetime import date
import pandas as pd

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
S = os.path.dirname(os.path.abspath(__file__))
TRUTH = r'C:\Users\user\dongsan_mes\품목마스터\원천주문데이터\동산_주문서현황_2607-2608.xlsx'
RX_KEY = re.compile(r'^2026/(\d\d)/(\d\d)\s*-\s*(\d+)$')
RX_GSPEC = re.compile(r'\[\s*(\d+(?:\.\d+)?)\s*[*xX]\s*(\d+(?:\.\d+)?)\s*\]')
D0, D1 = date(2026, 7, 1), date(2026, 8, 11)
skey = lambda w, h: tuple(sorted([round(float(w)), round(float(h))]))

# ── 정답지 수요 (규격별 수량 합) ────────────────────────────
demand, demand_lines, item_of = Counter(), Counter(), {}
df = pd.read_excel(TRUTH, header=1)
df.columns = [str(c).strip() for c in df.columns]
kc = df.columns[0]
for _, r in df.iterrows():
    mo = RX_KEY.match(str(r[kc]).strip())
    if not mo:
        continue
    dt = date(2026, int(mo.group(1)), int(mo.group(2)))
    if not (D0 <= dt <= D1):
        continue
    label = str(r.get('품목명(규격)', '') or '')
    sp = RX_GSPEC.search(label)
    if not sp:
        continue
    s = skey(sp.group(1), sp.group(2))
    try:
        q = float(r.get('수량') or 0)
    except Exception:
        q = 0
    demand[s] += (q if q == q and q > 0 else 1)
    demand_lines[s] += 1
    item_of.setdefault(s, RX_GSPEC.sub('', label).strip()[:22])

# ── 파일 공급 (규격별 수량 합) ──────────────────────────────
supply, supply_files = Counter(), Counter()
for fn in ('parsed.csv', 'parsed_jeonsa.csv'):
    p = os.path.join(S, fn)
    if not os.path.exists(p):
        continue
    for r in csv.DictReader(open(p, encoding='utf-8')):
        if not (r.get('w') and r.get('y')):
            continue
        try:
            dt = date(int(r['y']), int(r['m']), int(r['d']))
        except Exception:
            continue
        if not (D0 <= dt <= D1):
            continue
        s = skey(r['w'], r['h'])
        supply[s] += int(r['qty']) if r.get('qty') else 1
        supply_files[s] += 1

specs = set(demand) | set(supply)
d_tot = sum(demand.values()); s_tot = sum(supply.values())
short = {s: demand[s] - supply.get(s, 0) for s in demand if demand[s] > supply.get(s, 0)}
surplus = {s: supply[s] - demand.get(s, 0) for s in supply if supply[s] > demand.get(s, 0)}

print(f'규격 종류 {len(specs):,}  (정답지 {len(demand):,} · 파일 {len(supply):,})')
print(f'수량 총계  정답지 {d_tot:,.0f}  ·  파일 {s_tot:,.0f}\n')
print(f'── 규격별 수급 ' + '─' * 52)
print(f'  파일이 모자란 규격   {len(short):>5,}종 · 부족 수량 {sum(short.values()):>8,.0f}'
      f'  ({sum(short.values())/d_tot:>5.1%})   ← 아무리 잘 붙여도 못 채운다')
print(f'  파일이 남는 규격     {len(surplus):>5,}종 · 잉여 수량 {sum(surplus.values()):>8,.0f}')
print(f'  정답지에 없는 규격   {len(set(supply)-set(demand)):>5,}종'
      f' · 파일 {sum(supply[s] for s in set(supply)-set(demand)):>8,.0f}  ← 재출력·샘플·미청구')

print(f'\n★ 이론 상한 = 1 − 부족/수요 = {1 - sum(short.values())/d_tot:.1%}')

print('\n── 부족이 큰 규격 상위 15 (여기가 진짜 갭) ' + '─' * 20)
print(f'  {"규격":<14}{"정답지수량":>10}{"파일수량":>10}{"부족":>8}   품목')
for s, v in sorted(short.items(), key=lambda x: -x[1])[:15]:
    print(f'  {s[0]}x{s[1]:<10}{demand[s]:>10,.0f}{supply.get(s,0):>10,.0f}{v:>8,.0f}   {item_of.get(s,"")}')
