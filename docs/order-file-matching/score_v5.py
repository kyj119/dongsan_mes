# -*- coding: utf-8 -*-
"""채점 v5 — `내용`(현장명)을 조인 신호로 추가. v4 대비 실제로 오르는지 검증한다.

배경: v4 에서 「링키지 76% 포화」라고 결론냈는데, 실패 라인을 직접 뜯어보니
      파일이 진짜 없는 건 5.1% 뿐이었다. 나머지는 파일이 있는데 **어느 전표 것인지 못 가른** 것.
      흔한 규격(60x180)은 같은 날 여러 주문에 반복되니 규격+날짜+거래처로는 안 갈린다.

새 신호: 주문서현황 `내용` 열(현장명·행사명, 채움률 79.7%)이 파일명/폴더명에 그대로 들어 있다.
        `내용=0시노래방` ↔ `0시노래방01(120x230-1장).eps`
        지금까지 한 번도 안 썼다.

⚠️ 「모호를 갈라준다」는 것만으로는 부족하다 — 자신 있게 **틀린** 답을 낼 수도 있다.
   그래서 유일 확정 비율이 아니라 **전량 일치 주문 / 유효 커버리지**로 판정한다.

사용: python score_v5.py [--no-content]   (--no-content 가 v4 동등 기준선)
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
sq = lambda s: re.sub(r'[\s()\[\]·,./_-]', '', str(s or ''))
D0, D1, WINDOW = date(2026, 7, 1), date(2026, 8, 11), 7
W_SPEC, W_CLIENT, W_CONTENT, W_DATE = 3.0, 2.0, 4.0, 0.4
skey = lambda w, h: tuple(sorted([round(float(w)), round(float(h))]))


def load():
    orders = defaultdict(lambda: {'lines': [], 'client': '', 'dt': None, 'contents': set()})
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
        o = orders[(dt, int(mo.group(3)))]
        o['dt'] = dt
        o['client'] = str(r.get('거래처명', '') or '').strip()
        c = str(r.get('내용', '') or '').strip()
        # ★2글자 이하는 키로 안 쓴다 — `봉`·`기` 같은 조각이 아무 파일명에나 걸린다
        if c and c.lower() != 'nan' and len(sq(c)) >= 3:
            o['contents'].add(sq(c))
        sp = RX_GSPEC.search(str(r.get('품목명(규격)', '') or ''))
        try:
            q = float(r.get('수량'))
        except Exception:
            q = None
        o['lines'].append({'w': float(sp.group(1)) if sp else None,
                           'h': float(sp.group(2)) if sp else None, 'qty': q})

    groups = defaultdict(lambda: {'files': [], 'dt': None, 'clients': Counter(), 'text': []})
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
            g = groups[key]; g['dt'] = dt; g['text'].append(r['rel'])
            if cl:
                g['clients'][cl] += 1
            g['files'].append({'w': float(r['w']) if r.get('w') else None,
                               'h': float(r['h']) if r.get('h') else None,
                               'qty': int(r['qty']) if r.get('qty') else None})
    return orders, groups


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--no-content', action='store_true')
    a = ap.parse_args()
    orders, groups = load()
    o_spec = {k: v for k, v in orders.items() if any(l['w'] for l in v['lines'])}
    g_spec = {k: v for k, v in groups.items() if any(f['w'] for f in v['files'])}
    gtext = {k: sq(' '.join(v['text'])) for k, v in g_spec.items()}

    idx = defaultdict(set)
    for k, o in o_spec.items():
        for l in o['lines']:
            if l['w']:
                idx[skey(l['w'], l['h'])].add(k)

    def client_hit(g, ok):
        tc = norm(o_spec[ok]['client'])
        for fc, _ in g['clients'].most_common(3):
            f = norm(fc)
            if f and tc and (f in tc or tc in f):
                return True
        return False

    def content_hit(gk, ok):
        t = gtext[gk]
        return any(c in t for c in o_spec[ok]['contents'])

    pairs = []
    for gk, g in g_spec.items():
        cnt = Counter()
        for f in g['files']:
            if f['w']:
                for ok in idx.get(skey(f['w'], f['h']), ()):
                    if abs((o_spec[ok]['dt'] - g['dt']).days) <= WINDOW:
                        cnt[ok] += 1
        for ok, n in cnt.items():
            sc = (W_SPEC * n + W_CLIENT * client_hit(g, ok)
                  - W_DATE * abs((o_spec[ok]['dt'] - g['dt']).days))
            if not a.no_content and content_hit(gk, ok):
                sc += W_CONTENT
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
    print(f'{"[v5 내용 사용]" if not a.no_content else "[v4 동등 기준선]"}')
    print(f'  주문 커버리지    {cov:,}/{len(o_spec):,} = {cov/len(o_spec):.1%}')
    print(f'  라인 규격 일치   {lh:,}/{lt:,} = {lh/max(lt,1):.1%}')
    print(f'  전량 일치 주문   {full:,}/{cov:,} = {full/max(cov,1):.1%}')
    print(f'  ★유효 커버리지   {full:,}/{len(o_spec):,} = {full/len(o_spec):.1%}')


if __name__ == '__main__':
    main()
