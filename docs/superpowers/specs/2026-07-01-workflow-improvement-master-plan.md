# 워크플로우 전수 분석 · 수정/강화 마스터 기획 (2026-07-01)

> **작성 방법**: 7개 도메인 읽기전용 분석 에이전트(코드/라우트/페이지 직독) + 1개 산업표준 딥리서치 에이전트 병렬 fan-out → 횡단 합성. 모든 미완 항목은 `file:line` 근거 보유. headline P0/P1 주장(OEE 버그·order_costs writer·source_file_path)은 코드 재대조 검증 완료.
> **강화 우선순위(용준님 확정)**: ① 현장 운영 효율 → ② 원가·수익성 → ③ 고객 경험·신규 매출 → ④ 자동화·AI. **워크플로우별 가변 허용**(회계=②④, 인사=법규준수, 출고=①③).
> **원칙**: ⚠️ 기존 spec 존재 항목은 **재설계 금지·재사용**(§7 인덱스). 본 문서는 "무엇을·왜·어떻게(데이터모델·API·UI·난이도)"의 기획서이며, 실제 구현은 항목별 brainstorming/확인 후 착수.

---

## 0. 요약 — 시스템 성숙도 진단

동산기획 ERP+MES는 **end-to-end 기능 골격이 거의 완비**된 성숙 시스템이다(라우트 ~90, 페이지 ~80, 마이그 420+). 견적·주문·생산카드·후가공·창고별 다단위 재고·구매(PR→PO→입고검수→매입 3-way)·출고·회계허브·전자세금계산서(바로빌)·급여/4대보험·알림톡·거래처 포털까지 동작한다. 산업표준(글로벌 print MIS) 대비 **회계·세무·인사 영역은 오히려 앞서 있다**(한국 전자세금계산서·현금영수증·4대보험은 글로벌 MIS에 부재한 차별화 자산).

그러나 분석 결과 **가치의 대부분이 "골격은 있으나 마지막 배선이 끊긴" 상태**에 묶여 있다. 개별 도메인 버그가 아니라 **5개의 횡단 근본원인**이 여러 도메인의 미완을 동시에 만들고 있으며, 이것을 푸는 것이 최소 비용·최대 효과다(§1).

**핵심 발견 5가지**
1. **단가 마스터가 비어 있다**(전 품목 base/sales_price=0, price_list 배정 0건) → 견적·주문·원가·재무 전부가 수기 단가에 의존.
2. **원가 엔진이 작동하지 않는다**(`order_costs` writer 0건, 이동평균 자동 미갱신, OEE 상태버그) → 수익성 분석·마진·재고평가가 모두 근사치/0.
3. **완성된 백엔드가 UI 미연결로 사장**(반품/클레임/불량, 장비큐 디스패칭, 작업자 공정실적, OEE) → 투자 회수만 하면 되는 즉시 가치.
4. **생산 자동화의 마지막 배선이 끊김**(`source_file_path` 미기록 → RIP 송출·조판↔RIP 단절 공통 뿌리).
5. **무인 스케줄러가 없다**(cron은 바로빌 동기화만) → HR 적립·자동발주·미수독촉·세금계산서 기한·알림이 전부 "담당자 기억"과 "접속자 있을 때만" 동작.

---

## 1. 횡단 근본원인 (Cross-cutting) — 최우선 처리 대상

> 한 곳을 고치면 여러 도메인이 동시에 풀린다. 도메인별 권장기능(§3)의 상당수가 아래 5개에 의존하므로 **로드맵의 골격**이다.

### X1. 단가·원가 정본 부재 (②원가 / 영향: 수주·재고·생산·회계 4개 도메인)
- **현상**: ① 활성품목 base_price=0 497/519·sales_price 0 519/519·price_list 배정 거래처 0건(D1) → 자동단가 무력. ② `INSERT INTO order_costs` 0건(검증) → COGS 빈 테이블, P&L 매출총이익=매출(D5-1). ③ 이동평균 `avg_unit_cost` 입고 시 자동 미갱신(D3-3), FIFO 레이어 비작동(D3-4), 주문원가=카테고리 표준치(D3-6).
- **연쇄 영향**: 견적 cost-plus 불가(D1-C) → 입력시점 마진가드 불가(D1-6) → 재고평가 stale(D3-11) → 재무제표 부정확(D5-13) → AI 수익성/병목 분석 데이터 빈약(D7).
- **해법 골격**: §3-A(단가 시드+자동단가 엔진), §3-C(실원가 엔진), §3-E(매출원가 파이프라인)를 **하나의 원가 정본 트랙**으로 묶어 순차 구축. 이것이 우선순위 ②의 본체.

