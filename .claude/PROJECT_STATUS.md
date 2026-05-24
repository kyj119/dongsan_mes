# PROJECT_STATUS.md — 프로젝트 현황판

> **최종 업데이트**: 2026-05-24

---

## 🔒 편집 중 (충돌 방지)

- (없음)

---

## 🔴 현재 진행 중

- (없음)

---

## 🟡 대기 중 (사용자 선택/승인 필요)

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

## 🟢 최근 완료 (2026-05-24)

### GitHub Issues #158~#182 일괄 수정 (2026-05-24)
- **25건 close** — entity 필터, race condition, 원자성, N+1 최적화, 인덱스
- Race condition: scan.ts atomic UPDATE WHERE, orders/queries balance_after, AP purchase_balance
- Entity 필터: scan CARD 조회, cash_schedule, mrp_runs/results, expense_categories PUT/DELETE
- 원자성: 세금계산서 batch 통합, 여신 approval 2-batch, bank unapply, shipments 출고
- N+1: aiInsights 신용점수 단일 쿼리, cardExpenses 자동분류 batch
- 스키마: purchase_request_items entity_id, journal_entries 법인별 unique, 인덱스 3건
- 마이그레이션 0242~0247 생성 + 프로덕션 적용
- 배포 3회 성공, 스모크 테스트 2회 통과 (14/14 페이지, 11/11 API)

### 자금관리 탭 중복 정리 (2026-05-24)
- 바로빌 통장 탭 제거 → 은행 연동 탭에 기능 통합
- 바로빌 연결 상태 바를 은행 연동 상단에 표시
- 거래내역 테이블에 잔액 열 추가 (DB balance_after 활용)
- barobillView.js 삭제 (310줄, dead card 코드 포함)
- 탭 구조: 은행 연동 / 캐시플로 (2탭)

### 팝빌→바로빌 전환 + 통장 수금 반자동 (2026-05-23)
- 팝빌 코드 전면 교체: taxInvoices 5곳→getTaxProvider, clients.ts, kakao.ts, fax.ts
- 프론트 "팝빌" 텍스트 전부 "바로빌"로 변경
- 바로빌 실데이터 조회 성공: 카드 7건(하나 5월) + 통장 12건(하나 5/22)
- POST /api/bank/sync-barobill: 통장내역 자동 적재 + 자동매칭
- 은행 연동 UI: 입금/출금 분리 컬럼, 계좌명 표시, 거래처 검색 매칭

### 바로빌 SOAP 연동 전체 구현 (2026-05-22)
- 6개 서비스 파일: barobillClient/Sms/Fax/Tax/Card/Bank.ts
- SOAP XML raw fetch 방식 (CF Workers 호환)
- provider 스위칭: settings `messaging_provider` 값으로 팝빌↔바로빌 전환

### CAPS 선명2 사이트 추가 + 근태 entity 분리
- caps_sites에 S2(선명2) 등록, API_KEY 발급
- 선명(SM) CAPS 동기화 복구 (ACServer 재시작)
- attendance 테이블에 entity_id 컬럼 추가 (마이그레이션 0240)
- attendance.ts GET /month, GET / 에 entityFilter 적용
- caps.ts INSERT 시 employee의 entity_id 자동 설정

### 카드 수수료 계산 + 통장내역 CSV 가져오기
- 자금관리 → "카드 수수료" 탭 신규: 수수료 계산기, 기간별 집계, 카드사별 수수료율 CRUD
- DB: card_fee_rates 테이블 (0239), 기본 10개 카드사 2.2% 등록
- 자금관리 → "CSV 가져오기" 버튼 신규: 인터넷뱅킹 CSV 업로드 → 컬럼 자동매핑 → 중복방지 → import
- API: POST /api/bank/transactions/import, /api/bank/card-fee-rates CRUD, /api/bank/card-fee-calculate, /api/bank/card-fee-summary

### QR/바코드 스캔 시스템 (#80)
- /scan 페이지 신규: html5-qrcode 카메라 + 수동 입력, 모바일 우선
- API: GET /api/scan/:code (CARD/ITEM/EQ/ORDER 자동 감지), POST /api/scan/action
- 권한: ADMIN/MANAGER/OPERATOR, 사이드바 생산 그룹에 메뉴 추가

### 견적서 적정 단가 제안 (#75)
- 3개월 평균 판매단가 기반 추천 라벨 ("추천: ₩X,XXX (N건 평균)")
- 입력 단가가 평균 대비 20% 이상 낮으면 경고, 원가/마진 미노출

### CODEF 코드 전체 제거 (#151)
- src/lib/codef.ts 삭제 (486줄), bank/cardExpenses 엔드포인트 제거
- 프론트엔드: CODEF 설정 패널, Connected ID 발급 UI, Sync Preview 모달 제거
- 관련 이슈 #143 자연 해소 close

### 출고번호 entity별 독립 시퀀스 (#148)
- 포맷: SHP-E{entity}-YYYYMMDD-NNN, getNextSeqNumber에 entityId 필터 추가

### Issues #121~#156 — 원자성·entity 격리·UNIQUE 16건 close
- **#147**: approvals 여신 APPROVED → db.batch() 원자화
- **#146/#121**: sync-statuses billing_status + balance → db.batch() 원자화
- **#145**: syncOrderStatusFromCards catch → console.error 로그
- **#139**: approval_steps/attachments entity_id 추가 (0236)
- **#138**: 주문 하드삭제 batch에 tax_invoice_orders DELETE 추가
- **#152**: inventoryCount approve 보정+상태 단일 batch
- **#153**: inventory_count_items UNIQUE(count_id, item_id)
- **#154**: stock_alerts entity_id 추가
- **#150/#149/#141**: purchase_invoice_items/return_items/tasks entity_id 추가 (0237)
- **#155**: BOM 공유 정책 유지 (방안 B, close)
- **#156**: chart_of_accounts UNIQUE(code,entity_id) 테이블 재생성 (0238)
- **#140**: facility_zones 현재 중복 없음 확인 close
- **#157**: #150 중복 close
- **#142/#144**: on-hold 라벨 처리

---

## 🟢 이전 완료 (2026-05-20)

### 법인별·창고별 재고 분리 — Phase 1~6 전체 완료
- **Phase 1~3** (2026-05-20): DB 스키마, entity_id 코드 대응, 창고 UI, 대시보드
- **Phase 4** (2026-05-20): 주간 일괄 발주 — 소모예측+MRP+안전재고 통합 분석, 공급처별 PR 자동 생성, /weekly-purchase 대시보드
- **Phase 5** (2026-05-20): 주문 확정 시 자재 부족 경고 — BOM 기반 자재 체크, 주문 생성/상태변경/견적전환 3곳에 non-blocking warning
- **Phase 6** (2026-05-20): 알림 시스템 연동 — 출고 시 안전재고 이하 즉시 알림(in-app+stock_alerts), 주간 발주 결과 SMS 발송, MRP 버그 수정(po_id)

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
