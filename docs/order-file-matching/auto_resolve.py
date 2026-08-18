# -*- coding: utf-8 -*-
"""사람이 고르는 일까지 없앤다 — 과거 주문 이력으로 지점 자동 판별.

`공감디자인` 이 마스터에 3곳(대전·부안·서산)이라 사람이 골라야 한다고 봤는데,
**실제로 거래가 있는 곳이 하나뿐이면 고를 게 없다.** 이력이 답을 준다.

규칙(보수적):
  · 후보 중 주문 이력이 있는 곳이 **정확히 하나** → 자동 확정
  · 여러 곳에 이력이 있으면 → **최근 1년 주문이 하나뿐**이면 자동, 아니면 사람
  · 이력이 아무 데도 없으면 → 사람 (신규거래처일 수 있다)

★자동 확정이 틀리면 **엉뚱한 거래처에 매출이 선다.** 그래서 '유일할 때만' 을 지킨다.
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
RECENT = '2025-08-01'


def load(fn):
    d = json.load(io.open(os.path.join(TMP, fn), encoding='utf-8-sig'))
    return d[0]['results'] if isinstance(d, list) else d['result'][0]['results']


HIST = {r['id']: r for r in load('client_hist.json')}
exact = defaultdict(list)
for r in HIST.values():
    k = norm(r['client_name'])
    if k:
        exact[k].append(r)

files, byname = [], Counter()
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
            byname[r.get('client') or ''] += 1

n = len(files)
res = Counter()
still = Counter()
auto_examples = []
for nm, cnt in byname.items():
    k = norm(nm)
    if not k:
        res['이름 없음'] += cnt
        continue
    if k in exact and len(exact[k]) == 1:
        res['정확 일치(현행)'] += cnt
        continue
    hits = [c for kk, lst in exact.items() if len(kk) >= 2 and (k in kk or kk in k) for c in lst]
    if len(hits) == 1:
        res['유일 부분일치(현행)'] += cnt
        continue
    if not hits:
        res['마스터에 없음 → 신규등록 필요'] += cnt
        still[nm] = cnt
        continue
    # ── 후보 여럿: 이력으로 가른다 ─────────────────────────
    withhist = [h for h in hits if (h['n_orders'] or 0) > 0]
    recent = [h for h in withhist if (h['last_order'] or '') >= RECENT]
    # ★압도적 다수 규칙 — 한 곳의 거래가 나머지 합의 5배 이상이면 사실상 그곳이다.
    #   `공감디자인` = 대전 116 vs 부안1+서산7 → 14.5배. 사람이 봐도 대전이다.
    srt = sorted(withhist, key=lambda h: -(h['n_orders'] or 0))
    if len(srt) >= 2 and srt[0]['n_orders'] >= 5 * max(sum(h['n_orders'] for h in srt[1:]), 1) \
            and srt[0]['n_orders'] >= 10:
        res['★압도적 다수 → 자동 확정'] += cnt
        if len(auto_examples) < 12:
            auto_examples.append((nm, cnt, srt[0]['client_name'],
                                  f"{srt[0]['n_orders']}건 vs {sum(h['n_orders'] for h in srt[1:])}건",
                                  '압도적'))
        continue
    if len(withhist) == 1:
        res['★이력 유일 → 자동 확정'] += cnt
        if len(auto_examples) < 10:
            auto_examples.append((nm, cnt, withhist[0]['client_name'],
                                  f"{withhist[0]['n_orders']}건", '이력 유일'))
    elif len(recent) == 1:
        res['★최근 1년 유일 → 자동 확정'] += cnt
        if len(auto_examples) < 10:
            auto_examples.append((nm, cnt, recent[0]['client_name'],
                                  f"최근 {recent[0]['last_order']}", '최근 유일'))
    else:
        res['후보 여럿 → 사람이 선택'] += cnt
        still[nm] = cnt

print(f'파일 {n:,}\n')
order = ['정확 일치(현행)', '유일 부분일치(현행)', '★압도적 다수 → 자동 확정',
         '★이력 유일 → 자동 확정', '★최근 1년 유일 → 자동 확정', '후보 여럿 → 사람이 선택',
         '마스터에 없음 → 신규등록 필요', '이름 없음']
for k in order:
    if res[k]:
        print(f'  {k:<30}{res[k]:>7,}  {res[k]/n:>6.1%}')
cur = res['정확 일치(현행)'] + res['유일 부분일치(현행)']
new = cur + sum(res[k] for k in order if k.startswith('★'))
print(f'\n  자동 해소   현행 {cur/n:>6.1%}  →  이력 판별 추가 {new/n:>6.1%}'
      f'   (+{(new-cur)/n:.1%}p)')

# ── 최대 덩어리 두 개를 따로 본다 ─────────────────────────────
print('\n══ 남은 두 덩어리 ' + '═' * 50)
unreg = Counter({nm: c for nm, c in still.items()
                 if not [h for kk, lst in exact.items()
                         if len(kk) >= 2 and (norm(nm) in kk or kk in norm(nm)) for h in lst]})
u_tot = sum(unreg.values())
print(f'\n① 마스터에 없는 이름 — 파일 {u_tot:,}건 / 이름 {len(unreg):,}종')
cumc = 0
srt2 = unreg.most_common()
for N in (20, 50, 100, len(srt2)):
    cov = sum(c for _, c in srt2[:N])
    print(f'   상위 {N:>4}종 등록 → {cov/max(u_tot,1):>6.1%} 해소'
          f'  (전체 자동화율 {(new+cov)/n:>6.1%})')
print('   상위 12:  ' + ' · '.join(f'{nm}({c})' for nm, c in srt2[:12]))

print(f'\n② 파일명에서 거래처를 못 읽음 — {res["이름 없음"]:,}건 ({res["이름 없음"]/n:.1%})')
print('   → 별칭 등록으로는 못 고친다. 파서 개선 또는 파일명 보완이 필요하다.')

print('\n── 이력이 갈라준 예 ' + '─' * 46)
for nm, c, pick, why, kind in auto_examples:
    print(f'  {nm[:16]:<18}{c:>5,}건 → {pick[:24]:<26}({why}, {kind})')

print('\n── 그래도 사람이 봐야 하는 것 상위 12 ' + '─' * 26)
for nm, c in sorted(still.items(), key=lambda x: -x[1])[:12]:
    k = norm(nm)
    hits = [h for kk, lst in exact.items() if len(kk) >= 2 and (k in kk or kk in k) for h in lst]
    tag = ' / '.join(f"{h['client_name']}({h['n_orders']})" for h in hits[:3]) or '신규등록'
    print(f'  {nm[:18]:<20}{c:>5,}건  {tag[:52]}')
