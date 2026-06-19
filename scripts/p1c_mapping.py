# -*- coding: utf-8 -*-
# P1c 매핑 초안 생성기 (비파괴 분석): 구품목(변종) → 신표준+변종축 + 단가이전 대상
# 입력: scripts/_old_items.json, _new_items.json (prod 추출)
# 출력: docs/superpowers/specs/2026-06-20-p1c-mapping-draft.md
import json, re, sys
from collections import defaultdict
sys.stdout.reconfigure(encoding='utf-8')

def load(p):
    with open(p, encoding='utf-8') as f:
        return json.load(f)[0]['results']

old = load('scripts/_old_items.json')
new = load('scripts/_new_items.json')

HOSU = re.compile(r'(\d+호|특호|대형)')
COAT = re.compile(r'(\d코팅|무코팅|메쉬|친환경)')
SOJAE = re.compile(r'(사틴|폰지|자수)')
METHOD = re.compile(r'^(수성|솔벤|UV|전사)\s*')
SIZE = re.compile(r'\((대|중|소)\)')

def extract(name):
    v = {}; base = name
    m = METHOD.match(base)
    if m: v['인쇄방식'] = m.group(1); base = METHOD.sub('', base)
    m = HOSU.search(base)
    if m: v['호수'] = m.group(1); base = HOSU.sub('', base)
    m = COAT.search(base)
    if m: v['소재'] = m.group(1); base = COAT.sub('', base)
    m = SOJAE.search(base)
    if m: v['소재'] = m.group(1); base = re.sub(r'[\(]?'+m.group(1)+r'[\)]?', '', base)
    m = SIZE.search(base)
    if m: v['규격'] = m.group(1); base = SIZE.sub('', base)
    base = re.sub(r'[\(\)]', '', base).strip()
    return base, v

def norm(s): return s.replace(' ', '')

def find_new(base, itype):
    bn = norm(base)
    if not bn: return None, 'none'
    pool = [n for n in new if n['item_type'] == itype]  # 동일 역할 내에서만 매칭 (자재↔제품 교차 방지)
    if not pool: return None, 'none'
    ex = [n for n in pool if norm(n['item_name']) == bn]
    if ex: return ex[0], 'exact'
    sw = [n for n in pool if norm(n['item_name']).startswith(bn) or bn.startswith(norm(n['item_name']))]
    if sw: return min(sw, key=lambda n: len(n['item_name'])), 'partial'
    ct = [n for n in pool if bn in norm(n['item_name']) or norm(n['item_name']) in bn]
    if ct: return min(ct, key=lambda n: len(n['item_name'])), 'fuzzy'
    return None, 'none'

rows = []
for o in old:
    base, v = extract(o['item_name'])
    nm, conf = find_new(base, o['item_type'])
    rows.append({**o, 'base': base, 'variants': v, 'new': nm, 'conf': conf})

matched = [r for r in rows if r['new']]
unmatched = [r for r in rows if not r['new']]
priced = [r for r in rows if (r.get('base_price') or 0) > 0 or (r.get('sales_price') or 0) > 0]

# 신 타겟별 그룹 (N:1 변종 통합)
groups = defaultdict(list)
for r in matched:
    groups[(r['new']['item_code'], r['new']['item_name'])].append(r)

def vstr(v): return ', '.join(f"{k}={val}" for k, val in v.items()) or '—'
def won(n): return f"{int(n):,}" if n else '0'

TOK = re.compile(r'[가-힣]+|[A-Za-z0-9]+')
def candidates(r):
    pool = [n for n in new if n['item_type'] == r['item_type']]
    toks = set(TOK.findall(r['base']))
    scored = []
    for n in pool:
        sc = len(toks & set(TOK.findall(n['item_name'])))
        if sc > 0: scored.append((sc, len(n['item_name']), n))
    scored.sort(key=lambda x: (-x[0], x[1]))
    return ' / '.join(f"{n['item_name']}({n['item_code']})" for _, _, n in scored[:3]) or '—(신 등가 없음)'
