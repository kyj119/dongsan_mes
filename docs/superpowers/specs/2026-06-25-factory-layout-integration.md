# 공장 배치도 운영 현황판 — 장비 공정·재고 통합

> 작성 2026-06-25 · 기존 `/equipment` 배치도 강화 방향 · brainstorming 합의 후 spec
> 상태: **설계 확정 대기** (Phase 0 데이터 전제 + 재고 데이터 정책 사용자 확인 필요)

## 1. 배경·목적

장비 23대 × 다공정(솔벤/수성/UV/평판/전사/간판)이라 "어느 장비가 어디서 무엇을 하고, 그 작업에 쓸 원단이 옆에 충분한지"를 한눈에 파악하기 어렵다. 단순 시각화가 아니라 **작업 배정·재고 보충 의사결정 도구**로서 공장 도면 위에 장비(공정·상태)와 구역별 원단 재고를 통합한 운영 현황판을 만든다.

- **누가**: 관리자(전체 가동·병목·재고부족 모니터링) + 현장(내 구역 장비·원단)
- **연계**: 직전 작업으로 만든 생산현황(`/production` 출력이력·장비상태)과 자연 연결

## 2. 현황 (prod 실측 — spec 전제)

**인프라는 70~80% 존재, 데이터는 거의 0.** 완전 신규가 아니라 "잠든 배치도 + 빈 데이터 모델"을 살리는 작업.

| 구성요소 | 상태 | 근거(file/table) |
|----------|------|-----------------|
| 장비 배치도(좌표·드래그·구역) | ✅ 구현됨, 미활용 | `/equipment` 배치도 탭, `equipment.js` 드래그→`PATCH /position`, `facility_zones.bounds` |
| 구역 정의 | ✅ 4구역 활성 + bounds 좌표 | `facility_zones` id 7~10 (전사출력실/출력실/UV실/현수막실). 봉재실·간판실 없음 |
| 장비 상태 색상 | ✅ | RUNNING/IDLE/MAINTENANCE/BROKEN, `equipment.js STATUS_COLORS` |
| 도면 배경 업로드 | ✅ API 존재, 렌더 미사용 | `facility GET/POST /background` → `facility_settings.background_image`(string) |
| 레이아웃 데이터 API | ✅ | `facility GET /layout-data`: zones + equipment + inventory_locations + 오늘 작업수 |
| 재고 위치 테이블 | ⚠️ 테이블·API만, 데이터 0 | `inventory_locations`(location_x/y, zone_id, location_type), `inventory`↔미연결 |
| **공정 마스터** | ❌ 0건 | `print_methods` 비어 있음 (시드 필요) |
| **장비↔공정 매핑** | ❌ 없음 | `equipment`에 공정 컬럼·매핑 테이블 없음 |
| **장비↔구역 매핑** | ❌ 0/23 NULL | `equipment.zone_id` 전부 NULL, `location_zone` 1/23 |
| **원단↔공정 분류** | ❌ 0/264 NULL | `items.print_method_id` 전부 NULL |
| **재고 데이터** | ❌ 0건 | `inventory` 0, `inventory_locations` 0 (공장초기화 06-20 영향 추정) |

**기술 스택(재사용)**: Konva.js(ia-editor 캔버스, `iaEditor.js`) · HTML5 드래그(`schedule.js` 칸반) · R2 업로드(`files.ts`) · 차트 라이브러리 없음(CSS/SVG 게이지 자작) · 페이지/권한 보일러플레이트(`permission_pages`+`requirePagePermission`).

## 3. 결정사항 (사용자 확정 2026-06-25)

| # | 항목 | 결정 |
|---|------|------|
| D1 | 배치도 위치 | **기존 `/equipment` 배치도 탭 강화** (신규 페이지 X) |
| D2 | 배경·표현 | **실제 공장 도면 이미지** 배경 + 장비/재고 핀 오버레이 |
| D3 | 공정 분류 | **장비별 공정 명시 지정** (겸용 다중 허용, `print_methods` 연결) |
| D4 | 재고 연동 | **구역별 원단 잔량 게이지**(안전재고 대비 색상) + **재고 클릭 → 상세/입출고**(`/inventory` 연계) |

> 비채택: 신규 통합페이지 · zone 자동유추 · 개별 재고 위치핀 · 장비-소요원단 부족경고(후속 여지).

## 4. 데이터 모델

### 4.1 공정 분류 = 신모델 품목분류 연동 (확정 — print_methods 폐기 대체)
`print_methods`는 0335 폐기(§11.1). **장비 공정 enum의 정본 = 신모델 품목분류**(`items.category`/`sub_category`/`subcategory_id`의 인쇄방식 구분)와 동일 코드. 공정 6종을 신모델 분류에서 추출해 공유 상수로 전역 주입([[design-hr-enum-ssot]] 패턴, 신규 print_methods 테이블 생성 없음).

