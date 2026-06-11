# 워크플로우 자동화 설계서

> **작성일**: 2026-05-06  
> **상태**: 설계 확정, 구현 대기  
> **영향 범위**: 주문 상태 전이, 출고, 회계반영, 계산서 발행

---

## 1. 현재 상태 (AS-IS)

```
견적(QUOTATION) → 확정대기(DRAFT) → 확정(CONFIRMED)
  → 출력중(PRINTING) → 출력완료(PRINT_DONE) → 출고완료(SHIPPED)
    → 회계반영(BILLED) → 수금완료(PAID)
```

### 현재 자동화 상태
| 전환 | 방식 | 코드 위치 |
|------|------|-----------|
| 확정→출력중 | 자동 (장비 배정 시) | printEvents.ts |
| 출력중→출력완료 | **자동** (모든 카드 완료 시) | printEvents.ts:106-131 |
| 출력완료→출고완료 | 수동 (출고 확정 즉시 SHIPPED) | shipments.ts:456-457 |
| 출고완료→회계반영 | 수동 (세금계산서 페이지) | taxInvoices.js |
| 회계반영→수금완료 | 수동 (입금 처리 시) | ledger.js |

### 이미 확인된 사항
- 주문 생성 시 **기본 상태가 이미 CONFIRMED** (`orders/core.ts:817-821`)
- 출력완료 자동 전이 **이미 구현됨** (`printEvents.ts:106-131`)
- `billable_after` 필드 존재 (PICKUP +1일, DELIVERY +2일, `orders/queries.ts:223-249`)
- `invoice_method` 필드 존재 (PER_ORDER/MONTHLY/UNDECIDED/CARD/ISSUED_BY_OTHER)

---

## 2. 목표 상태 (TO-BE)

```
견적(QUOTATION) → 확정(CONFIRMED)          ← DRAFT 제거
  → 출력중(PRINTING)                        ← 자동 (현행 유지)
  → 출력완료(PRINT_DONE)                    ← 자동 (현행 유지)
  → 출고완료(SHIPPED)                       ← 출고 처리 후 1~2일 지연, 동기화로 전이
    → 회계반영(BILLED)                      ← 거래처 설정에 따라 동기화로 자동 전이
      → 계산서 발행                          ← invoice_method에 따라 분기
```

---

## 3. Phase별 상세 설계

### Phase 1: DRAFT 상태 제거

**변경 사항**: DRAFT를 상태 전이에서 제거. 주문 생성은 이미 CONFIRMED.

**영향 파일**:
| 파일 | 변경 |
|------|------|
| `src/routes/orders/core.ts:1237-1246` | validTransitions에서 DRAFT 관련 항목 정리 |
| `src/scripts/orders.js:33-41` | STATUS_TRANSITIONS에서 DRAFT 제거 |
| `src/pages/orders.ts` | 상태 필터 드롭다운에서 DRAFT 제거 |

**주의사항**:
- 기존 DRAFT 상태 주문이 DB에 있을 수 있음 → 마이그레이션으로 일괄 CONFIRMED 전환
- CANCELLED → DRAFT 전이가 존재 → CANCELLED → CONFIRMED으로 변경

**마이그레이션**:
```sql
-- 0181_remove_draft_status.sql
UPDATE orders SET status = 'CONFIRMED' WHERE status = 'DRAFT';
```

---

### Phase 2: 출력완료 자동 전이 (확인만)

**현황**: **이미 구현됨** (`printEvents.ts:106-131`)

모든 카드가 PRINT_DONE이 되면 주문도 자동으로 PRINT_DONE으로 전이.
추가 작업 없음. 동작 확인만 필요.

---

### Phase 3: 출고완료 지연 전이

**핵심 변경**: 출고 처리 시 즉시 SHIPPED가 아닌, 배송방식에 따라 1~2일 후 "동기화" 버튼으로 SHIPPED 전이.

#### 3-1. DB 스키마 변경

```sql
-- 0182_auto_complete_date.sql
ALTER TABLE orders ADD COLUMN auto_complete_date TEXT;
CREATE INDEX idx_orders_auto_complete ON orders(auto_complete_date) 
  WHERE auto_complete_date IS NOT NULL AND status = 'PRINT_DONE';
```

#### 3-2. 출고 처리 로직 변경

**파일**: `src/routes/shipments.ts:449-462`, `src/routes/orders/queries.ts:206-250`

현재:
```typescript
// 모든 카드 출고 → 즉시 SHIPPED
if (total > 0 && total === shipped) {
  UPDATE orders SET status = 'SHIPPED' WHERE id = ?
}
```

