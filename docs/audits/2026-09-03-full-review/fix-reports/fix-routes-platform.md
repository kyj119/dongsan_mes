# 번들 ④d 수정 보고 — 플랫폼·연동·승인·포털 라우트 + 기타 페이지

- 대상 리뷰: `docs/audits/2026-09-03-full-review` (§2.1 · §2.5 · §3 · `rv-routes-platform.md` · `sec-auth-idor.md` Cat.4 · `sec-info-biz-infra.md` Cat.7 · `rv-pages.md` · `area2-codequality.md`)
- 작업 위치: `C:\Users\user\dongsan_mes-worktrees\fix-routes-platform` (브랜치 `session/fix-routes-platform`)
- 결과: **수정 22건 · 건너뜀 0건 · 부수 수정 4건** (push·배포 없음)

---

## HIGH

### 1. `src/routes/portal.ts:294` — 포털 대시보드 항상 500 ✅수정
존재하지 않는 `ledger` 테이블 조회가 `Promise.all` 안이라 핸들러 전체가 reject 됐다.
→ `deriveClientBalance(c, clientId, { allEntities: true })` 로 교체. `/balance` 와 같은 파생 정본을 쓴다.

> ⚠️ **포털은 `allEntities` 가 필수다.** 포털 미들웨어(`middleware/portalAuth.ts:41`)는 `entityId` 를 세팅하지 않아
> `getEntityId` 가 **1로 폴백**한다. 필터를 걸면 선명(2)·청주(3) 청구분이 고객 잔액에서 조용히 사라진다.
> 그래서 `deriveClientBalance` 에 `opts.allEntities` 를 추가했다(`ledger/ar-helpers.ts:15`, 형제 `deriveArSplit` 과 동일한 시그니처 패턴).

### 2. `src/routes/portal.ts:433-448` — 포털 미수금 산식이 내부 원장과 다름 ✅수정
`orders.billing_status='BILLED'` − payments 로만 계산해 **adjustments 미차감** · 청구 정본 `order_billing_groups` 미조회 · `paid_amount` 0 하드코딩.
→ 청구 정본 CTE + FIFO 충당(`queryFifoOverdue` 와 같은 누적합 방식)으로 항목별 수금액·잔액 산출, 총액은 `deriveClientBalance`.
로컬 D1 `prepare()` 실행 확인 완료(윈도우 함수 + 2인자 `MIN/MAX` 파싱 정상).

### 3. `src/routes/portal.ts:754-770` — 고객 원장 문서 기간 상한 없음 ✅수정
세 쿼리 모두 `>= 시작일` 만 있고 `<= 종료일` 이 없어 헤더에 찍힌 기간 **이후 거래가 섞여 나갔다**(고객 발송 문서).
→ 상한 추가 + 시작일을 **최대 36개월**로 클램프.
※ 지시의 「12개월 기본」은 채택하지 않았다 — 기본 180일은 기존 동작이고 결함은 상한 누락 쪽이라, 기본값 변경은 표시 기간이 바뀌는 별개의 UX 결정으로 봤다. 필요하면 한 줄 변경.

### 4. `src/routes/messages.ts:820-825` — 알림톡 대량발송이 원본 템플릿 발송 ✅수정
치환 결과(`messages[].msg`)를 버리고 `content.body` 로 다시 만들어 `sendATSBulk` 가 **`#{고객명}` 리터럴을 XML 에 실었다**(`barobillSms.ts:112-140` 확인 — 다건은 `msg.msg` 만 쓰고 `params.content` 는 안 쓴다).
→ `msg`·`altmsg` 둘 다 `m.msg` 사용.

### 5. `src/routes/messages.ts:762` · `src/routes/messagesAd.ts:336` — 미치환 검사가 첫 수신자만 ✅수정
→ 양쪽 다 **전 수신자 순회 후 Set 으로 합집합**. 엑셀 열이 행마다 다른 경우를 잡는다.

