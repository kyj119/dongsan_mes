# -*- coding: utf-8 -*-
"""동산기획 이카운트 판매현황 2601~2606 → MES 매출 적재 SQL 생성기.

정본 규칙 = INSPECTION.md §⑥(R1~R15)·§⑨(재계산 금지)·§⑩(음수 그대로)·§⑪-D(A1/A2 2라인 분해)·"미결 0건" 표.
전례 = docs/sunmyung-import/13_invoice_orders.sql (orders BILLED 미러 + order_billing_groups + order_items).

산출: docs/dongsan-import/load/sales_26MM.sql ×6 + rollback_sales.sql + SUMMARY.md
검증: 생성 단계에서 총액·라인수·거래처 해석 100% assert. 적용 전 리허설 필수.

사용: python gen_sales_sql.py <clients_ids.json> <items_full.json>
  clients_ids.json = prod SELECT id, client_code, business_registration_number AS brn, client_name FROM clients
  items_full.json  = prod SELECT id, item_code, item_name, item_type, category, unit, specification, search_keywords, is_active FROM items
"""
import openpyxl, json, sys, re, os, csv, hashlib
from collections import defaultdict

sys.stdout.reconfigure(encoding='utf-8')
ROOT = r'C:\Users\user\dongsan_mes'
SRC = os.path.join(ROOT, '품목마스터', '원천주문데이터')
OUT = os.path.join(ROOT, 'docs', 'dongsan-import', 'load')
os.makedirs(OUT, exist_ok=True)
sys.path.insert(0, os.path.join(ROOT, 'docs', 'dongsan-import'))
from normalize_client_code import normalize  # noqa

CLIENTS_JSON = sys.argv[1]
ITEMS_JSON = sys.argv[2]
# 처리 월 — 기본은 상반기 6개월(원 동작 유지). 3번째 인자로 부분 실행 가능: `... 07`
DEFAULT_MONTHS = ['01', '02', '03', '04', '05', '06']
MONTHS = sys.argv[3].split(',') if len(sys.argv) > 3 else DEFAULT_MONTHS
# 부분 실행이면 rollback·SUMMARY 를 접미사로 분리한다 — 상반기 산출물을 덮어쓰면 안 된다
SFX = '' if MONTHS == DEFAULT_MONTHS else '_' + ''.join(MONTHS)

LINE = re.compile(r'^\d{4}/\d\d/\d\d\s+-\d+$')
EXCL = {'342-86-03531', '314-81-84311'}   # 선명(결정1) · 자기거래(R15)
RRN = re.compile(r'^\d{6}-\d{7}$')
# ⚠️ 롤백이 `notes LIKE '{MARKER}%'` 로 지운다 — 부분 실행이 같은 마커를 쓰면 **기존 적재분까지 삭제된다**.
#    그래서 월 부분 실행은 마커를 반드시 분리한다.
MARKER = '동산 이카운트 이관 2026-07-30 판매' if not SFX else f'동산 이카운트 이관 판매 26{"".join(MONTHS)}'
CASH_CLIENT = '000-00-00000'              # 기타거래처 = 현금·카드 소매(§⑧-5) — 적재는 정상, AR 제외는 별도 코드

# ── 거래처 해석 ────────────────────────────────────────────────────────
_cl = json.load(open(CLIENTS_JSON, encoding='utf-8-sig'))[0]['results']
BY_CODE = {str(c['client_code']).strip(): c['id'] for c in _cl if c['client_code']}
BY_BRN = {str(c['brn']).strip(): c['id'] for c in _cl if c['brn']}
_reg = list(csv.DictReader(open(os.path.join(ROOT, 'docs', 'dongsan-import', '점검1b_미등록거래처_등록용.csv'),
                                encoding='utf-8-sig')))
BY_SRC = {r['이카운트코드']: r['client_code'] for r in _reg if not r['이카운트코드'].startswith('(')}
BY_HASH = {r['원본코드해시']: r['client_code'] for r in _reg if r['원본코드해시']}


def resolve_client(cc):
    if cc in BY_CODE:
        return BY_CODE[cc]
    if cc in BY_BRN:
        return BY_BRN[cc]
    ncc, _, _, _ = normalize(cc)
    if ncc and ncc in BY_CODE:
        return BY_CODE[ncc]
    if ncc and ncc in BY_BRN:
        return BY_BRN[ncc]
    if cc in BY_SRC:
        return BY_CODE.get(BY_SRC[cc])
    if RRN.match(cc):
        h = 'sha256:' + hashlib.sha256(re.sub(r'\D', '', cc).encode()).hexdigest()[:16]
        if h in BY_HASH:
            return BY_CODE.get(BY_HASH[h])
    return None


# ── 품목 인덱스 ────────────────────────────────────────────────────────
_it = json.load(open(ITEMS_JSON, encoding='utf-8-sig'))[0]['results']
IT_BY_CODE = {i['item_code']: i for i in _it}


def norm(s):
    return re.sub(r'\s+', '', str(s or '')).lower()


NAME_IDX = {}
for i in _it:
    if i['is_active']:
        NAME_IDX.setdefault(norm(i['item_name']), i['item_code'])
KW_IDX = {}
_kw_dup = set()
for i in _it:
    if not i['is_active'] or not i['search_keywords']:
        continue
    for kw in str(i['search_keywords']).split(','):
        k = norm(kw)
        if not k or k in NAME_IDX:      # 품목명과 겹치는 키워드는 이름 매칭이 우선 (ACC-023 오염 방어)
            continue
        if k in KW_IDX and KW_IDX[k] != i['item_code']:
            _kw_dup.add(k)
            continue
        KW_IDX[k] = i['item_code']
for k in _kw_dup:
    KW_IDX.pop(k, None)

# 태극기류 규격(WxH) → 호수 접미 (specification 'N호 135×90' 파싱)
SIZE2HO = {}
for i in _it:
    m = re.match(r'^(\d+호(?:-1)?)\s+(\d+)×(\d+)$', str(i['specification'] or ''))
    if m and i['item_code'].startswith('TGK-') and 'G' not in i['item_code'].split('-')[-1]:
        SIZE2HO[(int(m.group(2)), int(m.group(3)))] = i['item_code'].replace('TGK-', '')


