# 슬라이스 D 결과 — 검사 47파일 / 약 22,400줄

검사 범위: `src/index.tsx` · `src/middleware/*`(4) · `src/services/*`(14) · `src/routes/` 잔여 라우터 28개
(auth, users, permissions, settings, clients, contactGroups, messages, messagesAd, messageTemplates, kakao,
fax, emails, notifications, search, files, dashboard, activityLogs, approvals, paymentRequests, facility,
equipmentQueue, rip, iaAuto, aiAnalysis, aiInsights, aiLayout, autoProcess, cron, migration, webhooks,
portal, mySelf, publicUnsubscribe, printEvents, scan, tasks, userPrefs, barobill, waste)

---

## 조치 필요 (심각도순, 24건)

- `src/routes/portal.ts:294` — **HIGH** — `/api/portal/dashboard` 가 존재하지 않는 `ledger` 테이블을 조회한다.
  `Promise.all` 안이라 전체가 reject → 고객 포털 대시보드는 **항상 500**. 같은 파일 `/balance`(:432)는 이미
  "`ledger` 테이블 미존재 → orders+payments 로 재작성" 주석과 함께 고쳤는데 `/dashboard` 만 남았다.
  검증: `migrations/` 555개 파일에 `CREATE TABLE ... ledger` 없음, 코드 전체에서 `FROM ledger` 참조는 이 줄뿐.
  consumer: `src/pages/portal/portalDashboard.ts`

- `src/routes/messages.ts:820-825` — **HIGH** — 알림톡 대량발송이 수신자별 치환 결과를 버리고 원본 템플릿을 보낸다.
  `messages`(:755)는 `applyVars`로 치환해 만들었는데 kakao 분기만 `msg: content.body`(원본)로 다시 만든다.
  수신자 2명 이상이면 `sendATSBulk`가 `msg.msg`를 그대로 XML에 실어(`barobillSms.ts:121`) **`#{고객명}` 리터럴이 발송**된다.
  미치환 가드(:762)는 치환된 `messages[0].msg`를 보므로 통과한다. 발송은 취소 불가.
  callee 확인: `src/services/barobillSms.ts:112-140`(다건) · `:88-110`(단건은 `msg.msg` 사용 → 1명일 때만 정상)

- `src/routes/printEvents.ts:660-674` — **HIGH** — `/batch` 경로가 첫 OK 이벤트에서 카드를 곧바로 `PRINT_DONE`으로 바꾼다.
  단건 경로(`:467-478`)는 `checkAllTilesComplete` → `autoCheckCardItem`을 거쳐 **모든 card_items 완료 시에만** 전환하는데,
  batch는 그 호출이 아예 없다 → 라인 3개 중 1개만 출력돼도 완료 · 타일 1장만 나와도 완료 · `card_items.print_completed`
  미체크 · `print_done_at` NULL · 주문 상태 미동기화. LogWatcher 오프라인 큐가 이 경로를 쓴다(:612 주석).
  caller 확인: 같은 파일 단건 핸들러 `:344-501`

- `src/routes/kakao.ts:1027-1029` — **HIGH** — `/send-sms-bulk` 의 `target_type=employees`에 entity 필터가 없다.
  형제 경로 `messages.ts:723`은 `entityFilter(c)`를 걸고 "필터가 없으면 타법인 직원에게 실제로 발송되고 건당 과금된다"고
  명시해 뒀다. 여기만 누락 → 동산 세션에서 사내 공지를 보내면 선명·청주 직원 전원에게 나가고 그만큼 과금된다.
  caller/대조: `src/routes/messages.ts:719-727`

- `src/routes/scan.ts:299-314` — **HIGH** — 스캔 출고가 재고 UPDATE와 원장 INSERT를 **별개 `.run()`** 으로 실행한다.
  바로 위 입고(:263-275)는 `db.batch([...])`로 묶여 있다. CLAUDE.md「원자성 — 재고와 원장은 같은 batch 에 넣는다」
  위반이며, INSERT가 실패하면 재고만 빠지고 증감내역이 빈다(문서가 기록한 사고 형태 그대로).
  대조: 같은 파일 `ITEM:stock-in` `:263`

- `src/routes/tasks.ts:262-275` — **HIGH** — 수동 재시도가 `retry_count`를 초기화하지 않는다.
  `/claim`(:156)이 `retry_count < max_retries`로 거르므로, 재시도 소진된 작업(`retry_count = max`)은 상태만 PENDING이
  되고 에이전트가 **영원히 집지 않는다**. API는 "Task requeued"를 반환해 실패가 보이지 않는다.
  파일 상단 주석이 "operators can manually retry"를 이 버튼의 목적으로 명시. consumer: `src/scripts/tasks.js:103`

