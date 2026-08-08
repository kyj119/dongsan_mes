# -*- coding: utf-8 -*-
"""선명(entity 2·3) **상반기 판매** 미연결 라인 → MES 품목 연결 (2026-08-08).

7월 판매는 0% → 100% 로 닫았는데 **상반기 383라인 185,081,303원**이 `item_id NULL` 로 남아 있었다.
7월에 세운 규칙이 그대로 쓸 수 있어 여기서 재사용한다 — **규칙을 다시 만들지 않는다.**

★ 7월 매칭기(`gen_e2_item_match.py`)의 자산을 **import 해서 쓴다.** 복사하면 두 벌이 되고,
  다음에 별칭 하나를 고칠 때 어느 쪽이 정본인지 알 수 없게 된다(오늘 품목 중복으로 세 번 겪었다).
  그쪽은 xlsx 를 읽고 여기는 DB 라인을 읽는 것만 다르다.

규칙 순서 = 좁은 것 → 넓은 것 (뒤집으면 폭이 다른 형제에 잘못 붙는다)
  R1 코드직결 : 품목명이 그대로 코드 접두 + 폭 → `<품목명>-<폭3자리>`
  R2 별칭+폭  : ALIAS_PFX 로 접두를 바꾼 뒤 폭
  R3 이름정확 : 정규화 이름 일치 + 폭 일치
  R4 이름만   : 폭 표기가 없는 품목은 이름 정확일치만

★ 「~외 N건」 묶음 라인은 **손대지 않는다.**
  `현수막조립외`(7라인 80,374,000) · `태극기8회 외 14건`(4라인 34,268,000) 같은 것은
  **여러 품목을 한 줄로 묶은 청구**라 단일 품목이 존재하지 않는다. 대표 품목에 붙이면
  8천만원어치가 「현수막 한 품목을 팔았다」로 잡혀 원가율이 통째로 망가진다.
  금액·거래처는 이미 정확하니 원가 분석에서만 빠지면 된다.

사용: python docs/dongsan-import/gen_e2_h1_link.py <items.json> <lines.json>
산출: load/e2_h1_link.sql (+ rollback)
"""
import json, sys, os, re, warnings
from collections import Counter
warnings.filterwarnings('ignore')
sys.stdout.reconfigure(encoding='utf-8')

ITEMS_JSON, LINES_JSON = sys.argv[1], sys.argv[2]
OUT = os.path.join(r'C:\Users\user\dongsan_mes', 'docs', 'dongsan-import', 'load')

# 7월 매칭기의 별칭·폭관례를 그대로 가져온다 (모듈 상단 상수만 필요하므로 소스에서 추출)
SRC = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gen_e2_item_match.py'),
           encoding='utf-8').read()
_ns = {'re': re}
for block in ('WIDTH_ALIAS', 'ALIAS_PFX', 'ALIAS_EXACT'):
    m = re.search(r'^%s = \{.*?^\}' % block, SRC, re.S | re.M)
    assert m, '7월 매칭기에서 %s 를 못 찾았다 — 그쪽이 바뀌었으면 여기도 확인할 것' % block
    exec(m.group(0), _ns)
WIDTH_ALIAS, ALIAS_PFX, ALIAS_EXACT = _ns['WIDTH_ALIAS'], _ns['ALIAS_PFX'], _ns['ALIAS_EXACT']

WIDTH = re.compile(r'(\d{2,3})\s*폭')
BUNDLE = re.compile(r'외\s*\d*\s*건?$|외$')      # 「~외」·「~외 14건」 = 묶음 청구


def norm(s):
    return re.sub(r'[\s\-_()/]+', '', str(s or '')).upper()


def widths_of(spec):
    m = WIDTH.search(spec or '')
    if not m:
        return []
    w = int(m.group(1))
    return [w] + ([WIDTH_ALIAS[w]] if w in WIDTH_ALIAS else [])


items = [i for i in json.load(open(ITEMS_JSON, encoding='utf-8')) if i.get('is_active')]
by_code = {str(i['item_code']).strip().upper(): i for i in items}
by_name = {}
for i in items:
    by_name.setdefault(norm(i['item_name']), []).append(i)


