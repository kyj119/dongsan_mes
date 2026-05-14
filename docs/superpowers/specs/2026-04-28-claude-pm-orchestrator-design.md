# Claude PM — AI 프로젝트 오케스트레이터 설계서

> 작성일: 2026-04-28
> 상태: Draft

## 1. 개요

### 목적
AI 에이전트를 활용한 코딩 프로젝트 자동화 도구. 사용자는 PM(매니저) 역할만 수행하고, 설계·구현·리뷰·검증 파이프라인은 자동으로 실행된다.

### 핵심 원칙
- 사용자는 CLI로 작업 지시 + 완료 건 리뷰만 한다
- 복잡도에 따라 파이프라인 단계를 자동 결정한다
- 여러 작업을 동시에 처리한다 (최대 N개)
- 범용 도구이되, 프로젝트별 프리셋을 지원한다

### 기술 선택
| 항목 | 선택 | 이유 |
|------|------|------|
| 런타임 | Node.js (ESM) | 사용자 환경과 동일 |
| 판단/분석 | Anthropic SDK | 가볍고 빠른 API 호출 |
| 코딩 워커 | claude CLI subprocess | 파일/git/bash 도구 내장 |
| 상태 저장 | SQLite (better-sqlite3) | 단일 파일, 별도 서버 불필요 |
| CLI 프레임워크 | commander.js | 표준, 경량 |

## 2. 아키텍처

```
┌────────────────────────────────────────────────────┐
│                    pm CLI                           │
│  add / status / review / approve / cancel / config  │
└──────────────┬─────────────────────────────────────┘
               │
┌──────────────▼─────────────────────────────────────┐
│              Core Engine                            │
│                                                     │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐    │
│  │ TaskQueue │  │ Pipeline  │  │ WorkerPool   │    │
│  │ (SQLite) │  │ Engine    │  │ (max N개)     │    │
│  └──────────┘  └───────────┘  └──────────────┘    │
│                                                     │
│  ┌──────────────────┐  ┌───────────────────────┐   │
│  │ Analyzer (SDK)   │  │ Preset Manager        │   │
│  │ 복잡도 판단       │  │ mes.json, etc.        │   │
│  │ 리뷰 판정        │  │                       │   │
│  │ 요약 생성        │  │                       │   │
│  └──────────────────┘  └───────────────────────┘   │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │ Daemon                                        │  │
│  │ 큐 감시 → 파이프라인 실행 → 상태 업데이트       │  │
│  └──────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────┘
               │
┌──────────────▼─────────────────────────────────────┐
│           Workers (claude CLI subprocess)            │
│                                                      │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐             │
│  │Worker 1 │  │Worker 2 │  │Worker 3 │  ...max N   │
│  │worktree │  │worktree │  │worktree │             │
│  │branch/1 │  │branch/2 │  │branch/3 │             │
│  └─────────┘  └─────────┘  └─────────┘             │
└─────────────────────────────────────────────────────┘
```

## 3. 작업 라이프사이클

### 상태 흐름

```
QUEUED → ANALYZE → [WAITING] → RUNNING → [REVIEW] → DONE
                                  ↓
                               FAILED → (retry 또는 reject)
```

### 복잡도별 파이프라인

| 복잡도 | 판단 기준 | 파이프라인 단계 |
|--------|----------|---------------|
| SIMPLE | 버그픽스, 1파일 수정, 명확한 지시 | 구현 → 자체검증 → REVIEW |
| MEDIUM | 기능 추가, 2~5파일, API+프론트 | 설계 → WAITING(확인) → 구현 → 리뷰 → 검증 → REVIEW |
| COMPLEX | 대형 기능, 구조 변경, 6파일 이상 | 설계 → 2중 검토 → WAITING(확인) → 구현 → 리뷰 → 수정 → 검증 → REVIEW |

### 상태별 사용자 액션

| 상태 | 의미 | 사용자 액션 |
|------|------|------------|
| QUEUED | 큐 대기 | 없음 |
| ANALYZE | 복잡도 분석 중 | 없음 |
| WAITING | 설계 확인 대기 (MEDIUM/COMPLEX만) | `pm approve <id>` 또는 `pm reject <id> "피드백"` |
| RUNNING | 워커 실행 중 | 없음 (`pm status`로 진행률 확인 가능) |
| REVIEW | 완료, 리뷰 대기 | `pm review <id>` → diff 확인 → approve/reject |
| DONE | 머지 완료 | 없음 |
| FAILED | 워커 실패 | `pm retry <id>` 또는 `pm reject <id>` |

