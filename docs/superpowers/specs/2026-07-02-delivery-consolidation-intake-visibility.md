# 배송 후속 — 접수 시점 합배송 판단 + 합포장·직배 가시성

- **작성일**: 2026-07-02
- **상태**: 🟠 **P1~P4 구현·검증 완료, main push(`cb4ad2b7`)·코드 prod 배포됨(타 세션 배포) — ⚠️마이그 0438 prod 미적용 = 주문 등록 500 진행중(2026-07-03)**. 복구=0438 `execute --remote --file` 1회(타 세션 인계됨)
- **배경**: 배송 P1~P3 prod 이후 후속. 동선 최적화·통합배송솔루션 계약은 07-02 기각 — 방향 = "합포장·직배가 한눈에 보이고 파악되게". 추가 요구 = **합포장 판단을 출고 시점→주문 접수 시점으로 앞당기는 장치**.
- **정본 관계**: `memory/project-delivery-system.md`(프로젝트) · merge 모델 = P3 `merged_into_id`(shipments.ts) · 후보 탐지 = `GET /api/shipments/consolidation-candidates`

## 용준님 확정 사항 (2026-07-02)

| 결정 | 내용 |
|---|---|
| 접수 장치 | **접수 폼에서 동일 거래처 "미출고건" 확인 + 합배송 여부를 그 자리에서 선택**(예약 저장 → 출고 시 자동 묶음) |
| 후보 범위 | **같은 거래처만** (권역 합짐 참고표시는 제외) |
| 직배 표시 | /shipments **'직배' 전용 섹션 신설** (자가배송 통합안 기각) |
| 묶음 배지 | **/shipments + /daily 양쪽** 적용 |

## 설계

### P1 — 접수 시점 합배송 판단 (핵심)
1. **후보 API**: `GET /api/orders/unshipped-by-client?client_id=&exclude_order_id=`
   - 같은 거래처의 **미출고** 주문(활성 status·`shipped_at IS NULL`). 납품일 무관(용준님 "미출고건" 기준 — 기존 consolidation-candidates의 같은날 기준과 다름).
   - 반환 최소 필드: 주문번호·납품일·배송방법·법인·품목요약 1줄.
   - ⚠️ **cross-entity 노출**: 같은 거래처 타법인 주문 포함(P2 합배송 후보와 동일 목적의 명시적 예외). 반환 필드 최소화로 민감도 낮춤. 게이트 수준은 구현 시 확정(접수자 일반권한 필요 → requireRole 완화 검토).
2. **의도 저장**: 마이그 `orders.consolidate_with_order_id INTEGER NULL`
   - 신규 주문 → 기존 주문 포인터. **저장 시 root 해소**(대상이 이미 포인터 보유 시 root id 저장, P3 체인 방지 패턴 동일).
3. **접수 폼 UI**(orderForm client.js/parent.js): 거래처 선택 시 후보 조회 → 배너 카드
   - 행별 "합배송" 선택(라디오/체크 1건) → 저장 payload에 포함. 납품일 불일치 시 경고 배지 + "납품일 맞추기" 원클릭(선택 사항).
4. **출고 자동 묶음 훅**: `ensureShipmentForOrder` 출고확정 경로 후처리
   - 양방향 조회: 자신의 포인터 대상 + `WHERE consolidate_with_order_id = 자신`. 상대의 활성 shipment 존재 시 기존 merge 로직 재사용(대표=최소 shipment id). 상대 미출고면 대기(상대 출고 때 역방향으로 성립).
   - 검증 = **같은 거래처**(merge API의 납품일 동일 검증은 intent 경로에선 실출고일 기준으로 완화 — 실제로 같이 나가는 시점에 묶임). 취소·거래처 변경은 merge 검증이 자연 차단.

### P2 — '직배' 전용 섹션 (/shipments)
- `src/scripts/shipments.js:42 sectionOf`: method '직배'/'직접배송' → `jikbae` 섹션 신설(화물/대신택배/한진/퀵과 병렬). 렌더 그룹·집계·인쇄 대상 포함. shipments 테이블 기반 행은 delivery_method join 값으로 판정(구현 시 courier 공백 직배 케이스 확인).

### P3 — 합포장 묶음 배지 (/shipments + /daily)
- 대표 = `🔗N건` 배지 / 부속 = `→대표 주문번호` 배지. list API가 `merged_into_id` 원시값 반환하는지 확인(daily는 COALESCE 상속이라 배지용 원시 필드 추가 필요 가능).
- 기존 후보 카드(묶기/해제)와 시각 일관성 유지.

### P4 — 합포장 알림톡 dedup (동승 권장, 기존 백로그)
- 출고 알림톡(fire-and-forget, shipments.ts): 부속 shipment(merged_into_id NOT NULL) 발송 스킵 → 대표 1건만.

## 영향 범위
- **DB**: 마이그 1건(orders.consolidate_with_order_id)
- **백엔드**: routes/orders(후보 API)·utils/shipmentHelper(출고 훅)·routes/shipments(P4 스킵)
- **프론트**: scripts/orderForm/client.js·parent.js(배너+payload)·scripts/shipments.js(섹션+배지)·daily 렌더(배지)
- **공수**: P1 ≈ 1세션 · P2+P3+P4 ≈ 0.5세션. worktree 세션 격리 필수(`scripts/new-session.ps1`).

## 착수 조건
용준님 "착수" 지시 → worktree 생성 → P1부터. 검증 = 로컬 D1 실데이터(접수→예약→출고→자동묶음 E2E) + `npm run build && npm run smoke`.
