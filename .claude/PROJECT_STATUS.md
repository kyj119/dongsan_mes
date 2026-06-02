# PROJECT_STATUS.md — 프로젝트 현황판

> **최종 업데이트**: 2026-06-03

---

## 🔒 편집 중 (충돌 방지)

- (없음)

---

## 🔴 현재 진행 중

- **자금 예측/계획 일원화** (캐시플로 탭→`/cash-schedule` 흡수): **Phase 1+2 완료(백엔드)**, **Phase 3(UI 흡수) 대기**. 설계 → `memory/project-cashflow-unification.md`

> **다음 세션 TODO**: ①향후 기성 PRODUCT는 품목 UI '기성품' 토글로 지정(코드 완비) ②혼합주문(제작+기성) 부분출고·재고차감 실사용 모니터링 ③cards 외 스키마 드리프트 의심 시 PRAGMA 확인 ④#329(3) withSeqRetry INSERT 래핑(후순위) ⑤로컬 dev:d1 중복 3개 정리 ⑥자금 일원화 Phase 3(UI: cashFlow.js+탭HTML 이관·달력 일원화·bank.ts 정리) → Phase 4~5(연결·정리). 카드 예측은 corporate_cards에 cutoff_day/payment_day 추가 후

> **직전 세션 결과 (2026-06-03)**: **자금 예측/계획 일원화 Phase 1+2 완료(백엔드).** 캐시플로 탭(`/bank`)을 `/cash-schedule`로 흡수하는 통합의 백엔드. ①신규 `cashflowEngine.ts` 하이브리드 합성 헬퍼(물질화 cash_schedule + 온더플라이 고정비·대출·미청구주문 예상입금). ②`forecast` 헬퍼 기반 재작성, 신규 `GET /schedule/monthly`(거친 projection 대체). ③cash_schedule 조회/수정/삭제 전부 `entity_id` 필터(법인격리+보안). ④`auto-generate` FIXED 생성 제거(온더플라이 통일·이중계산 차단). ⑤고정비/대출 GET을 MANAGER 허용(변경은 ADMIN). 카드 예측은 `corporate_cards` cutoff/payment_day 부재로 백로그. typecheck/build/SQL 검증 통과. **Phase 3(UI: cashFlow.js 488줄+탭HTML 이관·달력 일원화·bank.ts 정리) 대기.**

> **직전 세션 결과 (2026-06-02 PM-4)**: **기성품/유통 즉시출고 — 전체 완료(Phase 1+2+3 + UI 클릭검증 + 태극기 9종 지정).** `items.production_required`(0285, GOODS/MATERIAL=0·그 외 UI), getCardGroup 최우선 분기(카테고리보다 우선), 카드 PRINT_DONE→shipment_ready 전파, 완료 파이프라인 PRINT_DONE 게이트 제거(유통/기성도 SHIPPED), 출고 재고차감 일반화(음수허용·멱등), 주문서 재고부족 경고. 드리프트 수정: cards.print_done_at·shipped_by(0286). UI 클릭검증(토글 저장·경고 토스트)+태극기 9종 지정 완료. (commits 9c90306, 4f75790, d5ad1b6)

> **직전 세션 결과 (2026-06-02 PM-3)**: **한진 E2E(entity 99) 워크플로우 점검 → 치명 버그 2건 발견·수정·배포.** ①카드 생성 차단(1cb77e9가 status='PRINT_PENDING' 도입했으나 cards.status CHECK 미갱신 → 2026-06-01 이후 PRODUCTION 주문 생성 전부 500): 마이그 0284로 CHECK 확장(prod 적용). ②card_number를 order_number.split로 만들어 E{eid} 주문 같은날·법인 충돌: order_number 전체 기반으로 수정. ③#330 회귀(cards.entity_id 없음→orders 조인) 수정. 한진 리스트 착선불/수량 실데이터 검증 통과. **전 법인(1/2/3) 라이브 검증**: 각 법인 PRODUCTION 주문 생성→카드 PRINT_PENDING·card_number `E{eid}-…-01`(법인 유일)·격리 확인→완전 정리(잔여 0·번호 반환). 실데이터 피해 0건. (commits 3dff91c, 18769f7)

