# PROJECT_STATUS.md — 프로젝트 현황판

> **최종 업데이트**: 2026-05-21

---

## 🔒 편집 중 (충돌 방지)

- (없음)

---

## 🔴 현재 진행 중

- (없음)

---

## 🟡 대기 중 (사용자 선택/승인 필요)

### [법인카드 내역 자동 수집] — 카드사 오픈API 확인 대기
- CODEF 월 80만원 → 포기. 대안 조사 완료 (2026-05-21)
- **용준님 확인 필요**: IBK기업은행(1533-6000)/하나금융/BC카드 오픈API에서 일반 법인 카드 조회 가능 여부
- API 불가 시 → Cloudflare Email Worker 이메일 파싱 구현 (card@dongsanplan.com)
- 상세 → `memory/project-card-data-collection.md`


### [#65] 후가공 단계별 추적 — 방안 A/B/C 선택 대기
- A: QR 원터치, B: Zone 기반, C: 최소 2단계. 코멘트 제안 완료, 답변 대기

### [#75] 견적 적정 단가 제안 — 방향 수정 답변 완료
- 매입단가 미노출, 평균 판매가 기반 추천 방식으로 전환

### [#79] 로트 추적 → 기간 역추적 축소 — 답변 완료
- lot 테이블 불필요, 기존 receipts 기반 기간별 역추적 쿼리만 추가 (S)

### [#80] 바코드/QR 시스템 — 모바일 설계 답변 완료
- HTTPS + html5-qrcode + 모바일 우선 레이아웃 계획

### [배송 관리 최적화] — 출고 대기 보드
- 배송방법별 그룹화 + 마감시간 카운트다운 + 일괄 출고 + 카카오톡 자동 발송
### [기존 계약 일괄 등록] — 엑셀 import 스크립트 제공 대기
### [라벨 프린터 인쇄] — 프린터 모델 확인 필요 (외부 의존)
### [RIP 전송] — 코드 완료, 현장 테스트 대기 (외부 의존)
### [LogWatcher PrintExp] — 구현 완료, 현장 배포 대기 (외부 의존)
### [한진택배 자동화] — 솔루션 선정 대기 (사용자 결정 필요)

---

## 🟢 최근 완료 (2026-05-20)

### 법인별·창고별 재고 분리 — Phase 1~6 전체 완료
- **Phase 1~3** (2026-05-20): DB 스키마, entity_id 코드 대응, 창고 UI, 대시보드
- **Phase 4** (2026-05-20): 주간 일괄 발주 — 소모예측+MRP+안전재고 통합 분석, 공급처별 PR 자동 생성, /weekly-purchase 대시보드
- **Phase 5** (2026-05-20): 주문 확정 시 자재 부족 경고 — BOM 기반 자재 체크, 주문 생성/상태변경/견적전환 3곳에 non-blocking warning
- **Phase 6** (2026-05-20): 알림 시스템 연동 — 출고 시 안전재고 이하 즉시 알림(in-app+stock_alerts), 주간 발주 결과 SMS 발송, MRP 버그 수정(po_id)

### CODEF API 확장 — 카드/보험/홈택스 함수 추가
- codef.ts에 fetchCardApprovals, fetchInsurancePayments, fetchEmploymentInfo, fetchTaxInvoices, checkBusinessStatus 추가
- cardExpenses 라우트에 CODEF 카드 연결(connect) + 동기화(sync) API 추가
- 카드사 기관 코드 매핑 10개사 (신한/현대/삼성/KB/롯데/하나/우리/농협/BC/씨티)

### 법인카드 사용 내역 관리 시스템 (Phase 1)
- DB: corporate_cards, card_transactions, expense_categories 3테이블
- 경비 분류 15개 기본 항목 (복리후생/접대/교통/식대 등) + CRUD
- 카드 등록/관리, 수동 등록, CSV 가져오기, 일괄 분류, 지출결의 생성
- 페이지: /card-expenses (3탭: 사용 내역/카드 관리/경비 분류)

### 거래처 원장 전면 개선
- 분석 탭 신규: 월말 마감 대시보드, 매출-매입 손익 요약, 거래처별 평균 회수 기간
- 거래 내역: 품목 라인 항상 펼침, 매출(+)/입금(-) 2컬럼 분리, 어음 결제 추가
- 미회계반영 주문 원장 제외, 수정 모달 통일, 발송 모달 채널 토글 통일
- 원장 인쇄/팩스 기능 신규, 복식부기(GL) 제거

