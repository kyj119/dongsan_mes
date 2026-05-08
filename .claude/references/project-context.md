# 프로젝트 컨텍스트 (확장 참조)

> CLAUDE.md에서 이동된 도메인·아키텍처·에이전트 정보. 필요 시 참조.

## 사업 도메인
- B2B 대형 인쇄 업체, 하루 60~90건 주문, 직원 45명
- 핵심: 미수금 추적, 생산 현황 실시간, 주문 처리 효율
- 기능 요청 시 사전 추론: 누가 쓰는가? 미수금 영향? 생산 흐름 영향? 기존 패턴 일관? 전제조건(인증, 권한, 연쇄)?

## 사용자 역할
| 역할 | 인원 | 핵심 기능 |
|------|------|----------|
| 디자이너 | 8명 | 주문입력, 디자인, 확정 |
| 오퍼레이터 | 7명 | 칸반/카드, 장비 상태 |
| 경리 | 2명 | 원장, 경리확인, 세금계산서 |
| 관리자 | 소수 | 전체 관리 |

## 코드 아키텍처
- **엔트리**: `src/index.tsx` — API 라우터 + 페이지 라우트 등록
- **API**: `src/routes/*.ts` (63 top-level + 14 서브 = 77개)
- **미들웨어**: `src/middleware/auth.ts` — authMiddleware, requireRole, pageAuthMiddleware, agentKeyMiddleware
- **페이지**: `src/pages/*.ts` (74개) → `renderPage(c, { pageScript })`
- **스크립트**: `src/scripts/*.js` (80개, `?raw` import)
- **레이아웃**: `src/layout.ts` — 사이드바, SHARED_AUTH_JS, SPA 네비게이션
- **포털**: `src/pages/portal/` (6개) — 별도 인증, 자체 레이아웃
- **독립 페이지**: invoice.ts, quotation.ts, purchaseInvoice.ts — 자체 HTML
> 상세 흐름도: `architecture-flow.md`

## 에이전트 팀
- **opus는 오케스트레이터(PM) 전용** — 개별 작업에 opus 금지
- **haiku**: 읽기 전용, 수집, 상태 확인 (log, sync-jsx, db-reset-seed 등)
- **sonnet**: 코드 생성/수정, 분석+판단 (review-checklist, deploy, security-audit 등)
- **중형 이상 기능**: dispatch 전 설계 계약서(인터페이스 명세) 작성 필수
- **통합 검증**: 모든 에이전트 완료 후 `npm run typecheck` + 계약서 대조
> 상세: `agent-team-guide.md`

## 작업 원칙 (확장)
- **대형 기능 세션 분리**: 5 Phase 이상은 2~3 Phase 단위 세션 분리. 검증 체크포인트 필수.
- **세션 시작 Stabilization**: `npm run verify` + `verify-routes.sh all` + `npm run smoke` 3종 검증.
- **변경 요약 체크포인트**: 한 파일 3회 이상 수정 시 PROJECT_STATUS.md에 기록.
- 명령어 패턴: `npm run build; taskkill /F /IM workerd.exe 2>$null; Start-Process powershell -ArgumentList "npm run dev:d1"; Start-Sleep -Seconds 15; npm run smoke`

## 참조 문서
| 문서 | 경로 | 용도 |
|------|------|------|
| 아키텍처 흐름도 | `.claude/references/architecture-flow.md` | 코드 수정 시 영향 범위 |
| 에이전트 팀 가이드 | `.claude/references/agent-team-guide.md` | 에이전트 dispatch 시 |
| 용어 사전 | `.claude/references/glossary.md` | 용어 확인 시 |
| 설계 결정 | `.claude/design-decisions.md` | 설계 판단 근거 (인덱스→상세 파일) |
| 안티패턴 | `.claude/skills/review-checklist/references/anti-patterns.md` | 코드 품질 |
| UI 일관성 | `mes-ui-consistency` 스킬 | 프론트엔드 작업 시 |
