# -*- coding: utf-8 -*-
"""서울경금속(92)·운산직물(1733) 매입 원장 이관 SQL 생성.
원천 = Z:\\Designs\\123 명세 실측(서울경금속 미수채권상세현황 25.12~26.06 / 운산직물 거래처원장 25.05~26.06.02)
     + 통장 출금 실측(거래처코드 기준). 발생 = 명세 월별(발생주의) · 지급 = 통장 정본.
라인은 월 합계 1줄(다품목 수백 라인 — 상세 증빙은 명세 PDF, 품목 소급은 필요 시 별도).
기대 AP: 서울경금속 41,725,657+146,554,122−94,562,455=93,717,324 (발생=공급가+VAT 기준 — 세금계산서 수집합과 원단위 일치.
        6월 명세 '금액' 컬럼 합은 2,000 작은 내부 불일치 존재 → 계산서 기준 채택. 명세 최종잔액 93,717,824와 500원 차)
        운산직물   29,243,844+113,054,568−125,090,199=17,208,213 (원장 6/2 잔액−이후지급과 일치)
멱등: PO=OR IGNORE · 라인=NOT EXISTS(sort_order) · 지급=NOT EXISTS(reference)
"""
import sys

sys.stdout.reconfigure(encoding='utf-8')
OUT = r'C:\Users\user\dongsan_mes\docs\dongsan-import\load\sk_us_ap.sql'
USR = 5

SUPPLIERS = {
    'SK': dict(cid=92, name='서울경금속', mark='서울경금속 매입 이관 2026-07-31',
               opening=41725657, expect_ap=93717324,
               months=[  # (yymm, 월말일, 공급가, VAT)
                   ('2601', '2026-01-31', 16725000, 1672500),
                   ('2602', '2026-02-28', 13126180, 1312618),
                   ('2603', '2026-03-31', 28447380, 2844738),
                   ('2604', '2026-04-30', 21423980, 2142398),
                   ('2605', '2026-05-31', 10509900, 1050990),
                   ('2606', '2026-06-30', 42998580, 4299858),
               ],
               total_check=146554122,
               pays=[('2026-01-30', 13924273), ('2026-03-03', 10000000), ('2026-03-31', 36199384),
                     ('2026-04-30', 14438798), ('2026-06-02', 20000000)],
               pay_check=94562455,
               month_note='월분 명세(미수채권상세현황)'),
    'US': dict(cid=1733, name='운산직물', mark='운산직물 매입 이관 2026-07-31',
               opening=29243844, expect_ap=17208213,
               months=[
                   ('2601', '2026-01-31', 13889850, 1388985),
                   ('2602', '2026-02-28', 15380130, 1538013),
                   ('2603', '2026-03-31', 14616730, 1461673),
                   ('2604', '2026-04-30', 19907510, 1990751),
                   ('2605', '2026-05-31', 23338830, 2333883),
                   ('2606', '2026-06-30', 15643830, 1564383),
               ],
               total_check=113054568,
               pays=[('2026-01-26', 6628218), ('2026-02-27', 7952989), ('2026-03-31', 29941472),
                     ('2026-04-30', 16918143), ('2026-06-02', 30000000), ('2026-06-02', 7976664),
                     ('2026-06-30', 25672713)],
               pay_check=125090199,
               month_note='월분 원장(거래처원장 · 6월분은 6/2까지 반영)'),
}

sql = ['-- 서울경금속·운산직물 매입 원장 이관 · 생성기 gen_sk_us_ap.py (assert 통과분)',
       "-- 롤백: DELETE FROM purchase_payments WHERE notes LIKE '서울경금속 매입 이관%' OR notes LIKE '운산직물 매입 이관%';",
       "--       (purchase_order_items → purchase_orders 순서로 notes LIKE 동일 마커 삭제)", '']

