# -*- coding: utf-8 -*-
"""ecount-order-import.py — 이카운트 주문서현황 → MES 주문서 자동 생성

왜 이게 필요한가:
  Z: 파일 스캔(`zscan-intake.cjs`)은 **대기함까지만** 채운다. 대기함 건을 주문서로 바꾸는 건
  사람이 화면에서 한 건씩 프리필하는 동작이었고, 하루 85그룹이면 사람이 85번 누른다.
  그런데 주문 내용(거래처·품목·수량·단가·금액)은 이미 **이카운트에 다 있다** —
  경리가 병행 기간 동안 계속 입력하고 있다. 그러니 사람이 다시 칠 이유가 없다.

★설계의 핵심 = **주문서 내용은 100% 이카운트에서 온다. 파일은 그림만 붙인다.**
  이 분리가 중요한 이유: 예전 접근(파일명 파싱 → 주문서 작성)은 파일↔주문 매칭 정확도
  (그룹 90.7%·유효 58.8%)가 **주문서 금액의 정확도**였다. 매칭이 틀리면 청구가 틀린다.
  지금은 매칭이 틀려도 **썸네일만 안 붙는다** — 거래처·금액은 이카운트 원본이라 항상 맞다.
  즉 자동화의 위험도가 「청구 오류」에서 「이미지 누락」으로 내려간다.

해소율 실측(2026-08 · 896라인 · 정답지=MES 이관 1~7월 22,973라인):
  거래처 97.0% · 품목 97.3% · 규격 W*H 83.9%

⚠️ 금액은 **이카운트 공급가액을 그대로** 넣는다. `quantity × unit_price` 재계산 금지 —
   이관 때 실측으로 확인된 규칙이다(부가세포함단가·롤↔야드·개별할인 때문에 재계산하면 어긋난다).
   주문 API 는 본문 `amount` 를 최종 청구액으로 수용하므로 원본이 보존된다.

⚠️ 멱등 = `orders.notes` 의 전표 마커. 같은 전표를 두 번 넣지 않는다.
   (이관에서 「기존 데이터와의 겹침은 총액이 아니라 건별로 봐야 한다」는 교훈을 그대로 적용)

사용법:
  # ① 품목 사전 재생성 — MES 이관 이력에서 학습(표기 → item_id)
  python scripts/ecount-order-import.py --build-dict --remote

  # ② 미리보기(기본. 아무것도 쓰지 않는다)
  python scripts/ecount-order-import.py --date 2026-08-11

  # ③ 실제 생성
  python scripts/ecount-order-import.py --date 2026-08-11 --apply
  python scripts/ecount-order-import.py --from 2026-08-01 --to 2026-08-11 --apply

  --url    기본 http://localhost:3000 (prod = https://webapp-9i0.pages.dev)
  --truth  기본 품목마스터/원천주문데이터/동산_주문서현황_2607-2608.xlsx
"""
import argparse, csv, io, json, os, re, subprocess, sys, urllib.request
from collections import Counter, defaultdict

try:
    import openpyxl
except ImportError:
    sys.exit('openpyxl 이 필요합니다: pip install openpyxl')

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DICT_PATH = os.path.join(ROOT, 'docs', 'order-file-matching', 'ecount_item_map.csv')
DEFAULT_TRUTH = os.path.join(ROOT, '품목마스터', '원천주문데이터', '동산_주문서현황_2607-2608.xlsx')

