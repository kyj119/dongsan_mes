# -*- coding: utf-8 -*-
"""케이엠테크(128-87-17213) 매입 원장 이관 SQL 생성.
원천 = Z:\\Designs\\123\\케이엠테크\\ 거래처원장 2개(소모품 계정 + 장비 계정, 26.07.31 인쇄) — 행 체인 수기 검산 완료.
구조: 이월 74,654,600(소모품 계정·장비 계정 0) · 상반기 발생 80,721,300(=세금계산서 수집합 정확 일치,
      캐피탈 전환 음수 라인 −22M/−57.2M 포함 net) · 지급 83,300,000(통장 58.3M=은행 실측 일치 + 법인카드 25M)
      → 6/30 AP 72,075,900(원장 6/30 잔액 일치). 7월 거래는 하반기 — 제외.
잉크 매칭: KM-열전사(LY) 4색=RM-I0055~58 · 8색 Bl/Lk/Or/Re=RM-I0065/64/66/63 · 에코솔벤=RM-I0015~18(기존).
신규: SGM2·PEB·UV-NEW·UV-E413·Extreme수성·부품 (RM-I-*/KMT-*). 장비·캐피탈·할인 라인은 item NULL(자산·조정)."""
import sys

sys.stdout.reconfigure(encoding='utf-8')
OUT = r'C:\Users\user\dongsan_mes\docs\dongsan-import\load\km_ap.sql'
SUP_CODE = '128-87-17213'
USR = 5
MARK = '케이엠테크 매입 이관 2026-07-31'

NEW_ITEMS = [  # (code, name, spec, group)
    ('RM-I-SGM2-5L', '솔벤-SGM2 INK 5L(혼합)', '5L·색구성 적요', '솔벤잉크 3200폭'),
    ('RM-I-PEB-C-5L', 'PEB 병(小) C', '5L', '수성잉크 PEB'),
    ('RM-I-PEB-K-5L', 'PEB 병(小) K', '5L', '수성잉크 PEB'),
    ('RM-I-PEB-M-5L', 'PEB 병(小) M', '5L', '수성잉크 PEB'),
    ('RM-I-PEB-Y-5L', 'PEB 병(小) Y', '5L', '수성잉크 PEB'),
    ('RM-I-UVNEW-C', 'UV-NEW C', 'R312', 'UV잉크 UV-NEW'),
    ('RM-I-UVNEW-K', 'UV-NEW K', 'R312', 'UV잉크 UV-NEW'),
    ('RM-I-UVNEW-M', 'UV-NEW M', 'R312', 'UV잉크 UV-NEW'),
    ('RM-I-UVNEW-Y', 'UV-NEW Y', 'R312', 'UV잉크 UV-NEW'),
    ('RM-I-UVE413-W', 'UV-E413 W', '1L', 'UV잉크 E413'),
    ('RM-I-UVE413-C', 'UV-E413 C', '1L', 'UV잉크 E413'),
    ('RM-I-UVE413-M', 'UV-E413 M', '1L', 'UV잉크 E413'),
    ('RM-I-UVE413-Y', 'UV-E413 Y', '1L', 'UV잉크 E413'),
    ('RM-I-UVE413-K', 'UV-E413 K', '1L', 'UV잉크 E413'),
    ('RM-I-EXT-C-1.5L', 'Extreme 수성 C', '1.5L', '수성잉크 Extreme'),
    ('RM-I-EXT-M-1.5L', 'Extreme 수성 M', '1.5L', '수성잉크 Extreme'),
    ('RM-I-EXT-Y-1.5L', 'Extreme 수성 Y', '1.5L', '수성잉크 Extreme'),
    ('RM-I-EXT-K-1.5L', 'Extreme 수성 K', '1.5L', '수성잉크 Extreme'),
    ('RM-I-EXT-C-3L', 'Extreme 수성 C', '3L', '수성잉크 Extreme'),
    ('RM-I-EXT-M-3L', 'Extreme 수성 M', '3L', '수성잉크 Extreme'),
    ('RM-I-EXT-Y-3L', 'Extreme 수성 Y', '3L', '수성잉크 Extreme'),
    ('RM-I-EXT-K-3L', 'Extreme 수성 K', '3L', '수성잉크 Extreme'),
    ('KMT-ENCSTRIP', '(공용) 엔코더스트립', '180dpi 3.6M', '장비부품(케이엠테크)'),
    ('KMT-STAND1700', '출력물받침대', '1700', '장비부품(케이엠테크)'),
    ('KMT-UVONEWAY', 'UV-Oneway film', '1.37×50M', '장비부품(케이엠테크)'),
    ('KMT-PRISM', '프리즘솔벤반사백색', '1220×45.7m', '장비부품(케이엠테크)'),
    ('KMT-BLOWER', 'Extreme-2280T 블로어', '', '장비부품(케이엠테크)'),
    ('KMT-RELAY8A', 'Extreme-2280T 릴레이', '8A-AC/250V-DC 피더', '장비부품(케이엠테크)'),
    ('KMT-RELAY24V', 'Extreme-2280T 릴레이', '24VDC-10A-110V 피더', '장비부품(케이엠테크)'),
    ('KMT-IRON', 'Extreme-2280T 인두기', '', '장비부품(케이엠테크)'),
    ('KMT-CONN4', '(공용) 일자커넥터 4Φ', '', '장비부품(케이엠테크)'),
    ('KMT-HEAD-I3200', '(F1) I3200-A1 헤드', '', '장비부품(케이엠테크)'),
]

