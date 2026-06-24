---
name: ship
description: "에이전트 팀 자동 배포 파이프라인. 한 세션에서 여러 작업(자유 텍스트 리스트)을 받아 병렬 구현→결정론적 하드게이트→prod 자동배포→Playwright 검증→실패 시 자동 롤백까지 수행. 트리거: '이거 처리해줘'(작업 여러 개 나열), '배치 처리', 'ship', '자동 배포', 'A 하고 B 하고 C 해서 배포'. 단일 작업 단순 수정엔 과함 — 2개 이상 작업을 묶어 배포까지 갈 때 사용."
---

# /ship — 에이전트 팀 자동 배포 파이프라인

여러 작업을 한 세션에서 받아 **구현 → 검증 → prod 배포 → 검증 → 롤백**까지 자율 수행.
자율 경계 = **prod까지 완전 자동** (용준님 결정 2026-06-24). 사람 게이트 대신 **파이프라인에 하드게이트 내장** + 실패 시 자동 롤백.

> ⚠️ **첫 실전 실행은 감독하에**. 게이트 로직이 신뢰됨을 1~2회 확인한 뒤 완전 무인 신뢰.
> 전제: SessionStart 배너 `[HOOK ✓]`가 보여야 함(= 안전 게이트 살아있음). 안 보이면 `.claude/hooks/` 훅 런타임 점검 먼저.

## 입력

자유 텍스트 작업 리스트. 예: `"#440 고치고, 거래처 상세 청구그룹 404 고치고, /bank 미수금 라벨 바꿔서 배포해줘"`.
GitHub 이슈 번호·자연어 혼용 허용. 먼저 **작업을 파싱해 번호 매긴 목록으로 사용자에게 1줄 확인**(오해 방지) 후 진행.

## 파이프라인

### Phase 0 — 분해 & 영향 추론 (CLAUDE.md 작업 원칙)
- 각 작업의 진짜 목적·연쇄 영향 파악. 모호하면 즉시 질문(가/나/다).
- **독립성 판정**: 작업들이 **서로 다른 파일**을 건드리면 병렬, **겹치면** 순차.
- 신규 기능·구조 변경 포함 시 해당 작업만 brainstorming 먼저.

### Phase 1 — 구현
- **독립 작업 다수(3+)**: `Workflow`로 fan-out. 작업당 1 에이전트, 파일 충돌 위험 시 `isolation:"worktree"`. dispatch 프롬프트에 도메인 불변식 포함(`.claude/references/agent-team-guide.md` §dispatch 필수 포함사항: entity_id INSERT·0값 `??`·전역함수·라우트 목록/stats/count/badge·typecheck).
- **소수/겹침 작업**: 메인 루프가 순차 구현.
- 각 작업 구현 직후 그 변경에 대해 `/review-checklist` 관점 자가검토.
- PostToolUse 훅이 JS문법·DOM회귀·라우트 entity 리마인더를 자동 발동(신뢰).

### Phase 2 — 결정론적 하드게이트 (배포 전 필수 통과)
```bash
npm run ship:gate
```
= `verify`(tsc+build) → `entity-audit` → `canary:write`(로컬 D1 write 회귀).
**하나라도 비-0 종료 시 배포 중단.** 실패 항목 + 수정안 보고 후 정지. **절대 게이트 우회 금지.**
> dom 참조 회귀·JS문법은 이미 per-edit 훅이 차단. 타입체크는 커밋 훅도 이중 차단.

### Phase 3 — 배포 (게이트 green일 때만)
```bash
# 배포 직전 현재 라이브 배포 ID 기록 (롤백 대비)
npx wrangler pages deployment list --project-name webapp | Select-Object -First 5   # 최신 = 현재 live
npm run deploy:prod   # = build + wrangler pages deploy --branch main --commit-message prod-deploy (apex 반영 내장)
```
- 한글 커밋메시지 금지(deploy:prod은 ASCII 고정 — [[feedback-windows-deploy]]).
- 배포 후 CDN 갱신 ~5초 대기.

### Phase 4 — 프로덕션 실검증 (Playwright MCP)
배포된 apex(`https://webapp-9i0.pages.dev`)에서:
1. 신규 API가 **401(인증요구)** 반환(404 아님) — apex 반영 확인 마커.
2. 핵심 페이지 로드(변경 영향 페이지 우선 + `/dashboard`·`/orders`·`/cards`·`/bank`·변경 관련).
3. 변경된 기능 **실인터랙션** 검증(스크린샷 아닌 클릭/입력/응답, `/verify-changes` 방식).
4. 콘솔 error 0 확인(로그인 전 `/auth/me` 401은 정상).

### Phase 5 — 자동 롤백 (Phase 4 실패 시)
prod 검증 실패(페이지 깨짐·API 500·핵심 인터랙션 실패) 시 **즉시**:
- Cloudflare 대시보드 또는 `wrangler pages deployment`로 **Phase 3에서 기록한 직전 배포로 롤백**(재배포: 직전 good 커밋 체크아웃→`deploy:prod`, 또는 CF Pages rollback).
- 롤백 후 apex 재검증 → 사용자에게 **무엇이 왜 실패했고 롤백했는지** 보고. 자동 재시도 금지(원인 파악 우선).

### Phase 6 — 보고 & 기록
```
/ship 결과
━━━━━━━━━━━━━━━━━━
작업: N건 (완료 M / 차단 K)
게이트: PASS / FAIL(항목)
배포: dep <id> / 미배포(게이트차단) / 롤백(<직전 id>)
prod 검증: 페이지 P/Q · API 정상 · 콘솔에러 C
━━━━━━━━━━━━━━━━━━
```
- 성공 시: `git push origin main`(배포≠push, [[feedback-deploy-push-divergence]]) + PROJECT_STATUS.md 🔴 갱신.
- 멀티세션 동시작업 가능성 있으면 push-to-main FIRST 후 배포([[feedback-multi-session-deploy]]).

## 안전 불변식 (절대 규칙)
1. **게이트 비통과 시 배포 금지.** Phase 2 실패 = 정지.
2. **prod 검증 실패 = 자동 롤백.** 깨진 채 방치 금지.
3. **되돌리기 어려운 작업**(데이터 삭제·마이그 비가역)은 자율 범위 밖 — 사용자 확인.
4. 작업 파싱 결과를 먼저 1줄 확인(엉뚱한 작업 자동배포 방지).
5. 위험명령 훅이 차단(rc 2)하면 우회하지 말고 사용자에게 보고.
