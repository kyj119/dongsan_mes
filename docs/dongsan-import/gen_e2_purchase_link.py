# -*- coding: utf-8 -*-
"""선명 2026-07 매입 미매칭 라인 → MES 품목 연결 (2026-08-08).

적재 직후 37조합 17,005,350원이 `item_id NULL` 이었다. 대조해 보니 **거의 다 이미 있는 품목**이고,
안 붙은 이유는 품명 표기가 이카운트와 MES 에서 다르기 때문이다 —
「전자 타이머-삼성 [50A]」 vs 「삼성타이머50A」, 「출력용 매쉬원단 [127폭/50m]」 vs 「솔벤 매쉬 127cm」.

★ 애매하면 안 붙인다. 판매 이관에서 세운 원칙 그대로다. 매입은 특히 **재고가 움직이므로**
  잘못 붙이면 팔린 적 없는 자재가 늘어나고, 그 오차는 나중에 원인을 찾기 어렵다.
  아래 「보류」 목록은 근거를 적어 두고 NULL 로 남긴다.

★ 색상 불일치 판단 (KIV 전선)
  매입은 「KIV 1.5 [백색]」인데 MES `SGM-KIV-K15` 는 규격이 '검정' 이다. 그래도 붙인다 —
  전선은 **굵기(sq)가 품목을 가르고 색은 변종**이며, MES 에 백색 코드가 아예 없다.
  안 붙이면 전선 매입이 통째로 원가에서 빠진다. (색 구분이 필요해지면 그때 변종을 만든다.)

★ 보류한 것과 이유
  자동 아일렛펀칭기 330,000        장비. MES 에 없고 자산인지 소모품인지 미확정
  트러스바 날개 [백색] 253,600     `ACC-040 아연날개`·`SK-1237 싸인탑날개` 와 다른 물건으로 보인다
  채널용 입체바 [흑색/100mm*3m]    `SGM-IPB100-BK` 가 유력하나 매입처(엘이디포유)·두께 1.0T 미확인
  경관바-평면 PC [3M] 12,400       100mm(`SK-2404`)인지 70mm(`SK-2567`)인지 품명으로 안 갈린다
  즉열인두기 칼날 [TS-A1] 95,000   `KMT-IRON` 은 인두기 본체고 칼날은 별품목
  현수막 받침대 [170cm] 71,000     `KMT-STAND1700`(출력물받침대)과 같은 물건인지 불확실
  TS전용 싱글아일렛 [12파이…]      `ACC-045` 는 호수(5/9/24)인데 이건 파이 표기 — 대응 불명
  솔벤클리어필름(리무벌/투명)      리무벌(제거형)은 `CLEAR-*`(일반)와 다른 물건
  LED 투광기 [35W(검정/전구)…]     매립용. `SGM-LEDP-BW` 는 검정/백색이라 색·형식이 다르다

사용: python docs/dongsan-import/gen_e2_purchase_link.py <items.json> <lines.json>
산출: load/e2_purchase_link.sql (+ rollback)
"""
import json, sys, os, re, warnings
from collections import Counter
warnings.filterwarnings('ignore')
sys.stdout.reconfigure(encoding='utf-8')

ITEMS_JSON, LINES_JSON = sys.argv[1], sys.argv[2]
OUT = os.path.join(r'C:\Users\user\dongsan_mes', 'docs', 'dongsan-import', 'load')
items = {i['item_code']: i['id'] for i in json.load(open(ITEMS_JSON, encoding='utf-8')) if i['is_active']}

