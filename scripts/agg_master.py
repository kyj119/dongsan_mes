# -*- coding: utf-8 -*-
import sys, openpyxl
from collections import Counter, defaultdict
sys.stdout.reconfigure(encoding='utf-8')

# === 마스터 로드 원본 ===
wb = openpyxl.load_workbook("주문내역/표준품목_등록구조_수정본.xlsx", read_only=True, data_only=True)
ws = wb["등록데이터_수정본"]
rows = list(ws.iter_rows(values_only=True))
hdr = [str(c).strip() if c else "" for c in rows[0]]
print("HEADER:", hdr)
idx = {h: i for i, h in enumerate(hdr)}
def col(r, name):
    i = idx.get(name)
    return (str(r[i]).strip() if i is not None and i < len(r) and r[i] is not None else "")

data = rows[1:]
data = [r for r in data if any(c is not None and str(c).strip() for c in r)]
print("총 행:", len(data))

by_cat = Counter(col(r, "대분류") for r in data)
by_type = Counter(col(r, "item_type") for r in data)
by_pm = Counter(col(r, "pricing_method") for r in data)

print("\n[대분류 분포]")
for k, v in by_cat.most_common():
    print(f"  {v:>4}  {k}")
print("\n[item_type 분포]", dict(by_type))
print("[pricing_method 분포]", dict(by_pm))

# 대분류 x pricing_method 교차
print("\n[대분류 x pricing_method]")
cross = defaultdict(Counter)
for r in data:
    cross[col(r, "대분류")][col(r, "pricing_method")] += 1
for cat, c in sorted(cross.items(), key=lambda x: -sum(x[1].values())):
    print(f"  {cat:<10}", dict(c))

# 구분/조치 플래그
print("\n[구분 분포]", dict(Counter(col(r, "구분") for r in data)))
flagged = [(col(r,"item_code"), col(r,"item_name"), col(r,"대분류"), col(r,"비고/조치")) for r in data if col(r,"구분") or col(r,"비고/조치")]
print(f"[조치/구분 플래그 행: {len(flagged)}]")
for fc in flagged[:40]:
    print("   ", " | ".join(fc))
wb.close()

# === 통합본 시트1 마스터: 계층그룹 x 역할 ===
print("\n" + "="*60)
wb2 = openpyxl.load_workbook("주문내역/동산_품목표준화_통합본.xlsx", read_only=True, data_only=True)
ws2 = wb2["1.표준품목마스터"]
r2 = list(ws2.iter_rows(values_only=True))
h2 = [str(c).strip() if c else "" for c in r2[0]]
print("시트1 HEADER:", h2)
i2 = {h: i for i, h in enumerate(h2)}
d2 = [r for r in r2[1:] if any(c is not None and str(c).strip() for c in r)]
print("시트1 총 행:", len(d2))
def c2(r, name):
    i = i2.get(name); return (str(r[i]).strip() if i is not None and i < len(r) and r[i] is not None else "")
grp = Counter(c2(r, "계층그룹(분류)") for r in d2)
role = Counter(c2(r, "역할") for r in d2)
print("\n[시트1 계층그룹 분포]")
for k, v in grp.most_common():
    print(f"  {v:>4}  {k}")
print("\n[시트1 역할 분포]", dict(role))
wb2.close()
