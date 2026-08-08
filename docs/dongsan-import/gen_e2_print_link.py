# -*- coding: utf-8 -*-
"""선명 2026-07 **출력 서비스** 미매칭 라인 → MES 제품 연결 (2026-08-07).

남은 미매칭 19,103,445 중 **출력이 12,055,500 으로 최대 덩어리**인데,
전부 MES 에 제품이 있다. 안 붙은 이유는 하나다 — **규격이 폭이 아니라 크기**(`500*250`·`610*47`)라
폭 기반 매칭기(`gen_e2_item_match.py`)가 볼 게 없었다.

★ 소재는 **품명만으로 안 갈린다.** 「솔벤출력」이 시트일 수도 현수막일 수도 있어서
   `content`(내용) 를 같이 본다 — 실제로 「시트)영수학원…」·「랩핑시트) 부여군청…」처럼
   내용 앞머리에 소재가 적혀 있다. 내용이 비면 그 계열의 **기본 제품**으로 간다.

  솔벤출력 + 내용에 시트/랩핑    → SV-SHEET   (그레이 명시 시 SV-SHEETG)
  솔벤출력 + 그 외               → SV-BANNER
  솔벤매쉬배너-출력              → SV-MESH
  현수막 출력                    → AQ-BANNER  (수성이 기본. 솔벤 명시면 SV-BANNER)
  UV후렉스 출력 + 비조명/그레이  → UV-FLEXN   / 그 외 UV-FLEXL
  UV출력                         → UV-SHEET   (그레이 명시 시 UV-SHEETG)
  패트배너-출력                  → AQ-PAT
  가로등배너 출력 60*180 등      → TRB-PO-<길이>  (폰지 기본)
  윈드배너 출력                  → TRW-PO-S
  출력용 매쉬원단 <폭>폭         → SVM-<폭>   (제품이 아니라 **원단 판매**다)

사용: python docs/dongsan-import/gen_e2_print_link.py <items.json> <lines.json>
"""
import json, sys, os, re, warnings
from collections import Counter
warnings.filterwarnings('ignore')
sys.stdout.reconfigure(encoding='utf-8')

ITEMS_JSON, LINES_JSON = sys.argv[1], sys.argv[2]
OUT = os.path.join(r'C:\Users\user\dongsan_mes', 'docs', 'dongsan-import', 'load')
items = {i['item_code']: i['id'] for i in json.load(open(ITEMS_JSON, encoding='utf-8')) if i['is_active']}

GRAY = re.compile(r'그레이|그레이시트|회색')
SHEET = re.compile(r'시트|랩핑|자석')
SOLV = re.compile(r'솔벤')
NONLIT = re.compile(r'비조명')
WIDTH = re.compile(r'(\d{2,3})\s*폭')
LEN180 = re.compile(r'60\s*[*xX×]\s*(\d{2,3})')


def resolve(nm, sp, ct):
    t = nm + ' ' + ct                      # 품명 + 내용을 같이 본다
    if '출력용 매쉬원단' in nm:
        m = WIDTH.search(sp)
        return ('SVM-%03d' % int(m.group(1))) if m else None, '출력용 매쉬원단 = 원단 판매'
    if '솔벤매쉬배너' in nm:
        return 'SV-MESH', '솔벤 매쉬'
    if nm.startswith('솔벤출력') or ('솔벤' in nm and '출력' in nm):
        if SHEET.search(ct):
            return ('SV-SHEETG' if GRAY.search(ct) else 'SV-SHEET'), '솔벤출력 + 내용에 시트/랩핑'
        return 'SV-BANNER', '솔벤출력 (내용에 시트 없음 → 현수막)'
    if 'UV후렉스' in nm:
        return ('UV-FLEXN' if NONLIT.search(t) else 'UV-FLEXL'), 'UV 후렉스'
    if nm.startswith('UV출력'):
        return ('UV-SHEETG' if GRAY.search(t) else 'UV-SHEET'), 'UV 시트'
    if '패트배너' in nm:
        return 'AQ-PAT', '수성 패트'
    if '윈드배너' in nm:
        return 'TRW-PO-S', '전사 윈드배너 폰지'
    if '가로등배너' in nm:
        m = LEN180.search(sp)
        c = 'TRB-PO-%s' % m.group(1) if m else 'TRB-PO-180'
        return (c if c in items else 'TRB-PO-180'), '전사 가로등배너 폰지'
    if '현수막' in nm and '출력' in nm:
        return ('SV-BANNER' if SOLV.search(t) else 'AQ-BANNER'), '현수막 출력 (수성 기본)'
    # 후렉스 변종 — 「UV후렉스」로 안 적고 「UV그레이후렉스」·「UV양면후렉스」로 오는 것들
    if '후렉스' in nm:
        if '양면' in nm:
            return 'UV-FLEXD', 'UV 양면배너후렉스'
        return ('UV-FLEXN' if (NONLIT.search(t) or GRAY.search(nm)) else 'UV-FLEXL'), 'UV 후렉스 변종'
    if nm.startswith('전사출력') or ('전사' in nm and '출력' in nm):
        return 'TRG-PO', '전사 깃발 폰지'
    if nm.strip() == '출력':                # 품명이 그냥 「출력」 — 규격만 있고 소재 단서가 없다
        return 'AQ-BANNER', '품명 「출력」 · 소재 단서 없음 → 수성 현수막(기본)'
    return None, None


lines = json.load(open(LINES_JSON, encoding='utf-8'))
buf, ids, stat, skip = [], [], Counter(), []
for ln in lines:
    nm, sp, ct = str(ln['item_name'] or ''), str(ln['specification'] or ''), str(ln['content'] or '')
    code, why = resolve(nm, sp, ct)
    if not code or code not in items:
        skip.append((nm, sp, ln['amt']))
        continue
    buf.append("UPDATE order_items SET item_id = %d WHERE id = %d AND item_id IS NULL;  -- %s | %s | %s"
               % (items[code], ln['id'], nm, sp, why))
    ids.append(str(ln['id']))
    stat[code] += 1

open(os.path.join(OUT, 'e2_print_link.sql'), 'w', encoding='utf-8').write(
    '-- 선명 2026-07 출력 서비스 라인 → MES 제품 연결 (2026-08-07)\n'
    '-- 생성기 = docs/dongsan-import/gen_e2_print_link.py (규칙·근거는 그 파일 헤더)\n'
    '-- ★ 소재는 품명만으로 안 갈린다 — `content` 의 「시트)」·「랩핑시트)」 를 같이 본다.\n'
    '-- 롤백 = docs/dongsan-import/rollback_e2_print_link.sql\n\n' + '\n'.join(buf) + '\n')
open(os.path.join(OUT, 'rollback_e2_print_link.sql'), 'w', encoding='utf-8').write(
    '-- 출력 서비스 연결 롤백 (2026-08-07)\nUPDATE order_items SET item_id = NULL WHERE id IN (%s);\n' % ','.join(ids))

print('연결 %d라인 · %s' % (len(buf), dict(stat.most_common())))
print('미해결 %d라인 %s원' % (len(skip), format(sum(a for _, _, a in skip), ',')))
for nm, sp, a in sorted(skip, key=lambda x: -x[2])[:8]:
    print('   %10s %s | %s' % (format(a, ','), nm[:30], sp[:16]))
