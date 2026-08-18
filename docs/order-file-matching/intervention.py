# -*- coding: utf-8 -*-
"""사람이 실제로 얼마나 손대야 하나 — 개입량 정량화.

74.7% 는 「정확도」가 아니라 **자동 채움 완비율**이다. 나머지는 틀린 값이 아니라 빈 칸이고,
트레이는 원래 사람이 확인하는 화면이다. 그러니 물어야 할 건 정확도가 아니라 **개입 공수**다.

주문 라인 하나가 서려면 필요한 것:
  ① 거래처 → clients.id      파일에 문자열은 있다. 마스터와 이어지나?
  ② 품목   → items.id        파일의 `(솔벤시트)` 같은 제품유형이 품목 마스터와 이어지나?
  ③ 규격·수량                파일에서 나온다(측정 완료)
  ④ 단가·금액                **파일에 없다.** 여기가 진짜 빈 칸이다.

여기서 ①②를 prod 마스터에 대고 실측한다. ④는 별도 판단.
"""
import csv, io, json, os, re, sys
from collections import Counter
from datetime import date

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
S = os.path.dirname(os.path.abspath(__file__))
TMP = os.environ.get('TEMP', S)

RX_NORM = re.compile(r'(주식회사|\(주\)|㈜|유한회사|주\)|\s|\.|,|-|\(|\)|_)')
norm = lambda s: RX_NORM.sub('', s or '').lower()


def load(fn):
    d = json.load(io.open(os.path.join(TMP, fn), encoding='utf-8-sig'))
    return d[0]['results'] if isinstance(d, list) else d['result'][0]['results']


clients = load('prod_clients.json')
items = load('prod_items.json')
cmap = {}
for c in clients:
    k = norm(c['client_name'])
    if k:
        cmap.setdefault(k, c)
imap = {}
for it in items:
    k = norm(it['item_name'])
    if k:
        imap.setdefault(k, it)

# 파일 파싱 결과
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
        if date(2026, 7, 1) <= dt <= date(2026, 8, 11):
            rows.append(r)

print(f'대상 파일 {len(rows):,} · prod 거래처 {len(clients):,} · 품목 {len(items):,}\n')


def match_client(s):
    k = norm(s)
    if not k:
        return None, 'none'
    if k in cmap:
        return cmap[k], 'exact'
    # 부분 포함 — 유일할 때만 인정한다. 여럿이면 사람이 골라야 한다.
    hits = [v for kk, v in cmap.items() if (k in kk or kk in k) and len(kk) >= 2]
    if len(hits) == 1:
        return hits[0], 'partial'
    return (None, 'ambiguous') if hits else (None, 'miss')


cstat, istat = Counter(), Counter()
cache = {}
for r in rows:
    cl = r.get('client') or ''
    if cl not in cache:
        cache[cl] = match_client(cl)
    cstat[cache[cl][1]] += 1

n = len(rows)
print('── ① 거래처 → clients 마스터 ' + '─' * 34)
for k, lbl in (('exact', '정확 일치'), ('partial', '부분 일치(유일)'),
               ('ambiguous', '후보 여럿 → 사람이 선택'), ('miss', '마스터에 없음 → 신규등록'),
               ('none', '파일에 거래처 없음')):
    if cstat[k]:
        print(f'  {lbl:<24} {cstat[k]:>6,}  {cstat[k]/n:>6.1%}')
auto_c = cstat['exact'] + cstat['partial']
print(f'  → 자동 확정 {auto_c:,}/{n:,} = {auto_c/n:.1%}')

# ② 제품유형 → 품목
pt = Counter(r.get('ptype') or '' for r in rows)
hit = 0
unmapped = Counter()
for t, c in pt.items():
    if not t:
        continue
    if norm(t) in imap:
        hit += c
    else:
        unmapped[t] += c
print(f'\n── ② 제품유형 → items 마스터 ' + '─' * 34)
print(f'  제품유형 있는 파일        {n - pt[""]:,}  ({(n-pt[""])/n:.1%})')
print(f'  품목명과 정확 일치        {hit:,}  ({hit/n:.1%})')
print(f'  ★유형 종류 수(매핑표 크기) {len([t for t in pt if t]):,}종')
print(f'    상위 20종이 덮는 파일   {sum(c for _, c in pt.most_common(21) if _):,}'
      f'  ({sum(c for _, c in pt.most_common(21) if _)/n:.1%})')
print('\n  미매핑 상위 15:')
for t, c in unmapped.most_common(15):
    print(f'    {c:>5,}  {t}')
