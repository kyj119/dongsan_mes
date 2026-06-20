# -*- coding: utf-8 -*-
# 호수 변종 전개 — base별 실제 주문 호수만(죽은변종 방지). 마이그 0329.
# 기준(2026-06-21): 주문 {기}×{N호[-M]} 빈도 3+ 만. 특수호수 4-1/7-1/8-1 그룹값 보강.
# 게양용/대형/영구용은 base로 합쳐짐(게양방식=후속 옵션). 깃발(P-0035)=이름확인 보류.
import openpyxl, sys, re
from collections import Counter, defaultdict
sys.stdout.reconfigure(encoding='utf-8')

ORDERS=['동산1.1~3.3.xlsx','동산3.3~4.15.xlsx','동산4.15~6.12.xlsx','선명(2)1.1~6.13.xlsx']
MIG="migrations/0329_flag_grade_variants.sql"
THRESH=3
# 주문 깃발명 → (수정본 base코드, base명)
BASE_MAP={
 '태극기':('P-0033','태극기'),
 '새마을기':('P-0039','새마을기'),
 '무재해기':('P-0060','무재해기'),
 '노인회기':('P-0044','노인회기'),
 '민방위기':('P-0050','민방위기'),
 '만국기':('P-0048','만국기'),
}
def norm(n):
    n=re.sub(r'\s*\[[^\]]*\]','',str(n)); return re.sub(r'\s+',' ',n).strip()
def sqlstr(s): return "NULL" if s is None else "'"+str(s).replace("'","''")+"'"
def vcode(ho):  # '7호'→7HO, '7호-1'→7HO1
    m=re.match(r'(\d+)호(?:-(\d+))?', ho); return m.group(1)+'HO'+(m.group(2) or '')
def label(ho):  # '7호-1'→'7-1호'
    m=re.match(r'(\d+)호(?:-(\d+))?', ho); return m.group(1)+('-'+m.group(2) if m.group(2) else '')+'호'
def sortkey(ho):
    m=re.match(r'(\d+)호(?:-(\d+))?', ho); return (int(m.group(1)), int(m.group(2) or 0))

# 주문 깃발×호수 추출
HO=re.compile(r'(\d+)\s*호(?:\s*[-]\s*(\d+))?')
mat_ho=defaultdict(Counter)
for f in ORDERS:
    wb=openpyxl.load_workbook('품목마스터/원천주문데이터/'+f, read_only=True, data_only=True)
    for i,row in enumerate(wb['주문서현황내역'].iter_rows(values_only=True)):
        if i<2 or row[3] is None: continue
        nm=norm(row[3]); m=HO.search(nm)
        if not m: continue
        ho=m.group(1)+'호'+('-'+m.group(2) if m.group(2) else '')
        base=re.sub(r'(\(.*)$','',nm[:m.start()]).strip().split('-')[0].strip()
        if base in BASE_MAP: mat_ho[base][ho]+=1

variants={}; all_vc={}
for mat,(code,name) in BASE_MAP.items():
    hos=sorted([h for h,c in mat_ho.get(mat,{}).items() if c>=THRESH], key=sortkey)
    if hos:
        variants[mat]=(code,name,hos)
        for h in hos: all_vc[vcode(h)]=(label(h), sortkey(h))

# 마이그
L=["-- 0329: 호수 변종 전개 (태극기·새마을기·무재해기·노인회기·민방위기·만국기)",
 "-- base별 실제 주문 호수만(빈도 3+). 특수호수 4-1/7-1/8-1 그룹값 보강.",
 "-- 전부 is_active=0 staged. spec_group_id=호수. 단가(base_price)=호수별, 후속.",
 "-- 게양용/대형/영구용=base 통합(게양방식 후속 옵션). 깃발(P-0035)=이름확인 보류.",""]
L.append("-- 1) 호수 그룹값 보강 (특수호수 등)")
for vc,(lb,sk) in sorted(all_vc.items(), key=lambda x:x[1][1]):
    so=sk[0]*10+sk[1]
    L.append(
    f"INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)\n"
    f"SELECT (SELECT id FROM spec_groups WHERE name='호수'), '{vc}', '{lb}', {so}, 1\n"
    f"WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='호수' AND sgv.value_code='{vc}');")
SG="(SELECT id FROM spec_groups WHERE name='호수')"
CAT="(SELECT id FROM item_categories WHERE category_name='깃발·기')"
nb=nv=0
for mat,(code,name,hos) in variants.items():
    L.append(f"\n-- {name} ({code}): {', '.join(label(h) for h in hos)}")
    L.append(
    f"INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,item_group)\n"
    f"SELECT {sqlstr(code)},{sqlstr(name)},'PRODUCT',{CAT},'FIXED','GRADE',1,0,1,'EA',0,{SG},{sqlstr(name)}\n"
    f"WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code={sqlstr(code)});")
    L.append(f"UPDATE items SET spec_group_id={SG}, item_group={sqlstr(name)} WHERE item_code={sqlstr(code)} AND spec_group_id IS NULL;")
    nb+=1
    for h in hos:
        vc=vcode(h); vcd=f"{code}-{vc}"; vname=f"{name} {label(h)}"
        L.append(
        f"INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)\n"
        f"SELECT {sqlstr(vcd)},{sqlstr(vname)},'PRODUCT',{CAT},'FIXED','GRADE',1,0,1,'EA',0,{SG},'{vc}',{sqlstr(name)}\n"
        f"WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code={sqlstr(vcd)});")
        nv+=1
with open(MIG,'w',encoding='utf-8') as f: f.write("\n".join(L)+"\n")

print(f"마이그: {MIG}")
print(f"  호수 그룹값 보강: {sorted(all_vc.keys(), key=lambda v:all_vc[v][1])}")
print(f"  base {nb} / 변종 {nv}")
for mat,(code,name,hos) in variants.items():
    print(f"  {code} {name}: {', '.join(label(h) for h in hos)} ({len(hos)})")
