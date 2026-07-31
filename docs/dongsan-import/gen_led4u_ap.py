# -*- coding: utf-8 -*-
"""엘이디포유(402-81-69392) 매입 원장 이관 SQL — led4u_rows(전사 검증본) 기반.
구조: OPEN 269,900,215 + 월별 PO 6건(원장 상세라인) + 별도직송 PO 20,075,000(계산서 발행·원장 외
     — 1/20 5M·3/16 14.8M·6/10 275,000 지급과 1:1 대응, 순액 0) + 지급 19건 219,679,489(통장 실측).
기대 AP = 269,900,215 + 198,779,339 + 20,075,000 − 219,679,489 = 269,075,065 (원장 6/30 실측 일치).
품목: 원단만 기존 매칭([KCM]투코팅→AQ2-폭, [BKG]저밀도90→AQD-090) — LED·간판자재 품목 등록은 간판 BOM 단계에서."""
import sys, re
from collections import defaultdict

sys.path.insert(0, r'C:\Users\user\dongsan_mes\docs\dongsan-import')
from led4u_rows import R, OPENING
from led4u_rows2 import R2

sys.stdout.reconfigure(encoding='utf-8')
OUT = r'C:\Users\user\dongsan_mes\docs\dongsan-import\load\led4u_ap.sql'
SUP_CODE = '402-81-69392'
USR = 5
MARK = '엘이디포유 매입 이관 2026-07-31'
MS = {'26-01': 34695100, '26-02': 8625160, '26-03': 43474600,
      '26-04': 57443800, '26-05': 9703140, '26-06': 26766690}
MONTH_END = {'26-01': '2026-01-31', '26-02': '2026-02-28', '26-03': '2026-03-31',
             '26-04': '2026-04-30', '26-05': '2026-05-31', '26-06': '2026-06-30'}
PAY = [('2026-01-15', 10000000), ('2026-01-20', 5000000), ('2026-01-30', 20000000),
       ('2026-02-13', 9405836), ('2026-02-13', 10000000), ('2026-02-27', 81840),
       ('2026-03-16', 14800000), ('2026-03-16', 20000000), ('2026-03-31', 15000000),
       ('2026-04-16', 30000000), ('2026-04-30', 20000000),
       ('2026-05-29', 2317788), ('2026-05-29', 8355666),
       ('2026-06-01', 20000000), ('2026-06-10', 275000), ('2026-06-15', 4312990),
       ('2026-06-30', 1968549), ('2026-06-30', 5000000), ('2026-06-30', 23161820)]

ALL = [(r[0], r[1], r[2], r[3], r[4], r[5]) for r in R] + list(R2)
by_m = defaultdict(list)
for d, nm, qty, pr, sup, dep in ALL:
    if dep or d[:5] not in MS:
        continue
    if sup == 0 and qty == 0:
        continue
    by_m[d[:5]].append((d, nm, qty, pr, sup))
for k, tot in MS.items():
    s = sum(x[4] for x in by_m[k])
    assert s == tot, f'{k} {s:,} != {tot:,}'
assert sum(p[1] for p in PAY) == 219679489
sup6 = sum(MS.values())
fin6 = sup6 + round(sup6 * 0.1)
ap = OPENING + fin6 + 20075000 - 219679489
assert ap == 269075065, f'AP {ap:,}'
n_lines = sum(len(v) for v in by_m.values())
print(f'검산 OK: 1~6월 라인 {n_lines} · 발생 {fin6:,} + 별도 20,075,000 · 지급 219,679,489 · 기대 AP {ap:,}')


def item_sel(nm):
    m = re.search(r'현수막원단\(투코팅\)\s*(\d+)폭', nm)
    if m:
        return f"(SELECT id FROM items WHERE item_code='AQ2-{int(m.group(1)):03d}')"
    if '원단(저밀도) 90폭' in nm:
        return "(SELECT id FROM items WHERE item_code='AQD-090')"
    return 'NULL'


def esc(s):
    return str(s).replace("'", "''")


sql = [f'-- {MARK} · 생성기 gen_led4u_ap.py (전사 검증본 361행·전 앵커 원단위 통과분)',
       f"-- 롤백: DELETE FROM purchase_payments WHERE notes LIKE '{MARK}%'; (라인→PO 순 동일 마커)", '']
sql.append(
    f"INSERT OR IGNORE INTO purchase_orders (po_number, supplier_id, status, order_date, total_amount, vat_amount, final_amount, notes, created_by, entity_id, created_at, updated_at) "
    f"SELECT 'E1-PO-LED-OPEN', c.id, 'RECEIVED', '2025-12-31', {OPENING}, 0, {OPENING}, '{MARK} · 2025년말 이월 채무(원장 확정)', {USR}, 1, '2025-12-31 09:00:00', '2025-12-31 09:00:00' FROM clients c WHERE c.client_code='{SUP_CODE}';")
