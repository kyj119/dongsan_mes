# 옵션(축) 시스템 설계 — 규격·축 구조화 관리

- **작성일**: 2026-06-13 · **개정**: 2026-06-18 (v3)
- **상태**: 🟢 구조·운영 모델 확정 (EAV·규격 듀얼모드·의존성·권한) — 잔여는 시드/단가표/BOM 별도 spec
- **목적**: 규격·호수·두께·색·소재·인쇄방식·후가공 등 "축"을 글자가 아니라 **구조화 데이터**로 관리. → 단가 자동계산·축별 통계·변종 옵션화의 공통 토대
- **관련**: `2026-06-13-item-pricing-inventory-FINAL.md`, 통합본 시트7(옵션축정의)·시트8(축관리방식)

> **v2 변경 요약** (2026-06-18)
> 1. `order_item_options` **EAV 확정** — 사용성(빈 칸 없음·동적 입력) 우선. 통계는 요약 뷰로 보완.
> 2. **규격 듀얼모드** — 규격 입력 방식을 품목군별로: 출력물=NUMERIC(W×H 자유), 원자재·상품=LIST(표준목록).
> 3. **옵션 의존성** 분기 — NUMERIC은 `option_rules`(범위 제약), LIST는 단가표=허용 조합. 신규 테이블 `option_rules` 1개 추가.

> **v3 변경 요약** (2026-06-18) — 운영·권한 모델 (§10)
> 4. **동적 화면 1개** — 분류마다 별도 화면 아님. 적용 축(item_axes)이 입력 칸을 구성.
> 5. **카테고리 상속** — 품목 추가 시 분류만 고르면 적용 축·단위·규격 모드 자동. 담당자 입력 부담 최소.
> 6. **의존성 단계적 도입** — v1은 `option_rules` 규칙 0개(테이블만). 운영 중 필요한 품목만 추가. 선택적 "경고만" 모드.
> 7. **권한 모델** — 품목·축·의존성 = 품목 담당자 / 주문 입력 = 주문자.

---

## 0. 핵심 원칙

1. **축은 품목군마다 다르다** — 모든 품목이 모든 축을 갖지 않음. "이 품목은 어떤 축을 갖는가"를 마스터로 정의.
2. **축값은 글자가 아니라 데이터** — 주문 줄에 구조화 저장 → 통계·단가 자동.
3. **축은 두 역할** — 단가축(가격 결정) / 통계·사양축(정보).
4. **비파괴** — 기존 컬럼(규격·인쇄·소재·후가공)은 유지, 신규 축만 옵션 시스템으로. 하이브리드.
5. **사용성 우선 (EAV)** — 선택한 축만 줄(row)로 저장. 축을 안 쓰거나 하나만 쓰는 품목에 빈 칸이 따라붙지 않음. (고정컬럼 6개 안 채택 이유)
6. **규격은 품목군별 입력 방식이 다르다** — 출력물은 수치 자유입력, 원자재·상품은 표준목록 선택. → §9 듀얼모드.

---

## 1. 개념 4층

```
[축 정의]  option_axes      : 호수·두께·색상·소재·인쇄방식… (무엇이 축인가)
[축 값]    option_values    : 호수={7호,8호}, 두께={2T,3T,5T}… (축의 허용값)
[품목 적용] item_axes        : 현수막→{소재,인쇄,후가공,규격} / 깃발→{호수} (어떤 품목이 어떤 축)
[주문 선택] order_item_options: 이 주문 줄의 선택값 (현수막 → 소재=1코팅, 규격=600×90)
[의존성]   option_rules     : 조건 축 → 대상 축 제약 (소재=2코팅 → 규격 폭≤1500). NUMERIC 전용. (§9)
```

---

## 2. 테이블 설계 (초안)

