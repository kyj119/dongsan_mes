# -*- coding: utf-8 -*-
"""동산 이카운트 통장거래내역(1~6월) → bank_transactions 적재 + 이관 수금(payments) 매칭 SQL 생성기.

전례 = 선명 09_bank_transactions.sql. 이중 방지 2겹:
  ① 계좌별 기간 컷 — 바로빌 수집 시작일 전날까지만 적재(하나·기업 ≤05/31 · 우리 ≤06/01 · 나머지 ≤06/30)
  ② content_key UNIQUE + INSERT OR IGNORE — 재실행 멱등
매칭 = 파일 `회계전표` ↔ payments.reference_number(원천 전표번호) + 거래처코드→client_id + 금액 3중 일치.
  matched_payment_id 는 UNIQUE — 수금 1건은 통장 1건에만 배정(used-once 풀).
롤백 = codef_transaction_id 'ECNT1-*' 마커.

사용: python gen_bank_sql.py <clients_ids.json> <pay_all.json>
"""
import openpyxl, json, sys, re, os, hashlib, csv
from collections import defaultdict

sys.stdout.reconfigure(encoding='utf-8')
ROOT = r'C:\Users\user\dongsan_mes'
OUT = os.path.join(ROOT, 'docs', 'dongsan-import', 'load')
sys.path.insert(0, os.path.join(ROOT, 'docs', 'dongsan-import'))
from normalize_client_code import normalize  # noqa

CLIENTS_JSON, PAY_JSON = sys.argv[1], sys.argv[2]
PATH = os.path.join(ROOT, '품목마스터', '원천주문데이터', '동산_통장거래내역_2601-2606.xlsx')

# 계좌 매핑: 마스킹 → (bank_accounts.id, 적재 상한일) — prod 실측 2026-07-31
ACC = {
    '353***05887704': (2, '2026/05/31'),   # 하나 — 수집 06/01~
    '572***81104010': (6, '2026/05/31'),   # 기업 — 수집 06/01~
    '100***1393607': (5, '2026/06/01'),    # 우리 — 수집 06/02~
    '451***300721': (16, '2026/06/30'),    # 전북 — 수집 07/01~
    '140***489827': (15, '2026/06/30'),    # 신한 — 수집 07/01~
    '722***01349041': (13, '2026/06/30'),  # 국민 — 수집 07/08~
    '480***18772': (12, '2026/06/30'),     # 농협 법인 — 수집 07/01~
    '087***05285': (17, '2026/06/30'),     # 농협 개인(대표) — 수집 등록 2026-07-31
    '717***12618': (14, '2026/06/30'),     # SC제일 — 수집 07/01~
}
SKIP = {'100***1393604', ''}               # 우리동산2(무실적 0원 2건) · 빈 계좌(기간 밖 1행)

# ── 거래처 해석 (기존 생성기와 동일) ───────────────────────────────────
_cl = json.load(open(CLIENTS_JSON, encoding='utf-8-sig'))[0]['results']
BY_CODE = {str(c['client_code']).strip(): c['id'] for c in _cl if c['client_code']}
BY_BRN = {str(c['brn']).strip(): c['id'] for c in _cl if c['brn']}
_reg = list(csv.DictReader(open(os.path.join(ROOT, 'docs', 'dongsan-import', '점검1b_미등록거래처_등록용.csv'),
                                encoding='utf-8-sig')))
BY_SRC = {r['이카운트코드']: r['client_code'] for r in _reg if not r['이카운트코드'].startswith('(')}
RRN = re.compile(r'^\d{6}-\d{7}$')
BY_HASH = {r['원본코드해시']: r['client_code'] for r in _reg if r['원본코드해시']}


def resolve(cc):
    if not cc:
        return None
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


# ── 이관 수금 풀 (used-once) ──────────────────────────────────────────
pays = json.load(open(PAY_JSON, encoding='utf-8-sig'))[0]['results']


def nslip(s):
    return re.sub(r'[\s]', '', str(s or '').replace('/', '-'))


pool = defaultdict(list)
for p in pays:
    pool[(nslip(p['ref']), p['client_id'], int(p['a']))].append(p['id'])
print(f'수금 풀 {len(pays):,}건')

# ── 파일 로드 ─────────────────────────────────────────────────────────
wb = openpyxl.load_workbook(PATH, data_only=True)
ws = wb.worksheets[0]
rows = list(ws.iter_rows(values_only=True))
hdr_i = next(i for i, r in enumerate(rows) if r and '구분' in [str(v or '').strip() for v in r])
ix = {str(v or '').strip(): i for i, v in enumerate(rows[hdr_i]) if v}
DT = re.compile(r'^(\d{4})/(\d\d)/(\d\d)\s*(오전|오후)?\s*(\d{1,2}):(\d\d):(\d\d)?')

