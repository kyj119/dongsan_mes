# 멀티사업자(Multi-Entity) 설계 문서

> **작성일**: 2026-04-22
> **상태**: 설계 검토 중
> **영향 범위**: 전체 시스템 (인증, 라우트, UI, DB)

---

## 1. 배경 및 목적

### 현재 상황
- MES는 단일 사업자(settings 테이블의 company_* 키) 기준으로 설계
- 실제 운영: 법인 2개 + 개인사업자 1개

### 사업자 구조

| 구분 | 상호 | 대표자 | 직원 | 업종 |
|------|------|--------|------|------|
| 법인1 | (깃발+태극기+출력 전문) | 대표A | ~30명 | 생산 |
| 법인2 | (광고자재 유통+간판 제작) | 대표B | ~13명 | 유통+제작 |
| 개인1 | (광고자재 유통/지사) | 대표B | ~2명 | 유통 |

### 사업자 간 관계
- 생산 설비: 출력/후가공 → 법인1, 간판 제작 → 법인2
- 물건 교류 빈번 (법인2→법인1 출력 의뢰, 법인1→법인2 자재 사용)
- 자금 이동은 적음
- 월말 상계 처리 → 차액 세금계산서 발행
- 회계는 완전 독립 운영

### 목적
- 하나의 MES에서 3개 사업자를 통합 관리
- 회계 데이터(주문/매출/입금/세금계산서/급여)는 사업자별 완전 분리
- 마스터 데이터(거래처/품목/설비)는 공유
- 이관 전에 구축하여 이관 시 entity_id 포함

---

## 2. 설계 원칙

1. **단일 DB + entity_id**: D1 하나에 entity_id 컬럼으로 분리 (Odoo 패턴)
2. **공유가 기본**: 마스터 데이터는 공유, 트랜잭션만 분리
3. **미들웨어 자동 필터**: 라우트에서 entity_id를 의식하지 않아도 되도록
4. **단계적 구현**: 기반(Step 1-4) → 핵심(Step 5) → 후속(Step 6-7)
5. **내부 거래는 후순위**: 기반 구축 후 운영하면서 설계

---

## 3. 데이터 모델

### 3.1 신규 테이블: entities

```sql
CREATE TABLE entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                    -- 정식 상호명
  short_name TEXT NOT NULL,              -- 약칭 (UI 표시용)
  business_reg_no TEXT,                  -- 사업자등록번호 (000-00-00000)
  representative TEXT,                   -- 대표자명
  business_type TEXT,                    -- 업태
  business_item TEXT,                    -- 종목
  address TEXT,
  phone TEXT,
  email TEXT,
  tax_email TEXT,                        -- 세금계산서 수신 이메일
  popbill_corp_num TEXT,                 -- 팝빌 corpNum (사업자번호 하이픈 없이)
  bank_info TEXT,                        -- 입금 계좌 정보 (JSON)
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 3.2 entity_id 추가 대상

#### 트랜잭션 테이블 (분리 필수)

| 테이블 | entity_id 용도 |
|--------|---------------|
| orders | 이 주문의 매출 귀속 법인 |
| payments | 이 입금의 귀속 법인 |
| tax_invoices | 발행 법인 (공급자 = entity) |
| purchase_orders | 발주 법인 |
| purchase_payments | 매입 지급 법인 |
| cash_receipts | 발행 법인 |
| adjustments | 조정 귀속 법인 |
| payroll_runs | 급여 귀속 법인 |

모두 `entity_id INTEGER NOT NULL REFERENCES entities(id)` 추가.
기존 데이터(없음)는 이관 시 entity_id 지정.

#### 소속 구분 테이블

| 테이블 | entity_id 용도 |
|--------|---------------|
| employees | 급여 소속 법인 (고정, 이관 가능) |
| inventory_transactions | 재고 소유권 (+ location_id로 위치) |

#### 공유 테이블 (변경 없음)

| 테이블 | 이유 |
|--------|------|
| clients | 거래처는 법인 간 공유 |
| items | 품목은 동일 |
| item_categories | 품목 분류 동일 |
| cards / card_items | 생산은 법인1 중심, 의뢰 법인만 별도 표시 |
| equipment / facility | 설비 공유 |
| users | 사용자 계정은 법인과 독립 (전환 가능) |
| settings | → entity_settings로 확장 (아래 참조) |

### 3.3 설정 확장

```sql
-- 기존 settings: 글로벌 설정 (공통)
-- 신규: 법인별 설정
CREATE TABLE entity_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id INTEGER NOT NULL REFERENCES entities(id),
  setting_key TEXT NOT NULL,
  setting_value TEXT DEFAULT '',
  UNIQUE(entity_id, setting_key)
);
-- 예: (1, 'company_stamp_url', '/stamps/entity1.png')
--     (2, 'default_payment_terms', '30')
```

### 3.4 카드와 내부 거래

```sql
-- cards 테이블에 추가
ALTER TABLE cards ADD COLUMN requesting_entity_id INTEGER REFERENCES entities(id);
-- NULL = 자체 생산, NOT NULL = 다른 법인에서 의뢰받은 건
```

내부 거래 정산 모듈은 Phase 2로 보류. 운영하면서 설계.

---

## 4. 인증 / 전환

### 4.1 JWT 페이로드 변경

```typescript
// 기존
{ userId: number, role: string }

// 변경
{ userId: number, role: string, entityId: number }
```

### 4.2 전환 API

```
POST /api/auth/switch-entity
Body: { entity_id: number }
Response: { token: string } (새 JWT)

