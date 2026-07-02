# 품목 축 구현 계획 — 린-중 (호수+두께만 구조화)

> ⛔ **폐기(superseded, 2026-06-20)** → `2026-06-20-spec-group-variant-item-plan.md`(규격그룹→변종품목). 재고 정확성(두께별 재고)상 변종=품목이 맞아 컬럼안 폐기. 이 문서는 이력 참조용.

- **작성일**: 2026-06-20 · **깊이**: 중 (용준님 결정)
- **방침**: 단가/통계를 실제로 결정하는 축만 구조화. **EAV 옵션-축 시스템(5테이블·동적UI·축관리) = 보류(YAGNI)** — 필요 시 나중에 additive 추가.
- **참고**: 풀 EAV 설계는 `2026-06-13-option-axis-system-design.md`(미채택, 장래 옵션)

---

## 0. 구조화 대상 (판단: 자동단가 결정 or 통계 분석?)

| 축 | 처리 | 근거 |
|---|---|---|
| 소재·인쇄방식·규격·후가공 | **기존 컬럼 유지** (추가작업 0) | ㎡단가·면적·가공비 결정 (이미 구조화) |
| **호수** | **신규 구조화** | 깃발/태극기 GRADE 단가 + 호수별 통계 |
| **두께** | **신규 구조화** | 판재(포맥스) 단가/재고 + 두께별 통계 |
| 색상·구수·와트·형 | **규격 text** | 단가 결정 ❌·통계 가치 낮음 (간판은 별도 견적) |

→ 신규 구조 = **호수·두께 2개뿐**. EAV·동적폼·축관리 페이지 전부 불필요.

## 1. 마이그 (경량 1건) — `0326`
- `order_items`에 컬럼 2개: **`grade`**(호수, TEXT) · **`thickness`**(두께, TEXT). 둘 다 nullable.
- `size_grade_prices`(0324)는 기존 — 호수 GRADE 단가 룩업에 사용.
- ❌ option_axes/values/item_axes/order_item_options/option_rules = 만들지 않음.
- (선택) 두께 단가가 판재에서 중요하면 `thickness_prices`(item×두께→단가) 후속. 1차는 컬럼만.

## 2. 값·매핑 = constants SSOT (코드, 마이그 아님)
`src/constants/itemAxes.ts` 신규 (HR enum SSOT 패턴):
- `HOSU_VALUES = ['1호',…,'8호','특호','수기','대형']` *(실값 확정 D1)*
- `THICKNESS_VALUES = ['2T','3T','5T','10T']`
- `CATEGORY_AXES = { '깃발·기':['호수'], '판재출력':['두께'], '간판':['두께'] }`
- `layout.ts` 전역 주입 → 주문폼 드롭다운 (window.ITEM_AXES)

## 3. 주문 입력
- 품목 선택 → 카테고리가 `CATEGORY_AXES`에 있으면 해당 드롭다운 노출:
  - 깃발·기 → **호수** 드롭다운 → `order_items.grade`
  - 판재출력·간판 → **두께** 드롭다운 → `order_items.thickness`
- 나머지 속성(색상·형 등) → 기존 **규격(specification) text** 에 자유 입력
- orders/create·update에 grade/thickness 저장 1줄씩 추가 (EAV 저장로직 불요)

## 4. 단가 (후속, 별도 단계)
- **호수**: `order_items.grade` → `size_grade_prices[item_id, grade]` 룩업
- **두께**: 판재 단가가 두께 의존 시 thickness_prices or 소재 변형. 후순위
- 면적형(현수막 등) ㎡단가표 = 별도 spec(FINAL §2.1)

## 5. 통계
- `GROUP BY order_items.grade` / `thickness` — 단순 컬럼, 피벗 불요

## 6. Phase·순서
| # | 내용 | 산출 |
|---|---|---|
| 1 | 마이그 `0326`(grade·thickness) + `constants/itemAxes.ts` + 전역주입 | 로컬검증·prod |
| 2 | **표준품목 298 업로드**(`품목마스터/설계/표준품목_등록구조_수정본.xlsx` → 로드 SQL, is_active=1, 겸업 2행+링크) | 품목 마스터 |
| 3 | 주문폼 호수/두께 드롭다운 + 저장 | 주문 시 구조화 입력 |
| 4 | 단가 연결(호수 GRADE) · 통계 | 후속 |

## 7. 결정점
- **D1**: 호수 실값 목록 (1~8호? 특호·수기·대형 포함?) / 두께 값(2/3/5/10T OK?)
- **D2**: 두께 적용 카테고리 = 판재출력·간판 맞나? (소재로 흡수할지)
- **D3**: 업로드 방식 = `/api/items/bulk` 확장 vs 로드 SQL(0325 패턴, is_active=1)
