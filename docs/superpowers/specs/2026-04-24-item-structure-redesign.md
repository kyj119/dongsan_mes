# 품목 체계 개편 + 출고 대시보드 설계

> **작성일**: 2026-04-24
> **상태**: 구현 진행 중 (Phase 1~8 완료, 코드 체계 구현 완료)

## 1. 배경 및 목적

### 현재 문제
- 품목이 "출력방식 + 출력소재 + 후가공"을 하나로 합쳐서 관리
- 품목 선택 시 텍스트 검색으로 정확한 품목을 찾기 어려움
- 단가 변경 시 (잉크값 인상 등) 관련 품목을 하나하나 수정해야 함
- 카드 그룹핑이 카테고리 기반이라 생산 라인과 불일치

### 목표
- 출력방식과 소재를 분리하여 단가를 체계적으로 관리
- 주문서 입력 속도 향상 (코드 입력 + 필터)
- 카드 그룹핑을 생산 라인 기준으로 변경
- 출고 대시보드로 거래처별 통합 출고 관리

## 2. 적용 범위

| 분류 | 새 구조 적용 | 카드 그룹 | 비고 |
|------|------------|----------|------|
| 솔벤/수성/UV/평판 | **적용** | OUTPUT | 출력방식+소재 분리 단가 |
| 전사 | 기존 유지 | TRANSFER_FLAG | 고정 단가, 폰지 90%+ |
| 태극기 | 기존 유지 | TRANSFER_FLAG | 매입→제작→판매 |
| 간판 | 기존 유지 | SIGN | 내역서 방식 (별도 프로젝트) |
| 상품/부자재/무형 | 기존 유지 | 카드 미생성 | |

## 3. DB 스키마

### 3-1. print_methods (출력방식)

```sql
CREATE TABLE print_methods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  card_group TEXT NOT NULL,
  price_per_sqm REAL DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1
);
```

시드 데이터 (4건):

| name | code | card_group | price_per_sqm |
|------|------|------------|---------------|
| 솔벤 | SOLVENT | OUTPUT | (설정 시 입력) |
| 수성 | AQUEOUS | OUTPUT | (설정 시 입력) |
| UV | UV | OUTPUT | (설정 시 입력) |
| 평판 | FLATBED | OUTPUT | (설정 시 입력) |

### 3-2. print_media (소재)

```sql
CREATE TABLE print_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  media_type TEXT DEFAULT 'ROLL',   -- 'ROLL' | 'SHEET'
  price_per_unit REAL DEFAULT 0,
  unit TEXT DEFAULT '㎡',
  roll_width_cm REAL,               -- ROLL 전용: 원단 폭
  sheet_width_cm REAL,              -- SHEET 전용: 판 가로
  sheet_height_cm REAL,             -- SHEET 전용: 판 세로
  media_group TEXT,                 -- 그룹명 (포맥스, 아크릴 등)
  group_sort INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1
);
```

소재 유형:
- **ROLL**: 원단 (현수막천, 매쉬, 텐트천 등). roll_width_cm으로 원단 폭 관리.
- **SHEET**: 판재 (포맥스, 아크릴 등). sheet_width_cm × sheet_height_cm으로 판 규격 관리.

### 3-3. print_method_media (출력방식 ↔ 소재 연결)

```sql
CREATE TABLE print_method_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  print_method_id INTEGER NOT NULL,
  print_media_id INTEGER NOT NULL,
  price_override REAL,
  UNIQUE(print_method_id, print_media_id),
  FOREIGN KEY (print_method_id) REFERENCES print_methods(id),
  FOREIGN KEY (print_media_id) REFERENCES print_media(id)
);
```

- `price_override`: 이 조합의 특수 단가. NULL이면 method + media 합산 사용.
- 이 테이블에 행이 있어야만 해당 조합이 가능 (불가능 조합 차단).

### 3-4. items 테이블 확장

```sql
ALTER TABLE items ADD COLUMN print_method_id INTEGER REFERENCES print_methods(id);
ALTER TABLE items ADD COLUMN print_media_id INTEGER REFERENCES print_media(id);
```

- 두 필드가 설정된 품목: 새 단가 체계 적용
- NULL인 품목: 기존 base_price + pricing_method 사용

### 3-5. order_items 확장

```sql
ALTER TABLE order_items ADD COLUMN shipment_ready INTEGER DEFAULT 0;
```

