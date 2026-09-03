# 슬라이스 H 결과 — 검사 94파일 / 26,398줄

대상: `src/pages/**/*.ts`(90파일·24,183줄) · `src/layout/*.ts`+`src/layout.ts`(5파일·1,263줄) · `src/templates/*.ts`(3파일·952줄).
백틱 이스케이프·핸들러 정의·중복 id 는 전수 스크립트 감사(3종)로 돌린 뒤 후보를 개별 대조했다.

### 조치 필요 (심각도순)

- `src/pages/orderForm.ts:530` — **HIGH** — 유통 주문서의 「부속품」 버튼이 `addAccessoryRow()` 를 부르는데 이 페이지가 그 스크립트를 인라인하지 않는다 — `/order-form?type=dist` 에서 부속품 버튼 클릭 시 `ReferenceError` 로 죽는다(생산 주문서 쪽은 정상). pageScript(`orderForm.ts:595`)= `[deliverySlot, orderFormDist]` 이고 정의는 `src/scripts/orderForm/itemRow.js:444` (`window.addAccessoryRow`) — counterpart checked: `src/scripts/orderFormDist.js`(전 함수 목록에 없음)·`src/scripts/shared/deliverySlot.js`(없음)

- `src/pages/clients.ts:242` · `:247` — **HIGH** — 거래처 모달의 우편번호·상세주소가 **생성·수정 어느 경로에도 저장되지 않는다** — 입력해도 저장 직후 다시 열면 항상 빈칸이고, 컬럼은 존재하는데(SELECT 목록 `routes/clients.ts:273-276`) 쓰기만 빠져 영구 유실된다. 클라는 보낸다(`src/scripts/clients.js:437-438`) — counterpart checked: `src/routes/clients.ts:851-857`(INSERT 컬럼 목록에 `postal_code`·`address_detail` 없음) · `:922-1060`(PUT `updates.push` 전량에 없음)

- `src/pages/clients.ts:252` · `:288` — **HIGH** — 배송지·비고가 **신규 등록에서만** 소리 없이 버려진다(수정 저장은 정상) — 거래처를 새로 만들며 「배송지(화물 지점명)」·「비고」를 채우면 그대로 사라지고, 한 번 더 수정 저장해야 들어간다 — counterpart checked: `src/routes/clients.ts:851-857`(INSERT 에 `delivery_address`·`notes` 없음) vs `:985`·`:1001`(PUT 은 처리) · 전송은 `src/scripts/clients.js:446-447`

- `src/templates/laborContract.ts:400` — **HIGH** — 월급제 근로계약서 제6조의 「월 급여」에 **월급이 아니라 시급**이 인쇄된다 — 기본급 2,700,000원 계약서가 「월 급여: 12,919원」으로 나가는, 서명해 보관하는 법정 서식의 금액 오류다. 같은 함수가 올바른 총액을 `totalPay`(`:76`)로 계산해 놓고 쓰지 않는다 — counterpart checked: `src/routes/hr.ts:1270`(`rate = hourly_rate || floor(base_salary/baseH)` = 진짜 시급 저장) · `:1466`(`hourly_rate: row.hourly_rate` 그대로 전달) · `src/scripts/laborContracts.js:475`(`hourly = round(inputAmount/209)`)

- `src/pages/laborContracts.ts:141` · `:146` — **HIGH** — 기존 계약서를 **수정**하면 기본급·「고정연장(아침 30분)」 변경이 저장되지 않는다 — 체크를 켜고 저장해도 모달을 다시 열면 옛 값이고(`laborContracts.js:245`가 저장된 `overtime_daily_hours`를 읽는다), `monthly_salary`도 갱신되지 않아 총액 복원(`:243`)까지 옛 값으로 되돌아간다. 신규 등록(POST)은 정상 — counterpart checked: `src/routes/hr.ts:1319-1323`(PUT `ALLOWED` 에 `base_salary`·`overtime_daily_hours`·`overtime_work_days`·`base_hours_monthly`·`monthly_salary` 없음) vs `:1274-1282`(POST 는 전부 INSERT) · 전송은 `src/scripts/laborContracts.js:282-285`+`:292`(PUT)

