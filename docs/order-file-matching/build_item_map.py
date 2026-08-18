# -*- coding: utf-8 -*-
"""품목 매핑표 초안 v3 — v2 회귀 수정 + 전사 2축(규격·파일명 키워드).

v2 에서 고친 것:
  · **회귀**: `솔벤그레이시트` 는 마스터에 그대로 있는데(SV-SHEETG) 「그레이OO → OO 그레이」
    재작성이 오히려 깨뜨렸다. 마스터 표기가 품목마다 다르다(`솔벤 그레이시트` vs `수성 켈 그레이`)
    → **두 형태를 모두 시도**한다. 규칙을 한쪽으로 강제하면 반대쪽이 깨진다.
  · `자작6T` → 접두 치환이 `자작`에만 걸려 있었다. 어간만 갈아끼운다(`자작나무6T`).
  · `한폭`·`한폭출력` 도 원단 폭 표기다(`\\d+폭`만 잡고 있었다).
  · `유광`·`무광` 후가공어가 v2 목록에서 빠져 있었다.
  · `엠보시트W+C` 의 꼬리 `W`(백색)·`C`(코팅) 분리.

전사축은 **규격만으로는 47.3%** 밖에 안 정해진다. 파일명 본문에 품목어가 있는지 같이 본다
(`만장기`·`깃발`·`가로등배너`·`윈드배너`…). 규격 ∪ 키워드로 커버리지를 잰다.
"""
import csv, io, json, os, re, sys
from collections import Counter, defaultdict
from datetime import date

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
S = os.path.dirname(os.path.abspath(__file__))
TMP = os.environ.get('TEMP', S)

d = json.load(io.open(os.path.join(TMP, 'prod_items_all.json'), encoding='utf-8-sig'))
ITEMS = d[0]['results'] if isinstance(d, list) else d['result'][0]['results']
sq = lambda s: re.sub(r'[\s\-_]', '', (s or '')).lower()
# ★품목명이 제품과 원자재에 **똑같이** 붙어 있다 — `솔벤 매쉬`가 SV-MESH(제품)이자
#   SVM-060/127/160…(원자재 폭별)이다. 정렬을 안 하면 원자재를 집어 주문 라인에 원단이 들어간다.
RANK = {'PRODUCT': 0, 'GOODS': 1, 'MATERIAL': 2}
ITEMS.sort(key=lambda r: (RANK.get(r.get('item_type'), 3), r.get('item_code') or ''))
NAME_IDX = defaultdict(list)
for r in ITEMS:
    NAME_IDX[sq(r['item_name'])].append(r)

PREFIXES = ['솔벤', '수성', 'uv', 'UV', '전사']
POST_WORDS = ['재단', '돔보', '조명용', '앱슨', '앱손', '자동바니쉬', '가운데출력', '중앙출력',
              '천갈이', '완컷팅', '반칼', '타공', '무코', '단출', '양출', '단면', '양면',
              '코팅X', '중국산', '유광', '무광', '고주파']
RX_WIDTH = re.compile(r'((?:\d{3,4}|한)\s*폭(?:출력)?)')
RX_DEV = re.compile(r'[-_](앱손|앱슨)\s*\d+')
RX_LIT = re.compile(r'[-+_＋]\s*(조명|비조명|조|비)\s*$')
RX_WC = re.compile(r'([가-힣]+)\s*[WwBb]\s*$')           # `엠보시트W` → `엠보시트`
SYN = {'후렉스': '후렉스', '훼렉스': '후렉스', '베너': '배너', '메쉬': '매쉬',
       '매쉬배너': '매쉬', '매쉬베너': '매쉬', '메쉬배너': '매쉬', '메쉬베너': '매쉬',
       '패트베너': '패트배너', '현수막배너': '현수막', '투코팅': '투명시트', '자석시트': '시트'}
STEM = [('자작나무', '자작나무'), ('자작', '자작나무')]   # 긴 것부터
TYPO = [('포멕스', '포맥스'), ('품보드', '폼보드'), ('엡손', '앱손'), ('배너', '배너')]
# 마스터는 `{소재} {두께}T {색}` 순인데 현장 표기는 `{색}{두께}T{소재}` 순이다.
RX_CTM = re.compile(r'^(백색|검정|흑색|투명|유백)?\s*(\d+(?:\.\d+)?)\s*[TtMm]\s*(.*)$')
RX_GRAY = re.compile(r'^그레이(.+)$')
AXIS_PREFIX = {'★UV솔벤★': ['솔벤', 'UV'], '★현수막-수성출력★': ['수성', '솔벤', 'UV']}
AXIS_DEFAULT = {'★현수막-수성출력★': '수성 현수막', '★UV솔벤★': None}


