# -*- coding: utf-8 -*-
"""엘이디포유 간판자재 품목 등록 + 라인 소급 연결 SQL 생성기.

전략(2026-07-31 확정): SGM 카탈로그의 base_price가 LED4U 최신 단가와 일치(캡바 2050·
트러스바200 85000·SMPS300 16000) = SGM 카탈로그가 LED4U 단가표 기반 → 신규 병행 등록이
아니라 **기존 품목 연결 + 빠진 변종만 SGM 패밀리 규약으로 신설**.

OCR 이본 통합 근거(날짜 완전 분리 + 단가 단조 상승 + 동일 모델번호):
  현올캠바 HW-001-1(1/9~3/6, 1600→1750) = 한올캡바(3/20~, 2000→2050) → SGM-KPB
  현올잼비 0.8T 80mm(1/9~3/6, 3700→4100) = 한올입체바(3/20~, 4600→4800) → SGM-IPB
  SMPS (정수형)(초반 저화질 페이지·방수형과 동일 단가) = (방수형) 오독 → 날짜 assert로 검증
  셀수막=현수막 · 넘버원=넘버윈 · 프러엠타카핀=프레임타카핀 · 캘라피스=칼라피스

NULL 유지(성격 미확정·OCR 불확실): 3티캄판산-CNC-도형 · 스탠완형등롤 2건 ·
  보강대 400mm@25,000(패밀리 단가 530의 47배=오독 의심).

게이트: ① 재구성 (po,sort_order,item_name)가 prod 실측(led_lines.json)과 100% 일치
       ② 모든 라인이 기존코드/신규코드/SKIP 중 하나로 해소(미매핑=에러)
       ③ 신규 코드는 전부 NEW_ITEMS 카탈로그에 존재
"""
import sys, re, json
from collections import defaultdict

sys.path.insert(0, r'C:\Users\user\dongsan_mes\docs\dongsan-import')
from led4u_rows import R
from led4u_rows2 import R2

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
OUT = r'C:\Users\user\dongsan_mes\docs\dongsan-import\load\led4u_items.sql'
AUDIT = r'C:\Users\user\dongsan_mes\docs\dongsan-import\load\led4u_items_audit.csv'
PROD_LINES = None  # 경로를 인자로: python gen_led4u_items.py <led_lines.json>
MARK = '엘이디포유 간판자재 등록 2026-07-31'
MS = {'26-01': 34695100, '26-02': 8625160, '26-03': 43474600,
      '26-04': 57443800, '26-05': 9703140, '26-06': 26766690}

# ── 라인 재구성 (gen_led4u_ap.py와 동일 로직 — 순서 불변) ──────────────────
ALL = [(r[0], r[1], r[2], r[3], r[4], r[5]) for r in R] + list(R2)
by_m = defaultdict(list)
for d, nm, qty, pr, sup, dep in ALL:
    if dep or d[:5] not in MS:
        continue
    if sup == 0 and qty == 0:
        continue
    by_m[d[:5]].append((d, nm, qty, pr, sup))
for k, tot in MS.items():
    assert sum(x[4] for x in by_m[k]) == tot, k

# SMPS 정수형=방수형 오독 검증: 정수형은 전부 3/6 이전(저화질 구간)에만 등장해야 한다
jsu = [d for k in by_m for d, nm, *_ in by_m[k] if '정수형' in nm]
assert jsu and max(jsu) <= '26-03-06', f'정수형 날짜 가정 위반: {sorted(jsu)}'

# ── 색상 코드 (SGM 규약 + 신규 4색) ────────────────────────────────────────
COLOR = {'백색': 'WH', '흑색': 'BK', '연회색': 'LG', '진회색': 'DG', '진청색': 'NB',
         '진핑크': 'DP', '녹색': 'GN', '연청색': 'LB', '주황색': 'OR', '황색': 'YL',
         '적색': 'RD', '옥색': 'JD', '형광색': 'FL', '진청록': 'TG', '민트색': 'MT',
         '연회': 'LG'}

NEW_ITEMS = {}  # code -> (name, unit, group, spec, base_price)


