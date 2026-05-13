# PROJECT_STATUS.md — 프로젝트 현황판

> **최종 업데이트**: 2026-05-13

---

## 🔒 편집 중 (충돌 방지)

- (없음)

---

## 🔴 현재 진행 중

- (없음)

---

## 🟡 대기 중

### [UI/UX 롤아웃 잔여] — Input Group 실적용
- ds-input-group CSS 준비 완료, orderForm/items 등 적용 보류 (템플릿 구조 변경 위험)
- 신규 폼 작성 시 점진적 적용 예정
### [GitHub #17] — as any 타입 안전성 270+ 인스턴스
- 사용자 승인 완료 (코멘트: "전체 파일 점검해서 순차적으로 진행해줘")
- 대공수 작업, 다음 세션에서 진행
### [거래처 상세 정책 UI] — 단가 관리 연동
- 거래처 상세 페이지에 가격 정책 드롭다운 추가
### [CAPS 경리PC 워커 실행] — 경리 PC 수동 실행 대기 (외부 의존)
- .env/시크릿 모두 배포 완료, 폴링 방식 전환 완료
- 경리 PC 접속 불가 (2026-05-08~), 복구 시 `node src/index.js` 실행 필요
### [라벨 프린터 인쇄] — 프린터 모델 확인 필요 (외부 의존)
- CSS color 강화 완료, 실제 프린터에서 추가 테스트 필요
### [RIP 전송] — 코드 완료, 현장 테스트 대기 (외부 의존)
### [LogWatcher PrintExp] — 구현 완료, 현장 배포 대기 (외부 의존)
### [작업지시서 v2] — 실사용 피드백 대기 (2026-05-02 구현 완료)
### [주문 템플릿 UI] — API 완성, UI 연결 보류 (당장 불필요)
### [한진택배 자동화] — 솔루션 선정 대기 (사용자 결정 필요)
- 로드맵 작성 완료 (HANJIN_INTEGRATION_ROADMAP.md)
- Phase A~D 3~4세션 분량, 솔루션 선정 + API 키 확보 후 착수
### [카카오톡 알림 마무리] — Phase 5.4
- src/routes/kakao.ts 기존 존재, 누락 이벤트 추가 + 템플릿 정리 필요
### [범용 LogWatcher] — Phase 1+2 구현 완료, Phase 3~5 대기
- Phase 1 완료: IEquipmentParser, WatcherManager, ParserFactory, 기존 파서 래핑
- Phase 2 완료: SqliteDbParser (Epson Edge Print DB 폴링, 132건 검증)
- `equipment.json` 이중 모드 (있으면 Universal, 없으면 Legacy 호환)
- 나머지 장비 로그 샘플 확보 후 Phase 3~5 착수

---

## 🟢 최근 완료 (2026-05-13, 5커밋)

- **UI/UX 전면 개선 (P0~P3 + 롤아웃)**:
  - P0: 시맨틱 CSS 변수 12종 (purple/orange/teal + light + surface), 11파일 하드코딩 색상 치환, 테이블 기본 striped
  - P1: 대시보드 Bento Grid (4열 hero 레이아웃), Side Sheet 컴포넌트, 사이드바 최근방문→제거
  - P2: FilterBar/BulkBar/InputGroup CSS 컴포넌트 + orders/clients/cards/inventory/taxInvoices/shipments 6개 페이지 롤아웃
  - P3: KPI 카운트업 애니메이션, 접근성 (Skip Link, ARIA, Focus Trap), 스크롤 그림자, 페이지 전환 효과
  - 사이드바: 법인 전환 UI 분리 (로고→별도 행), 최근 방문 제거
  - 버그수정: body/html 배경색, overscroll 방지, 스크롤 이벤트 window 전환
  - 독립 에이전트 검증 29/29 PASS

## 🟢 이전 완료 (2026-05-12)

