# 세션 핸드오프 — 2026-08-11 스킬·위임 구성 점검 + auto-improve 분해

> 이 파일은 세션마다 덮어쓴다. 단 **§진행중 5건·§주문서 잔류주의는 이전 세션 승계분이고 아직 유효**하다
> (현황판이 이 파일을 그 5건의 착수 핸드오프로 가리킨다) — 지우지 말고 이어서 쓸 것.

## 이 세션이 한 것 (`01bc5f29` → 병합 `16296f10`, push 완료)

1. **스킬 18개·위임 구성을 공식 스펙과 대조**. 로컬에 깔린 Anthropic 공식 플러그인 `skill-creator`의
   검증기를 그대로 돌리고, `code.claude.com/docs` 의 skills·sub-agents 문서를 직접 받아 수치를 확인했다.
   결과: frontmatter 유효성 문제 없음. description 합계 2,280자로 목록 예산도 여유.
2. **`auto-improve/SKILL.md` 분해** — 127,153자/519줄/~57,000토큰 → **7,052자/232줄/~3,387토큰**.
   Areas 1~6 을 `references/area-N-*.md` 로 **축자** 이관. 실행 워크플로우 2단계에 "그 사이클 영역 파일만
   읽는다"를 명시(안 적으면 항목을 모른 채 겉핥기로 돈다).
3. **게이트 `npm run audit:skills` 신설**(`scripts/skill-audit.cjs`, Edit/Write 훅 연동, 경고만·차단 안 함).
4. `agent-team-guide.md` **§스킬 설계 규칙 신설** + Agent Teams 모드 + `effort` 레버. CLAUDE.md 에 1줄 훅.

## 결정과 이유 (재검토 시 이 근거부터)

- **왜 급했나**: 공식 문서상 자동압축은 스킬당 **앞 5,000토큰만** 재첨부한다(재첨부 전체 공동예산 25,000).
  auto-improve 는 ~57,000토큰이라 **압축 때마다 뒤 91%가 경고 없이 사라졌다.** Area 6 자기진화가 배운 것을
  본문에 덧붙이는 구조라 8KB(05-11)→197KB(08-07) 24배로 자랐고, `doc-diet-audit` 은 현황판·MEMORY 만 봐서
  **스킬은 감사망 밖**이었다. 현황판 90K자 사고와 같은 형태의 재발.
- **손으로 안 옮기고 기계 분할한 이유**: 12만 자를 옮겨 적으면 유실을 눈으로 못 잡는다. 경계 기준으로 자른 뒤
  **git HEAD 원본과 줄 단위 대조로 유실 0을 증명**했다. 커밋 후에도 한 번 더 대조함.
- **★라인참조 앵커 변환은 착수했다가 철회했다**: 내부 `line N` 상호참조 29건을 `【L###】` 앵커로 바꾸려 했는데,
  검증 중 **대상 23개 중 5개가 빈 줄**을, 여럿이 인용 문맥과 무관한 줄을 가리키는 걸 발견했다. 파일이 자라며
  번호가 밀린 것 — **분할 이전부터 이미 깨져 있었다.** 오늘 기준으로 앵커를 박으면 틀린 포인터를 정본으로
  굳히게 된다. 판단기준 = **"원문 보존 > 그럴듯한 복원"**. 각 Area 파일 머리에 경고만 달고 원문 그대로 뒀다.
- **커스텀 서브에이전트 0개 결정은 유지**하되, 근거 하나가 무효가 된 걸 가이드에 기록했다 —
  "독립 컨텍스트라 도메인 맥락을 잃는다"가 이유였는데 지금은 서브에이전트에 `skills:`(스킬 본문 주입)·
  `memory:`(세션 간 영속)가 있다. 맥락 손실은 구조적 제약이 아니라 설정 누락 → 다음에 이 이유는 못 쓴다.

## 이 트랙의 다음 단계 (우선순위순)

1. **Area 파일 `line N` 참조 29건 → 서술 기반 참조로 교체.** 전량을 한 번에 하지 말 것 —
   6개 Area 본문을 깊게 읽어야 한다. **사이클이 그 Area 를 방문할 때 그 파일만** 손보는 게 비용 대비 낫다.
2. **트리거 낱말 중복 정리**: 「검증」6개·「배포」6개·「확인」5개·「점검」4개 스킬이 겹치는데 배제 문구가 없다
   (`audit:skills` 가 매번 목록으로 알려준다). 겹치는 쪽 description 에 "~는 X 스킬" 한 구절씩.
3. **`context: fork` 도입 검토**: 결과만 필요한 무거운 읽기 스킬(`auto-scan`·`qa-audit`·`security-audit`·
   `entity-audit`)을 격리 컨텍스트로. **선언적**이라 "인라인 우선·과다위임 억제" 원칙과 충돌하지 않는다.
4. `audit:skills` 를 `ship:gate`/`deploy-verify` 에 넣을지 판단(지금은 훅 경고만 — 배포를 막을 성질인지 미결).

## 주의 (이 세션에서 실제로 밟은 것)

- **★push 전 `git fetch origin main` 필수.** auto-improve 봇이 origin/main 에 주기적으로 push 한다.
  이번에도 `f8700be0`(Area 6 사이클, 백로그 트림)이 먼저 올라와 있었다 — 확인 없이 밀었으면 롤백됐다.
  다행히 봇은 `IMPROVEMENT_BACKLOG*.md` 만 건드려 `SKILL.md` 충돌 없음. 분기 시 `git merge origin/main` 후 진행.
- **세션 종료 시점 워킹트리에 타 세션 WIP 있음**: `src/pages/production.ts`·`src/scripts/production.js` 수정 +
  `src/services/budgetAlert.ts` 미추적. **내 것 아니므로 커밋하지 않았다.** `deploy:prod` 는 워킹트리 전체를
  빌드하니 배포 전 `git status` 대조 필수.
