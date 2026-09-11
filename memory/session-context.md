# 세션 인계 — 2026-09-11 (일러 패널 세션: 펀칭 규칙 통일 「나」 · 코드 완료·미배포)

> 이 파일에는 같은 날 journey-loop 세션의 인계(아래 두 번째 제목부터)가 미커밋 상태로 함께 있다 — 지우지 말 것.

## 이번 세션이 한 일
- 오전: IME 플래그 + 주석 소실 정정 → `ia:deploy` 완료·재시작 후 재검증(호스트 0.12.0·셸 0.19.0). 경위 = ARCHIVE §2026-09-11 일러 패널 · 메모리 `feedback-cep12-korean-ime-tsf`.
- 오후: 펀칭 규칙 점검 → 네 곳이 다르게 셌다(호스트 양끝포함 / 에이전트·주문서·라벨 모서리따로+안쪽N) → 용준님 **「나」**(호스트 규칙 유지 + 결과를 화면이 셈) · 용어 「모서리」 · 표기 실물 `8개(모서리 4, 4변 1)` · 파일명 위치어+총개수. 정본 메모리 = `design-punching-count-rule`. 경위 = ARCHIVE §2026-09-11 펀칭.
- 게이트: `test:finishing-label` 60(클라 사본 대조 신설) · `panel:smoke` 216/216(7f 24항목) · tsc · build 통과. 코드 커밋 완료.
- 저녁: 패널 구조 점검 → 용준님 결정 ①`mes-core`·`mes-sheet` 은퇴 ②빈 catch **나**(전수 분류) ③S4 잔재 정리 → 전부 구현. 390곳 중 363 사유 주석·27 실패 기록(호스트 0.13.0·재단 0.43.0·패널 0.21.0·에이전트 4파일), 게이트 `audit:empty-catch` 를 편집 훅·커밋 훅·`ia:deploy` 에 배선. 정본 메모리 = `design-empty-catch-gate` · `design-a0-panel-structure` §2026-09-11. 경위 = ARCHIVE §2026-09-11 패널 구조.

## 다음 세션 TODO
1. ~~IA 배포~~ 완료(09-11 밤, 드리프트 0 · 재시작 후 실측 호스트 0.13.0/패널 0.21.0/재단 0.86.0·0.43.0/잠금 1.1.1 · 검토모드 구멍 8·재단선 1). ⚠️1차는 재단 셸 번호 미상승으로 축1만 나갔었다 — **사유 주석만 바꿔도 번호를 올린다**. 남은 = 첫 실등록 1건에서 warn 코드(C/D/N)·`warn.log` 가 **안 생기는지** 본다(생기면 여태 삼켜지던 실패다).
2. ~~웹 배포~~ 완료(09-11 밤 `7a23c954`, push→`deploy:prod`·CI 병행). 검증 tsc·build·test:calc·entity 0·journey:gate 25/25(1회 재시도=로컬 D1 잠금 경합)·smoke:prod 129/129·마커 `pageScript`(「모서리 4」·「4변」 있음·옛 「4모서리」 없음). ⚠️rebase 때 CLAUDE.md 게이트 목록이 충돌해 양쪽(empty-catch · journey:gate) 합쳐 해소.
3. 현황판 3파일 커밋 — journey-loop 세션의 미커밋 편집과 섞여 있어 이 세션은 코드만 커밋했다. 그쪽 세션이 끝난 뒤 함께 커밋.
4. (이월) 각 디자이너 PC 일러 완전 재시작 후 한글 타이핑 1건 확인(IME 플래그).

## 판단 기준·주의
- **펀칭 문장을 만드는 곳은 둘**(웹 라벨 쌍 · 패널 `punchLabel`) — CEP 는 src 를 못 싣는다. 형식을 바꾸면 둘 다 + 7f 픽스처.
- 호스트 분배식을 바꾸면 패널 `punchLayout`·에이전트 `spread`·라벨 쌍 **전부** — 7f 가 호스트 소스 텍스트까지 잡아 한 곳만 바꾸면 게이트가 선다.
- 파일명 위치어는 **모서리 사이 구멍이 있는 변** 기준(상3·하3·좌2·우2 = 상하펀칭6). 입력 변 기준으로 바꾸자는 제안이 나오면 「같은 실물이 두 이름」이 되는 이유를 먼저.
- 기하(이격·지름)는 통일 안 함 — 호스트 2cm/1cm · 에이전트 1cm/5mm.
- **빈 catch 를 새로 쓰면 편집 훅이 막는다** — `catch (e) { /* ignore: 사유 */ }`(블록 주석만) 또는 실패 기록. 사유는 거짓이면 안 된다(호출자가 정말 개수를 보는지 확인).
- **소스 텍스트 스모크는 주석·버전 문구에도 걸린다** — 이번에 7g·3t 두 번. 새 검사는 DOM/동작 기준.
- 에이전트 `$.writeln` 은 아무 데도 안 잡힌다(`DoJavaScript` 반환값만) → `warn.log`. 에이전트가 그 파일을 읽는 것은 미구현.

