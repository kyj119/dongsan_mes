# -*- coding: utf-8 -*-
"""선명 2026-07 적재분 중 **간판 계열 미매칭 라인**을 MES 간판 품목에 연결 (2026-08-07).

왜 따로 하나: 「7월 간판 매출 0원」(분석문서 §4-①) 의 마지막 조각이다.
  7월부터 간판이 선명으로 옮겨왔는데(용준님), 이관 후에도 `category='간판'` 집계에는
  18라인 7,673,000 만 잡혔다. 나머지 **48라인 32,049,000 이 `item_id NULL`** 로 들어가
  분류 집계에서 빠져 있었기 때문이다.

매칭은 **접두 규칙**이다. 선명 품명이 시공 내용을 뒤에 덧붙이는 형태라
(「채널간판+각관(조명용)」·「비조명 후레임간판(2등분)」) 앞부분만 보면 8품목으로 정확히 갈린다.
  ⚠️ 순서가 중요하다 — 「조명용 후레임간판」이 「비조명 후레임간판」의 부분문자열이 아니므로
     비조명을 먼저 본다(조명 규칙이 비조명을 삼키지 않게).

  채널/채널간판/채널트러스바/채널 보강대 → SIGN-CH   채널간판
  비조명 후레임간판 · 갈바제작(비조명)      → SIGN-FRN  비조명 프레임간판(신규 제작)
  조명용 후레임간판                        → SIGN-FRL  조명 프레임간판(신규 제작)
  돌출/포인트사각돌출                      → SIGN-PRT  돌출간판
  스카시                                   → SIGN-SCS  스카시(입체문자)
  그 외 간판성 항목(갈바후광·RGB컨트롤러 등) → SIGN-ETC  간판 기타(일반)

★ 「간판(동산기획 정산건 매출 적용)」 1,090,000 은 **제외**한다 — 법인간 정산 항목이지
   간판 제품 매출이 아니다(오다플래그와 같은 성격).

사용: python docs/dongsan-import/gen_e2_sign_link.py <items.json> <lines.json>
"""
import json, sys, os, re
sys.stdout.reconfigure(encoding='utf-8')

ITEMS_JSON, LINES_JSON = sys.argv[1], sys.argv[2]
OUT = os.path.join(r'C:\Users\user\dongsan_mes', 'docs', 'dongsan-import', 'load')

items = {i['item_code']: i['id'] for i in json.load(open(ITEMS_JSON, encoding='utf-8')) if i['is_active']}
lines = json.load(open(LINES_JSON, encoding='utf-8'))

EXCLUDE = re.compile(r'정산건')
# (판정 정규식, 품목코드) — 위에서부터 먼저 맞는 것. 비조명이 조명보다 앞이다.
RULES = [
    (re.compile(r'채널'), 'SIGN-CH'),
    (re.compile(r'비조명|갈바제작\(비조명\)'), 'SIGN-FRN'),
    (re.compile(r'조명용|조명 후레임|후레임간판\+등조립'), 'SIGN-FRL'),
    (re.compile(r'돌출'), 'SIGN-PRT'),
    (re.compile(r'스카시'), 'SIGN-SCS'),
    (re.compile(r'간판|갈바|후레임|RGB컨트롤러'), 'SIGN-ETC'),
]

buf, agg, skip = [], {}, []
for ln in lines:
    nm = str(ln['item_name'] or '')
    if EXCLUDE.search(nm):
        skip.append((nm, ln['amt']))
        continue
    code = next((c for rx, c in RULES if rx.search(nm)), None)
    if not code or code not in items:
        skip.append((nm, ln['amt']))
        continue
    buf.append("UPDATE order_items SET item_id = %d WHERE id = %d;  -- %s" % (items[code], ln['id'], nm))
    a = agg.setdefault(code, [0, 0])
    a[0] += 1
    a[1] += ln['amt']

open(os.path.join(OUT, 'e2_sign_link.sql'), 'w', encoding='utf-8').write(
    '-- 선명 2026-07 간판 계열 미매칭 라인 → MES 간판 품목 연결 (2026-08-07)\n'
    '-- 생성기 = docs/dongsan-import/gen_e2_sign_link.py (접두 규칙·제외 근거는 그 파일 헤더)\n'
    '-- 롤백 = docs/dongsan-import/rollback_e2_sign_link.sql\n\n' + '\n'.join(buf) + '\n')
ids = [str(ln['id']) for ln in lines]
open(os.path.join(OUT, 'rollback_e2_sign_link.sql'), 'w', encoding='utf-8').write(
    '-- 간판 연결 롤백 (2026-08-07) — 적용 전 이 라인들은 전부 item_id NULL 이었다\n'
    'UPDATE order_items SET item_id = NULL WHERE id IN (%s);\n' % ','.join(ids))

for c, (n, a) in sorted(agg.items(), key=lambda x: -x[1][1]):
    print('  %-10s %3d라인  %12s' % (c, n, format(a, ',')))
print('연결 %d라인 %s' % (sum(v[0] for v in agg.values()), format(sum(v[1] for v in agg.values()), ',')))
print('제외 %d라인 %s' % (len(skip), format(sum(a for _, a in skip), ',')))
for nm, a in skip:
    print('    %s | %s' % (nm, format(a, ',')))
