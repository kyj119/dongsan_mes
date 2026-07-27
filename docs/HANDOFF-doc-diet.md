# 인계 — 상태판/백로그 다이어트 (PROJECT_STATUS · IMPROVEMENT_BACKLOG)

> 작성: 2026-07-27 (문서 정합성 감사 세션, main `a90c53bd`)
> 성격: **작업 지시서 + 복붙용 프롬프트**. 다음 세션이 이 파일만 읽고 착수할 수 있게 작성됨.

---

## 1. 왜 지금 해야 하나 (실害 근거)

`CLAUDE.md`는 **"세션 시작 시 `.claude/PROJECT_STATUS.md` 읽기"** 를 지시한다.
그런데 2026-07-27 세션에서 실제로 읽으니 **302줄 중 33줄만 로드되고 잘렸다**(약 93K 토큰, 읽기 상한 초과).

즉 **지시가 이미 실행 불가능한 상태**다. 매 세션 현황 파악이 상단 몇 건에서 끊기고,
그 아래 기록(미해결 잠복·주의사항)은 사실상 아무도 읽지 못한다. 이건 부채가 아니라 **현재 진행 중인 장애**다.

`IMPROVEMENT_BACKLOG.md`는 auto-improve가 **매 사이클 통째로 읽고 쓰는** 파일이라 같은 문제가 사이클 비용·중단 위험으로 나타난다.

## 2. 현재 실측 (2026-07-27)

| 파일 | 크기 | 줄 | 역할 |
|---|---:|---:|---|
| `.claude/PROJECT_STATUS.md` | 192,872 B | 302 | 현황판(단일 소스) — 항목 약 31개, 시간 역순 |
| `.claude/PROJECT_STATUS_ARCHIVE.md` | 72,679 B | 333 | **이관 목적지** (삭제 금지) |
| `IMPROVEMENT_BACKLOG.md` | 195,928 B | 605 | auto-improve 활성 백로그 |
| `IMPROVEMENT_BACKLOG_ARCHIVE.md` | 476,689 B | 1,254 | **이관 목적지** (삭제 금지) |

> ARCHIVE 두 개가 이미 크다 = **이관 경로는 과거에 정상 작동했다.** 새 메커니즘을 만들 필요 없이 재개하면 된다.
> `docs/INDEX.md`가 백로그를 "266K"로 적고 있었으나 실측 196K — 이번에 정정함.

## 3. 제약 — 반드시 지킬 것

1. **ARCHIVE 2종은 삭제·재작성 금지.** 이관 목적지다(`docs/INDEX.md` §정리 원칙 4).
2. **백로그는 형식 의존이 있다.** `auto-improve/SKILL.md`가
   - 매 사이클 백로그 전체를 읽어 "이전 실행 결과 + 승인 상태"를 판단하고(§실행 흐름),
   - 하단 **오탐 제외 목록 표**와 **done/rejected 카운터**를 갱신한다.
   → **하단 형식 절·카운터 절·오탐 표는 남긴다.** 위쪽 과거 사이클 로그만 이관.
3. **카운터 값은 손대지 않는다.** done/rejected는 auto-improve가 매 사이클 GitHub 실측 절대값으로 덮어쓴다(델타 누적 금지 규약). 이관하면서 숫자를 재계산하려 들지 말 것.
4. **durable 정보를 ARCHIVE로만 보내지 말 것.** 이관 대상 항목에 "미해결·잠복·⚠️" 표시가 있으면, 그 내용이 auto-memory나 spec에 남아 있는지 먼저 확인하고, 없으면 상태판 상단 "미해결 잠복" 절로 **끌어올린 뒤** 나머지를 이관한다.
5. 상태판은 **시간 역순**(최신이 위). 이 순서를 뒤집지 말 것.

## 4. 다음 세션용 프롬프트 (그대로 복사해서 사용)

### 작업 A — PROJECT_STATUS 다이어트

