# -*- coding: utf-8 -*-
"""서울경금속 월 전표 → 일자별 분할. 날짜 원천 = PDF 그래픽 레이어(병합 셀) 렌더 판독.

날짜 파이프라인(2026-08-01): find_tables 병합셀 geometry로 그룹 91개 검출 → 상반기 라인
464개가 속한 78그룹(g13~g90)의 텍스트 밴드 렌더 → Read 판독(GID_DATES). 교차검증 =
품명 백필 때 읽은 행 스트립의 날짜들과 일치(01-22 경관봉·06-12 보조시트·06-19 ONEWAY 등).
라인 매핑 = load/sk_datemap.json (month, idx→gid, 잔액 체인 로직 동일 재실행 산출).
게이트: ①gid 날짜의 월 = 라인 월 전량 ②월 공급·최종 재합산 불변 ③AP 93,717,824 불변.
사용: python gen_sk_daily_split.py <sk_pos.json> <sk_lines_prod.json>
"""
import sys, json, re
from collections import defaultdict

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
OUT = r'C:\Users\user\dongsan_mes\docs\dongsan-import\load\sk_daily_split_%d.sql'
MAP = r'C:\Users\user\dongsan_mes\docs\dongsan-import\load\sk_datemap.json'
MARK = '일별 분할 2026-08-01'
USR = 5
SUP = '134-81-34990'

GID_DATES = {
    13: '2026-01-12', 14: '2026-01-13', 15: '2026-01-13', 16: '2026-01-16', 17: '2026-01-19',
    18: '2026-01-22', 19: '2026-01-22', 20: '2026-01-27', 21: '2026-01-27', 22: '2026-01-28',
    23: '2026-02-02', 24: '2026-02-04', 25: '2026-02-09', 26: '2026-02-23', 27: '2026-02-23',
    28: '2026-02-24', 29: '2026-02-26', 30: '2026-03-03', 31: '2026-03-04', 32: '2026-03-04',
    33: '2026-03-09', 34: '2026-03-10', 35: '2026-03-16', 36: '2026-03-16', 37: '2026-03-17',
    38: '2026-03-19', 39: '2026-03-23', 40: '2026-03-23', 41: '2026-03-24', 42: '2026-03-30',
    43: '2026-03-30', 44: '2026-03-31', 45: '2026-04-06', 46: '2026-04-13', 47: '2026-04-13',
    48: '2026-04-15', 49: '2026-04-16', 50: '2026-04-17', 51: '2026-04-20', 52: '2026-04-22',
    53: '2026-04-24', 54: '2026-04-29', 55: '2026-05-07', 56: '2026-05-11', 57: '2026-05-12',
    58: '2026-05-13', 59: '2026-05-14', 60: '2026-05-15', 61: '2026-05-18', 62: '2026-05-18',
    63: '2026-05-22', 64: '2026-05-26', 65: '2026-05-27', 66: '2026-05-27', 67: '2026-05-29',
    68: '2026-06-01', 69: '2026-06-01', 70: '2026-06-02', 71: '2026-06-05', 72: '2026-06-05',
    73: '2026-06-08', 74: '2026-06-09', 75: '2026-06-10', 76: '2026-06-10', 77: '2026-06-11',
    78: '2026-06-12', 79: '2026-06-15', 80: '2026-06-15', 81: '2026-06-16', 82: '2026-06-17',
    83: '2026-06-18', 84: '2026-06-19', 85: '2026-06-22', 86: '2026-06-24', 87: '2026-06-25',
    88: '2026-06-25', 89: '2026-06-29', 90: '2026-06-29',
}


def load(f):
    raw = open(f, encoding='utf-8', errors='replace').read()
    return json.loads(raw[re.search(r'\[\s*\{', raw).start():])[0]['results']


pos = load(sys.argv[1])
plines = load(sys.argv[2])
dmap = json.load(open(MAP, encoding='utf-8'))['lines']

# (month, idx) → date + 게이트①
date_of = {}
for L in dmap:
    d = GID_DATES[L['gid']]
    assert d[:7] == L['month'], f"월 불일치: {L} → {d}"
    date_of[(L['month'], L['idx'])] = d
assert len(date_of) == 464

ln_by_po = defaultdict(list)
for l in plines:
    ln_by_po[l['po_number']].append(l)

targets = [p for p in pos if re.search(r'-26\d\d$', p['po_number'])]
assert len(targets) == 6, [p['po_number'] for p in pos]

