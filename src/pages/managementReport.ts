import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'

// 경영진단 — 선명(entity2) 2026 상반기 경영 현황 정적 스냅샷.
// 데이터 고정(자동 갱신 없음): 계산서 동산기획 귀속 분리·급여 3명·자금유출 12항목·정밀재고평가(GP 16.5%)는
// 사용자 확인을 거친 1회성 수동판단이라 DB 자동집계로 재현 불가 → 확정 진단을 페이지로 박제.
// 근거·SQL 정본 = docs/sunmyung-import/, 설계 = memory/project-sunmyung-item-import.md
// 전역 CSS 충돌 방지 위해 .mr-root 컨테이너로 스코프(변수 --mr* 프리픽스, body/:root/* 미사용).
// 사이드바 통합(2026-07-18): /reports '경영진단' 탭 이식용 단일소스 export. 정적 HTML(스크립트·API 없음, .mr-root 스코프).
export const managementReportContent = `
<style>
.mr-root{
 --mrbg:#F6F7F9; --mrsurf:#FFFFFF; --mrink:#1B2430; --mrmuted:#5A6675; --mrline:#E3E7EC;
 --mrdist:#2E6E8E; --mrmake:#6A5AA6; --mrunk:#9AA4B0;
 --mrpos:#2E8B6F; --mrneg:#C0503A; --mramber:#C0872E;
 background:var(--mrbg);color:var(--mrink);
 font-family:"Malgun Gothic","맑은 고딕","Segoe UI",system-ui,-apple-system,sans-serif;
 line-height:1.55;-webkit-font-smoothing:antialiased;padding:8px 0 40px;
}
.mr-root *{box-sizing:border-box}
.mr-root .num{font-variant-numeric:tabular-nums}
.mr-root .wrap{max-width:1080px;margin:0 auto;padding:24px}
.mr-root h1{font-size:28px;font-weight:800;letter-spacing:-.02em;margin:0 0 4px;text-wrap:balance}
.mr-root .sub{color:var(--mrmuted);font-size:13.5px;margin:0}
.mr-root .eyebrow{text-transform:uppercase;letter-spacing:.14em;font-size:11px;font-weight:700;color:var(--mrdist)}
.mr-root h2{font-size:16.5px;font-weight:750;margin:0 0 2px;letter-spacing:-.01em}
.mr-root .sec{background:var(--mrsurf);border:1px solid var(--mrline);border-radius:14px;padding:24px 26px;margin-top:20px}
.mr-root .sec-cap{color:var(--mrmuted);font-size:12.5px;margin:0 0 18px}
.mr-root .grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:22px}
.mr-root .kpi{background:var(--mrsurf);border:1px solid var(--mrline);border-radius:14px;padding:16px 18px}
.mr-root .kpi .lab{font-size:11.5px;color:var(--mrmuted);text-transform:uppercase;letter-spacing:.08em;font-weight:700}
.mr-root .kpi .big{font-size:25px;font-weight:800;margin-top:8px;letter-spacing:-.02em}
.mr-root .kpi .note{font-size:11.5px;color:var(--mrmuted);margin-top:4px}
.mr-root .banner{margin-top:22px;border-radius:14px;padding:18px 22px;background:#FBF0EC;border:1px solid #E8C4B8;
 display:flex;gap:16px;align-items:flex-start}
.mr-root .banner .tag{flex:none;background:var(--mrneg);color:#fff;font-size:11px;font-weight:800;
 padding:4px 10px;border-radius:20px;letter-spacing:.04em;margin-top:2px}
.mr-root .banner p{margin:0;font-size:14px;color:#5A2E24}
.mr-root .banner b{color:var(--mrneg)}
.mr-root table{width:100%;border-collapse:collapse;font-size:13px}
.mr-root th,.mr-root td{text-align:right;padding:8px 10px;border-bottom:1px solid var(--mrline)}
.mr-root th:first-child,.mr-root td:first-child{text-align:left}
.mr-root thead th{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--mrmuted);font-weight:700;border-bottom:1.5px solid var(--mrline)}
.mr-root tbody tr:last-child td{border-bottom:none}
.mr-root .tot td{font-weight:800;border-top:1.5px solid var(--mrink);border-bottom:none}
.mr-root .pos{color:var(--mrpos);font-weight:700}.mr-root .neg{color:var(--mrneg);font-weight:700}
.mr-root .bar{height:9px;border-radius:6px;background:#EDF0F3;overflow:hidden;display:flex}
.mr-root .bar>span{height:100%}
.mr-root .stackrow{display:grid;grid-template-columns:120px 1fr 96px;gap:12px;align-items:center;margin:9px 0;font-size:13px}
.mr-root .legend{display:flex;gap:18px;flex-wrap:wrap;font-size:12px;color:var(--mrmuted);margin-top:6px}
.mr-root .legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.mr-root .mbars{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-top:10px}
.mr-root .mcol{text-align:center}
.mr-root .mstack{height:150px;display:flex;flex-direction:column-reverse;gap:2px;justify-content:flex-start}
.mr-root .mstack .s{border-radius:3px 3px 0 0}
.mr-root .mcol .ml{font-size:11px;color:var(--mrmuted);margin-top:7px}
.mr-root .mcol .mv{font-size:11px;font-weight:700;margin-top:1px}
.mr-root .two{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.mr-root .flowcard{border:1px solid var(--mrline);border-radius:12px;padding:16px 18px}
.mr-root .flowcard h3{margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:.07em;color:var(--mrmuted)}
.mr-root .flowrow{display:flex;justify-content:space-between;padding:7px 0;font-size:13.5px;border-bottom:1px dashed var(--mrline)}
.mr-root .flowrow:last-child{border-bottom:none}
.mr-root .foot{color:var(--mrmuted);font-size:11.5px;margin-top:26px;line-height:1.7}
.mr-root .foot b{color:var(--mrink)}
@media(max-width:720px){.mr-root .grid4{grid-template-columns:repeat(2,1fr)}.mr-root .two{grid-template-columns:1fr}.mr-root .mbars{gap:5px}.mr-root .stackrow{grid-template-columns:88px 1fr 78px}}
</style>
<div class="mr-root">
<div class="wrap">
<div class="eyebrow">선명커뮤니케이션 · 법인 경영 진단</div>
<h1>선명 6개월 경영 현황 (2026.01–06)</h1>
<p class="sub num">순수 사업(원단유통+제작) 기준 · 계산서 발행분(동산기획 귀속) 분리 · 작성 2026-07-16 · 데이터 고정(스냅샷)</p>

<div class="grid4">
 <div class="kpi"><div class="lab">선명 실질매출</div><div class="big num">5.44억</div><div class="note">계산서 1.28억 제외 (총 6.72억)</div></div>
 <div class="kpi"><div class="lab">매출총이익</div><div class="big num" style="color:var(--mrpos)">0.90억</div><div class="note num">이익률 16.5% · 도매형 얇은마진</div></div>
 <div class="kpi"><div class="lab">영업손익(근사)</div><div class="big num" style="color:var(--mrneg)">−0.16억</div><div class="note">급여·4대보험·임차 반영</div></div>
 <div class="kpi"><div class="lab">외부 조달</div><div class="big num" style="color:var(--mramber)">2.76억</div><div class="note">대출 1.29억 + 가수금 1.47억</div></div>
</div>

<div class="banner">
 <span class="tag">핵심 진단</span>
 <p>오케이애드·인효·대운애드빌 <b>계산서 1.28억</b>은 동산기획 직원 급여 충당용이라 <b>동산기획 귀속</b>으로 분리했습니다. 남은 <b>선명 순수 사업은 매출 5.44억·매출총이익 0.90억(16.5%)</b>의 얇은 원단 도매입니다(계산서 포함 시 30.7%는 착시). 선명 실직원 급여(3명+최상호·김성배)·4대보험·공장·창고 임차를 반영하면 <b>영업 0.16억 적자</b>이며, 부족분을 <b>대출·가수금 2.76억</b>로 메꿔 왔습니다.</p>
</div>
<div class="sec">
<h2>손익 구조 — 계산서 분리 후 선명 실질</h2>
<p class="sec-cap">계산서(동산기획 귀속)를 걷어내고 선명 순수 사업만 남긴 손익. 급여는 <b>선명 3명(정송엽·김용준·강지영) 0.57억</b>만 반영, 나머지 1.22억은 동산기획 직원 대납(계산서로 충당).</p>
<div class="stackrow"><div>매출 구성</div><div class="bar"><span style="width:68.68%;background:#2E6E8E"></span><span style="width:12.23%;background:#6A5AA6"></span><span style="width:19.08%;background:#C9B27A"></span></div><div class="num" style="text-align:right">6.72억</div></div>
<div class="legend"><span><i style="background:#2E6E8E"></i>유통(원단재판매) 4.62억</span><span><i style="background:#6A5AA6"></i>제작(출력물) 0.82억</span><span><i style="background:#C9B27A"></i>계산서→동산기획귀속 1.28억</span></div>
<table style="margin-top:20px">
<thead><tr><th>선명 실질 손익</th><th>금액</th><th>실질매출 대비</th></tr></thead>
<tbody>
<tr><td>선명 실질매출 (유통+제작)</td><td class="num">543,937,113</td><td class="num">100.0%</td></tr>
<tr><td>&nbsp;&nbsp;기초재고 (25.12.31)</td><td class="num" style="color:var(--mrmuted)">72,451,751</td><td class="num" style="color:var(--mrmuted)"></td></tr>
<tr><td>&nbsp;&nbsp;(+) 당기매입</td><td class="num" style="color:var(--mrmuted)">454,062,932</td><td class="num" style="color:var(--mrmuted)"></td></tr>
<tr><td>&nbsp;&nbsp;(−) 기말재고 (26.6.30)</td><td class="num" style="color:var(--mrmuted)">72,392,520</td><td class="num" style="color:var(--mrmuted)"></td></tr>
<tr><td>(−) 매출원가 (재고 반영 COGS)</td><td class="num">454,122,163</td><td class="num">83.5%</td></tr>
<tr class="tot"><td>매출총이익</td><td class="num pos">89,814,950</td><td class="num">16.5%</td></tr>
<tr><td>(−) 선명 3명 급여 (정송엽·김용준·강지영)</td><td class="num">57,300,000</td><td class="num neg">10.5%</td></tr>
<tr><td>(−) 기타 급여 (최상호·김성배)</td><td class="num">6,068,610</td><td class="num neg">1.1%</td></tr>
<tr><td>(−) 3명 회사부담 4대보험</td><td class="num">6,083,640</td><td class="num">1.1%</td></tr>
<tr><td>(−) 임차료 (공장+창고)</td><td class="num">36,334,800</td><td class="num">6.7%</td></tr>
<tr class="tot"><td>영업손익 (근사)</td><td class="num neg">−15,972,100</td><td class="num neg">-2.9%</td></tr>
</tbody></table>
<p class="sec-cap" style="margin-top:14px">※ 매출원가는 <b>재고 실측 반영</b>(기초 0.72억 ≈ 기말 0.72억, 6개월 재고 <b>거의 균형</b> = 원단 유통이라 재고 수준 유지, COGS≈당기매입). 출력물·제품은 동산기획 제조라 원단 재고와 무관. 계산서 1.28억(원가0)를 빼면 순수 도매 마진 16.5%가 실체. 판관비는 급여·4대보험·임차만 반영했고, 카드 0.40억·복리후생·수수료를 더하면 적자폭은 커집니다.</p>
</div><div class="sec">
<h2>급여 흐름 — 선명 3명 vs 동산기획 대납</h2>
<p class="sec-cap">선명 통장에서 나간 급여 1.70억(6개월)에는 선명 실직원 3명과 <b>동산기획 직원 대납</b>이 섞여 있습니다. 계산서 매출이 후자를 충당합니다.</p>
<div class="two">
 <div>
  <table>
  <thead><tr><th>선명 실직원 (payroll)</th><th>직급</th><th>월 급여</th></tr></thead>
  <tbody>
   <tr><td>정송엽</td><td style="text-align:right;color:var(--mrmuted)">부장</td><td class="num">3,600,000</td></tr>
   <tr><td>김용준</td><td style="text-align:right;color:var(--mrmuted)">대표</td><td class="num">3,200,000</td></tr>
   <tr><td>강지영</td><td style="text-align:right;color:var(--mrmuted)">대리</td><td class="num">2,750,000</td></tr>
   <tr class="tot"><td>3명 합 (월)</td><td></td><td class="num">9,550,000</td></tr>
  </tbody>
  </table>
  <p class="sec-cap" style="margin-top:10px">6개월 지급총액 0.57억·실수령 0.49억. payroll 2026-06·07 실적 월평균 기준 추정.</p>
 </div>
 <div class="flowcard">
  <h3>통장 급여송금 1.70억 분해</h3>
  <div class="flowrow"><span>선명 3명 실수령 (6개월)</span><b class="num pos">48,582,720</b></div>
  <div class="flowrow"><span>동산기획 직원 대납</span><b class="num" style="color:var(--mramber)">121,718,670</b></div>
  <div class="flowrow"><span>↳ 이를 충당한 계산서 매출</span><b class="num" style="color:var(--mramber)">128,269,000</b></div>
  <div class="flowrow"><span>충당 정합</span><b class="num pos">≈ 일치 (차 6,550,330)</b></div>
 </div>
</div>
</div><div class="sec">
<h2>손익분기 매출 (BEP) — 적자를 면하려면</h2>
<p class="sec-cap">원단 도매 공헌이익률(=매출총이익률) <b>16.5%</b>로 고정비 1.06억(급여·임차)를 커버하는 매출. 매출 1원당 16.5전만 고정비 충당에 기여하므로 많이 팔아야 합니다.</p>
<div class="two">
<div>
<table>
<thead><tr><th>구분</th><th>6개월</th><th>월평균</th></tr></thead>
<tbody>
<tr><td>손익분기 매출 (BEP)</td><td class="num">640,667,312</td><td class="num">106,777,885</td></tr>
<tr><td>현재 실질매출</td><td class="num">543,937,113</td><td class="num">90,656,186</td></tr>
<tr class="tot"><td>부족분</td><td class="num neg">96,730,199</td><td class="num neg">16,121,700</td></tr>
</tbody>
</table>
<p class="sec-cap" style="margin-top:10px">현재 매출은 BEP의 <b>84.9%</b> 수준. 지금 구조로는 <b>매출을 17.8% 늘려야</b>(월 16,121,700↑) 적자를 면합니다.</p>
</div>
<div class="flowcard">
<h3>BEP 도달 3가지 레버</h3>
<div class="flowrow"><span>① 매출 증대</span><b class="num">+0.97억 <span style="color:var(--mrmuted);font-weight:400">(월 +16,121,700)</span></b></div>
<div class="flowrow"><span>② 마진 개선 16.5%→19.4%</span><b class="num">+2.9%p</b></div>
<div class="flowrow"><span>③ 고정비 절감 1.06억→0.90억</span><b class="num">−0.16억</b></div>
</div>
</div>
<p class="sec-cap" style="margin-top:14px">※ 공헌이익률=매출총이익률(매입=변동비). 고정비=인건비+임차만 반영. 카드·복리·수수료를 고정비에 포함하면 BEP는 더 올라갑니다. 원단 도매는 마진 확대가 어려우므로, 현실적 레버는 <b>고정비(창고·인건비) 조정</b> 또는 <b>고마진 제작·신규품목 비중 확대</b>입니다.</p>
</div><div class="sec">
<h2>월별 매출·매입 추이 (선명 실질)</h2>
<p class="sec-cap">막대=월 실질매출(유통+제작, 계산서 제외), 하단 빨강=재고매입. 5월은 매입&gt;매출(원단 대량입고→재고).</p>
<div class="mbars"><div class="mcol"><div class="mstack"><div class="s" style="height:64.3px;background:#2E6E8E"></div><div class="s" style="height:6.1px;background:#6A5AA6"></div></div><div class="ml">01월</div><div class="mv num">0.68억</div><div class="ml num" style="color:var(--mrneg)">매입 0.61</div></div><div class="mcol"><div class="mstack"><div class="s" style="height:45.8px;background:#2E6E8E"></div><div class="s" style="height:6.4px;background:#6A5AA6"></div></div><div class="ml">02월</div><div class="mv num">0.51억</div><div class="ml num" style="color:var(--mrneg)">매입 0.29</div></div><div class="mcol"><div class="mstack"><div class="s" style="height:72.0px;background:#2E6E8E"></div><div class="s" style="height:21.7px;background:#6A5AA6"></div></div><div class="ml">03월</div><div class="mv num">0.91억</div><div class="ml num" style="color:var(--mrneg)">매입 0.93</div></div><div class="mcol"><div class="mstack"><div class="s" style="height:124.4px;background:#2E6E8E"></div><div class="s" style="height:25.6px;background:#6A5AA6"></div></div><div class="ml">04월</div><div class="mv num">1.46억</div><div class="ml num" style="color:var(--mrneg)">매입 0.88</div></div><div class="mcol"><div class="mstack"><div class="s" style="height:84.1px;background:#2E6E8E"></div><div class="s" style="height:12.9px;background:#6A5AA6"></div></div><div class="ml">05월</div><div class="mv num">0.94억</div><div class="ml num" style="color:var(--mrneg)">매입 1.03</div></div><div class="mcol"><div class="mstack"><div class="s" style="height:84.5px;background:#2E6E8E"></div><div class="s" style="height:11.9px;background:#6A5AA6"></div></div><div class="ml">06월</div><div class="mv num">0.94억</div><div class="ml num" style="color:var(--mrneg)">매입 0.93</div></div></div>
<div class="legend" style="margin-top:14px"><span><i style="background:#2E6E8E"></i>유통</span><span><i style="background:#6A5AA6"></i>제작</span><span><i style="background:#C0503A"></i>재고매입</span></div>
</div><div class="sec">
<h2>자금 유출 상세 — 어디서 얼마나 나가나</h2>
<p class="sec-cap">6개월 통장 출금 <b>1,325,853,822</b>을 항목별로 완전분해. 이체(상계)는 자기계좌 이동이라 실제 유출이 아닙니다.</p>
<div class="two">
<div>
<table>
<thead><tr><th>유출 항목</th><th>금액</th><th></th><th>비중</th></tr></thead>
<tbody><tr><td>매입지급</td><td class="num">421,653,647</td><td style="width:120px"><div class="bar"><span style="width:31.8%;background:#2E6E8E"></span></div></td><td class="num" style="color:var(--mrmuted)">31.8%</td></tr><tr><td>이체(상계) <span style="color:var(--mrmuted)">(순증 아님)</span></td><td class="num">351,375,852</td><td style="width:120px"><div class="bar"><span style="width:26.5%;background:#DCE0E5"></span></div></td><td class="num" style="color:var(--mrmuted)">26.5%</td></tr><tr><td>급여</td><td class="num">156,681,120</td><td style="width:120px"><div class="bar"><span style="width:11.8%;background:#6A5AA6"></span></div></td><td class="num" style="color:var(--mrmuted)">11.8%</td></tr><tr><td>자본지출(설비/보증금)</td><td class="num">155,028,100</td><td style="width:120px"><div class="bar"><span style="width:11.7%;background:#C0872E"></span></div></td><td class="num" style="color:var(--mrmuted)">11.7%</td></tr><tr><td>가수금반제/대표인출</td><td class="num">57,950,920</td><td style="width:120px"><div class="bar"><span style="width:4.4%;background:#D0A85A"></span></div></td><td class="num" style="color:var(--mrmuted)">4.4%</td></tr><tr><td>4대보험/생명</td><td class="num">49,560,080</td><td style="width:120px"><div class="bar"><span style="width:3.7%;background:#8478B8"></span></div></td><td class="num" style="color:var(--mrmuted)">3.7%</td></tr><tr><td>카드대금</td><td class="num">39,606,410</td><td style="width:120px"><div class="bar"><span style="width:3.0%;background:#7A8694"></span></div></td><td class="num" style="color:var(--mrmuted)">3.0%</td></tr><tr><td>임차료</td><td class="num">36,334,800</td><td style="width:120px"><div class="bar"><span style="width:2.7%;background:#3F8C7E"></span></div></td><td class="num" style="color:var(--mrmuted)">2.7%</td></tr><tr><td>세금</td><td class="num">33,151,550</td><td style="width:120px"><div class="bar"><span style="width:2.5%;background:#5A6675"></span></div></td><td class="num" style="color:var(--mrmuted)">2.5%</td></tr><tr><td>미상(개인명등)</td><td class="num">10,530,947</td><td style="width:120px"><div class="bar"><span style="width:0.8%;background:#B0B8C0"></span></div></td><td class="num" style="color:var(--mrmuted)">0.8%</td></tr><tr><td>복리후생</td><td class="num">10,306,896</td><td style="width:120px"><div class="bar"><span style="width:0.8%;background:#A99FD0"></span></div></td><td class="num" style="color:var(--mrmuted)">0.8%</td></tr><tr><td>수수료</td><td class="num">3,673,500</td><td style="width:120px"><div class="bar"><span style="width:0.3%;background:#9AA4B0"></span></div></td><td class="num" style="color:var(--mrmuted)">0.3%</td></tr></tbody>
</table>
</div>
<div class="flowcard">
<h3>자금잠식 구조</h3>
<div class="flowrow"><span>매출대금 회수 (유입)</span><b class="num pos">+623,294,008</b></div>
<div class="flowrow"><span>영업·판관 유출 (매입+인건비+운영)</span><b class="num neg">−750,968,003</b></div>
<div class="flowrow"><span>= 영업활동 현금</span><b class="num neg">-127,673,995</b></div>
<div class="flowrow"><span>자본지출 (공장이전 보증금·설비)</span><b class="num neg">−155,028,100</b></div>
<div class="flowrow"><span>가수금반제·대표인출</span><b class="num neg">−57,950,920</b></div>
<div class="flowrow"><span>→ 대출·가수금 조달로 충당</span><b class="num" style="color:var(--mramber)">+275,802,047</b></div>
</div>
</div>
<p class="sec-cap" style="margin-top:14px"><i class="fas fa-lightbulb"></i> <b>영업활동만으로 1.28억 현금 부족</b>(매출회수 &lt; 매입+인건비+운영비). 여기에 <b>공장이전 보증금·설비·쇼핑몰개발 등 자본지출 1.55억</b>가 겹쳐 대출·가수금 2.76억로 메꿨습니다. <b>인건비(급여+4대보험+복리 2.17억)</b>가 매입 다음 최대 유출. 미상 0.11억은 전기·보안·세무·등기 등 소액 운영비.</p>
</div><div class="sec">
<h2>원단 유통마진 — 제품군별 (얇은 장사)</h2>
<p class="sec-cap">같은 제품군의 6개월 매출액 vs 매입액을 <b>폭 구분 없이 합산</b>. 주력 현수막 원단은 마진 한 자릿수. (매입량≠판매량 재고차 포함, 근사)</p>
<div class="two">
<div>
<table>
<thead><tr><th>주력 원단 (매출순)</th><th>매출</th><th>매입</th><th>마진율</th></tr></thead>
<tbody><tr><td>수성 현수막원단 1코팅</td><td class='num'>105,506,560</td><td class='num'>86,833,450</td><td class='num pos'>17.7%</td></tr><tr><td>수성 현수막원단 2코팅</td><td class='num'>103,048,651</td><td class='num'>101,860,640</td><td class='num pos'>1.2%</td></tr><tr><td>일반시트 SPM011G</td><td class='num'>22,410,900</td><td class='num'>20,013,790</td><td class='num pos'>10.7%</td></tr><tr><td>무광코팅지 SPP031M</td><td class='num'>20,962,820</td><td class='num'>18,630,720</td><td class='num pos'>11.1%</td></tr><tr><td>패트배너 30M 호홍</td><td class='num'>15,747,400</td><td class='num'>10,763,150</td><td class='num pos'>31.7%</td></tr><tr><td>켈 30M 호홍</td><td class='num'>13,157,700</td><td class='num'>8,372,360</td><td class='num pos'>36.4%</td></tr><tr><td>친환경 현수막원단 eco</td><td class='num'>11,626,800</td><td class='num'>9,707,880</td><td class='num pos'>16.5%</td></tr><tr><td>친환경 현수막원단 TPM</td><td class='num'>10,036,490</td><td class='num'>9,509,440</td><td class='num pos'>5.3%</td></tr><tr><td>수성 현수막원단 저밀도</td><td class='num'>8,394,260</td><td class='num'>5,977,920</td><td class='num pos'>28.8%</td></tr><tr><td>솔벤 현수막</td><td class='num'>6,486,160</td><td class='num'>6,186,270</td><td class='num pos'>4.6%</td></tr></tbody>
</table>
</div>
<div>
<table>
<thead><tr><th>역마진 제품군 (재고증가)</th><th>매출</th><th>매입</th><th>차액</th></tr></thead>
<tbody><tr><td>외부용 SMPS(방수) 300wt</td><td class='num'>130,000</td><td class='num'>1,920,000</td><td class='num neg'>−1,790,000</td></tr><tr><td>LED형광등 28W양면돌출</td><td class='num'>1,125,000</td><td class='num'>2,600,000</td><td class='num neg'>−1,475,000</td></tr><tr><td>까치발 흑색</td><td class='num'>6,000</td><td class='num'>1,045,350</td><td class='num neg'>−1,039,350</td></tr><tr><td>볼로프 5mm</td><td class='num'>656,000</td><td class='num'>1,240,000</td><td class='num neg'>−584,000</td></tr><tr><td>랩핑시트 LD59HTG</td><td class='num'>1,074,000</td><td class='num'>1,368,960</td><td class='num neg'>−294,960</td></tr><tr><td>조명시트 LC6770P</td><td class='num'>191,000</td><td class='num'>386,220</td><td class='num neg'>−195,220</td></tr></tbody>
</table>
<p class="sec-cap" style="margin-top:12px">역마진 = 매입&gt;매출, 대부분 <b>안 팔린 재고 증가</b>. 실손실 여부는 재고 실사 필요.</p>
</div>
</div>
<p class="sec-cap" style="margin-top:8px">매칭 원단 전체 유통 실질 마진율 ≈ <b>19.1%</b> (매출 409,628,648 / 매입 331,281,425).</p>
</div><div class="sec">
<h2>거래처 — 선명 순수 매출처 · 매입처</h2>
<div class="two">
<div>
<table>
<thead><tr><th>순수 매출처 Top</th><th>매출</th><th>유통/제작</th></tr></thead>
<tbody><tr><td>(주)동산기획</td><td class="num">47,378,531</td><td style="width:150px"><div class="bar"><span style="width:78.48%;background:#2E6E8E"></span><span style="width:9.96%;background:#6A5AA6"></span><span style="width:11.57%;background:#9AA4B0"></span></div></td></tr><tr><td>동산기획(청주)</td><td class="num">40,825,060</td><td style="width:150px"><div class="bar"><span style="width:92.61%;background:#2E6E8E"></span><span style="width:1.81%;background:#6A5AA6"></span><span style="width:5.58%;background:#9AA4B0"></span></div></td></tr><tr><td>세원미디어</td><td class="num">41,628,010</td><td style="width:150px"><div class="bar"><span style="width:90.91%;background:#2E6E8E"></span><span style="width:0.00%;background:#6A5AA6"></span><span style="width:9.09%;background:#9AA4B0"></span></div></td></tr><tr><td>재현 시스템(원단)</td><td class="num">35,370,540</td><td style="width:150px"><div class="bar"><span style="width:95.89%;background:#2E6E8E"></span><span style="width:0.00%;background:#6A5AA6"></span><span style="width:4.11%;background:#9AA4B0"></span></div></td></tr><tr><td>공감디자인(대전)</td><td class="num">31,644,288</td><td style="width:150px"><div class="bar"><span style="width:86.70%;background:#2E6E8E"></span><span style="width:0.42%;background:#6A5AA6"></span><span style="width:12.88%;background:#9AA4B0"></span></div></td></tr><tr><td>이레싸인</td><td class="num">27,627,130</td><td style="width:150px"><div class="bar"><span style="width:86.51%;background:#2E6E8E"></span><span style="width:3.13%;background:#6A5AA6"></span><span style="width:10.36%;background:#9AA4B0"></span></div></td></tr><tr><td>트윈디자인</td><td class="num">23,706,743</td><td style="width:150px"><div class="bar"><span style="width:64.12%;background:#2E6E8E"></span><span style="width:23.36%;background:#6A5AA6"></span><span style="width:12.52%;background:#9AA4B0"></span></div></td></tr><tr><td>주식회사 영기획</td><td class="num">21,702,540</td><td style="width:150px"><div class="bar"><span style="width:52.12%;background:#2E6E8E"></span><span style="width:25.53%;background:#6A5AA6"></span><span style="width:22.35%;background:#9AA4B0"></span></div></td></tr></tbody>
</table>
<div class="legend"><span><i style="background:#2E6E8E"></i>유통</span><span><i style="background:#6A5AA6"></i>제작</span><span><i style="background:#9AA4B0"></i>미분류</span></div>
<p class="sec-cap" style="margin-top:10px">※ 오케이애드(0.80억)·인효(0.43억)·대운은 계산서(동산기획 귀속)라 제외.</p>
</div>
<div>
<table>
<thead><tr><th>매입처 Top</th><th>매입</th><th>전표</th></tr></thead>
<tbody><tr><td>운산직물</td><td class='num'>213,901,805</td><td class='num'>54건</td></tr><tr><td>(주)서울경금속</td><td class='num'>79,063,520</td><td class='num'>60건</td></tr><tr><td>(주)엘이디포유</td><td class='num'>41,118,300</td><td class='num'>22건</td></tr><tr><td>(주)티피엠</td><td class='num'>40,929,010</td><td class='num'>17건</td></tr><tr><td>호홍 주식회사</td><td class='num'>28,063,310</td><td class='num'>10건</td></tr><tr><td>케이엠테크</td><td class='num'>20,864,407</td><td class='num'>11건</td></tr></tbody>
</table>
<p class="sec-cap" style="margin-top:12px"><b>운산직물이 매입의 46%</b> 집중 — 원단 조달이 단일처에 쏠린 공급망 리스크.</p>
</div>
</div>
</div><div class="sec">
<h2>운전자본 · 채권채무</h2>
<div class="grid4" style="margin-top:4px">
 <div class="kpi"><div class="lab">미수금 (받을 돈)</div><div class="big num">2.35억</div><div class="note">매출채권 잔액</div></div>
 <div class="kpi"><div class="lab">미지급 (줄 돈)</div><div class="big num">2.47억</div><div class="note">매입채무 잔액</div></div>
 <div class="kpi"><div class="lab">대출 잔액(조달)</div><div class="big num" style="color:var(--mramber)">1.29억</div><div class="note">6개월 실행분</div></div>
 <div class="kpi"><div class="lab">가수금(대표·관계)</div><div class="big num" style="color:var(--mramber)">1.47억</div><div class="note">상환 부담</div></div>
</div>
<p class="sec-cap" style="margin-top:16px">미수 2.35억 ≈ 미지급 2.47억로 채권·채무는 균형이나, <b>대출·가수금 2.76억가 얹혀</b> 실질 부채 부담이 큽니다.</p>
</div><p class="foot">
<b>데이터 근거·한계</b><br>
· <b>계산서 분리</b>: 오케이애드·인효·대운애드빌 1.28억(품목 없는 계산서=급여충당·동산기획 귀속)를 선명 실질에서 제외. 명세불명 총액과 정확히 일치.<br>
· 선명 실질 GP 16.5%는 <b>재고 실측 반영</b>(25.12.31·26.6.30 재고현황, 유사폭 단가 보간). 매입 item_id 97.5%·매출 86%·재고 약 91% 매칭(남은 소량 부자재·매입없는 품목만 제외).<br>
· <b>급여 처리</b>: 선명 실직원=정송엽·김용준·강지영 3명(사용자 확인). payroll 2026-06·07 실적 월평균×6 추정(상반기 급여 미등록). 통장 급여 1.70억 중 3명 실수령 0.49억 제외한 1.22억은 동산기획 대납→계산서 1.28억로 충당(정합 확인).<br>
· 원단마진은 제품군 합산·매입량≠판매량(재고차) 포함 근사. 억 = 1억원. · <b>스냅샷 기준일 2026-07-16</b> (데이터 고정, 자동 갱신 없음).
</p>
</div>
</div>
`

export function managementReportPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '경영진단',
    activePage: '/management-report',
    pageScript: '',
    pageContent: managementReportContent,
  })
}
