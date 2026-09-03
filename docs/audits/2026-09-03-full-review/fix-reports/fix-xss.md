# 번들 ② 수정 보고 — 반사 XSS · innerHTML · CSV 수식 주입

브랜치 `session/fix-xss` (worktree `C:\Users\user\dongsan_mes-worktrees\fix-xss`)
기준 감사 = `docs/audits/2026-09-03-full-review/sec-sqli-xss.md` Category 2 / 2b

**결과: 수정 41건 · SKIP 0건** (감사가 기각한 오탐은 손대지 않음)

---

## A. 페이지 템플릿 반사 XSS (4건 + 1건 추가)

| 파일:줄 | 조치 |
|---|---|
| `src/pages/purchaseInvoice.ts:6` | `parseInt`+`isNaN` → 400. 인라인 `<script>`의 `var PO_ID = ${poId}`로 `/purchase-invoice/1;alert(1)`가 실행되던 CRITICAL |
| `src/pages/hrDetail.ts:8` | `parseInt`+`isNaN` → 400 (`clientDetail.ts:7`과 동일 규칙). `data-employee-id="${id}"` 속성 탈출 차단 |
| `src/pages/payslip.ts:8` | 단일 모드 `id`는 정수 검증 → 400 |
| `src/pages/payslip.ts:188-192` | `JSON.stringify` → 신규 `jsonForScript`. `</script>` 조기 종료 차단. **`?period` 쿼리도 같은 결함이라 함께 처리**(감사 미기재) |
| `src/pages/yearEnd.ts:11` | `isNaN(year)` 검사 추가 (`${year}`가 `<title>`에 삽입됨) |
| `src/utils/escapeHtml.ts:15` | 신규 `jsonForScript()` — `JSON.stringify` 후 `<` → `\u003c`. 값은 동일, HTML 파서는 태그로 보지 않음 |

## B. innerHTML / 속성 싱크 (26건)

### 신규 전역 헬퍼
`src/scripts/layout/shell.js:121` **`window.escapeJsAttr`**

`escapeHtml` 만으로는 `onclick="fn('...')"` 안이 **안전하지 않다**. HTML 파서가 속성값의 엔티티를
먼저 디코딩한 뒤 그 결과를 JS로 컴파일하므로 `&#039;`가 살아있는 따옴표가 되어
`a');alert(1);//` 가 실행된다. 그래서 ①JS 문자열 이스케이프 → ②HTML 속성 이스케이프 **순서**로 처리한다
(순서를 바꾸면 무효). 왕복 검증 완료: 8개 페이로드 전부 원값 복원 + 탈출 실패.

> ⚠️ 감사 문서 61줄의 "escapeHtml이 `'`를 이스케이프하므로 onclick 인자는 안전하다"는 **오판정**이다.
> 이 전제로 오탐 처리된 `inventory.js:223`·`ledger.js:198`도 실제 취약이라 함께 고쳤다.

### escapeJsAttr 적용 (onclick 내부 JS 문자열)
| 파일:줄 | 기존 결함 |
|---|---|
| `src/scripts/cards/actions.js:94` | `replace(/'/g,'\x27')` = 같은 문자라 **무동작** |
| `src/scripts/accounting.js:186` | `"` 미이스케이프 → 속성 탈출 |
| `src/scripts/items/modals.js:559,627` | `'`만 백슬래시 처리, `"` 통과 |
| `src/scripts/payroll.js:54-56` | 직원명·휴대폰 `"` 통과 |
| `src/scripts/cardExpenses.js:224,485,607` | `receipt_image_url`·`icon`·`color` 무가공 |
| `src/scripts/cashSchedule.js:366,368` | 백슬래시 미중복 → `\'`로 문자열 종료 |
| `src/scripts/inventory.js:223` | escapeHtml 뒤 replace = 무동작 |
| `src/scripts/clients.js:277`·`ledger.js:198,821`·`inspections.js:54`·`orderForm/finishing.js:64`·`taxInvoices.js:1444` | 동일 무동작 패턴 (감사 미기재 형제 5곳) |