- `src/pages/quotation.ts:32` · `:40` · `:130` — **MEDIUM** — 견적서는 `renderPage` 를 안 쓰는 독립 HTML 인데 `var(--c-primary)` 를 쓴다 — 이 변수는 `src/layout/shared-styles.ts:6` 의 `:root` 에만 있어 이 페이지에서는 **미정의**다. CSS 규칙상 미정의 `var()` = `unset` 이라 `.no-print` 배경이 투명해져 `color:#fff` 인 툴바 제목이 회색 배경(`body{background:#e5e7eb}`) 위 흰 글씨가 되고, `.btn-print`(`:40`)는 `color` 가 `unset`→상속으로 흰색이 되어 **흰 버튼에 흰 글씨**가 된다. 이메일 모달의 「발송」 버튼(`:130`)도 흰 모달에 배경이 사라져 같은 상태 — counterpart checked: `src/layout/shared-styles.ts:6`(정의 위치) · `src/pages/quotation.ts:8`(자체 `c.html`, SHARED_CSS 미포함)

- `src/pages/messages.ts:17` — **MEDIUM** — `id="msgChannelInfo"` 가 전역 메시지 발송 모달의 같은 id 와 충돌한다 — `/messages` 에서는 pageContent 가 모달보다 먼저 렌더되므로 `getElementById` 가 KPI 카드를 집는다. 그래서 모달의 채널·SMS/LMS 표시가 영영 갱신되지 않고, 본문을 타이핑하면 KPI 카드의 카카오 채널 ID 가 「SMS」/「LMS」로 덮어써진다 — counterpart checked: `src/layout.ts:133`(전역 모달의 같은 id) · `src/layout.ts:72` vs `:76`(문서 순서) · `src/scripts/layout/shell.js:1971`·`:2112`(쓰기 지점) · `src/scripts/messages.js:54`(KPI 쓰기)

- `src/pages/yearEnd.ts:305` — **MEDIUM** — 간편 원천징수영수증의 발행 법인이 `동산기획` 하드코딩이다 — 선명(2)·청주(3) 소속 직원의 영수증이 남의 법인 이름으로 발행된다. 같은 성격의 다른 서식은 전부 법인을 받아 쓴다 — counterpart checked: `src/pages/payslip.ts:293`·`:317`(`p.entity_name || '동산기획'`) · `src/templates/payslipHtml.ts:75`(동일) · `src/templates/employmentCertificate.ts:219`·`laborContract.ts:327`(`entity.name` 파라미터)

- `src/pages/yearEnd.ts:10` — **MEDIUM** — `year` 만 `isNaN` 검증에서 빠졌다 — `/year-end/5?year=abc` 는 400 대신 200 으로 뜨고 `<title>NaN년…</title>`·`var YEAR = NaN` 이 되어 월별 조회(`:196` `YEAR + '-' + …`)가 전부 어긋난 빈 표로 렌더된다 — counterpart checked: `src/pages/yearEnd.ts:11`(`employeeId` 만 검증)

- `src/pages/settings.ts:810` — **MEDIUM** — 창고 구역 모달의 「배치도 영역」 select 이 죽어 있다 — 옵션이 `미지정` 하나뿐이고 채우는 코드가 없으며, 저장 payload 에도 들어가지 않아 고를 수도 저장할 수도 없다. 같은 모달의 나머지 필드는 모두 살아 있다 — counterpart checked: `src/scripts/storageZones.js:113`(`zoneModalManager` 는 채운다) · `:171-173`(payload 에 `zoneModalFacilityZone` 없음) · `facility_zone` 는 `src/scripts/equipment.js` 에만 존재

