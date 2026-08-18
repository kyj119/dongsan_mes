# -*- coding: utf-8 -*-
"""진짜 덩어리 둘을 뜯는다 — 「마스터 없음 23.9%」와 「이름 못 읽음 12.6%」.

「후보 여럿 → 사람이 선택」은 3.6% 뿐이다. 거기 매달릴 게 아니라 이 둘을 봐야 한다.
둘 다 **코드로 고칠 수 있는지**가 관건이다(현장에 요구하면 부담이 늘어난다).

  ① 이름 못 읽음 581건 — 파서가 왜 못 읽나. 파일명에 정말 없나, 아니면 규칙 밖인가.
  ② 마스터 없음 1,104건 — 진짜 신규 거래처인가, 표기 변형(한글/영문·띄어쓰기)인가.
"""
import csv, io, json, os, re, sys
from collections import Counter, defaultdict
from datetime import date

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
S = os.path.dirname(os.path.abspath(__file__))
TMP = os.environ.get('TEMP', S)
RX = re.compile(r'(주식회사|\(주\)|㈜|유한회사|주\)|\s|\.|,|-|\(|\)|_)')
norm = lambda s: RX.sub('', str(s or '')).lower()
D0, D1 = date(2026, 7, 1), date(2026, 8, 11)


def load(fn):
    d = json.load(io.open(os.path.join(TMP, fn), encoding='utf-8-sig'))
    return d[0]['results'] if isinstance(d, list) else d['result'][0]['results']


CL = load('client_hist.json')
names = {norm(c['client_name']): c for c in CL if norm(c['client_name'])}

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
            rows.append(r)

# ── ① 거래처를 못 읽은 파일 ────────────────────────────────
noc = [r for r in rows if not (r.get('client') or '').strip()]
print(f'══ ① 파일명에서 거래처를 못 읽음 — {len(noc):,}건 ' + '═' * 24)
byaxis = Counter(r['axis'] for r in noc)
print(f'  축별: {dict(byaxis)}')
# 폴더에는 있나?
in_folder = sum(1 for r in noc if '\\' in r['rel'])
print(f'  하위 폴더가 있는 파일: {in_folder:,} ({in_folder/max(len(noc),1):.0%})')
print('\n  샘플 14 (경로 전체):')
for r in noc[:14]:
    print(f'   [{r["axis"][:6]}] {r["rel"][:88]}')

# ── ② 마스터에 없는 이름 ───────────────────────────────────
byname = Counter((r.get('client') or '').strip() for r in rows if (r.get('client') or '').strip())
miss = {}
for nm, c in byname.items():
    k = norm(nm)
    if k in names:
        continue
    if any(len(kk) >= 2 and (k in kk or kk in k) for kk in names):
        continue
    miss[nm] = c
print(f'\n══ ② 마스터에 없는 이름 — {sum(miss.values()):,}건 / {len(miss):,}종 ' + '═' * 14)
# 느슨한 재검색: 앞 2~3글자만 같아도 후보로
loose = 0
loose_ex = []
for nm, c in sorted(miss.items(), key=lambda x: -x[1])[:400]:
    k = norm(nm)
    if len(k) < 3:
        continue
    cand = [v['client_name'] for kk, v in names.items() if kk[:3] == k[:3] or k[:3] == kk[:3]]
    if cand:
        loose += c
        if len(loose_ex) < 12:
            loose_ex.append((nm, c, cand[:3]))
print(f'  앞 3글자가 같은 마스터가 있는 것: {loose:,}건  ← 표기 변형일 가능성')
for nm, c, cand in loose_ex:
    print(f'   {nm[:16]:<18}{c:>4,}건  ~ {" / ".join(x[:20] for x in cand)}')
print('\n  앞 3글자도 안 겹치는 것 상위 12 (진짜 신규 후보):')
k3 = {norm(x)[:3] for x in names}
for nm, c in sorted(((nm, c) for nm, c in miss.items() if norm(nm)[:3] not in k3),
                    key=lambda x: -x[1])[:12]:
    print(f'   {nm[:20]:<22}{c:>4,}건')
