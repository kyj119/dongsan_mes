# -*- coding: utf-8 -*-
"""간판 BOM P3 — 이관 매출(SIGN-*) × 표준 BOM × 실단가 → 자재 원가율 리포트.

입력(prod 스냅샷, load/ 헤더 쿼리 참조):
  load/sign_lines_snapshot.json  — SIGN-* 연결 order_items + 거래처/일자
  load/sign_bom_snapshot.json    — product_materials(usage 4컬럼) + 자재 base_price
  (0509 보정 반영본: LED 62/㎡ 실측·후렉스 113,750/롤=1,750/㎡·알마이트 19,000/장)

산식(usage_type — 0508 정의): FIXED_QTY=quantity | PER_AREA=area×param(개수는 ceil)
  | PER_AREA_SHEET=ceil(area/param)장 | PER_PERIMETER=ceil(둘레m/param)개
  | PER_LED=ceil(LED수/param)개 (LED수=같은 제품의 PER_AREA LED 행에서)
  | PER_WIDTH=ceil(가로m/param)개 | PER_AREA_ROLL=area/param롤(원단=㎡ 비례, ceil 안 함)

한계(리포트에 명시): ①자재만 — 인건비·시공·출력잉크 미포함 ②입체바/캡바는 간판 bbox
  둘레 기준(실제=글자 윤곽 둘레 — 과소. 2차 견적 BOM에서 해소) ③장물 ceil은 자투리
  공유 미반영(소형 과대) ④규격 미파싱 라인은 원가 미산정(커버리지 별도 표기).
사용: python gen_sign_cost_report.py
"""
import json, re, csv, math, os
from collections import defaultdict

import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
BASE = r'C:\Users\user\dongsan_mes\docs\dongsan-import'
LOAD = os.path.join(BASE, 'load')
OUT_CSV = os.path.join(LOAD, 'sign_cost_lines.csv')
OUT_MD = os.path.join(LOAD, 'sign_cost_summary.md')
PAT = re.compile(r'(\d{2,5})\s*[xX*×]\s*(\d{2,5})')

def load_results(path):
    raw = open(path, encoding='utf-8', errors='replace').read()
    m = re.search(r'\[\s*\{', raw)
    data, _ = json.JSONDecoder().raw_decode(raw[m.start():])
    return data[0]['results']

def parse_spec(spec, amount=0, qty=1, code=''):
    """(w_mm, h_mm, area㎡, 상태) 또는 None.

    단위 규칙: 'cm' 명시 → 양변 ×10 / 'mm' 명시 → 그대로 / 미표기 → <100 변만 ×10(P2 동일).
    ★단위 자동보정(프레임·기타만 — CH 는 판가/㎡ 자체가 커서 오탐): 미표기인데 mm 읽기
    판가/㎡ ≥ 500k(프레임 IQR 30~56k 의 10배+) 이고 cm 읽기가 정상 범위면 cm 로 재해석.
    """
    s = spec or ''
    m = PAT.search(s)
    if not m:
        return None
    w, h = int(m.group(1)), int(m.group(2))
    status = '계산'
    if re.search(r'\d\s*cm', s, re.I):
        w, h = w * 10, h * 10
        status = '계산(cm표기)'
    elif 'mm' not in s.lower():
        if w < 100:
            w *= 10
        if h < 100:
            h *= 10
        a_mm = w * h / 1e6
        unit_rev = amount / max(1, qty)
        three_d = re.search(r'\d+\s*[xX*×]\s*\d+\s*[xX*×]\s*\d+', s)  # 철제 입간판류 W*D*H
        if code.startswith(('SIGN-FRL', 'SIGN-FRN')) and not three_d and 0 < a_mm and unit_rev / a_mm >= 500000:
            a_cm = a_mm * 100
            if 0.05 <= a_cm <= 60 and 3000 <= unit_rev / a_cm <= 300000:
                w, h = w * 10, h * 10
                status = '계산(cm추정보정)'
    else:
        if w < 100:
            w *= 10
        if h < 100:
            h *= 10
    a = w * h / 1e6
    if not (0.05 <= a <= 60):
        return None
    return w, h, a, status

lines = load_results(os.path.join(LOAD, 'sign_lines_snapshot.json'))
bom_rows = load_results(os.path.join(LOAD, 'sign_bom_snapshot.json'))
bom = defaultdict(list)
for r in bom_rows:
    bom[r['pcode']].append(r)