- `src/routes/migration.ts:878-908` — **HIGH** — `/recalculate-all-balances`가 폐기된 `clients.balance` 캐시를 전 거래처에 다시 쓴다.
  ①`clients.ts:40`·memory `project-clients-balance-deprecated`가 폐기 선언한 컬럼이고 ②산식도 `deriveClientBalance`와 다르며
  (order_billing_groups 대신 orders.billed_amount + opening_balance) ③활성 2,800여 건을 **행별 UPDATE 루프**로 돌아
  Workers 1,000 subrequest 한도를 넘겨 중간에 죽는다 → 절반만 덮인 상태로 남는다.
  같은 문제: `:530-532` payments import 가 `balance = balance - ?` 를 payment INSERT와 별개 `.run()`으로 실행(비원자적).

- `src/routes/auth.ts:144` — **HIGH** — `/refresh` 가 `entityId: payload.entityId || 1`.
  ADMIN이 「전체」 모드(entityId=0)로 일하다 토큰이 2시간 이내로 남아 갱신되면 **조용히 법인 1로 바뀐다**
  (memory `feedback-multi-entity-session` 의 정확한 재발). 미들웨어(`middleware/auth.ts:26`)는 `!= null`로 올바르게 처리 중.
  같은 함정 로그인 경로: `auth.ts:44` `default_entity_id as number || 1`

- `src/routes/waste.ts:117` — **MEDIUM** — 로스율 분모가 항상 0이다. `print_status = 'COMPLETED'` 로 필터하는데
  `print_events.print_status`에 저장되는 값은 `OK|CANCEL|ERROR` 뿐이다(`printEvents.ts:363-366` 화이트리스트).
  → `output_sqm` 0 → 폐기물이 1건이라도 있으면 로스율이 **100%로 표시**된다. 코드 전체에서 'COMPLETED'를 쓰는 곳은 이 한 줄.

- `src/routes/aiInsights.ts:67,148` — **MEDIUM** — 여신 리스크 점수가 **폐기된 산식**으로 계산되고 DB에 저장된다.
  `SUM(orders.final_amount) − SUM(payments.amount)` 는 `clients.ts:204-206`이 "원장과 세 군데가 다르다며 폐기…
  잔액을 세는 곳은 deriveClientBalance 한 군데뿐"이라고 못박은 그 식이다. `calculate-all`(:142)은 그 결과를
  `clients.credit_risk_score/grade` 에 **영속화**하고, `/credit-risk/summary`(:29)는 잔액만 올바른 파생으로 보여줘
  등급과 금액이 서로 다른 근거를 쓴다. 미청구 주문까지 포함해 미수를 과대계상.

- `src/routes/auth.ts:11` + `src/index.tsx:253` — **MEDIUM** — 로그인 레이트리밋이 이중 적용돼 실효 한도가 반이다.
  두 미들웨어가 `rateLimit.ts:6`의 **같은 모듈 전역 Map**을 `ip:pathname` 동일 키로 쓴다 → 요청 1회당 카운트 2 증가
  → 3번째 시도에서 429. auth.ts 주석은 "현장 PC 공유 NAT 고려 10회"라고 의도를 적어 뒀다. 공유 NAT 사무실에서
  네 번째 사람의 로그인이 차단된다.

- `src/routes/clients.ts:215-218` — **MEDIUM** — `/:id/credit-check` 의 catch가 `{ success: true, data: { status: 'OK' } }`.
  여신 판정이 실패하면 화면에 **"이상 없음"** 이 뜬다(fail-open). memory `feedback-silent-catch-shape-mismatch` 형태.
  consumer: `src/scripts/orderForm/client.js:172` — 주문서 여신 경고 배너가 여기 하나에 달려 있다.

- `src/routes/portal.ts:754-770` — **MEDIUM** — 고객 원장 문서에 기간 **상한이 없다**.
  `periodEnd`(metadata.period_end)를 읽어 헤더에 `${sixMonthsAgo} ~ ${today}`로 찍으면서, orders·payments·adjustments
  세 쿼리 모두 `>= sixMonthsAgo` 만 걸고 `<= today` 를 빼먹었다 → 지정 기간 이후 거래가 섞여 나간다(고객 발송 문서).

- `src/routes/portal.ts:433-448` — **MEDIUM** — 포털 미수금이 내부 원장과 다른 산식이다.
  `orders.billing_status='BILLED'` − payments 로만 계산해 **adjustments(에누리·대손)를 빼지 않고**,
  청구 정본인 `order_billing_groups`도 안 본다(`ledger/ar-helpers.deriveClientBalance` 기준). 항목별 `paid_amount`는
  0 하드코딩이라 이미 결제된 건도 미수로 나열된다. 고객이 보는 금액과 내부 금액이 어긋난다.

