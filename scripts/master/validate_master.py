# -*- coding: utf-8 -*-
# 품목 마스터 검증 — 구조 무결성. 에러 0 = 통과
import sys, os, re, openpyxl
from collections import Counter
sys.stdout.reconfigure(encoding='utf-8')

OUT = os.environ.get('MASTER_OUT', "품목마스터/업로드양식/품목업로드_최종.xlsx")
CATEGORIES = {'현수막','배너','깃발·기','시트·스티커','판재출력','출력물','간판','원자재','부속품'}
PRICING = {'AREA','FIXED','GRADE','COMPONENT'}
TYPES = {'PRODUCT','GOODS','MATERIAL'}
CODE_RE = re.compile(r'^[PGM]-\d{4}(-[A-Za-z0-9]+)?$')

wb = openpyxl.load_workbook(OUT, read_only=True, data_only=True)
def sheet(name):
    ws = wb[name]; rows = list(ws.iter_rows(values_only=True))
    h = [str(c).strip() if c else '' for c in rows[0]]
    return h, [dict(zip(h, [(_c if _c is not None else '') for _c in r])) for r in rows[1:] if any(c is not None for c in r)]

h1, master = sheet('품목마스터')
h2, groups = sheet('규격그룹')
h3, variants = sheet('변종전개_예시')
wb.close()

group_vals = {}
for gr in groups:
    group_vals.setdefault(str(gr['spec_group']), set()).add(str(gr['value_code']))

E, W = [], []
def err(m): E.append(m)
def warn(m): W.append(m)

# 코드 유니크 (master+변종)
all_codes = [str(x['item_code']) for x in master] + [str(x['item_code']) for x in variants]
dup = [c for c,n in Counter(all_codes).items() if n>1]
if dup: err(f"중복 item_code {len(dup)}: {dup[:10]}")

# master 행 검증
for x in master:
    c = str(x['item_code'])
    if not CODE_RE.match(c): err(f"코드형식 위반: {c}")
    if str(x['item_type']) not in TYPES: err(f"item_type 위반 {c}: {x['item_type']}")
    if str(x['category']) not in CATEGORIES: err(f"category 위반 {c}: {x['category']}")
    if str(x['pricing_profile']) not in PRICING: err(f"pricing 위반 {c}: {x['pricing_profile']}")
    sg = str(x['spec_group'])
    if sg and sg not in group_vals: err(f"spec_group 미정의 {c}: {sg}")
    if not str(x['item_group']): warn(f"item_group 빈값: {c}")

# spec_group ↔ category 정합성
SG_CAT = {'호수': {'깃발·기'}, '판재두께': {'원자재','판재출력'}, '원단폭': {'원자재'}}
for x in master:
    sg = str(x['spec_group']); cat = str(x['category'])
    if sg and cat not in SG_CAT.get(sg, set()):
        warn(f"spec_group↔category 불일치 {x['item_code']}: {sg}↔{cat}")

# 겸업 페어링 (출력 제품 ↔ 원판 자재)
jae = {re.sub(r'\s*원판$','',str(x['item_name'])).strip() for x in master if '겸업-자재' in str(x['note'])}
for x in master:
    if '겸업-제품' in str(x['note']):
        b = re.sub(r'\s*출력$','',str(x['item_name'])).strip()
        if b not in jae: err(f"겸업-제품 매칭 자재 없음: {x['item_code']} ({b})")

# 이름 중복
dupn = [n for n,k in Counter(str(x['item_name']) for x in master).items() if k>1]
if dupn: warn(f"중복 item_name {len(dupn)}: {dupn[:10]}")

# 변종전개 검증
base_codes = {str(x['item_code']) for x in master}
for v in variants:
    vc = str(v['item_code'])
    if '-' not in vc.split('-',1)[-1] and vc.count('-')<2:
        pass
    parts = vc.rsplit('-',1)
    base, suf = parts[0], parts[1] if len(parts)>1 else ''
    if base not in base_codes: err(f"변종 base 없음: {vc}")
    sg = str(v['spec_group'])
    if sg in group_vals and suf not in group_vals[sg]:
        err(f"변종 value_code 미정의 {vc}: {suf} not in {sg}")

# 원단폭 값 미정 경고
if not group_vals.get('원단폭') or group_vals.get('원단폭')=={'(값 미정)'}:
    warn("규격그룹 '원단폭' 값 미정 — 원단 변종 생성 불가")

print(f"[검증] 품목 {len(master)} / 변종 {len(variants)} / 그룹 {len(group_vals)}")
print(f"  ❌ ERROR {len(E)} / ⚠️ WARN {len(W)}")
for m in E[:30]: print("  ❌", m)
for m in W[:20]: print("  ⚠️", m)
print("RESULT:", "PASS ✅" if not E else "FAIL ❌")
sys.exit(0 if not E else 1)