변경:
```typescript
// 모든 카드 출고 → auto_complete_date 설정 (SHIPPED는 동기화에서)
if (total > 0 && total === shipped) {
  const method = order.delivery_method || ''
  const isQuick = method === '방문수령' || method === '직접수령' || method === '직접배송' || method === '퀵'
  const delay = isQuick ? '+1 day' : '+2 days'
  UPDATE orders SET auto_complete_date = date('now', '${delay}') WHERE id = ? AND auto_complete_date IS NULL
}
```

**주의**: 
- `shipment_ready = 1` (유통 주문 등) 설정은 그대로 유지
- 기존 `billable_after` 설정 코드도 그대로 유지 (SHIPPED 전이 시점에 설정되도록 이동)
- 부분 출고 시에는 auto_complete_date 설정하지 않음 (모든 카드 출고 완료 시만)

#### 3-3. 동기화 API 엔드포인트

**파일**: `src/routes/orders/core.ts` (새 엔드포인트)

```
POST /api/orders/sync-statuses
```

```typescript
// Step 1: 출고완료 자동 전이
const shippedResult = await db.prepare(`
  UPDATE orders 
  SET status = 'SHIPPED',
      shipped_at = CURRENT_TIMESTAMP,
      billable_after = CASE
        WHEN delivery_method IN ('방문수령','직접수령','직접배송','퀵') THEN date('now','+1 day')
        ELSE date('now','+2 days')
      END
  WHERE status = 'PRINT_DONE'
    AND auto_complete_date IS NOT NULL
    AND auto_complete_date <= date('now')
    AND id NOT IN (SELECT order_id FROM cards WHERE shipped_at IS NULL)
  RETURNING id
`).all()

// Step 2: 회계반영 자동 전이 (Phase 4)
// ...

return { 
  success: true,
  data: {
    shipped: shippedResult.results.length,
    billed: billedResult.results.length
  }
}
```

#### 3-4. 출고 대시보드 표시

출고 페이지에 "출고 처리됨 (배송 중)" 섹션 추가:
- 상태: PRINT_DONE + auto_complete_date IS NOT NULL
- 표시: 주문번호, 거래처, 출고일, 예상 완료일, 배송방식
- "동기화" 버튼 → POST /api/orders/sync-statuses

---

### Phase 4: 회계반영 자동 전이

#### 4-1. 거래처 설정 추가

```sql
-- 0183_client_auto_billing.sql
ALTER TABLE clients ADD COLUMN auto_billing INTEGER DEFAULT 0;
-- 0: 수동 (기본)
-- 1: 자동 (billable_after 도래 시 동기화로 자동 BILLED)
```

**UI**: 거래처 상세 페이지에 "자동 회계반영" 토글 추가 (clientDetail.ts)

#### 4-2. 동기화 로직 (sync-statuses 엔드포인트에 추가)

```typescript
// Step 2: 회계반영 자동 전이
const billedResult = await db.prepare(`
  UPDATE orders 
  SET billing_status = 'BILLED',
      billed_at = CURRENT_TIMESTAMP,
      billed_by = ?
  WHERE status = 'SHIPPED'
    AND billing_status IS NULL
    AND billable_after IS NOT NULL
    AND billable_after <= date('now')
    AND client_id IN (SELECT id FROM clients WHERE auto_billing = 1)
  RETURNING id, client_id
`).bind(userId).all()
```

#### 4-3. CARD/ISSUED_BY_OTHER 거래처 처리

`invoice_method`가 CARD 또는 ISSUED_BY_OTHER인 거래처:
- 회계반영(BILLED) 후 계산서 발행이 **불필요**
- 동기화에서 자동으로 `billing_status = 'BILLED'` 처리 (발행 대기열에 안 올라감)
- 계산서 발행 탭에서 이 거래처의 주문은 필터링되어 표시되지 않음

```typescript
// eligible-orders 쿼리에 조건 추가
WHERE ... AND c.invoice_method NOT IN ('CARD', 'ISSUED_BY_OTHER')
```

---

### Phase 5: 계산서 발행 invoice_method 연동

#### 5-1. 계산서 발행 탭 필터링

**현재**: 모든 eligible 주문 표시  
**변경**: `invoice_method` 기준 필터링

| invoice_method | 계산서 발행 탭 | 월합산 탭 | 처리 방식 |
|----------------|--------------|----------|-----------|
| PER_ORDER (건별) | 표시 | 미표시 | 건별 세금계산서 |
| MONTHLY (월합산) | 미표시 | 표시 | 월합산 세금계산서 |
| CARD (카드) | 미표시 | 미표시 | 발행 불필요 |
| ISSUED_BY_OTHER (타발행) | 미표시 | 미표시 | 발행 불필요 |
| UNDECIDED (미분류) | 표시 (경고 표시) | 미표시 | 수동 결정 필요 |

#### 5-2. eligible-orders API 변경

