# -*- coding: utf-8 -*-
"""선명 2026-07 **잔여 미매칭 전량 확정** (2026-08-08, 용준님 「품목으로 확정지어서」).

남은 59조합 7,047,945원. 먼저 MES 품목 마스터와 대조했더니 **대부분 이미 있었다** —
LED(`SGM-LED3-*`·`SGM-LEDF-*`), 까치발(`ACC-029-*`), 아일렛(`ACC-045-*`),
아크릴(`UV-ACR-*`), 배송(`ETC-SHIP`). 안 붙은 이유는 품목이 없어서가 아니라
**매칭기가 (품목명, 규격) 문자열 키**여서 「LED 3구(백색)-조립」 같은 표기 변형을 못 넘은 것이다.

★ 그래서 이 파일은 **신설을 최소화**한다. 없는 것만 6종 만들고 나머지는 기존에 붙인다.
  품목을 새로 만들면 원가·재고가 그만큼 갈라진다 — 같은 물건이 두 코드로 앉으면
  나중에 어느 쪽이 정본인지 알 수 없다.

신설 6종 (없어서 만드는 것만)
  ETC-INSTALL    시공·부착비        — 서비스 품목이 **아예 없었다**. 「LG조명용시트부착」류 14조합의 귀속처
  SGM-LED3-UPL   LED 3구 UPL 1w     — KPL·JPL 은 있는데 UPL 만 없다(같은 층의 제조사 변형)
  ACC-029-1260   까치발 1260mm      — ACC-029 는 100mm 단위라 1260 이 없다. **1300 으로 반올림하지 않는다**(단가가 길이에 붙는다)
  SK-LT404B      LG시트-LT404B(122폭) — LT401B·LT403B 는 있는데 404B 만 없다
  FMX-15T-W-48   포맥스 15T 백색 4x8 — MES 최대가 10T 였다. 앞선 최종표에서 「임의 대체 금지」로 NULL 뒀던 그 건
  ACC-JJ-JOINT   족자봉 연결대      — 족자봉 부속(마개·고리·쫄대)은 있는데 연결대만 없다

★ 판단이 갈린 곳 (근거를 남긴다)
  ① 까치발이 **두 벌** 있다 — `ACC-029-*`(상품·판매1) vs `SK-*`(원자재·판매0).
     판매 라인이므로 **상품 쪽**으로 보낸다. SK 까치발은 매입 레거시라 여기서 안 건드린다.
  ② 「아크릴 2T+LT4029시트」처럼 **소재+가공 복합**은 **소재(두께·색상)** 로 붙인다.
     가공은 부수이고, 원가·재고 추적의 축은 소재다. 색상은 품명에서 읽는다(검정→B, 그 외 투명→C).
  ③ 「LG조명용시트부착」류는 소재가 아니라 **시공 매출**이다(부착비 25만원짜리 라인에 시트값이 아니라 인건비가 실려 있다).
     → `ETC-INSTALL`. 소재로 붙이면 시트 재고가 팔린 적 없는 만큼 줄어든다.
  ④ 음수 라인(방문·절삭·기타 잉크 박스 등)은 **에누리 조정**이다 → `ETC-DISC`.
     단 「절삭」은 컷팅 가공의 조정이라 `ETC-CUT` 로 보낸다(계정이 아니라 성격을 따른다).
  ⑤ 「LG옥외용시트(LC6770)」 → 기존 `LC6770P`. 접미 P 차이뿐이고 같은 LG LC6770 계열이다.

사용: python docs/dongsan-import/gen_e2_final_close.py <lines.json>
산출: load/e2_final_close.sql (+ rollback)
"""
import json, sys, os, re, warnings
from collections import Counter
warnings.filterwarnings('ignore')
sys.stdout.reconfigure(encoding='utf-8')

LINES_JSON = sys.argv[1]
OUT = os.path.join(r'C:\Users\user\dongsan_mes', 'docs', 'dongsan-import', 'load')

# ── 신설 품목 (code, name, spec, category, category_id, unit, sales, purchase)
NEW_ITEMS = [
    ('ETC-INSTALL',  '시공·부착비',            '',            '기타',   16, 'EA', 1, 0),
    ('SGM-LED3-UPL', 'LED 3구 UPL',            '1w',          '원자재',  5, 'EA', 1, 1),
    ('ACC-029-1260', '까치발 1260mm',          '',            '상품',    4, 'EA', 1, 1),
    ('SK-LT404B',    'LG시트-LT404B(122폭)',   '122폭/50m',   '원자재',  5, 'EA', 1, 1),
    ('FMX-15T-W-48', '포맥스',                 '15T 백색 4x8', '원자재',  5, '장', 1, 1),
    ('ACC-JJ-JOINT', '족자봉 연결대',          '',            '상품',    4, 'EA', 1, 1),
]