### X2. 고아 백엔드 UI 가동 (①현장·③고객 / 즉시 ROI, 난이도 최저)
- 완성·마운트됐으나 소비 화면 0건: **반품/클레임/불량코드**(D4-1, `/api/claims`·`/api/returns`·`/api/defect-codes`), **장비 큐 디스패칭**(D2-5, `/api/equipment-queue/*`), **작업자/비프린터 공정실적**(D2-6, `work_records`/`production_logs`/`quality_issues`), **OEE**(D2-3, 상태버그 동반).
- **해법**: 페이지+메뉴+권한(`permission_pages` INSERT)만으로 가동. 신규 데이터모델 거의 불요. **Phase 0의 핵심**.

### X3. `source_file_path` 미기록 = 생산 자동화 단절 (①현장·④자동화 / 영향: RIP·조판)
- **검증**: `rip.ts`는 `c.source_file_path`를 읽기만(1581·1880·2049), 주문→카드 생성 경로(`lifecycle.ts:1078`·`orders/helpers.ts:398`)는 컬럼을 INSERT하지 않음 → `/pending` 항상 NULL → MES-push RIP 전체 비작동, 조판(IA 네스팅) EPS가 R2에만 머무름(D2-1·2).
- **해법**: §3-B P1-①. 스키마는 이미 존재(0027·0097), 신규 컬럼 불요. 카드 INSERT 2곳 배선 + 네스팅/가공 완료 콜백에 경로 UPDATE.

### X4. 무인 스케줄러 부재 (④자동화 / 영향: 인사·재고·회계·알림 4개 도메인)
- cron은 별도 `barobill-cron` 워커가 카드/계좌 동기화만(D5-15·D6-1·D3-8·D7-3). 알림 생성은 프론트 폴링(접속자 있어야 10분마다).
- **미수행 항목**: 연차 적립/사용촉진/소멸, 급여 일괄생성 D-day, 자동발주(`auto_pr_enabled` 무동작), 미수금 독촉, 세금계산서 법정기한 경고, OEE 일배치, 납기·재고 알림.
- **해법**: 기존 `barobill-cron` 워커 패턴(서비스 JWT self-fetch, agent-key 보호) 재사용해 **통합 야간 스케줄러** 1개로 위 호출들을 dryRun 우선·게이트 집행. 난이도 하. **Phase 1에서 골격, 각 도메인이 핸들러 연결**.

### X5. deprecated `clients.balance` reader/writer 잔존 (정합 / 영향: 수주·회계)
- 미수금 정본=파생(`deriveClientBalance`)인데 일부 경로가 폐기 캐시 직읽(`orders/lifecycle.ts:314-317`·`search.ts:39`, D1) / 일부가 stale 갱신(`ar-receivables.ts:86-88,141-143`, D5-14).
- **해법**: 잔존 reader/writer 전수 파생 전환 + 컬럼 제거(Phase 0 정합 스윕, [[project-clients-balance-deprecated]] 연장).

---

## 2. 통합 로드맵 (우선순위 매트릭스)

> 우선순위 = 용준님 렌즈(①>②>③>④) × 의존성 × 난이도/ROI. **Phase 0은 렌즈 무관 "선행 quick win"**.

| Phase | 테마 | 핵심 항목 | 관점 | 난이도 | 의존 |
|---|---|---|---|---|---|
| **0** | 고아 UI 가동 + 버그픽스 | 반품/클레임/불량 UI·장비큐 UI·OEE 버그픽스·재고차감 정합·clients.balance 정리·주문서 단가제안·통합검색·AI인사이트 권한 | ①②③ | 하 | 없음 |
| **1** | 현장 운영 골격 | RIP송출 배선(X3)·공정 라우팅+작업자 실적(SFDC)·후가공 체크리스트·견적 모델 단일화·**통합 cron(X4)**·실시간 현황판 폴링 | ① | 중 | 0 |
| **2** | 원가 정본 트랙(X1) | 단가 시드+자동단가 엔진·실원가 엔진(이동평균/FIFO)·BOM 단일화·매출원가 파이프라인·입력시점 마진가드·다운타임/재작업 원가환원 → **Job costing 달성** | ② | 중~상 | 1(SFDC), BOM |
| **3** | 고객 경험·신규 매출 | 셀프주문 포털 완성·온라인 시안승인·이벤트 옴니채널 알림·POD+배송완료 알림·한진 import·견적 버전관리 | ③ | 중 | IA안정화 |
| **4** | 자동화·AI + 사인 특화 | 부가세 매입자료·세금계산서 적시발행 통제·AI 병목/체크리스트(LLM)·자동발주 정식화·**간판 BOM+조립견적+설치 일정**·네스팅 고도화 | ④ | 중~상 | 간판 brainstorming |
| **5** | 법규준수·재무 고도화(상시 병행) | 미사용연차수당 자동주입·근태마감/급여확정 잠금·급여명세서 셀프교부·퇴직금·4대보험 요율 갱신·복식부기 GL·어음·예산통제·2FA/감사로그 | 법규 | 중~상 | — |

**시퀀싱 논리**: Phase 0(즉시 ROI) → Phase 1(현장 가시성·자동화 골격이 Phase 2 원가의 데이터 공급원: 공정 라우팅/작업자 실적이 있어야 정확한 job costing) → Phase 2(원가 정본) → Phase 3(고객·매출) → Phase 4(자동화·사인). Phase 5는 법정 의무·리스크라 상시 병행(특히 4대보험 7월 요율·세금계산서 기한은 시급).

