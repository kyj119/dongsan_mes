# PROJECT_STATUS_ARCHIVE.md — 완료 이력

> 이 파일은 PROJECT_STATUS.md에서 분리된 완료 항목 아카이브입니다.
> AI 에이전트가 매 세션 읽을 필요 없음. 필요 시 수동 참조.

---

### 2026-06-05 (상태모델 단일화 + 정기변동비 + 후가공 + 자금 4-3)
- [상태모델 단일화] 카드/주문 이중 상태모델(PRINT_PENDING vs PRINTING+rip_status) 충돌 4 Phase 해소: 보드 status기준·PRINTING=LogWatcher 단일화·유통 즉시 SHIPPED·마이그 0298. 상태 라벨 단일소스화(`statusLabels.ts`→`window.MES_STATUS`, 16스크립트). 커밋 210585e·b9b03ea, spec `2026-06-05-status-model-unification.md`
- [정기변동비 Phase1~3] fixed_expenses ESTIMATED 확장(마이그 0299)+`expenseEstimator.ts`(AVG_3M/SAME_MONTH_LAST_YEAR)+cashflowEngine 분기. 커밋 8a786c4. Phase4(정산)·5(UI) 대기
- [후가공 연결 복구] `printSystem.ts` items-for-order에 `LEFT JOIN pp_applicable_subcategories`. 커밋 55e097e. 소재별 소분류 매핑(운영) 남음
- [자금 4-3] BILLED-미물질화 주문을 ORDER_EXPECTED 합성(거래처 balance cap·이중계산 방지)+미수금 예상입금일. 커밋 607b3e4
- [바로빌 멀티계정] corpNum 법인별화(`getEntityCorpNum` 4곳), CERTKEY 전역. dep 0be34406. 실사용 검증 대기
- [미수금 회수예측] 4-3a 결제주기(마이그 0288)+4-3b IFRS9 provision matrix(마이그 0289, `provisionMatrix.ts`). 커밋 9d40b745·6a613633

### 2026-06-04 (주문접수 멀티법인 협업 MVP + 채번/재고 버그)
- [멀티법인 협업] 방향전환: 강제분리 폐기→유연한 그릇(`order_items.assigned_entity_id` 품목별 담당). P1 담당태그+추천(마이그 0292)→P2 카드 담당법인별 생성·알림→재고차감 담당법인 우선(마이그 0293)→유통/견적 담당 셀렉트(마이그 0294)→코디네이터 교차가시성(마이그 0295). spec `2026-06-04-order-intake-entity-split.md`
- [버그] orders POST 채번 billingEntityId 불일치 수정(커밋 e487a45), 채번 E{eid} 통일(PR/클레임/반품), inventory_transactions 부분 UNIQUE에 entity_id 추가

### 2026-06-03 (자금 일원화 Phase1~4 + 매입관리 + 규격 + 한진/카카오)
- [자금 일원화] 캐시플로 탭→`/cash-schedule` 흡수(5탭 허브), `cashflowEngine.ts` 하이브리드 엔진(물질화+온더플라이), monthly/forecast, 시작잔액 prefill, 은행매칭→DONE
- [매입관리] 입고·매입확정 분리 P1~P3: 단가미정 발주·거래명세서 첨부(마이그 0287)·`/purchase-invoices`·지급예정 UPSERT
- [규격] `order_items.specification`(폭) 전면(마이그 0291)+주문 일괄 상태변경
- [한진/카카오] 한진 export(엑셀 일괄), 알림톡 템플릿 6종, 거래처 배송방식 7종(마이그 0290)

### 2026-06-02 (상태CHECK 버그 + GitHub 이슈 11건 + 견적 개편)
- [버그] cards.status CHECK에 PRINT_PENDING 누락→PRODUCTION 주문 500(마이그 0284), card_number 충돌 수정
- [이슈] #323~333 전수 수정·close(보안격리·cascade·채번·홈택스 dedup 마이그 0282/0283)
- [기성품/유통 즉시출고] `items.production_required`(마이그 0285·0286), 카드 미생성·즉시 SHIPPED·출고 재고차감
- [견적] 관리 개편(표·품목·전환 prefill)+생산주문서 유통품목 행 단순화+채번 경계 버그 근본수정(E{eid} 내장)