data = []
cut_excluded = defaultdict(lambda: [0, 0])
skipped = [0, 0]
for r in rows[hdr_i + 1:]:
    raw_d = str(r[ix['입/출금일자']] or '').strip()
    m = DT.match(raw_d)
    if not m:
        continue
    accno = str(r[ix['계좌번호']] or '').strip()
    if accno in SKIP:
        skipped[0] += 1
        continue
    assert accno in ACC, f'미매핑 계좌: {accno}'
    aid, cutoff = ACC[accno]
    d10 = f'{m.group(1)}/{m.group(2)}/{m.group(3)}'
    amt = r[ix['금액']] if isinstance(r[ix['금액']], (int, float)) else 0
    if d10 > cutoff:
        cut_excluded[accno][0] += 1
        cut_excluded[accno][1] += amt
        continue
    hh = int(m.group(5)) % 12 + (12 if m.group(4) == '오후' else 0)
    data.append(dict(
        aid=aid, date=m.group(1) + m.group(2) + m.group(3),
        time=f'{hh:02d}:{m.group(6)}:{m.group(7) or "00"}',
        typ='DEPOSIT' if str(r[ix['구분']] or '').strip() == '입금' else 'WITHDRAWAL',
        amt=int(round(amt)),
        bal=r[ix['원화잔액']] if isinstance(r[ix['원화잔액']], (int, float)) else None,
        who=str(r[ix['입금처(출금처)']] or '').strip(),
        code=str(r[ix['거래처코드']] or '').strip(),
        slip=str(r[ix['회계전표']] or '').strip()))
wb.close()
print(f'적재 대상 {len(data):,}행 · 컷 제외 {sum(v[0] for v in cut_excluded.values())}행'
      f'(하나/기업/우리 6월 수집중복 방지) · 스킵 {skipped[0]}행(무실적·기간밖)')

# ── 매칭 ──────────────────────────────────────────────────────────────
mt = [0, 0]
for x in data:
    x['pid'] = None
    x['cid'] = resolve(x['code'])
    if x['typ'] != 'DEPOSIT' or not x['slip'] or x['cid'] is None:
        continue
    k = (nslip(x['slip']), x['cid'], x['amt'])
    if pool.get(k):
        x['pid'] = pool[k].pop()
        mt[0] += 1
        mt[1] += x['amt']
dep = [x for x in data if x['typ'] == 'DEPOSIT']
print(f'수금 매칭: {mt[0]:,}건 {mt[1]:,}원 / 입금 {len(dep):,}건 {sum(x["amt"] for x in dep):,}원'
      f' ({mt[0]/max(len(dep),1)*100:.1f}%건 · {mt[1]/max(sum(x["amt"] for x in dep),1)*100:.1f}%금액)')
unm = [x for x in dep if not x['pid'] and x['slip']]
print(f'  전표 있는데 미매칭 입금: {len(unm)}건 {sum(x["amt"] for x in unm):,}원 (수금 아닌 회계전표·기수금분 등)')


def q(s):
    return re.sub(r'[\x00-\x08\x0b-\x1f]', ' ', str(s or '').replace("'", "''"))


buf = []
for i, x in enumerate(sorted(data, key=lambda v: (v['date'], v['time'])), 1):
    desc = x['slip'] + (f' · {x["code"]}' if x['code'] else '')
    bal = str(int(round(x['bal']))) if x['bal'] is not None else 'NULL'
    if x['pid']:
        tail = f"'APPLIED',{x['cid']},{x['pid']},5,CURRENT_TIMESTAMP"
    else:
        tail = "'UNMATCHED',NULL,NULL,NULL,NULL"
    buf.append(
        "INSERT OR IGNORE INTO bank_transactions (bank_account_id,transaction_date,transaction_time,"
        "transaction_type,amount,balance_after,counterpart_name,description,codef_transaction_id,"
        "match_status,matched_client_id,matched_payment_id,matched_by,matched_at,entity_id) VALUES "
        f"({x['aid']},'{x['date']}','{x['time']}','{x['typ']}',{x['amt']},{bal},'{q(x['who'])}',"
        f"'{q(desc)}','ECNT1-{i:05d}',{tail},1);")

parts, part, size, idx = [], [], 0, 0
for l in buf:
    b = len(l.encode('utf-8')) + 1
    if size + b > 800_000:
        idx += 1
        parts.append((f'banktx_p{idx:02d}.sql', part))
        part, size = [], 0
    part.append(l)
    size += b
idx += 1
parts.append((f'banktx_p{idx:02d}.sql', part))
for name, lines in parts:
    with open(os.path.join(OUT, name), 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')
    print(f'{name}: {len(lines):,}문장')
with open(os.path.join(OUT, 'rollback_banktx.sql'), 'w', encoding='utf-8') as f:
    f.write("DELETE FROM bank_transactions WHERE codef_transaction_id LIKE 'ECNT1-%';\n")
print(f'\nSQL {len(buf):,}문장 → {OUT}')
