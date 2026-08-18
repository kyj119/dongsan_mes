# -*- coding: utf-8 -*-
"""어떤 파일이 붙고 어떤 게 안 붙나 — 「BOB 같은 건 되는데 왜 76%냐」에 답한다.

용준님 예시:
  주문서 8/12-1  솔벤현수막+족자조립 · 내용 BOB
  파일 `02-(솔벤현수막)호야디자인-BOB(290x240-2장)열재단+상하족자봉-12일 17시 자동문.eps`
  → 거래처·규격·수량·건명이 다 있고 규격도 희소하다. **이런 건 붙는다.**

문제는 다른 부류다. 그룹을 「그날 그 규격을 몇 개 주문이 쓰는가」로 나눠 모호율을 잰다.
희소 규격이면 유일하게 갈리고, 흔한 규격이면 갈릴 수가 없다 — 이게 천장의 실체다.
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
RX_NORM = re.compile(r'(주식회사|\(주\)|㈜|유한회사|주\)|\s|\.|,|-)')
norm = lambda s: RX_NORM.sub('', str(s or ''))
D0, D1, W = date(2026, 7, 1), date(2026, 8, 11), 7
skey = lambda w, h: tuple(sorted([round(float(w)), round(float(h))]))

orders = defaultdict(lambda: {'lines': [], 'client': '', 'dt': None})
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
    o = orders[(dt, int(mo.group(3)))]; o['dt'] = dt
    o['client'] = str(r.get('거래처명', '') or '').strip()
    sp = RX_GSPEC.search(str(r.get('품목명(규격)', '') or ''))
    o['lines'].append({'w': float(sp.group(1)) if sp else None,
                       'h': float(sp.group(2)) if sp else None})

groups = defaultdict(lambda: {'files': [], 'dt': None, 'clients': Counter()})
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
        if not (D0 <= dt <= D1):
            continue
        seq, cl = r.get('seq'), (r.get('client') or None)
        key = ('S', dt, int(seq)) if seq else (('C', dt, norm(cl)) if cl
               else ('D', dt, r['rel'].split('\\')[-2] if '\\' in r['rel'] else ''))
        g = groups[key]; g['dt'] = dt
        if cl:
            g['clients'][cl] += 1
        g['files'].append({'w': float(r['w']) if r.get('w') else None,
                           'h': float(r['h']) if r.get('h') else None})

o_spec = {k: v for k, v in orders.items() if any(l['w'] for l in v['lines'])}
g_spec = {k: v for k, v in groups.items() if any(f['w'] for f in v['files'])}
idx = defaultdict(set)
for k, o in o_spec.items():
    for l in o['lines']:
        if l['w']:
            idx[skey(l['w'], l['h'])].add(k)

# 규격 희소도 = 그 규격을 쓰는 **주문 수**(전 기간). 흔할수록 갈리지 않는다.
rarity = {s: len(v) for s, v in idx.items()}

TIERS = [('희소 (그 규격을 쓴 주문 1~2건)', 1, 2),
         ('보통 (3~9건)', 3, 9),
         ('흔함 (10~49건)', 10, 49),
         ('매우 흔함 (50건+)', 50, 10 ** 9)]
res = defaultdict(lambda: {'n': 0, 'uniq': 0, 'amb': 0, 'cand': 0})
for gk, g in g_spec.items():
    specs = [skey(f['w'], f['h']) for f in g['files'] if f['w']]
    if not specs:
        continue
    # 그룹의 **가장 희소한** 규격이 식별력을 결정한다
    r = min(rarity.get(s, 10 ** 9) for s in specs)
    tier = next(t for t in TIERS if t[1] <= r <= t[2])[0]
    c = set()
    for s in specs:
        for ok in idx.get(s, ()):
            if abs((o_spec[ok]['dt'] - g['dt']).days) <= W:
                c.add(ok)
    b = res[tier]; b['n'] += 1; b['cand'] += len(c)
    if len(c) == 1:
        b['uniq'] += 1
    elif len(c) > 1:
        b['amb'] += 1

tot = sum(b['n'] for b in res.values())
print(f'파일 그룹(규격 보유) {tot:,}\n')
print(f'  {"규격 희소도":<30}{"그룹":>7}{"비중":>8}{"유일확정":>10}{"모호":>9}{"평균후보":>10}')
for label, _, _ in TIERS:
    b = res[label]
    if not b['n']:
        continue
    print(f'  {label:<30}{b["n"]:>7,}{b["n"]/tot:>8.1%}{b["uniq"]/b["n"]:>10.1%}'
          f'{b["amb"]/b["n"]:>9.1%}{b["cand"]/b["n"]:>10.1f}')

print('\n── 용준님 예시 대조 ' + '─' * 44)
for s in [(240, 290), (200, 200), (119, 252)]:
    print(f'  {s[1]}x{s[0]:<8} 이 규격을 쓴 주문 {rarity.get(s, 0):>4}건'
          f'   → {"유일하게 갈린다" if rarity.get(s,0) <= 2 else "여러 주문이 공유"}')
print('\n  ★BOB 건(290x240)처럼 희소 규격 + 거래처가 있으면 붙는다.')
print('    안 붙는 건 60x180·135x90 같은 **표준 규격 반복품**이다 — 여기엔 가를 키가 없다.')
