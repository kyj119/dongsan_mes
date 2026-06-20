# -*- coding: utf-8 -*-
# 판재두께 변종 전개 — base별 실제 주문 두께만 변종 생성(죽은변종 방지). 마이그 0328.
# 기준(2026-06-20): 주문 데이터의 {판재}×{두께}T 빈도 3회+ 만 변종. base=템플릿(spec_value NULL).
import openpyxl, sys, re
from collections import Counter, defaultdict
sys.stdout.reconfigure(encoding='utf-8')

ORDERS=['동산1.1~3.3.xlsx','동산3.3~4.15.xlsx','동산4.15~6.12.xlsx','선명(2)1.1~6.13.xlsx']
MIG="migrations/0328_panel_thickness_variants.sql"
THRESH=3  # 두께 빈도 임계 (노이즈 제거)
# 주문 판재명 → (수정본 base코드, base 제품명)
BASE_MAP={
 '포맥스':('P-0133','포맥스 출력'),
 '아크릴':('P-0135','아크릴 출력'),
 '자작나무':('P-0077','자작나무 출력'),
 '스카시':('P-0143','스카시 포맥스 출력'),
 '광학산PC':('P-0102','광학산PC 출력'),
 '폼보드':('P-0134','폼보드 출력'),
}
def norm(n):
    n=re.sub(r'\s*\[[^\]]*\]','',str(n)); return re.sub(r'\s+',' ',n).strip()
def sqlstr(s): return "NULL" if s is None else "'"+str(s).replace("'","''")+"'"

# 주문에서 판재별 두께 추출
THK=re.compile(r'(\d+)\s*[Tt](?![a-zA-Z])')
mat_thk=defaultdict(Counter)
for f in ORDERS:
    wb=openpyxl.load_workbook('품목마스터/원천주문데이터/'+f, read_only=True, data_only=True)
    for i,row in enumerate(wb['주문서현황내역'].iter_rows(values_only=True)):
        if i<2 or row[3] is None: continue
        nm=norm(row[3]); m=THK.search(nm)
        if not m: continue
        t=m.group(1)+'T'; base=nm[:m.start()].strip()
        base=re.sub(r'(백색|투명|흑색|회색|유백|칼라).*$','',base).strip().split('-')[0].split('+')[0].strip()
        if base: mat_thk[base][t]+=1

# base별 변종 두께 확정 (임계 적용), 정렬(숫자)
def tnum(t): return int(t[:-1])
variants={}   # base코드 → [두께들]
all_vals=set()
for mat,(code,name) in BASE_MAP.items():
    ths=sorted([t for t,c in mat_thk.get(mat,{}).items() if c>=THRESH], key=tnum)
    if ths: variants[mat]=(code,name,ths); all_vals.update(ths)

# 마이그 SQL
L=["-- 0328: 판재두께 변종 전개 (포맥스·아크릴·자작나무·스카시·광학산PC·폼보드)",
 "-- base별 실제 주문 두께만(빈도 3+). base=템플릿(spec_value NULL), 변종=두께별 독립품목.",
 "-- 전부 is_active=0 staged. spec_group_id=판재두께. 단가(base_price)는 후속.",
 "-- 비파괴: NOT EXISTS 가드. 변종 코드 = {base}-{두께}.",""]
# 1) 판재두께 값 보강 (6·9·12·20·30T 등 — 자작나무/스카시용)
L.append("-- 1) 판재두께 그룹값 보강 (base별 실제 두께 union)")
for v in sorted(all_vals, key=tnum):
    L.append(
    f"INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)\n"
    f"SELECT (SELECT id FROM spec_groups WHERE name='판재두께'), '{v}', '{v}', {tnum(v)}, 1\n"
    f"WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='판재두께' AND sgv.value_code='{v}');")
# 2) base 템플릿 + 변종
SG="(SELECT id FROM spec_groups WHERE name='판재두께')"
CAT="(SELECT id FROM item_categories WHERE category_name='판재출력')"
nb=nv=0
for mat,(code,name,ths) in variants.items():
    L.append(f"\n-- {name} ({code}): {', '.join(ths)}")
    # base 템플릿 (spec_group_id 연결, spec_value NULL, is_active=0)
    L.append(
    f"INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,item_group)\n"
    f"SELECT {sqlstr(code)},{sqlstr(name)},'PRODUCT',{CAT},'AREA','AREA',1,0,1,'EA',0,{SG},{sqlstr(name)}\n"
    f"WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code={sqlstr(code)});")
    L.append(
    f"UPDATE items SET spec_group_id={SG}, item_group={sqlstr(name)} WHERE item_code={sqlstr(code)} AND spec_group_id IS NULL;")
    nb+=1
    for t in ths:
        vcode=f"{code}-{t}"; vname=f"{name} {t}"
        L.append(
        f"INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)\n"
        f"SELECT {sqlstr(vcode)},{sqlstr(vname)},'PRODUCT',{CAT},'AREA','AREA',1,0,1,'EA',0,{SG},'{t}',{sqlstr(name)}\n"
        f"WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code={sqlstr(vcode)});")
        nv+=1
with open(MIG,'w',encoding='utf-8') as f: f.write("\n".join(L)+"\n")

print(f"마이그: {MIG}")
print(f"  판재두께 값 보강: {sorted(all_vals,key=tnum)}")
print(f"  base 템플릿 {nb} / 변종 {nv}")
for mat,(code,name,ths) in variants.items():
    print(f"  {code} {name}: {', '.join(ths)} ({len(ths)})")
