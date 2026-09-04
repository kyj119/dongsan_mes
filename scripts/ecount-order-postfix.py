# -*- coding: utf-8 -*-
"""ecount-order-postfix.py — 자동생성 주문의 담당자·접수일·번호·출고상태를 이카운트에 맞춘다

왜 별도 단계인가:
  `POST /api/orders` 는 `created_at`·`order_number` 를 받지 않는다(서버가 **오늘** 기준으로 채운다).
  그래서 지난 날짜를 소급 적재하면 목록에 뜨는 접수일이 전부 적재일로 보이고, 주문번호에도
  적재일이 박힌다. 이관분(`E1-20260715-I001` · `created_at 09:00` · `shipped_at`)이 이미
  **업무일 기준**으로 서 있으므로 같은 규약에 맞춘다 — 두 축이 갈리면 화면 집계가 갈린다.

무엇을 맞추나 (전부 `orders.notes` 전표 마커로 스코프):
  ① sales_rep_id  ← 이카운트 「사원(담당)명」 → employees.name
  ② created_at    ← 업무일 09:00:00           (목록의 접수일 표시가 이 값이다)
  ③ order_number  ← E{eid}-{업무일}-A###      (A = 자동생성. 이관은 I###)
     card_number 도 **같이** 바꾼다 — `{주문번호}-NN` 규약이라 안 바꾸면 어긋난다.
  ④ status/shipped_at ← 납기일이 지난 건은 SHIPPED (이관분 1~7월도 전부 SHIPPED)
     카드도 SHIPPED — 끝난 일이 생산 보드에 남아 있으면 안 된다.

⚠️ ③은 `print_file_map`·`print_events` 가 카드번호를 **문자열로** 참조한다. 참조가 생긴 뒤에는
   번호를 바꾸면 안 된다 — 실행 전에 참조 0건을 확인하고, 0이 아니면 번호 변경을 건너뛴다.
   ★2026-09-04 실제로 걸렸다 — 소급 매칭(`print-order-backfill.py`)이 먼저 돌아 참조 3,016건이
   생겨 번호 변경이 통째로 스킵됐다. **순서는 postfix 가 먼저다**. 이미 붙였다면
   `print-order-backfill.py --revert` → postfix → `--commit` 로 되돌렸다 다시 붙인다.

⚠️ ①의 원천은 **주문서현황**이다. 판매현황으로 이관한 구간에 그냥 돌리면 담당자가 옛 소스로
   덮인다(8월 실측: 1,257건 중 242건이 뒤집혔을 뻔). 원천이 다르면 `--no-rep` 을 쓴다.
   ⚠️주문서현황 엑셀은 커버 구간이 좁다(8/11까지) — "원천 전표 N" 이 대상 주문 수보다
   훨씬 작으면 그 자체가 원천 불일치 신호다.

사용법:
  python scripts/ecount-order-postfix.py --from 2026-08-01 --to 2026-08-11 [--apply]
  python scripts/ecount-order-postfix.py --from 2026-08-01 --to 2026-08-31 --no-rep --apply
"""
import argparse, io, json, os, re, subprocess, sys
from collections import Counter, defaultdict

try:
    import openpyxl
except ImportError:
    sys.exit('openpyxl 이 필요합니다: pip install openpyxl')

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_TRUTH = os.path.join(ROOT, '품목마스터', '원천주문데이터', '동산_주문서현황_2607-2608.xlsx')
RX_SLIP = re.compile(r'^(\d{4})/(\d\d)/(\d\d)\s*-\s*(\d+)$')
RX_NOTE = re.compile(r'전표 (\d{4}-\d\d-\d\d -\d+)')
MARKER = '이카운트 주문서 자동생성'


def d1(sql, remote=True):
    p = subprocess.run(
        ['npx', 'wrangler', 'd1', 'execute', 'webapp-production',
         '--remote' if remote else '--local', '--json', '--command', sql],
        cwd=ROOT, capture_output=True, shell=(os.name == 'nt'))
    t = p.stdout.decode('utf-8', 'replace')
    i = t.find('[')
    if i < 0:
        print(f'[D1 실패] {t[:400]}\n{p.stderr.decode("utf-8","replace")[:300]}')
        sys.exit(1)
    return json.loads(t[i:])[0]['results']


