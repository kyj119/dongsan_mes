# -*- coding: utf-8 -*-
"""동산기획 이카운트 기초채권 → MES 적재 SQL 생성기.

원천 = 동산_거래처별채권_2601-2606.xlsx (기초채권·재고매출·회계매출·수금합계·기타할인등차액·잔액).
구성 (deriveClientBalance = obg[BILLED] − payments − adjustments 에 맞춤):
  ① 기초채권(≠0, 선명 제외) → `E1-OPEN-{client_id}` 주문(2025-12-31·BILLED·vat 0·음수 그대로)
  ② 회계매출(≠0)            → `E1-ACCT-{client_id}` 주문(2026-06-30·BILLED·vat 0) — 선명 SMP-ACCT 전례
  ③ 기타할인등차액(≠0)       → adjustments (amount=차액 → AR 감소·음수는 증가)
제외 = 선명커뮤니케이션(ICM-AR-E1-* 이 정본 — 채권파일 기초 60.2M ≠ 선명장부 112.7M 양사 불일치 기록 그대로)
      · (주)동산기획 자기거래(기초 0이라 행 없음·검산에서만 제외)
검증 = 파일 자체 검산(기초+재고+회계−수금−차액=잔액) 전 행 0 이어야 SQL 생성.

사용: python gen_opening_sql.py <clients_ids.json>
"""
import openpyxl, json, sys, re, os, hashlib, csv
from collections import defaultdict

sys.stdout.reconfigure(encoding='utf-8')
ROOT = r'C:\Users\user\dongsan_mes'
SRC = os.path.join(ROOT, '품목마스터', '원천주문데이터')
OUT = os.path.join(ROOT, 'docs', 'dongsan-import', 'load')
sys.path.insert(0, os.path.join(ROOT, 'docs', 'dongsan-import'))
from normalize_client_code import normalize  # noqa

CLIENTS_JSON = sys.argv[1]
RRN = re.compile(r'^\d{6}-\d{7}$')
EXCL = {'342-86-03531'}                      # 선명 — ICM 정본
SELF = '314-81-84311'                        # 자기거래 — 검산 제외(기초 0)
MARKER_O = '동산 이카운트 이관 2026-07-30 기초채권'
MARKER_A = '동산 이카운트 이관 2026-07-30 회계매출'
MARKER_J = '동산 이카운트 이관 2026-07-30 차액'

_cl = json.load(open(CLIENTS_JSON, encoding='utf-8-sig'))[0]['results']
BY_CODE = {str(c['client_code']).strip(): c['id'] for c in _cl if c['client_code']}
BY_BRN = {str(c['brn']).strip(): c['id'] for c in _cl if c['brn']}
_reg = list(csv.DictReader(open(os.path.join(ROOT, 'docs', 'dongsan-import', '점검1b_미등록거래처_등록용.csv'),
                                encoding='utf-8-sig')))
BY_SRC = {r['이카운트코드']: r['client_code'] for r in _reg if not r['이카운트코드'].startswith('(')}
BY_HASH = {r['원본코드해시']: r['client_code'] for r in _reg if r['원본코드해시']}


def resolve(cc):
    if cc in BY_CODE:
        return BY_CODE[cc]
    if cc in BY_BRN:
        return BY_BRN[cc]
    ncc, _, _, _ = normalize(cc)
    if ncc and ncc in BY_CODE:
        return BY_CODE[ncc]
    if ncc and ncc in BY_BRN:
        return BY_BRN[ncc]
    if cc in BY_SRC:
        return BY_CODE.get(BY_SRC[cc])
    if RRN.match(cc):
        h = 'sha256:' + hashlib.sha256(re.sub(r'\D', '', cc).encode()).hexdigest()[:16]
        if h in BY_HASH:
            return BY_CODE.get(BY_HASH[h])
    return None


wb = openpyxl.load_workbook(os.path.join(SRC, '동산_거래처별채권_2601-2606.xlsx'), data_only=True)
ws = wb.worksheets[0]
rows = []
bad_ident, bad_int, no_client = [], [], []
for r in ws.iter_rows(min_row=3, max_col=8, values_only=True):
    code, name = str(r[0] or '').strip(), str(r[1] or '').strip()
    if not code or not name or ' 계' in code or '합계' in code:
        continue
    v = [x if isinstance(x, (int, float)) else 0 for x in r[2:8]]
    op, sales, acct, col, diff, bal = v
    if abs(op + sales + acct - col - diff - bal) > 0.01:            # 파일 자체 검산
        bad_ident.append((code, name, op + sales + acct - col - diff - bal))
    for x in (op, acct, diff):
        if abs(x - round(x)) > 1e-6:
            bad_int.append((code, name, x))
    cid = None if code in EXCL else resolve(code)
    if code not in EXCL and code != SELF and cid is None and (op or acct or diff):
        no_client.append((code, name, op, acct, diff))
    rows.append(dict(code=code, name=name, cid=cid, op=int(round(op)), sales=sales,
                     acct=int(round(acct)), col=col, diff=int(round(diff)), bal=bal))
wb.close()

print(f'채권파일 {len(rows)}행 · 검산 위반 {len(bad_ident)} · 비정수 {len(bad_int)} · 미해석 {len(no_client)}')
for x in (bad_ident + bad_int + no_client)[:8]:
    print('  ', x)
assert not bad_ident and not bad_int and not no_client, '사전 검증 실패 — SQL 미생성'

opening = [r for r in rows if r['op'] and r['code'] not in EXCL]
accts = [r for r in rows if r['acct'] and r['code'] not in EXCL]
diffs = [r for r in rows if r['diff'] and r['code'] not in EXCL]
print(f'기초 {len(opening)}곳 {sum(r["op"] for r in opening):,} (선명 제외 전 총 {sum(r["op"] for r in rows):,.0f})')
print(f'회계매출 {len(accts)}곳 {sum(r["acct"] for r in accts):,} · 차액 {len(diffs)}곳 {sum(r["diff"] for r in diffs):,}')


