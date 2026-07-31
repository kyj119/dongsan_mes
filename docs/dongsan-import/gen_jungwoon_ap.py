# -*- coding: utf-8 -*-
"""정운교역(503-81-42473, client 1927) 매입 원장 이관 SQL 생성.
원천 = Z:\\Designs\\123\\정운교역\\ 월별 청구서 PDF 5개 (라인 46건, 월합계 원단위 대사 완료)
     + 2025말 이월 299,984,520 (용준님 확정) + 통장 출금 18건 408,000,000 (거래처코드 5038142473)
AP 공식 = PO(final_amount, status NOT IN DRAFT/CANCELLED) − purchase_payments − purchase_adjustments
기대 잔액 = 299,984,520 + 418,651,669 − 408,000,000 = 310,636,189
멱등: PO=OR IGNORE(po_number UNIQUE) · 라인=NOT EXISTS(po_id,sort_order) · 지급=NOT EXISTS(reference) · BOM=OR IGNORE(UNIQUE쌍)
"""
import sys

sys.stdout.reconfigure(encoding='utf-8')
OUT = r'C:\Users\user\dongsan_mes\docs\dongsan-import\load\jungwoon_ap.sql'
SUP = 1927
USR = 5   # admin (created_by NOT NULL)
MARK = '정운교역 매입 이관 2026-07-31'

# ── BOM: 완제품 ← 인쇄원단 (is_default) ──────────────────────────────
BOM = [
    ('TGK-9', 'RM-TP-TGK-4060', 1), ('TGK-8', 'RM-TP-TGK-6090-2', 1), ('TGK-8', 'RM-TP-TGK-CPX', 0),
    ('TGK-7', 'RM-TP-TGK-90135', 1), ('TGK-7', 'RM-TP-TGK-CPX', 0), ('TGK-7G', 'RM-TP-TGK-90135', 1),
    ('TGK-7-1', 'RM-TP-TGK-80120-2', 1), ('TGK-7-1G', 'RM-TP-TGK-80120-2', 1),
    ('TGK-5', 'RM-TP-TGK-120180', 1), ('TGK-4', 'RM-TP-TGK-150225', 1), ('TGK-3', 'RM-TP-TGK-180270', 1),
    ('TGK-SG30', 'RM-TP-TGK-2032-ME', 1),
    ('SMG-7-1', 'RM-TP-SMU-80120', 1), ('SMG-8', 'RM-TP-SMU-6090-2', 1),
    ('SMG-7', 'RM-TP-SMU-90135-2', 1), ('SMG-7G', 'RM-TP-SMU-90135-2', 1),
    ('MBG-7', 'RM-TP-MBG-90135', 1),
]