for key, s in SUPPLIERS.items():
    tot = sum(m[2] + m[3] for m in s['months'])
    assert tot == s['total_check'], f"{key} 발생합 {tot:,} != {s['total_check']:,}"
    pay = sum(p[1] for p in s['pays'])
    assert pay == s['pay_check'], f"{key} 지급합 {pay:,}"
    assert s['opening'] + tot - pay == s['expect_ap'], f"{key} AP 검산 실패"
    print(f"{s['name']}: 발생 {tot:,} · 지급 {pay:,} · 기대 AP {s['expect_ap']:,} — 검증 OK")

    cid, mark = s['cid'], s['mark']
    sql.append(f"-- ═══ {s['name']} (client {cid}) ═══")
    sql.append(
        f"INSERT OR IGNORE INTO purchase_orders (po_number, supplier_id, status, order_date, total_amount, vat_amount, final_amount, notes, created_by, entity_id, created_at, updated_at) "
        f"VALUES ('E1-PO-{key}-OPEN', {cid}, 'RECEIVED', '2025-12-31', {s['opening']}, 0, {s['opening']}, '{mark} · 2025년말 이월 채무(명세 확정)', {USR}, 1, '2025-12-31 09:00:00', '2025-12-31 09:00:00');")
    sql.append(
        f"INSERT INTO purchase_order_items (po_id, item_id, item_name, quantity, unit, unit_price, amount, vat_included, sort_order, notes, line_status, received_quantity, accepted_quantity) "
        f"SELECT po.id, NULL, '2025년말 이월 채무', 1, '식', {s['opening']}, {s['opening']}, 1, 1, '{mark}', 'RECEIVED', 1, 1 "
        f"FROM purchase_orders po WHERE po.po_number='E1-PO-{key}-OPEN' AND NOT EXISTS (SELECT 1 FROM purchase_order_items x WHERE x.po_id=po.id AND x.sort_order=1);")
    for yymm, d, sup_amt, vat in s['months']:
        fin = sup_amt + vat
        po = f'E1-PO-{key}-{yymm}'
        mm = int(yymm[2:])
        sql.append(
            f"INSERT OR IGNORE INTO purchase_orders (po_number, supplier_id, status, order_date, total_amount, vat_amount, final_amount, notes, created_by, entity_id, created_at, updated_at) "
            f"VALUES ('{po}', {cid}, 'RECEIVED', '{d}', {sup_amt}, {vat}, {fin}, '{mark} · {mm}{s['month_note']}', {USR}, 1, '{d} 09:00:00', '{d} 09:00:00');")
        sql.append(
            f"INSERT INTO purchase_order_items (po_id, item_id, item_name, quantity, unit, unit_price, amount, vat_included, sort_order, notes, line_status, received_quantity, accepted_quantity) "
            f"SELECT po.id, NULL, '{mm}월 매입 합계(상세=명세 PDF Z:\\Designs\\123)', 1, '식', {sup_amt}, {sup_amt}, 0, 1, '{mark}', 'RECEIVED', 1, 1 "
            f"FROM purchase_orders po WHERE po.po_number='{po}' AND NOT EXISTS (SELECT 1 FROM purchase_order_items x WHERE x.po_id=po.id AND x.sort_order=1);")
    for i, (d, amt) in enumerate(s['pays'], 1):
        ref = f'ECNT-{key}-{i:02d}'
        sql.append(
            f"INSERT INTO purchase_payments (supplier_id, payment_date, amount, payment_method, reference_number, notes, created_by, entity_id) "
            f"SELECT {cid}, '{d}', {amt}, '계좌이체', '{ref}', '{mark} · 통장 출금 실측', {USR}, 1 "
            f"WHERE NOT EXISTS (SELECT 1 FROM purchase_payments WHERE reference_number='{ref}' AND supplier_id={cid});")
    sql.append('')

with open(OUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(sql) + '\n')
print(f'SQL 저장: {OUT} · INSERT {len([x for x in sql if x.startswith("INSERT")])}문')
