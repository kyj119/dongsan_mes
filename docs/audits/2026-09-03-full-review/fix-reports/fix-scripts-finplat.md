# 번들 ④b 수정 보고 — 회계·재고·플랫폼 클라이언트 JS + 셸

브랜치 `session/fix-scripts-finplat` · 워크트리 `C:\Users\user\dongsan_mes-worktrees\fix-scripts-finplat`
지시 항목 **21건 중 21건 수정**(부분 1건 포함) · SKIP 0건.

---

## HIGH (8건)

| 항목 | 위치 | 조치 |
|---|---|---|
| SPA 초기화 4개 | `src/scripts/bom.js:147` · `approvals.js:620` · `priceManagement.js:20` · `migration.js:257` | `document.readyState === 'loading'` 가드로 전환(`maintenance.js:153` 정본 패턴). 익명 리스너였던 2개는 `pmInit()`·`migInit()` 로 이름을 붙여 호출부를 분리 |
| 보호 파일 직링크 401 | `receiving.js:229` · `purchaseInvoices.js:73` | `<a href="/api/...">` → `<button onclick>` + 신규 셸 헬퍼 `window.dsOpenAuthFile`. 진입점은 `receivingOpenStatement()` · `pinvOpenStatement()` |
| `width_mm` 소실 | `items/modals.js:214` | 초기값 `null` → `undefined`. MATERIAL 이 아니면 키 자체를 미전송해 `routes/items.ts:1256` 의 "기존값 보존" 분기를 탄다 |
| 공급업체 50건 절단 | `purchaseOrders.js:77` | `{ fields:'picker', limit:5000, active:1 }`. 종전 `is_active` 는 라우트에 없는 파라미터명이었다 |
| 실사 표시↔저장 비대칭 | `inventoryCount.js:388` · `:540` | 표시·저장 둘 다 `window.uomPackFactor(icUomItem(item))` 한 계수로 통일. `updateItemCount` 4번째 인자를 `packSize`→`packFactor` 로 개명 |
| 포장당 빈칸 = 1 | `inventoryCount.js:510` | 빈칸이면 품목 기본값 `pack_size` 로 복원. 종전엔 1 로 저장돼 다음 렌더가 한 칸 모드로 뒤집히고 그 칸 수정이 `pack_size` 배로 부풀었다 |
| 10초 폴링 | `tasks.js:121` | 60초 + `if (document.hidden) return`. SPA 이탈 정리는 셸의 `setInterval` 래퍼(`_spaTimers`)가 이미 담당 |
| `window.navigateTo` 미정의 | `shell.js` (SPA IIFE 말미) | **셸에서 근본 수정**. `spaNavigate` 가 IIFE 안에 갇혀 `window.spaNavigate` 조차 undefined 였다 → 둘 다 전역 노출 + `navigateTo` 는 실패 시 전체 네비게이션 폴백. 호출부 3곳(`weeklyPurchase.js:224` · `scan.js:209` · `orders.js:870`)과 기존 `hr.js`·`hrDetail.js` 의 `window.spaNavigate` 가드가 **한 번에 살아난다**(호출부 파일은 미수정) |
| 거래처 검색 응답 형태 | `accounting.js:852` | `res.data.data` → `res.data.data.clients` + `fields=picker`. 법인간거래 모달 검색이 입력과 무관하게 항상 "검색 결과 없음"이던 원인 |

## MEDIUM (12건)