### 2026-06-01 (거래처원장 + GitHub 이슈 29건)
- [원장] 전기이월·기간컨트롤·실계산 미수, 표헤더 정렬 전역 수정(layout.ts `.ds-table thead th`)
- [이슈] 29건 전수 종료(런타임500·멀티법인격리·UNIQUE·보안, 마이그 0278~0281)

### 2026-05-29~31 (근태 개편 + 법인카드)
- [근태] 레이아웃 전면 개편(11→5 집계열·31일 고정)+유형별 지각/조퇴 스마트 처리(기준시간 맵)
- [법인카드] 마감일 cutoff_day(마이그 0273)+캐시플로 결제예정 배지, 영수증 바로 첨부(R2)

### 2026-05-28 (단가 관리 시스템)
- 매입/매출 2탭, item_group 통합(price_groups 폐기), 입고 자동갱신 연쇄(마이그 0267·0268)

### 2026-05-27 (법인 분리 전체 감사)
- 174테이블 전수 감사(`docs/entity-separation-map.md`), Issues #217~234 Phase1~3 18건 close(마이그 0264~0266)

---

### 2026-04-29 (CAPS on-prem 완료 처리)
- [CAPS] 경리 PC에서 CAPS DB 연동 완료, 자동 시작 + 수동 트리거 모두 작동 확인
- 동기화 하루 3회 (09:00/13:00/19:00) + 근태 페이지 수동 버튼, VBS 래퍼 백그라운드 실행

### 2026-04-25 (재고차감 구조 설계 + 품목 체계 리뷰)
- [설계] 재고차감 통합 설계서 작성: ROLL(yd, 0.1올림) + SHEET(㎡, 면적 기반) 2트랙
- [설계] 품목 체계 전체 리뷰: 코드 범위 현행 유지, category_id TEXT 통일, GOODS 자동설정
- [설계] product_materials 자동 생성 (소재 일괄 등록 시 parent_media_id 매칭)
- [설계] 역할별 기본 품목 필터 (계정 관리 페이지, is_sales/is_purchase 대체)
- [문서] `docs/superpowers/specs/2026-04-25-inventory-deduction-redesign.md` 신규

### 2026-04-24~25 (품목 체계 개편)
- [DB] migration 0154~0158: print_methods/media 테이블, items/order_items 확장, price_change_history
- [API] printSystem.ts 신규: 출력방식/소재/연결 CRUD 12개 엔드포인트
- [UI] items.ts/js: 6탭, 소재 일괄 추가, 단가 이력 모달
- smoke: 60/60 PASS

### 2026-04-23 (이카운트 → MES 거래처 이관)
- [이관] 이카운트 ERP 거래처 2,660건 MES 임포트 완료
- [DB] 마이그레이션 0153, [도구] 변환/검증/보정 스크립트 3개

### 2026-04-22 (코드 리뷰 + 정리 + 멀티사업자 + 리팩토링)
- escapeHtml/금액 포맷 전역 통합, 멀티사업자 인감도장, 고아 정리

### 2026-04-20~21 (메시징 + CAPS + 카드 + PrintExp)
- SMS/카카오톡/이메일 발송 성공, CAPS 동기화, PrintExp 파서

### 2026-04-17 (통합 메시지 + 포털 + UI + 보안 + 검증)
- 4채널 메시지 시스템, 포털 고도화, 보안 감사, smoke 55/55 PASS
- CLAUDE.md 575→121줄 감축

### 2026-04-15 (검수 UI + 타입체크 + 라우트 분할)
- 검수 UI 전체 구현, tsc 타입체크 게이트 구축
- payroll/purchaseOrders/ledger/orders 라우트 분할
- 마이그레이션 0131까지 적용

### 2026-04-10 (심층 검증)
- Track 1 Phase 2 디자인 일관성, 보안 감사, alert→showToast 325건
- Phase B3/B4/B5 완료

### 2026-04-08 (급여/인사 확장 + 개발 환경)
- B1 추가근무/요율, B2 급여명세서, B4 연말정산
- smoke.cjs 신규, templates/ 신규