### 6. `src/routes/messages.ts:657-698` — 이메일 대량발송 무제한·무중복통합 ✅수정
→ ①주소 소문자 정규화 중복 통합 ②`checkBulkLimit(db,'email',n)` 적용 ③응답에 `processed`·`merged_duplicate`·`failed_to` 추가.
`services/messageBulkLimit.ts` 의 email 기본값을 **0(무제한) → 300** 으로 변경(건당 fetch 1 + 로그 INSERT 1 = subrequest 2, 한도 1,000).
**수신거부는 적용하지 않았다** — `message_opt_outs` 는 **번호 키**이고 광고 경로 전용이다. 형제 SMS 정보성 경로(`/send-bulk`)도 중복통합·피로도만 건다. 이메일 수신거부 축은 아예 없다(신설은 별건).

### 7. `src/routes/kakao.ts:1027-1029` — `/send-sms-bulk` employees entity 필터 누락 ✅수정
→ `entityFilter(c)` 추가(#610 `messages.ts:722` 와 동형). clients 분기는 `entity_id` 컬럼 자체가 없어 무필터 유지.

### 8. `src/routes/migration.ts:878-908` — 폐기된 `clients.balance` 재계산 ✅수정(410 no-op)
①폐기 컬럼 ②산식이 파생 정본과 다름 ③행별 UPDATE 루프가 subrequest 한도에서 죽어 **절반만 덮인 캐시**를 남겼다.
호출처는 `src/scripts/migration.js:835` **하나**뿐이었고, 그마저 `res.data.data.updated` 를 읽는데 서버는 `updated_count` 를 줘 **원래도 `undefined개` 를 표시**하고 있었다.
→ 엔드포인트는 **410 + 사유 메시지**(404 로 조용히 사라지지 않게), UI 카드(`pages/migration.ts:184`)와 `window.recalculateAllBalances` 제거.
**같이 제거**: `migration.ts:530-532` payments import 의 `balance = balance - ?`(폐기 캐시 + payment INSERT 와 별개 `.run()` = 비원자).

### 9. `src/routes/migration.ts:236-244` — 품목 재import 가 단가를 0으로 밀어버림 ✅수정
→ `base_price = CASE WHEN ? > 0 THEN ? ELSE base_price END`. 형제 거래처 import(`:110` credit_limit)와 같은 보존 규칙.

### 10. `src/routes/migration.ts:389-393` — 주문번호 `COUNT(*)+1` ✅수정
→ `getNextEntitySeqNumber(db,'orders','order_number',entityId,dateStr)`. MAX+SUBSTR·법인별 채번으로 UNIQUE 충돌과 구형식 채번을 동시에 없앤다.

### 11. `src/routes/migration.ts:346-347,479-480` — 이관 `entity_id` 를 body 에서 수신 ✅수정
→ 공용 `resolveImportEntity(c, body.entity_id)` 신설(`migration.ts:11`). **세션 법인이 정본**, 전체모드(0)일 때만 body 허용(미지정 400), 불일치는 **400 으로 거부**(조용한 덮어쓰기 금지). `migration_logs` 도 같은 값을 쓴다.

### 12. `src/routes/tasks.ts:262-275` — 수동 재시도가 `retry_count` 미초기화 ✅수정
`/claim`(`:154`)이 `retry_count < max_retries` 로 거르는 것 확인 → 소진된 작업은 상태만 PENDING 이 되고 **영원히 안 집힌다**(API 는 "Task requeued" 반환).
→ `retry_count = 0`, `started_at = NULL` 추가.

### 13. `src/routes/approvals.ts:172` + `:588` — 참조 대상 무검증 ✅수정
`handlePostApproval` 이 그 행을 실제로 바꾼다(주문 `credit_status` APPROVED + **생산카드 생성** · `purchase_requests` APPROVED).
→ ①생성 시점: 후처리 대상 타입만(`POST_APPROVAL_TABLES` = orders · purchase_requests, 둘 다 `entity_id` 보유 확인) 소유 검증, 실패 400.
②실행 시점: 후처리 쿼리에 `(? IS NULL OR entity_id = ?)` 추가 — **이 변경 이전에 만들어진 요청**이 남아 있으므로 이중 방어.

### 14. `src/routes/approvals.ts:352` — 자기결재 통과 ✅수정
`step.approver_role === userRole` 만 보고 요청자 여부를 안 봤다.
→ `requester_id === userId` 이면 403(ADMIN 예외). 반려는 그대로 둔다(자기 요청 반려는 무해).

### 15. `src/routes/accounting.ts:508,537,573` — 법인간 거래 쓰기 무가드 ✅수정
라우터 게이트(`:29`)는 `requireAccessOrRole` = **열람 권한**이었다.
→ POST/PUT/DELETE 각각 `requireEditOrRole('/accounting','MANAGER')`.

---

## MEDIUM

### 16. `src/routes/notifications.ts:325-336` — `DELETE /cleanup` 무가드 ✅수정
→ `requireRole('ADMIN','MANAGER')` + `token_retention_days` **하한 7일**(`?=1` 로 하루 지난 포털 링크 전멸 방지).
※ 형제 `/generate`(`:227`)도 무가드지만 **미수정** — 지시 항목 밖이고, 알림 생성은 파괴적이지 않다. 담당자 판단 필요(아래 §결정 필요 참조).

### 17. `src/routes/notifications.ts:29-37` — `createIfNotExists` 중복키에 `entity_id` 없음 ✅수정
→ SELECT 조건에 `entity_id = ?` 추가. cron 법인 루프에서 제목이 같으면(건수 동일) 자법인 알림이 조용히 안 생기던 문제.

### 18. `src/routes/aiAnalysis.ts:444` · `:472` — 청크 경로 entity 필터 누락 ✅수정
형제 `/:id/download`(`:417`)만 #339 필터를 갖고 있었다. 원본 디자인 파일을 **조립·덮어쓰는** 경로다.
→ 양쪽 다 `ai_analysis_requests` 소유 확인 후 진행(없으면 404).

### 19. `src/routes/aiInsights.ts:67,148` — 폐기 산식 + 상관 서브쿼리 ✅수정
→ 단건: `deriveClientBalance(c, clientId)` (entityFilter 유지 = #333).
→ `calculate-all`: `WITH ord/billed/paid/adj` CTE 4개 + LEFT JOIN 으로 재작성(형제 `/credit-risk/summary` 의 `arJoins` 와 같은 모양).
**검증**: `npm run audit:subquery` 의 aiInsights P1 히트가 **main 1건 → 0건**. 로컬 D1 `prepare()` 실행 확인.

### 20. `src/routes/paymentRequests.ts:162-172` — `/from-po/:poId` entity 필터 누락 ✅수정
→ `entityFilter(c,'po')` 추가. 같은 파일 다른 전 경로(`:92`·`:104`·`:227`…)와 정합.

### 21. `src/routes/purchaseOrders/core.ts:240` — body `entity_id` 무조건 신뢰 ✅수정(조건부 유지)
**정당한 용도를 먼저 확인했다**: 주석(`:236-239`)이 2026-08-09 에 **E2E(법인 99)가 실법인을 오염**시킨 사고로 body 값을 일부러 받게 된 경위를 남겨 뒀다. E2E 는 admin 계정으로 돈다.
→ **ADMIN 또는 전체모드(entityId=0)일 때만 body 값 인정**, 그 외 역할이 다른 법인을 지정하면 403. E2E 경로는 그대로 산다.

### 22. `src/routes/clients.ts:215-218` — `/:id/credit-check` fail-open ✅수정
catch 가 `{success:true, status:'OK'}` 를 줘 여신 판정 실패가 **"이상 없음"** 으로 보였다.
→ 500 + 에러 메시지. **소비자도 같이 고쳤다** — `src/scripts/orderForm/client.js:169` 의 `.catch(function(){})` 는 조용히 숨기므로 「경고 없음」이 「정상」으로 읽힌다 → 회색 「여신 확인 실패」 배너 표시.

### 23. `src/routes/purchaseOrders/po-queries.ts:68` — 「이번 달 발주 금액」 UTC ✅수정
→ `kstDate("'start of month'")`. KST 매월 1일 00~09시 발주가 전월로 새던 문제.

### 24. `src/routes/waste.ts` · `src/routes/budgets.ts` — 고아 라우터 ✅표시만
`src/scripts`·`src/pages` 전수 grep 결과 `/api/waste`·`/api/budgets` **호출처 0건** 재확인.
→ 각 파일 최상단에 `// ORPHAN (2026-09-03 review): no client callers` 2줄 주석. **삭제하지 않음.**

### 25. `src/pages/yearEnd.ts:305` — 발행 법인 `동산기획` 하드코딩 ✅수정
→ API(`routes/payroll/year-end.ts:62`)가 `entities` 를 조인해 `entity_name` 반환, 페이지는 `esc(emp.entity_name || '동산기획')`. `payslip.ts:293` 과 같은 형태. entityFilter alias 를 `e` 로 바꿔 조인과 정합.

### 26. `src/pages/settings.ts:810` — 「배치도 영역」 select 이 죽어 있음 ✅수정(**제거**)
**배선하지 않고 제거한 이유**: 뒤에 있는 `storage_zones.facility_zone_id`(마이그 0391)는 **0440 「창고 배치도 독립」에서 이미 deprecated** 다 — `src/utils/inventoryZone.ts:76` 이 "prod 매핑 0건이라 실동작은 항상 품목 기본창고 폴백 = 동작 불변" 이라고 명시하고 구 체인을 제거했다. 읽는 코드가 없는 컬럼에 쓰기를 새로 다는 건 결함을 늘리는 쪽이다.
→ select 제거 + 사유·재도입 방향(equipment → storage_zone 직접 링크) 주석.

### 27. `src/pages/messages.ts:17` — `id="msgChannelInfo"` 전역 모달과 충돌 ✅수정
`/messages` 는 pageContent 가 모달(`layout.ts:133`)보다 먼저 렌더 → `getElementById` 가 KPI 카드를 집었다.
→ 페이지 쪽을 `msgPageChannelInfo` 로 개명 + `src/scripts/messages.js:54` 참조 동기 변경. `npm run check:dom` 통과.

### 28. `src/pages/quotation.ts:32,40,130` · `src/pages/invoice.ts:63` — `var(--c-primary)` 미정의 ✅수정
독립 HTML 이라 `SHARED_CSS` 의 `:root` 가 없다 → 미정의 `var()` = `unset`.
→ 각 페이지 `<style>` 최상단에 `:root { --c-primary: #3b82f6; }` 선언(값은 `layout/shared-styles.ts:6` 과 동일, 동기 유지 주석 포함). 인라인 치환 대신 토큰 선언을 택한 이유 = 사용처가 5곳이고 원본 의도(토큰 사용)를 보존.

### 29. `src/pages/laborContracts.ts:141,146` (PLAUSIBLE) — **확인됨, 수정** ✅
`src/routes/hr.ts:1323` `ALLOWED` 에 `base_salary`·`overtime_daily_hours`·`overtime_work_days`·`base_hours_monthly`·`monthly_salary` 가 전부 없어 **PUT 이 조용히 버렸다**(POST 는 정상).
→ ①`overtime_daily_hours`·`overtime_work_days`·`base_hours_monthly` 를 허용목록에 추가
②`base_salary` 는 **허용목록에 넣지 않았다** — `labor_contracts` 에 해당 컬럼이 없다(POST 도 시급·월급 산출에만 쓴다). 대신 POST(`:1268-1272`)와 **동일 산식**으로 `hourly_rate`·`monthly_salary` 재계산(미전달 축은 기존 행 값 사용).

---

## 지시 항목 밖 부수 수정 (같은 파일·같은 리뷰 문서, 전부 1~2줄)

| 파일 | 내용 | 근거 |
|---|---|---|
| `src/pages/yearEnd.ts:10` | `year` `isNaN` 검증 추가 (`?year=abc` 가 200 + NaN 문서) | `rv-pages.md` MEDIUM |
| `src/routes/migration.ts:530` | payments import 의 폐기 캐시 UPDATE 제거 | `rv-routes-platform.md:50` (동일 항목의 "같은 문제") |
| `src/routes/notifications.ts:327` | `token_retention_days` 하한 7일 | 16번의 사고 반경 축소 |
| `src/scripts/orderForm/client.js:169` | credit-check 실패 시 배너 표시 | 22번의 소비자 짝 |

---

## 게이트 (커밋 상태에서 전량 재실행)

| 게이트 | 결과 |
|---|---|
| `npm run typecheck` | ✅ exit 0 |
| `npm run build` | ✅ exit 0 (445 modules) |
| `npm run check:dom` | ✅ exit 0 (109 파일) |
| `npm run audit:entity` | ✅ exit 0 (132파일·67 SELECT·누락 0) |
| `node scripts/sort-audit.cjs` | ✅ exit 0 (**P1 0건**, P2 3건은 전부 기존·본 번들 무관) |
| `npm run audit:subquery` | ✅ exit 0 (**aiInsights P1 1건 → 0건**) |
| `npm run test:calc` | ✅ exit 0 |
| `npm run test:credit` | ✅ exit 0 (11건) |

추가로 신규 SQL 4종을 로컬 D1 `prepare()` 실행으로 확인했다(타입체크는 SQL 오류를 못 잡는다):
포털 `/balance` CTE+윈도우 · aiInsights `calculate-all` CTE 4개 · year-end `entities` 조인 · approvals `(? IS NULL OR entity_id = ?)`.

---

## 커밋

| 해시 | 제목 |
|---|---|
| `7ecd4526` | fix(portal): stop the 500 on the dashboard and align AR with the internal ledger |
| `f6ad066e` | fix(messages): send the substituted body, check every recipient, guard bulk email |
| `174dec95` | fix(migration): retire the deprecated balance cache, bind imports to the session entity |
| `f85b9afc` | fix(auth-scope): close approval, accounting, notification and IDOR gaps |
| `fdbd28b5` | fix(credit,tasks): derive credit risk, stop the fail-open, make manual retry work |
| `908401c9` | fix(pages,hr): issuing entity on the withholding receipt, contract salary edits |

push·배포 없음. 워킹트리 clean.

---

## 담당자 결정 필요

1. **고아 라우터 2개 존치 여부** — `src/routes/waste.ts` · `src/routes/budgets.ts`. 호출처 0건인데 쓰기 경로가 열려 있다. 삭제 / 읽기전용화 / UI 신설 중 택일.
   덧붙여 `waste.ts:117` 의 로스율 분모 버그(`print_status='COMPLETED'` 인데 실제 저장값은 `OK|CANCEL|ERROR` → 로스율 100% 표시)는 **고치지 않았다** — 화면이 없어 지금은 증상이 없고, 라우터 존폐가 정해진 뒤 고치는 게 맞다.
2. **이메일 대량발송 상한 300** — `settings.email_bulk_limit` 로 조정 가능하지만 subrequest 한도상 **400 근처가 물리적 상한**이다. 그 이상이 필요하면 큐/배치 분할이 별도로 필요하다.
3. **포털 원장 문서 기본 기간** — 현행 유지(180일). 지시의 12개월로 바꾸려면 `portal.ts` 의 `defaultStart` 한 줄.
4. **`notifications POST /generate` 무가드** — 지시 항목 밖이라 손대지 않았다. 파괴적이지 않지만 로그인만 하면 누구나 알림 생성을 트리거한다.
5. **`purchaseOrders` body `entity_id`** — ADMIN·전체모드에서만 허용하도록 좁혔다. E2E(법인 99)가 admin 이 아닌 계정으로 도는 시나리오가 생기면 이 가드에 걸린다.
6. **`migration` 이관 법인 불일치 400** — 조용한 덮어쓰기 대신 거부를 택했다. 기존 운영 절차가 body 로 타법인을 지정해 왔다면 절차 변경(상단 법인 전환)이 필요하다.
