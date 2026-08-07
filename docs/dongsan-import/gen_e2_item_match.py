# -*- coding: utf-8 -*-
"""선명(entity 2) 2026-07 판매라인 → MES 품목 매칭 (2026-08-07).

★ 선명 이카운트 품목코드는 MES 와 **완전히 다른 계열**이다(`A404`·`D001`·`0-0-0002`).
   코드로는 매칭률 0% 라 **품목명 + 규격**으로만 붙인다(용준님 확정).

선명 매출은 대부분 **원자재·시트 유통**이라 품목명이 MES `item_code` 의 앞부분과 직결된다:
   `SPM011G` + `127폭`  → `SPM011G-127`
   `SPP031M` + `105폭`  → `SPP031M-105`
그래서 규칙 순서를 **좁은 것 → 넓은 것**으로 둔다. 뒤집으면 폭이 다른 형제 품목에 잘못 붙는다.

  R1 코드직결 : 품목명이 그대로 코드 접두 + 규격의 폭 숫자 → `<품목명>-<폭3자리>`
  R2 정확일치 : 품목명 == item_name (정규화) + 폭 일치
  R3 이름+폭  : item_name 이 품목명을 포함 + item_code 가 해당 폭으로 끝남
  R4 이름만   : 폭 표기가 없는 품목(부속·상품) 은 이름 정확일치만 허용

미매칭은 `item_id NULL` 로 적재한다 — 매출액·거래처는 정확하고 원가 분석에서만 빠진다(동산 상반기와 동일).

사용: python docs/dongsan-import/gen_e2_item_match.py <items_full.json> <sales.xlsx>
산출: docs/dongsan-import/load/e2_item_map.json  (품목명|규격 → item_id)
"""
import openpyxl, json, sys, re, os, warnings
from collections import Counter
warnings.filterwarnings('ignore')
sys.stdout.reconfigure(encoding='utf-8')

ITEMS_JSON, XLSX = sys.argv[1], sys.argv[2]
LINE = re.compile(r'^\d{4}/\d\d/\d\d\s+-\d+$')
WIDTH = re.compile(r'(\d{2,3})\s*폭')


def norm(s):
    # ⚠️ '/' 를 빼먹으면 「…(61m/120g)-호홍」 같은 품명이 별칭 키와 안 맞는다(11라인 미매칭 원인이었다)
    return re.sub(r'[\s\-_()/]+', '', str(s or '')).upper()


items = json.load(open(ITEMS_JSON, encoding='utf-8'))
act = [i for i in items if i.get('is_active')]
by_code = {str(i['item_code']).strip().upper(): i for i in act}
by_name = {}
for i in act:
    by_name.setdefault(norm(i['item_name']), []).append(i)

wb = openpyxl.load_workbook(XLSX)
ws = wb.active
combos = Counter()
for r in ws.iter_rows(min_row=3, values_only=True):
    if LINE.match(str(r[0] or '').strip()):
        combos[(str(r[4] or '').strip(), str(r[5] or '').strip())] += 1
wb.close()


# ★ 폭 관례 동일 (용준님 2026-08-07) — 현장 표기와 MES 코드가 다른 것뿐이다.
#   150폭 ≡ 152폭 · 122폭 ≡ 120폭. MES 는 152/120 만 두고 있어 그대로 찾으면 미매칭이 된다.
#   양방향으로 둔다 — 어느 쪽 표기가 원본에 오든 상관없게.
WIDTH_ALIAS = {150: 152, 152: 150, 122: 120, 120: 122}


def width_of(spec):
    m = WIDTH.search(spec or '')
    return int(m.group(1)) if m else None


def widths_of(spec):
    """찾아볼 폭 후보 — 원값 우선, 그다음 관례상 동일한 폭."""
    w = width_of(spec)
    if w is None:
        return []
    return [w] + ([WIDTH_ALIAS[w]] if w in WIDTH_ALIAS else [])


