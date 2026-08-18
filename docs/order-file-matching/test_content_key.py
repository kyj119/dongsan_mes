# -*- coding: utf-8 -*-
"""`내용`(현장명)을 조인 키로 쓰면 얼마나 갈리는가 — 미사용 신호의 실측.

지금까지 조인은 규격 + 날짜 + 거래처만 썼다. 흔한 규격(60x180)은 같은 날 여러 주문에 반복되니
갈리지 않았고, 그게 76% 천장의 정체였다(파일은 있는데 어느 전표 것인지 모름).

주문서현황 `내용` = 현장명/행사명이고 **파일명에도 그대로 들어 있다**:
    내용 `취업박람회`  ↔  `01-(솔벤매쉬배너)선명(홀리)-취업박람회(62x182-1장)…`

이 키가 실제로 얼마나 붙는지, 그리고 **모호를 얼마나 가르는지**를 잰다.
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
# 비교용 정규화 — 공백·괄호·기호 제거(파일명은 붙여쓰고 이카운트는 띄어쓰는 경우가 많다)
sq = lambda s: re.sub(r'[\s()\[\]·,.\-_/]', '', str(s or ''))

orders = defaultdict(lambda: {'lines': [], 'client': '', 'dt': None, 'contents': set()})
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
    o = orders[(dt, int(mo.group(3)))]
    o['dt'] = dt
    o['client'] = str(r.get('거래처명', '') or '').strip()
    c = str(r.get('내용', '') or '').strip()
    if c and c.lower() != 'nan':
        o['contents'].add(c)
    sp = RX_GSPEC.search(str(r.get('품목명(규격)', '') or ''))
    o['lines'].append({'w': float(sp.group(1)) if sp else None,
                       'h': float(sp.group(2)) if sp else None})

groups = defaultdict(lambda: {'files': [], 'dt': None, 'clients': Counter(), 'names': []})
RX_NORM = re.compile(r'(주식회사|\(주\)|㈜|유한회사|주\)|\s|\.|,|-)')
norm = lambda s: RX_NORM.sub('', str(s or ''))
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
        g['names'].append(r['rel'])           # 폴더까지 포함해서 본다(건명이 폴더에 있는 경우가 많다)
        if cl:
            g['clients'][cl] += 1
        g['files'].append({'w': float(r['w']) if r.get('w') else None,
                           'h': float(r['h']) if r.get('h') else None})

o_spec = {k: v for k, v in orders.items() if any(l['w'] for l in v['lines'])}
g_spec = {k: v for k, v in groups.items() if any(f['w'] for f in v['files'])}
gtext = {k: sq(' '.join(v['names'])) for k, v in g_spec.items()}

idx = defaultdict(set)
for k, o in o_spec.items():
    for l in o['lines']:
        if l['w']:
            idx[skey(l['w'], l['h'])].add(k)

# 규격+날짜만으로 후보를 만들고, `내용` 이 후보를 얼마나 가르는지 본다
n_amb = n_split = n_uniq = n_nocontent = 0
gain = []
for gk, g in g_spec.items():
    cand = set()
    for f in g['files']:
        if f['w']:
            for ok in idx.get(skey(f['w'], f['h']), ()):
                if abs((o_spec[ok]['dt'] - g['dt']).days) <= 7:
                    cand.add(ok)
    if len(cand) <= 1:
        n_uniq += 1
        continue
    n_amb += 1
    txt = gtext[gk]
    hit = [ok for ok in cand
           if any(len(sq(c)) >= 2 and sq(c) in txt for c in o_spec[ok]['contents'])]
    if not any(o_spec[ok]['contents'] for ok in cand):
        n_nocontent += 1
    elif len(hit) == 1:
        n_split += 1
        if len(gain) < 8:
            ok = hit[0]
            gain.append((g['dt'].isoformat(), len(cand), list(o_spec[ok]['contents'])[:1],
                         g['names'][0][:56]))

print(f'파일 그룹 {len(g_spec):,}')
print(f'  후보 유일(모호 아님)      {n_uniq:>5,}  {n_uniq/len(g_spec):>6.1%}')
print(f'  ★후보 여럿(모호)         {n_amb:>5,}  {n_amb/len(g_spec):>6.1%}   ← 76% 천장의 정체')
print(f'      └ `내용` 으로 유일 확정 {n_split:>5,}  {n_split/max(n_amb,1):>6.1%}  ← **회수 가능**')
print(f'      └ 후보에 `내용` 없음   {n_nocontent:>5,}  {n_nocontent/max(n_amb,1):>6.1%}')
print('\n── `내용` 이 갈라준 예 ' + '─' * 42)
for d, nc, cont, nm in gain:
    print(f'  {d}  후보 {nc}개 → 1개   내용={cont}')
    print(f'      {nm}')