# ── PO 월별 라인 (일자, 품명원문, item_code|None, 수량, 단가, 공급가) ──
PO = {
    'E1-PO-JW-2601': ('2026-01-31', 119834790, 11983479, 131818269, '1월분 청구서', [
        ('01-02', 'T/P 51.5" 태극기 40*60', 'RM-TP-TGK-4060', 2236, 1210, 2705560),
        ('01-02', 'T/P 51" 새마을 80*120', 'RM-TP-SMU-80120', 4802, 1310, 6290620),
        ('01-02', 'T/P 65" 태극기 복합 60*90+90*135', 'RM-TP-TGK-CPX', 10000, 1400, 14000000),
        ('01-05', 'PONGEE 열승화 130CM', 'PONGE-130', 17912, 830, 14866960),
        ('01-14', 'T/P 80" 청색,홍색 360*540', 'RM-TP-CH-360540', 9063, 3700, 33533100),
        ('01-14', 'T/P 51" 태극기 두폭 60*180', 'RM-TP-TGK-60180-2', 4432, 1210, 5362720),
        ('01-14', 'T/P 51" 태극기 두폭 60*90', 'RM-TP-TGK-6090-2', 8151, 1210, 9862710),
        ('01-14', 'T/P 51" 태극기 두폭 60*90', 'RM-TP-TGK-6090-2', 2089, 1210, 2527690),
        ('01-14', 'T/P 65" 폰지 60*90+90*135', 'RM-TP-MUJI-CPX', 1726, 1400, 2416400),
        ('01-14', '메쉬(콘라이크) 60" 태극기 20*32', 'RM-TP-TGK-2032-ME', 3443, 2300, 7918900),
        ('01-14', '메쉬(콘라이크) 60" 태극기 20*32 (무상)', 'RM-TP-TGK-2032-ME', 1169, 0, 0),
        ('01-28', 'PONGEE 열승화 130CM', 'PONGE-130', 12261, 830, 10176630),
        ('01-30', 'TROPICAL BW/2코팅 90CM', 'TROPICAL-090', 10224, 435, 4447440),
        ('01-30', 'TROPICAL BW/2코팅 70CM', 'TROPICAL-070', 13966, 410, 5726060),
    ]),
    'E1-PO-JW-2602': ('2026-02-28', 19727250, 1972725, 21699975, '2월분 청구서', [
        ('02-10', 'T/P 67" 태극기 두폭 80*120', 'RM-TP-TGK-80120-2', 13605, 1450, 19727250),
    ]),
    'E1-PO-JW-2603': ('2026-03-31', 99225491, 9922549, 109148040, '3월분 청구서', [
        ('03-16', 'TROPICAL BW/2코팅 90CM', 'TROPICAL-090', 10032, 435, 4363920),
        ('03-16', 'TROPICAL BW/2코팅 70CM', 'TROPICAL-070', 10056, 410, 4122960),
        ('03-17', "면 60'S (100*100) BO 58/60\"", None, 200, 2000, 400000),
        ('03-17', '75D T/P 53.5/54" 태극기 두폭 60*90', 'RM-TP-TGK-6090-2', 8372, 1190, 9962680),
        ('03-17', 'T/P 51" 새마을 두폭 60*90', 'RM-TP-SMU-6090-2', 2547, 1310, 3336570),
        ('03-17', 'T/P 61" 태극기 150*225', 'RM-TP-TGK-150225', 2164, 1400, 3029600),
        ('03-18', 'PONGEE 열승화 180CM', 'PONGE-180', 6110, 1200, 7332000),
        ('03-18', 'PONGEE 열승화 180CM 3% LOSS', 'PONGE-180', -183.3, 1200, -219960),
        ('03-18', 'PONGEE 열승화 155CM', 'PONGE-155', 2434, 970, 2360980),
        ('03-18', 'PONGEE 열승화 155CM 3% LOSS', 'PONGE-155', -73.02, 970, -70829),
        ('03-18', 'PONGEE 열승화 130CM', 'PONGE-130', 11751, 830, 9753330),
        ('03-18', 'PONGEE 열승화 130CM 3% LOSS', 'PONGE-130', -352.53, 830, -292600),
        ('03-18', 'PONGEE 열승화 95CM', 'PONGE-095', 6365, 640, 4073600),
        ('03-18', 'PONGEE 열승화 95CM 3% LOSS', 'PONGE-095', -190.95, 640, -122208),
        ('03-18', 'PONGEE 열승화 85CM', 'PONGE-085', 6365, 570, 3628050),
        ('03-18', 'PONGEE 열승화 85CM 3% LOSS', 'PONGE-085', -190.95, 570, -108842),
        ('03-20', 'T/P 75" 태극기 180*270', 'RM-TP-TGK-180270', 7171, 3500, 25098500),
        ('03-25', 'T/P 51" 새마을 두폭 60*90', 'RM-TP-SMU-6090-2', 1866, 1310, 2444460),
        ('03-25', 'T/P 51" 태극기 가로기 두폭 60*90', 'RM-TP-TGKH-6090-2', 3928, 1210, 4752880),
        ('03-26', '75D T/P 61" 태극기 장례용기 150*225', 'RM-TP-TGK-JR-150225', 10986, 1400, 15380400),
    ]),
    'E1-PO-JW-2604': ('2026-04-30', 61072105, 6107211, 67179316, '4월분 청구서', [
        ('04-13', 'T/P 65" 태극기 복합 60*90+90*135', 'RM-TP-TGK-CPX', 8821, 1400, 12349400),
        ('04-13', 'T/P 51" 태극기 120*180', 'RM-TP-TGK-120180', 3349, 1250, 4186250),
        ('04-13', '75D T/P 53.5/54" 태극기 두폭 60*90', 'RM-TP-TGK-6090-2', 11476, 1210, 13885960),
        ('04-15', 'TROPICAL BW/2코팅 90CM', 'TROPICAL-090', 9625, 445, 4283125),
        ('04-15', 'TROPICAL BW/2코팅 70CM', 'TROPICAL-070', 9625, 420, 4042500),
        ('04-16', '300D무연SATIN BW/열승화 155CM', 'SATIN300-155', 2379, 2200, 5233800),
        ('04-24', '메쉬(콘라이크) 60" 태극기 20*32', 'RM-TP-TGK-2032-ME', 5471, 2400, 13130400),
        ('04-24', 'T/P 55" 태극기 90*135', 'RM-TP-TGK-90135', 2891, 1370, 3960670),
    ]),
    'E1-PO-JW-2605': ('2026-05-31', 80732790, 8073279, 88806069, '5월분 청구서', [
        ('05-07', '75D T/P 53.5/54" 태극기 두폭 60*90', 'RM-TP-TGK-6090-2', 13892, 1210, 16809320),
        ('05-07', 'T/P 65" 태극기 복합 60*90+90*135', 'RM-TP-TGK-CPX', 9197, 1450, 13335650),
        ('05-07', 'T/P 55" 새마을 두폭 90*135', 'RM-TP-SMU-90135-2', 2894, 1370, 3964780),
        ('05-07', 'T/P 55" 뉴민방위 90*135', 'RM-TP-MBG-90135', 2964, 1270, 3764280),
        ('05-08', '메쉬(콘라이크) 61" 태극기 20*32', 'RM-TP-TGK-2032-ME', 5955, 2400, 14292000),
        ('05-08', '75D T/P 54" 해군기 90*135', 'RM-TP-NAVY-90135', 718, 2300, 1651400),
        ('05-08', '75D T/P 53" 태극기 두폭 60*90', 'RM-TP-TGK-6090-2', 580, 1210, 701800),
        ('05-08', '75D T/P 53.5/54" 태극기 두폭 60*90', 'RM-TP-TGK-6090-2', 5108, 1210, 6180680),
        ('05-14', 'PONGEE 열승화 93CM', 'PONGE-095', 18600, 640, 11904000),
        ('05-14', 'PONGEE 열승화 130CM', 'PONGE-130', 8601, 880, 7568880),
        ('05-30', '약품비', None, 1, 560000, 560000),
    ]),
}

