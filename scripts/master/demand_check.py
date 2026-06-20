# -*- coding: utf-8 -*-
# 주문 수요 기반 "필요없는 품목" 점검 — 통합본 표준품목 × 실주문 빈도/매출.
# 매칭: 통합본 '변종 예시'(=실 ECOUNT 품목명) ↔ 주문 품목명(규격제거).
import sys, os, re, openpyxl
from collections import Counter, defaultdict
sys.stdout.reconfigure(encoding='utf-8')

UNIFIED="품목마스터/설계/동산_품목표준화_통합본.xlsx"
ORDERS=['동산1.1~3.3.xlsx','동산3.3~4.15.xlsx','동산4.15~6.12.xlsx','선명(2)1.1~6.13.xlsx']

def norm(n):
    n=re.sub(r'\s*\[[^\]]*\]','',str(n))   # [규격] 제거
    n=re.sub(r'\s*<[^>]*>','',n)
    return re.sub(r'\s+',' ',n).strip()
def num(v):
    if v is None: return 0.0
    if isinstance(v,(int,float)): return float(v)
    try: return float(str(v).replace(',','').strip())
    except: return 0.0

# 1. 주문 집계 (중복제거 후 고유명별 횟수·매출)
o_cnt=Counter(); o_rev=Counter()
for f in ORDERS:
    wb=openpyxl.load_workbook('품목마스터/원천주문데이터/'+f, read_only=True, data_only=True)
    ws=wb['주문서현황내역']
    for i,row in enumerate(ws.iter_rows(values_only=True)):
        if i<2 or row[3] is None: continue
        nm=norm(row[3])
        if not nm: continue
        o_cnt[nm]+=1; o_rev[nm]+=num(row[8])
    wb.close()
tot_lines=sum(o_cnt.values()); tot_rev=sum(o_rev.values())

# 2. 통합본: 변종예시 → 표준품목 매핑 + 메타
wb=openpyxl.load_workbook(UNIFIED, read_only=True, data_only=True)
ws=wb['1.표준품목마스터']; rows=list(ws.iter_rows(values_only=True))
H=[str(c).strip() if c else '' for c in rows[0]]; I={h:i for i,h in enumerate(H)}
def g(r,n):
    i=I.get(n); return (str(r[i]).strip() if i is not None and i<len(r) and r[i] is not None else '')
data=[r for r in rows[1:] if any(c is not None for c in r)]
wb.close()
ex2std={}; meta={}
INTAN={'기타, 할인','용차,퀵','설치비','(선명:영업부)'}
for r in data:
    std=g(r,'표준 품목명'); grp=g(r,'계층그룹(분류)'); role=g(r,'역할'); jp=g(r,'자재/제품')
    is_mat = ('자재' in jp) or ('자재' in role)
    meta[std]={'grp':grp,'mat':is_mat,'intan':grp in INTAN}
    for e in g(r,'변종 예시').split(','):
        e=norm(e)
        if e: ex2std.setdefault(e, std)
    ex2std.setdefault(norm(std), std)

# 3. 귀속 (정확매칭 → 표준명 부분매칭 길이순)
std_names=sorted(meta.keys(), key=len, reverse=True)
std_cnt=Counter(); std_rev=Counter(); matched=0
unmatched=Counter(); unmatched_rev=Counter()
for nm,c in o_cnt.items():
    rev=o_rev[nm]
    s=ex2std.get(nm)
    if not s:
        for cand in std_names:
            if len(cand)>=2 and (nm==cand or nm.startswith(cand+' ') or nm.startswith(cand+'(')):
                s=cand; break
    if s:
        std_cnt[s]+=c; std_rev[s]+=rev; matched+=c
    else:
        unmatched[nm]+=c; unmatched_rev[nm]+=rev

print(f'주문 총라인 {tot_lines} / 고유명 {len(o_cnt)} / 매칭 {matched} ({100*matched/tot_lines:.0f}%) / 미매칭고유 {len(unmatched)}')
n_mat=sum(1 for m in meta.values() if m['mat']); n_intan=sum(1 for m in meta.values() if m['intan'])
print(f'통합본 표준품목 {len(meta)} (자재 {n_mat} / 무형 {n_intan})')
print()

# 4. 판매품(비자재·비무형) 분류
sell=[s for s,m in meta.items() if not m['mat'] and not m['intan']]
dead=[s for s in sell if std_cnt[s]==0]
low =[s for s in sell if 1<=std_cnt[s]<=2]
print(f'### 판매품 {len(sell)}개 중:')
print(f'  주문 0회(죽은품목 후보) {len(dead)} / 1~2회(ad-hoc 후보) {len(low)} / 3회+ {len(sell)-len(dead)-len(low)}')
print(f'  0회 샘플:', ', '.join(dead[:25]))
print()
print(f'  1~2회 샘플:', ', '.join(low[:20]))
print()

# 5. 매출 파레토 (판매품)
ranked=sorted(sell, key=lambda s:-std_rev[s])
acc=0; thr=[]
sell_rev=sum(std_rev[s] for s in sell) or 1
for k in (20,50,100,150,200):
    acc_rev=sum(std_rev[s] for s in ranked[:k])
    thr.append((k,100*acc_rev/sell_rev))
print('### 매출 파레토(판매품):', ' / '.join(f'상위{k}={p:.0f}%' for k,p in thr))
print(f'  매출 0원 판매품: {sum(1 for s in sell if std_rev[s]==0)}개')
print()

# 6. 미매칭 = 통합본에 없는 원천(역방향) — 빈출 위주
print(f'### 미매칭 주문명 Top 15 (통합본 밖 or 매핑실패):')
for nm,c in unmatched.most_common(15):
    print(f'  {c:5}회 {int(unmatched_rev[nm]):>10,}원  {nm[:32]}')
