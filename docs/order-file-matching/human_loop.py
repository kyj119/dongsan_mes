# -*- coding: utf-8 -*-
"""사람이 고르는 전제의 실질 지표 + 전사 순번 부여 효과.

자동 유일 확정은 방향을 뒤집어도 안 올랐다(파일 우선 57.3% vs 이카운트 우선 52.0%).
그런데 운영 전제가 **자동 확정 금지 · 사람이 트레이에서 확인**이다.
그러면 물어야 할 건 「유일하게 맞혔나」가 아니라 **「사람이 몇 개 중에서 고르나」**다.
후보 3개 이하면 1초에 고른다. 38개면 못 고른다.

동시에 용준님 질문 2 — 전사축에 접수순번을 붙이면 얼마나 나아지는지도 같은 틀에서 잰다.
지금 전사는 순번이 0%라 「같은 날 같은 거래처」가 통째로 한 그룹이 된다.
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
o_spec = {k: v for k, v in orders.items() if any(l['w'] for l in v['lines'])}
spec_idx = defaultdict(set)
for k, o in o_spec.items():
    for l in o['lines']:
        if l['w']:
            spec_idx[skey(l['w'], l['h'])].add(k)

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
        if D0 <= dt <= D1:
            r['_dt'] = dt
            rows.append(r)


def build(jeonsa_seq):
    """jeonsa_seq=True 면 전사축에도 접수순번이 있다고 가정(폴더 순서로 대리)."""
    groups = defaultdict(lambda: {'files': [], 'dt': None, 'clients': Counter()})
    # 전사 가상 순번: 같은 날 폴더(=주문 묶음) 단위로 번호를 매긴다
    virt = {}
    if jeonsa_seq:
        seen = defaultdict(list)
        for r in rows:
            if r['axis'] != '메인1':
                continue
            leaf = r['rel'].rsplit('\\', 1)[0]
            if leaf not in seen[r['_dt']]:
                seen[r['_dt']].append(leaf)
        for dt, leaves in seen.items():
            for i, l in enumerate(leaves, 1):
                virt[(dt, l)] = i
    for r in rows:
        seq, cl = r.get('seq'), (r.get('client') or None)
        key = None
        if jeonsa_seq and r['axis'] == '메인1' and not seq:
            v = virt.get((r['_dt'], r['rel'].rsplit('\\', 1)[0]))
            if v:
                # ★네임스페이스를 분리한다. ('S', dt, 1) 로 두면 2축의 실제 순번 1번과
                #   키가 충돌해 서로 다른 축의 주문이 한 그룹으로 병합된다(실제 발생: 759→90).
                key = ('J', r['_dt'], v)
        if key is None:
            key = ('S', r['_dt'], int(seq)) if seq else (('C', r['_dt'], norm(cl)) if cl
                   else ('D', r['_dt'], r['rel'].split('\\')[-2] if '\\' in r['rel'] else ''))
        g = groups[key]; g['dt'] = r['_dt']
        if cl:
            g['clients'][cl] += 1
        g['files'].append({'w': float(r['w']) if r.get('w') else None,
                           'h': float(r['h']) if r.get('h') else None,
                           'axis': r['axis']})
    return {k: v for k, v in groups.items() if any(f['w'] for f in v['files'])}


def cand_counts(g_spec, use_client):
    out = []
    for gk, g in g_spec.items():
        specs = [skey(f['w'], f['h']) for f in g['files'] if f['w']]
        c = set()
        for s in specs:
            for ok in spec_idx.get(s, ()):
                if abs((o_spec[ok]['dt'] - g['dt']).days) <= W:
                    c.add(ok)
        if use_client and g['clients']:
            fc = [norm(x) for x, _ in g['clients'].most_common(3)]
            nar = {ok for ok in c
                   if any(f and (f in norm(o_spec[ok]['client']) or norm(o_spec[ok]['client']) in f)
                          for f in fc)}
            if nar:
                c = nar
        out.append((gk, len(c), g))
    return out


def report(label, cc):
    n = len(cc)
    b = Counter()
    for _, k, _ in cc:
        b['0' if k == 0 else '1' if k == 1 else '2~3' if k <= 3 else '4~10' if k <= 10 else '11+'] += 1
    easy = b['1'] + b['2~3']
    print(f'  {label:<34}{b["1"]/n:>8.1%}{b["2~3"]/n:>8.1%}{b["4~10"]/n:>8.1%}'
          f'{b["11+"]/n:>8.1%}{b["0"]/n:>8.1%}{easy/n:>10.1%}')


print('사람이 트레이에서 고른다면 — **후보 개수** 분포가 실질 지표다\n')
print(f'  {"조건":<34}{"1개":>8}{"2~3개":>8}{"4~10":>8}{"11+":>8}{"후보0":>8}{"★≤3개":>10}')
g0 = build(False)
report('현행 (규격만)', cand_counts(g0, False))
report('규격 + 거래처로 좁힘', cand_counts(g0, True))
g1 = build(True)
report('위 + 전사 순번 부여', cand_counts(g1, True))

# ── 질문 2: 전사 순번 부여 효과 ───────────────────────────────
# 가상 순번 시뮬레이션은 못 쓴다 — 전사는 파일이 날짜 폴더 바로 아래 있는 경우가 많아
# 「폴더=주문」 가정이 깨지고 통째로 한 그룹이 된다(759→74). 어느 파일이 어느 주문인지
# 모르는 상태에서 순번을 흉내내는 건 순환논리다.
# 대신 **이미 순번이 있는 2축**과 **없는 전사축**을 같은 조건에서 비교한다. 이게 실증이다.
print('\n── 질문 2: 순번 있는 축 vs 없는 축 (같은 조건 비교) ' + '─' * 18)
print(f'  {"축":<26}{"그룹":>7}{"순번보유":>10}{"1개":>8}{"≤3개":>8}{"평균후보":>10}')
for label, axis in (('2축(UV솔벤·수성) — 순번 66%', ('★UV솔벤★', '★현수막-수성출력★')),
                    ('전사축(메인1) — 순번 0%', ('메인1',))):
    sub = {k: v for k, v in g0.items() if any(f['axis'] in axis for f in v['files'])}
    seqd = sum(1 for k in sub if k[0] == 'S') / max(len(sub), 1)
    cc = cand_counts(sub, True)
    n = len(cc) or 1
    one = sum(1 for _, k, _ in cc if k == 1)
    le3 = sum(1 for _, k, _ in cc if 1 <= k <= 3)
    avg = sum(k for _, k, _ in cc) / n
    print(f'  {label:<26}{n:>7,}{seqd:>10.0%}{one/n:>8.1%}{le3/n:>8.1%}{avg:>10.1f}')