- `src/pages/invoice.ts:63` — **MEDIUM** — 거래명세서 툴바의 「이메일 발송」 버튼이 `var(--c-primary)` 배경을 잃는다 — 위 견적서와 같은 원인이나 `.no-print` 자체는 `#1e40af` 하드코딩이라 글씨는 읽힌다(버튼 형태만 사라짐) — counterpart checked: `src/pages/invoice.ts:8`(독립 `c.html`) · `src/layout/shared-styles.ts:6`

### 확인했지만 이상 없음 (1줄 나열)

백틱 `\'`→`\\'` 이스케이프 트랩 = **슬라이스 H 전역 0건**(`src/pages`·`src/layout`·`src/templates` 에 단일 백슬래시 형태가 아예 없다 — 전부 `&apos;` 로 우회, `layout.ts:85-89,116,126` 등) · 인라인 핸들러 정의 누락 = 전 페이지 스크립트 감사 결과 위 1건 외 0건 · 페이지 내 중복 `id=` 0건, 셸 id 충돌은 `msgChannelInfo` 1건뿐 · 요청받은 request-derived 보간은 8개 페이지뿐이고(`clientDetail`·`invoice`·`quotation`·`orderForm`·`yearEnd` + 기보고 3건) 전부 `parseInt` 로 숫자화되어 컨텍스트 이탈 불가 · `orderForm`↔`quotationForm`↔`clients` 중복 블록은 CSS 5줄(`.item-dd`·`.client-modal*`)뿐이고 동작 분기 없음 · `payslip.ts`↔`payslipHtml.ts` 는 법인·이스케이프·비과세 주석까지 일치 · `employmentCertificate`↔`laborContract` 는 둘 다 `entity` 파라미터 경유로 3법인 대응 · 발주서 폼(`internal_notes`·`delivery_location`)·입고 모달(`receipt_notes`)은 라우트까지 왕복 정상 · 로그인 페이지는 토큰 키 `token` 이 `shell.js` 와 일치하고 redirect 파라미터를 아예 받지 않아(하드코딩 `/cards`) 오픈 리다이렉트 없음 · `submit` 버튼 이중 제출은 `preventDefault`+`safeSubmit` 로 차단됨

### 기각한 후보 (최대 5줄, 이유)

- `approvals.ts:39-92`(6개 필터 컨트롤) — `approvals.js:28-30` 이 `getElementById(prefix + '-search')` 로 이어붙여 읽는다. 리터럴 검색만으로는 안 잡히는 정상 패턴.
- `settings.ts:246-265`(`s_tax_*` 4개) — `settings.js:47`·`:130` 이 `'s_' + key` 로 접근하고 `TAX_KEYS`/`TAX_CHECKBOX_KEYS`(`:22`)에 들어 있어 저장·복원 모두 정상. `s_tax_provider` 는 `readonly` 표시 전용.
- `cards.ts:476`(`qrScanInput`)·`settings.ts:160`(`stampFileInput`)·`hr.ts:140`(`deptShowResigned`) — id 는 안 쓰이지만 인라인 핸들러가 `this`/`event.target` 로 값을 읽는다(`settings.js:27`·`departments.js:252`). 동작 정상.
- `templates/employmentCertificate.ts:8-12`·`laborContract.ts:8-12` — `new Date().getDate()` 가 Workers UTC 를 타지만, 실제 인자가 전부 날짜만 문자열(`issue_date: kstYmd()` `hr.ts:1573`·`hrSelf.ts:156`, `contract_date` 는 DB `YYYY-MM-DD`)이라 UTC 자정 파싱으로 하루 밀림이 발생하지 않는다.
- `yearEnd.ts:243,251,252`(`maskRrn`·`hire_date`·`dependents_count` 미이스케이프) — 저장형 XSS 성격이라 보안 슬라이스 소관이고, 값이 전부 관리자 입력 숫자·날짜라 실질 위험이 낮아 제외.
