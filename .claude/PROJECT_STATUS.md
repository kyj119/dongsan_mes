# PROJECT_STATUS.md — 프로젝트 현황판

> **최종 업데이트**: 2026-06-08
> 완료 이력 → `PROJECT_STATUS_ARCHIVE.md` (매 세션 읽을 필요 없음, 필요 시 참조)

---

## 🔒 편집 중 (충돌 방지)

- (없음)

---

## 🔴 현재 진행 중

- **🟢 카드/주문 상태모델 단일화 (#1·2·3·4) — prod 배포·검증 완료**: 이중 상태모델(PRINT_PENDING vs PRINTING+rip_status) 충돌이 공통원인. 4 Phase 배포(P1 보드버킷 status기준→#2 / P2 PRINTING=LogWatcher단일화→#3 / P3 유통 즉시SHIPPED→#1 / P4 레거시 마이그0298). **prod 검증: 보드 출력대기에 PRINT_PENDING 카드 노출**, #1 유통 bulk-ship→즉시 SHIPPED, #3 baseline 주문 CONFIRMED 정상. **✅ 실사용 UI 확인 완료(2026-06-05, prod Playwright)**. **✅ 상태 라벨 단일소스화 완료(커밋 `b9b03ea`)**: `src/utils/statusLabels.ts`→`window.MES_STATUS`(layout+portalLayout 주입)→16스크립트 전역참조. **✅ origin/main 동기화 완료**(현 `e598392`). 설계 → `docs/superpowers/specs/2026-06-05-status-model-unification.md`, 메모리 `session-context`.
- **바로빌 멀티계정 — 계좌·카드 법인별화**: **prod 배포 완료(0be34406)**. 글로벌 corpNum 하드코딩 4곳 법인별화(`barobill.ts`·`cardExpenses.ts`·`bank.ts×2` → `getEntityCorpNum`), CERTKEY 전역 유지, 각 법인 자체 corpNum(청주 회원사 등록 완료). 마이그 없음·HTTP 스모크 통과. **▶ 실사용 검증=선명/청주 회원사·서비스·계좌/카드/발신번호 바로빌 등록 후**(용준님). 상세 → `docs/superpowers/specs/2026-06-03-receivables-purchase-barobill-brainstorm.md`
- **미수금 회수예측 (4-3 확장)**: **4-3a 시점 + 4-3b 회수율 둘 다 prod 배포 완료**. 4-3a(9d40b745) 거래처별 결제주기(NET/MONTHLY, 마이그 `0288`) → cashSchedule·cashflowEngine 입금예정 날짜 현실화. 4-3b(6a613633) IFRS9 provision matrix(마이그 `0289` `ar_provision_rates`·`ar_grade_multipliers`) → `/bank` 미수금 탭 예상회수액 KPI. **▶ 용준님 실사용 테스트**. 후속: 4-3a-2 median lag, 충당률 편집 UI, 4-3c 조기경보. 설계 → `docs/superpowers/specs/2026-06-03-receivables-purchase-barobill-brainstorm.md`
- **매입 관리 — 입고·매입확정 분리**: **P1~P3 전체 prod 배포 완료**. P1(6c72eb4b) 발주 단가미정(`price_status`)·입고 거래명세서 첨부(`statement_file_key`,R2,마이그 `0287`). P2(9949a74c) 매입확정 페이지 `/purchase-invoices`. P3(d2f76f4c) 매입확정 시 `cash_schedule` OUT(지급예정) UPSERT. **▶ 용준님 실사용 테스트 대기**. 잔여: 그룹연쇄(price_linked)·부분확정 후순위.
- **자금 예측/계획 일원화**: **Phase 1~4 + 4-3 미수금↔입금예정 + prod 배포·검증 완료**(5탭 허브·하이브리드 엔진·시작잔액 prefill·은행매칭→DONE). **✅ 4-3(커밋 `607b3e4`)**: cashflowEngine ④에 BILLED-미물질화 주문을 ORDER_EXPECTED로 합성(거래처 balance cap·이중계산 방지) + `/bank` 미수금 탭 '예상 입금일'. **▶ 백로그: 카드 예측**(corporate_cards에 cutoff_day/payment_day 추가 후)·월별요약 KPI수입 일관성·apply→DONE 운영검증. 설계 → `memory/project-cashflow-unification.md`

> **다음 세션 TODO**: ①향후 기성 PRODUCT는 품목 UI '기성품' 토글로 지정(코드 완비) ②혼합주문(제작+기성) 부분출고·재고차감 실사용 모니터링 ③cards 외 스키마 드리프트 의심 시 PRAGMA 확인 ④#329(3) withSeqRetry INSERT 래핑(후순위) ⑤로컬 dev:d1 중복 정리 ⑥자금 후속(백로그): 카드 예측(corporate_cards cutoff/payment_day 추가 후), 월별요약 KPI수입 일관성 ⑦DB 초기화 시 마이그(0106·0071) 재적용+permission_pages seed / 🔴**[용준님·#336] 프로덕션 admin/password 계정 교체**(교체 시 CI SMOKE/E2E 시크릿도 갱신) ⑧**한진 송장 자동화**: export(엑셀 일괄) prod 완료 / import(송장 일괄입력) 대기=한진 양식·출고번호 보존 확인 후 ⑨**[용준님] 바로빌 알림톡 템플릿 6종 등록·검수**(문안 `docs/kakao-alimtalk-templates.md`) ⑩**[용준님] 거래처 배송방식 개별 정리**(방문수령 186건→실제 택배/화물) ⑪바로빌 `order_received` 등록 후 `orders.js` autoTemplate 확정 ⑫**주문접수 멀티법인 협업 후속(미착수)**: (a)Phase 4 내부정산 집계(spec §9~11) (b)Phase 5 거래처 셀프 주문 포털 (c)[용준님] 코디네이터 사용자 지정(`/users` 토글, 지정 후 재로그인 필수) (d)실사용 검증=유통/견적 담당 실저장·타법인 교차열람

---

## 🟡 대기 중 (사용자 선택/승인 필요)

### [기성품/유통 즉시출고] — ✅ 전체 완료 (Phase 1+2+3 + UI 클릭검증 + 태극기 지정)
- 코드/마이그(0285·0286) prod 반영. 기성/유통 = 카드 미생성·즉시 출고가능·SHIPPED 전이·출고 시 재고차감(음수 허용·멱등)·주문서 재고부족 경고.
- **태극기 9종(수기·1~6호·특호·탁상용) 기성품 지정 완료**. 향후 추가 기성 PRODUCT는 품목 UI '기성품' 체크로 지정.

### [포털 rate-limit] — ✅ 프로덕션 배포됨 (2026-06-02)
- portal verify-document/verify-token에 `rateLimitMiddleware`(10·30/분) 적용(commit 4a2fc28). prod 활성화.
### [#310 직접발행 폼] — 실사용 검증 대기 (2026-06-01)
- 백엔드(POST /tax-invoices/direct)+UI 배포됨. 세금계산서 '직접발행' 첫 발행 테스트 권장 (tax_invoices 0건)

### [바로빌 전환] — 통합 완료, 잔여 작업 대기
- 전환 완료: `messaging_provider=barobill`, 실데이터 조회 성공. 통장→수금 반자동 플로우 구현됨. 자금관리 탭 정리 완료(바로빌 통장 탭→은행 연동 통합).
- **대기**: SMS 발신번호 승인, **알림톡 템플릿 등록·검수**(문안 6종 `docs/kakao-alimtalk-templates.md`), 나머지 카드/계좌 등록
- **알림톡 코드 정합 완료**(2026-06-03): 출고 4종·주문접수·미수금 템플릿 코드 연동. **버튼 미전송**(sendATS) → 링크는 본문. **한진 송장 수동입력**(자동화 조사 완료)

### [선명2 CAPS Worker 설치] — PC 설정 대기
- S2 사이트 DB 등록 완료, API_KEY 발급됨. 선명2 PC에 caps-worker 폴더 복사 + .env 설정 + 실행 필요

### [배송 관리 최적화] — 출고 대기 보드
- 배송방법별 그룹화 + 마감시간 카운트다운 + 일괄 출고 + 카카오톡 자동 발송
### [기존 계약 일괄 등록] — 엑셀 import 스크립트 제공 대기
### [라벨 프린터 인쇄] — 프린터 모델 확인 필요 (외부 의존)
### [RIP 전송] — 코드 완료, 현장 테스트 대기 (외부 의존)
### [LogWatcher PrintExp] — 구현 완료, 현장 배포 대기 (외부 의존)
### [한진택배 자동화] — 솔루션 선정 대기 (사용자 결정 필요)

### [GitHub 이슈 백로그]
- **✅ 처리완료·배포·close(2026-06-05)**: #355·356·335·351·352·357·349 + **#343·#345·#353·#354·#346**(커밋 `0c04fad`) + **#344**(커밋 `0ce9c42`) — dead-filter(생산보드/원가/메시지/활동로그/매입)·CSV(cashSchedule·검수)·검수 공급업체 드롭다운·연차 부서필터·휴가 날짜·불량률→검수 드릴다운·**미사용수당 정합버그 수정** + **포털 셀프서비스**(세금계산서 다운로드/연도필터/페이지네이션·미수금 aging·재주문 모달). prod 배포(`webapp-9i0.pages.dev`), 사내 9페이지 스모크 통과·포털 신규 라우트 401 확인. **▶ 포털 실동작은 포털 계정 실사용 검증 권장**
- **N+1 검증세션(2026-06-06)**: **#341 cashFlow projection 집계(72→6쿼리)·#350 payroll hoist+exists/empRow prefetch 검증·배포 완료**(커밋 `1737ebc`·`fa4d196`, dep `fdf92b4c`). 검증법=cashFlow는 프로덕션 baseline 비교(months 1/3/6/12 완전일치), payroll은 로컬 48명 더미월 실행→DELETE 롤백→재실행 비교(48행 완전일치). **잔여=write batch**(purchaseRequests PR→PO·import루프·sync-attendance·PO품목·child INSERT): baseline 비교 구조적 불가(실행=상태변경) → 스테이징/실데이터 스냅샷 준비 후 별도 세션. **로컬 D1에 cashFlow/orders/payments 데이터 0건**이라 read 검증은 프로덕션 의존
- **✅ 이슈 일괄 처리·배포·코멘트(2026-06-08, close는 owner)**: 11건. **IDOR 보안**(#349/#356 entityFilter 패턴): #358(approvals 10핸들러)·#360(quotations GET/PUT/DELETE/:id+convert·cardExpenses cards)·#361(autoProcess 4, /pending 동일필터라 폴링안전)·#365(files.ts GET→requireRole ADMIN)·#368(storage-zones all_entities ADMIN/MANAGER 게이트+/:id 격리)+(정합)PO `/receipts` 목록 entityFilter. **개선**: #359(지출결의서 page/limit+COUNT 페이지네이션)·#362(dashboard·지출결의서 로드실패 스켈레톤 에러UI)·#363(발주요청·입고이력·자금계획 /export/csv, 전부 entityFilter)·#364(inventory_items DROP 마이그0301 **prod 적용완료**, 0행 확인). **#367** CSV formula injection 공용가드(escapeCsvField 단일화, bank.ts 포함 5개 escaper 위임, 숫자 보존). **#366** 업무일자 UTC→KST(+9h): ①회계일 저장(disposed_at·복사 order_date) ②비교필터 카테고리A 11곳(delivery/expected/연체/오늘납기). 커밋 `f9c7ee4`·`1a1247e`·`f216721`·`a6bd8cd`. 단일법인 동작무변(다법인 전환 시 격리 발화). 메모리 [feedback-deploy-push-divergence] 추가
- **보류**: #342(equipment entity_id, 다법인 도입 직전 전용세션), #340(E2E CI 인프라·외부의존), #341·#350 잔여(write경로 N+1, 실데이터 검증세션)
- **owner 운영**: #336 프로덕션 admin/password 교체(+CI SMOKE/E2E 시크릿 갱신)
- **GitHub 후속(미착수)**: #366 카테고리B(대시보드 created_at "오늘"KPI, created_at +9h 래핑 필요·업무시간 정상이라 저우선)·발주목록 `/export/csv`+발주 목록 핸들러 entityFilter(#358계열 신규 발견, 별도 이슈화 권장)·#358~368 owner close 검토 대기

---

## 📌 기존 에러
- (없음) — 2026-05-19 확인: 3건 모두 200 정상

---

> 📦 **2026-06-05 이전 완료 항목은 `PROJECT_STATUS_ARCHIVE.md`로 이관됨** (5/27~6/5 세션 결과 포함).
