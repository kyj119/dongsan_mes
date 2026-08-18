# -*- coding: utf-8 -*-
"""zscan-link-orders.py — Z: 작업파일 ↔ 이미 생성된 주문 라인 연결

무엇을 하나:
  `ecount-order-import.py` 가 만든 주문(이카운트 원천)의 각 라인에, Z: 에 있는 실제 작업파일을
  붙인다(`order_ai_files` kind='source'). 주문 상세의 `line_files` 로 화면에 뜬다.

왜 대기함(`designer_intakes`)을 안 쓰나:
  대기함은 **가공대기함** = 아직 안 한 일이 서는 곳이다. 이미 출력·출고까지 끝난 지난 날짜의
  파일 1,300여 건을 거기에 밀어 넣으면 디자이너 화면이 완료된 일로 덮인다. 지난 건은
  「주문 라인에 붙은 원본파일」이 맞는 표현이다.
  ⚠️ **카드 썸네일은 이 경로로 안 붙는다** — `cards.thumbnail_url` 은 주문 생성 시점에
     `order_items.ai_analysis_id` 를 타고만 채워진다(`orders/create.ts` C블록). 소급 경로가 없다.
     8/12 이후분은 「스캔 → 대기함 → 주문 생성 때 연결」 순서라야 썸네일이 자동으로 붙는다.

매칭 규칙 — **증거가 분명할 때만** 붙인다:
  같은 날(±창) · 같은 거래처 · 규격(가로×세로, 뒤집힘 허용) 일치를 점수화해
  (파일그룹, 주문라인) 쌍을 전역 1:1 배정한다. 애매하면 안 붙인다 —
  잘못 붙은 파일은 없는 것보다 나쁘다(다음 사람이 그 파일로 재출력한다).

사용법:
  node scripts/zscan-intake.cjs --from 2026-08-01 --to 2026-08-11 --json files.json
  python scripts/zscan-link-orders.py --files files.json --from 2026-08-01 --to 2026-08-11 \
         --url https://webapp-9i0.pages.dev [--apply]
"""
import argparse, io, json, os, re, subprocess, sys, urllib.request
from collections import Counter, defaultdict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/126.0 Safari/537.36')
RX_LEGAL = re.compile(r'\(주\)|주식회사|㈜|유한회사|주\)')
MARKER = '이카운트 주문서 자동생성'
# 재출력·수정·샘플은 **새 주문이 아니다**(docs/REWORK_RULES.md) → 연결 대상에서 뺀다.
REWORK = {'수정', '재출력', '재', '샘플'}
W_SPEC, W_CLIENT, W_QTY, W_DATE = 3.0, 2.0, 1.0, 0.4
MIN_SCORE = 3.0          # 규격 일치 없이는 절대 안 붙인다


def nrm(s):
    s = RX_LEGAL.sub('', str(s or '').strip().lower())
    return re.sub(r'[\s\-_.,/()\[\]]+', '', s)


def api(base, path, token=None, payload=None):
    req = urllib.request.Request(
        base.rstrip('/') + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={'Content-Type': 'application/json', 'User-Agent': UA,
                 **({'Authorization': 'Bearer ' + token} if token else {})},
        method='POST' if payload is not None else 'GET')
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return {'success': False, 'error': f'HTTP {e.code}', 'body': e.read().decode()[:300]}


def page_all(base, tok, path, limit=200):
    """오류를 빈 페이지로 삼키면 조용히 잘린다 → 재시도 후 중단."""
    out, page = [], 1
    while True:
        sep = '&' if '?' in path else '?'
        r = None
        for _ in range(3):
            r = api(base, f'{path}{sep}page={page}&limit={limit}', tok)
            if not (isinstance(r, dict) and r.get('success') is False):
                break
        if isinstance(r, dict) and r.get('success') is False:
            print(f'[중단] {path} page={page}: {r}')
            sys.exit(1)
        rows = r.get('data') or []
        # ⚠️ `data` 모양이 라우트마다 다르다 — /api/orders 는 리스트, /api/clients 는 dict.
        #    한쪽만 가정하면 터지거나(여기서 실제로 터졌다) 조용히 0건이 된다.
        if isinstance(rows, dict):
            rows = rows.get('clients') or rows.get('items') or rows.get('list') or []
        out.extend(rows)
        if len(rows) < limit:
            return out
        page += 1
        if page > 100:
            print(f'[중단] {path} 페이지 상한 초과')
            sys.exit(1)


