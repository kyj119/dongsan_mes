# 슬라이스 G 결과 — 정독 18파일 / 11,231줄 (+ 패턴 스윕 14파일 · 라우트 대조 9파일)

정독: `layout/shell.js` `inventory.js` `inventoryCount.js` `inventoryTx.js` `inventoryValuation.js` `inventoryDashboard.js` `receiving.js` `storageZones.js` `purchaseOrders.js` `purchaseOrderForm.js` `purchaseInvoices.js` `items/{core,tabs,bulk,modals}.js` `bom.js` `materialForecast.js` `weeklyPurchase.js`
스윕: `messages.js` `messagesAd.js` `priceManagement.js` `users.js` `settings.js` `capsSettings.js` `dashboard.js` `tasks.js` `scan.js` `approvals.js` `migration.js` `purchaseInvoice.js` `permissions.js` `clients.js`

---

## 조치 필요 (심각도순)

- `src/scripts/bom.js:147` — **HIGH** — 초기화가 `DOMContentLoaded` 리스너 하나뿐이라 SPA 전환 시 절대 실행되지 않는다 — 사이드바에서 `/bom` 을 누르면 스켈레톤만 영구 표시(새로고침해야만 뜸). 같은 결함: `approvals.js:620`(`/approvals`) · `priceManagement.js:20`(`/price-list`) · `migration.js:257`(`/migration`) — 넷 다 `layout/menu.ts` 사이드바 항목 — counterpart checked: `src/layout.ts:27` (X-SPA-Request → JSON) + `src/scripts/layout/shell.js:1738` (`s.textContent=…; document.body.appendChild(s)` = DOMContentLoaded 이후 주입). 정상 패턴 = `src/scripts/maintenance.js:153` (`document.readyState === 'loading'` 가드).

- `src/scripts/receiving.js:229` — **HIGH** — 보호된 R2 파일을 `<a href="/api/purchase-orders/receipts/{id}/statement" target="_blank">` 로 직접 링크 — Authorization 헤더가 안 실려 거래명세서 '보기'가 항상 401(빈 탭). 같은 결함: `purchaseInvoices.js:73`(매입확정 모달) — counterpart checked: `src/routes/purchaseOrders/po-receipts.ts:17` (`use('/*', authMiddleware, …)`) + `src/middleware/auth.ts:11` (`Authorization` 헤더 전용, 쿠키·쿼리 토큰 없음). 같은 파일 `receiving.js:246` CSV 는 `authFetch`+blob 로 올바르게 처리돼 있다.

- `src/scripts/items/modals.js:236` — **HIGH** — `width_mm: widthMm` 를 **항상** 전송하는데 `widthMm` 은 `:214` 에서 `null` 로 시작해 `selectedItemType === 'MATERIAL'` 일 때만 채워진다 — 제품·상품을 품목 수정 모달에서 저장하면 기존 `width_mm` 이 통째로 NULL 로 지워진다(폭 뱃지·자동차감 매칭 근거 소실) — counterpart checked: `src/routes/items.ts:1256` `itemData.width_mm !== undefined ? 'width_mm = ?,' : ''` — 주석이 "전송되지 않으면(undefined) 기존값 보존"이라 **생략**을 전제하는데 클라가 `null` 을 보낸다.

- `src/scripts/purchaseOrders.js:77` — **HIGH** — 공급업체 필터 드롭다운이 `/api/clients` 를 `limit` 없이 호출 → 서버 기본 50건만 받아 이름순 앞 50곳 외에는 **선택 자체가 불가능** — counterpart checked: `src/routes/clients.ts:59` (`limit = '50'`), `:67` (`maxLimit = picker ? 5000 : 200`). 정상 패턴 = `cashReceipts.js:180` (`fields:'picker', limit:5000`). 덤으로 같은 줄의 `is_active:'1'` 은 라우트 파라미터명이 `active` 라 무시된다(기본이 활성만이라 결과는 무해).

- `src/scripts/inventoryCount.js:388` — **HIGH** — 실사 한 칸 입력의 표시와 저장이 비대칭 — 표시는 `window.uomFromBase(countedQty, item)`(다단위일 때만 나눔)인데 저장은 `updateItemCount` 이 `:540` 에서 `(parseFloat(raw)||0) * packSize` 로 **무조건 곱한다**. 포장당 칸을 비우면 `per_pack_qty=1` 로 저장돼(`:510`) 다음 렌더에 한 칸 모드로 바뀌고, 그때 수량을 고치면 `pack_size` 배(시트류 50·원단 130)로 저장된다 → 승인 시 재고가 그 값으로 보정 — counterpart checked: `src/utils/unitConvert.ts:92-95` (`uomIsMulti` = base_unit && base_unit!==unit && pack_size>0), `src/routes/inventoryCount.ts:479` (`i.pack_size` 를 라인에 실어 보냄).

