# -*- coding: utf-8 -*-
"""채점 v4 — 그룹 병합 + 전역 1:1 배정.  v3(score_group.py) 의 후속.

v3 에서 드러난 병목:
  주문 커버리지가 58.8% 에서 안 오른다. 원인을 파보니 **축 누락이 아니었다**(12%).
  88% 는 "같은 날 그 규격 파일이 분명히 있는데 못 붙은" 건이었다.
  v3 은 그룹마다 **독립적으로** 최고 후보를 골라서, 흔한 규격(600x70 현수막 등)을
  가진 그룹들이 전부 같은 주문 하나로 쏠린다 — 그룹 1,794개가 주문 768개에 몰렸다(2.1:1).

v4 가 바꾸는 것:
  ① 그룹 병합 — 같은 날·같은 거래처면 순번 그룹과 거래처/폴더 그룹을 합친다.
     한 주문의 파일이 축마다 흩어져 키가 갈리는 게 과분할의 실체다.
  ② 전역 배정 — 모든 (그룹, 주문) 쌍을 점수화해 **점수 내림차순 1:1** 로 먼저 채운다.
     쏠림이 사라지고 커버리지가 그룹 수만큼 퍼진다.
  ③ 잔여 배정 — 1:1 에서 남은 그룹은 임계 이상일 때만 이미 쓰인 주문에 붙인다
     (한 주문이 여러 날 나눠 출력되는 실제 사례가 있다).
  ④ 축 확대 — ☆간판(CNC·채널)·★시트 CUT★ 합류(parsed_extra.csv).

점수 = 규격 겹침×3 + 거래처×2 + 제품유형×1 − 날짜차×0.4
  규격이 주(主)앵커인 건 v1~v3 과 같다. 숫자라 표기가 안 흔들린다.
"""
import csv, re, os, sys, io, argparse
from collections import defaultdict, Counter
from datetime import date
import pandas as pd

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
S = os.path.dirname(os.path.abspath(__file__))
TRUTH = r'C:\Users\user\dongsan_mes\품목마스터\원천주문데이터\동산_주문서현황_2607-2608.xlsx'
D0, D1 = date(2026, 7, 1), date(2026, 8, 11)
WINDOW = 7

RX_KEY = re.compile(r'^2026/(\d\d)/(\d\d)\s*-\s*(\d+)$')
RX_GSPEC = re.compile(r'\[\s*(\d+(?:\.\d+)?)\s*[*xX]\s*(\d+(?:\.\d+)?)\s*\]')
RX_NORM = re.compile(r'(주식회사|\(주\)|㈜|유한회사|주\)|\s|\.|,|-)')
norm = lambda s: RX_NORM.sub('', s or '')
tnorm = lambda s: re.sub(r'[\s\-+()]', '', (s or '').lower())

W_SPEC, W_CLIENT, W_TYPE, W_DATE = 3.0, 2.0, 1.0, 0.4
# 날짜창은 **비대칭**이다. 폴더는 접수일이고 이카운트 주문일자는 그보다 앞서는 쪽으로 흐른다
# (실측 −쪽 19.2% vs +쪽 5.7%). 대칭창은 있지도 않은 미래 주문을 후보로 끌어들인다.
WIN_LO, WIN_HI = -7, 7
LEFTOVER_MIN = 3.0          # 잔여 배정 임계 — 규격 1개는 겹쳐야 한다


def skey(w, h):
    a, b = sorted([round(w), round(h)])
    return (a, b)