def group_of(r):
    if r['item_type'] == 'MATERIAL': return 'A. 원자재(코드성/규격변종)'
    if r['item_type'] == 'GOODS': return 'C. 부속품'
    return 'B. 깃발/전사 변종'

out = []
out.append("# P1c 매핑 + 단가이전 계획 초안 (비파괴 분석)\n")
out.append("- **작성일**: 2026-06-20 · **상태**: 🟡 초안 — 자동 휴리스틱 매핑, **사람 검토 필수**")
out.append("- **목적**: 구품목(변종 granular) → 신표준+변종축 매핑 + 변종별 단가 이전 대상 식별. **실행/활성화 아님**")
out.append("- **입력**: prod 구 active 품목 / 신규 staged 품목\n")
out.append(f"## 0. 요약\n")
out.append(f"- 구 active **{len(old)}** → 매핑 후보 있음 **{len(matched)}** / 미매칭 **{len(unmatched)}**")
out.append(f"- 변종 통합 그룹 **{len(groups)}개** (N:1)")
out.append(f"- 단가 보유 구품목(이전 대상) **{len(priced)}**\n")
out.append("> ⚠️ 신뢰도 conf: exact(이름일치)·partial(접두/포함)·fuzzy(부분)·none(미매칭). partial/fuzzy/none은 전수 검토 필요.\n")

out.append("## 1. 변종 통합 그룹 (구 N → 신 1 + 변종축)\n")
out.append("| 신 타겟 | 신 단가방식 | 구 변종(축·구단가) |")
out.append("|---|---|---|")
for (code, name), members in sorted(groups.items(), key=lambda x: -len(x[1])):
    if len(members) < 2: continue
    pp = members[0]['new'].get('pricing_profile', '')
    vlist = '<br>'.join(f"{m['item_name']}({vstr(m['variants'])}·₩{won(m.get('base_price') or m.get('sales_price') or 0)}·{m['conf']})" for m in members)
    out.append(f"| {name} ({code}) | {pp} | {vlist} |")

out.append("\n## 2. 단일 매핑 (구 1 → 신 1)\n")
out.append("| 구품목 | 구단가 | → 신 | conf |")
out.append("|---|---|---|---|")
for (code, name), members in groups.items():
    if len(members) != 1: continue
    m = members[0]
    out.append(f"| {m['item_name']} ({m['item_code']}) | ₩{won(m.get('base_price') or m.get('sales_price') or 0)} | {name} ({code}) | {m['conf']} |")

out.append("\n## 3. 미매칭 구품목 + 사용빈도 + 신 후보 (사람 판단)\n")
out.append("| G | 구품목 | 구분류 | 6M사용 | 구단가 | 신 후보(동일타입 top3) |")
out.append("|---|---|---|---|---|---|")
for r in sorted(unmatched, key=lambda r: (group_of(r), -(r.get('uses') or 0), r['item_name'])):
    out.append(f"| {group_of(r)[:1]} | {r['item_name']} ({r['item_code']}) | {r.get('cat','')} | {r.get('uses',0)}회 | ₩{won(r.get('base_price') or r.get('sales_price') or 0)} | {candidates(r)} |")

