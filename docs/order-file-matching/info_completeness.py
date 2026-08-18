# -*- coding: utf-8 -*-
"""질문을 바꾼다 — "정답지와 이어붙일 수 있나"가 아니라 "파일이 주문서가 될 수 있나".

왜 바꾸나:
  용준님 설명 — 지금은 **이카운트에 주문서를 먼저 쓰고** 그 접수일 폴더에 파일을 순서대로 적재한다.
  즉 파일은 주문의 **하류**다. 그런데 MES 전환 후에는 이카운트 주문이 **없다**.
  파일이 곧 주문이 되어야 한다.

  그래서 "이 파일 그룹이 이카운트 몇 번 전표인가"(레코드 링키지)는 **전환 후엔 존재하지 않는 문제**다.
  링키지가 어려운 이유(공통 키 없음·규격 중복·날짜 어긋남)는 초안 생성 능력과 **무관**하다.

  진짜 물어야 할 것: 파일만 보고 주문서 한 줄을 채울 수 있는가.

여기서 재는 것:
  ① 그룹별 정보 완비율 (날짜·거래처·규격·수량)
  ② 매칭 성공 그룹 vs 실패 그룹의 완비율 **차이**
     → 차이가 없으면 실패는 「정보 부족」이 아니라 「링키지 한계」다. 이게 핵심 판정이다.
"""
import sys, os
from collections import Counter, defaultdict
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import score_v4 as V

orders = V.load_truth()
groups, _ = V.load_groups(merge=False, extra=False)
o_spec = {k: v for k, v in orders.items() if any(l['w'] for l in v['lines'])}
g_spec = {k: v for k, v in groups.items() if any(f['w'] for f in v['files'])}

idx = defaultdict(set)
for k, o in o_spec.items():
    for l in o['lines']:
        if l['w']:
            idx[V.skey(l['w'], l['h'])].add(k)


def cand(g):
    c = Counter()
    for f in g['files']:
        if f['w']:
            for k in idx.get(V.skey(f['w'], f['h']), ()):
                if abs((o_spec[k]['dt'] - g['dt']).days) <= 7:
                    c[k] += 1
    return c


pairs = []
for gk, g in g_spec.items():
    for ok, n in cand(g).items():
        sc = V.W_SPEC * n - V.W_DATE * abs((o_spec[ok]['dt'] - g['dt']).days)
        pairs.append((sc, gk, ok))
pairs.sort(key=lambda t: -t[0])
matched, used = {}, set()
for sc, gk, ok in pairs:
    if gk not in matched and ok not in used:
        matched[gk] = ok; used.add(ok)
for sc, gk, ok in pairs:
    if gk not in matched and sc >= 3.0:
        matched[gk] = ok


def profile(keys, label):
    n = len(keys)
    if not n:
        return
    d = c = s = q = allspec = 0
    nf = 0
    for k in keys:
        g = groups[k]
        nf += len(g['files'])
        d += 1                                        # 그룹은 날짜로 만들어지므로 항상 있음
        c += 1 if g['clients'] else 0
        s += 1 if any(f['w'] for f in g['files']) else 0
        q += 1 if any(f['qty'] for f in g['files']) else 0
        allspec += 1 if all(f['w'] for f in g['files']) else 0
    print(f'  {label:<22} 그룹 {n:>5,} · 파일 {nf:>6,} · 거래처 {c/n:>6.1%} · '
          f'규격보유 {s/n:>6.1%} · 전파일 규격 {allspec/n:>6.1%} · 수량 {q/n:>6.1%}')


# 전체 그룹(규격 유무 무관)
allg = set(groups)
print(f'파일 그룹 전체 {len(allg):,} (규격 보유 {len(g_spec):,})\n')
print('── 정보 완비율 ' + '─' * 60)
profile(allg, '전체')
profile(set(matched), '정답지 매칭 성공')
profile(set(g_spec) - set(matched), '정답지 매칭 실패')
profile(allg - set(g_spec), '규격 자체가 없음')

print('\n── 매칭 실패 그룹 샘플 12 (정보가 실제로 부족한가?) ' + '─' * 10)
k = 0
for gk in g_spec:
    if gk in matched:
        continue
    g = groups[gk]
    cl = g['clients'].most_common(1)[0][0] if g['clients'] else '—'
    specs = [f"{int(f['w'])}x{int(f['h'])}" for f in g['files'] if f['w']][:3]
    print(f"  {str(gk):<34} {cl[:12]:<13} {len(g['files']):>2}파일 {'/'.join(specs)}")
    print(f"      {g['files'][0]['name'][:88]}")
    k += 1
    if k >= 12:
        break

# 파일이 주문서 한 줄이 되기 위한 최소 요건 = 규격 + 수량. 거래처는 그룹 단위면 충분.
ready = sum(1 for gk in allg
            if groups[gk]['clients'] and all(f['w'] for f in groups[gk]['files']))
partial = sum(1 for gk in allg
              if groups[gk]['clients'] and any(f['w'] for f in groups[gk]['files'])
              and not all(f['w'] for f in groups[gk]['files']))
print(f'\n── 초안 생성 가능성(정답지와 무관) ' + '─' * 25)
print(f'  전 파일 규격 + 거래처 완비   {ready:,}/{len(allg):,} = {ready/len(allg):.1%}')
print(f'  일부 파일만 규격            {partial:,} ({partial/len(allg):.1%})')
print(f'  나머지(규격 0 또는 거래처 없음) {len(allg)-ready-partial:,} '
      f'({(len(allg)-ready-partial)/len(allg):.1%})')