def unit_cost(pcode, w_mm, h_mm, area):
    """간판 1개(면적 area㎡)의 자재 원가. (총원가, {자재코드: 원가}, 경고목록)"""
    rows = bom.get(pcode, [])
    perim = 2 * (w_mm + h_mm) / 1000.0
    width_m = w_mm / 1000.0
    led = 0
    for r in rows:  # LED 수 선계산 (PER_LED 의존)
        if r['usage_type'] == 'PER_AREA' and 'LED3' in r['mcode'] and r['usage_param']:
            led = math.ceil(area * r['usage_param'])
    total, detail, warns = 0.0, {}, []
    for r in rows:
        t, p, price = r['usage_type'], r['usage_param'], r['base_price'] or 0
        if t == 'FIXED_QTY':
            c = (r['quantity'] or 0) * price
        elif t == 'PER_AREA':
            if not p:
                warns.append(f"{r['mcode']} param NULL 산정불가")
                continue
            c = math.ceil(area * p) * price
        elif t == 'PER_AREA_SHEET':
            c = math.ceil(area / p) * price
        elif t == 'PER_PERIMETER':
            c = math.ceil(perim / p) * price
        elif t == 'PER_LED':
            # 전선(연속 소모품)은 비례 — ceil 이면 소형 간판마다 롤 1개 전액 과대
            if r['mcode'] == 'SGM-LEDW':
                c = led / p * price if led else 0
            else:
                c = math.ceil(led / p) * price if led else 0
        elif t == 'PER_WIDTH':
            c = math.ceil(width_m / p) * price
        elif t == 'PER_AREA_ROLL':
            c = area / p * price
        else:
            warns.append(f"{r['mcode']} usage_type {t} 미지원")
            continue
        if price == 0 and t != 'PER_AREA':
            warns.append(f"{r['mcode']} 단가 0")
        total += c
        detail[r['mcode']] = detail.get(r['mcode'], 0) + c
    return total, detail, warns

# ── 라인별 계산 ──────────────────────────────────────────────
audit = []
agg = defaultdict(lambda: {'n': 0, 'rev': 0, 'pn': 0, 'prev': 0, 'cost': 0.0, 'mat': defaultdict(float)})
by_client = defaultdict(lambda: {'n': 0, 'rev': 0, 'pn': 0, 'prev': 0, 'cost': 0.0})
by_month = defaultdict(lambda: {'rev': 0, 'prev': 0, 'cost': 0.0})
warn_counter = defaultdict(int)

for r in lines:
    code, amt = r['item_code'], r['amount']
    q = r['quantity'] or 1
    month = (r['order_date'] or '')[:7]
    a = agg[code]
    a['n'] += 1
    a['rev'] += amt
    by_client[r['client_name']]['n'] += 1
    by_client[r['client_name']]['rev'] += amt
    by_month[month]['rev'] += amt
    parsed = parse_spec(r['spec'], amt, q, code)
    if not parsed:
        audit.append([r['id'], r['order_date'], r['client_name'], code, r['item_name'], r['spec'],
                      '', '', q, amt, '', '', '규격미파싱'])
        continue
    w, h, area, status = parsed
    uc, detail, warns = unit_cost(code, w, h, area)
    cost = uc * q
    for wmsg in warns:
        warn_counter[wmsg] += 1
    a['pn'] += 1
    a['prev'] += amt
    a['cost'] += cost
    for mc, c in detail.items():
        a['mat'][mc] += c * q
    by_client[r['client_name']]['pn'] += 1
    by_client[r['client_name']]['prev'] += amt
    by_client[r['client_name']]['cost'] += cost
    by_month[month]['prev'] += amt
    by_month[month]['cost'] += cost
    rate = f'{cost/amt*100:.1f}%' if amt else ''
    audit.append([r['id'], r['order_date'], r['client_name'], code, r['item_name'], r['spec'],
                  f'{w}x{h}', f'{area:.2f}', q, amt, round(cost), rate, status])

# ── LED 민감도 (SIGN-CH만 — 실측 범위 54~76) ──────────────────
def ch_cost_with_density(density):
    total = 0.0
    for r in lines:
        if r['item_code'] != 'SIGN-CH':
            continue
        q = r['quantity'] or 1
        parsed = parse_spec(r['spec'], r['amount'], q, 'SIGN-CH')
        if not parsed:
            continue
        w, h, area, _st = parsed
        led = math.ceil(area * density)
        c = 0.0
        for b in bom['SIGN-CH']:
            t, p, price = b['usage_type'], b['usage_param'], b['base_price'] or 0
            perim = 2 * (w + h) / 1000.0
            if t == 'FIXED_QTY':
                c += (b['quantity'] or 0) * price
            elif t == 'PER_AREA':
                c += led * price if 'LED3' in b['mcode'] else (math.ceil(area * p) * price if p else 0)
            elif t == 'PER_AREA_SHEET':
                c += math.ceil(area / p) * price
            elif t == 'PER_PERIMETER':
                c += math.ceil(perim / p) * price
            elif t == 'PER_LED':
                c += (led / p if b['mcode'] == 'SGM-LEDW' else math.ceil(led / p)) * price
            elif t == 'PER_AREA_ROLL':
                c += area / p * price
        total += c * q
    return total