def new(code, name, unit, group, spec, base):
    if code in NEW_ITEMS:
        assert NEW_ITEMS[code] == (name, unit, group, spec, base), code
    NEW_ITEMS[code] = (name, unit, group, spec, base)
    return code


# 기존 코드 (prod 실재 — 2026-07-31 조회 확인분)
EXISTING = set('''SGM-KPB-WH SGM-KPB-BK SGM-KPB-DG SGM-KPB-DP SGM-KPB-GN SGM-KPB-LB
SGM-KPB-NB SGM-KPB-OR SGM-KPB-RD SGM-KPB-YL SGM-KPB-BR
SGM-IPB SGM-IPB-BK SGM-IPB-BR SGM-IPB-DG SGM-IPB-DP SGM-IPB-GN SGM-IPB-LB SGM-IPB-LG
SGM-IPB-NB SGM-IPB-OR SGM-IPB-WH SGM-IPB-YL
SGM-TRB-R150-BK SGM-TRB-R150-DG SGM-TRB-R150-LG SGM-TRB-R150-WH
SGM-TRB-R200-BK SGM-TRB-R200-DG SGM-TRB-R200-LG SGM-TRB-R200-WH
SGM-TRB-R300-BK SGM-TRB-R300-DG SGM-TRB-R300-LG SGM-TRB-R300-WH
SGM-TRB-R400-BK SGM-TRB-R400-DG SGM-TRB-R400-LG SGM-TRB-R400-WH
SGM-TRW-BK SGM-TRW-DG SGM-TRW-LG SGM-TRW-WH SGM-TRF SGM-CSP
SGM-CSM-R150-BK SGM-CSM-R150-LG SGM-CSM-R150-WH
SGM-CSM-R200-BK SGM-CSM-R200-LG SGM-CSM-R200-WH
SGM-CSM-R250-BK SGM-CSM-R250-LG SGM-CSM-R250-WH
SGM-CSM-R300-BK SGM-CSM-R300-LG SGM-CSM-R300-WH
SGM-CSM-R400-BK SGM-CSM-R400-LG SGM-CSM-R400-WH
SGM-SMPS-W200 SGM-SMPS-W300 SGM-SMPS-W400 SGM-SMPS-W500
SGM-LEDP-WW SGM-LEDP-WM SGM-LEDP-BW SGM-PPIPE-PW SGM-PPIPE-PB
SGM-TACK-T4 SGM-TACK-T6 SGM-FTACK SGM-KIV-K15 SGM-KIV-K25 SGM-KIV-K40 SGM-LEDW
SGM-SRND-D500 SGM-SRND-D600 SGM-PRND-D500 SGM-PRND-D600
ALM-2T-WH-48 ALM-2T-BK-48 PC-2T-M-48 PC-3T-M-48
FLEXL-130 FLEXL-320 SVM-127 MCP120-060 MCP120-127
SVB-152 SVB-250 SVB-320 ETC-SHIP'''.split())

SKIP = 'SKIP'  # 의도적 NULL 유지