- **범용 LogWatcher Phase 1+2 구현**:
  - Phase 1: IEquipmentParser 인터페이스, WatcherManager(다중 장비 폴링), ParserFactory, TnsParserAdapter, PrintExpParserAdapter
  - Phase 2: SqliteDbParser — Epson Edge Print SQLite DB 폴링 (Microsoft.Data.Sqlite)
  - Program.cs 이중 모드: equipment.json 있으면 Universal, 없으면 Legacy 호환
  - Epson NAS DB(Z:\Designs\Epson Edge Print\DB\Data.db)로 132건 읽기 검증 완료
  - 코드 리뷰 후 수정: NULL 체크, 원자적 position 쓰기, heartbeat 타임아웃 로깅
  - USAGE.md, UNIVERSAL_LOGWATCHER_DESIGN.md 업데이트

## 🟢 이전 완료 (2026-05-11~05-12, 12 커밋)

- **E2E 쓰기 시나리오 확장**: 10→28 테스트 (entity_id=99 격리, 마이그레이션 0192)
- **auto-improve 스킬**: 6영역 순환 점검 + GitHub Issues 자동 생성 + 코멘트 반영 워크플로우
- **GitHub Issues #1~#14 전량 처리**:
  - #1 cards entity_id 격리 수정 + #12 기존 32건 데이터 보정
  - #3~#5 N+1 쿼리 3건 제거 (bank/autoProcess/approvals)
  - #6 clients API 응답 통일 ({success,data} + 프론트 14파일)
  - #7 거래처 필터 5개 (전화번호/정렬/미거래/미수금/주문차단)
  - #8 주문 필터 CANCELLED 고정 해소
  - #9 대시보드 KPI 5개 (/cards: 지연·컬럼별·보류, /dashboard: 긴급·수금률)
  - #11 SHIPPED 전환 시 카드 확인 모달 (확정/취소 선택)
  - #13 로그인 rate limit 적용 (5회/60초)
  - #14 hr.ts 에러 메시지 제네릭화 5곳
- **LogWatcher 프로덕션 연결**: appsettings URL 수정, RIP PC 2대 online 확인
- **범용 LogWatcher 설계**: docs/UNIVERSAL_LOGWATCHER_DESIGN.md
- **문서 동기화**: PROJECT_STATUS/ROADMAP/MEMORY/design-decisions/architecture-flow

## 🟢 이전 완료 (2026-05-09~05-11, 4 커밋)

- **Phase 3.1 대형 파일 리팩토링 (3 파일 → 15 파일)**:
  - cards.ts(2121줄) → aggregator + queries/scheduling/lifecycle
  - items.js(3235줄) → core/modals/tabs/media/bulk (5파일, ?raw concat)
  - orderForm.js(3966줄) → client/itemRow/finishing/calc/sheet/parent (6파일, ?raw concat)
- **Phase 3.2 견적서 분리 (1:N 주문)**:
  - quotations + quotation_items 테이블 (마이그레이션 0191)
  - src/routes/quotations.ts 신규, 견적서→주문 변환 + prefill
  - 주문 상세에 견적서 연결 배너 표시
- **Phase 3.3 TypeScript 인터페이스 갱신**: Entity, PricePolicy, QuotationStatus 등
- **Phase 5.3 Playwright E2E**: 5 spec / 10 테스트, e2e.yml (deploy 후 자동 + 매일 KST 9시)
- **Phase 1.1 즉시수금 증빙 유형**: 마이그레이션 0189, receipt_type 컬럼 + 회계반영 모달 select
- **Phase 1.2 멀티사업자 이메일**: 마이그레이션 0190, entity별 email_from_address
- **Phase 1.3 팝빌 LinkedID**: settings UI에서 입력 완료
- **Entity 분리 백엔드 수정**: INSERT 14건 entity_id 누락 수정 (inventory/purchaseOrders/taxInvoices)
- **로고 설정 이동**: priceList → settings 페이지
- **감사 문서**: ENTITY_ISOLATION_AUDIT.md, HANJIN_INTEGRATION_ROADMAP.md

## 🟢 이전 완료 (2026-05-08)

- **단가 관리 시스템 신규 구축**:
  - 가격 정책 방식 (price_policies + price_policy_rules)
  - 단가표/정책관리/인쇄설정 3탭 통합 페이지 (/price-list)
  - 법인별 로고 설정, A4 데이터 기반 인쇄
  - 주문서 단가 자동 반영 (/api/price-list/calculate)