# 본(소모품) 계정 월별: (po suffix, 월말일, 공급가, [(일, 품명, code|None, 수량, 단가, 공급가)])
MAIN = {
    '2601': ('2026-01-31', 20875000, [
        ('01-01', '솔벤-SGM2 INK 5L (C5 M5 Y5)', 'RM-I-SGM2-5L', 15, 195000, 2925000),
        ('01-14', 'PEB_병(小)_C 5L', 'RM-I-PEB-C-5L', 90, 40000, 3600000),
        ('01-14', 'PEB_병(小)_K 5L', 'RM-I-PEB-K-5L', 30, 40000, 1200000),
        ('01-14', 'PEB_병(小)_M 5L', 'RM-I-PEB-M-5L', 140, 40000, 5600000),
        ('01-14', 'PEB_병(小)_Y 5L', 'RM-I-PEB-Y-5L', 140, 40000, 5600000),
        ('01-23', 'UV-NEW-C R312', 'RM-I-UVNEW-C', 11, 65000, 715000),
        ('01-23', 'UV-NEW-K R312', 'RM-I-UVNEW-K', 2, 65000, 130000),
        ('01-23', 'UV-NEW-M R312', 'RM-I-UVNEW-M', 10, 65000, 650000),
        ('01-23', 'UV-NEW-Y R312', 'RM-I-UVNEW-Y', 7, 65000, 455000),
    ]),
    '2602': ('2026-02-28', 3525000, [
        ('02-11', 'KM-열전사잉크(LY)_C 1L 1박스', 'RM-I0055', 20, 15000, 300000),
        ('02-11', 'KM-열전사잉크(LY)_M 1L', 'RM-I0056', 20, 15000, 300000),
        ('02-11', '솔벤-SGM2 INK 5L (c2 m5 y5 k3)', 'RM-I-SGM2-5L', 15, 195000, 2925000),
    ]),
    '2603': ('2026-03-31', 4750000, [
        ('03-03', '(공용) 엔코더스트립 180dpi 3.6M', 'KMT-ENCSTRIP', 4, 75000, 300000),
        ('03-09', 'KM-열전사잉크(LY)_C 1L', 'RM-I0055', 20, 15000, 300000),
        ('03-09', 'KM-열전사잉크(LY)_M 1L', 'RM-I0056', 20, 15000, 300000),
        ('03-09', 'KM-열전사잉크(LY)_Y 1L', 'RM-I0057', 50, 15000, 750000),
        ('03-09', 'KM-열전사잉크(LY)_K 1L', 'RM-I0058', 10, 15000, 150000),
        ('03-13', 'UV-E413 (W) 1L', 'RM-I-UVE413-W', 6, 65000, 390000),
        ('03-13', 'UV-E413 C 1L', 'RM-I-UVE413-C', 4, 65000, 260000),
        ('03-13', 'UV-E413 M 1L', 'RM-I-UVE413-M', 5, 65000, 325000),
        ('03-13', 'UV-E413 Y 1L', 'RM-I-UVE413-Y', 5, 65000, 325000),
        ('03-17', 'UV-NEW-C R312', 'RM-I-UVNEW-C', 3, 65000, 195000),
        ('03-17', 'UV-NEW-K R312', 'RM-I-UVNEW-K', 4, 65000, 260000),
        ('03-17', 'UV-NEW-M R312', 'RM-I-UVNEW-M', 7, 65000, 455000),
        ('03-17', 'UV-NEW-Y R312', 'RM-I-UVNEW-Y', 6, 65000, 390000),
        ('03-17', 'KM-에코솔벤트 C', 'RM-I0015', 3, 35000, 105000),
        ('03-17', 'KM-에코솔벤트 M', 'RM-I0016', 3, 35000, 105000),
        ('03-17', 'KM-에코솔벤트 Y', 'RM-I0017', 3, 35000, 105000),
        ('03-17', 'KM-에코솔벤트 K', 'RM-I0018', 1, 35000, 35000),
    ]),
    '2604': ('2026-04-30', 2560000, [
        ('04-02', 'PEB_병(小)_C 5L (4월초 단가)', 'RM-I-PEB-C-5L', 80, 45000, 3600000),
        ('04-02', 'PEB_병(小)_K 5L', 'RM-I-PEB-K-5L', 40, 45000, 1800000),
        ('04-02', 'PEB_병(小)_M 5L', 'RM-I-PEB-M-5L', 140, 45000, 6300000),
        ('04-02', 'PEB_병(小)_Y 5L', 'RM-I-PEB-Y-5L', 140, 45000, 6300000),
        ('04-02', '솔벤-SGM2 INK 5L (c3 m6 y3)', 'RM-I-SGM2-5L', 12, 195000, 2340000),
        ('04-02', 'UV-Oneway film 1.37*50M', 'KMT-UVONEWAY', 1, 230000, 230000),
        ('04-10', 'KM-열전사잉크(LY)_Bl 1L', 'RM-I0065', 5, 15000, 75000),
        ('04-10', 'KM-열전사잉크(LY)_Lk 1L', 'RM-I0064', 5, 15000, 75000),
        ('04-10', 'KM-열전사잉크(LY)_Or 1L', 'RM-I0066', 5, 15000, 75000),
        ('04-10', 'KM-열전사잉크(LY)_Re 1L', 'RM-I0063', 5, 15000, 75000),
        ('04-10', 'KM-열전사잉크(LY)_C 1L', 'RM-I0055', 60, 15000, 900000),
        ('04-10', 'KM-열전사잉크(LY)_K 1L', 'RM-I0058', 20, 15000, 300000),
        ('04-10', 'KM-열전사잉크(LY)_M 1L', 'RM-I0056', 60, 15000, 900000),
        ('04-10', 'KM-열전사잉크(LY)_Y 1L', 'RM-I0057', 80, 15000, 1200000),
        ('04-10', '출력물받침대 1700 (장비출고 서비스)', 'KMT-STAND1700', 2, 0, 0),
        ('04-10', '출력물받침대 1700', 'KMT-STAND1700', 6, 65000, 390000),
        ('04-10', '자유품목 (캐피탈 진행 — 아이비렌탈 전환)', None, -1, 22000000, -22000000),
    ]),
    '2605': ('2026-05-31', 6755000, [
        ('05-12', 'UV-NEW-C R312 (인상)', 'RM-I-UVNEW-C', 4, 70000, 280000),
        ('05-12', 'UV-NEW-K R312', 'RM-I-UVNEW-K', 1, 70000, 70000),
        ('05-12', 'UV-NEW-M R312', 'RM-I-UVNEW-M', 8, 70000, 560000),
        ('05-12', 'UV-NEW-Y R312', 'RM-I-UVNEW-Y', 7, 70000, 490000),
        ('05-12', 'KM-에코솔벤트 C (인상)', 'RM-I0015', 3, 38000, 114000),
        ('05-12', 'KM-에코솔벤트 M', 'RM-I0016', 2, 38000, 76000),
        ('05-12', 'KM-에코솔벤트 Y', 'RM-I0017', 4, 38000, 152000),
        ('05-12', 'KM-에코솔벤트 K', 'RM-I0018', 1, 38000, 38000),
        ('05-26', 'UV-Oneway film 1.37*50M', 'KMT-UVONEWAY', 2, 230000, 460000),
        ('05-26', '프리즘솔벤반사백색 1220*45.7m', 'KMT-PRISM', 1, 455000, 455000),
        ('05-26', '(F1) I3200-A1 헤드 (전사장비·무상)', 'KMT-HEAD-I3200', 1, 0, 0),
        ('05-27', 'Extreme-2280T 블로어', 'KMT-BLOWER', 3, 550000, 1650000),
        ('05-27', 'Extreme-2280T 릴레이 8A-AC/250V-DC (무상)', 'KMT-RELAY8A', 5, 0, 0),
        ('05-27', 'Extreme-2280T 릴레이 24VDC-10A-110V (무상)', 'KMT-RELAY24V', 5, 0, 0),
        ('05-27', 'Extreme-2280T 인두기', 'KMT-IRON', 11, 110000, 1210000),
        ('05-27', '(공용) 일자커넥터 4Φ (무상지원)', 'KMT-CONN4', 6, 0, 0),
        ('05-27', 'KM-열전사잉크(LY)_C 1L', 'RM-I0055', 30, 12000, 360000),
        ('05-27', 'KM-열전사잉크(LY)_M 1L', 'RM-I0056', 20, 12000, 240000),
        ('05-27', 'KM-열전사잉크(LY)_Y 1L', 'RM-I0057', 30, 12000, 360000),
        ('05-27', 'KM-열전사잉크(LY)_K 1L', 'RM-I0058', 20, 12000, 240000),
    ]),
    '2606': ('2026-06-30', 4918000, [
        ('06-01', 'KM-열전사잉크(LY)_Bl 1L', 'RM-I0065', 5, 12000, 60000),
        ('06-01', 'KM-열전사잉크(LY)_Or 1L', 'RM-I0066', 2, 17000, 34000),
        ('06-01', 'KM-열전사잉크(LY)_Re 1L', 'RM-I0063', 2, 17000, 34000),
        ('06-01', 'KM-열전사잉크(LY)_Lk 1L', 'RM-I0064', 2, 12000, 24000),
        ('06-08', 'Extreme 수성-C (1.5L)', 'RM-I-EXT-C-1.5L', 80, 8000, 640000),
        ('06-08', 'Extreme 수성-M (1.5L)', 'RM-I-EXT-M-1.5L', 80, 8000, 640000),
        ('06-08', 'Extreme 수성-Y (1.5L)', 'RM-I-EXT-Y-1.5L', 80, 8000, 640000),
        ('06-08', 'Extreme 수성-K (1.5L) (무상지원)', 'RM-I-EXT-K-1.5L', 48, 0, 0),
        ('06-08', 'Extreme 수성-C (3L)', 'RM-I-EXT-C-3L', 20, 16000, 320000),
        ('06-08', 'Extreme 수성-M (3L)', 'RM-I-EXT-M-3L', 18, 16000, 288000),
        ('06-08', 'Extreme 수성-Y (3L)', 'RM-I-EXT-Y-3L', 18, 16000, 288000),
        ('06-08', 'Extreme 수성-K (3L) (무상지원)', 'RM-I-EXT-K-3L', 10, 0, 0),
        ('06-15', '솔벤-SGM2 INK 5L (c2 m3 y3 k2)', 'RM-I-SGM2-5L', 10, 195000, 1950000),
    ]),
}

