# 표 열 잘림 전수 조사 (2026-09-18)

> 대상 = prod `https://webapp-9i0.pages.dev` · 뷰포트 1920px · 부족 4px 이상만 · 읽기 전용
> 도구 = Playwright 로 메뉴 전 화면을 열고 탭까지 순회하며 `td.scrollWidth - td.clientWidth` 측정.
> `ds-wrap`(overflow:visible) 셀은 넘쳐도 보이므로 제외했다.

## 왜 코드로는 못 찾나

`.ds-table` 은 `table-layout:fixed` + `td{overflow:hidden;white-space:nowrap}`(`shared-styles.ts:612,621`)이라
배정 폭을 넘긴 콘텐츠가 **경고 없이 사라진다**. 응답은 200 이고 tsc·build·smoke·check:dom 이 전부 통과한다.
**title 이 없으면 마우스오버로도 복구되지 않는다** — 그 값은 화면에서 완전히 없어진다.

## 결과

- 조사 56화면 · 잘린 열 **52건**(탭·공유화면 중복 접으면 고유 41건)
- 그중 **title 없음 = 35건**(정보 완전 소실)

| 화면 | 열 | 배정 | 필요 | 부족 | title | 잘리는 값 |
|---|---|---|---|---|---|---|
| /equipment | 키트 | 184 | 331 | **147** | **없음** | `구버전 kit git=9ec2c454 built=2026-09` |
| /purchase-orders | 발주번호 | 148 | 276 | **128** | 있음 | `E1-PO-BK-PENDING-DAEJIN-20260731` |
| /production | 장비 | 90 | 191 | **101** | **없음** | `전사 8색 1호기 (Longyin Q2000)` |
| /bank · /cash-schedule | 거래처 | 92 | 167 | **75** | 있음 | `정구택/대표010-5325-9733` |
| /activity-log | 작업 | 90 | 151 | **61** | **없음** | `ORDER_CANCEL` |
| /messages | 수신번호 | 124 | 175 | **51** | **없음** | `skysea1205@naver.com` |
| /storage-zones | 법인 | 92 | 142 | **50** | **없음** | `선명커뮤니케이션(주)` |
| /post-processing | 관리 | 80 | 126 | **46** | **없음** | `수정 비활성화` |
| /production | 출력정보 | 100 | 134 | **34** | **없음** | `네스팅 3종 (총 53장)` |
| /activity-log | 일시 | 150 | 184 | **34** | **없음** | `2026. 9. 16. 오전 10:24:59` |
| /activity-log | 대상 | 120 | 152 | **32** | 있음 | `USER����������` |
| /attendance | 직원 | 137 | 165 | **28** | **없음** | `NGUYEN THUY CUONGDS-043 · 생산직` |
| /post-processing | 적용 소분류 | 405 | 432 | **27** | **없음** | `윈드배너가로등배너정기군기워킹배너자이언트배너수기깃발` |
| /shipments | 라벨 | 70 | 96 | **26** | **없음** | `장` |
| /shipments | 박스 | 70 | 96 | **26** | **없음** | `개` |
| /shipments | 출력 | 70 | 95 | **25** | **없음** | `라벨` |
| /items | 작업 | 100 | 123 | **23** | **없음** | `수정비활성화삭제` |
| /post-processing | 코드 | 80 | 103 | **23** | **없음** | `PP-COAT-M120` |
| /bank · /cash-schedule | 최근 90일 입금 | 96 | 117 | **21** | **없음** | `장기미입금` |
| /bom | 차감방식 | 92 | 113 | **21** | **없음** | `롤(폭매칭·길이)` |
| /bom | 연결 자재 | 92 | 113 | **21** | **없음** | `롤(폭매칭·길이)` |
| /financial-reports | 수량/비율 | 100 | 118 | **18** | **없음** | `0.0% · 재고증감 미반영` |
| /post-processing | 카드 | 50 | 66 | **16** | 있음 | `(빈 칸)` |
| /card-expenses | 상태 | 50 | 66 | **16** | **없음** | `미분류` |
| /price-list | 코드 | 148 | 163 | **15** | **없음** | `TGK-SPECIAL-S1200X800` |
| /inventory-dashboard | 현재고 | 76 | 91 | **15** | **없음** | `40,070 yd` |
| /bank · /cash-schedule | 방식 | 92 | 105 | **13** | **없음** | `완전일치` |
| /post-processing | 상태 | 70 | 82 | **12** | **없음** | `활성` |
| /post-processing | 파라미터 | 405 | 417 | **12** | **없음** | `상단(mm), 하단(mm), 좌측(mm), 우측(mm), 확장` |
| /bank · /cash-schedule | 월 납입 | 110 | 122 | **12** | **없음** | `2,624,763원 12일` |
| /users | 마지막 로그인 | 148 | 159 | **11** | **없음** | `26. 06. 04. 오전 09:55` |
| /bank · /cash-schedule | #1 | 36 | 46 | **10** | **없음** | `(빈 칸)` |
| /card-expenses | #1 | 28 | 37 | **9** | **없음** | `(빈 칸)` |
| /attendance | #1 | 37 | 46 | **9** | **없음** | `(빈 칸)` |
| /price-list | 코드 | 148 | 156 | **8** | **없음** | `MBG-GDSET-7-1-R150-3` |
| /bank · /cash-schedule | 만기 | 112 | 120 | **8** | 있음 | `2029-03-24 미확인` |
| /card-expenses | #10 | 28 | 36 | **8** | 있음 | `(빈 칸)` |
| /settings/payroll-rates | 하한/상한 | 130 | 138 | **8** | **없음** | `400,000 ~ 6,370,000` |
| /inventory-dashboard | 현재고 | 76 | 82 | **6** | **없음** | `2,600 yd` |
| /inventory-dashboard | 현재고 | 76 | 82 | **6** | **없음** | `1,030 yd` |
| /messages | 관련 업무 | 92 | 96 | **4** | **없음** | `PRICE_LIST` |

## 커버리지 공백

표가 렌더되지 않아 **측정하지 못한 화면**(데이터 없음·카드형 UI·지연 로딩): `/quotations` `/cards` `/shipments-dashboard` `/pack` `/quality` `/approvals` `/purchase-requests` `/weekly-purchase` `/inspections` `/receiving` `/purchase-invoices` `/spec-groups` `/vat-reports` `/maintenance` `/material-forecast` `/scan` `/labor-contracts` `/year-end-manage` `/insurance-reports` `/permissions`

`/migration` 은 부수효과 우려로 제외. 1920px 기준이라 **좁은 화면에서 auto 열이 눌리는 건은 안 잡혔다**
(`table-layout:fixed` 에선 `min-width` 가 무시된다 — 2026-08-09 교훈).

## 재현

```
node scratchpad/table-clip-audit2.cjs --base https://webapp-9i0.pages.dev --width 1920
```