def run_file(path, remote=True):
    p = subprocess.run(
        ['npx', 'wrangler', 'd1', 'execute', 'webapp-production',
         '--remote' if remote else '--local', '--file', path, '-y'],
        cwd=ROOT, capture_output=True, shell=(os.name == 'nt'))
    out = p.stdout.decode('utf-8', 'replace') + p.stderr.decode('utf-8', 'replace')
    if 'ERROR' in out or p.returncode != 0:
        print(out[-800:])
        sys.exit(1)


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--from', dest='d_from', required=True)
    ap.add_argument('--to', dest='d_to', required=True)
    ap.add_argument('--truth', default=DEFAULT_TRUTH)
    ap.add_argument('--today', default=None, help='납기 경과 판정 기준일(기본=--to 다음날 아님, 오늘)')
    ap.add_argument('--no-rep', action='store_true',
                    help='담당자(①)를 건드리지 않는다 — 원천이 다른 이관분 보호')
    ap.add_argument('--prefix', default='A', choices=['A', 'I', ''],
                    help="주문번호 구분자 — A=일상 자동생성 · I=과거분 대량 이관 · ''=선명·청주 규약(E2-YYYYMMDD-NNN)")
    ap.add_argument('--marker', default=None,
                    help="notes 마커 접두(기본=동산 importer). 선명·청주는 '선명 이관'")
    ap.add_argument('--apply', action='store_true')
    a = ap.parse_args()
    today = a.today or __import__('datetime').date.today().isoformat()
    marker = a.marker or MARKER      # 스코프·채번·카드 조회가 전부 이 값에 걸린다

    # ── 원천: 전표 → 담당명 ──
    wb = openpyxl.load_workbook(a.truth, read_only=True, data_only=True)
    staff = {}
    for row in wb.active.iter_rows(min_row=3, values_only=True):
        m = RX_SLIP.match(str(row[0] or '').strip())
        if not m:
            continue
        d = f'{m.group(1)}-{m.group(2)}-{m.group(3)}'
        if not (a.d_from <= d <= a.d_to):
            continue
        staff.setdefault(f'{d} -{m.group(4)}', str(row[2] or '').strip())

    emp = {r['name'].strip(): r['id'] for r in d1(
        "SELECT id, name FROM employees WHERE status='ACTIVE'")}
    orders = d1(f"SELECT id, order_number, order_date, delivery_date, created_at, status, "
                f"sales_rep_id, entity_id, notes FROM orders "
                f"WHERE notes LIKE {q(marker + '%')} AND order_date BETWEEN {q(a.d_from)} AND {q(a.d_to)}")
    print(f'대상 주문 {len(orders)}건 · 원천 전표 {len(staff)} · 직원 {len(emp)}')

    refs = d1(f"SELECT (SELECT COUNT(*) FROM print_file_map m JOIN cards c ON c.card_number=m.card_number "
              f"JOIN orders o ON o.id=c.order_id WHERE o.notes LIKE {q(marker + '%')}) a, "
              f"(SELECT COUNT(*) FROM print_events e JOIN cards c ON c.card_number=e.card_number "
              f"JOIN orders o ON o.id=c.order_id WHERE o.notes LIKE {q(marker + '%')}) b")[0]
    renumber = (refs['a'] == 0 and refs['b'] == 0)
    if not renumber:
        print(f"⚠️ 카드번호 참조 {refs['a']}+{refs['b']}건 존재 → 번호 변경 건너뜀(접수일·담당·상태만)")

    cards = defaultdict(list)
    for c in d1(f"SELECT c.id, c.card_number, c.order_id, c.status FROM cards c JOIN orders o ON o.id=c.order_id "
                f"WHERE o.notes LIKE {q(marker + '%')}"):
        cards[c['order_id']].append(c)

    # ★채번은 0 이 아니라 **그 날짜에 이미 쓰인 최대값**에서 이어받는다.
    #   같은 날짜에 다른 경로로 만들어진 번호가 이미 있으면(7월 실측: 마커 없는 이관분 1,132건이
    #   E1-YYYYMMDD-I### 를 선점) 1번부터 매기는 순간 통째로 충돌한다.
    #   대상만 보면 안 보인다 — 스코프(마커) 밖의 번호까지 봐야 한다.
    seq = Counter()
    for r in d1(f"SELECT order_number FROM orders WHERE order_number LIKE 'E%-{a.prefix}%'"
                f" OR order_number GLOB 'E*-[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]-{a.prefix}*'"):
        mm = re.match(rf'^E\d+-(\d{{8}})-{a.prefix}(\d+)$', r['order_number'] or '')
        if mm:
            seq[mm.group(1)] = max(seq[mm.group(1)], int(mm.group(2)))
    if seq:
        print(f'기존 채번 이어받기: {len(seq)}개 날짜 (예: '
              + ', '.join(f'{k}→{v}' for k, v in sorted(seq.items())[:3]) + ')')
    sql, st = [], Counter()
    no_staff = Counter()
    for o in sorted(orders, key=lambda x: (x['order_date'], x['id'])):
        m = RX_NOTE.search(o['notes'] or '')
        nm = staff.get(m.group(1)) if m else None
        eid = emp.get(nm) if nm else None
        sets = []
        if a.no_rep:
            pass          # 원천이 다른 이관분 보호 — 아래 --no-rep 주석 참조
        elif eid and o['sales_rep_id'] != eid:
            sets.append(f'sales_rep_id = {eid}'); st['rep'] += 1
        elif nm and not eid:
            no_staff[nm] += 1
        want_created = f"{o['order_date']} 09:00:00"
        if (o['created_at'] or '')[:19] != want_created:
            sets.append(f'created_at = {q(want_created)}'); st['created'] += 1
        if renumber:
            d = o['order_date'].replace('-', '')
            seq[d] += 1
            newno = f"E{o['entity_id'] or 1}-{d}-{a.prefix}{seq[d]:03d}"
            if newno != o['order_number']:
                sets.append(f'order_number = {q(newno)}'); st['number'] += 1
                for c in cards[o['id']]:
                    tail = c['card_number'].rsplit('-', 1)[-1]
                    sql.append(f"UPDATE cards SET card_number = {q(newno + '-' + tail)} WHERE id = {c['id']};")
        past_due = o['delivery_date'] and o['delivery_date'] < today
        if past_due and o['status'] != 'SHIPPED':
            # 출고일이 주문일보다 앞설 수는 없다 — 원천의 납기일이 전표일보다 이른 건이 실재한다
            # (8월 실측 61건: 이카운트에서 납기를 먼저 잡고 전표를 뒤에 끊은 경우).
            # 그대로 넣으면 기간 집계에서 「주문 없는 출고」가 된다.
            ship_day = max(o['delivery_date'], o['order_date'])
            sets.append(f"status = 'SHIPPED'")
            sets.append(f"shipped_at = {q(ship_day + ' 00:00:00')}")
            st['shipped'] += 1
            for c in cards[o['id']]:
                if c['status'] != 'SHIPPED':
                    sql.append(f"UPDATE cards SET status = 'SHIPPED' WHERE id = {c['id']};")
                    st['card_shipped'] += 1
        if sets:
            sql.append(f"UPDATE orders SET {', '.join(sets)}, updated_at = datetime('now') WHERE id = {o['id']};")

    print(f"담당 {st['rep']} · 접수일 {st['created']} · 번호 {st['number']} · "
          f"출고 {st['shipped']}(카드 {st['card_shipped']}) · SQL {len(sql)}문")
    if no_staff:
        print('직원 마스터에 없는 담당명:', dict(no_staff))
    if not a.apply:
        print('\n[dry-run] 적용은 --apply. 미리보기 3문:')
        for s in sql[:3]:
            print('  ' + s)
        return

    tmp = os.path.join(os.environ.get('TEMP', '.'), 'ecount_postfix.sql')
    for i in range(0, len(sql), 400):          # --file 대용량은 조각 분할
        io.open(tmp, 'w', encoding='utf-8').write('\n'.join(sql[i:i + 400]))
        run_file(tmp)
        print(f'  적용 {min(i+400, len(sql))}/{len(sql)}')
    print('완료')


if __name__ == '__main__':
    main()
