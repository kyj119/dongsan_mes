# Claude 작업 큐

> 러너: 루트 `run-queue.ps1` · 설계: `docs/superpowers/specs/2026-06-11-claude-queue-runner.md`

## 사용법

1. `pending/`에 `NN-작업명.md` 작성 (번호순 실행)
2. `.\run-queue.ps1` 실행 (옵션: `-DryRun` 순서 확인, `-StopOnFail` 실패 시 중단)
3. 끝나면 `done/`·`failed/` + `logs/` 확인 → diff 검토 → **사람이 커밋**

## 작업 파일 형식

```markdown
---
model: opus        # 선택: opus(기본) | sonnet(단순 작업)
max_turns: 60      # 선택: 폭주 방지 상한
---
<Claude에게 줄 지시문>
```

## 작업 작성 규칙

- **1건 = 검증 가능한 1단위** (spec Phase 하나 수준). 대형 작업 금지 — 실패 격리 불가
- 지시문에 반드시 포함: ①spec/대상 경로 ②완료 기준(`npm run verify` 등) ③"PROJECT_STATUS·session-context 갱신" ④"**커밋하지 말 것**"
- 순차 의존(1번 결과 위에 2번)이 있으면 같은 파일에 합치거나 `-StopOnFail`로 실행

## ⚠️ 주의

- 러너 실행 중 대화형 세션(로컬 Claude Code/Cowork)으로 코드 작업 금지 — 충돌
- 락이 남아 있으면(비정상 종료) `.claude\.queue-runner.lock` 삭제 후 재실행
- 실패 작업 재투입 = `failed/` → `pending/`으로 이동만 하면 됨
