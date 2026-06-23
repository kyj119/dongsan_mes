# 회계 통합 관리 허브 (`/accounting`) 설계

작성: 2026-06-23 (brainstorming 합의). **착수: 다음 세션 Phase 1부터.**

> **상태(2026-06-23)**: ✅ **Phase 1~2 구현·prod 배포·검증 완료**(커밋 `02dfe2d4`·마이그 0374 remote·dep `f4504b5c` `--branch main`·smoke 101/101·`/summary`·`/payments`·`/accounting` 라이브 200). 신규 `pages/accounting.ts`·`scripts/accounting.js`·`routes/accounting.ts` + 마이그 **0374**(권한).
> - **Phase 1(입금)**: `GET /api/accounting/summary`(KPI 수입[기간 매출]/지출[기간 카드+매입]/미수금[전체 파생]) + `GET /api/accounting/payments`(필터·페이지네이션). 수정/삭제 = 기존 `/api/ledger/payment/:id` 재사용.
> - **Phase 2(세금계산서·현금영수증 탭)**: 조회 통합(상태·검색·기간 필터) — `GET /api/tax-invoices`·`/api/cash-receipts` 기존 GET 재사용. 발행/취소 정정은 기존 페이지 링크아웃(바로빌 라이프사이클 안전).
> - 다음 = **Phase 3(카드+매입 탭)** → Phase 4(통합 타임라인).

## 목적
경리/회계담당(ADMIN/MANAGER)이 7개 페이지에 분산된 회계 기록을 **한 화면에서 통합 조회하고 정정(수정/삭제)**. 발단: /bank 매칭 입금을 정리하려다 payments 전용 관리 UI 부재 인지.

## 확정 방향 (용준님)
- **통합 조회·정정 허브** (신규 입력 허브/복식부기 전표 중심 아님).
- **어음 1차 제외** (받을/지급어음 신설은 추후).
- 기존 페이지(/ledger·/tax-invoices·/cash-receipts·/card-expenses) **유지** — 통합 뷰만 추가, 흡수 아님.

## 기존 자산 맵 (조사 완료, Explore 2026-06-23)
| 회계 기록 | 테이블 | 기존 위치 | 목록 API | 수정/삭제 |
|---|---|---|---|---|
| 입금 | payments (0002) | /ledger ar-payments, /bank 매칭 | ❌ **거래처별만**(전체목록 없음) | ✅ ar-payments PUT/DELETE |
| 세금계산서 | tax_invoices (0044) | /tax-invoices | ✅ GET /api/tax-invoices | ✅ |
| 현금영수증 | cash_receipts (0087) | /cash-receipts | ✅ GET /api/cash-receipts | ✅ |
| 카드결제 | card_transactions (0231) | /card-expenses | ✅ GET /api/card-expenses/transactions | ✅ |
| 매입 | purchase_invoices (0215) | /ledger AP (accounts-payable.ts) | ✅ | ✅ |
| (지출결의) | payment_requests (0108) | /payment-requests | ✅ | ✅ |
| 복식부기 분개 | journal_entries/lines (0220) | — | 일부 | — |
| 어음 | **없음** | — | — | — |

핵심: 입금(payments) 수정/삭제는 `/ledger` ar-payments에 **이미 존재**. 유일한 실질 갭 = **payments 전체 목록 조회 API**.

## 신규 작업
- 파일: `src/pages/accounting.ts`, `src/scripts/accounting.js`, `src/routes/accounting.ts`
- API: **GET 입금 전체목록** 신규 (ar-payments에 추가 또는 accounting 라우트). 필터: 기간·거래처·금액·검색·entity. 나머지 탭은 기존 GET 재사용.
- 권한: `permission_pages` INSERT `/accounting` + `requirePagePermission` + 사이드바 메뉴(재무 섹션).
- entity_id 필터 필수(멀티법인).

## Phase 계획
1. **골격**: 페이지+권한+사이드바 + 상단 요약 KPI(총수입/지출/미수금) + **입금 탭**(신규 목록 API + 행별 수정/삭제 = ar-payments PUT/DELETE 연결).
2. 세금계산서 탭 + 현금영수증 탭 (기존 API 통합 UI).
3. 카드결제 탭 + 매입 탭.
4. 통합 필터·타임라인(수입/지출 단일 타임라인, 선택) + build/smoke 검증.

## 주의/함정
- ⚠️ **마이그 번호 충돌**: `feat/ia-editor-canvas-n1` 브랜치를 품목 마스터 작업과 공유 중 → 번호 충돌 빈번(바로빌이 0361→0362→0372→0373으로 3회 밀림). 회계 허브 마이그 추가 시 **착수 직전 `Glob migrations/03*.sql`로 최신번호 확인 후 그 다음 번호** 사용, 또는 **별도 브랜치** 권장. (2026-06-23 기준 최신 0373_barobill, 품목 0372_distribution_sheets)
- ?raw 전역스코프 충돌([[feedback-raw-concat-global-scope]]) — accounting.js 변수/함수 prefix.
- 거래내역 표 비율·인라인 갱신 패턴은 card-expenses(930fb3e1) 참고.
- 삭제 시 연결 역처리 필수(입금 삭제=ar-payments DELETE가 balance 파생 정합 처리; bank 매칭입금은 unapply 경유).
- clients.balance 파생(캐시 미사용). 복식부기 journal_entries는 1차 범위 밖(조회 탭 추가는 추후).
