# -*- coding: utf-8 -*-
"""채점 v6 — **이카운트 우선(주문→파일)** 방향. 용준님 제안 검증.

지금까지(v1~v5)는 **파일 우선**이었다: 파일을 그룹으로 묶고 → 규격으로 주문 후보를 찾고 → 배정.
그래서 1차 인덱스가 **규격**이었고, 흔한 규격(60x180·135x90)은 후보가 평균 38개로 갈리지 않았다.

용준님 제안: 파일에서 거래처가 읽히면 **그 날짜의 그 거래처 주문서를 이카운트에서 확인**하라.
즉 1차 키를 **거래처+날짜**로 바꾸고 규격은 **확인용**으로 쓴다.

왜 이게 나을 수 있나 — 선택도가 다르다:
    규격 `60x180`  → 그 규격을 쓴 주문 260건
    거래처 `공감디자인` → 그 날짜에 보통 1~2건
거래처가 훨씬 좁힌다. 파일의 거래처 판독률은 **100%(오늘 80/80)** 수준이라 1차 키로 쓸 만하다.

⚠️ 방향만 바꾼다고 이론적 최적해가 달라지진 않는다. 달라지는 건 **어떤 키로 먼저 좁히느냐**이고,
   그게 탐욕적 배정의 결과를 바꾼다. 그래서 숫자로 확인한다.

사용: python score_v6.py            (이카운트 우선)
      python score_v6.py --file-first (v4 동등 기준선)
"""
import argparse, csv, io, os, re, sys
from collections import Counter, defaultdict
from datetime import date
import pandas as pd

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
S = os.path.dirname(os.path.abspath(__file__))
TRUTH = r'C:\Users\user\dongsan_mes\품목마스터\원천주문데이터\동산_주문서현황_2607-2608.xlsx'
RX_KEY = re.compile(r'^2026/(\d\d)/(\d\d)\s*-\s*(\d+)$')
RX_GSPEC = re.compile(r'\[\s*(\d+(?:\.\d+)?)\s*[*xX]\s*(\d+(?:\.\d+)?)\s*\]')
RX_NORM = re.compile(r'(주식회사|\(주\)|㈜|유한회사|주\)|\s|\.|,|-)')
norm = lambda s: RX_NORM.sub('', str(s or ''))
D0, D1 = date(2026, 7, 1), date(2026, 8, 11)
skey = lambda w, h: tuple(sorted([round(float(w)), round(float(h))]))


