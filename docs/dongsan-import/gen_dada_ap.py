# -*- coding: utf-8 -*-
"""다다모아(576-16-00662) 매입 원장 이관 SQL — 이카운트 거래처관리대장 2통 기반.

원천: Z:\\Designs\\123\\다다모아\\ 다다모아_거래처관리대장_20260528(3/1~5/28)·20260730(6/1~7/30).
구조: OPEN 198,000(1~2월 발생 — 2/26 대장 만료로 상세 미상·3/1 이월 실측)
     + 일별 PO 5건(원장 품목 라인 그대로·대장 금액=VAT포함 실증: 20×12,000→264,000)
     + 지급 2건 = 3/5 수금 198,000 + ★3/24 상계 8,800,000(AR측 이관 수금
       '채권채무상계처리' 8.8M과 1:1 대응 — 겹업 상계 양변 대칭).
기대 AP(6/30) = 22,596,200 − 8,998,000 = 13,598,200 (5/28 대장 기말 = 7/30 대장 이월 실측 일치).
7월 발생 1,056,000은 하반기 증분 트랙(기준일 6/30 통일 — 기존 5곳과 동일).
검산: 발생 합 = 명단 계산서합 22,596,200 정합 · 잉크 품목(XP1000·ST1000N) 미등록 → 품명 보존."""
import sys

sys.stdout.reconfigure(encoding='utf-8')
OUT = r'C:\Users\user\dongsan_mes\docs\dongsan-import\load\dada_ap.sql'
SUP = '576-16-00662'
USR = 5
MARK = '다다모아 매입 이관 2026-08-02'

# (po_suffix, date, [(품명, qty, 단가, 공급가)], 비고)
POS = [
    ('OPEN', '2026-02-28', [('1~2월 발생분(대장 만료로 상세 미상 — 3/1 이월 198,000 실측)', 1, 180000, 180000)],
     '1~2월 발생(이월)'),
    ('0324', '2026-03-24', [('CF2000 [발색기 2000폭]', 1, 8000000, 8000000)], '3/24 발색기(원장)'),
    ('0330', '2026-03-30', [('수성안료잉크 XP1000 K (B) [수성잉크, 1kg (병)]', 20, 7000, 140000),
                            ('수성안료잉크 XP1000 M (B) [수성잉크, 1kg (병)]', 30, 7000, 210000),
                            ('수성안료잉크 XP1000 1.5L C [C 블루]', 16, 11000, 176000),
                            ('수성안료잉크 XP1000 1.5L Y', 16, 11000, 176000)], '3/30 잉크(원장)'),
    ('0406', '2026-04-06', [('ST1000N [C]', 10, 12000, 120000), ('ST1000N [M]', 10, 12000, 120000),
                            ('ST1000N [Y]', 10, 12000, 120000), ('ST1000N [K]', 10, 12000, 120000)], '4/6 잉크(원장)'),
    ('0421', '2026-04-21', [('수성안료잉크 XP1000 1.5L C [C 블루]', 300, 11000, 3300000),
                            ('수성안료잉크 XP1000 1.5L M', 300, 11000, 3300000),
                            ('수성안료잉크 XP1000 1.5L Y', 240, 11000, 2640000),
                            ('수성안료잉크 XP1000 1.5L K', 100, 11000, 1100000)], '4/21 잉크(원장)'),
    ('0511', '2026-05-11', [('ST1000N [C]', 20, 12000, 240000), ('ST1000N [M]', 20, 12000, 240000),
                            ('ST1000N [Y]', 20, 12000, 240000), ('ST1000N [K]', 10, 12000, 120000)], '5/11 잉크(원장)'),
]
PAY = [('2026-03-05', 198000, '기타', '대장 수금 3/5 — 통장 미확인(현금성)'),
       ('2026-03-24', 8800000, '상계', '외상매출금 상계 — AR측 이관 수금 3/24 채권채무상계처리 8.8M과 1:1 대응')]

fin_sum = 0
for _, _, lines, _ in POS:
    sup = sum(x[3] for x in lines)
    for nm, q, pr, amt in lines:
        assert q * pr == amt, f'{nm} {q}×{pr}≠{amt}'
    fin_sum += sup + round(sup * 0.1)
pay_sum = sum(p[1] for p in PAY)
ap = fin_sum - pay_sum
assert fin_sum == 22596200, f'발생 {fin_sum:,}'
assert ap == 13598200, f'AP {ap:,}'
print(f'검산 OK: 발생 {fin_sum:,}(=명단 계산서합) · 지급 {pay_sum:,} · 기대 AP {ap:,}')

sql = [f'-- {MARK} · 생성기 gen_dada_ap.py (이카운트 대장 2통·잔액 체인 원단위 검증분)',
       f"-- 롤백: DELETE FROM purchase_payments WHERE notes LIKE '{MARK}%'; 라인→PO 순 동일 마커", '']
for sfx, d, lines, memo in POS:
    po = f'E1-PO-DADA-{sfx}'
    sup = sum(x[3] for x in lines)
    vat = round(sup * 0.1)
    sql.append(
        f"INSERT OR IGNORE INTO purchase_orders (po_number, supplier_id, status, order_date, total_amount, vat_amount, final_amount, notes, created_by, entity_id, created_at, updated_at) "
        f"SELECT '{po}', c.id, 'RECEIVED', '{d}', {sup}, {vat}, {sup + vat}, '{MARK} · {memo}', {USR}, 1, '{d} 09:00:00', '{d} 09:00:00' FROM clients c WHERE c.client_code='{SUP}';")
    for i, (nm, q, pr, amt) in enumerate(lines, 1):
        nm_esc = nm.replace("'", "''")
        sql.append(
            f"INSERT INTO purchase_order_items (po_id, item_id, item_name, quantity, unit, unit_price, amount, vat_included, sort_order, notes, line_status, received_quantity, accepted_quantity) "
            f"SELECT po.id, NULL, '{nm_esc}', {q}, 'EA', {pr}, {amt}, 0, {i}, '납품 {d}(대장)', 'RECEIVED', {q}, {q} "
            f"FROM purchase_orders po WHERE po.po_number='{po}' AND NOT EXISTS (SELECT 1 FROM purchase_order_items x WHERE x.po_id=po.id AND x.sort_order={i});")
for i, (d, amt, method, memo) in enumerate(PAY, 1):
    ref = f'ECNT-DADA-{i:02d}'
    sql.append(
        f"INSERT INTO purchase_payments (supplier_id, payment_date, amount, payment_method, reference_number, notes, created_by, entity_id) "
        f"SELECT c.id, '{d}', {amt}, '{method}', '{ref}', '{MARK} · {memo}', {USR}, 1 FROM clients c WHERE c.client_code='{SUP}' "
        f"AND NOT EXISTS (SELECT 1 FROM purchase_payments p WHERE p.reference_number='{ref}');")

sql.append('')
sql.append(f"SELECT (SELECT COALESCE(SUM(final_amount),0) FROM purchase_orders po JOIN clients c ON c.id=po.supplier_id WHERE c.client_code='{SUP}' AND po.entity_id=1 AND po.status NOT IN ('DRAFT','CANCELLED')) - (SELECT COALESCE(SUM(amount),0) FROM purchase_payments pp JOIN clients c ON c.id=pp.supplier_id WHERE c.client_code='{SUP}' AND pp.entity_id=1) AS ap_expect_13598200;")

with open(OUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(sql) + '\n')
import os
print(f'SQL {OUT} · {os.path.getsize(OUT)//1024}KB · INSERT {len([x for x in sql if x.startswith("INSERT")])}문')
