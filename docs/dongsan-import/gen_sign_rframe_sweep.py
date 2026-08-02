# -*- coding: utf-8 -*-
"""교체(-R) 그룹 대형 신규 전수 보정 SQL 생성 (0512).

근거(2026-08-02 실물 작업지시 12건 판독 — Z:\1. 광고물):
  ≥30만원 -R 라인의 표본 10거래처 전부 "후레임 제작(+까치발·뒷판·LED조립)" = 신규 제작.
  신규 프레임 도매 판가 = 30~75k/㎡ 로 P1의 '교체 가격대' 가정과 전면 겹침 → 판가 임계 분류 불성립.
  진짜 교체 실물 = 프랜즈 '천갈이 재작업'(소액 라인)·'재단' 표기 뿐.
규칙: FRL-R/FRN-R 이고 라인 금액 ≥ 300,000 → FRL/FRN 승격. 단 품명에 '재단|천갈이|교체' 포함 시 제외.
      30만 미만(107L·7.8M)은 교체 유지 — 진짜 원단 교체 대역(보수적).
사용: python gen_sign_rframe_sweep.py
"""
import csv, sys, os
sys.stdout.reconfigure(encoding='utf-8')
BASE = r'C:\Users\user\dongsan_mes\docs\dongsan-import'
SRC = os.path.join(BASE, 'load', 'sign_cost_lines.csv')
OUT = r'C:\Users\user\dongsan_mes\migrations\0512_sign_rframe_sweep.sql'
AUDIT = os.path.join(BASE, 'load', 'sign_rframe_sweep_audit.csv')
THRESH = 300000
EXCLUDE = ('재단', '천갈이', '교체')

flip = {'SIGN-FRL-R': [], 'SIGN-FRN-R': []}
audit, skipped = [], []
with open(SRC, encoding='utf-8-sig') as f:
    for r in csv.DictReader(f):
        code = r['유형']
        if code not in flip:
            continue
        amt = int(r['매출액'])
        if amt < THRESH:
            continue
        if any(k in r['품명'] for k in EXCLUDE):
            skipped.append((r['order_item_id'], r['품명'], amt))
            continue
        flip[code].append(int(r['order_item_id']))
        audit.append((r['order_item_id'], r['일자'], r['거래처'], r['품명'], r['규격'], amt,
                      code, code[:-2]))

n = sum(len(v) for v in flip.values())
total = sum(a[5] for a in audit)
print(f'승격 {n}라인 {total:,}원 (FRL {len(flip["SIGN-FRL-R"])} · FRN {len(flip["SIGN-FRN-R"])}) / 제외 {len(skipped)}건')
for s in skipped:
    print('  제외:', s)

L = ['-- 0512: 교체(-R) 그룹 대형 신규 전수 보정 — 실물 작업지시 12건 판독 근거 (생성기 gen_sign_rframe_sweep.py)',
     '-- 규칙: -R & 금액≥300,000 & 품명에 재단/천갈이/교체 없음 → 신규 승격. 30만 미만은 교체 유지(보수).',
     "-- 롤백: 아래 id 를 역방향 UPDATE (audit=load/sign_rframe_sweep_audit.csv)", '']
for src, dst in (('SIGN-FRL-R', 'SIGN-FRL'), ('SIGN-FRN-R', 'SIGN-FRN')):
    ids = flip[src]
    for i in range(0, len(ids), 80):
        chunk = ', '.join(str(x) for x in ids[i:i + 80])
        L.append(f"UPDATE order_items SET item_id=(SELECT id FROM items WHERE item_code='{dst}') "
                 f"WHERE id IN ({chunk}) AND item_id=(SELECT id FROM items WHERE item_code='{src}');")
L.append('')
L.append("SELECT i.item_code, COUNT(*) n, SUM(oi.amount) amt FROM order_items oi JOIN items i ON i.id=oi.item_id WHERE i.item_code LIKE 'SIGN-FR%' GROUP BY 1 ORDER BY 1;")

with open(OUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(L) + '\n')
with open(AUDIT, 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.writer(f)
    w.writerow(['order_item_id', '일자', '거래처', '품명', '규격', '금액', '기존', '변경'])
    w.writerows(audit)
print(f'SQL {OUT}\nAUDIT {AUDIT}')