# 장비 계정 PO: (po suffix, 일자, 공급가, 라인)
EQUIP = {
    '2602EQ': ('2026-02-11', 30000000, [
        ('02-11', 'Extreme-1880T 1600mm (장비)', None, 1, 28000000, 28000000),
        ('02-11', 'Extreme-집진기 2280T/1880T 공용 (장비출고·무상)', None, 1, 0, 0),
        ('02-11', 'Extreme-집진기 2280T/1880T 공용', None, 1, 1200000, 1200000),
        ('02-11', 'Extreme-2280T 핸드미스트', None, 1, 950000, 950000),
        ('02-11', '매출할인', None, 1, -150000, -150000),
    ]),
    '2604EQ': ('2026-04-10', 0, [
        ('04-10', 'Extreme-2280T 2000mm ×2 (장비)', None, 2, 26000000, 52000000),
        ('04-10', 'Extreme-집진기 (장비출고·무상)', None, 2, 0, 0),
        ('04-10', 'Extreme-2280T 핸드미스트 (장비출고·무상)', None, 2, 0, 0),
        ('04-10', '(F1) I3200-A1 헤드 (2280T 장비 2대분·무상)', None, 8, 0, 0),
        ('04-10', '자유품목 (캐피탈 진행 — 아이비렌탈 52M 전환)', None, -1, 52000000, -52000000),
    ]),
}