### 2026-04-05
- 카카오 알림톡 연동, 빌드 에러 수정

### 2026-04-04
- UI/UX 개선 v2 (13항목)

### 2026-03-31
- 주문 무결성 감사, security-audit 스킬

### 2026-03-30
- IA 자동화: ExtractGroups v5, ProcessOrderItem v2, OpenCV, TestRunner

### 2026-03-28
- 설정 페이지 통합

### 2026-03-27
- 문서 정리

### 2026-03-25
- Items 원단폭, 재고실사, 원가 분석

### 2026-03-24
- IA 학습 파이프라인 (이후 폐기)

---

### 2026-06-09~10 완료 세션 (2026-06-10 컨텍스트 최적화로 PROJECT_STATUS에서 이관)

- **🟢 세션4 UI 일관성 감사→수정 (2026-06-10) — prod 배포·push 완료**: ①**P1 오프팔레트→시맨틱5색**(30파일 UI크롬): purple/indigo/cyan/teal/emerald→blue/green/amber/red/gray. 버튼·탭·포커스링·토글·상태패널·헤딩→blue, 이력헤딩→gray, emerald 확정·성공버튼→green(유지), KPI숫자→기본색(#212529), "대기"pill→gray. **KEEP(준차트 예외=색이 분류정보)**: 승인/근태/품목/미디어(롤=cyan)/인보이스/결제수단/정비/법인/스캔 뱃지 + 채널색(email=purple) + 차트 series. **제외**: 차트페이지(reports·productionReports·dashboard·cashFlow·forecast 등). ②**P2 이모지→FontAwesome**(12파일): messages 채널/대상버튼·cardDetail ☑☐·settings ✅❌⏳·iaBatchTest·forecast🔥·dashboard/iaScan⚠·production✔·portalBalance🔗 등. **유지**: alert/toast 텍스트 ⚠️(심각도=type 전달)·uiGuide 금지예시 인용·추세글리프▲▼●. ③**P3 hex→Tailwind 매핑표**=`.claude/references/hex-to-tailwind-map.md`(일괄치환 보류, 신규/수정 코드부터). ④**P4** bank CTA bg-blue-600·fa-search 버튼 라벨 "검색" 통일(4곳). 커밋 `b2becedc`·`58761bb3`(⏳ 보완)→merge·push `274793fe`, dep `d211d46a`. 검증: build·tsc·smoke 103/103, prod 14/14페이지·이모지0·회귀0. **교훈: 이모지 grep에 U+2300-23FF(시계/모래시계) 포함**(첫 스캔 누락→settings ⏳ 배포후 발견). 상세→`session-context`.
- **🟢 세션3 알림톡 실발송·UI·성능 (2026-06-10) — prod 배포·검증 완료**: ①**카카오 알림톡 실발송 성공**(커밋 `9bf1cb2e`): 3 root-cause 버그를 바로빌 공식 오류코드로 확정(dev.barobill.co.kr SPA를 Playwright로 렌더해 읽음). SenderID 빈값→**-24005**(사업자·아이디 불일치)=연동아이디 `DONGSAN` 채움 / SmsReply='Y' 무효→**-31325**(대체문자 유형오류)=유효값 E/A/N(기본 N, `smsReplyOf`) / 성공판정=알림톡 접수번호는 비숫자 SendKey라 음수만 실패로 수정(`interpretReceipt`). **SendKey `BB_3148184311_AT_3901210_260609` 수신·실착신 확인(용준님)**. 부수: listATSTemplate(ChannelId 필수·필드명) 4템플릿 정상, 대량발송 ArrayOfString 해석, 중복호출 제거, 로그 음수 SUCCESS 오기록 3건 정정. ②**주문관리 테이블 잘림**(`67a5248d`): 상태 아이콘 제거('...')+납기일 ord-due overflow(지연 뱃지). ③**카드 로딩**(마이그 `0304` prod 적용): 복합 인덱스+date sargable, API 45–72ms. ④**출고 수동발송 정합**(`0a329a02`): autoCodeMap 실제 템플릿명. 상세→`session-context`, 메모리 `project-alimtalk-status`.
- **🟢 세션2 코드품질·멀티테넌시·배송버그 (2026-06-09) — prod 배포·검증 완료**: ①**저장소 위생**: PII 8건 git filter-repo 제거+force-push(협업자 re-clone 필수), layout.ts 3259→228 분할, getElementById lint(`npm run check:dom`)·hooks(settings.json)/docs(archive)/seed(seed/) 정리. ②**equipment/cards 멀티테넌시 격리**(#342 0302): facility·equipmentQueue·cards/queries·dashboard·aiInsights에 entityFilter('e')/cardEntityFilter('c'=requesting_entity_id) 배선(커밋 `5c1e11f0`·`d40dc096`·`3796ef84`). zero-filter(caps/hrSelf/payroll-shared)=정상 스코핑. ③**리포트 6스크립트 getElementById 가드**(`aea1de3e`). ④**마이그 추적 동기화**: 로컬 0299~0302·prod 0282~0303 마커검증→기록(양쪽 미적용 0). ⑤**회계/리포트 smoke+11·e2e+6**(`dea5fc31`, smoke 103/103). ⑥**delivery_method 'SAME' 버그**(`c4042d35`): 생성/임포트 INSERT가 필드 누락→DEFAULT 'SAME' 저장. INSERT 명시화(`|| '방문수령'`)+클라 폴백 한글화+마이그`0303`(prod 227→0). DEFAULT 변경은 FK CASCADE 위험으로 미수행. **prod 실검증: e2e_tester 미전송 생성→'방문수령'**. 상세→`session-context`.
- **🟢 GitHub 이슈 8건 배치 처리 (2026-06-09) — prod 배포·전건 closed**: #369(입고취소 멱등 가드+balance_after 메모리산출 단일 batch 원자화)·#342(설비 entity_id 격리(나)+마이그 `0302`+rip.ts 전경로 배선)·#370(독촉 이력 테이블 배선+zoneSummary+레거시/dead code 정리)·#340(crud-order E2E DELETE 2회로 잔여0)·#350(sync-attendance GROUP BY·PO IN절·priority3 batch)·#341(p1 recentPO window prefetch, p2/p3는 부분성공 유지로 미전환)·#336(CI 폴백 기제거+위험수용)·#366(표시층 `formatKST`+백엔드 `utils/kstDate.ts`, **대시보드 '오늘'KPI created_at UTC비교 9h누락버그 prod실측·수정** old2→new12). 배포 e159f95e·b7be5241·01b7b7ae·2639f76e. **신규 date 코드는 kstDate/formatKST 사용**(`reference-kst-helpers`). 상세→`session-context`.
- **🟢 카드/주문 상태모델 단일화 (#1·2·3·4) — prod 배포·검증 완료**: 이중 상태모델(PRINT_PENDING vs PRINTING+rip_status) 충돌이 공통원인. 4 Phase 배포(P1 보드버킷 status기준→#2 / P2 PRINTING=LogWatcher단일화→#3 / P3 유통 즉시SHIPPED→#1 / P4 레거시 마이그0298). **prod 검증: 보드 출력대기에 PRINT_PENDING 카드 노출**, #1 유통 bulk-ship→즉시 SHIPPED, #3 baseline 주문 CONFIRMED 정상. **✅ 실사용 UI 확인 완료(2026-06-05, prod Playwright)**. **✅ 상태 라벨 단일소스화 완료(커밋 `b9b03ea`)**: `src/utils/statusLabels.ts`→`window.MES_STATUS`(layout+portalLayout 주입)→16스크립트 전역참조. **✅ origin/main 동기화 완료**(현 `e598392`). 설계 → `docs/superpowers/specs/2026-06-05-status-model-unification.md`, 메모리 `session-context`.

#### GitHub 이슈 백로그 완료분
- **✅ 처리완료·배포·close(2026-06-05)**: #355·356·335·351·352·357·349 + **#343·#345·#353·#354·#346**(커밋 `0c04fad`) + **#344**(커밋 `0ce9c42`) — dead-filter(생산보드/원가/메시지/활동로그/매입)·CSV(cashSchedule·검수)·검수 공급업체 드롭다운·연차 부서필터·휴가 날짜·불량률→검수 드릴다운·**미사용수당 정합버그 수정** + **포털 셀프서비스**(세금계산서 다운로드/연도필터/페이지네이션·미수금 aging·재주문 모달). prod 배포(`webapp-9i0.pages.dev`), 사내 9페이지 스모크 통과·포털 신규 라우트 401 확인. **▶ 포털 실동작은 포털 계정 실사용 검증 권장**
- **N+1 검증세션(2026-06-06)**: **#341 cashFlow projection 집계(72→6쿼리)·#350 payroll hoist+exists/empRow prefetch 검증·배포 완료**(커밋 `1737ebc`·`fa4d196`, dep `fdf92b4c`). 검증법=cashFlow는 프로덕션 baseline 비교(months 1/3/6/12 완전일치), payroll은 로컬 48명 더미월 실행→DELETE 롤백→재실행 비교(48행 완전일치). **잔여=write batch**(purchaseRequests PR→PO·import루프·sync-attendance·PO품목·child INSERT): baseline 비교 구조적 불가(실행=상태변경) → 스테이징/실데이터 스냅샷 준비 후 별도 세션. **로컬 D1에 cashFlow/orders/payments 데이터 0건**이라 read 검증은 프로덕션 의존
- **✅ 이슈 일괄 처리·배포·코멘트(2026-06-08, 2026-06-09 close 완료)**: 11건. **IDOR 보안**(#349/#356 entityFilter 패턴): #358(approvals 10핸들러)·#360(quotations GET/PUT/DELETE/:id+convert·cardExpenses cards)·#361(autoProcess 4, /pending 동일필터라 폴링안전)·#365(files.ts GET→requireRole ADMIN)·#368(storage-zones all_entities ADMIN/MANAGER 게이트+/:id 격리)+(정합)PO `/receipts` 목록 entityFilter. **개선**: #359(지출결의서 page/limit+COUNT 페이지네이션)·#362(dashboard·지출결의서 로드실패 스켈레톤 에러UI)·#363(발주요청·입고이력·자금계획 /export/csv, 전부 entityFilter)·#364(inventory_items DROP 마이그0301 **prod 적용완료**, 0행 확인). **#367** CSV formula injection 공용가드(escapeCsvField 단일화, bank.ts 포함 5개 escaper 위임, 숫자 보존). **#366** 업무일자 UTC→KST(+9h): ①회계일 저장(disposed_at·복사 order_date) ②비교필터 카테고리A 11곳(delivery/expected/연체/오늘납기). 커밋 `f9c7ee4`·`1a1247e`·`f216721`·`a6bd8cd`. 단일법인 동작무변(다법인 전환 시 격리 발화). 메모리 [feedback-deploy-push-divergence] 추가
- **✅ 발주(purchase_orders) IDOR 전수 수정·배포(#371, 2026-06-09)**: 목록(GET /)만 격리돼 있고 **export+/:id 9핸들러 미격리**였음 → GET /:id·/invoice·/inspections·PUT·PATCH status·DELETE·receive·copy(원본)·reorder(원본) 조회부 + /export/csv에 entityFilter 추가(커밋 `5c77a67`·`58b37a9`, dep `33065000`). 자식테이블(po_id)·최종 DELETE는 부모 격리로 게이트. prod 발주 0건이라 /:id positive 실측 불가(존재X→404·빌드로 갈음). 잔여=`templates/:id`·`stock-alerts/:id`(별도 테이블) 점검
- **✅ close 완료(2026-06-09)**: #358·359·360·361·362·363·364·365·367·368·371 (11건, 수정·배포·검증 후 owner close).

### 2026-06-10 Claude Code 설정 최적화 (Cowork 세션)
- .mcp.json 토큰 env 참조화 + illustrator/excel → `.claude/mcp-optional.json` 분리, 스킬 5개 frontmatter 추가(auto-scan·deploy-verify·entity-audit·migration-check·qa-audit), commit hook tsc incremental화, UserPromptSubmit/Stop hook 메시지 축약, PROJECT_STATUS 완료세션 아카이브 이관, 루트 노이즈 정리