- `src/scripts/tasks.js:121` — **HIGH** — `setInterval(…, 10000)` 이 `/api/tasks` + `/api/tasks/_/stats` 두 엔드포인트를 **10초마다** 치고 `document.hidden` 가드가 없다 — 켜둔 탭 하나가 분당 12회, 하루 17,000회 → CF 과금 가드 위반 — counterpart checked: `src/scripts/layout/shell.js:735` 및 `dashboard.js:762` (둘 다 `if (!document.hidden)` + 60초). 슬라이스 내 나머지 폴링은 모두 규약 준수.

- `src/scripts/weeklyPurchase.js:224` — **HIGH** — `window.navigateTo(...)` 를 호출하는데 이 함수는 `src/` 전체 어디에도 정의돼 있지 않다 — PR 생성 후 "발주 요청 목록으로 이동하시겠습니까?"에서 확인을 눌러도 TypeError 로 아무 일도 안 일어난다. 같은 결함: `scan.js:209` (`if (url) window.navigateTo(url)` = 스캔 결과 이동 전체가 죽어 있음) — counterpart checked: `grep -rn "navigateTo" src/` → 호출 3곳(+`orders.js:870`)뿐, 선언 0곳.

- `src/scripts/storageZones.js:500` — **MEDIUM** — 구역 재고 상세가 `(it.quantity || 0) + ' ' + it.unit` 로 **base 수량에 관리단위 라벨**을 붙인다 — 롤 원단이 "800 롤"(실제 800M = 16롤)로 읽혀 발주 판단이 50배 어긋난다 — counterpart checked: `src/routes/storageZones.ts:267` (`i.unit`, `inv.quantity` 만 SELECT, `base_unit`/`pack_size`/`stock_mode` 없음). 같은 페이지군의 `inventory.js:231` · `inventoryTx.js` · `inventoryDashboard.js:146` 은 전부 `uomFormatStock` 을 쓴다(수정 시 라우트 SELECT 도 같이 넓혀야 함).

- `src/scripts/inventoryDashboard.js:7` — **MEDIUM** — 최상위 `function escHtml(s)` 가 셸 전역을 덮어쓴다 — `/inventory` · `/inventory-dashboard` 에서 알림 패널이 이 사본을 쓰게 되고, 사본은 `'`(작은따옴표)를 이스케이프하지 않아 셸 규약과 갈린다 — counterpart checked: `src/scripts/layout/shell.js:1401` `function escHtml(s){ return window.escapeHtml(s); }` + `:1393` `loadNotifications` 사용부.

- `src/scripts/capsSettings.js:68` — **MEDIUM** — 최상위 `function timeAgo(dateStr)` 가 셸 전역을 덮어쓴다 — `/settings` 에서 알림 목록의 시각이 하루 넘은 것도 "412일 전"으로 표시되고(원본은 날짜로 전환) 빈값이 `''` 대신 `'없음'` 이 된다 — counterpart checked: `src/scripts/layout/shell.js:1440` `timeAgo` (`diff < 604800` 이후 `formatKST(ts,'date')`), `pages/settings.ts:7` (capsSettings 를 같은 페이지에 concat).

- `src/scripts/inventory.js:223` — **MEDIUM** — `escapeHtml(item.item_name).replace(/'/g, "\\'")` 의 두 번째 replace 는 no-op(앞에서 이미 `'`→`&#039;`) 이고, 그 값이 `onclick="openZoneStock(5,'…')"` 안에 들어가 HTML 디코드 뒤 **따옴표가 그대로 JS 문자열을 닫는다** → 이름에 `'` 가 든 품목은 창고별·이력·설정 버튼 3개가 전부 죽는다 — counterpart checked: `src/scripts/layout/shell.js:111` `escapeHtml` (`'` → `&#039;`). 정상 패턴 = `purchaseOrderForm.js:23` `escapeAttr`(escapeHtml 미적용 후 `\\'`).

- `src/scripts/purchaseOrders.js:131` — **MEDIUM** — `'…(' + alerts.length + '건):\\n\\n'` 은 `?raw` 소스라 백슬래시+n **문자 2개**가 그대로 들어간다 — 재고 부족 알림 토스트에 `\n` 이 글자로 찍힌다(`:135`, `:137` 동일). 같은 함수 `:140` 은 "부족 품목이 없습니다"(정상)를 `'error'` 심각도로 띄운다 — counterpart checked: `src/scripts/layout/shell.js:1118` (`escapeHtml(...).replace(/\n/g,'<br>')` = 실제 개행만 변환).