PAY = [  # (일자, 금액, 수단, 비고)
    ('2026-01-30', 20000000, '계좌이체', '하나은행'),
    ('2026-02-12', 300000, '계좌이체', '하나은행'),
    ('2026-02-12', 8000000, '계좌이체', '하나은행(장비)'),
    ('2026-02-12', 6000000, '법인카드', '국민카드(장비)'),
    ('2026-02-12', 6000000, '법인카드', '하나카드(장비)'),
    ('2026-02-12', 5000000, '법인카드', '롯데카드(장비)'),
    ('2026-02-12', 8000000, '법인카드', '삼성카드(장비)'),
    ('2026-04-30', 10000000, '계좌이체', '하나은행'),
    ('2026-06-02', 10000000, '계좌이체', '하나은행'),
    ('2026-06-30', 10000000, '계좌이체', '하나은행'),
]

# ── 검산 ─────────────────────────────────────────────────────────────
OPENING = 74654600
for k, (d, tot, ls) in {**MAIN, **EQUIP}.items():
    s = sum(x[5] for x in ls)
    assert s == tot, f'{k} 라인합 {s:,} != {tot:,}'
    for _, nm, _, qty, pr, amt in ls:
        assert round(qty * pr) == amt, f'{k} {nm} {qty}×{pr}≠{amt}'