## 4. CLI 명령어

### 작업 관리
```bash
pm add "설명"                    # 작업 추가
pm add "여러 줄 설명              # 여러 줄 지원
- 상세 요구사항 1
- 상세 요구사항 2"

pm status                        # 전체 작업 목록 + 상태
pm status <id>                   # 특정 작업 상세 (로그 포함)
pm review <id>                   # diff + 요약 보기 → approve/reject 프롬프트
pm approve <id>                  # 설계 승인 (WAITING → RUNNING)
pm reject <id> "피드백"           # 설계/결과 반려 + 피드백
pm cancel <id>                   # 작업 취소
pm retry <id>                    # 실패한 작업 재시도
pm log <id>                      # 파이프라인 실행 로그 전체 보기
```

### 데몬 관리
```bash
pm start                         # 백그라운드 데몬 시작
pm stop                          # 데몬 종료
pm run                           # 포그라운드 실행 (디버그용)
```

### 설정
```bash
pm config set default-project <path>   # 기본 프로젝트 경로
pm config set max-workers 3            # 동시 실행 수
pm config set notifications true       # Windows 토스트 알림
pm config set preset mes               # 기본 프리셋
pm config list                         # 현재 설정 보기
```

### 프리셋 관리
```bash
pm preset list                   # 사용 가능한 프리셋 목록
pm preset show mes               # 프리셋 내용 확인
pm preset create my-project      # 새 프리셋 생성
```

## 5. 컴포넌트 상세

### 5.1 TaskQueue (SQLite)

```sql
CREATE TABLE tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  status      TEXT NOT NULL DEFAULT 'QUEUED',
  complexity  TEXT,                              -- SIMPLE / MEDIUM / COMPLEX
  description TEXT NOT NULL,
  pipeline    TEXT,                              -- JSON: 결정된 파이프라인 단계 배열
  current_step TEXT,                             -- 현재 실행 중인 단계
  branch      TEXT,                              -- git branch 이름
  project     TEXT NOT NULL,                     -- 대상 프로젝트 경로
  preset      TEXT,                              -- 사용된 프리셋
  result      TEXT,                              -- 최종 요약 (JSON)
  error       TEXT,                              -- 실패 시 에러 메시지
  retries     INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 2,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE task_logs (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id   INTEGER NOT NULL REFERENCES tasks(id),
  step      TEXT NOT NULL,                       -- ANALYZE / DESIGN / IMPLEMENT / REVIEW / VERIFY
  role      TEXT NOT NULL,                       -- SDK_ANALYZER / CLI_OPUS / CLI_SONNET / CLI_HAIKU
  input     TEXT,                                -- 워커에 전달된 프롬프트 (요약)
  output    TEXT,                                -- 워커 결과 (요약)
  duration  INTEGER,                             -- 실행 시간 (초)
  tokens    INTEGER,                             -- 사용 토큰 (가능한 경우)
  status    TEXT NOT NULL,                       -- SUCCESS / FAILED / SKIPPED
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

### 5.2 Pipeline Engine

상태 머신으로 구현. 각 단계는 독립적인 함수.

```
Pipeline = [Step, Step, Step, ...]

Step = {
  name: 'DESIGN' | 'IMPLEMENT' | 'REVIEW' | 'VERIFY' | ...
  executor: 'sdk' | 'cli'
  model: 'opus' | 'sonnet' | 'haiku'
  waitForApproval: boolean      // true면 WAITING 상태로 전환
  timeout: number               // 초 단위
  retryable: boolean
}
```

복잡도별 파이프라인 템플릿:

```javascript
const PIPELINES = {
  SIMPLE: [
    { name: 'IMPLEMENT', executor: 'cli', model: 'sonnet', timeout: 600 },
    { name: 'VERIFY',    executor: 'cli', model: 'sonnet', timeout: 120 },
  ],
  MEDIUM: [
    { name: 'DESIGN',    executor: 'cli', model: 'sonnet', timeout: 300, waitForApproval: true },
    { name: 'IMPLEMENT', executor: 'cli', model: 'sonnet', timeout: 600 },
    { name: 'REVIEW',    executor: 'cli', model: 'haiku',  timeout: 180 },
    { name: 'VERIFY',    executor: 'cli', model: 'sonnet', timeout: 120 },
  ],
  COMPLEX: [
    { name: 'DESIGN',       executor: 'cli', model: 'opus',   timeout: 600, waitForApproval: true },
    { name: 'DESIGN_REVIEW', executor: 'cli', model: 'sonnet', timeout: 300 },
    { name: 'IMPLEMENT',    executor: 'cli', model: 'sonnet', timeout: 900 },
    { name: 'REVIEW',       executor: 'cli', model: 'haiku',  timeout: 300 },
    { name: 'FIX',          executor: 'cli', model: 'sonnet', timeout: 600, conditional: true },
    { name: 'VERIFY',       executor: 'cli', model: 'sonnet', timeout: 120 },
  ],
};
```

### 5.3 WorkerPool

```javascript
class WorkerPool {
  maxWorkers: number;          // config에서 로드
  activeWorkers: Map<taskId, ChildProcess>;