def skey(w, h):
    a, b = sorted([round(float(w)), round(float(h))])
    return (a, b)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--files', required=True, help='zscan-intake --json 산출물')
    ap.add_argument('--from', dest='d_from', required=True)
    ap.add_argument('--to', dest='d_to', required=True)
    ap.add_argument('--url', default='http://localhost:3000')
    ap.add_argument('--user', default=os.environ.get('SMOKE_USER', 'admin'))
    ap.add_argument('--pass', dest='pw', default=os.environ.get('SMOKE_PASS', 'password'))
    ap.add_argument('--window', type=int, default=3, help='주문일 ± 허용 일수')
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--dump', help='배정 결과를 JSON 으로 (기존 연결과 대조용)')
    ap.add_argument('--prune-sql', dest='prune_sql',
                    help='지금 배정과 다른 기존 연결을 지우는 SQL 을 파일로 (직접 실행하지 않는다)')
    a = ap.parse_args()

    files = json.load(io.open(a.files, encoding='utf-8'))
    files = [f for f in files if a.d_from <= f['date'] <= a.d_to]
    live = [f for f in files if (f.get('flag') or '') not in REWORK]
    print(f'파일 {len(files)}건 (재출력·수정 {len(files)-len(live)}건 제외 → {len(live)})')

    base = a.url.rstrip('/')
    r = api(base, '/api/auth/login', payload={'username': a.user, 'password': a.pw})
    tok = (r.get('data') or {}).get('token')
    if not tok:
        print(f'로그인 실패: {r}')
        sys.exit(1)

    # 주문 + 라인
    orders = [o for o in page_all(base, tok, f'/api/orders?date_from={a.d_from}&date_to={a.d_to}')
              if MARKER in str(o.get('notes') or '')]
    print(f'대상 주문 {len(orders)}건 — 라인 조회 중…')
    lines = []
    for o in orders:
        d = api(base, f"/api/orders/{o['id']}", tok).get('data') or {}
        for it in (d.get('items') or []):
            if it.get('width') and it.get('height'):
                lines.append({'order_id': o['id'], 'item_id': it['id'],
                              'client_id': o['client_id'], 'date': o['order_date'],
                              'w': it['width'], 'h': it['height'],
                              'qty': it.get('quantity') or 1,
                              'name': it.get('item_name') or '',
                              'has_file': bool(it.get('line_files')),
                              # `kind|file_name|file_path` 줄바꿈 구분 — 기존 연결 정리(--prune-sql)에 쓴다
                              'existing': [ln.split('|', 2) for ln in
                                           str(it.get('line_files') or '').split('\n') if ln.strip()]})
    print(f'규격 보유 주문라인 {len(lines)}건 (이미 파일 붙은 것 {sum(l["has_file"] for l in lines)})')

    # 거래처 해소 — 파일의 거래처 표기를 마스터 id 로
    cidx = {}
    for c in page_all(base, tok, '/api/clients?active=all'):
        cidx.setdefault(nrm(c.get('client_name')), c['id'])
        for kw in str(c.get('search_keywords') or '').replace(',', '|').split('|'):
            if kw.strip():
                cidx.setdefault(nrm(kw), c['id'])

    # ── 묶음(1라인 : N파일)을 전제로 배정한다 ────────────────────────
    # 주문서는 「현수막(조립) 500×90 × 280장」 한 줄인데 파일은 디자인마다 따로 있다
    # (오케이애드공사 8/5 = 라인 1개 : 파일 7개). 실측 8/1~8/11 = 묶음 123그룹 370파일.
    # 그래서 **파일이 주체**다 — 파일 하나는 라인 하나에만 붙고, 라인은 파일 여러 개를 받는다.
    #
    # ★규격 없는 파일이 실재한다 — 오케이애드 파일명은 `센트럴시티 1본 2팀 0706_60.eps` 로
    #   규격 표기가 아예 없다. 규격을 필수로 두면 이런 묶음은 통째로 후보에서 빠진다.
    #   대신 **그날 그 거래처 라인이 정확히 1개일 때만** 붙인다(모호하면 안 붙인다).
    def ddays(d1s, d2s):
        return abs((int(d1s[8:10]) - int(d2s[8:10])) + (int(d1s[5:7]) - int(d2s[5:7])) * 31)

    groups = defaultdict(list)                 # (client_id, spec|None, date) → [file idx]
    no_client = 0
    for fi, f in enumerate(live):
        fcid = cidx.get(nrm(f['client'])) if f['client'] else None
        if not fcid:
            no_client += 1                     # 거래처 미상은 자동 연결 안 한다(오배정이 없느니만 못하다)
            continue
        sp = skey(f['w'], f['h']) if (f['w'] and f['h']) else None
        groups[(fcid, sp, f['date'])].append(fi)

    matched, amb_bulk = [], 0
    for (cid_, sp, fdate), fis in groups.items():
        cands = [li for li, ln in enumerate(lines)
                 if ln['client_id'] == cid_ and ddays(ln['date'], fdate) <= a.window
                 and (sp is None or skey(ln['w'], ln['h']) == sp)]
        # ★날짜가 가까운 쪽을 먼저 본다. 창을 3일로 두면 같은 거래처의 **어제·오늘 주문이 둘 다**
        #   후보가 되어 멀쩡한 건이 「모호」로 빠진다(오케이애드공사 8/5·8/6 = 각각 라인 1개인데
        #   둘 다 잡혀 통째로 미연결됐다). 최근접 일자 집합만 남기면 그대로 유일해진다.
        if len(cands) > 1:
            best_d = min(ddays(lines[li]['date'], fdate) for li in cands)
            cands = [li for li in cands if ddays(lines[li]['date'], fdate) == best_d]
        if len(cands) == 1:
            for fi in fis:                     # 유일 → 그룹 전체를 그 라인에 (1:N)
                matched.append((fi, cands[0], W_SPEC + W_CLIENT))
        elif len(cands) > 1:
            # 모호 — 보수적으로 1:1 그리디(점수 = 규격+거래처+수량−날짜차)
            amb_bulk += 1
            pool = list(cands)
            for fi in fis:
                if not pool:
                    break
                f = live[fi]
                best = max(pool, key=lambda li: (W_SPEC if sp else 0) + W_CLIENT
                           + (W_QTY if f['qty'] == lines[li]['qty'] else 0)
                           - ddays(lines[li]['date'], fdate) * W_DATE)
                if sp is None:
                    break                      # 규격도 없고 라인도 여러 개면 근거가 없다
                pool.remove(best)
                matched.append((fi, best, W_SPEC + W_CLIENT))

    # ── 2차: 거래처 미해소 파일 ──────────────────────────────────────
    # 파일명 판독은 99% 되지만 **마스터 해소는 58%** 다(표기 차이·미등록). 여기서 통째로 빼면
    # 커버리지가 반토막 난다(실측 499→294). 그래서 규격+날짜만으로 한 번 더 줍되,
    # **1차에서 파일을 못 받은 라인**에만 1:1 로 붙인다 — 이미 근거 있는 배정을 덮지 않는다.
    used_f = {fi for fi, _, _ in matched}
    filled = {li for _, li, _ in matched}
    pairs2 = []
    for fi, f in enumerate(live):
        if fi in used_f or not (f['w'] and f['h']):
            continue
        if f['client'] and cidx.get(nrm(f['client'])):
            continue                            # 1차에서 다뤄진 축
        for li, ln in enumerate(lines):
            if li in filled or skey(ln['w'], ln['h']) != skey(f['w'], f['h']):
                continue
            dd = ddays(ln['date'], f['date'])
            if dd > a.window:
                continue
            s = W_SPEC + (W_QTY if f['qty'] == ln['qty'] else 0) - dd * W_DATE
            if s >= MIN_SCORE:
                pairs2.append((s, fi, li))
    pairs2.sort(key=lambda x: -x[0])
    taken_l = set()
    for s, fi, li in pairs2:
        if fi in used_f or li in taken_l:
            continue
        used_f.add(fi); taken_l.add(li); matched.append((fi, li, s))
    print(f'  2차(거래처 미상·규격 기반) {len(taken_l)}건 추가')

    per_line = Counter(li for _, li, _ in matched)
    print(f'\n연결 후보 {len(matched)} / 파일 {len(live)} ({len(matched)/max(len(live),1)*100:.1f}%)'
          f' · 주문라인 {len(per_line)}/{len(lines)} ({len(per_line)/max(len(lines),1)*100:.1f}%)')
    print(f'  거래처 미상으로 제외 {no_client} · 모호 그룹 {amb_bulk} · '
          f'라인당 최다 파일 {max(per_line.values()) if per_line else 0}')
    # ── 정리 SQL: 지금 배정과 다른 기존 연결을 지운다 ─────────────────
    # 알고리즘을 고치면(1:1 → 묶음) 예전 배정이 **틀린 라인에 남는다**. 붙은 파일은 다음 사람이
    # 그걸로 재출력하는 근거라 「없느니만 못한」 오배정이다. 삭제 API 가 없어 SQL 로 낸다.
    # 키 = (order_item_id, kind, file_path) — order_ai_files 의 멱등 키와 같다.
    if a.prune_sql:
        # ⚠️ 기존 연결을 `/api/orders/:id` 의 line_files 로 읽으면 **0건**이다 — 그 라우트는
        #    line_files 를 아예 안 내려준다(dxf_* 만). 실제 행은 D1 에서 직접 읽는다.
        want = defaultdict(set)
        for fi, li, _ in matched:
            want[lines[li]['item_id']].add(live[fi]['full'])
        p = subprocess.run(
            ['npx', 'wrangler', 'd1', 'execute', 'webapp-production', '--remote', '--json', '--command',
             "SELECT f.id, f.order_item_id oi, f.file_path fp FROM order_ai_files f "
             "JOIN orders o ON o.id=f.order_id "
             f"WHERE o.notes LIKE '{MARKER}%' AND f.kind='source'"],
            cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            capture_output=True, shell=(os.name == 'nt'))
        t = p.stdout.decode('utf-8', 'replace')
        if t.find('[') < 0:
            print(f'[중단] 기존 연결 조회 실패: {t[:300]}')
            sys.exit(1)
        rows = json.loads(t[t.find('['):])[0]['results']
        stale = [r for r in rows if r['fp'] not in want[r['oi']]]
        io.open(a.prune_sql, 'w', encoding='utf-8').write(
            '\n'.join(f"DELETE FROM order_ai_files WHERE id = {r['id']};" for r in stale))
        print(f'  → 기존 {len(rows)}건 중 지금 배정과 다른 {len(stale)}건 정리 SQL: {a.prune_sql}')

    if a.dump:
        io.open(a.dump, 'w', encoding='utf-8').write(json.dumps(
            [{'oi': lines[li]['item_id'], 'fp': live[fi]['full']} for fi, li, _ in matched]))
        print(f'  → 배정 결과 {len(matched)}건: {a.dump}')

    if not a.apply:
        for fi, li, s in matched[:8]:
            f, ln = live[fi], lines[li]
            print(f"  {s:.1f}  {ln['name'][:14]:<16}{ln['w']:.0f}x{ln['h']:.0f} ← {f['name'][:56]}")
        print('\n[dry-run] 붙이지 않습니다. 실제 연결은 --apply.')
        return

    ok = dup = fail = 0
    for fi, li, _s in matched:
        f, ln = live[fi], lines[li]
        r = api(base, f"/api/orders/items/{ln['item_id']}/files", tok,
                payload={'file_path': f['full'], 'file_name': f['name'], 'kind': 'source'})
        if r.get('success'):
            dup += 1 if (r.get('data') or {}).get('duplicated') else 0
            ok += 1
        else:
            fail += 1
            if fail <= 5:
                print(f"  실패 line={ln['item_id']}: {str(r)[:140]}")
    print(f'\n연결 {ok} (그중 기존 {dup}) · 실패 {fail}')

    unmatched_f = [live[i] for i in range(len(live)) if i not in used_f]
    print(f'미연결 파일 {len(unmatched_f)} · 파일 없는 주문라인 {len(lines)-len(per_line)}')
    cnt = Counter(f['date'] for f in unmatched_f)
    print('미연결 파일 일자분포:', dict(sorted(cnt.items())))


if __name__ == '__main__':
    main()