def split_tokens(t):
    tail = []
    t = (t or '').strip()
    mo = RX_WIDTH.search(t)
    if mo:
        tail.append(mo.group(1)); t = RX_WIDTH.sub('', t).strip()
    mo = RX_DEV.search(t)
    if mo:
        tail.append(mo.group(0).lstrip('-_')); t = RX_DEV.sub('', t).strip()
    lit = None
    parts = re.split(r'[+＋]', t)
    head = parts[0].strip()
    for p in parts[1:]:
        p = p.strip()
        if p in ('조', '조명'):
            lit = 'L'
        elif p in ('비', '비조명'):
            lit = 'N'
        elif p:
            tail.append(p)
    mo = RX_LIT.search(head)
    if mo:
        lit = 'L' if mo.group(1) in ('조', '조명') else 'N'
        head = head[:mo.start()].strip()
    for w in sorted(POST_WORDS, key=len, reverse=True):
        while head.endswith(w) and len(head) > len(w):
            head = head[:-len(w)].strip(' -_'); tail.append(w)
    mo = RX_WC.match(head)
    if mo:
        head = mo.group(1)
    head = head.strip(' -_')
    pre = ''
    for p in PREFIXES:
        if head.lower().startswith(p.lower()):
            pre, head = p, head[len(p):].strip(' -_'); break
    for a, b in STEM:                                  # `자작6T` → `자작나무6T`
        if head.startswith(a) and not head.startswith(b + '나'):
            head = b + head[len(a):]; break
    typo = False
    for a, b in TYPO:                                   # `포멕스`→`포맥스` · `품보드`→`폼보드`
        if a != b and a in head:
            head = head.replace(a, b); typo = True
    # 「평판」= 인쇄 방식이지 소재가 아니다. 떼어내고 남은 것이 소재다.
    if RX_PYEONGPAN.search(head):
        head = RX_PYEONGPAN.sub('', head).strip(' -_')
        tail.append('평판인쇄'); typo = True
        if not head or RX_COLOR_T.match(head):          # 소재어가 없으면 포맥스(용준님 확정)
            head = (head + ' 포맥스').strip()
    # `{색}{두께}T{소재}` → 마스터 순서 `{소재} {두께}T {색}`
    mo = RX_CTM.match(head)
    if mo and mo.group(3):
        head = f'{mo.group(3).strip()} {mo.group(2)}T' + (f' {mo.group(1)}' if mo.group(1) else '')
    mat = SYN.get(sq(head), head)
    return pre, mat, tail, lit, typo


def candidates_for(mat, lit):
    """소재 표기 후보들. ★한 형태로 강제하지 않는다 — 마스터 표기가 품목마다 다르다."""
    outs = []
    if lit and '후렉스' in mat:
        outs.append(('조명' if lit == 'L' else '비조명') + mat)
    outs.append(mat)
    mo = RX_GRAY.match(mat)
    if mo:                                             # `그레이켈` → `켈 그레이` 도 시도
        outs.append(SYN.get(sq(mo.group(1)), mo.group(1)) + ' 그레이')
    return outs


def lookup(pre, mat, lit, axis):
    pres = [pre] if pre else AXIS_PREFIX.get(axis, [])
    if not mat:
        dflt = AXIS_DEFAULT.get(axis)
        if dflt and NAME_IDX.get(sq(dflt)):
            return NAME_IDX[sq(dflt)][0], '원단 폭 표기 → 축 기본품목', '보통'
        return None, '', '확인필요'
    for m in candidates_for(mat, lit):
        for p in (pres or ['']):
            hits = NAME_IDX.get(sq(p + m))
            if hits:
                return hits[0], f'{p or axis}+{m}', '높음'
    for m in candidates_for(mat, lit):
        key = sq(m)
        pool = [r for r in ITEMS if key and key in sq(r['item_name'])]
        pool = [r for r in pool if r.get('item_type') != 'MATERIAL'] or pool  # 원자재는 주문 라인이 아니다
        if pres:
            pool = [r for r in pool if any(sq(r['item_name']).startswith(sq(p)) for p in pres)] or pool
        if lit:
            f = [r for r in pool if '조명' in r['item_name']
                 and ('비조명' in r['item_name']) == (lit == 'N')]
            pool = f or pool
        w = [r for r in pool if '백색' in r['item_name']]
        pool = w or pool
        if pool:
            return pool[0], f'부분일치·후보 {len(pool)}종', '높음' if len(pool) == 1 else '보통'
    return None, '', '확인필요'


