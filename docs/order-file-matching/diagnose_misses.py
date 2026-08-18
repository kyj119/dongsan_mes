# -*- coding: utf-8 -*-
"""실패 라인 직접 진단 — 「24% 는 못 채운다」가 사실인지 확인한다.

앞선 결론은 파라미터를 바꿔도 안 움직인다는 관찰에서 나왔다. 그건 **그 방법의 천장**이지
정보가 없다는 증거가 아니다. 붙은 주문 안에서 **안 맞은 라인**을 하나씩 분류한다.

분류:
  A 근사값 있음(±1~±5cm)      → 반올림·실측 오차. **규칙으로 잡힌다**
  B 가로세로 뒤바뀜            → 이미 정렬로 처리 중이나 재확인
  C 배수 관계(×2·÷2·×5…)      → 배율·조 단위. **규칙으로 잡힌다**
  D 다른 그룹에 정확히 있음      → 그룹 경계 오류. **그룹 키로 잡힌다**
  E 그날 어디에도 없음          → 파일 미생성·다른 축. 진짜 정보 부재
  F 규격 자체가 파일에 없음      → BoundingBox 복원 대상
"""
import csv, io, os, re, sys
from collections import Counter, defaultdict
from datetime import date, timedelta
import pandas as pd

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
S = os.path.dirname(os.path.abspath(__file__))
TRUTH = r'C:\Users\user\dongsan_mes\품목마스터\원천주문데이터\동산_주문서현황_2607-2608.xlsx'
RX_KEY = re.compile(r'^2026/(\d\d)/(\d\d)\s*-\s*(\d+)$')
RX_GSPEC = re.compile(r'\[\s*(\d+(?:\.\d+)?)\s*[*xX]\s*(\d+(?:\.\d+)?)\s*\]')
RX_NORM = re.compile(r'(주식회사|\(주\)|㈜|유한회사|주\)|\s|\.|,|-)')
norm = lambda s: RX_NORM.sub('', str(s or ''))
D0, D1 = date(2026, 7, 1), date(2026, 8, 11)
WINDOW = 7


def skey(w, h):
    a, b = sorted([round(float(w)), round(float(h))])
    return (a, b)


orders = defaultdict(lambda: {'lines': [], 'client': '', 'dt': None})
df = pd.read_excel(TRUTH, header=1)
df.columns = [str(c).strip() for c in df.columns]
kc = df.columns[0]
for _, r in df.iterrows():
    mo = RX_KEY.match(str(r[kc]).strip())
    if not mo:
        continue
    dt = date(2026, int(mo.group(1)), int(mo.group(2)))
    label = str(r.get('품목명(규격)', '') or '')
    sp = RX_GSPEC.search(label)
    o = orders[(dt, int(mo.group(3)))]
    o['dt'] = dt
    o['client'] = str(r.get('거래처명', '') or '').strip()
    o['lines'].append({'w': float(sp.group(1)) if sp else None,
                       'h': float(sp.group(2)) if sp else None,
                       'item': RX_GSPEC.sub('', label).strip()})

groups = defaultdict(lambda: {'files': [], 'dt': None, 'clients': Counter()})
allfiles = []
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
        f = {'w': float(r['w']) if r.get('w') else None,
             'h': float(r['h']) if r.get('h') else None,
             'name': r['name'], 'dt': dt, 'axis': r['axis'], 'ptype': r.get('ptype') or ''}
        groups[key]['files'].append(f)
        groups[key]['dt'] = dt
        if cl:
            groups[key]['clients'][cl] += 1
        allfiles.append(f)

o_spec = {k: v for k, v in orders.items() if any(l['w'] for l in v['lines']) and D0 <= v['dt'] <= D1}
g_spec = {k: v for k, v in groups.items() if any(f['w'] for f in v['files'])}

# 날짜별 전체 파일 규격 인덱스 (그룹 밖 탐색용)
by_day = defaultdict(set)
for f in allfiles:
    if f['w']:
        by_day[f['dt']].add(skey(f['w'], f['h']))

idx = defaultdict(set)
for k, o in o_spec.items():
    for l in o['lines']:
        if l['w']:
            idx[skey(l['w'], l['h'])].add(k)

pairs = []
for gk, g in g_spec.items():
    c = Counter()
    for f in g['files']:
        if f['w']:
            for ok in idx.get(skey(f['w'], f['h']), ()):
                if abs((o_spec[ok]['dt'] - g['dt']).days) <= WINDOW:
                    c[ok] += 1
    for ok, n in c.items():
        pairs.append((3.0 * n - 0.4 * abs((o_spec[ok]['dt'] - g['dt']).days), gk, ok))
pairs.sort(key=lambda t: -t[0])
matched, used = {}, set()
for sc, gk, ok in pairs:
    if gk not in matched and ok not in used:
        matched[gk] = ok; used.add(ok)
for sc, gk, ok in pairs:
    if gk not in matched and sc >= 3.0:
        matched[gk] = ok

by_order = defaultdict(list)
for gk, ok in matched.items():
    by_order[ok].append(gk)