- `src/scripts/inventoryCount.js:660` — **MEDIUM** — document 전역 click 리스너가 `#detailPanel`·`#countBody` 밖 클릭이면 무조건 상세 패널을 닫는다 — 같은 페이지에서 body 에 붙는 '새 실사' 모달(`:150`)과 `showConfirm` 오버레이(`shell.js:1176`)를 클릭하는 순간 패널이 닫힌다 — counterpart checked: `src/scripts/layout/shell.js:1159` (`document.body.appendChild(overlay)`).

- `src/scripts/layout/shell.js:631` — **MEDIUM** — `toggleSidebarGroup` 이 `var header = items.previousElementSibling` 을 먼저 실행한 뒤 다음 줄에서야 `if (!items || !header) return` 로 검사한다 — `#groupItems{gi}` 가 없으면 가드에 닿기 전에 TypeError. 셸은 전 페이지 로드라 사이드바 마크업이 바뀌면 전역 클릭 핸들러가 통째로 죽는다.

- `src/scripts/purchaseInvoices.js:97` — **MEDIUM** — 매입확정 합계 미리보기가 수량을 DOM 텍스트에서 역파싱한다(`tr.children[1].textContent` → `replace(/[^0-9.]/g,'')`) — `fmt()` 가 `toLocaleString('ko-KR')` 로 소수 3자리에서 반올림하므로 소수 수량 라인에서 미리보기 합계가 서버 계산과 어긋나고, 단위 문자열에 숫자가 섞이면 수량이 오염된다 — counterpart checked: 같은 파일 `:6` `fmt` · `:79` 렌더부.

---

## 확인했지만 이상 없음 (1줄 나열)

법인 전환 축(`shell.js:857` `p.entityId != null`, `:880`/`:893` `=== 0` 비교, `switchEntity(0)`)은 falsy 함정 없음 · `localStorage.getItem('entityId')` 소비 4곳 모두 0 안전(`priceManagement.js:593` 은 의도된 0→1 폴백, `users.js:196`은 서버도 `|| 1` 이라 0 미저장) · shell 자체 폴링 4개(nav-badge 60s·알림 300s·생성 600s·토큰갱신 30m)는 전부 `document.hidden` 가드 + SPA `setInterval` 훅보다 먼저 등록돼 정리 대상 아님 · `X-SPA-Request:'1'` 정상 송신(`shell.js:1702`) · CSV·이미지·도면 다운로드는 전부 blob 경유(`inventoryTx.js` `receiving.js:246` `purchaseOrders.js:667` `storageZones.js:544` `items/modals.js:377`) · `/api/search` 4키 전량 반환이라 `doGlobalSearch` 의 무가드 `.length` 안전 · `/api/inventory/transactions` 가 `base_unit`/`pack_size`/`stock_mode` 를 실어 보내 `uomFormatStock` 정상 · Shift 범위선택은 `shell.js:2562` 단일 구현이고 재구현 페이지 없음 · 대량발송 상한은 서버 SSOT(`services/messageBulkLimit.ts`)가 4경로 전부 가드하고 클라는 예상비용만 표시(사본 없음) · MMS 100원 확인창 2곳(`shell.js:2315`·광고탭) 존재 · `purchaseInvoice.js:47` 의 `escapeHtml` 재정의는 셸 미로드 독립 페이지용이라 정상 · `dashboard.js:762` 폴링 규약 준수.

## 기각한 후보 (이유)

- `items/core.js:3` `var allItems` ↔ `inventory.js:3` 동명 — 두 파일이 같은 페이지에 concat 되지 않음(`pages/items.ts` vs `pages/inventory.ts`).
- `purchaseOrders.js:656` `getElementById('receiveModal').addEventListener` 무가드 — `pages/purchaseOrders.ts:116` 에 해당 id 실재.
- `inventoryCount.ts:67` 카운트 쿼리 바인딩 수 불일치(scope=mine) — 라우트 내부 결함이라 다른 슬라이스 소관.
- `messages.js` 클라에 발송 상한 미러 없음 — 서버가 정본 가드이고 메모리 노트가 "500=임의값"이라 미러가 오히려 이중 소스.
- `weeklyPurchase.js` 의 `alert/confirm` 사용 — 스타일 규약 위반이나 동작 결함 아님(동일 사유로 `inventoryValuation.js:60`·`inventoryCount.js:528` 도 제외).