sup_total = sum(v[1] for v in MAIN.values()) + sum(v[1] for v in EQUIP.values())
fin_total = round(sup_total * 1.1)
assert fin_total == 80721300, f'발생 VAT포함 {fin_total:,} != 계산서합 80,721,300'
pay_total = sum(p[1] for p in PAY)
assert pay_total == 83300000
bank_total = sum(p[1] for p in PAY if p[2] == '계좌이체')
assert bank_total == 58300000, f'통장분 {bank_total:,} != 실측 58,300,000'
ap = OPENING + fin_total - pay_total
assert ap == 72075900, f'AP {ap:,}'
print(f'검산 OK: 발생 {fin_total:,}(계산서 일치) · 지급 {pay_total:,}(통장 {bank_total:,} 실측 일치) · 기대 AP {ap:,}')


def esc(s):
    return str(s or '').replace("'", "''")


sql = [f'-- {MARK} · 생성기 gen_km_ap.py (검산 assert 통과분)',
       f"-- 롤백: DELETE FROM purchase_payments WHERE notes LIKE '{MARK}%'; (라인→PO 순 동일 마커 삭제)", '',
       '-- ① 신규 품목 (잉크 22 + 부품 10)']
for code, name, spec, grp in NEW_ITEMS:
    unit = 'EA'
    sql.append(
        f"INSERT OR IGNORE INTO items (category_id, item_code, item_name, unit, category, item_type, is_purchase_item, is_sales_item, deduction_method, item_group, specification, is_active) "
        f"VALUES (5, '{code}', '{esc(name)}', '{unit}', '원자재', 'MATERIAL', 1, 0, 'NONE', '{esc(grp)}', '{esc(spec)}', 1);")

