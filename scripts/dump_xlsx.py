# -*- coding: utf-8 -*-
import sys, openpyxl
sys.stdout.reconfigure(encoding='utf-8')

files = [
    "주문내역/동산_품목표준화_통합본.xlsx",
    "주문내역/표준품목_등록구조_수정본.xlsx",
    "주문내역/등록데이터_QA검토.xlsx",
    "품목등록_동산.xlsx",
]

MAXROW, MAXCOL, CELL = 45, 14, 28

def cell(v):
    if v is None: return ""
    s = str(v).replace("\n", " ").strip()
    return s[:CELL]

for f in files:
    print("\n" + "=" * 80)
    print("FILE:", f)
    print("=" * 80)
    try:
        wb = openpyxl.load_workbook(f, read_only=True, data_only=True)
    except Exception as e:
        print("  !! load error:", e); continue
    print("SHEETS:", wb.sheetnames)
    for ws in wb.worksheets:
        print("\n--- SHEET:", ws.title, "---")
        n = 0
        for row in ws.iter_rows(values_only=True):
            vals = [cell(v) for v in row[:MAXCOL]]
            while vals and vals[-1] == "":
                vals.pop()
            if not vals:
                continue
            print(f"r{n:>2}|", " | ".join(vals))
            n += 1
            if n >= MAXROW:
                print("   ...(truncated)")
                break
    wb.close()
