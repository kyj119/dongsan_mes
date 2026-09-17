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
4. **배포 후** → `npm run smoke:prod`(목록 정본=`scripts/smoke.cjs` — 상세 단건은 목록 응답에서 자동 확장되므로 **개수는 고정이 아니다**. ⚠️`npm run smoke` 는 기본 대상이 **localhost** 라 dev 서버가 떠 있으면 배포 검증이 조용히 로컬을 통과한다) + 주요/변경 페이지 로드 + 변경분 prod 마커 실측

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
**함수 호출판 = `npm run check:fn`**(2026-09-15, P13) — `?raw` 스크립트의 bare 호출·`on*="fn("` 핸들러가 **그 페이지 번들**(pages 의 `?raw` import + 레이아웃 + 리터럴 안 정의) 어디에도 없으면 잡는다. 파서(TypeScript API) 기반이라 주석·문자열·정규식은 안 속고, `typeof fn` 가드가 있는 선택적 호출은 제외. 잡힌 P13 = 지워진 `loadPendingPOs()` 를 부르는데 try/catch 가 삼켜 **모든 게이트가 통과**했던 것. 기준선 없이 0건이 정상 · 자가시험 `check:fn:selftest`(잡아야 할 7건·잡으면 안 되는 것) · 외부 라이브러리 전역은 스크립트의 `EXTERNAL` 목록.

### 결과를 삼키는 두 가지 — 페이지가 떠나거나, 늦게 온 응답이 덮거나 (2026-09-17 실기)
**요청은 정상인데 결과가 화면에 없다**면 응답을 의심하기 전에 **그 결과가 도착할 화면이 살아 있었는지**부터 본다. 이날 로그인·주문서에서 같은 형태가 둘 나왔다.
- **`new Event('submit')` 은 취소할 수 없다** — 폼의 submit 리스너가 `e.preventDefault()` 를 해도 **조용히 무효**가 되고, 브라우저의 네이티브 제출이 그대로 진행돼 **페이지가 새로고침**된다. axios 는 이미 떠났는데 렌더할 화면이 없어져 성공이든 401이든 **아무 말 없이** 사라진다. → **손으로 만든 「Enter 지원」을 두지 않는다**: `type=submit` 버튼이 있는 `<form>` 은 브라우저가 알아서 submit 을 쏘고 **그건 취소 가능하다**. 굳이 dispatch 해야 하면 `new Event('submit', {cancelable:true})`.
- **`await` 없이 던진 비동기가 나중에 돌아와 덮는다** — `applyItemSelection` 이 `loadFinishingForOrder()` 를 await 없이 호출해, 대기함 프리필이 넣은 마감을 **늦게 도착한 응답이 `innerHTML = opts` 로 지웠다**. 값이 **안 들어온 게 아니라 들어왔다가 지워진 것**이라, 사람 눈에는 「자동으로 안 불러온다」로 보인다.
  - 고치는 자리는 **호출부가 아니라 그리는 쪽**이다 — 호출부에 `await` 를 붙이면 그 경로 하나만 고쳐진다(당시 4곳). **옵션을 다시 그리는 함수가 선택값을 보존**하면 지금 있는 호출부도, 앞으로 생길 호출부도 안전하다(새 목록에 그 값이 없으면 비운다 — 품목이 바뀌어 방식군이 달라진 경우).
- **셸로 코드를 주입할 때 백틱은 명령 치환이 된다** — Git Bash 에서 `node -e "…\`foo\`…"` 의 백틱이 실행돼 **그 자리만 조용히 비고 나머지는 멀쩡히 저장된다**(이날 버전 주석·현황판 배너가 그렇게 잘렸다). 백틱이 든 한글 문장은 `node -e` 로 넣지 말고 **파일에 써서 읽힌다**(§heredoc 백슬래시 붕괴와 같은 축).

