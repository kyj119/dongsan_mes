# -*- coding: utf-8 -*-
# P1b 마스터 로드 생성기: 표준품목_등록구조_수정본.xlsx → migrations/0325_item_master_load.sql
# 비파괴: 신규 코드(P/G/M-xxxx) NOT EXISTS 가드, category_id=NAME 서브쿼리(env 무관), 겸업 product_materials 링크.
import sys, openpyxl, re
from collections import Counter
sys.stdout.reconfigure(encoding='utf-8')

wb = openpyxl.load_workbook("주문내역/표준품목_등록구조_수정본.xlsx", read_only=True, data_only=True)
ws = wb["등록데이터_수정본"]
rows = list(ws.iter_rows(values_only=True))
hdr = [str(c).strip() if c else "" for c in rows[0]]
idx = {h: i for i, h in enumerate(hdr)}
def g(r, name):
    i = idx.get(name)
    return (str(r[i]).strip() if i is not None and i < len(r) and r[i] is not None else "")
data = [r for r in rows[1:] if any(c is not None and str(c).strip() for c in r)]

def excluded(r):
    if g(r,"대분류")=="간판": return "간판(후속)"
    if g(r,"구분")=="이름확인": return "이름확인"
    if g(r,"구분")=="간판자재(후속)": return "간판자재(후속)"
    return None
inc = [r for r in data if not excluded(r)]

def sq(s): return s.replace("'", "''")
def profile(pm):  # 실 단가 프로파일
    pm = pm.replace("*","").strip()
    return pm if pm in ("FIXED","AREA","GRADE","COMPONENT") else "FIXED"
def legacy_pm(pm):  # 레거시 컬럼은 CHECK(FIXED,AREA)만 허용
    return "AREA" if pm.replace("*","").strip()=="AREA" else "FIXED"
def flags(it):  # 결정 A: item_type→플래그 표준 매핑 (PRODUCT 판매/MATERIAL 매입/GOODS 둘다)
    return {"PRODUCT":(1,0,1), "MATERIAL":(0,1,0), "GOODS":(1,1,0)}.get(it,(1,0,1))

out = []
out.append("-- 0325: 품목 표준 마스터 1차 로드 (P1b)")
out.append("-- 원본: 표준품목_등록구조_수정본.xlsx (298행 중 1차 231행, 간판52·이름확인15 제외)")
out.append("-- 비파괴: item_code NOT EXISTS 가드 / category_id=대분류 NAME 서브쿼리(env id 무관)")
out.append("-- 겸업 14쌍: 원판(MATERIAL)+출력(PRODUCT) 2행 + product_materials 링크. 재고=원판 단일출처")
out.append("-- production_required: PRODUCT=1(제작)·MATERIAL/GOODS=0. ⚠️기성 PRODUCT(배너대 등) 후속 토글 검토")
out.append("-- ★is_active=0 (스테이징): picker(items.ts:88 is_active=1 필터)에 노출 안 됨. 라이브 무오염.")
out.append("--   활성화(is_active=1)는 P1c(기존103 dedup·매핑·단가) 후 go-live 단계에서 일괄.")
out.append("")
anomalies = []
for r in inc:
    code, name, it, cat = g(r,"item_code"), g(r,"item_name"), g(r,"item_type"), g(r,"대분류")
    unit = g(r,"unit") or "EA"
    pm0 = g(r,"pricing_method")
    if not code or not name or it not in ("PRODUCT","MATERIAL","GOODS") or not cat:
        anomalies.append((code,name,it,cat)); continue
    s,p,pr = flags(it)
    out.append(
        f"INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,"
        f"is_sales_item,is_purchase_item,production_required,unit,is_active)\n"
        f"SELECT '{sq(code)}','{sq(name)}','{it}',"
        f"(SELECT id FROM item_categories WHERE category_name='{sq(cat)}'),"
        f"'{legacy_pm(pm0)}','{profile(pm0)}',{s},{p},{pr},'{sq(unit)}',0\n"
        f"WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='{sq(code)}');")

# 겸업 링크
out.append("\n-- 겸업 product_materials 링크 (제품 출력 → 자재 원판)")
mat = {re.sub(r'\s*(원판|출력|평판)\s*$','',g(r,"item_name")).strip(): g(r,"item_code")
       for r in data if g(r,"구분")=="겸업-자재"}
links = 0
for r in data:
    if g(r,"구분")!="겸업-제품": continue
    pc = g(r,"item_code"); b = re.sub(r'\s*(원판|출력|평판)\s*$','',g(r,"item_name")).strip()
    mc = mat.get(b)
    if not mc: anomalies.append(("link-miss",g(r,"item_name"),b,"")); continue
    out.append(
        f"INSERT INTO product_materials (product_item_id,material_item_id,is_default)\n"
        f"SELECT (SELECT id FROM items WHERE item_code='{pc}' LIMIT 1),"
        f"(SELECT id FROM items WHERE item_code='{mc}' LIMIT 1),1\n"
        f"WHERE EXISTS (SELECT 1 FROM items WHERE item_code='{pc}') AND EXISTS (SELECT 1 FROM items WHERE item_code='{mc}')\n"
        f"  AND NOT EXISTS (SELECT 1 FROM product_materials WHERE product_item_id=(SELECT id FROM items WHERE item_code='{pc}' LIMIT 1) AND material_item_id=(SELECT id FROM items WHERE item_code='{mc}' LIMIT 1));")
    links += 1

with open("migrations/0325_item_master_load.sql","w",encoding="utf-8") as f:
    f.write("\n".join(out)+"\n")

print(f"생성: migrations/0325_item_master_load.sql")
print(f"  품목 INSERT: {len(inc)-len([a for a in anomalies if a[0] not in ('link-miss',)])} / 겸업 링크: {links}")
print(f"  item_type: {dict(Counter(g(r,'item_type') for r in inc))}")
print(f"  anomalies: {anomalies if anomalies else '없음'}")
wb.close()
