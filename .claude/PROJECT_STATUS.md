# PROJECT_STATUS.md — 프로젝트 현황판

> **최종 업데이트**: 2026-05-08

---

## 🔒 편집 중 (충돌 방지)

- (없음)

---

## 🔴 현재 진행 중

- (없음)

---

## 🟡 대기 중

### [대형 파일 리팩토링] — 다음 세션
- orderForm.js(3966줄), items.js(3235줄), cards.ts(2122줄) 분리
- src/services/ 레이어 확장
- SELECT * → 명시적 컬럼 (점진적)
### [거래처 상세 정책 UI] — 단가 관리 연동
- 거래처 상세 페이지에 가격 정책 드롭다운 추가
### [CAPS 경리PC 워커 실행 확인] — 배포 완료, 실행 대기
- .env 비밀번호 설정 완료, 동기화 폴링 방식 전환
- 경리 PC에서 워커 실행 + 근태 동기화 테스트 필요
### [라벨 프린터 인쇄] — 프린터 모델 확인 필요
- CSS color 강화 완료, 실제 프린터에서 추가 테스트 필요
### [견적서→주문 전환 재설계] — 설계 검토 중
- 현재: 상태 변경(QUOTATION→CONFIRMED)으로 처리 (동작 중)
- 향후: 별도 전환 기능으로 개선 필요 (견적서 원본 보존 등)
### [즉시수금 증빙 유형 분류] — 설계 확정, 구현 대기 (P1)
- 회계반영 시 증빙 유형 선택 (세금계산서/현금영수증/카드/간이)
- receipt_type 컬럼 추가 필요 (DB 스키마 변경)
### [멀티사업자 이메일] — entity별 email_from_address (P1)
### [RIP 전송] — 코드 완료, 현장 테스트 대기
### [LogWatcher PrintExp] — 구현 완료, 현장 배포 대기
### [작업지시서 방향 결정] — v2 구현 완료, 실사용 피드백 대기 (2026-05-02)
### [주문 템플릿 UI] — API 완성, UI 연결 보류 (당장 불필요)
### [CAPS 경리PC 연동] — .env 배포 완료, 워커 실행 대기
- caps-worker `.env` 생성 완료, 경리 PC에 복사됨
- 프로덕션 설정 완료 (caps_worker_api_key, caps_sync_enabled=1)
- 경리 PC에서 `node src/index.js` 실행 필요
### [팝빌 LinkedID] — 프로덕션 설정 미입력
- `tax_provider_linked_id` 설정 UI에서 입력 필요

---

## 🟢 최근 완료 (2026-05-08)

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
