# 세션 핸드오프 — 2026-08-11 문서 다이어트·브랜치 대청소 + 진행중 5건 착수 준비

> 이 파일은 세션마다 덮어쓴다. 직전 = 주문서 트랙 #73~#77(ARCHIVE 참조).

## 이 세션이 한 것

1. **문서 다이어트**: 현황판 90K→4.6K자·MEMORY 19K→11K자. 완료 전문=ARCHIVE·훅 1줄 원칙. 게이트=`node scripts/doc-diet-audit.cjs`(posttooluse+sessionstart 훅 연동, 현황판 25K·MEMORY 15K 한도). 보류함 신설(필요성 재확인 전 착수 금지).
2. **브랜치 대청소**: 원격 129개(peaceful-ride 97·auto-improve 24·session/feat 8)·로컬 10개 삭제. **삭제 전 SHA 전량 = ARCHIVE 말미 목록(복구: `git branch <이름> <SHA>`)**. 잔존 = `main` · `session/date-filter`(활성 worktree) · **로컬 feat 3종(dept-pnl·neostampa-rip·price-sheet-delivery) = 의도 보존** — EPSON 파서 커밋 `89097982`+RIP 코드가 여기에만 있음. main 흡수 확인 후 삭제 판단.
3. **진행중 5건 실측 점검**: ★S4(08-05)가 `/ia-editor` 페이지·스크립트 삭제(모아찍기는 `routes/workbench.ts` 생존) · 편집중 잠금(iaEditor.js) 무효 해제 · 간판 BOM 1차 완결 반영.

## 다음 세션 착수 — 진행중 5건 (골라서 바로 시작)

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
- **주의**: 간판 *자재*는 이미 등록됨(0421/0422, 157품목) — 새로 만들지 말 것. 신규 프레임 이상치 잔여. 신규 구조라 brainstorming 스킬 선행.

### ⑤ LogWatcher 후속 (외부 확인 1개 + 소품)
- **다음 단계**: EPSON PC `Data.db`에서 `SELECT JobStatus,COUNT(*) FROM Job GROUP BY JobStatus` → enum 확정 → status-aware 파서 완성(equipment.json 매핑) → EPSON 2대 재배포.
- **착수 지점**: ★파서 커밋 `89097982`는 **main 미포함 — 로컬 feat 브랜치 3종에만 있음**(위 보존 사유). 현장키트 `Z:\Designs\LogWatcher-kit`. 메모리 [[project-logwatcher-rollout]].
- **부수**: 이희섭 6/8 출근펀치 1건 · 6월 선명 급여 재계산 필요(생성돼 있으면 「근태 불러오기」 재실행).

## 직전 주문서 트랙 잔류 주의사항 (압축 승계)

- 왕복감사 `npm run audit:orderform-roundtrip` = **로컬 전용**(prod 금지 — 주문 채번 소비). 주문서 복원/저장 경로 수정 시 게이트로.
- 셀렉트 복원 규칙: 옵션에 없는 저장값은 **'(이전값)' 동적 옵션**으로 유지('' → 서버 기본값 무음 치환). `onDeliveryMethodChange()`는 시간 복원 **앞**에.
- `GET /api/orders/:id` 핸들러는 **둘**(`core.ts:324` 정본 · `/:id/invoice`) — items 쿼리 수정 시 둘 다.
- PUT=라인 delete+reinsert → 폼이 복원 안 하는 필드는 소실. 복원 수정 시 형제(복사·견적 프리필) 스윕.

## 검증 명령

```powershell
npm run verify                        # typecheck + build
npm run smoke                         # 로컬 110개 (dev:d1 필요)
npm run audit:entity ; node scripts/sort-audit.cjs
node scripts/doc-diet-audit.cjs       # 문서 비대화 게이트
```
