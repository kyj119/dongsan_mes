# 품목 마스터 로드 — Phase 1 구현 계획 (확정 결정 + 단계)

- **작성일**: 2026-06-19
- **상태**: 🟢 결정 전부 확정 → Phase 1a(스키마 토대) 착수
- **상위**: north-star = `2026-06-13-item-pricing-inventory-FINAL.md` / 게이트 = `item-axis-realign-plan` / 역할 = [[design-item-role-multi-flag]]
- **로드 원본**: `주문내역/표준품목_등록구조_수정본.xlsx`(시트 `등록데이터_수정본`, **298행**) — `item_code·item_name·item_type·대분류·pricing_method·unit·구분·비고/조치`

---

## 0. 확정 결정 (전부 용준님 승인)

| 키 | 결정 |
|---|---|
| 방향 | **(나) 비파괴** — item_type을 역할 정본으로 collapse 금지, **dual 플래그(is_sales/is_purchase) 유지** (B-1 검증, [[design-item-role-multi-flag]]) |
| 순서 | **306(298) 마스터 로드 먼저**, 그 위에서 분류 정리 |
| 분류 | 진행중→보조. **대분류 = 등록구조_수정본 9종**(제품종류 기반) |
| 인쇄방식 | **분리(②축)** — UV/솔벤/전사는 대분류 아님. `print_method_id`(기존) 축으로. 워크북 `8.축관리방식`이 이미 채택 |
| DG2 단가엔진 | 1차 = **AREA + FIXED + GRADE(깃발 호수)** 실가동. **COMPONENT(간판)=후속**(signage spec) |
| DG3 겸업 | 14종 = **원판(MATERIAL,재고/장단위) + 출력(PRODUCT,제품) 2행 분리** 등록, `product_materials` 연결, 재고=원판 단일출처 |
| DG4 기존품목 | **병행 등록 + 매핑** — 신규 298 등록, 기존 prod 103 유지(주문 FK 보존), ecount_code↔신코드 매핑표 |
| DG5 1차 제외 | 이름확인 16·선명 19·간판자재 18·간판 COMPONENT 33 = 후속 |

## 1. 대분류 9종 → item_categories

| 대분류 | 행(298) | 단가방식 | DB 처리 |
|---|---|---|---|
| 원자재 | 73 | FIXED | 기존 id5(MATERIAL) **재사용** |
| 간판 | 52 | COMPONENT*/FIXED | 신규(SIGN). 로드는 후속 |
| 부속품 | 48 | FIXED | 기존 id6(ACCESSORY) **재사용** |
| 깃발·기 | 36 | GRADE* | 신규(FLAG) |
| 시트·스티커 | 27 | AREA | 신규(SHEET) |
| 배너 | 25 | FIXED | 신규(BANNER) |
| 판재출력 | 25 | AREA | 신규(PANEL) |
| 현수막 | 7 | AREA | 신규(HANGING) |
| 출력물 | 5 | AREA | 신규(PRINTOUT) |

- 기존 인쇄방식(전사/UV/솔벤 id1~3)·역할(상품 id4) 카테고리 = **삭제/비활성 안 함** → 103 재포인트(P1c) 후 비활성. (지금 비활성 시 라이브 103품목 드롭다운 누락)
- 역할 분포(298): PRODUCT 161 · MATERIAL 91 · GOODS 46. 단가방식: AREA 63 · FIXED 168 · GRADE* 34 · COMPONENT* 33.

## 2. 스키마 변경 (Phase 1a, 전부 비파괴·additive)

| 마이그 | 내용 |
|---|---|
| **0322** | item_categories 7종 신규(현수막·배너·깃발·기·시트·스티커·판재출력·출력물·간판). 기존 비활성 없음 |
| **0323** | items에 **`pricing_profile`** 컬럼(CHECK FIXED/AREA/GRADE/COMPONENT) + `pricing_method` 백필. `pricing_method`(CHECK FIXED/AREA)는 직접 확장 불가 → 신규 정본 컬럼(B-6 태그드 유니온). pricing_method는 레거시(Phase 3 제거 후보) |
| **0324** | **`size_grade_prices`**(item_id·grade·price) — 깃발 GRADE 엔진 룩업표. 단가=법인 공유(entity_id 없음) |
| 0325(후속) | `item_external_code_map`(ecount_code↔new item_id) — DG4 매핑(P1c) |

## 3. Phase 1 단계 (각 검증가능 1단위)

- **P1a 스키마 토대 ✅(prod 적용)** = 0322·0323·0324 `execute --file --remote` 적용. prod 검증: 카테고리 13(신규7)·pricing_profile 백필 103·size_grade_prices 생성.
- **P1b 마스터 로드 ✅(prod 적용, staged)** = `migrations/0325`(231 품목 + 14 겸업 링크). **★is_active=0 스테이징**(picker 무오염). prod 검증: 231 staged·active 0·기존 103 미변경·GRADE 34·링크 77(기존63+14)·category NULL 0·스팟체크 정상. **prod 스모크 103/103**. ⚠️`production_required=1`(PRODUCT 기본) — 기성 PRODUCT(배너대 등) 후속 토글 검토.
- **P1c 기존 매핑 + 활성화(go-live)** = item_external_code_map 백필 + 인쇄방식/역할 카테고리 비활성 + **신규 품목 `is_active=1` 활성화**(기존 103 dedup·단가 후). 🔴**활성화 전 차단 선결**(아래 §5 bind-limit)
- **P1d 단가 배선** = pricing_profile=GRADE→size_grade_prices 룩업, AREA→㎡단가표(별도 spec). 견적/주문 단가계산 연결

## 4. 검증·롤백
- 각 마이그 로컬 적용 후 `npm run verify` + 품목/주문/재고 스모크
- 비파괴라 롤백 용이(신규 컬럼/테이블/행만). prod 적용은 용준님 승인 후 `wrangler d1 execute --remote --file`
- 단가엔진 GRADE 데이터(호수별 단가)는 희소(출고단가 11%) → 구조 먼저, 값 백필은 운영

## 5. 미해결·후속
- 🔴 **[P1c 활성화 차단] D1 바인드 한도 버그** — `weeklyPurchase.analyze`(steps 3·4 IN(?…)) + `consumptionForecast`(line 91 IN(?…))가 active `is_purchase_item=1` 품목 itemIds를 통째 바인드. 현재 prod active purchase=70(staged 제외)이라 정상이나, **신규 품목 활성화 시 >100 → D1 "too many SQL variables" 500**. 활성화 전 **IN() 80개 청크 분할** 필수(메모리 `d1-bind-param-limit`). ※로컬 스모크 1건 실패도 이 원인(로컬은 loaded active였음, prod는 staged라 무관·prod 스모크 103/103).
- 간판 COMPONENT 엔진 = `signage-component-estimate-structure` spec
- AREA ㎡단가표(출력방식×소재) = 별도 spec (FINAL §2.1)
- 재고 이중장부 PoC(원단 53건 직접판매↔BOM) = P1d 전 확인
- 이름확인 16·선명 19 = 용준님 정식명 회신 후
- 옵션축 시스템(EAV) = `option-axis-system-design` (별도 트랙)