---

## 3. 도메인별 상세 구현 기획

### A. 수주/영업 (견적·주문·고객·단가)
**현황**: 주문 생성/상태전이/청구/취소복원/여신게이트/split billing/멀티법인 배정 성숙. **단가 체계가 비어 있고**, 견적 모델 2종 병존(`quotations` vs `orders.status='QUOTATION'`)·전환경로 3개로 갈라짐.
**핵심 미완**(근거): 단가 자동계산 엔진 미구현(`priceList.ts:228`)·단가 마스터 미충전·견적 전환이 카드/청구그룹/여신 미생성(`quotations.ts:598-708`)·prefill 자식라인 유실(`parent.js:1571`)·주문서폼 최근가 제안 미연결(`itemRow.js:248`)·간판 조립견적 0(`signage-component-estimate-structure.md`).

- **A-1. 단가 마스터 시드 + 자동단가 엔진 배선** | **P1 ②원가·①현장** *(X1 트랙)*
  - 데이터: 6개월 실거래에서 품목×(출력방식·소재) 중앙값 ㎡단가 시드 → `items.base_price`/신규 `area_price` 충전; `size_grade_prices`(0324, 死스키마) 재활성 또는 base_price 호수변종 충전. `price_change_history` 보존.
  - API/UI: `priceList.ts:/calculate`를 좌표(출력방식×소재) 룩업으로 확장. 주문서폼(`itemRow.js:248`)에 견적서폼과 동일 `/api/prices?context=sales` 최근가·3개월평균 제안 추가(즉시 가능, Phase 0).
  - 난이도 중. **선행 결정 D-1**(단가 시드 정책: 중앙값 자동 vs 수기 확정). 기존 spec: `item-pricing-inventory-FINAL.md §2.1·§8`.
- **A-2. 견적 모델 단일화 + 전환경로 통일** | **P1 ①현장**
  - 정본=`quotations` 확정, `orders.status='QUOTATION'` 단계폐기(마이그로 레거시 흡수). 전환을 단일 서버 핸들러로: `convert-to-order`가 `generateCardsForOrder`+`recalcOrderBillingGroups`+여신체크 호출(현재 누락). prefill 자식라인 유실(`parent.js:1571`) 수정 또는 폐기. 난이도 상(데이터 이관), 단계 배포. **선행 결정 D-2**.
- **A-3. 견적 버전관리 + 발송/수주 추적** | P2 ③고객·①현장
  - `quotations`에 `revision`·`parent_quotation_id`·`stage`(DRAFT/SENT/WON/LOST)·`sent_at`·`won_lost_reason`. PUT→새 revision. 버전 타임라인·승률 KPI·검색 포함. 난이도 중. 신규 spec.
- **A-4. 간판 조립견적(구성요소 라인)** | P2(→Phase 4) ②원가·③고객
  - `sign_components`(calc_type FIXED/PER_QTY/BY_SIZE/BY_SPEC_QTY)+자식 `order_items.sign_component_id`·`pricing_method='COMPONENT'`. 부모 amount=자식합. **선행=디자이너 구성요소 카탈로그 전수 확정(D-3)**. spec `signage-component-estimate-structure.md §6`. → §3-B·§3-D와 묶어 "간판 도메인 통합"으로.
- **A-5. 2단 품목 picker 프론트 + 신마스터 활성화** | P2 ①현장
  - 백엔드 완료(`items.ts:323·453`). base→variant 드릴 picker를 orderForm/quotationForm에. 선행=231 staged `is_active=1` 활성화·중복 정리(D-4). spec `item-master-load-phase1 P1c/P1d`.
- **A-6. 입력시점 마진 가드 + cost-plus 권장단가** | P3 ②원가 (X1 의존)
  - calc.js 라인 마진율 실시간 표시(`orders.js:827` 재사용)·임계 경고·`cost_standards` 최소단가 힌트. 원가 정본(X1) 완성 후 정확.

### B. 생산/MES (카드·후가공·RIP·장비·IA)
**현황**: 카드 라이프사이클·전이가드·역동기화·LogWatcher 자동완료/재고차감/품질이슈 견고. **자동화 두 축(RIP 송출·조판↔RIP)이 `source_file_path` 미기록으로 단절**, OEE·장비큐·작업자 실적은 고아.
**핵심 미완**: source_file_path 미기록(rip.ts 읽기만), OEE 'COMPLETED' 버그(`oee.ts:39,58` 검증), 장비큐 UI 0(`equipmentQueue.ts`), 작업자 실적 0(`production.ts:124-502`), 공정 라우팅 부재, LogWatcher 5공정 미커버.