## 검증 명령 (PowerShell, `C:\Users\user\dongsan_mes`)
```powershell
npm run audit:empty-catch ; npm run test:finishing-label ; npm run panel:smoke ; npm run cut:smoke ; npm run verify
node scripts/ia-jsx-audit.cjs        # 배포 전 드리프트(축1 4·축2 3·축3 4·축4 4) 가 정상
```

---

# 세션 인계 — 2026-09-11 (업무 여정 루프 Phase 0~1 + 제안 5건 판정 완료)

## 이번 세션이 한 일 (worktree `journey-loop` · 브랜치 `session/journey-loop` → **rebase 후 main 머지·prod 배포 완료** `04a9a8e6`, CI run 34582566784 · smoke:prod 129/129)

> 배포 후 실측 **P6**: prod 로그인 한도가 **간헐적**(같은 계정 12회 중 429 는 8·11번째만). `rateLimit.ts` 가 isolate 메모리 카운터라 요청이 다른 isolate 로 가면 각자 0부터 — 기존 IP 방식도 동일했던 성질이라 회귀는 아니지만 「무차별 대입 방어가 있다」고 믿으면 안 된다. 해법 = Cloudflare Rate Limiting 바인딩 또는 D1/KV 카운터. `docs/journeys/PROPOSALS.md` P6, 용준님 판정 대기.
> 메인 체크아웃은 `git pull --rebase` 로 동기화했고, **다른 세션의 펀칭 커밋(`6583f2bb`)이 main 에 ahead 1 로 남아 있다**(그 세션이 push 할 것 — 내가 push 하지 않았다).

용준님 질문 「일러 패널·MES 를 사람처럼 테스트하며 재귀 개선할 수 있나」 → 선택지 **가(MES 웹 여정 루프 · A3 탐색=MCP/회귀=spec · B2 prod 스냅샷 최소 · 안전 수정만 자동 · 브랜치 자동 커밋)** 확정 → 구현 → 「1번 진행」= 제안 P1·P5 고침.

| 산출 | 내용 | 검증 |
|---|---|---|
| `npm run journey:snapshot` | 로컬 D1 = prod **스키마 전체 + 마스터 27테이블만**(187KB+5.09MB). users 비번 `password`·연락처 NULL, entities 도장·로고 NULL(SQLITE_TOOBIG), FK 닫힘 포함. d1_migrations 627건 마킹 | 품목 1,413·거래처 2,903·재고 412 |
| `npm run test:journey` | **J0 로그인(계정별 한도)** · J1 영업 주문서 · J2 카드 보드 출력완료→출고 · J3 회계반영→원장→입금(+중복 거절 400) · J4 발주→입고(1 부족)→검수 승인 = **19단계** | 19/19(1.7분) · 그 전 16단계 3사이클 연속 |
| 판정 | 콘솔/pageerror/HTTP≥400/새는 텍스트 + **DB 검산**. 격하 마커=첨부. 기대된 거부는 `signals.allow`·`allowConsole` | `journey:report` |
| **P1 고침** `ba266b50` | `ar-payments.ts` DUPLICATE_PAYMENT 가 바깥 catch 로 빠져 **500 「서버 오류」** → bank.ts 와 같은 **400·문구** | J3 거절 단계 |
| **P5 고침** `ba266b50` | 직원 로그인 IP 5회/분(사무실 NAT=한 IP) → `rateLimit.ts` `perAccount` 옵션: **계정 5/분 + IP 30/분**. 포털·비번변경·refresh 는 그대로 | J0(6번째 429·다른 계정 통과) · tsc·build·`test:calc` |
| `/journey-loop` 스킬 · `docs/journeys/PROPOSALS.md` | 절차·화이트리스트·함정 / P2~P4 **판정 대기** | `audit:skills` OK · doc-diet OK |

## Phase 2~3 (09-11 저녁, prod `6356cf9c`)
- **한 명령 러너** `npm run journey:cycle`(`scripts/journey/cycle.cjs`): 빌드 필요 시만·서버 없으면 스스로 기동·25단계·요약(통과=3줄, 실패=실패 블록만). 옛 리포트를 통과로 세지 않는다(exit 2). `--only="j5|j6"`(따옴표!)·`--snapshot`.
- **J5 재고 실사**(구역 6 현수막실: 생성→실측 1 입력→제출→승인→`inventory.quantity`=counted+`STOCK_COUNT` 원장, reference_id=실사 **라인** id) · **J6 견적→주문**(작성→목록 상세→주문 전환→프리필 저장→`quotation_id`·`first_converted_at`·견적 라인 불변). **25단계 3사이클 연속 통과**.
- **P7 고침** — 견적서 품목칸 Enter 가 `<form>` 제출 → 「단가 0원」 확인창 → 확인하면 반쯤 채운 견적 저장. `quotationForm.js` 에 keydown(Enter=검색) 추가(주문서 규약). prod 마커 `doQuotSearch` 3.
- **게이트 편입**: `ship:gate` 와 `/deploy-verify` Phase 1 에 `npm run journey:gate`. CI 에는 없다(로컬 서버·스냅샷). `SKIP_JOURNEY=1` 만 명시 건너뜀.
- P6 = ③보류(보안강화=전환 시 묶음) · P8 = 견적 품목검색이 `excludeType=MATERIAL` 없이 50행(주문서 6행) — 영업 확인 대기.
- 용준님 질문 「스킬로 만들어 필요할 때 쓸 수 있나, 세션 부담?」 → 답: `/journey-loop` 스킬 + `journey:cycle` 한 명령. **돌리는 비용 ≈ 2.5분·출력 10줄**, 새 여정 하나 쓰는 비용 ≈ 탐색 5~8회+실행 3~4회(무거우면 서브에이전트 worktree 로).