- `src/middleware/permissions.ts:10,45` — **MEDIUM** — 권한 캐시가 모듈 전역인데 TTL이 없고 무효화가 isolate 로컬이다.
  `PATCH /api/permissions`(`permissions.ts:103`)의 `invalidatePermissionCache()`는 그 요청을 처리한 isolate만 지운다
  → 다른 isolate는 캐시가 살아 있는 한 옛 권한을 계속 적용한다. ADMIN이 권한을 줘도 사용자가 403을 계속 받고,
  회수해도 접근이 남는다. 관측 가능한 오류가 없어 "왜 안 되지"로만 드러난다.

- `src/routes/messages.ts:762` · `src/routes/messagesAd.ts:336` — **MEDIUM** — 미치환 변수 검사가 **첫 수신자만** 본다.
  자동 변수 9종은 `varsFor`가 항상 채우지만 엑셀 열(`r.vars`)은 행마다 있고 없다 → 1행에 있고 57행에 없으면
  57번 수신자에게 `#{담당자}` 가 그대로 발송된다. 광고 경로(:336)도 같은 형태.

- `src/routes/rip.ts:1262,1270,1277,1285` — **MEDIUM** — 장비 실적 통계가 한 응답 안에서 날짜 축이 갈린다.
  일별/월별은 `date(print_completed_at)`(UTC), 오늘 요약(:1298)은 KST. `utils/printEventDay.ts` 가 주석으로
  "**전부 여기를 쓴다. 리터럴 금지**" 라고 명시하며 정확히 이 증상(KST 00~09시 출력이 차트에서 전날로 이동)을
  고치려고 만들어진 SSOT인데 이 엔드포인트가 빠졌다.

- `src/routes/dashboard.ts:498,508,512` — **MEDIUM** — 장비 가동률이 `kstDateOf('pe.print_started_at')` 기준이다.
  `printEventDay.ts:15` 실측 기준 `print_started_at` 결측 429건은 **집계에서 통째로 빠지고**,
  같은 파일 `/stats/production-today`(:448)는 SSOT(`printEventKstDay`)를 쓰고 있어 두 위젯의 날짜 정의가 다르다.

- `src/routes/notifications.ts:325-336` — **MEDIUM** — `DELETE /cleanup` 에 역할 가드가 없다(라우터는 `authMiddleware` 뿐).
  로그인만 하면 누구나 30일 이상 알림 전량과 `portal_access_tokens`를 삭제할 수 있다. `?token_retention_days=1`로
  하루 지난 고객 포털 링크를 전부 무효화 가능(알림톡으로 이미 발송된 링크가 죽는다). 형제 `/generate`(:227)도 무가드.

- `src/routes/notifications.ts:29-37` — **MEDIUM** — `createIfNotExists` 중복 판정에 `entity_id`가 없다.
  `target_role + title + KST 당일` 로만 보는데 INSERT는 entity_id를 넣는다 → cron 이 법인 루프를 돌 때
  선명의 "납기 지연 3건"이 동산의 같은 제목 때문에 **조용히 생성되지 않는다**(건수가 같으면 제목이 같다).
  caller: `src/routes/cron.ts:156` (법인별 self-fetch 루프)

- `src/routes/migration.ts:236-244` — **MEDIUM** — 품목 재import가 단가를 0으로 밀어버린다.
  `base_price = ?` 에 `row.unit_price || 0` 을 바인드 → 단가 열 없는 파일을 다시 올리면 기존 품목 전부 base_price=0.
  같은 파일 거래처 import(:110)는 `credit_limit = CASE WHEN ? > 0 THEN ? ELSE credit_limit END` 로 막아 뒀다(형제 비대칭).

- `src/routes/migration.ts:389-393` — **MEDIUM** — 주문 이관 번호를 `COUNT(*)+1` 로 만든다.
  `orders.order_number`는 UNIQUE(`migrations/0001:131`)인데 ①MAX가 아닌 COUNT라 삭제 이력이 있으면 충돌
  ②패턴이 `'YYYYMMDD-%'` 라 현행 `E{n}-YYYYMMDD-NNN` 체계를 못 세고 구형식으로만 채번
  ③프로젝트 정본 `getNextEntitySeqNumber`(sequenceGenerator)를 안 쓴다. 충돌 시 행별 catch가 삼켜 "오류"로만 남는다.