def exist(code):
    """존재+활성 코드만 통과. 후보 리스트에서 첫 유효 코드 선택용."""
    it = IT_BY_CODE.get(code)
    return code if it and it['is_active'] else None


def pick(*cands):
    for c in cands:
        if c and exist(c):
            return c
    return None


WH = re.compile(r'(\d{2,4})\s*[*×xX]\s*(\d{2,4})')


def parse_wh(s):
    m = WH.search(str(s or ''))
    return (int(m.group(1)), int(m.group(2))) if m else None


def tgk_by_size(wh, gy=False):
    """깃발규격 → 태극기 코드. gy=게양용."""
    if not wh or wh not in SIZE2HO:
        return None
    ho = SIZE2HO[wh]
    return pick(f'TGK-{ho}G' if gy else f'TGK-{ho}', f'TGK-{ho}')


# ── 매칭 규칙 엔진 ─────────────────────────────────────────────────────
# 반환: (item_code|None, extra_line|None, tag)
#   extra_line = (item_code, note) — A1/A2 분해 부속 라인(수량 동일·금액 0)

def match_fabric(t, w):
    """R8: 규격 'N폭' = 원단 롤 유통 판매 — 원단 SKU(MATERIAL)로만 연결, 제품 규칙 진입 금지."""
    def near(cands, tol=5):
        best = min(cands, key=lambda c: abs(c - w))
        return best if abs(best - w) <= tol else None
    if re.search(r'폰지', t):
        if w == 140:                                      # 140폭은 130 SKU로 (용준님 2026-07-30)
            return pick('PONGE-130')
        c = near([85, 95, 130, 150, 180])
        return pick(f'PONGE-{c:03d}') if c else None
    if re.search(r'^LB9534', t):
        return pick('LB9534NH-122')
    if re.search(r'^LB9661', t):
        return pick('LB9661NH-122')
    if re.search(r'저밀도', t):
        c = near([40, 70, 90])
        return pick(f'AQD-{c:03d}') if c else None
    if re.search(r'패트', t):
        c = near([60, 90, 127, 152])
        return pick(f'PAT-{c:03d}') if c else None
    if re.search(r'솔벤\s*현수막\s*원단|솔벤현수막원단', t):
        return pick(f'SVB-{w:03d}', f'SVB-{w}')
    if re.search(r'현수막\s*1코팅|현수막1코팅', t):
        return pick(f'AQ1-{w:03d}')
    if re.search(r'현수막\s*2코팅|현수막2코팅', t):
        return pick(f'AQ2-{w:03d}')
    if re.search(r'원형나무', t):
        if w == 70:
            return pick('WDR-20-070')
        return pick('WDR-25-090' if '25mm' in t else 'WDR-01')
    if re.search(r'부직포', t):
        c = near([60, 90, 127, 152, 180])
        return pick(f'BUJIK-{c:03d}') if c else None
    k = norm(t)
    return NAME_IDX.get(k) or KW_IDX.get(k)


