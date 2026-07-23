# 세션 핸드오프 — 주문→출고 워크플로우 개선 + 배포 회귀 근본해결 (2026-07-23)

> 세션별 덮어쓰기 파일. durable 내용은 [[design-order-ship-workflow-gaps]]·[[feedback-multi-session-deploy]]에 보존.

## 브랜치 상태
- **공유 메인 체크아웃 = `main`(=origin/main `a755c317`)로 이동 완료** (세션 시작 시 stale `feat/dept-pnl` 38커밋 뒤처짐이었음)
- 워킹트리 clean (기존 untracked 문서만: docs/receivables/intercompany-mirror, role-expansion local-copy)
- idle 브랜치 잔존(무해): `deploy/portal-reorder-search`(=main), `feat/dept-pnl`(잉여). 삭제는 훅차단→사용자 `!git branch -D`
- ⚠️ 로컬 다수 세션 잔재 브랜치(claude/peaceful-ride-* 100개+)·**활성 worktree `session/*` 존재(건드리지 말 것)**

## 완료 (prod 배포·검증, origin/main `a755c317`·deploy 5eae9fd9)
| 기능 | 내용 |
|------|------|
| **#1 포털 상태 타임라인** | `portal.ts` 주문상세에 `order_status_history` timeline 반환(상태·시각만) + `portalOrders.js renderTimeline`(KST). 포털 shell.js 미로드→가드형 toKstDate/formatKST 이식(기존 출고일 UTC raw 버그도 교정) |
| **#4 주문검색 품목명 확장** | `core.ts` 목록+count WHERE, `queries.ts` CSV에 `EXISTS(order_items.item_name LIKE)`. 재주문=검색→행클릭→복사(기존 copyOrder) |
| **#7 배송추적 B안 spec** | `docs/superpowers/specs/2026-07-23-courier-tracking-smarttracker.md` (구현 대기) |

## 검증
- typecheck OK · build OK · prod 필드마커('품목명') 실반영 · apex 302 · portal API 401 · 주요 5페이지 200

## 배포 회귀 근본해결 (★핵심)
- **위험 감지**: `feat/dept-pnl`이 origin/main보다 **38커밋·122파일 뒤처짐**(보안픽스 #552/#553 등 미포함). 그대로 배포=대규모 회귀
- **해결(superset)**: 미커밋 5파일 stash → `git switch -c <tmp> origin/main` → stash pop(4파일 base동일 clean·orders.ts는 내 1줄이 divergent 훅 밖이라 auto-merge) → **main 위 재타입체크·빌드**(stale 검증 무효화) → commit → `push origin HEAD:main`(ff) → `deploy:prod` → 필드마커 검증
- **정리**: 체크아웃 main 이동 / 로컬 main의 미푸시 커밋 `b9015c22`(선명 32품목=잉여, origin에 `cad853a4`·`1150e7ec`로 더완전 반영)→`archive/sunmyung-b9015c22` tag 보존 후 main을 origin/main 정렬
- 교훈 기록=[[feedback-multi-session-deploy]] "배포 前 `git rev-list --count HEAD..origin/main` 프리플라이트 게이트"

## 판단 기준 (이 세션 결정)
- 재주문=별도 포털 인박스 대신 **내부 주문페이지 검색(품목명 포함)→복사** 동선 (사용자 지시)
- #7 데이터소스=경동택배 스마트택배 무료 조회 API(자동확정) + 대신화물 딥링크. 유료 통합솔루션 계약(기각)과 별개
- b9015c22 force-reset 금지→tag 보존 후 정렬 (타 세션 작업 유실 방지 원칙)

## 남은 작업 (다음 세션)
1. **#7 착수조건=스마트택배 무료 조회 API key 발급** → P1(couriers.ts 상수·경동 delivery_method 추가·smartTracker service·스키마 마이그) → P2 폴링 cron·자동확정 → P3 UI·딥링크 → P4 POD
2. **#2 알림톡 버튼 버그** — 착수 전 바로빌 KakaoTalk WSDL `<Button>` 스키마 + 카카오 등록 템플릿 버튼 상태 검증(코드만 추가 불가). → **#3 세금계산서 알림톡**(helpers.ts:282 stub) 연쇄
3. **Tier2/3 백로그**: #5 단계별 자동알림톡·#6 온라인 교정승인(brainstorming 선행)·#8 임시저장/중복감지·#9 SSE·#10 후가공/봉제작지 시스템화·#11 부분출고·#12 큐ETA 자동재계산 → 정본 [[design-order-ship-workflow-gaps]]
4. **idle 브랜치 정리**(선택): `!git branch -D deploy/portal-reorder-search feat/dept-pnl`

## 이월 (이전 ui-p0 세션 미완 TODO, 2026-07-21)
- P2 스윕: native date→js-fp 110곳·뱃지 아이콘 누락·"검색↔조회" 통일·다크모드 인라인 hex 345곳
- 정본 md 재생성: design-token.md 타이포/간격/radius 드리프트·z-index 스케일·ds-sheet/ds-alert 미문서화

## 주의
- 다음 배포는 이 체크아웃이 `main`이라 stale-배포 회귀 구조적 방지. 단 **배포 前 `git fetch && git rev-list --count HEAD..origin/main`=0 확인** 습관화
- PowerShell 검증: `npm run verify` (typecheck+build) / prod 스모크는 Playwright 로그인 필요