# ── 사람이 확정한 것(2026-08-12 용준님) ─────────────────────
# 규칙으로 유도할 수 없는 업무 지식이다. 추론기보다 **먼저** 적용한다.
#   (부분문자열, 품목코드 or None, 후가공으로 옮길 말, 비고)
OVERRIDE = [
    ('게시대',        'AQ-BANNER', '게시대 마감', '게시대는 품목이 아니라 현수막의 마감'),
    ('그레이후렉스',    'UV-FLEXN',  '',          '그레이후렉스 = 비조명후렉스'),
    # ⚠️「비점착 합성지」는 신설하지 않았다 — AQ-SYN(수성 합성지)의 별칭이 이미 `합성지(비접착)` 다.
    #   원단 축에도 SYN-NA-127(비점착 합성지)이 있다. 만들었으면 중복이었다.
    ('유포지',        'AQ-SYN',    '비점착',      'AQ-SYN 별칭이 곧 「합성지(비접착)」 — 신설 불요'),
    ('가로등현수막',    'AQ-STB',    '',          '신설 완료(0533) — 수성 가로등현수막'),
]
# 「평판」은 **오기**다(2026-08-12 용준님) — 실제 소재는 포맥스.
# 파일명 작성 규칙을 배포하면 사라질 표기이므로 매핑은 하되 오기로 표시해 둔다.
#   `백색3T평판` = 포맥스 3T 백색 · `폼보드평판` = 폼보드(두께 미표기)
RX_PYEONGPAN = re.compile(r'평판')
RX_COLOR_T = re.compile(r'^(백색|검정|흑색)\s*(\d+(?:\.\d+)?)\s*[TtMm]?$')


def apply_override(t):
    for key, code, post, note in OVERRIDE:
        if key in t:
            return code, post, note
    return False, '', ''


rows = []
for fn in ('parsed.csv', 'parsed_jeonsa.csv'):
    p = os.path.join(S, fn)
    if not os.path.exists(p):
        continue
    for r in csv.DictReader(open(p, encoding='utf-8')):
        if not (r.get('y') and r.get('m') and r.get('d')):
            continue
        try:
            dt = date(int(r['y']), int(r['m']), int(r['d']))
        except Exception:
            continue
        if date(2026, 7, 1) <= dt <= date(2026, 8, 11):
            rows.append(r)

agg = defaultdict(lambda: {'n': 0, 'axes': Counter(), 'ex': None})
for r in rows:
    t = (r.get('ptype') or '').strip()
    if not t:
        continue
    a = agg[t]; a['n'] += 1; a['axes'][r['axis']] += 1
    if not a['ex']:
        a['ex'] = r['name'][:58]

out = []
for t, a in sorted(agg.items(), key=lambda kv: -kv[1]['n']):
    axis = a['axes'].most_common(1)[0][0]
    if axis == '메인1':
        out.append({'파일표기': t, '건수': a['n'], '축': axis, '소재': '', '후가공': '',
                    '제안_품목코드': '(규격규칙)', '제안_품목명': '전사 — item_map_jeonsa.csv 참조',
                    '근거': '전사축', '확신도': '규칙', '예시파일': a['ex']})
        continue
    ov_code, ov_post, ov_note = apply_override(t)
    if ov_code is not False:
        pre, mat, tail, lit, typo = split_tokens(t)
        if ov_post:
            tail.append(ov_post)
        itm = next((r for r in ITEMS if r['item_code'] == ov_code), None) if ov_code else None
        out.append({'파일표기': t, '건수': a['n'], '축': axis, '소재': mat,
                    '후가공': '·'.join(tail),
                    '제안_품목코드': itm['item_code'] if itm else '(신규 등록 필요)',
                    '제안_품목명': itm['item_name'] if itm else '',
                    '근거': f'확정: {ov_note}', '확신도': '확정' if itm else '신규필요',
                    '예시파일': a['ex']})
        continue
    pre, mat, tail, lit, typo = split_tokens(t)
    it, why, conf = lookup(pre, mat, lit, axis)
    out.append({'파일표기': t, '건수': a['n'], '축': axis, '소재': mat,
                '후가공': '·'.join(tail) + (('·' + ('조명' if lit == 'L' else '비조명')) if lit else ''),
                '제안_품목코드': it['item_code'] if it else '',
                '제안_품목명': it['item_name'] if it else '',
                '근거': (why + '·★표기오류(평판→포맥스)') if typo else why,
                '확신도': conf, '예시파일': a['ex']})

