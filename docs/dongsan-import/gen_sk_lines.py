# -*- coding: utf-8 -*-
"""서울경금속 월합계 라인 → 명세 상세 464라인 교체 SQL (sk_lines.json → SQL).
품목: SK-{품번} 162종 신규 등록(간판자재(서울경금속) 그룹) — 명세 품번이 정본 코드.
게이트: 월별 라인 공급가 합 = PO total_amount (재assert)."""
import json, sys
from collections import defaultdict

sys.stdout.reconfigure(encoding='utf-8')
SRC = r'C:\Users\user\dongsan_mes\docs\dongsan-import\load\sk_lines.json'
OUT = r'C:\Users\user\dongsan_mes\docs\dongsan-import\load\sk_lines.sql'
MONTH_SUP = {'2026-01': 16725000, '2026-02': 13126180, '2026-03': 28447380,
             '2026-04': 21423980, '2026-05': 10509900, '2026-06': 42998580}

d = json.load(open(SRC, encoding='utf-8'))
lines, catalog = d['lines'], d['catalog']

by_m = defaultdict(float)
for L in lines:
    by_m[L['d']] += L['sup']
for m, v in MONTH_SUP.items():
    assert round(by_m[m]) == v, f'{m} 라인합 {by_m[m]:,.0f} != {v:,}'
print(f'월계 재검증 OK · 상세 {len(lines)}라인 · 품목 {len(catalog)}종')


def esc(s):
    return str(s or '').replace("'", "''")


sql = ['-- 서울경금속 상세 라인 교체 · 생성기 gen_sk_lines.py (PDF 추출 3중 검산 + 월계 재assert 통과분)',
       '-- ① 품목 162종 (SK-{품번} = 명세 품번 정본)', '']
for c in catalog:
    code = f"SK-{c['pno']}"
    sql.append(
        f"INSERT OR IGNORE INTO items (category_id, item_code, item_name, unit, category, item_type, is_purchase_item, is_sales_item, deduction_method, item_group, specification, is_active) "
        f"VALUES (5, '{code}', '{esc(c['name'])}', 'EA', '원자재', 'MATERIAL', 1, 0, 'NONE', '간판자재(서울경금속)', '{esc(c['spec'])}', 1);")

sql.append('\n-- ② 합계 라인 삭제 + 상세 삽입 (PO 합계 불변)')
by_po = defaultdict(list)
for L in lines:
    by_po[f"E1-PO-SK-{L['d'][:4][2:]}{L['d'][5:7]}"].append(L)
for po, ls in sorted(by_po.items()):
    sql.append(f"DELETE FROM purchase_order_items WHERE po_id=(SELECT id FROM purchase_orders WHERE po_number='{po}') AND item_name LIKE '%월 매입 합계%';")
    for i, L in enumerate(ls, 101):
        item_sel = f"(SELECT id FROM items WHERE item_code='SK-{L['pno']}')" if L['pno'] else 'NULL'
        name = esc((L['name'] + (' ' + L['spec'] if L['spec'] else ''))[:80])
        sql.append(
            f"INSERT INTO purchase_order_items (po_id, item_id, item_name, quantity, unit, unit_price, amount, vat_included, sort_order, notes, line_status, received_quantity, accepted_quantity) "
            f"SELECT po.id, {item_sel}, '{name}', {L['qty']}, 'EA', {L['price']}, {round(L['sup'])}, 0, {i}, '납품 {L['d']}(명세)', 'RECEIVED', {L['qty']}, {L['qty']} "
            f"FROM purchase_orders po WHERE po.po_number='{po}' AND NOT EXISTS (SELECT 1 FROM purchase_order_items x WHERE x.po_id=po.id AND x.sort_order={i});")

sql.append('')
sql.append("SELECT po.po_number, po.total_amount, COALESCE(SUM(i.amount),0) AS line_sum, COUNT(i.id) AS n FROM purchase_orders po LEFT JOIN purchase_order_items i ON i.po_id=po.id WHERE po.po_number LIKE 'E1-PO-SK-26%' GROUP BY po.id;")

with open(OUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(sql) + '\n')
import os
print(f'SQL 저장: {OUT} · {os.path.getsize(OUT)/1024:.0f}KB · 문장 {len([x for x in sql if x.startswith(("INSERT","DELETE"))])}')