def resolve(raw):
    """원장 품명 → item_code | SKIP. 미해소 시 None(에러)."""
    nm = raw.rstrip('?').strip()
    nm = re.sub(r'\s*단가인상$', '', nm)
    ret = nm.endswith('(반품)')
    nm = re.sub(r'\s*\(반품\)$', '', nm).strip()
    nm = nm.replace('셀수막', '현수막').replace('넘버원)', '넘버윈)')
    nm = nm.replace('현올캠바', '한올캡바').replace('현올잼비', '한올입체바')
    nm = nm.replace('채널 옆마구리', '채널바 옆마구리')

    # ── 의도적 NULL 유지 ──
    if nm.startswith('3티캄판산'):
        return SKIP
    if '스탠완형등롤' in nm:
        return SKIP

    # ── 원단 (이미 적재 시 연결됐지만 방어적 포함) ──
    m = re.search(r'현수막원단\(투코팅\)\s*(\d+)폭', nm)
    if m:
        return f'AQ2-{int(m.group(1)):03d}'
    if '원단(저밀도) 90폭' in nm:
        return 'AQD-090'
    m = re.search(r'솔벤 현수막 원단\s*(\d+)폭', nm)
    if m:
        w = int(m.group(1))
        w = w // 10 if w >= 1000 else w   # 3000폭=300cm
        code = f'SVB-{w:03d}'
        if code == 'SVB-300':
            return new(code, '솔벤 현수막', 'yd', '솔벤 현수막', '300cm', 0)
        return code
    m = re.search(r'솔벤 탠트천\s*(\d+)폭', nm)
    if m:
        w = int(m.group(1)) // 10
        return new(f'SVT-{w:03d}', '솔벤 텐트천', 'm', '솔벤 텐트천', f'{w}cm', 3200 if w == 200 else 2560)

    # ── 캡바 / 입체바 ──
    m = re.search(r'한올캡바 HW-001-1\((.+?)\)\(3M\)', nm)
    if m:
        c = COLOR[m.group(1)]
        code = f'SGM-KPB-{c}'
        if code not in EXISTING:
            return new(code, f'캡바 {m.group(1)}', 'EA', '캡바', '25mm*3m', 2050)
        return code
    m = re.search(r'한올입체바 0\.8T 80mm\*3M\((.+?)\)', nm)
    if m:
        col = m.group(1)
        if col in ('?', '?색'):
            return 'SGM-IPB'  # 색 미상 → 대표 품목
        c = COLOR[col]
        code = f'SGM-IPB-{c}'
        if code not in EXISTING:
            return new(code, f'입체바 {col}', 'EA', '입체바', '80mm*3m', 4800)
        return code
    m = re.search(r'한올입체바 1\.0T 100mm\*3M\((.+?)\)', nm)
    if m:
        col = m.group(1)
        return new(f'SGM-IPB100-{COLOR[col]}', f'입체바 1.0T 100mm {col}', 'EA', '입체바', '1.0T 100mm*3m', 7700)

    # ── 트러스바 계열 ──
    m = re.search(r'HW 채널 트러스바 (\d+)mm\*7M\((.+?)\)', nm)
    if m:
        r, col = m.group(1), m.group(2)
        c = COLOR[col]
        code = f'SGM-TRB-R{r}-{c}'
        if code not in EXISTING:
            base = {'R200-JD': 74000, 'R250-JD': 104500, 'R250-BK': 115200,
                    'R250-LG': 121900, 'R300-JD': 150000, 'R400-JD': 197500}[f'R{r}-{c}']
            return new(code, f'트러스바 {r}mm {col}', 'EA', '트러스바', f'{r}mm', base)
        return code
    m = re.search(r'HW 트러스바 날개 100mm\*7M\((.+?)\)', nm)
    if m:
        col = m.group(1)
        c = COLOR[col]
        code = f'SGM-TRW-{c}'
        if code not in EXISTING:
            return new(code, f'트러스바 날개 {col}', 'EA', '트러스바 날개', '100mm*7M', 28000)
        return code
    m = re.search(r'채널바\(트러스바\)보강대 (\d+)mm', nm)
    if m:
        r = m.group(1)
        pr_map = {'200': 330, '250': 390, '300': 460, '400': 530}
        if r == '200':
            return 'SGM-TRF'
        return new(f'SGM-TRF-R{r}', f'트러스바 보강대 {r}mm', 'EA', '트러스바 보강대', f'{r}mm', pr_map[r])
    if nm.startswith('[YHS] 채널지지대'):
        return 'SGM-CSP'
    m = re.search(r'HW 채널바 옆마구리 (\d+)\*(\d+)\((.+?)\)', nm)
    if m:
        r, h, col = m.group(1), m.group(2), m.group(3)
        c = COLOR[col]
        if h == '113':
            return new(f'SGM-CSM-R{r}X113-{c}', f'채널바 옆마구리 {r}*113 {col}', 'EA', '채널바 옆마구리', f'{r}*113mm', 2300)
        code = f'SGM-CSM-R{r}-{c}'
        if code not in EXISTING:
            base = {'R400-JD': 3100, 'R200-JD': 2200}[f'R{r}-{c}']
            return new(code, f'채널바 옆마구리 {r}mm {col}', 'EA', '채널바 옆마구리', f'{r}mm', base)
        return code

    # ── SMPS (정수형=방수형 오독 통합) ──
    m = re.search(r'SMPS-(\d+)개용', nm)
    if m:
        w = m.group(1)
        code = f'SGM-SMPS-W{w}'
        if code not in EXISTING:
            return new(code, f'외부용 SMPS(방수) {w}wt', 'EA', '외부용 SMPS(방수)', '방수', 11400)
        return code

    # ── LED 모듈·투광기 ──
    if 'LED 3구 2835' in nm:
        return new('SGM-LED3-2835', 'LED 3구 2835 확산렌즈형(1W)', 'EA', 'LED 3구', '1w 2835', 175)
    if 'LED 3구 5050' in nm:
        return new('SGM-LED3-5050RGB', 'LED 3구 5050 렌즈형 RGB', 'EA', 'LED 3구', '5050 RGB', 420)
    m = re.search(r'LED 투광기\(노출\) (\d+)W \((.+?)\)', nm)
    if m:
        w, col = m.group(1), m.group(2)
        var = {'백색/백색': 'WW', '백색/전구색': 'WM', '검정/백색': 'BW'}[col]
        if w == '35':
            return f'SGM-LEDP-{var}'
        return new(f'SGM-LEDP{w}-{var}', f'LED투광기 {w}W {col}', 'EA', 'LED투광기', f'{w}W', 12000)
    if '투광기 파이프' in nm:
        if '900mm' in nm:
            return new('SGM-PPIPE-PW900', '투광기 파이프 백색 900mm', 'EA', '투광기 파이프', 'ㅡ자형 900mm', 2300)
        if '검정' in nm:
            return 'SGM-PPIPE-PB'
        return 'SGM-PPIPE-PW'

    # ── 돌출·등박스 ──
    m = re.search(r'스텐원형돌출 (\d+)¢', nm)
    if m:
        d = m.group(1)
        code = f'SGM-SRND-D{d}'
        if code not in EXISTING:
            return new(code, f'스텐원형돌출 {d}Φ', 'EA', '스텐원형돌출', f'{d}Φ', 72500)
        return code
    m = re.search(r'포인트간판 원형돌출 (\d+)¢', nm)
    if m:
        return f'SGM-PRND-D{m.group(1)}'
    if '포인트간판 사각등롤' in nm:
        return new('SGM-PRSQ-550', '포인트간판 사각돌출 550*550', 'EA', '포인트원형돌출', '550*550', 45500)

    # ── 판재 ──
    if '알마이트 2T 1220*2420 단면(백색)' in nm:
        return 'ALM-2T-WH-48'
    if '알마이트 2T 4*8(단면/검정)' in nm:
        return 'ALM-2T-BK-48'
    if '광확산PC 1.8T' in nm:
        return new('PC-1.8T-M-48', '광확산PC', '장', '광확산PC', '1.8T 백색 4x8', 33500)

    # ── 시트·롤 미디어 ──
    m = re.search(r'LX시트-?(?:.*?)\b(LD190DF|LA9423NH|SPM011G|LC6770P|LT4510)', nm)
    if m:
        k = m.group(1)
        meta = {'LD190DF': ('LX시트 광확산 LD190DF', '1220폭 롤50M', 868500),
                'LA9423NH': ('LX시트 캘 조명용 LA9423NH', '1220폭 롤50M', 550000),
                'SPM011G': ('LX시트 DPM(SP) SPM011G 백색', '1370폭 롤50M', 122100),
                'LC6770P': ('LX시트 외부용 LC6770P 양면PE', '1220폭 롤50M', 199500),
                'LT4510': ('LX시트 조명용 LT4510', '1220폭 롤50M', 196100)}[k]
        return new(f'LX-{k}', meta[0], '롤', 'LX시트', meta[1], meta[2])
    if '조명후렉스 3200폭' in nm:
        return 'FLEXL-320'
    if '그래픽스 시트등 후렉스 1300폭' in nm:
        return 'FLEXL-130'   # 폭 기준 매핑 (그래픽스=브랜드 표기로 판단)
    if '매쉬원단 1270폭' in nm:
        return 'SVM-127'     # 출력용 매쉬 롤 — 솔벤 매쉬 127cm 롤로 매핑
    m = re.search(r'PET배너 (\d+)폭', nm)
    if m:
        w = int(m.group(1)) // 10
        base = {63: 24700, 127: 49400, 152: 74100}[w]
        return new(f'PETB-{w:03d}', 'PET배너', '롤', 'PET배너', f'{w}cm 롤30M', base)
    if '코팅지(SJ)(무광)' in nm:
        if '635폭-120g' in nm:
            return 'MCP120-060'
        if '1270폭-120g' in nm:
            return 'MCP120-127'
        if '1270폭-80g' in nm:
            return new('MCP080-127', '무광코팅지 80g-호홍', '롤', '무광코팅지 80g-호홍', '127cm 61m', 62700)
    if 'PVC캘 1270폭' in nm:
        return new('KEL-HH-127', 'PVC(켈)(30m)-호홍', '롤', 'PVC(켈)-호홍', '127cm', 61200)
    m = re.search(r'도인지 (\d+)\(롤:137M\)', nm)
    if m:
        w = m.group(1)
        return new(f'DOIN-{w}', f'도인지 {w}', '롤', '도인지(전사지)', f'{w}cm 롤137M', 29000 if w == '125' else 25500)

    # ── 부자재·소모품 ──
    if '캘라피스' in nm or '칼라피스' in nm:
        col = '옥색' if '옥색' in nm else '백색'
        return new(f'SGM-CPIS-{COLOR[col]}', f'칼라피스 T7*14 {col}', 'EA', '간판 부자재', 'T7*14 1롤=1000개', 10000)
    if '진열타카핀 604' in nm:
        return 'SGM-TACK-T4'
    if '진열타카핀 606' in nm:
        return 'SGM-TACK-T6'
    if '프러엠타카핀710' in nm or '프레임타카핀710' in nm:
        return 'SGM-FTACK'
    m = re.search(r'KIV전선 (\d\.\d)\(백색\)', nm)
    if m:
        return f"SGM-KIV-K{m.group(1).replace('.', '')}"
    if 'UL2468' in nm:
        return 'SGM-LEDW'
    if '현수막끈' in nm:
        return new('SGM-ROPE-5', '현수막끈 5Φ(PP로프)', 'EA', '간판 부자재', '5Φ PP로프', 20500)
    if '분무기 5L' in nm:
        return new('SGM-SPRAY-5L', '분무기 5L', 'EA', '간판 부자재', '5L', 31500)

    # ── 외주 출력물·기타 ──
    if nm.startswith('양면Flex'):
        return new('RM-FLEX-PRT2S', '양면 후렉스 출력(외주)', '㎡', '외주 출력물', '㎡ 단가', 8000)
    if '배송비' in nm:
        return 'ETC-SHIP'
    return None


