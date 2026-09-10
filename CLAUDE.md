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

### 마이그레이션 번호는 유일하지 않다
`migrations/` 에 **같은 4자리 번호가 20쌍** 있다 — `0080`·`0193`·`0327`·`0412`·`0416`·`0420`·`0453`·`0555`·`0563`·`0569`·`0570`·`0576`·`0577`·`0578`·`0579`·`0580`·`0584`·`0585`·`0587`·`0596`. 병렬 worktree 세션이 각자 다음 번호를 딴 결과다.
- **문서·메모리가 번호만으로 지목하면 어느 쪽인지 알 수 없다** — `0596` = `0596_fix_unit_price_semantics.sql` + `0596_qm6_loan.sql` 이다. 번호를 쓸 때는 **파일명을 병기**한다.
- 적용 순서는 번호가 아니라 **전체 파일명 사전순**이다. 같은 번호 둘의 선후는 뒷부분 이름이 정한다 — 의존이 있으면 번호를 다시 딴다.
- **wrangler 는 번호가 아니라 전체 파일명으로 추적한다**(`d1_migrations.name`). 이미 prod 에 적용된 파일을 **재번호하면 그 마이그레이션이 한 번 더 실행된다** — 다른 브랜치에서 회수할 때 파일명을 보존해야 하는 이유다.
- 게이트 없음(미구현). 새 마이그레이션을 만들 때 `ls migrations/ | cut -c1-4 | sort | uniq -d` 로 직접 확인.

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
- **게이트 = `npm run test:calc`** — **26항목 체인, 목록 정본=`package.json`**(청구면적 `test:orderline`·마감표기 `test:finishing-label`·파일규격 `test:file-dims`·여신 `test:credit`·품목중복 `audit:items:selftest` 외 21개). **`deploy.yml`(CI) · `ship:gate`(/ship) · `/deploy-verify` Phase 1 세 경로 전부가 배포 전에 돌린다**(2026-08-25 CI 신설 → 2026-09-10 나머지 둘 편입. 그전엔 로컬 `deploy:prod` 로 내보내면 이 게이트가 배포를 못 막고 **이미 나간 뒤** CI 실패로만 드러났다).
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
- **축2(호스트 JSX)는 Z: 1개 교체 = 전 PC 즉시 반영** — 백업·실기기 확인 선행. `ia:deploy` 가 축2 포함 시 `--yes` 를 거부하고 **실제 터미널에서** 실기 확인을 묻는다(비대화 실행 불가).
- JSX 조기 `return` 은 반드시 `_ia_status` 설정. 미설정=에이전트가 **틀린 진단**("JSX 반환 빈값")을 UI에 띄운다.

> 축별 상세·패널 구조·배포 옵션·용량 감사 = **`/ia-automat` 스킬** · 전체 절차 정본 = `docs/DEPLOY_MANUAL.md`(**§3-A = 가공·재단 패널 배포**).

(2026-07-29: SheetLayout 폴백 수정이 exe 폴더에 미복사 → 모아찍기 판 렌더 6일간 실패. 상세 = memory `feedback-ia-jsx-runtime-path`)

### 조용한 격하 = 게이트가 「성공」으로 센다 (`npm run cut:placement`)
**폴백은 실패가 아니라 성공처럼 생겼다.** 누적 캐시·계산 규칙·IA 5축과 **같은 형태**다 — 200이 뜨고, 판이 나오고, 화면이 정상이다. 게이트가 모자란 게 아니라(개수 정본=`package.json` scripts, 2026-09-10 실측 73개) **격하를 성공으로 세고 있는** 것이다.

2026-09-04 실사고: 판 길이 상한을 배치 엔진 **밖**에 뒀는데, 그 지점을 지나는 경로가 **둘**이고 `butt.js` 는 그 제약을 지킬 **능력이 없었다**(길이 무한 전제 → 판 1장). 맞붙임이 조용히 래스터로 격하돼 칼선이 두 줄로 나갔고 — `cut:butt`(엔진 단독)·`cut:smoke`(소스 텍스트)·`cut:e2e`(판이 나오나)가 **전부 통과**했다. 셋 다 「기능이 **켜진 채로** 끝났는가」를 안 본다.