`inspections.js:54`는 `\\\'` 과다 이스케이프로 **onclick이 SyntaxError였다** — 함께 정상화.

### escapeHtml 적용 (텍스트·속성 싱크)
`forecast.js:89,128,156` · `bank.js:2159` · `items/core.js:196` · `inventoryCount.js:119` ·
`productionReports.js:149` · `taxInvoices.js:597` · `orders.js:1387,1395` ·
`postProcessing.js:124,129,134` · `reports.js:395`

### 독립 페이지
`src/scripts/purchaseInvoice.js` — 공급업체·자사 전 필드(상호·대표·주소·전화·팩스·업태/종목·담당자),
품목명·단위·비고·발주번호·납품장소·비고. 전역 shell 미로드라 파일 내 지역 `escapeHtml` 사용.

## C. CSV 수식 주입 · 행 정합성 (7건)

서버 `src/utils/csv.ts`의 `escapeCsvField`/`generateCsv`와 클라 SSOT `window.dsCsvCell`은
**이미 가드가 있었다**(#367). 우회하던 경로만 SSOT로 되돌렸다.

| 파일:줄 | 조치 |
|---|---|
| `src/scripts/vatReports.js:198-224` | 전 셀 `dsCsvCell` 경유. **납부세액 행 콤마 1개 부족** → `세액` 열에 찍히던 것을 `합계` 열로 정정 |
| `src/scripts/ledger.js:1063,1073,1565,1574` | 4개 export 전부 `dsBuildCsv`로 조립. `exportSuppliersCSV`는 따옴표 이중화가 없어 업체명에 `"` 하나면 행이 깨졌다 |
| `src/routes/ledger/accounts-payable.ts:1054` | 헤더 8열 / 행 7값 → `잔액`이 `감액` 열에, `비고`가 `잔액` 열에. 감액은 위에서 `credit`으로 합산하므로 **헤더의 `감액` 열 제거** |

서버 헬퍼 `payroll/tax-agent.ts:23 csvField`·`shipments.ts:1416 esc`는 확인 결과 이미
`escapeCsvField` 위임 → **변경 없음**. 클라 `pmCsvCell`/`tiCsvCell`/`prCsvCell`도 `dsCsvCell` 위임 확인.

### 회귀 테스트 신설
`scripts/csv-guard-selftest.cjs` (`npm run test:csv-guard`, `test:calc`에 포함)
- `=HYPERLINK(...)` 중화 · `@SUM`·`+82`·선행 탭/CR 중화
- `-1234`·`-1,234`·`-12.5`·number 음수 **보존**(금융 CSV 텍스트화 회귀 방지)
- 따옴표 이중화 · 콤마/개행 인용 · `generateCsv` BOM/CRLF 조립
- **서버 `escapeCsvField` ↔ 클라 `dsCsvCell` 20입력 대조** — 한쪽만 고치면 실패

## D. 범위 밖 (지시대로 미조치)
CSP 미설정(`src/index.tsx:244`) · 인증 변경 — 다른 번들 소관.
`equipment.js:1355`(LOW, 요소 텍스트 컨텍스트라 안전) 미변경.

---

## 게이트

| 게이트 | 결과 |
|---|---|
| `npm run typecheck` | 통과 |
| `npm run build` | 통과 (445 modules) |
| `npm run check:dom` | 통과 (109 파일) |
| `node scripts/sort-audit.cjs` | P1 0건 |
| `npm run test:calc` | 통과 (CSV 가드 42건 포함) |

## 커밋

| 해시 | 내용 |
|---|---|
| `d3d1269d` | A — 페이지 템플릿 반사 XSS + `jsonForScript` |
| `35ccfdc3` | B — `escapeJsAttr` 신설 + 19개 스크립트 이스케이프 |
| `d5377860` | C — CSV 수식 가드/행 정합성 + `csv-guard-selftest` |
