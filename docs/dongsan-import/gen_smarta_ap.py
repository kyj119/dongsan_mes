# -*- coding: utf-8 -*-
"""SmartA(WEHAGO 세무 기장 정본) 전표 기반 매입 이관 — 품목 명확 7곳.

원천: load/smarta_ap_detail.json (거래처원장 내용 탭 전표) · 잔액 대조 = smarta_ap_20260630.json
기준일: 2026-06-30 (기존 6곳과 통일 — 7월 이후 행은 하반기 증분 트랙으로 제외)

구조: 전기이월 → E1-PO-<KEY>-OPEN (order_date 2025-12-31, VAT 없음 — LED4U 관례)
     일자별 대변(매입) → E1-PO-<KEY>-MMDD  (SmartA 대변 = VAT 포함 총액 → 공급가 = /1.1 역산)
     차변(지급/상계/어음) → purchase_payments

품목 연결: 전표 적요가 MES 품목을 단일 특정할 때만 item_id 부여.
  폭·규격·브랜드·호수가 특정 안 되는 것(현수막소재·실사원단·아일렛 호수 미상 등)은
  item_id NULL + 품명 보존 — 오연결보다 미연결이 낫다.

제외: 삼영섬유(기중 거래 0·이월 단수 23,701만) · 사인앤그래픽·와우프레스(미지급금 253·전표 미수집)
"""
import json, os, re, sys

sys.stdout.reconfigure(encoding='utf-8')
BASE = r'C:\Users\user\dongsan_mes\docs\dongsan-import'
OUT = os.path.join(BASE, 'load', 'smarta_ap.sql')
USR = 5
MARK = 'SmartA 매입 이관 2026-08-04'
CUTOFF_M = 6  # 6/30 기준

# 거래처: key -> (client_code, PO 접두, MES clients.id 존재여부)
SUPPLIERS = {
    '티피엠':        ('503-81-59256', 'TPM'),
    '텍스젯':        ('128-81-86697', 'TXJ'),
    '리치코엘':      ('234-81-04646', 'RCH'),
    '에코컴퍼니':    ('509-07-91273', 'ECO'),
    '재현테크':      ('113-81-80804', 'JHT'),
    '유진프라스틱':  ('207-65-61359', 'YJP'),   # ★MES 미등록 → clients INSERT 선행
    '대승엔지니어링': ('557-04-01269', 'DSE'),
}
NEW_CLIENT = {
    '유진프라스틱': ("207-65-61359", "유진프라스틱", "PURCHASE"),
}

# 품목 연결 — 적요가 MES 품목을 단일 특정하는 경우만. (정규식, item_code, 사유)
ITEM_MAP = [
    (r'^R50 UV INK\s*-\s*C',      'RM-I0040', 'R50 UV 잉크-C 정확 일치'),
    (r'^Flatbed UV Ink\s*-\s*C',  'RM-I0045', 'Flatbed=평판잉크 C'),
    (r'^회전고리',                 'ACC-014',  '가로등배너 회전고리'),
    (r'^수기대$',                  'ACC-036',  '수기대(깃대) — 길이 미표기라 대표 품목'),
]
# 연결하지 않는 사유 기록용(문서화)
UNMAPPED_REASON = {
    '현수막소재': '폭 미상 — AQ1/AQ2 × 폭 수십 종',
    '수성잉크(C)-20L': '브랜드 미상 — 잉크테크/코스테크 구분 불가',
    'OPTIMUM-EP3208': '설비(고정자산) — items 대상 아님',
    '실사원단': '규격 미상',
    '아일렛(골드)': '호수 미상 — 5/9/24호 금 중 특정 불가',
    'TMS-AHRD INK-M': 'MES 미등록 잉크',
}


def supply(total_incl):
    """SmartA 대변(VAT 포함) → 공급가 역산. 1.1 로 정확히 나뉘지 않으면 예외."""
    if total_incl % 11 != 0:
        raise ValueError(f'VAT 역산 실패: {total_incl:,}')
    return total_incl // 11 * 10


def parse_qty(memo, sup):
    """적요의 '단가 X 수량' 이 공급가와 정확히 맞을 때만 수량·단가 사용."""
    m = re.search(r'([\d,]+)\s*[Xx]\s*([\d,]+)\s*$', memo)
    if m:
        a, b = int(m.group(1).replace(',', '')), int(m.group(2).replace(',', ''))
        for price, qty in ((a, b), (b, a)):
            if price * qty == sup and qty > 0:
                return qty, price
    return 1, sup