RX_SLIP = re.compile(r'^(\d{4})/(\d\d)/(\d\d)\s*-\s*(\d+)$')
RX_SPEC = re.compile(r'\[([^\]]*)\]\s*$')
RX_WH = re.compile(r'^\s*(\d+(?:\.\d+)?)\s*[*xX×]\s*(\d+(?:\.\d+)?)\s*$')
RX_LEGAL = re.compile(r'\(주\)|주식회사|㈜|유한회사|주\)')
RX_BIZ_NAME = re.compile(r'^\d{3}-?\d{2}-?\d{5}$')   # 거래처명 자리에 사업자번호가 온 경우
MARKER = '이카운트 주문서 자동생성'
#: 폴백 거래처로 들어간 주문에 원래 표기를 남기는 태그. **이 문자열로 나중에 되찾는다** —
#  실거래처가 등록되면 `notes LIKE '%미확인거래처:이름%'` 으로 골라 client_id 를 옮길 수 있다.
UNRESOLVED_TAG = '미확인거래처:'


def nrm(s):
    """비교용 정규화 — 법인 접두어·공백·구두점 제거."""
    s = RX_LEGAL.sub('', str(s or '').strip().lower())
    return re.sub(r'[\s\-_.,/()\[\]]+', '', s)


# ── MES API ────────────────────────────────────────────────────
# ⚠️ prod(Cloudflare)는 브라우저 UA 가 없으면 로그인부터 403 error code 1010 으로 막는다.
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/126.0 Safari/537.36')


def api(base, path, token=None, payload=None, method=None):
    req = urllib.request.Request(
        base.rstrip('/') + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={'Content-Type': 'application/json', 'User-Agent': UA,
                 **({'Authorization': 'Bearer ' + token} if token else {})},
        method=method or ('POST' if payload is not None else 'GET'))
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return {'success': False, 'error': f'HTTP {e.code}', 'body': e.read().decode()[:400]}


def login(base, user, pw):
    r = api(base, '/api/auth/login', payload={'username': user, 'password': pw})
    tok = (r.get('data') or {}).get('token')
    if not tok:
        print(f'로그인 실패: {r}')      # sys.exit 는 stderr(비UTF8)라 한글이 깨진다
        sys.exit(1)
    return tok


def page_all(base, tok, path, key='data', limit=200):
    """페이지네이션 전량 수집.

    ⚠️ 오류를 빈 페이지로 취급하면 **조용히 잘린다**. 실제로 거래처 2,845건 중 1,200건만
       받고도 아무 경고 없이 진행해 「거래처 미해소 37전표」라는 틀린 결과를 냈다.
       → 오류는 재시도하고, 끝까지 실패하면 중단한다(부분 결과로 진행 금지).
    """
    out, page = [], 1
    while True:
        sep = '&' if '?' in path else '?'
        r, last = None, None
        for _ in range(3):
            r = api(base, f'{path}{sep}page={page}&limit={limit}', tok)
            if not (isinstance(r, dict) and r.get('success') is False):
                break
            last = r
        if isinstance(r, dict) and r.get('success') is False:
            print(f'[중단] {path} page={page} 조회 실패: {last}')
            sys.exit(1)
        rows = r.get(key) or []
        # ⚠️ `data` 모양이 라우트마다 다르다 — /api/orders 는 리스트, /api/clients·/api/hr/employees 는 dict.
        #    한쪽만 가정하면 조용히 0건이 된다(직원 0명으로 담당자가 통째로 안 붙었다).
        if isinstance(rows, dict):
            rows = (rows.get('items') or rows.get('clients') or rows.get('employees')
                    or rows.get('list') or [])
        out.extend(rows)
        if len(rows) < limit:
            break
        page += 1
        if page > 100:
            print(f'[중단] {path} 페이지 상한 초과 — 수집 {len(out)}건')
            sys.exit(1)
    return out