- 카드 있는 품목: 카드 PRINT_DONE 시 자동으로 1 설정
- 카드 없는 품목 (원자재 직접 판매): 주문 확정 시 바로 1 설정

### 3-6. 기존 테이블 유지

`item_categories`, `item_subcategories`: 삭제하지 않음. 기존 품목(전사/태극기/간판)이 계속 사용.

## 4. 단가 구조

### 4-1. 기본 단가 계산

```
새 구조 품목:
  기본 단가 = print_methods.price_per_sqm + print_media.price_per_unit
```

### 4-2. 단가 적용 우선순위

```
1순위: 거래처별 특약 (client_prices.price)
2순위: 조합별 특수 단가 (print_method_media.price_override)
3순위: 출력방식 단가 + 소재 단가 합산
```

### 4-3. 단가 연동

출력방식 단가 또는 소재 단가 변경 시:
→ 해당 method×media 조합의 items.base_price 자동 업데이트
→ price_override가 있는 조합은 override 값 유지

### 4-4. 금액 계산

#### 롤 원단 (ROLL)
기존 방식 유지:
```
가로, 세로 → 10cm 올림 → 면적(㎡) × 단가 × 수량
100원 단위 반올림
```

#### 판재 (SHEET) — 배치 최적화

**1단계 (구현)**: 같은 규격 아이템의 최적 판 자동 선택
```
입력: 아이템 W×H, 수량 Q
소재의 가용 판: sheet_width × sheet_height

계산:
  각 판 규격에 대해:
    Option A (회전 없음): cols=floor(SW/W), rows=floor(SH/H)
    Option B (회전):      cols=floor(SW/H), rows=floor(SH/W)
    best = max(A, B)
    sheets_needed = ceil(Q / best)
    cost = sheets_needed × (SW/100) × (SH/100) × 단가/㎡

  최저 비용 판 자동 선택
```

단일 아이템 (수량 1)의 경우:
```
예: 100×100 출력, 판 120×240
  청구 면적 = 120×100 = 1.2㎡ (판 폭 120cm 기준, 나머지 120×140은 다른 주문 활용)
  금액 = 1.2㎡ × 단가/㎡
```

**2단계 (추후)**: 다른 규격 합판 배치 (Strip Packing 알고리즘)

## 5. 카드 그룹핑

### 5-1. 카드 그룹 정의

| card_group | 포함 | 설명 |
|------------|------|------|
| OUTPUT | 솔벤+수성+UV+평판 | 출력 라인 전체 → 1카드 |
| TRANSFER_FLAG | 전사+태극기 | 전사 라인 → 1카드 |
| SIGN | 간판 | 간판 라인 → 1카드 |

### 5-2. card_group 결정 로직

```
order_item의 card_group 결정:
1. print_method_id 있음 → print_methods.card_group 사용
2. category가 전사 관련 → TRANSFER_FLAG
3. category가 태극기 관련 → TRANSFER_FLAG
4. category가 간판 → SIGN
5. 그 외 (상품/부자재/무형) → 카드 미생성
```

### 5-3. 카드 생성 변경

orders/core.ts의 카드 생성 로직:
- 현재: `category_name`별 그룹핑
- 변경: `card_group`별 그룹핑
- 같은 card_group의 품목은 한 카드로 합침
- 카드 번호: 기존 방식 유지 (`YYYYMMDD-NNN-CC`)

## 6. 품목 자동 생성

### 6-1. 연결 시 자동 생성

소재를 출력방식에 연결하면 items 테이블에 품목 자동 생성:
```
소재 "현수막" × 출력방식 [솔벤, 수성, UV] 연결 시:

items 생성:
  - item_name: "솔벤 현수막", item_code: "SOL-XXXXX", print_method_id: 1, print_media_id: 5
  - item_name: "수성 현수막", item_code: "AQU-XXXXX", print_method_id: 2, print_media_id: 5
  - item_name: "UV 현수막",  item_code: "UV-XXXXX",  print_method_id: 3, print_media_id: 5

base_price = method.price_per_sqm + media.price_per_unit
pricing_method = 'AREA'
is_sales_item = 1
```

### 6-2. 연결 해제 시

해당 품목 비활성화 (is_active = 0). 삭제하지 않음 (기존 주문 참조 유지).

### 6-3. 단가 변경 시 연쇄 업데이트

출력방식 단가 또는 소재 단가 변경:
→ 해당 조합의 items.base_price 자동 재계산
→ price_override가 있는 조합은 제외