sql.append('\n-- ② 이월 PO')
sql.append(
    f"INSERT OR IGNORE INTO purchase_orders (po_number, supplier_id, status, order_date, total_amount, vat_amount, final_amount, notes, created_by, entity_id, created_at, updated_at) "
    f"SELECT 'E1-PO-KM-OPEN', c.id, 'RECEIVED', '2025-12-31', {OPENING}, 0, {OPENING}, '{MARK} · 2025년말 이월 채무(원장 확정)', {USR}, 1, '2025-12-31 09:00:00', '2025-12-31 09:00:00' FROM clients c WHERE c.client_code='{SUP_CODE}';")
sql.append(
    f"INSERT INTO purchase_order_items (po_id, item_id, item_name, quantity, unit, unit_price, amount, vat_included, sort_order, notes, line_status, received_quantity, accepted_quantity) "
    f"SELECT po.id, NULL, '2025년말 이월 채무', 1, '식', {OPENING}, {OPENING}, 1, 1, '{MARK}', 'RECEIVED', 1, 1 "
    f"FROM purchase_orders po WHERE po.po_number='E1-PO-KM-OPEN' AND NOT EXISTS (SELECT 1 FROM purchase_order_items x WHERE x.po_id=po.id AND x.sort_order=1);")

sql.append('\n-- ③ 월별 PO + 라인')
for key, (d, tot, ls) in {**MAIN, **EQUIP}.items():
    po = f'E1-PO-KM-{key}'
    vat = round(tot * 0.1)
    lbl = '장비 계정' if key.endswith('EQ') else '소모품 계정'
    sql.append(
        f"INSERT OR IGNORE INTO purchase_orders (po_number, supplier_id, status, order_date, total_amount, vat_amount, final_amount, notes, created_by, entity_id, created_at, updated_at) "
        f"SELECT '{po}', c.id, 'RECEIVED', '{d}', {tot}, {vat}, {tot + vat}, '{MARK} · {lbl} 원장', {USR}, 1, '{d} 09:00:00', '{d} 09:00:00' FROM clients c WHERE c.client_code='{SUP_CODE}';")
    for i, (day, nm, code, qty, pr, amt) in enumerate(ls, 101):
        item_sel = f"(SELECT id FROM items WHERE item_code='{code}')" if code else 'NULL'
        sql.append(
            f"INSERT INTO purchase_order_items (po_id, item_id, item_name, quantity, unit, unit_price, amount, vat_included, sort_order, notes, line_status, received_quantity, accepted_quantity) "
            f"SELECT po.id, {item_sel}, '{esc(nm)}', {qty}, 'EA', {pr}, {amt}, 0, {i}, '납품 2026-{day}(원장)', 'RECEIVED', {qty}, {qty} "
            f"FROM purchase_orders po WHERE po.po_number='{po}' AND NOT EXISTS (SELECT 1 FROM purchase_order_items x WHERE x.po_id=po.id AND x.sort_order={i});")

sql.append('\n-- ④ 지급 (통장 실측 + 법인카드)')
for i, (d, amt, method, who) in enumerate(PAY, 1):
    ref = f'ECNT-KM-{i:02d}'
    sql.append(
        f"INSERT INTO purchase_payments (supplier_id, payment_date, amount, payment_method, reference_number, notes, created_by, entity_id) "
        f"SELECT c.id, '{d}', {amt}, '{method}', '{ref}', '{MARK} · {esc(who)}', {USR}, 1 FROM clients c WHERE c.client_code='{SUP_CODE}' "
        f"AND NOT EXISTS (SELECT 1 FROM purchase_payments p WHERE p.reference_number='{ref}');")

with open(OUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(sql) + '\n')
print(f'SQL 저장: {OUT} · INSERT {len([x for x in sql if x.startswith("INSERT")])}문')