# ── 품목 사전 ───────────────────────────────────────────────────
def build_dict(remote):
    """MES 이관 주문라인에서 「이카운트 품목표기 → item_id」를 학습해 CSV 로 굳힌다.

    이카운트 주문서현황의 품목 칸은 `현수막(조립) [600*90]` 형태고,
    MES `order_items.item_name` 에는 규격을 뺀 `현수막(조립)` 이 그대로 보존돼 있다.
    즉 규격만 떼면 정확히 겹친다 — 별도 매칭 규칙을 만들 필요가 없다.
    """
    sql = ("SELECT oi.item_name nm, oi.item_id iid, COUNT(*) c "
           "FROM order_items oi JOIN orders o ON o.id=oi.order_id "
           "WHERE o.order_date>='2026-01-01' AND oi.item_id IS NOT NULL GROUP BY 1,2")
    cmd = ['npx', 'wrangler', 'd1', 'execute', 'webapp-production',
           '--remote' if remote else '--local', '--json', '--command', sql]
    p = subprocess.run(cmd, cwd=ROOT, capture_output=True, shell=(os.name == 'nt'))
    txt = p.stdout.decode('utf-8', 'replace')
    i = txt.find('[')
    if i < 0:
        sys.exit(f'wrangler 출력 파싱 실패:\n{txt[:600]}\n{p.stderr.decode("utf-8","replace")[:400]}')
    rows = json.loads(txt[i:])[0]['results']
    best = defaultdict(Counter)
    for r in rows:
        best[str(r['nm']).strip()][r['iid']] += r['c']
    os.makedirs(os.path.dirname(DICT_PATH), exist_ok=True)
    with io.open(DICT_PATH, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerow(['label', 'item_id', 'hits'])
        for k in sorted(best):
            iid, hits = best[k].most_common(1)[0]
            w.writerow([k, iid, hits])
    print(f'품목 사전 저장: {DICT_PATH}  ({len(best)}종 / 라인 {sum(r["c"] for r in rows)})')


def load_dict():
    if not os.path.exists(DICT_PATH):
        return {}
    out = {}
    with io.open(DICT_PATH, encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            out[nrm(r['label'])] = int(r['item_id'])
    return out


# ── 원천 ────────────────────────────────────────────────────────
#: 내부 키 → 이카운트 헤더명 후보. **열 위치를 쓰지 않는다.**
#  이카운트 내보내기 설정에 따라 열이 늘거나 준다 — 실제로 「거래처코드」가 하나 추가된 파일이
#  들어와 전 행이 한 칸씩 밀려 읽혔다(거래처=사업자번호 · 담당=거래처명 · 품목=담당자).
#  이미 적재된 전표는 마커로 걸러져 증상이 신규 3건에서만 드러났다 — 위치 기반은 이렇게 조용히 틀린다.
TRUTH_COLS = {
    'slip':      ['일자-No.'],
    'client':    ['거래처명'],
    'staff':     ['사원(담당)명', '담당자명', '사원명'],
    'label':     ['품목명(규격)', '품목명'],
    'desc':      ['내용'],
    'note':      ['적요'],
    'qty':       ['수량'],
    'price':     ['단가'],
    'amount':    ['공급가액'],
    'ship_date': ['출고일'],
    'addr':      ['배송처주소'],
    'ship_via':  ['출고방법'],
    'pay':       ['착불/선불명', '착불/선불'],
}


def load_truth(path, d_from, d_to):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(min_row=1, values_only=True))

    # 헤더 행 찾기 — '일자-No.' 가 있는 행. (파일에 따라 1~3행 사이에서 흔들린다)
    hrow = next((i for i, r in enumerate(rows[:5])
                 if any(str(v or '').strip() == '일자-No.' for v in r)), None)
    if hrow is None:
        raise SystemExit(f'헤더를 못 찾음(「일자-No.」 없음): {os.path.basename(path)}')
    head = {str(v or '').strip(): j for j, v in enumerate(rows[hrow])}

    idx, missing = {}, []
    for key, names in TRUTH_COLS.items():
        j = next((head[n] for n in names if n in head), None)
        if j is None:
            missing.append(names[0])
        idx[key] = j
    # 필수 열이 없으면 **멈춘다**. 조용히 None 으로 넘기면 전 건이 빈 값으로 생성된다.
    required = ['slip', 'client', 'label', 'qty', 'price', 'amount']
    hard = [k for k in required if idx[k] is None]
    if hard:
        raise SystemExit(f'필수 열 누락 {hard} — 내보내기 설정을 확인하세요. 발견된 헤더: {list(head)}')
    if missing:
        print(f'⚠️ 선택 열 없음(빈 값으로 처리): {missing}')

    def g(row, key):
        j = idx[key]
        return None if j is None or j >= len(row) else row[j]

    def s(row, key):
        return str(g(row, key) or '').strip()

    slips = defaultdict(list)
    for row in rows[hrow + 1:]:
        m = RX_SLIP.match(s(row, 'slip'))
        if not m:
            continue
        d = f'{m.group(1)}-{m.group(2)}-{m.group(3)}'
        if not (d_from <= d <= d_to):
            continue
        slips[f'{d} -{m.group(4)}'].append({
            'date': d, 'client': s(row, 'client'), 'staff': s(row, 'staff'),
            'label': s(row, 'label'), 'desc': s(row, 'desc'),
            'note': s(row, 'note'), 'qty': g(row, 'qty'), 'price': g(row, 'price'),
            'amount': g(row, 'amount'),
            'ship_date': s(row, 'ship_date').replace('/', '-')[:10] or None,
            'addr': s(row, 'addr'), 'ship_via': s(row, 'ship_via'), 'pay': s(row, 'pay'),
        })
    return dict(sorted(slips.items()))


def load_tray(d_from, d_to):
    """대기함(designer_intakes)에서 그날 파일을 읽는다 — 카드 썸네일의 유일한 경로.

    ★`cards.thumbnail_url` 은 **주문 생성 시점에만** 채워진다:
      `order_items.ai_analysis_id` → `ai_analysis_requests.groups_json` → R2 썸네일 키
      (`orders/create.ts` C블록). 소급 경로가 코드에 없다 → **주문을 만들 때 물려야** 한다.
    ★`ai_group_index = -3` = 완성본(passthrough). 화면 프리필이 쓰는 값과 같게 둔다
      (`scripts/orderForm/intake.js`) — 다르게 주면 그룹 해석이 갈린다.
    ⚠️ `/api/workbench/intakes` 는 page 파라미터가 없고 limit 상한이 200 이라 252건을 다 못 받는다
       → 읽기 전용 D1 조회로 전량을 가져온다.
    """
    sql = ("SELECT id, ai_analysis_id, client_id, client_name, width_cm w, height_cm h, qty, batch_key "
           "FROM designer_intakes WHERE status='waiting' AND ai_analysis_id IS NOT NULL "
           f"AND substr(batch_key,1,10) BETWEEN '{d_from}' AND '{d_to}'")
    p = subprocess.run(['npx', 'wrangler', 'd1', 'execute', 'webapp-production',
                        '--remote', '--json', '--command', sql],
                       cwd=ROOT, capture_output=True, shell=(os.name == 'nt'))
    t = p.stdout.decode('utf-8', 'replace')
    if t.find('[') < 0:
        print(f'[중단] 대기함 조회 실패: {t[:300]}')
        sys.exit(1)
    return json.loads(t[t.find('['):])[0]['results']


def spec_key(w, h):
    try:
        a, b = sorted([round(float(w)), round(float(h))])
        return (a, b)
    except (TypeError, ValueError):
        return None


def num(v, dflt=0):
    try:
        return float(str(v).replace(',', ''))
    except (TypeError, ValueError):
        return dflt


# ── MES 자동 산식 미러 (src/utils/orderLineAmount.ts) ────────────
def billing_side(v):
    """청구 기준 변 길이(cm) — 10cm 올림 후 최소 1m."""
    return max(-(-int(v) // 10) * 10, 100)


def mes_auto(price, qty, w, h, method):
    a = (price * (billing_side(w) / 100) * (billing_side(h) / 100) * qty
         if (method == 'AREA' and w and h) else price * qty)
    return round(a / 100) * 100


def area_unit_price(amount, qty, w, h):
    """이카운트 **장당금액** → MES **㎡단가** 변환.

    ★이카운트의 `단가` 칸은 ㎡단가가 아니라 **장당금액**이다(prod 실측: AREA 규격보유
      13,449건 중 AREA 방식으로 저장된 라인 0건). 그대로 넣으면 MES 가 AREA 로 재계산할 때
      금액이 몇 배로 튀고, 그 차액이 통째로 **행 에누리**로 기록돼 실적·원가가 오염된다.
      → 이관분을 정정한 `migrations/0530_fix_imported_area_unit_price.sql` 과 **같은 규칙**으로,
        적재 시점에 변환해 신규 주문이 처음부터 올바르게 태어나게 한다.
      amount 는 건드리지 않는다 — 실제 청구액이고 이카운트 대사의 기준값이다.
    """
    denom = (billing_side(w) / 100) * (billing_side(h) / 100) * qty
    return round(amount / denom) if denom else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--date')
    ap.add_argument('--from', dest='d_from')
    ap.add_argument('--to', dest='d_to')
    ap.add_argument('--truth', default=DEFAULT_TRUTH)
    ap.add_argument('--url', default='http://localhost:3000')
    ap.add_argument('--user', default=os.environ.get('SMOKE_USER', 'admin'))
    ap.add_argument('--pass', dest='pw', default=os.environ.get('SMOKE_PASS', 'password'))
    ap.add_argument('--apply', action='store_true', help='실제 생성(기본은 미리보기)')
    ap.add_argument('--build-dict', action='store_true')
    ap.add_argument('--remote', action='store_true', help='--build-dict 를 prod D1 로')
    ap.add_argument('--limit', type=int, default=0, help='전표 N건만(시범 적재용)')
    ap.add_argument('--fallback-client', dest='fallback_client', default=None,
                    help='거래처 미해소 전표를 이 거래처코드로 생성(예: 000-00-00000). '
                         '원래 표기는 notes 에 「미확인거래처:이름」 으로 남는다.')
    ap.add_argument('--link-files', dest='link_files', action='store_true',
                    help='대기함 파일을 라인에 물려 카드 썸네일까지 자동 생성')
    a = ap.parse_args()

    if a.build_dict:
        return build_dict(a.remote)

    d_from = a.d_from or a.date
    d_to = a.d_to or a.date
    if not d_from or not d_to:
        sys.exit('--date 또는 --from/--to 가 필요합니다')

    slips = load_truth(a.truth, d_from, d_to)
    n_lines = sum(len(v) for v in slips.values())
    print(f'원천 {os.path.basename(a.truth)}  {d_from}~{d_to}  전표 {len(slips)} · 라인 {n_lines}')
    if not slips:
        return

    base, tok = a.url.rstrip('/'), None
    tok = login(base, a.user, a.pw)

    # 마스터
    clients = page_all(base, tok, '/api/clients?active=all')
    cidx = {}
    # 사업자번호 인덱스 — 이카운트가 **거래처명 칸에 사업자번호를 그대로** 내보내는 경우가 있다
    #   (마스터 미등록 상태로 전표만 친 거래처). 이름으로만 찾으면 그 전표가 통째로 스킵된다.
    bidx = {}
    for c in clients:
        cidx.setdefault(nrm(c.get('client_name')), c['id'])
        for kw in str(c.get('search_keywords') or '').replace(',', '|').split('|'):
            if kw.strip():
                cidx.setdefault(nrm(kw), c['id'])
        for code in (c.get('client_code'), c.get('business_registration_number')):
            d = re.sub(r'\D', '', str(code or ''))
            if len(d) == 10:
                bidx.setdefault(d, c['id'])

    fallback_cid = None
    if a.fallback_client:
        hit = [c for c in clients if str(c.get('client_code') or '').strip() == a.fallback_client]
        if not hit:
            raise SystemExit(f'--fallback-client 거래처코드를 찾을 수 없음: {a.fallback_client}')
        fallback_cid = hit[0]['id']
        print(f"폴백 거래처 = {hit[0]['client_name']} (id={fallback_cid}) — 미해소 전표를 여기로 생성")
    # 담당자 — 이카운트 「사원(담당)명」을 **생성 시점에** 넣는다.
    #   `POST /api/orders` 는 sales_rep_id 를 받는다(안 보내면 로그인 사용자로 박힌다).
    #   created_at·order_number·status 와 달리 이건 소급 보정이 필요 없다.
    staff_idx = {}
    for e in page_all(base, tok, '/api/hr/employees?status=ACTIVE'):
        nm = str(e.get('name') or '').strip()
        if nm:
            staff_idx.setdefault(nm, e['id'])
            staff_idx.setdefault(nrm(nm), e['id'])
    print(f'직원 {len(set(staff_idx.values()))}명')

    imap = load_dict()
    items = page_all(base, tok, '/api/items?include_inactive=1', limit=500)
    pricing = {it['id']: (it.get('pricing_method') or 'FIXED') for it in items}
    for it in items:
        imap.setdefault(nrm(it.get('item_name')), it['id'])
        for kw in str(it.get('search_keywords') or '').replace(',', '|').split('|'):
            if kw.strip():
                imap.setdefault(nrm(kw), it['id'])
    print(f'마스터 거래처 {len(clients)} · 품목 {len(items)} · 사전 표기 {len(imap)}')

    # ── 멱등: 이미 적재된 전표는 건너뛴다 ──────────────────────────
    # ⚠️ `/api/orders` 의 data 는 **리스트**다(dict 아님). 전에는 dict 로 가정해 `.get('orders')` 를
    #    불렀는데, 대상 날짜에 주문이 하나도 없을 때만 빈 리스트→{} 폴백으로 우연히 통과했다.
    #    주문이 생긴 뒤 재실행하면 그 자리에서 터지고 = 중복 방지가 통째로 무력화된다.
    # ⚠️ 페이지네이션도 필수 — 하루 75건이면 한 페이지에 안 들어올 수 있다.
    seen = set()
    for o in page_all(base, tok, f'/api/orders?date_from={d_from}&date_to={d_to}'):
        for m in re.finditer(r'전표 (\d{4}-\d\d-\d\d -\d+)', str(o.get('notes') or '')):
            seen.add(m.group(1))
    if seen:
        print(f'이미 적재된 전표 {len(seen)}건 → 건너뜀')

    # 대기함 색인 — (거래처, 규격) → [intake]. 규격 미상 파일도 거래처 키로 담는다.
    tray_by = defaultdict(list)
    tray_any = defaultdict(list)               # 규격 무관 폴백 — 규격이 W*H 로 안 적힌 라인용
    tray_n = 0
    if a.link_files:
        for t in load_tray(d_from, d_to):
            if not t.get('client_id'):
                continue                       # 거래처 미상은 오배정 위험 → 자동 연결 안 함
            tray_by[(t['client_id'], spec_key(t['w'], t['h']))].append(t)
            tray_any[t['client_id']].append(t)
            tray_n += 1
        print(f'대기함 후보 {tray_n}건 (거래처 해소분만)')

    made = skipped = 0
    linked_ids, link_hits = [], 0
    no_client, no_item, fails, diverge, no_staff = Counter(), Counter(), [], [], Counter()
    for slip, lines in slips.items():
        if slip in seen:
            skipped += 1
            continue
        raw_client = lines[0]['client']
        cid = cidx.get(nrm(raw_client))
        if not cid and RX_BIZ_NAME.match(raw_client.strip()):
            # 거래처명이 **통째로** 사업자번호인 경우만 코드로 찾는다.
            #   부분 일치를 허용하면 「비젼텍(823-04-03349)」 같은 이름이 엉뚱한 곳에 붙는다.
            cid = bidx.get(re.sub(r'\D', '', raw_client))
        unresolved_name = None
        if not cid:
            no_client[raw_client] += 1
            if not fallback_cid:
                continue
            # 폴백 = 이카운트가 「기타거래처(000-00-00000)」 하나에 이름만 바꿔 쓰는 관행을 그대로 받는다.
            #   ⚠️ 원래 표기를 **주문에 남긴다**(notes). 안 남기면 나중에 실거래처로 갈라낼 근거가 사라진다 —
            #      기타거래처에 뭉친 124건이 지금 그 상태다(누구 미수인지 알 수 없음).
            cid, unresolved_name = fallback_cid, raw_client

        payload_items = []
        for ln in lines:
            ms = RX_SPEC.search(ln['label'])
            spec = ms.group(1).strip() if ms else ''
            bare = RX_SPEC.sub('', ln['label']).strip()
            iid = imap.get(nrm(bare))
            if not iid:
                no_item[bare] += 1
            mw = RX_WH.match(spec)
            w = num(mw.group(1), None) if mw else None
            h = num(mw.group(2), None) if mw else None
            q = int(num(ln['qty'], 1)) or 1
            price, amt = num(ln['price']), num(ln['amount'])
            method = pricing.get(iid, 'FIXED')
            if method == 'AREA' and w and h and q and amt:
                price = area_unit_price(amt, q, w, h)
            auto = mes_auto(price, q, w or 0, h or 0, method)
            if round(amt) != auto:
                diverge.append((slip, bare, auto, amt))
            payload_items.append({
                'item_id': iid, 'item_name': bare,
                'width': w, 'height': h,
                'quantity': q,
                'unit_price': price,
                'amount': amt,                        # ★이카운트 공급가액 원본
                # MES 산식과 갈리면 서버가 「행 에누리」로 기록한다. 사유를 명시해야
                # 나중에 실제 할인과 구분된다(안 넣으면 전부 정체불명 에누리로 남는다).
                'discount_reason': '이카운트 원본금액',
                'content': ln['desc'] or None,
                'specification': None if mw else (spec or None),
                'vat_included': 1,
            })

        # 대기함 물리기 — 라인마다 후보 1건(썸네일 원천). 나머지 파일은 zscan-link-orders 가 칩으로 붙인다.
        slip_linked = []                        # ★전표 단위로 리셋. 누적 리스트를 쓰면 앞 전표의 것까지 흡수한다.
        if a.link_files:
            for pit in payload_items:
                sk = spec_key(pit['width'], pit['height'])
                pool = tray_by.get((cid, sk)) or tray_by.get((cid, None)) or []
                # ★규격으로 못 만나면 **같은 거래처·같은 날**만으로 집는다.
                #   근거: 8/1~8/12 실측에서 (거래처,날짜) 조합의 **84.4%가 전표 1건**이다 —
                #   그 범위에서는 규격을 안 봐도 같은 일감이다. 규격 표기가 없는 파일
                #   (오케이애드 `센트럴시티 1본 2팀 0706_60.eps`)·자유표기 라인(현수막(게시대))이
                #   실재해서, 규격을 필수로 두면 그런 묶음이 통째로 빠진다.
                #   ⚠️ 트레이드오프 = 같은 거래처가 같은 날 여러 주문을 낸 경우(하우사인 하루 7전표)
                #      썸네일이 옆 주문 것일 수 있다. **그림만** 틀리고 금액·거래처는 영향 없다.
                if not pool:
                    pool = tray_any.get(cid) or []
                if not pool:
                    continue
                t = pool.pop(0)
                for othr in (tray_by.get((cid, spec_key(t['w'], t['h']))), tray_any.get(cid)):
                    if othr and t in othr:
                        othr.remove(t)          # 두 색인에서 같이 빼야 중복 배정이 안 난다
                pit['ai_analysis_id'] = t['ai_analysis_id']
                pit['ai_group_index'] = -3      # 완성본 passthrough (프리필과 동일 약속값)
                slip_linked.append(t['id'])
                link_hits += 1

        head = lines[0]
        rep = staff_idx.get(head['staff']) or staff_idx.get(nrm(head['staff']))
        if head['staff'] and not rep:
            no_staff[head['staff']] += 1
        body = {
            'client_id': cid,
            'billing_entity_id': 1,
            **({'sales_rep_id': rep} if rep else {}),
            'order_date': head['date'],
            'delivery_date': head['ship_date'] or head['date'],
            'order_year': int(head['date'][:4]), 'order_month': int(head['date'][5:7]),
            'delivery_info': head['addr'] or None,
            'delivery_method': head['ship_via'] or None,
            'shipping_payment': head['pay'] or None,
            'notes': (f"{MARKER} · 담당 {head['staff'] or '-'} · 전표 {slip}"
                      + (f" · {UNRESOLVED_TAG}{unresolved_name}" if unresolved_name else '')),
            'items': payload_items,
        }
        if not a.apply:
            made += 1
            if made <= 3:
                print(f"  [미리보기] {slip} {head['client']} → client_id={cid} "
                      f"라인{len(payload_items)} 금액{sum(i['amount'] for i in payload_items):,.0f}")
            continue

        r = api(base, '/api/orders', tok, payload=body)
        if r.get('success'):
            made += 1
            # 대기함 흡수 — 서버가 intake 의 ai_analysis_id 로 order_item_id 를 역추적한다.
            #   부수효과로 별칭 학습 루프까지 돈다(파일 표기 → clients.search_keywords).
            oid = (r.get('data') or {}).get('id')
            for tid in slip_linked:
                res = api(base, f'/api/workbench/intakes/{tid}/absorb', tok, payload={'order_id': oid})
                if res.get('success'):
                    linked_ids.append(tid)
        else:
            fails.append((slip, str(r.get('error') or r)[:120]))
        if a.limit and made >= a.limit:
            break

    print()
    print(f"{'생성' if a.apply else '생성 예정'} {made} · 건너뜀(기존) {skipped} · 실패 {len(fails)}")
    if a.link_files:
        print(f'대기함 연결 라인 {link_hits} · 흡수 완료 {len(linked_ids)} '
              f'(연결된 라인은 카드 썸네일이 자동으로 붙는다)')
    if no_staff:
        print(f'담당자 미해소 {sum(no_staff.values())}전표(직원 마스터에 없음):', dict(no_staff))
    if no_client:
        dest = (f'→ 폴백 거래처로 생성(notes 에 「{UNRESOLVED_TAG}이름」 보존)'
                if fallback_cid else '→ 주문 미생성')
        print(f'거래처 미해소 {sum(no_client.values())}전표 {dest}:')
        for k, v in no_client.most_common(15):
            print(f'   {v:>3}  {k}')
    if no_item:
        print(f'품목 미해소 {sum(no_item.values())}라인 → item_id NULL 로 생성(품목명은 보존):')
        for k, v in no_item.most_common(15):
            print(f'   {v:>3}  {k}')
    if diverge:
        gap = sum(abs(a - b) for _, _, a, b in diverge)
        print(f'MES 자동산식과 금액 상이 {len(diverge)}/{n_lines}라인 (차 합 {gap:,.0f}원) '
              f'→ 이카운트 원본을 저장하고 line_discount 에 사유 기록')
        for s, nm, auto, amt in diverge[:8]:
            print(f'   {s} {nm[:22]:<24} 자동 {auto:>10,.0f} → 원본 {amt:>10,.0f}')
    for s, e in fails[:15]:
        print(f'   실패 {s}: {e}')


if __name__ == '__main__':
    main()