- `src/routes/migration.ts:346-347,479-480` — **MEDIUM** — 주문·입금 이관이 `entity_id`를 **요청 body**에서 받는다
  (`entity_id || 1`). 세션 법인(`getEntityId`)은 `migration_logs`에만 쓰인다 → 법인 2 사용자가 법인 1로 매출·입금을
  적재할 수 있고, 로그와 실제 적재 법인이 어긋나 추적도 안 된다.

- `src/routes/messages.ts:657-698` — **MEDIUM** — 이메일 대량발송에 상한·중복통합·수신거부 가드가 전혀 없다.
  `target_type=clients` 는 전 거래처 이메일을 뽑아(:662) **순차 `sendEmail` 루프**를 돈다. 건당 fetch 1 + 로그 INSERT 1이라
  2,800건이면 Workers subrequest 한도에서 중간에 죽고, 어디까지 나갔는지 응답에 남지 않는다.
  문자 경로는 `applyAudienceGuards`·`checkBulkLimit`을 거치는데(:741,:797) 이메일 분기는 그 앞에서 return 한다.

- `src/routes/paymentRequests.ts:167-172` — **MEDIUM** — `/from-po/:poId` 가 발주서를 entity 필터 없이 읽는다.
  타법인 발주서로 지출결의서를 만들 수 있고, 생성되는 결의서는 요청자 법인(:185)으로 귀속돼 법인 간 자금 예정이 섞인다.
  같은 파일의 다른 모든 경로(:92, :104, :227, :273…)는 `entityFilter`를 건다.

---

## 확인했지만 이상 없음 (1줄 나열)

`middleware/auth.ts` entityId 0 보존(`!= null`) · `agentKeyOrAuth` 전역 entity 의도적 0 · `entityFilter/cardEntityFilter/orderVisibilityFilter` 시맨틱 · `messagesAd` 광고 강제 가드(광고표기·야간차단·6개월 동의·수신거부·상한) 전 경로 적용 · `messageCompliance` 토큰 재사용·마스킹·`parseSendDT` UTC 환산 · `publicUnsubscribe` 무인증+마스킹+레이트리밋 · `barobillClient.assertBarobillQueryOk`/`stripBarobillErrorRows`(카드·계좌 양쪽 적용 확인) · `barobillSms` SMS/LMS/MMS 다건이 `msg.msg || content` 로 수신자별 본문 반영 · `budgetAlert` 감시실패 자체를 알림(감시 공백 차단) · `cron` 서비스토큰 15분·X-Agent-Key·ANALYZE 마지막 단계 · `userPrefs` 전 경로 토큰 user_id 스코프 · `contactGroups` AUTO/MANAGE 분리·직원 법인 가드·바인드 청크 · `messageTemplates`·`emails` entity read-back 게이트 · `files` R2 키 sanitize·`..` 차단·ADMIN 게이트 · `dashboard /stats` 18개 `ef.params` 바인드 순서(CTE 선행 포함) 정확 · `clients` 목록 서브쿼리→GROUP BY 조인 재작성 및 바인드 순서 · `printEvents` LIKE 50B 회피(substr)·probe 마커 제외·nest 멤버 매칭 · `aiAnalysis` PATCH 세대 가드(`status='processing'`)로 lost-update 차단 · `tasks`/`approvals`/`autoProcess`/`rip` 설비·소모품·정비 경로 entity read-back · `facility` `agent_heartbeats` MAX+bare 컬럼(SQLite 특례라 정상) · `equipmentQueue` `priority` INTEGER 확인(정수 기록 정상) · `index.tsx` 라우트 셰도잉(`/billing-groups`·`/name-index`·`/batch-results`·`/audit-dimensions`·`/_/stats` 모두 `:id` 앞 또는 세그먼트 수 상이)

## 기각한 후보 (5줄)

- `iaAuto.ts`·`autoProcess.ts` 의 `MARGIN_RULES` — memory `design-order-finishing-role` 의 "AP_MARGIN_RULES 부활 금지"와 이름이 다르고 소비자(`scripts/iaAutoProcess.js:201`)가 살아 있어 은퇴 대상인지 확정 불가 → 사용자 확인 필요, 결함 단정 불가.
- `rip.ts:495` `entityFilter(c,'e').clause` + `entityFilter(c).params` 혼용 — 값이 동일해 동작에 영향 없음(스타일).
- `index.tsx:213` 트레일링 슬래시 301 — 비-GET 요청 본문 유실 가능하나 실제 그런 호출 경로를 찾지 못함.
- `emailProvider.ts:58` `email_enabled !== '0'`(미시딩 시 활성) — RESEND_API_KEY 부재로 실제 발송은 차단되어 무해.
- `scan.ts:26` `decodeURIComponent` try 밖 — 잘못된 % 시퀀스가 400 대신 500이 되는 정도(전역 onError가 받음).
