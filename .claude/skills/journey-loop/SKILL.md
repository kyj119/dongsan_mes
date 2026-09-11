---
name: journey-loop
description: 업무 여정(J0 로그인·J1 영업 주문서·J2 생산 카드 보드·J3 경리 회계반영/입금·J4 구매 발주→입고→검수·J5 재고 실사·J6 견적→주문)을 로컬 prod 스냅샷 위에서 사람처럼 실행·판정하고, 안전 수정만 자동 적용해 브랜치에 커밋하는 재귀 루프. "여정 테스트", "journey", "여정 돌려", "사람처럼 테스트", "journey:cycle" 요청 시. 한 화면 변경 검증은 verify-changes · 전 페이지 순회는 qa-audit.
---

# journey-loop — 「업무가 끝까지 되는가」를 한 명령으로 반복 확인한다

typecheck·smoke 는 「죽지 않는다」만 증명한다. 이 루프는 **사람이 하는 순서 그대로** 화면을 밟아
「주문이 들어가 카드가 생기고 출고돼 돈이 들어오는가」를 보고, 판정은 재현 가능한 신호로만 한다.
「어색하다」는 제안으로 남긴다. 병행테스트 기간에는 회귀 방패다(`ship:gate`·`/deploy-verify` 편입, 2026-09-11).

## 세션 부담을 낮추는 규칙 — **한 명령, 짧은 출력만 읽는다**
```
npm run journey:cycle                 # 빌드(필요할 때만)→서버(없으면 기동)→25단계→요약. 통과=3줄, 실패=실패 여정 블록만
npm run journey:cycle -- --only=j3    # 한 여정만(정규식: "j5|j6")
npm run journey:cycle -- --snapshot   # 로컬 D1 을 스냅샷으로 되돌리고 시작(캐시)
```
- 사이클 출력 외의 것(trace·스크린샷·로그)은 **실패했을 때만** 연다. `trace: npx playwright show-trace …` 줄이 안내한다.
- 원인 조사는 `scripts/journey/peek.cjs <경로> --eval=…`(요소 목록·JS 평가) 또는 `.journey/tmp/*.cjs` 짧은 프로브로 — MCP 브라우저는 다른 세션이 잡고 있으면 못 쓴다.
- 여정 하나 새로 쓰는 비용 ≈ 선택자 탐색 5~8회 + 실행 3~4회. 이미 있는 것을 돌리는 비용 ≈ 2.5분·출력 10줄.
- 무거운 탐색(새 여정 3개 이상·전 화면 훑기)은 이 스킬을 **서브에이전트(`isolation:"worktree"`)** 에 맡기고 결론만 받는다.

## 사이클(한 바퀴)
1. `npm run journey:cycle` → 요약 읽기
2. 실패/격하를 **분류**: ①선택자·테스트 결함 ②안전 수정 ③제안
3. ②는 고친다 → 같은 여정만 `--only` 재실행 → 통과 → `npm run verify`·`test:calc`·`check:dom` → 브랜치 커밋
4. ③은 `docs/journeys/PROPOSALS.md` 에 1건 1줄(현상·재현·판단 근거) — 코드는 건드리지 않는다
5. 탐색 30분(다른 화면을 사람처럼) → 새로 본 결함은 **여정 단계로 승격**(재현 없는 제안은 남지 않는다)
6. 현황판 1줄

## 판정 신호(자동) — `e2e/journeys/fixtures.ts`
1 console.error · 2 pageerror · 3 HTTP ≥400 · 4 화면 텍스트의 `undefined/NaN/null/[object Object]` · 5 단계 타임아웃 · 6 **격하 마커**(`fallback/degraded/warning/partial…`) = 실패가 아니라 △ 줄.
기대된 거부(400·429)는 그 단계에서만 `signals.allow(url)`·`signals.allowConsole(text)` — 전역으로 끄지 않는다.
기대값은 **DB 로 검산**(`db()` — 화면이 아니라 DB 가 정본): 금액 `total_amount/final_amount` · 카드 자동 생성 · 출고=`cards.shipped_at`+주문 SHIPPED · 출고 차감=기성/유통 라인만(`utils/stockShip.ts`) · 미수=`billed − payments − adjustments` · 입고=실측 · 실사 승인=`inventory.quantity`=counted+`STOCK_COUNT` 원장(reference_id=실사 **라인** id) · 견적→주문=`orders.quotation_id`+`first_converted_at`.

## 안전 수정 화이트리스트(자동) — 이 밖은 전부 제안
허용: `getElementById` id 불일치(silent fail) · bind 개수/컬럼 오타 등 500 원인 · `undefined/NaN` 표시 가드 · 라우트가 실재하는 경로 오타 · `entity_id` 누락 · `escapeHtml` 누락 · **화면 간 규약 불일치**(P2 중복 바·P7 Enter 제출처럼 한쪽 화면만 다른 것).
금지: 금액 계산 · 상태 전이 · 스키마 · UI 구조 신설 · 라우트 신설 · 응답 형식 · 「어색함」.
통과 조건 = build → 같은 여정 재실행 → `verify` → `test:calc` → `check:dom`. 실패하면 그 파일만 `git checkout`.

## 게이트 배선
`ship:gate` 와 `/deploy-verify` Phase 1 이 `npm run journey:gate` 를 돈다(=cycle --gate). CI 에는 없다(로컬 서버·스냅샷 D1).
서버가 없으면 **스스로 띄우고**, 리포트가 갱신되지 않으면 exit 2(옛 결과를 통과로 세지 않는다). 핫픽스는 `SKIP_JOURNEY=1` 명시.

## 함정(실측 2026-09-11) — 자세한 경위는 `docs/journeys/PROPOSALS.md`
- 로그인 한도 = 계정 5/분 + IP 30/분(P5). 워커당 1회 로그인해 `localStorage.token/user` 로 심는다. **prod 는 isolate 메모리라 간헐적**(P6, 보류). J0 의 더미 계정은 다른 여정에서 쓰지 말 것.
- 입금 API 는 1분 내 같은 거래처·금액 거절(400, P1) — 여정은 수량을 실행마다 달리한다.
- 검색 = 「1건이면 자동 선택 · 여럿이면 공용 모달」(`#clientSearchModal`·`#itemSearchModal`) → `expect.poll` 로 둘 다 기다린다. 견적서 모달은 50행이라 첫 행이 헤더 아래 → `dispatchEvent('click')`.
- 진행중 카드 버튼은 RIP 전송·보류뿐(P3 설계). 사람이 출력완료를 찍는 길 = 체크 → `#cardBulkBar` 「상태 선택 → 일괄 변경」. 출고는 `shipped_at`. datetime 은 UTC 저장·`formatKST` 표시(P4).
- 실사 입력칸의 onchange 인자 id 는 품목 id 가 아니다 — 첫 칸에 넣고 DB 에서 채워진 행을 찾는다.
- `db()` 는 SQL 을 UTF-8 파일로 넘긴다(`--command` 는 한글이 깨진다). 품목명은 띄어쓰기(`게릴라 현수막`) → LIKE.
- 스냅샷 `entities` 는 도장·로고 base64 가 SQLITE_TOOBIG → NULL. FK 닫힘이 빠지면 배치 전체 롤백. `.wrangler` 공유라 **모든 worktree 의 로컬 D1** 이 바뀐다.
- 러너에 `--reporter=json` 을 주면 설정 리포터가 대체돼 last.json 이 안 갱신된다. 필터 `j5|j6` 는 따옴표(셸 파이프).
