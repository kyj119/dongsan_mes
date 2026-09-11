---
name: journey-loop
description: 업무 여정(J1 영업 주문서·J2 생산 카드 보드·J3 경리 회계반영/입금·J4 구매 발주→입고→검수)을 로컬 prod 스냅샷 위에서 사람처럼 실행·판정하고, 안전 수정만 자동 적용해 브랜치에 커밋하는 재귀 루프. "여정 테스트", "journey", "여정 돌려", "사람처럼 테스트" 요청 시. 한 화면 변경 검증은 verify-changes · 전 페이지 순회는 qa-audit.
---

# journey-loop — 「업무가 끝까지 되는가」를 반복 확인한다

typecheck·smoke 는 「죽지 않는다」만 증명한다. 이 루프는 **사람이 하는 순서 그대로** 화면을 밟아
「주문이 들어가 카드가 생기고 출고돼 돈이 들어오는가」를 본다. 판정은 재현 가능한 신호로만 하고,
「어색하다」는 제안으로 남긴다. 병행테스트 기간에는 회귀 방패로 쓴다.

## 명령
| 목적 | 명령 |
|---|---|
| 로컬 D1 = prod 스냅샷(스키마 전체 + 마스터만, 5MB) | `npm run journey:snapshot` (`--skip-export` = 캐시 재사용) — ⚠️`.wrangler` 공유라 **모든 worktree 의 로컬 DB** 가 바뀐다 |
| 서버 | worktree 에서 `npm run build` 후 `npx wrangler pages dev dist --local --ip 0.0.0.0 --port 3000` (백그라운드) |
| 여정 실행 | `npm run test:journey` (`j1`·`j2`… 로 하나만) · 요약 `npm run journey:report` |
| 화면 들여다보기 | `node scripts/journey/peek.cjs /order-form --eval="…"` — MCP 브라우저가 다른 세션에 잡혀 있어도 된다 |

가드: `playwright.journey.config.ts` 가 로컬 주소가 아니면 **throw**. 쓰기 여정은 prod 에 절대 돌지 않는다.

## 사이클(한 바퀴)
1. 서버·스냅샷 확인(`/api/health`) → `npm run test:journey` → `journey:report`
2. 실패/격하를 **분류**: ①선택자·테스트 결함 ②안전 수정 ③제안
3. ② 는 고친다 → `npm run build` → **같은 여정만 재실행** → 통과 → `tsc`·`test:calc` → 브랜치 커밋(`session/journey-loop`)
4. ③ 는 `docs/journeys/PROPOSALS.md` 에 1건 1줄(현상·재현·판단 근거). 코드는 건드리지 않는다
5. 30분 탐색(MCP 또는 peek 로 다른 화면을 사람처럼) → 새로 본 결함은 **여정에 단계로 승격**(재현 없는 제안은 남지 않는다)
6. 현황판 1줄

## 판정 신호(자동) — `e2e/journeys/fixtures.ts`
1 console.error · 2 pageerror · 3 HTTP ≥400(`signals.allow(re)` 로 기대된 거부만 예외) · 4 화면 텍스트의 `undefined/NaN/null/[object Object]` · 5 단계 타임아웃 · 6 **격하 마커**(`fallback/degraded/warning/partial…`) = 실패가 아니라 첨부·리포트 △ 줄.
기대값은 **DB 로 검산**한다(`db()` — 화면이 아니라 DB 가 정본): 금액 = `orders.total_amount/final_amount`, 카드 자동 생성, 출고 = `cards.shipped_at`+주문 SHIPPED, 재고 = 기성/유통 라인만 출고 차감(`utils/stockShip.ts`), 미수 = `billed − payments − adjustments`, 입고 = 실측 수량.

## 안전 수정 화이트리스트(자동) — 이 밖은 전부 제안
허용: `getElementById` id 불일치(silent fail) · bind 개수/컬럼 오타 등 500 원인 · `undefined/NaN` 표시 가드 · 라우트가 실재하는 경로 오타 · `entity_id` 누락 · `escapeHtml` 누락.
금지: 금액 계산 · 상태 전이 · 스키마 · UI 구조 · 라우트 신설 · 응답 형식(상태코드 포함) · 「어색함」.
통과 조건 = build → 같은 여정 재실행 → `tsc` → `test:calc`. 실패하면 그 파일만 `git checkout` 으로 되돌린다.

## 함정(실측 2026-09-11)
- **로그인 API 한도 = 계정당 5회/분 + IP 당 30회/분**(`middleware/rateLimit.ts` `perAccount`, 09-11 P5 로 IP 5회에서 변경) — 그래도 워커당 1회 로그인해 `localStorage.token/user` 로 심는다. J0 가 6번째 429 를 검증하므로 J0 의 더미 계정을 다른 여정에서 쓰지 말 것.
- **입금 API 는 1분 내 같은 거래처·같은 금액을 거절**(`DUPLICATE_PAYMENT` → 400, 09-11 P1 로 500 에서 변경) — 여정은 수량을 실행마다 달리하고, J3 가 거절 경로를 따로 밟는다(`signals.allow`·`allowConsole`).
- 거래처·품목 검색은 **1건이면 자동 선택, 여럿이면 공용 모달**(`#clientSearchModal`·`#itemSearchModal`) — 둘 중 무엇이 올지 모르니 `expect.poll` 로 둘 다 기다린다.
- 출력대기(PRINT_PENDING) 카드에는 개별 버튼이 없다 — 체크 → 하단 `#bulkBar` 「✓ 출력완료」. 출고는 `cards.status` 가 아니라 `shipped_at` 이다.
- 검수 승인 버튼은 「검수 대기」 카드(`filterByStatus('REVIEW')`)로 들어가야 그려진다. 입고 화면 기본이 「내 담당」이라 `#scopeAllBtn`.
- `db()` 는 SQL 을 UTF-8 파일로 넘긴다 — `--command` 인자는 셸 코드페이지가 한글을 깨뜨린다. 품목명은 띄어쓰기가 있다(`게릴라 현수막`) → LIKE.
- 스냅샷의 `entities` 는 도장·로고 base64(127KB) 가 SQLITE_TOOBIG → 그 두 컬럼만 NULL. FK 닫힘(spec_groups·price_policies·facility_zones…)이 빠지면 배치 전체가 롤백된다.

## 병행테스트 진입 조건(Phase 4)
전 여정 **3사이클 연속 통과** + PROPOSALS 판정 완료 + `test:journey` 를 `ship:gate`·`/deploy-verify` 목록에 등록(CLAUDE.md §배포를 실제로 막는 게이트).
