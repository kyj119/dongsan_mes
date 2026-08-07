# -*- coding: utf-8 -*-
"""선명(entity 2) 2026-07 이관 — 미등록 거래처 추출 + 등록 SQL 생성 (2026-08-07).

동산 7월(`clients_2607_new.sql`)과 같은 **2단계 매칭**을 쓴다. 한 단계만 보면 과다 등록된다:
  ① 사업자번호 — `client_code` 또는 `business_registration_number` 양쪽 다 본다
     (MES 는 이관 시기에 따라 코드에 사업자번호가 들어간 곳과 별도 컬럼에 있는 곳이 섞여 있다)
  ② 이름 정규화 — 주식회사/(주)/㈜/공백/괄호(지점표기) 제거 후 비교
     ⚠️ 선명 이카운트는 거래처명에 지역 접미사를 붙인다(「태성애드텍(청주)」 vs MES 「태성애드텍」).
        괄호를 떼지 않으면 같은 곳을 신규로 만든다.

사용: python docs/dongsan-import/gen_e2_clients.py <all_clients.json> <sales.xlsx>
산출: docs/dongsan-import/load/clients_2607_e2_new.sql (+ 롤백은 client_code 로 특정 가능)
"""
import openpyxl, json, sys, re, os, warnings
warnings.filterwarnings('ignore')
sys.stdout.reconfigure(encoding='utf-8')

ROOT = r'C:\Users\user\dongsan_mes'
sys.path.insert(0, os.path.join(ROOT, 'docs', 'dongsan-import'))
from normalize_client_code import normalize  # noqa

CLIENTS_JSON, XLSX = sys.argv[1], sys.argv[2]
LINE = re.compile(r'^\d{4}/\d\d/\d\d\s+-\d+$')
PAREN = re.compile(r'\([^)]*\)')


def nname(s):
    s = PAREN.sub('', str(s or ''))
    for t in ('주식회사', '(주)', '㈜', '유한회사', '（주）'):
        s = s.replace(t, '')
    return re.sub(r'\s+', '', s).strip()


cl = json.load(open(CLIENTS_JSON, encoding='utf-8'))
by_code = {str(c['client_code']).strip(): c for c in cl if c['client_code']}
by_brn = {str(c['brn']).strip(): c for c in cl if c['brn']}
by_name = {}
for c in cl:
    by_name.setdefault(nname(c['client_name']), c)

wb = openpyxl.load_workbook(XLSX)
ws = wb.active
seen = {}
for r in ws.iter_rows(min_row=3, values_only=True):
    if not LINE.match(str(r[0] or '').strip()):
        continue
    code = str(r[1] or '').strip()
    if not code:
        continue
    e = seen.setdefault(code, {'name': str(r[2] or '').strip(), 'n': 0})
    e['n'] += 1
wb.close()

miss, hit_name = [], []
for code, v in sorted(seen.items()):
    norm, _, rule, _ = normalize(code)
    cand = norm or code
    if cand in by_code or cand in by_brn or code in by_code or code in by_brn:
        continue
    m = by_name.get(nname(v['name']))
    if m:
        hit_name.append((code, v['name'], m['id'], m['client_name'], m['client_code']))
        continue
    miss.append((code, cand, v['name'], v['n'], rule))

print('■ 이름으로 걸린 곳 %d (신규 아님 — 기존 거래처에 붙인다)' % len(hit_name))
for c, n, i, mn, mc in hit_name:
    print('   %s %s  →  id=%s %s (%s)' % (c, n, i, mn, mc))
print('■ 진짜 신규 %d' % len(miss))
for c, cand, n, cnt, rule in miss:
    print('   %s → %s | %s | %d라인 | %s' % (c, cand, n, cnt, rule))

if miss:
    out = ['-- 선명(entity 2) 2026-07 이관 신규 거래처 %d곳 (2026-08-07)' % len(miss),
           '-- 생성기 = docs/dongsan-import/gen_e2_clients.py (2단계 매칭: 사업자번호 → 이름정규화)',
           '-- ⚠️ 선명 이카운트는 거래처명에 지역 접미사를 붙인다(「태성애드텍(청주)」). 괄호 제거 후 대조했다.',
           '-- 롤백 = DELETE FROM clients WHERE notes LIKE \'선명 이관 2026-07 신규%\';',
           '']
    for code, cand, name, cnt, rule in miss:
        nm = name.replace("'", "''")
        out.append("INSERT INTO clients (client_code, client_name, business_registration_number, is_active, notes) "
                   "VALUES ('%s', '%s', %s, 1, '선명 이관 2026-07 신규 (원본코드 %s · %s · %d라인)');"
                   % (cand, nm, ("'%s'" % cand) if len(re.sub(r'\D', '', cand)) == 10 else 'NULL', code, rule, cnt))
    p = os.path.join(ROOT, 'docs', 'dongsan-import', 'load', 'clients_2607_e2_new.sql')
    open(p, 'w', encoding='utf-8').write('\n'.join(out) + '\n')
    print('→', p)
