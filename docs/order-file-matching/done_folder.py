# -*- coding: utf-8 -*-
"""완료 폴더 = 아직 안 쓴 판단 기준.

용준님: 출력이 끝나면 사람이 파일을 `출력실`·`현수막실` 같은 폴더로 **옮겨서** 완료를 표시한다.
      전사는 옮기지 않는다. 간판은 미확인.

그러면 날짜 폴더 바로 아래 구조는 두 종류가 섞여 있다:
  · 주문 폴더        `13-싸이버기획-총50장-31일 화물`   (순번-거래처-납기)
  · 완료/배송 폴더    `출력실` `현수막실` `끝 23` `택배` `화물` `방문,직배` `간판팀`

여기서 재는 것:
  ① 완료 폴더 이름 실태 (하드코딩하지 않으려면 먼저 열거해야 한다)
  ② 완료분 비율
  ③ **완료 여부 ↔ 정답지 매칭 성공의 상관** — 미완료가 매칭 실패에 몰려 있으면
     "정답지에 없음"의 일부는 취소·미출력이지 매칭 실패가 아니다.
"""
import csv, os, re, sys, io
from collections import Counter, defaultdict
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import score_v4 as V

S = os.path.dirname(os.path.abspath(__file__))
RX_ORDER_FOLDER = re.compile(r'^\s*\d{1,3}\s*-')      # `13-싸이버기획-…` = 주문 폴더

# 날짜 폴더 바로 아래 1단계 폴더명을 모은다(주문 폴더는 뺀다)
lvl1 = Counter()
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
        if not (V.D0 <= dt <= V.D1):
            continue
        parts = r['rel'].split('\\')
        # 날짜 폴더 위치를 찾는다 — `…\07월\30일\<여기>\…`
        di = None
        for i, seg in enumerate(parts[:-1]):
            if re.match(r'^\s*\d{1,2}\s*일', seg):
                di = i
        sub = parts[di + 1] if (di is not None and di + 1 < len(parts) - 1) else None
        if sub and not RX_ORDER_FOLDER.match(sub):
            lvl1[sub] += 1
        r['_sub'] = sub
        r['_dt'] = dt
        rows.append(r)

print('── 날짜 폴더 바로 아래 비(非)주문 폴더 TOP 25 ' + '─' * 18)
for nm, c in lvl1.most_common(25):
    print(f'  {c:>5,}  {nm}')

# 완료 폴더 판정 — 관찰된 이름에서 귀납한다(하드코딩 최소화)
RX_DONE = re.compile(r'(출력실|현수막실|^완$|^완료|^끝)')
RX_SHIP = re.compile(r'(택배|화물|직배|방문|간판팀|퀵)')

done = ship = plain = 0
for r in rows:
    s = r.get('_sub')
    if s and RX_DONE.search(s):
        done += 1; r['_st'] = 'done'
    elif s and RX_SHIP.search(s):
        ship += 1; r['_st'] = 'ship'
    else:
        plain += 1; r['_st'] = 'plain'
n = len(rows)
print(f'\n── 분류 (파일 {n:,}) ' + '─' * 40)
print(f'  완료 폴더(출력실·현수막실·끝…)  {done:>6,}  {done/n:>6.1%}')
print(f'  배송 폴더(택배·화물·직배…)      {ship:>6,}  {ship/n:>6.1%}')
print(f'  그 외(주문폴더·날짜폴더 직하)    {plain:>6,}  {plain/n:>6.1%}')

axd = defaultdict(Counter)
for r in rows:
    axd[r['axis']][r['_st']] += 1
print('\n  축별:')
for ax, c in axd.items():
    t = sum(c.values())
    print(f'    {ax:<16} 완료 {c["done"]/t:>6.1%} · 배송 {c["ship"]/t:>6.1%} · 그외 {c["plain"]/t:>6.1%}  (n={t:,})')

# ── 완료 여부 ↔ 매칭 성공 ────────────────────────────────
orders = V.load_truth()
groups, _ = V.load_groups(merge=False, extra=False)
o_spec = {k: v for k, v in orders.items() if any(l['w'] for l in v['lines'])}
g_spec = {k: v for k, v in groups.items() if any(f['w'] for f in v['files'])}
idx = defaultdict(set)
for k, o in o_spec.items():
    for l in o['lines']:
        if l['w']:
            idx[V.skey(l['w'], l['h'])].add(k)
pairs = []
for gk, g in g_spec.items():
    cnt = Counter()
    for f in g['files']:
        if f['w']:
            for k in idx.get(V.skey(f['w'], f['h']), ()):
                if abs((o_spec[k]['dt'] - g['dt']).days) <= 7:
                    cnt[k] += 1
    for ok, c in cnt.items():
        pairs.append((V.W_SPEC * c - V.W_DATE * abs((o_spec[ok]['dt'] - g['dt']).days), gk, ok))
pairs.sort(key=lambda t: -t[0])
matched, used = {}, set()
for sc, gk, ok in pairs:
    if gk not in matched and ok not in used:
        matched[gk] = ok; used.add(ok)
for sc, gk, ok in pairs:
    if gk not in matched and sc >= 3.0:
        matched[gk] = ok

# 파일 → 그룹키 재계산(score_v4 와 동일 규칙)
st_by_group = defaultdict(Counter)
for r in rows:
    seq, client = r.get('seq'), (r.get('client') or None)
    if seq:
        key = ('S', r['_dt'], int(seq))
    elif client:
        key = ('C', r['_dt'], V.norm(client))
    else:
        key = ('D', r['_dt'], r['rel'].split('\\')[-2] if '\\' in r['rel'] else '')
    st_by_group[key][r['_st']] += 1

mt = Counter(); um = Counter()
for gk in g_spec:
    tgt = mt if gk in matched else um
    c = st_by_group.get(gk)
    if not c:
        continue
    tgt['done' if c['done'] else ('ship' if c['ship'] else 'plain')] += 1
print('\n── 완료 여부 ↔ 정답지 매칭 ' + '─' * 32)
for lbl, c in (('매칭 성공', mt), ('매칭 실패', um)):
    t = sum(c.values()) or 1
    print(f'  {lbl}  완료 {c["done"]/t:>6.1%} · 배송 {c["ship"]/t:>6.1%} · 그외 {c["plain"]/t:>6.1%}  (n={t:,})')