- 스킬을 고친 뒤에는 `npm run audit:skills` — 안 돌리면 한도 초과분이 조용히 잘린 채로 돈다.
- 누적 지식은 **SKILL.md 본문이 아니라 `references/`** 로. 본문에 덧붙이면 24배 비대화가 그대로 재발한다.

---

## 다음 세션 착수 — 진행중 5건 (이전 세션 승계, 아직 유효)

### ① 동산 이카운트 이관 Phase 1 (데이터, 코드 변경 0)
- **다음 단계**: 세부점검 4종(ⓐ거래처 미등록 목록 ⓑ품목 매칭률+신규 후보 ⓒ월별 금액 대사 ⓓ법인간거래 중복) → 용준님 승인 → 적재.
- **착수 지점**: `docs/dongsan-import/EXPORT-SPEC.md`(스펙·레시피·함정 정본) + 원천 `품목마스터/원천주문데이터/` 9개 파일. Phase 0에서 3중 교차검증 오차 0·코드 커버리지 100%(BRN 매칭).
- **주의**: 롤백 마커는 세션별 분리(공유 시 상반기까지 삭제 사고 전례) · 은행연동 중복=총액검산 불가, 건별 대조 · 매입은 ⏸보류(범위 아님). 메모리 [[project-dongsan-ecount-import]].

### ② IA 멀티소스 임포지션 P4 (에이전트 축)
- **다음 단계**: 에이전트 EPS 실저장 + preview_only 실렌더 publish. 로컬 데모는 큐만 쌓임(에이전트 기동+실파일 필요).
- **착수 지점**: 웹=`routes/workbench.ts`(★`/ia-editor`는 S4에서 삭제됨 — 옛 기록의 iaEditor.js 참조는 무시). 에이전트=`IllustratorAutomat`(축1: 빌드 시 자동복사, 재빌드+재기동 필요). spec `2026-07-08-ia-editor-multisource-imposition.md`.
- **주의**: 재기동 절차 = `tasks AI_PROCESS PENDING/PROCESSING` 큐 유휴 확인 → Stop → `dotnet build -c Release` → Start(전례 #75·#77).

### ③ 분할청구 P5-continued (코드)
- **다음 단계**: 잔여 ~6파일 그룹화 → 전량검증 → 레거시 컬럼 제거(`orders.billing_status`/`billed_*`) → `clients.balance`/recalculate 정리. P6 내부정산은 다법인 실거래 발생 후.
- **착수 지점**: `docs/superpowers/specs/2026-06-10-split-billing-IMPLEMENTATION-PLAN.md`(변환 패턴 포함).
- **주의**: legacy 컬럼 참조 **319곳/36파일 실측(08-10)** — 제거 전 전수 검증 필수. D1은 FK 컬럼 제거 불가 → 재빌드 마이그 시 `audit:migration-drift` 게이트. 메모리 [[design-split-billing]].

### ④ 간판 2차 조립견적 (설계→구현, brainstorming 먼저)
- **다음 단계**: 구성요소 전수 확정 → 조립 견적 구조(calc_type 4종: FIXED/PER_QTY/BY_SIZE/BY_SPEC_QTY) 구현.
- **착수 지점**: spec `2026-06-13-signage-component-estimate-structure` + 1차 BOM 완결 기반(메모리 [[design-sign-bom]] — 8종·24행·LED 62/㎡ 실측 보정).

### ⑤ LogWatcher 후속 (외부 확인 1개 + 소품)
- **다음 단계**: EPSON PC `Data.db`에서 `SELECT JobStatus,COUNT(*) FROM Job GROUP BY JobStatus` → enum 확정 → status-aware 파서 완성(equipment.json 매핑) → EPSON 2대 재배포.
- **착수 지점**: ★파서 커밋 `89097982`는 **main 미포함 — 로컬 feat 브랜치 3종에만 있음**(보존 사유). 현장키트 `Z:\Designs\LogWatcher-kit`. 메모리 [[project-logwatcher-rollout]].
- **부수**: 이희섭 6/8 출근펀치 1건 · 6월 선명 급여 재계산 필요(생성돼 있으면 「근태 불러오기」 재실행).

## 직전 주문서 트랙 잔류 주의사항 (압축 승계)

- 왕복감사 `npm run audit:orderform-roundtrip` = **로컬 전용**(prod 금지 — 주문 채번 소비). 주문서 복원/저장 경로 수정 시 게이트로.
- 셀렉트 복원 규칙: 옵션에 없는 저장값은 **'(이전값)' 동적 옵션**으로 유지('' → 서버 기본값 무음 치환). `onDeliveryMethodChange()`는 시간 복원 **앞**에.
- `GET /api/orders/:id` 핸들러는 **둘**(`core.ts:324` 정본 · `/:id/invoice`) — items 쿼리 수정 시 둘 다.
- PUT=라인 delete+reinsert → 폼이 복원 안 하는 필드는 소실. 복원 수정 시 형제(복사·견적 프리필) 스윕.

## 검증 명령

```powershell
npm run verify                        # typecheck + build  (※타 세션 dev:d1 중이면 dist 덮어씀 주의)
npx tsc --noEmit                      # 쓰기 없는 타입체크 (워킹트리 공유 시 이쪽)
npm run smoke                         # 로컬 110개 (dev:d1 필요)
npm run audit:entity ; node scripts/sort-audit.cjs
node scripts/doc-diet-audit.cjs       # 문서 비대화 게이트
npm run audit:skills                  # 스킬·서브에이전트 정의 게이트 (2026-08-11 신설)
```