# ── 지급 18건 (통장 출금, 거래처코드 5038142473 — 합 408,000,000) ─────
PAY = [
    ('2026-01-02', 10000000, '홈) 기업(주)정운교역'), ('2026-01-30', 20000000, '홈) 기업(주)정운교역'),
    ('2026-02-04', 10000000, '홈) 기업(주)정운교역'), ('2026-02-13', 10000000, '정운교역(주)'),
    ('2026-02-27', 15000000, '(주)정운교역'), ('2026-02-27', 30000000, '정운교역(주)'),
    ('2026-03-06', 15000000, '홈) 기업(주)정운교역'), ('2026-03-16', 10000000, '(주)정운교역'),
    ('2026-03-18', 5000000, '(주)정운교역'), ('2026-03-31', 55000000, '(주)정운교역'),
    ('2026-04-15', 25000000, '홈) 기업(주)정운교역'), ('2026-04-30', 30000000, '홈) 기업(주)정운교역'),
    ('2026-04-30', 40000000, '(주)정운교역'), ('2026-05-07', 10000000, '(주)정운교역'),
    ('2026-05-15', 8000000, '운산직물외상대지급(정운교역 삼각정산)'), ('2026-05-29', 30000000, '(주)정운교역'),
    ('2026-06-02', 25000000, '(주)정운교역'), ('2026-06-30', 60000000, '홈) 기업(주)정운교역'),
]

# ── 검증 ─────────────────────────────────────────────────────────────
for po, (d, tot, vat, fin, lbl, lines) in PO.items():
    s = sum(x[5] for x in lines)
    assert s == tot, f'{po} 라인합 {s:,} != 공급가 {tot:,}'
    assert tot + vat == fin, f'{po} 공급가+VAT != 합계'
assert sum(p[1] for p in PAY) == 408000000, '지급합 오류'
total_fin = sum(v[3] for v in PO.values())
assert total_fin == 418651669, f'PO final 합 {total_fin:,}'
print(f'검증 OK: PO 5건 final 합 {total_fin:,} · 지급 {sum(p[1] for p in PAY):,} · 기대 AP {299984520 + total_fin - 408000000:,}')


def esc(s):
    return s.replace("'", "''")