def item_code_for(memo):
    for pat, code, _ in ITEM_MAP:
        if re.search(pat, memo):
            return code
    return None


PM = [('상계', '상계'), ('어음', '어음'), ('선급금대체', '기타')]


def pay_method(memo):
    for kw, v in PM:
        if kw in memo:
            return v
    return '계좌이체'


det = json.load(open(os.path.join(BASE, 'load', 'smarta_ap_detail.json'), encoding='utf-8'))
bal = {r[1]: r for r in json.load(
    open(os.path.join(BASE, 'load', 'smarta_ap_20260630.json'), encoding='utf-8'))['rows']}
BALNAME = {'티피엠': '(주)티피엠', '텍스젯': '(주)텍스젯', '리치코엘': '주식회사 리치코엘',
           '에코컴퍼니': '에코컴퍼니', '재현테크': '(주)재현테크', '유진프라스틱': '유진프라스틱',
           '대승엔지니어링': '대승 엔지니어링'}

sql = [f'-- {MARK} · 생성기 gen_smarta_ap.py',
       '-- 원천 = WEHAGO SmartA 거래처원장(외상매입금 251) 전표 상세 · 기준일 2026-06-30',
       f"-- 롤백: DELETE FROM purchase_payments WHERE notes LIKE '{MARK}%'; 라인→PO 순 동일 마커", '']

for code, name, ctype in NEW_CLIENT.values():
    sql.append(
        f"INSERT INTO clients (client_code, client_name, client_type, is_active, created_at, updated_at) "
        f"SELECT '{code}', '{name}', '{ctype}', 1, '2026-08-04 09:00:00', '2026-08-04 09:00:00' "
        f"WHERE NOT EXISTS (SELECT 1 FROM clients c WHERE c.client_code='{code}');")
sql.append('')

