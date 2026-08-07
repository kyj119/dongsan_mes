# -*- coding: utf-8 -*-
"""이관 주문 `orders.sales_rep_id` 소급 채우기 (2026-08-07).

이카운트 판매현황의 `사원(담당)명` → `employees.id`.
대응 키는 **전표번호**다 — MES `orders.notes` 의
  · 동산: `동산 이카운트 이관 … · 전표 2026-01-02 1`  (생성기가 꼬리에 「전표 <날짜> <No>」를 붙였다)
  · 선명: `선명 이관 2026-01-02-1`
가 이카운트 `일자-No.`(`2026/01/02 -1`) 와 같은 값이다. **전표 단위로 담당자가 갈리므로**
거래처·금액 추정이 필요 없다(실측: 선명 전표 1,003개 중 담당자 혼재 **0건**).

⚠️ 이름은 `employees` 로만 푼다. `users` 는 실계정 7명뿐이라 정해선(동산 매출 52.9%)이 없다.
⚠️ 동명이인이 있으면 그 이름은 **건너뛴다**(잘못 붙이느니 비워 둔다).

사용: python docs/dongsan-import/gen_sales_rep_backfill.py <employees.json> <orders.json>
산출: load/sales_rep_backfill.sql (+ rollback)
"""
import openpyxl, json, sys, os, re, glob, warnings
from collections import Counter, defaultdict
warnings.filterwarnings('ignore')
sys.stdout.reconfigure(encoding='utf-8')

ROOT = r'C:\Users\user\dongsan_mes'
SRC = os.path.join(ROOT, '품목마스터', '원천주문데이터')
OUT = os.path.join(ROOT, 'docs', 'dongsan-import', 'load')
EMP_JSON, ORD_JSON = sys.argv[1], sys.argv[2]

LINE = re.compile(r'^(\d{4})/(\d\d)/(\d\d)\s+-(\d+)$')
# ★ 동산 이관은 `notes` 에 담당자를 **이미 적어 뒀다**(「· 담당 정소은 ·」) — 엑셀을 다시 볼 필요가 없다.
N_INLINE = re.compile(r'담당 ([^\s·]+)')
# 선명 이관은 담당자를 안 적었다 → 전표 키(`선명 이관 2026-01-02-1`)로 엑셀에서 찾는다.
N_SM = re.compile(r'^선명 이관 (?:\d{4}-\d\d )?(\d{4})-(\d\d)-(\d\d)-(\d+)')

emps = json.load(open(EMP_JSON, encoding='utf-8'))
cnt = Counter(e['name'] for e in emps)
BY_NAME = {e['name']: e['id'] for e in emps if cnt[e['name']] == 1}
dupe = sorted({n for n, c in cnt.items() if c > 1})

# ── 선명 판매현황에서 전표 → 담당자 ─────────────────────────────────────────
# ⚠️ **선명 파일만** 읽는다. 동산까지 넣으면 전표번호가 회사별로 겹쳐(`2026-01-02-1` 이 양쪽에 있다)
#    담당자 혼재로 잡히고 선명 전표가 통째로 버려진다 — 1차 실행에서 1,192 전표가 그렇게 날아갔다.
#    동산은 이 표가 애초에 필요 없다(notes 에 담당자가 들어 있다).
rep = defaultdict(set)
files = [os.path.join(ROOT, 'docs', 'dongsan-import', 'load', 'ecount_2026-H1_e2_sales_lines.xlsx'),
         os.path.join(ROOT, 'docs', 'dongsan-import', 'load', 'ecount_2026-07_e2_sales_lines.xlsx')]
for f in files:
    if not os.path.exists(f):
        print('  (없음) %s' % os.path.basename(f)); continue
    wb = openpyxl.load_workbook(f); ws = wb.active
    n = 0
    for r in ws.iter_rows(min_row=3, values_only=True):
        m = LINE.match(str(r[0] or '').strip())
        if not m:
            continue
        key = '%s-%s-%s-%s' % (m.group(1), m.group(2), m.group(3), int(m.group(4)))
        who = str(r[3] or '').strip()
        if who:
            rep[key].add(who)
        n += 1
    wb.close()
    print('  %-42s %5d라인' % (os.path.basename(f), n))

mixed = {k for k, v in rep.items() if len(v) > 1}
print('전표 %d · 담당자 혼재 %d (혼재는 건너뜀)' % (len(rep), len(mixed)))

orders = json.load(open(ORD_JSON, encoding='utf-8'))
buf, stat, noname, nokey = [], Counter(), Counter(), 0
for o in orders:
    notes = str(o['notes'] or '')
    sm = N_SM.match(notes)
    if sm:                                   # 선명 — 전표 키로 엑셀에서 담당자를 찾는다
        key = '%s-%s-%s-%s' % (sm.group(1), sm.group(2), sm.group(3), int(sm.group(4)))
        who = rep.get(key)
        if not who or len(who) > 1:
            nokey += 1; continue
        name = next(iter(who))
    else:                                    # 동산 — notes 에 담당자가 이미 있다
        im = N_INLINE.search(notes)
        if not im:
            nokey += 1; continue
        name = im.group(1)
    eid = BY_NAME.get(name)
    if not eid:
        noname[name] += 1; continue
    buf.append('UPDATE orders SET sales_rep_id = %d WHERE id = %d;' % (eid, o['id']))
    stat[name] += 1

open(os.path.join(OUT, 'sales_rep_backfill.sql'), 'w', encoding='utf-8').write(
    '-- 이관 주문 담당자 소급 (2026-08-07)\n'
    '-- 생성기 = docs/dongsan-import/gen_sales_rep_backfill.py (대응 키·근거는 그 파일 헤더)\n'
    '-- 롤백 = docs/dongsan-import/rollback_sales_rep_backfill.sql\n\n' + '\n'.join(buf) + '\n')
open(os.path.join(OUT, 'rollback_sales_rep_backfill.sql'), 'w', encoding='utf-8').write(
    '-- 담당자 소급 롤백 (2026-08-07) — 적용 전 전 주문이 NULL 이었다\n'
    'UPDATE orders SET sales_rep_id = NULL;\n')

print('\n채움 %d건 / 대상 %d건 (%.1f%%)' % (len(buf), len(orders), 100 * len(buf) / max(1, len(orders))))
print('  전표 미대응 %d건' % nokey)
if dupe:
    print('  ⚠️ employees 동명이인(건너뜀): %s' % ', '.join(dupe))
if noname:
    print('  ⚠️ employees 에 없는 담당: %s' % dict(noname))
print('  담당별:', dict(stat.most_common()))
