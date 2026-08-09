# -*- coding: utf-8 -*-
"""대표 코드에 붙은 판매 라인 → 규격별 코드로 배분 (2026-08-09).

★ 왜 필요한가
  매입은 규격별 코드(`SGM-SMPS-W300`)로 들어가는데 **판매만 대표 코드**(`SGM-SMPS`)에 붙어 있다.
  둘이 다른 코드에 앉아 있으면 **마진이 계산되지 않는다** — 까치발이 정확히 그랬다.

★ 무엇을 배분하고 무엇을 남기는가 (실측으로 갈랐다)

  **배분한다** — 판매 라인의 `specification` 이 **자재 규격 그대로**인 것:
    `SGM-SMPS` 128라인 : 규격이 `100W`~`500W`. MES 에 `SGM-SMPS-W100~W500` 이 전부 있다.
    `SGM-LEDF`  80라인 : 규격이 `20W-단면`·`20W-웜(전구색)`·`28W-양면/돌출`·`30W-양면`.
                         30W 만 MES 에 없어 신설한다.

  **배분하지 않는다** — `SGM-TRB` 트러스바 50라인 14,204,000:
    규격이 `9730x200mm` 처럼 **완성 크기**다. 뒤 숫자가 폭이라 `-R200-` 계열까지는 좁혀지지만,
    ① **색이 규격에 없다**(MES 는 BK/WH/LG/DG/JD 로 갈린다)
    ② 더 근본적으로 **판매는 재단품이고 자재는 7m 원장**이다. 붙이면 「9730mm 1건 = 1개 팔림」이 되어
       **수량이 왜곡**된다. 제대로 하려면 BOM(재단품 = 원장 × 길이비율)이 필요하고 그건 별건이다.
    폭이 원가를 지배하는 건 맞다(150폭 57,800 → 400폭 220,000, 3.8배 · 색 편차는 ±10%).
    그래도 **수량이 틀리는 연결은 안 하느니만 못하다.**

  같은 이유로 `SV-MESH`·`SV-TENT`·`AQ-TENT` 도 손대지 않는다 — 그건 **제품**(출력물)이고
  `SVM-*`·`SVT-*`·`TENT-*` 는 **원단**이다. 대표 코드가 맞는 자리다(§8-N).

★ 표기 흔들림은 정규화해서 흡수한다 — `300W`/`300w`, `28W-양면/돌출`/`28w-양면(돌출)`.

사용: python docs/dongsan-import/gen_repcode_split.py <items.json> <lines.json>
산출: load/repcode_split.sql (+ rollback)
"""
import json, sys, os, re, warnings
from collections import Counter
warnings.filterwarnings('ignore')
sys.stdout.reconfigure(encoding='utf-8')

ITEMS_JSON, LINES_JSON = sys.argv[1], sys.argv[2]
OUT = os.path.join(r'C:\Users\user\dongsan_mes', 'docs', 'dongsan-import', 'load')
items = {i['item_code']: i['id'] for i in json.load(open(ITEMS_JSON, encoding='utf-8')) if i['is_active']}


def smps(sp):
    """`300W`·`300w` → SGM-SMPS-W300"""
    m = re.search(r'(\d{3})\s*[Ww]', sp or '')
    return 'SGM-SMPS-W%s' % m.group(1) if m else None


def ledf(sp):
    """와트 + 단면/웜/양면 조합. 표기가 흔들려 정규화해서 본다."""
    s = (sp or '').upper().replace(' ', '')
    m = re.search(r'(\d{2})W', s)
    if not m:
        return None
    w = m.group(1)
    if '웜' in (sp or '') or '전구색' in (sp or ''):
        return 'SGM-LEDF-F%sW' % w          # 20W 웜
    if '양면' in (sp or '') or '돌출' in (sp or ''):
        # 60cm 명시가 있으면 그 코드로. 없으면 기본 양면돌출.
        return 'SGM-LEDF-F%sD60' % w if '60' in s else 'SGM-LEDF-F%sD' % w
    if '단면' in (sp or ''):
        return 'SGM-LEDF-F%sS' % w
    return None


RULES = {'SGM-SMPS': smps, 'SGM-LEDF': ledf}

lines = json.load(open(LINES_JSON, encoding='utf-8'))
buf, ids, stat, skip = [], [], Counter(), []
for L in lines:
    fn = RULES.get(L['rep'])
    if not fn:
        continue
    code = fn(L['sp'])
    if not code or code not in items:
        skip.append((L['rep'], L['sp'], L['amt'], code or '(규격 해석 실패)'))
        continue
    buf.append("UPDATE order_items SET item_id = %d WHERE id = %d;  -- %s [%s] → %s"
               % (items[code], L['id'], L['rep'], L['sp'], code))
    ids.append((L['id'], L['rep']))
    stat[code] += 1

open(os.path.join(OUT, 'repcode_split.sql'), 'w', encoding='utf-8').write(
    '-- 대표 코드 판매 라인 → 규격별 코드 배분 (2026-08-09)\n'
    '-- 생성기 = docs/dongsan-import/gen_repcode_split.py (배분/보류 근거는 그 파일 헤더)\n'
    '-- ★ 트러스바는 **일부러 뺐다** — 판매 규격이 완성 크기라 붙이면 수량이 왜곡된다.\n'
    '-- 롤백 = docs/dongsan-import/load/rollback_repcode_split.sql\n\n' + '\n'.join(buf) + '\n')
rb = {}
for i, rep in ids:
    rb.setdefault(rep, []).append(str(i))
open(os.path.join(OUT, 'rollback_repcode_split.sql'), 'w', encoding='utf-8').write(
    '-- 대표 코드 배분 롤백 (2026-08-09) — 배분 전엔 전부 대표 코드에 붙어 있었다\n'
    + ''.join("UPDATE order_items SET item_id=(SELECT id FROM items WHERE item_code='%s') WHERE id IN (%s);\n"
              % (rep, ','.join(v)) for rep, v in rb.items()))

print('배분 %d라인 · 코드 %d종' % (len(buf), len(stat)))
for c, n in stat.most_common():
    print('   %-20s %d라인' % (c, n))
print('\n보류 %d라인 %s원' % (len(skip), format(int(sum(s[2] for s in skip)), ',')))
agg = Counter()
for rep, sp, a, why in skip:
    agg[(rep, sp, why)] += a
for (rep, sp, why), a in agg.most_common(10):
    print('   %10s  %-12s 규격「%s」 %s' % (format(int(a), ','), rep, sp[:20], why))