from collections import Counter
gc = Counter(group_of(r) for r in unmatched)
mu = max((r.get('uses') or 0) for r in unmatched) if unmatched else 0
out.append("\n## 3.5 미매칭 방향 분류 (제안)\n")
out.append(f"> ★ **전 {len(unmatched)}건 모두 6개월 사용 0~1회**(최대 {mu}회) → **기본 방향 = 비활성(ad-hoc 강등)**. 신 등록/매핑은 용준님이 \"계속 쓴다\" 확인한 항목만.\n")
out.append("| 그룹 | 수 | 제안 방향 (사용 0~1회 전제) |")
out.append("|---|---|---|")
out.append(f"| **A. 원자재(코드성/규격변종)** | {gc.get('A. 원자재(코드성/규격변종)',0)} | SPM011G/022G·폰지 = 미사용 → **비활성 기본**. 실제 쓰는 자재면 용준님 식별 후 신 원자재 등록+spec(폭). 동명 다건=폭 변종 |")
out.append(f"| **B. 깃발/전사 변종** | {gc.get('B. 깃발/전사 변종',0)} | 군기·근조기·탁상기 ×(사틴/폰지/외주) 미사용 → **비활성/ad-hoc 기본**. 계속 받으면 신 깃발·기 표준+소재 옵션(option-axis 선행) |")
out.append(f"| **C. 부속품** | {gc.get('C. 부속품',0)} | 미사용 → **비활성 기본**. 물통/윈드배너 거치대는 신 후보 존재(필요시 매핑), 멕기·십자거치대·알루미늄깃대는 비활성 |")
out.append("\n> **공통 원칙**: 구품목 삭제 금지(주문 FK) → 비활성. ad-hoc 강등 = 신 마스터 미등록(`order_items.item_id=NULL` 지원), 과거 주문은 구품목 참조 유지.")
out.append("> **register vs ad-hoc**: 6개월 사용빈도로 결정 — 반복 사용 = 신 마스터 등록/매핑, 희소(0~2회) = ad-hoc 강등(비활성).")

out.append("\n## 4. 단가 이전 대상 (구단가 보유)\n")
out.append("- GRADE(호수) 품목 → `size_grade_prices`(item_id·grade·price) 적재")
out.append("- 소재/인쇄방식 변종 → 옵션 단가(option-axis 시스템 선행) 또는 base_price\n")
out.append("| 구품목 | 구단가 | 변종축 | → 신 타겟 | 이전 위치(제안) |")
out.append("|---|---|---|---|---|")
for r in sorted(priced, key=lambda r: (r['new']['item_name'] if r['new'] else 'zzz')):
    tgt = f"{r['new']['item_name']}({r['new']['item_code']})" if r['new'] else '미매칭'
    loc = 'size_grade_prices' if (r['new'] and r['new'].get('pricing_profile')=='GRADE') else ('옵션단가/base' if r['variants'] else 'base_price')
    price = r.get('base_price') or r.get('sales_price') or 0
    out.append(f"| {r['item_name']} ({r['item_code']}) | ₩{won(price)} | {vstr(r['variants'])} | {tgt} | {loc} |")

out.append("\n## 5. 실행 계획 (검토 확정 후, 비파괴 순서)\n")
out.append("1. **매핑 확정** — 위 1~3 사람 검토 → `item_external_code_map`(old_item_id·new_item_id·axis_values) 작성")
out.append("2. **변종 단가 이전** — GRADE는 size_grade_prices 적재, 소재/인쇄방식은 option-axis 선행 후 옵션단가")
out.append("3. **인쇄방식/역할 카테고리(전사·UV·솔벤·상품) 비활성** — 구품목 재배정·비활성 후")
out.append("4. **go-live** — 구품목 is_active=0(이력보존, 주문 FK 유지) + 신품목 is_active=1. 운영자 공지")
out.append("\n## 6. 선행 의존성\n")
out.append("- 소재/인쇄방식/규격 변종→옵션 매핑 = **option-axis 시스템(옵션값 호수/소재) 선행 필요**")
out.append("- GRADE(호수) 단가는 size_grade_prices(0324)로 즉시 가능")
out.append("- 미매칭·코드성 이름(SPM011G 등 원자재, ACC 부속품)은 개별 확정\n")

with open('docs/superpowers/specs/2026-06-20-p1c-mapping-draft.md', 'w', encoding='utf-8') as f:
    f.write('\n'.join(out) + '\n')

print(f"생성: docs/superpowers/specs/2026-06-20-p1c-mapping-draft.md")
print(f"  구 active {len(old)} / 매핑후보 {len(matched)} / 미매칭 {len(unmatched)} / 변종그룹 {len(groups)} / 단가보유 {len(priced)}")
print(f"  conf 분포: " + str({c: sum(1 for r in rows if r['conf']==c) for c in ['exact','partial','fuzzy','none']}))
# 미매칭 샘플
print("  미매칭 예:", [r['item_name'] for r in unmatched[:12]])