```typescript
// GET /eligible-orders에 invoice_method 필터 추가
if (invoiceMethodFilter) {
  whereClauses.push('c.invoice_method = ?')
  params.push(invoiceMethodFilter)
}
// CARD/ISSUED_BY_OTHER는 기본 제외
whereClauses.push("COALESCE(c.invoice_method, 'PER_ORDER') NOT IN ('CARD', 'ISSUED_BY_OTHER')")
```

#### 5-3. UI 표시

각 거래처 그룹 헤더에 `invoice_method` 뱃지 표시:
```
[거래처명] (건별) 3건 / 150,000원
[거래처명] (월합산) → 월합산 탭에서 발행
[거래처명] (카드) → 발행 불필요
```

---

## 4. 동기화 버튼 UI 설계

### 위치: 세금계산서 페이지 상단 + 대시보드

```
┌─────────────────────────────────────────────────────┐
│ [🔄 상태 동기화]  마지막 동기화: 2026-05-06 14:30   │
│                                                      │
│ 처리 결과:                                           │
│  ✅ 출고완료 전이: 3건                                │
│  ✅ 회계반영 전이: 5건                                │
│  ⚠️ 수동 확인 필요: 2건 (미분류 거래처)               │
└─────────────────────────────────────────────────────┘
```

### 동기화 결과 표시
- 처리된 건수 (출고완료 N건, 회계반영 N건)
- 수동 확인 필요 건 (UNDECIDED 거래처)
- 에러 건 (있으면)

---

## 5. 구현 순서 (추천)

| 순서 | Phase | 작업량 | 의존성 |
|------|-------|--------|--------|
| 1 | Phase 1: DRAFT 제거 | 소 | 없음 |
| 2 | Phase 3: 출고완료 지연 + 동기화 API | 대 | 마이그레이션 0182 |
| 3 | Phase 4: 회계반영 자동 | 중 | 마이그레이션 0183, Phase 3 |
| 4 | Phase 5: invoice_method 연동 | 중 | Phase 4 |
| 5 | Phase 2: 출력완료 확인 | 소 (이미 구현) | 없음 |

---

## 6. 주의사항 / 엣지 케이스

### 출고 관련
- **부분 출고**: 일부 카드만 출고된 경우 auto_complete_date 설정하지 않음
- **출고 취소**: auto_complete_date가 설정된 후 출고 취소 시 → auto_complete_date = NULL로 리셋
- **수동 SHIPPED**: 동기화 외에도 긴급 시 수동으로 SHIPPED 가능하도록 유지

### 회계반영 관련
- **클레임 처리 중인 주문**: auto_billing이 켜져 있어도, 감액/클레임이 진행 중이면 자동 반영 제외 고려
- **마이너스 금액 주문**: final_amount <= 0인 주문은 자동 반영 제외
- **이미 계산서 발행된 주문**: billing_status가 이미 BILLED면 중복 처리 방지 (WHERE 조건으로 처리됨)

### 기존 데이터 호환
- DRAFT 상태 주문 → 마이그레이션으로 CONFIRMED 전환
- 기존 SHIPPED 주문 (auto_complete_date 없음) → 영향 없음 (이미 SHIPPED)
- billable_after가 이미 설정된 주문 → 영향 없음

### 동기화 안전장치
- 동기화는 **idempotent** (여러 번 실행해도 결과 동일)
- 동기화 실행 로그 기록 (activity_log 테이블)
- 동기화 결과를 사용자에게 명확히 표시

---

## 7. 테스트 체크리스트

### Phase 1 (DRAFT 제거)
- [ ] 주문 생성 → 바로 CONFIRMED
- [ ] CANCELLED → CONFIRMED 전이 동작
- [ ] 기존 DRAFT 주문 마이그레이션 확인
- [ ] 상태 필터에 DRAFT 미표시

### Phase 3 (출고완료 지연)
- [ ] 출고 확정 → 즉시 SHIPPED 안 됨, auto_complete_date 설정됨
- [ ] 택배/화물 출고 → auto_complete_date = +2일
- [ ] 방문수령/직접배송 → auto_complete_date = +1일
- [ ] 동기화 실행 → 기한 도래 주문만 SHIPPED
- [ ] 부분 출고 시 auto_complete_date 미설정
- [ ] 출고 취소 시 auto_complete_date 리셋

### Phase 4 (회계반영 자동)
- [ ] auto_billing=1 거래처 → 동기화 시 자동 BILLED
- [ ] auto_billing=0 거래처 → 수동 유지
- [ ] CARD/ISSUED_BY_OTHER → 자동 BILLED (발행 불필요)
- [ ] billable_after 미도래 → 자동 반영 안 됨

### Phase 5 (invoice_method 연동)
- [ ] PER_ORDER → 계산서 발행 탭에만 표시
- [ ] MONTHLY → 월합산 탭에만 표시
- [ ] CARD → 양쪽 모두 미표시
- [ ] UNDECIDED → 계산서 발행 탭에 경고 표시
