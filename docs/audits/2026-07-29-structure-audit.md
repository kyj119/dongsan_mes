# 코드 구조 전수 감사 (2026-07-29)

측정 도구: `npm run audit:structure` (신규 `scripts/structure-audit.mjs`)
대상: `src/` **387 파일 / 162,867 라인**

## 요약 — 지표

| 축 | 건수 | 성격 |
|---|---:|---|
| 크기 임계 초과 | 52 | 분할 후보 |
| write-path entity 비대칭 | 31 | 개별 판단 필요 후보 |
| ORDER BY tie-break 누락 | 55 | 페이징 중복·누락 위험 (기존 감사의 "미적용 잠복") |
| dead export (완전 미사용 값) | 9 | 제거 후보 |
| 라우트 계산로직 밀집 | 18 | 서비스 추출 후보 |
| 파일간 중복 블록 클러스터 | 40 | 공통화 후보 |

baseline = `scripts/.structure-baseline.json`. 악화 감지는 `npm run audit:structure:gate`.

---

## 심각도 A — 구조 근본원인

### A1. 레이어 부재 — 모든 문제의 뿌리

`routes/*.ts` 하나가 HTTP 파싱 + 권한 + entity 필터 + SQL + 도메인 계산 + 응답을 전부 담당.

- `c.env.DB.prepare` **2,465회 / 115파일** — 데이터 접근 레이어 없음
- `entityFilter` 호출 **1,041회 / 106파일** — 횡단 관심사를 사람이 매번 손으로 부착
- `src/services/` 12개는 전부 외부 API 래퍼(바로빌·FTP·메일). **도메인 서비스가 0개**

귀결: 급여·원가·VAT·재고 계산이 핸들러 안에 묻혀 **재사용 불가 + 단위 테스트 불가**.
계산 밀집 상위 — `routes/payroll/year-end.ts`(계산 40줄), `payroll/core.ts`(34), `payroll/shared.ts`(33), `leaves.ts`(29), `prices.ts`(29).

### A2. 테스트 피라미드 역전

단위·통합 테스트 **0개**. E2E 12 spec + `smoke.cjs` 102 엔드포인트만 존재.
입출력이 명확하고 규칙이 자주 바뀌는 영역(급여 요율, 연차 촉진, 부가세 배분)이 회귀 안전망 없이 운영 중.

### A3. 안전을 정적 스캐너로 뒤쫓는 구조

entity 누락을 구조가 아니라 `entity-audit.mjs`가 사후 탐지. 그 스크립트는 스스로 한계를 명시함 —
**SELECT만·8개 테이블만** 검사(`scripts/entity-audit.mjs:9-27`). 실제 확정 IDOR 다수는 write-path에서 발생했다고 주석에 기록돼 있음.
`entity_id` 보유 테이블은 실측 **115개**인데 게이트는 8개만 본다.

---

## 심각도 B — 즉시 조치 후보 (검증 완료)

### B1. `requirePageEdit` 미채택 — dead code

`src/middleware/permissions.ts:66` — 정의만 되고 **사용처 0**.
대신 관대한 변종 `requireEditOrRole`(같은 파일 :86)이 23파일 106곳에서 사용 중.
→ 보안 구멍 아님. 둘 중 하나로 정리 필요(엄격 버전을 살릴지, 삭제할지 결정).

### B2. 법인 조건 없는 write — **29건 전수 검증 완료**

#### 진짜 — 조치 필요 (5개 이슈 / 7개 위치)

| 상태 | 위치 | 영향 | 근거 |
|---|---|---|---|
| ✅ 수정 | `routes/inspections.ts` | 타 법인 입고건에 검수를 붙이고 `inspection_status` 변경 | 조회 3곳은 `entityFilter` 적용인데 등록만 `body.receipt_id` 무검증 — **형제 비대칭 확정** |
| ✅ 수정 | `routes/hr.ts` 체크아웃 | 타 법인 직원 퇴근 기록 조작 | 선행 SELECT가 `employee_id`·`work_date`만 |
| ✅ 수정 | `routes/hr.ts` 직원삭제 | 타 법인 직원 소프트 삭제 (ADMIN) | 선행 SELECT도 `WHERE id = ?`뿐 |
| ✅ 수정 | `routes/fixedAssets.ts` 처분 | 타 법인 고정자산 처분 (ADMIN) | 선행 조회 자체가 없음 |
| ❌ 오탐 | `routes/shipments.ts:409,411,419` | — | **cross-entity가 요구사항**. 아래 별항 참조 |

**수정 4건 (2026-07-29)** — 공통 처방: 선행 SELECT에 `entityFilter` 부착 후 미존재 시 404.
ADMIN 전체모드(`entityId=0`)는 clause가 비므로 종전 동작 유지.

