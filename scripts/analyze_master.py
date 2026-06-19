# -*- coding: utf-8 -*-
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

# 1차 제외 규칙
def excluded(r):
    cat = g(r, "대분류"); gubun = g(r, "구분")
    if cat == "간판": return "간판(후속)"
    if gubun == "이름확인": return "이름확인"
    if gubun == "간판자재(후속)": return "간판자재(후속)"
    return None

inc = [r for r in data if not excluded(r)]
exc = [r for r in data if excluded(r)]
print(f"총 {len(data)} / 1차포함 {len(inc)} / 제외 {len(exc)}")
print("제외 사유:", dict(Counter(excluded(r) for r in exc)))
print("포함 대분류:", dict(Counter(g(r,'대분류') for r in inc)))
print("포함 item_type:", dict(Counter(g(r,'item_type') for r in inc)))
print("포함 pricing(원본):", dict(Counter(g(r,'pricing_method') for r in inc)))

# 겸업 페어링: 겸업-자재(원판) ↔ 겸업-제품(출력)
mat = [(g(r,'item_code'), g(r,'item_name')) for r in data if g(r,'구분')=='겸업-자재']
prod = [(g(r,'item_code'), g(r,'item_name')) for r in data if g(r,'구분')=='겸업-제품']
print(f"\n겸업-자재 {len(mat)} / 겸업-제품 {len(prod)}")
def base(name):
    return re.sub(r'\s*(원판|출력|평판)\s*$', '', name).strip()
mat_by_base = {}
for c,n in mat: mat_by_base.setdefault(base(n), []).append((c,n))
print("\n[겸업 페어 매칭 (제품 → 자재)]")
unmatched = []
for c,n in prod:
    b = base(n)
    m = mat_by_base.get(b)
    if m:
        print(f"  {c} {n:<22} → {m[0][0]} {m[0][1]}   (base='{b}')")
    else:
        unmatched.append((c,n,b)); print(f"  {c} {n:<22} → ❌ 매칭없음 (base='{b}')")
print("자재쪽 base 목록:", sorted(mat_by_base.keys()))
if unmatched: print("미매칭 제품:", unmatched)
wb.close()
