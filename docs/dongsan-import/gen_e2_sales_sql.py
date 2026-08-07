# -*- coding: utf-8 -*-
"""선명(entity 2) 2026-07 판매 적재 SQL 생성기 (2026-08-07).

동산 생성기(`gen_sales_sql.py`)를 파라미터화하지 않고 **따로 썼다.** 그쪽은 A1/A2 라인분해·
태극기 호수 추론 같은 동산 전용 로직이 절반이라, 선명(원자재 유통)에는 안 맞고 위험만 는다.
공유하는 건 **적재 형태**(orders + order_billing_groups + order_items)뿐이다.

★ entity 배정 = **담당자**(용준님 2026-08-07)
    최인호 → 3(청주) · 그 외 → 2(선명)
  거래처 화이트리스트(`14_cheongju_move.sql`)를 쓰지 않는다 — 재현시스템처럼 **같은 거래처인데
  담당자에 따라 법인이 갈리는** 경우를 화이트리스트가 못 가른다(그래서 6건이 잘못 갔었다).

★ 마커 = 법인·월별로 분리한다. 롤백이 `notes LIKE '{MARKER}%'` 라
  같은 마커를 쓰면 **기존 적재분까지 지운다**(동산에서 상반기 7,642건이 날아갈 뻔했다).

품목은 `e2_item_map.json`(품목명|규격 → item_id) 을 쓰고 **미매칭은 item_id NULL** 로 넣는다.
매출액·거래처·전표는 정확하고 원가 분석에서만 빠진다.

사용: python docs/dongsan-import/gen_e2_sales_sql.py <clients.json> <items.json> <map.json> <sales.xlsx>
산출: load/sales_2607_e2.sql · load/rollback_sales_2607_e2.sql
"""
import openpyxl, json, sys, re, os, warnings
from collections import defaultdict, Counter
warnings.filterwarnings('ignore')
sys.stdout.reconfigure(encoding='utf-8')

CLIENTS_JSON, ITEMS_JSON, MAP_JSON, XLSX = sys.argv[1:5]
OUT = os.path.join(r'C:\Users\user\dongsan_mes', 'docs', 'dongsan-import', 'load')
MARKER = '선명 이관 2026-07'
CJ_REP = '최인호'          # 이 담당의 전표는 청주(entity 3)
LINE = re.compile(r'^(\d{4})/(\d\d)/(\d\d)\s+-(\d+)$')

sys.path.insert(0, os.path.join(r'C:\Users\user\dongsan_mes', 'docs', 'dongsan-import'))
from normalize_client_code import normalize  # noqa

cl = json.load(open(CLIENTS_JSON, encoding='utf-8'))
BY_CODE = {str(c['client_code']).strip(): c['id'] for c in cl if c['client_code']}
BY_BRN = {str(c['brn']).strip(): c['id'] for c in cl if c['brn']}
items = {i['id']: i for i in json.load(open(ITEMS_JSON, encoding='utf-8'))}
IMAP = json.load(open(MAP_JSON, encoding='utf-8'))


def q(s):
    return str(s or '').replace("'", "''")


def num(v):
    if v is None or str(v).strip() == '':
        return 0
    try:
        return float(v)
    except ValueError:
        return 0


def sqlnum(v):
    return str(int(v)) if float(v) == int(v) else repr(float(v))


def resolve_client(code):
    c = str(code or '').strip()
    if c in BY_CODE:
        return BY_CODE[c]
    if c in BY_BRN:
        return BY_BRN[c]
    norm, _, _, _ = normalize(c)
    if norm and norm in BY_CODE:
        return BY_CODE[norm]
    if norm and norm in BY_BRN:
        return BY_BRN[norm]
    return None


wb = openpyxl.load_workbook(XLSX)
ws = wb.active
vouchers = defaultdict(lambda: {'lines': [], 'rep': '', 'cli': None, 'name': '', 'ship': '', 'addr': ''})
for r in ws.iter_rows(min_row=3, values_only=True):
    m = LINE.match(str(r[0] or '').strip())
    if not m:
        continue
    key = ('%s-%s-%s' % (m.group(1), m.group(2), m.group(3)), int(m.group(4)))
    v = vouchers[key]
    v['rep'] = v['rep'] or str(r[3] or '').strip()
    v['cli'] = v['cli'] or resolve_client(r[1])
    v['name'] = v['name'] or str(r[2] or '')
    v['addr'] = v['addr'] or str(r[14] or '')
    v['ship'] = v['ship'] or str(r[15] or '')
    v['lines'].append({'nm': str(r[4] or ''), 'sp': str(r[5] or ''), 'ct': str(r[7] or ''),
                       'jk': str(r[8] or ''), 'qty': num(r[9]), 'up': num(r[10]),
                       'sup': num(r[11]), 'vat': num(r[12])})
