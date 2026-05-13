# Improvement Backlog
<!-- last_run_area: 4 -->
<!-- last_run_at: 2026-05-13T11:30:00+09:00 -->

> 자율 점검·개선 에이전트(auto-improve)가 6개 영역을 순환하며 발견한 항목.
> 용준님이 주기적으로 리뷰하여 상태를 변경 (new → approved → done, 또는 rejected).

## 통계
| 상태 | 건수 |
|------|------|
| 🆕 new | 15 |
| ✔️ done | 15 |
| ❌ rejected | 1 |

> **Area 4 데이터 정합성 (2026-05-13T11:30):**
> - tax_invoice_items/tax_invoice_orders tax_invoice_id 인덱스 누락 → A-005 자동 수정 (0193 migration)
> - shipment_items UNIQUE(shipment_id, card_id) 없음 → #31 등록 (HIGH: 카드 중복 출고 가능)
> - order 삭제 캐스케이드, 상태 머신, 트랜잭션 경계 등 검토 → 기존 코드에서 대부분 적절 처리됨
> - bank_transactions, inventory_transactions 인덱스 이미 존재 확인 → 추가 조치 불필요
>
> **Area 3 UX/기능 감사 (2026-05-13T10:00):**
> - 출고 → 세금계산서 이동 링크 없음 → #27 등록 (HIGH)
> - 주문 상세 → 카드 현황 버튼 없음 → #28 등록 (MEDIUM)
> - 납기 준수율 KPI 없음 → #29 등록 (MEDIUM)
> - 원단 소모 예측 검색/필터 없음 → #30 등록 (LOW)
> - 기존 empty state/로딩/에러 처리: 전반적으로 80~90% 구현 완료 — 자동 수정 대상 없음
>
> **Area 2 코드 품질 (2026-05-13T00:00):**
> - authMiddleware 전수 검사 (73개 라우트): 전부 적절히 보호됨 — 이슈 없음
> - models.ts 미사용 타입 8개 자동 제거 → A-004 (UserSession, PricePolicy, PricePolicyRule, ItemSubcategory, OrderStatusHistory, CardStatusHistory, Setting, InspectionQualityStatus)
> - SELECT * 178건 발견 → #26 등록 (상위 5개 테이블 우선)
> - calculateItemCost 내부 전용 export (무해) — 미조치
>
> **Area 1 헬스체크 (2026-05-12T16:30):**
> - Cloudflare Access 외부 IP 차단 확인 (정상, 프로덕션 보안 정책)
> - hono JWT CVE + postcss XSS — 즉시 자동 패치 (4.12.12→4.12.18, 8.5.9→8.5.14)
> - esbuild/vite dev server SSRF → #23 등록 (prod 영향 없음)
> - 이전 Area 1/2 실행(2026-05-12 00:14 / 12:15) backlog 미갱신분 통합
>
> **Area 2 코드 품질 (2026-05-12T12:15):**
> - N+1 쿼리 6건 발견 (#16~#22), entity_id 누락 테이블 11개 (#18), as any 270건 (#17)
>
> **Area 1 헬스체크 (2026-05-12T00:14):**
> - smoke.cjs 3개 엔드포인트 자동 추가 (quotations/hometax-invoices/search)
> - 스모크 커버리지 갭 34개 → #15 등록

---

## 🆕 New (미검토)

| ID | 제목 | 영역 | Issue | 공수 |
|----|------|------|-------|------|
| B-005 | printEvents.ts N+1 (이벤트당 3~5쿼리) | Area 2 | #16 | 1~2h |
| B-006 | entity_id 누락 테이블 11개 | Area 2 | #18 | 2~3h |
| B-007 | prices.ts + rip.ts Promise.all N+1 | Area 2 | #19 | 2~3h |
| B-008 | shipments.ts N+1 + webhooks.ts IP 하드코딩 | Area 2 | #20 | 1.5h |
| B-009 | taxInvoices.ts O(N×M×K) 중첩 N+1 | Area 2 | #21 | 3h |
| B-010 | inventoryCount.ts 재고 실사 N+1 | Area 2 | #22 | 2h |
| I-007 | as any 타입 안전성 270+ 인스턴스 | Area 2 | #17 | 3~4세션 |
| I-008 | 스모크 테스트 커버리지 갭 34개 | Area 1 | #15 | 1h |
| I-009 | vite/esbuild dev server SSRF (GHSA-67mh) | Area 1 | #23 | 30분~1h |
| I-010 | SELECT * 178건 → 명시 컬럼 전환 (clients/order_items/tax_invoice_items 우선) | Area 2 | #26 | 2~3h |
| F-005 | 출고 완료 후 세금계산서 발행 페이지 빠른 이동 링크 없음 | Area 3 | #27 | 1~2h |
| F-006 | 주문 상세 모달에 "카드 현황 보기" 버튼 없음 | Area 3 | #28 | 0.5~1h |
| I-011 | 대시보드 납기 준수율 KPI 카드 없음 | Area 3 | #29 | 2~3h |
| I-012 | 원단 소모 예측 페이지 검색/필터 없음 | Area 3 | #30 | 1h |
| D-001 | shipment_items UNIQUE(shipment_id, card_id) 제약 누락 | Area 4 | #31 | 1~2h |

---

## 🔧 Auto-fixed (자동 수정 완료)

| ID | 제목 | 커밋 | 날짜 |
|----|------|------|------|
| A-005 | tax_invoice_items/orders tax_invoice_id 인덱스 추가 (0193 migration) | 1b3a698 | 2026-05-13 |
| A-004 | models.ts 미사용 타입 8개 제거 (UserSession 등) | 2f94080 | 2026-05-13 |
| A-003 | hono 4.12.18 + postcss 8.5.14 보안 패치 (JWT CVE 등 7건) | 16b1482 | 2026-05-12 |

---

## ✔️ Done (처리 완료)

| ID | 제목 | 커밋 | Issue |
|----|------|------|-------|
| A-002 | smoke.cjs 3개 엔드포인트 추가 (quotations/hometax/search) | 256e37c | #15 |
| A-001 | entity_id INSERT 14건 누락 | c7c20d3 | - |
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

| ID | 제목 | 사유 |
|----|------|------|
| F-004 | 납품시간 disabled 이유 표시 | 용준님: "필요 없음" | #10 |

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