def match_item(nm, spec, content):
    t = nm.strip()
    ctx = f'{t} {content}'
    wh = parse_wh(spec)

    # 0) R8 원단 유통 (규격 'N폭') — 어떤 제품 규칙보다 먼저
    mw = re.match(r'^(\d{2,3})폭$', str(spec or '').replace(' ', ''))
    if mw:
        return match_fabric(t, int(mw.group(1))), None, 'R8원단'

    # 1) 운반·서비스 (R9 + ⑪-D B1)
    if re.match(r'^(택배비?|대신택배|대신화물|경동화물|한진택배|우체국|화물비?|운임비?)', t):
        return 'ETC-SHIP', None, 'B1'
    if re.match(r'^(퀵비|퀵|용차비?|용달|긴급배송)', t):
        return 'ETC-EXP', None, 'B1'
    if re.match(r'^크레인', t):
        return 'ETC-CRANE', None, 'B1'
    if re.match(r'^(시안비?|디자인비)$', t) or re.match(r'^시안', t):
        return 'ETC-DESIGN', None, 'B3'
    if re.match(r'^(재단|컷팅|재단비)', t):
        return 'ETC-CUT', None, 'R9'
    if t == 'DC' or re.search(r'할인|에누리', t):
        return 'ETC-DISC', None, 'R9'

    # 2) 간판 자재 (SGM — 용준님 "간판 자재만 먼저 등록". 완제품·시공은 아래 HOLD로 계속 NULL)
    if re.match(r'^LED\s*형광등|^LED형광등', t):
        return pick('SGM-LEDF'), None, '간판자재'
    if re.match(r'^SMPS', t):
        return pick('SGM-SMPS'), None, '간판자재'
    if re.match(r'^KPL', t):
        return pick('SGM-LED3-KPL'), None, '간판자재'
    if re.match(r'^JPL', t):
        return pick('SGM-LED3-JPL'), None, '간판자재'
    if re.match(r'^LED\s*3구|^LED3구', t):
        return pick('SGM-LED3-WH', 'SGM-LED3'), None, '간판자재'
    if re.match(r'^(채널\s*)?트러스바', t):
        return pick('SGM-TRB'), None, '간판자재'
    if re.match(r'^15각\s*파이프', t):
        return pick('SGM-PIPE-P15'), None, '간판자재'
    if re.match(r'^각파이프', t):
        return pick('SGM-PIPE', 'SGM-PIPE-P15'), None, '간판자재'
    if re.match(r'^갈바', t) and not re.search(r'완제품|부착|\+|간판', t):
        return pick('SGM-GALVA'), None, '간판자재'
    if re.match(r'^앵글', t):
        return pick('SGM-ANGLE'), None, '간판자재'
    if re.match(r'^조립\s*배선|^조립배선', t):
        return pick('SGM-WIRE'), None, '간판자재'

    # 2b) 간판 완제품·시공 보류 (R10/B2 → item_id NULL)
    if re.search(r'채널\s*간판|프레임\s*간판|^간판|갈바|각관|KPL|JPL|앵글|트러스|^채널\b', t):
        return None, None, 'HOLD간판'

    # 3) SET·태극기 계열 (A1~A8 — 일반 태극기 규칙보다 먼저)
    if re.search(r'태극기\s*정기자수삼발이', t):
        return pick('TGK-JASUSET-S135X90'), None, 'A4'
    if re.match(r'^정기\s*자수\s*삼발이', t):
        c = pick(f'GDS-JASUSET-S{wh[0]}X{wh[1]}' if wh else None, 'GDS-JASUSET')
        return c, None, 'A3'
    FLAG_PFX = [(r'새마을', 'SMG'), (r'노인회', 'NHG'), (r'민방위', 'MBG'),
                (r'무재해', 'MJG'), (r'만국기?', 'MGG')]

    def flag_pfx():
        for pat, pfx in FLAG_PFX:
            if re.search(pat, t):
                return pfx
        return 'TGK'

    if '가로기' in t and '깃대' in t:                     # 깃대 단품 — A1(SET)보다 먼저. '깃대조립(가로기)' 표기 포함
        gu = re.search(r'([23])\s*구', f'{t} {spec} {content}')
        pole = re.search(r'R\s*-?\s*(1[35]0)', f'{t} {spec} {content}')
        if gu and pole:
            return pick(f'ACC-030-R{pole.group(1)}-{gu.group(1)}'), None, 'A1단품'
        return pick('ACC-034'), None, 'A1단품'
    if re.search(r'차량|자전거|오토바이', t) and re.search(r'깃대', t):
        return pick('ACC-031'), None, '부속'
    if re.search(r'P\s*-?\s*\d?단.*깃대|^P단', t):        # P/R단 깃대(조립 표기 포함) — A1보다 먼저
        return pick('ACC-032'), None, '부속'
    if re.search(r'R\s*-?\s*\d?단.*깃대|^R단', t):
        return pick('ACC-033'), None, '부속'
    if re.search(r'목재\s*깃대|목재깃대', t):
        return pick('ACC-034'), None, '부속'
    if re.search(r'깃대\s*조립', t):                      # A1: SET 품목 한 줄 + BOM (0503 — 용준님 "SET+BOM")
        gu = re.search(r'([23])\s*구', f'{t} {spec}')
        pole = re.search(r'R\s*-?\s*(1[235]0)', f'{t} {spec}')
        pfx = flag_pfx()
        ho = SIZE2HO.get(wh) if wh else None
        if gu and pole and ho:
            return pick(f'{pfx}-GDSET-{ho}-R{pole.group(1)}-{gu.group(1)}'), None, 'A1'
        return None, None, 'A1미해석'
    if re.search(r'수기대\s*조립', t):                    # A2: SET 품목 한 줄 + BOM (0503)
        if flag_pfx() != 'TGK':
            return None, None, 'A2미해석'
        # 길이 표기 2형: '수기대 50CM' / '수기 p-50(30*20)'
        ln = re.search(r'(40|50|60)\s*(?:CM|cm|㎝)|[pP]\s*-?\s*(40|50|60)', f'{t} {spec}')
        sz = '30' if wh in ((30, 20), (20, 30)) else '45' if wh in ((45, 30), (30, 45)) else None
        if sz and ln:
            return pick(f'TGK-SGSET-{sz}-L{ln.group(1) or ln.group(2)}'), None, 'A2'
        return None, None, 'A2미해석'
    if re.match(r'^수기($|[\s(])', t) or t == '수기':      # 수기 단독 판매
        return pick('TGK-SG30' if wh == (30, 20) else 'TGK-SG45' if wh == (45, 30) else None), None, 'R6'
    if re.search(r'근조기', t):
        return pick(f'GJG-JASU-S{wh[0]}X{wh[1]}' if wh else None), None, '근조기'
    if re.match(r'^국기봉', t):
        return pick('ACC-042'), None, '부속'
    m = re.search(r'까치발\s*-?\s*(\d{3,4})', t)
    if m:
        return pick(f'ACC-029-{m.group(1)}'), None, '부속'
    if re.match(r'^원형나무', t):
        both = f'{t} {spec}'
        if '70' in both:
            return pick('WDR-20-070'), None, '부속'
        return pick('WDR-25-090' if '25mm' in both else 'WDR-01'), None, '부속'
    if re.search(r'가정용\s*\(?지관\)?', t):
        return pick('GDS-JIGWANSET'), None, 'A6'
    if re.search(r'가정용\s*함\s*세트|가정용함세트', t):
        return pick('GDS-FBSET'), None, 'A5'
    if re.search(r'가정용함\(P\)', t):
        return None, None, 'A5보류'
    if re.search(r'배너대\s*조립', t):
        return pick(f'ACC-013-S{wh[0]}X{wh[1]}' if wh else None, 'ACC-013'), None, 'A7'
    if 'ㄷ자' in t and '꽂이' in t:
        return pick('ACC-035-R-D'), None, '부속'          # ㄷ자는 1/2구와 별도 (용준님 2026-07-30)
    m = re.search(r'([PSR])\s*-?\s*([12])\s*구\s*꽂이', t)
    if m:
        return pick(f'ACC-035-{m.group(1)}-{m.group(2)}'), None, '부속'
    if re.search(r'회전\s*고리|회전고리', t):
        return pick('ACC-014'), None, '부속'
    if re.search(r'국기함', t):
        if re.search(r'중급', ctx):
            return pick('GDS-FB2'), None, '부속'
        return pick('GDS-FB1'), None, '부속'              # 등급 무표기 = 보급형 (용준님 2026-07-30)
    if re.search(r'좌우보필', t):
        return pick(f'GDS-LRF-S{wh[0]}X{wh[1]}' if wh else None), None, '변종'
    if re.search(r'특호|대형\s*태극기', t):               # A8 (근사 포함)
        if wh:
            c = pick(f'TGK-SPECIAL-S{wh[0]}X{wh[1]}')
            if not c:  # 근사: 면적 최근접
                area = wh[0] * wh[1]
                cands = [('TGK-SPECIAL-S900X600', 540000), ('TGK-SPECIAL-S540X360', 194400),
                         ('TGK-SPECIAL-S1200X800', 960000)]
                c = min(cands, key=lambda x: abs(x[1] - area))[0]
            return c, None, 'A8'
        return pick('TGK-SPECIAL-S540X360'), None, 'A8'   # '특호기' 0500 별칭 = 540×360 전건 확인

    # 태극기 본품·수기·배너
    if re.search(r'태극기\s*배너', t):
        return 'TRTB', None, 'R6'
    if re.search(r'태극기[\s-]*수기', t):
        return pick('TGK-SG30' if wh == (30, 20) else 'TGK-SG45' if wh == (45, 30) else 'TGK-SG30'), None, 'R6'
    m = re.search(r'태극기\s*(\d+)호(-1)?\s*(?:\(?([23])구)?\s*(게양용)?', t)
    if m and '함' not in t:
        ho = m.group(1) + (m.group(2) or '')
        gy = bool(m.group(4)) or '게양' in t
        return pick(f'TGK-{ho}G' if gy else f'TGK-{ho}', f'TGK-{ho}'), None, 'R6/R7'
    for pat, pfx in [(r'새마을기', 'SMG'), (r'노인회기', 'NHG'), (r'민방위기', 'MBG'),
                     (r'무재해기', 'MJG'), (r'만국기', 'MGG')]:
        if re.match(f'^{pat}', t):                        # R12 기념기
            m = re.search(r'(\d+)호(-1)?', t)
            gy = '게양' in t
            if m:
                ho = m.group(1) + (m.group(2) or '')
                return pick(f'{pfx}-{ho}G' if gy else f'{pfx}-{ho}', f'{pfx}-{ho}'), None, 'R12'
            if wh and wh in SIZE2HO:
                return pick(f'{pfx}-{SIZE2HO[wh]}'), None, 'R12'
            return None, None, 'R12미해석'

    # 정기(본염·자수) — 깃발보다 먼저
    if re.search(r'정기\s*본염|본염', t):                 # 규격이 있는데 변종이 없으면 NULL(강제 폴백 금지)
        if wh:
            return pick(f'JG-BONYEOM-S{wh[0]}X{wh[1]}'), None, 'R3'
        return pick('JG-BONYEOM-S135X90'), None, 'R3'
    if re.search(r'정기.*자수|자수.*깃발|^정기\s', t):
        if wh:
            return pick(f'JG-JASU-S{wh[0]}X{wh[1]}'), None, 'R3'
        return pick('JG-JASU-S135X90'), None, 'R3'
    if re.search(r'정기\s*창깃대|창깃대', t):
        return pick('ACC-034'), None, 'R3부속'            # 깃대(기타) = 가로/목재/창/현수기
    if re.search(r'그라스\s*화이바|그라스화이바|유리섬유', t):
        return pick('ACC-037'), None, '부속'
    if re.search(r'황금봉|금봉', t):
        return pick('ACC-042'), None, '별칭'
    if re.search(r'삼발이', t):
        return pick('ACC-015'), None, '별칭'

    # 깃발 (R3 = 전사 폰지 기본, 소재 표기 시 변경)
    if re.match(r'^깃발', t):
        mat = 'ME' if '매쉬' in ctx else 'SA' if '샤틴' in ctx else 'PO'
        return pick(f'TRG-{mat}', 'TRG-PO'), None, 'R3'

    # 전사 계열 (⑥-1 단일방식: 미기재여도 전사)
    if re.match(r'^가로등\s*배너|^가로등배너', t):
        mat = 'ME' if '매쉬' in ctx else 'PO'
        if wh:                                            # 근사: 긴 변을 150/160/180 최근접으로
            size = min((150, 160, 180), key=lambda s: abs(s - max(wh)))
            return pick(f'TRB-{mat}-{size}'), None, 'R4가로등'
        return None, None, 'R4가로등미해석'
    if re.match(r'^윈드\s*배너|^윈드배너', t):
        mat = 'ME' if '매쉬' in ctx else 'PO'
        form = 'F' if re.search(r'F형|F타입', ctx) else 'S'
        return pick(f'TRW-{mat}-{form}'), None, 'R4윈드'
    if re.match(r'^워킹\s*배너|^워킹배너', t):
        mat = 'ME' if '매쉬' in ctx else 'PO'
        form = 'H' if re.search(r'H형', ctx) else 'F' if re.search(r'F형', ctx) else 'S'
        return pick(f'TRWK-{mat}-{form}'), None, 'R4워킹'
    if re.match(r'^자이언트\s*배너|^자이언트배너', t):
        return pick('TRGI-ME' if '매쉬' in ctx else 'TRGI-PO'), None, 'R4자이언트'
    if re.search(r'자이언트\s*트라이폴|트라이폴', t):
        return pick('ACC-023'), None, '별칭'
    if re.match(r'^만장기', t):
        mat = 'ME' if '매쉬' in ctx else 'SA' if '샤틴' in ctx else 'PO'
        return pick(f'TRM-{mat}'), None, 'R4만장기'
    if re.match(r'^어구실명제|^어구\s', t):
        return 'TRE-ME', None, 'R4'
    if re.match(r'^외국기\s*배너', t):
        return 'TRFB', None, 'R4'
    if re.match(r'^폰지|^열승화', t):                     # 열승화 폰지 = 전사 (⑥-1)
        if wh and abs(max(wh) - 180) <= 30:
            return pick(f'TRB-PO-{min((150, 160, 180), key=lambda s: abs(s - max(wh)))}'), None, 'R4폰지'
        return pick('TRG-PO'), None, 'R4폰지'

    # 현수막 (R1·R2·4-2)
    if re.match(r'^솔벤\s*현수막', t):
        return 'SV-BANNER', None, 'R2'
    if re.match(r'^UV\s*현수막', t):
        return pick('UV-BANNER'), None, 'R2'
    if re.search(r'게릴라', t):
        return pick('AQ-GERILLA'), None, 'R2'
    if re.match(r'^친환경\s*현수막|^현수막', t):
        return pick('AQ-BANNER'), None, 'R1'

    # 시트·후렉스·패트 (R13·R14·R11)
    uv = bool(re.search(r'UV', ctx))
    if re.search(r'후렉스', t):                           # R14: 기본 조명
        lit = not re.search(r'비조명|그레이\s*후렉스', ctx)
        return pick(f"{'UV' if uv else 'SV'}-FLEX{'L' if lit else 'N'}"), None, 'R14'
    if re.search(r'양면\s*배너', t):
        return pick('UV-FLEXD'), None, 'R2'
    if re.search(r'패트', t):                             # R11: 수성 기본 · 솔벤/나투라 표기 시 SV · UV=0503 신설
        if uv:
            return pick('UV-PATC'), None, 'R11'
        if re.search(r'솔벤|나투라', ctx):
            return pick('SV-PATB-NAT' if '나투라' in ctx else 'SV-PATB'), None, 'R11'
        return pick('AQ-PAT'), None, 'R11'
    if re.search(r'조명\s*시트|조명시트', t):
        return pick('UV-LSHT' if uv else 'SV-LSHT'), None, 'R13'
    if re.match(r'^솔벤\s*그레이\s*시트|^솔벤그레이시트', t):
        return pick('SV-SHEETG'), None, 'R13'
    if re.match(r'^솔벤\s*랩핑', t):
        return pick('SV-WRAP'), None, 'R13'
    if re.match(r'^솔벤\s*매쉬|^솔벤매쉬', t):
        return pick('SV-MESH'), None, 'R13'
    if re.match(r'^솔벤\s*시트|^솔벤시트', t):
        return pick('SV-SHEET'), None, 'R13'
    if re.search(r'랩핑\s*시트|랩핑시트', t):
        return pick('UV-WRAP' if uv else 'SV-WRAP'), None, 'R13'
    if re.search(r'그레이\s*시트|그레이시트|그레이켈', t):
        return pick(('UV-SHEETG' if uv else 'SV-SHEETG'), 'AQ-KELG'), None, 'R13'
    if re.search(r'매쉬', t) and re.match(r'^(UV\s*)?매쉬', t):
        return pick('UV-MESH' if uv else 'SV-MESH'), None, 'R13'
    if re.match(r'^(UV\s*)?시트\b|^(UV)?시트$|^시트', t):
        return pick('UV-SHEET' if uv else 'SV-SHEET'), None, 'R13'
    if re.search(r'켈\s*그레이', t):
        return pick('AQ-KELG'), None, 'R1'
    if re.match(r'^켈|^수성\s*켈', t):
        return pick('AQ-KEL'), None, 'R1'
    if re.search(r'합성지\s*그레이', t):
        return pick('AQ-SYNG'), None, 'R1'
    if re.search(r'합성지', t):
        return pick('AQ-SYN'), None, 'R1'
    if re.search(r'텐트천', t):
        if uv:
            return pick('UV-TENT'), None, 'R1'            # 0503 신설
        return pick('SV-TENT' if '솔벤' in ctx else 'AQ-TENT'), None, 'R1'
    if re.match(r'^어깨띠', t):
        return pick('AQ-SASH'), None, 'R1'
    if re.match(r'^머리띠', t):
        return pick('AQ-HEADBAND'), None, 'R1'
    if re.search(r'백릿|와이드\s*컬러|와이드컬러', t):
        return pick('UV-BKLT' if uv else 'AQ-BKLT'), None, 'R1'
    if re.match(r'^실내\s*배너|^실내배너', t):
        return pick('AQ-INB'), None, 'R1'
    if re.match(r'^미니\s*배너|^미니배너', t):
        return pick('AQ-MNB'), None, 'R1'
    if re.search(r'캔버스|캠퍼스', t):
        return pick('SV-CANVAS'), None, 'R2'
    if re.search(r'클리어', t):
        return pick('UV-CLEAR'), None, 'R2'
    if re.search(r'투명\s*시트', t):
        return pick('UV-SPC031G'), None, 'R2'
    if re.search(r'엠보', t) and uv:
        return pick('UV-EMBO'), None, 'R2'
    if re.search(r'뽀닥.*직물', t):
        return pick('UV-PDK-J'), None, 'R2'
    if re.search(r'뽀닥.*호일|뽀닥', t):
        return pick('UV-PDK-F'), None, 'R2'

    # 판재 (R5)
    m = re.match(r'^포맥스\s*([\d\.]+)\s*T?', t)
    if m:
        thick = m.group(1)
        if thick.endswith('.0'):                          # ⚠️ rstrip('.0')은 '10'→'1'로 문자를 깎는다
            thick = thick[:-2]
        color = 'B' if re.search(r'검정|흑색', t) else 'W'
        return pick(f'UV-FMX-{thick}T-{color}', f'UV-FMX-{thick}T-W'), None, 'R5'
    if re.match(r'^폼보드', t):
        return pick('UV-FOM-5T-W'), None, 'R5'
    if re.match(r'^알마이트', t):
        return pick('UV-ALM-2T-S'), None, 'R5'
    m = re.match(r'^스카시\s*([\d\.]+)\s*T', t)
    if m:
        c = 'B' if re.search(r'검정|흑색', t) else 'W'
        return pick(f'UV-SKS-{m.group(1)}T-{c}'), None, 'R5'
    m = re.search(r'^광[확학]산\s*PC?\s*-?\s*([\d\.]+)\s*T|^광[확학]산PC-?([\d\.]+)T', t)
    if m:
        n = m.group(1) or m.group(2)
        return pick(f'UV-PC-{n}T-M'), None, 'R5'
    m = re.match(r'^자작나무\s*(\d+)\s*T', t)
    if m:
        return pick(f'UV-JJN-{int(m.group(1)):02d}T'), None, 'R5'
    if re.search(r'고휘도\s*반사|고휘도반사', t):
        return pick('UV-PRM-Y' if re.search(r'노랑|황색', ctx) else 'UV-PRM-W'), None, 'R5'
    m = re.match(r'^아크릴\s*([\d\.]+)T?', t)
    if m:                                                 # 색상 미표기 = 백색 고정 (용준님 2026-07-30)
        c = 'B' if re.search(r'검정|흑색|블랙', ctx) else 'C' if re.search(r'투명', ctx) else 'W'
        return pick(f'UV-ACR-{m.group(1)}T-{c}', f'UV-ACR-{m.group(1)}T-W', f'UV-ACR-{m.group(1)}T-C'), None, 'R5'

    # 기타 별칭 (0499·0500 search_keywords가 잡는 것 포함)
    if re.match(r'^부직포', t):                           # 부직포 = 수성 출력 (용준님 2026-07-30)
        return pick('AQ-BUJIK'), None, 'R1'
    if re.search(r'탁상용', t):
        return pick('GDS-DESK'), None, '별칭'

    # 4) 일반 폴백: 품목명 완전일치 → search_keywords
    k = norm(t)
    if k in NAME_IDX:
        return NAME_IDX[k], None, '이름일치'
    if k in KW_IDX:
        return KW_IDX[k], None, '키워드'
    return None, None, '미매칭'