## 7. 주문서 UI 변경

### 7-1. 품목 필터 (출력 전용)

- 기본: 숨김 상태, 작은 버튼 하나로 활성화
- 활성화 시 2단계:
  - 1단계: [솔벤] [수성] [UV] [평판]
  - 2단계: 해당 방식의 소재 목록
- 소재 클릭 → 품목 필드에 자동 입력 → 필터 접힘

### 7-2. 품목 검색

기존 autocomplete 유지 + 품목 코드 검색 추가:
- 코드 입력 (예: "SOL") → 솔벤 계열 품목 매칭
- 이름 입력 (예: "현수막") → 전체에서 매칭
- 부분 매칭 지원

### 7-3. 단가 자동 계산

품목 선택 시:
```
1. 거래처 특약 확인 (client_prices)
2. 조합 특수 단가 확인 (price_override)
3. 출력방식 + 소재 합산
→ 단가 필드에 자동 입력
```

### 7-4. 금액 필드 수정 가능

- 단가 × 면적 × 수량으로 자동 계산
- **금액 필드 직접 수정 가능** (92,000 → 90,000 등 협상가)
- 수정된 금액은 시각적 표시 (아이콘 또는 색상)
- 별도 할인 필드 추가하지 않음

### 7-5. 단가 수동 변경 시

단가를 기본값에서 수정하면:
```
💡 이 거래처 기본 단가로 저장할까요?  [저장] [이번만]
```
- [저장]: client_prices에 저장 → 다음 주문부터 적용
- [이번만]: 이번 주문만 적용

### 7-6. 판재 배치 계산 표시

판재(SHEET) 소재 선택 시 한 줄 요약:
```
📋 최적 판: 120×240cm 1판 (2.88㎡) — 25,920원
```
- 규격/수량 변경 시 자동 재계산
- 롤 원단은 표시 안 함

## 8. 품목 관리 페이지 개편

### 8-1. 탭 구조

```
[ 출력방식·소재 ]  [ 일반 품목 ]  [ 원자재 ]
```

### 8-2. 출력방식·소재 탭

**출력방식 단가 섹션:**
- 4개 방식의 단가를 인라인 편집 가능한 테이블로 표시
- 단가 변경 시 관련 품목 base_price 자동 업데이트

**소재 관리 섹션:**
- media_group별 아코디언 그룹 표시
- 각 소재: 이름, 유형(롤/판재), 단가, 판규격, 사용 출력방식
- [+ 소재 추가]: 개별 추가 모달
- [+ 일괄 추가]: 그룹 기반 일괄 추가 모달
- [그룹 단가 조정]: 비율(%) 또는 금액으로 그룹 내 일괄 조정
- 출력방식 연결 변경 시 품목 자동 생성/비활성화

### 8-3. 소재 일괄 추가 모달

```
기본 이름 + 소재 유형(롤/판재) + 규격별 단가 목록
+ 사용 가능 출력방식 체크박스
+ 미리보기 (생성될 품목 수)
→ [일괄 생성]
```

### 8-4. 그룹 단가 조정 모달

```
조정 방식: 비율(+10%) 또는 금액(+500원)
현재 → 변경 후 미리보기 테이블
→ [적용]
```

### 8-5. 일반 품목 / 원자재 탭

기존 UI 그대로 유지.

## 9. 출고 대시보드

### 9-1. 페이지 구조

거래처별로 오늘 출고 예정 건을 그룹핑하여 표시:
- 각 거래처 블록: 주문 번호, 배송 방법, 납기 시간
- 블록 내: 각 주문 라인 + 카드 상태 (✅완료/⏳진행중)
- 전체 준비 완료 시 [출고 처리] 버튼 활성화

### 9-2. 출고 준비 판정

```
주문의 모든 order_items.shipment_ready = 1 → 출고 가능
하나라도 0 → 출고 불가 (미완료 항목 표시)
```

### 9-3. shipment_ready 자동 설정

- 카드 있는 품목: 카드 상태 PRINT_DONE 시 해당 카드의 order_items 전부 shipment_ready = 1
- 카드 없는 품목: 주문 확정(CONFIRMED) 시 바로 shipment_ready = 1

### 9-4. 필터

- 날짜: 오늘 / 내일 / 이번주
- 배송 방법: 전체 / 대신택배 / 방문수령 / 화물 등
- 상태: 전체 / 출고 가능 / 미완료