배포 전 회귀 확인(prod 읽기전용 실측): `attendance` 4,245건·`employees` 112건 모두 **entity_id NULL 0** → 필터 부착해도 기존 데이터 정상 조회.
`fixed_assets`·`inventory_receipts`는 prod 0건(미사용) → 예방적 수정.

#### 합포장(shipments) 판정 — 오탐 확정 (2026-07-29)

법인 교차는 **명시적 설계 요구사항**이며 `entityFilter`를 넣으면 기능이 파괴된다.

| 근거 | 주석 |
|---|---|
| `shipments.ts:264` | "합배송 후보 (**법인 통합 뷰**, P2)" |
| `shipments.ts:267` | "⚠️ 목적상 **entityFilter 미적용(명시적 cross-entity 조회)** — ADMIN·MANAGER 한정" |
| `shipments.ts:314` | "합포장 후보 (**법인 수**·배송방법·납품일 **무관**)" |
| `shipments.ts:368` | "같은 거래처의 복수 주문(**법인 무관**)을 한 박스로 묶는다" |

존재 이유 = 동산기획·선명·청주 주문이 한 거래처로 갈 때 한 박스로 묶어 배송비 절감.
"거래처가 법인 공유라 격리 실패"라는 1차 판단은 **격리가 목표가 아닌 곳에 격리를 기대한 오독**이었다.
→ `scripts/structure-audit.mjs` `WRITE_ALLOWLIST`에 사유와 함께 등록(반복 노출 차단).

prod 실측: `shipments` 2건 · 합포장 그룹 0 · `consolidate_with_order_id` 0 (기능 미사용 단계).

#### 별건 수정 — merge의 status 검증 누락 ✅

`shipments.ts:385`가 `WHERE id IN (...)`만으로 조회해 **취소·삭제·초안·견적 주문도 묶음에 편입** 가능했다.
후보 조회(:300)는 4개 상태를 제외하는데 merge만 누락 — 법인과 무관한 형제 비대칭.
→ 동일 status 목록 적용 + 오류 메시지 구체화.

#### 후보-저 6건 — 처리 완료 (2026-07-29)

| 상태 | 위치 | 처리 |
|---|---|---|
| ✅ 수정 | `scan.ts` POST /action | 카드 소유 검증 추가(`cardEntityFilter`). 조회는 격리인데 액션만 무검증이던 비대칭 |
| ✅ 수정 | `waste.ts:61` | `card_id` 소유 검증 추가. 목록(:14)은 격리인데 등록만 무검증 |
| ✅ 수정 | `orders/create.ts:191` | 견적 전환 카운터에 `entityFilter` — 타법인 견적서 카운터 오염 방지 |
| ❌ 오탐 | `aiAnalysis.ts:360,583,615` | **의도적 미적용**. :334-335 주석 "에이전트 전용 콜백 — 분석 행 entity ≠ 에이전트 토큰 entity일 때 404 나는 문제 방지". 필터 부착 시 IA 콜백 파손 → allowlist 등록 |

### B2-1. 🔴 `scan.ts:44` — 카드 스캔이 prod에서 깨져 있었음 (부수 발견)

후보-저 검증 중 발견한 **실제 장애**. `cards` 테이블에는 `entity_id` 컬럼이 **없고** `requesting_entity_id`만 있는데,
`scan.ts:44`가 `entityFilter(c, 'c')`를 써서 ` AND c.entity_id = ?`를 생성하고 있었다.

- 법인을 선택한 사용자(`entityId ≠ 0`) → **`SQLITE_ERROR: no such column`** → 카드 QR 스캔 전면 실패
- ADMIN 전체모드(`entityId = 0`)만 clause가 비어 우연히 동작 → 그래서 여태 발견되지 않음
- 주석은 "#170: entity 필터 추가"였으나 `cardEntityFilter`를 썼어야 함

→ `cardEntityFilter(c, 'c')`로 수정. 동일 오용은 전 코드베이스에서 이 1곳뿐(grep 확인).

### B2-2. 감사 도구 자체의 정확도 결함

`.entity-tables.json`을 `sql LIKE '%entity_id%'`로 만들어 **`requesting_entity_id`·`assigned_entity_id`가 부분 매칭**됐다.
`cards`·`order_items`·`users`·`inter_entity_transactions` 4개가 "entity_id 보유"로 오판.
→ 컬럼 경계 정확 매칭(111개) + 변종 컬럼 테이블 분리(`variantTables`)로 재생성.
격리 의미가 있는 `cards`·`order_items`는 감사 대상에 유지(빠지면 사각).

#### 오탐 확정 (18건) — 조치 불필요

