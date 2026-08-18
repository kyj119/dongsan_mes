# -*- coding: utf-8 -*-
"""천장의 정체 — 어떤 키가 있어야 갈리는가.

지금까지:
  · 날짜창·임계값·병합·축확대 → 안 움직임
  · `내용`(현장명) 추가        → 안 움직임 (가르긴 하나 틀린 만큼 맞음)
  · 실패 라인 직접 진단        → 파일이 진짜 없는 건 5.1% 뿐

그러면 남는 설명은 하나다: **같은 날 같은 규격이 여러 주문에 반복될 때 가를 키가 없다.**
거래처가 가장 강한 후보인데 지금 58% 만 해소된다(지점 다수).

여기서 재는 것 — 조건을 하나씩 「완벽하다」고 가정했을 때 모호가 얼마나 남는가.
이게 파일명 규칙(§7 거래처 정확표기 · 주문번호 표기)의 기대 효과다.
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
D0, D1 = date(2026, 7, 1), date(2026, 8, 11)
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


def cands(g, window):
    c = set()
    for f in g['files']:
        if f['w']:
            for ok in idx.get(skey(f['w'], f['h']), ()):
                if abs((o_spec[ok]['dt'] - g['dt']).days) <= window:
                    c.add(ok)
    return c


def client_ok(g, ok):
    if not g['clients']:
        return None                       # 파일에 거래처가 없다 = 가를 수 없음
    tc = norm(o_spec[ok]['client'])
    for fc, _ in g['clients'].most_common(3):
        f = norm(fc)
        if f and tc and (f in tc or tc in f):
            return True
    return False


SCEN = [
    ('현행 (규격 + ±7일)', 7, False),
    ('날짜를 정확히 (규격 + 같은 날)', 0, False),
    ('거래처까지 맞음 (규격 + ±7일 + 거래처)', 7, True),
    ('둘 다 (규격 + 같은 날 + 거래처)', 0, True),
]
print(f'파일 그룹(규격 보유) {len(g_spec):,}\n')
print(f'  {"조건":<38}{"유일":>8}{"모호":>8}{"후보없음":>10}{"평균후보":>10}')
for label, w, needc in SCEN:
    uniq = amb = none = 0
    tot = 0
    for gk, g in g_spec.items():
        c = cands(g, w)
        if needc:
            hits = [ok for ok in c if client_ok(g, ok)]
            c = set(hits) if hits else c        # 거래처를 못 읽으면 좁히지 못함
        if not c:
            none += 1
        elif len(c) == 1:
            uniq += 1
        else:
            amb += 1
        tot += len(c)
    n = len(g_spec)
    print(f'  {label:<38}{uniq/n:>7.1%}{amb/n:>8.1%}{none/n:>10.1%}{tot/n:>10.1f}')

print('\n★ 「주문번호를 파일명에 넣는다」면 후보가 1개로 확정된다 — 위 어느 조합보다 강하다.')