# ── 출력 ─────────────────────────────────────────────────────
with open(OUT_CSV, 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.writer(f)
    w.writerow(['order_item_id', '일자', '거래처', '유형', '품명', '규격', '파싱(mm)', '면적㎡',
                '수량', '매출액', '자재원가(추정)', '자재원가율', '상태'])
    w.writerows(audit)

L = []
L.append('# 간판 이관 매출 자재 원가율 리포트 (P3 — 2026-08-01)')
L.append('')
L.append('> 표준 BOM(0508) × **실측 보정(0509: LED 62/㎡·후렉스 1,750/㎡·알마이트 19,000/장)** × base_price.')
L.append('> **자재 원가만** — 인건비·시공·출력잉크 제외. 원가율 = 자재원가/매출(규격 파싱분 기준).')
L.append('> 입체바·캡바는 bbox 둘레, 백판·전면판은 bbox 면적 기준(채널 글자 실면적 대비 과대 가능)')
L.append('> · 장물 ceil 자투리 미공유(소형 과대) · LED 전선은 비례 산정 · cm 표기/추정 단위 보정 반영.')
L.append('')
L.append('## 유형별')
L.append('')
L.append('| 유형 | 라인 | 매출액 | 규격파싱 | 파싱매출 | 자재원가 | 자재원가율 |')
L.append('|---|--:|--:|--:|--:|--:|--:|')
tot = {'n': 0, 'rev': 0, 'pn': 0, 'prev': 0, 'cost': 0.0}
for code in sorted(agg, key=lambda c: -agg[c]['rev']):
    a = agg[code]
    for k in tot:
        tot[k] += a[k]
    rate = f"{a['cost']/a['prev']*100:.1f}%" if a['prev'] else '—'
    L.append(f"| {code} | {a['n']} | {a['rev']:,} | {a['pn']} | {a['prev']:,} | {round(a['cost']):,} | {rate} |")
rate = f"{tot['cost']/tot['prev']*100:.1f}%" if tot['prev'] else '—'
L.append(f"| **계** | {tot['n']} | {tot['rev']:,} | {tot['pn']} | {tot['prev']:,} | {round(tot['cost']):,} | {rate} |")
L.append('')
L.append('## 유형별 자재 구성 (원가 비중)')
L.append('')
for code in sorted(agg, key=lambda c: -agg[c]['cost']):
    a = agg[code]
    if not a['cost']:
        continue
    parts = sorted(a['mat'].items(), key=lambda x: -x[1])
    seg = ' · '.join(f"{mc} {c/a['cost']*100:.0f}%({round(c):,})" for mc, c in parts if c > 0)
    L.append(f"- **{code}** (원가 {round(a['cost']):,}): {seg}")
L.append('')
L.append('## LED 밀도 민감도 (SIGN-CH 파싱분)')
L.append('')
ch = agg['SIGN-CH']
if ch['prev']:
    L.append('| 밀도 | 자재원가 | 원가율 |')
    L.append('|--:|--:|--:|')
    for d in (54, 62, 76):
        c = ch_cost_with_density(d)
        L.append(f"| {d}/㎡ | {round(c):,} | {c/ch['prev']*100:.1f}% |")
L.append('')
L.append('## 거래처별 TOP 15 (매출액순)')
L.append('')
L.append('| 거래처 | 라인 | 매출액 | 파싱매출 | 자재원가 | 자재원가율 |')
L.append('|---|--:|--:|--:|--:|--:|')
for name in sorted(by_client, key=lambda n: -by_client[n]['rev'])[:15]:
    b = by_client[name]
    rate = f"{b['cost']/b['prev']*100:.1f}%" if b['prev'] else '—'
    L.append(f"| {name} | {b['n']} | {b['rev']:,} | {b['prev']:,} | {round(b['cost']):,} | {rate} |")
L.append('')
L.append('## 월별')
L.append('')
L.append('| 월 | 매출액 | 파싱매출 | 자재원가 | 자재원가율 |')
L.append('|---|--:|--:|--:|--:|')
for month in sorted(by_month):
    b = by_month[month]
    rate = f"{b['cost']/b['prev']*100:.1f}%" if b['prev'] else '—'
    L.append(f"| {month} | {b['rev']:,} | {b['prev']:,} | {round(b['cost']):,} | {rate} |")
L.append('')
if warn_counter:
    L.append('## 산정 경고')
    L.append('')
    for wmsg, n in sorted(warn_counter.items(), key=lambda x: -x[1]):
        L.append(f'- {wmsg} × {n}라인')
    L.append('')

with open(OUT_MD, 'w', encoding='utf-8') as f:
    f.write('\n'.join(L) + '\n')

parsed_n = sum(1 for a in audit if a[-1].startswith('계산'))
print(f"라인 {len(lines)} · 파싱 {parsed_n} ({tot['prev']:,}/{tot['rev']:,}원 = {tot['prev']/tot['rev']*100:.1f}%)")
print(f"자재원가 {round(tot['cost']):,} · 파싱분 원가율 {tot['cost']/tot['prev']*100:.1f}%")
print(f'CSV {OUT_CSV}\nMD  {OUT_MD}')