> **직전 세션 결과 (2026-06-02 PM-2)**: 출고/배송 페이지 수정 3건 — 한진/대신 리스트 착선불 한글화(`payTypeKo`)·수량 중복 버그 수정(`items` 초기화), 전체 라벨→선택 항목만 출력, 계산서 발행 링크 제거. 배포 + 5/8 실데이터 검증 통과 (commit b261673)

> **직전 세션 결과 (2026-06-02 PM)**: **GitHub 오픈 이슈 11건(#323~333) 전수 수정·배포·close** — 보안격리(payroll/cards/AR/budgets/aiInsights), cascade(주문/발주요청), 채번 E{eid} 확장, 홈택스/nts dedup(마이그 0282·0283 prod 적용), saveAutoApprove 복구, dead code 정리. prod 스모크 통과. (오픈 이슈 0건)

> **직전 세션 결과 (2026-06-02 AM)**: 채번 경계 버그 근본수정(E{eid} 내장 채번) + 견적서 개편(표·품목·전환 prefill) + 생산주문서 유통품목 행 단순화 + 전체 페이지 점검(storageZones CRITICAL 수정·배포, 이슈 #326~328 등록)

---

## 🟡 대기 중 (사용자 선택/승인 필요)

### [기성품/유통 즉시출고] — ✅ 전체 완료 (Phase 1+2+3 + UI 클릭검증 + 태극기 지정)
- 코드/마이그(0285·0286) prod 반영. 기성/유통 = 카드 미생성·즉시 출고가능·SHIPPED 전이·출고 시 재고차감(음수 허용·멱등)·주문서 재고부족 경고.
- **UI 클릭검증 완료**: 품목 '기성품' 토글 저장(production_required=0 영속), 주문폼 재고부족 경고 토스트 실발생.
- **태극기 9종(수기·1~6호·특호·탁상용) 기성품 지정 완료**. GOODS/MATERIAL 자동. 향후 추가 기성 PRODUCT는 품목 UI '기성품' 체크로 지정.

### [포털 rate-limit] — ✅ 프로덕션 배포됨 (2026-06-02)
- portal verify-document/verify-token에 `rateLimitMiddleware`(10·30/분) 적용(commit 4a2fc28). HEAD(1bd6d01) 빌드에 포함되어 2026-06-02 배포들(60ff92fb~57788bef)로 **prod 활성화**. (Cloudflare 바인딩 방식은 Pages 미지원으로 폐기)
### [#310 직접발행 폼] — 실사용 검증 대기 (2026-06-01)
- 백엔드(POST /tax-invoices/direct)+UI 배포됨. 세금계산서 '직접발행' 첫 발행 테스트 권장 (tax_invoices 0건)

### [자금계획 ↔ 캐시플로 통합] — 구조 논의 대기
- 달력 뷰가 양쪽에서 중복 → 캐시플로에 수동등록/추정자금일보 합치고 자금계획을 탭으로 통합 제안
- 사용자 결정 후 진행

### [바로빌 전환] — 통합 완료, 잔여 작업 대기
- 전환 완료: `messaging_provider=barobill`, 실데이터 조회 성공
- 통장→수금 반자동 플로우 구현됨 (동기화→자동매칭→사람확인→수금반영)
- 자금관리 탭 정리 완료: 바로빌 통장 탭→은행 연동에 통합 (2026-05-24)
- **대기**: SMS 발신번호 승인, 알림톡 템플릿 등록, 나머지 카드/계좌 등록

### [선명2 CAPS Worker 설치] — PC 설정 대기
- S2 사이트 DB 등록 완료, API_KEY 발급됨
- 선명2 PC에 caps-worker 폴더 복사 + .env 설정 + 실행 필요

### [배송 관리 최적화] — 출고 대기 보드
- 배송방법별 그룹화 + 마감시간 카운트다운 + 일괄 출고 + 카카오톡 자동 발송
### [기존 계약 일괄 등록] — 엑셀 import 스크립트 제공 대기
### [라벨 프린터 인쇄] — 프린터 모델 확인 필요 (외부 의존)
### [RIP 전송] — 코드 완료, 현장 테스트 대기 (외부 의존)
### [LogWatcher PrintExp] — 구현 완료, 현장 배포 대기 (외부 의존)
### [한진택배 자동화] — 솔루션 선정 대기 (사용자 결정 필요)

---

## 🟢 최근 완료 (2026-06-02)

### 한진 E2E 워크플로우 점검 — 카드 생성 차단 2건 + #330 회귀 수정 (2026-06-02 PM-3)
- **점검 방식**: entity 99(E2E)에 한진 주문 생성 → 워크플로우 실주행. 한진 리스트 착선불(선불/착불)·수량 dedup 실데이터 검증 통과.
- **🔴 발견2 (CRITICAL, pre-existing `1cb77e9`)**: 카드 INSERT status='PRINT_PENDING'인데 `cards.status` CHECK는 0022의 `('PRINTING','PRINT_DONE','HOLD')`만 허용 → 카드 생성 전건 `CHECK constraint failed` → **PRODUCTION 주문 생성 500** (마지막 정상 카드 2026-06-01 04:24, 이후 실법인 production 주문 미생성으로 미발현). → **마이그 0284**: cards 재생성 + CHECK에 PRINT_PENDING/RIP_WAITING/SHIPPED 추가 (prod 136행 보존 적용).
- **🟠 발견3 (E{eid} 채번 후속)**: `generateCardsForOrder`가 card_number를 `order_number.split('-')[0]/[1]`로 생성 → `E99-…-004`가 `E99-날짜-{cardIndex}`가 되어 같은날·법인 2번째+ 주문 **card_number(UNIQUE) 충돌**. → `${order_number}-${cardIndex}` 전체 기반(역호환·전역유일)으로 수정.
- **🔴 발견1 (내 회귀)**: #330이 없는 컬럼 `cards.entity_id` 참조 → 스케줄 라우트 500. `order_id→orders.entity_id` 격리로 재수정(`cards/queries.ts` 패턴). cards는 봇 오탐 — `feedback-autoscan-false-positives` 갱신.
- **검증(entity 99)**: PRODUCTION 주문 2건 연속 → 카드 PRINT_PENDING 생성, card_number `…-004-01`/`…-005-01` 구분(충돌 없음). 테스트 데이터 정리 완료.
- **라이브 검증(법인 1/2/3)**: 각 법인 실 PRODUCTION 주문 1건 생성 → `E{eid}-20260602-001` + 카드 `E{eid}-…-001-01`(법인 유일·PRINT_PENDING)·entity_id·수량 정확 → **완전 정리**(card_items/cards/order_items/status_history/activity_logs/orders 각 3건, 잔여 0, 번호 MAX기반 반환). 주문생성=알림 없음(logActivity만). **버그 창에 실 production 주문 0건 → 실데이터 피해 0건** 확정. commits 3dff91c, 18769f7

### 출고/배송 페이지 수정 3건 (2026-06-02 PM-2)
- **착·선불 한글화**: `shipping_payment`(PREPAID/COLLECT)를 출고 확인 리스트(한진·대신)에 raw 영문 출력 → `payTypeKo()`로 선불/착불 표기
- **수량 중복 버그**: 거래처 그룹화 시 `items: s.items`로 초기화 후 아래 concat에서 첫 주문 items를 재합산 → **첫 주문 품목·수량 2배** → `items: []` 초기화로 수정
- **전체 라벨 출력 → 선택 항목만**: `printAllSection`이 전체 키 순회 → 체크된(`selectedShipments`) 거래처만 출력 + 버튼명 "선택 라벨 출력"
- **계산서 발행 링크 제거**: 5개 섹션(화물/택배/한진/퀵/기타)의 `/tax-invoices` 링크 삭제
- 배포 + **5/8 실데이터 검증**: 7개 그룹 raw=화면 수량 완전 일치(중복 없음), 착선불 선불/착불 정상, 거래처 출고방법 분리 케이스(현대광고 대신택배2+용차1) 정확. commit b261673

### GitHub 오픈 이슈 11건(#323~333) 전수 수정·배포·close (2026-06-02 PM)
- **보안/멀티법인 격리(HIGH)**: #330 cards/scheduling 4라우트 IDOR, #331/#333 payroll 5라우트+tax-agent CSV(PII)+DELETE IDOR(orders/AR수금/budgets)+aiInsights 교차집계, #327 알림 read 필터. 패턴: `entityFilter`(entityId=0 전체모드는 필터 생략 → ADMIN 교차조회 정책 자동 충족)
- **데이터정합성**: #323 홈택스 INSERT OR IGNORE+UNIQUE(0282), #329 채번 E{eid} 확장(approval/PR/inventory) + nts_approval UNIQUE(0283), #324 발주요청/발주 cascade, #332 주문삭제 cascade(tasks/work_records/print_file_map)
- **기능/정리**: #326 saveAutoApproveSettings 복구(parseMoney 콤마제거), #325 migration_logs 5건 보강, #328 dead 4건 삭제+recalc 버튼 복구
- **봇 오탐 3건 검증·제외**: order_items(entity_id 컬럼 없음), cash_receipts·mrp_runs(이미 E{eid} 내장). auto-scan/auto-improve 이슈는 스키마/코드 대조 필수
- 마이그레이션 0282/0283 **prod 적용 완료**(3테이블 중복 0건, DELETE 무영향). commit 1aaf44f, 배포 https://webapp-9i0.pages.dev, prod 스모크(엔드포인트 200·UI 콘솔에러 0) 통과
- **후속 분리**: #329(3) withSeqRetry INSERT 래핑(충돌은 법인별 카운터로 완화), #327 집계 엔드포인트(단일에이전트 교차 설계)

### 채번 경계 버그 근본수정 — 견적서 저장 500 장애 (2026-06-02)
- **원인**: `quotation_number` 등 `*_number`가 **컬럼레벨 전역 UNIQUE**인데 채번은 **법인별 MAX** → E2E(entity 99)가 오늘자 001~007 선점 시 실법인이 001 생성 시도 → `UNIQUE constraint failed` 500
- **해결**: 번호에 법인코드 `E{eid}` 내장(`getNextEntitySeqNumber`, sequenceGenerator.ts). 문자열이 법인별로 달라 전역·복합 UNIQUE 양쪽 호환 → **스키마 변경 없음**
- 적용: quotations(`Q-E{eid}-`)·orders(`E{eid}-`)·purchase_orders(`E{eid}-…-P`)·payment_requests(`PR-E{eid}-`) **12 호출부**. 불변식: 번호 E{eid}=행 entity_id(`getEntityId(c)||1` 통일)
- 프로덕션 검증: `Q-E2-20260601-001`(entity 2), `E2-20260601-001`(entity 2) 정상 생성. 규칙 → `memory/project-entity-policy`

### 견적서 관리 개편 (2026-06-02)
- 저장 후 → `/quotations` 리다이렉트(양식 페이지 대신)
- 표 레이아웃: 주문 `ord-tbl` 패턴 이식(헤더/바디 패딩 통일) + **품목 컬럼**(품목명+규격+외 N건) 추가, 액션 아이콘화
- **견적서→주문 전환 = 주문폼 prefill 기본화**: 즉시생성/confirm 제거, `/order-form?quotation_id=`로 이동(기존 `loadQuotationForPrefill` 활용) → 납품일막힘(#134) 자연 해소. 한계: prefill은 기본 필드만(후가공·번들 제외)

### 생산 주문서 유통 품목 행 자동 단순화 (2026-06-02)
- 생산 주문서에서 `item_type=GOODS/MATERIAL` 품목 선택 시 그 행만: 가로·세로 비활성 + 후가공·마감 섹션 숨김 + '유통' 뱃지. 생산품 선택 시 원복
- 한 주문서로 생산+유통 혼합(서버는 이미 품목별 분기). `layout.ts` 모달 콜백에 item_type 전달 + `itemRow.js applyDistRowMode`. 서버 무변경. 로컬 브라우저 검증(GOODS 단순화/PRODUCT 원복)

### 전체 페이지 점검 (auto-scan, 2026-06-02)
- 정적(백엔드 95파일+프론트, 에이전트 2) + 동적 18페이지(Playwright 로컬 e2e_tester) + 프로덕션 데이터정합성
- **🔴 CRITICAL 수정+배포**: 설정>창고구역 탭 "구역 추가/수정" 크래시(settings 모달에 `zoneModalEntity/Default` 누락) → settings.ts에 두 필드 추가. 재현→수정→재검증(modal OK)
- **이슈 등록**: #326(HIGH `saveAutoApproveSettings` 미정의), #327(LOW entity필터 일관성), #328(LOW dead code) + #325 코멘트(order_items INSERT 위치)
- 데이터정합성 **0건**, `/bank`·`/card-expenses` 로컬 500은 **스키마 드리프트**(프로덕션 컬럼 존재 확인, 정상)
- 배포 6회: 60ff92fb→1688cbab→a24fbf89→c0957421→86fc9bb5→57788bef

---

## 🟢 최근 완료 (2026-06-01)

### 거래처원장 정합성·UX 개편 (2026-06-01)
- **상세 모달**: 전기이월(opening_balance) + 모달 독립 기간 컨트롤(올해/전체) + 인쇄 백지 수정(visibility 기반) + 빠른기간 KST/UTC 하루밀림 보정
- **목록(정산)**: 미수 거래처 누락 수정 — 캐시 clients.balance → 실계산 미수(orders BILLED−payments−adj, entityFilter)
- **표 헤더 정렬 전역 수정**: layout.ts `.ds-table thead th.text-right/center/left`(0,2,2) → ds-table 전 페이지 헤더 정렬 복원
- 프로덕션 캐시 잔액 재계산(거래처 1건 +60,000), 단가 법인공유 정책 문서화(`memory/project-entity-policy`)

### GitHub 이슈 29건 전수 종료 (2026-06-01)
- 자동수정 봇 인용 커밋이 전부 가짜(미반영) 판명 → 서브에이전트 4팀 개별 재검증
- 런타임500/크래시(#316/317/319/303/300), 멀티법인 격리(#279/282/322/313/284/277/286/285/283/274), UNIQUE(#281/287), 보안(#314/315/320), 성능(#276/321), 직접발행(#310 방안A), API정리(#318), 결정/wontfix(#304/293/295/278/306)
- 마이그레이션 0278~0281 prod 적용+추적, 커밋 13·배포 11

---

## 🟢 최근 완료 (2026-05-29~31)

### 근태관리 페이지 레이아웃 전면 개편 (2026-05-29)
- **집계 칼럼 11→5열**: 결근·연차·지각·연장·휴일 (출근/조퇴(건)/병가/휴일/조기(h)/조퇴(h) 제거)
- **연장 = 조기출근 + 연장근무 합산** 표시
- **31일 고정 렌더링**: 28/30일 달도 항상 31열, 초과일은 회색 비활성 → 레이아웃 불변
- **table-layout: fixed + 명시적 열 너비**: 체크 32px, 직원 120px, 일자 36px, 집계 36~50px
- **셀 div width:100%**: td 패딩 1px + div fills → 뱃지 잘림 해소
- **연차 카운팅 보정**: 반차 +0.5, 반반차 +0.25 정확 카운트
- **숫자 포맷 fmtNum()**: 정수=정수, 소수=소수점 유지 (0.25, 7.5, 28.5)
- **0값 "-" 표시**: 깔끔한 집계 표시

### 근태 유형별 지각/조퇴 스마트 처리 (2026-05-29)
- **서버+프론트 양쪽** 기준시간 맵 도입: NORMAL 08:30/18:00, HALF_AM 13:00/18:00, QUARTER_1 10:00/18:00 등
- **풀타임 휴가**: 지각·조퇴 0으로 강제
- **오전반차/반반차1**: 지각 제외 (오후 출근 정상)
- **오후반차/반반차4**: 조퇴 제외 (조기 퇴근 정상)
- **저장 시 자동 재계산**: check_in/check_out 기반으로 late_minutes/early_leave_hours 재계산

### 법인카드 마감일 + 캐시플로 결제 예정 (2026-05-31)
- **DB**: `corporate_cards.cutoff_day` 칼럼 추가 (마이그레이션 0273)
- **카드 관리 UI**: 마감일 입력 필드 추가 (결제일과 별도)
- **캐시플로 달력**: 카드사별 결제 예정을 **보라색 배지**로 결제일에 표시 ("하나 결제" 등)
- **결제액 계산**: 마감일(cutoff_day) 주기 기반 거래액 합산, 같은 카드사 자동 합산

### 법인카드 영수증 바로 첨부 (2026-05-31)
- 테이블 각 행에 **카메라 아이콘** → 파일 선택 즉시 R2 업로드
- 첨부 완료 시 **체크 아이콘(초록)** 전환
- 편집 모달 열 필요 없이 원클릭 완료

---

## 🟢 이전 완료 (2026-05-28)

### 단가 관리 시스템 구축 (2026-05-28)
- **매입단가 탭**: item_group별 그룹 뷰 + 단가연동 토글(price_linked) + 매입처 단가/이력 확장
- **매출단가표 탭**: 거래처 검색→정책 적용 단가 + 인쇄(A4) + 팩스 발송
- **입고 자동갱신**: PO receive → ①매입처단가 upsert ②base_price 갱신 ③item_group 연쇄(price_linked) ④이력기록
- **DB**: 0267(price_groups+price_change_history 스키마 수정), 0268(item_group_settings)
- **설계 결정**: price_groups 별도 테이블 → item_group 통합 (중복 그룹 체계 해소)
- **price_change_history 스키마 불일치 수정**: 기존 이력 기록 silent fail → field_name/old_value/new_value 컬럼 추가
- 프로덕션 배포 완료, 14페이지+11API 스모크 통과

---

## 🟢 이전 완료 (2026-05-27)

### 법인 분리 전체 감사 + Issues #217~#234 Phase 1~3 (2026-05-27)
- **MES 자동 스캔**: 6개 영역(페이지·API·정적분석·데이터정합성·UI·보안) → Issues 6건 등록
- **법인 분리 지도**: `docs/entity-separation-map.md` — 174테이블 전수 감사 (72완료/14버그/28간접/42공유/18시스템)
- **Phase 1** (코드만 11건): entityFilter 누락 8건, auth 누락 1건(CRITICAL), soft-delete 필터 1건, validation 1건
- **Phase 2** (마이그레이션 0264): entity_id 14테이블 추가 + 라우트 8파일 entityFilter 적용
- **Phase 3** (데이터 정합성 6건): 출고 취소 복수 shipment 수정, 소프트삭제 batch, UNIQUE 제약 2건, auto_process 고아 방지, E2E 정리
- 총 18건 close, 마이그레이션 0264~0266, 프로덕션 배포 3회

---

## 📌 기존 에러
- (없음) — 2026-05-19 확인: 3건 모두 200 정상