def load_truth():
    df = pd.read_excel(TRUTH, header=1)
    df.columns = [str(c).strip() for c in df.columns]
    kc = df.columns[0]
    orders = defaultdict(lambda: {'lines': [], 'client': '', 'dt': None})
    for _, r in df.iterrows():
        mo = RX_KEY.match(str(r[kc]).strip())
        if not mo:
            continue
        dt = date(2026, int(mo.group(1)), int(mo.group(2)))
        label = str(r.get('품목명(규격)', '') or '')
        sp = RX_GSPEC.search(label)
        o = orders[(dt, int(mo.group(3)))]
        o['dt'] = dt
        o['client'] = str(r.get('거래처명', '') or '').strip()
        try:
            q = float(r.get('수량')) if r.get('수량') is not None else None
        except Exception:
            q = None
        o['lines'].append({'w': float(sp.group(1)) if sp else None,
                           'h': float(sp.group(2)) if sp else None,
                           'item': RX_GSPEC.sub('', label).strip(), 'qty': q})
    return orders


def load_groups(merge=True, extra=True):
    src = ['parsed.csv', 'parsed_jeonsa.csv'] + (['parsed_extra.csv'] if extra else [])
    groups = defaultdict(lambda: {'files': [], 'dt': None, 'clients': Counter(), 'axes': set()})
    for fn in src:
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
            seq, client = r.get('seq'), (r.get('client') or None)
            if seq:
                key = ('S', dt, int(seq))
            elif client:
                key = ('C', dt, norm(client))
            else:
                key = ('D', dt, r['rel'].split('\\')[-2] if '\\' in r['rel'] else '')
            g = groups[key]
            g['dt'] = dt
            g['axes'].add(r['axis'])
            if client:
                g['clients'][client] += 1
            g['files'].append({'name': r['name'], 'axis': r['axis'],
                               'w': float(r['w']) if r.get('w') else None,
                               'h': float(r['h']) if r.get('h') else None,
                               'qty': int(r['qty']) if r.get('qty') else None,
                               'ptype': r.get('ptype') or None})
    if not merge:
        return dict(groups), 0

    # ── ① 그룹 병합 ─────────────────────────────────────
    # 같은 날 같은 거래처인데 순번 유무로 키가 갈린 것들을 합친다.
    # 순번 그룹(S)을 앵커로 삼는다 — 순번이 곧 그날의 접수 건이기 때문이다.
    anchor = {}                                   # (dt, norm(client)) → S키
    for k, g in groups.items():
        if k[0] == 'S' and g['clients']:
            c = norm(g['clients'].most_common(1)[0][0])
            if c:
                anchor.setdefault((k[1], c), k)
    merged = 0
    for k in list(groups):
        if k[0] == 'S':
            continue
        g = groups[k]
        c = norm(g['clients'].most_common(1)[0][0]) if g['clients'] else None
        if not c:
            continue
        a = anchor.get((k[1], c))
        if a and a in groups:
            ga = groups[a]
            ga['files'] += g['files']
            ga['clients'] += g['clients']
            ga['axes'] |= g['axes']
            del groups[k]
            merged += 1
    return dict(groups), merged