### 마이그레이션 번호는 유일하지 않다
`migrations/` 에 같은 4자리 번호가 반복해서 생긴다(2026-09-10 실측 21개 번호 — 그중 `0576`은 3중복). 병렬 worktree 세션이 각자 다음 번호를 딴 결과라 계속 늘어난다 — **하드코딩된 목록은 매 사이클 바로 낡으므로 여기 나열하지 않는다.** 현재 목록은 `ls migrations | sed -E 's/^([0-9]+)_.*/\1/' | sort | uniq -c | awk '$1>1'` 로 직접 확인. **번호 중복 자체는 무해할 때가 많고**(서로 다른 테이블/컬럼이면 둘 다 적용된다) 위험한 건 같은 번호가 같은 테이블에 같은 컬럼 ADD / 같은 테이블 CREATE 하는 경우다(#639, 09-11 해소).
- **문서·메모리가 번호만으로 지목하면 어느 쪽인지 알 수 없다** — `0596` = `0596_fix_unit_price_semantics.sql` + `0596_qm6_loan.sql` 이다. 번호를 쓸 때는 **파일명을 병기**한다.
- 적용 순서는 번호가 아니라 **전체 파일명 사전순**이다. 같은 번호 둘의 선후는 뒷부분 이름이 정한다 — 의존이 있으면 번호를 다시 딴다.
- **wrangler 는 번호가 아니라 전체 파일명으로 추적한다**(`d1_migrations.name`). 이미 prod 에 적용된 파일을 **재번호하면 그 마이그레이션이 한 번 더 실행된다** — 다른 브랜치에서 회수할 때 파일명을 보존해야 하는 이유다.
- **게이트 = `npm run audit:migration-number`**(#639, CI `deploy.yml` 배선). 같은 번호·같은 테이블 DDL 충돌이면 exit 1(배포 차단), 단순 중복은 경고. 새 마이그 채번 시 `new-session.ps1` 이 다음 번호를 안내한다.
- **prod 행 id 를 하드코딩한 데이터 마이그는 `WHERE EXISTS` 로 감싼다** — 신규 환경에는 그 행이 없어 **FK 위반으로 죽고**, 그 경로가 `db:bootstrap:ci`(= CI 의 `canary:write:ci`)라 **CI 가 통째로 깨진다**. `0573` 이 발주 id 7개를 박아 정확히 그랬다(2026-09-10 회수 때 발견). `INSERT ... SELECT ... WHERE EXISTS (SELECT 1 FROM <부모> WHERE id=…)` 로 감싸면 로컬은 no-op, prod 는 동작 불변이다.
- **적용 여부는 `d1_migrations` 로 판정할 수 없다** — 추적이 `0313` 에서 끊겼다(312건이 전부). 「prod 에 들어갔나」는 **그 마이그가 만든 데이터를 직접 조회해서** 확인한다(품목 존재·컬럼값·건수).

### 목록 정렬 = 고유키 tie-break 필수 (`ORDER BY`)
목록 쿼리의 `ORDER BY`에 **고유 컬럼(`id`) tie-break를 반드시 마지막에** 붙인다. 이관·배치 INSERT 데이터는 `created_at`이 초 단위까지 동일해(발주 258건 중 241건 동일) 동값 구간이 rowid ASC=**오래된 순으로 뒤집혀 표시**되고, `LIMIT/OFFSET` 페이징도 페이지 간 중복·누락이 난다.
```sql
-- ❌ ORDER BY po.created_at DESC LIMIT ? OFFSET ?         -- 동값 구간 순서 미정의
-- ✅ ORDER BY po.order_date DESC, po.id DESC LIMIT ? OFFSET ?
```
- **기본 정렬 키는 업무일자**(`order_date`·`receipt_date`·`issue_date`) 우선. `created_at`은 이관 데이터에서 "이관 실행 시각"이라 업무상 무의미 → 단독 기본 정렬 금지.
- 정렬 옵션 맵(`sortOptions`)은 **모든 항목**에 tie-break 포함. NULL 처리는 `col IS NULL, col ASC` (D1 `NULLS LAST` 의존 회피).
- 라벨은 기준을 명시("발주일 최신순"·"등록 최신순") — "최신순"만 쓰면 어느 날짜 기준인지 불명확.
- **감사 도구 = `node scripts/sort-audit.cjs`** (P1 발견 시 exit 1). grep 패턴은 다항 ORDER BY를 못 잡으니 쓰지 말 것. ⚠️**npm alias 도 없고 어떤 실행 경로에도 안 물려 있다** — 사람이 부를 때만 돈다.
- **쓰기·선택 경로가 더 위험**: `UPDATE ... WHERE id=(SELECT ... LIMIT 1)`·`ROW_NUMBER() OVER(ORDER BY ...)`·자재 선택 `ORDER BY ... LIMIT 1` 은 표시가 아니라 **어느 행이 처리되는지**가 바뀐다.
- tie-break 키는 **최외곽 FROM(행 grain)의 PK**. `DISTINCT`/`UNION` 은 출력 컬럼만 참조 가능하고, `id` 없는 복합PK 테이블에 `id`를 붙이면 500. 수정 후 로컬 D1 `prepare()` 확인 필수(타입체크는 SQL 오류를 못 잡음).

(발주 계열 2026-07-27, 전역 P0~P2 전량 2026-07-29. 상세 = `docs/audits/2026-07-27-list-sort-tiebreak.md`)

### D1 실행계획 = 통계(ANALYZE) 없으면 조인키를 버린다 (`npm run audit:query-cost`)
**데이터가 작은데 느리면 데이터량이 아니라 실행계획을 의심한다.** SQLite는 `sqlite_stat1`이 없으면 모든 인덱스 선택도를 같다고 가정한다. `orders`처럼 인덱스가 17개 붙은 테이블에서는 조인키(`client_id`)를 버리고 `entity_id` 인덱스를 잡아 **거래처 1건마다 orders 전량을 훑는다**.
- prod는 통계가 **한 번도 만들어진 적 없었다**(2026-08-25 최초 ANALYZE). `/reports` 13.9초·`/api/clients?dormant` **36초 뒤 500**(D1 한도 초과 → 그 isolate의 후속 요청까지 전멸) → ANALYZE 후 123ms·83ms. rows_read 2,530만→8.8만.
- **갱신 = `cron/daily-maintenance` 마지막 단계**(자동). 대량 이관 직후엔 `POST /api/cron/analyze` 수동. 되돌리기=`DROP TABLE sqlite_stat1`(통계는 힌트라 결과 불변).
- **통계는 만능이 아니다** — 상관 스칼라 서브쿼리(`(SELECT MAX(..) FROM orders WHERE client_id=c.id)`)·`clients`를 바깥에 둔 조인은 애초에 쓰지 말 것. **큰 쪽을 먼저 GROUP BY로 접고 작은 쪽을 조인**한다(`reports.ts` client-revenue·`clients.ts` last_order_date 정본). 상시 감사 = **`npm run audit:subquery`**(SELECT절 상관 서브쿼리만 분류·규모 가중=`scripts/table-rows.json`). ⚠️`[바깥×서브]`는 **테이블 전체 행수 상한**이라 WHERE로 걸러진 실제 행수가 아니다 — 순위용 눈금이지 측정값이 아니고, 판정은 `EXPLAIN QUERY PLAN`으로.
- **「지금 빠르다」≠「안전하다」** — 데이터가 비어서 안 터지는 것과 구조가 안전한 것은 다르다(`/ai/credit-risk/summary`가 42ms인 건 등급이 1건뿐이라서였다).
- **타입체크·smoke는 이걸 절대 못 잡는다** — 14초 응답도 200이다. 게이트 = `npm run audit:query-cost`(예산 초과 시 exit 1, 기준선=`scripts/query-cost-baseline.json` — ⚠️실행 경로 미배선, 수동). 진단은 `EXPLAIN QUERY PLAN` + 응답의 `rows_read`.

### 누적 캐시 = 수정·삭제가 안 따라온다 (`npm run test:symmetry`)
**이벤트 시점에 `col = col ± ?` 로 누적해 놓고, 수정·삭제 경로가 그걸 모르는 것** — 이 프로젝트에서 가장 자주 재발한 결함이다. 2026-08-31 전수 점검에서 **5개 축이 동시에 걸렸다**: 주문↔재고 · 차입금 상환 · 자동차감 2종 · `clients.purchase_balance` · `quotations.converted_count`.

**새 누적 캐시를 만들지 않는다.** 셋 중 하나로 해결한다 — 이 순서가 곧 우선순위다.
1. **파생으로 뺀다**(캐시 없음) — AP 잔액=`utils/supplierPayable`(발주−지급−조정) · 미수금=`deriveClientBalance` · 견적 전환수=`orders.quotation_id` COUNT. 어긋날 여지 자체가 없어진다.
2. **자기교정 산식**으로 만든다 — 연차 소멸이 정답 사례(`leaves.ts:770,773`): `remaining = accrued+…−expired` 이고 `>0` 조건이라 **두 번 돌려도 두 번째는 0**.
3. 둘 다 안 되면 **되돌리는 짝을 같은 커밋에서** 만든다 — 차감(`deductStockLinesOnShip`)↔환원(`restoreStockLinesOnUnship`), 자동차감↔`utils/autoDeductRestore`.

**되돌리기는 「역분개」가 아니라 「행 철회」다** — `idx_inventory_tx_unique_ref`(0224·0293, #88)가 `(reference_type, reference_id, item_id, transaction_type, entity_id)` UNIQUE 라 **reference 당 OUT 은 1행**이다. 상쇄 IN 을 더해도 OUT 행이 남아 **재차감 INSERT 가 UNIQUE 위반 500**(재고는 이미 빠진 뒤 INSERT 만 터진다). 그래서 환원 = 재고 복원 + 그 OUT 행 DELETE. 「무슨 일이 있었나」는 `order_status_history` 가 남긴다.

**막을 수 없으면 막는다** — 발주는 재고가 움직인 뒤 수정·삭제가 **차단**된다(`purchaseOrders/core.ts:453` 수정 · `:674` DRAFT 복귀 · `:748` 삭제). 주문도 같은 정책으로 통일했다: 출고 차감 이력이 있으면 **기성 라인 구성 변경만** 400(배송지·비고 수정은 통과). `PUT /orders/:id` 는 `order_items` 를 **전량 delete+reinsert** 하므로, 라인을 지우면 환원 근거가 사라져 **되돌릴 방법이 없다**.

**배치는 재고를 움직이지 않는다** — `POST /orders/sync-statuses` 에 차감을 넣지 않은 이유: ①대상이 이미 출고 처리를 거친 주문 ②#478 로 100건 bound(subrequest 한도) ③배치가 재고를 움직이면 "언제 왜 빠졌는지"가 사람 행동과 끊긴다.

**재고를 바꾸면 원장에 남기고, 한 batch 로 묶는다** — `inventory.quantity` 가 정본이고 `inventory_transactions` 는 별개 기록이라 **둘이 조용히 어긋난다**(prod 실측 2026-08-30: 잔고 합계 132,121 vs 원장 순합 72,873). 자동차감 2종은 원장을 아예 안 남겨 증감내역 화면의 사각지대였고, 실사 구역배정 이동도 빠져 있었다 — 셋 다 2026-08-31 에 메웠다. **`UPDATE inventory SET quantity` 를 새로 쓰면 같은 커밋에서 원장 INSERT 도 쓴다**(현재 18곳 — 환원 2곳은 원장 행 DELETE 라 INSERT 없음이 정상).

**원자성 — 재고와 원장은 같은 batch 에 넣는다**(2026-08-31 전환). 개별 `.run()` 이면 UPDATE 는 되고 INSERT 가 터졌을 때 **재고만 빠지고 원장이 빈다**(UNIQUE 위반 500 이 정확히 그 모습이었다). `balance_after` 는 read-after-write 대신 **서브쿼리**로 읽는다 — batch 는 순서대로 실행되므로 UPDATE 반영값을 본다(`returns.ts` 전례). 부수 효과로 자동차감의 **수동 롤백 코드가 사라졌다**: batch 가 통째로 롤백되므로 UNIQUE 위반 시 되돌릴 것이 없다 — 보상 로직이 없으면 "보상이 또 실패하는" 경로도 없다.

**환원 흔적은 시스템 로그에 남긴다** — 환원이 원장의 차감 행을 **철회**하므로(UNIQUE 상 역분개 불가) 되돌린 사실이 재고 축에 안 남는다. 주문 출고는 `order_status_history` 가 받쳐 주지만 자동차감은 아무 데도 없었다 → 두 환원 경로 모두 `action='STOCK_RESTORE'` 로 `/activity-log` 에 기록한다(호출처가 actor 를 넘긴다). 기록 실패가 환원을 막지는 않는다.

**이중 정본은 남아 있다 — 대사로 감시한다**(`npm run audit:stock-ledger`). 이관이 `inventory` 에만 수량을 넣어 prod 격차가 **59,248**(197품목)이다. 이건 버그가 아니라 **출발점**이라 총량을 재면 영원히 빨간불이다 → 품목별 격차를 기준선(`scripts/stock-ledger-baseline.json`)으로 고정하고 **거기서 벗어난 품목만** 잡는다. 새 쓰기 경로가 원장을 빠뜨리면 그 품목만 뜬다. ⚠️기준선은 대상 DB 별이다(로컬/prod 혼용 시 차단).

**타입체크·smoke 는 이걸 절대 못 잡는다** — 캐시가 틀려도 200 이다. 게이트 = **`npm run test:symmetry`**(수정·삭제 대칭 17항목) · **`npm run test:ship-stock`**(출고/취소/재출고 20항목) · **`npm run test:autodeduct`**(자동차감 원장·환원 20항목) · **`npm run audit:stock-ledger`**(잔고↔원장 대사, prod 대상). 셋 다 서버 기동 필요라 CI 가 아니라 로컬 게이트다. `test:autodeduct` 는 전용 품목을 이름으로 재사용해 반복 실행해도 품목이 쌓이지 않고, 에이전트 키는 `AGENT_API_KEY` 또는 `.dev.vars` 에서 읽는다. ⚠️print_event 중복 판정 키가 **(file_path, print_completed_at)** 이라 시각 없이 재전송하면 duplicate 로 삼켜져 **차감 로직에 도달조차 못 한다**.

(상세 경위 = `PROJECT_STATUS_ARCHIVE.md` §2026-08-31 · §2026-08-30)

### 계산 규칙 = 값 대조 게이트로만 잡힌다 (`npm run test:calc` · CI 배포 차단)
**문법이 멀쩡한 계산 오류는 기존 게이트 전부를 통과한다.** 2026-08-25 여신 리팩터링에서 공유 SQL을 서브쿼리로 감싸며 바깥에 `?`를 둬 **파라미터가 한 칸씩 밀렸고**(`a.entity_id=6` → adjustments 전량 누락, 초과 37곳이 108곳으로), typecheck·build·check:dom·sort-audit·entity-audit·smoke가 **전부 통과**했다. prod 배포 후 숫자를 대조해서야 잡혔다.
- **게이트 = `npm run test:calc`** — **32항목 체인, 목록 정본=`package.json`**(청구면적 `test:orderline`·마감표기 `test:finishing-label`·파일규격 `test:file-dims`·여신 `test:credit`·품목중복 `audit:items:selftest`·4대보험 기간요율 `test:insurance-period`·공제 오버라이드 `test:payroll-override`·간이세액표/자녀공제 `test:income-tax` 외 24개). **`deploy.yml`(CI) · `ship:gate`(/ship) · `/deploy-verify` Phase 1 세 경로 전부가 배포 전에 돌린다**(2026-08-25 CI 신설 → 2026-09-10 나머지 둘 편입. 그전엔 로컬 `deploy:prod` 로 내보내면 이 게이트가 배포를 못 막고 **이미 나간 뒤** CI 실패로만 드러났다).
- `test:hookguard`는 제품이 아니라 **개발환경**(Windows 셸 차단)을 검증 → CI 제외. 로컬 `test:all` + **커밋 훅 차단**(`.claude/hooks/`·`settings.json` 이 dirty 인 커밋만 — `pretooluse-bash.cjs`).
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
- **축4는 이제 스스로 따라온다**(2026-08-26 배포). 축2 호스트의 `mesA0_ping()` → `mesPanel_syncShell()` 이 Z: 배포본(축3)과 설치본(축4)을 대조해 다르면 갱신하고 **"일러를 다시 켜 주세요"** 를 띄운다. **트리거가 셸이 아니라 ping 이라 구 셸이 깔린 PC 도 붙는다** → PC 방문 불요. 실측 75ms.
  - 안전 순서 = Z:없음/미설치 skip → probe(remove+copy) → 백업(**extensions 밖** `_panel_backups`) → 복사 → 서명 검증 → 실패 시 **백업 롤백** → 2회 실패면 중단. 롤백 성패는 `copyTree` 반환이 아니라 **복구 후 서명**으로 판정한다(잠긴 파일은 애초에 안 바뀐다).
  - 서명 = 셸버전+파일수+총바이트, **`.bak-*` 제외**. 제외를 빼면 개수가 안 맞아 **영원히 수렴하지 않고** 매 부팅 재복사한다.
  - ⚠️ **최초 설치는 여전히 `install-a0-panel.ps1`**(레지스트리·구 확장 제거). 자동 갱신은 **이미 깔린 셸**만 다룬다.
  - 게이트 = `npm run cut:shellsync`(원본 절취 + File/Folder shim). **2026-09-10 `ia-deploy.cjs` 의 `GATES` 에 등록** — 그전까지는 게이트라 불리면서 배포 때 아무도 안 돌렸다(아래 §조용한 격하의 `cut:butt` 사고와 같은 형태였다).
- **「패널은 뜨는데 동작만 실패」는 설치 문제가 아닐 수 있다** — 그 PC 에 있는 건 셸(축4)뿐이고 **호스트 로직은 패널을 열 때마다 `Z:`(축2)에서 `$.evalFile` 로 읽는다**(`jsx/host.jsx` 는 스텁). 그래서 그 증상은 설치본보다 **Z: 접근 실패·구버전 호스트**를 먼저 가리킨다. 1차 판정은 패널 **[⚙ 환경 점검]** 하나로 끝난다(호스트·재단·셸·스텁·잠금 버전 · 일러 버전 · Z: 연결/쓰기 · temp 쓰기와 **ASCII 여부**(한글 사용자명) · config 나이 · 자동갱신 상태). **사람에게 「뭐가 안 되나요」를 묻기 전에 이 출력부터 받는다.**
- **자동 갱신은 실패하면 조용히 멈춘다** — 같은 셸 서명으로 2회 실패하면 `skip;why=retrylimit` 로 **그 PC 는 그 버전을 영영 안 받는다**(`mes-a0-host.jsx:529`. 다음 버전이 나오면 다시 시도한다). 표식 = `%TEMP%\mes_panel_sync.txt`, 지우면 재시도. 화면에는 아무 말도 안 나오므로 **「축4는 스스로 따라온다」가 이미 멈춘 PC 에는 해당하지 않는다.**
- **한 대만 실패하면 계측을 늘리지 말고 두 대를 비교한다** (2026-09-15) — 「가공 중 파일 I/O 가 죽는다」를 프로브·재시도로 여러 사이클 쫓았는데, 정작 답은 **이미 Z: 에 있던 등록 폴더 20건을 PC 별로 가르는 것**이었다: `DESKTOP-62VJ5FA`(일러 **30.7.0**) 9건 중 잔해 **0** · `DESKTOP-6JSH6OL`(**30.3.0**) 11건 중 잔해 **9**. **용량 가설은 데이터와 반대다** — 30.7 쪽은 25.2MB 를 성공시켰고 30.3 쪽은 2.2MB 에서 실패했다(0.9.0 이래의 「자원 고갈」 전제가 여기서 깨진다). ⚠️PC 와 버전이 묶여 있어 **원인을 버전으로 단정할 수 없다** — 분리 실험은 「그 PC 를 올리고 1건」 하나뿐이고, 그게 곧 조치다. 실패가 한쪽에 쏠렸는지부터 세는 것이 **프로브를 하나 더 만드는 것보다 항상 싸다**.
- **ExtendScript 가 못 하는 일은 빼서 .NET 에 준다 — 고치지 말고** (2026-09-15) — 파일 I/O 가 죽는 것을 프로브·재시도로 여러 사이클 쫓다가, 결국 **그 일을 이 축에서 없애는 것**이 답이었다. ①`_출력` 픽업 복사(8MB Z:→Z: 왕복 = 이 호스트 최대 I/O) → 에이전트 `EnsurePickupCopy`+`SweepPickupRecent`. ②`work.ai` → **모아찍기에서만**(단건은 읽는 코드가 0인데 작업당 Z: 쓰기의 **23%** 였다 — 20건 402.8MB 중 92.8MB 실측). ⚠️**grep 이 「소비자 0」이라고 해서 지워도 되는 건 아니다** — 사람이 손으로 여는 용도는 코드에 안 보인다. 순서는 ①읽는 코드를 전수로 센다 ②0이면 **사람 용도를 사람에게 묻는다**(여기선 「그렇게 쓴 적 없다」 · 2026-09-16) ③둘 다 없으면 없앤다. 남은 Z: 쓰기 = `EPS + thumb 2 + manifest`. **커밋 순서는 불변**(에이전트도 manifest 를 읽은 뒤에만 복사한다). ⚠️코드를 옮기면 **그 코드를 지키던 게이트도 같이 옮긴다** — `test:outcopy` 는 만든 지 하루 만에 은퇴했고(없어진 코드의 초록불은 아무 뜻도 없다) 성질은 `panel:smoke` §13 이 에이전트 소스를 읽어 잇는다.
- **플로우 실측 = `npm run a0:flow`** (2026-09-15) — 작업 폴더를 커밋(manifest)→수령(`.ingested`)→픽업(`_출력`) 세 관문으로 판정하고 단계별 Z: 바이트를 센다. 여태 패널 화면·탐색기·MES 를 사람이 따로 보고 머릿속에서 합쳐서, **축 사이에서 빠지는 것**이 안 보였다. ★**픽업 「없음」과 「뺏김」은 다르다** — 픽업 폴더는 날짜당 하나이고 파일명에 주문번호가 없어(§재작업 패널 축) 같은 날 같은 디자인을 두 번 등록하면 **나중 것이 앞 것을 덮는다**. 09-11·09-15 실측 2건이 그거였다(크기가 다른 이유는 잘려서가 아니라 **다른 등록의 파일**이라서). 크기 불일치를 전부 「잘림」으로 읽으면 없는 고장을 쫓는다.
- **축2(호스트 JSX)는 Z: 1개 교체 = 전 PC 즉시 반영** — 백업·실기기 확인 선행. `ia:deploy` 가 축2 포함 시 `--yes` 를 거부하고 **실제 터미널에서** 실기 확인을 묻는다(비대화 실행 불가).
- JSX 조기 `return` 은 반드시 `_ia_status` 설정. 미설정=에이전트가 **틀린 진단**("JSX 반환 빈값")을 UI에 띄운다.

> 축별 상세·패널 구조·배포 옵션·용량 감사 = **`/ia-automat` 스킬** · 전체 절차 정본 = `docs/DEPLOY_MANUAL.md`(**§3-A = 가공·재단 패널 배포**).

(2026-07-29: SheetLayout 폴백 수정이 exe 폴더에 미복사 → 모아찍기 판 렌더 6일간 실패. 상세 = memory `feedback-ia-jsx-runtime-path`)

### 조용한 격하 = 게이트가 「성공」으로 센다 (`npm run cut:placement`)
**폴백은 실패가 아니라 성공처럼 생겼다.** 누적 캐시·계산 규칙·IA 5축과 **같은 형태**다 — 200이 뜨고, 판이 나오고, 화면이 정상이다. 게이트가 모자란 게 아니라(개수 정본=`package.json` scripts, 2026-09-10 실측 73개) **격하를 성공으로 세고 있는** 것이다.

2026-09-04 실사고: 판 길이 상한을 배치 엔진 **밖**에 뒀는데, 그 지점을 지나는 경로가 **둘**이고 `butt.js` 는 그 제약을 지킬 **능력이 없었다**(길이 무한 전제 → 판 1장). 맞붙임이 조용히 래스터로 격하돼 칼선이 두 줄로 나갔고 — `cut:butt`(엔진 단독)·`cut:smoke`(소스 텍스트)·`cut:e2e`(판이 나오나)가 **전부 통과**했다. 셋 다 「기능이 **켜진 채로** 끝났는가」를 안 본다.

- **「했다」와 「됐다」는 다른 질문이다 — 실행 횟수로 결과를 판정하지 않는다** (2026-09-17 실기) — 도련의 클립 확장은 「클립 밖에 감춰진 그림」이 있어야 실효인데, 코드는 **넓힌 클립 개수**를 세어 성공으로 보고하고 픽셀·단색 폴백을 건너뛰었다. 배치 이미지가 클립에 딱 맞게 잘려 오면(**보통의 경우**) 클립만 커지고 도련은 0 이다 — 조각 6개 중 5개가 「클립 확장 5개(무손실)」로 보고됐는데 실물엔 도련이 없었다. **주석이 전제를 조건부로 적어 놓고(「클립 밖 데이터가 **있으면**」) 코드가 그 조건을 한 번도 검사하지 않은 것**이 형태다(`OffsetPath v22` 0.39.0 과 같다). 고치는 법 = 하기 **전에** 전제를 재고, 안 서면 **하지 않는다**(그래야 폴백으로 내려간다). 거절 수는 `clipskip=` 처럼 **센다**.
- **PC 마다 기본값이 다른 API 옵션은 명시하지 않으면 그 PC 가 정한다** (2026-09-17) — `PDFSaveOptions.viewAfterSaving` 은 **그 PC 일러의 마지막 PDF 프리셋**을 물려받는다. 켜진 PC 에서는 굳히기 PDF 저장마다 Chrome 이 떠 적용이 118.6초가 됐는데, 개발기 기본값이 `false` 라 **재현 자체가 불가능**했다([[feedback-log-encoding-per-pc]] 와 같은 축). 「한 대에서만 이상하다」가 나오면 **코드가 안 정한 값**부터 찾는다.
- **공유 지점에 제약을 걸면 그 지점을 지나는 경로를 전부 열거한다.** 못 지키는 경로가 있으면 그건 폴백이 아니라 **미완성**이다(「형제 스윕」의 배치 엔진판).
- **판정을 순수 모듈로 뺀다.** 엔진은 전부 하네스가 있는데(`butt.js`·`nesting.js`·`geometry.js`·`bleed.js` = "검증한 코드 = 배포된 코드") 「어느 엔진을 쓸까」만 2,800줄 UI 파일 안에 있었다 — 그 틈이 정확히 회귀가 지나간 자리다 → `placement.js`.
- **격하는 사유를 남기고 게이트가 그걸 센다.** 결과의 `hardenwhy=`·`placefail=`·`fast=` 는 이미 있는데 **아무도 자동으로 안 읽는다**(사람이 화면을 봐야 안다).
- **버전 주석에 「무엇을 잃나」를 한 줄.** 주석이 전부 "무엇을 고쳤나"뿐이다 — 2026-09-04 에 「맞붙임은 판을 못 나눈다」를 적었으면 거기서 걸렸다.
- **게이트는 배포 경로에 물려야 존재한다** — `cut:butt` 는 2026-08-06부터 있었는데 `ia-deploy.cjs` 의 `GATES` 에 없어 **배포 때 아무도 안 돌렸다**(2026-09-04 에 `cut:placement` 와 함께 등록).

### 4대보험 = 요율이 아니라 **기간과 가입자격**이다 (`npm run test:insurance-period`)
**요율이 맞아도 「무엇에 곱하는가」와 「그 사람이 대상인가」가 틀리면 조용히 과다공제된다.** 2026-09-17 이카운트 급여대장과 46명을 직원별로 대조해 월 **1,712,980원** 과다가 드러났다 — 요율(9.5%·7.19%·13.14%·0.9%)은 공단 고시와 **전부 일치**했다.
- **가입자격은 사람 축이다** — `insurance_apply_*` 5개 토글이 **전 직원 기본값 1**인 채 방치됐다. 대표이사·친인척(고용 제외), 60세 초과(국민연금 상실), 외국인(국적별 적용제외), 일용·단시간이 전부 공제되고 있었다. 편집 UI(`hrDetail.ts:227`)는 **처음부터 있었다** — 없어서가 아니라 **틀렸다고 말해 주는 것이 없어서** 아무도 몰랐다. → 규칙 경고(생년월일·`position`·주민번호 뒷자리·입퇴사일로 판정)를 `hrDetail.js:hrdInsuranceWarnings`가 담당한다. **새 데이터를 만들지 않고 이미 있는 컬럼만으로 판정한다.**
- **입·퇴사월은 토글로 표현할 수 없다** — 중도입사 첫 달은 미부과지만 다음 달부터는 가입이다. 토글로 끄면 영구 미공제가 된다. **상태를 속성 칸에 적지 않는다**(§누적 캐시의 「파생으로 뺀다」와 같은 축).
- **요율은 연 단위가 아니다** — 국민연금 기준소득월액 상·하한은 **매년 7월 재조정**된다. `insurance_rates`가 `UNIQUE(year, insurance_type)`이라 연 1행뿐이어서, 7월 상한 UPDATE가 **상반기 급여에 소급**됐다(6월 재계산 시 302,570 → **313,020**). `effective_from`/`effective_to`는 처음부터 있었는데 **제약이 사용을 막고 있었다**(0617에서 `UNIQUE(insurance_type, effective_from)`로 전환). 조회는 `loadInsuranceRates(db, refDate)` — 같은 보험의 여러 기간 행 중 **`effective_from DESC` 첫 행**을 쓴다(과거 연도 행이 `effective_to` NULL이어도 최신이 이긴다).
- **공단 고지와 100% 맞출 수는 없다** — 건강보험 4월 연말정산·두루누리 감면·등급 소급은 공단만 아는 값이다. 실무 정석은 *계산*이 아니라 **고지금액 그대로 공제** → 매달 **엑셀 입력**으로 대장 값을 덮는다(2026-06 은 45명 1회로 4종 전부 차이 0 달성).
- ★**순합은 상쇄된다 — 어긋남은 절대값으로 센다**: 건강보험 차이 합계 −143,580 을 「그 정도면 작다」고 읽었는데, 실제로는 **20명이 −288,480 · 19명이 +119,210 으로 서로를 지운 것**이고 어긋난 크기는 **407,690**(46명 중 39명)이었다. 방향이 갈리는 축(보수월액이 당월급여보다 높은 사람 ↔ 낮은 사람)에서 합계만 보면 **문제가 없어 보인다** — §원가 0 의 「금액순으로 고르면 ①이 항상 1등이다」와 같은 함정이다.
- **맞출 수 없는 축은 사람이 고정한다** — 공제액에 수동 오버라이드가 있다(0618 `payroll.deduction_overrides` JSON). 기존 컬럼에는 **최종값**이 들어가 집계·명세서 경로를 하나도 안 고친다. 적용 지점은 `calcDeductions` **한 곳뿐**이라 재계산(근태 불러오기)을 해도 살아남는다 — 화면은 📌 로 표시하고 해제는 전용 버튼(빈칸이 아니라 `deduction_overrides:null`). 입력은 `/payroll` **엑셀 입력**(셀 붙여넣기 TSV · 파일). 게이트 = **`test:payroll-override`**.
- ★**참조표는 「있다」가 아니라 「원본인가」를 봐야 한다** (2026-09-17) — `income_tax_table` 2026 에 **국세청 고시표가 아니라 자체 근사 산식으로 만든 900행**이 들어 있었다. 「전구간 자동생성」 버튼(`/tax-table/generate` → `calcOfficialMonthlyTax`)이 채운 값인데 **특별소득공제·특별세액공제 간주액과 연금보험료공제가 빠져 2~3배 높았다**(350만·4인 146,260 ↔ 고시표 49,340). 화면엔 "생성 완료 900행", 응답 200, 전 게이트 초록 — **§조용한 격하 그대로**다.
  - **가짜는 모양으로 드러난다** — 열 간 차이가 **정확히 18,750 고정**(=150만×15%÷12)이었다. 고시표는 특별공제 간주액 때문에 **일정할 수 없다.** 구간 폭도 고시표는 5천·1만·2만원 혼합(646행)인데 자체 표는 **1만원 균일 900행**이었다. 「값이 그럴듯한가」보다 **「형태가 산식을 닮았는가」가 먼저 보인다.**
  - ⚠️**표가 과대하면 역산이 원인을 가린다** — 처음엔 「부양가족 미입력」으로 오진했다. 표가 높으니 실측 세액에 맞추려면 열을 오른쪽으로 밀게 되어 가족수가 3~5인으로 **부풀어 그럴듯해 보였다.** 실제로는 31명 중 **23명이 본인 1인**(=기본값)이었다. 파생 추정치로 입력값을 채우기 전에 **참조표부터 의심한다.**
  - 정본 = 홈택스 → 세금신고 → 원천세 신고 → 근로소득 간이세액표 → **조견표 엑셀**(로그인 불요, **천원 단위라 ×1,000**). 넣는 길은 `/settings/payroll-rates` **CSV 임포트** 하나뿐 — 자동생성 버튼은 제거했고 엔드포인트는 `confirm_approximate:true` 없이는 거부한다.
  - **자녀세액공제는 표값에서 뺀다**(1명 20,830·2명 45,830·3명부터 +33,330/명, 2026-03-01 시행). **순서가 규정이다** — 자녀공제 먼저, 80/100/120% 는 그 뒤. 뒤집으면 홈택스 예시(49,340−45,830=3,510)가 재현되지 않는다.
- **타입체크·smoke·build 는 이걸 절대 못 잡는다** — 공제가 틀려도 200이다. 게이트 = **`test:income-tax`**(고시표 앵커·자녀공제·적용 순서 19항목) · **`test:insurance-period`**(in-memory 픽스처 24항목, `test:calc` 체인 → CI·`ship:gate`·`/deploy-verify` 전부에 물려 있다). ⚠️로컬 D1이 비면 요율 0행이라 전부 0이 나온다 — 그래서 픽스처를 심는다.

### 단가는 값이 아니라 **축**이다 (`npm run audit:unit-price-semantics` — ⚠️`--remote` 고정·실행 경로 미배선. prod 대상 **수동** 감사다)
`unit_price` 한 칸이 과금축에 따라 뜻이 다르다 — AREA=㎡단가 · FIXED=장당가 · 발주=포장당 · 재고(`avg_unit_cost`)=base단위당.
전부 「단가」라는 같은 이름으로 화면에 뜨는데 축 표기가 없다. **5번 재발**했다(`0530`·`0571`·`0572`·`0596`·100배 사고).

- **표기는 금액에서 파생한다** — 문서·목록 단가 = `round(amount ÷ quantity)`(장당가). `단가 × 수량 = 금액`이라야 거래처가 검산한다. `unit_price × 면적`을 다시 곱하지 않는 이유: 에누리·최소청구·반올림이 이미 `amount`에 있고, **저장값의 뜻이 어긋나도 표기 축은 영향을 안 받는다**. 정본 = `src/scripts/shared/displayUnitPrice.js`(게이트 `test:unit-price-display` — 산식뿐 아니라 **호출처·페이지 주입까지** 검사한다).
- **되나누기는 분모를 믿을 때만 안전하다** — `3x6`·`4x8`은 **자(尺)**가 cm로 저장된 것이다. 최소청구 1m가 있는 동안은 면적이 1㎡로 뭉개져 **멀쩡해 보였고**, UV판재가 실면적 청구로 바뀌자 분모가 0.01㎡가 되어 되나눈 값이 **정확히 100배**로 튀었다(13,930,000→**1,393,000,000원/㎡**). 안전해서 안 터진 게 아니라 **우연히 안 터지고 있었다**. 가드는 새로 만들지 말고 `routes/prices.ts` `AREA_USABLE_SQL`과 **같은 조건**을 쓴다.
- **축을 바꾸면 같은 커밋에서 환산한다** — `pricing_method`·`min_billing_side_cm`을 바꾸거나 라인을 다른 축 품목으로 옮기면 **금액이 그대로여도 단가의 뜻이 바뀐다**. `amount`는 어느 경우에도 안 건드린다(실청구액이자 이카운트 대사 기준).
- **면적 과금인지 판정하는 기준은 「규격 종류 수」다** — 최빈 비중이 아니다. 수성패트는 148종에 65%가 60×180이지만 면적이 실변수고, 거치대 완제품은 규격이 1~3종이며 **장당가가 면적을 역행**한다(워킹배너F 51×122=8,438 vs 52×103=**9,800**).
- **과금 규칙은 라인 스냅샷이다** — `order_items` 는 원래 스냅샷 테이블인데(`item_name`·`unit` 을 복사한다) `unit_price` 를 해석하는 규칙만 안 복사해서, 재계산할 때마다 `items` 를 조인해 **오늘의 축으로 과거를 다시 읽었다**. 품목 축을 한 번 건드리면 과거 주문 전량의 단가 뜻이 바뀐다(2026-09-08~09 이틀에 두 번). `0600` 이 `pricing_method`·`min_billing_side_cm` 을 라인에 넣었다 — 판정 정본 = `orders/helpers.resolveLineAxis`(라인 우선·품목은 새 라인 폴백). ⚠️`SELECT oi.*, i.pricing_method AS pricing_method` 는 **뒤가 앞을 덮는다** → `COALESCE` 필수. 견적은 처음부터 옳았다(`quotation_items.pricing_method`, `0191`).
- **축 드리프트(라인≠품목)는 결함이 아니라 결정 대기다** — ①정정(과거도 다시 읽는다) ②정책변경(과거는 그대로 둔다). 감사가 따로 세고 사람이 고른다. 스냅샷이 없던 동안은 이 질문이 불가능해 **늘 ①로 처리**됐다.
- **보이는 화면은 개수 단가만** — 두 축을 같이 띄우면 읽는 사람이 어느 쪽으로 검산할지 매번 고르게 된다. ㎡ 축은 저장·계산에만 남긴다. 주문서 입력칸만 예외(영업이 ㎡로 값을 매긴다) — 필드 밑 한 줄로 끝내고 **패널을 새로 만들지 않는다**.
- 제외분은 **조용히 빼지 않고 센다** — 감사가 「자 규격 오저장 31건 제외」를 매번 찍는다. 안 찍으면 그게 다음 사각지대다.

(상세·실측 = memory `design-unit-price-axis`)

### 원가 0 은 결함이 아닐 수 있다 — **성격을 먼저, 금액을 나중에** 본다
2026-09-10 실측에서 원가 0 라인을 **금액순으로 골라 세 번 연속 헛짚었다.** 0 에는 세 가지 뜻이 섞여 있다.
- ① **없는 게 정답** — 회계 이월·관계사 채권(197건 **5.39억**). 제품이 아니라 2025년 채권 잔액을 주문 라인으로 이관한 전표다. 품목·BOM·규격이 없는 게 정상이고 원가도 없어야 한다.
- ② **계산 불가** — 뭉친 전표(「외 N건」·`채널간판 외 사인물` 940만원 **수량 1**). 현장 공사 한 건이 한 줄이라 **가로×세로가 애초에 하나로 정해지지 않는다.** 이관 원천을 다시 받아도 없다 — 원천의 「규격」열이 담고 있는 값이 `127폭`·`60폭/50m`·`(중)`·`500파이` 다(=원단 롤 규격·등급이지 인쇄 규격이 아니다). **backfill 대상이 아니다.**
- ③ **진짜 결함** — 매입품(상품 GDS·부속 ACC·완제품 TGK/JG)인데 **엔진에 매입 축이 없다.** 원가 경로가 `BOM → 자재 소요 → 자재 단가` **하나뿐**이라 BOM 없는 품목은 무조건 0 이다. 그런데 상품·부속은 **BOM 이 없는 게 정상**이고 원가는 `items.avg_unit_cost × 수량` 이다. 매입가가 이미 있는 **519건 1.11억**은 폴백 규칙 하나로 잡힌다(나머지 47종 3.80억은 매입가부터 공백 — [[design-avg-unit-cost-fill]] 의 「34% 공백」과 같은 축).
- **금액순으로 고르면 ①이 항상 1등이다**(5.39억). 규격 없는 라인도 매출 19.8억으로 보이지만 규격이 실제 병목인 것은 **3.43억**이고 그중 복구 가능한 건 **0건**이었다.
- **건강 기준선 = 규격·BOM 둘 다 있는 라인의 원가 0 비율 0.9%**(17,954건 27.5억). 엔진은 정상이다 — 이 숫자에서 벗어난 축만 본다. 「원가가 0인 매출이 N억」은 그 자체로 아무 뜻이 없다.

### 재작업 = MES 기능 아님, 운영 규칙 (`docs/REWORK_RULES.md`)
재작업은 **개발하지 않기로 확정**(2026-08-05). 절차서 정본 = `docs/REWORK_RULES.md` — 기능을 새로 만들자는 제안 전에 이걸 읽을 것.
사고 지점은 **파일명**이고, **축부터 갈린다**(`resolveCard` 는 같은데 등록 행이 언제 생기느냐가 다르다).
- **에이전트 축**(꼬리에 `주문번호-순번`) = 등록 행을 **파일 만들 때** 쓴다 → 경로별 파일명 처리가 **정반대**다.
  새 주문이면 꼬리를 **새 주문번호로 교체**(안 하면 원 주문 카드에 출력완료가 찍혀 실적 오염), 기존 주문 유지 재출력은 **건드리면 안 된다**.
- **패널 축**(`거래처-키워드(규격)-후가공-N EA` · 주문번호 **없음**) = 등록 행을 **주문서 저장 후 흡수할 때** 쓴다(`workbench.ts`).
  꼬리에 주문번호가 없어 **교체할 게 없고, 그럴 필요도 없다** — 같은 파일명이 두 주문에 걸리면 **진행 중인 쪽**에 붙는다(`pickFileMapCandidate`).
  그래서 유상·출고 후 재작업도 **재등록(경로 A) 하나로 끝난다**(에이전트 축 경로 C에 해당하는 수작업이 없다).
  ⚠️같은 날 재등록하면 픽업 사본(`_출력\<날짜>\`)이 **같은 이름이라 덮어써진다**.

### 파일↔주문 연결 = 「붙어 있다」로 동작을 판정하면 틀린다 (2026-09-11 실측)
**배선은 고장 나 있지 않았다 — 쓸 기회가 거의 없었고, 어쩌다 붙은 한 건은 주문이 지워지며 설계대로 끊겼다.** 아래 §게이트의 「있다 vs 돈다」와 같은 형태다.
- **경로 표식이 없으면 영영 구분 못 한다** — 주문번호가 붙은 `print_events` 5,498건 중 **5,497건이 `match_method='BACKFILL_%'`**(소급 스크립트)이고 **라이브 경로로 붙은 것은 전 기간 1건**이다. 「9/4까지 붙다가 9/5에 끊겼다」는 오독 — 그 스크립트를 마지막으로 돌린 지점일 뿐이다. **새 매칭 경로를 만들면 어느 경로로 붙었는지를 행에 남긴다**(`match_method` 가 없었으면 이 구분 자체가 불가능했다).
- **0건을 결함으로 읽기 전에 그 축에 입력이 있었는지부터 센다** — `orders` 11,670건 중 11,669건의 `created_at` 이 `09:00:00`(=전량 이관)이고 주문서 화면에서 태어난 주문은 **1건**이다. `order_items.ai_group_index` 0건·흡수 링크 0건은 결함이 아니라 **채울 주체가 없었던 것**이다(§원가 0 의 「성격을 먼저」와 같은 규칙).
- **패널 축은 1차 매칭에 원리상 도달하지 못한다** — 파일명에 `주문번호-순번` 이 없으므로(§재작업) `resolveCard` 1차(order_number+file_seq)는 늘 빗나가고 **2차(file_name)만이 유일한 길**이다. 그 2차가 읽는 행은 **흡수가 넣는다**(`workbench.ts:1114`) → **흡수가 안 되면 출력완료도 안 붙는다.** 파일명 규칙을 손봐도 안 살아난다(디자이너가 주문보다 파일을 먼저 만든다).
- **끊는 코드와 되붙이는 코드는 짝이다** — `PUT /orders/:id` 는 라인 전량 교체 때 참조 3개를 NULL 로 끊는데 **짝이 있는 건 `order_ai_files` 하나뿐**이다(`update.ts:611` item_id+sort_order 재매칭, #124 규칙). `print_file_map.order_item_id`(`:385`)·`designer_intakes.order_item_id`(`:381`)는 끊고 끝이고, **카드 보존 경로(`:412`·`:414`)는 `print_file_map` 을 아예 안 건드려 죽은 id 가 그대로 남는다**(AUTOINCREMENT 라 오폭은 없지만 링크는 똑같이 죽는다). 흡수 **이력**은 존치가 맞지만 **`print_file_map` 은 이력이 아니라 동작하는 배선**이라, 주문서를 한 번 수정하면 그 파일은 카드에 영영 못 닿는다 — 읽는 쪽 역추적(`printEvents.cardIdsForOrderItems`)도 `order_item_id` 가 살아 있을 때만 돈다.
- 실증 — 9/3 intake #485 흡수 1초 뒤 `print_file_map` 에 `order_item_id=24388` 이 학습됐고, 그 주문이 삭제되며 끊겼다. **absorbed 32건이 전부 `order_item_id IS NULL` 인 것은 "한 번도 안 걸렸다"는 뜻이 아니다.**
- 게이트 = **`npm run test:print-match`**(출력 이벤트가 카드까지 닿는가·서버 기동 필요). ⚠️**만들어 놓고 어떤 실행 경로에도 안 물렸다**(2026-09-11 — 같은 날 같은 문서에 「게이트는 배포 경로에 물려야 존재한다」를 적으면서 그랬다). 아래 §「사람이 부를 때만 돈다」 목록에 있다.

### 로컬 검증 실패를 「무효」로 단정하면 멀쩡한 사용자를 쫓아낸다 (`npm run audit:jwt-decode`)
**「확인 못 했다」와 「틀렸다」는 다른 값이다.** 2026-09-17 실기: 로그인 API 는 **200** 이고 토큰도 발급됐는데 다음 화면에서 조용히 로그아웃돼, 증상이 「로그인했는데 바로 로그인창으로 되돌아온다」였다.
- 원인 = `shell.js` 의 로컬 exp 체크가 `atob(parts[1])` 로 JWT 를 깠다. **JWT 는 base64url**(`-`·`_`·패딩 없음)이고 `atob` 은 표준 base64 만 받는다. 게다가 이 시스템 페이로드에는 **한글 사용자명**이 들어간다(`"username":"인호동"`) → 바이트에 따라 `InvalidCharacterError` 로 **던진다**. 그 예외를 catch 가 「손상된 토큰」으로 읽고 **토큰을 지우고 `/login` 으로 보냈다**(화면엔 `console.warn` 뿐).
- **`exp` 가 로그인마다 달라 페이로드 바이트가 바뀐다 → 같은 사람도 될 때가 있고 안 될 때가 있다.** 「가끔 된다」는 대개 **입력에 따라 갈리는 디코딩·파싱**이지 서버 상태가 아니다.
- **고치는 자리는 두 곳이다** — ①디코더를 제대로(base64url+패딩+UTF-8, 실패 시 **null 반환·던지지 않음**) ②**실패의 뜻을 바꾼다**: 로컬 체크는 서버 왕복을 아끼는 **최적화**이므로 못 읽었을 때의 정답은 「모르겠으니 서버에게 묻는다」다. 진짜 무효면 첫 API 401 인터셉터가 같은 일을 한다. ①만 고치면 다음 인코딩 함정에서 같은 사고가 난다.
- 정본 = `shell.js mesJwtPayload()`. 당시 손으로 까는 자리가 **7곳**이었고 정확도가 제각각이었다(생짜 3 · 패딩만 치환 3). 게이트 = **`npm run audit:jwt-decode`**(CI `deploy.yml` · `ship:gate` 배선 · 자가시험으로 발화 확인).
- ⚠️**증언과 데이터가 어긋나 보이면 증언이 가리키는 단계부터 맞춘다** — 「아무 말 없이 돌아갔다」면 로그인 API 는 **성공**한 것이라 `last_login_at` 기록과 **일치**한다. 나는 그걸 「재현 안 됨」으로 적었고, 그 직전에 **내 손에서 같은 `InvalidCharacterError` 가 났는데** 연결하지 못했다.

### 배포를 실제로 막는 게이트 (2026-09-10 실측)
**「게이트가 있다」와 「게이트가 돈다」는 다른 질문이다.** `cut:butt` 는 2026-08-06부터 있었는데 한 달간 아무도 안 돌렸고, `cut:shellsync` 도 같은 상태였다(2026-09-10 등록) — **목록이 없어서 아무도 그걸 몰랐다.**
- **CI**(push→main, `.github/workflows/deploy.yml`): tsc · **`check:fn`**(selftest+strict) · **`audit:jwt-decode`** · build · `test:calc` · `entity-audit.mjs` · `audit:migration-number`(#639 같은 번호·같은 테이블 DDL 충돌만 차단) · `canary:write:ci` · `smoke.cjs`(prod)
- **커밋 훅**(`pretooluse-bash.cjs`): tsc(전건 차단) · `skill-audit`·`hook-guard-selftest`·`doc-diet-audit`·**`audit:empty-catch`**·**`check:fn`**(해당 파일이 dirty 인 커밋만 — `check:fn` 은 src/**)
- **편집 훅**(`posttooluse-edit.cjs`): `node --check`(src/scripts/*.js) · `check:dom` 기준선 회귀 · **`check:fn`**(src/**.ts·js — 미정의 전역 함수 호출, 기준선 없음) · **`audit:empty-catch`**(IllustratorAutomat/**.jsx·js — 사유 `ignore:` 없는 빈 catch) — 넷 다 `exit 2` 차단
- **`ia:deploy`**(`ia-deploy.cjs` `GATES`): **audit:empty-catch** · cut:bleed · cut:nest · cut:butt · cut:placement · cut:smoke · **cut:shellsync** · panel:smoke · cut:e2e + ia-jsx 드리프트 (⚠️`test:outcopy` 는 2026-09-15 **하루 만에 은퇴** — 지키던 코드가 에이전트로 넘어갔다. **없어진 코드를 지키는 게이트는 초록불이 아무 뜻도 없다** → 성질은 `panel:smoke` §13 으로 옮겨 실었다)
- **`ship:gate`**: verify(tsc+build) · **check:fn** · **audit:jwt-decode** · entity-audit · **test:calc** · canary:write · **journey:gate**(J0~J7 40단계, 로컬 서버 자동 기동·≈4.5분, `SKIP_JOURNEY=1` 로만 명시 건너뜀) · **`test:local-e2e`**(서버가 필요한 4종을 journey 뒤에 묶어 세운다 — symmetry·ship-stock·autodeduct·print-match. 같은 `SKIP_JOURNEY=1` 로 함께 건너뛴다)
- **`/deploy-verify`**: Phase 1 tsc·build·**test:calc**·**journey:gate** → Phase 2 entity-audit → Phase 2-B `audit:migration-drift`(스키마 변경 시) → Phase 4 `smoke:prod`
> ⚠️`verify.yml` 은 `on: pull_request` 다 — 이 프로젝트(main 직접 push)에서는 **생성 이래 0회 실행**.
> ⚠️여기 **없는** 감사는 사람이 부를 때만 돈다: `sort-audit` · `audit:query-cost` · `audit:subquery` · `audit:unit-price-semantics` · `audit:migration-drift` · `audit:stock-ledger` · `cut:quality`. (`test:symmetry`·`test:ship-stock`·`test:autodeduct`·`test:print-match` 는 2026-09-14 `test:local-e2e` 로 묶여 `ship:gate` 에 편입 — 그전까지 넷 다 미배선이었고, `test:print-match` 는 **빨간 채로** 있었다.) (`test:journey` 는 2026-09-11 `ship:gate`·`/deploy-verify` 에 편입 — 정본=`/journey-loop`, 한 사이클=`npm run journey:cycle`.)
> **게이트를 새로 만들면 이 목록에 줄을 추가한다. 추가할 자리가 없으면 그건 게이트가 아니라 스크립트다.**

> 사업 도메인·역할·아키텍처·에이전트 팀·참조 문서 → `.claude/references/project-context.md`
> **단일 소스 원칙**: 참조 파일에 코드 값 복사 금지. 구조 변경 시 참조 파일도 동기 업데이트.