### 9-5. 카드 페이지 알림 배너

카드 상세/목록에서 같은 주문의 다른 카드 상태 표시:
```
⚠️ 이 주문에 다른 품목이 있습니다
  전사 카드 #0424-001-02: 깃발 7호 3장 (⏳ 인쇄중)
  → 전체 완료 후 같이 출고해야 합니다
```

## 10. API 변경

### 10-1. 신규 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| GET | /api/print-methods | 출력방식 목록 |
| PATCH | /api/print-methods/:id | 출력방식 단가 수정 |
| GET | /api/print-media | 소재 목록 (그룹핑) |
| POST | /api/print-media | 소재 추가 |
| POST | /api/print-media/bulk | 소재 일괄 추가 |
| PUT | /api/print-media/:id | 소재 수정 |
| DELETE | /api/print-media/:id | 소재 삭제 (soft) |
| PATCH | /api/print-media/group/:groupName/price | 그룹 단가 조정 |
| GET | /api/print-method-media | 연결 목록 |
| POST | /api/print-method-media | 연결 추가 (+ 품목 자동 생성) |
| DELETE | /api/print-method-media/:id | 연결 해제 (+ 품목 비활성화) |
| GET | /api/shipments/dashboard | 출고 대시보드 (거래처별) |
| PATCH | /api/shipments/:orderId/ship | 출고 처리 |

### 10-2. 기존 엔드포인트 변경

| Path | 변경 내용 |
|------|----------|
| GET /api/items | print_method, print_media 정보 JOIN 반환 |
| POST /api/orders | 카드 생성 로직: card_group 기반으로 변경 |
| PUT /api/orders/:id | 카드 재생성 로직 동일 변경 |
| PATCH /api/orders/:id/status | PRINT_DONE 시 shipment_ready 업데이트 |

## 11. 파일 변경 목록

| 구분 | 파일 | 변경 |
|------|------|------|
| DB | 마이그레이션 (신규) | 3 테이블 생성 + items/order_items 확장 + 시드 |
| 라우트 | src/routes/items.ts | 출력방식/소재 CRUD API |
| 라우트 | src/routes/orders/core.ts | 카드 생성 로직 변경 |
| 라우트 | src/routes/shipments.ts (신규) | 출고 대시보드 API |
| 페이지 | src/pages/items.ts | 탭 추가 |
| 페이지 | src/pages/shipments.ts (신규) | 출고 대시보드 |
| 스크립트 | src/scripts/items.js | 출력방식/소재 관리 UI |
| 스크립트 | src/scripts/orderForm.js | 필터+단가+판재배치+금액수정 |
| 스크립트 | src/scripts/shipments.js (신규) | 출고 대시보드 UI |
| 스크립트 | src/scripts/cards.js | 같은 주문 알림 배너 |
| 레이아웃 | src/layout.ts | 사이드바 출고 메뉴 |
| 엔트리 | src/index.tsx | 라우트/페이지 등록 |

## 12. 마이그레이션 전략

### 12-1. 테이블 생성 + 시드

1. print_methods 4건 시드
2. print_media: 이카운트 데이터 기반 + 수성 소재 8종 추가
3. print_method_media: 방식별 가용 소재 연결
4. items 자동 생성 (method × media 조합)

### 12-2. 기존 주문 데이터

- 2~3년 분량 이관
- 자동 매핑: 기존 order_items.item_name ↔ 새 items.item_name 매칭
- 매칭 안 되는 건: item_name 텍스트 보존 (기존 item_id 유지)
- 매핑 스크립트 작성 필요

### 12-3. 소재 초기 데이터 (이카운트 기반)

**수성 (~8종)**: 현수막, 패트, 합성지, 켈, 그레이켈, 그레이합성지, 부직포, 텐트천

**솔벤 (~12종)**: 현수막, 매쉬, 텐트천, 후렉스, 켄버스, 시트, 타공시트, 그레이시트, 랩핑시트, 매쉬배너, 코팅지, 조명시트

**UV (~48종)**: 시트, 암막천, 그레이후렉스, 투명시트 등 (이카운트 UV출력 계층그룹 참조)

**평판 (~27종)**: 포맥스 1T~10T, 예스포맥스 1T~10T, 아크릴 2T~10T, 알마이트 2T~3T, PC, 하이글라스 등

※ 최종 소재 목록은 용준님이 엑셀 데이터 확인 후 확정
