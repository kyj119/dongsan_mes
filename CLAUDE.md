# CLAUDE.md

## 사용자 선호사항 (용준님)

### 작업 원칙
- **추론 먼저, 100% 이해 후 실행**: 요청→추론("왜?"→"진짜 목적?"→"연쇄 영향?")→"제가 이해한 바" 요약→확인. 추측 진행 금지. 모호(범위 불분명/2해석/영향 불확실) 시 즉시 질문: "제가 이해한 게 맞는지" + bullet 3~5개 + 가/나/다 선택지. 신규 기능·구조 변경 시 brainstorming 스킬 먼저.
- **작업 전 확인 필수**: 되돌리기 어려운 작업은 사용자 확인. 임의 진행 금지.
- **feature→verify→next**: 기능 완료→검증(`npm run build && npm run smoke`)→다음 착수.
- **타입 체크 필수**: 백엔드→`npm run verify`, 전체→`npm run build && npm run smoke`.
- **subagent dispatch**: typecheck 포함 의무화. 라우트 수정 시 stats/count/badge 포함.
- **위임보다 인라인 우선**: 도구 몇 번으로 끝나는 일·검증/재확인은 직접 처리. 위임은 독립·병렬 가능한 큰 트랙만, Workflow는 사용자 opt-in 필수 → `.claude/references/agent-team-guide.md` §과다 위임 억제.
- **신규 페이지→권한 등록**: `permission_pages` INSERT + `requirePagePermission`.

