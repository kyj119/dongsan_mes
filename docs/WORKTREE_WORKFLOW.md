# 멀티세션 워크플로우 (git worktree)

여러 인터랙티브 세션(사람이 띄운 여러 Claude/VS Code 창)이 동시에 작업할 때 서로 겹치지 않게 하는 표준.

## 왜 필요한가
단일 작업트리(`C:\Users\user\dongsan_mes`)를 여러 세션이 공유하면:
- `deploy:prod`가 **작업트리 전체**를 빌드 → 타세션 미커밋 WIP 동반배포 (multi-UOM이 superset 배포에 휩쓸려 0395 prod 장애 낸 전례)
- 같은 파일 동시편집 → 덮어씀
- `git status`가 타세션 변경으로 오염

현실 팀의 방식 = **격리가 기본, 통합은 명시적 머지로만** ("각자 own clone + feature branch + PR/merge").
1머신 등가물 = **세션당 git worktree**(별도 폴더·별도 브랜치, `.git` 공유).

## 사용법
```powershell
# 1) 새 세션 격리 (origin/main 기준 worktree + 브랜치 session/<이름>)
.\scripts\new-session.ps1 <이름>
#  -> C:\Users\user\dongsan_mes-worktrees\<이름>
#     node_modules / .dev.vars / .wrangler 는 메인에서 junction (재설치/복사 0)

# 2) 그 폴더에서 새 세션 열기
code "C:\Users\user\dongsan_mes-worktrees\<이름>"

# 3) 작업 -> 커밋 -> 빌드/배포 (자기 worktree의 자기 dist만 빌드 = 격리 배포)
npm run build ; npx tsc --noEmit ; npm run smoke
npm run deploy:prod

# 4) 통합 (feature 브랜치 -> main)
git push origin session/<이름>:main      # 거부 시: git pull --rebase origin main 후 재시도

# 5) 병합 후 종료
.\scripts\end-session.ps1 <이름> -DeleteBranch
```

## 규칙 (벤치마크)
1. **메인 체크아웃(`dongsan_mes`)에서 직접 코드작업 지양** — 상태판 편집·조율 용도로만. 코드는 worktree에서.
2. **미완성을 dirty WIP로 두지 말 것** — 항상 브랜치에 커밋하거나 feature flag(예: settings 키 OFF로 머지). dirty WIP가 배포에 휩쓸리는 게 사고의 근본 원인.
3. **작게 자주 main 머지**(trunk-based) — 분기를 오래 두지 않아야 충돌 거리가 짧다.
4. **에이전트 팀**(한 세션 내 subagent가 파일을 동시 수정할 때): Agent/Workflow의 `isolation:"worktree"` 옵션으로 자동 격리(임시 worktree·자동 정리). 읽기전용/탐색 에이전트는 불요(오버헤드만 큼).
5. **worktree 제거는 반드시 `end-session.ps1`** — junction을 먼저 `rmdir`로 끊은 뒤 제거한다. 폴더를 직접 `rm -rf` 하면 junction을 따라가 **메인 node_modules가 삭제될 수 있다**.

## 주의
- 로컬 `dev:d1`는 포트 `192.168.0.94:3000` **단일 바인딩** → 동시에 **한 세션만** dev 서버 실행.
- `.wrangler`(로컬 D1)를 junction 공유하므로 `db:reset`은 전 worktree 공용 dev DB에 영향.
- `.claude/PROJECT_STATUS.md`는 worktree마다 복제됨 → 머지 충돌을 줄이려면 **메인에서만 편집**하거나 append-only로.
- `.dev.vars`는 하드링크(원본과 동기), 시크릿 재입력 불필요.

## 두 층위 요약
| | 무엇 | 격리 | 수명 | 생성 |
|--|------|------|------|------|
| 인터랙티브 세션 | 사람이 띄운 여러 창 | 영속 worktree | 작업 종료까지 | `new-session.ps1`(수동) |
| 에이전트 팀 | 한 세션 내 subagent | `isolation:"worktree"` | 에이전트 실행 동안 | 하네스 자동 |

둘 다 같은 git 원리(공유 `.git` + 격리 작업트리), 수명/생성만 다름.