sql = [f"-- {MARK} · 생성기 gen_jungwoon_ap.py (검증 assert 통과분만 출력)",
       f"-- 롤백: DELETE FROM purchase_payments WHERE notes LIKE '{MARK}%';",
       f"--       DELETE FROM purchase_order_items WHERE po_id IN (SELECT id FROM purchase_orders WHERE notes LIKE '{MARK}%');",
       f"--       DELETE FROM purchase_orders WHERE notes LIKE '{MARK}%';",
       '']

sql.append('-- ① BOM (완제품 ← 인쇄원단)')
for p, m, dflt in BOM:
    sql.append(
        f"INSERT OR IGNORE INTO product_materials (product_item_id, material_item_id, is_default) "
        f"SELECT p.id, m.id, {dflt} FROM items p, items m WHERE p.item_code='{p}' AND m.item_code='{m}';")

sql.append('\n-- ② 이월 채무 PO')
sql.append(
    f"INSERT OR IGNORE INTO purchase_orders (po_number, supplier_id, status, order_date, total_amount, vat_amount, final_amount, notes, created_by, entity_id, created_at, updated_at) "
    f"VALUES ('E1-PO-JW-OPEN', {SUP}, 'RECEIVED', '2025-12-31', 299984520, 0, 299984520, '{MARK} · 2025년말 이월 채무(명세 확정)', {USR}, 1, '2025-12-31 09:00:00', '2025-12-31 09:00:00');")
sql.append(
    f"INSERT INTO purchase_order_items (po_id, item_id, item_name, quantity, unit, unit_price, amount, vat_included, sort_order, notes, line_status, received_quantity, accepted_quantity) "
    f"SELECT po.id, NULL, '2025년말 이월 채무', 1, '식', 299984520, 299984520, 1, 1, '{MARK}', 'RECEIVED', 1, 1 "
    f"FROM purchase_orders po WHERE po.po_number='E1-PO-JW-OPEN' AND NOT EXISTS (SELECT 1 FROM purchase_order_items x WHERE x.po_id=po.id AND x.sort_order=1);")

sql.append('\n-- ③ 월별 매입 PO + 라인 (청구월 기준)')
for po, (d, tot, vat, fin, lbl, lines) in PO.items():
    sql.append(
        f"INSERT OR IGNORE INTO purchase_orders (po_number, supplier_id, status, order_date, total_amount, vat_amount, final_amount, notes, created_by, entity_id, created_at, updated_at) "
        f"VALUES ('{po}', {SUP}, 'RECEIVED', '{d}', {tot}, {vat}, {fin}, '{MARK} · {lbl}', {USR}, 1, '{d} 09:00:00', '{d} 09:00:00');")
    for i, (day, name, code, qty, price, amt) in enumerate(lines, 1):
        item_sel = f"(SELECT id FROM items WHERE item_code='{code}')" if code else 'NULL'
        sql.append(
            f"INSERT INTO purchase_order_items (po_id, item_id, item_name, quantity, unit, unit_price, amount, vat_included, sort_order, notes, line_status, received_quantity, accepted_quantity) "
            f"SELECT po.id, {item_sel}, '{esc(name)}', {qty}, 'yd', {price}, {amt}, 0, {i}, '납품 2026-{day}', 'RECEIVED', {qty}, {qty} "
            f"FROM purchase_orders po WHERE po.po_number='{po}' AND NOT EXISTS (SELECT 1 FROM purchase_order_items x WHERE x.po_id=po.id AND x.sort_order={i});")

sql.append('\n-- ④ 지급 (통장 출금 실측)')
for i, (d, amt, who) in enumerate(PAY, 1):
    ref = f'ECNT-JW-{i:02d}'
    sql.append(
        f"INSERT INTO purchase_payments (supplier_id, payment_date, amount, payment_method, reference_number, notes, created_by, entity_id) "
        f"SELECT {SUP}, '{d}', {amt}, '계좌이체', '{ref}', '{MARK} · 통장 출금({esc(who)})', {USR}, 1 "
        f"WHERE NOT EXISTS (SELECT 1 FROM purchase_payments WHERE reference_number='{ref}' AND supplier_id={SUP});")

with open(OUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(sql) + '\n')
print(f'SQL 저장: {OUT} · 문장 수 {len([x for x in sql if x.startswith("INSERT")])}')
