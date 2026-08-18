# -*- coding: utf-8 -*-
"""채점 v3 — 폴더 그룹 조인. 조인 단위를 파일에서 '주문'으로 올린다.

왜: 파일 1개와 정답지 1라인은 애초에 1:1 이 아니다.
    `(600x70-1장)` 파일 7개 = 이카운트 `7장` 1라인.
    파일 단위로 재면 매칭률이 구조적으로 낮게 나오고(45.8%), 수량도 안 맞는다(62.4%).

그룹 키:
  2축   같은 날 + 같은 접수순번  (`27-…` 은 그날 27번 주문)
        순번이 없으면 가장 안쪽 폴더명
  전사축 순번이 없다 → 같은 날 + 같은 거래처

정답지:
  (일자, No.) = 주문 1건, 그 안에 라인 N개.

매칭:
  그룹의 규격 다중집합 ↔ 주문의 규격 다중집합 겹침 + 거래처 + 날짜창.
  겹침이 가장 큰 주문을 고르고, 동률이면 거래처 일치로 가른다.
"""
import csv, re, os, sys, io
from collections import defaultdict, Counter
from datetime import date
import pandas as pd

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
SCRATCH = os.path.dirname(os.path.abspath(__file__))
TRUTH = r'C:\Users\user\dongsan_mes\품목마스터\원천주문데이터\동산_주문서현황_2607-2608.xlsx'
D0, D1 = date(2026, 7, 1), date(2026, 8, 11)
WINDOW = 7

RX_KEY = re.compile(r'^2026/(\d\d)/(\d\d)\s*-\s*(\d+)$')
RX_GSPEC = re.compile(r'\[\s*(\d+(?:\.\d+)?)\s*[*xX]\s*(\d+(?:\.\d+)?)\s*\]')
RX_NORM = re.compile(r'(주식회사|\(주\)|㈜|유한회사|주\)|\s|\.|,|-)')
norm = lambda s: RX_NORM.sub('', s or '')


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
        no = int(mo.group(3))
        label = str(r.get('품목명(규격)', '') or '')
        sp = RX_GSPEC.search(label)
        o = orders[(dt, no)]
        o['dt'] = dt
        o['client'] = str(r.get('거래처명', '') or '').strip()
        try:
            q = float(r.get('수량')) if r.get('수량') is not None else None
        except Exception:
            q = None
        o['lines'].append({
            'w': float(sp.group(1)) if sp else None,
            'h': float(sp.group(2)) if sp else None,
            'item': RX_GSPEC.sub('', label).strip(),
            'qty': q,
        })
    return orders


def load_groups():
    groups = defaultdict(lambda: {'files': [], 'dt': None, 'clients': Counter(), 'axes': set()})
    for fn in ('parsed.csv', 'parsed_jeonsa.csv'):
        p = os.path.join(SCRATCH, fn)
        if not os.path.exists(p):
            continue
        with open(p, encoding='utf-8') as f:
            for r in csv.DictReader(f):
                if not (r.get('y') and r.get('m') and r.get('d')):
                    continue
                try:
                    dt = date(int(r['y']), int(r['m']), int(r['d']))
                except Exception:
                    continue
                if not (D0 <= dt <= D1):
                    continue
                seq = r.get('seq')
                client = r.get('client') or None
                if seq:
                    key = ('S', dt, int(seq))
                elif client:
                    key = ('C', dt, norm(client))
                else:
                    leaf = (r['rel'].split('\\')[-2] if '\\' in r['rel'] else '')
                    key = ('D', dt, leaf)
                g = groups[key]
                g['dt'] = dt
                g['axes'].add(r['axis'])
                if client:
                    g['clients'][client] += 1
                g['files'].append({
                    'name': r['name'], 'axis': r['axis'],
                    'w': float(r['w']) if r.get('w') else None,
                    'h': float(r['h']) if r.get('h') else None,
                    'qty': int(r['qty']) if r.get('qty') else None,
                    'ptype': r.get('ptype') or None,
                })
    return groups