| 항목 | 위치 | 조치 |
|---|---|---|
| 부가세 미리보기 반올림 | `taxInvoices.js:1513` | `_diCalcTotals()` SSOT 신설 — 품목별 `round(공급가×0.1)` 합산으로 서버(`issue.ts:96-117`)와 일치. **미리보기와 `submitDirectIssue` 전송 payload 둘 다** 이 함수를 쓴다 |
| 등록일 UTC 밀림 | `cashSchedule.js:327` · `:569` | `new Date().toISOString().slice(0,10)` → `window.kstToday()` |
| 오늘 만기 = 연체 | `cashSchedule.js:83` · `:113` | 날짜↔시각 비교를 날짜↔날짜 문자열 비교로. `isPast`(달력 셀)도 같이 |
| 안내 기준일 UTC 밀림 | `reports.js:61` | 로컬 필드로 `YYYY-MM-01` 조립 |
| 월별 요약 = 주문 있는 달만 | `reports.js:83` | `monthMap` 합집합 후 `Object.keys().sort().reverse()`(서버와 같은 DESC). 주문 0건인 달의 입금이 총수금·수금률에서 빠지던 문제 |
| 전역 `currentPage` 공유 | `cashReceipts.js:1` | `crCurrentPage` 로 격리(7곳). `taxInvoices.js:7` 의 "의도적 미개명" 주석은 이미 낡았다 — `hometaxInvoices.js` 는 자체 IIFE + `window.htCurrentPage` 로 분리돼 있어 개명이 안전했다 |
| base 수량에 관리단위 라벨 | `storageZones.js:500` | **부분 수정** — 아래 §미해결 참조 |
| `escHtml` 전역 덮어쓰기 | `inventoryDashboard.js:7` | `invDashEsc` 로 개명(12곳) + `window.escapeHtml` 위임(폴백 유지) |
| `timeAgo` 전역 덮어쓰기 | `capsSettings.js:68` | `capsTimeAgo` 로 개명(호출부 `:41`) |
| `'\\n'` 리터럴 | `purchaseOrders.js:131` | 실제 개행으로. 덤으로 `:140` "부족 품목이 없습니다"의 심각도 `'error'` → `'info'` |
| 문서 전역 클릭이 패널 닫음 | `inventoryCount.js:660` | `#countCreateModal, .ds-modal-overlay, .ds-modal, #toast-container` 안의 클릭은 "바깥"이 아니다 |
| 합계 미리보기 DOM 역파싱 | `purchaseInvoices.js:97` | 입력에 `data-qty` 를 실어 `inp.dataset.qty` 로 읽는다. `submitConfirm` 은 단가만 보내고 수량은 서버 정본이라 무관 |

---

## 미해결 — 라우트 소관 (다른 에이전트/후속)

**`storageZones.js:500` 은 클라이언트만으로 고칠 수 없다.** 헬퍼 호출로 바꿔 뒀지만 **지금은 종전과 같은 표기로 폴백한다**(회귀 없음, 개선도 아직 없음). 두 가지가 채워져야 실제로 올바르게 표시된다.

1. `src/routes/storageZones.ts:266` 의 SELECT 에 `i.base_unit, i.pack_size, i.stock_mode` 추가 (현재 `i.unit`·`inv.quantity` 만).
2. `src/pages/storageZones.ts` · `src/pages/settings.ts` 에 `UOM_JS` 주입 — 현재 `src/pages/inventory.ts:75` **한 곳에만** 주입돼 있어 이 페이지엔 `window.uomFormatStock` 자체가 없다. (가드 없이 호출했다면 구역 재고표가 TypeError 로 통째로 죽었을 자리다.)

---

## 게이트

| 게이트 | 결과 |
|---|---|
| `npm run typecheck` | PASS |
| `npm run build` | PASS (445 modules, 6,746.94 kB) |
| `npm run check:dom` | PASS (109개 파일, 정적 참조 전부 정의처 존재) |
| `node scripts/sort-audit.cjs` | PASS (P1 0건) |
| `npm run test:calc` | PASS (orderline·finishing-label·delivery-slot 67·file-dims 19·credit 11·stock-unit 30·stock-valuation 22·items 중복판정) |
| `node --check` (수정 JS 19개) | 전부 OK — `?raw` 스크립트는 tsc 가 안 보므로 별도 확인 |

## 커밋

| 해시 | 내용 |
|---|---|
| `69d477e0` | shell: SPA navigate 전역 노출 · `dsOpenAuthFile` 신설 · `toggleSidebarGroup` null 가드 순서 |
| `08b8cecf` | bom·approvals·priceManagement·migration SPA 초기화 |
| `1624bd3f` | receiving·purchaseInvoices 인증 blob 열기 + `data-qty` |
| `a53e7fea` | items `width_mm` 보존 · 공급업체 picker · `\n` 리터럴 |
| `138abc5d` | inventoryCount 대칭·패널 닫힘 범위 · storageZones · inventoryDashboard 전역 |
| `6999d354` | tasks 폴링 규약 · capsSettings 전역 |
| `335c881f` | accounting·taxInvoices·cashSchedule·reports·cashReceipts |

`git push` · 배포 없음. 워킹트리 clean.