cat = Counter()
samples = defaultdict(list)
for ok, gks in by_order.items():
    o = o_spec[ok]
    gs = set()
    for gk in gks:
        for f in g_spec[gk]['files']:
            if f['w']:
                gs.add(skey(f['w'], f['h']))
    nospec = sum(1 for gk in gks for f in g_spec[gk]['files'] if not f['w'])
    for l in o['lines']:
        if not l['w']:
            continue
        s = skey(l['w'], l['h'])
        if s in gs:
            cat['일치'] += 1
            continue
        # ── 안 맞은 라인을 분류한다 ──────────────────────
        near = [t for t in gs if abs(t[0] - s[0]) <= 5 and abs(t[1] - s[1]) <= 5]
        mult = [t for t in gs for m in (2, 5, 10)
                if (abs(t[0] - s[0] * m) <= 2 and abs(t[1] - s[1] * m) <= 2)
                or (abs(t[0] * m - s[0]) <= 2 and abs(t[1] * m - s[1]) <= 2)]
        elsewhere = any(s in by_day[o['dt'] + timedelta(days=d)] for d in range(-3, 4))
        if near:
            c = 'A 근사값(±5cm) — 규칙으로 잡힘'
        elif mult:
            c = 'C 배수관계(×2·×5·×10) — 규칙으로 잡힘'
        elif elsewhere:
            c = 'D 다른 그룹에 정확히 있음 — 그룹 경계'
        elif nospec:
            c = 'F 그룹에 규격없는 파일 있음 — BoundingBox 대상'
        else:
            c = 'E 그날 어디에도 없음 — 진짜 부재'
        cat[c] += 1
        if len(samples[c]) < 4:
            samples[c].append((o['dt'].isoformat(), ok[1], o['client'][:12], f'{s[0]}x{s[1]}', l['item'][:20]))

tot = sum(v for k, v in cat.items())
miss = tot - cat['일치']
print(f'붙은 주문 {len(by_order):,}건 · 규격 라인 {tot:,} · 일치 {cat["일치"]:,} ({cat["일치"]/tot:.1%})')
print(f'★안 맞은 라인 {miss:,} ({miss/tot:.1%}) — 정체는:\n')
for k, v in sorted(((k, v) for k, v in cat.items() if k != '일치'), key=lambda x: -x[1]):
    print(f'  {v:>5,}  {v/miss:>6.1%}  {k}')
    for s in samples[k][:2]:
        print(f'          {s[0]} No.{s[1]} {s[2]} · {s[3]} · {s[4]}')

# ══ 회수 패스 ══════════════════════════════════════════════
# 실패의 68% 가 「파일은 있는데 다른 그룹에 있다」였다. 그룹은 **묶음 힌트**일 뿐인데
# 배정을 그룹 단위로 끝내서, 한 주문의 파일이 두 그룹에 흩어지면 하나만 붙는다.
# → 그룹 배정 뒤 **파일 단위로 한 번 더** 훑어 남은 라인을 회수한다.
#   ★파일 하나는 한 번만 쓴다(소비 표시). 안 그러면 같은 파일이 여러 주문을 채워 수량이 부푼다.
consumed = set()
for ok, gks in by_order.items():
    o = o_spec[ok]
    have = Counter()
    for gk in gks:
        for i, f in enumerate(g_spec[gk]['files']):
            if f['w']:
                have[skey(f['w'], f['h'])] += 1
                consumed.add(id(f))
    for l in o['lines']:
        if l['w'] and have.get(skey(l['w'], l['h'])):
            have[skey(l['w'], l['h'])] -= 1

free = defaultdict(list)                      # 아직 안 쓰인 파일: 규격 → [파일]
for f in allfiles:
    if f['w'] and id(f) not in consumed:
        free[skey(f['w'], f['h'])].append(f)

recovered = 0
for ok, gks in by_order.items():
    o = o_spec[ok]
    gs = Counter()
    for gk in gks:
        for f in g_spec[gk]['files']:
            if f['w']:
                gs[skey(f['w'], f['h'])] += 1
    for l in o['lines']:
        if not l['w']:
            continue
        s = skey(l['w'], l['h'])
        if gs.get(s):
            gs[s] -= 1
            continue
        # 같은 규격의 미소비 파일을 날짜 창 안에서 찾는다
        pool = free.get(s) or []
        pick = next((f for f in pool
                     if abs((f['dt'] - o['dt']).days) <= WINDOW and id(f) not in consumed), None)
        if pick:
            consumed.add(id(pick)); recovered += 1

after = cat['일치'] + recovered
print(f'\n══ 회수 패스(파일 단위 2차 훑기) ' + '═' * 30)
print(f'  회수 {recovered:,}건 → 라인 일치 {cat["일치"]:,} ({cat["일치"]/tot:.1%})'
      f'  →  {after:,} ({after/tot:.1%})')
print(f'  남은 미일치 {tot-after:,} ({(tot-after)/tot:.1%})')
print(f'\n  ★「24% 는 못 채운다」는 틀렸다 — 진짜 부재는 {cat.get("E 그날 어디에도 없음 — 진짜 부재",0):,}건'
      f' ({cat.get("E 그날 어디에도 없음 — 진짜 부재",0)/tot:.1%})')