def main():
    global WINDOW, WIN_LO, WIN_HI
    ap = argparse.ArgumentParser()
    ap.add_argument('--no-merge', action='store_true')
    ap.add_argument('--no-extra', action='store_true')
    ap.add_argument('--no-global', action='store_true')
    ap.add_argument('--min-a', type=float, default=0.0,
                    help='1:1 배정 최소 점수 — 억지 배정을 미배정으로 되돌린다')
    ap.add_argument('--leftover-min', type=float, default=LEFTOVER_MIN)
    ap.add_argument('--window', type=int, default=WINDOW,
                    help='날짜 허용창(일). 용준님: 폴더 날짜 = 접수일 = 정답지 주문일자 → 0 이 맞을 수 있다')
    ap.add_argument('--win-lo', type=int, default=None)
    ap.add_argument('--win-hi', type=int, default=None)
    a = ap.parse_args()
    WINDOW = a.window
    WIN_LO = a.win_lo if a.win_lo is not None else -WINDOW
    WIN_HI = a.win_hi if a.win_hi is not None else WINDOW

    orders = load_truth()
    groups, merged = load_groups(merge=not a.no_merge, extra=not a.no_extra)
    o_spec = {k: v for k, v in orders.items() if any(l['w'] for l in v['lines'])}
    g_spec = {k: v for k, v in groups.items() if any(f['w'] for f in v['files'])}
    print(f'정답지 주문 {len(orders):,} (출력물 {len(o_spec):,}) · '
          f'파일 그룹 {len(groups):,} (규격보유 {len(g_spec):,}) · 병합 {merged:,}')

    idx = defaultdict(set)
    for k, o in o_spec.items():
        for l in o['lines']:
            if l['w']:
                idx[skey(l['w'], l['h'])].add(k)

    def cand_specs(g):
        c = Counter()
        for f in g['files']:
            if f['w']:
                for k in idx.get(skey(f['w'], f['h']), ()):
                    if WIN_LO <= (o_spec[k]['dt'] - g['dt']).days <= WIN_HI:
                        c[k] += 1
        return c

    # 별칭 학습 — 규격만으로 후보가 유일한 그룹에서 역추출
    alias = defaultdict(Counter)
    for k, g in g_spec.items():
        c = cand_specs(g)
        if not c or not g['clients']:
            continue
        top = c.most_common()
        if len(top) == 1 or top[0][1] > top[1][1]:
            alias[norm(g['clients'].most_common(1)[0][0])][o_spec[top[0][0]]['client']] += 1
    amap = {k: norm(v.most_common(1)[0][0]) for k, v in alias.items()
            if v.most_common(1)[0][1] >= 2}

    def client_hit(g, ok):
        if not g['clients']:
            return False
        tc = norm(o_spec[ok]['client'])
        for fc, _ in g['clients'].most_common(3):
            fcn = norm(fc)
            if fcn and tc and (fcn in tc or tc in fcn):
                return True
            if amap.get(fcn) == tc:
                return True
        return False

    def type_hit(g, ok):
        fts = {tnorm(f['ptype']) for f in g['files'] if f['ptype'] and f['ptype'] != '전사'}
        if not fts:
            return False
        for l in o_spec[ok]['lines']:
            t = tnorm(l['item'])
            if t and any(ft and (ft in t or t in ft) for ft in fts):
                return True
        return False

    # ── ② 전역 점수화 ───────────────────────────────────
    pairs = []
    for gk, g in g_spec.items():
        c = cand_specs(g)
        for ok, n in c.items():
            sc = (W_SPEC * n + W_CLIENT * client_hit(g, ok) + W_TYPE * type_hit(g, ok)
                  - W_DATE * abs((o_spec[ok]['dt'] - g['dt']).days))
            pairs.append((sc, gk, ok, n))
    pairs.sort(key=lambda t: -t[0])

    matched, used_o = {}, set()
    if a.no_global:
        for gk, g in g_spec.items():
            c = cand_specs(g)
            if not c:
                continue
            best = max((p for p in pairs if p[1] == gk), key=lambda t: t[0], default=None)
            if best:
                matched[gk] = best[2]
    else:
        for sc, gk, ok, n in pairs:                    # A: 1:1
            if gk in matched or ok in used_o or sc < a.min_a:
                continue
            matched[gk] = ok; used_o.add(ok)
        for sc, gk, ok, n in pairs:                    # B: 잔여
            if gk in matched or sc < a.leftover_min:
                continue
            matched[gk] = ok

    ng = len(g_spec)
    no_cand = sum(1 for gk in g_spec if gk not in {p[1] for p in pairs})
    amb = ng - len(matched) - no_cand
    cov = set(matched.values())
    print(f'\n[그룹 배정] {len(matched):,}/{ng:,} = {len(matched)/ng:.1%} · '
          f'모호/임계미달 {max(amb,0):,} ({max(amb,0)/ng:.1%}) · 정답지 없음 {no_cand:,} ({no_cand/ng:.1%})')
    print(f'[주문 커버리지] {len(cov):,}/{len(o_spec):,} = {len(cov)/len(o_spec):.1%}')

    # ── 매칭 주문 내부 정확도 (주문으로 되접어 집계) ────────
    by_order = defaultdict(list)
    for gk, ok in matched.items():
        by_order[ok].append(gk)
    lh = lt = qh = qt = 0
    full = 0
    for ok, gks in by_order.items():
        fs = Counter()
        for gk in gks:
            for f in g_spec[gk]['files']:
                if f['w']:
                    fs[skey(f['w'], f['h'])] += (f['qty'] or 1)
        oh = ot = 0
        for l in o_spec[ok]['lines']:
            if not l['w']:
                continue
            lt += 1; ot += 1
            if skey(l['w'], l['h']) in fs:
                lh += 1; oh += 1
                if l['qty'] is not None:
                    qt += 1
                    if abs(fs[skey(l['w'], l['h'])] - l['qty']) < 0.01:
                        qh += 1
        if ot and oh == ot:
            full += 1
    print(f'[매칭 주문 내부] 규격 일치 {lh:,}/{lt:,} = {lh/max(lt,1):.1%} · '
          f'수량 {qh:,}/{qt:,} = {qh/max(qt,1):.1%}')

    # ── 정밀도 대리지표 ─────────────────────────────────
    # 오배정은 "규격이 하나도 안 맞는 주문"으로 드러난다. 전량 일치 비율이 초안 신뢰도다.
    print(f'[전량 일치 주문] {full:,}/{len(cov):,} = {full/max(len(cov),1):.1%}  ← 초안 그대로 쓸 수 있는 건')
    print(f'[유효 커버리지] {full:,}/{len(o_spec):,} = {full/len(o_spec):.1%}  ← 전량 일치만 세면')

    # 거래처 일치 — 점수에도 쓰이지만 규격과 독립이라 오배정 탐지에 쓸 만하다.
    # 전량 일치(=옳은 배정일 가능성 높음) 대 부분 일치로 갈라 보면
    # 거래처 불일치가 오배정 신호인지 아니면 그냥 표기 문제인지 가려진다.
    full_ok = set()
    for ok, gks in by_order.items():
        fs = set()
        for gk in gks:
            fs |= {skey(f['w'], f['h']) for f in g_spec[gk]['files'] if f['w']}
        ls = [skey(l['w'], l['h']) for l in o_spec[ok]['lines'] if l['w']]
        if ls and all(s in fs for s in ls):
            full_ok.add(ok)
    ch = ct = fh = ft = 0
    for gk, ok in matched.items():
        if not g_spec[gk]['clients']:
            continue
        hit = client_hit(g_spec[gk], ok)
        ct += 1; ch += hit
        if ok in full_ok:
            ft += 1; fh += hit
    print(f'[배정건 거래처 일치] 전체 {ch:,}/{ct:,} = {ch/max(ct,1):.1%} · '
          f'전량일치분 {fh:,}/{ft:,} = {fh/max(ft,1):.1%} · '
          f'부분일치분 {ch-fh:,}/{ct-ft:,} = {(ch-fh)/max(ct-ft,1):.1%}')
    print(f'[그룹:주문] {len(matched)/max(len(cov),1):.2f}:1 · 별칭 {len(amap):,}종')

    # 폴더 날짜 ↔ 정답지 주문일자 차이 분포.
    # 용준님 설명이 맞다면(폴더=접수일=주문일자) 0일에 몰려야 한다. 안 몰리면 전제가 틀린 것이다.
    dd = Counter()
    for gk, ok in matched.items():
        dd[(o_spec[ok]['dt'] - g_spec[gk]['dt']).days] += 1
    tot = sum(dd.values())
    print('\n[날짜차 분포 — 정답지 − 폴더]')
    for k in sorted(dd):
        if abs(k) <= 4 or dd[k] > tot * 0.01:
            print(f'  {k:+d}일  {dd[k]:>5,}  ({dd[k]/tot:.1%})')
    print(f'  0일 비중 {dd[0]/tot:.1%} · |차|≤1 {sum(v for k,v in dd.items() if abs(k)<=1)/tot:.1%}')


if __name__ == '__main__':
    main()