BLACK = re.compile(r'검정|블랙|흑')
THICK = re.compile(r'(\d+(?:\.\d+)?)\s*T')
MM = re.compile(r'(\d{3,4})\s*mm')


def resolve(nm, sp, ct):
    """(코드, 근거) 또는 (None, None)."""
    t = nm + ' ' + sp + ' ' + ct

    # ── 배송 ─────────────────────────────────────────────
    if re.search(r'택배|화물', nm):
        return 'ETC-SHIP', '배송비'

    # ── 음수 조정 / 잡 ───────────────────────────────────
    if nm.strip() == '절삭':
        return 'ETC-CUT', '절삭 = 컷팅 가공의 조정 (계정이 아니라 성격을 따른다)'
    if re.search(r'^기타|방문', nm):
        return 'ETC-DISC', '에누리·조정 라인'
    if '종이도안' in nm:
        return 'ETC-DESIGN', '도안 = 시안 작업'

    # ── 시공·부착 (소재보다 **먼저** 판정한다) ──────────
    # 「LG조명용시트부착」은 시트가 아니라 부착 매출이다. 소재 규칙이 먼저 걸리면 재고가 잘못 준다.
    if re.search(r'부착|컷팅부착', nm) and '아크릴' not in nm:
        return 'ETC-INSTALL', '시트 부착·컷팅 시공 매출 (소재 아님)'
    if re.search(r'^LG조명컷팅', nm):
        return 'ETC-INSTALL', 'LG 조명시트 컷팅 시공'

    # ── LED ──────────────────────────────────────────────
    if '형광등' in nm:
        if re.search(r'웜|전구색', sp):
            return 'SGM-LEDF-F20W', 'LED형광등 20W 웜'
        if '28' in sp:
            return 'SGM-LEDF-F28D', 'LED형광등 28W 양면'
        return 'SGM-LEDF-F20S', 'LED형광등 20W 단면'
    if 'LED 3구' in nm or 'LED3구' in nm:
        if 'UPL' in nm:
            return 'SGM-LED3-UPL', 'LED 3구 UPL (신설 — KPL·JPL 과 같은 층)'
        if 'KPL' in nm:
            return 'SGM-LED3-KPL', 'LED 3구 KPL'
        if 'JPL' in nm:
            return 'SGM-LED3-JPL', 'LED 3구 JPL'
        if '웜' in nm:
            return 'SGM-LED3-WM', 'LED 3구 백색/웜'
        return 'SGM-LED3-WH', 'LED 3구 백색'

    # ── 까치발 (길이 그대로. 반올림 금지 — 단가가 길이에 붙는다) ──
    if '까치발' in nm:
        m = MM.search(sp) or MM.search(nm)
        return ('ACC-029-%d' % int(m.group(1)), '까치발 %smm (상품 쪽. SK-* 원자재본은 매입 레거시)' % m.group(1)) if m else (None, None)

    # ── 아일렛 ───────────────────────────────────────────
    if '아일렛' in nm:
        m = re.search(r'(\d+)\s*호', sp)
        col = 'G' if '금' in sp else 'S'
        return ('ACC-045-%s-%s' % (m.group(1), col), '아일렛 %s호 %s' % (m.group(1), '금' if col == 'G' else '은')) if m else (None, None)

    # ── 족자봉 부속 ──────────────────────────────────────
    if '족자봉' in nm and '연결대' in nm:
        return 'ACC-JJ-JOINT', '족자봉 연결대 (신설 — 마개·고리·쫄대는 있는데 연결대만 없었다)'

    # ── 시트 원단 판매 ───────────────────────────────────
    if re.match(r'^LT\d', nm.strip()):
        return 'SK-LT404B', 'LG시트 LT404B 롤 판매 (신설)' if 'LT404B' in nm else (None, None)
    if 'LC6770' in nm:
        return 'LC6770P', 'LG LC6770 계열 (기존 LC6770P — 접미 P 차이뿐)'

    # ── 포맥스 ───────────────────────────────────────────
    if '포맥스' in nm:
        m = THICK.search(nm) or THICK.search(sp)
        if m:
            t_ = m.group(1).rstrip('.0') or m.group(1)
            col = 'B' if BLACK.search(nm) else 'W'
            return 'FMX-%sT-%s-48' % (t_, col), '포맥스 %sT %s (15T 는 이번에 신설)' % (t_, col)
        return None, None

    # ── 알마이트 ─────────────────────────────────────────
    if '알마이트' in nm:
        return 'ALM-2T-S-48', '알마이트 2T 은색 재단 판매'

    # ── 아크릴 (소재로 붙인다. 두께 = 첫 번째 T, 색상 = 품명) ──
    if '아크릴' in nm:
        m = THICK.search(nm)
        if m:
            t_ = m.group(1).rstrip('.0') or m.group(1)
            col = 'B' if BLACK.search(nm) else 'C'   # 「투명」 명시·미명시 모두 투명이 기본
            return 'UV-ACR-%sT-%s' % (t_, col), '아크릴 %sT %s — 복합 가공품은 **소재**로 귀속' % (t_, '검정' if col == 'B' else '투명')
        return None, None

    # ── 출력물 ───────────────────────────────────────────
    if '양면후렉스' in nm:
        return 'UV-FLEXD', 'UV 양면배너후렉스'
    if '후렉스' in nm and '트러스' not in nm:
        return 'UV-FLEXN', 'UV 비조명후렉스'
    if '솔벤시트' in nm:
        return 'SV-SHEET', '솔벤 시트 (돔보는 부수)'

    # ── 간판 완제품 ──────────────────────────────────────
    if '트러스' in nm:
        return 'SIGN-FRN', '각관 트러스 + 후렉스 텐션 = 비조명 프레임간판 신규제작'
    if re.search(r'안내판|표지판|^간판', nm):
        return 'SIGN-ETC', '간판 완제품 (세부 유형 미상 → 기타)'

    return None, None