# ── 원천 로드 ─────────────────────────────────────────────────────────
def cell(r, ix, name):
    return r[ix[name]] if name in ix and ix[name] < len(r) and r[ix[name]] is not None else ''


def num(v):
    if isinstance(v, (int, float)):
        return int(v) if float(v).is_integer() else float(v)
    if isinstance(v, str) and v.strip():
        try:
            f = float(v.replace(',', ''))
            return int(f) if f.is_integer() else f
        except ValueError:
            return 0
    return 0


slips = {}          # (date, no) → dict(client_code, lines[])
month_stats = defaultdict(lambda: [0, 0, 0])   # mm → [lines, supply, vat]
for mm in MONTHS:
    wb = openpyxl.load_workbook(os.path.join(SRC, f'동산_판매현황_26{mm}.xlsx'), data_only=True)
    ws = wb.worksheets[0]
    rr = list(ws.iter_rows(max_col=20, values_only=True))
    hdr = [('' if v is None else str(v).strip()) for v in rr[1]]
    ix = {n: i for i, n in enumerate(hdr) if n}
    for r in rr[2:]:
        head = '' if r[0] is None else str(r[0]).strip()
        if not LINE.match(head):
            continue
        cc = str(cell(r, ix, '거래처코드')).strip()
        if cc in EXCL:
            continue
        d8, no = head.split()
        date = d8.replace('/', '-')
        key = (date, no)
        s = slips.setdefault(key, dict(cc=cc, cn=str(cell(r, ix, '거래처명')).strip(),
                                       mgr=str(cell(r, ix, '사원(담당)명')).strip(),
                                       ship=str(cell(r, ix, '출고방법')).strip(),
                                       addr=str(cell(r, ix, '배송처주소')).strip(), lines=[]))
        assert s['cc'] == cc, f'전표 {key} 거래처 혼재: {s["cc"]} vs {cc}'
        qty = num(cell(r, ix, '수량'))
        up = num(cell(r, ix, '단가'))
        sup = num(cell(r, ix, '공급가액'))
        vat = num(cell(r, ix, '부가세'))
        s['lines'].append(dict(nm=str(cell(r, ix, '품목명')).strip(), sp=str(cell(r, ix, '규격')).strip(),
                               ct=str(cell(r, ix, '내용')).strip(), jk=str(cell(r, ix, '적요')).strip(),
                               qty=qty, up=up, sup=sup, vat=vat))
        month_stats[mm][0] += 1
        month_stats[mm][1] += sup
        month_stats[mm][2] += vat
    wb.close()