### 2.1 축 정의 (마스터)
```sql
CREATE TABLE option_axes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,          -- HOSU, THICK, COLOR, WATT, GUSU, FORM, MEDIA, METHOD, FINISH, SIZE
  name TEXT NOT NULL,                 -- 호수, 두께, 색상 …
  role TEXT NOT NULL,                 -- 'PRICE'(단가축) | 'STAT'(통계·사양축)
  input_type TEXT NOT NULL,           -- 'SELECT' | 'NUMERIC' (축 기본값; 규격은 품목군별로 item_axes.input_mode가 override)
  storage TEXT NOT NULL,              -- 'OPTION'(옵션테이블) | 'COLUMN:print_method_id' 등 기존컬럼 매핑
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1
);
```

### 2.2 축 값 (마스터, SELECT 축만)
```sql
CREATE TABLE option_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  axis_id INTEGER NOT NULL REFERENCES option_axes(id),
  value_code TEXT NOT NULL,           -- 7HO, 5T, WHITE …
  label TEXT NOT NULL,                -- 7호, 5T, 백색
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  UNIQUE(axis_id, value_code)
);
```

### 2.3 품목별 적용 축 (마스터) — 품목 또는 카테고리 단위
```sql
CREATE TABLE item_axes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER REFERENCES items(id),     -- nullable
  category TEXT,                             -- nullable (카테고리 일괄 적용)
  axis_id INTEGER NOT NULL REFERENCES option_axes(id),
  is_required INTEGER DEFAULT 0,
  affects_price INTEGER DEFAULT 0,          -- 이 품목에서 이 축이 단가에 영향?
  input_mode TEXT,                          -- nullable. 규격 축 override: 'NUMERIC'(출력물) | 'LIST'(원자재·상품). NULL이면 option_axes.input_type 따름
  sort_order INTEGER DEFAULT 0,
  CHECK (item_id IS NOT NULL OR category IS NOT NULL)
);
```

### 2.4 주문 줄 선택값 (트랜잭션) — 신규 축만
```sql
CREATE TABLE order_item_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  axis_id INTEGER NOT NULL REFERENCES option_axes(id),
  value_id INTEGER REFERENCES option_values(id),   -- SELECT 축
  value_num REAL,                                  -- NUMERIC 축(예비)
  value_label TEXT,                                -- 스냅샷(표시·통계)
  entity_id INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_oio_order_item ON order_item_options(order_item_id);
CREATE INDEX idx_oio_axis_value ON order_item_options(axis_id, value_id);
```

### 2.5 옵션 의존성 규칙 (마스터, NUMERIC 규격 전용)
조건 축(예: 소재)의 값에 따라 대상 축(예: 규격)의 허용 범위·목록을 제약. **LIST 모드는 단가표가 조합을 정의하므로 이 테이블 불필요** — NUMERIC(출력물)의 범위 제약에만 사용. (§9 참조)
```sql
CREATE TABLE option_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT,                              -- 적용 품목군 (nullable: item_id로도 가능)
  item_id INTEGER REFERENCES items(id),
  when_axis_id INTEGER NOT NULL REFERENCES option_axes(id),   -- 조건 축 (예: 소재)
  when_value_id INTEGER NOT NULL REFERENCES option_values(id),-- 조건 값 (예: 2코팅)
  then_axis_id INTEGER NOT NULL REFERENCES option_axes(id),   -- 영향받는 축 (예: 규격)
  constraint_type TEXT NOT NULL,             -- 'WIDTH_MAX' | 'HEIGHT_MAX' | 'AREA_MAX' | 'DENY_LIST' | 'ALLOW_LIST'
  constraint_num REAL,                       -- 수치 제약값 (예: 1500)
  constraint_json TEXT,                      -- 목록 제약 (예: ["900x1800"])
  is_active INTEGER DEFAULT 1,
  CHECK (item_id IS NOT NULL OR category IS NOT NULL)
);
```
- 예: `소재=2코팅 → 규격 WIDTH_MAX 1500` / `소재=2코팅 → 규격 DENY_LIST ["900x1800"]`
- UI는 조건 축 선택 시 이 규칙을 읽어 규격 입력 범위·목록을 실시간 제한.

---

## 3. 하이브리드 — 기존 컬럼 vs 옵션 테이블