권한:
- ADMIN, MANAGER: 모든 법인 전환 가능
- 일반 직원: 본인 소속 법인만 (전환 불가, 드롭다운 비활성)
```

### 4.3 미들웨어

```typescript
// authMiddleware 확장
c.set('entityId', payload.entityId)

// 신규: entityFilterMiddleware (트랜잭션 라우트에만 적용)
// 쿼리에서 entity_id를 누락하면 에러 발생하도록 가드
```

### 4.4 "전체" 모드 (ADMIN 전용)

```
entityId = 0 또는 null → WHERE 절에서 entity_id 필터 생략
대시보드에서만 사용, 주문 생성 등 쓰기 작업에서는 반드시 특정 entity 필요
```

---

## 5. UI 변경

### 5.1 사이드바 법인 선택

```
┌────────────────────────────┐
│ 🏢 동산현수막(주)        ▼ │  ← short_name 표시
│                            │
│ 📋 주문 관리               │
│ 📊 생산 현황               │
│ ...                        │
└────────────────────────────┘

드롭다운 펼치면:
├ ✓ 동산현수막(주)
├   ○○광고자재(주)
├   ○○개인사업자
└   ── 전체 (관리자 전용) ──
```

### 5.2 영향받는 페이지

법인 전환 시 데이터가 바뀌는 페이지:
- 주문 목록/상세, 주문서 작성
- 원장 (매출/매입)
- 세금계산서
- 발주
- 급여
- 대시보드
- 현금영수증
- 리포트 (매출/VAT 등)

법인 전환 무관 (공유 데이터):
- 거래처 목록/상세
- 품목
- 생산 (카드/칸반)
- 설비
- 재고 (위치별 필터는 별도)
- 사용자/권한

---

## 6. 팝빌 연동 변경

### 현재
```typescript
const corpNum = await getSetting('popbill_corp_num') // 단일 값
```

### 변경
```typescript
const entityId = c.get('entityId')
const entity = await db.prepare(
  'SELECT popbill_corp_num FROM entities WHERE id = ?'
).bind(entityId).first()
const corpNum = entity.popbill_corp_num
```

팝빌은 하나의 링크아이디(계정) 아래에 여러 사업자를 등록할 수 있으므로,
`corpNum`만 바꾸면 동일 API로 다른 사업자의 세금계산서/카카오톡/SMS 발송 가능.

---

## 7. 이관과의 연계

### 이관 순서 (변경)

```
1. entities 시드 (3개 사업자 등록)
2. 거래처 이관 (공유, entity_id 없음)
3. 품목 이관 (공유, entity_id 없음)
4. 직원 이관 (entity_id = 소속 법인)
5. 주문 이관 (entity_id = 해당 법인 ECOUNT에서 온 것)
6. 입금 이관 (entity_id = 해당 법인)
7. 기초잔액 설정 (entity별)
8. 잔액 재계산 (entity별)
9. 대사 검증 (entity별)
```

### 이관 페이지 수정
- 이관 유형 선택 전에 **대상 법인 선택** 추가
- 이관 시 entity_id 자동 부여
- 대사 검증도 entity별로 분리

---

## 8. 구현 단계

| Step | 작업 | 의존성 | 예상 규모 |
|------|------|--------|----------|
| 1 | entities 테이블 + 시드 3건 | 없음 | 마이그레이션 1개 |
| 2 | entity_settings 테이블 | Step 1 | 마이그레이션 1개 |
| 3 | employees.entity_id 추가 | Step 1 | 마이그레이션 + HR 라우트 소 수정 |
| 4 | JWT entity_id + switch-entity API | Step 1 | auth.ts 수정 |
| 5 | 사이드바 법인 선택 UI | Step 4 | layout.ts 수정 |
| 6 | 트랜잭션 테이블 entity_id 추가 | Step 1 | 마이그레이션 (대) |
| 7 | 주문 라우트 entity_id 필터 | Step 4, 6 | orders/*.ts 수정 |
| 8 | 원장 라우트 entity_id 필터 | Step 4, 6 | ledger/*.ts 수정 |
| 9 | 세금계산서/현금영수증 entity_id | Step 4, 6 | taxInvoices.ts, cashReceipts.ts |
| 10 | 발주 entity_id | Step 4, 6 | purchaseOrders/*.ts |
| 11 | 급여 entity_id | Step 3, 4, 6 | payroll/*.ts |
| 12 | 팝빌 corpNum 동적 조회 | Step 1 | kakao.ts, messages.ts 등 |
| 13 | 대시보드 entity 필터 + 전체 합산 | Step 4, 6 | dashboard.ts |
| 14 | 이관 페이지 entity 선택 추가 | Step 1 | migration.ts |
| 15 | 카드 requesting_entity_id | Step 1 | cards.ts (소) |

---

## 9. 리스크 및 주의사항

| 리스크 | 대응 |
|--------|------|
| entity_id 누락으로 다른 법인 데이터 노출 | 미들웨어에서 강제 필터 + 쿼리 리뷰 |
| 기존 API 호환성 깨짐 | entity_id DEFAULT 1로 설정, 점진적 전환 |
| 라우트 수정 범위가 큼 (60+개) | 트랜잭션 라우트만 수정, 마스터 라우트는 그대로 |
| JWT 변경으로 기존 토큰 무효화 | 배포 시 전 직원 재로그인 안내 |
| 팝빌 사업자 등록 누락 | 법인2, 개인1 팝빌 등록 선행 필요 |

---

## 10. 미결 사항 (Phase 2)

- 내부 거래 정산 모듈 (법인 간 의뢰 → 월말 상계 → 세금계산서)
- 재고 법인 간 이전 문서
- 법인별 손익 리포트
- 거래처별 "주거래 법인" 설정 (선택사항)
