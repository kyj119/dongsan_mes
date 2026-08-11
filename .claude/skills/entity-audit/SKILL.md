---
name: entity-audit
description: routes/*.ts 쿼리에서 entity_id 테이블에 entityFilter 누락 건 자동 감지 (법인 격리). 트리거: routes 수정 직후, entity 감사, entity audit, 필터 검사. 배포 실행 자체는 deploy-verify·ship.
---

# Entity 필터 자동 감사

routes/*.ts 파일의 SELECT 쿼리에서 entity_id가 있는 테이블을 사용하면서 entityFilter를 적용하지 않은 누락 건을 자동 감지한다.

TRIGGERS: routes 파일 수정 후, 배포 전, "entity 감사", "entity audit", "필터 검사"

> **`context: fork` 는 의도적으로 쓰지 않는다**(2026-08-11 검토 결론). ① 이 스킬의 가장 흔한 트리거가
> "**방금** 라우트를 고쳤다"인데 포크는 **대화 이력을 못 본다** — 무엇을 왜 고쳤는지 모른 채 도는 감사가 된다.
> ② 산출물이 코드 주장이라 메인 루프의 전수 직접 검증(§검사 실행 3번)이 안전장치인데 포크가 그걸 가린다.
> ③ 무거운 읽기는 이미 Explore 팬아웃으로 격리돼 본문이 57줄뿐이라 추가 이득이 거의 없다.

## entity_id가 있는 테이블 목록

**⚠️ 하드코딩 목록 금지(2026-07-17 codify)**: 과거 이 섹션은 8개 테이블(bank/card군)만 나열했으나 실제로는 `migrations/*.sql` 전체에 `entity_id` 컬럼을 보유한 테이블이 **110개 이상**이며 매 사이클 신규 기능마다 계속 늘어난다. 정적 목록은 작성 시점에 이미 낡으므로, 검사 직전 매번 아래로 ground-truth를 도출할 것:
```bash
grep -rhoE "ALTER TABLE (\w+) ADD COLUMN entity_id" migrations/*.sql | awk '{print $3}' | sort -u
# + CREATE TABLE 본문에 entity_id를 포함하는 테이블(신규 테이블은 ALTER가 아니라 CREATE에 처음부터 포함되는 경우가 많음)도 별도 확인 필요
```
(`scripts/entity-audit.mjs`의 `ENTITY_TABLES` 하드코딩 8개도 동일하게 낡아 있음 — 그 스크립트는 **bank/card 격리 핵심군 전용으로 의도적으로 좁게 유지된 CI 게이트**이지 전체 entity_id 테이블 커버리지가 아니다. 실측(2026-07-17): 8→111개로 확장 시 SELECT 위반 후보가 8→349건으로 폭증하며 대부분 개별 파일 맥락 판단이 필요한 후보(전역 대시보드 집계·부모 JOIN으로 이미 격리·ADMIN 전용 등)라 기계적 일괄 적용은 오탐 폭주로 게이트 무력화(양치기 소년) 위험. 테이블 목록 확장은 **후보 발견용 1회성 스캔**으로만 쓰고, CI 하드게이트 자체를 건드릴 땐 후보를 개별 큐레이션 후 반영할 것.)

## 검사 방법

1. `src/routes/*.ts` 파일에서 위 방법으로 도출한 entity_id 테이블을 참조하는 쿼리를 모두 찾는다 — **SELECT뿐 아니라 UPDATE/DELETE/단건 write 핸들러(PUT·PATCH·DELETE `/:id`)도 반드시 포함**(아래 4번 참조).
2. 각 쿼리 주변에 `entityFilter` 호출이 있는지 확인한다
3. 다음은 예외로 허용한다(SELECT 목록/집계 조회에 한함 — 4번의 write 핸들러에는 적용 금지):
   - 서브쿼리 안에서 이미 상위 쿼리가 entityFilter로 격리된 경우
   - INSERT 문의 값 산출용 서브쿼리(격리는 INSERT 대상 자체의 entity_id 컬럼으로 보장)
   - 이미 entity_id가 JOIN 조건에 포함된 경우
   - **orphan 라우터** — 격리 갭을 보안 이슈로 보고하기 전, 해당 라우터가 프론트에서 호출되는지 `grep -rn "api/<path>" src/scripts src/pages`로 도달성 확인. 호출처 0건이면 dead code(보안 무관)로 분류. index.tsx의 `app.route()` 마운트만으로 "사용 중" 단정 금지 (#334 order_templates)
4. **🔴 "ID로 단건 조회(WHERE id = ?)는 예외" — SELECT 목록조회에만 적용, write 핸들러(PUT/PATCH/DELETE `/:id`, approve/cancel/submit 액션)에는 절대 적용 금지.** 같은 파일의 목록(list) 핸들러가 `entityFilter`를 쓰는데 단건 write 핸들러만 bare `WHERE id = ?`이면 그 자체가 **격리 누락 IDOR 버그**(형제-비대칭 클래스) — "단건 조회니까 예외"로 넘기면 안 됨. 이 프로젝트에서 이 정확한 패턴으로 확정된 사례가 #349·#356·#368·#418·#437·#444·#447·#451·#452·#455·#473·#481·#521·#527·#529·#539 등 수십 건 누적됐다. 판별: 같은 파일에 entityFilter를 쓰는 목록/생성 핸들러가 있는지 확인 → 있는데 write `/:id`만 없으면 confirmed(단, 도달성 0건이면 dead code, ADMIN 전용으로 교차법인이 설계 의도인 파일 전역 컨벤션이면 FP — 상세 판별 기준은 `security-audit/SKILL.md`의 "IDOR 비대칭 탐지 규칙" 참조).

## 검사 실행 — ⚡ Explore 병렬 fan-out (필수)

대상 라우트 파일이 3개 이상이면 메인 루프 순차 스캔 금지. 다음 절차로 병렬화한다:

1. `src/routes/*.ts`(하위 디렉토리 포함)를 알파벳순 3~4묶음으로 분할
2. 묶음마다 `Agent(subagent_type:"Explore")` **병렬** dispatch — 프롬프트에 반드시 포함:
   - 위 entity_id 테이블 목록 + 예외 규칙(단건 조회·서브쿼리·JOIN 포함·orphan)
   - 보고 형식: `file:line — 테이블명 — 누락 사유 1줄` (파일 내용 덤프 금지, 발견만 회수)
3. 메인 루프 = 회수된 발견을 **전수 직접 코드 검증**(서브에이전트 오탐 이력 있음 — 배열 인덱스 오독 사례) → 종합 보고
4. **수정은 메인 루프가 단독 수행** (병렬 쓰기 금지 — 파일 잘림 사고 이력)

## 결과 보고

```
Entity 필터 감사 결과
━━━━━━━━━━━━━━━━━━━━
검사 파일: N개
검사 쿼리: N개
누락 건수: N개 (또는 "모두 통과")

[누락 목록]
- routes/bank.ts:123 — bank_transactions SELECT에 entityFilter 없음
- routes/cardExpenses.ts:456 — card_transactions SELECT에 entityFilter 없음
```

누락 건이 있으면 수정 코드도 함께 제안한다.