- **B-P1①. RIP 송출 활성화 + 조판→RIP 환류** | **P1 ①현장·④자동화** *(X3)*
  - 카드 INSERT 2곳(`lifecycle.ts:1078`·`helpers.ts:398`) source_file_path 배선 + 네스팅/가공 완료 콜백(`workbench.ts`·autoProcess approve) R2키/NAS경로 UPDATE → `/pending` 실경로. 스키마 존재(0027·0097). 난이도 중. **선행 결정 D-5**(RIP SW 위임 경계, 메모 RIP 재개안 A). spec `nesting-intake.md:51`.
- **B-P1②. OEE/평균속도 정상화 + 일배치 cron + UI 탭** | **P1(즉시 Phase 0 버그픽스) ②원가·①현장**
  - `oee.ts:39,58`·`equipmentQueue.ts:144` `'COMPLETED'→'OK'`(1단어, 검증됨) + 통합 cron(X4)에 `/api/oee/calculate` 일배치 + `/production-reports` OEE 탭. `equipment_oee_daily` 존재. 난이도 하~중.
- **B-P1③. 경량 공정 라우팅 + 작업자/비프린터 실적 입력(SFDC 한국판)** | **P1 ①현장** *(X2·Phase 2 원가의 데이터원)*
  - `card_routing_steps(card_id,step,work_center,entered_at,completed_at,worker_id)` 신설 **또는** 기존 `work_records`(employee_id·work_type·target/completed 보유, 미사용) UI 가동. 인쇄→후가공(타공/미싱/재단)→QC→출하 단계·작업자·수량 실측. 난이도 중~상. 미채택 route는 명시적 deprecate.
- **B-P1④. 장비 큐 디스패칭 UI 연결** | **P1(Phase 0 가능) ①현장** *(X2)*
  - 완성 `/api/equipment-queue/*`를 `/equipment`·배치도 패널 노출(부하·예상시간·드래그 재정렬). 프론트만. 난이도 중.