### 팩스 발송 기능 확장
- 단가표: 팩스 버튼 + html2canvas 캡처 → 팩스 API
- 거래처 원장: 명세서 양식 생성 + 인쇄 + 팩스
- (견적서/발주서/거래명세서는 기존 구현 확인)

### 로그인 안정화
- Rate limit 5→10회/60초 (현장 NAT 공유 대응), IP 감지 개선
- JWT exp 시계 오차 60초 여유, corrupt 토큰 자동 정리
- 토큰 갱신 네트워크 에러 시 silent retry, CORS 10.x 대역 추가
- 에러 메시지 한글화, 테스트 계정 노출 제거

### Issues #118~#120 — 3건 close + 멀티사업자 전체 점검
- **#118**: vat_reports UNIQUE → entity_id 포함으로 재생성
- **#119**: fixed_expenses/loans entity_id 추가 + cashFlow 전체 entityFilter 적용
- **#120**: paymentRequests/approvals/taxInvoices → db.batch() 원자성 강화
- 추가: production.ts GET /logs, paymentRequests stats entityFilter 적용

### 현수막 RM 데이터 정합성 수정 (마이그레이션 0228)
- print_media id=3 재활성화, id=4 이름 통일, null parent_media_id 5건 수정

### GitHub Actions Backup 수정
- CLOUDFLARE_BACKUP_TOKEN 분리, 첫 성공 실행 확인

### 기존 500 에러 3건 해소 확인
- employees/12, stats/clients, unread-count — 모두 200 정상

---

## 🟢 이전 완료 (2026-05-18)

### 생산 현황 보드 대규모 개편
- 기본 필터: 출력 전 (PRINT_PENDING), 탭: 전체/출력전/출력중/출력완료/출고완료/HOLD
- 긴급도 정렬 (납기초과→당일→임박→PP미완료→납기순)
- 20건 페이지네이션 + 더보기 버튼
- 수량·후가공 상세 표시, 모달 확장 버튼
- SPA 내비게이션 버그 수정 (DOMContentLoaded→IIFE)
- 모달 닫기 버그 수정 (layout.ts ESC handler hidden 충돌)
- 스마트 자동갱신 (summary 30초, full 2분)

### Issues #111~#117 — 6건 close
- **#111**: returns.ts RESTOCK balance_after + entity_id
- **#112**: generalLedger 결제 자동분개 중복 방지 (409)
- **#114**: fixedAssets depreciate + GET /:id entityFilter
- **#115**: budgets LABOR + MAINTENANCE entityFilter
- **#116**: 주문 하드삭제 cascade 8개 테이블 추가
- **#117**: FK 미강제 → 옵션B (수동 cascade 유지, #116에서 보완)

### DB 일일 백업 자동화 구축
- GitHub Actions → R2 버킷 (`dongsan-backups`) 일일 자동 백업
- Windows 작업 스케줄러 → NAS (`Z:\Backups\D1\`) 일일 자동 백업
- 보존 정책: 일별 90일 + 월별 무기한
- `npm run db:backup` / `db:backup:nas` 수동 명령 추가

### 소재관리 연동 버그 수정
- PUT /media/:id: 소재명 변경 → 출력 품목명 자동 전파
- media_group 변경 → 원자재 item_group 연쇄 업데이트
- PATCH /items/:id: item_group, is_purchase_item 필드 허용

---

## 🟢 이전 완료 (2026-05-15~17)

### Issues #89~#110 — 22건 close (2026-05-17)
- 동시성, 데이터 정합성, entity_id 필터, N+1 해소, FK/인덱스

### [#81] 생산 현황 보드 — 디지털 작업 지시서 (2026-05-17)
- 카드 그리드 뷰 + 라이트박스 + 자동갱신 + 풀스크린

### 이슈 대량 처리 — 24건 closed (2026-05-15~16)
- #63~#91: 버그/데이터(10건) + Tier1(5건) + Tier2(6건) + Tier3(4건)

---

## 📌 기존 에러
- (없음) — 2026-05-19 확인: 3건 모두 200 정상 (employees/12, stats/clients, unread-count)
