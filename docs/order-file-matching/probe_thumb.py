# -*- coding: utf-8 -*-
"""썸네일을 일러스트레이터 없이 뽑을 수 있나 — EPS 내장 프리뷰 실태 조사.

카드에 그림이 붙으려면 썸네일이 필요한데, 기존 경로(CEP 패널 mes-core.jsx)는
**일러스트레이터를 띄워서** 만든다. 이미 Z: 에 쌓인 수천 건을 소급 생성하려면
그 방식은 비싸다(파일당 앱 왕복).

EPS 는 규격상 프리뷰를 품을 수 있다. 두 형식:
  ① DOS EPS 바이너리 헤더(C5 D0 D3 C6) — 오프셋 테이블에 TIFF/WMF 프리뷰 위치가 박혀 있다
  ② `%%BeginPreview:` ~ `%%EndPreview` — 16진 인코딩된 흑백 비트맵

여기서 재는 것: 실제로 몇 %가 프리뷰를 갖고 있고, 어떤 형식인가.
프리뷰가 없다면 래스터라이즈(Ghostscript/일러)가 불가피하다 — 그 판단을 위한 근거다.
"""
import csv, os, re, sys, io, struct
from collections import Counter

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
S = os.path.dirname(os.path.abspath(__file__))
ROOT = {'★UV솔벤★': r'Z:\★UV솔벤★', '★현수막-수성출력★': r'Z:\★현수막-수성출력★',
        '메인1': r'Z:\메인1\메인1\2026'}

SAMPLE = 360
# 축이 한쪽으로 쏠리면 결론이 틀어진다 — 축별로 고르게 뽑는다(첫 표본이 전사 100% 였다).
per, buckets = SAMPLE // 3, {}
for fn in ('parsed.csv', 'parsed_jeonsa.csv'):
    p = os.path.join(S, fn)
    if not os.path.exists(p):
        continue
    for r in csv.DictReader(open(p, encoding='utf-8')):
        buckets.setdefault(r['axis'], []).append(r)
rows = []
for ax, lst in buckets.items():
    step = max(1, len(lst) // per)
    rows += lst[::step][:per]

stat = Counter()
ax_stat = {}
sizes = []
by_axis = Counter()
seen = 0
for r in rows:
    if seen >= SAMPLE:
        break
    p = os.path.join(ROOT.get(r['axis'], ''), r['rel'])
    if not p.lower().endswith(('.eps', '.ai')):
        continue
    try:
        with open(p, 'rb') as f:
            head = f.read(40)
            if len(head) < 30:
                continue
            seen += 1
            by_axis[r['axis']] += 1
            if head[:4] == b'\xc5\xd0\xd3\xc6':
                # DOS EPS: 4바이트 매직 + PS오프셋/길이 + WMF + TIFF(오프셋 20, 길이 24)
                tif_off, tif_len = struct.unpack('<II', head[20:28])
                if tif_off and tif_len:
                    stat['DOS헤더 TIFF 프리뷰'] += 1; ax_stat.setdefault(r['axis'], Counter())['DOS헤더 TIFF 프리뷰'] += 1
                    sizes.append(tif_len)
                else:
                    wmf_off, wmf_len = struct.unpack('<II', head[12:20])
                    _k = 'DOS헤더 WMF 프리뷰' if wmf_len else 'DOS헤더 프리뷰 없음'; stat[_k] += 1; ax_stat.setdefault(r['axis'], Counter())[_k] += 1; ax_stat.setdefault(r['axis'], Counter())['DOS헤더 WMF 프리뷰' if wmf_len else 'DOS헤더 프리뷰 없음'] += 1
                continue
            f.seek(0)
            blob = f.read(1 << 20)
            if b'%%BeginPreview' in blob:
                stat['ASCII 프리뷰'] += 1; ax_stat.setdefault(r['axis'], Counter())['ASCII 프리뷰'] += 1
            elif blob[:2] == b'%!':
                stat['프리뷰 없음(순수 PS)'] += 1; ax_stat.setdefault(r['axis'], Counter())['프리뷰 없음(순수 PS)'] += 1
            elif blob[:4] == b'%PDF':
                stat['PDF 호환 .ai'] += 1; ax_stat.setdefault(r['axis'], Counter())['PDF 호환 .ai'] += 1
            else:
                stat['기타'] += 1; ax_stat.setdefault(r['axis'], Counter())['기타'] += 1
    except Exception:
        stat['열기 실패'] += 1; ax_stat.setdefault(r['axis'], Counter())['열기 실패'] += 1

print(f'표본 {seen}건  (축: {dict(by_axis)})\n')
for k, v in stat.most_common():
    print(f'  {v:>4}  {v/max(seen,1):>6.1%}  {k}')
print('\n축별 프리뷰 보유:')
for ax in sorted(ax_stat):
    t = sum(ax_stat[ax].values())
    hit = sum(v for k, v in ax_stat[ax].items() if '프리뷰' in k and '없음' not in k)
    print(f'  {ax:<16} {hit}/{t} = {hit/max(t,1):.0%}   {dict(ax_stat[ax])}')
if sizes:
    sizes.sort()
    print(f'\nTIFF 프리뷰 크기: 중앙 {sizes[len(sizes)//2]/1024:.0f}KB · '
          f'최소 {sizes[0]/1024:.0f}KB · 최대 {sizes[-1]/1024:.0f}KB')