summary, mapped_n, unmapped_n = [], 0, 0
for key, (sup_code, pfx) in SUPPLIERS.items():
    d = det[key]
    rows = [r for r in d['rows'] if int(r[0].split('-')[0]) <= CUTOFF_M]
    opening = d['전기이월']
    exp = d['기대잔액_0630']

    # 검산: 전표 재구성 == 잔액표
    calc = opening + sum(r[3] for r in rows) - sum(r[2] for r in rows)
    assert calc == exp == bal[BALNAME[key]][5], f'{key} 검산 실패 {calc:,} vs {exp:,}'

    sql.append(f'-- ===== {key} ({sup_code}) 이월 {opening:,} · 6/30 잔액 {exp:,} =====')
    if opening:
        po = f'E1-PO-{pfx}-OPEN'
        sql.append(
            f"INSERT OR IGNORE INTO purchase_orders (po_number, supplier_id, status, order_date, total_amount, vat_amount, final_amount, notes, created_by, entity_id, created_at, updated_at) "
            f"SELECT '{po}', c.id, 'RECEIVED', '2025-12-31', {opening}, 0, {opening}, '{MARK} · 2025년말 이월 채무(SmartA 전기이월)', {USR}, 1, '2025-12-31 09:00:00', '2025-12-31 09:00:00' FROM clients c WHERE c.client_code='{sup_code}';")
        sql.append(
            f"INSERT INTO purchase_order_items (po_id, item_id, item_name, quantity, unit, unit_price, amount, vat_included, sort_order, notes, line_status, received_quantity, accepted_quantity) "
            f"SELECT po.id, NULL, '2025년말 이월 채무', 1, '식', {opening}, {opening}, 1, 1, '{MARK}', 'RECEIVED', 1, 1 "
            f"FROM purchase_orders po WHERE po.po_number='{po}' AND NOT EXISTS (SELECT 1 FROM purchase_order_items x WHERE x.po_id=po.id AND x.sort_order=1);")

    # 매입(대변) 일자별 묶기
    buys, pays = {}, []
    for md, memo, cha, dae in rows:
        if dae:
            buys.setdefault(md, []).append((memo, dae))
        if cha:
            pays.append((md, memo, cha))

    for md, lines in sorted(buys.items()):
        net = sum(x[1] for x in lines)
        if net == 0:      # 수정분개 쌍이 상쇄된 날 → PO 생성 불필요
            continue
        po = f'E1-PO-{pfx}-{md.replace("-", "")}'
        date = f'2026-{md}'
        tot = supply(net) if net > 0 else -supply(-net)
        vat = net - tot
        sql.append(
            f"INSERT OR IGNORE INTO purchase_orders (po_number, supplier_id, status, order_date, total_amount, vat_amount, final_amount, notes, created_by, entity_id, created_at, updated_at) "
            f"SELECT '{po}', c.id, 'RECEIVED', '{date}', {tot}, {vat}, {net}, '{MARK} · {md} 매입(SmartA 전표)', {USR}, 1, '{date} 09:00:00', '{date} 09:00:00' FROM clients c WHERE c.client_code='{sup_code}';")
        for i, (memo, incl) in enumerate(lines, 1):
            s = supply(incl) if incl > 0 else -supply(-incl)
            qty, price = parse_qty(memo, s) if s > 0 else (1, s)
            ic = item_code_for(memo)
            if ic:
                mapped_n += 1
            else:
                unmapped_n += 1
            item_expr = f"(SELECT it.id FROM items it WHERE it.item_code='{ic}')" if ic else 'NULL'
            nm = memo.replace("'", "''")
            sql.append(
                f"INSERT INTO purchase_order_items (po_id, item_id, item_name, quantity, unit, unit_price, amount, vat_included, sort_order, notes, line_status, received_quantity, accepted_quantity) "
                f"SELECT po.id, {item_expr}, '{nm}', {qty}, 'EA', {price}, {s}, 0, {i}, '납품 {date}(SmartA 전표)', 'RECEIVED', {qty}, {qty} "
                f"FROM purchase_orders po WHERE po.po_number='{po}' AND NOT EXISTS (SELECT 1 FROM purchase_order_items x WHERE x.po_id=po.id AND x.sort_order={i});")

    for i, (md, memo, amt) in enumerate(pays, 1):
        ref = f'SMTA-{pfx}-{i:02d}'
        nm = memo.replace("'", "''")
        sql.append(
            f"INSERT INTO purchase_payments (supplier_id, payment_date, amount, payment_method, reference_number, notes, created_by, entity_id) "
            f"SELECT c.id, '2026-{md}', {amt}, '{pay_method(memo)}', '{ref}', '{MARK} · {nm}', {USR}, 1 FROM clients c WHERE c.client_code='{sup_code}' "
            f"AND NOT EXISTS (SELECT 1 FROM purchase_payments p WHERE p.reference_number='{ref}');")
    sql.append('')
    summary.append((key, opening, sum(r[3] for r in rows), sum(r[2] for r in rows), exp,
                    len([1 for v in buys.values() if sum(x[1] for x in v)]), len(pays)))

sql.append('-- 검증: 거래처별 파생 AP')
for key, (sup_code, _) in SUPPLIERS.items():
    sql.append(
        f"SELECT '{key}' AS supplier, (SELECT COALESCE(SUM(final_amount),0) FROM purchase_orders po JOIN clients c ON c.id=po.supplier_id WHERE c.client_code='{sup_code}' AND po.entity_id=1 AND po.status NOT IN ('DRAFT','CANCELLED')) - (SELECT COALESCE(SUM(amount),0) FROM purchase_payments pp JOIN clients c ON c.id=pp.supplier_id WHERE c.client_code='{sup_code}' AND pp.entity_id=1) AS ap;")

with open(OUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(sql) + '\n')

print(f"{'거래처':<14}{'이월':>13}{'매입':>13}{'지급':>13}{'AP(6/30)':>13}  PO 지급")
tot_ap = 0
for k, o, d_, c_, e, npo, npay in summary:
    tot_ap += e
    print(f'{k:<14}{o:>13,}{d_:>13,}{c_:>13,}{e:>13,}  {npo:>2} {npay:>3}')
print(f"{'합계':<14}{'':>13}{'':>13}{'':>13}{tot_ap:>13,}")
print(f'\n품목 연결 {mapped_n}행 · 품명보존 {unmapped_n}행')
print(f'SQL {OUT} · {os.path.getsize(OUT)//1024}KB · INSERT {len([x for x in sql if x.startswith("INSERT")])}문')