total_lines = sum(v[0] for v in month_stats.values())
total_sup = sum(v[1] for v in month_stats.values())
total_vat = sum(v[2] for v in month_stats.values())
print(f'원천(제외 후): 전표 {len(slips):,} · 라인 {total_lines:,} · 공급가 {total_sup:,} · 부가세 {total_vat:,}')
# 총계 assert 는 상반기 전량 실행일 때만 — 부분 실행은 기대값이 다르다(월별 기대값은 EXPECT 로 확인)
EXPECT = {'07': (2469, 308730852)}   # 2026-07: 선명·자기거래 제외 후 실측(2026-08-06 최초 산출)
if not SFX:
    assert total_lines == 16873, f'라인수 불일치: {total_lines} (기대 16,873)'
    assert total_sup == 2885353724, f'공급가 불일치: {total_sup} (기대 2,885,353,724)'
else:
    for mm in MONTHS:
        if mm in EXPECT:
            e = EXPECT[mm]
            assert month_stats[mm][0] == e[0], f'26{mm} 라인수 불일치: {month_stats[mm][0]} (기대 {e[0]:,})'
            assert month_stats[mm][1] == e[1], f'26{mm} 공급가 불일치: {month_stats[mm][1]} (기대 {e[1]:,})'

# 거래처 해석 100% 확인
unresolved = set()
for (date, no), s in slips.items():
    if resolve_client(s['cc']) is None:
        unresolved.add((s['cc'], s['cn']))