def q(s):
    return re.sub(r'[\x00-\x08\x0b-\x1f]', ' ', str(s or '').replace("'", "''"))


buf = []
for r in sorted(opening, key=lambda x: -abs(x['op'])):
    onum = f'E1-OPEN-{r["cid"]}'
    ts = '2025-12-31 09:00:00'
    notes = f'{MARKER_O} · 2025년말 이월 · 원본코드 {r["code"]}'
    buf.append(
        "INSERT INTO orders (order_number,client_id,entity_id,order_date,status,order_type,"
        "total_amount,vat_amount,final_amount,created_by,notes,billing_status,billed_amount,"
        "billed_by,billed_at,accounting_date,created_at,updated_at) VALUES "
        f"('{onum}',{r['cid']},1,'2025-12-31','SHIPPED','PRODUCTION',{r['op']},0,{r['op']},5,"
        f"'{q(notes)}','BILLED',{r['op']},5,'{ts}','2025-12-31','{ts}','{ts}');")
    buf.append(
        "INSERT INTO order_billing_groups (order_id,entity_id,billing_status,billed_amount,"
        "supply_amount,tax_amount,billed_at,billed_by,accounting_date,created_at) VALUES "
        f"((SELECT id FROM orders WHERE order_number='{onum}' AND entity_id=1),1,'BILLED',"
        f"{r['op']},{r['op']},0,'2025-12-31',5,'2025-12-31','{ts}');")
    buf.append(
        "INSERT INTO order_items (order_id,item_id,item_name,quantity,unit,unit_price,amount,"
        "vat_included,sort_order,created_at) VALUES "
        f"((SELECT id FROM orders WHERE order_number='{onum}' AND entity_id=1),NULL,"
        f"'기초채권 이월(2025년)',1,'EA',{r['op']},{r['op']},0,0,'{ts}');")

for r in accts:
    onum = f'E1-ACCT-{r["cid"]}'
    ts = '2026-06-30 09:00:00'
    notes = f'{MARKER_A} · 판매현황 외 회계 전표 매출 · 원본코드 {r["code"]}'
    buf.append(
        "INSERT INTO orders (order_number,client_id,entity_id,order_date,status,order_type,"
        "total_amount,vat_amount,final_amount,created_by,notes,billing_status,billed_amount,"
        "billed_by,billed_at,accounting_date,created_at,updated_at) VALUES "
        f"('{onum}',{r['cid']},1,'2026-06-30','SHIPPED','PRODUCTION',{r['acct']},0,{r['acct']},5,"
        f"'{q(notes)}','BILLED',{r['acct']},5,'{ts}','2026-06-30','{ts}','{ts}');")
    buf.append(
        "INSERT INTO order_billing_groups (order_id,entity_id,billing_status,billed_amount,"
        "supply_amount,tax_amount,billed_at,billed_by,accounting_date,created_at) VALUES "
        f"((SELECT id FROM orders WHERE order_number='{onum}' AND entity_id=1),1,'BILLED',"
        f"{r['acct']},{r['acct']},0,'2026-06-30',5,'2026-06-30','{ts}');")
    buf.append(
        "INSERT INTO order_items (order_id,item_id,item_name,quantity,unit,unit_price,amount,"
        "vat_included,sort_order,created_at) VALUES "
        f"((SELECT id FROM orders WHERE order_number='{onum}' AND entity_id=1),NULL,"
        f"'회계매출',1,'EA',{r['acct']},{r['acct']},0,0,'{ts}');")

for r in diffs:
    buf.append(
        "INSERT INTO adjustments (client_id,type,amount,reason,created_by,entity_id,created_at) VALUES "
        f"({r['cid']},'DISCOUNT',{r['diff']},'{q(MARKER_J + ' · 기타할인등차액(상반기) · 원본코드 ' + r['code'])}',"
        f"5,1,'2026-06-30 09:00:00');")

path = os.path.join(OUT, 'opening_p01.sql')
with open(path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(buf) + '\n')
with open(os.path.join(OUT, 'rollback_opening.sql'), 'w', encoding='utf-8') as f:
    f.write(f"""-- 기초채권·회계매출·차액 롤백 (마커 기준)
DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE entity_id=1 AND (notes LIKE '{MARKER_O}%' OR notes LIKE '{MARKER_A}%'));
DELETE FROM order_billing_groups WHERE order_id IN (SELECT id FROM orders WHERE entity_id=1 AND (notes LIKE '{MARKER_O}%' OR notes LIKE '{MARKER_A}%'));
DELETE FROM orders WHERE entity_id=1 AND (notes LIKE '{MARKER_O}%' OR notes LIKE '{MARKER_A}%');
DELETE FROM adjustments WHERE entity_id=1 AND reason LIKE '{MARKER_J}%';
""")
sz = os.path.getsize(path)
print(f'\nSQL {len(buf):,}문장 · {sz/1e6:.2f}MB → {path}')
assert sz < 800_000, '0.8MB 초과 — 분할 필요'

# 검산 기대값 덤프 (리허설 대조용)
exp = {r['cid']: r for r in rows if r['code'] not in EXCL and r['code'] != SELF and r['cid']}
with open(os.path.join(OUT, 'expected_balance.json'), 'w', encoding='utf-8') as f:
    json.dump({str(k): dict(code=v['code'], name=v['name'], bal=v['bal']) for k, v in exp.items()},
              f, ensure_ascii=False)
print(f'검산 기대값 {len(exp)}곳 → expected_balance.json')