# ── 전 라인 해소 + 특수 케이스 ────────────────────────────────────────────
lines = []          # (po, sort, raw_name, qty, pr, sup, code)
unresolved = []
for k in sorted(MS):
    po = f'E1-PO-LED-{k.replace("-", "")}'
    for i, (day, nm, qty, pr, sup) in enumerate(by_m[k], 101):
        code = resolve(nm)
        # 보강대 400mm@25,000 = 오독 의심(패밀리 단가 530) → NULL 유지
        if code == 'SGM-TRF-R400' and pr == 25000:
            code = SKIP
        if code is None:
            unresolved.append((po, i, nm))
        lines.append((po, i, nm, qty, pr, sup, code))
assert not unresolved, '미매핑:\n' + '\n'.join(f'{p} #{s} {n}' for p, s, n in unresolved)

# ── prod 실측 대조 게이트 ──────────────────────────────────────────────────
if len(sys.argv) > 1:
    raw = open(sys.argv[1], encoding='utf-8', errors='replace').read()
    prod = {(r['po_number'], r['sort_order']): r
            for r in json.loads(raw[raw.find('['):])[0]['results']}
    mism = 0
    for po, i, nm, qty, pr, sup, code in lines:
        p = prod.get((po, i))
        assert p is not None, f'prod에 없음: {po} #{i}'
        if p['item_name'] != nm[:90].replace("''", "'"):
            # prod 저장 시 esc() 적용됐으므로 원문 비교
            if p['item_name'] != nm[:90]:
                mism += 1
                print(f'!! 이름 불일치 {po} #{i}: prod={p["item_name"]!r} vs {nm[:90]!r}')
        assert p['amount'] == sup, f'금액 불일치 {po} #{i}'
    assert mism == 0, f'이름 불일치 {mism}건'
    already = sum(1 for po, i, *_ in lines if prod[(po, i)]['item_id'] is not None)
    print(f'prod 대조 OK: {len(lines)}라인 전량 (po,sort,금액) 일치 · 기존 연결 {already}')