기존에 이미 구조화된 축은 **컬럼 유지**, 신규 축만 옵션 테이블. `option_axes.storage`가 어디에 사는지 가리킨다.

| 축 | role | 저장 위치(storage) | 상태 |
|---|---|---|---|
| 규격(W×H) | PRICE | `COLUMN: order_items.width/height` | ✅ 기존 |
| 인쇄방식 | PRICE | `COLUMN: order_items`(print_method_id 연계) | ✅ 기존 |
| 소재(원단) | PRICE | `COLUMN: print_media_id` | ✅ 기존 |
| 후가공 | PRICE | `COLUMN: order_items.finishing` | ✅ 기존 |
| **호수** | PRICE | `OPTION` | ❌ 신규 |
| **두께** | PRICE | `OPTION` | ❌ 신규 |
| **색상** | STAT | `OPTION` | ❌ 신규 |
| **구수** | PRICE/사양 | `OPTION` | ❌ 신규 |
| **와트** | PRICE | `OPTION` | ❌ 신규 |
| **형(S/F)** | 사양 | `OPTION` | ❌ 신규 |

→ 위험한 기존 컬럼 마이그레이션 없이, **신규 4개 테이블 추가만으로** 축 시스템 완성. (비파괴)

---

## 4. 단가 연결

- 단가축(`role='PRICE'` & `affects_price=1`)의 선택값 조합 → 단가표 조회
  - 면적형: 규격(면적) × ㎡단가[인쇄방식 × 소재]  (+ 후가공비)
  - 호수형: 호수 → 단가 (GRADE 룩업표)
  - 두께/와트 등: 단가표 키에 포함
- 거래처별 단가는 그 위에 override (`client_item_prices`)

## 5. 통계

- 축별 집계 = `order_item_options` JOIN으로 `GROUP BY axis, value`
  - 예: 호수별 매출 = axis=HOSU 로 묶어 합계
- 기존 컬럼 축(소재·인쇄)은 해당 컬럼으로 GROUP BY
- (참고) 옵션 테이블 EAV라 다축 교차분석은 피벗 필요 — 축 수가 적어(≤10) 부담 작음. 무거우면 통계용 뷰/머티리얼라이즈 고려

## 6. 입력 UX

- 주문 시 품목 선택 → `item_axes`로 **그 품목의 적용 축만** 노출 (현수막=소재·인쇄·후가공·규격 / 깃발=호수)
- 축값은 `option_values`에서 드롭다운(SELECT), 규격만 수치입력
- **프리셋** = 자주 쓰는 축값 조합 1클릭 (별도, 빈도기반 자동생성)

## 7. 마이그레이션 (비파괴)
1. 4개 테이블 생성 (option_axes/values/item_axes/order_item_options)
2. 축 정의 시드 (시트8 기준) + 값 시드 (호수 7/8호, 두께 2/3/5/10T, 색상 등)
3. 품목별 적용 축 시드 (시트7 매트릭스 → item_axes, 카테고리 단위)
4. 기존 컬럼 축은 storage 매핑만 등록 (데이터 이동 없음)
5. 검증: `npm run verify` + 주문/품목 페이지 스모크
> 기존 order_items 무변경 → 과거 데이터 영향 없음. 신규 주문부터 옵션 채움.

## 8. 잔여 결정
1. ~~적용 축을 품목 단위 vs 카테고리 단위~~ → ✅ **카테고리 기본 + 품목 override 확정** (2026-06-18, §10 상속)
2. ~~order_item_options EAV vs 고정컬럼 6개~~ → ✅ **EAV 확정** (2026-06-18, 사용성 우선)
3. 색상 등 STAT 축을 단가에도 쓰는 품목 있는지(예외)
4. 프리셋 테이블 설계(별도 spec)
5. 단가표 테이블 설계(별도 spec) — 축값 → 단가. **LIST 품목군은 단가표가 곧 허용 조합 정의**(§9)이므로 함께 설계

---

## 9. 규격 듀얼모드 + 옵션 의존성 (v2 핵심)

