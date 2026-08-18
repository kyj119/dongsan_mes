# -*- coding: utf-8 -*-
"""대사 결과 열람 — recon_*.csv 를 사람이 보기 좋게. 겸 플래그 수집 점검."""
import csv, io, os, sys
from collections import Counter
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
S = os.path.dirname(os.path.abspath(__file__))


def rd(fn):
    p = os.path.join(S, fn)
    return list(csv.DictReader(open(p, encoding='utf-8-sig'))) if os.path.exists(p) else []


# 플래그가 실제로 파싱되고 있는지 — 대사에서 「재출력 0건」이 나오면 여기부터 의심한다
flags = Counter()
for fn in ('parsed.csv', 'parsed_jeonsa.csv'):
    p = os.path.join(S, fn)
    if os.path.exists(p):
        for r in csv.DictReader(open(p, encoding='utf-8')):
            if r.get('flag'):
                flags[r['flag']] += 1
print(f'── 파일 상태플래그 수집 실태 (전 구간) ' + '─' * 26)
print(f'  {dict(flags) or "(0건 — 파서가 못 읽고 있을 수 있다)"}\n')

a = rd('recon_missing_order.csv')
print('══ ① 파일 있는데 주문 없음 ' + '═' * 48)
for v, c in Counter(r['판정'] for r in a).most_common():
    print(f'  {c:>5,}  {v}')
print('\n  ★청구 누락 후보 상위 10:')
for r in [x for x in a if x['판정'].startswith('★')][:10]:
    print(f"   {r['일자']}  {r['거래처(파일)'][:14]:<16}{r['파일수']:>3}파일  "
          f"{r['규격'][:30]:<32}수량 {r['수량합']}")
    print(f"      {r['대표파일'][:88]}")

b = rd('recon_missing_file.csv')
print('\n══ ② 주문 있는데 파일 없음 — 금액 상위 10 ' + '═' * 32)
for r in b[:10]:
    print(f"   {r['일자']}  No.{r['주문No']:<5}{r['거래처'][:14]:<16}"
          f"{int(r['공급가액']):>10,}원  {r['품목'][:30]}")

c = rd('recon_qty_mismatch.csv')
print('\n══ ③ 수량 불일치 — 차이 큰 순 10 ' + '═' * 40)
for r in c[:10]:
    print(f"   {r['일자']}  No.{r['주문No']:<5}{r['거래처'][:12]:<14}{r['규격']:<12}"
          f"이카운트 {r['이카운트수량']:>6} vs 파일 {r['파일수량']:>6}  (차 {r['차이']})")