wb.close()

bad = [k for k, v in vouchers.items() if not v['cli']]
assert not bad, '거래처 미해결 전표: %s' % bad[:5]

buf, rb_where, ent_cnt, sup_tot, vat_tot, lines_n, miss_n = [], [], Counter(), 0, 0, 0, 0
for (date, no), v in sorted(vouchers.items()):
    ent = 3 if v['rep'] == CJ_REP else 2
    tot = sum(l['sup'] for l in v['lines'])
    vat = sum(l['vat'] for l in v['lines'])
    fin = tot + vat
    onum = 'E%d-%s-%03d' % (ent, date.replace('-', ''), no)
    ts = '%s 09:00:00' % date
    notes = '%s %s-%d%s' % (MARKER, date, no, (' · 담당 ' + v['rep']) if v['rep'] else '')
    ent_cnt[ent] += 1
    sup_tot += tot
    vat_tot += vat
    buf.append(
        "INSERT INTO orders (order_number,client_id,entity_id,order_date,status,order_type,"
        "total_amount,vat_amount,final_amount,created_by,notes,billing_status,billed_amount,"
        "billed_by,billed_at,accounting_date,delivery_method,delivery_info,created_at,updated_at) VALUES "
        "('%s',%d,%d,'%s','SHIPPED','PRODUCTION',%s,%s,%s,5,'%s','BILLED',%s,5,'%s','%s','%s','%s','%s','%s');"
        % (onum, v['cli'], ent, date, sqlnum(tot), sqlnum(vat), sqlnum(fin), q(notes),
           sqlnum(fin), ts, date, q(v['ship']), q(v['addr']), ts, ts))
    buf.append(
        "INSERT INTO order_billing_groups (order_id,entity_id,billing_status,billed_amount,"
        "supply_amount,tax_amount,billed_at,billed_by,accounting_date,created_at) VALUES "
        "((SELECT id FROM orders WHERE order_number='%s' AND entity_id=%d),%d,'BILLED',%s,%s,%s,'%s',5,'%s','%s');"
        % (onum, ent, ent, sqlnum(fin), sqlnum(tot), sqlnum(vat), date, date, ts))
    for so, l in enumerate(v['lines']):
        iid = IMAP.get('%s|%s' % (l['nm'].strip(), l['sp'].strip()))
        if iid is None:
            miss_n += 1
        unit = (items.get(iid, {}).get('unit') or 'EA') if iid else 'EA'
        content = l['ct'] + ((' | ' + l['jk']) if l['jk'] else '')
        buf.append(
            "INSERT INTO order_items (order_id,item_id,item_name,specification,content,quantity,"
            "unit,unit_price,amount,vat_included,sort_order,created_at) VALUES "
            "((SELECT id FROM orders WHERE order_number='%s' AND entity_id=%d),%s,'%s','%s','%s',%s,'%s',%s,%s,0,%d,'%s');"
            % (onum, ent, iid if iid else 'NULL', q(l['nm']), q(l['sp']), q(content),
               sqlnum(l['qty']), q(unit), sqlnum(l['up']), sqlnum(l['sup']), so, ts))
        lines_n += 1

open(os.path.join(OUT, 'sales_2607_e2.sql'), 'w', encoding='utf-8').write(
    '-- 선명(entity 2·3) 2026-07 판매 적재 (2026-08-07)\n'
    '-- 생성기 = docs/dongsan-import/gen_e2_sales_sql.py\n'
    '-- entity 배정 = 담당자(최인호 → 3 청주 · 그 외 → 2 선명), 거래처 화이트리스트 아님\n'
    '-- 롤백 = load/rollback_sales_2607_e2.sql\n\n' + '\n'.join(buf) + '\n')
open(os.path.join(OUT, 'rollback_sales_2607_e2.sql'), 'w', encoding='utf-8').write(
    "-- 선명 2026-07 판매 적재 롤백 (2026-08-07)\n"
    "-- ⚠️ 마커가 '%s' 로 **월·법인 분리**돼 있다. 다른 이관분은 안 지워진다.\n"
    "DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE notes LIKE '%s%%');\n"
    "DELETE FROM order_billing_groups WHERE order_id IN (SELECT id FROM orders WHERE notes LIKE '%s%%');\n"
    "DELETE FROM orders WHERE notes LIKE '%s%%';\n" % (MARKER, MARKER, MARKER, MARKER))

print('전표 %d (e2 %d · e3 %d) · 라인 %d (품목 미매칭 %d) · 공급가 %s · 부가세 %s'
      % (len(vouchers), ent_cnt[2], ent_cnt[3], lines_n, miss_n,
         format(int(sup_tot), ','), format(int(vat_tot), ',')))