- **공유 지점에 제약을 걸면 그 지점을 지나는 경로를 전부 열거한다.** 못 지키는 경로가 있으면 그건 폴백이 아니라 **미완성**이다(「형제 스윕」의 배치 엔진판).
- **판정을 순수 모듈로 뺀다.** 엔진은 전부 하네스가 있는데(`butt.js`·`nesting.js`·`geometry.js`·`bleed.js` = "검증한 코드 = 배포된 코드") 「어느 엔진을 쓸까」만 2,800줄 UI 파일 안에 있었다 — 그 틈이 정확히 회귀가 지나간 자리다 → `placement.js`.
- **격하는 사유를 남기고 게이트가 그걸 센다.** 결과의 `hardenwhy=`·`placefail=`·`fast=` 는 이미 있는데 **아무도 자동으로 안 읽는다**(사람이 화면을 봐야 안다).
- **버전 주석에 「무엇을 잃나」를 한 줄.** 주석이 전부 "무엇을 고쳤나"뿐이다 — 2026-09-04 에 「맞붙임은 판을 못 나눈다」를 적었으면 거기서 걸렸다.
- **게이트는 배포 경로에 물려야 존재한다** — `cut:butt` 는 2026-08-06부터 있었는데 `ia-deploy.cjs` 의 `GATES` 에 없어 **배포 때 아무도 안 돌렸다**(2026-09-04 에 `cut:placement` 와 함께 등록).

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

### 재작업 = MES 기능 아님, 운영 규칙 (`docs/REWORK_RULES.md`)
재작업은 **개발하지 않기로 확정**(2026-08-05). 절차서 정본 = `docs/REWORK_RULES.md` — 기능을 새로 만들자는 제안 전에 이걸 읽을 것.
사고 지점은 **파일명**이고, **축부터 갈린다**(`resolveCard` 는 같은데 등록 행이 언제 생기느냐가 다르다).
- **에이전트 축**(꼬리에 `주문번호-순번`) = 등록 행을 **파일 만들 때** 쓴다 → 경로별 파일명 처리가 **정반대**다.
  새 주문이면 꼬리를 **새 주문번호로 교체**(안 하면 원 주문 카드에 출력완료가 찍혀 실적 오염), 기존 주문 유지 재출력은 **건드리면 안 된다**.
- **패널 축**(`거래처-키워드(규격)-후가공-N EA` · 주문번호 **없음**) = 등록 행을 **주문서 저장 후 흡수할 때** 쓴다(`workbench.ts`).
  꼬리에 주문번호가 없어 **교체할 게 없고, 그럴 필요도 없다** — 같은 파일명이 두 주문에 걸리면 **진행 중인 쪽**에 붙는다(`pickFileMapCandidate`).
  그래서 유상·출고 후 재작업도 **재등록(경로 A) 하나로 끝난다**(에이전트 축 경로 C에 해당하는 수작업이 없다).
  ⚠️같은 날 재등록하면 픽업 사본(`_출력\<날짜>\`)이 **같은 이름이라 덮어써진다**.

### 배포를 실제로 막는 게이트 (2026-09-10 실측)
**「게이트가 있다」와 「게이트가 돈다」는 다른 질문이다.** `cut:butt` 는 2026-08-06부터 있었는데 한 달간 아무도 안 돌렸고, `cut:shellsync` 도 같은 상태였다(2026-09-10 등록) — **목록이 없어서 아무도 그걸 몰랐다.**
- **CI**(push→main, `.github/workflows/deploy.yml`): tsc · build · `test:calc` · `entity-audit.mjs` · `canary:write:ci` · `smoke.cjs`(prod)
- **커밋 훅**(`pretooluse-bash.cjs`): tsc(전건 차단) · `skill-audit`·`hook-guard-selftest`·`doc-diet-audit`(해당 파일이 dirty 인 커밋만)
- **편집 훅**(`posttooluse-edit.cjs`): `node --check`(src/scripts/*.js) · `check:dom` 기준선 회귀 — 둘 다 `exit 2` 차단
- **`ia:deploy`**(`ia-deploy.cjs` `GATES`): cut:bleed · cut:nest · cut:butt · cut:placement · cut:smoke · **cut:shellsync** · panel:smoke · cut:e2e + ia-jsx 드리프트
- **`ship:gate`**: verify(tsc+build) · entity-audit · **test:calc** · canary:write
- **`/deploy-verify`**: Phase 1 tsc·build·**test:calc** → Phase 2 entity-audit → Phase 2-B `audit:migration-drift`(스키마 변경 시) → Phase 4 `smoke:prod`
> ⚠️`verify.yml` 은 `on: pull_request` 다 — 이 프로젝트(main 직접 push)에서는 **생성 이래 0회 실행**.
> ⚠️여기 **없는** 감사는 사람이 부를 때만 돈다: `sort-audit` · `audit:query-cost` · `audit:subquery` · `audit:unit-price-semantics` · `audit:migration-drift` · `audit:stock-ledger` · `test:symmetry` · `test:ship-stock` · `test:autodeduct` · `cut:quality`.
> **게이트를 새로 만들면 이 목록에 줄을 추가한다. 추가할 자리가 없으면 그건 게이트가 아니라 스크립트다.**

> 사업 도메인·역할·아키텍처·에이전트 팀·참조 문서 → `.claude/references/project-context.md`
> **단일 소스 원칙**: 참조 파일에 코드 값 복사 금지. 구조 변경 시 참조 파일도 동기 업데이트.
