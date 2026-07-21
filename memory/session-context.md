# 세션 핸드오프 — UI/UX 전수감사 + P0/P1 수정 (2026-07-21~22)

> 세션별 덮어쓰기 파일. 이전 핸드오프(원장 3열)의 durable 내용은 [[design-ledger-line-vat-columns]]에 보존됨.

## 브랜치 상태
- **worktree**: `dongsan_mes-worktrees\ui-p0` / 브랜치 `session/ui-p0` (origin push 완료)
- **base**: origin/main + **origin/feat/dept-pnl 병합 superset** (`f59f7c6a`)
  - ⚠️ 이유: 원장 3열/매입품목 노출(`601392b6`)이 prod 배포됐지만 origin/main에 없음 → ledger.js 작업 전 병합 필수였음
  - **배포 시 이 브랜치가 prod superset** — main 머지 후 `--branch main` 배포하면 안전
- **main 미병합·미배포** (사용자 확인 대기)

## 완료 (커밋 11개)
| 커밋 | 내용 |
|------|------|
| `903a7805` | P0-1 XSS ~20곳 escape (shell.js 전역검색·toast / invoice 인쇄 / quotations / orderForm client / clientDetail / ledger 독촉 / purchaseOrders / purchaseRequests 속성주입 / receiving / reports / maintenance esc) |
| `28bdfcc5` | P0-2 모달 ESC (quality 5모달+users 인라인display→hidden 클래스, shell.js ESC에 data-esc-close 위임) |
| `c35c3442` | P0-3 employeeSelf 접근성 (fa-certificate·div→button·focus-visible) |
| `70ae2722` | P0-4 cashFlow 금액입력 data-money (fe_amount/ln_original/ln_balance, readMoney, bindMoneyInputs) |
| `54ce2d8a` | P0-5 clients.js 깨진한글 (싙→총, 건너눠→건너뜀) |
| `f59f7c6a` | merge origin/feat/dept-pnl (superset) |
| `872ef6af` | P1-7 매입원장 tabular-nums + 인쇄명세서 공급가·부가세 3열 (ledgerAllocVat 재사용, 8열) |
| `dc74f2f5` | P1-9 금액표 fixed 6곳 (cashSchedule 예측/위험·cashFlow 상환·taxInvoices 상세2·bank CSV미리보기·유통주문 품목표) |
| `2f9fa65b` | P1-10 accounting CSV (5탭: 입금/세금계산서/현금영수증/카드/매입, 페이지루프 limit200 클램프 대응, 5000건 캡, dsCsvCell) |
| `f8af7a46` | P1-8 주문서 AREA 청구치수 힌트 (10cm 올림 시 "청구 100×70cm" 표시, calc.js+itemRow.js) |
| `4c30c904` | P1-6 팔레트 스윕 24파일 (SHIPPED purple→green·PRINTING→blue·칸반 출력중 yellow→blue·hero purple→primary·입금방법 뱃지 시맨틱화 ledger↔accounting 동일체계·버튼 indigo/green/teal 정리·인쇄툴바 teal→primary) |

## 검증
- `npm run verify` green · 스모크 **101/102**
- 1 FAIL = activity-logs 500 → **로컬 D1에 0456 `actor_entity_id` 컬럼 미적용 기존 드리프트** (본 변경 무관, `npm run db:migrate:local`로 해소)

## 판단 기준 (이 세션 결정)
- SHIPPED=green·PRINTING=blue: canon(component.md 상태매핑·칸반 표준) 준수. dashboard.js는 이미 blue였음 — orders만 이탈 상태였음
- 입금방법 뱃지: 카드=gray·현금=green·계좌이체=blue·수표=amber·어음=red (보라/에메랄드/로즈=차트전용 금지)
- entity(법인) 뱃지 인디고(#eef2ff/#4338ca)는 **의도적 별도 체계로 보존** (orders.js 타법인 뱃지도 이 스타일로 통일)
- BILLED 뱃지=gray(중립), 회계반영 버튼=Primary blue(벌크·단건 통일)
- attendance 범례 purple/cyan(달력 카테고리)·문서 양식 본문은 미변경

## 남은 작업 (다음 세션)
1. **main 머지+배포** — 사용자 확인 후: `git push origin session/ui-p0:main`(rejected 시 pull --rebase) → 프로덕션 배포(반드시 `--branch main`) → apex 검증. 종료=`.\scripts\end-session.ps1 ui-p0`
2. **P2 스윕**: native date→js-fp 110곳/37파일 · 뱃지 아이콘 누락(orders/quotations/clients/users/items/bank) · "검색"↔"조회" 통일 · 이모지 ~10곳 · 다크모드 인라인 hex 345곳/29파일 · 로컬 esc 사본 단일화
3. **정본 md 재생성**: design-token.md 타이포/간격/radius/shadow 전면 드리프트(실코드 `--fs-*`/`--space-xs..2xl`) · 3문서 상충(버튼/카드 radius·padding) · z-index 스케일 · ds-sheet/ds-alert/showConfirm 미문서화

## 주의
- PowerShell 검증: `cd dongsan_mes-worktrees\ui-p0; npm run verify` / 스모크는 dev:d1 기동 필요(포트 3000 단일)
- 감사 상세 리스트(전 항목·file:line) = 2026-07-21 세션 대화가 정본