# (정규식, 코드 또는 콜러블, 근거)
RULES = [
    (r'EP-시리즈 수성', 'GDS-EQ-EP1852', '7월 EP1852 판매의 짝 — 이 라인이 「매입 없는 판매」를 해소한다'),
    (r'전자 타이머.*\[50A\]', 'SK-973', '삼성타이머50A (반품 라인도 같은 품목·음수 수량)'),
    (r'전자 타이머.*\[30A\]', 'SK-409', '삼성타이머30A'),
    (r'전자 타이머.*\[20A\]', 'SK-972', '삼성타이머20A'),
    (r'출력용 매쉬원단 \[127', 'SVM-127', '솔벤 매쉬 127cm'),
    (r'출력용 매쉬원단 \[60', 'SVM-060', '솔벤 매쉬 60cm'),
    (r'알마이트2T 단면', 'ALM-2T-S-48', '알마이트 2T 은색 4x8'),
    (r'^LT4058', 'SK-930', 'LG시트-LT4058(122폭)'),
    (r'^LT404B', 'SK-LT404B', 'LG시트-LT404B(122폭) — 판매 이관 때 신설한 코드'),
    (r'물본드', 'SGM-BOND', '물본드'),
    (r'무광 코팅지 자동용\(45m/120g\)-호홍 \[152', 'HJ-MGAUTO-P152', '무광코팅지 자동엠보(45m/120g) 152폭 — 규격까지 일치'),
    (r'스카시30T-백색', 'UV-SKS-30T-W', 'UV 스카시 30T 백색'),
    (r'용달운임', 'ETC-EXP', '긴급배송(용달/퀵)'),
    (r'직결피스\s*8\*13', 'SK-1068', '직결피스8*13'),
    (r'무광인화지', 'PJ-MUINH', '무광인화지 127폭'),
    (r'투광기 파이프.*백색', 'SGM-LEDPP-WH', '투광기 파이프 ㅡ자형 백색'),
    (r'포인트사각돌출', 'SGM-PRSQ-550', '규격 55cm 일치'),
    (r'^KIV 1\.5', 'SGM-KIV-K15', 'KIV 전선 1.5sq — 굵기가 품목을 가른다(색은 변종·백색 코드 없음)'),
    (r'^KIV 4\.0', 'SGM-KIV-K40', 'KIV 전선 4.0sq — 상동'),
    (r'경관바-평면-AL \[100', 'SK-2145', '평면경관봉100mm몸통3M'),
    (r'PVC\(켈\) 그레이.*잉크테크 \[127', 'KEL-IT-127', '켈 30M 잉크테크 127cm — **브랜드가 코드에 있다**(호홍 KEL-HH 와 구분)'),
    (r'합성지\(30m\)-잉크테크 \[127', None, '합성지는 MES 가 호홍(`SYN-NA-127`)뿐 — 잉크테크 대응 코드 없음'),
    (r'수성 텐트천-S \[90', None, '`AQ-TENT` 는 폭 없는 제품코드 — 90폭 원단 대응 없음'),
    (r'클리어필름-점착\(UV투명점착\) \[127', 'CLEAR-127', '클리어필름 127cm'),
    (r'무광 솔벤 PVC\(켈\)-50m \[127', None, 'KEL-* 는 전부 30M — 50m 는 다른 물건'),
]
COMPILED = [(re.compile(p), c, w) for p, c, w in RULES]

lines = json.load(open(LINES_JSON, encoding='utf-8'))
buf, ids, stat, skip = [], [], Counter(), []
for ln in lines:
    nm = str(ln['item_name'] or '')
    code = why = None
    for rx, c, w in COMPILED:
        if rx.search(nm):
            code, why = c, w
            break
    if not code or code not in items:
        skip.append((nm, ln['amt'], why or '규칙 없음'))
        continue
    buf.append("UPDATE purchase_order_items SET item_id = %d WHERE id = %d AND item_id IS NULL;  -- %s | %s"
               % (items[code], ln['id'], nm, why))
    ids.append(str(ln['id']))
    stat[code] += 1

open(os.path.join(OUT, 'e2_purchase_link.sql'), 'w', encoding='utf-8').write(
    '-- 선명 2026-07 매입 미매칭 라인 → MES 품목 연결 (2026-08-08)\n'
    '-- 생성기 = docs/dongsan-import/gen_e2_purchase_link.py (매핑 근거·보류 사유는 그 파일 헤더)\n'
    '-- ★ 애매하면 안 붙인다 — 매입은 **재고가 움직여서** 오연결의 흔적이 나중에 안 남는다.\n'
    '-- 롤백 = docs/dongsan-import/load/rollback_e2_purchase_link.sql\n\n' + '\n'.join(buf) + '\n')
open(os.path.join(OUT, 'rollback_e2_purchase_link.sql'), 'w', encoding='utf-8').write(
    '-- 매입 품목 연결 롤백 (2026-08-08)\n'
    'UPDATE purchase_order_items SET item_id = NULL WHERE id IN (%s);\n' % ','.join(ids))

print('연결 %d라인 · 품목 %d종' % (len(buf), len(stat)))
print('보류 %d라인 %s원' % (len(skip), format(int(sum(a for _, a, _ in skip)), ',')))
for nm, a, w in sorted(skip, key=lambda x: -x[1])[:12]:
    print('  %10s %-40s %s' % (format(int(a), ','), nm[:40], w[:44]))
