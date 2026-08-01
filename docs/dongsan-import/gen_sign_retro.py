# -*- coding: utf-8 -*-
"""간판 완제품 매출 NULL 소급 → 대표 품목(SIGN-*) 연결 SQL.

분류 규칙(용준님 승인 2026-08-01 — 프레임 신규/교체 분리 반영):
  스카시→SIGN-SCS / 돌출→SIGN-PRT / 채널(보강대·트러스 제외)→SIGN-CH / 기타→SIGN-ETC
  프레임간판: '완제' 표기 OR 판가≥90,000/㎡ → 신규(FRL/FRN), 그 외(규격 미파싱 포함=다수편) → 교체(FRL-R/FRN-R)
게이트: 전 라인 분류 해소·금액 합 보존(UPDATE는 item_id만). 멱등=item_id IS NULL 가드.
사용: python gen_sign_retro.py <retro_lines.json>
"""
import sys, json, re
from collections import Counter, defaultdict

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
OUT = r'C:\Users\user\dongsan_mes\docs\dongsan-import\load\sign_retro.sql'
AUDIT = r'C:\Users\user\dongsan_mes\docs\dongsan-import\load\sign_retro_audit.csv'
THRESH = 90000
PAT = re.compile(r'(\d{2,5})\s*[xX*×]\s*(\d{2,5})')


def per_m2(r):
    """P3 보정(2026-08-01): 'cm' 명시 ×10 · 미표기+판가≥500k/㎡+cm읽기 정상범위 → cm 재해석.
    (프레임 분기에서만 호출 — 3차원 규격(철제 입간판류)은 보정 제외)"""
    s = r['spec']
    m = PAT.search(s)
    if not m:
        return None
    w, h = int(m.group(1)), int(m.group(2))
    q = max(1, r['quantity'] or 1)
    if re.search(r'\d\s*cm', s, re.I):
        w, h = w * 10, h * 10
    elif 'mm' not in s.lower():
        if w < 100:
            w *= 10
        if h < 100:
            h *= 10
        a_mm = w * h / 1e6
        if a_mm > 0 and not re.search(r'\d+\s*[xX*×]\s*\d+\s*[xX*×]\s*\d+', s):
            unit_rev = r['amount'] / q
            if unit_rev / a_mm >= 500000 and 0.05 <= a_mm * 100 <= 60 and 3000 <= unit_rev / (a_mm * 100) <= 300000:
                w, h = w * 10, h * 10
    else:
        if w < 100:
            w *= 10
        if h < 100:
            h *= 10
    a = w * h / 1e6
    if not (0.05 <= a <= 60):
        return None
    return r['amount'] / q / a


def classify(r):
    n = r['item_name']
    if '스카시' in n:
        return 'SIGN-SCS', '스카시'
    if '돌출' in n:
        return 'SIGN-PRT', '돌출'
    if '프레임간판' in n:
        lit = '조명' in n and '비조명' not in n
        new = '완제' in n
        p = per_m2(r)
        why = '완제표기' if new else ''
        if not new and p is not None and p >= THRESH:
            new, why = True, f'판가 {p:,.0f}/㎡≥9만'
        if not new:
            why = f'판가 {p:,.0f}/㎡<9만' if p is not None else '규격 미파싱→다수편(교체)'
        code = ('SIGN-FRL' if lit else 'SIGN-FRN') + ('' if new else '-R')
        return code, why
    if '채널' in n and '보강대' not in n and '트러스' not in n:
        return 'SIGN-CH', '채널'
    return 'SIGN-ETC', '기타'


raw = open(sys.argv[1], encoding='utf-8', errors='replace').read()
m = re.search(r'\[\s*\{', raw)
rows, _ = json.JSONDecoder().raw_decode(raw[m.start():])
rows = rows[0]['results']

agg = defaultdict(lambda: [0, 0])
by_code = defaultdict(list)
audit = []
for r in rows:
    code, why = classify(r)
    by_code[code].append(r['id'])
    agg[code][0] += 1
    agg[code][1] += r['amount']
    audit.append((r['id'], r['item_name'], r['spec'], r['amount'], code, why))
total = sum(v[1] for v in agg.values())
assert sum(v[0] for v in agg.values()) == len(rows)
print(f'대상 {len(rows)}라인 {total:,}원')
for code, (n, amt) in sorted(agg.items(), key=lambda x: -x[1][1]):
    print(f'{amt:>12,} | n{n:>4} | {code}')

sql = ['-- 간판 완제품 매출 소급 연결 2026-08-01 · 생성기 gen_sign_retro.py',
       '-- 롤백: UPDATE order_items SET item_id=NULL WHERE item_id IN (SELECT id FROM items WHERE item_code LIKE \'SIGN-%\');', '']
for code, ids in sorted(by_code.items()):
    for i in range(0, len(ids), 80):
        chunk = ', '.join(str(x) for x in ids[i:i + 80])
        sql.append(
            f"UPDATE order_items SET item_id=(SELECT id FROM items WHERE item_code='{code}') "
            f"WHERE id IN ({chunk}) AND item_id IS NULL;")
sql.append('')
sql.append("SELECT i.item_code, COUNT(*) AS n, SUM(oi.amount) AS amt FROM order_items oi JOIN items i ON i.id=oi.item_id WHERE i.item_code LIKE 'SIGN-%' GROUP BY i.item_code ORDER BY amt DESC;")

with open(OUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(sql) + '\n')
import csv, os
with open(AUDIT, 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.writer(f)
    w.writerow(['order_item_id', '품명', '규격', '금액', '연결 코드', '분류 근거'])
    w.writerows(audit)
print(f'SQL {OUT} ({os.path.getsize(OUT)//1024}KB) · AUDIT {AUDIT}')
