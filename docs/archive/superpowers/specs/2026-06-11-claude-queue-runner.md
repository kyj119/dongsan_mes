# Claude 작업 큐 러너 — headless 순차 실행 + 세션 자동 분리

- **작성일**: 2026-06-11
- **상태**: ✅ **구축 완료 (2026-06-11)** — D1 계속 진행 / D2 커밋 금지 / D3 opus 기본 / D4 5MB. 산출물: `run-queue.ps1` + `queue/`(README·예시 작업 01-alimtalk) + Stop hook 임계(검증 통과: 6MB 경고·2MB 무음). **잔여: 로컬에서 `.\run-queue.ps1 -DryRun` 1회 확인** (Cowork에 PowerShell 없어 문법 실검증 불가)
- **목적**: 할 일을 큐에 걸어두면 Claude Code가 **작업당 새 세션**으로 하나씩 자동 처리 — 토큰 누적·세션 오염·수동 전환 비용 제거

---

## 1. 동작 원리

`claude -p "<지시문>"` (headless 모드)는 실행할 때마다 **완전히 새 세션**을 만든다.
CLAUDE.md·hooks·settings 권한이 그대로 적용되므로 기존 안전장치(위험명령 차단, 커밋 전 tsc 게이트)가 headless에서도 동작한다.

```
[queue/pending/*.md] → run-queue.ps1 → 작업1: claude -p (새 세션) → 검증 → done/
                                     → 작업2: claude -p (새 세션) → ...
                                     → 종료 요약 (성공 N / 실패 M)
```

## 2. 디렉토리 구조

```
queue/
├── pending/     # 대기 작업 (01-알림톡.md, 02-분할.md — 번호순 실행)
├── running/     # 실행 중 (크래시 시 어디서 멈췄는지 식별)
├── done/        # 성공 (+ .log)
├── failed/      # 실패 (+ .log — 재투입은 pending/으로 이동만)
└── logs/        # 실행 로그 전체
run-queue.ps1    # 러너 (프로젝트 루트)
```

## 3. 작업 파일 형식 (`queue/pending/NN-이름.md`)

```markdown
---
model: opus            # 선택. opus(기본) | sonnet — 단순 작업은 sonnet으로 속도↑
max_turns: 60          # 선택. 폭주 방지 상한 (기본 60)
---
docs/superpowers/specs/2026-06-11-alimtalk-golive-package.md 읽고 Phase 1을 구현해줘.
완료 기준: npm run verify 통과 + smoke 통과.
완료 후 PROJECT_STATUS.md 진행중 섹션 갱신 + memory/session-context.md 기록.
커밋하지 말 것 (검토 후 사람이 커밋).
```

> 규칙: 작업 1건 = 검증 가능한 1단위(spec Phase 하나 수준). "전부 다 해줘"식 대형 작업 금지 — 실패 시 원인 격리 불가.

## 4. 러너 로직 (run-queue.ps1)

1. **락 확인**: `.claude/.queue-runner.lock` 존재 시 중단 (이중 실행 방지). 시작 시 생성, 종료 시 삭제
2. `pending/*.md` 이름순 정렬 → 첫 파일을 `running/`으로 이동
3. frontmatter 파싱(model/max_turns) → 실행:
   ```powershell
   Get-Content $task -Raw | claude -p --model $model --max-turns $maxTurns `
     --permission-mode acceptEdits --output-format json > logs/$name.json
   ```
4. exit code 0 → `done/`, 그 외 → `failed/` (기본 정책: **실패해도 다음 작업 계속**, `-StopOnFail` 스위치로 변경 가능)
5. 큐 소진 시 요약 출력: 성공/실패 목록 + 로그 경로
6. 옵션 `-DryRun`: 실행 없이 큐 순서만 표시

## 5. 안전 정책 (확정 필요 → §7)

| 장치 | 내용 |
|---|---|
| 커밋 금지 기본 | 지시문 템플릿에 명시 — 사람이 검토 후 커밋 (커밋 hook tsc는 사람 커밋 시에도 게이트) |
| 권한 | `--permission-mode acceptEdits` — 파일 편집 자동 승인, **Bash 위험명령은 기존 PreToolUse 차단 hook이 그대로 적용** |
| 폭주 방지 | max_turns 상한 + 작업당 타임아웃(기본 30분, PowerShell Job) |
| 동시 실행 금지 | 락 파일 + **러너 실행 중 대화형 세션(로컬/Cowork) 코드 작업 금지** 규칙 |
| 세션 프로토콜 유지 | 각 작업 지시문에 PROJECT_STATUS·session-context 갱신 포함 (CLAUDE.md 세션 종료 규칙 승계) |

## 6. Stop hook 토큰 임계 (대화형 세션용 보조)

큐 러너는 작업당 새 세션이라 임계가 불필요하지만, **대화형 세션**에는 과적 경고를 추가:

- `settings.local.json` Stop hook 확장: hook 입력의 `transcript_path` 파일 크기 측정 → **5MB 초과 시** "[HOOK] 컨텍스트 과적(~NMB). 현재 작업 마무리 후 session-context 기록하고 새 세션 권장" 주입
- 5MB는 시작값 — 체감 따라 조정 (transcript에는 도구 출력 포함이라 실제 컨텍스트의 근사치)

## 7. 확정 필요 (용준님)

| # | 결정 | 권고 |
|---|---|---|
| D1 | 작업 실패 시: 계속 진행 vs 전체 중단 | 계속 (아침에 요약 보고 실패만 재투입) |
| D2 | 커밋 권한: 금지(사람 커밋) vs 허용(verify 통과 시) | **금지** — push까지 자동화는 검증 신뢰 쌓인 후 |
| D3 | 기본 모델: opus vs sonnet | opus 기본 + 작업 파일에서 sonnet 오버라이드 |
| D4 | Stop hook 임계값 | 5MB 시작 |

## 8. 사용 시나리오

```powershell
# 저녁에 큐 적재 (파일 3개 작성) 후:
.\run-queue.ps1
# → 작업별 새 세션으로 순차 처리, 아침에 done/failed + 로그 확인 → 검토 → 커밋
```

## 9. 공수

run-queue.ps1 + 큐 디렉토리 + 작업 템플릿 + Stop hook 확장 = 1회 구축 ~0.5세션. Cowork에서 구축 가능(PowerShell 스크립트는 텍스트 — 실행 테스트만 로컬 1회).