| 그룹 | 건수 | 사유 |
|---|---:|---|
| `rip.ts:1643,1743,1867,1984` | 4 | `agentKeyMiddleware` — 장비 API 키 경로, 사용자 entity 컨텍스트 없음 |
| `printEvents.ts:344,461,548,564` | 4 | 동일. 카드 entity를 오히려 조회해 판별(:46) |
| `caps.ts:285,346,599` | 3 | CAPS 시스템 동기화 배치. `caps_site_id` 스코프 + `empEntityMap`(:92) |
| `inspections.ts:274` | 1 | batch 실패 롤백 — 자기 `resultId` |
| `orders/create.ts:459` | 1 | 같은 핸들러가 방금 INSERT한 `orderId` |
| `quotations.ts:42` | 1 | 호출부(:213 :589)가 조회 완료된 객체를 전달하는 read-time 만료 마킹 |
| `leaves.ts:910` | 1 | ADMIN 전용 전사 소멸 sweep — 의도된 전역 배치 |
| `rip.ts:1432,1487` 외 | 3 | `cardEntityFilter` 가드 있음 (스캐너 대소문자 결함으로 오검출, 수정 완료) |

### B3. ORDER BY tie-break 누락 55건

`docs/audits/2026-07-27-list-sort-tiebreak.md`가 발주 계열만 적용하고 "미적용 잠복"이라 기록한 그 잔여분.
`LIMIT` + 비고유 정렬키 조합 = 페이지 간 행 중복·누락.
예: `routes/accounting.ts:152`, `bank.ts:1614`, `cashReceipts.ts:25`, `cashSchedule.ts:73`.

### B4. 완전 미사용 export 9건

`constants/intercompany.ts:46,51` · `constants/process.ts:38,47` · `middleware/permissions.ts:66` ·
`types/roles.ts:38,49` · `utils/unitConvert.ts:31,50`

---

## 심각도 C — 규모 부채

52개 파일이 임계 초과. 상위:

| 파일 | 라인 | 한도 |
|---|---:|---:|
| `routes/bank.ts` | 2,717 | 800 |
| `scripts/iaEditor.js` | 2,489 | 900 |
| `scripts/layout/shell.js` | 2,458 | 900 |
| `scripts/ledger.js` | 2,332 | 900 |
| `routes/rip.ts` | 2,180 | 800 |

중복 블록 40클러스터. 대표: `pages/clients.ts`↔`orderForm.ts`↔`orders.ts`(4회), `routes/orders/create.ts`↔`update.ts`(3회), `pages/payslip.ts`↔`templates/employmentCertificate.ts`↔`laborContract.ts`(3회).

---

## 이 리포트의 신뢰도 — 오탐 제거 과정

초기 스캔은 오탐이 압도적이었고, **코드 대조로 4단계 보정**했다. 수치를 그대로 신뢰하지 말 것.

| 단계 | write-path | dead export | 제거한 오탐 원인 |
|---|---:|---:|---|
| 초기 | 215 | 126 | — |
| ① entity_id 실보유 테이블만 | 171 | — | `approval_templates` 등 미보유 테이블 |
| ② 선행 entity 가드·자기생성 id 인식 | 54 | — | `approvals.ts:284`(직전 `ef.clause` SELECT), `aiAnalysis.ts:311`(`RETURNING id`) |
| ③ 핸들러 경계 오인 수정 | 40 | — | `c.get('user')`를 라우트 시작으로 오판 → `bank.ts:1373` 오탐 |
| ④ 수동 가드·동적 import·내부 사용 | 31 | **9** | `hr.ts:1488`(수동 `entity_id = ?`), `await import()`로 쓰는 `stopCard`, 파일 내부 사용 |
| ⑤ 헬퍼 변종 대소문자 | **29** | 9 | `cardEntityFilter`·`cardEf.clause`는 대문자 E — 소문자 패턴에 안 걸려 `rip.ts:1432` 등 오검출 |

**최종: 29건 전수 대조 결과 진짜 5개 이슈 / 후보-저 6 / 오탐 18.** 초기 215건 대비 실제 조치 대상은 2.3%.
정적 스캐너 단독으로는 판정 불가하며(오탐률 초기 97%), 코드 대조가 반드시 따라야 한다.

---

## 권고 순서

1. **B2·B3 확정 처리** — 위험이 실재하고 범위가 좁음
2. **도메인 서비스 추출 + 단위 테스트** — `payroll` 계열부터. 순수 함수로 뽑아야 테스트가 가능해짐
3. **entity 강제 구조화** — 쿼리 헬퍼에서 강제. 스캐너 의존 탈피
4. **대형 파일 분할** — 기존 성공 패턴(cards·items·orderForm) 확장
5. `npm run audit:structure:gate`를 `ship:gate`에 편입해 악화 차단