- **팝빌 연동 전면 수정**:
  - Linkhub 공통 인증 모듈 추출 (linkhubAuth.ts)
  - IP 제한 해제 (x-lh-forwarded), URL corpNum 제거
  - 카카오톡 템플릿 정상 조회
- **보안 감사 + 수정 (10건)**:
  - 웹훅 IP 검증, 경로 인젝션 차단, 금액 상한선, SQL 바인딩
  - XSS 검증, error.message 제네릭화, entity_id 검증, 타이밍 공격 방지
- **코드 구조 개선**:
  - cards.ts N+1 → db.batch(), syncOrderStatus 병렬화
  - Provider 3중 복사 → linkhubAuth.ts 통합
  - DB 인덱스 추가 (category, item_type)
- **이메일/CAPS/주문서**:
  - RESEND_API_KEY 프로덕션 설정 + reply-to
  - 유통 주문서 UI 개선 + 거래처 자동 채움
  - CAPS 동기화 폴링 방식 전환
  - messages/logs 500 에러 수정, credit-check 추가
- **QA**: 44페이지 전체 순회 + 17 API 헬스체크 + qa-audit 스킬

### 이전 (2026-05-07~08, 6 커밋)

- **프로덕션 외부 에이전트 연결 복구**:
  - AGENT_API_KEY 시크릿 프로덕션 등록 (LogWatcher/RIP 인증 복구)
  - CAPS worker/LogWatcher MES URL → 프로덕션 (webapp-9i0.pages.dev)
  - 프로덕션 D1: tax_test_mode=0, caps_worker_api_key, caps_sync_enabled=1
- **CAPS 수동 동기화 폴링 방식 전환**:
  - HTTPS→HTTP 혼합 콘텐츠 문제 해결 (클라우드→사내망 직접 호출 불가)
  - /sync/trigger: 플래그 설정, /sync/pending: 워커 폴링 (Agent Key 인증)
  - CAPS 워커: 30초 폴링 + 요청 감지 시 즉시 실행
- **SheetLayout 회전 객체 버그 3건 수정**:
  - 돔보 마크 바운드: rotated 시 width↔height 미교환 → 좌우 위치 오류
  - 캔버스 높이: rotated 시 height_cm 사용 → 하단 잘림
  - DXF 하단 선 누락: CutLine printable=false + scaleLineweights=true → 선 두께 0
  - 아트보드를 돔보 마크 영역까지 확장
- **루트 스크린샷 75개 정리**

## 🟢 이전 완료 (2026-05-06, 7 커밋)

- **R2 파일 스토리지 + IA 프로덕션 전환**:
  - R2 버킷 `dongsan-files` 생성, Workers 프록시 `/api/files/*`
  - 브라우저 파일 업로드: 청크 → R2 FormData 전환
  - IA C#: R2 다운로드 폴백 추가, ErpApiUrl → 프로덕션
  - 프로덕션 배포 + 마이그레이션 0176~0185 적용 완료
- **워크플로우 자동화 Phase 1~5**:
  - DRAFT 상태 제거 (0181), 출고 지연 전이 + 동기화 API (0182)
  - 회계반영 자동 + auto_billing 토글 (0183), invoice_method 연동
- **주문 상태 체계 재설계**:
  - 취소: 별도 버튼 + 이유 선택 (고객취소/디자인변경/원자재부족/기타) + cancel_reason 컬럼 (0184)
  - 복구: CANCELLED→CONFIRMED 복구 버튼
  - 역행 전이: PRINTING→CONFIRMED, PRINT_DONE→CONFIRMED 추가
  - HOLD 상태 폐기 (카드 수준만 유지)
- **버그 수정 7건**:
  - SPA replaceState 쿼리스트링 유실 (?edit=, ?copy= 등)
  - 명세서: 규격란 분리, 품목명[내용] 형식, 작성일자 제거, 전미수금/현미수금 계산 수정
  - 입금계좌/FAX: getEntityCompanyInfo에 bank_info, fax 추가 + entities.fax 컬럼 (0185)
  - 견적서 수정 404: API 엔드포인트 수정
  - 주문 상세 500: autoProcess.ts i.name → i.item_name
  - 출고 확정 주문 ID 미수집: s.order_id || s.id fallback
  - 주문 수정/복사 썸네일 복원: ai_groups_json에서 thumbnail_base64 추출