```
docs/HANDOFF-doc-diet.md 를 먼저 읽고 시작해줘.

.claude/PROJECT_STATUS.md 가 192KB/302줄이라 "세션 시작 시 읽기" 지시가
읽기 상한에 걸려 실제로는 상단 일부만 로드된다. 이걸 해소해줘.

1. PROJECT_STATUS.md 전체를 구간별로 나눠 끝까지 읽어. (한 번에 안 읽히니
   offset/limit으로 나눠서, 절대 앞부분만 보고 판단하지 말 것)
2. 항목별로 분류해줘:
   - 최근 배포/작업 기록 (상단 유지 대상)
   - 완결되어 참조 가치가 낮은 과거 기록 (이관 대상)
   - ⚠️/미해결/잠복/후속 TODO 가 적힌 항목 (별도 취급 — 아래 3번)
3. 잠복·미해결 항목은 그 내용이 auto-memory 또는 docs/superpowers/specs 에
   이미 남아 있는지 확인해줘. 없는 게 있으면 상태판 상단에
   "## 미해결 잠복" 절을 만들어 한 줄씩 끌어올려줘 (근거 파일:line 포함).
4. 그 다음 과거 기록을 .claude/PROJECT_STATUS_ARCHIVE.md 상단으로 이관해줘.
   (ARCHIVE는 삭제·재작성 금지, 앞에 붙이기만)
5. 목표: PROJECT_STATUS.md 를 40KB 이하로. 최근 기록 10~15건 + 미해결 잠복 절만 남긴다.
6. 완료 후 검증: PROJECT_STATUS.md 를 Read 로 한 번에 읽어서 잘리지 않는지 확인해줘.
   잘리면 아직 큰 것이니 더 줄여야 한다.

제약은 HANDOFF 문서 §3 을 따라줘. 이관 중 정보가 사라지면 안 되고,
시간 역순 구조를 뒤집지 말 것.
```

### 작업 B — IMPROVEMENT_BACKLOG 다이어트

```
docs/HANDOFF-doc-diet.md §3 제약을 먼저 읽어줘.

IMPROVEMENT_BACKLOG.md 가 196KB/605줄로 비대해서 auto-improve 사이클마다
전체를 읽는 비용이 크다. 과거 사이클 로그를 IMPROVEMENT_BACKLOG_ARCHIVE.md 로
이관해줘.

주의:
- auto-improve/SKILL.md 가 이 파일의 형식에 의존한다. 먼저 그 SKILL 의
  "IMPROVEMENT_BACKLOG.md 형식" 절을 읽고 어떤 구조를 기대하는지 파악할 것.
- 하단의 형식 정의 절, done/rejected 카운터 절, 오탐(false positive) 제외 표는
  반드시 남긴다. 카운터 숫자는 건드리지 말 것 (auto-improve 가 매 사이클
  GitHub 실측 절대값으로 덮어쓴다).
- 최근 3~5회차 사이클 기록은 남긴다 ("이전 실행 결과 + 승인 상태" 판단에 쓰임).
- 미해결(open) 이슈 항목은 이관하지 말 것. 완결된 사이클 로그만 대상.

목표: 60KB 이하. 완료 후 auto-improve SKILL 이 기대하는 절이 전부 살아있는지
체크리스트로 확인해줘.
```

## 5. 완료 기준

- [ ] `PROJECT_STATUS.md` — Read 한 번에 전체 로드됨 (잘림 없음), 40KB 이하
- [ ] `PROJECT_STATUS.md` 상단에 "미해결 잠복" 절이 있고, 각 항목에 근거(`file:line` 또는 memory 링크)가 붙어 있음
- [ ] `IMPROVEMENT_BACKLOG.md` 60KB 이하, auto-improve 형식 절·카운터·오탐 표 보존
- [ ] ARCHIVE 2종은 **앞에 붙이기만** 했고 기존 내용 무손실
- [ ] `docs/INDEX.md`의 크기 표기 갱신

## 6. 관련

- 실害를 발견한 세션: 2026-07-27 문서 정합성 감사 (main `a90c53bd`)
- 같은 세션에서 이미 처리: `.claude/worktrees` gitignore(`4e71646b`), 법인간거래 미러 SQL 커밋(`f8cdab29`)
- 이번에 다루지 않은 잔여: `codef_transaction_id` 컬럼명 부채(D1 컬럼 제거 불가로 보류), README IA 섹션 정체(2026-03-18 기준)
