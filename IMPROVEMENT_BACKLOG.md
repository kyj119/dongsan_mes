# Improvement Backlog
<!-- last_run_area: 4 -->
<!-- last_run_at: 2026-05-14T15:00:00+09:00 -->

> 자율 점검·개선 에이전트(auto-improve)가 6개 영역을 순환하며 발견한 항목.
> 용준님이 주기적으로 리뷰하여 상태를 변경 (new → approved → done, 또는 rejected).

## 통계
| 상태 | 건수 |
|------|------|
| 🆕 new | 14 |
| ✔️ done | 32 |
| ❌ rejected | 2 |

> **Area 4 데이터 정합성 (2026-05-14T15:00):**
> - hometax_invoices JOIN 인덱스(job_id, matched_invoice_id) 누락 → A-009 자동 수정 (migration 0205)
> - tax_invoices 삭제 시 tax_invoice_orders 고아 레코드 미정리 (D1 FK CASCADE 미작동) → #54 등록 (SMALL, 30m)
> - CANCELLED 주문 + 부분 출고 카드 상태 불일치 — balance 역산 오버처리 위험 → #55 등록 (MEDIUM, 2~3h)
> - portal_access_tokens 만료 토큰 무한 축적 (client_id FK 없음, 정리 로직 없음) → #56 등록 (SMALL, 30m)
> - 자동 수정 1건 (A-009 migration), 신규 이슈 3건 (#54~#56)
>
> **Area 3 UX/기능 감사 (2026-05-14T13:30):**
> - 75개 페이지/스크립트 전수 UX 패턴 분석 (검색·필터·페이지네이션·빈상태·로딩)
> - approvals.js 3탭 결재 목록 검색·필터·페이지네이션 전무 → #43 등록 (MEDIUM, 2~3h)
> - tasks.js 작업 큐 limit:200 하드코딩 (API max:500) — 200건+ 실패 태스크 미표시 → #44 등록 (SMALL, 30m)
> - deliveryAnalytics + financialReports CSV 내보내기 없음 (productionReports와 불일치) → #45 등록 (MEDIUM, 2h)
> - 대시보드 장비 가동률 % KPI 부재 — 생산 용량 즉시 파악 불가 → #46 등록 (SMALL, 1~2h)
> - 자동 수정 0건 (안전 기준 미충족), 신규 이슈 4건 (#43~#46)
>
> **Area 2 코드 품질 (2026-05-14T11:00):**
> - authMiddleware: 84개 라우트 파일 전수 확인 — 모두 적절히 보호됨 ✓
> - try-catch 누락 17핸들러 자동 수정 (A-008): permissions(5) + finishing(7) + messageTemplates(4) + iaAuto(1)
> - N+1 신규 패턴 3건 발견: printSystem.ts rebuildItemPrices/대량생성 → #37 등록, settings.ts+priceLists.ts → #38 등록
> - SELECT * 잔여 157건 (이전 수정 범위 플랫 파일 한정) → #39 등록
> - floating HEAD 18개 커밋 main fast-forward 통합 완료
> - 자동 수정 1건 (A-008), 신규 이슈 3건 (#37/#38/#39)
>
> **Area 1 프로덕션 헬스 (2026-05-14T09:15):**
> - TypeScript typecheck: PASS ✓, Vite build: PASS ✓ (4.2MB worker, 307 modules)
> - 65개 라우트 등록 전수 확인 — 누락·충돌 없음 ✓
> - npm audit: esbuild GHSA-67mh (SSRF) — 기존 거절 패턴 (#23), 신규 조치 없음
> - 신규 발견 2건 (#35 대시보드 E2E 커버리지 부재, #36 try-catch 누락 4개 라우트)
> - 자동 수정 0건 (자동 수정 가능 항목 없음)
>
> **Area 6 자기 진화 (2026-05-13T16:00):**
> - GitHub 실제 상태 ↔ 백로그 대조: 18개 "new" 중 14개 완료·1개 거절 확인 → 동기화
> - 오탐 패턴 2건 문서화: dev server SSRF(#23 거절), webhooks.ts Popbill IP 화이트리스트(의도적 보안 제어 → 하드코딩 아님)
> - F-004 패턴 확장: 비활성 필드 UI 힌트 등 미세 UX 제안 금지 규칙 추가
> - 스킬 파일 3개 업데이트: auto-improve(오탐 제외 목록), security-audit(dev-server 제외), review-checklist(§13 N+1 패턴)
> - 미추적 완료 이슈 2건 추가: #24(inventory.ts N+1), #25(priceList+inspections N+1)
> - 신규 이슈 0건 (기존 발견 사항 정리 완료, 다음 Area 1부터 신규 탐지)
>
> **Area 5 보안 (2026-05-13T13:30):**
> - SQL Injection 전수 검사: entityFilter() + 파라미터 바인딩 확인 → 취약점 없음
> - XSS 5건 자동 수정 (A-006): approvals.js:380, invoice.js:203, purchaseInvoice.js:193, quotation.js:202, clients.js:463 → escapeHtml() 적용
> - XSS 잔여 (approvals.js:119-276, cards.js document.write) → #34 등록 (HIGH)
> - 보안 헤더 (CSP/X-Frame-Options/HSTS) 전무 → #32 등록 (HIGH)
> - /api/portal/auth/change-password rate limit 누락 → #33 등록 (MEDIUM)
> - CI 폴백 자격증명 (admin/password) 낮은 위험, GitHub Secrets 분리 권고
> - Popbill IP 화이트리스트 하드코딩 → #32 포함 기재 *(이후 오탐으로 재분류: 의도적 보안 제어)*
>
> **Area 4 데이터 정합성 (2026-05-13T11:30):**
> - tax_invoice_items/tax_invoice_orders tax_invoice_id 인덱스 누락 → A-005 자동 수정 (0193 migration)
> - shipment_items UNIQUE(shipment_id, card_id) 없음 → #31 등록 → 완료 (0194 migration)
> - order 삭제 캐스케이드, 상태 머신, 트랜잭션 경계 등 검토 → 기존 코드에서 대부분 적절 처리됨
> - bank_transactions, inventory_transactions 인덱스 이미 존재 확인 → 추가 조치 불필요
>
> **Area 3 UX/기능 감사 (2026-05-13T10:00):**
> - 출고 → 세금계산서 이동 링크 없음 → #27 등록 → 완료
> - 주문 상세 → 카드 현황 버튼 없음 → #28 등록 → 완료
> - 납기 준수율 KPI 없음 → #29 등록 → 완료 (대시보드 전면 재설계)
> - 원단 소모 예측 검색/필터 없음 → #30 등록 → 완료
>
> **Area 2 코드 품질 (2026-05-13T00:00):**
> - authMiddleware 전수 검사 (73개 라우트): 전부 적절히 보호됨 — 이슈 없음
> - models.ts 미사용 타입 8개 자동 제거 → A-004
> - SELECT * 178건 발견 → #26 등록 → 완료 (145건 제거 96%)
>
> **Area 1 헬스체크 (2026-05-12T16:30):**
> - hono JWT CVE + postcss XSS — 즉시 자동 패치 (A-003)
> - esbuild/vite dev server SSRF → #23 등록 → 거절 (로컬 서버 전용)
>
> **Area 2 코드 품질 (2026-05-12T12:15):**
> - N+1 쿼리 6건 발견 (#16~#22) → 전량 완료
> - entity_id 누락 테이블 11개 (#18) → 완료 (0193 마이그레이션)
> - as any 270건 (#17) → 완료 (902→45, 95% 제거)

---

## 🆕 New (미검토)

| ID | 제목 | 영역 | Issue | 공수 |
|----|------|------|-------|------|
| I-013 | 보안 헤더 전무 (CSP/X-Frame-Options/HSTS/X-Content-Type) | Area 5 | #32 | 1~2h |
| I-014 | /api/portal/auth/change-password rate limit 누락 | Area 5 | #33 | 30분 |
| I-015 | XSS 잔여: approvals.js(119-276) + cards.js document.write | Area 5 | #34 | 2~3h |
| I-016 | 대시보드 E2E 커버리지 부재 — 전면 재설계 후 회귀 테스트 없음 | Area 1 | #35 | 2~3h |
| I-018 | N+1: printSystem.ts rebuildItemPrices + 대량생성 이중루프 | Area 2 | #37 | 2~3h |
| I-019 | N+1: settings.ts PATCH + priceLists.ts assign-clients | Area 2 | #38 | 30분 |
| I-020 | SELECT * 잔여 157건 (hometaxInvoices/inventoryCount/finishing 등) | Area 2 | #39 | 2~3h |
| I-021 | approvals.js 결재 목록 검색·필터·페이지네이션 전무 | Area 3 | #43 | 2~3h |
| I-022 | tasks.js limit:200 하드코딩 — 200건+ 실패 태스크 미표시 | Area 3 | #44 | 30분 |
| I-023 | deliveryAnalytics + financialReports CSV 내보내기 없음 | Area 3 | #45 | 2h |
| I-024 | 대시보드 장비 가동률 % KPI 부재 | Area 3 | #46 | 1~2h |
| I-025 | tax_invoices 삭제 시 tax_invoice_orders 고아 레코드 축적 | Area 4 | #54 | 30분 |
| I-026 | CANCELLED 주문 + 부분 출고 카드 상태 불일치 (balance 역산 오버처리) | Area 4 | #55 | 2~3h |
| I-027 | portal_access_tokens 만료 토큰 무한 축적 (정리 로직 없음) | Area 4 | #56 | 30분 |

---

## 🔧 Auto-fixed (자동 수정 완료)

| ID | 제목 | 커밋 | 날짜 |
|----|------|------|------|
| A-009 | hometax_invoices job_id + matched_invoice_id JOIN 인덱스 (migration 0205) | — | 2026-05-14 |
| A-008 | try-catch 누락 17핸들러 (permissions/finishing/messageTemplates/iaAuto) | 60ee8b8 | 2026-05-14 |
| A-006 | XSS escapeHtml 5건 (approvals/invoice/purchaseInvoice/quotation/clients) | e099b20 | 2026-05-13 |
| A-005 | tax_invoice_items/orders tax_invoice_id 인덱스 추가 (0193 migration) | 1b3a698 | 2026-05-13 |
| A-004 | models.ts 미사용 타입 8개 제거 (UserSession 등) | 2f94080 | 2026-05-13 |
| A-003 | hono 4.12.18 + postcss 8.5.14 보안 패치 (JWT CVE 등 7건) | 16b1482 | 2026-05-12 |

---

## ✔️ Done (처리 완료)

| ID | 제목 | 커밋/Issue | 날짜 |
|----|------|-----------|------|
| I-017 | try-catch 누락 17핸들러 자동 수정 (permissions/finishing/messageTemplates/iaAuto) | A-008 / 60ee8b8 | 2026-05-14 |
| D-001 | shipment_items UNIQUE(shipment_id, card_id) 제약 추가 (0194 migration) | #31 | 2026-05-13 |
| I-015partial | 스모크 커버리지 55→88 엔드포인트 확대 | #15 | 2026-05-13 |
| I-012 | 원단 소모 예측 페이지 검색+상태 필터 추가 | #30 | 2026-05-13 |
| I-011 | 대시보드 전면 재설계: 납기 준수율 KPI + 생산 파이프라인 + KPI 클릭 연결 7개 | #29 | 2026-05-13 |
| F-006 | 주문 상세 모달 "카드 현황" 버튼 추가 | #28 | 2026-05-13 |
| F-005 | 출고 목록 거래처 헤더에 "계산서 발행" 링크 추가 | #27 | 2026-05-13 |
| I-010 | SELECT * 145건 제거 (178→6건, 96%) | #26 | 2026-05-13 |
| A-008 | priceList.ts + inspections.ts N+1 → db.batch() 전환 | #25 | 2026-05-13 |
| A-007 | inventory.ts 입고/출고/취소 N+1 3패턴 → batch 전환 | #24 | 2026-05-13 |
| B-010 | inventoryCount.ts 재고 실사 N+1 → db.batch() 전환 | #22 | 2026-05-13 |
| B-009 | taxInvoices.ts O(N×M×K) 중첩 N+1 → batch 전환 | #21 | 2026-05-13 |
| B-008 | shipments.ts N+1 → db.batch() 전환 | #20 | 2026-05-13 |
| B-007 | prices.ts + rip.ts Promise.all N+1 → IN절 일괄 조회 | #19 | 2026-05-13 |
| B-006 | entity_id 누락 10테이블 (0193 migration + INSERT 16건) | #18 | 2026-05-13 |
| I-007 | as any 902→45 (95% 제거, 9 커밋) | #17 | 2026-05-13 |
| B-005 | printEvents.ts N+1 → 이벤트당 5~7→3~4 쿼리 축소 | #16 | 2026-05-13 |
| I-008 | 스모크 커버리지 확대 (3개 자동 추가) | #15 | 2026-05-12 |
| A-002 | smoke.cjs 3개 엔드포인트 추가 (quotations/hometax/search) | 256e37c | 2026-05-12 |
| A-001 | entity_id INSERT 14건 누락 | c7c20d3 | — |
| B-001 | cards entity_id 격리 | 0960a5a | #1 |
| B-002 | LogWatcher URL + 서비스 실행 | (설정 수정) | #2 |
| B-003 | SHIPPED 카드 확인 모달 | 3dd4274 | #11 |
| B-004 | cards entity_id NULL 32건 보정 | (prod SQL) | #12 |
| I-001 | bank.ts N+1 제거 | 0960a5a | #3 |
| I-002 | autoProcess.ts N+1 제거 | 0960a5a | #4 |
| I-003 | approvals.ts N+1 제거 | 0960a5a | #5 |
| I-004 | clients API 응답 통일 | 0960a5a | #6 |
| I-005 | 로그인 rate limit 적용 | 44c1f04 | #13 |
| I-006 | hr.ts 에러 메시지 제네릭화 | 44c1f04 | #14 |
| F-001 | 거래처 필터 5개 | 575312d | #7 |
| F-002 | 주문 필터 CANCELLED 해소 | 575312d | #8 |
| F-003 | 대시보드 KPI 5개 | 575312d | #9 |

## ❌ Rejected

| ID | 제목 | 사유 | Issue |
|----|------|------|-------|
| I-009 | vite/esbuild dev server SSRF (GHSA-67mh) | "로컬 서버 전용이라 크게 문제 없음" — 프로덕션 영향 없음 | #23 |
| F-004 | 납품시간 disabled 이유 표시 | 용준님: "필요 없음" | #10 |

---

## 오탐(False Positive) 패턴 — 탐지 제외 목록

> auto-improve 및 security-audit 실행 시 이하 패턴은 이슈 등록 금지.

| 패턴 | 이유 | 첫 발견 |
|------|------|----------|
| `webhooks.ts` `allowedPrefixes` Popbill IP 목록 | 의도적 보안 화이트리스트, 하드코딩 아님 | Area 5 (#20) |
| dev server 전용 취약점 (vite/esbuild SSRF 등) | 프로덕션 영향 없음, 개발자 PC 전용 | Area 1 (#23 거절) |
| disabled 필드에 이유 힌트 없음 | 용준님: 불필요 (F-004 거절 패턴) | Area 3 (#10 거절) |

---

## 상태 변경 가이드

| 상태 | 의미 | 누가 변경 |
|------|------|----------|
| 🆕 new | 에이전트가 발견, 미검토 | auto-improve |
| 👀 reviewed | 용준님이 봄, 판단 보류 | 용준님 |
| ✅ approved | 진행 허가 | 용준님 |
| 🔨 in-progress | 구현 중 | Claude |
| ✔️ done | 완료, 배포됨 | Claude |
| ❌ rejected | 불필요 / 부적절 | 용준님 |