assert not unresolved, f'거래처 미해석: {unresolved}'
print('거래처 해석 = 전 전표 100%')

# ── 품목 매칭 실행 ─────────────────────────────────────────────────────
tag_stats = defaultdict(lambda: [0, 0])
unmatched = defaultdict(lambda: [0, 0])
for s in slips.values():
    for ln in s['lines']:
        code, extra, tag = match_item(ln['nm'], ln['sp'], ln['ct'])
        ln['code'], ln['extra'] = code, extra
        tag_stats[tag][0] += 1
        tag_stats[tag][1] += ln['sup'] if isinstance(ln['sup'], (int, float)) else 0
        if code is None:
            unmatched[ln['nm']][0] += 1
            unmatched[ln['nm']][1] += ln['sup'] if isinstance(ln['sup'], (int, float)) else 0

matched_l = sum(v[0] for k, v in tag_stats.items() if k not in
                ('미매칭', 'HOLD간판', 'A1미해석', 'A2미해석', 'R12미해석', 'A5보류'))
matched_s = sum(v[1] for k, v in tag_stats.items() if k not in
                ('미매칭', 'HOLD간판', 'A1미해석', 'A2미해석', 'R12미해석', 'A5보류'))
print(f'\n품목 매칭: {matched_l:,}/{total_lines:,}라인 ({matched_l/total_lines*100:.1f}%) · '
      f'{matched_s:,.0f}원 ({matched_s/total_sup*100:.1f}%)')