cols = ['파일표기', '건수', '축', '소재', '후가공', '제안_품목코드', '제안_품목명', '근거', '확신도', '예시파일']
with open(os.path.join(S, 'item_map_draft.csv'), 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.DictWriter(f, fieldnames=cols); w.writeheader(); w.writerows(out)

tot = sum(a['n'] for a in agg.values())
cov, byc = Counter(), Counter()
for o in out:
    cov[o['확신도']] += o['건수']; byc[o['확신도']] += 1
print(f'제품유형 {len(out)}종 · 파일 {tot:,}건')
for k in ('확정', '높음', '보통', '규칙', '신규필요', '확인필요'):
    if byc[k]:
        print(f'  {k:<8}{byc[k]:>4}종{cov[k]:>8,}건{cov[k]/tot:>8.1%}')
print('\n── 확인필요 잔여 = 용준님 판단 ' + '─' * 40)
rest = [o for o in out if o['확신도'] == '확인필요']
for o in rest[:18]:
    print(f'  {o["건수"]:>5,}  {o["파일표기"][:28]:<30} 예: {o["예시파일"][:36]}')
print(f'  … 총 {len(rest)}종 {sum(o["건수"] for o in rest):,}건')

# ── 전사: 규격 ∪ 파일명 키워드 ──────────────────────────────
RX_SPEC = re.compile(r'(\d+(?:\.\d+)?)\s*[×xX*]\s*(\d+(?:\.\d+)?)')
spec_idx = defaultdict(list)
for r in ITEMS:
    if r.get('category') in ('전사', '태극기'):
        mo = RX_SPEC.search(r.get('specification') or '')
        if mo:
            a, b = sorted([round(float(mo.group(1))), round(float(mo.group(2)))])
            spec_idx[(a, b)].append(r)
# ★파일명이 아니라 **경로 전체**를 본다. 전사축의 품목 단서는 폴더에 있다
#   (`광고월드-어구실명제`·`주니그래픽-윈드배너`·`서림광고기획-H형`·`육군부사관학교-대대기,중대기`).
KEYS = ['가로등배너', '자이언트배너', '워킹배너', '윈드배너', '외국기배너', '태극기배너',
        '어구실명제', '만장기', '군부대기', '대대기', '중대기', '깃발', '태극기', '새마을기',
        '민방위기', '무재해기', '노인회기', '만국기', '근조기', '수기', '자수', '본염',
        'H형', 'S형', 'F형', '게양용', '정기']
jf = [r for r in rows if r['axis'] == '메인1']
by_spec = by_key = by_both = neither = 0
kw_hit = Counter()
for r in jf:
    s = None
    if r.get('w'):
        a, b = sorted([round(float(r['w'])), round(float(r['h']))])
        s = (a, b) in spec_idx
    ctx = r['rel']                      # 폴더 + 파일명
    k = next((K for K in KEYS if K in ctx), None)
    if k:
        kw_hit[k] += 1
    if s and k:
        by_both += 1
    elif s:
        by_spec += 1
    elif k:
        by_key += 1
    else:
        neither += 1
n = len(jf)
print(f'\n── 전사축 {n:,}건 — 무엇으로 품목을 정할 수 있나 ' + '─' * 18)
print(f'  규격+키워드 둘 다   {by_both:>5,} ({by_both/n:>5.1%})')
print(f'  규격만            {by_spec:>5,} ({by_spec/n:>5.1%})')
print(f'  파일명 키워드만     {by_key:>5,} ({by_key/n:>5.1%})')
print(f'  ★둘 다 없음        {neither:>5,} ({neither/n:>5.1%})')
print(f'  → 합계 결정 가능    {(by_both+by_spec+by_key)/n:>5.1%}')
print('\n  파일명 키워드 빈도:')
for k, c in kw_hit.most_common(12):
    print(f'    {c:>5,}  {k}')

jr = []
for k, c in sorted(((k, sum(1 for r in jf if r.get('w') and
                            tuple(sorted([round(float(r['w'])), round(float(r['h']))])) == k))
                    for k in spec_idx), key=lambda x: -x[1]):
    if c:
        for it in spec_idx[k]:
            jr.append({'규격_wxh': f'{k[0]}x{k[1]}', '건수': c, '제안_품목코드': it['item_code'],
                       '제안_품목명': it['item_name'], '마스터규격': it.get('specification') or ''})
with open(os.path.join(S, 'item_map_jeonsa.csv'), 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.DictWriter(f, fieldnames=['규격_wxh', '건수', '제안_품목코드', '제안_품목명', '마스터규격'])
    w.writeheader(); w.writerows(jr)
print(f'\n  전사 규격 규칙표 {len(jr)}행 → item_map_jeonsa.csv')