def resolve(nm, sp):
    n = norm(nm)
    ws = widths_of(sp)
    # R1 코드직결
    for w in ws:
        c = '%s-%03d' % (n, w)
        if c in by_code:
            return by_code[c]['id'], c, 'R1 코드직결'
    # R2 별칭 + 폭
    pfx = ALIAS_PFX.get(n)
    if pfx:
        for w in ws:
            for c in ('%s-%03d' % (pfx.upper(), w), '%s%03d' % (pfx.upper(), w)):
                if c in by_code:
                    return by_code[c]['id'], c, 'R2 별칭+폭'
    # R3 이름 정확일치 + 폭
    cands = by_name.get(n, [])
    if cands and ws:
        for w in ws:
            for i in cands:
                if str(i['item_code']).upper().endswith('%03d' % w) or ('%dcm' % w) == str(i.get('sp', '')).strip():
                    return i['id'], i['item_code'], 'R3 이름+폭'
    # R3.5 규격이 **폭이 아닌 축**으로 갈리는 계열 — 호수·두께는 폭 규칙이 못 잡는다
    if '아일렛' in nm:
        m = re.search(r'(\d+)\s*호', sp)
        col = 'G' if '금' in sp else 'S'
        c = 'ACC-045-%s-%s' % (m.group(1), col) if m else None
        if c and c.upper() in by_code:
            return by_code[c.upper()]['id'], c, 'R3.5 아일렛 호수·색'
    if '포맥스' in nm:
        m = re.search(r'(\d+(?:\.\d+)?)\s*T', sp) or re.search(r'(\d+(?:\.\d+)?)\s*T', nm)
        size = '36' if '3*6' in sp or '3X6' in sp.upper() else '48'
        col = 'B' if ('검정' in nm or '검정' in sp or '흑' in nm) else 'W'
        c = 'FMX-%sT-%s-%s' % (m.group(1).rstrip('.0') or m.group(1), col, size) if m else None
        if c and c.upper() in by_code:
            return by_code[c.upper()]['id'], c, 'R3.5 포맥스 두께·색·판'
    if '아크릴' in nm:
        m = re.search(r'(\d+(?:\.\d+)?)\s*T', nm) or re.search(r'(\d+(?:\.\d+)?)\s*T', sp)
        col = 'B' if '검정' in nm else 'C'
        c = 'UV-ACR-%sT-%s' % (m.group(1).rstrip('.0') or m.group(1), col) if m else None
        if c and c.upper() in by_code:
            return by_code[c.upper()]['id'], c, 'R3.5 아크릴 두께·색'

    # R3.7 출력 서비스 — 규격이 **폭이 아니라 완성 크기**(`72.5*193`)라 폭 규칙이 볼 게 없다.
    #   7월 `gen_e2_print_link.py` 에서 세운 판정을 그대로 쓴다(소재 단서가 없으면 그 계열의 기본 제품).
    if '출력' in nm or '배너' in nm:
        if '패트배너' in nm:
            return by_code['AQ-PAT']['id'], 'AQ-PAT', 'R3.7 수성 패트배너'
        if '윈드배너' in nm and 'TRW-PO-S' in by_code:
            return by_code['TRW-PO-S']['id'], 'TRW-PO-S', 'R3.7 전사 윈드배너'
        if nm.startswith('UV출력'):
            return by_code['UV-SHEET']['id'], 'UV-SHEET', 'R3.7 UV 시트'
        if nm.startswith('전사출력'):
            return by_code['TRG-PO']['id'], 'TRG-PO', 'R3.7 전사 깃발 폰지'
        if '현수막' in nm or nm.strip() == '출력':
            return by_code['AQ-BANNER']['id'], 'AQ-BANNER', 'R3.7 현수막 출력(수성 기본)'
        if nm.startswith('솔벤출력'):
            c = 'SV-SHEET' if ('시트' in sp or '랩핑' in sp) else 'SV-BANNER'
            return by_code[c]['id'], c, 'R3.7 솔벤출력(소재 단서 없으면 현수막)'

    # R3.8 가공 서비스 · 조정 — 물건이 아니라 **작업**이거나 **금액 조정**이다.
    #   「포맥스 재단 114*229」는 완성 크기로 오는 재단 가공이다. 소재(FMX-*)에 붙이면
    #   팔린 적 없는 포맥스 재고가 줄어든다(매입 이관에서 세운 원칙과 같다).
    if '재단' in nm:
        return by_code['ETC-CUT']['id'], 'ETC-CUT', 'R3.8 재단 가공'
    if nm.strip() in ('기타', 'SPM011G') or '단가 조정' in nm or (not sp and '아일렛' in nm):
        return by_code['ETC-DISC']['id'], 'ETC-DISC', 'R3.8 조정 라인'

    # R3.9 와트로 갈리는 계열 — 규격이 `150wt` 라 폭 정규식이 못 읽는다
    if nm.strip().upper() == 'SMPS':
        m = re.search(r'(\d+)\s*wt', sp, re.I)
        c = 'SGM-SMPS-W%s' % m.group(1) if m else None
        if c and c.upper() in by_code:
            return by_code[c.upper()]['id'], c, 'R3.9 SMPS 와트'

    # R4 폭 없는 품목 — 이름 정확일치 또는 별칭
    if not ws:
        c = ALIAS_EXACT.get(n)
        if c and c.upper() in by_code:
            return by_code[c.upper()]['id'], c, 'R4 별칭(이름)'
        if len(cands) == 1:
            return cands[0]['id'], cands[0]['item_code'], 'R4 이름정확(단일)'
    return None, None, None


