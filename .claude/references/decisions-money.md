# 설계 결정: 금액 포맷 규칙 (2026-04-14 확정)

단일 소스: `src/layout.ts`의 `window.fmtMoney` / `window.parseMoney` / `window.attachMoneyInput` / `window.bindMoneyInputs` / `window.collectMoneyFields`

## 1. 저장 vs 표시 분리
- **저장 (DB/API)**: 순수 정수 (`1234567`)
- **표시 (DOM/input)**: 콤마 포맷 (`1,234,567`)

## 2. 입력 필드 규칙
```html
<input type="text" inputmode="numeric" data-money id="..." value="...">
```
- `type="number"` **금액에는 사용 금지** (콤마→NaN). 수량/일수/연도 등 비금액은 OK.
- `data-money` → `bindMoneyInputs`가 자동 바인딩 (입력·blur 시 콤마 포맷)
- 동적 행 삽입 후 `window.bindMoneyInputs(rowEl)` 필수 호출
- 빈 input은 `null` 전송 (`0`과 구분)

## 3. 표시 포맷
- `null`/`undefined`/빈값 → `-` | `0` → `0` | 양수 `1,234,567` | 음수 `-1,234`
- 통화 `원`은 표시 계층에서만. 입력 필드 제외.
- 축약(`1.2억`, `345만`)은 KPI 카드 등 좁은 공간만. 원장/상세는 풀 표기.
- 숫자 셀: `text-right tabular-nums`

## 4. 전역 함수 (`layout.ts` SHARED_AUTH_JS)

| 함수 | 용도 |
|------|------|
| `fmtMoneyInput(v)` | input 채우기 (빈값→'', 숫자→콤마) |
| `fmtMoney(n)` | 표시용 (빈값→'-', 숫자→콤마) |
| `parseMoney(str)` | 문자열→숫자 파싱 |
| `readMoney(id)` | element ID로 금액 읽기 |
| `escapeHtml(str)` | XSS 방지 HTML 이스케이프 |
| `emptyRow(colspan, msg, icon)` | 빈 테이블 행 생성 |
| `handleApiError(error, fallbackMsg)` | axios catch 공통 에러 처리 |

## 5. 폼 제출 흐름
```js
// 채우기(로드 시)
document.getElementById('foo').value = fmtMoneyInput(resp.amount || 0);
// 제출 시
var amount = parseMoney(document.getElementById('foo').value);
await axios.post('/api/...', { amount: amount });
```

## 6. 음수 실제 케이스
- `yearEndManage.refundBadge` — 환급/추징 (`fmt(n)` 자동 `-1,234`)
- `ledger.renderAdjustmentsTable` — 감액/할인/클레임

## 7. 비금액 숫자 (`type="number"` 유지)
수량(`receiptQuantity` 등), 시간/일수(`prOvertimeHrs` 등), 연도/카운트, 요율(%), 온도, 설정값

## 8. HTML 패턴
```html
<!-- 표시 -->
<td class="px-4 py-3 text-right tabular-nums">1,234,567</td>
<!-- 입력 -->
<input type="text" inputmode="numeric" data-money name="base_salary"
       class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-right tabular-nums">
```

## 레거시 허용
기존 `function fmt(n) { return (n||0).toLocaleString(); }` 유지 가능. 신규 코드는 `window.fmtMoney` 필수.