| code | 공정 | 비고 |
|------|------|------|
| SOLVENT | 솔벤 | 공용매체(원단 공유) |
| AQUEOUS | 수성 | |
| UV | UV | 공용매체 |
| FLATBED | 평판 | |
| TRANSFER | 전사 | |
| SIGN | 간판 | |

> **P0 첫 작업** = 신모델 `items` 분류값 정밀 조사 → 위 코드가 category인지 subcategory인지 확정, 인쇄방식 SSOT(`constants/process.ts` 또는 기존 분류상수 재사용) 정립. 폐기 정책 유지(print_methods 부활 X).

### 4.2 장비↔공정 매핑 (M:N 신규) — `equipment_processes`
장비 겸용 공정 지원(D3). 신모델 분류 코드(§4.1)를 `process_code` TEXT로 참조 — **폐기된 print_methods.id를 참조하지 않음**.
```sql
CREATE TABLE IF NOT EXISTS equipment_processes (
  equipment_id TEXT NOT NULL,
  process_code TEXT NOT NULL,                  -- SOLVENT/AQUEOUS/UV/FLATBED/TRANSFER/SIGN (신모델 분류)
  is_primary   INTEGER NOT NULL DEFAULT 0,     -- 대표 공정 1개(배지·필터 기본)
  PRIMARY KEY (equipment_id, process_code)
);
CREATE INDEX IF NOT EXISTS idx_eqproc_equipment ON equipment_processes(equipment_id);
```
> FK 미설정(인덱스만) — D1 FK 컬럼 영구제거 함정([[feedback-d1-fk-column-removal]]) 회피 + process_code는 enum 상수라 FK 불요.

### 4.3 장비↔구역 — 기존 `equipment.zone_id` 채우기
신규 컬럼 불필요. 공정 지정 UI에서 `zone_id`도 함께 입력(`PATCH /api/rip/equipment/:id`).

### 4.4 도면 배경 — R2 전환 권장
현행 `facility_settings.background_image`에 string(=base64 시 D1 비대). **R2 저장 + key만 보관**으로 변경:
- `POST /api/facility/background`: multipart 업로드 → R2 `facility/floor-plan/{ts}.{ext}` → `facility_settings.background_image`에 R2 key 저장.
- `GET /api/facility/background-image`: 인증 헤더 경유 blob 서빙([[feedback-auth-header-only-download]], `<img src>` 직접 불가 → axios blob).

### 4.5 재고 게이지 데이터 (P3 — 재고 입력 선행 전제)
"구역별 원단 잔량" = **신모델 분류(`items.category`/`sub_category`) 기준 공정별 원단 재고 집계** (§4.1과 동일 SSOT). `inventory.item_id` → `items` → 분류코드 매칭 → 공정별 `SUM(quantity)` vs `safe_stock` → 그 공정 장비(`equipment_processes`)가 속한 구역(`zone_id`)에 게이지. `storage_zones`↔`facility_zones` 이중체계 통합 불필요(공정 코드로 우회).

> ⚠️ **현재 `inventory` 0건** → 게이지 표시 데이터 없음. 재고 입력 운영이 **선행 전제**(§8-1). `items.print_method_id`(데드 컬럼) 미사용. P3는 P0~P2 후 별도 세션.

## 5. API

| 메서드·경로 | 신규/확장 | 용도 |
|-------------|----------|------|
| `GET /api/facility/layout-data` | 확장 | equipment에 공정(`equipment_print_methods` 조인) 추가, 구역별 원단 재고 집계 포함 |
| `PUT /api/rip/equipment/:id/print-methods` | 신규 | 장비 공정 다중 지정(is_primary 포함) |
| `PATCH /api/rip/equipment/:id` | 확장 | `zone_id` 입력 허용(현행 position만) |
| `GET /api/facility/zone-inventory` | 신규 | 공정/구역별 원단 잔량 + 안전재고 대비(게이지용) |
| `POST /api/facility/background` | 변경 | base64 string → multipart R2 업로드 |
| `GET /api/facility/background-image` | 신규 | R2 도면 이미지 blob 서빙 |
| `GET /api/inventory`, `/api/inventory/:id` | 재사용 | 재고 클릭 → 상세/입출고(D4) |

엔티티 격리: `equipment`·`inventory`는 `entity_id` 필터, `facility_zones`·`inventory_locations`는 전사 공용(기존 정책 유지).

## 6. 프론트 UI (`/equipment` 배치도 탭 + `equipment.js`)