# ── 감사 모드 (--audit): 매핑 정합성 프로브 + 전체 매핑표 ─────────────────
if '--audit' in sys.argv:
    FLAGS = {'TGK': '태극기', 'SMG': '새마을', 'NHG': '노인회', 'MBG': '민방위', 'MJG': '무재해', 'MGG': '만국'}
    KW2PFX = [('민방위', 'MBG'), ('새마을', 'SMG'), ('노인회', 'NHG'), ('무재해', 'MJG'), ('만국기', 'MGG'), ('태극기', 'TGK')]
    probes = defaultdict(list)
    for s in slips.values():
        for ln in s['lines']:
            nm, sp, ct, code = ln['nm'], ln['sp'], ln['ct'], ln['code']
            if not code:
                continue
            ctx = f'{nm} {ct}'
            pfx = code.split('-')[0]
            # 1) 기(旗) 종류 교차
            exp = next((p for kw, p in KW2PFX if kw in nm), None)
            if exp and pfx in FLAGS and pfx != exp:
                probes['기종류교차'].append((nm, sp, code, ln['sup']))
            # 2) 게양용인데 G 아님
            if '게양' in nm and pfx in FLAGS and not code.split('-')[-1].endswith('G'):
                probes['게양용→일반폴백'].append((nm, sp, code, ln['sup']))
            # 3) 인쇄방식 접두 교차
            if re.match(r'^UV', nm) and not code.startswith(('UV-',)):
                probes['UV표기≠UV코드'].append((nm, sp, code, ln['sup']))
            if re.match(r'^솔벤', nm) and not code.startswith(('SV-', 'SVB')):
                probes['솔벤표기≠SV코드'].append((nm, sp, code, ln['sup']))
            if re.match(r'^수성', nm) and not code.startswith(('AQ-',)):
                probes['수성표기≠AQ코드'].append((nm, sp, code, ln['sup']))
            # 4) 소재 (전사 계열)
            if code.startswith(('TRB', 'TRG-', 'TRGI', 'TRM', 'TRW', 'TRWK')) :
                if '매쉬' in ctx and '-ME' not in code:
                    probes['매쉬표기≠ME'].append((nm, sp, code, ln['sup']))
                if '샤틴' in ctx and '-SA' not in code:
                    probes['샤틴표기≠SA'].append((nm, sp, code, ln['sup']))
            # 5) 색상 (판재)
            if code.startswith(('UV-FMX', 'UV-ACR', 'UV-FOM')):
                if re.search(r'검정|흑색|블랙', ctx) and not code.endswith('-B'):
                    probes['검정표기≠B'].append((nm, sp, code, ln['sup']))
                if re.search(r'투명', ctx) and not code.endswith('-C'):
                    probes['투명표기≠C'].append((nm, sp, code, ln['sup']))
            # 6) 두께 (제로패딩 무시 — 수치 비교)
            mt = re.search(r'([\d\.]+)\s*[Tt]', nm)
            mc = re.search(r'-0*([\d\.]+)[Tt]', code)
            if mt and mc and float(mt.group(1)) != float(mc.group(1)):
                probes['두께불일치'].append((nm, sp, code, ln['sup']))
            # 7) 호수 (기 본품)
            mh = re.search(r'(\d+)호(-1)?', nm)
            if mh and pfx in FLAGS and '-S' not in code:
                ho = mh.group(1) + (mh.group(2) or '')
                body = code[len(pfx) + 1:].rstrip('G')
                if body and body != ho:
                    probes['호수불일치'].append((nm, sp, code, ln['sup']))
            # 8) 규격변종 -S{W}X{H} (특호 근사 제외)
            mv = re.search(r'-S(\d+)X(\d+)$', code)
            if mv and not code.startswith('TGK-SPECIAL'):
                wh2 = parse_wh(sp)
                if wh2 and wh2 != (int(mv.group(1)), int(mv.group(2))):
                    probes['변종규격불일치'].append((nm, sp, code, ln['sup']))

    print('\n■ 정합성 프로브 (건수 0 = 통과)')
    for k in ['기종류교차', '게양용→일반폴백', 'UV표기≠UV코드', '솔벤표기≠SV코드', '수성표기≠AQ코드',
              '매쉬표기≠ME', '샤틴표기≠SA', '검정표기≠B', '투명표기≠C', '두께불일치', '호수불일치', '변종규격불일치']:
        v = probes.get(k, [])
        amt = sum(x[3] for x in v if isinstance(x[3], (int, float)))
        print(f'  {k:<16}{len(v):>5}건 {amt:>13,.0f}원')
        for nm, sp, code, sup in sorted(v, key=lambda x: -(x[3] if isinstance(x[3], (int, float)) else 0))[:6]:
            print(f'      {nm[:30]:<32}[{sp[:14]:<14}] → {code:<22}{sup:>11,.0f}')

    # 전체 매핑표 (품목명×코드 집계, 금액순)
    agg = defaultdict(lambda: [0, 0])
    for s in slips.values():
        for ln in s['lines']:
            it = IT_BY_CODE.get(ln['code']) if ln['code'] else None
            key = (ln['nm'], ln['code'] or '(NULL)', it['item_name'] if it else '')
            agg[key][0] += 1
            agg[key][1] += ln['sup'] if isinstance(ln['sup'], (int, float)) else 0
    path = os.path.join(OUT, '매핑감사.csv')
    with open(path, 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.writer(f)
        w.writerow(['이카운트품목명', 'MES코드', 'MES품목명', '라인', '공급가액'])
        for (nm, code, iname), (l, a) in sorted(agg.items(), key=lambda x: -x[1][1]):
            w.writerow([nm, code, iname, l, a])
    print(f'\n매핑표 {len(agg):,}행 → {path}')
    sys.exit(0)

# ── SQL 생성 ──────────────────────────────────────────────────────────
def q(s):
    s = str(s or '').replace("'", "''")
    return re.sub(r'[\x00-\x08\x0b-\x1f]', ' ', s)


def sqlnum(v):
    if isinstance(v, float):
        return repr(round(v, 4))
    return str(v)


files = {}
seq_by_date = defaultdict(int)
order_count = 0
for (date, no), s in sorted(slips.items(), key=lambda x: (x[0][0], int(x[0][1]))):
    mm = date[5:7]
    buf = files.setdefault(mm, [])
    seq_by_date[date] += 1
    onum = f'E1-{date.replace("-", "")}-I{seq_by_date[date]:03d}'
    cid = resolve_client(s['cc'])
    tot = sum(ln['sup'] for ln in s['lines'])
    vat = sum(ln['vat'] for ln in s['lines'])
    fin = tot + vat
    ts = f'{date} 09:00:00'
    notes = MARKER + (f' · 담당 {s["mgr"]}' if s['mgr'] else '') + f' · 전표 {date} {no}'
    buf.append(
        "INSERT INTO orders (order_number,client_id,entity_id,order_date,status,order_type,"
        "total_amount,vat_amount,final_amount,created_by,notes,billing_status,billed_amount,"
        "billed_by,billed_at,accounting_date,delivery_method,delivery_info,created_at,updated_at) VALUES "
        f"('{onum}',{cid},1,'{date}','SHIPPED','PRODUCTION',{sqlnum(tot)},{sqlnum(vat)},{sqlnum(fin)},5,"
        f"'{q(notes)}','BILLED',{sqlnum(fin)},5,'{ts}','{date}','{q(s['ship'])}','{q(s['addr'])}','{ts}','{ts}');")
    buf.append(
        "INSERT INTO order_billing_groups (order_id,entity_id,billing_status,billed_amount,"
        "supply_amount,tax_amount,billed_at,billed_by,accounting_date,created_at) VALUES "
        f"((SELECT id FROM orders WHERE order_number='{onum}' AND entity_id=1),1,'BILLED',"
        f"{sqlnum(fin)},{sqlnum(tot)},{sqlnum(vat)},'{date}',5,'{date}','{ts}');")
    so = 0
    for ln in s['lines']:
        it = IT_BY_CODE.get(ln['code']) if ln['code'] else None
        iid = it['id'] if it else 'NULL'
        unit = (it['unit'] if it and it['unit'] else 'EA')
        content = ln['ct'] + ((' | ' + ln['jk']) if ln['jk'] else '')
        buf.append(
            "INSERT INTO order_items (order_id,item_id,item_name,specification,content,quantity,"
            "unit,unit_price,amount,vat_included,sort_order,created_at) VALUES "
            f"((SELECT id FROM orders WHERE order_number='{onum}' AND entity_id=1),{iid},"
            f"'{q(ln['nm'])}','{q(ln['sp'])}','{q(content)}',{sqlnum(ln['qty'])},'{q(unit)}',"
            f"{sqlnum(ln['up'])},{sqlnum(ln['sup'])},0,{so},'{ts}');")
        so += 1
        if ln['extra']:                                   # A1/A2 분해 부속 (금액 0 — 총액 보존)
            acc_code, note = ln['extra']
            acc = IT_BY_CODE[acc_code]
            buf.append(
                "INSERT INTO order_items (order_id,item_id,item_name,specification,content,quantity,"
                "unit,unit_price,amount,vat_included,sort_order,created_at) VALUES "
                f"((SELECT id FROM orders WHERE order_number='{onum}' AND entity_id=1),{acc['id']},"
                f"'{q(acc['item_name'])}','{q(ln['sp'])}','{q(note)}',{sqlnum(ln['qty'])},'EA',0,0,0,{so},'{ts}');")
            so += 1
    order_count += 1

for mm, buf in files.items():
    with open(os.path.join(OUT, f'sales_26{mm}.sql'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(buf) + '\n')

with open(os.path.join(OUT, f'rollback_sales{SFX}.sql'), 'w', encoding='utf-8') as f:
    f.write(f"""-- 동산 이카운트 판매 이관 롤백 (마커 기준 — 이관분만 정확히 제거)
DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE entity_id=1 AND notes LIKE '{MARKER}%');
DELETE FROM order_billing_groups WHERE order_id IN (SELECT id FROM orders WHERE entity_id=1 AND notes LIKE '{MARKER}%');
DELETE FROM orders WHERE entity_id=1 AND notes LIKE '{MARKER}%';
""")

# ── 요약 ──────────────────────────────────────────────────────────────
rep = []
rep.append(f'전표(주문) {order_count:,} · 라인 {total_lines:,}(+분해 부속 '
           f'{sum(1 for s in slips.values() for ln in s["lines"] if ln["extra"]):,}) · '
           f'공급가 {total_sup:,} · 부가세 {total_vat:,}')
rep.append('\n월별 (원천 제외 후 실측 → SQL 반영값):')
for mm in MONTHS:
    v = month_stats[mm]
    rep.append(f'  26{mm}: {v[0]:>6,}L · 공급가 {v[1]:>13,} · 부가세 {v[2]:>12,}')
rep.append(f'\n품목 매칭 {matched_l:,}L ({matched_l/total_lines*100:.1f}%) · {matched_s:,.0f}원 ({matched_s/total_sup*100:.1f}%)')
rep.append('\n태그별:')
for k, v in sorted(tag_stats.items(), key=lambda x: -x[1][1]):
    rep.append(f'  {k:<12}{v[0]:>7,}L {v[1]:>15,.0f}원')
rep.append('\n미매칭 상위 30 (item_id NULL 보존 — 금액순):')
for nm, v in sorted(unmatched.items(), key=lambda x: -x[1][1])[:30]:
    rep.append(f'  {nm[:34]:<36}{v[0]:>5}L {v[1]:>13,.0f}원')
report = '\n'.join(rep)
print('\n' + report)
with open(os.path.join(OUT, f'SUMMARY{SFX}.md'), 'w', encoding='utf-8') as f:
    f.write(f'# 매출 적재 SQL 생성 요약 (2026-07-30)\n\n```\n{report}\n```\n')
print('\nSQL →', OUT)
