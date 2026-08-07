# -*- coding: utf-8 -*-
"""선명 2026-07 미매칭 자재·상품 → **MES 품목 후보 제안** (2026-08-07).

용도는 자동 매칭이 아니라 **사람이 확인할 후보표**다. 그래서 후보마다 **왜 골랐는지(규칙)와
얼마나 닮았는지(점수)** 를 같이 낸다 — 근거 없이 코드만 주면 검증이 불가능하다.

후보 규칙 (넓게 잡고 사람이 거른다 — 자동 적용이 아니므로 과탐이 미탐보다 낫다)
  C1 폭일치+토큰   : 규격의 폭이 코드 접미와 같고 이름 토큰이 겹침      (가장 강함)
  C2 토큰 포함     : 선명 품명의 핵심 토큰이 MES 품명/코드에 통째로 들어감
  C3 문자 유사도   : 정규화 문자열의 bigram Dice 계수 (오탈자·표기차 대응)
그리고 **소재 계열이 다르면 감점**한다 — 수성/솔벤/UV/전사는 서로 대체 불가라
같은 「현수막」이어도 붙이면 원가가 틀린다.

★ 폭 관례는 매칭기와 동일하게 본다: 150≡152 · 122≡120 (용준님 확인).

사용: python docs/dongsan-import/gen_e2_match_candidates.py <items.json> <unmatched.json>
산출: docs/analysis/2026-08-07-e2-match-candidates.tsv  (→ xlsx 는 scripts/tsv2xlsx.cjs)
"""
import json, sys, re, os, csv, warnings
warnings.filterwarnings('ignore')
sys.stdout.reconfigure(encoding='utf-8')

ITEMS_JSON, UNMATCHED_JSON = sys.argv[1], sys.argv[2]
WIDTH = re.compile(r'(\d{2,3})\s*폭')
WIDTH_ALIAS = {150: 152, 152: 150, 122: 120, 120: 122}
# 소재 계열 — 서로 대체 불가. 양쪽에서 감지되고 다르면 감점.
FAMILY = [('수성', re.compile(r'수성|AQ')), ('솔벤', re.compile(r'솔벤|SV')),
          ('UV', re.compile(r'\bUV', re.I)), ('전사', re.compile(r'전사|폰지|TR')),
          ('간판', re.compile(r'간판|SIGN|채널|갈바'))]
STOP = re.compile(r'[\s\-_()/\[\]]+')


def norm(s):
    return STOP.sub('', str(s or '')).upper()


def toks(s):
    return [t for t in re.split(r'[\s\-_()/\[\],]+', str(s or '')) if len(t) >= 2]


def bigrams(s):
    return {s[i:i + 2] for i in range(len(s) - 1)} or {s}


def dice(a, b):
    A, B = bigrams(a), bigrams(b)
    return 2 * len(A & B) / (len(A) + len(B)) if A and B else 0.0


def fam(s):
    return {n for n, rx in FAMILY if rx.search(str(s or ''))}


items = [i for i in json.load(open(ITEMS_JSON, encoding='utf-8')) if i.get('is_active')]
for i in items:
    i['_n'] = norm(i['item_name'])
    i['_c'] = str(i['item_code']).upper()
    i['_f'] = fam(i['item_name']) | fam(i['item_code']) | fam(i.get('category'))

rows = json.load(open(UNMATCHED_JSON, encoding='utf-8'))


def widths(spec):
    m = WIDTH.search(spec or '')
    if not m:
        return []
    w = int(m.group(1))
    return [w] + ([WIDTH_ALIAS[w]] if w in WIDTH_ALIAS else [])


def candidates(nm, spec):
    n, ws_, tk = norm(nm), widths(spec), toks(nm)
    sf = fam(nm) | fam(spec)
    out = []
    for it in items:
        score, why = 0.0, []
        # C1 폭 일치
        if ws_ and any(it['_c'].endswith(('-%03d' % w, '-%d' % w, 'P%d' % w)) for w in ws_):
            score += 0.35
            why.append('C1폭')
        # C2 토큰 포함
        hit = [t for t in tk if norm(t) and (norm(t) in it['_n'] or norm(t) in it['_c'])]
        if hit:
            score += min(0.35, 0.18 * len(hit))
            why.append('C2:' + '/'.join(hit[:2]))
        # C3 문자 유사도
        d = dice(n, it['_n'])
        if d > 0.25:
            score += 0.4 * d
            why.append('C3:%.2f' % d)
        if not why:
            continue
        # 소재 계열 불일치 감점 — 양쪽 다 계열이 잡힐 때만
        if sf and it['_f'] and not (sf & it['_f']):
            score -= 0.35
            why.append('★계열다름')
        if score > 0.28:
            out.append((round(score, 3), it['item_code'], it['item_name'], '+'.join(why)))
    out.sort(reverse=True)
    return out[:3]


rows.sort(key=lambda r: -r['amt'])
p = os.path.join(r'C:\Users\user\dongsan_mes', 'docs', 'analysis', '2026-08-07-e2-match-candidates.tsv')
hit = 0
with open(p, 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.writer(f, delimiter='\t')
    w.writerow(['품목명', '규격', '라인수', '수량', '공급가액', '내용(예시)',
                '후보1', '후보1명', '점수1', '근거1',
                '후보2', '후보2명', '점수2',
                '후보3', '후보3명', '점수3', '★확정(기입)'])
    for r in rows:
        c = candidates(r['nm'], r['sp'])
        if c:
            hit += 1
        cell = [(x[1], x[2], x[0], x[3]) for x in c] + [('', '', '', '')] * 3
        w.writerow([r['nm'], r['sp'], r['n'], r['qty'], r['amt'], r['ex'],
                    cell[0][0], cell[0][1], cell[0][2], cell[0][3],
                    cell[1][0], cell[1][1], cell[1][2],
                    cell[2][0], cell[2][1], cell[2][2], ''])
print('%d조합 중 후보 제시 %d (%.0f%%) · 후보 없음 %d' % (len(rows), hit, 100 * hit / len(rows), len(rows) - hit))
print('→', p)
