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

### 부문 시드 (로컬 검증 완료 — migration 0459 + 0460)
직원수 = **재직/전체(퇴사포함)**. ⚠️ 로컬 테스트DB 시드(0117, 과거직원 포함) 기준 — 실 프로덕션과 다름. 배포 시 실데이터로.
| id | 부문 | parent | type | serves | legacy | 재직/전체 |
|---|---|---|---|---|---|---|
| 1 | 출력 | — | PROD | — | PRODUCTION,PRINTING | 13/32 |
| 2 | 전사 | — | PROD | — | TRANSFER | 0/0 |
| 3 | 간판 | — | PROD | — | UV_SIGN,SIGN | 7/14 |
| 4 | 유통 | — | PROD | — | — | 0/0 |
| 5 | 디자인 | — | SUPPORT | — | — | 0(부모) |
| 6 | └ 디자인-출력 | 5 | SUPPORT | →출력(1) | DESIGN | 8/17 |
| 10 | └ 디자인-전사 | 5 | SUPPORT | →전사(2) | — | 0/0 |
| 11 | └ 디자인-간판 | 5 | SUPPORT | →간판(3) | — | 0/0 |
| 7 | └ 봉제/후가공 | 5 | SUPPORT | 공통(null) | FINISHING,ASSEMBLY | 13/35 |
| 8 | 관리/본사 | — | SUPPORT | — | OFFICE,EXECUTIVE,SALES,ADMIN_DEPT | 7/11 |

- **디자인 하위 = 출력/전사/간판 미러링**(사용자 확정). `serves_department_id`로 각 디자인팀 인건비를 대응 생산부문 원가에 직접 귀속(P4 토글). 봉제=공통(P5 배부).
- 백필 미완 직원 = **0명**(전원 배정 검증). status 무관 백필(퇴사자 과거소속도 유효). **인건비(P3)·헤드카운트 UI는 재직/급여발생 기준** → 퇴사자 자동 제외.
- 재직 디자인-출력 8명은 데이터 세분 불가 → UI로 전사/간판 재배정.
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
| **P1.5** | 부문 관리 UI `/departments`(트리 조회·편집·직원 배정·매출매핑 조회) + 권한(0461) | **완료(로컬)·미배포**. category 매핑 편집·hr.ts 연동=추후 |
| P2 | 매출(order_items 라인)·자재비(소진이력) 부문 스탬프/집계 쿼리 + 미분류 처리 | |
| P3 | 인건비·회사부담금 부문 집계(payroll JOIN) | |
| P4 | 부문손익 리포트: 매출−직접비=**공헌이익** + 인건비율. `/financial-reports` 죽은쿼리(order_costs·payroll_slips) 재배선 | |
| P5 | 공통비 배부율표 → **부문 영업이익** 병기 | |

## 6. 확인 필요 (운영 데이터 — P1.5 UI로 처리)
- **DESIGN 17명 세분**: 현재 전원 디자인-출력. 실제 디자인-전사/디자인-간판 담당자 재배정 필요.
- **전사/유통 직원 배정**: 전사 인력이 레거시 PRODUCTION(→출력)에 뭉침. 유통 담당자도 미배정.
- 디자인 인건비 귀속 방식(P4): 기본=`serves_department_id`로 생산부문 직접귀속 / 대안=디자인 부문 독립표시. 리포트 토글 예정.
