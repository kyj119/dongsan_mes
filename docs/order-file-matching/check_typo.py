# -*- coding: utf-8 -*-
"""표기 오류로 판정된 것들이 옳게 붙었는지 + 규칙 배포용 「변종 → 정본」 목록."""
import csv, io, os, re, sys
from collections import defaultdict
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
S = os.path.dirname(os.path.abspath(__file__))
rows = list(csv.DictReader(open(os.path.join(S, 'item_map_draft.csv'), encoding='utf-8-sig')))

print('══ 표기 오류(평판·포멕스·품보드) 매핑 결과 ' + '═' * 40)
for r in rows:
    if '표기오류' in r['근거'] or '평판' in r['파일표기']:
        print(f'  {int(r["건수"]):>4}  {r["파일표기"][:24]:<26}→ {r["제안_품목코드"][:14]:<16}'
              f'{r["제안_품목명"][:22]:<24}{r["확신도"]}')

# 같은 품목에 붙은 표기들을 모아 「정본 1 : 변종 N」을 뽑는다 — 규칙 문서의 원재료다
grp = defaultdict(list)
for r in rows:
    if r['제안_품목코드'] and not r['제안_품목코드'].startswith('('):
        grp[(r['제안_품목코드'], r['제안_품목명'])].append((r['파일표기'], int(r['건수'])))
print('\n══ 한 품목에 여러 표기가 붙은 것 (규칙 배포 대상) ' + '═' * 32)
n = 0
for (code, name), lst in sorted(grp.items(), key=lambda kv: -sum(x[1] for x in kv[1])):
    if len(lst) < 2:
        continue
    lst.sort(key=lambda x: -x[1])
    tot = sum(x[1] for x in lst)
    print(f'\n  {name}  ({code})  총 {tot:,}건 · 표기 {len(lst)}종')
    print('     정본후보: ' + lst[0][0])
    var = [f'{t}({c})' for t, c in lst[1:12]]
    print('     변종    : ' + ', '.join(var) + (' …' if len(lst) > 12 else ''))
    n += 1
    if n >= 12:
        break