- **B-P2①. 후가공 항목별 체크리스트** | P2 ①현장·품질
  - `card_pp_progress(card_id,pp_option_id,checked,checked_by,checked_at)` 신설, `cards.pp_status` 항목 롤업 파생(IN_PROGRESS 추가). AI 표준 체크항목 자동제안(roadmap #3). 난이도 중.
- **B-P2②. 다운타임/정지사유 코드 + 재작업·불량 원가환원** | P2 ②원가·품질
  - 정비모달 다운타임(분)·사유코드, status=BROKEN/MAINTENANCE heartbeat 적산. `quality_issues` 모달·`defect_category` enum 정형화·재작업 `rework_card_id`/`cost_impact` 자동연결(`printEvents.ts:61` 'OTHER' 하드코딩 해소). 난이도 중. → OEE 가용성·MTBF 데이터 확보.
- **B-P2③. 실시간 현황판 폴링 + LogWatcher 미커버 5공정 파서** | P2 ①현장·④자동화
  - 배치도/장비현황 30~60초 폴링(칸반 `cards/misc.js:292` 재사용, factory P4). + text_log/csv_log 범용 파서 + EPSON 취소/실패 emit. 폴링=하, 파서=중~상(현장조사 의존). spec `logwatcher-equipment-centric.md:130`.
- **B-P2④. 간판(SIGN) 공정·설치 일정관리** | P2(→Phase 4) ③고객 — §3-D·A-4와 통합.
- **B-P3**: 작업지시서 영속화(`work_orders`)·MTBF/MTTR·AI 병목/체크리스트(P1③ 데이터 후)·IA 3계통 일원화(死 `aiLayout`·OFF `auto_process_jobs` 제거).

### C. 재고/구매/BOM
**현황**: PR→PO→입고검수→매입 3-way·창고별 다단위 재고·autoDeduct(ROLL/BOARD/NONE) 표준 이상. **계획·원가 계층이 약점**(BOM 2모델, MRP 상태버그, 이동평균/FIFO 미작동).
- **C-1. 실원가 엔진 통합** | **P1 ②원가** *(X1)*
  - 입고·매입확정 시 이동평균 자동갱신 + FIFO 레이어 자동생성/소진 + 월 원가스냅샷 실계산. 기존 테이블 재사용(`avg_unit_cost`·`inventory_fifo_layers`·`cost_snapshots`). `po-receive.ts`/`purchaseInvoices.ts` Phase4 삽입, `costs.ts:200` 실집계. 난이도 중(소급 점진 적용). spec UP5.
- **C-2. BOM 단일화(product_materials → 계획에도)** | **P1 ①②** *(X1)*
  - MRP·부족경고·주간발주를 `product_materials`+deduction_method 기반 통일, `bom_items` 폐기. **MRP on_order 상태버그(#1, `mrpCalculator.ts:158`) 동시 수정**. 난이도 중상. spec `item-master-review.md`.
- **C-3. 공급사 마스터 + 재주문점 자동산식** | P2 ①현장
  - `clients`에 lead_time_days·MOQ·order_multiple·납기준수율(또는 `supplier_items` 신설). 재주문점=리드기간소모+안전재고, 발주량=max(MOQ,EOQ). 과거 PO로 리드타임 자동추정. 난이도 중.
- **C-4. 자동발주 스케줄러** | P2 ④자동화 *(X4)*
  - `auto_pr_enabled` 품목 통합 cron이 `/analyze`→`/create-prs` 자동·결과 알림. 난이도 하.
- **C-5. 바코드/QR 입출고·실사** | P2 ①현장
  - `items.barcode`, 카메라 스캔→기존 receive/count/release API. 난이도 중. spec `BARCODE_INVENTORY_SPEC_PENDING.md`. **선행 결정 D-6**(스캐너 하드웨어/방식).
- **C-6. 공급사 반품(RTV)·autoDeduct 다자재·재고분석(ABC/회전율)** | P2~P3 ②④ — 상세 D3-6/7/8.

### D. 출고/물류/클레임
**현황**: 날짜별 출고·라벨·알림톡 일괄·분할배송·on-time KPI(구현완료) 동작. **반품/클레임/불량 백엔드 완비·UI 0**, 간판 설치 관리 전무.
- **D-1. 반품/클레임/불량 UI 가동** | **P1(Phase 0) ①현장·③고객** *(X2, ROI 최고)*
  - 마이그 불요. `/returns`·`/claims` 페이지+메뉴+`permission_pages` INSERT, 생성/해결 모달, `claims/analytics` 카드, 주문/거래처 상세 진입점. 난이도 하.
- **D-2. 간판 설치 일정·현장관리** | P1(→Phase 4) ①현장(도메인 핵심)
  - `delivery_type`에 INSTALL 추가, `sign_install_jobs`(order_id·설치일·설치팀·현장주소·체크리스트 JSON·완료사진 R2·status). 설치 캘린더/보드. **선행 brainstorming(D-3, 간판 통합)**. → A-4·B-P2④와 단일 트랙.
- **D-3. 한진 import + 배송추적** | P2 ③고객·④자동화
  - `delivered_at` 실기록 + 추적상태 캐시. 반출 엑셀 import(`H-{date}-{client_id}` 키 매칭, ~1세션 선착수 가능). spec `hanjin-courier-decision.md`. **선행 결정 D-7**(한진 솔루션·정산 주체).
- **D-4. POD + 배송완료 고객알림** | P2 ③고객
  - `delivered_at`+수령확인(서명/사진/수령자). DELIVERED 전이 시 알림톡(기존 send-shipment 재사용). 난이도 하.
- **D-5. 출고 검수/패킹리스트·운임원가·출고경로 정합** | P1~P3
  - 출고 경로 재고차감 비대칭(`shipments.ts:467` 수동 POST 미차감) **버그성 Phase 0 점검**. 패킹리스트(box_no)·운임원가(shipping_cost) P2~P3.

### E. 회계/세무/자금 *(가변: ②원가·④자동화 우선)*
**현황**: 세금계산서(분할청구·원자락·자동발송)·미수금 파생 정본·자금예측 하이브리드 엔진·회계허브 성숙. **복식부기 GL 데드스키마, 매출원가 미집계, 홈택스 스텁, VAT 매입측 공백, 세금계산서 법정기한 통제 부재**.
- **E-1. 매출원가 집계 파이프라인** | **P1 ②원가** *(X1)*
  - `order_costs` writer 신설(검증: INSERT 0건): 카드 생산완료/출고 시 BOM 소요(차감량×이동평균)=재료비 + 작업시간/장비가동(노무·제조경비 배부) 적재. 마이그 불요. `/financial-reports` 마진 정상화·품목별 원가율. C-1·B-P1③ 의존. 난이도 중~상. **신규 brainstorming**.
- **E-2. 부가세 매입자료 확보** | **P1 ④자동화·세무** (시급)
  - (A) 바로빌 홈택스 Scrap Provider 구현(`hometaxInvoices.ts:43` 스텁, 골격완비) 또는 (B) `purchase_invoices`+`card_transactions` 자체집계. B안 中(빠른 효과)·A안 高. **선행 결정 D-8**.
- **E-3. 세금계산서 적시발행 통제** | **P1 ④자동화·운영** (시급, 가산세 리스크)
  - `clients.invoice_method`+출고월 법정기한(익월10일) derive. 미발행 D-day 대시보드+임박/초과 알림(통합 cron)·실패 재발행 큐. spec `project-tax-issue-prevention` P1/P2(유실분 복원). 난이도 중.
- **E-4. 자금예측 정확도 보강** | P1(소규모) ②자금
  - VAT 분기납부 + 4대보험 회사부담분 `cashflowEngine` 자동 OUT 합성(`cashflowEngine.ts:427` 누락 자인). 난이도 하~중.
- **E-5. 복식부기 GL 자동분개 / 어음 / 예산통제** | P2~P3 ②표준
  - GL 데드스키마(0220) 활성화(매출/입금/매입/급여/감가 자동전기→시산표·대차대조표·현금흐름표). 어음 `notes` 신설. 예산 전 카테고리 실적+승인 시 잔액체크. 난이도 상. **선행 결정 D-9**(복식부기 도입 범위·어음 거래 비중).

### F. 인사/급여/근태 *(가변: 법규준수 우선)*
**현황**: 포괄임금 분해·4대보험·연말정산·세무사 CSV·연차(근로기준법 충실) 성숙. **HR 작업 전부 수동 트리거, 미사용연차수당·급여이체·퇴직금·교부증빙·전자신고 공백, 근태마감/급여확정 잠금 부재**.
- **F-1. 4대보험 7월 요율 갱신** | **P0 법규** (시급, 메모 TODO)
  - `insurance_rates` 7월 상한659만 재조정·산재 고지서 반영(스키마 존재, 데이터 갱신). 난이도 하.
- **F-2. 무인 HR 스케줄러** | P1 ④자동화 *(X4)*
  - 통합 cron에 월차/연차 적립·사용촉진 윈도우 스캔·소멸 dryRun·급여 일괄생성 D-day 연결(기존 엔드포인트 재사용). dryRun·알림 우선. 난이도 하.
- **F-3. 미사용연차수당 자동 산정·주입** | P1 법규·②원가
  - 소멸/미사용 잔여×통상시급(`calcInclusivePay`) → `/payroll/sync-leave-pay` `annual_leave_pay` UPSERT(이중계산 방지). 난이도 중. **선행 결정 D-10**(통상임금 정의).
- **F-4. 근태 마감 + 급여 확정 잠금** | P1 ①정합
  - `attendance_periods(entity_id,month,status,closed_by,closed_at)`. 마감월 CAPS ingest/sync skip(`caps.ts:278` 가드 확장)·payroll 단방향 전이 가드(`records.ts:68,82`)·PAID sync 차단. 난이도 중.
- **F-5. 급여명세서 셀프교부 / 전자근로계약 본인서명 / 급여이체 파일** | P2 법규·운영
  - hrSelf에 `/self/payslip`·`/self/contracts/:id/sign`(self-auth `hrSelf.ts:75` 재사용)+교부로그. 급여이체 `/payroll/transfer-file`(은행 펌뱅킹/바로빌 BANKACCOUNT). 난이도 중.
- **F-6. 퇴직금 추계·정산 / 인사발령·교육·평가 이력 / 생산직 교대·일용** | P2~P3 법규·운영 — 상세 D6-6/8, C-교대/일용.

### G. 플랫폼/통합/AI/포털 *(가변: ③고객·④자동화 우선)*
**현황**: 인증·권한·멀티법인·알림(알림톡/SMS/이메일/팩스)·거래처 포털(조회) 성숙. **셀프주문 미완(블랙홀 적재), 자동알림=출고 1개뿐, 무인 스케줄러·발송 폐루프·2FA/감사로그 공백**.
- **G-1. AI 인사이트 권한·정합 픽스** | **P0 보안**
  - 리스크/병목 read에 page권한·role 게이트, **GET write 부수효과 제거**(`aiInsights.ts:104-106` UPDATE→POST 분리), `clients.balance`→파생. 난이도 하.
- **G-2. 거래처 셀프주문 포털 완성** | **P1 ③고객·신규매출**
  - `portal_reorder_requests`(현 블랙홀) 소비 + `POST /api/portal/orders`(서버 가격재계산·assigned_entity_id split-billing 합류). 관리자 "포털 접수" 큐+알림. IDOR·가격위변조·미수한도 가드 필수. **선행=IA 안정화·brainstorming(D-11)**. spec `client-self-order-portal.md`.
- **G-3. 온라인 시안 승인(online proofing)** | P1 ③고객·품질
  - `order_item_proofs`(image_url=IA JPG `aiAnalysis.ts:/thumbnail` 재사용, status). 포털 승인/반려+내부 출고게이트 체크. 난이도 중. → 후가공 실수·오인쇄 사전차단(roadmap #3 연계).
- **G-4. 이벤트 기반 옴니채널 알림 + 발송 폐루프** | P1 ③④
  - `notification_events`(event_type·template per channel/entity)+상태머신 훅(출고 패턴 일반화: 접수·생산착수/완료·입금·세금계산서·납기예고). `kakao_send_logs.delivery_status` + 바로빌 결과 webhook/cron reconcile + opt-out. 난이도 중. spec `alimtalk-golive-package.md`.
- **G-5. 통합 무인 스케줄러(X4 골격) / 통합검색 확장 / 보안(2FA·감사로그)** | P1~P2
  - X4 워커가 G-4·E-3·F-2·C-4·미수독촉 호출. 검색 도메인 확장(items/PO/출고/세금계산서/견적). ADMIN 2FA(TOTP)·보안 감사로그·조회 entity 격리. 난이도 하~중.
- **G-6. AI LLM 활용(클레임 요약·후가공 체크리스트)·대화형 BI** | P3 ④
  - roadmap A·#3. **착수 전 사전점검 보고서 필수**(roadmap 명시).

---

## 4. 산업표준 벤치마크 매핑 + 신규 매출 기회

> 출처: Tharstern·PrintVis·EFI Pace·Avanti·Ordant·Cyrious·Aleyant 등 + JDF/JMF·G7·W2P 표준(상세 §출처). **회계·세무·인사는 글로벌 MIS 부재 영역(한국 차별화 자산)이라 벤치마크 제외**.

| 산업표준 고가치 기능 | 우리 상태 | 본 기획 매핑 |
|---|---|---|
| 템플릿/공식 기반 견적("제품=수식", 장비별 BHR 시간당원가) | 품목 신모델 정합, 단가/원가 미충전 | A-1·A-6·E-1 |
| **Job costing(견적 vs 실적 by job/client)** | 원가 엔진 미작동 | **X1 트랙(A-1·C-1·E-1)+B-P1③ = Phase 2 완성 시 달성** |
| SFDC(작업자 시간·자재 실적 회수) | 백엔드 있음·UI 0 | B-P1③ |
| 그래픽 capacity 스케줄링(장비큐 드래그) | 백엔드 있음·UI 0 | B-P1④ |
| OEE/가동률 | 상태버그로 0 | B-P1② |
| 자재 자동 재주문(reorder·lead·safety→PO) | reorder_point 미활용 | C-3·C-4 |
| 온라인 proofing/승인·자동 preflight | 부재(IA 썸네일 자산 보유) | G-3 |
| **W2P 셀프주문/재주문·온라인 디자이너(VDP)** | 포털 조회만 | G-2 + (중장기 신규매출) |
| 네스팅/임포지션 최적화(true-shape) | IA 90° bbox만 | B-P3(중장기) |
| JDF/JMF MIS↔RIP 양방향 | 단방향·수동 | B-P1①(재개 시 표준 채택) |
| 간판 멀티스테이지(site-survey·인허가·설치) | 부재 | A-4+B-P2④+D-2(간판 트랙) |

**신규 매출 기회(③)**: ① W2P 셀프주문/재주문(B2B 단골 자동화)·② 온라인 디자이너로 태극기/깃발·명함 셀프 커스터마이징·③ 시안 승인 포털로 고객경험 차별화. 모두 기존 포털+IA+알림톡 자산 위 확장.

---

## 5. 의사결정 필요 항목 (구현 착수 전 확인)

| # | 결정 사항 | 영향 | 권고 |
|---|---|---|---|
| D-1 | 단가 시드 정책: 실거래 중앙값 자동 vs 수기 확정 | A-1·전체 원가 트랙 | 하이브리드(자동 제안→수기 승인) |
| D-2 | 견적 정본: `quotations` 테이블로 통일 vs `orders.status` 유지 | A-2 데이터 이관 규모 | `quotations` 정본·레거시 흡수 |
| D-3 | **간판 통합**: BOM·조립견적·설치를 단일 트랙으로 brainstorming 선행 | A-4·B-P2④·D-2 | brainstorming 스킬 선행(카탈로그 확정 의존) |
| D-4 | 231 staged 신마스터 활성화 시점·기존103 중복 처리 | A-5 | 단가 충전 후 활성화 |
| D-5 | RIP SW 위임 경계(MES가 어디까지 송출 책임) | B-P1① | 메모 재개안 A(RIP SW 위임·source=Z공유) |
| D-6 | 바코드 스캐너 하드웨어/방식(카메라 vs 전용) | C-5 | 현장 환경 확인 후 |
| D-7 | 한진 통합솔루션 채택·정산 주체·월 발송량 | D-3 | import 선착수, API는 계약 후 |
| D-8 | 부가세 매입자료: 홈택스 Scrap(A) vs 자체집계(B) | E-2 | B 선행(빠른 효과)→A 보강 |
| D-9 | 복식부기 GL 도입 범위·어음 거래 비중 | E-5 | 어음 비중 확인·GL은 세무대리 요구 시 |
| D-10 | 통상임금 정의(미사용연차수당 환산 기준) | F-3 | 노무 자문 |
| D-11 | 셀프주문 포털: 기성품만 vs 제작품 포함·미수한도 가드 | G-2 | 기성품 우선→제작품(IA 안정화 후) |

---

## 6. 즉시 착수 가능 Quick Wins (Phase 0 체크리스트)

> 신규 데이터모델 거의 불요·난이도 하·즉시 ROI. 버그성/정합성 포함이라 회귀 검증 필수.

- [ ] OEE 상태버그 `'COMPLETED'→'OK'`(`oee.ts:39,58`·`equipmentQueue.ts:144`) — 1단어, 검증됨
- [ ] 반품/클레임/불량 UI 가동(D-1) — `permission_pages` INSERT + 페이지/메뉴
- [ ] 장비 큐 디스패칭 UI 연결(B-P1④)
- [ ] 출고 경로 재고차감 비대칭 점검(`shipments.ts:467`, 멱등성 주의)
- [ ] `clients.balance` 잔존 reader/writer 파생 전환(X5)
- [ ] 주문서폼 최근가/3개월평균 단가 제안 연결(`itemRow.js:248`, 견적폼엔 이미 존재)
- [ ] AI 인사이트 권한 게이트 + GET write 제거(G-1)
- [ ] 통합검색 도메인 확장(견적·items·PO)
- [ ] 4대보험 7월 요율 갱신(F-1) — 법정
- [ ] 주간발주 알림 수신번호 버그(`weeklyPurchase.ts:398` m.mobile→phone)
- [ ] MRP on_order PO 상태값 버그(`mrpCalculator.ts:158`)

---

## 7. 기존 spec 재사용 인덱스 (⚠️ 재설계 금지)

| 항목 | spec / 근거 | 상태 |
|---|---|---|
| ㎡단가표·자동단가 엔진 | `2026-06-13-item-pricing-inventory-FINAL.md` | 스키마 일부 prod, 배선 미구현 |
| 신마스터 231변종 로드 | `2026-06-19-item-master-load-phase1.md` | staged(is_active=0), 활성화·단가배선 대기 |
| 간판 구성요소 견적 | `2026-06-13-signage-component-estimate-structure.md` | 방향확정, §6 미확정·코드 0 |
| 2단 picker 백엔드 | `items.ts:323·453·379` | 구현완료, 프론트 미구현 |
| 실원가 UP5 | `2026-06-27-inventory-redesign-unified.md` | 설계선행 |
| Multi-UOM 표시변환 | `2026-06-27-multi-uom-inventory.md` UP3-B2 | base 환산 반영, 표시변환 이연 |
| 바코드 재고 | `BARCODE_INVENTORY_SPEC_PENDING.md` | 미착수 |
| 네스팅→RIP 종착 | `2026-06-16-ia-editor-nesting-intake.md:51` | approve saved_path만, RIP 연결 미구현 |
| Flexi 네스트 추적 | `HANDOFF-flexi-nest-tracking.md` | 코드완료·prod 미배포 |
| 배치도 P3~P5/실시간 | `2026-06-25-factory-layout-integration.md` | 미구현 |
| LogWatcher 범용 파서 | `2026-06-15-logwatcher-equipment-centric.md:130` | 미구현 |
| 한진 import/추적 | `hanjin-courier-decision.md`·`HANJIN_INTEGRATION_ROADMAP.md` | 양식·계약 대기 |
| on-time KPI | `ontime-kpi-redesign.md` | **구현완료**(재작업 불요) |
| 셀프주문 포털 | `2026-06-11-client-self-order-portal.md` | 방향확정, 생성 미구현 |
| 알림 자동발송/폐루프 | `2026-06-11-alimtalk-golive-package.md` | 출고 자동발송 배선됨, 매핑·go-live 잔여 |
| 세금계산서 발행누락방지 | `project-tax-issue-prevention`(memory) | P3만, P1·P2 미구현 |
| 홈택스 Scrap | `project-barobill-hometax-scrap`(memory) | 골격완비·Provider 스텁 |
| 미수금 IFRS9 roll-rate | `2026-06-03-receivables-purchase-barobill-brainstorm.md` | 정적 손실률 부분구현, roll-rate 미구현 |
| 정기변동비 P4·5 | `2026-06-05-recurring-variable-expense.md` | P1~3 prod, P4·5 대기 |
| 연차 사용촉진/소멸 | `2026-06-24-leave-promotion-expiry-design.md` | 구현완료, 자동 스케줄만 미연결 |
| AI 기능(미수리스크·병목) | `roadmap-ai-features`(memory) | #1·#2 SQL휴리스틱 구현, #3·LLM 미구현 |

---

## 출처 (산업표준 벤치마크)
종합 MIS: [Avanti Slingshot](https://avantisystems.com/avanti-slingshot-print-mis/) · [Tharstern](https://printepssw.com/tharstern-print-mis) · [PrintVis](https://printvis.com/solution/) · [EFI Pace](https://go.efi.com/rs/559-INV-406/images/eps_ds_global_pace_en.pdf) · [PrintSmith Vision](https://ricoh-usa.com/en/products/pd/software/commercial-industrial-printing/mis/eproductivity-software-printsmith-vision). 사인특화: [Cyrious Control](https://www.cyrious.com/products/control/) · [Ordant](https://ordant.com/sign-shop-software/) · [PrintEPS](https://printepssw.com/sign-and-display-print-software). W2P/proofing: [Aleyant eDocBuilder](https://www.aleyant.com/edocbuilder/) · [Ordant proofing](https://ordant.com/module/print-proofing-software/). MES/OEE: [Avanti SFDC](https://printepssw.com/solutions/shop-floor-data-management) · [Vorne OEE](https://www.vorne.com/solutions/applications/oee-software/). 네스팅: [Caldera](https://www.caldera.com/reduce-media-waste-with-nesting/) · [Metrix](https://printepssw.com/metrix-planning-and-imposition-software). 표준: [CIP4 JDF](https://www.cip4.org/print-automation/jdf) · [G7](https://idealliance.org/specifications/g7-for-color-management/).