## 🟢 이전 완료 (2026-05-06)

- **거래처 원장 통합 리팩터**: 3탭(원장/미수금/회계반영) 제거 → 매출/매입 토글 단일 뷰
  - 거래처 상세 모달: 은행 거래내역 스타일 단일 타임라인 (분할 테이블 제거)
  - 에이징 KPI 통합 (30일+/60일+ 연체 카드 + 거래처 테이블 연체 컬럼)
  - 고아 파일 삭제 (receivables.js, billing.js)
- **회계반영 → 계산서 발행 플로우 통합**:
  - 세금계산서 페이지 탭 재구성: [회계반영 대기] [계산서 발행] [발행 이력] [월합산]
  - 회계반영 대기 탭: 거래처별 SHIPPED 미반영 주문 목록, 탭 뱃지, 알림 배너
  - 일괄 회계반영 버튼 + 계산서 발행 탭 billing_status 뱃지
  - eligible-orders API에 billing_status 컬럼 + entity_id 필터 추가

## 🟢 이전 완료 (2026-05-04~06, 19 커밋)

- **이메일/팩스/포털**: dongsanplan.com 도메인 인증(Resend), 거래명세서 팩스(팝빌), 원장 이메일 3채널
- **포털 문서 인증**: 사업자등록번호 2단계 인증, 토큰 metadata(type/order_id/period) 보안 강화
- **용어 통일**: "정산 관리"→"거래처 원장", "경리 확인"→"회계반영"
- **종합 코드 리뷰 수정**: CRITICAL 3건 + HIGH 4건 + MEDIUM 4건 일괄 수정
- **출고 프로세스 개선**: A4 가로 출고 리스트, billable_after(PICKUP +1일 확정), 한진 출고확정
- **대시보드**: "오늘 출고 예정 N건" KPI 카드 추가
- **유통 주문서**: order_type 분리, 유통용 간소화 폼, 출고 시 재고 차감
- **개발 도구**: verify-changes 스킬 추가

## 🟢 이전 완료 (2026-05-01~05-02)

- **마감 방식 시스템**: 카드 생성 시 finishing → final_width/height 반영, IA fold/cut lines, display_on_card 플래그, 프리셋 선택 강조, 마감 표시 그룹핑(상하:X 좌우:Y), 카드→품목 라인별 이동
- **재고관리**: 실사 버그 수정(is_purchase_item), 입고 취소 롤백, 입고/출고 모달 제거, 로스율 카드, 부분 실사(카테고리별), 빈 카테고리 정리
- **현장 카드**: 진행률 뱃지(X/Y), 주문/거래처 메모 연동, QR 스캔 상태 전환 확장(PRINTING→PRINT_DONE→출고)
- **작업지시서**: v2 시각적 작업지시서(썸네일+마감 다이어그램), 그룹 품목 중복 제거
- **IA**: ProcessItemAsync 빈 파일 가드, finishing 마진 max 대표값 수정
- **코드 품질**: Math.max 버그 수정(POST+PUT), inventory.js 잔재 정리

## 🟢 이전 완료 (2026-04-30~05-01)

- **워크플로우 개선**: 출고 이력, 상태 전이 검증, 출고 확정 버튼, 부분 출고 뱃지
- **재무/정산**: 은행 멀티사업자, 세금계산서 billing_status, 자금계획 entityFilter
- **기준정보**: 품목 중복 검사, 단가 이력, 거래처 soft delete, 코드 자동 채번
- **보안**: 주민등록번호 AES-256-GCM 암호화, XSS 수정, ESC 모달 핸들러
- **코드 정리**: 워크플로우 페이지 폐기, 2.7GB PNG 삭제

> 전체 아카이브: `.claude/PROJECT_STATUS_ARCHIVE.md`