lines = json.load(open(LINES_JSON, encoding='utf-8'))
buf, ids, stat, skip, bundle = [], [], Counter(), [], []
for L in lines:
    nm, sp = str(L['nm'] or '').strip(), str(L['sp'] or '').strip()
    if BUNDLE.search(nm):
        bundle.append((nm, L['amt']))
        continue
    iid, code, why = resolve(nm, sp)
    if not iid:
        skip.append((nm, sp, L['amt']))
        continue
    buf.append("UPDATE order_items SET item_id = %d WHERE id = %d AND item_id IS NULL;  -- %s | %s | %s"
               % (iid, L['id'], nm, sp, why))
    ids.append(str(L['id']))
    stat[why] += 1

open(os.path.join(OUT, 'e2_h1_link.sql'), 'w', encoding='utf-8').write(
    '-- 선명 상반기 판매 미연결 라인 → MES 품목 연결 (2026-08-08)\n'
    '-- 생성기 = docs/dongsan-import/gen_e2_h1_link.py — 7월 매칭기의 별칭·폭관례를 **import 해서** 쓴다\n'
    '-- ★ 「~외 N건」 묶음 청구는 제외했다 (여러 품목을 한 줄로 묶은 것이라 단일 품목이 없다)\n'
    '-- 롤백 = docs/dongsan-import/load/rollback_e2_h1_link.sql\n\n' + '\n'.join(buf) + '\n')
open(os.path.join(OUT, 'rollback_e2_h1_link.sql'), 'w', encoding='utf-8').write(
    '-- 상반기 판매 연결 롤백 (2026-08-08)\n'
    'UPDATE order_items SET item_id = NULL WHERE id IN (%s);\n' % ','.join(ids))

print('연결 %d라인 · 규칙별 %s' % (len(buf), dict(stat)))
print('묶음 청구 제외 %d라인 %s원' % (len(bundle), format(int(sum(a for _, a in bundle)), ',')))
print('미해결 %d라인 %s원' % (len(skip), format(int(sum(a for _, _, a in skip)), ',')))
agg = Counter()
for nm, sp, a in skip:
    agg[(nm, sp)] += a
for (nm, sp), a in agg.most_common(12):
    print('   %12s  %-34s %s' % (format(int(a), ','), nm[:34], sp[:14]))
