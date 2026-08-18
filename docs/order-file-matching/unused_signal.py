# -*- coding: utf-8 -*-
"""아직 안 쓴 신호를 찾는다 — 76% 는 정보 부재가 아니라 **식별자 부재** 때문이다.

진단 결과: 못 붙은 583 라인 중 파일이 진짜 없는 건 121(5.1%) 뿐이었다.
나머지는 파일이 있는데 **어느 파일이 어느 전표인지 가를 근거가 없어** 못 붙었다.
흔한 규격(60x180 등)은 같은 날 여러 주문에 반복되니 규격+날짜만으론 갈리지 않는다.

그런데 아직 안 쓴 열이 있다: 이카운트 주문서현황의 **`내용`(현장명)**.
파일명에도 건명이 들어 있다(`…연안애드마트-농협공판장(506x92-1장)…`).
이 둘이 실제로 겹치는지 재면, 조인 키를 하나 더 얻을 수 있는지 알 수 있다.
"""
import csv, io, os, re, sys
from collections import Counter, defaultdict
from datetime import date
import pandas as pd

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
S = os.path.dirname(os.path.abspath(__file__))
TRUTH = r'C:\Users\user\dongsan_mes\품목마스터\원천주문데이터\동산_주문서현황_2607-2608.xlsx'
RX_KEY = re.compile(r'^2026/(\d\d)/(\d\d)\s*-\s*(\d+)$')
D0, D1 = date(2026, 7, 1), date(2026, 8, 11)

df = pd.read_excel(TRUTH, header=1)
df.columns = [str(c).strip() for c in df.columns]
print('── 주문서현황 컬럼 전량 ' + '─' * 44)
print('  ' + ' · '.join(str(c) for c in df.columns))

kc = df.columns[0]
# `내용` 계열 열 찾기
cand = [c for c in df.columns if any(k in str(c) for k in ('내용', '적요', '비고', '현장', '메모', 'E-MAIL', '담당'))]
print(f'\n  후보 열: {cand}')

filled = Counter()
sample = defaultdict(list)
for _, r in df.iterrows():
    if not RX_KEY.match(str(r[kc]).strip()):
        continue
    for c in cand:
        v = str(r.get(c, '') or '').strip()
        if v and v.lower() != 'nan':
            filled[c] += 1
            if len(sample[c]) < 6:
                sample[c].append(v[:34])
tot = sum(1 for _, r in df.iterrows() if RX_KEY.match(str(r[kc]).strip()))
print(f'\n── 채움률 (정답지 라인 {tot:,}) ' + '─' * 36)
for c in cand:
    print(f'  {str(c):<16} {filled[c]:>6,}  {filled[c]/max(tot,1):>6.1%}')
    for s in sample[c][:3]:
        print(f'        예: {s}')