lines = json.load(open(LINES_JSON, encoding='utf-8'))
buf, ids, stat, skip = [], [], Counter(), []
for ln in lines:
    nm, sp, ct = str(ln['item_name'] or ''), str(ln['specification'] or ''), str(ln['content'] or '')
    code, why = resolve(nm, sp, ct)
    if not code:
        skip.append((nm, sp, ln['amt']))
        continue
    buf.append("UPDATE order_items SET item_id = (SELECT id FROM items WHERE item_code = '%s') "
               "WHERE id = %d AND item_id IS NULL;  -- %s | %s | %s" % (code, ln['id'], nm, sp, why))
    ids.append(str(ln['id']))
    stat[code] += 1

hdr = ("-- 선명 2026-07 잔여 미매칭 **전량 확정** (2026-08-08)\n"
       "-- 생성기 = docs/dongsan-import/gen_e2_final_close.py (판단 근거는 그 파일 헤더)\n"
       "-- ★ 신설은 6종뿐. 나머지는 **이미 있던 품목**에 붙인다 — 같은 물건이 두 코드로 앉으면\n"
       "--   나중에 어느 쪽이 정본인지 알 수 없다.\n"
       "-- ⚠️ `AND item_id IS NULL` 이라 재실행해도 이미 붙은 라인은 안 건드린다.\n"
       "-- 롤백 = docs/dongsan-import/rollback_e2_final_close.sql\n\n")

ins = []
for code, name, spec, cat, cid, unit, sales, pur in NEW_ITEMS:
    ins.append("INSERT INTO items (item_code, item_name, specification, category, category_id, unit, "
               "is_sales_item, is_purchase_item, is_active) SELECT '%s','%s','%s','%s',%d,'%s',%d,%d,1 "
               "WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='%s');"
               % (code, name, spec, cat, cid, unit, sales, pur, code))

open(os.path.join(OUT, 'e2_final_close.sql'), 'w', encoding='utf-8').write(
    hdr + '-- ① 신설 품목 6종 (멱등 — 이미 있으면 건너뛴다)\n' + '\n'.join(ins)
    + '\n\n-- ② 라인 연결\n' + '\n'.join(buf) + '\n')
open(os.path.join(OUT, 'rollback_e2_final_close.sql'), 'w', encoding='utf-8').write(
    '-- 잔여 미매칭 확정 롤백 (2026-08-08) — 적용 전 이 라인들은 전부 item_id NULL 이었다\n'
    'UPDATE order_items SET item_id = NULL WHERE id IN (%s);\n' % ','.join(ids)
    + '-- 신설 품목 제거 (연결 해제 후에만 안전)\n'
    + 'DELETE FROM items WHERE item_code IN (%s);\n' % ','.join("'%s'" % i[0] for i in NEW_ITEMS))

print('연결 %d라인 · 품목 %d종' % (len(buf), len(stat)))
print('상위:', dict(stat.most_common(10)))
print('미해결 %d라인 %s원' % (len(skip), format(sum(a for _, _, a in skip), ',')))
for nm, sp, a in sorted(skip, key=lambda x: -x[2])[:10]:
    print('   %10s %s | %s' % (format(a, ','), nm[:32], sp[:16]))