def load():
    orders = defaultdict(lambda: {'lines': [], 'client': '', 'dt': None})
    df = pd.read_excel(TRUTH, header=1)
    df.columns = [str(c).strip() for c in df.columns]
    kc = df.columns[0]
    for _, r in df.iterrows():
        mo = RX_KEY.match(str(r[kc]).strip())
        if not mo:
            continue
        dt = date(2026, int(mo.group(1)), int(mo.group(2)))
        if not (D0 <= dt <= D1):
            continue
        o = orders[(dt, int(mo.group(3)))]; o['dt'] = dt
        o['client'] = str(r.get('거래처명', '') or '').strip()
        sp = RX_GSPEC.search(str(r.get('품목명(규격)', '') or ''))
        o['lines'].append({'w': float(sp.group(1)) if sp else None,
                           'h': float(sp.group(2)) if sp else None})
    groups = defaultdict(lambda: {'files': [], 'dt': None, 'clients': Counter()})
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
            if not (D0 <= dt <= D1):
                continue
            seq, cl = r.get('seq'), (r.get('client') or None)
            key = ('S', dt, int(seq)) if seq else (('C', dt, norm(cl)) if cl
                   else ('D', dt, r['rel'].split('\\')[-2] if '\\' in r['rel'] else ''))
            g = groups[key]; g['dt'] = dt
            if cl:
                g['clients'][cl] += 1
            g['files'].append({'w': float(r['w']) if r.get('w') else None,
                               'h': float(r['h']) if r.get('h') else None})
    return orders, groups


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--file-first', action='store_true')
    ap.add_argument('--strict', action='store_true',
                    help='거래처 **와** 규격을 둘 다 요구(교집합). 거래처만으론 지점이 안 갈린다.')
    ap.add_argument('--window', type=int, default=7)
    a = ap.parse_args()
    orders, groups = load()
    o_spec = {k: v for k, v in orders.items() if any(l['w'] for l in v['lines'])}
    g_spec = {k: v for k, v in groups.items() if any(f['w'] for f in v['files'])}

    spec_idx = defaultdict(set)
    for k, o in o_spec.items():
        for l in o['lines']:
            if l['w']:
                spec_idx[skey(l['w'], l['h'])].add(k)
    # ★거래처 인덱스 — 정규화 이름의 부분일치까지 담는다(파일은 약칭, 이카운트는 정식명)
    cli_idx = defaultdict(set)
    for k, o in o_spec.items():
        c = norm(o['client'])
        if c:
            cli_idx[c].add(k)

    def by_client(g):
        """파일 거래처로 주문 후보를 찾는다. 부분일치 포함."""
        out = set()
        for fc, _ in g['clients'].most_common(3):
            f = norm(fc)
            if not f or len(f) < 2:
                continue
            for c, ks in cli_idx.items():
                if f in c or c in f:
                    out |= ks
        return out

    pairs = []
    for gk, g in g_spec.items():
        specs = [skey(f['w'], f['h']) for f in g['files'] if f['w']]
        if a.file_first:
            cand = set()
            for s in specs:
                cand |= spec_idx.get(s, set())
        else:
            # ── 이카운트 우선 ── 거래처+날짜로 먼저 좁히고, 규격으로 확인
            cand = by_client(g)
            if a.strict and cand:
                # ★거래처만으론 지점이 안 갈린다(공감디자인 대전·부안·서산).
                #   규격을 **요구 조건**으로 걸어 교집합만 남긴다.
                bs = set()
                for s in specs:
                    bs |= spec_idx.get(s, set())
                inter = cand & bs
                if inter:
                    cand = inter
            if not cand:                      # 거래처를 못 읽으면 규격으로 폴백
                for s in specs:
                    cand |= spec_idx.get(s, set())
        for ok in cand:
            d = abs((o_spec[ok]['dt'] - g['dt']).days)
            if d > a.window:
                continue
            n = sum(1 for s in specs if ok in spec_idx.get(s, ()))
            cl = 1 if (not a.file_first and ok in by_client(g)) else 0
            # 이카운트 우선에서는 거래처가 1차 키라 가중치를 높인다
            sc = (3.0 * n + (5.0 if cl else 0.0) - 0.4 * d) if not a.file_first \
                else (3.0 * n - 0.4 * d)
            if sc > 0:
                pairs.append((sc, gk, ok))
    pairs.sort(key=lambda t: -t[0])
    matched, used = {}, set()
    for sc, gk, ok in pairs:
        if gk not in matched and ok not in used:
            matched[gk] = ok; used.add(ok)
    for sc, gk, ok in pairs:
        if gk not in matched and sc >= 3.0:
            matched[gk] = ok

    by_order = defaultdict(list)
    for gk, ok in matched.items():
        by_order[ok].append(gk)
    lh = lt = full = 0
    for ok, gks in by_order.items():
        fs = Counter()
        for gk in gks:
            for f in g_spec[gk]['files']:
                if f['w']:
                    fs[skey(f['w'], f['h'])] += 1
        oh = ot = 0
        for l in o_spec[ok]['lines']:
            if not l['w']:
                continue
            lt += 1; ot += 1
            if fs.get(skey(l['w'], l['h'])):
                lh += 1; oh += 1
        if ot and oh == ot:
            full += 1
    cov = len(by_order)
    print(f'{"[파일 우선 = v4 기준선]" if a.file_first else "[★이카운트 우선 (거래처+날짜 1차 키)]"}')
    print(f'  주문 커버리지    {cov:,}/{len(o_spec):,} = {cov/len(o_spec):.1%}')
    print(f'  라인 규격 일치   {lh:,}/{lt:,} = {lh/max(lt,1):.1%}')
    print(f'  전량 일치 주문   {full:,}/{cov:,} = {full/max(cov,1):.1%}')
    print(f'  ★유효 커버리지   {full:,}/{len(o_spec):,} = {full/len(o_spec):.1%}')


if __name__ == '__main__':
    main()