  canAccept(): boolean;        // 슬롯 여유 확인
  spawn(task, step): Promise;  // claude CLI 실행
  kill(taskId): void;          // 작업 취소
  getStatus(taskId): object;   // 워커 상태
}
```

워커 실행 방식:
```bash
claude -p "<프롬프트>" \
  --model sonnet \
  --print \
  --output-format json \
  --allowedTools "Bash Edit Read Write Glob Grep" \
  --max-budget-usd 1.00 \
  --add-dir <project-path>
```

worktree 사용 시:
```bash
# 1. git worktree 생성
git -C <project-path> worktree add .worktrees/task-<id> -b pm/task-<id>

# 2. worktree에서 claude CLI 실행
claude -p "<프롬프트>" \
  --model sonnet \
  --print \
  --output-format json \
  --add-dir <project-path>/.worktrees/task-<id>

# 3. 완료 후 worktree 정리 (merge 또는 삭제)
```

### 5.4 Analyzer (Anthropic SDK)

SDK를 직접 호출하여 가벼운 판단 수행.

```javascript
import Anthropic from '@anthropic-ai/sdk';

class Analyzer {
  client: Anthropic;

  // 복잡도 판단 — haiku로 빠르게
  async analyzeComplexity(description: string, preset?: Preset): Promise<'SIMPLE' | 'MEDIUM' | 'COMPLEX'>;

  // 리뷰 결과 판정 — 리뷰 텍스트를 분석하여 pass/fail 판단
  async evaluateReview(reviewText: string): Promise<{ pass: boolean, issues: string[] }>;

  // 결과 요약 — 사용자에게 보여줄 요약 생성
  async summarize(taskLog: TaskLog[]): Promise<string>;
}
```

### 5.5 Preset Manager

```javascript
// presets/mes.json 예시
{
  "name": "mes",
  "description": "동산기획 ERP+MES",
  "project": "C:\\Users\\user\\dongsan_mes",
  "systemPrompt": "이 프로젝트는 Cloudflare Workers + Hono + D1 기반 ERP+MES. CLAUDE.md 참고.",
  "verify": "npm run verify",
  "smoke": "npm run smoke",
  "maxBudgetPerTask": 2.00,
  "conventions": {
    "branch": "pm/task-{id}",
    "commitPrefix": "feat|fix|refactor"
  }
}
```

## 6. 파일 구조

```
claude-pm/
├── package.json
├── tsconfig.json
├── .env.example                    # ANTHROPIC_API_KEY
├── README.md
│
├── src/
│   ├── index.ts                    # CLI 엔트리 (commander.js)
│   ├── commands/                   # CLI 명령어 핸들러
│   │   ├── add.ts
│   │   ├── status.ts
│   │   ├── review.ts
│   │   ├── approve.ts
│   │   ├── reject.ts
│   │   ├── cancel.ts
│   │   ├── retry.ts
│   │   ├── log.ts
│   │   ├── config.ts
│   │   ├── preset.ts
│   │   ├── start.ts                # 데몬 시작
│   │   ├── stop.ts                 # 데몬 종료
│   │   └── run.ts                  # 포그라운드 실행
│   │
│   ├── core/
│   │   ├── task-queue.ts           # SQLite 기반 태스크 큐
│   │   ├── pipeline-engine.ts      # 상태 머신, 단계 실행
│   │   ├── worker-pool.ts          # claude CLI 프로세스 관리
│   │   ├── analyzer.ts             # Anthropic SDK 판단 레이어
│   │   ├── daemon.ts               # 백그라운드 데몬 루프
│   │   └── preset-manager.ts       # 프리셋 로드/관리
│   │
│   ├── workers/
│   │   ├── cli-runner.ts           # claude CLI subprocess 실행
│   │   └── prompts.ts              # 단계별 프롬프트 템플릿
│   │
│   └── utils/
│       ├── db.ts                   # SQLite 초기화 + 헬퍼
│       ├── git.ts                  # worktree 생성/삭제/merge
│       ├── logger.ts               # 콘솔 출력 포맷팅
│       └── notify.ts               # Windows 토스트 알림
│
├── presets/
│   ├── default.json                # 기본 프리셋
│   └── mes.json                    # 동산기획 MES 프리셋
│
├── migrations/
│   └── 001-init.sql                # SQLite 스키마
│
└── data/                           # 런타임 생성
    ├── claude-pm.db                # SQLite DB
    └── logs/                       # 워커 실행 로그