# ── 별칭 (선명 이카운트 품명 → MES 코드 접두) ──────────────────────────────
# 실측 미매칭 상위에서 나온 것만. **폭이 붙는 계열은 접두만** 주고 폭은 R1 이 붙인다.
#   선명은 원자재 유통이라 같은 물건을 자기 품명으로 부른다 — 원단 병합(§6-⑥)과 같은 뿌리다.
ALIAS_PFX = {
    '현수막1코팅S': 'AQ1',                     # 수성 현수막원단 1코팅
    '현수막2코팅S': 'AQ2',                     # 수성 현수막원단 2코팅
    '무광코팅지자동용61M120G호홍': 'MCP120',      # 무광코팅지 120g-호홍
    '무광코팅지자동용45M180G호홍': 'MCP180',      # 무광코팅지 180g-호홍
    '무광코팅지자동용61M180G호홍': 'MCP180',
    '친환경현수막TPM': 'ECB-T',                # 친환경 현수막원단 TPM
    '친환경현수막ECO': 'ECB-E',                # 친환경 현수막원단 eco
    'PVC켈30M잉크테크': 'KEL',                 # 켈 30M
    'PVC켈그레이30M잉크테크': 'KEL',             # ★그레이 변종은 MES 에 폭별 구분이 없어 같은 계열로 흡수
    '솔벤패트배너나투라': 'NAT',                 # 나투라 솔벤패트
}
# 폭이 없는 품목 — 이름 → 코드 직접
ALIAS_EXACT = {
    '수성잉크C': 'RM-I0001', '수성잉크M': 'RM-I0002',
    '수성잉크Y': 'RM-I0003', '수성잉크K': 'RM-I0004',
    '저밀도게릴라현수막S': 'AQ-GERILLA',
    # ── 부속·상품 품명 통일 (용준님 2026-08-07) ──────────────────────────
    #   선명 이카운트 표기 → MES 정본 품명. 같은 물건을 다르게 부르던 것뿐이다.
    '사각족자봉': 'ACC-049-SQ',
    '원형족자봉': 'ACC-049-CR',
    '족자봉쫄대': 'ACC-JJ-ZD5',
    '앙고리폴대': 'ACC-018',                    # 양고리 폴대
    '양고리폴대': 'ACC-018',
    '판형삼각접착고리': 'ACC-050-NP',
    '큐방원터치': 'ACC-047-OT',
    '까치발': 'ACC-029',
    '4MM볼로프': 'ACC-037-4MM',
    '5MM볼로프': 'ACC-037-5MM',
    '실외용철제배너TSO브랏켓형': 'ACC-026',        # 실외 철제배너 거치대(TSO)
    '실외용철제배너TSO물통형': 'ACC-027',
    '실내용철제배너TSSDT': 'ACC-028',
    'LED3구웜': 'SGM-LED3-WM',
    'LED3구백색': 'SGM-LED3-WH',
    '즉열인두기': 'GDS-INDUGI',                 # 인두기(열재단)
    'LG조명용시트LT4510': 'LT4510',
    'LT4058': 'SK-930',                       # LG시트-LT4058(122폭)
}


def match(nm, spec):
    w = width_of(spec)
    ws_ = widths_of(spec)
    n = norm(nm)
    # R0 — 별칭(선명 품명 → MES 계열). 좁은 규칙이라 가장 먼저.
    if n in ALIAS_EXACT and ALIAS_EXACT[n].upper() in by_code:
        return by_code[ALIAS_EXACT[n].upper()]['id'], 'R0e'
    if n in ALIAS_PFX:
        pfx = ALIAS_PFX[n]
        if ws_:
            for wc in ws_:
                for cand in ('%s-%03d' % (pfx, wc), '%s-%d' % (pfx, wc)):
                    if cand in by_code:
                        return by_code[cand]['id'], 'R0'
        elif pfx.upper() in by_code:
            return by_code[pfx.upper()]['id'], 'R0'
    # 저밀도 게릴라는 폭이 붙어 와도 단일 품목으로 흡수
    if n in ALIAS_EXACT:
        c = ALIAS_EXACT[n].upper()
        if c in by_code:
            return by_code[c]['id'], 'R0e'

    # R1 — 품목명이 코드 접두(시트류). 폭은 3자리 zero-pad 와 원값 둘 다 시도.
    for wc in ws_:
        for cand in ('%s-%03d' % (n, wc), '%s-%d' % (n, wc)):
            if cand in by_code:
                return by_code[cand]['id'], 'R1'
    # R1b — 폭 변종이 아예 없는 단일 품목(LT4080M 처럼 코드에 폭이 안 붙는 것)
    if n in by_code:
        return by_code[n]['id'], 'R1b'
    # R2 — 이름 정확일치 + 폭 일치
    for it in by_name.get(n, []):
        if not ws_ or any(('-%03d' % wc) in str(it['item_code']) or ('%d폭' % wc) in str(it.get('spec') or '')
                          for wc in ws_):
            return it['id'], 'R2'
    # R3 — item_name 포함 + 코드가 해당 폭으로 끝남
    for wc in ws_:
        suf = ('-%03d' % wc, '-%d' % wc, 'P%d' % wc)
        for it in act:
            if n and n in norm(it['item_name']) and str(it['item_code']).upper().endswith(suf):
                return it['id'], 'R3'
    # R4 — 폭 없는 품목은 이름 정확일치만
    if w is None and len(by_name.get(n, [])) == 1:
        return by_name[n][0]['id'], 'R4'
    return None, None


mp, rules, hit, miss = {}, Counter(), 0, []
for (nm, spec), cnt in combos.items():
    iid, rule = match(nm, spec)
    if iid:
        mp['%s|%s' % (nm, spec)] = iid
        rules[rule] += cnt
        hit += cnt
    else:
        miss.append((cnt, nm, spec))

tot = sum(combos.values())
print('라인 %d · 고유조합 %d' % (tot, len(combos)))
print('매칭 %d라인 (%.1f%%) · 규칙별 %s' % (hit, 100 * hit / tot, dict(rules)))
print('미매칭 %d라인 (%.1f%%) · 조합 %d' % (tot - hit, 100 * (tot - hit) / tot, len(miss)))
print('미매칭 상위 20:')
for cnt, nm, spec in sorted(miss, reverse=True)[:20]:
    print('  %3d  %-30s | %s' % (cnt, nm[:30], spec))

out = os.path.join(r'C:\Users\user\dongsan_mes', 'docs', 'dongsan-import', 'load', 'e2_item_map.json')
json.dump(mp, open(out, 'w', encoding='utf-8'), ensure_ascii=False)
print('→', out)