# ── 통계 ──
skip_amt = sum(sup for *_, sup, code in [(l[4], l[5], l[6]) for l in lines] if code == SKIP)
stat_new = sorted({c for *_, c in lines if c in NEW_ITEMS})
n_upd = sum(1 for l in lines if l[6] != SKIP)
print(f'라인 {len(lines)} = 연결 {n_upd} + SKIP {len(lines) - n_upd}(금액 {skip_amt:,})')
print(f'신규 품목 {len(NEW_ITEMS)}종 · 기존 매핑 {len({l[6] for l in lines if l[6] != SKIP and l[6] not in NEW_ITEMS})}코드')


def esc(s):
    return str(s).replace("'", "''")


# ── SQL ──
sql = [f'-- {MARK} · 생성기 gen_led4u_items.py',
       f"-- ① 신규 품목 {len(NEW_ITEMS)}종 (SGM 패밀리 규약 승계) — 롤백: DELETE FROM items WHERE item_code IN (...) AND id NOT IN (SELECT item_id FROM purchase_order_items WHERE item_id IS NOT NULL)",
       '']
for code in sorted(NEW_ITEMS):
    name, unit, group, spec, base = NEW_ITEMS[code]
    sql.append(
        f"INSERT OR IGNORE INTO items (category_id, item_code, item_name, unit, category, item_type, is_purchase_item, is_sales_item, deduction_method, item_group, specification, base_price, is_active) "
        f"VALUES (5, '{code}', '{esc(name)}', '{unit}', '원자재', 'MATERIAL', 1, 0, 'NONE', '{esc(group)}', '{esc(spec)}', {base}, 1);")