daily = defaultdict(list)
month_po = {}
for p in targets:
    mon = f"2026-{p['po_number'][-2:]}"
    month_po[mon] = p
    ls = sorted(ln_by_po[p['po_number']], key=lambda x: x['sort_order'])
    assert sum(l['amount'] for l in ls) == p['total_amount'], p['po_number']
    for l in ls:
        d = date_of[(mon, l['sort_order'] - 101)]
        daily[d].append(l)

# 게이트② VAT 월 잔차 보정
po_rows = []
for mon, p in sorted(month_po.items()):
    keys = sorted(k for k in daily if k[:7] == mon)
    sups = {k: sum(round(l['amount']) for l in daily[k]) for k in keys}
    # 원 total 은 라운딩된 정수 합과 다를 수 있어 실수 합으로 재검
    sup_f = {k: sum(l['amount'] for l in daily[k]) for k in keys}
    assert round(sum(sup_f.values())) == p['total_amount']
    sups = {k: round(v) for k, v in sup_f.items()}
    delta_s = p['total_amount'] - sum(sups.values())
    kmax = max(keys, key=lambda k: abs(sups[k]))
    if delta_s:
        sups[kmax] += delta_s
    vats = {k: round(sups[k] * 0.1) for k in keys}
    delta_v = p['vat_amount'] - sum(vats.values())
    if delta_v:
        vats[kmax] += delta_v
    fin = sum(sups[k] + vats[k] for k in keys)
    assert fin == p['final_amount'], f'{mon} {fin:,} != {p["final_amount"]:,}'
    for k in keys:
        po_rows.append((k, sups[k], vats[k], sups[k] + vats[k]))

old_fin = sum(p['final_amount'] for p in targets)
assert old_fin == sum(r[3] for r in po_rows)
print(f'게이트 통과: 월 6 → 일 {len(po_rows)} 전표 · 라인 {sum(len(v) for v in daily.values())} · final 불변 {old_fin:,}')


def esc(s):
    return str(s or '').replace("'", "''")


sql_po, sql_ln = [], []
for d, sup_amt, vat, fin in sorted(po_rows):
    pn = f"E1-PO-SK-{d[2:4]}{d[5:7]}{d[8:10]}"
    src = month_po[d[:7]]
    sql_po.append(
        f"INSERT OR IGNORE INTO purchase_orders (po_number, supplier_id, status, order_date, total_amount, vat_amount, final_amount, notes, created_by, entity_id, created_at, updated_at) "
        f"SELECT '{pn}', c.id, 'RECEIVED', '{d}', {sup_amt}, {vat}, {fin}, '{esc(src['po_notes'])} · {MARK}(그래픽 날짜 판독)', {USR}, 1, '{d} 09:00:00', '{d} 09:00:00' FROM clients c WHERE c.client_code='{SUP}';")
    for i, l in enumerate(sorted(daily[d], key=lambda x: x['sort_order']), 101):
        item = str(l['item_id']) if l['item_id'] is not None else 'NULL'
        q = l['quantity']
        note = f'납품 {d}(명세)'
        sql_ln.append(
            f"INSERT INTO purchase_order_items (po_id, item_id, item_name, quantity, unit, unit_price, amount, vat_included, sort_order, notes, line_status, received_quantity, accepted_quantity) "
            f"SELECT po.id, {item}, '{esc(l['item_name'])}', {q}, '{esc(l['unit'])}', {l['unit_price']}, {round(l['amount'])}, {l['vat_included']}, {i}, '{note}', 'RECEIVED', {q}, {q} "
            f"FROM purchase_orders po WHERE po.po_number='{pn}' AND NOT EXISTS (SELECT 1 FROM purchase_order_items x WHERE x.po_id=po.id AND x.sort_order={i});")

old_list = ', '.join(f"'{p['po_number']}'" for p in targets)
sql_del = [
    f"DELETE FROM purchase_order_items WHERE po_id IN (SELECT id FROM purchase_orders WHERE po_number IN ({old_list}));",
    f"DELETE FROM purchase_orders WHERE po_number IN ({old_list});"]

hdr = f'-- 서울경금속 {MARK} · 생성기 gen_sk_daily_split.py\n'
parts = [sql_po + sql_ln[:250], sql_ln[250:], sql_del]
import os
for i, part in enumerate(parts, 1):
    with open(OUT % i, 'w', encoding='utf-8') as f:
        f.write(hdr + '\n'.join(part) + '\n')
    print(f'{OUT % i} · {os.path.getsize(OUT % i) // 1024}KB · {len(part)}문')
