# -*- coding: utf-8 -*-
"""사람 일을 **영구히** 없애는 길 — 거래처 별칭 1회 등록의 효과.

계속 「사람이 확인하면 된다」로 돌아갔는데, 그건 답이 아니다. 물어야 할 건
**같은 일을 두 번 하지 않게 만들 수 있나**다.

관찰: 초안 생성에 이카운트는 필요 없다(파일이 곧 주문). 실제로 남는 사람 일은
      **거래처 해소 41.7%** 뿐이다. 그런데 미해소 이름이 **반복**된다면
      한 번 등록해서 `clients.search_keywords` 에 넣는 순간 영원히 자동이 된다.

여기서 재는 것:
  ① 미해소 파일이 몇 **종**의 이름에서 나오는가 (집중도)
  ② 상위 N종만 등록하면 몇 %가 자동이 되는가
  ③ 각 미해소 이름의 **정답 후보**를 자동 생성할 수 있는가 (사람은 고르기만)
"""
import csv, io, json, os, re, sys
from collections import Counter, defaultdict
from datetime import date

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
S = os.path.dirname(os.path.abspath(__file__))
TMP = os.environ.get('TEMP', S)
RX_NORM = re.compile(r'(주식회사|\(주\)|㈜|유한회사|주\)|\s|\.|,|-|\(|\)|_)')
norm = lambda s: RX_NORM.sub('', str(s or '')).lower()
D0, D1 = date(2026, 7, 1), date(2026, 8, 11)


def load(fn):
    d = json.load(io.open(os.path.join(TMP, fn), encoding='utf-8-sig'))
    return d[0]['results'] if isinstance(d, list) else d['result'][0]['results']


CL = load('prod_clients.json')
exact = {}
for c in CL:
    k = norm(c['client_name'])
    if k:
        exact.setdefault(k, []).append(c)


def resolve(name):
    """zscan 과 동일 규칙: 정확일치 → 유일 부분일치. 아니면 후보 목록 반환."""
    k = norm(name)
    if not k:
        return 'none', []
    if k in exact and len(exact[k]) == 1:
        return 'exact', exact[k]
    hits = [c for kk, lst in exact.items() if len(kk) >= 2 and (k in kk or kk in k) for c in lst]
    if len(hits) == 1:
        return 'partial', hits
    if hits:
        return 'ambiguous', hits
    return 'miss', []


files = []
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
            files.append(r.get('client') or '')

n = len(files)
byname = Counter(files)
status = {nm: resolve(nm) for nm in byname}
unres = {nm: c for nm, c in byname.items() if status[nm][0] in ('ambiguous', 'miss', 'none')}
u_files = sum(unres.values())

print(f'파일 {n:,} · 거래처 이름 {len(byname):,}종\n')
print(f'  자동 해소 {n-u_files:,} ({(n-u_files)/n:.1%}) · 미해소 {u_files:,} ({u_files/n:.1%})')
print(f'  ★미해소가 나오는 이름은 {len(unres):,}종뿐 — 파일 {u_files:,}건이 여기서 나온다')

cum = 0
print(f'\n── 상위 N종만 1회 등록하면 (미해소 {u_files:,}건 기준) ' + '─' * 12)
srt = sorted(unres.items(), key=lambda x: -x[1])
for N in (20, 50, 100, 200, len(srt)):
    cov = sum(c for _, c in srt[:N])
    print(f'  상위 {N:>4}종 등록 → 미해소의 {cov/u_files:>6.1%} 해소'
          f'  (전체 자동화율 {(n-u_files+cov)/n:>6.1%})')

print(f'\n── 자동 생성된 후보 (사람은 고르기만) 상위 20 ' + '─' * 16)
print(f'  {"파일 표기":<20}{"건수":>6}  후보')
for nm, c in srt[:20]:
    st, hits = status[nm]
    cand = ' / '.join(f"{h['client_name']}" for h in hits[:3]) if hits else '(마스터에 없음 → 신규 등록)'
    print(f'  {nm[:18]:<20}{c:>6,}  {cand[:56]}')
