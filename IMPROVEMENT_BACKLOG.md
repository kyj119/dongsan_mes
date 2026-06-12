# Improvement Backlog
<!-- last_run_area: 6 -->
<!-- last_run_at: 2026-06-12T12:00:00+09:00 -->

> 자율 점검·개선 에이전트(auto-improve)가 6개 영역을 순환하며 발견한 항목.
> 용준님이 주기적으로 리뷰하여 상태를 변경 (new → approved → done, 또는 rejected).

## 통계
| 상태 | 건수 |
|------|------|
| 🆕 new | 11 (open auto-improve **재실측 06-12T12:00 Area 6** — #388·#387·#386·#385·#384·#383·#382·#381·#379·#374·#373. **#377·#378 done-sync close 완료**(아래) → open 12건 = 11 new + #372 reviewed) |
| ✅ approved | 0 (직전 approved #342/#340 모두 done 확정·이관 — Area 6 검증 완료) |
| 👀 reviewed | 1 (#372 CSV truncation — owner 코멘트 "3번으로 진행, 최대 5000 제한" 06-11T00:25. ⚠️**모호**: #372 3번=페이지네이션 스트리밍(전량)인데 "5000 제한 유지"와 모순 → 구현 전 의도 확인 필요. 승인처리 워크플로우 대상) |
| ✔️ done | 81 (79 + **#378 done-sync**: 커밋 9be309d가 send-shipment-bulk status/fail_count/failures[] + 프론트 결과모달 추가로 부분/전량 실패 오보고 해소 + **#377 done-sync**: eadba44(autoProcess.ts /start·/approve item_name + ia_auto_enabled 게이트) + **96e98d2(이번 사이클, create.ts:643 주문생성 자동가공 경로 item_name 잔여분)** 두 경로 모두 정정) |
| ❌ rejected | 3 |

> 📦 **과거 사이클 로그**(아래 6블록 이전분)는 `IMPROVEMENT_BACKLOG_ARCHIVE.md`로 이관됨 (2026-06-10 정리). 신규 로그는 계속 이 파일 상단에 추가.

> **Area 6 자기 진화 (2026-06-12T12:00):**
> - **방법**: baseline `npm ci`+`tsc --noEmit` PASS + build PASS(391 modules, _worker.js 5.12MB). GitHub open/closed 전수 대조 + 직전 사이클(Area 5, 06-12T08:30)이 플래그한 **#377·#378 done-sync 미완** 후속처리 + 컬럼오타 클래스 재발(create.ts) git 추적. **인프라 특이사항**: 컨테이너가 detached HEAD(99159a9)로 시작 + shallow clone(depth 94) → 로컬 `origin/main` 추적ref(4993fa7)가 stale로 "unrelated histories" 오인 유발. `git ls-remote --heads`로 **실제 refs/heads/main = 99159a9 확정**(working base와 동일) → 정상 fast-forward 경로 확인, force/merge 회피.
> - **🔧 자동수정 1건 (A-019, 커밋 96e98d2 본 사이클) — #377 잔여분: 주문생성 자동가공 `create.ts:643` items.name→item_name**: #377 원 지목 위치(`orders/core.ts:1489`)가 파일분할로 `orders/create.ts:643`(D.자동가공 블록)으로 이동했는데, owner의 #377 픽스(`eadba44`)는 **autoProcess.ts /start·/approve만** 정정하고 이 주문생성 경로를 누락 → `SELECT id, name FROM items`(no such column: name) 잔존, best-effort catch(`:695`)에 삼켜져 `auto_process_jobs` INSERT 지속 미실행. `item_name`으로 정정(autoProcess.ts:96·#377 픽스와 동일). **안전 자동수정 판정**: ① 컬럼명 사실-정정(A-017 workbench cl.name·A-014 클래스) ② 원 이슈의 "휴면 write 활성화" 블로커가 **owner 머지 eadba44의 `ia_auto_enabled` 게이트(0308, 기본 OFF)로 이미 해소** — job 생성돼도 `/pending` 서빙이 게이트라 C# 워커 미노출 ③ owner가 이미 승인·머지한 동일 정정의 누락분 완성. verify PASS(tsc clean + build 391).
> - **🟢 GitHub↔백로그 done-sync 2건 (직전 Area 5가 플래그한 후속)**: ① **#378** — `9be309d`가 send-shipment-bulk 응답에 status(SUCCESS/PARTIAL/FAILED)·sent_count(실성공)·fail_count·failures[] + 프론트 결과모달(실패건 재발송) 추가로 부분/전량 실패 오보고 해소. 코드 직접 대조(kakao.ts:1063~·shipments.js:982/1001) 확정 → **close(completed)**. ② **#377** — eadba44(수동 경로) + 96e98d2(주문생성 경로, 위 A-019) 두 경로 모두 정정 완료 → **close(completed)**. 둘 다 코멘트로 근거 명시 후 close. done 79→81, new 13→11, open 14→12(11 new + #372 reviewed).
> - **🧬 SKILL 탐지규칙 강화 1건 — 파일분할 후 "부분 픽스" 회귀 점검**: 동일 버그가 분할 전 파일(core.ts:1489)과 분할 후 산재 위치(autoProcess.ts + create.ts) **양쪽에 존재**할 때, 이슈가 지목한 라인만 보고 픽스하면 형제 경로가 잔존. #377이 정확히 이 패턴(eadba44가 autoProcess.ts만 고치고 create.ts 누락). 점검법: 컬럼오타/로직버그 픽스 시 **`grep`으로 같은 안티패턴(`SELECT .* name FROM items` 등)을 코드베이스 전수 재확인** 후 close. (Area 2/6 codify — items.name 클래스 #377·#384·A-017 누적 3건)
> - **이상 없음**: baseline PASS. Approved 표 비어있음 유지. rejected 3 유지. `SELECT .* name FROM items` 잔여 재grep — create.ts 수정 후 **0건**(printSystem pm.name=print_methods alias·entities/employees/finishing_methods의 name은 해당 테이블 실컬럼=정상).
> - 자동 수정 1건(A-019 create.ts item_name, verify PASS), 신규 이슈 0건, **done-sync 2건 close(#377·#378)**, SKILL 탐지규칙 1건(분할 후 부분픽스 회귀)
>
> **Area 5 보안 (2026-06-12T08:30):**
> - **방법**: baseline `npm ci`+`tsc --noEmit` PASS + build PASS(383 modules). Area 5 **10회차** — 시의성(최근 churn: purchaseOrders/core.ts **5분할** f428617~6c89232 = po-queries/po-receipts/po-receive/po-special + templates/stock-alerts, 바렐 `purchaseOrders.ts` 집계) + 신선 4각도(시크릿폴백·CSV injection·독립페이지 XSS·ORDER BY/IN SQLi) 병렬 Explore 2개. 발견 전수 owner 직접 코드 Read + **git 분할직전 커밋(bb7bec6) 대조**.
> - **🟢 net-new 0건 — PO 5분할 보안 회귀 0 + 4각도 clean**:
>   - **시의성: PO 분할 = 보안 속성 완전 보존(git 대조)**. ① **authMiddleware**: 7개 서브라우터 전부 자체 `.use('/*', authMiddleware, requireAnyPagePermission('/purchase-orders','/receiving'))` 재선언(누락 0). ② **마운트 순서**: `purchaseOrders.ts:30-36` 구체경로(templates/stock-alerts/queries/receipts/receive/special) 전부 → core(`/:id`) 마지막 = 섀도잉 방지 정확. ③ **entityFilter 대칭**: receive(po-receive.ts:30 `#358계열`)·copy/reorder(po-special.ts:26/129)·invoice(po-queries.ts:159)·inspections(po-receipts.ts:262)·statement(po-receipts.ts:90/121)·receiving-queue(po-receipts.ts:402) 단건/변경 전부 `entityFilter(c[,'po'/'ir'])` 적용. ④ **requireRole**: 분할 전(bb7bec6) core.ts와 핸들러별 동일(POST/PUT/DELETE/status/copy/reorder/quick=ADMIN/MANAGER, receive만 무게이트=분할 전부터 동일).
>   - **🚫 서브에이전트 "HIGH" 오탐 2건 차단**: ① **`POST /:id/receive` requireRole 부재 = "STAFF 입고 가능 HIGH"** → 반증: 라우터 `requireAnyPagePermission`(`permissions.ts:66`)이 role별 `getAccessiblePages` 조회 후 미보유 403 = **실제 RBAC**. `/receiving` 권한 부여 role(창고 입고담당)만 도달 = 의도된 page-permission 접근모델. 입고는 ADMIN/MANAGER가 아니라 창고담당 업무라 requireRole 미적용 정상(분할 전부터 동일, 에이전트 본인도 "회귀 아님" 인정). → **드롭**(SKILL FP codify). ② **보상 DELETE entity_id 미필터**(po-receive.ts:287) → 같은 요청 내 방금 INSERT한 receiptId의 best-effort 롤백, 에이전트도 "race condition 필요·악용 어려움" 인정 = 노이즈. SKILL 기존 "보상 rollback DELETE 정상" 규칙 해당 → 드롭.
>   - **신선 4각도 clean**: ① 시크릿 폴백 `grep "c.env.[A-Z_]+ *|| *'"` **0건**(.github yml 포함). ② CSV injection: `utils/csv.ts:58` `escapeCsvField` 선행 `=+-@\t\r` 가드 + 숫자-안전(음수금액 보존), 4구현(csv/tax-agent/po-queries `generateCsv`) 전부 중앙 헬퍼 경유. shipments는 CSV export 자체 없음(list/stats만). ③ 독립 HTML XSS: `grep c.html src/pages` 13개 — payslip/yearEnd 로컬 `esc()`(기수정)·portalDocument `esc()`(textContent)·나머지 free-text innerHTML sink 부재 = 잔여 0. ④ ORDER BY: quotations/orders/cards/PO 6곳 전부 `sortOptions[sort] || default` 화이트리스트, IN절 `?` placeholder+bind.
> - **이상 없음**: open auto-improve **14건**(#373~#388 13 new + #372 reviewed) stats 정합. baseline PASS. #381(orders 쓰기 IDOR)은 별개 모듈(orders, PO 아님)이라 본 사이클 무관·open 유지.
> - 자동 수정 0건(net-new 없음), 신규 이슈 0건, **PO 5분할 보안회귀 0 git 대조 확정**, 서브에이전트 HIGH 오탐 2건 차단(page-permission gating·보상 DELETE), 신선 4각도 clean, SKILL 탐지규칙 2건 codify(분할 보안점검 체크리스트 + page-permission gating FP)
>
> **Area 4 데이터 정합성 (2026-06-11T20:00):**
> - **방법**: ground-truth — 305 마이그레이션 로컬 D1(node:sqlite) 전량 적용(**FAIL 0**, 172테이블/515인덱스) + baseline `npm ci`+`tsc --noEmit` PASS + build PASS(383 modules, _worker.js 5.10MB). Area 4 **10회차** — 시의성(최근 churn: split billing 0305/0306 order_billing_groups·workbench 0307·ia_auto 0308·equipment_entity 0302) + 신선 각도(CHECK↔쓰기값·UTC/KST 업무일자·신규 entity_id NULL) 병렬 Explore 2개. 발견 전수 owner 직접 코드 Read 검증.
> - **🔴 신규 이슈 #386 (MED bug) — split billing DRAFT 삭제가 obg.tax_invoice_id 미정리(cancel 경로와 비대칭)**: `createSplitInvoices`(helpers.ts:422)가 DRAFT 생성 시 그룹을 무조건 링크(tax_invoice_id=draftId, billing_status=NULL), 그런데 DRAFT 삭제(manage.ts:140-144)는 junction/items/header만 지우고 **obg.tax_invoice_id 미정리** → dangling 참조. 취소 경로(issue.ts:707)는 정확히 비움=비대칭 증거. 영향: ① issue.ts:261 재링크 `WHERE tax_invoice_id IS NULL`이 dangling 그룹 건너뜀(재링크 차단) ② orders/core.ts:427 주문상세에 phantom 계산서 노출. 재무/AR은 billing_status='BILLED' 필터라 영향 미미. **자동수정 안 함**: 재무 delete 경로 write 추가 + egress 검증불가(저위험이나 청구 데이터).
> - **🟡 신규 이슈 #387 (MED bug) — 청구그룹 동결이 order-wide → 혼합주문 미청구 entity stale 청구**: `recalcOrderBillingGroups`(helpers.ts:60-64) freeze가 BILLED/PAID 그룹 하나라도 있으면 **전 그룹 동결**(all-or-nothing). 혼합법인 주문 부분청구 후 미청구 entity 품목 편집(PUT, update.ts:39-46이 BILLED 주문 편집 허용) 시 그 그룹 미갱신 → createSplitInvoices(helpers.ts:357)가 stale supply_amount 읽어 옛 금액 청구. order_items 합 ≠ 그룹 합. **자동수정 안 함**: 동결 불변식=비즈니스 정책(가:NULL그룹만 recalc / 나:편집 차단 / 다:경고) + 그룹합 정합 리스크 + 보수적 freeze는 문서화된 의도(helpers.ts:51).
> - **🟡 신규 이슈 #388 (MED bug, #366 클래스) — 출고/재고 stored 업무일자 raw date('now') UTC off-by-one**: ① billable_after(shipments.ts:814·queries.ts:251, TEXT) 자동회계반영 게이트 구동 ② auto_complete_date(shipments.ts:815·queries.ts:252, TEXT) ③ inventory_fifo_layers.receipt_date(inventoryValuation.ts:105, DATE) FIFO 원가 정렬. KST 00~09시 작업분이 전일로 영구 기록(stored=자가정상화 안 됨, #366 우선순위 규칙). #366(b8d2f0d)이 처분일/order_date는 보정했으나 이 3종 미처리. **자동수정 안 함**(SKILL Area 4: 날짜 시맨틱=비즈니스 로직, 저장↔비교 양측 동시보정 선행, 잘못 보정 시 데이터 훼손).
> - **🚫 서브에이전트 오탐 1건 차단 (group 합 검증 누락 "HIGH")**: Explore A가 createSplitInvoices에 "그룹 합 ≈ 주문 총액 검증 부재로 라운딩 누적 시 청구 불일치(55k+46k=101k≠110k)"를 HIGH 보고. **반증**: helpers.ts:85-104가 **라운딩 잔차를 마지막 그룹이 흡수**(`tax=orderVat-taxAcc`·`disc=orderDiscount-discAcc`, supply=정수 SUM) → 그룹 합 = totalSupply+orderVat-orderDiscount **항상 정확**. 에이전트 시나리오(supply 라운딩 오차)는 supply가 정수 SUM이라 발생 불가 → **드롭**(탐지규칙 codify).
> - **🔵 clean 검증**: ① **각도 A CHECK↔쓰기값**: cards.status(0296/0298 7값) lifecycle.ts VALID_TRANSITIONS 검증+rip_status 별도축, approval type CREDIT_OVERRIDE(0300) orders/create.ts:449 정확 — 코드 쓰기 리터럴 전부 CHECK 내. ② **각도 C 신규 entity_id**: equipment(0302 getEntityId 주입)·order_billing_groups(0305 NOT NULL, 백필+명시 r.eid)·recurring_expense_actuals(0299 NOT NULL DEFAULT 1 미사용 phase) 전부 정상. ③ **Finding #1 외 split billing**: 주문삭제 obg CASCADE(core.ts:573)·발행 링크(helpers.ts:422)·2-pass batch 인덱스 정합·비례배분 잔차흡수 정확.
> - **이상 없음**: 마이그레이션 305 FAIL 0, 트리거 0개. open auto-improve **13건**(#373~#388, #372 reviewed 별도) stats 정합. baseline PASS.
> - 자동 수정 0건(전부 write/date 시맨틱·정책 변경=검증불가), 신규 이슈 3건(#386·#387·#388 전부 MED), 서브에이전트 오탐 1건 차단(잔차흡수 오독), clean 3각도
>
> **Area 3 UX/기능 감사 (2026-06-11T16:00):**
> - **방법**: baseline `npm ci`+`tsc --noEmit` PASS + build PASS(383 modules, _worker.js 5.10MB). Area 3 **9회차** — 시의성(최근 churn: AR 원장 5분할 ar-helpers~ar-ledger·taxInvoices 4분할 queries/issue/batch/manage) + 신선 각도(분할 후 프론트↔API 정합·getElementById silent-fail·변경후갱신·빈상태·폼검증·KPI 데이터소스) 병렬 Explore 2개. 발견 전수 owner 직접 코드 검증 + git blame로 시점 확정.
> - **🔧 자동수정 1건 (A-018, 커밋 본 사이클) — 대시보드 납기준수율 KPI 라벨 정정**: `scripts/dashboard.js:47`이 skeleton 교체 시 KPI 그리드를 `innerHTML`로 재구성하며 "이번 달 **출고 기준**"으로 노출 → 권위 서버템플릿 `pages/dashboard.ts:85`/title("**납기 기준**")과 불일치. #380 수정(6b06512) 후 메트릭이 `strftime('%Y-%m', o2.delivery_date)` = **delivery_date 기준 버킷**이므로 "납기 기준"이 정답 → JS 라벨을 권위본에 정합. **안전 자동수정 판정**: 사실-정정(메트릭 정의상 명확한 정답 존재) + 기존 권위 사본에 정렬(A-014 silent-fail 정정 클래스) + 동작/데이터 무변·텍스트만. verify PASS(tsc clean + build 383).
> - **🟢 #380 done-sync (직접 git 검증)**: 커밋 `6b06512 fix(dashboard): #380 — 납기 준수율 KPI 재정의`가 #380 두 결함 모두 해소 확정(`git log -L`로 diff 실측). 결함1: `o2.updated_at` 단독 → `COALESCE(MAX(shipments.shipped_at), MAX(cards.shipped_at), updated_at)` 권위 출고일. 결함2: `status IN ('SHIPPED')` → `IN ('SHIPPED','COMPLETED')`. 보너스: 월귀속 `created_at`→`delivery_date`. GitHub #380 open 잔류였으나 close+코멘트 처리.
> - **🚫 서브에이전트 오탐 1건 차단 (billable_after "누락")**: Explore A가 `orders/core.ts` GET `/`의 SELECT에 `billable_after`가 빠져 taxInvoices.js 정산대기 필터가 작동 불능(CRITICAL)이라 보고. **반증**: 해당 SELECT는 `o.*`(core.ts:32)로 시작 → orders 전 컬럼 포함, `billable_after`는 migration 0178 ALTER로 추가된 실제 컬럼이므로 `o.*`에 포함되어 정상 반환. 에이전트가 `o.*` 뒤 명시 JOIN 필드 목록만 보고 "명시 누락"으로 오독(자기모순 — 본문에 `o.*` 인용하고도 누락 주장). → **드롭**(탐지규칙 codify).
> - **🔵 clean 검증**: ① **AR 5분할**(ar-helpers/ar-payments/ar-receivables/ar-dunning/ar-ledger) API 경로(`/api/ledger/*`)·entityFilter·빈상태 처리 프론트 정합. ② **taxInvoices 4분할** date_from/date_to/status/search 파라미터 프론트↔백엔드 매칭, 동적 element ID(accordionBody_/chevron_) 정상. ③ **변경후갱신**: orders/payments/inventory mutation 후 load/refresh 호출 정합. ④ **빈상태**(inventory/orders/approvals/insuranceReports) 메시지 보유. ⑤ **폼검증**(purchaseOrderForm/paymentRequests/inventory) 필수값·수량 검증. ⑥ ledger.js missing ID(ledgerPrintStyle/pPaymentsBody)는 동적생성=정상.
> - **🔵 저가치 드롭**: paymentRequests/cashReceipts 스크립트는 있으나 HTML에 CSV export 버튼 없음(cashSchedule엔 있음) = 일관성 갭이나 기능결함 아님 + #372(CSV) 계열 → LOW 보류.
> - **이상 없음**: open auto-improve **10건**(#373~#385, #380 close, #372 reviewed) stats 정합. baseline PASS.
> - 자동 수정 1건(A-018 라벨 정정, verify PASS), 신규 이슈 0건, **#380 done-sync(git 검증 close)**, 서브에이전트 오탐 1건 차단(o.* 컬럼 포함 오독), clean 6각도
>
> **Area 2 코드 품질 (2026-06-11T12:00):**
> - **방법**: baseline `npm ci`+`tsc --noEmit` PASS + build PASS(369 modules, _worker.js 5.10MB). Area 2 **10회차** — 시의성(최근 churn: cashflow CARD_EXPECTED f449797·kakao 알림톡 Phase2 1de61d1·split billing P4/P5·workbench 신규 b0df71c) + 전수 스캔(entity_id INSERT·존재X 컬럼·N+1·authMiddleware) 병렬 Explore 2개. 발견 전수 owner 직접 코드 검증 + **node:sqlite empirical 재현**.
> - **🔧 자동수정 1건 (A-017, 커밋 본 사이클) — workbench.ts 존재하지 않는 컬럼 `cl.name` 3곳**: `src/routes/workbench.ts:22/28/56`이 `cl.name`(clients alias) 참조 — clients 테이블은 `client_name`만 보유(0001:45, `ALTER ... ADD name` 0건 ground-truth). 매 호출 `no such column: cl.name` throw → 신규 workbench 시안검수 페이지(b0df71c, 06-11) 주문목록/검색 **전체 500**. **안전 자동수정 판정**(↔#377 대비): read-only SELECT, 외부 자동화 트리거 無, 응답 alias 이미 `as client_name`이라 형식 불변, entity 귀속·쓰기 시맨틱 무관 = 순수 read 오타. verify PASS(tsc clean + build 369). #377(items.name)·#384(cards.entity_id)와 동일 컬럼오타 클래스나 부작용 없어 직접 수정.
> - **🔴 신규 이슈 #384 (HIGH bug) — printEvents.ts `SELECT entity_id FROM cards` 5곳, cards엔 `requesting_entity_id`만**: `printEvents.ts:32/174/177/280/477`이 존재X 컬럼 조회(0150:15 cards만 requesting_entity_id, 0284 재생성·인덱스도 동일, entity_id ADD 0건). **node:sqlite empirical**: NULL 반환 아니라 **`no such column` throw**(COALESCE도 prepare 단계라 못 막음 — 에이전트 "NULL→1" 보고 정정). 영향: cardId 매칭 성공(정상 경로) 시 280/477 throw→라우트 catch→**print_events 기록 500**, 174/177→print_file_map 등록 500, 32→quality_issues 침묵 미생성(#377형). throw 안 나는 경로(cardId NULL)는 entity 1 고정=법인2 인쇄 오귀속. **자동수정 안 함**(↔workbench): 멀티테넌시 entity 쓰기 시맨틱 변경 + quality_issues dormant write 활성화(#377형) + requesting_entity_id NULL 유도정책(order entity fallback?)=비즈니스 로직 + LogWatcher 외부연동 egress 검증불가.
> - **🟡 신규 이슈 #385 (LOW-MED bug, 시의성) — 출고 알림톡 품목요약 card_id 경유 단일조인**: `kakao.ts:459-463`(알림톡 Phase2)이 shipment_items를 `card_id→cards→order_item_id`로만 조인 → 주문단위 출고(card_id NULL, 0052:41 주석) 행 품목명 누락 → "제품" 폴백 발송. shipment_items는 card_id/order_item_id 양 경로 보유(카드출고=card_id만, 주문단위=order_item_id). 같은 코드베이스 `shipments.ts:324`는 직접 경로도 사용=혼재. 수정=COALESCE 양 경로. **자동수정 안 함**(쿼리 시맨틱 변경 + 발송 egress 검증불가).
> - **🔵 clean 검증**: ① **entity_id INSERT** 98개 INSERT 전수+ground-truth clean(orders/PO/quotations/taxInvoices/production/payroll/attendance 전부 entity_id 또는 requesting_entity_id 주입. items·*_status_history·*_report_details는 FK 유추 공유테이블=정상 면제). ② **authMiddleware** workbench(`:10` authMiddleware+requireRole) 포함 마운트 라우터 clean(공개=의도). ③ **cashflowEngine.ts:212-217** Promise.all 일괄조회=N+1 無. ④ **split billing** order_billing_groups entity_id 필수컬럼 보유. ⑤ kakao_send_logs entity_id=0261 ALTER 존재.
> - **이상 없음**: open auto-improve **11건**(#373~#385, #372는 reviewed 이동) stats 정합. baseline PASS.
> - 자동 수정 1건(A-017 workbench cl.name, verify PASS), 신규 이슈 2건(#384 HIGH·#385 LOW-MED), clean 5각도, **node:sqlite empirical로 throw vs NULL 정정**, #372 owner 피드백 reviewed 반영
>
> **Area 1 프로덕션 헬스 (2026-06-11T08:30):**
> - **방법**: GitHub Actions 최근 30런(total 508) 분석 + 실패 잡 로그 실측 + 로컬 `npm ci`+`tsc --noEmit`+build PASS. egress **000**(샌드박스 IP 차단, `curl mes.dongsanplan.com/api/health`·`/`=000) → 직접 20-API 호출 불가, E2E의 라이브 prod API 응답형식 테스트(cards-api/dashboard/report-routes/quotations)를 헬스 신호로 사용.
> - **🟢 현재 파이프라인 green (최근 5 E2E 연속 success)**: HEAD `dce9f50`(E2E 27326697277)·`20f0690`·`8d7009f`·`51c207b`·`24bb493` 전부 success. Deploy 동일 success. build PASS(366 modules, _worker.js 5.07MB raw, 유료 10MB 대비 ~10% 헤드룸).
> - **🔴 06-10 12:16~23:52 E2E 6연속 failure 클러스터 = shell.js MIME 단일장애(복구됨)**: 실패 잡 로그 실측(run 27275557961 job 80555833178) = **17 failed / 19 passed**, 전 실패가 `authedPage.evaluate`에서 `window.axios` 사용(`Error: page.evaluate: M…`) → 셸 부트스트랩(shell.js) MIME 실행거부로 axios 미초기화 증상. 외부화 파일럿(9dd09cd)→Content-Type 패치(144addf) 동안 prod 다운, **인라인 `?raw` 복귀(24bb493, 06-11 00:08)로 복구** → 이후 5런 green. Area 6(02:00) A-016 기록과 일치.
> - **🟡 신규 이슈 2건 (Area 1 헬스 분석 산물)**:
>   - **#382 (improvement) — 배포 게이트 smoke.cjs가 프론트 장애를 못 잡음**: `smoke.cjs`는 `/api/*`만 fetch(login `:202`+엔드포인트 루프), `/` HTML·셸 스크립트 미검증 → 워커 API 200이면 프론트가 죽어도(MIME) smoke PASS=Deploy success(녹색·알림無). 06-10 2회 다운이 **smoke success인데 직후 E2E failure**로 직접 증명. 수정=smoke에 경량 프론트 부트스트랩 단언. **자동수정 안 함**(게이트 정의 변경=owner 정책+egress 검증불가). *(04:09 부분 Area 1 런 산물, 본 사이클서 백로그 편입)*
>   - **#383 (improvement) — shell.js 외부화 불완전 revert(재회귀 트랩)**: 런타임만 인라인 복귀(`layout.ts:10/181` `?raw`=라이브, prod green 이유)했고 **build-assets.mjs 머신은 미제거** → 매 빌드가 dead `/static/shell.<hash>.js`(`/static` 참조 grep 0)·미사용 `ASSET_MANIFEST`(repo 전수 import 0, 생성기 자신만 기록) 생산. `<script src="/static/${ASSET_MANIFEST.shell}">` 오배선 시 MIME 2회다운 정확히 재현. #382(게이트 방어)의 보완=트랩 자체 제거. **자동수정 안 함**(빌드/배포 파이프라인 변경, `_routes.json` 생성 주체 전환=되돌리기 어려운 prod 영향 + egress로 배포 검증 불가).
> - **이상 없음**: deploy 코드결함 failure 0건. 06-10 장애는 단일 클래스(shell.js MIME)·복구·기록 완료. open auto-improve **10건**(#372~#383) stats 정합.
> - 자동 수정 0건(파이프라인 정상·게이트/빌드 변경=owner 판단·egress 차단), 신규 이슈 2건(#382·#383, 둘 다 Area 1 헬스), 06-10 장애 root-cause 실측 확정
>
> **Area 6 자기 진화 (2026-06-11T02:00):**
> - **방법**: baseline `npm ci`+`tsc --noEmit` PASS + build PASS(366 modules, _worker.js 5.00MB). GitHub open/closed 전수 대조 + 직전 5개 사이클(Area1~5, 06-10) 산출물의 백로그·SKILL 반영 완결성 검증.
> - **🟢 GitHub↔백로그 done 동기화 — 이관 0건(clean)**: closed auto-improve 최신 updated_at=**#366(06-09T04:00)** → 직전 Area 6(06-09T22:00) **이전** = 신규 close 0건. open auto-improve **정확히 8건**(#372/#373/#374/#377/#378/#379/#380/#381) 실측 = stats 정합. done 78/rejected 3 유지. #380 단일 코멘트는 **auto-improve 자체 정정**(Area 4 ground-truth가 결함2=no-op 지적)이지 owner 피드백 아님, 👍 0 → 8건 전부 new 유지.
> - **📋 New 표 stale 정정 (핵심 동기화 갭) — 2행→8행**: Area 1~5(06-10)가 #374/#377/#378/#379/#380/#381 6건을 생성하며 **stats 내러티브·count는 갱신**했으나 **New 표 본문은 직전 Area6(06-09T22:00) 시점 2행(#372/#373)에 고정**(각 사이클이 자기 영역 외 표는 미터치). Area 6에서 누락 6건에 ID 부여(I-062~I-067) + 표 전수 반영 → 표↔stats↔GitHub 3자 정합 복원.
> - **🧬 FP표 ↔ SKILL 단일소스 동기화 2건**(SKILL엔 codify됐으나 백로그 FP표 누락): ① **batch 결과 배열 인덱스 "정렬 불일치" 오독**(Area 4 06-10, SKILL.md:64) — 부모-자식 2-pass batch에서 stmt배열+메타배열을 같은 `continue` 가드 뒤 push하면 길이 동일=정합인데 서브에이전트가 "한쪽만 continue 건너뜀"으로 오독해 HIGH 과대보고(2건 차단). ② **독립 HTML 페이지 escapeHtml 예외**(Area 5 06-10, SKILL.md:143) — `c.html()` 자체 출력페이지(payslip/yearEnd)는 layout 셸 미경유라 `window.escapeHtml` 부재 → "전역헬퍼 있으니 XSS 오탐" 논리 적용 금지(진짜 stored XSS). 기존 escapeHtml FP행에 ⚠️예외 병기.
> - **🔧 A-016 기록 보충 — shell.js 정적에셋 prod 2회 장애 복구(24bb493, 144addf 경유)**: 직전 세션 픽스(이 patrol 외)이나 Auto-fixed 표 미기재 → Area 6에서 기록. `9dd09cd` 파일럿이 shell.js를 `/static` 외부화했으나 CF Pages **Git 자동빌드**에서 `_routes.json` `/static/* 제외` 미적용 → 워커가 Content-Type 빈값('')으로 서빙 → strict MIME 실행거부 → `shell.js` 사망(전 페이지 401+무한로딩). 144addf의 `_headers` Content-Type 명시도 자동빌드서 불충분 → **최종 해결=인라인 `?raw` 복귀**(/static·_routes.json·빌드순서 의존 전무).
> - **🧬 SKILL Area 1 학습패턴 신설 — 정적에셋 MIME 회귀는 smoke(API)로 미탐지**: smoke.cjs는 API 직접호출이라 프론트 `shell.js` MIME 실행거부를 **구조적으로 못 잡음**. 정적에셋 파이프라인(`build-assets.mjs` `_headers`/Content-Type) 변경 시 회귀 신호는 **E2E 콘솔에러·shell.js 로드 확인**에 의존 → Area 1 헬스 점검에 codify(144addf 클래스 재발 방지).
> - **이상 없음**: baseline PASS. Approved/Reviewed 표 비어있음 유지(owner 미피드백). rejected 3 유지.
> - 자동 수정 0건(메타·문서 동기화), 신규 이슈 0건, done 이관 0건, **New 표 6행 보충(stale 정정)**, FP표 2건 동기화, A-016 기록, SKILL Area 1 학습패턴 1건
>
> **Area 5 보안 (2026-06-10T18:00):**
> - **방법**: baseline `npm ci`+`tsc --noEmit` PASS + build PASS(366 modules, _worker.js 5.0MB). Area 5 **9회차**. **직전 Area5 부분실행 복구 + finalize**: 이전 세션이 #381(orders 쓰기 IDOR) 생성 + payslip/yearEnd XSS 자동수정(커밋 27e15eb, branch auto-improve/area5-xss-idor)까지 했으나 **백로그 마커(last_run_area=4)·SKILL·XSS커밋이 미완료** — 27e15eb는 임시 컨테이너 전용이라 **main에 없음(소실)**. 검증: `git cat-file -t 27e15eb`=invalid, `merge-base --is-ancestor`=NO. → XSS 재적용 + #381 재검증 + 독립페이지 sweep + SKILL codify로 마무리.
> - **🔧 자동수정 1건 (커밋 b5233a1) — payslip·yearEnd 직원 마스터 XSS escape**: `pages/payslip.ts`(급여명세서 `/payslip/:id`)·`pages/yearEnd.ts`(연말정산 간편영수증 `/year-end/:id`)는 `c.html(\`...\`)`로 자체 head/script를 반환하는 **독립 HTML 페이지** → layout.ts 전역 `window.escapeHtml` **부재**. 직원 마스터 free-text(성명/부서/직책/사번/연락처)를 escape 없이 `innerHTML` 문자열연결(payslip:243-246·yearEnd:228-237) → **stored XSS**(HR ADMIN/MANAGER가 마스터에 `<img onerror>` 저장 → 인쇄 시 실행). 각 페이지 스크립트에 로컬 `esc()`(replace 5문자) 추가 후 해당 필드 래핑. **verify PASS**(tsc+build 366 modules). #335가 다룬 server-template `esc()`와 별개 경로(client-side render). **안전 자동수정**(escapeHtml 누락 추가 = SKILL 허용 범주, 동작/형식 불변).
> - **🔴 #381 재검증 — true-positive 확정(오탐 아님)**: orders 쓰기 핸들러 entity 격리 비대칭. **owner 직접 코드 대조**: read `GET /`(`core.ts:380` orderVisibilityFilter)·delete(`:1868` `entityFilter(c) // IDOR 방지 #333`)는 격리하나, write는 전부 무필터 `WHERE id = ?` — billing-status(`:657`)·bill(`:588`)·status(`:1687`)·output-folder(`:738` role게이트조차無)·PUT(`:2032`). 청구분할(72bd97e) PUT이 `recalcOrderBillingGroups`(orderId만, 법인검증無) 호출로 쓰기 증폭. 멀티법인 MANAGER가 타법인 주문 청구/취소/balance 조작 가능 = HIGH. 신규 GET/:id는 visibility 추가했으나 쓰기경로 미재방문=갭 직접증거. **자동수정 안 함**(쓰기 허용 법인=entityFilter vs visibility는 mutation별 비즈니스 정책 + egress 검증불가).
> - **🔵 독립 HTML 페이지 XSS sweep — 잔여 0건**: `grep c.html src/pages` 13개 전수. ① 취약=payslip/yearEnd(수정완료). ② `portal/portalDocument.ts`=자체 `esc()`(textContent 방식, `:198`)로 client_name/period/order_number/item_name/spec/description **전부 escape** clean. ③ invoice/quotation/purchaseInvoice/login/employeeSelf=free-text innerHTML 데이터 sink 자체 부재(invoice는 toolbar 프레임버스트 script만, 데이터 미렌더). ④ 나머지 portal(Invoices/Dashboard/Orders/Balance)=portalLayout 셸 경유(전역 escapeHtml 보유). → 독립페이지 XSS는 payslip/yearEnd 2건이 전부.
> - **🧬 SKILL 탐지규칙 강화 1건**: 기존 "escapeHtml 전역정의 → XSS 오탐" 제외규칙에 **예외 codify** — `c.html()` 독립 출력페이지는 layout 셸 미경유라 `window.escapeHtml` 부재, free-text innerHTML raw 연결은 진짜 XSS. "전역헬퍼 있으니 오탐" 논리를 독립페이지에 적용 금지. 판별=layout/shell import 없이 c.html 자체 script + free-text 렌더. (auto-improve SKILL Area 5 XSS FP 블록)
> - **이상 없음**: 시크릿/기본비번 폴백 `grep "c.env.[A-Z_]+ *|| *'"` 0건. 정적에셋 전환(9dd09cd)=빌드타임 해시 파일명+CF /static, path traversal 불가. open auto-improve **8건**(#381~#372) stats 정합. baseline PASS.
> - 자동 수정 1건(b5233a1 XSS escape, verify PASS), 신규 이슈 0건(#381=직전 부분실행 산물·재검증 TP), 독립페이지 sweep clean, SKILL 탐지규칙 강화 1건, 직전 Area5 부분실행 복구·finalize
>
> **Area 4 데이터 정합성 (2026-06-10T14:00):**
> - **방법**: ground-truth — 301 마이그레이션 로컬 D1(node:sqlite) 전량 적용(**FAIL 0**, 171테이블/510인덱스) + baseline `npm ci`+`tsc --noEmit` PASS. Area 4 **9회차** — 기존 각도(마이그·CHECK↔코드·정역대칭·FK·트리거·비원자고아·dead table·UTC/KST·entity_id DEFAULT·크로스테이블 상태머신#373) 성숙 → **시의성**(방금 랜딩된 bb7bec6 "N+1 8파일 db.batch/IN화 + 청구 NULL 가드") + **신선 3각도**(NULL 비교 가드·소프트삭제 부모↔활성자식·denorm drift 재확인) 병렬 Explore 2개. 발견 전수 owner 직접 코드 검증.
> - **🟢 net-new 0건 — bb7bec6 시의성 타깃 clean + 3각도 clean**:
>   - **시의성: bb7bec6 batch 재작성 = clean(회귀 0)**. ① **billing_status NULL 가드 수정 정확**: `orders/queries.ts:171`·`taxInvoices.ts:298`의 `billing_status != 'BILLED'` → `IS NOT 'BILLED'`(SQLite `IS NOT <리터럴>`은 NULL도 매칭) = 선재 이중청구 버그(NULL=청구전 정상상태가 가드 미통과 → 매 bulk-bill마다 balance 증액) **정상 수정**. ② **빈 배열 IN() 가드 전수 존재**(core.ts:1396·purchaseInvoices.ts:162·rip.ts:1708·quotations.ts:314). ③ **IN()/batch 결과 매핑 정합**(convert-to-order 별도 카운트 배열·rip send-items-bulk·purchaseInvoices in-loop 맵 갱신로 SELECT-after-UPDATE 보존).
>   - **🚫 서브에이전트 HIGH 2건 오탐 차단 (owner 직접 코드 반증)**: Explore가 `orders/core.ts:2206-2281`·`quotations.ts:273-320`의 부모-자식 2-pass batch에서 "`parentStmts.push`는 자식 continue로 건너뛰는데 `parentClientGroupIds.push`는 무조건 실행 → 배열 길이 불일치 → 자식이 잘못된 부모 매핑(HIGH 데이터손상)"으로 보고. **반증**: 두 push(`core.ts:2240`/`2273`, `quotations.ts:288`/`310`)가 **같은 루프 안 같은 `if(parent_client_id) continue`(2209/275, 루프 최상단) 뒤**에 위치 → 자식 행은 continue로 **둘 다** 건너뜀 → 두 배열 길이 동일(=부모 수) → `parentResults[i]` 인덱스 정합. 에이전트가 continue 위치를 오독(2273 push를 무조건으로 착각). → **드롭**(탐지규칙 codify).
>   - **NULL 비교 가드(각도 A) — 잔여 0건**: bb7bec6 2곳 외 NULL 비교 필요 경로 무. `accounts-receivable.ts:2020`=`(billing_status IS NULL OR != 'BILLED')` 명시 처리·`inventory.ts:356`=status NOT NULL DEFAULT라 무관.
>   - **소프트삭제 부모↔활성자식(각도 B) — clean**: `clients.ts:1009` 거래처 soft-delete 전 `COUNT(orders WHERE client_id)` 체크로 활성 자식 있으면 차단 → 고아 활성자식 불가.
>   - **denorm drift(각도 C) — clean(재확인)**: order_items·purchase_order_items·inventory_receipt_items 모두 **개별 PATCH/DELETE 엔드포인트 부재**, PUT 전체재구성만 → 부모 합계 항상 재계산. inspection-decision은 상태만 변경(수량 불변).
>   - **CHECK↔status 쓰기(독립 점검) — clean**: orders `COMPLETED`=CHECK 미포함+쓰기경로 0건(읽기측 dead, #380 코멘트 기확인). cards 단일축(0298) 정합 — `lifecycle.ts:593` PRINT_ERROR는 status 유지+`rip_status='ERROR'`만 씀(0298 의도 일치). `rip.ts:1638`·`printEvents.ts:250`의 `RIP_WAITING` 참조=0298 후 쓰기경로 무→절대 매칭 안 되는 dead read-term(무해 cosmetic).
> - **이상 없음**: 마이그레이션 301 FAIL 0, 트리거 0개. open auto-improve 실측 7건(#380/#379/#378/#377/#374/#373/#372) stats 정합. baseline PASS.
> - 자동 수정 0건(net-new 없음), 신규 이슈 0건, bb7bec6 시의성 clean 검증, **서브에이전트 HIGH 오탐 2건 차단**(배열 인덱스 정렬 오독), 3각도 clean, 탐지규칙 강화 1건
>
> **Area 3 UX/기능 감사 (2026-06-10T10:00):**
> - **방법**: baseline `npm ci`+`tsc --noEmit` PASS + build PASS(exit 0). Area 3 **8회차** — 기존 각도(dead-filter·하드캡·getElementById silent-fail·catch-UX·CSV누락#372·confirm·변경후갱신·폼검증·journey·검색범위·날짜/상태필터·정렬·빈상태) 성숙 → **덜 다룬 2각도** 병렬 Explore: (A)대시보드 KPI 실질가치(SKILL 고가치 명시) (B)리스트 페이지네이션 완전성+로딩상태. 발견 전수 owner 직접 코드 검증(shipped_at 컬럼 ground-truth·멱등성·updated_at 갱신경로).
> - **🟡 신규 이슈 #380 (MED bug) — 대시보드 납기 준수율 KPI 2중 결함**: 상단 카드 항상노출(`pages/dashboard.ts:79`) on_time_rate(`routes/dashboard.ts:54-58`)가 ① **`orders.updated_at`을 출고일 프록시로 사용** — orders엔 `shipped_at` 컬럼 자체 없음(실제 출고일=`cards.shipped_at` 0041·`shipments.shipped_at` 0052, grep 전수). updated_at은 모든 수정 시 갱신 → 정시출고 주문을 며칠 뒤 회계반영(`PATCH /:id/billing-status` `core.ts:613`이 updated_at 갱신, bulkBillingConfirm이 SHIPPED 대상=실무 흔함)하면 `date(updated_at)>delivery_date`→**"지연" 오집계**(과소집계 방향). ② **분모 `status IN ('SHIPPED')`가 COMPLETED 주문 제외**(출고 후 완료전이=`orders.js:137`) → 표본 편향. 리포팅 전용(트랜잭션 손상 아님) MED. **자동수정 안 함**(KPI 계산식=비즈니스 로직: 출고일 권위소스·부분출고 기준·월 귀속 owner 판단 + egress 검증불가). 수정=출고일을 cards/shipments.shipped_at에서 산출 + 분모 COMPLETED 포함.
> - **🔵 clean/저가치 드롭**: ① 대시보드 나머지 KPI(매출/수금률/미수금/Aging)=실제 쿼리 정상, on_time_rate만 결함. ② **페이지네이션 부재**(tasks.ts LIMIT500·waste.ts 200·returns.ts 100·notifications≤50) — 전부 필터 보유+내부 운영리스트, 데이터 성장 전까지 LOW 보류. ③ **로딩/버튼 상태** — CSV/bulk 버튼 disabled/spinner 없으나 bulk-ship(출력완료만)·bulk-billing(BILLED/PAID 스킵)=서버측 멱등→더블클릭 비파괴적, CSV 중복 무해, 전역 `dsSkeleton` 리스트 광범위 적용 → cosmetic 드롭.
> - **이상 없음**: open auto-improve **7건**(#380/#377/#378/#379/#374/#373/#372) stats 정합. baseline PASS.
> - 자동 수정 0건(Area 3 제안 전용 + net-new는 KPI 계산식=비즈니스 로직), 신규 이슈 1건(#380 MED), clean/저가치 3각도
>
> **Area 2 코드 품질 (2026-06-10T06:00):**
> - **방법**: baseline `npm ci`+`tsc --noEmit` PASS + build PASS(366 modules, _worker.js 5.07MB). Area 2 **9회차** — 기존 각도(IDOR 비대칭·N+1 #341/#350·entity_id·best-effort catch·트랜잭션 원자성 #369·금액·API계약) 성숙 → **시의성**(최근 churn 큰 알림톡/SMS 통합, barobillSms.ts 4커밋) + **신선 스캔**(entity_id INSERT·N+1·authMiddleware) 병렬 Explore 2개. 발견 전수 owner 직접 코드 검증(컬럼 ground-truth·도달성·catch 흐름).
> - **🔴 신규 이슈 #377 (HIGH bug) — AI 주문 자동가공 `auto_process_jobs` 생성 전체 침묵 실패**: `orders/core.ts:1489` `SELECT name FROM items`가 **존재하지 않는 컬럼** 조회(items 컬럼=`item_name`, ground-truth migrations 전수 — `name` ADD/RENAME 0건, 같은 파일 `:1071`/`:2200`은 `item_name` 사용). SQLite/D1에서 매 실행 `no such column` throw → **try(`:1435`)/catch(`:1527` best-effort console.error)** 안이라 루프 첫 반복에서 탈출 → `auto_process_jobs` INSERT(`:1509`) **전혀 미실행** + 주문은 정상생성(에러 무표시). `aiAnalysisId`(`:890`) 있는 모든 AI 디자인 주문에서 일러스트레이터 자동가공 파이프라인 침묵 실패. 파일분할(06-05) 이전부터 잔존(최근 회귀 아님). **자동수정 안 함**(컬럼 수정 시 휴면 자동화 파이프라인이 프로덕션 활성화=되돌리기 어려운 외부영향 + egress 차단으로 다운스트림 IA자동화 검증 불가). 수정=`item_name` + 루프 전 N+1 배치(IN 1쿼리).
> - **🟡 신규 이슈 #378 (MED bug, 시의성) — 출고 알림톡 일괄발송 부분/전체 실패를 "N건 발송 완료"로 오보고**: `kakao.ts:923 POST /send-shipment-bulk` 응답이 **`status`/실패건수 누락** + `sent_count=targets.length`(성공 수 아님). `interpretBulkResult`(`barobillSms.ts:401`)는 ok/fail을 알지만 라우트가 안 내려보냄 → 프론트(`shipments.js:981`)가 무조건 `success` 토스트. 부분 실패(10중 5)·전량 실패(바로빌 오류코드는 throw 아님) 모두 "10건 발송 완료" 녹색 표시 → 고객 미통지 + 운영자 무인지. 대조: 단건 `/send`(`:355`)·`/send-sms-bulk`(`:909`)는 `status` 포함=정상, **shipment-bulk만 누락**=회귀. **자동수정 안 함**(API 응답형식+프론트 UX 변경 + egress 발송검증 불가). 수정=interpretBulkResult ok/fail 명시반환 + 응답 fail_count/status + 프론트 분기.
> - **🔵 신규 이슈 #379 (improvement, small) — printSystem N+1 2곳**: `/media/bulk`(`:650-669` 2중루프, createdItems×createdRM 건별 SELECT — media id 이미 메모리 보유라 재조회 불요)·`/repair-links`(`:1157-1197` 3중 N+1, products×materials, ~3000쿼리). setup/repair 저빈도라 LOW. **자동수정 안 함**(batch+JOIN 매칭 시맨틱 변경 검증불가, 저빈도 급성도 낮음). 수정=메모리 매칭+`DB.batch()`.
> - **🔵 clean 검증**: ① **entity_id INSERT** routes 전수+ground-truth — clean(`items`는 법인공유 entity_id 무, 0267 주석 확인 → printSystem items INSERT 정상). ② **authMiddleware** 마운트 라우터 전수 clean(공개 엔드포인트만 무인증). ③ **cards/queries.ts** 커밋 67a5248 urgency 필터(date() 제거→반개구간) 로직 정확·인덱스 개선=정상. ④ 알림톡 단건/SMS-bulk·중복발송 가드(1955cb7)·템플릿 자동선택·entity_id 격리(`kakao.ts:1022`)=clean.
> - **이상 없음**: open auto-improve **6건**(#377/#378/#379/#374/#373/#372) stats 정합. baseline PASS.
> - 자동 수정 0건(전부 동작변경/외부영향·검증불가), 신규 이슈 3건(#377 HIGH·#378 MED·#379 small), clean 4각도
>
> **Area 1 프로덕션 헬스 (2026-06-10T02:00):**
> - **방법**: GitHub Actions 최근 30런(actions_list, total 467) 분석 + 로컬 `npm ci`+`tsc --noEmit`+build + 실패 런 잡 로그 실측. egress는 이번엔 **000**(연결 자체 차단, 직전 403에서 악화 — 샌드박스 IP 네트워크 차단)이라 직접 20-API 호출 불가, Actions/스모크/E2E를 헬스 신호로 사용.
> - **🟡 신규 이슈 #374 (improvement, small) — 배포 스모크 로그인 단일 시도(재시도 부재)로 cold-start 일시 500이 deploy 게이트 파손**: 최신 **Deploy 27219723469**(HEAD `0fef951`, 06-09T16:13)가 failure — post-deploy `scripts/smoke.cjs:202` `login()`이 **1회 fetch 후 5xx 즉시 throw**, 프로덕션 cold-start D1에서 login(`auth.ts:20`→`:78` catch가 500 변환) 일시 500을 흡수 못 함. `0fef951`은 **docs-only 커밋**(BACKLOG.md만)이라 직전 통과 `9bf1cb2`와 백엔드 **byte-identical** = 코드 회귀 불가. **자가검증**: 같은 커밋 **3h 후 Daily D1 Backup(27229599620, 19:12)=success** → D1·worker 정상, 500은 1회성 transient. 동반 **E2E(27219818172) skipped**(deploy 게이트로 커버리지 손실). cold-start transient가 CI 게이트 깬 **2번째**(직전 E2E #189/#340). 수정: login에 bounded 재시도(5xx/연결오류 2~3회 backoff) 또는 health warm-up ping. **자동수정 안 함**(deploy 게이트 관용성=owner 정책 + egress 차단 검증 불가, #340과 별개 파일·단계).
> - **🟢 파이프라인 사실상 green (30런 중 위 1 transient만 failure)**: Deploy `5c1e11f`~`9bf1cb2` 13런 연속 success, E2E 동일 전부 success(`a8f7eb7` cancelled 1 = 재트리거 정상). queued/stuck 0건. 유일 failure가 코드무관 transient.
> - **로컬 verify PASS**: `npm ci`→`tsc --noEmit` clean + build PASS(**366 modules**, `_worker.js` 5.07MB raw — 직전 360→366 모듈, 유료 10MB 대비 ~10% 점유 헤드룸 충분).
> - **오탐/이상 없음**: deploy 코드결함 failure 0건 지속. egress 000은 샌드박스 IP 차단(기존 인지). open auto-improve **3건**(#374/#373/#372) stats 정합.
> - 자동 수정 0건(파이프라인 정상·게이트 관용성=owner 판단·egress 차단), 신규 이슈 1건(#374)
>
> **Area 6 자기 진화 (2026-06-09T22:00):**
> - **GitHub ↔ 백로그 전수 재동기 — 17건 done 확정·테이블 대량 정정**: 직전 Area 6(06-08T22:00) 당시 closed 최신=#356(06-06)이었으나, 이후 **17건이 신규 close**(06-08T23:27 10건: #358~#368 / 06-09 7건: #336·#340·#341·#342·#350·#366·#369). **전수 분류 = done(rejected 0)**, 증거 2종 교차검증:
>   - **commit 직접 매핑(15건)**: #341→ba53c76·#350→108b738(N+1) / #342→5e97f82(설비 entity_id) / #340→e8429cb·9e5dbcb(crud-order 격리) / #369→d1c8b89(멱등가드 원자화) / #366→b8d2f0d·7b64d04·10315d6(KST 표시층+회계DATE) / #368→b6d845d(storage-zones IDOR) / #367→06ff136(CSV injection 가드) / #358→16915ed·b9ae24e(발주 IDOR 9핸들러) / #360·#361·#362·#363·#365·#359→b2b170a(IDOR 4 + UX/CSV 4 묶음).
>   - **close 코멘트 직접 확인(commit 모호 3건)**: #336=owner **위험수용 close**(코드측 평문폴백 제거 a7a15cc 완료, pbkdf2 해시저장 확인, admin/password는 테스트전용 간주) / #364=`0301_drop_inventory_items.sql` prod 적용(0행 확인 후 DROP) / #340=crud-order cleanup `afterAll`+소프트취소·하드삭제 2회로 prod 오염 0(cold-start 픽스처는 owner가 별도 분리).
> - **테이블 stale 대량 정정**: Approved 표(#340 I-030·#342 I-032)·New 표(#336·#341·#350·#358·#359·#360·#362·#363) 전부 이미 done인데 잔류 → Done 표로 이관, 양 표 비움. New 표를 실제 open(#372·#373)으로 교체. done 61→**78**, approved 2→0.
> - **🧬 FP 표 SKILL 동기화 2건 추가**(단일소스 — SKILL엔 있으나 백로그 표 누락): ① **무인증 self-service auth "브루트포스/열거 HIGH" 과대평가**(Area 5 #—, hr self-auth/portal verify-document = 의도적 공개 2팩터+rate limit 전역, SKILL.md:141) ② **트랜잭션 원자성 "분리 write 부분실패 고아"**(Area 2 #369, last_row_id 구조강제·중간 read 끼임이면 노이즈, 보고기준=멱등가드 부재+회피가능성, SKILL.md:60).
> - **오탐 패턴 신규 0건**: 17건 close 전부 true-positive(수정완료)라 FP표 net-new 없음. 기존 13개 FP 패턴 유효성 재확인. 스킬 파일(auto-improve/security-audit) 직전 사이클들에서 이미 codify 완료 — 중복 등재 회피.
> - **이상 없음**: open 정확히 2건(#372 improvement·#373 bug, 둘 다 👍 미수신 미검토). baseline `npm ci`+tsc --noEmit PASS.
> - 자동 수정 0건(메타·문서 동기화), 신규 이슈 0건, **done 이관 17건**, 테이블 정정(Approved/New 비움), FP표 2행 추가
>
> **Area 5 보안 (2026-06-09T18:00):**
> - **방법**: baseline `npm ci`+tsc --noEmit PASS. Area 5 **8회차** — IDOR 비대칭(#356~#368 11모듈)·SQLi·rate·XSS·PII·파일프록시(#365)·CSV injection(#367)·엔티티전환 인가·JWT·webhook 고갈 → **시의성 + 덜 다룬 각도** 병렬 Explore 2개: (A)방금 랜딩된 5c1e11f facility.ts equipment·cards 격리 수정이 #356식 비대칭 갭을 남겼는지 완전성 검증 (B)웹훅/콜백/외부연동 엔드포인트 인증·서명 검증. 발견 전수 owner 직접 코드 검증(오탐 차단).
> - **🟢 net-new 0건 — 모든 각도 clean 또는 오탐**:
>   - **시의성: 5c1e11f facility.ts 격리 수정 = complete**: 커밋이 지목한 5위치(`/zones` equipment count `:23`·`/layout-data` equipment WHERE `:125`·cards count `:118`·cards GROUP BY `:136`·`/equipment/:id/zone` UPDATE `:265`) **전부 entityFilter/cardEntityFilter 적용**. facility.ts 13핸들러 중 entity-scoped 테이블(equipment `entity_id` 0302·cards `requesting_entity_id` 0284) 터치하는 5핸들러 모두 list↔write 대칭 → **#356식 비대칭 갭 0**. 공유테이블(facility_zones/inventory_locations/facility_settings, entity_id 컬럼 무)은 정당 면제. INSERT 경로(rip.ts:291 equipment·orders/core.ts:253·lifecycle.ts:1075 cards) 전부 `getEntityId(c)` 주입. 인접 `cards/scheduling.ts` 4핸들러도 `cardEntityScope`(order_id→orders.entity_id, entityId=0 ADMIN전체모드 생략 `:20-24`)를 SELECT+UPDATE 대칭 적용 → clean.
>   - **🚫 `/api/hr/self-auth` HIGH 주장 오탐 차단 (에이전트 과대평가 → owner 코드 반증)**: 에이전트가 "사원번호 열거+생년월일6자리 추측으로 임의 직원 토큰 생성 HIGH"로 보고했으나 **rate limit 5/분 이미 적용**(`index.tsx:244`). authMiddleware 없는 건 **계정 없는 직원용 간이 2팩터(사원번호+생년월일) 설계 의도** + 동일 코드베이스의 portal `/verify-document`(토큰+BRN, 직전 06-08 감사 "설계 정상" 판정)와 **동형**. rate-limit-by-IP 로테이션 한계는 모든 로그인 공통+기존 인지 아키텍처 제약(rateLimit.ts in-memory). timing-attack도 두 분기 모두 단일쿼리+문자열비교라 유의미 차이 없음. 토큰 scope='employee-self'+30분 만료+증명서/계약서 read만 = 저가치. → **드롭**. (SKILL FP 목록 codify)
>   - **웹훅/포털토큰/카카오/autoProcess/files 인증 clean**: `webhooks.ts`=빈 파일(바로빌 자체 콜백, 미구현)·`kakao.ts:44`=ADMIN/MANAGER 전역·`autoProcess.ts:8`=ADMIN 전역·`files.ts:7`=authMiddleware 전역. 포털 매직링크 토큰=`crypto.randomUUID()` 32hex(2^128)+`verify-document`는 토큰+BRN 대조(`portal.ts:655`)+rate limit 10/분 → 적절. 무인증 엔드포인트(login/health/self-auth/portal verify)는 전부 의도적 공개+rate limit 게이트.
>   - **서버 템플릿 XSS clean**: `templates/employmentCertificate.ts`·`laborContract.ts` 전 보간값 `esc()` 적용(#335). **SQLi clean**: 동적 `ORDER BY ${orderBy}` 4곳(orders/PO/cards/queries) 전부 `sortOptions[sort] || default` **리터럴 화이트리스트 맵** 조회(raw 입력 미interpolation), `bank.ts:183` IN절도 `?` placeholder 바인딩. **mass-assignment clean**: `hr.ts:467/607` body.entity_id는 `sessionEid===0`(ADMIN 전체모드) 게이팅(#349), migration은 ADMIN 전용.
> - **이상 없음**: Area 5 성숙도 매우 높음(2사이클 연속 net-new 0, IDOR 클러스터 전수 처리됨). 에러 메시지 노출(migration error_details=ADMIN 임포트 기능, 나머지 console.error)=저수율 드롭. open auto-improve 실측 2건(#372/#373). baseline PASS.
> - 자동 수정 0건(net-new 없음), 신규 이슈 0건, **시의성 facility 수정 완전성 검증(complete)** + 오탐 1건 차단(hr self-auth HIGH 과대평가) + **FP 패턴 1건 신설**(무인증 self-service auth rate-limited 엔드포인트 → SKILL Area 5 오탐 제외 codify)
>
## ✅ Approved / 👀 Reviewed (owner 피드백 수신)

> **👀 Reviewed 1건 (owner 피드백 수신, 미구현)**:
> | ID | 제목 | 영역 | Issue | owner 피드백 |
> |----|------|------|-------|------|
> | I-060 | [improvement] CSV export 5곳 `LIMIT 5000` 무경고 silent truncation — 정산/감사 다운로드 불완전 가능 | Area 3 | #372 | "3번으로 진행해줘 최대 페이지 표시수량을 5000으로 제한하고 사실상 5000을 넘는 경우는 많이 없을것 같은대"(06-11T00:25). ⚠️**모호**: #372 옵션3=페이지네이션 스트리밍(전량 다운로드)인데 "5000 제한 유지"와 모순 → 구현 전 owner에게 의도 확인 필요(옵션1 잘림경고 + 5000 유지를 뜻하는 듯). 승인처리 워크플로우에서 처리. |
>
> (이전 approved 2건 #340 I-030·#342 I-032은 06-09 구현·close 완료 → Done 표 이관, Area 6 06-09T22:00.)

## 🆕 New (미검토)

> 전부 GitHub open + 👍 미수신. 용준님 리뷰 대기. (open **실측 11건** — 2026-06-12T12:00 Area 6. #377·#378 done-sync close로 13→11, #372는 reviewed 별도)

| ID | 제목 | 영역 | Issue | 공수 |
|----|------|------|-------|------|
| I-074 | [MED bug] split billing 출고/재고 stored 업무일자 raw date('now') UTC off-by-one — billable_after(shipments.ts:814·queries.ts:251)·auto_complete_date(:815/:252)·fifo receipt_date(inventoryValuation.ts:105). KST 00~09시 작업분 전일 영구기록(stored), #366(b8d2f0d)이 처분일/order_date는 보정했으나 이 3종 미처리. 회계/COGS 귀속 1일 밀림 | Area 4 | #388 | ~1h |
| I-073 | [MED bug] split billing 청구그룹 동결 order-wide — recalcOrderBillingGroups freeze(helpers.ts:60-64)가 BILLED/PAID 1개라도 있으면 전 그룹 동결. 혼합주문 부분청구 후 미청구 entity 품목 편집 시 그룹 미갱신 → createSplitInvoices가 stale 금액 청구. 정책 결정 필요(NULL그룹만 recalc/편집차단/경고) | Area 4 | #387 | ~2h |
| I-072 | [MED bug] split billing DRAFT 계산서 삭제가 obg.tax_invoice_id 미정리 — createSplitInvoices(helpers.ts:422)는 링크하나 manage.ts:140 DELETE는 미정리 → dangling. 취소 경로(issue.ts:707)는 정리=비대칭. issue.ts:261 재링크 차단 + 주문상세 phantom 노출 | Area 4 | #386 | ~20m |
| I-071 | [HIGH bug] printEvents.ts `SELECT entity_id FROM cards` 5곳 — cards엔 `requesting_entity_id`만(존재X 컬럼). node:sqlite empirical=`no such column` **throw**(NULL 아님). cardId 매칭 성공 시 print_events/print_file_map 기록 500 + quality_issues 침묵 미생성 + 미throw경로 entity 1 고정(법인 오귀속). #377/workbench와 동일 컬럼오타 클래스 | Area 2 | #384 | ~1h |
| I-070 | [LOW-MED bug] 출고 알림톡 품목요약 card_id 경유 단일조인 — `kakao.ts:459` shipment_items를 card_id→cards→order_item_id로만 조인 → 주문단위 출고(card_id NULL) 품목명 누락 "제품" 폴백. 수정=COALESCE 양 경로 | Area 2 | #385 | ~30m |
| I-069 | [improvement] shell.js 정적에셋 외부화 **불완전 revert** — 런타임은 `layout.ts:181` `?raw` 인라인 복귀(prod green)인데 `build-assets.mjs`가 매 빌드마다 dead `/static/shell.<hash>.js`(소비처 0)·미사용 `ASSET_MANIFEST`(import 0) 생성 = 재외부화 오배선 시 MIME 2회다운 재현 트랩. #382(게이트 방어)의 보완(트랩 제거) | Area 1 | #383 | ~30m |
| I-068 | [improvement] 배포 게이트 `smoke.cjs`는 `/api/*` 전용 — 프론트 부트스트랩/MIME 장애를 못 잡아 shell.js 2회 prod 다운이 "Deploy 성공"으로 통과(E2E만 ~5분 후 적발). smoke에 경량 프론트 단언(`/` HTML 200+text/html+셸 마커) 추가 | Area 1 | #382 | ~1h |
| I-067 | [HIGH bug] orders 쓰기 엔드포인트 entity 격리 비대칭(IDOR) — read/delete는 격리, billing-status/cancel/PUT/bill/status/output-folder는 무필터 `WHERE id=?` → 멀티법인 MANAGER가 타법인 주문 청구/취소/balance 조작. 청구분할(72bd97e) PUT이 쓰기 증폭 | Area 5 | #381 | ~2h |
| I-065 | [improvement] printSystem N+1 2곳 — /media/bulk(2중루프 건별 SELECT, media id 메모리 보유라 재조회 불요)·/repair-links(3중 N+1 ~3000쿼리). setup/repair 저빈도 LOW | Area 2 | #379 | ~1.5h |
| I-062 | [improvement] 배포 스모크 로그인 단일시도(재시도 부재) → cold-start 일시 500이 deploy 게이트 파손 + E2E skip. bounded 재시도 or health warm-up ping | Area 1 | #374 | ~30m |
| I-061 | [MED bug] 입고검수 CANCELLED 시 재고만 역분개·PO status/received_quantity 미롤백 → PO 영구 RECEIVED 잔류 + 취소수량 재입고 불가(400 차단). #369(재고측)와 별개 PO측 롤백 | Area 4 | #373 | ~1.5h |

> ✅ 직전 New 8건(#336·#341·#350·#358·#359·#360·#362·#363) + Approved 2건(#340·#342) + 무ID close 7건(#361·#364·#365·#366·#367·#368·#369)은 Area 6(06-09T22:00) 전수 검증 후 **17건 전부 done 확정** → Done 표 이관.

---

## 🔧 Auto-fixed (자동 수정 완료)

| ID | 제목 | 커밋 | 날짜 |
|----|------|------|------|
| A-019 | #377 잔여분 — 주문생성 자동가공 `orders/create.ts:643` `SELECT id, name FROM items`(존재X 컬럼)→`item_name`. #377 원 위치(core.ts:1489)가 파일분할로 create.ts D.자동가공 블록으로 이동했고 owner 픽스 eadba44는 autoProcess.ts만 정정·이 경로 누락 → best-effort catch(:695)에 삼켜져 `auto_process_jobs` 미생성 지속. autoProcess.ts:96·eadba44와 동일 정정. 휴면 write 활성화 우려는 eadba44의 `ia_auto_enabled` 게이트(0308 기본 OFF)로 이미 해소(서빙 게이트라 job 생성돼도 미노출). 안전 자동수정(컬럼 사실-정정 A-017 클래스 + owner 승인 정정의 누락분 완성). verify PASS(tsc clean+build 391) | 96e98d2 | 2026-06-12 |
| A-018 | 대시보드 납기준수율 KPI 라벨 오기 정정 — `scripts/dashboard.js:47`이 skeleton 교체 시 KPI 그리드 재구성하며 "이번 달 **출고 기준**" 노출, 권위 서버템플릿 `pages/dashboard.ts:85`/title은 "**납기 기준**". #380 수정(6b06512) 후 메트릭이 `delivery_date` 기준 월버킷이므로 "납기 기준"이 정답 → JS 라벨을 권위본에 정합. 사실-정정+기존 사본 정렬(A-014 클래스), 동작/데이터 무변 텍스트만. verify PASS(tsc clean+build 383) | (이번 커밋) | 2026-06-11 |
| A-017 | workbench.ts 존재하지 않는 컬럼 `cl.name` 3곳(`:22/28/56`) → `cl.client_name`. clients 테이블은 `client_name`만(0001:45, `ADD name` 0건 ground-truth) → 매 호출 `no such column: cl.name` throw로 신규 workbench 시안검수 페이지(b0df71c) 주문목록/검색 전체 500. read-only SELECT + 응답 alias 이미 `as client_name`(형식 불변) + 외부효과·entity 귀속 무관 = 안전 자동수정(↔#384는 쓰기/멀티테넌시라 이슈). verify PASS(tsc clean + build 369 modules) | (이번 커밋) | 2026-06-11 |
| A-016 | shell.js 정적에셋 prod 2회 장애 복구 — `9dd09cd` 파일럿이 shell.js를 `/static`으로 외부화했으나 CF Pages **Git 자동빌드**에서 `_routes.json`의 `/static/* 제외`가 미적용 → 워커가 `/static/shell.js`를 Content-Type 빈값('')으로 서빙 → 브라우저 strict MIME 실행거부 → `shell.js` 사망(전 페이지 axios 인증헤더/법인스위처 초기화 실패, 401+무한로딩). `144addf`의 `_headers` Content-Type 명시 시도는 자동빌드 환경서 불충분 → **최종 해결 = 인라인 `?raw` 복귀**(`/static`·`_routes.json`·빌드순서 의존 전무, 워커 +75KB 안정성 우선). (직전 세션 픽스, Area 6 기록 보충) | 24bb493 (144addf 경유) | 2026-06-11 |
| A-015 | files.ts 업로드 R2 키 sanitize — `${folder}/${analysisId}/${file.name}` raw 조합(3요소 클라 제어, 키 인젝션) → A-013 패턴 정규화 (orphan, 동작 무변) | (이번 커밋) | 2026-06-05 |
| A-014 | silent-fail JS 버그 3건 — HR 직원검색 `q`→`search`(핵심검색 무력) + 홈택스 페이지네이션 총건수 0(`data.total`→`pagination.total`) + 홈택스 날짜 파라미터 `start_date`→`date_from` | (이번 커밋) | 2026-06-04 |
| A-013 | aiAnalysis 업로드 R2 키 `file.name` sanitize — path traversal/헤더 인젝션 방어(LOW, ADMIN전용) | (이번 커밋) | 2026-06-03 |
| A-012 | CAPS `GET /settings` 시크릿 노출 차단 — `relay_db_password`+`worker_api_key` 응답 제거(GET /sites 패턴 정렬) | (이번 커밋) | 2026-06-03 |
| A-011 | 재고 목록 "총 N개 품목" 집계 버그 — 페이지 slice 건수(최대 20) 대신 `pagination.total` 전체 COUNT 표시 | 44bd3ed | 2026-06-03 |
| A-010 | Deploy 차단 복구 — wrangler `--commit-message=<sha>` 고정 (한글 커밋메시지 100B 절단→UTF-8 깨짐 차단) | e396f2e | 2026-06-03 |
| A-009 | PO 번호 생성 entity 필터 누락 3곳 → 정규 시퀀스 경로 정렬 (reorder/quick/templates) | e8c8992 | 2026-06-02 |
| A-008 | try-catch 누락 17핸들러 (permissions/finishing/messageTemplates/iaAuto) | 60ee8b8 | 2026-05-14 |
| A-006 | XSS escapeHtml 5건 (approvals/invoice/purchaseInvoice/quotation/clients) | e099b20 | 2026-05-13 |
| A-005 | tax_invoice_items/orders tax_invoice_id 인덱스 추가 (0193 migration) | 1b3a698 | 2026-05-13 |
| A-004 | models.ts 미사용 타입 8개 제거 (UserSession 등) | 2f94080 | 2026-05-13 |
| A-003 | hono 4.12.18 + postcss 8.5.14 보안 패치 (JWT CVE 등 7건) | 16b1482 | 2026-05-12 |

---

## ✔️ Done (처리 완료)

| ID | 제목 | 커밋/Issue | 날짜 |
|----|------|-----------|------|
| I-064 | 출고 알림톡 일괄발송 부분/전체 실패 "N건 발송 완료" 오보고 — send-shipment-bulk 응답에 status(SUCCESS/PARTIAL/FAILED)·sent_count(실성공)·fail_count·failures[] 추가 + interpretBulkResult 건별 results[] + 프론트 결과모달(실패건 재발송). Area 6(06-12) 코드 직접 대조 후 close | #378 / 9be309d | 2026-06-12 |
| I-063 | AI 주문 자동가공 `auto_process_jobs` 침묵 실패(items.name 존재X 컬럼 throw) — 수동경로(autoProcess.ts /start·/approve)는 eadba44에서 item_name 정정+ia_auto_enabled 게이트, 주문생성경로(create.ts:643 잔여분)는 Area 6 A-019(96e98d2)에서 정정. 두 경로 완료 후 close | #377 / eadba44+96e98d2 | 2026-06-12 |
| I-066 | 대시보드 납기 준수율 KPI 2중 결함 — 결함1(updated_at 출고일 프록시)→`COALESCE(MAX(shipments.shipped_at),MAX(cards.shipped_at),updated_at)` 권위 출고일 + 결함2(SHIPPED 분모만)→`IN('SHIPPED','COMPLETED')` + 월귀속 created_at→delivery_date. Area 3(06-11) git 직접 검증 후 close. 라벨 정정(A-018) 동반 | #380 / 6b06512 | 2026-06-11 |
| I-061b | 입고검수 전량취소(inspection-decision CANCELLED) 멱등 가드 부재 + 비원자 재고 이중차감 — `inventory.ts:414-421` 멱등 가드 + 단일 batch 원자화. (#373=PO측 롤백은 별개 open) | #369 / d1c8b89 | 2026-06-09 |
| I-059 | 업무일자 UTC `date('now')` KST 미보정 — 표시층 formatKST 일괄 + 대시보드 created_at KPI + 회계 DATE컬럼 day-boundary KST 보정. 백엔드 자기일관 churn은 owner 디프리오 | #366 / b8d2f0d·7b64d04 | 2026-06-09 |
| I-058 | storage-zones 목록 `all_entities=1` 쿼리파라미터로 entity 격리 우회(IDOR 11번째, 역할검증 없이 필터 무력화) | #368 / b6d845d | 2026-06-09 |
| I-057 | CSV Formula Injection — 모든 CSV 내보내기 `=+-@` 선행 미가드 → 공용 `escapeCsvField` 단일화 가드(음수금액 숫자-안전) | #367 / 06ff136 | 2026-06-09 |
| I-056 | /api/files/* 범용 R2 프록시 격리 우회(HIGH) — 인증만 통과하면 임의 역할·타법인 전 파일 다운로드 | #365 / b2b170a | 2026-06-09 |
| I-055 | 죽은 레거시 테이블 inventory_items 잔존(LOW cleanup) — `0301_drop_inventory_items.sql` prod 0행 확인 후 DROP | #364 / f9c7ee4 | 2026-06-09 |
| I-054 | autoProcess 멀티테넌시 IDOR 비대칭(클러스터 10번째) — /pending만 entityFilter, 변경 핸들러 무가드 | #361 / b2b170a | 2026-06-09 |
| I-052 | 주요 데이터 로드 실패 시 스켈레톤 영구 잔류 + 에러피드백 전무 — 대시보드/지출결의서 catch-UX 보강 | #362 / b2b170a | 2026-06-09 |
| I-051 | CSV 내보내기 일관성 갭 — 발주요청·입고이력·자금계획 export 추가(peer 정합) | #363 / b2b170a | 2026-06-09 |
| I-050 | 멀티테넌시 IDOR 비대칭(HIGH) — quotations + 법인카드 corporate_cards /:id 격리 보강 (#356 8~9번째) | #360 / b2b170a | 2026-06-09 |
| I-049 | 지출결의서 목록 LIMIT 200 하드캡 → 페이지네이션·총건수 추가(silent truncation 해소) | #359 / b2b170a | 2026-06-09 |
| I-048 | 전자결재(approvals) 멀티테넌시 격리 갭(HIGH, #356 7번째) — list만 entityFilter였던 GET/:id·approve/reject 전 계열 entity 격리 (발주 9핸들러 포함) | #358 / 16915ed | 2026-06-09 |
| I-040 | N+1 신규 클러스터 — 급여 일괄/근태동기화 핫패스(전직원×5~7쿼리) + 발주 품목 루프 batch 전환 | #350 / 108b738 | 2026-06-09 |
| I-031 | N+1 batch 미전환 — PR→PO 변환 recentPO N+1 제거 + child INSERT batch (cashFlow 핫패스) | #341 / ba53c76 | 2026-06-09 |
| I-032 | rip.ts 설비 자식 테이블 entity_id 배선 — 설비 법인 격리 적용(스키마+로직+데이터보정). 직전 approved | #342 / 5e97f82 | 2026-06-09 |
| I-030 | E2E 프로덕션 crud-order 운영데이터 오염 격리 — afterAll cleanup(소프트취소+하드삭제 2회)로 prod 누적 0. cold-start 픽스처는 owner 별도 분리. 직전 approved | #340 / e8429cb | 2026-06-09 |
| I-028 | CI 폴백 자격증명 admin/password — 코드측 평문폴백 제거(a7a15cc). owner **위험수용 close**(pbkdf2 해시저장 확인, admin/password 테스트전용 간주) | #336 / a7a15cc | 2026-06-09 |
| I-046 | 멀티테넌시 격리 갭 6모듈 — /:id 상세·변경 entityFilter 보강 + inventoryCount/leaves 차감을 row entity_id 기준화(호출자 아님)로 교차훼손 차단. 코드검증: insuranceReports entityFilter 6회 | #356 / 6a8cb35 | 2026-06-05 |
| I-047 | 파일 업로드 검증 부재 — `utils/uploadValidation.ts` 신설(size/MIME/ext 화이트리스트) cardExpenses/po/files 적용 + receipt-image path-traversal 가드. 코드검증: 파일 존재 | #357 / 3baa38a | 2026-06-05 |
| I-027 | 저장형 XSS — escapeHtml 클라 7스크립트 + 서버템플릿 2종 + portalLayout 전역주입. portalBalance.js 잔여는 free-text 싱크 부재로 비대상(Area 6 검증) | #335 / da5f0ca | 2026-06-05 |
| I-041 | hr.ts 레거시 급여 endpoint 2개 제거(POST가 미존재 payrolls 테이블 INSERT→크래시, 호출처 0). 코드검증: `INTO payrolls` grep 0 | #351 / 9fdfdf4 | 2026-06-05 |
| I-042 | 현금영수증 탭 필터 무력 — 중복 element ID를 cr* prefix로 셰도잉 해소 + 날짜 파라미터 date_from/date_to 정렬. 코드검증: cashReceipts.js cr* 4개 | #352 / a742d27 | 2026-06-05 |
| I-033 | Dead-filter 3건 — 지출결의 날짜·포털주문 상태(869fcf9) + 생산 출력이력 장비/상태/날짜(printEvents 연결) | #343 / 0c04fad | 2026-06-05 |
| I-034 | 포털 셀프서비스 3건 — 세금계산서 PDF다운로드+페이지네이션 / 미수금 aging / 재주문 모달 | #344 / 0ce9c42 | 2026-06-05 |
| I-035 | 회계 내보내기·검색 — 세금계산서 CSV+지출결의 지급처/사유 검색(29e9fbc). ⚠️**정정(Area6 06-07)**: cashSchedule CSV는 29e9fbc에서 "LOW 미처리" 명시로 **미구현** → #363으로 신규 추적 중 (기존 "월별 CSV done" 기록은 부정확) | #345 / 29e9fbc | 2026-06-05 |
| I-036 | 필터·드릴다운 — 연차 부서필터 + 불량률→검수 드릴다운 + 미사용수당 응답정합 버그(48명 정상렌더) | #346 / 0c04fad | 2026-06-05 |
| I-043 | Dead-filter 클러스터 2탄 — 생산보드/원가/메시지/활동로그/매입/휴가 6건 백엔드 필터 UI 활성화+페이지네이션 | #353 / 0c04fad | 2026-06-05 |
| I-044 | 검수결과 목록 — 공급업체 드롭다운·결과상태·검수일범위·페이지네이션·CSV export(원시 ID 입력 해소) | #354 / 0c04fad | 2026-06-05 |
| I-045 | 여신초과 주문 전면실패 — owner가 (가)안 0300 마이그(approval_requests/templates 재빌드, CHECK에 CREDIT_OVERRIDE 추가)로 해소. ground-truth 재적용+INSERT 컬럼 정합 실측 검증 | #355 / 0300 | 2026-06-05 |
| I-025 | order_templates orphan 라우터 — 도달성 규칙으로 dead-code 재분류→owner (가)승인→삭제(templates.ts+drop마이그 0297, prod 404 확인) | #334 / a7a15cc | 2026-06-04 |
| I-026 | 하드코딩/약한 자격증명 — `fallback-dev-key` 제거(requirePiiKey 4곳) + reset-password 기본값 'password' 제거→필수화(400) | #338 / a7a15cc | 2026-06-04 |
| I-029 | 프로덕션 debug 엔드포인트 — `/api/debug/cards` 제거 + db-test/stats error.message 제네릭화 | #337 / a7a15cc | 2026-06-04 |
| I-039 | hr.ts 멀티테넌시 격리 갭 — 단건GET/detail/증명서 entityFilter 보강 + PUT entity_id mass-assignment 차단(item3 GET/payrolls는 #351 dead-code) | #349 / a7a15cc | 2026-06-04 |
| I-037 | cards.status CHECK 분기 — 0284/0296(7값 superset)+0298(레거시 상태 이관)로 해소, lifecycle.ts PRINT_ERROR→rip_status 처리 | #347 | 2026-06-04 |
| I-013 | 보안 헤더 추가 (X-Frame-Options/X-Content-Type/Referrer-Policy, HSTS/CSP 보류) | #32 | 2026-05-13 |
| I-014 | /api/portal/auth/change-password rate limit 적용 | #33 | 2026-05-13 |
| I-015 | XSS 잔여 escapeHtml 39개소 (approvals.js 24 + cards.js 15) | #34 | 2026-05-13 |
| I-016 | 대시보드 E2E 추가 (e2e/dashboard.spec.ts, 0e67ac6) | #35 | 2026-05-14 |
| I-018 | N+1 printSystem.ts batch 적용 (채번 필요부는 순차 유지) | #37 | 2026-05-14 |
| I-019 | N+1 settings.ts + priceLists.ts assign-clients | #38 | 2026-05-14 |
| I-020 | SELECT * 잔여 정리 (157→8건) | #39 | 2026-05-14 |
| I-021 | approvals 결재 페이지 — 기존 업무흐름 결재 연계로 확장 (owner 논의) | #43 | 2026-05-14 |
| I-022 | tasks.js 작업큐 — 사이드바 통합 검토 (owner 논의) | #44 | 2026-05-14 |
| I-023 | deliveryAnalytics + financialReports CSV 내보내기 | #45 | 2026-05-14 |
| I-024 | 장비 가동률 KPI — 근무시간 기반 가동시간 측정으로 확장 (owner 👍) | #46 | 2026-05-14 |
| I-017 | try-catch 누락 17핸들러 자동 수정 (permissions/finishing/messageTemplates/iaAuto) | A-008 / 60ee8b8 | 2026-05-14 |
| D-001 | shipment_items UNIQUE(shipment_id, card_id) 제약 추가 (0194 migration) | #31 | 2026-05-13 |
| I-015partial | 스모크 커버리지 55→88 엔드포인트 확대 | #15 | 2026-05-13 |
| I-012 | 원단 소모 예측 페이지 검색+상태 필터 추가 | #30 | 2026-05-13 |
| I-011 | 대시보드 전면 재설계: 납기 준수율 KPI + 생산 파이프라인 + KPI 클릭 연결 7개 | #29 | 2026-05-13 |
| F-006 | 주문 상세 모달 "카드 현황" 버튼 추가 | #28 | 2026-05-13 |
| F-005 | 출고 목록 거래처 헤더에 "계산서 발행" 링크 추가 | #27 | 2026-05-13 |
| I-010 | SELECT * 145건 제거 (178→6건, 96%) | #26 | 2026-05-13 |
| A-008 | priceList.ts + inspections.ts N+1 → db.batch() 전환 | #25 | 2026-05-13 |
| A-007 | inventory.ts 입고/출고/취소 N+1 3패턴 → batch 전환 | #24 | 2026-05-13 |
| B-010 | inventoryCount.ts 재고 실사 N+1 → db.batch() 전환 | #22 | 2026-05-13 |
| B-009 | taxInvoices.ts O(N×M×K) 중첩 N+1 → batch 전환 | #21 | 2026-05-13 |
| B-008 | shipments.ts N+1 → db.batch() 전환 | #20 | 2026-05-13 |
| B-007 | prices.ts + rip.ts Promise.all N+1 → IN절 일괄 조회 | #19 | 2026-05-13 |
| B-006 | entity_id 누락 10테이블 (0193 migration + INSERT 16건) | #18 | 2026-05-13 |
| I-007 | as any 902→45 (95% 제거, 9 커밋) | #17 | 2026-05-13 |
| B-005 | printEvents.ts N+1 → 이벤트당 5~7→3~4 쿼리 축소 | #16 | 2026-05-13 |
| I-008 | 스모크 커버리지 확대 (3개 자동 추가) | #15 | 2026-05-12 |
| A-002 | smoke.cjs 3개 엔드포인트 추가 (quotations/hometax/search) | 256e37c | 2026-05-12 |
| A-001 | entity_id INSERT 14건 누락 | c7c20d3 | — |
| B-001 | cards entity_id 격리 | 0960a5a | #1 |
| B-002 | LogWatcher URL + 서비스 실행 | (설정 수정) | #2 |
| B-003 | SHIPPED 카드 확인 모달 | 3dd4274 | #11 |
| B-004 | cards entity_id NULL 32건 보정 | (prod SQL) | #12 |
| I-001 | bank.ts N+1 제거 | 0960a5a | #3 |
| I-002 | autoProcess.ts N+1 제거 | 0960a5a | #4 |
| I-003 | approvals.ts N+1 제거 | 0960a5a | #5 |
| I-004 | clients API 응답 통일 | 0960a5a | #6 |
| I-005 | 로그인 rate limit 적용 | 44c1f04 | #13 |
| I-006 | hr.ts 에러 메시지 제네릭화 | 44c1f04 | #14 |
| F-001 | 거래처 필터 5개 | 575312d | #7 |
| F-002 | 주문 필터 CANCELLED 해소 | 575312d | #8 |
| F-003 | 대시보드 KPI 5개 | 575312d | #9 |

## ❌ Rejected

| ID | 제목 | 사유 | Issue |
|----|------|------|-------|
| I-009 | vite/esbuild dev server SSRF (GHSA-67mh) | "로컬 서버 전용이라 크게 문제 없음" — 프로덕션 영향 없음 | #23 |
| F-004 | 납품시간 disabled 이유 표시 | 용준님: "필요 없음" | #10 |
| I-038 | 전역 UNIQUE가 entity 복합 UNIQUE 무력화 (다법인 번호충돌 잠복) | owner not_planned — 운영 entity 1 수렴, 의도적 보류 | #348 |

---

## 오탐(False Positive) 패턴 — 탐지 제외 목록

> auto-improve 및 security-audit 실행 시 이하 패턴은 이슈 등록 금지.

| 패턴 | 이유 | 첫 발견 |
|------|------|----------|
| `webhooks.ts` `allowedPrefixes` Popbill IP 목록 | 의도적 보안 화이트리스트, 하드코딩 아님 | Area 5 (#20) |
| dev server 전용 취약점 (vite/esbuild SSRF 등) | 프로덕션 영향 없음, 개발자 PC 전용 | Area 1 (#23 거절) |
| disabled 필드에 이유 힌트 없음 | 용준님: 불필요 (F-004 거절 패턴) | Area 3 (#10 거절) |
| CORS `!origin → '*'` (`index.tsx:213`) | Bearer 토큰 인증(쿠키 미사용) — 브라우저는 항상 Origin 전송, 실질 무해 | Area 5 (2026-06-02) |
| rate limiter in-memory `Map` (`rateLimit.ts:6`) | isolate 분산 한계는 기존 인지 아키텍처 제약, 신규 이슈 아님 | Area 5 (2026-06-02) |
| 인덱스/UNIQUE 누락 후보 (ground-truth 미확인) | 로컬 D1 실제 스키마로 반증 필수 — 대부분 이미 존재하거나 hot path 아님 | Area 4 (2026-06-02) |
| orphan 라우터의 entity_id 격리 갭 (프론트 호출처 0건) | UI 도달 불가 = dead code 사안이지 보안 아님. 격리 갭 보고 전 `grep "api/<path>" src/scripts src/pages` 도달성 선검증 필수. **⚠️ 예외(#365)**: 클라 제공 키로 raw 리소스 서빙하는 범용 프록시(R2 파일 `files.ts` GET `/*` 등)는 0-refs여도 인증된 직접 HTTP 호출이 공격표면 → dead-code 강등 금지, 보안 이슈 | Area 6 (#334, 2026-06-04 / 예외 #365 2026-06-07) |
| 비원자적 다중 INSERT "고아 가능" (확정 실패 트리거 부재) | 부모→자식 별도 `.run()`이라도 자식 테이블에 CHECK/NOT-NULL 위반 등 **확정적 실패 트리거가 없으면** 거의 모든 다중문 코드에 해당하는 일반적 비원자성일 뿐 = 노이즈. #355류로 보고하려면 100% 실패하는 구체 트리거(CHECK 누락 리터럴 등) 실증 필요. order_items는 CHECK 0·전컬럼 nullable이라 견적전환/복사 비원자성은 오탐 | Area 4 (2026-06-06) |
| rate-limit "누락" 보고 (라우트 파일에 inline 미들웨어 없음) | rate limit은 라우트 파일이 아니라 `index.tsx`에서 `app.use('/api/...', rateLimitMiddleware(...))`로 **앱 레벨 전역 등록**(240-246: auth/portal login·users/portal change-pw·refresh·self-auth·verify-document·verify-token). 라우트 핸들러만 보면 항상 inline 부재로 오탐 — 보고 전 index.tsx 등록처 grep 필수 | Area 5 (2026-06-06) |
| "escapeHtml 헬퍼 전무(`grep -c escapeHtml`=0) → XSS" | `layout.ts:1185`가 `window.escapeHtml`를 **전역 정의**(+`portalLayout.ts` 포털용) → 모든 스크립트가 로컬 정의 없이 전역 헬퍼 호출 가능. 파일에 escapeHtml 미정의/미참조 ≠ 취약. 올바른 판정: 실제 `innerHTML` 싱크의 보간값이 (a)사용자 제어 free-text **이고** (b)미escape인지 확인. `Number()` 강제 숫자·시스템 채번코드(order_number 등)·서버 하드코딩 문자열은 싱크 아님. **⚠️ 예외(Area 5 06-10)**: `c.html()`로 자체 `<head>/<script>`를 통째 반환하는 **독립 출력페이지**(`pages/payslip.ts`·`pages/yearEnd.ts` = `/payslip/:id`·`/year-end/:id` 인쇄경로)는 layout 셸 미경유라 `window.escapeHtml` **부재** → "전역헬퍼 있으니 오탐" 논리 적용 금지. 직원 마스터 free-text를 innerHTML raw 연결하면 **진짜 stored XSS**(로컬 `esc()` 추가가 정답·안전 자동수정). 판별: 파일이 layout/shell import 없이 c.html 안에 자체 script + free-text 렌더 | Area 6 (2026-06-06 / 예외 06-10) |
| batch 결과 배열 인덱스 "정렬 불일치" 오독 | 부모-자식 2-pass batch에서 stmt배열(`parentStmts[]`)과 메타배열(`parentClientGroupIds[]`)을 같은 루프에서 push 후 `results[i]`로 매핑할 때 "한쪽은 `continue`로 건너뛰는데 다른 쪽은 무조건 실행→길이 불일치→매핑 깨짐 HIGH"로 보고하기 전, **두 push가 같은 `continue` 가드 뒤에 있는지** 확인. `if(parent_client_id) continue`가 **루프 최상단**이면 자식 행은 두 push를 **모두** 건너뛰어 길이 동일=정합(orders/core.ts:2207-2280·quotations.ts:273-320이 이 형태, 정상). 서브에이전트가 continue 위치를 오독해 HIGH 과대보고 2건 차단. 회피=(a)continue 줄 위치가 첫 push보다 위인지 (b)두 push 사이 별도 조건 push 있는지 직접 Read | Area 4 (2026-06-10) |
| VAT/금액 "부동소수점 누적 → 신고 오차" | 금액이 누적 **직전에 원/100원 단위 정수로 반올림**되면(예: quotations.ts:223 `Math.round(itemAmount/100)*100`) `×세율(0.1)`은 항상 10의 배수=정수라 IEEE754 drift 불가. node `Number.isInteger(누적값)` 실증으로 반증 필수. 견적(추정)↔세금계산서(`Math.round`+정합보정 `total≠supply+tax면 강제정렬`) 반올림 "불일치"도 발행단계가 권위계산이라 버그 아님. number↔REAL/INTEGER 타입표기 차이도 정상 TS | Area 2 (2026-06-08) |
| catch가 success 숨김 "데이터손실" (best-effort 물질화/보상) | try 안이 **부차 denormalized 물질화**(가격이력·cash_schedule 등 언제든 재계산 가능한 파생 데이터)이고 **주석에 best-effort 명시**(예: purchaseInvoices.ts:131/164 "receive Phase4와 동일 정책")면 의도적 설계. 핵심 비즈니스 write(주문/인보이스/잔액)가 try **밖**이면 오탐. batch 실패 후 보상(rollback) DELETE의 `.catch(()=>{})`도 보상 자체 실패는 더 할 게 없으므로 정상. 보고하려면 **핵심 mutation**이 삼켜지고 사용자에게 success로 보이는 구체 경로 실증 필요 | Area 2 (2026-06-08) |
| 트랜잭션 원자성 "분리 write 부분실패 → 고아/불일치" | `DB.batch()` 없이 분리 await 실행이라도 **분리가 구조적으로 강제**되면 노이즈: ① 부모 INSERT가 `result.meta.last_row_id`를 자식에 써야 함(bank apply·shipments 헤더·orders 헤더) ② 중간 READ(`balance_after` 잔량조회)가 끼어 batch 분할 불가피. 단순 "2번째 write 실패하면?"은 확정 트리거 없는 일반 비원자성. **보고 가능 = ①확정 재현 트리거**(멱등 가드 부재로 재시도/중복제출이 destructive write 반복 — 부분실패→500→목록잔류→재클릭, 버튼 재진입 가드 없는 더블클릭) **+ ②회피 가능성**(read를 메모리 산출로 대체해 단일 batch화 가능). #369가 둘 다 충족(보고됨). 보고 전 (a)재고/금액/잔액 변경인지 (b)선행상태 가드(`WHERE status!=...`)·프론트 버튼 재진입 가드 확인 | Area 2 (#369, 2026-06-09) |
| 무인증 self-service auth "브루트포스/열거 HIGH" 과대평가 | `/api/hr/self-auth`(사원번호+생년월일6자리)·portal `/verify-document`(토큰+BRN)처럼 **계정 없는 사용자용 간이 2팩터**는 authMiddleware 부재가 **설계 의도**(공개 진입점). 보고 전 ① `index.tsx:240-246` rate limit 전역 등록 확인(self-auth 5/분·verify-document 10/분 이미 적용) ② 두 팩터 결합(열거가능 식별자+추측가능 비밀)이 동일 코드베이스의 이미 "설계 정상" 판정 패턴과 동형인지 확인. IP-rate-limit 로테이션 한계·timing-attack(단일쿼리+문자열비교)은 모든 로그인 공통. **진짜 보고 대상**: rate limit 미등록 / 단일 팩터 인증 / scope·만료 없는 영구 토큰 발급 | Area 5 (2026-06-09) |

---

## 상태 변경 가이드

| 상태 | 의미 | 누가 변경 |
|------|------|----------|
| 🆕 new | 에이전트가 발견, 미검토 | auto-improve |
| 👀 reviewed | 용준님이 봄, 판단 보류 | 용준님 |
| ✅ approved | 진행 허가 | 용준님 |
| 🔨 in-progress | 구현 중 | Claude |
| ✔️ done | 완료, 배포됨 | Claude |
| ❌ rejected | 불필요 / 부적절 | 용준님 |