sql.append(
    f"INSERT INTO purchase_order_items (po_id, item_id, item_name, quantity, unit, unit_price, amount, vat_included, sort_order, notes, line_status, received_quantity, accepted_quantity) "
    f"SELECT po.id, NULL, '2025년말 이월 채무', 1, '식', {OPENING}, {OPENING}, 1, 1, '{MARK}', 'RECEIVED', 1, 1 "
    f"FROM purchase_orders po WHERE po.po_number='E1-PO-LED-OPEN' AND NOT EXISTS (SELECT 1 FROM purchase_order_items x WHERE x.po_id=po.id AND x.sort_order=1);")

for k in sorted(MS):
    po = f'E1-PO-LED-{k.replace("-", "")}'
    tot = MS[k]
    vat = round(tot * 0.1)
    d = MONTH_END[k]
    sql.append(
        f"INSERT OR IGNORE INTO purchase_orders (po_number, supplier_id, status, order_date, total_amount, vat_amount, final_amount, notes, created_by, entity_id, created_at, updated_at) "
        f"SELECT '{po}', c.id, 'RECEIVED', '{d}', {tot}, {vat}, {tot + vat}, '{MARK} · {int(k[3:])}월분 원장', {USR}, 1, '{d} 09:00:00', '{d} 09:00:00' FROM clients c WHERE c.client_code='{SUP_CODE}';")
    for i, (day, nm, qty, pr, sup) in enumerate(by_m[k], 101):
        sql.append(
            f"INSERT INTO purchase_order_items (po_id, item_id, item_name, quantity, unit, unit_price, amount, vat_included, sort_order, notes, line_status, received_quantity, accepted_quantity) "
            f"SELECT po.id, {item_sel(nm)}, '{esc(nm)[:90]}', {qty}, 'EA', {pr}, {sup}, 0, {i}, '납품 20{day}(원장)', 'RECEIVED', {qty}, {qty} "
            f"FROM purchase_orders po WHERE po.po_number='{po}' AND NOT EXISTS (SELECT 1 FROM purchase_order_items x WHERE x.po_id=po.id AND x.sort_order={i});")

sql.append(
    f"INSERT OR IGNORE INTO purchase_orders (po_number, supplier_id, status, order_date, total_amount, vat_amount, final_amount, notes, created_by, entity_id, created_at, updated_at) "
    f"SELECT 'E1-PO-LED-EXTRA', c.id, 'RECEIVED', '2026-06-30', 18250000, 1825000, 20075000, '{MARK} · 별도 직송건(원장 외 계산서 발행분 — 1/20 5M·3/16 14.8M·6/10 275,000 지급과 1:1 대응·순액 0)', {USR}, 1, '2026-06-30 09:00:00', '2026-06-30 09:00:00' FROM clients c WHERE c.client_code='{SUP_CODE}';")
sql.append(
    f"INSERT INTO purchase_order_items (po_id, item_id, item_name, quantity, unit, unit_price, amount, vat_included, sort_order, notes, line_status, received_quantity, accepted_quantity) "
    f"SELECT po.id, NULL, '별도 직송건 합계(상세=세금계산서 3건 대응)', 1, '식', 18250000, 18250000, 0, 1, '{MARK}', 'RECEIVED', 1, 1 "
    f"FROM purchase_orders po WHERE po.po_number='E1-PO-LED-EXTRA' AND NOT EXISTS (SELECT 1 FROM purchase_order_items x WHERE x.po_id=po.id AND x.sort_order=1);")

for i, (d, amt) in enumerate(PAY, 1):
    ref = f'ECNT-LED-{i:02d}'
    sql.append(
        f"INSERT INTO purchase_payments (supplier_id, payment_date, amount, payment_method, reference_number, notes, created_by, entity_id) "
        f"SELECT c.id, '{d}', {amt}, '계좌이체', '{ref}', '{MARK} · 통장 출금 실측', {USR}, 1 FROM clients c WHERE c.client_code='{SUP_CODE}' "
        f"AND NOT EXISTS (SELECT 1 FROM purchase_payments p WHERE p.reference_number='{ref}');")

with open(OUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(sql) + '\n')
import os
print(f'SQL 저장: {OUT} · {os.path.getsize(OUT)//1024}KB · INSERT {len([x for x in sql if x.startswith("INSERT")])}문')