```

## 7. 실패 처리

| 실패 유형 | 대응 |
|----------|------|
| 워커 타임아웃 | FAILED 전환, 자동 retry (max_retries 이내) |
| 워커 크래시 | FAILED 전환, 에러 로그 저장, 자동 retry |
| 검증 실패 (typecheck/build) | 리뷰 단계에서 자동 수정 시도 1회, 실패 시 FAILED |
| CLI 호출 실패 (API 오류 등) | 30초 대기 후 retry, 3회 실패 시 FAILED |
| 사용자 reject | 피드백 포함하여 해당 단계부터 재실행 |

## 8. 데몬 동작

```
pm start
  │
  ▼
┌─────────────────────────────────┐
│ Daemon Loop (3초 간격 폴링)      │
│                                  │
│ 1. QUEUED 작업 확인              │
│    → WorkerPool 슬롯 여유 시     │
│    → ANALYZE 단계 실행           │
│                                  │
│ 2. RUNNING 작업 감시             │
│    → 완료 시 다음 단계로 전환     │
│    → 타임아웃 시 FAILED 전환     │
│                                  │
│ 3. WAITING/REVIEW 알림           │
│    → 신규 전환 시 1회 알림        │
│                                  │
│ 4. FAILED + 자동 retry 처리      │
│    → retries < max_retries 시    │
│    → 자동 재시도                  │
└─────────────────────────────────┘
```

데몬은 `pm start`로 시작, PID 파일(`data/daemon.pid`)로 관리. `pm stop`으로 종료.

## 9. 사용 시나리오

### 시나리오 1: 간단한 버그 수정
```bash
$ pm add "로그인 페이지에서 비밀번호 틀리면 에러 메시지 안 나오는 버그"
Task #7 created (QUEUED)

# 몇 초 후 자동으로 ANALYZE → SIMPLE 판정 → IMPLEMENT → VERIFY

$ pm status
  #7  로그인 에러 메시지 버그  REVIEW ⚠ 리뷰 대기

$ pm review 7
  Branch: pm/task-7
  Complexity: SIMPLE
  Files changed: src/scripts/login.js (+5 -2)

  Summary: 로그인 실패 시 서버 응답의 에러 메시지를
           #login-error 요소에 표시하도록 수정

  [diff 출력]

  Approve? (y/n): y
  Task #7 merged to main ✓
```

### 시나리오 2: 복잡한 기능 (동시 작업)
```bash
$ pm add "주문서 PDF 출력 기능
- 거래처별 양식 다르게
- 미수금 포함 여부 옵션
- A4/A3 선택 가능"
Task #8 created (QUEUED)

$ pm add "재고 부족 시 알림톡 발송"
Task #9 created (QUEUED)

# #8: COMPLEX 판정 → 설계 → 2중 검토 → WAITING
# #9: MEDIUM 판정 → 설계 → WAITING (동시 진행)

$ pm status
  #8  주문서 PDF 출력    WAITING ⚠ 설계 확인
  #9  재고 부족 알림톡    WAITING ⚠ 설계 확인

$ pm approve 8
$ pm approve 9

# 두 작업 동시에 RUNNING (각각 별도 worktree)

$ pm status
  #8  주문서 PDF 출력    RUNNING (구현 중)
  #9  재고 부족 알림톡    RUNNING (구현 중)

# 시간 경과 후...

$ pm status
  #8  주문서 PDF 출력    REVIEW ⚠ 리뷰 대기
  #9  재고 부족 알림톡    REVIEW ⚠ 리뷰 대기
```

## 10. 확장 가능성 (현재 미구현, 향후 고려)

- 웹 대시보드: REST API 레이어 분리되어 있어 UI만 추가하면 됨
- 작업 간 의존성: `pm add --after 8 "PDF 기능에 이메일 발송 추가"`
- 비용 리포트: `pm report --month 4` 월간 토큰/비용 집계
- 프리셋 공유: git repo로 프리셋 배포
