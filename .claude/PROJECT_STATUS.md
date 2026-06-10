# PROJECT_STATUS.md — 프로젝트 현황판

> **최종 업데이트**: 2026-06-10
> 완료 이력 → `PROJECT_STATUS_ARCHIVE.md` (매 세션 읽을 필요 없음, 필요 시 참조)

---

## 🔒 편집 중 (충돌 방지)

- (없음)

---

## 🔴 현재 진행 중

- **🟡 [구조 P0] 정적 에셋 전환 파일럿 — shell.js (2026-06-10) — 로컬 완료·검증 PASS·⚠️미커밋·미배포**: 클라 전역 JS `shell.js`(79KB)를 워커 인라인→`/static/shell.<hash>.js` 정적 서빙 전환. **빌드 파이프라인**: `scripts/build-assets.mjs`(esbuild minify·sha256 8자 해시·`dist/static/` 기록·`src/generated/asset-manifest.ts` 생성[커밋]·`dist/_routes.json` exclude `/static/*`·`dist/_headers` immutable). `package.json` `build:assets`→`build` 선행. `layout.ts`: `?raw` 제거→`assetUrl('shell')` `<script src>`. **hono 플러그인 동작 활용**: `_routes.json` 존재 시 미재생성 + `emptyOutDir:false`라 pre-build 산출물 보존. **측정**: 워커 raw 5,341,578→5,262,577B(−79KB/−1.5%)·gzip 1,075,000→1,054,439B(−20.6KB/−1.9%). **검증**: tsc·build OK, smoke 103/103, `/static/shell.*.js` 200+immutable+ETag+304(curl), `/dashboard` HTML에 `<script src>` 주입·inline 0, Playwright 로그인→/cards·/clients 0 console err·`formatKST`=function·**2회차 페이지 shell.js `transferSize:0`(디스크캐시)**. 설계 `docs/design/static-assets-migration.md`. **▶ 다음: 커밋·배포 후 P1(무인자 페이지)~P3(`?raw` 전량 제거)**
- **🟡 세션5 N+1 감사→제거 + 청구 NULL버그 (2026-06-10) — 로컬 완료·검증 PASS·⚠️미커밋·미배포**: **[B] N+1 8파일 25사이트** 루프내 `await c.env.DB` → `db.batch()`/`IN(...)` 1쿼리화: templates(2)·quotations(4, parent batch+last_row_id 인덱스매핑)·purchaseRequests(2)·taxInvoices(5, +cancel)·purchaseInvoices(2, poi·base_price IN선조회)·rip(3, send-bulk 3종 IN선조회)·orders/queries(2, bulk-bill IN+batch / bulk-ship dead쿼리제거+orderInfo선조회)·orders/core(5, thumbnail·auto_process_jobs·PUT items 2pass·card_ids IN·auto-ship/bill). **위험보존**: 청크80=짝수라 주문쌍 분할없음(원자성)·prefetch맵 in-loop갱신으로 동일품목 다중라인 SELECT-after-UPDATE 체인 정확보존(purchaseInvoices base_price·rip dedup·bulk-bill 중복). **제외(본질적 순차)**: weeklyPurchase:241·purchaseRequests:804(`getNextEntitySeqNumber`)·tax batch-create/monthly outer(invoice번호+외부 issueTaxInvoice)·orders/core:1366(notifyRoles). **[D] 상태코드**: 수정 0건(검증가드 이미 400/404/409/403, 500은 전부 catch). 검증: 라우트별 `npm run verify` 전부 OK·smoke 103/103. **verify-changes E2E**: 매입확정(confirm) 부수효과 7종(poi CONFIRMED·PO총액·인보이스·인보이스품목·매입처단가·base_price 0→7777·단가이력) 전부 정확·console 0err. **🔴 일괄청구 검증 중 선재 이중청구 버그 발견·수정**: orders UPDATE 가드 `billing_status != 'BILLED'`가 NULL(청구 전 정상상태) 미매칭(SQLite `NULL!=x`=NULL) → 상태 미반영 + balance 가드부재로 매 호출 증액(2회→이중청구). `!= 'BILLED'` → **`IS NOT 'BILLED'`**(orders/queries bulk-bill + taxInvoices:297 발행경로). 재검증 멱등(3회→1/0/0, balance 1회만). N+1 리팩토링이 동작 보존한 덕에 검증서 노출. 상세→`session-context`, `bug-history`. **▶ 다음: 커밋·배포(deploy-verify)**
- **🟢 세션4 UI 일관성 감사→수정 (2026-06-10) — prod 배포·push 완료**: ①**P1 오프팔레트→시맨틱5색**(30파일 UI크롬): purple/indigo/cyan/teal/emerald→blue/green/amber/red/gray. 버튼·탭·포커스링·토글·상태패널·헤딩→blue, 이력헤딩→gray, emerald 확정·성공버튼→green(유지), KPI숫자→기본색(#212529), "대기"pill→gray. **KEEP(준차트 예외=색이 분류정보)**: 승인/근태/품목/미디어(롤=cyan)/인보이스/결제수단/정비/법인/스캔 뱃지 + 채널색(email=purple) + 차트 series. **제외**: 차트페이지(reports·productionReports·dashboard·cashFlow·forecast 등). ②**P2 이모지→FontAwesome**(12파일): messages 채널/대상버튼·cardDetail ☑☐·settings ✅❌⏳·iaBatchTest·forecast🔥·dashboard/iaScan⚠·production✔·portalBalance🔗 등. **유지**: alert/toast 텍스트 ⚠️(심각도=type 전달)·uiGuide 금지예시 인용·추세글리프▲▼●. ③**P3 hex→Tailwind 매핑표**=`.claude/references/hex-to-tailwind-map.md`(일괄치환 보류, 신규/수정 코드부터). ④**P4** bank CTA bg-blue-600·fa-search 버튼 라벨 "검색" 통일(4곳). 커밋 `b2becedc`·`58761bb3`(⏳ 보완)→merge·push `274793fe`, dep `d211d46a`. 검증: build·tsc·smoke 103/103, prod 14/14페이지·이모지0·회귀0. **교훈: 이모지 grep에 U+2300-23FF(시계/모래시계) 포함**(첫 스캔 누락→settings ⏳ 배포후 발견). 상세→`session-context`.
- **🟢 세션3 알림톡 실발송·UI·성능 (2026-06-10) — prod 배포·검증 완료**: ①**카카오 알림톡 실발송 성공**(커밋 `9bf1cb2e`): 3 root-cause 버그를 바로빌 공식 오류코드로 확정(dev.barobill.co.kr SPA를 Playwright로 렌더해 읽음). SenderID 빈값→**-24005**(사업자·아이디 불일치)=연동아이디 `DONGSAN` 채움 / SmsReply='Y' 무효→**-31325**(대체문자 유형오류)=유효값 E/A/N(기본 N, `smsReplyOf`) / 성공판정=알림톡 접수번호는 비숫자 SendKey라 음수만 실패로 수정(`interpretReceipt`). **SendKey `BB_3148184311_AT_3901210_260609` 수신·실착신 확인(용준님)**. 부수: listATSTemplate(ChannelId 필수·필드명) 4템플릿 정상, 대량발송 ArrayOfString 해석, 중복호출 제거, 로그 음수 SUCCESS 오기록 3건 정정. ②**주문관리 테이블 잘림**(`67a5248d`): 상태 아이콘 제거('...')+납기일 ord-due overflow(지연 뱃지). ③**카드 로딩**(마이그 `0304` prod 적용): 복합 인덱스+date sargable, API 45–72ms. ④**출고 수동발송 정합**(`0a329a02`): autoCodeMap 실제 템플릿명. 상세→`session-context`, 메모리 `project-alimtalk-status`.
- **🟢 세션2 코드품질·멀티테넌시·배송버그 (2026-06-09) — prod 배포·검증 완료**: ①**저장소 위생**: PII 8건 git filter-repo 제거+force-push(협업자 re-clone 필수), layout.ts 3259→228 분할, getElementById lint(`npm run check:dom`)·hooks(settings.json)/docs(archive)/seed(seed/) 정리. ②**equipment/cards 멀티테넌시 격리**(#342 0302): facility·equipmentQueue·cards/queries·dashboard·aiInsights에 entityFilter('e')/cardEntityFilter('c'=requesting_entity_id) 배선(커밋 `5c1e11f0`·`d40dc096`·`3796ef84`). zero-filter(caps/hrSelf/payroll-shared)=정상 스코핑. ③**리포트 6스크립트 getElementById 가드**(`aea1de3e`). ④**마이그 추적 동기화**: 로컬 0299~0302·prod 0282~0303 마커검증→기록(양쪽 미적용 0). ⑤**회계/리포트 smoke+11·e2e+6**(`dea5fc31`, smoke 103/103). ⑥**delivery_method 'SAME' 버그**(`c4042d35`): 생성/임포트 INSERT가 필드 누락→DEFAULT 'SAME' 저장. INSERT 명시화(`\|\| '방문수령'`)+클라 폴백 한글화+마이그`0303`(prod 227→0). DEFAULT 변경은 FK CASCADE 위험으로 미수행. **prod 실검증: e2e_tester 미전송 생성→'방문수령'**. 상세→`session-context`.
- **🟢 GitHub 이슈 8건 배치 처리 (2026-06-09) — prod 배포·전건 closed**: #369(입고취소 멱등 가드+balance_after 메모리산출 단일 batch 원자화)·#342(설비 entity_id 격리(나)+마이그 `0302`+rip.ts 전경로 배선)·#370(독촉 이력 테이블 배선+zoneSummary+레거시/dead code 정리)·#340(crud-order E2E DELETE 2회로 잔여0)·#350(sync-attendance GROUP BY·PO IN절·priority3 batch)·#341(p1 recentPO window prefetch, p2/p3는 부분성공 유지로 미전환)·#336(CI 폴백 기제거+위험수용)·#366(표시층 `formatKST`+백엔드 `utils/kstDate.ts`, **대시보드 '오늘'KPI created_at UTC비교 9h누락버그 prod실측·수정** old2→new12). 배포 e159f95e·b7be5241·01b7b7ae·2639f76e. **신규 date 코드는 kstDate/formatKST 사용**(`reference-kst-helpers`). 상세→`session-context`.
- **🟢 카드/주문 상태모델 단일화 (#1·2·3·4) — prod 배포·검증 완료**: 이중 상태모델(PRINT_PENDING vs PRINTING+rip_status) 충돌이 공통원인. 4 Phase 배포(P1 보드버킷 status기준→#2 / P2 PRINTING=LogWatcher단일화→#3 / P3 유통 즉시SHIPPED→#1 / P4 레거시 마이그0298). **prod 검증: 보드 출력대기에 PRINT_PENDING 카드 노출**, #1 유통 bulk-ship→즉시 SHIPPED, #3 baseline 주문 CONFIRMED 정상. **✅ 실사용 UI 확인 완료(2026-06-05, prod Playwright)**. **✅ 상태 라벨 단일소스화 완료(커밋 `b9b03ea`)**: `src/utils/statusLabels.ts`→`window.MES_STATUS`(layout+portalLayout 주입)→16스크립트 전역참조. **✅ origin/main 동기화 완료**(현 `e598392`). 설계 → `docs/superpowers/specs/2026-06-05-status-model-unification.md`, 메모리 `session-context`.
- **바로빌 멀티계정 — 계좌·카드 법인별화**: **prod 배포 완료(0be34406)**. 글로벌 corpNum 하드코딩 4곳 법인별화(`barobill.ts`·`cardExpenses.ts`·`bank.ts×2` → `getEntityCorpNum`), CERTKEY 전역 유지, 각 법인 자체 corpNum(청주 회원사 등록 완료). 마이그 없음·HTTP 스모크 통과. **▶ 실사용 검증=선명/청주 회원사·서비스·계좌/카드/발신번호 바로빌 등록 후**(용준님). 상세 → `docs/superpowers/specs/2026-06-03-receivables-purchase-barobill-brainstorm.md`
- **미수금 회수예측 (4-3 확장)**: **4-3a 시점 + 4-3b 회수율 둘 다 prod 배포 완료**. 4-3a(9d40b745) 거래처별 결제주기(NET/MONTHLY, 마이그 `0288`) → cashSchedule·cashflowEngine 입금예정 날짜 현실화. 4-3b(6a613633) IFRS9 provision matrix(마이그 `0289` `ar_provision_rates`·`ar_grade_multipliers`) → `/bank` 미수금 탭 예상회수액 KPI. **▶ 용준님 실사용 테스트**. 후속: 4-3a-2 median lag, 충당률 편집 UI, 4-3c 조기경보. 설계 → `docs/superpowers/specs/2026-06-03-receivables-purchase-barobill-brainstorm.md`
- **매입 관리 — 입고·매입확정 분리**: **P1~P3 전체 prod 배포 완료**. P1(6c72eb4b) 발주 단가미정(`price_status`)·입고 거래명세서 첨부(`statement_file_key`,R2,마이그 `0287`). P2(9949a74c) 매입확정 페이지 `/purchase-invoices`. P3(d2f76f4c) 매입확정 시 `cash_schedule` OUT(지급예정) UPSERT. **▶ 용준님 실사용 테스트 대기**. 잔여: 그룹연쇄(price_linked)·부분확정 후순위.
- **자금 예측/계획 일원화**: **Phase 1~4 + 4-3 미수금↔입금예정 + prod 배포·검증 완료**(5탭 허브·하이브리드 엔진·시작잔액 prefill·은행매칭→DONE). **✅ 4-3(커밋 `607b3e4`)**: cashflowEngine ④에 BILLED-미물질화 주문을 ORDER_EXPECTED로 합성(거래처 balance cap·이중계산 방지) + `/bank` 미수금 탭 '예상 입금일'. **▶ 백로그: 카드 예측**(corporate_cards에 cutoff_day/payment_day 추가 후)·월별요약 KPI수입 일관성·apply→DONE 운영검증. 설계 → `memory/project-cashflow-unification.md`

> **다음 세션 TODO**: ⓪**[세션5 미배포]** N+1 8파일 + 청구 NULL버그 수정 = 로컬 검증완료·**미커밋·미배포** → `/deploy-verify`로 커밋·배포(write경로라 smoke 외 prod 회귀주의). 변경파일: orders/core·orders/queries·purchaseInvoices·purchaseOrders/templates·purchaseRequests·quotations·rip·taxInvoices ①향후 기성 PRODUCT는 품목 UI '기성품' 토글로 지정(코드 완비) ②혼합주문(제작+기성) 부분출고·재고차감 실사용 모니터링 ③cards 외 스키마 드리프트 의심 시 PRAGMA 확인 ④#329(3) withSeqRetry INSERT 래핑(후순위) ⑤로컬 dev:d1 중복 정리 ⑥자금 후속(백로그): 카드 예측(corporate_cards cutoff/payment_day 추가 후), 월별요약 KPI수입 일관성 ⑦DB 초기화 시 마이그(0106·0071) 재적용+permission_pages seed / **[#336 closed·위험수용]** admin/password 강화는 owner 수용으로 보류(원하면 codebase hashPassword로 prod UPDATE 가능) ⑧**한진 송장 자동화**: export(엑셀 일괄) prod 완료 / import(송장 일괄입력) 대기=한진 양식·출고번호 보존 확인 후 ⑨**✅ 알림톡 발송 동작 확정(2026-06-10)** — 템플릿 4종 승인·실발송 성공. **잔여=출고 자동발송 구현(option C, order.delivery_method 매핑)·한진 템플릿 등록·`barobill_test_mode=0` go-live** ⑩**[용준님] 거래처 배송방식 개별 정리**(생성버그 수정완료=신규는 '방문수령' 저장. 기존 '방문수령' 통합분 중 실제 택배/화물 거래처는 개별 정리 필요) ⑪바로빌 `order_received` 등록 후 `orders.js` autoTemplate 확정 ⑫**주문접수 멀티법인 협업 후속(미착수)**: (a)Phase 4 내부정산 집계(spec §9~11) (b)Phase 5 거래처 셀프 주문 포털 (c)[용준님] 코디네이터 사용자 지정(`/users` 토글, 지정 후 재로그인 필수) (d)실사용 검증=유통/견적 담당 실저장·타법인 교차열람 ⑬**[#366 선택잔여]** 타 8파일 `date('now','+9 hours')` 리터럴 ~24곳 헬퍼 점진치환 + 일/주/월 추이차트 그룹핑 KST 버킷(우선순위 낮음) ⑭**[#342 후속]** equipment 격리 — facility/equipmentQueue/cards-queries/dashboard/aiInsights는 배선 완료(세션2). **잔여=scheduling/printSystem의 equipment 읽기** 다법인 운영 시작 시 배선 ⑮**[#372 미착수]** CSV export 5엔드포인트 LIMIT 5000 silent truncation 경고/페이지네이션

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
- **✅ 알림톡 발송 동작 확정(2026-06-10)**: 템플릿 4종(대신화물 출고·대신택배 출고·방문 수령 준비 완료·미수금) 승인 완료, 실발송 성공(SendKey 수신). 3버그(SenderID/SmsReply/성공판정) 수정·배포(커밋 9bf1cb2e). **대기**: SMS 발신번호 승인(대체문자 E/A용), 한진택배 템플릿 등록, **barobill_test_mode=0 전환(go-live)**, 나머지 카드/계좌 등록
- **알림톡 코드 정합 완료**(2026-06-03): 출고 4종·주문접수·미수금 템플릿 코드 연동. **버튼 미전송**(sendATS) → 링크는 본문. **한진 송장 수동입력**(자동화 조사 완료)

### [선명2 CAPS Worker 설치] — PC 설정 대기
- S2 사이트 DB 등록 완료, API_KEY 발급됨. 선명2 PC에 caps-worker 폴더 복사 + .env 설정 + 실행 필요

### [배송 관리 최적화] — 출고 대기 보드
- 배송방법별 그룹화 + 마감시간 카운트다운 + 일괄 출고 + 카카오톡 발송
- **✅ 수동 알림톡 발송 정합(2026-06-10, 커밋 0a329a02)**: autoCodeMap 실제 템플릿명 교정 + 모달 본문순서. **자동발송=다음 세션**(option C, order.delivery_method 매핑; 트리거 shipments.ts:504 이미 배선, template_code+resolveMsg만 채우면 됨). '배송' 381건은 E2E noise였음(실데이터는 택배사 정상 지정)
### [기존 계약 일괄 등록] — 엑셀 import 스크립트 제공 대기
### [라벨 프린터 인쇄] — 프린터 모델 확인 필요 (외부 의존)
### [RIP 전송] — 코드 완료, 현장 테스트 대기 (외부 의존)
### [LogWatcher PrintExp] — 구현 완료, 현장 배포 대기 (외부 의존)
### [한진택배 자동화] — 솔루션 선정 대기 (사용자 결정 필요)

### [GitHub 이슈 백로그]
- **✅ 처리완료·배포·close(2026-06-05)**: #355·356·335·351·352·357·349 + **#343·#345·#353·#354·#346**(커밋 `0c04fad`) + **#344**(커밋 `0ce9c42`) — dead-filter(생산보드/원가/메시지/활동로그/매입)·CSV(cashSchedule·검수)·검수 공급업체 드롭다운·연차 부서필터·휴가 날짜·불량률→검수 드릴다운·**미사용수당 정합버그 수정** + **포털 셀프서비스**(세금계산서 다운로드/연도필터/페이지네이션·미수금 aging·재주문 모달). prod 배포(`webapp-9i0.pages.dev`), 사내 9페이지 스모크 통과·포털 신규 라우트 401 확인. **▶ 포털 실동작은 포털 계정 실사용 검증 권장**
- **N+1 검증세션(2026-06-06)**: **#341 cashFlow projection 집계(72→6쿼리)·#350 payroll hoist+exists/empRow prefetch 검증·배포 완료**(커밋 `1737ebc`·`fa4d196`, dep `fdf92b4c`). 검증법=cashFlow는 프로덕션 baseline 비교(months 1/3/6/12 완전일치), payroll은 로컬 48명 더미월 실행→DELETE 롤백→재실행 비교(48행 완전일치). **잔여=write batch**(purchaseRequests PR→PO·import루프·sync-attendance·PO품목·child INSERT): baseline 비교 구조적 불가(실행=상태변경) → 스테이징/실데이터 스냅샷 준비 후 별도 세션. **로컬 D1에 cashFlow/orders/payments 데이터 0건**이라 read 검증은 프로덕션 의존
- **✅ 이슈 일괄 처리·배포·코멘트(2026-06-08, 2026-06-09 close 완료)**: 11건. **IDOR 보안**(#349/#356 entityFilter 패턴): #358(approvals 10핸들러)·#360(quotations GET/PUT/DELETE/:id+convert·cardExpenses cards)·#361(autoProcess 4, /pending 동일필터라 폴링안전)·#365(files.ts GET→requireRole ADMIN)·#368(storage-zones all_entities ADMIN/MANAGER 게이트+/:id 격리)+(정합)PO `/receipts` 목록 entityFilter. **개선**: #359(지출결의서 page/limit+COUNT 페이지네이션)·#362(dashboard·지출결의서 로드실패 스켈레톤 에러UI)·#363(발주요청·입고이력·자금계획 /export/csv, 전부 entityFilter)·#364(inventory_items DROP 마이그0301 **prod 적용완료**, 0행 확인). **#367** CSV formula injection 공용가드(escapeCsvField 단일화, bank.ts 포함 5개 escaper 위임, 숫자 보존). **#366** 업무일자 UTC→KST(+9h): ①회계일 저장(disposed_at·복사 order_date) ②비교필터 카테고리A 11곳(delivery/expected/연체/오늘납기). 커밋 `f9c7ee4`·`1a1247e`·`f216721`·`a6bd8cd`. 단일법인 동작무변(다법인 전환 시 격리 발화). 메모리 [feedback-deploy-push-divergence] 추가
- **보류**: #342(equipment entity_id, 다법인 도입 직전 전용세션), #340(E2E CI 인프라·외부의존), #341·#350 잔여(write경로 N+1, 실데이터 검증세션)
- **owner 운영**: #336 프로덕션 admin/password 교체(+CI SMOKE/E2E 시크릿 갱신)
- **✅ 발주(purchase_orders) IDOR 전수 수정·배포(#371, 2026-06-09)**: 목록(GET /)만 격리돼 있고 **export+/:id 9핸들러 미격리**였음 → GET /:id·/invoice·/inspections·PUT·PATCH status·DELETE·receive·copy(원본)·reorder(원본) 조회부 + /export/csv에 entityFilter 추가(커밋 `5c77a67`·`58b37a9`, dep `33065000`). 자식테이블(po_id)·최종 DELETE는 부모 격리로 게이트. prod 발주 0건이라 /:id positive 실측 불가(존재X→404·빌드로 갈음). 잔여=`templates/:id`·`stock-alerts/:id`(별도 테이블) 점검
- **✅ close 완료(2026-06-09)**: #358·359·360·361·362·363·364·365·367·368·371 (11건, 수정·배포·검증 후 owner close).
- **남은 open 이슈 8건**: ⏸️owner/검증세션=#336(prod 비번)·#340(E2E CI)·#341·#350(write경로 N+1)·#342(설비 entity 다법인 시점) / 🆕미착수 actionable=**#369**(입고검수 전량취소 멱등·재고 이중차감)·**#370**(HTML↔JS silent-fail, 독촉이력 조회/삭제 등 5건) / 부분=**#366** ②카테고리B(대시보드 created_at "오늘"KPI, 저우선)·templates/stock-alerts /:id IDOR 점검(별도)

---

## 📌 기존 에러
- (없음) — 2026-05-19 확인: 3건 모두 200 정상

---

> 📦 **2026-06-05 이전 완료 항목은 `PROJECT_STATUS_ARCHIVE.md`로 이관됨** (5/27~6/5 세션 결과 포함).