1. **도면 배경**: 현 하드코딩 SVG → `background-image`(R2 blob) 위에 `facility_zones.bounds` 동적 반투명 박스. 편집모드에 도면 업로드 버튼.
2. **장비 핀**: 기존 location_x/y 드래그 유지 + **공정 배지/색상**(대표 공정) + 상태색(RUNNING/IDLE/정비/고장). 핀 클릭 → 팝오버(상태·진행카드·공정) → "출력이력 보기"(=`/production` 해당 장비 필터로 이동, 직전 작업 `equipment_ids` 재사용).
3. **공정 지정 UI**: 장비 편집 모달에 공정 다중선택(체크박스, is_primary 라디오) + 구역 셀렉트(`facility_zones`). id 접두사 기반 추천값(FLEXI→전사 등) 제시해 23대 일괄 입력 부담 완화.
4. **구역별 원단 게이지**(D4): 배치도 사이드 패널 또는 구역 박스 상단에 공정별 원단 잔량 바(안전재고 대비 녹/황/적). 게이지/재고 클릭 → 재고 상세·입출고 모달(`/inventory` API).
5. **공정 필터**: 직전 생산현황의 그룹화 헬퍼(`productionEqGroupKey`) 재사용 → 공정별 토글/하이라이트.
6. ?raw 전역스코프 격리: 신규 top-level은 `factory`/`flayout` 접두사. getElementById 가드.

## 7. Phase 계획 (6단계 — 대형, 세션 분리 권장)

| Phase | 범위 | 산출 | 의존 |
|-------|------|------|------|
| **P0 데이터 기반** | `print_methods` 시드 + `equipment_print_methods` 마이그 + 공정/구역 지정 UI + 접두사 추천 일괄입력 | 마이그, 장비편집 모달 | — |
| **P1 배치도 베이스** | 도면 이미지 배경(R2) + 동적 구역 bounds + 장비 핀(공정·상태) | `/background` R2화, 배치도 렌더 개편 | P0 |
| **P2 공정 레이어** | 공정 배지·색상·필터, 핀 팝오버 공정/진행카드 | layout-data 공정 조인 | P0,P1 |
| **P3 재고 게이지** | 공정/구역별 원단 잔량 게이지 + 재고 클릭→상세/입출고 | `zone-inventory` API, 게이지 UI | **재고 데이터 전제(§8)** |
| **P4 인터랙션·통합** | 장비 클릭→출력이력(/production 연계), 실시간 polling 갱신 | production 연동 | P1~P3 |
| **P5 마감** | 권한(`permission_pages` 기존 /equipment 유지), 반응형, 도면 좌표 정합 | 정리 | 전체 |

> brainstorming 규칙상 6 Phase = 대형. **P0~P2(장비·공정·배치도)와 P3(재고)를 세션 분리** 권장. P3는 재고 데이터 정책 합의 후 착수.

## 8. 리스크·전제 (중요)

1. **재고 데이터 0건 (최대 리스크)**: `inventory`·`inventory_locations` 0건, `items.print_method_id` 0/264. → **D4 재고 게이지는 데이터 입력이 선행돼야 의미.** 현재 운영에서 원단 재고를 MES에 입력하지 않는다면 P3는 "골격만 + 미래 대비"가 됨. **재고 입력 정책 합의 필요**(누가·언제·어느 단위로 입력하나).
2. **공정/구역 초기입력 부담**: 23대 공정·구역 수동 지정. 접두사 추천 + 일괄입력 UI로 완화하나 1회 운영 작업 필수.
3. **`print_methods` 빈 상태**: 시드 멱등(`INSERT OR IGNORE`), 기존 잔재 충돌 주의(PRAGMA 선확인).
4. **도면 좌표계**: 현 location_x/y는 % 기반. 도면 이미지 비율과 핀 정합 — 이미지 letterbox/contain 기준 통일 필요.
5. **2개 위치체계**: `storage_zones`(법인 창고) vs `facility_zones`(물리 배치도). 재고 게이지는 공정 기반 집계로 우회(§4.5).
6. **봉재실·간판실 구역 부재**: 간판 공정 장비가 들어갈 구역 없음 → P0에서 구역 추가 허용.

## 9. 영향 범위

- **마이그레이션**: print_methods 시드, equipment_print_methods 생성 (+ 필요시 facility_zones 구역 추가)
- **백엔드**: `src/routes/facility.ts`(layout-data 확장, background R2, zone-inventory 신규), `src/routes/rip|equipment`(공정 지정, zone PATCH)
- **프론트**: `src/pages/equipment.ts`(배치도 탭·공정 지정 모달), `src/scripts/equipment.js`(렌더 개편·게이지·핀), `src/scripts/production.js`(장비 클릭 연계)
- **권한**: 기존 `/equipment` 권한 유지(신규 페이지 없음)
- **무영향**: 주문·생산·세무·인사 등 기존 도메인