### 9.1 규격 입력 방식 — 품목군별로 다름
| 품목군 | 규격 입력 | input_mode | 의존성 메커니즘 | 가용성·가격 정의 |
|---|---|---|---|---|
| 출력물(제품) | W×H 자유 수치 | `NUMERIC` | 범위 제약 (`option_rules`) | option_rules + 면적단가표 |
| 원자재·상품 | 표준목록 선택 | `LIST` | 허용 조합 | **단가표 = 조합 정의** |

→ `item_axes.input_mode`로 품목군별 override. 규격 축은 하나, 입력 방식만 갈림.

### 9.2 의존성(가용성) 처리 — "소재에 따라 고를 수 있는 규격이 다름"
가격은 소재별로 이미 다르게 받음(소재별 단가표 존재 전제). 의존성은 두 길로 분기:

**NUMERIC (출력물)** — 규격이 연속값이라 "목록 제한"이 무의미. 소재별로 다른 건 폭·면적 한계뿐.
→ `option_rules`에 `소재=2코팅 → WIDTH_MAX 1500` 식 규칙 몇 개. 규칙이 데이터라 코드 수정 없이 추가.

**LIST (원자재·상품)** — 규격이 이산 목록 + 소재·두께·색별 단가표가 이미 존재.
→ **단가표에 등록된 조합 = 고를 수 있는 조합.** 별도 의존성 테이블 불필요. 2코팅 단가표에 없는 규격은 자동 차단.

### 9.3 입력 UX 원칙 (사용성)
- 항상 **조건 축(소재·두께) 먼저 → 영향받는 축(규격) 나중** 순차 선택(cascading).
- 불가능한 조합은 애초에 안 보임 → 오입력 차단.
- EAV 데이터엔 `소재=2코팅, 규격=…` 두 줄만 깨끗하게 남음 (input_mode·의존성과 무관하게 저장 구조 동일).

---

## 10. 운영·권한 모델 (v3)

### 10.1 화면은 분류마다 별도가 아니라 "하나의 동적 화면"
- 분류가 직접 다른 화면을 부르지 않음. 분류 → `item_axes`(적용 축) → 그 축들이 입력 칸을 구성.
- 같은 화면이 축에 따라 칸을 늘렸다 줄였다: 출력물=소재·인쇄·후가공·규격(수치) / 깃발=호수 1칸 / 포맥스=두께·색·규격(목록).
- → 분류별 화면 중복 제작·유지보수 없음.

### 10.2 카테고리 상속 — 품목 추가 부담 최소화
- 카테고리 마스터에 **적용 축·단위·규격 input_mode**를 1회 정의 → 품목은 분류만 고르면 자동 상속.
- 품목 담당자는 보통 **이름 + 분류**만 입력. 예외 품목만 축 override.
- 단위도 카테고리에 묶임 (예: 출력물=㎡, 깃발=장, 원자재=매).

### 10.3 의존성 단계적 도입
| 단계 | option_rules | 동작 |
|---|---|---|
| **v1 (시작)** | 규칙 0개 (테이블만) | 모든 규격 자유 입력. 복잡도 0 |
| **운영 중** | 필요한 품목만 1줄씩 | 실제 오입력이 생기는 품목에만 데이터 추가 (코드 무변경) |
- 규칙 입력은 자유 입력이 아니라 **고정 드롭다운 폼**: `[조건축][=값] → [대상축][제약][값]`.
- 선택적 **"경고만" 모드** — 막지 않고 경고만 표시 (`constraint`에 enforce/warn 플래그 추후).

### 10.4 권한 모델
| 역할 | 권한 |
|---|---|
| **품목 담당자** | 카테고리·축 정의, 품목 추가, (필요 시) 의존성 규칙 |
| **주문자** | 주문 입력 (품목 선택 + 축값 입력) |
- 현 운영(특정 담당자가 품목 자유 추가·관리)과 일치 → 권한 단순. 의존성 설정자=품목 관리자 동일인이라 설정 분산·혼선 없음.
- 신규 페이지(축 관리·의존성 관리) → `permission_pages` INSERT + `requirePagePermission` 등록 (구현 시).