### 배포 워크플로우 (자동)
1. **배포 요청 시** → `/deploy-verify` 스킬 자동 실행 (빌드→타입체크→entity감사→배포→스모크)
2. **routes/*.ts 수정 시** → hook이 entity 필터 감사 리마인더 표시
3. **migrations/*.sql 생성 시** → hook이 `/migration-check` 실행 리마인더 표시
4. **배포 후** → `npm run smoke`(엔드포인트 111개, 목록 정본=`scripts/smoke.cjs`) + 주요/변경 페이지 로드 + 변경분 prod 마커 실측

### 멀티세션 워크플로우 (동시 작업 시 필수)
- **동시 세션은 git worktree로 격리**: 새 작업은 `.\scripts\new-session.ps1 <이름>` → `dongsan_mes-worktrees\<이름>`에서 진행(빌드·배포·커밋 격리). 메인 체크아웃은 상태판/조율용 — 직접 코드작업 지양. 종료=`.\scripts\end-session.ps1 <이름> -DeleteBranch`.
- **미완성은 dirty WIP 금지**: 브랜치 커밋 또는 feature flag(settings 키 OFF). dirty WIP가 `deploy:prod` 전체빌드에 휩쓸리는 게 사고 근본원인(multi-UOM 0395 prod 장애 전례).
- **에이전트 팀 병렬 쓰기**=Agent/Workflow `isolation:"worktree"`. 읽기전용은 불요.
- ⚠️ worktree 제거는 반드시 `end-session.ps1`(junction 안전 제거). 폴더 직접 삭제 금지=메인 node_modules 삭제 위험. 상세=`docs/WORKTREE_WORKFLOW.md`.

### 세션 종료 시 필수
PowerShell 빌드/검증 명령 + 다음 세션 TODO + `memory/session-context.md` 덮어쓰기 (결정+이유, 판단기준, 주의사항)
- **완료(✅) 보고 = 현황판에 「1줄 요약+남은 것」만** — 상세 경위는 `PROJECT_STATUS_ARCHIVE.md`에 직접 쓴다. MEMORY.md 훅도 1줄(장문 원본=`memory/MEMORY-ARCHIVE.md`). 게이트=`node scripts/doc-diet-audit.cjs` (훅·세션 시작 배너 연동, 2026-08-10 90K자 비대화 재발 방지). **「✅ 최근 완료」 섹션=항목당 400자 상한**(이름이 인덱스면 인덱스여야 한다) · 줄 1,200자 · ✅ 줄 800자. 위반은 **큰 것부터** 지목된다 — 총량만 보던 구 게이트는 방금 쓴 항목을 깎게 만들어 오래된 덩어리가 영구히 남았다(2026-08-19)
- **스킬도 같은 병에 걸린다** — 긴 SKILL.md 는 자동압축 때 **앞 5,000토큰만 남고 뒤는 경고 없이 사라진다**(`auto-improve` 8KB→197KB). 누적 지식은 SKILL.md 본문이 아니라 `references/`로. 게이트=`npm run audit:skills`(편집 훅=경고 · **커밋 훅=차단**, 스킬 정의가 dirty 일 때만 — 배포 산출물이 아니라 `ship:gate` 에는 의도적으로 안 넣음). 설계 규칙 정본=`.claude/references/agent-team-guide.md` §스킬 설계 규칙

### 대화 스타일 & 환경
- 한국어 대화, 코드/명령어 영어. 존댓말 + 간결. 반복 금지.
- **응답 간결화 (필수)**: 결론·핵심 먼저. 불필요한 서론/맥락 재진술/장황한 설명 제거. 묻지 않은 부가 설명 금지(필요 시 1줄 제안).
  - 표·불릿 우선, 산문 최소화. 정상·통과·문제없는 부분은 "이상 없음" 한 줄로 압축, 나열 금지.
  - 리뷰/검증/감사 결과: 조치 필요한 항목만 심각도·우선순위순으로. 근거는 `file:line` + 1줄.
  - 도구 실행 전 의도 설명은 1줄 이내. 완료 보고는 "무엇을·결과" 위주, 과정 생략.
  - **코드 수정 보고 = 코드 붙여넣기 금지**: 변경 요지 1줄 + `file:line` 참조로 끝낸다. 수정한 코드 블록 재출력·before/after 나열·줄단위 해설 금지. 코드 블록은 사용자가 직접 요청했거나, 사용자가 손으로 실행해야 하는 명령어일 때만.
- OS: Windows, PowerShell | IDE: VS Code + Claude Code | 경로: `C:\Users\user\dongsan_mes`
- 세션 시작 시 `.claude/PROJECT_STATUS.md` 읽기 (MEMORY.md는 auto-memory 자동 로드)
- 작업 시작/완료/차단 시 PROJECT_STATUS.md 업데이트

# 동산기획 ERP+MES 프로젝트

## 개발 명령어
명령어 전체 목록 = `package.json` scripts. 로컬 서버 = `npm run dev:d1` (192.168.0.94:3000).
> ⚠️ `dev:d1`은 `dist/`를 서빙. 코드 수정 시 반드시 `npm run build` 먼저.

## 알려진 함정 (Critical)
### Template Literal 이스케이프 (`src/layout/*.ts`)
`src/layout/sidebar.ts`·`topbar.ts`는 백틱 템플릿. onclick에서 `\'` → 그냥 `'` 출력됨. 반드시 `\\'` 사용.
```js
// ❌ onclick="func(\'' + val + '\')"
// ✅ onclick="func(\\'' + val + '\\')"
```
`src/scripts/*.js`(전역 클라 JS = `src/scripts/layout/shell.js`)는 `?raw` import이므로 이 문제 없음. (layout.ts 3259→228줄 분할, 2026-06-09 #2)

### HTML↔JS Silent Fail 방지
`?raw` import된 JS의 `getElementById` 대상 ID가 변경되면 silent fail.
```js
var el = document.getElementById('someId');
if (!el) { console.warn('[pageName] #someId not found'); return; }
```
**pages/*.ts 변경 시 scripts/*.js getElementById 참조 대조** (review-checklist §12).

### 목록 정렬 = 고유키 tie-break 필수 (`ORDER BY`)
목록 쿼리의 `ORDER BY`에 **고유 컬럼(`id`) tie-break를 반드시 마지막에** 붙인다. 이관·배치 INSERT 데이터는 `created_at`이 초 단위까지 동일해(발주 258건 중 241건 동일) 동값 구간이 rowid ASC=**오래된 순으로 뒤집혀 표시**되고, `LIMIT/OFFSET` 페이징도 페이지 간 중복·누락이 난다.
```sql
-- ❌ ORDER BY po.created_at DESC LIMIT ? OFFSET ?         -- 동값 구간 순서 미정의
-- ✅ ORDER BY po.order_date DESC, po.id DESC LIMIT ? OFFSET ?
```
- **기본 정렬 키는 업무일자**(`order_date`·`receipt_date`·`issue_date`) 우선. `created_at`은 이관 데이터에서 "이관 실행 시각"이라 업무상 무의미 → 단독 기본 정렬 금지.
- 정렬 옵션 맵(`sortOptions`)은 **모든 항목**에 tie-break 포함. NULL 처리는 `col IS NULL, col ASC` (D1 `NULLS LAST` 의존 회피).
- 라벨은 기준을 명시("발주일 최신순"·"등록 최신순") — "최신순"만 쓰면 어느 날짜 기준인지 불명확.
- **감사 도구 = `node scripts/sort-audit.cjs`** (P1 발견 시 exit 1). grep 패턴은 다항 ORDER BY를 못 잡으니 쓰지 말 것.
- **쓰기·선택 경로가 더 위험**: `UPDATE ... WHERE id=(SELECT ... LIMIT 1)`·`ROW_NUMBER() OVER(ORDER BY ...)`·자재 선택 `ORDER BY ... LIMIT 1` 은 표시가 아니라 **어느 행이 처리되는지**가 바뀐다.
- tie-break 키는 **최외곽 FROM(행 grain)의 PK**. `DISTINCT`/`UNION` 은 출력 컬럼만 참조 가능하고, `id` 없는 복합PK 테이블에 `id`를 붙이면 500. 수정 후 로컬 D1 `prepare()` 확인 필수(타입체크는 SQL 오류를 못 잡음).

(발주 계열 2026-07-27, 전역 P0~P2 전량 2026-07-29. 상세 = `docs/audits/2026-07-27-list-sort-tiebreak.md`)

### D1 실행계획 = 통계(ANALYZE) 없으면 조인키를 버린다 (`npm run audit:query-cost`)
**데이터가 작은데 느리면 데이터량이 아니라 실행계획을 의심한다.** SQLite는 `sqlite_stat1`이 없으면 모든 인덱스 선택도를 같다고 가정한다. `orders`처럼 인덱스가 17개 붙은 테이블에서는 조인키(`client_id`)를 버리고 `entity_id` 인덱스를 잡아 **거래처 1건마다 orders 전량을 훑는다**.
- prod는 통계가 **한 번도 만들어진 적 없었다**(2026-08-25 최초 ANALYZE). `/reports` 13.9초·`/api/clients?dormant` **36초 뒤 500**(D1 한도 초과 → 그 isolate의 후속 요청까지 전멸) → ANALYZE 후 123ms·83ms. rows_read 2,530만→8.8만.
- **갱신 = `cron/daily-maintenance` 마지막 단계**(자동). 대량 이관 직후엔 `POST /api/cron/analyze` 수동. 되돌리기=`DROP TABLE sqlite_stat1`(통계는 힌트라 결과 불변).
- **통계는 만능이 아니다** — 상관 스칼라 서브쿼리(`(SELECT MAX(..) FROM orders WHERE client_id=c.id)`)·`clients`를 바깥에 둔 조인은 애초에 쓰지 말 것. **큰 쪽을 먼저 GROUP BY로 접고 작은 쪽을 조인**한다(`reports.ts` client-revenue·`clients.ts` last_order_date 정본). 상시 감사 = **`npm run audit:subquery`**(SELECT절 상관 서브쿼리만 분류·규모 가중=`scripts/table-rows.json`). ⚠️`[바깥×서브]`는 **테이블 전체 행수 상한**이라 WHERE로 걸러진 실제 행수가 아니다 — 순위용 눈금이지 측정값이 아니고, 판정은 `EXPLAIN QUERY PLAN`으로.
- **「지금 빠르다」≠「안전하다」** — 데이터가 비어서 안 터지는 것과 구조가 안전한 것은 다르다(`/ai/credit-risk/summary`가 42ms인 건 등급이 1건뿐이라서였다).
- **타입체크·smoke는 이걸 절대 못 잡는다** — 14초 응답도 200이다. 게이트 = `npm run audit:query-cost`(예산 초과 시 exit 1, 기준선=`scripts/query-cost-baseline.json`). 진단은 `EXPLAIN QUERY PLAN` + 응답의 `rows_read`.

### 계산 규칙 = 값 대조 게이트로만 잡힌다 (`npm run test:calc` · CI 배포 차단)
**문법이 멀쩡한 계산 오류는 기존 게이트 전부를 통과한다.** 2026-08-25 여신 리팩터링에서 공유 SQL을 서브쿼리로 감싸며 바깥에 `?`를 둬 **파라미터가 한 칸씩 밀렸고**(`a.entity_id=6` → adjustments 전량 누락, 초과 37곳이 108곳으로), typecheck·build·check:dom·sort-audit·entity-audit·smoke가 **전부 통과**했다. prod 배포 후 숫자를 대조해서야 잡혔다.
- **게이트 = `npm run test:calc`** — 청구면적(`test:orderline`)·마감표기(`test:finishing-label`)·파일규격(`test:file-dims`)·여신(`test:credit`)·품목중복(`audit:items:selftest`). **deploy.yml 이 배포 전에 돌린다**(2026-08-25 신설 — 그전엔 npm 스크립트로만 있어 아무도 자동 실행하지 않았다).
- `test:hookguard`는 제품이 아니라 **개발환경**(Windows 셸 차단)을 검증 → CI 제외, 로컬 `test:all`에만.
- 새 계산 규칙을 만들면 **픽스처 테스트를 같이 만든다**. ⚠️로컬 D1이 비면 전부 0이라 판별이 안 된다(그래서 `test:credit`은 in-memory SQLite에 픽스처를 심는다). 상세=memory `feedback-sqlite-placeholder-subquery-order`.

### IA 스크립트 = 웹과 분리된 수동 배포 축 5개 (`npm run audit:ia-jsx`)
`git push`·`npm run deploy` 로는 **절대 반영되지 않는다**. main에 있어도 런타임은 옛날 파일일 수 있다 — 브랜치·커밋 기록으로 배포 여부를 추론하면 틀린다.

| 축 | repo | 런타임(정본) |
|---|---|---|
| 1 에이전트 JSX | `IllustratorAutomat/*.jsx` | **실행 중 exe 폴더**(`Get-Process IllustratorAutomat`). `publish\` 아님 |
| 2 디자이너 JSX | `IllustratorAutomat/designer/*.jsx` | `Z:\DESIGNS\IA-등록\_scripts\` |
| 3 CEP 패널 배포본 | `.../com.mes.a0.panel/**` | `Z:\...\_scripts\a0-panel\com.mes.a0.panel\` |
| 4 CEP 패널 설치본 | 같은 repo 원본 | `%APPDATA%\Adobe\CEP\extensions\com.mes.a0.panel` (**일러가 실제 읽는 것**) |
| 5 배포 도구 | `scripts/install-*.ps1` | `Z:\...\_scripts\` · `Z:\Designs\caps-worker\` (**디자이너가 실행하는 설치기**) |

- **감사 = `npm run audit:ia-jsx`** (드리프트 시 exit 1). JSX 수정 후 이걸 안 돌리면 조용히 구버전이 돈다.
- **배포 = `npm run ia:deploy`**. **배포 대상을 하드코딩하지 않는다**(2026-08-06 근본수정) — 손목록 때문에 같은 사고를 세 번 냈다: `.debug` 오제외 → 재단 패널 미등록 → **배포 도구 자신이 감사망 밖**.
- **축3 갱신 후엔 PC별 설치(축4)가 반드시 뒤따른다.** 순서 = ①축3 Z: → ②각 PC 설치. 뒤집으면 구버전이 깔린다.
- **축2(호스트 JSX)는 Z: 1개 교체 = 전 PC 즉시 반영** — 백업·실기기 확인 선행, 자동 동기화 금지.
- JSX 조기 `return` 은 반드시 `_ia_status` 설정. 미설정=에이전트가 **틀린 진단**("JSX 반환 빈값")을 UI에 띄운다.

> 축별 상세·패널 구조·배포 옵션·용량 감사 = **`/ia-automat` 스킬** · 전체 절차 정본 = `docs/DEPLOY_MANUAL.md`(**§3-A = 가공·재단 패널 배포**).

(2026-07-29: SheetLayout 폴백 수정이 exe 폴더에 미복사 → 모아찍기 판 렌더 6일간 실패. 상세 = memory `feedback-ia-jsx-runtime-path`)

### 재작업 = MES 기능 아님, 운영 규칙 (`docs/REWORK_RULES.md`)
재작업은 **개발하지 않기로 확정**(2026-08-05). 절차서 정본 = `docs/REWORK_RULES.md` — 기능을 새로 만들자는 제안 전에 이걸 읽을 것.
사고 지점은 **파일명**이다: 출력완료 매칭이 파일명 꼬리 `주문번호-순번`으로 `print_file_map` 을 찾는데(`printEvents.ts` `resolveCard`),
그 등록 행은 **에이전트가 파일을 만들 때만** 생긴다. 그래서 경로별로 파일명 처리가 **정반대**다 —
새 주문을 만들면 꼬리를 **새 주문번호로 교체**해야 하고(안 하면 원 주문 카드에 출력완료가 찍혀 실적 오염),
기존 주문을 유지한 재출력은 **건드리면 안 된다**(그대로여야 매칭이 맞는다).

> 사업 도메인·역할·아키텍처·에이전트 팀·참조 문서 → `.claude/references/project-context.md`
> **단일 소스 원칙**: 참조 파일에 코드 값 복사 금지. 구조 변경 시 참조 파일도 동기 업데이트.
