# 부문(부서)별 손익 관리회계 — Spec

- 작성: 2026-07-13 (브레인스토밍 합의)
- 메모리 정본: `memory/design-departmental-pnl.md`
- 브랜치: `feat/dept-pnl`

## 1. 목적 / 용도
- **관리회계(내부 경영판단)**: "어느 팀이 돈 버는지" — 부문별 매출·자재비·인건비·경비 → **영업이익·인건비율·공헌이익**.
- **세무신고와 무관**: 부가세·법인세는 법인(entity) 단위 그대로. 부서분할이 신고서에 영향 없음.
- 사용자 확정: 용도=관리회계 / 매출귀속=품목라인 자동 / 공통비=공헌이익 먼저·배부 나중.

## 2. 설계 핵심
- **부서 정의 = "부문 마스터"(얇은 계층) + 공정(items.category)이 귀속 엔진.**
  - 순수 공정 6종만 쓰면 3구멍(관리부서 매출0 / 봉제·후가공 공정SSOT 부재 / 유통·상품 category무공정). → 부문 마스터로 포섭.
  - 리포팅 묶음 변경은 **매핑만 수정**(스키마 불변). 예: 솔벤+수성을 '출력'으로 합산.
- **계층 트리**: `departments.parent_id` 자기참조. 디자인 산하에 디자인팀·봉제/후가공 등 하위부문 → 리포트 롤업. 하위부문 추가는 스키마 변경 없이 데이터로.
- **3대 귀속 경로**:
  | 대상 | 경로 |
  |---|---|
  | 매출 | `order_items → items.category → department_category_map → departments` |
  | 자재비 | 소진이력(`inventory_auto_deductions.card_id → 장비/공정`) 기준. 입고부서≠소진부서 |
  | 인건비 | `employees.department_id → departments` (회사부담금 포함) |
- **공통비(임대·통신·전기·관리인건비) = 2단계**: 원장은 '관리/본사부문'에 그대로, 배부는 **리포트 계산단계 배부율표로만**(원장불변·감사추적). 기본 매출비례, 옵션 인원/직접인건비/면적.

## 3. 데이터 모델 (P1 — migration `0459_departmental_pnl.sql`, 적용·검증 완료)
- `departments(id, name, parent_id, dept_type[PRODUCTION|SUPPORT], legacy_codes(JSON), sort_order, is_active, created_at)` — 계층 트리
- `department_category_map(category PK, department_id)` — 공정→부문(매출·자재비 엔진)
- `employees.department_id` FK 신설 + 백필. 레거시 `employees.department`(text)는 보존(제거 불가·드리프트 브리지).

### 부문 시드 (초안 — 로컬 검증 결과 직원수)
| id | 부문 | parent | type | legacy | 직원 |
|---|---|---|---|---|---|
| 1 | 출력 | — | PROD | PRODUCTION,PRINTING | 32 |
| 2 | 전사 | — | PROD | TRANSFER | 0 |
| 3 | 간판 | — | PROD | UV_SIGN,SIGN | 14 |
| 4 | 유통 | — | PROD | — | 0 |
| 5 | 디자인 | — | SUPPORT | — | 0(부모) |
| 6 | └ 디자인팀 | 5 | SUPPORT | DESIGN | 17 |
| 7 | └ 봉제/후가공 | 5 | SUPPORT | FINISHING,ASSEMBLY | 35 |
| 8 | 관리/본사 | — | SUPPORT | OFFICE,EXECUTIVE,SALES,ADMIN_DEPT | 11 |

- 백필 미완 직원 = **0명**(전원 배정 검증).
- category 매핑 11건: 출력(수성·솔벤·UV·현수막·배너·스티커) / 전사(전사·태극기) / 간판(간판·현판) / 유통(상품).

## 4. 알려진 갭 (P2에서 처리)
1. **item_id=NULL 커스텀 라인** — 직접입력 주문라인은 category 없음 → **미분류 버킷**(또는 주문 card_group으로 추정 / 수동배정). 로컬 order_items 2건 전부 이 케이스.
2. **전사·유통 직원 0명** — 전사 인력은 레거시 PRODUCTION에 뭉뚱그려짐. 인건비를 출력 vs 전사로 나누려면 **직원별 부문 재배정(UI)** 필요. → 부문 관리 UI에 직원 배정 기능.
3. **items.category 지저분** — 원자재/부속품/기타/인코딩깨짐 값 존재. 미매핑=매출 제외(미분류). 신규 category 등장 시 매핑 누락 관측 필요.
4. **부문 = 전역 차원**(법인 orthogonal). 리포트는 entityFilter + GROUP BY 부문. 필요 시 entity×부문 매트릭스.

## 5. Phase 계획
| P | 내용 | 상태 |
|---|---|---|
| **P1** | 부문 마스터(계층) + category→부문 매핑 + employees.department_id 백필 | **완료(마이그·검증)** |
| P1.5 | 부문 관리 UI(트리 편집·category 매핑·직원 배정) + 권한 등록 + hr.ts SSOT 연동 | 다음 |
| P2 | 매출(order_items 라인)·자재비(소진이력) 부문 스탬프/집계 쿼리 + 미분류 처리 | |
| P3 | 인건비·회사부담금 부문 집계(payroll JOIN) | |
| P4 | 부문손익 리포트: 매출−직접비=**공헌이익** + 인건비율. `/financial-reports` 죽은쿼리(order_costs·payroll_slips) 재배선 | |
| P5 | 공통비 배부율표 → **부문 영업이익** 병기 | |

## 6. 확인 필요 (사용자)
- 디자인 산하 **하위부문 실제 구성**(디자인팀 외 세부 팀). 현재 시드=디자인팀+봉제/후가공 2개. → P1.5 UI로 추가 가능.
- 전사/유통 부문 직원 배정 방식(운영 데이터 입력).
