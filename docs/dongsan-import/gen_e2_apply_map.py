# -*- coding: utf-8 -*-
"""최종 매핑표 → 선명 2026-07 판매라인 `item_id` 적용 SQL (2026-08-07).

입력은 사람이 확인한 `2026-08-07-e2-final-map.tsv` 다. 「수정(기입)」 열이 채워져 있으면
**그 값이 `★적용코드`를 이긴다** — 사람 판단이 항상 우선이다.

★ `EP-시리즈 수성` 은 최종표 작성 시점엔 MES 품목이 없어 NULL 이었는데, 이후 `GDS-EQ-EP1852`
  로 등록했다(용준님 확인). 표를 다시 만들지 않고 여기서 보정한다.

대상은 **선명 2026-07 이관 라인 중 아직 `item_id` 가 없는 것**만. 이미 붙은 라인은 건드리지 않는다.
매칭 키는 (품목명, 규격) — 매칭기와 같은 키다.

사용: python docs/dongsan-import/gen_e2_apply_map.py <final_map.tsv> <lines.json>
산출: load/e2_apply_item_map.sql (+ rollback)
"""
import csv, json, sys, os, warnings
from collections import Counter
warnings.filterwarnings('ignore')
sys.stdout.reconfigure(encoding='utf-8')

MAP_TSV, LINES_JSON = sys.argv[1], sys.argv[2]
OUT = os.path.join(r'C:\Users\user\dongsan_mes', 'docs', 'dongsan-import', 'load')

# 최종표 작성 후에 등록된 품목 — 표를 재생성하지 않고 여기서 덮는다
LATE = {('EP-시리즈 수성', 'EP1852'): 'GDS-EQ-EP1852'}

code_of = {}
for r in csv.DictReader(open(MAP_TSV, encoding='utf-8-sig'), delimiter='\t'):
    k = (r['품목명'].strip(), r['규격'].strip())
    c = (r.get('수정(기입)') or '').strip() or (r['★적용코드'] or '').strip()
    if c:
        code_of[k] = c
code_of.update(LATE)

lines = json.load(open(LINES_JSON, encoding='utf-8'))
buf, ids, stat, missing = [], [], Counter(), Counter()
for ln in lines:
    k = (str(ln['item_name'] or '').strip(), str(ln['specification'] or '').strip())
    c = code_of.get(k)
    if not c:
        missing[k[0]] += 1
        continue
    buf.append("UPDATE order_items SET item_id = (SELECT id FROM items WHERE item_code = '%s') "
               "WHERE id = %d AND item_id IS NULL;  -- %s | %s" % (c, ln['id'], k[0], k[1]))
    ids.append(str(ln['id']))
    stat[c] += 1

open(os.path.join(OUT, 'e2_apply_item_map.sql'), 'w', encoding='utf-8').write(
    '-- 선명 2026-07 판매라인 품목 연결 — 최종 매핑표 적용 (2026-08-07)\n'
    '-- 생성기 = docs/dongsan-import/gen_e2_apply_map.py\n'
    '-- 출처 = docs/analysis/2026-08-07-e2-final-map.tsv (용준님 확정 15 + 자동 고신뢰 29 + EP1852)\n'
    '-- ⚠️ `AND item_id IS NULL` 로 **이미 붙은 라인은 안 건드린다** — 재실행해도 안전하다.\n'
    '-- 롤백 = docs/dongsan-import/rollback_e2_apply_item_map.sql\n\n' + '\n'.join(buf) + '\n')
open(os.path.join(OUT, 'rollback_e2_apply_item_map.sql'), 'w', encoding='utf-8').write(
    '-- 품목 연결 롤백 (2026-08-07) — 적용 전 이 라인들은 전부 item_id NULL 이었다\n'
    'UPDATE order_items SET item_id = NULL WHERE id IN (%s);\n' % ','.join(ids))

print('연결 %d라인 · 품목 %d종' % (len(buf), len(stat)))
print('상위:', dict(stat.most_common(8)))
print('매핑 없는 라인 %d (품명 %d종) — NULL 유지' % (sum(missing.values()), len(missing)))
