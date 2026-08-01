# -*- coding: utf-8 -*-
"""매입 이관 월 전표 → 일자별 전표 분할 (엘이디포유·정운교역·운산직물·케이엠테크).

원칙: prod 라인 스냅샷을 그대로 재편성(품목 연결·품명·수량 불변) — 재매핑 없음.
날짜 = 라인 비고 '납품 YYYY-MM-DD'. 유지 = *-OPEN·*-EXTRA·*-EQ(이미 실일자 이벤트 전표).
VAT = 일별 round(공급×0.1) 후 월 최대공급일에서 잔차 보정 → 월 최종액·AP 원단위 불변.
게이트: ①월 전표 라인합=total ②일별 재합산=월 공급·최종 ③공급사별 final 합 불변.
사용: python gen_daily_split.py <split_pos.json> <split_lines.json>
롤백: DELETE (notes '일별 분할 2026-08-01') 후 원 적재 SQL(멱등) 재실행.
"""
import sys, json, re
from collections import defaultdict

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
OUT = r'C:\Users\user\dongsan_mes\docs\dongsan-import\load\daily_split_%d.sql'
MARK = '일별 분할 2026-08-01'
USR = 5
SUP = {'E1-PO-LED': '402-81-69392', 'E1-PO-JW': '503-81-42473',
       'E1-PO-US': '514-32-63198', 'E1-PO-KM': '128-87-17213'}
KEEP = re.compile(r'-(OPEN|EXTRA|\d{4}EQ)$')
DPAT = re.compile(r'납품 (20\d\d-\d\d-\d\d)')


def load(f):
    raw = open(f, encoding='utf-8', errors='replace').read()
    return json.loads(raw[re.search(r'\[\s*\{', raw).start():])[0]['results']


pos = load(sys.argv[1])
lines = load(sys.argv[2])
ln_by_po = defaultdict(list)
for l in lines:
    ln_by_po[l['po_number']].append(l)

targets = [p for p in pos if not KEEP.search(p['po_number'])]
kept = [p for p in pos if KEEP.search(p['po_number'])]
assert len(targets) == 23, len(targets)

# ── 게이트① + 일자 그룹핑 ──
daily = defaultdict(list)   # (prefix, date) -> lines
month_of = {}               # (prefix, date) -> 원 월 PO
for p in targets:
    ls = ln_by_po[p['po_number']]
    s = sum(l['amount'] for l in ls)
    assert s == p['total_amount'], f"{p['po_number']} 라인합 {s:,} != {p['total_amount']:,}"
    pfx = p['po_number'].rsplit('-', 1)[0]
    mon = p['order_date'][:7]
    for l in ls:
        m = DPAT.search(l['notes'] or '')
        assert m, f"{p['po_number']} sort{l['sort_order']} 날짜 없음: {l['notes']!r}"
        d = m.group(1)
        assert d[:7] == mon, f"{p['po_number']} 월 불일치 라인 {d}"
        daily[(pfx, d)].append(l)
        month_of[(pfx, d)] = p

# ── VAT 배분 (월 잔차 보정) + 게이트② ──
po_rows = []   # (pfx, date, supply, vat, final)
for p in targets:
    pfx = p['po_number'].rsplit('-', 1)[0]
    mon = p['order_date'][:7]
    keys = sorted(k for k in daily if k[0] == pfx and k[1][:7] == mon)
    sups = {k: sum(l['amount'] for l in daily[k]) for k in keys}
    assert sum(sups.values()) == p['total_amount']
    vats = {k: round(s * 0.1) for k, s in sups.items()}
    delta = p['vat_amount'] - sum(vats.values())
    if delta:
        kmax = max(keys, key=lambda k: abs(sups[k]))
        vats[kmax] += delta
    fin = sum(sups[k] + vats[k] for k in keys)
    assert fin == p['final_amount'], f"{p['po_number']} 최종 재합산 {fin:,} != {p['final_amount']:,}"
    for k in keys:
        po_rows.append((pfx, k[1], sups[k], vats[k], sups[k] + vats[k]))

# ── 게이트③ 공급사별 final 불변 ──
for pfx in SUP:
    old = sum(p['final_amount'] for p in targets if p['po_number'].startswith(pfx + '-'))
    new = sum(r[4] for r in po_rows if r[0] == pfx)
    assert old == new, f'{pfx} final {old:,} != {new:,}'
print(f'게이트 통과: 월 전표 {len(targets)} → 일 전표 {len(po_rows)} · 라인 {sum(len(v) for v in daily.values())} · 공급사별 final 불변 4/4')


def esc(s):
    return str(s or '').replace("'", "''")


def po_num(pfx, d):
    return f"{pfx}-{d[2:4]}{d[5:7]}{d[8:10]}"


sql_po, sql_ln = [], []
for pfx, d, sup_amt, vat, fin in sorted(po_rows):
    pn = po_num(pfx, d)
    src = month_of[(pfx, d)]
    sql_po.append(
        f"INSERT OR IGNORE INTO purchase_orders (po_number, supplier_id, status, order_date, total_amount, vat_amount, final_amount, notes, created_by, entity_id, created_at, updated_at) "
        f"SELECT '{pn}', c.id, 'RECEIVED', '{d}', {sup_amt}, {vat}, {fin}, '{esc(src['po_notes'])} · {MARK}', {USR}, 1, '{d} 09:00:00', '{d} 09:00:00' FROM clients c WHERE c.client_code='{SUP[pfx]}';")
    for i, l in enumerate(sorted(daily[(pfx, d)], key=lambda x: x['sort_order']), 101):
        item = str(l['item_id']) if l['item_id'] is not None else 'NULL'
        q = l['quantity']
        sql_ln.append(
            f"INSERT INTO purchase_order_items (po_id, item_id, item_name, quantity, unit, unit_price, amount, vat_included, sort_order, notes, line_status, received_quantity, accepted_quantity) "
            f"SELECT po.id, {item}, '{esc(l['item_name'])}', {q}, '{esc(l['unit'])}', {l['unit_price']}, {l['amount']}, {l['vat_included']}, {i}, '{esc(l['notes'])}', 'RECEIVED', {q}, {q} "
            f"FROM purchase_orders po WHERE po.po_number='{pn}' AND NOT EXISTS (SELECT 1 FROM purchase_order_items x WHERE x.po_id=po.id AND x.sort_order={i});")

old_list = ', '.join(f"'{p['po_number']}'" for p in targets)
sql_del = [
    f"DELETE FROM purchase_order_items WHERE po_id IN (SELECT id FROM purchase_orders WHERE po_number IN ({old_list}));",
    f"DELETE FROM purchase_orders WHERE po_number IN ({old_list});",
    "SELECT c.client_code, COUNT(*) AS pos, SUM(po.final_amount) AS fin FROM purchase_orders po JOIN clients c ON c.id=po.supplier_id WHERE po.entity_id=1 AND c.client_code IN ('402-81-69392','514-32-63198','128-87-17213','503-81-42473') AND po.po_number LIKE 'E1-PO-%' GROUP BY c.client_code;"]

hdr = f'-- {MARK} · 생성기 gen_daily_split.py (게이트 3종 통과분)\n'
parts = [sql_po + [x for x in sql_ln if 'E1-PO-LED' in x],
         [x for x in sql_ln if 'E1-PO-LED' not in x],
         sql_del]
import os
for i, part in enumerate(parts, 1):
    with open(OUT % i, 'w', encoding='utf-8') as f:
        f.write(hdr + '\n'.join(part) + '\n')
    print(f'{OUT % i} · {os.path.getsize(OUT % i) // 1024}KB · {len(part)}문')
