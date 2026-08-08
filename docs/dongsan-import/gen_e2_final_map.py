# -*- coding: utf-8 -*-
"""선명 2026-07 미매칭 → 최종 매핑표 (2026-08-07, 용준님 확인분 반영).

앞선 후보표(`gen_e2_match_candidates.py`)는 기계가 고른 것이고, 여기는 **용준님이 성격을 확정해 준
21조합**을 사람 판단으로 채운 뒤 나머지를 합친 최종본이다. 확정 근거를 열로 남긴다 —
나중에 「왜 이 코드로 갔나」를 되짚을 수 있어야 한다.

용준님 확인 (2026-08-07)
  ① `EP-시리즈 수성` 12,700,000 = **수성 장비 납품건**. 재고 품목이 아니라 되판 장비다
     (같은 건이 고정자산 FA-2026-009 로 잘못 등록됐다가 취소됐다). → 상품 신규 등록 대상, 지금은 NULL
  ② `포맥스5T+포켓(게시판)` = **포맥스 인쇄 및 재단해서 나간 제품** → 두께별 `UV-FMX-<t>T-W`
  ③ `포맥스+평판인쇄` = **포맥스 평판인쇄로 그냥 매칭** → `UV-FMX-5T-W`(대표 두께)
  ④ `LG엠보컷팅` = **LG 엠보시트 컷팅건** → `UV-EMBO`
  ⑤ `광확산pc3T큐브박스` = 3T 큐브 모양, **외주** → `UV-PC-3T-M`
  ⑥ `채널트러스바`·`포인트사각돌출` = **간판 자재를 상품처럼 판매** → `SGM-TRB` / `SGM-PRSQ-550`

★ 두께는 품명에서 뽑는다(`5T`·`15T`). MES 에 없는 두께는 **가장 가까운 것으로 내리지 않고 NULL** —
  포맥스는 두께가 곧 단가라 임의로 붙이면 원가가 틀린다(15T 는 MES 최대가 10T 라 대상 없음).

사용: python docs/dongsan-import/gen_e2_final_map.py <items.json> <candidates.tsv>
산출: docs/analysis/2026-08-07-e2-final-map.tsv
"""
import json, sys, re, os, csv, warnings
warnings.filterwarnings('ignore')
sys.stdout.reconfigure(encoding='utf-8')

ITEMS_JSON, CAND_TSV = sys.argv[1], sys.argv[2]
items = {i['item_code']: i for i in json.load(open(ITEMS_JSON, encoding='utf-8')) if i.get('is_active')}
THICK = re.compile(r'(\d+(?:\.\d+)?)\s*T')

# 용준님 확정 규칙 — (판정 정규식, 코드 또는 콜러블, 근거)
CONFIRMED = [
    (re.compile(r'^EP-시리즈'), None, '용준님①: 수성 장비 납품건(재고 아님) — 상품 신규등록 대상'),
    (re.compile(r'포맥스.*평판인쇄|포맥스\+평판'), 'UV-FMX-5T-W', '용준님③: 포맥스 평판인쇄로 매칭'),
    (re.compile(r'포맥스'), 'THICK_FMX', '용준님②: 포맥스 인쇄·재단 제품 — 두께별'),
    (re.compile(r'LG.*엠보.*컷팅|LG엠보'), 'UV-EMBO', '용준님④: LG 엠보시트 컷팅건'),
    (re.compile(r'광[학확]산.*pc|광[학확]산pc', re.I), 'THICK_PC', '용준님⑤: 광확산PC 3T 큐브(외주)'),
    (re.compile(r'채널트러스바|트러스바'), 'SGM-TRB', '용준님⑥: 간판 자재를 상품 판매'),
    (re.compile(r'포인트.*사각돌출|사각돌출'), 'SGM-PRSQ-550', '용준님⑥: 간판 자재를 상품 판매(규격 55cm 일치)'),
]


def thick_of(nm, sp=''):
    # 두께는 품명에 없고 **규격에만** 있는 경우가 있다(「포맥스-중국산」 + 규격 `4*8(3T)`).
    m = THICK.search(nm) or THICK.search(sp)
    return m.group(1).rstrip('.0') if m else None


# 색상 — 포맥스/아크릴은 백/검정이 다른 품목이다. 「(검정)」을 놓치면 다른 자재에 붙는다.
BLACK = re.compile(r'검정|블랙|흑')


def color_suffix(nm):
    return 'B' if BLACK.search(nm) else 'W'


def resolve(nm, sp):
    for rx, code, why in CONFIRMED:
        if not rx.search(nm):
            continue
        if code is None:
            return '', why
        if code == 'THICK_FMX':
            t = thick_of(nm, sp)
            col = color_suffix(nm)
            c = 'UV-FMX-%sT-%s' % (t, col) if t else None
            return (c, why + ' (%sT/%s)' % (t, col)) if c in items else ('', why + ' (%sT — MES 에 해당 두께 없음, 임의 대체 금지)' % t)
        if code == 'THICK_PC':
            t = thick_of(nm, sp) or '3'
            c = 'UV-PC-%sT-M' % t
            return (c, why) if c in items else ('', why + ' (%sT 없음)' % t)
        return (code, why) if code in items else ('', why + ' (코드 없음)')
    return None, None


rows = list(csv.DictReader(open(CAND_TSV, encoding='utf-8-sig'), delimiter='\t'))
out, stat = [], {'확정': 0, '후보채택': 0, 'NULL': 0}
for r in rows:
    code, why = resolve(r['품목명'], r['규격'])
    if why is not None:                       # 용준님 확정 규칙에 걸림
        src = '용준님 확정'
        stat['확정' if code else 'NULL'] += 1
    elif r['점수1'] and float(r['점수1']) >= 0.5:
        code, why, src = r['후보1'], '기계 후보 (점수 %s · %s)' % (r['점수1'], r['근거1']), '자동(고신뢰)'
        stat['후보채택'] += 1
    else:
        code, why, src = '', ('기계 후보 약함 (점수 %s)' % r['점수1']) if r['점수1'] else '후보 없음', '보류'
        stat['NULL'] += 1
    out.append([r['품목명'], r['규격'], r['라인수'], r['수량'], r['공급가액'], r['내용(예시)'],
                code, items.get(code, {}).get('item_name', ''), src, why,
                r['후보1'], r['후보1명'], r['점수1'], ''])

p = os.path.join(r'C:\Users\user\dongsan_mes', 'docs', 'analysis', '2026-08-07-e2-final-map.tsv')
out.sort(key=lambda x: -int(x[4]))
with open(p, 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.writer(f, delimiter='\t')
    w.writerow(['품목명', '규격', '라인수', '수량', '공급가액', '내용(예시)',
                '★적용코드', '★적용품목명', '출처', '근거',
                '기계후보', '기계후보명', '점수', '수정(기입)'])
    w.writerows(out)

amt = lambda pred: format(sum(int(x[4]) for x in out if pred(x)), ',')
print('총 %d조합' % len(out))
print('  적용됨   %d조합 %s원' % (sum(1 for x in out if x[6]), amt(lambda x: x[6])))
print('    · 용준님 확정 %d · 자동(고신뢰) %d' % (stat['확정'], stat['후보채택']))
print('  NULL     %d조합 %s원' % (sum(1 for x in out if not x[6]), amt(lambda x: not x[6])))
print('→', p)