def main():
    orders = load_truth()
    groups = load_groups()
    # 출력물 주문 = 규격 있는 라인을 가진 주문
    o_spec = {k: v for k, v in orders.items() if any(l['w'] for l in v['lines'])}
    g_spec = {k: v for k, v in groups.items() if any(f['w'] for f in v['files'])}
    print(f'정답지 주문 {len(orders):,}건 (출력물 주문 {len(o_spec):,})')
    print(f'파일 그룹  {len(groups):,}개 (규격 보유 {len(g_spec):,})  '
          f'— 그룹당 평균 파일 {sum(len(v["files"]) for v in groups.values())/max(len(groups),1):.1f}개')

    # 규격 → 주문 인덱스
    idx = defaultdict(set)
    for k, o in o_spec.items():
        for l in o['lines']:
            if l['w']:
                idx[skey(l['w'], l['h'])].add(k)

    # 별칭 사전(1차: 규격 겹침 유일 그룹에서 학습)
    alias = defaultdict(Counter)

    def candidates(g):
        specs = [skey(f['w'], f['h']) for f in g['files'] if f['w']]
        cnt = Counter()
        for s in specs:
            for k in idx.get(s, ()):
                if abs((o_spec[k]['dt'] - g['dt']).days) <= WINDOW:
                    cnt[k] += 1
        return cnt

    for k, g in g_spec.items():
        cnt = candidates(g)
        if not cnt:
            continue
        top = cnt.most_common()
        if len(top) == 1 or (len(top) > 1 and top[0][1] > top[1][1]):
            if g['clients']:
                fc = g['clients'].most_common(1)[0][0]
                alias[norm(fc)][o_spec[top[0][0]]['client']] += 1
    amap = {}
    for k, ctr in alias.items():
        t, c = ctr.most_common(1)[0]
        if c >= 2:
            amap[k] = norm(t)

    def same_client(g, k):
        if not g['clients']:
            return False
        tc = norm(o_spec[k]['client'])
        for fc, _ in g['clients'].most_common(3):
            a = norm(fc)
            if a and tc and (a in tc or tc in a):
                return True
            if amap.get(a) == tc:
                return True
        return False

    # ── 그룹 → 주문 배정 ─────────────────────────────────
    matched = {}
    amb = none = 0
    for k, g in g_spec.items():
        cnt = candidates(g)
        if not cnt:
            none += 1; continue
        top = cnt.most_common()
        best = top[0][1]
        tied = [o for o, c in top if c == best]
        if len(tied) > 1:
            narrowed = [o for o in tied if same_client(g, o)]
            if len(narrowed) == 1:
                tied = narrowed
            elif len(narrowed) > 1:
                tied = narrowed
        if len(tied) == 1:
            matched[k] = tied[0]
        else:
            # 거래처로도 못 가르면 날짜가 가장 가까운 주문
            tied.sort(key=lambda o: abs((o_spec[o]['dt'] - g['dt']).days))
            if len(tied) >= 1 and abs((o_spec[tied[0]]['dt'] - g['dt']).days) <= 2:
                matched[k] = tied[0]
            else:
                amb += 1

    ng = len(g_spec)
    covered_orders = set(matched.values())
    print(f'\n[그룹 배정] 매칭 {len(matched):,}/{ng:,} = {len(matched)/ng:.1%} · '
          f'모호 {amb:,} ({amb/ng:.1%}) · 정답지 없음 {none:,} ({none/ng:.1%})')
    print(f'[주문 커버리지] 출력물 주문 {len(o_spec):,}건 중 {len(covered_orders):,}건 연결 '
          f'= {len(covered_orders)/len(o_spec):.1%}')

    # ── 매칭된 주문에서 규격·수량 채점(그룹 합산) ─────────
    # ★주문 단위로 되접어 집계한다. 한 주문에 여러 그룹이 붙을 수 있어
    #   그룹별로 세면 같은 라인을 여러 번 세게 된다(v3 초판의 5,151 이 그 오류였다).
    by_order = defaultdict(list)
    for gk, ok in matched.items():
        by_order[ok].append(gk)

    line_hit = line_tot = 0
    qty_hit = qty_tot = 0
    for ok, gks in by_order.items():
        o = o_spec[ok]
        fspec = Counter()
        for gk in gks:
            for f in g_spec[gk]['files']:
                if f['w']:
                    fspec[skey(f['w'], f['h'])] += (f['qty'] or 1)
        for l in o['lines']:
            if not l['w']:
                continue
            line_tot += 1
            s = skey(l['w'], l['h'])
            if s in fspec:
                line_hit += 1
                if l['qty'] is not None:
                    qty_tot += 1
                    if abs(fspec[s] - l['qty']) < 0.01:
                        qty_hit += 1
    print(f'\n[매칭 주문 내부] 정답지 라인 {line_tot:,} 중 규격 일치 {line_hit:,} = '
          f'{line_hit/max(line_tot,1):.1%}')
    print(f'  그 중 수량(그룹 합산)까지 일치 {qty_hit:,}/{qty_tot:,} = {qty_hit/max(qty_tot,1):.1%}')
    print(f'\n[별칭 사전] {len(amap):,}종 학습')


if __name__ == '__main__':
    main()