## 10. 다음 단계
1. **재고 데이터 정책 확인**(§8-1) — P3 착수 가부 결정
2. P0 착수(공정 시드·매핑·지정 UI) → P1·P2 배치도 → (합의 시) P3 재고

## 11. 검증 결과 반영 (에이전트팀 adversarial, 2026-06-25) — 필독

초안의 핵심 전제 일부가 **폐기된 시스템에 의존**해 수정 필요. prod 실측·메모리로 교차검증.

### 11.1 치명적 정정 — 공정 분류 기반 (§4.1·§4.5 무효)
- **`print_methods`는 폐기됨**: `0335_drop_print_system.sql`에서 DROP, `0337`에서 **id PK만 스텁 재생성**(code/name/card_group 없음). prod 0건이 입증. 메모리 [[feedback-d1-fk-column-removal]] "0335 품목생성 회귀→0337" 일치.
- `items.print_method_id`는 **데드 컬럼**(0335에서 전부 NULL화). → §4.5 "공정 기반 재고집계" SQL 실현 불가.
- **신모델 정합**: session-context — 신모델은 "분류8 + 인쇄방식별 제품 분리 + 원단 공유". 인쇄방식은 `items.category`/`sub_category`/`subcategory_id`에 녹아 있음. → **공정 분류 정본을 print_methods가 아닌 신모델 분류 또는 장비 전용 독립 상수로 재정의해야 함** (§ 미결정-A).

### 11.2 API 경로 정정 (§5)
| spec 초안 | 실제 | 조치 |
|-----------|------|------|
| `PATCH /api/rip/equipment/:id` zone 확장 | zone PATCH는 `facility.ts` **`PATCH /api/facility/equipment/:id/zone`** 실재 | 기존 경로 사용 |
| `PATCH /api/rip/equipment/:id/position` | `rip.ts:585` 실재 ✅ | 유지 |
| `/print-methods`·`/zone-inventory`·`/background-image` | 모두 미구현 | 신규(맞음). 단 공정 매핑 경로는 §미결정-A 따라 변경 가능 |

### 11.3 과소평가·누락 보강
- **R2 도면 업로드 = 高난이도**(현행 base64 string 저장 → multipart+R2+MIME검증+blob 서빙 신규). P1에서 별도 비중.
- **도면 좌표계 정합**: `location_x/y`(%) ↔ 도면 이미지 픽셀. letterbox/contain 기준 통일 명시 필요(P1·P5).
- **공정 편집 UI 전무**: `equipment.js` 편집모달에 공정 선택 없음 → 신규(중간 난이도). 23대 일괄입력 도구 필수.
- **`/production` 연계**: `equipment_ids` 필터 실재 ✅ → 팝오버에 "출력이력 보기" 버튼만 추가(간단).

### 11.4 확인된 전제 (이상 없음)
`equipment.zone_id`(0072, 0/23 NULL) · `inventory` 스키마(quantity/safe_stock/reorder_point/entity_id, 0232) · `inventory_locations`(0072) · `facility_settings.background_image`(0072) · `layout-data` API · `facility_zones`(시드 6구역 but prod 활성 4 — 봉재·간판 비활성, P0에서 활성/추가).

### 11.5 Phase 재조정 (확정 권장)
- **세션1 = P0~P2**(공정 분류 결정→equipment_process 매핑·지정 UI→배치도 베이스·공정 레이어). 장비 23대 초기설정 완결.
- **세션2 = P3~P5**(재고 게이지·인터랙션·마감) — **재고 데이터 정책 합의 후**. 재고 0건 상태로 P3 구현은 골격만.
- R2 도면 배경은 P1 내 선택 항목(현행 base64도 동작).

### 11.6 확정 결정 (사용자, 2026-06-25)
- **A. 공정 분류 정본 = 신모델 품목분류 연동** ✅: 장비 공정 enum을 신모델 `items.category`/`subcategory` 인쇄방식 분류와 동일 코드로 연결(§4.1). 재고 집계도 동일 SSOT(§4.5) → 단일소스 정합. P0 첫 작업 = 신모델 분류값 정밀 조사·코드 확정.
- **B. 범위 = P0~P2 먼저, 재고(P3) 분리** ✅: 장비·공정·배치도(공정 레이어 포함) 완결 후, 재고 게이지·인터랙션(P3~P5)은 재고 입력 운영 확보 시 별도 세션. R2 도면 배경은 P1 선택 항목.

> 본문 §4.1·§4.2(`equipment_processes`)·§4.5는 위 확정으로 갱신 완료. §5 신규 API의 공정 매핑은 `process_code` 기반(`/api/rip/equipment/:id/processes`).