sql.append('')
sql.append(f'-- ② 라인 소급 연결 (item_id IS NULL 가드 = 멱등·기존 연결 보존)')
for po, i, nm, qty, pr, sup, code in lines:
    if code == SKIP:
        continue
    sql.append(
        f"UPDATE purchase_order_items SET item_id=(SELECT id FROM items WHERE item_code='{code}') "
        f"WHERE po_id=(SELECT id FROM purchase_orders WHERE po_number='{po}') AND sort_order={i} AND item_id IS NULL;")

sql.append('')
sql.append("-- 검증: NULL 잔여(기대 = OPEN 1 + EXTRA 1 + SKIP 4 = 6) · AP 불변 269,075,065")
sql.append("SELECT COUNT(*) AS null_lines FROM purchase_order_items i JOIN purchase_orders po ON po.id=i.po_id WHERE po.po_number LIKE 'E1-PO-LED-%' AND i.item_id IS NULL;")

with open(OUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(sql) + '\n')

with open(AUDIT, 'w', encoding='utf-8-sig', newline='') as f:
    import csv
    w = csv.writer(f)
    w.writerow(['원장 품명', '매핑 코드', '구분', '라인수', '수량합', '금액합'])
    agg = defaultdict(lambda: [0, 0, 0])
    for po, i, nm, qty, pr, sup, code in lines:
        a = agg[(nm, code or 'NULL')]
        a[0] += 1
        a[1] += qty
        a[2] += sup
    for (nm, code), (n, q, s) in sorted(agg.items(), key=lambda x: -x[1][2]):
        kind = 'NULL유지' if code == SKIP else ('신규' if code in NEW_ITEMS else '기존')
        w.writerow([nm, code, kind, n, q, s])

import os
print(f'SQL: {OUT} ({os.path.getsize(OUT)//1024}KB) · AUDIT: {AUDIT}')
print('신규 코드:', ', '.join(stat_new))