## 다음 세션 TODO

1. ~~PROPOSALS P2~P4 판정~~ 완료(09-11 `e1c88e3a`): **P2 고침** — 카드 보드에 일괄 바가 둘(표준 `#cardBulkBar` z-35 + 레거시 `#bulkBar` z-40)이라 레거시가 표준을 덮었다 → 레거시 제거·옛 함수명은 위임. **P3 유지(설계)** — 진행중 카드 버튼은 RIP 전송·보류뿐, 출력완료는 출력 이벤트. **P4 유지(정상)** — UTC 저장+`formatKST` 표시.
2. ~~Phase 2~3~~ 완료(J5·J6·러너·게이트 편입, `6356cf9c`). 다음 후보 = J1 예외 경로(필수 누락 제출·여신 초과·에누리 라인) · J2 출고 취소(환원) · J4 「발주 없이 입고」.
3. ~~머지~~ 완료 · P6 = ③보류(보안 묶음). **P8** 견적 품목검색 자재 포함 여부 — 영업에게 확인 후 `excludeType=MATERIAL` 통일할지.
4. ~~게이트 편입~~ 완료. 병행테스트 기간엔 `npm run journey:cycle` 을 `/loop` 로 반복하고, 직원이 말한 결함은 **여정 단계로 승격**한 뒤 고친다.
5. (이월) IA 패널 09-11 배포분: 디자이너 PC **일러 완전 재시작** 후 한글 타이핑·주석 확인. 발주→입고→검수 원단 2주 테스트(용준님/강지영) 진행 중.

## 판단 기준·주의

- **`journey:snapshot` 은 `.wrangler` junction 공유라 모든 worktree 의 로컬 D1 을 갈아 끼운다.** 다시 만들려면 스냅샷을 다시 뜨면 된다(prod 읽기만).
- **로컬 서버는 worktree 의 `dist`** (`npx wrangler pages dev dist --local --ip 0.0.0.0 --port 3000`, 포트 1개). `dev:d1` 의 `taskkill` 이 Git Bash 백그라운드에서 exit 127 → wrangler 만 직접. 이 세션 종료 시 서버도 죽는다. 빌드 후 재기동 없이 `_worker.js` 를 다시 읽는다(J0 로 확인).
- **선택자 탐색은 `scripts/journey/peek.cjs`** — Playwright MCP 브라우저는 다른 세션이 잡고 있으면 「already in use」. `MSYS_NO_PATHCONV=1` 없이는 Git Bash 가 `/order-form` 을 경로로 바꾼다.
- **검색 UI 는 「1건=자동 선택 · 여럿=공용 모달」** → `expect.poll` 로 둘 다 기다린다. **출고는 `shipped_at`** · 출고 차감은 **기성/유통 라인만** · 회계반영이 있어야 원장 매출·미수가 생긴다.
- **기대된 거부 경로**(400·429)는 브라우저가 `Failed to load resource` 를, 앱이 `console.error` 를 남긴다 → `signals.allow(url)`·`allowConsole(text)` 로 그 단계만 예외. 전역으로 끄면 신호 1 이 죽는다.
- **J0 의 더미 계정(`jrn…-nobody`)은 다른 여정에서 쓰지 말 것** — 계정 버킷이 60초 동안 잠긴다.
- 원장 잔액·금액 검산은 DB 로만 — orders 는 `total_amount`(공급가)·`final_amount`(VAT 포함).

## 검증 명령 (PowerShell, worktree `C:\Users\user\dongsan_mes-worktrees\journey-loop`)

```powershell
npm run verify                                     # tsc + build
Start-Process npx -ArgumentList 'wrangler pages dev dist --local --ip 0.0.0.0 --port 3000'
npm run test:journey ; npm run journey:report      # 19/19
npm run test:calc ; npm run audit:skills ; node scripts/doc-diet-audit.cjs
npm run journey:snapshot -- --skip-export          # 로컬 DB 초기화(캐시 재사용)
```
