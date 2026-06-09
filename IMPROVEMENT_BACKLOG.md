# Improvement Backlog
<!-- last_run_area: 1 -->
<!-- last_run_at: 2026-06-10T02:00:00+09:00 -->

> 자율 점검·개선 에이전트(auto-improve)가 6개 영역을 순환하며 발견한 항목.
> 용준님이 주기적으로 리뷰하여 상태를 변경 (new → approved → done, 또는 rejected).

## 통계
| 상태 | 건수 |
|------|------|
| 🆕 new | 3 (open auto-improve **실측 06-10T02:00** — #374(Area 1 smoke 로그인 재시도)·#373(Area 4 입고검수 PO롤백)·#372(Area 3 CSV truncation)) |
| ✅ approved | 0 (직전 approved #342/#340 모두 done 확정·이관 — Area 6 검증 완료) |
| 👀 reviewed | 0 |
| ✔️ done | 78 (61 + **06-09 신규 close 17건 전부 done 확정**: #336/#340/#341/#342/#350/#358/#359/#360/#361/#362/#363/#364/#365/#366/#367/#368/#369 — commit 증거+close 코멘트 전수 검증, rejected 0건) |
| ❌ rejected | 3 |

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
> **Area 4 데이터 정합성 (2026-06-09T14:00):**
> - **방법**: ground-truth — 299 마이그레이션 로컬 D1(node:sqlite) 전량 적용(**FAIL 0**, 171테이블/509인덱스) + baseline `npm ci`+tsc --noEmit PASS. Area 4 **8회차** — 기존 각도(마이그레이션·CHECK↔코드·balance/재고 대칭·FK cascade·트리거·비원자 고아#FP·dead table#364·UTC/KST#366·entity_id DEFAULT) 고갈 → **시의성 + 덜 다룬 각도** 병렬 Explore 2개: (A)방금 랜딩된 #366 KST 수정 5커밋이 신규 불일치 도입했는지 (B)크로스테이블 상태머신 정합성(정방향은 연관상태 갱신, 역방향 취소/삭제가 롤백 누락). 발견 전수 owner 직접 코드 검증(오탐 차단).
> - **🐛 신규 이슈 #373 (MED bug) — 입고검수 CANCELLED 시 재고만 역분개, PO status·received_quantity 미롤백**: PO 입고(`purchaseOrders/core.ts:receive`)에 거부수량 있으면 receipt `inspection_status='PENDING_REVIEW'`(`:1567`) + `purchase_order_items.received_quantity` 누적 + `purchase_orders.status`→RECEIVED/PARTIAL 전이(`:1382/1391`). 관리자 반려(`inspections.js:406`→`inventory.ts:413-466` CANCELLED)는 ✅재고 역분개·✅RECEIPT_CANCEL 트랜잭션·✅receipt status=CANCELLED 처리하나 ❌`received_quantity` 미감산 + ❌PO status 미롤백(`inventory.ts` 핸들러가 purchase_orders 미참조, grep 0). **잔류 모순**: 재고는 빠졌는데 PO는 RECEIVED 영구 잔류 + `remaining=quantity-received_quantity`(`:1494`) 오계산 → 취소수량 **재입고 불가**(400 차단). 발화=입고 시 거부수량(실무 빈번)→PENDING_REVIEW→반려. **도달성 확인**(inspections.js:406). **#369와 별개**(#369=재고측 멱등/원자성 이미 수정, 본건=PO측 롤백). **자동수정 안 함**(롤백 정책=비즈니스 로직+egress 검증불가).
> - **🔵 #366 KST 수정 5커밋 검증 — net-new 불일치 0(clean)**: 공용 헬퍼 `kstDate/kstDateOf/kstMonth`(`utils/kstDate.ts`) **단일 정의**. 잔여 raw `date('now')`(`auto_complete_date` shipments:735/814·orders/queries:250, `billable_after`)는 **write·read 둘 다 UTC로 자기일관**(스케줄링 트리거, core.ts:2532 `<=date('now')` 비교) → **owner가 #366에서 명시적 의도 축소**("저장↔비교 UTC 자기일관, 저장만 바꾸면 자동완료 타이밍 깨짐, 동시처리 필요해 제외"). 이중보정·혼합저장 0건. `purchase_orders.order_date` 기본값(`core.ts:996/2018/2135`)도 전 경로 UTC 일관(read `:211`도 UTC) → owner가 백엔드 date churn 디프리오("byte-identical, 리스크>가치, 점진 채택"). #366 표시층+백엔드 핵심 완료로 close(06-09T04:00). **KST 각도는 owner 신선 처리, 보고할 net-new 없음**.
> - **🔴 크로스테이블 오탐 차단 (에이전트 6갭 보고 → owner 코드 반증)**: ① **주문 soft-delete가 shipped 카드 미HOLD**(`orders/core.ts:1842` `shipped_at IS NULL` 가드) → **의도적**(이미 출고된 실물은 un-ship 불가, 가드 deliberate). ② **출고취소→카드 PRINTING 잔류** → 추측(확정 트리거 없음). ③ **견적 convert_count 미감산**(order 삭제 시) → audit 카운트+`force=true` escape hatch 의도 설계. ④ **세금계산서 취소 billed_at/billed_by 잔류**(billing_status=NULL만) → cosmetic audit, 재billing 시 덮어씀+balance 이중계산은 미입증(FP 위험) 드롭. ⑤ **카드→주문 역동기 부재** → 추측. **#373만 net-new인 이유**: 정상 실행 경로(검수 반려)에서 재고-PO 상태가 확정적으로 분기 + 재입고 차단이라는 구체 영향 보유.
> - **이상 없음**: 마이그레이션 299 FAIL 0, 트리거 0개. open auto-improve 실측 2건(#372/#373). baseline PASS.
> - 자동 수정 0건(net-new는 롤백 시맨틱=비즈니스 로직·검증불가), 신규 이슈 1건(#373), KST 5커밋 clean 검증, 크로스테이블 오탐 5건 차단
>
> **Area 3 UX/기능 감사 (2026-06-09T10:00):**
> - **방법**: baseline `npm ci`+tsc --noEmit PASS. Area 3 **7회차** — 기존 각도(dead-filter·하드캡(리스트표시)·getElementById silent-fail·catch-UX #362·CSV누락 #363·파괴적 confirm·변경후갱신·폼검증·journey) 고갈 → **덜 다룬 2각도** 병렬 Explore: (A)거래 리스트 검색범위 부족+실무 필터(날짜/상태) 부재 (B)정렬 불가+페이지네이션/대량로드 캡+빈상태 CTA. 발견 전수 owner 직접 코드 검증.
> - **🟡 신규 이슈 #372 (improvement, small) — CSV export 5곳 `LIMIT 5000` 무경고 silent truncation**: `purchaseOrders/core.ts:278`(발주목록)·`:338`(입고이력)·`inspections.ts:381`(검수결과)·`purchaseRequests.ts:276`(발주요청)·`cashSchedule.ts:122`(현금일정) CSV export가 전부 필터 후 `LIMIT 5000` + **잘림 표시 전무** → 필터링 결과 >5000행이면 사용자가 일부만 받은 줄 모르고 **정산·세무 대사를 불완전 데이터로** 수행. 발화는 저빈도(대부분 월 날짜필터로 좁힘)이나 **잘림을 인지할 수 없는 구조**가 원칙 위반·감사데이터 직결 → LOW. **자동수정 안 함**(경고 전달방식=UX 판단+egress export 검증불가). 수정: `LIMIT 5001` 조회→초과 감지→CSV 안내행/`X-Truncated` 헤더+toast(헬퍼 1개 5곳 적용).
> - **🔵 4각도 clean (owner 검증)**: ① **검색범위** — clients(name/code/keywords/brn/phone/mobile `:74`)·orders·quotations·purchaseOrders·shipments·taxInvoices·paymentRequests 전부 실무 컬럼 LIKE 완비, F-001(phone) **기수정**. ② **날짜/상태 필터** — orders·taxInvoices(`:379`)·shipments(`:37`)·paymentRequests 전부 date_from/to+status 구현. ③ **정렬** — quotations(`:94` amount_desc)·purchaseOrders(`:90` final_amount_desc/expected_date_asc)·clients(`:116` last_order) sort 파라미터 구현, 거래 리스트 정렬 갭 0. ④ **빈상태 CTA** — quotations/paymentRequests "데이터 없음" 텍스트만(CTA 버튼 없음)이나 운영중 시스템·온보딩 사용자 기준 저가치 드롭.
> - **이상 없음**: Area 3 5각도 성숙도 높음(2사이클 연속 핵심 갭 0). open auto-improve 실측 8건(new 6 + approved 2: #342/#340). baseline PASS.
> - 자동 수정 0건(Area 3 제안 전용), 신규 이슈 1건(#372), 4각도 clean, 백로그 stats 정정(직전 11건 close 반영 — open 7→8)
>
> **Area 2 코드 품질 (2026-06-09T06:00):**
> - **방법**: baseline `npm ci`+tsc --noEmit PASS. Area 2 **8회차** — 기존 각도(IDOR 비대칭 #356~#361 11모듈·N+1 #341/#350·entity_id·silent-fail·금액·best-effort catch) 고갈 → **덜 다룬 2각도**로 전환: (A)트랜잭션 원자성(핵심 write가 batch 없이 분리 실행되어 부분실패 시 정합성 손상) (B)프론트↔백엔드 데이터 계약 불일치(응답 필드/파라미터/형식). 병렬 Explore 2개 + 발견 전수 owner 직접 코드 검증(오탐 차단).
> - **🐛 신규 이슈 #369 (MED bug) — 입고검수 전량취소 멱등 가드 부재 + 비원자 실행 → 재고 이중차감**: `inventory.ts:393-466` `PATCH /receipts/:id/inspection-decision` CANCELLED 분기가 ① **멱등 가드 전무**(핸들러 진입 시 receipt 현재 상태 미검사, 차감/최종UPDATE에 `status!='CANCELLED'` 가드 없음) + ② **비원자**(재고차감 batch→잔량read→역분개 batch→receipt UPDATE 3분리, read 끼어 단일 batch 불가). **확정 재현 경로**: (A)부분실패—차감 commit 후 역분개/receipt UPDATE 실패→500→receipt PENDING_REVIEW 잔류(`:382` 목록에 남음)→프론트(inspections.js:396 에러시 reload 안함, 버튼 잔류)→재클릭 시 **재차감**. (B)중복제출—`inspectionsDecide`(:403) 요청중 버튼 비활성화·재진입 가드 없음→더블클릭 2회 차감. 영향: `inventory.quantity` 과차감(MAX(0) 클램프하나 잔여재고 있으면 실수량 초과 차감)+중복 RECEIPT_CANCEL 분개. **자동수정 안 함**(멱등가드·원자화=비즈니스 로직/실행 시맨틱 변경+egress 차단 검증불가). 수정방향: balance_after 메모리 산출로 단일 batch 원자화 + 선행상태 가드.
> - **🔴 트랜잭션 원자성 오탐 차단 (에이전트 5건 보고 → owner 코드 반증)**: ① **bank.ts apply(`:1006~1029`)** → cash_schedule 후속 UPDATE는 `try/catch`+주석 "보조 연동, 실패해도 입금 적용 영향없음"=best-effort FP / matched_payment_id는 batch `last_row_id` 의존이라 **구조적 batch 밖 강제**(payment·잔액·match_status는 이미 단일 batch 원자) → 저가치. ② **shipments.ts POST(`:379~458`)** → 출고헤더만 분리(shipmentId=last_row_id 의존), 카드/items/auto_complete는 **이미 단일 batch 원자**(주석 #195) → 구조적 강제+확정 트리거 없음=노이즈. ③ **orders/core.ts POST** → 헤더 INSERT 분리(last_row_id)+quotations `.catch()` best-effort+order_items batch → 동일 구조 노이즈. ④⑤ bank batch-apply 루프도 동일 best-effort. **inventory #369만 net-new인 이유**: 분리가 last_row_id 강제가 아니라 read 끼임(메모리 산출로 회피 가능) + **멱등 가드 부재라는 확정 트리거** 보유.
> - **🔵 API 계약 정합 — clean**: 프론트↔라우트 페이지네이션 필드(`page/limit/total/total_pages`)·응답 형식(`{success,data,pagination}`)·필터 파라미터·배열/객체 구조 전수 일치(purchaseOrders/clients/activityLogs/cardExpenses/costs/emails/inventory/kakao 등). 프론트도 `||0`/`?.`/기본값 방어 패턴. net-new 0건.
> - **🧬 탐지 규칙 강화 1건 (트랜잭션 원자성 오탐 패턴 codify)**: "다중 write가 batch 없이 분리 실행→부분실패 시 고아/불일치"는 **분리가 `last_row_id` 의존(자식 INSERT가 부모 auto-increment id 필요)이거나 중간 read 끼임이면 구조적 강제**라 일반 비원자성 노이즈. **보고 기준 = 확정 재현 트리거**(멱등 가드 부재로 재시도/중복제출이 destructive write를 반복하는 구체 경로) **+ 회피 가능성**(read를 메모리 산출로 대체해 단일 batch화 가능). 단순 "2번째 write 실패하면?"은 FP. → auto-improve SKILL(Area 2) callout 추가.
> - **이상 없음**: open auto-improve **16건**(new 15 + approved 2: #342/#340) stats 정합. baseline PASS.
> - 자동 수정 0건(net-new는 멱등/원자 시맨틱 변경·검증불가), 신규 이슈 1건(#369), 트랜잭션 원자성 오탐 4건 차단, API 계약 clean, 탐지 규칙 강화 1건
>
> **Area 1 프로덕션 헬스 (2026-06-09T02:00):**
> - **방법**: GitHub Actions 최근 30런(actions_list) 분석 + 로컬 verify + 최신 런 잡 단계 실측. egress는 여전히 Cloudflare 엣지 403 차단(`curl /api/health`→**403** 0.25s, `/`→**403** 0.61s) = 샌드박스 IP 차단이라 직접 20-API 호출 불가, E2E(실제 prod 페이지 브라우저 검증)를 헬스 신호로 사용.
> - **🟢 파이프라인 사실상 green (30런 중 29 success / 1 failure)**: Deploy **#173~180 전부 success** · E2E **#193~203 전부 success** · Daily D1 Backup #22 success. 유일 failure = **E2E #189(e4772b2, 06-07T00:18)** — 직전 Area 1에서 분석한 **#340 패턴**(crud-order prod 직접 주문생성 hard-fail + authedPage cold-start flaky). **동일 커밋 e4772b2의 다음 런 E2E #190(schedule 04:00)=success** → transient 자가복구, 코드 회귀 아님. 이후 #191~203(13런) 연속 green. queued/stuck 0건.
> - **최신 런 no-op green 아님 실측**: **E2E #203**(id 27131216372, HEAD **395d846**) "Run Playwright tests (production)" 단계 10:22:06→10:24:09 = **2m3s 실제 실행**, **run_attempt=1**(재시도 0), 전 스텝 success. Deploy #180(395d846)도 green. #340 패턴 이번 런 미발화.
> - **로컬 verify PASS**: `npm ci`→tsc --noEmit PASS + build PASS(360 modules, _worker.js 5.05MB raw). 유료 10MB 한도 대비 ~10% 점유, 헤드룸 충분.
> - **오탐/이상 없음**: deploy failure 0건 지속. egress 403은 샌드박스 IP 차단(기존 인지)이라 헬스 이상 아님. open auto-improve **16건**(new 14 + approved 2: #342/#340) stats 정합 재확인. #340(approved)은 egress 차단으로 prod 픽스처 검증 불가 → 전용 세션 대기 유지(13+ 연속 green으로 급성도 낮음).
> - 자동 수정 0건(파이프라인 정상·egress 차단으로 E2E 변경 검증 불가), 신규 이슈 0건
>
> **Area 6 자기 진화 (2026-06-08T22:00):**
> - **GitHub ↔ 백로그 전수 재동기 — 변경 0건(clean)**: open auto-improve **16건** 실측 = new 14(#368/#367/#366/#365/#364/#363/#362/#361/#360/#359/#358/#350/#341/#336) + approved 2(#342/#340) = 백로그 stats 정합. closed 목록 최신 updated_at=**#356(06-06T00:13)** → 직전 Area 6(06-07T22:00) 이후 **신규 close 0건**. done 61/rejected 3 유지. 이관할 항목 없음. baseline `npm ci`+tsc --noEmit PASS.
> - **🧬 탐지 규칙 강화 2건 (직전 Area 6 이후 사이클의 net-new 패턴 codify, owner 직접 코드 검증 후)**:
>   - **#368 클라이언트 플래그로 entity 필터 무력화 — IDOR 비대칭의 변종**: list가 `entityFilter`를 갖춰도 `?all_entities=1`류 쿼리 파라미터를 **역할 검증 없이** 신뢰해 필터를 끄면 우회. 기존 list-vs-detail 규칙은 "list가 필터를 쓴다"가 전제라 이 변종을 놓침. **ground-truth 검증**: `storageZones.ts:13/21` GET 핸들러가 authMiddleware만(role 0) + `all_entities`는 전 코드베이스에서 storageZones 단독(grep)=고유 갭. → security-audit SKILL(신규 callout) + auto-improve SKILL(Area 5 IDOR 규칙 변종 sub-bullet) codify. 탐지 출발점 = `grep -rn "c.req.query(" src/routes` 중 entity/필터 분기 제어 파라미터의 게이팅 여부.
>   - **#366 업무일자 UTC vs KST 탐지 규칙 — Area 4 신규 각도**: SQLite `date('now')`(UTC)를 업무 의미 날짜에 raw 사용 시 KST 00:00~09:00 입력 건 하루 어긋남. **ground-truth 검증**: `hr.ts:801/816`은 `+9 hours` 보정(KST 의도 확립)인데 `fixedAssets.ts:153 disposed_at`·`orders/operations.ts:103 order_date`는 raw `date('now')` = 불일치 실측. 저장 DATE(영구 off-by-one, 회계 귀속) > 비교 필터(일시) 우선순위. → auto-improve SKILL(Area 4 callout) codify. 탐지 = `grep -rn "date('now')" src/routes` 후 업무일자/감사타임스탬프 분류.
> - **오탐 패턴 신규 0건**: 두 패턴은 **true-positive 탐지 규칙**(이슈 #368/#366으로 이미 보고됨)이라 FP표가 아닌 스킬 callout에 등재. 기존 FP표 11개 패턴 유효성 재확인(신규 오탐 보고 0).
> - **이상 없음**: approved 2건(#342 설비 entity_id 전용세션 / #340 E2E 픽스처 전용세션)은 Area 6 범위 밖 유지. 직전 사이클(Area 1~5, 06-08) 산출 — Area 2 FP패턴 2건·Area 5 #367 CSV injection은 이미 스킬 반영 완료(중복 codify 회피).
> - 자동 수정 0건(메타 정리·문서), 신규 이슈 0건, done 이관 0건(신규 close 없음), 탐지 규칙 강화 2건(#368 스킬 2개 + #366 스킬 1개)
>
> **Area 5 보안 (2026-06-08T18:00):**
> - **방법**: baseline `npm ci`+tsc --noEmit PASS. Area 5 **7회차** — IDOR 비대칭(#356~#365 10모듈)·SQLi·rate·XSS·PII·파일프록시(#365) 고갈 → **덜 다룬 4각도**로 전환: (A)엔티티 컨텍스트 전환 인가(entityId=0/default_entity_id 전환 자체 게이팅 = 멀티테넌시 토대) (B)자기서비스 권한상승(hrSelf/profile/change-pw/reset) (C)JWT 발급·갱신 (D)CSV formula injection + 에러/로그 민감정보. 병렬 Explore 2개 + 발견 전수 owner 직접 코드 검증(오탐 차단).
> - **🐛 신규 이슈 #367 (MED bug) — CSV Formula Injection 전 내보내기 미가드**: CSV 헬퍼 4개(`csv.ts:3-10` generateCsv escape·`:60-67` escapeCsvField·`payroll/tax-agent.ts:21-28` csvField·`shipments.ts:849-852` 한진 esc) 전부 선행 `=+-@`(탭/CR) 미이스케이프 → 거래처명·품목명·주소·적요 등 **자유입력**이 셀에 그대로 들어가 다운로드 PC Excel에서 `=HYPERLINK(...)`/DDE 수식 실행. generateCsv 소비처 8라우트(PO/orders/생산실적/손익/원장AR·AP/납기분석/reports). 발화는 ①주입+②권한자 export+Excel오픈 조건이나 HYPERLINK류 유출은 무경고 가능 → MED. **자동수정 안 함**(4구현 일괄 + **금융 음수금액 텍스트화 회귀 위험**(숫자-안전 가드 `isNaN(Number(str))` 필요) + egress export 검증불가).
> - **🐛 신규 이슈 #368 (MED bug) — storageZones `all_entities=1` 쿼리로 entity 격리 우회, IDOR 11번째 모듈**: `storageZones.ts:13/22` GET 목록이 클라 제공 `all_entities=1`을 **역할검증 없이** 신뢰해 entity 필터 생략 → 임의 STAFF가 `?all_entities=1`로 전 법인 구역+담당자+품목수 열람. `all_entities`는 이 모듈에만 존재(전수 grep)=고유 갭. 프론트 관리페이지(`storageZones.js:27`)가 이 파라미터로 호출하나 API에 호출자 검증 0. 부수: `GET /:id`(`:70`) entity필터 무(프론트 0-refs orphan #334이나 GET목록으로 id수집 후 직접호출 도달)·PUT/DELETE(ADMIN게이트, entity무필터, body.entity_id 재배정). **자동수정 안 함**(역할/인가 시맨틱+egress 검증불가).
> - **🔵 인증/인가 토대 검증 — clean (수많은 IDOR 이슈의 "ADMIN 기본 자기법인" 전제가 토대에서 성립)**: ① `auth.ts:169` `/switch-entity` — entity_id=0(전체모드)은 ADMIN만(`role!=='ADMIN'→403`), 일반 사용자는 본인 `default_entity_id` 일치 법인만(`!=entity_id→403`). login은 DB default_entity_id만 신뢰, 요청 override 불가. `X-Entity-Id`류 헤더/쿼리 override 0건(grep). ② 자기서비스 권한상승 0 — `/me` PATCH 부재, `/change-password` 현재비번검증+비번만, users PATCH requireAdmin+화이트리스트, hr PUT 급여필드 ADMIN/MANAGER게이트+entity_id mass-assign 차단(#349). ③ JWT refresh DB 재검증 없이 클레임 복사(`auth.ts:119`)는 stateless 일반한계+role변경 권한 ADMIN뿐이라 단독 악용경로 없음(보고 대상 아님).
> - **🔴 오탐/저가치 드롭**: settings.ts:230 바로빌 error.message 노출(ADMIN requireRole 게이트=기존 LOW 보류 방침)·shipments.ts:514 내부 fetch Authorization 헤더(직접 로깅 없음, 정상 전파).
> - 자동 수정 0건(net-new는 출력/인가 시맨틱+egress 검증불가), 신규 이슈 2건(#367 CSV injection·#368 storageZones 우회), 인증/인가 토대 clean 확인, 오탐 2건 드롭
>
> **Area 4 데이터 정합성 (2026-06-08T14:00):**
> - **방법**: ground-truth — 297 마이그레이션 로컬 D1(node:sqlite v22) 전량 적용(**FAIL 0**, 172테이블/511인덱스) + write-path 교차검증. Area 4 **7회차** — 기존 각도(마이그레이션 적용·CHECK↔코드·balance/재고 대칭·FK cascade·트리거·비원자 고아#FP·dead table#364) 고갈 → **ground-truth가 놓치는 사각 + 덜 다룬 각도**로 전환: (A)`ADD COLUMN NOT NULL`(no DEFAULT) 프로덕션 실패 (B)집계 합계 denorm drift (C)UNIQUE vs soft-delete 재삽입 충돌 (D)timezone UTC vs KST 업무일자 (E)entity_id DEFAULT 일관성. 병렬 Explore 2개 + 발견 전수 owner 직접 코드 검증(오탐 차단).
> - **🐛 신규 이슈 #366 (MED bug) — 업무일자 UTC `date('now')` 사용으로 KST 새벽 입력 건 하루 어긋남**: SQLite `'now'`는 UTC인데 **업무 의미 날짜**가 raw `date('now')`로 기록/비교됨. ① **저장(영구 off-by-one)**: `fixedAssets.ts:153 disposed_at`(처분일=회계인식일)·`orders/operations.ts:105 order_date`(복사, 매출귀속)·`shipments.ts:449/814·orders/queries.ts:250 auto_complete_date`. ② **비교 필터(일시)**: PO 납기경과(`purchaseOrders/core.ts:78/135/271`)·AR 연체(`accounts-receivable.ts:1145`)·카드 납기창(`cards/queries.ts:271-430`)·dashboard "오늘". **핵심 증거 = 불일치**: `hr.ts:800-801`은 `// KST 기준 오늘 (UTC+9)` + `todayKst`/`'+9 hours'`로 보정(근태) → KST 의도 확립인데 나머지 미보정. 발화는 KST 00:00~09:00(37.5%) 한정이나 ①저장값은 영구·회계귀속 직결. **자동수정 안 함**(날짜 시맨틱=비즈니스 로직 변경 + 사용처 분류 선행 + egress 차단 검증불가, 잘못 보정 시 정상 UTC 감사로그 훼손 위험).
> - **🔴 오탐 차단 (에이전트 보고 → owner 코드 반증)**: ① **nts_approval_number UNIQUE vs CANCELLED** → 오탐: `0283` 주석 "국세청 승인번호 **중복수집 방지**" 무결성 가드. NTS 발행마다 고유번호 → CANCELLED 원본(원번호)·재발행(새번호) 같은 번호 공유 불가 → 충돌 불성립. ② **shipment_number UNIQUE vs CANCELLED** → 오탐: 순차채번, 취소후 재출고는 새번호, 재사용 경로 0. ③ **집계 합계 denorm drift** → 오탐(비원자성 기등록 FP): orders/quotations/PO/tax_invoices 자식 변경은 **PUT 전체재구성 1경로뿐**(개별 item PATCH 부재)+부모 합계 자식기준 재계산. "batch실패/동시접근 drift"는 확정 실패 트리거 없는 일반 비원자성. tax_invoices `/direct`도 "헤더후 자식" 의도패턴(`:1052` 주석).
> - **🔵 entity_id DEFAULT 일관성 clean**: ground-truth 전수 — entity_id 보유 97테이블 **전부 DEFAULT 1**(비-1 default 0건). 예외 `entity_settings`(엔티티 자체)·`activity_logs`/`migration_logs`(감사로그 entity무관)뿐. 트랜잭션 INSERT는 `getEntityId` 명시주입.
> - **이상 없음**: 마이그레이션 297 FAIL 0, `ADD COLUMN NOT NULL`(no DEFAULT) **0건**(프로덕션 마이그 실패 리스크 없음), 트리거 0개. leave_requests UNIQUE 재신청 충돌은 `leaves.ts:372` catch로 graceful + 의도적 dedup 가능성 → 저가치 드롭.
> - 자동 수정 0건(net-new는 날짜 시맨틱 변경·검증불가), 신규 이슈 1건(#366), 오탐 3건 차단, entity_id 일관성 clean
>
> **Area 3 UX/기능 감사 (2026-06-08T10:00):**
> - **방법**: baseline `npm ci`+tsc --noEmit PASS + build PASS(360 modules, _worker.js 5.0MB). 코드베이스 Area 3 **6회차** — 기존 각도(dead-filter·하드캡·getElementById silent-fail·catch-UX#362·CSV일관성#363) 고갈 → **덜 다룬 4각도**로 전환: (A1)파괴적 액션 confirm 부재 (A2)변경(생성/수정/삭제) 후 목록 미갱신·성공피드백 부재 (B1)폼 클라이언트 검증 피드백 부재 (B2)페이지간 journey 단절(navigation 링크). 병렬 Explore 2개 + owner 직접 스팟체크(오탐 차단).
> - **🟢 net-new 0건 — 4각도 전부 이미 성숙/일관 구현**:
>   - **A1 파괴적 confirm**: 삭제/취소/승인거부/비활성 mutation 전수 — 전부 `showConfirm(...,{danger:true})` 또는 네이티브 `confirm`/`prompt` 게이트 보유. peer 정상: orders.js:1255·clients.js:399·purchaseOrders.js:440·taxInvoices.js:734·leaves.js:254·approvals.js:388·paymentRequests.js:152. **owner 스팟체크 검증**: storageZones.js:209·priceLists.js:161(에이전트 미언급 파일)도 showConfirm+load+showToast 정상 = 0건 결론 신뢰.
>   - **A2 변경후 갱신/피드백**: mutation 성공 후 전부 `load()/reload()` 재호출 또는 modal 재로드 + `showToast`. 오탐 드롭: equipment.js:626(`openDetail`)·inspections.js:173(`loadTemplates`)·payroll.js:468(`payrollLoad`)·payrollRates.js:159·purchaseOrderForm.js:824(:742 GET 재로드) — 전부 갱신됨.
>   - **B1 폼 검증**: purchaseOrderForm/quotationForm/purchaseRequestForm/taxInvoices/cashReceipts/hr 등 주요 폼 전부 필수값·금액·수량·날짜·품목행 검증 + `showToast` 피드백 보유(quotationForm.js:489-504·purchaseOrderForm.js:698). 저가치 드롭: cashReceipts.js:204(totalAmount 자동계산)·purchaseRequestForm 공급업체 선택(null 허용).
>   - **B2 journey**: 핵심 경로 연결됨 — 주문↔견적·거래처→원장(clientDetail→/ledger)·주문→카드현황(/cards?search). 제외: 견적상세→전환주문 역링크(단방향 정책 허용)·세금계산서상세→원장(목록 거래처 클릭으로 해결)·F-004류 미세 인터랙션.
> - **이상 없음**: open auto-improve **13건**(new 11 + approved 2: #342/#340) stats 정합 재확인. Area 3 4각도 성숙도 높음 → 차기 6회차+는 한계효용 체감, 신규 페이지 추가분 표면에 집중 권장.
> - 자동 수정 0건(Area 3 제안 전용), 신규 이슈 0건(4각도 전부 일관 구현), 오탐/저가치 드롭 다수
>
> **Area 2 코드 품질 (2026-06-08T06:00):**
> - **방법**: baseline `npm ci`+tsc --noEmit PASS + build PASS(360 modules, _worker.js 5.0MB). Area 2 **7회차** — IDOR 비대칭(#356~#361 10모듈 클러스터)·N+1·entity_id·silent-fail(getElementById) 고갈 → **덜 다룬 2각도**로 전환: (A)floating-promise/누락 await·백엔드 에러삼킴 (B)금액 계산 정확성(VAT 반올림·balance 부호·NaN)·models.ts↔스키마 drift. 병렬 Explore 2개 + 발견 전수 owner 직접 코드·런타임 검증(오탐 차단).
> - **🟢 net-new 0건 — 두 각도 발견 전부 오탐/의도적 best-effort**:
>   - **금액 각도(B)**: VAT 부동소수점 누적(quotations.ts:226/389) → **오탐**: `itemAmount`가 `:223`에서 `Math.round(/100)*100`로 **100원 단위 선반올림** → `×0.1`은 항상 10의 배수(정수). node 2000건 누적 스트레스 `Number.isInteger=true` 실증 = drift 불가. quotations↔taxInvoices "반올림 불일치"도 견적은 추정·세금계산서는 `Math.round`+`:946` 정합보정(`total≠supply+tax면 강제정렬`)이라 발행단계 권위계산 정상. balance 부호오류 → **오탐**(Area 4가 정/역 대칭 검증 완료, 추측 시나리오). NaN → **오탐**(`Number(x)||0`이 NaN→0 가드). 타입 drift(number↔REAL/INTEGER) → 정상 TS 관행, 버그 아님.
>   - **에러삼킴 각도(A)**: purchaseInvoices.ts:150/190 catch 무시 → **의도적 best-effort**(`:131` "best-effort, receive Phase4와 동일 정책" + `:164-166` 주석 명시). 핵심 write(PO item 단가·inventory valuation·PO총액·invoice INSERT)는 try **밖**, 부차 denormalized 물질화(supplier 단가이력·cash_schedule)만 best-effort. quotations.ts:111 lazy-expiry `.catch(()=>{})` = 다음 조회 재시도(무해). inspections.ts:269·taxInvoices.ts:1047 = batch 실패 후 **보상(rollback) DELETE catch**(보상 자체 실패는 더 할 게 없음, 정상).
> - **🧬 오탐 패턴 2건 신설**: ① "VAT/금액 부동소수점 누적 → 신고 오차"는 **금액이 사전에 원/100원 단위 정수로 반올림되면 ×세율이 정수배라 drift 불가** → 보고 전 누적 직전 값이 정수인지 확인 필수(node Number.isInteger 실증). ② "catch가 success 숨김 → 데이터손실"은 **try 안이 부차 denormalized 물질화(가격이력·cash_schedule 등 재계산 가능 파생)이고 주석에 best-effort 명시**면 의도적 설계 → 핵심 비즈니스 write가 try 밖이면 오탐. 보상(rollback) catch도 정상. FP표 2행 + auto-improve SKILL(Area 2) 갱신.
> - **이상 없음**: open auto-improve **13건**(new 11 + approved 2: #342/#340) stats 정합 재확인. baseline PASS.
> - 자동 수정 0건(net-new 없음), 신규 이슈 0건(전부 오탐/의도적 best-effort), 오탐 패턴 2건 신설(스킬+FP표 갱신)
>
> **Area 1 프로덕션 헬스 (2026-06-08T02:00):**
> - **방법**: GitHub Actions 최근 30런 분석 + 로컬 verify + 실패 런 잡 로그 실측. egress는 여전히 Cloudflare 엣지 403 차단(`curl /api/health`→**403** 0.51s, `/`→**403** 0.08s) → 샌드박스 IP 차단이라 직접 20-API 호출 불가, E2E(실제 prod 페이지 브라우저 검증)를 헬스 신호로 사용.
> - **🟢 파이프라인 사실상 green (1건 transient 자가복구)**: 최근 30런 = Deploy **#158~170 전부 success** · E2E **#178~192 중 #189만 failure 나머지 success** · Daily D1 Backup #20/#21 success. queued/stuck run 0건. **최신 런(E2E #192 id 27087003269 08:10, Deploy #170 08:09) 전부 green** — HEAD 889ca7a(직전 Area 6 커밋) 기준.
> - **E2E #189 단일 failure = 알려진 #340 패턴, 동일커밋 자가복구**: id 27077838607(06-07 00:18, **e4772b2**) 잡 로그 실측 — `1 failed: crud-order-lifecycle.spec.ts:33 주문생성`(프로덕션 직접 주문생성 hard-fail, 설계 데이터오염 이슈) + `3 flaky: crud-clients/crud-order 거래처생성/dashboard`(cold-start, retry 통과) + `21 passed`. **동일 커밋 e4772b2의 다음 런 E2E #190(schedule, 04:00)은 전부 success** → transient, 코드 회귀 아님. #340(approved) 픽스처 cold-start 안정화는 egress 차단으로 prod 검증 불가(전용 세션 대기), crud-order 격리는 설계결정 대기. 급성도 낮아 추가 코멘트 보류.
> - **로컬 verify PASS**: `npm ci`→tsc --noEmit PASS + build PASS(360 modules, _worker.js 5.0MB raw). 배포 13/13 성공 = 유료 10MB 한도 대비 ~10% 점유, 헤드룸 충분.
> - **오탐/이상 없음**: deploy failure 0건(A-010 이후 지속). egress 403은 샌드박스 IP 차단(기존 인지)이라 헬스 이상 아님. open auto-improve **13건**(new 11 + approved 2: #342/#340) stats 정합 재확인.
> - 자동 수정 0건(파이프라인 정상·egress 차단으로 E2E 변경 검증 불가), 신규 이슈 0건
>
> **Area 6 자기 진화 (2026-06-07T22:00):**
> - **GitHub ↔ 백로그 전수 재동기 — 변경 0건(clean)**: open auto-improve **13건**(new 11: #365/#364/#363/#362/#361/#360/#359/#358/#350/#341/#336 + approved 2: #342/#340) 실측 = 백로그 stats 정합. closed 목록 최신 updated_at=#356(06-06T00:13) → **직전 Area 6(06-06T10:00) 11건 done 확정 이후 신규 close 0건**. done 61/rejected 3 유지. 이관할 항목 없음.
> - **🔧 백로그 정확성 정정 (#363 지적 검증·확정)**: `I-035/#345`가 "cashSchedule 월별 CSV done"으로 기록됐으나, **commit 29e9fbc 본문이 "(#345 (2) cashSchedule CSV는 LOW 미처리)" 명시** + `grep csv src/scripts/cashSchedule.js` **0건** = cashSchedule CSV 실제 미구현. #345는 전체로 owner close(taxInvoices CSV+지출결의 검색은 구현)이나 cashSchedule CSV 서브항목은 **#363으로 신규 추적 중**. done 표 I-035 행에 정정 주석 추가(커밋 해시도 0c04fad→29e9fbc 정정).
> - **🧬 탐지 규칙 강화 — 도달성 규칙(#334)의 "범용 서빙 프록시" 예외 codify**: #365(`files.ts` GET `/*` R2 프록시 격리 우회) 검증에서 확립. "호출처 0건=dead code"는 **UI 트리거형 격리 갭**에만 적용 — **클라 제공 키로 raw 리소스를 DB·entity·역할 검증 없이 서빙하는 범용 엔드포인트**(R2 파일 프록시 등)는 프론트 참조 0건이어도 **인증된 직접 HTTP 호출이 공격표면**(키 구조적·타 응답 노출로 도달 가능) → dead-code 강등 금지, 보안 이슈. files.ts:12 코드 직접 재확인(authMiddleware+path-traversal 가드만, R2.get 전 DB조회 0). **3개 스킬+FP표 갱신**: security-audit SKILL(도달성 callout 예외) + auto-improve SKILL(Area 2 reachability callout + Area 6 학습패턴) + 백로그 FP표 orphan 행.
> - **이상 없음**: approved 2건(#342 설비 entity_id 전용세션 / #340 E2E 픽스처 전용세션)은 Area 6 범위 밖 유지. 기존 FP표 9개 패턴 유효성 재확인(신규 오탐 보고 0). baseline `npm ci`+tsc --noEmit PASS.
> - 자동 수정 0건(메타 정리·문서), 신규 이슈 0건, done 이관 0건(신규 close 없음), 백로그 정정 1건(I-035), 탐지 규칙 강화 1건(#365 예외, 스킬 2개+FP표 갱신)
>
> **Area 5 보안 (2026-06-07T18:00):**
> - **방법**: baseline `npm ci`+tsc --noEmit PASS + build PASS(360 modules, exit0). Area 5 6회+ 감사로 한계효용 체감 + 최근 코드커밋이 전부 직전 감사완료분(#345~#356) → **덜 다룬 각도**로 전환: IDOR 비대칭(list-vs-detail)은 10모듈 고갈 → (1)mass-assignment (2)권한검사 누락 (3)인증/토큰 (4)**파일 다운로드 IDOR** (5)PII노출. 병렬 Explore 2개 + 발견 전수 owner 직접 코드 검증(오탐 차단).
> - **🐛 신규 이슈 #365 (HIGH bug) — `/api/files/*` 범용 R2 프록시 격리 우회**: `files.ts:12` GET이 `authMiddleware`만(임의 역할) + path-traversal 가드뿐, **DB조회·entity·소유권·역할 검증 전무**로 생 R2 키 서빙. 같은 `R2_BUCKET`의 전용 다운로드는 격리 적용(po `/receipts/:id/statement` entityFilter·aiAnalysis `/:id/download` entityFilter #339·cardExpenses `/receipt-image/*` ADMIN/MANAGER게이트)인데 `/api/files/<같은키>`로 **전부 우회** → 임의 역할(STAFF 포함)·타법인이 거래명세서·영수증·소스 다운로드. 라이브 마운트(index.tsx:310). **프론트 참조 0건이나** 도달성 규칙(#334)의 "orphan=무해"는 UI트리거형 격리갭 한정 — 범용 파일서빙 프록시는 **인증된 직접 HTTP호출이 공격표면**(키는 구조적+응답노출). 역할 우회(STAFF→ADMIN/MANAGER 영수증)는 단일법인에서도 즉시 발화. 부수: cardExpenses `/receipt-image/*`도 raw키·entity 미격리(ADMIN/MANAGER 게이트라 우선순위 낮음). **자동수정 안 함**(라우트 삭제 or 인증격리 시맨틱 변경 + egress 차단 런타임 검증불가, #356/#358/#360/#361 동일 사유).
> - **🔴 오탐 차단 (에이전트 보고 → owner 코드 반증)**: ① insuranceReports.ts:72 "rrn 평문 노출 HIGH" → **오탐**: rrn은 `employees.resident_number`(`encryptPII` AES-256-GCM, `aes:` 접두)에서 복사된 **암호문** 반환 + report 레벨 `entityFilter`(:68)로 IDOR 아님. ② tax-agent PII 마스킹 불일치 → maskRrn 정상동작·ADMIN unmask 의도적, 버그 아님. ③ portal 토큰 재사용(expires_at만, revocation 부재) → 매직링크 설계 선택, LOW·기능변경이라 미보고.
> - **이상 없음**: mass-assignment 전수(users/clients/items/orders/permissions/hr PUT·PATCH 전부 화이트리스트 or ADMIN eid=0 분기, #349 hr.ts 기수정) net-new 0. 권한검사(role변경/permission/reset-pw/approve 전부 requireRole+소유권) 적정. JWT HS256·exp·시크릿폴백 0(`c.env.X||'lit'` grep 0). 포털 client_id 격리·rate-limit(index.tsx:240-246 전역)·XSS(window.escapeHtml 전역) 정상.
> - 자동 수정 0건(net-new는 인증격리 시맨틱+런타임 검증불가), 신규 이슈 1건(#365), 오탐 3건 차단
>
> **Area 4 데이터 정합성 (2026-06-07T14:00):**
> - **방법**: ground-truth — 297개 마이그레이션 로컬 D1(node:sqlite v22) 전량 적용(**FAIL 0**, 171테이블/511인덱스). 마이그레이션 표면이 직전 Area 4(0300)와 동일 → **덜 다룬 각도**로 전환: (1)트리거·DEFAULT↔CHECK 충돌 (2)FK cascade 부모DELETE 고아 (3)denormalized 집계필드 drift(prior 5사이클 미감사). baseline `npm ci`+tsc PASS + build PASS(360 modules, exit0). 에이전트 보고 owner 직접 코드 검증.
> - **🟡 신규 이슈 #364 (LOW cleanup) — 죽은 레거시 테이블 inventory_items 잔존**: 현행 재고는 `inventory`(quantity/safe_stock)인데 origin 레거시 `inventory_items`(current_stock/safety_stock, 0003 생성)가 **빈 채로 스키마 잔존** + **src 참조 0건**(grep). `0134`(2026-04-15)이 4개 자식 FK를 inventory_items→items로 이미 재지정 후 비어있음 확인. 런타임 영향 없음(데이터 정합성 버그 아님)이나 **split-brain 혼선 위험**(이름이 재고 테이블처럼 보여 향후 오용 시 재고 데이터 분기). **자동수정 안 함**(테이블 DROP=스키마 변경, 프로덕션 0행 확인 후 권장).
> - **🔵 denormalized 잔액 정합 — 완전 대칭 확인(clean)**: `clients.balance`(미수금)·`purchase_balance`(매입채무) 갱신 전 경로 정/역 대칭 — 주문BILLING(core.ts:565↔636)·세금계산서 직접발행(taxInvoices:997↔1809)·입금(AR:639↔684)·감액(AR:1211↔1278)·발주확정(PO:1251↔1257)·지급(AP:403↔518)·매입감액(AP:596↔664). soft/hard delete 이중차감은 status=CANCELLED 필터로 차단. **영구 drift 가능성 없음**(방어코드 우수).
> - **🔵 재고 수량 정합(clean)**: `inventory.quantity` UPDATE 7경로 대칭 ledger — 입고+(inventory.ts:306/623)·출고-(stockShip:51)·반품복원+(returns:127)·자동차감-및역+(autoDeduct:186/230)·실사조정(inventoryCount:245)·입고확정(PO:1533). MAX(0,...) 클램프는 방어적.
> - **이상 없음**: 트리거 0개. DEFAULT↔CHECK 충돌 0건. FK 151 NO_ACTION이나 주요 aggregate(orders/PO/tax_invoices/PR/quotations) DELETE는 자식 명시적 cascade 정리(orders/core.ts:1895-1918 18테이블)로 고아 방어 + D1 기본 FK enforce. DELETE-고아 각도는 저수율(소유 자식 대부분 CASCADE 정의 또는 코드 정리).
> - 자동 수정 0건(net-new 정합성 버그 없음·#364는 스키마 DROP), 신규 이슈 1건(#364), denorm/재고 2각도 clean 확인
>
> **Area 3 UX/기능 감사 (2026-06-06T22:00):**
> - **방법**: baseline `npm ci`+tsc --noEmit PASS + build PASS(360 modules, 5.0MB). 코드베이스 Area 3 **5회차** — dead-filter·하드캡·getElementById silent-fail은 고갈 → **덜 다룬 각도**(catch 블록 로드실패 UX·CSV 일관성·journey)에 병렬 Explore 2개(영업·회계 / 생산·재고·HR·대시보드). 에이전트 보고 전수 owner 직접 코드 검증(오탐 차단).
> - **🐛 신규 이슈 #362 (MED bug) — 주요 데이터 로드 실패 시 스켈레톤 영구 잔류**: ① `dashboard.js:203-205` `loadDashboardStats` catch가 `console.error`만 → `/api/dashboard/stats` 실패 시 `kpiArea` `.ds-skeleton` 미교체(복구는 `if(success)` `:38` 안에만) = **랜딩 대시보드 영구 스켈레톤** ② `paymentRequests.js:34-36` 동일 패턴(skeleton 잔류). 사용자는 "무한 로딩"으로 오인. peer 정상사례 `quotations.js:72`(에러행)·`receiving.js:156`(에러행)·`cashSchedule.js:40`(showToast). **이전 Area 3는 silent-fail을 ID/param 불일치 각도로만 봤고 catch-UX는 미감사 각도**. **자동수정 안 함**(user-facing 에러 UI 추가=Area 3 제안범위, 문구/재시도 디자인 owner 위임).
> - **🟡 신규 이슈 #363 (improvement) — CSV 일관성 갭 3건**: purchaseRequests(peer purchaseOrders `exportPoCsv` 보유)·receiving(peer shipments/productionReports)·cashSchedule(peer ledger/financialReports/bank) CSV 전무(grep 0). 발주요청·입고이력은 감사·정산 추적 거래이력이라 가치 높음. **백로그 정확성 갭 동반 발견**: I-035/#345가 "cashSchedule 월별 CSV done" 기록했으나 커밋 29e9fbc는 taxInvoices CSV+검색만 구현 = cashSchedule CSV 실제 미구현(#363으로 신규 추적, Area 6 정정 권장). 신규 기능 추가라 이슈 보고.
> - **🔴 오탐/저가치 드롭 (에이전트 보고 → owner 코드 반증)**: ① productionBoard.js:223 `JSON.parse(post_processing)` 방어 try/catch + `:442` 썸네일 placeholder catch = **의도적 graceful degradation**, 버그 아님 ② productionBoard lightbox에 카드편집 링크 부재 = 보드는 **읽기전용 칸반 설계**, journey 갭 아님(저가치) ③ dashboard "생산현황(출고대기)" sub-KPI 클릭링크 부재 = 미세 인터랙션 일관성(F-004류 저가치) ④ productionBoard 상태탭 카운트 "-" = 로드 전 일시상태.
> - **이상 없음**: empty-state(inventory/purchaseOrders/hr/bom/paymentRequests 등 전수 "데이터 없음" 메시지 보유)·로딩 skeleton·pagination(orders/quotations/clients)·에러 toast(폼류) 일관 구현. taxInvoices 현금영수증탭 cr* prefix(#352)·ledger→tax-invoices 링크 정상.
> - 자동 수정 0건(Area 3 제안 전용, 에러-UX·CSV 전부 UI/기능 추가), 신규 이슈 2건(#362,#363), 오탐/저가치 4건 드롭
>
> **Area 2 코드 품질 (2026-06-06T18:00):**
> - **방법**: baseline `npm ci`+tsc --noEmit PASS. 코드베이스 Area 2 5회차(#341/#342/#350/#351/#356/#358/#360) — 한계효용 체감 → **최근 변경 표면**(#343/#345/#351/#352/#357 owner 적용분) + **덜 다룬 각도**(silent-fail·models↔스키마)에 집중. 병렬 Explore 2개(IDOR 비대칭 잔여 / silent-fail+N+1) + 후보 전수 owner 직접 코드 검증(오탐 차단).
> - **🐛 신규 이슈 #361 (I-050, MED bug) — autoProcess 멀티테넌시 격리 갭, #356 클러스터 10번째 모듈**: `autoProcess.ts` list(`GET /pending` `:189`)는 `entityFilter(c,'auto_process_jobs')` 적용하나 `/:id` 변경계열 전부 `WHERE id=?`만 — ① `PATCH /:id`(`:245`) 타법인 작업 상태/output 변조 ② `GET /order/:orderId`(`:266`) 타법인 가공작업 열람 ③ `POST /:id/approve`(`:290`) 타법인 작업 승인+저장경로 생성 ④ `POST /:id/retry`(`:341`) pending 되돌림+파라미터 변조. auto_process_jobs entity_id 보유(0261 ADD+idx) + INSERT `getEntityId` 주입(`:172`)인데 read/mutate 무시. 도달성 확인(orders.js:717/1026/1052). **전체 라우터 `requireRole('ADMIN')`(`:8`)이라 #358보다 심각도 낮음** — 단 ADMIN도 기본 자기법인(default_entity_id non-zero, `auth.ts:179`)이라 entity A 관리자가 entity B 작업 변조 가능. **자동수정 안 함**(ADMIN entityId=0 분기+권한 시맨틱+**PATCH는 외부 IllustratorAutomat 폴링이라 entity 격리 추가 시 통합 깨질 위험**+egress 차단 검증불가, #356/#358/#360 동일 사유).
> - **🔴 오탐/dead 2건 차단 (IDOR 에이전트 보고 → owner 직접 반증)**: ① `attendance.ts DELETE /:id`(`:350`) entity_id 보유하나 **프론트 호출처 0건**(attendance.js는 month GET·bulk PATCH뿐) = dead endpoint, 보안 아님(#334 도달성 규칙). ② `tasks.ts GET/:id·PATCH/:id` — list(`GET /` `:33`)가 **entityFilter 미사용** = 격리 의도 증거 없음 → **IDOR 비대칭 규칙 미충족**(전역 작업큐 가능성)+호출처 0건. 비대칭 규칙은 "list가 entityFilter를 쓰는 것"이 격리 의도의 전제 → list 자체가 미적용이면 규칙 부적용.
> - **이상 없음**: silent-fail(getElementById ID↔TS 페이지 + 프론트 param↔라우트 query 대조) — 최근 변경 paymentRequests/taxInvoices/cashReceipts/portal/hr/hometaxInvoices 전수 **0건**(#352 cr* prefix·#345 param 정합 재확인). N+1 신규 0건(paymentRequests batch()/Promise.all 정상). authMiddleware 누락 0건. 타입 `as any` 신규 위험 0건.
> - 자동 수정 0건(net-new는 IDOR 격리=런타임 검증불가+권한 시맨틱), 신규 이슈 1건(#361), 오탐/dead 2건 차단
>
> **Area 1 프로덕션 헬스 (2026-06-06T14:00):**
> - **방법**: GitHub Actions 최근 30런 분석 + 로컬 verify + 최신 E2E 잡 단계 실측. egress는 여전히 Cloudflare 엣지 403 차단(`curl https://webapp-9i0.pages.dev/` `/api/health` → **403** 0.03~0.4s) → 샌드박스 IP 차단이라 직접 20-API 호출 불가, E2E(실제 prod 페이지 브라우저 검증)를 헬스 신호로 사용.
> - **🟢 파이프라인 완전 green**: 최근 30런 = Deploy 11/11 success · E2E 18 success/1 cancelled(#172 concurrency 취소, 정상) · Daily D1 Backup #20 success. queued/stuck run 0건. **최신 런(E2E #185 id 27057109950 08:11, Deploy #164 id 27057086027 08:10) 전부 green** — HEAD 9e1165d(Area 6 docs 커밋) 기준.
> - **최신 E2E no-op green 아님 실측**: #185 잡(id 79863395342) "Run Playwright tests (production)" 단계 08:12:14→08:13:59 = **1m45s 실제 실행**, **run_attempt=1(재시도 0)**, 전 스텝 success. → #340 패턴(crud-order hard-fail·authedPage cold-start flaky) **이번 런 미발화**, prod login/dashboard/cards/items/orders/clients 페이지 정상 로드·통과 확인.
> - **로컬 verify PASS**: `npm ci`→tsc --noEmit PASS + build PASS(360 modules, _worker.js 5.0MB raw). 배포 11/11 성공 = 유료 10MB 한도 대비 ~10% 점유, 헤드룸 충분.
> - **#340(I-030) 상태 유지(approved)**: 14+ 연속 E2E green + 최신 attempt-1 클린으로 급성 RED 완전 해소. 픽스처 cold-start 안정화는 egress 차단으로 prod 검증 불가(전용 세션), crud-order 격리는 설계결정 대기. 급성도 낮아 추가 코멘트 보류(직전 06-04 코멘트로 상태 동기 완료).
> - **오탐/이상 없음**: deploy failure 0건(A-010 이후 지속). egress 403은 샌드박스 IP 차단(기존 인지)이라 헬스 이상 아님. open auto-improve 8건(new 6+approved 2) stats 정합 재확인.
> - 자동 수정 0건(파이프라인 정상·egress 차단으로 E2E 변경 검증 불가), 신규 이슈 0건
>
> **Area 6 자기 진화 (2026-06-06T10:00):**
> - **closed-pending-verification 11건 → 전부 ✔️ done 확정** (rejected 0): owner가 06-05T06:08~06-06T00:13 일괄 close한 #335/#343/#344/#345/#346/#351/#352/#353/#354/#356/#357. 11건 전부 owner **완료 코멘트 + 커밋 동반** 확인. 핵심 보안·버그 5건 **코드 교차검증 통과**: #351(`INTO payrolls`/`hr/payrolls` grep 0=orphan 제거), #357(`utils/uploadValidation.ts` 존재), #356(`insuranceReports.ts` entityFilter 6회=list+/:id 보강), #352(`cashReceipts.js` cr* prefix 4개=ID 셰도잉 해소), #335(da5f0ca escapeHtml 7스크립트+서버템플릿2+portalLayout 전역주입). 나머지 6건(#343/#344/#345/#346/#353/#354)은 단일커밋(0c04fad/0ce9c42 등) UX 활성화, 완료 코멘트 prod 스모크 통과 명시.
> - **#335 portalBalance.js 잔여 XSS 판정 (Area 5 위임) → 잔여 아님 확정**: `portalBalance.js:93-99` 미수금표는 `order_number`(시스템 채번)·`billing_date`(날짜)·`Number(...).toLocaleString()`(숫자강제)만 보간 = **free-text 사용자입력 싱크 없음**. `showTokenError`는 서버 하드코딩/서버제어 메시지. Area 5 저위험 판정 코드로 재확인.
> - **🧬 오탐 패턴 신설 — "escapeHtml 헬퍼 전무(grep -c escapeHtml=0) → XSS"는 오탐 생성기**: `layout.ts:1185`가 `window.escapeHtml` **전역 정의**(+`portalLayout.ts` 포털용) → 모든 스크립트가 로컬 정의 없이 전역 헬퍼 사용 가능. 파일에 escapeHtml 미정의 ≠ 취약. **올바른 판정**: 실제 `innerHTML` 싱크의 보간값이 (a)사용자 제어 free-text **이고** (b)미escape 인지 확인. `Number()` 강제 숫자·시스템 채번코드(order_number)·서버 하드코딩 문자열은 싱크 아님. 직전 06-05 #335 코멘트가 bom.js/users.js 등 5건을 "escapeHtml 전무"로 묶어 보고했던 휴리스틱 = 이 FP 패턴(owner도 da5f0ca에서 실제 싱크만 선별 적용·"bank.js already escaped=FP" 명시). security-audit + auto-improve SKILL(Area 5)·FP표 등재.
> - **GitHub ↔ 백로그 전수 재동기**: open auto-improve **8건**(New 6+approved 2) 정합 재확인. closed 40건 중 최근 범위(#334~#357) 전부 추적 완료. #274~#333 구간은 이전 사이클 집계(done 50)에 반영됨 — 재감사 저가치로 보류.
> - 자동 수정 0건(메타 정리), 신규 이슈 0건, done 이관 11건, 오탐 패턴 1건 신설(스킬 2개 갱신)
>
> **Area 5 보안 (2026-06-06T06:00):**
> - **방법**: 병렬 에이전트 3개(Explore) — SQLi·시크릿·CI / IDOR·인가·멀티테넌시 / XSS·업로드·rate. baseline `npm ci`+tsc --noEmit PASS + build PASS(360 modules, 5.0MB). 직전 Area 5(06-05T06:00 #356/#357) + 06-06T00:13 추가 Area 5(#360) 직후라 표면 3중 감사 → 한계효용 체감. **에이전트 보고 전수 owner 직접 코드 검증**(오탐 차단).
> - **🟢 net-new 0건 — 3개 에이전트 발견 전부 중복/오탐**:
>   - IDOR 에이전트: `quotations.ts` GET/PUT/DELETE `/:id` 격리 누락(entity_id 보유인데 list만 entityFilter) → **#360 기보고**(06-06T00:13, quotations+corporate_cards 상위집합). cardExpenses corporate_cards는 에이전트가 누락했고 #360이 더 완전 → 중복.
>   - XSS/rate 에이전트: **rate-limit 누락 5건(portal login/users·portal change-pw/verify-token) 전부 오탐** — `index.tsx:240-246`이 `app.use()`로 앱 레벨 전역 등록(라우트 파일 inline 미들웨어만 보고 놓침). portalBalance.js innerHTML 미escape 2건(`showTokenError` 서버 하드코딩 메시지 + 미수금표 숫자/날짜)은 저위험 + #335(escapeHtml 우산, 06-05 close) 범위 → 신규 아님.
>   - SQLi/시크릿/CI 에이전트: **SQLi 0(prepare 2,294 전수) / 시크릿 폴백 `c.env.X||'lit'` 0 / CI `secrets.X||'admin'` 0 — 전부 clean**. LOW 3건(error.message 노출: tasks.ts:304·fax.ts:87·settings.ts:230)은 전부 authMiddleware/requireRole 보호 엔드포인트 → #337(done) 처리방침(ADMIN 진단 LOW=보류) 동일, 이슈화 부적합.
> - **🧬 오탐 패턴 신설 — rate-limit "누락" 보고**: rate limit은 `index.tsx`에서 `app.use('/api/...', rateLimitMiddleware)` 앱 레벨 등록(240-246)이라 **라우트 파일만 보면 항상 inline 미들웨어 부재로 오탐**. 보고 전 index.tsx 등록처 확인 필수. FP표 등재.
> - **⚠️ GitHub 대규모 close 발견(Area 6 위임)**: open auto-improve 8건으로 축소. New 표 추적 11건(#335/#343/#344/#345/#346/#351/#352/#353/#354/#356/#357)이 owner 일괄 close(06-05T06:08~06-06T00:13). done/rejected 분류 + 코드 교차검증은 **차기 Area 6 위임**. New 표·stats는 open 실측 기준 정정. portalBalance.js escapeHtml 잔여 여부도 #335 해소내용 대조해 Area 6에서 판정 권장.
> - 자동 수정 0건(net-new 없음), 신규 이슈 0건(전부 중복/오탐), 백로그 정정(New 표 11건 제거·#360 편입·stats), 오탐 패턴 1건 신설
>
> **Area 4 데이터 정합성 (2026-06-06T02:00):**
> - **방법**: ground-truth — 297개 마이그레이션(0299/0300 신규 포함)을 로컬 D1(node:sqlite v22)에 전량 적용(**FAIL 0**) → 실제 해석 스키마 171테이블·511인덱스 확보. 직전 Area 4(0298까지) 이후 신규 표면(0299 정기변동비용·0300 #355 CHECK수정)에 집중 + 비원자적 고아생성 패턴 일반화 스캔(Explore 1개). baseline `npm ci`+tsc PASS + build PASS(360 modules, 5.0MB).
> - **#355 (I-045) → ✔️ done (owner가 0300으로 해소, GitHub closed-completed 확인)**: owner가 **(가)안** 채택 — `0300_approval_type_add_credit_override.sql`로 approval_requests/approval_templates 재빌드, CHECK에 `CREDIT_OVERRIDE` 추가. ground-truth 재적용으로 두 테이블 CHECK에 CREDIT_OVERRIDE 포함 **실측 확인** + 0300 CREATE TABLE 컬럼이 실제 스키마와 정확히 일치(id 명시보존 → FK 참조 무손상) + `orders/core.ts:1294` INSERT 12컬럼 전수 존재 + 여신 batch2(approval_steps status='PENDING'·credit_overrides) CHECK 정합 → **여신초과 주문 플로우 end-to-end 작동 복구**. 백로그 New 표 stale 정정.
> - **🔴 오탐 3건 차단 (Explore 고아생성 보고 → owner 직접 코드 반증)**: ① quotations.ts:589-657 견적→주문 전환 ② orders/operations.ts:94-208 주문복사 ③ shipments.ts:556-575 자동출고 — 전부 "비원자적 다중 INSERT, 두번째가 실패하면 고아" 추측. **반증**: `order_items`에 **CHECK 제약이 전혀 없고**(전 컬럼 nullable/default) → #355 같은 **확정 실패 트리거 부재**. shipments는 재조회 NULL을 에러메시지로 처리(고아 아님). #355는 CHECK 리터럴 100% 누락=확정장애라 보고가치였으나, 이들은 거의 모든 다중문 코드에 해당하는 일반적 비원자성 → 노이즈. 오탐표 신규 1건 등재.
> - **0299 정기변동비용 정합 확인**: `recurring_expense_actuals`(entity_id NOT NULL DEFAULT 1·UNIQUE(fixed_expense_id,period)·3인덱스 정합) + fixed_expenses 신규 3컬럼(amount_type/estimate_method/linked_category_id). `cashflowEngine.ts`가 ESTIMATED 고정비를 estimator로 추정(읽기전용 예측, est 없으면 amount 폴백·method 없으면 AVG_3M 폴백 = graceful). 신규 3컬럼 CHECK 부재이나 estimator 폴백으로 잘못된 값도 안전. 정합 버그 0. (단 recurring_expense_actuals **writer 0건** = variance 추적 미배선 — owner 진행중 신규기능 잔여, Area 3 영역이라 미보고.)
> - **이상 없음**: CHECK 전수(34 status/type 컬럼) — #355 해소 후 위반 0(직전회차 전수+이번 신규분 재확인). entity_id NOT NULL 신규표 정합. FK 인덱스 hot-path 미보유 0(linked_category_id는 fixed_expenses 소규모 config라 불필요).
> - 자동 수정 0건(net-new 정합성 버그 없음·#355는 owner 선해소), 신규 이슈 0건, 백로그 정정 1건(#355 done), 오탐표 신규 1건
>
> **Area 3 UX/기능 감사 (2026-06-05T22:00):**
> - **방법**: 병렬 에이전트 3개(Explore) — 영업·회계 / 생산·재고·구매 / HR·대시보드·설정. dead-filter·silent-fail·중복ID·하드캡 집중. baseline `npm ci`+tsc --noEmit+build PASS. **에이전트 보고 전수 owner 직접 코드 검증**(노이즈 차단). 코드베이스 Area 3 4회차 — 한계효용 체감.
> - **🐛 신규 이슈 #359 (I-049, MED bug) — 지출결의서 목록 LIMIT 200 하드캡 + 페이지네이션·총건수 전무**: `paymentRequests.ts:45` `LIMIT 200` 고정, 응답 `{success,data}`만(total/page 없음), `paymentRequests.js:31` page/limit 미전송·페이지네이션 UI·총건수 표시 전무. 지출결의서는 단조증가 재무전표 → 201건+ silent truncation, #345로 추가된 검색결과도 동일 캡에 걸림. #353 캡클러스터(leaves/purchaseInvoices/costs)에 paymentRequests 미포함분 + #343(날짜)·#345(검색/CSV) 별개 측면. **자동수정 안 함**(응답형식 변경+UI=금지범위). #353/#345 모두 closed라 신규 이슈.
> - **🔴 오탐 5건 차단(에이전트 MED/HIGH 보고 → 코드 반증)**: ① deliveryAnalytics CSV `from||default`(`:14`)=쿼리 우선이지 덮어쓰기 아님, 프론트도 from/to 정상전송(`deliveryAnalytics.js:37-49`) ② cardExpenses 날짜필터 — `cardExpenses.js:126` start_date/end_date 정상전송, 라우트 `:275` 별칭 처리 ③ payroll.js 직원로드 — `:32` 주석까지 달고 `d.employees` 정상처리 ④ leaves 직원드롭다운 — `leaves.js:396` `lvSetupEmployeeSearch`로 배선됨 ⑤ messages 시간대 — UTC ISO 날짜 일관성, 너무 사변적(LOW 미만).
> - **중복 차단(에이전트 재보고 → #353 기보고)**: purchaseInvoices match_status+LIMIT 100(#353-6), leaves 날짜+LIMIT 200(#353-5), activityLog user_id 드롭다운(#353-4). quotations item_name 검색은 백엔드 검색범위 확장(버그 아닌 기능갭, 저가치).
> - **이상 없음**: 하드코딩 LIMIT 전수(`grep "LIMIT [0-9]"`) — dashboard top-N(5/10/20)·items 자동완성(50)·inventory PENDING_REVIEW 작업큐(100)·bom MRP runs(저빈도 50)는 전부 의도적/자연제한. paymentRequests만 list-truncation 갭.
> - 자동 수정 0건(유일 net-new는 응답형식+UI 변경=금지범위), 신규 이슈 1건(#359), 오탐 5건·중복 3건 차단
>
> **Area 2 코드 품질 (2026-06-05T18:00):**
> - **방법**: 병렬 에이전트 2개(Explore) — entity_id 격리·IDOR 비대칭 / N+1·auth·타입·dead code. baseline `npm ci`+tsc --noEmit PASS. HIGH 1건은 owner 직접 코드 검증(approvals.ts list↔/:id 대조 + approve 가드 강도 + 3테이블 entity_id 컬럼 확인).
> - **🐛 신규 이슈 #358 (I-048, HIGH bug) — 전자결재 멀티테넌시 격리 갭, #356 패턴 7번째 모듈**: `approvals.ts` list(`:95`)는 `entityFilter(c,'ar')`(주석 `#86`) 적용하나 `/:id` 전 계열은 `WHERE id=?`만. 3테이블(approval_requests/steps/attachments) 전부 entity_id 보유(INSERT `:185/:200/:476` getEntityId 주입)→필터 가능한데 read/mutate 누락. ① `GET /:id`(`:222`) **완전 무가드** `ar.*` 노출(타법인 결재 제목·금액·내용·여신/지출 reference + 첨부) ② `GET /:id/attachments/:attachId`(`:487`) 첨부 file_data 다운로드 ③ approve(`:311`)/reject(`:376`) 가드가 approver_id/**전역 role**/ADMIN뿐 → entity A MANAGER가 entity B 결재 승인→`handlePostApproval`이 `purchase_requests.status='APPROVED'`·`orders.credit_status` 연쇄=**정합성 훼손** ④ PUT/submit는 status만 검증 ⑤ `/pending`(`:147`)도 전역 role만. **자동수정 안 함**(ADMIN entityId=0 전체모드 분기+mutate 권한 시맨틱 변경+egress 차단 런타임 검증 불가, #349/#356 동일 사유). #356에 7번째 모듈 교차참조 코멘트 추가.
> - **N+1 net-new 0건(이슈 가치)**: 에이전트 보고 중 payroll/core.ts:407/427(loadOvertimeSettings·getSettings 루프불변)·printSystem:650·PO core 품목루프·cardExpenses import는 전부 #341/#350 기보고. **신규는 bank.ts:1112(입금 일괄적용 조건부 UPDATE)·ledger/accounts-receivable.ts:1052(잔액 정합성 수정 UPDATE 루프)뿐 — 둘 다 관리자/배치 엔드포인트(hot-path 아님)** + batch 전환은 트랜잭션·에러 시맨틱 변화로 #341/#350 기결정(자동수정 금지)에 흡수 → 노이즈 회피로 이슈화 보류.
> - **이상 없음**: authMiddleware 누락 0건(cards/hrSelf/ledger/orders/payroll/purchaseOrders/webhooks 전부 aggregator·서브라우터 위임·의도적 공개). 타입 위험 `as any` 신규 0건(req.json/env 바인딩 관행). dead code(unmounted 라우터/orphan export) 0건. 신규 entity_id INSERT 격리갭 0건(approvals 외 전 테이블 getEntityId 또는 부모FK 상속).
> - 자동 수정 0건(HIGH는 런타임 검증 불가+권한 시맨틱), 신규 이슈 1건(#358), 교차참조 코멘트 1건(#356)
>
> **Area 1 프로덕션 헬스 (2026-06-05T14:00):**
> - **방법**: GitHub Actions 최근 30런 분석 + 로컬 verify + 번들 한도 검증. egress는 여전히 Cloudflare 엣지 403 차단(`curl /` `/api/health` → 403) → 직접 20-API 호출 불가, E2E(실제 prod 페이지 브라우저 검증: login/dashboard/cards/items/orders/clients)를 헬스 신호로 사용.
> - **🟢 파이프라인 정상**: 최근 30런 = Deploy 14/14 success · E2E 13 success/1 cancelled/1 failure · Daily D1 Backup success. **최신 런(E2E #26998904137 06:16, Deploy #26998857163 06:14) 전부 green**. queued/stuck run 0건.
> - **E2E 단일 failure(#26964968046, 06-04 16:25) = #340 알려진 패턴**: ① crud-order-lifecycle:33 주문생성 hard-fail(프로덕션 직접 주문생성=데이터오염 설계) ② authedPage cold-start 30s 타임아웃(fixtures.ts:59) 3건 **flaky(retry로 전부 통과)**. 직후 상태모델 단일화 배포(16:30) 이후 **E2E 13연속 green → 자가복구**. cancelled(03:25)는 10초 뒤 새 push의 concurrency 취소(정상).
> - **로컬 verify PASS**: `npm ci`→typecheck(tsc --noEmit) PASS + build PASS(360 modules, _worker.js raw 5.0MB / **gzip 1.00MB**). 번들 한도: 배포 14/14 성공 = 실제 한도(유료 10MB) 대비 ~10% 점유, 헤드룸 충분(raw 4.2→5.0MB 완만 성장). 우려 없음.
> - **#340(I-030) 상태 유지**: 픽스처 cold-start 안정화는 egress 차단으로 prod 검증 불가→전용 세션(approved), crud-order 격리는 설계결정 대기. 13연속 green으로 급성도 낮음. 안전 자동수정 없음.
> - **오탐/이상 없음**: deploy failure 0건(A-010 이후 지속). egress 403은 샌드박스 IP 차단(기존 인지)이라 헬스 이상 아님.
> - 자동 수정 0건(파이프라인 정상·egress 차단으로 E2E 변경 검증 불가), 신규 이슈 0건
>
> **Area 6 자기 진화 (2026-06-05T10:00):**
> - **GitHub ↔ 백로그 전수 재동기**: open auto-improve 17건 = New 15 + approved 2(#342/#340) 정합 확인. 백로그가 open으로 추적하던 #334/#337/#338/#349가 GitHub에서 closed(completed) → 종료사유·코멘트·**코드 교차검증**으로 done 확정.
> - **done 이관 4건 (전부 a7a15cc 단일 커밋, 코드 교차검증 통과)**: #334(I-025, templates.ts 삭제+drop마이그 0297, `ls templates.ts`→없음 확인)·#337(I-029, `/api/debug/cards` 제거+error.message 제네릭, 잔여는 주석뿐)·#338(I-026, `fallback-dev-key` 제거→requirePiiKey+reset-pw 필수화)·#349(I-039, 단건GET/detail/증명서 entityFilter+PUT mass-assignment 차단). #334는 도달성 규칙으로 보안→dead-code 재분류 후 owner (가)승인→삭제까지 **전 생애주기 완결**(규칙 유효성 입증).
> - **#336 (I-028) close 누락 발견**: a7a15cc가 deploy.yml/e2e.yml 폴백 자격증명(`secrets.X||'admin'`)을 **이미 제거**(grep으로 `secrets.SMOKE_USER` 단독 확인)했으나 owner가 13:06 일괄 close 시 #336/#339만 누락. 코드측 해소 + 운영(프로덕션 admin/password 계정 점검)만 owner 잔여 → **상태 코멘트 추가**(자가 close는 운영 잔여+owner 권한이라 보류).
> - **#349 item3 ↔ #351 교차참조 확정**: GET /payrolls 격리갭은 호출처 0건 dead-endpoint(#351 범위)로 #349 코멘트에 이미 재분류 기록됨. #351은 open 유지(POST /payrolls 크래시 + orphan 정리 대기).
> - **🧬 탐지 규칙 신설 — IDOR 비대칭(list-vs-detail)**: 같은 라우터 list는 `entityFilter`, `/:id` 상세·변경은 `WHERE id=?`만 = 격리 누락 버그. approve/차감이 호출자 getEntityId면 정합성 훼손까지. **#349/#356 HIGH 6모듈 클러스터를 이 규칙으로 발견** → security-audit SKILL(IDOR 비대칭 callout)+auto-improve SKILL(Area 5)에 codify. 도달성 선검증(#334) 결합.
> - **오탐 패턴 신규 0건**: 도달성 규칙(#334)은 오탐이 아니라 유효 입증됨(전 생애주기 완결). 기존 오탐표 유지.
> - 자동 수정 0건(메타 정리), 신규 이슈 0건, done 이관 4건, GitHub 코멘트 1건(#336), 탐지 규칙 1건 신설(스킬 2개 갱신)
>
> **Area 5 보안 (2026-06-05T06:00):**
> - **방법**: 병렬 에이전트 3개(SQLi·동적쿼리 / 인가·IDOR·멀티테넌시 / XSS·시크릿·rate·업로드·에러노출). baseline tsc PASS. HIGH 2건 owner 직접 코드 검증(insuranceReports·paymentRequests list-vs-detail 대조).
> - **🐛 신규 이슈 #356 (I-046, HIGH) — 멀티테넌시 격리 갭 클러스터 6모듈**: #349(hr.ts) 동일 패턴 확장. 같은 라우터의 **list는 `entityFilter` 적용, `/:id` 상세·변경 핸들러는 `WHERE id=?`만** → 비-ADMIN이 임의 id로 타법인 도달. ① insuranceReports `:64` GET/:id가 `rrn`(**주민번호**)+급여 노출 ② paymentRequests `:50/177/198/210` 지출결의서(계좌·금액) — 가드가 page-permission만(role 무관) ③ cashReceipts `:166/273/...` `identity_number`(주민/사업자번호) ④ purchaseRequests `:237/357/809`(DESIGNER 무체크) ⑤ inventoryCount approve가 **호출자 getEntityId로 재고차감** → 정합성 훼손 ⑥ leaves approve가 **호출자 entity로 잔여차감**. 전부 프론트 호출처 존재(도달 가능). orphan(보안 아님) 별도: leaves.ts:449 DELETE(**role 가드 없음**)·attendance:350·tasks:64. **자동수정 안 함**(ADMIN entityId=0 전체모드 분기·런타임 검증 불가, #349 동일 사유).
> - **🐛 신규 이슈 #357 (I-047, MED) — 업로드 검증 부재**: cardExpenses:369·po/core.ts:317이 `ext=file.name.split('.').pop()`를 R2 키에 raw 사용(ext에 `/` 주입 가능)+크기/MIME 미검증. files.ts orphan 업로드도 동일. ext/MIME 화이트리스트는 거부 동작 변경이라 이슈.
> - **🔧 자동 수정 A-015 (files.ts R2 키 sanitize)**: `files.ts:46-49` 업로드가 `${folder}/${analysisId}/${file.name}` raw 조합(3요소 클라 제어, 키 인젝션) → **A-013(aiAnalysis) 패턴 그대로** 세 요소 `replace(/[^a-zA-Z0-9._-]/g,'_').slice(...)` 정규화. 표시명은 contentDisposition encodeURIComponent로 보존(동작 무변). verify(tsc+build 4.99MB) 통과. orphan이라 우선순위 낮으나 방어적 sanitize는 자동수정 허용 범위.
> - **#335 코멘트 추가**: escapeHtml 헬퍼 전무 스크립트 5건(bom/users/deliveryAnalytics/migration/iaBatchTest)을 #335 우산이슈에 합산(Area6 "escapeHtml 일괄=#335" 결정 일관, 자동수정 분산 회피). settings.ts:230 error.message는 ADMIN 진단 성격 LOW로 #337 동급 보류.
> - **이상 없음/오탐 차단**: SQLi 0건(prepare 2,294 전수 — ORDER BY 딕셔너리·IN/LIKE 바인딩·PRAGMA ALLOWED_TABLES). authMiddleware 누락 0건(공개 portal/hrSelf/auth/webhooks 의도). mass-assignment 0건(hr.ts eid===0에서만 body.entity_id). rate limit 신규 누락 0건(reset-pw는 ADMIN 전용). 시크릿 폴백 `c.env.X||'...'` 0건. cardExpenses/cashSchedule/fixedAssets/budgets/bank `/:id` 격리 정상.
> - 자동 수정 1건(A-015), 신규 이슈 2건(#356,#357), 코멘트 1건(#335)
>
> **Area 4 데이터 정합성 (2026-06-05T02:00):**
> - **방법**: ground-truth — 295개 마이그레이션을 로컬 D1(node:sqlite v22)에 전량 적용(FAIL 0) → 실제 해석 스키마 170테이블·506인덱스 확보. 이전 Area 4(0281까지) 이후 신규 0282~0298 집중 + 전 status CHECK ↔ 코드 어휘 전수 대조(병렬 에이전트 1개). baseline tsc --noEmit PASS.
> - **🐛 신규 이슈 #355 (I-045, HIGH bug) — 여신초과 주문 생성 전면 실패**: `orders/core.ts:1295`가 `approval_requests.type='CREDIT_OVERRIDE'`로 INSERT하나 **CHECK(0202, 9값)에 CREDIT_OVERRIDE 없음** → ground-truth 직접 INSERT로 CHECK 위반 실측. `creditBlocked`(잔액≥여신한도) 주문 시 batch(core.ts:1289) throw→outer catch(:1561) 500. 주문 row는 :978-1034에서 이미 커밋 → **고아 주문**(credit_status NULL·승인요청/카드 0). #163 여신승인 워크플로 비작동. `grep CREDIT_OVERRIDE` = core.ts 단 1곳 쓰기만(조회 0건) → enum 미편입. **스키마 재빌드(CHECK ALTER 불가)라 자동수정 금지**. prod CHECK 확인 권장(#347 선례).
> - **#347 (I-037) → ✔️ done**: owner가 0284/0296(7값 CHECK superset)+0298(레거시 RIP_WAITING/PRINT_ERROR 이관)로 해소 후 closed(👍). cards.status 라이브 쓰기도 `lifecycle.ts:593`이 PRINT_ERROR를 status 대신 rip_status='ERROR'로 기록(보드 버킷 유지) → 정합 확인. 백로그 stale 정정.
> - **#348 (I-038) → ❌ rejected**: owner `not_planned`(👍) 종료. ground-truth 재확인 시 전역 UNIQUE(orders/po/quotations/payment_requests) **여전히 잔존**하나 운영이 entity 1 수렴이라 의도적 보류. 재보고 안 함.
> - **멀티법인 협업 기능(0292/0294 assigned_entity, 0293 inventory_tx UNIQUE+entity) 정합 확인**: 카드 생성(`core.ts:112 effEntityOf`)이 assigned_entity_id 우선→requesting_entity_id 주입, 품목 SELECT `oi.*` 포함, 재고차감(`stockShip.ts:40`) dedup 키가 0293 새 UNIQUE 컬럼셋과 정확히 일치(이중차감 방지). end-to-end 정합, 버그 0.
> - **CHECK 전수 대조(34 status 컬럼)**: #355 외 위반 0. orders/cards/shipments/approval_steps/card_transactions 등 하드코딩 리터럴 전부 CHECK 내. 사용자입력 미검증 8건(po.status/items.item_type/shipments.delivery_type 등 `body.x||default` 미화이트리스트)은 기본값 유효+잠재리스크라 확정위반서 제외(저우선).
> - **오탐 차단**: NOT NULL ADD COLUMN(0285/0287/0288/0295) 전부 DEFAULT 보유(prod 안전). FK 인덱스 미보유 대부분 `*_by→users` 감사컬럼(hot path 아님). ar_provision_rates/ar_grade_multipliers(0289) 전역 config(entity_id 의도적 부재).
> - 자동 수정 0건(스키마 재빌드 런타임 검증 불가+비즈로직), 신규 이슈 1건(#355), 백로그 정정 2건(#347 done, #348 rejected)
>
> **Area 3 UX/기능 감사 (2026-06-04T22:00):**
> - **방법**: 병렬 에이전트 3개(opus) — 영업·회계 / 생산·재고·구매 / HR·대시보드·설정. 라우트 쿼리파라미터 ↔ 프론트 JS 전송 대조로 dead-filter·silent-fail 집중. baseline verify PASS(tsc clean + build 351 modules 4.99MB).
> - **🔧 자동 수정 A-014 (silent-fail JS 버그 3건)**: 전부 HTML/API 무변경 순수 JS 버그라 직접 수정(A-011 선례). ① `hr.js:49` 직원 검색 `params.q`→`params.search` — **route는 `search` 수신(hr.ts:49,89)인데 front가 `q` 전송 → HR 핵심 검색 항상 무력**(입력 무반응). ② `hometaxInvoices.js:222` 페이지네이션 총건수 항상 0 — route는 `{data:[], pagination:{total}}` 반환인데 front가 `data.total`(배열.total=undefined) 읽음 → "총 0건" 표시·2페이지+ 접근 불가. ③ `hometaxInvoices.js:214` 날짜 파라미터 `start_date/end_date`→`date_from/date_to`(route 기대값 정렬, dead-filter 복원). verify(tsc+build) 통과.
> - **🐛 신규 이슈 #352 (I-042, HIGH bug)**: 현금영수증 탭 필터 전체 무력 — `taxInvoices.ts` 통합페이지에 `statusFilter/dateFrom/dateTo/searchInput` ID가 세금계산서탭(110-131)+현금영수증탭(428-452) **중복** → `getElementById`가 첫(세금계산서) 요소만 집어 현금영수증 탭 필터값 무시 + `cashReceipts.js:64` 날짜 파라미터도 `dateFrom`(route는 `date_from`) 불일치. **HTML ID 리네임 필요(구조변경) → 자동수정 금지**, A-014 동종 JS버그와 분리.
> - **🐛 신규 이슈 #353 (I-043, dead-filter 클러스터 2탄)**: #343 미포함 6건 — 생산보드 category(queries.ts:781)·원가 자동차감 원단/날짜+50하드캡(costs.ts:223)·메시지로그 날짜(kakao.ts:1053)·활동로그 user_id(activityLogs.ts:20)·휴가신청 from/to+200하드캡(leaves.ts:307, #346 동탭)·매입인보이스 match_status+100하드캡(purchaseInvoices.ts:11). +LOW(활동로그 드롭다운 SHIPMENT/QUOTATION 정합·demandAnalytics 기간고정·inventoryDashboard 검색·attendance status). 전부 백엔드 기구현/UI 미노출.
> - **🐛 신규 이슈 #354 (I-044)**: 검수결과 목록 — 필터 placeholder가 receipt_id/supplier_id **원시 ID 직접입력(사용불가)** + overall_result/날짜 미지원 + LIMIT 100 하드캡 + CSV 부재(peer productionReports는 보유).
> - **이상 없음 확인**: bank/cardExpenses/shipmentsDashboard/prices/vatReports/deliveryAnalytics/financialReports/ledger/payroll/tasks/reports/emailLogs/receiving/postProcessing/weeklyPurchase/bom 등 필터·CSV·empty·페이징 적정. 대시보드 stats orphan 라우트 6종(dashboard.ts) = 미사용 dead code(누락 KPI 아님, 영향 없음).
> - 자동 수정 1건(A-014, 3개 JS버그), 신규 이슈 3건(#352~#354)

> **Area 2 코드 품질 (2026-06-04T18:00):**
> - **방법**: 병렬 에이전트 2개 — entity_id 격리 / N+1·auth·type·dead code. 의존성 설치 후 baseline `tsc --noEmit` PASS + `vite build` PASS(351 modules, 4.94MB) 확인.
> - **🐛 신규 이슈 #350 (I-040, N+1 신규 클러스터)**: #341 미포함분. **급여 모듈이 #341 스캔 범위 밖이었음** — `payroll/core.ts:387` POST /batch(직원당 5~7쿼리×N, 그중 `loadOvertimeSettings`·`getSettings`는 **루프 불변인데 매 직원 재조회** → hoist만으로 N×2 즉시 감소·시맨틱 무변) + `payroll/core.ts:530` sync-attendance(직원당 집계+UPDATE) 둘 다 전직원 월마감 핫패스. 부차: PO core 품목 루프(912 POST/1100 PUT 조건부 SELECT+INSERT), `payroll/settings.ts:244` tax-table generate(~900 순차 INSERT), printSystem:650 product_materials M×N SELECT, 저빈도 INSERT 루프 5건. taxInvoices:628 batch-create group SELECT는 재확인필요(B-009가 item INSERT만 batch화). **batch/집계 전환은 트랜잭션·에러시맨틱 변화 + 런타임 검증 불가 → 자동수정 안 함**
> - **🐛 신규 이슈 #351 (I-041, dead code + 잠재 크래시)**: entity_id 스캔 부수발견. `hr.ts:806` POST /api/hr/payrolls가 **마이그레이션에 없는 `payrolls`(복수) 테이블 INSERT** → 호출 시 `no such table` 크래시. `hr.ts:296` GET도 호출처 0건 orphan. 실급여기능은 `/api/payroll` 모듈로 완전 이관됨. 도달성 선검증(grep "hr/payrolls" → 0건). **라우트 삭제는 자동수정 금지(#334 동일) → 이슈로 보고**. #349 item3(GET /payrolls 격리갭)을 **dead endpoint로 재분류**하는 교차참조 코멘트 #349에 추가
> - **신규 격리갭 0건**: 모든 entity_id 보유 테이블 INSERT가 getEntityId 또는 부모FK로 격리. authMiddleware 누락 0건(printEvents POST 4개는 `agentKeyMiddleware` 의도적), dead code(utils export) 0건, `as any` 신규 위험 0건(orders/queries.ts:232·core.ts:2203은 가드 존재 오탐)
> - **오탐 차단**: inventory_count_items/status_history류(부모FK 격리), po_templates/settings/cost_standards/finishing_methods/bom_items(전사 공유 마스터), mrp_results(run_id 간접격리), printSystem createLinkedItem(채번 순차 불가피)
> - 자동 수정 0건(batch전환 런타임검증 불가+라우트삭제 금지), 신규 이슈 2건(#350, #351), 교차참조 코멘트 1건(#349)
>
> **Area 1 프로덕션 헬스 (2026-06-04T14:30):**
> - **방법**: GitHub Actions 최근 20런 분석 + 로컬 verify. 샌드박스 egress는 Cloudflare 엣지 차단(`curl` HTTP 000) → 직접 API 호출 불가, CI 로그 기반 판정.
> - **🟢 파이프라인 완전 복구 확인 (A-010 효과 검증)**: 직전 Area 1에서 복구한 deploy(`--commit-message=<sha>`) 이후 **Deploy #136~141 + E2E #153~160 전부 success**. 이전 RED/skipped는 #134·#135(06-02, A-010 이전) deploy failure→E2E skip 캐스케이드가 마지막. 최신 커밋 6744e36 → Deploy #141 + E2E #160 그린(테스트 단계 2분17초 실제 실행·통과). Daily D1 Backup #18 정상.
> - **로컬 verify PASS**: `npm ci` 후 typecheck(tsc --noEmit) PASS + build PASS(351 modules, 4.94MB worker).
> - **#340(I-030) → ✅ approved 재분류 + 전제 해소**: issue_read 결과 **reactions +1=1 = owner 👍 승인** 확인(GraphQL null 한계로 직전 Area 6에서 미포착). 동시에 제목 "지속 RED" 전제가 **E2E 8연속 그린(스케줄 #154/#159 포함)**으로 해소. cold-start flaky(fixtures.ts:59)는 8런 미발화 → 급성 신호무력화 해소. **egress 차단으로 prod E2E 검증 불가 → 픽스처 안정화 자동수정 제외**(전용 세션 권장, 긴급도 하향). ⚠️ crud-order 운영데이터 오염은 그린 상태에서 매 스케줄 run마다 활성(설계 결정 대기) → #340 코멘트로 상태 갱신.
> - **오탐/이상 없음**: deploy failure 2건은 전부 A-010 이전 구간, 이후 0건. queued/stuck run 없음. workflow_run 게이팅(deploy success→E2E) 정상 작동.
> - 자동 수정 0건(파이프라인 정상, egress 차단으로 E2E 변경 검증 불가), 신규 이슈 0건, owner 승인 동기화 1건(#340)
>
> **Area 6 자기 진화 (2026-06-04T10:00):**
> - **GitHub ↔ 백로그 동기화**: open auto-improve 이슈 15건(#334~#349, #339 제외) 전수 대조. GraphQL `reactions` 필드는 null 반환(MCP 한계) → 👍 판정은 `issue_read get_comments`의 코멘트별 reactions로 확인.
> - **owner 피드백 3건 처리**:
>   - **#334 (I-025) → 👀 reviewed로 재분류**: owner "주문 템플릿 기능 아직 없는 것 같은데 재점검" → 전수 추적 결과 **`/api/templates`(templatesRouter)는 index.tsx:275에 마운트만 되고 프론트 호출처 0건인 orphan 라우터**. `order_templates` 테이블 참조도 `templates.ts` 단 1파일. 실제 쓰이는 "템플릿"은 전부 별도 기능(purchase-orders/inspections/kakao/approvals templates, 각각 다른 테이블). → entity_id 격리 갭은 **UI 도달 불가**, 보안이 아니라 **dead code 사안**. (가)삭제(라우터+마운트 제거+drop 마이그레이션) / (나)향후 도입 시 설계 — owner 결정 대기. ⚠️ 라우트 삭제는 자동수정 금지라 직접 제거 안 함.
>   - **#342 (I-032) → ✅ approved**: owner "(나)로 진행 — 사실상 법인별 설비가 달라 운영 겹치지 않을 듯". (나)=equipment부터 entity_id 도입 + rip.ts 전반(INSERT getEntityId + 목록/조회 entityFilter) 격리 배선. **DB 스키마 변경 + 비즈니스 로직 + 데이터 보정(~1일)** = 패트롤 자동수정 금지 범위 → 직접 구현 안 함, **전용 구현 세션 대기**. owner 단서상 실질 긴급도는 낮음(현재 전부 entity 1 수렴).
>   - **#335 (I-027)**: 직전 Area 5 서버사이드 템플릿 XSS 교차참조 코멘트에 owner 👍 → laborContract/employmentCertificate `c.html()` 무이스케이프도 #335 범위 포함 확정. (escapeHtml 추가는 자동수정 허용 범위지만 7+스크립트 대규모라 #335 단위로 일괄 처리 권장)
> - **🧬 탐지 규칙 신설 — 도달성(reachability) 선검증**: entity_id 격리 갭을 멀티테넌시 **보안** 이슈로 분류하기 전, 해당 라우터/엔드포인트가 프론트(`src/scripts`·`src/pages`)에서 실제 호출되는지 `grep "api/<path>"` 확인. **호출처 0건이면 orphan 라우터 = dead code 사안**(보안 영향 없음). #334가 보안 갭으로 잘못 보고됐던 근본 원인. auto-improve(Area 2·5) + entity-audit 스킬 + 하단 오탐표에 반영.
> - **오탐 차단**: `/api/cash-flow` 이중 마운트(index.tsx:300 cashFlowRouter + 324 cashScheduleRouter) — Hono 동일 prefix 복수 라우터, 서브경로 비충돌 = 의도적, 버그 아님.
> - 자동 수정 0건(메타 정리), 신규 이슈 0건, owner 피드백 동기화 3건, 탐지 규칙 1건 신설
>
> **Area 5 보안 (2026-06-03T23:30):**
> - **방법**: 병렬 에이전트 3개 — SQLi·동적쿼리 / 인가·IDOR·멀티테넌시 / SSRF·시크릿·업로드·인프라. 발견은 전부 owner 직접 코드 검증.
> - **🔧 자동 수정 A-012 (CAPS 시크릿 노출 차단)**: `caps.ts:728` 레거시 `GET /api/caps/settings`가 `relay_db_password`+`worker_api_key`를 **평문 반환**. 동급 `GET /sites`(443-446)는 의도적으로 두 컬럼 제외 → 정렬. 프론트(`capsSettings.js:18`)는 `/sites`만 사용, `/settings` 소비처 0건 + 비번 input `placeholder="변경 시에만"`(프리필 안 함)이라 무해. MANAGER 탈취 시 CAPS relay DB 비번/워커 API키 획득 경로 제거. verify(typecheck+build, 351 modules) 통과
> - **🔧 자동 수정 A-013 (업로드 파일명 sanitize)**: `aiAnalysis.ts:155` R2 키에 `file.name` 미검증 삽입 → `../`/특수문자/헤더(`\r\n`) 인젝션 가능(LOW, ADMIN전용). `replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,200)`로 정규화. escapeHtml류 방어적 sanitize라 자동수정 허용 범위. verify 통과
> - **🐛 신규 이슈 #349 (I-039, HIGH) — hr.ts 멀티테넌시 격리 갭 4건**: #322가 직원 INSERT에만 entity_id 서버강제, **UPDATE/단건GET/payrolls/certificate는 누락**. (1)`PUT /employees/:id`(556,628-639,680) entity_id **mass-assignment** + WHERE 격리없음(타법인 직원 이동+급여변조) (2)`GET /employees/:id`·`/detail` PII 조회 (3)`GET /payrolls` 전법인 급여 (4)`certificate/employment` 타법인 증명서 발급. PII/급여+쓰기라 #334/#342보다 영향 큼. 다법인 read/write 경계+ADMIN전체모드 분기로 런타임 검증 불가 → **자동수정 안 함**, #322 패턴 정렬 권고
> - **SQLi 0건**: 2,335개 `prepare()` 전수 — ORDER BY는 `sortOptions[k]` 딕셔너리 룩업·LIKE/IN은 `?` 바인딩·동적 SET는 고정배열 화이트리스트·PRAGMA는 ALLOWED_TABLES/리터럴. 사용자입력 직접보간 0
> - **인가/포털/셀프 이상 없음**: portal(고정 portal_client_id+`AND client_id=?`)·hrSelf(`payload.sub`)·users/permissions/payroll(requireRole) 전부 적절. JWT exp/HS256 명시검증. rate limit 8엔드포인트 커버. 보안헤더 3종 전역(CSP/HSTS 보류 유지)
> - **오탐 차단**: cardExpenses 업로드 MIME 미검증 → `X-Content-Type-Options:nosniff`(index.tsx:234)로 브라우저 실행 차단. env폴백/reset-pw 기본값은 기존 #338
> - 자동 수정 2건(A-012, A-013), 신규 이슈 1건(#349)
>
> **Area 4 데이터 정합성 (2026-06-03T21:30):**
> - **방법**: ground-truth — 278개 마이그레이션을 로컬 D1(node:sqlite)에 전량 적용(FAIL 0) → 실제 해석 스키마 170테이블·501인덱스 확보 후 정적분석 교차검증. entity_id 커버리지 / UNIQUE 제약 entity 포함 여부 / FK 인덱스 hot-path / 번호 생성기 entity 정합 점검
> - **🐛 신규 이슈 #348 (I-038) — 전역 UNIQUE가 entity 복합 UNIQUE 무력화**: orders/purchase_orders/quotations/payment_requests는 0266/0272/0281에서 `UNIQUE(entity_id,*_number)`를 추가했으나 **CREATE TABLE 시점의 테이블레벨 전역 `UNIQUE(*_number)`가 잔존** → 더 엄격한 전역 제약이 복합을 무력화. 생성기(`sequenceGenerator.ts:20`)는 entityId 전달 시 per-entity MAX인데 **prefix에 법인 식별자 없음**(po `${dateStr}-P`, quote `Q-`, pr `PR-`) → 다법인 시 법인2 첫 전표가 법인1과 동일번호 생성→전역 UNIQUE 거부→withSeqRetry 동일번호 재생성→**생성 실패**. ground-truth INSERT로 4종 전부 거부 실측. 현재 entity 1 수렴이라 잠복, 다법인 시작 시 즉시 발화. **스키마 재빌드+번호정책 결정 필요 → 자동수정 안 함**
> - **#347 (I-037) 백로그 편입**: cards.status CHECK(3값) ↔ 코드 어휘(PRINT_PENDING 등) 분기 — 이전 Area 4 산출물이나 백로그 미기록분 정리
> - **오탐 차단 4건**(ground-truth 반증): shipments(`SHP-E${eid}-` prefix로 전역 유일, 정합)·purchase_requests/returns/claims/approvals(생성기 entityId 미전달=전역번호, 정합)·inventory_release_items.release_id(SELECT WHERE 경로 없음, INSERT 전용 `inventory.ts:555` → hot path 아님)·child/이력/마스터(clients/items/equipment) entity_id 부재(상속/의도적 전역공유)
> - **이상 없음 확인**: entity_id NULLABLE 2건(activity_logs 다형성·migration_logs ADMIN로그)은 기존 인지 오탐. 자식-item 부모FK 인덱스 order_items/shipment_items/tax_invoice_items/receipt_items/count_items/po_items/journal_lines 전부 보유. cards는 `requesting_entity_id`로 격리
> - 자동 수정 0건(스키마 재빌드는 런타임 검증 불가+정책 결정 필요), 신규 이슈 1건(#348), 백로그 편입 1건(#347)
>
> **Area 3 UX/기능 감사 (2026-06-03T18:00):**
> - **방법**: 병렬 에이전트 3개 — 영업·회계 / 생산·재고·구매 / 대시보드·HR·포털. 75+ 페이지 .ts(HTML)↔.js(동작) 대조로 검색·필터·빈상태·페이지네이션·journey 링크·KPI 점검
> - **🔧 자동 수정 A-011 (재고 집계 버그)**: `inventory.js:160` "총 N개 품목"이 페이지 slice 건수(`items.length`, 최대 20)를 표시 → 품목 수백개여도 항상 20 표시. API는 이미 `pagination.total` 반환 중. `renderInventoryTable(items, total)`로 전체 COUNT 전달하도록 수정. verify(typecheck+build, 351 modules) 통과
> - **핵심 패턴 발견 — Dead-filter 3건 (#343, I-033)**: **백엔드 라우트가 필터 파라미터를 이미 WHERE 처리하는데 프론트가 안 보내 도달 불가**. paymentRequests 날짜(routes:21-22)·production 출력이력 장비/상태/날짜(printEvents:574)·portal orders 상태(portal:329, +count쿼리 status 누락 버그). input만 붙이면 즉시 가치 → ROI 최고
> - **포털 셀프서비스 갭 (#344, I-034)**: 세금계산서 다운로드 부재+50건 하드캡(portal:451)·미수금 aging 부재(사내 대시보드는 30/60/90 풀제공)·재주문 native `prompt()`(고객대면 모바일 UX). 포털 도입 목적 약화
> - **회계 CSV/검색 (#345, I-035)**: taxInvoices CSV 부재(ledger/bank/financialReports엔 다 있음)·cashSchedule CSV·paymentRequests 지급처/사유 검색
> - **필터·드릴다운 (#346, I-036)**: 연차 부서 필터 부재(잔여현황/미사용수당)·불량률 리포트→검수 상세 드릴다운 단절
> - **이상 없음 확인**: orders/clients/quotations/taxInvoices 필터·CSV·페이지네이션·empty-state·journey 체인 완비. 대시보드 KPI 8종+aging/저재고/설비부하 충실. 급여·근태·activityLog·messages 양호. HR limit:500은 SMB 직원규모상 무해. **silent-fail(깨진 getElementById) 미발견**
> - 자동 수정 1건(A-011), 신규 이슈 4건(#343~#346)
>
> **Area 2 코드 품질 (2026-06-03T14:30):**
> - **방법**: 병렬 에이전트 2개 — entity_id 격리 / N+1·auth·타입. 의존성 설치 후 `tsc --noEmit` PASS·라우트 등록 83/83·utils 미사용 export 0건 직접 확인
> - **authMiddleware 누락 0건**: 83 라우터 전수 — portal/hrSelf/auth/webhooks 공개는 의도적, 집계 라우터는 서브라우터 위임. 신규 없음
> - **타입 에러 0**: tsc 통과. `as any`는 45→70(routes)이나 신규분 전부 외부입력(`req.json() as any`)/env 바인딩/D1 결과 관행 캐스트 — 위험 패턴 아님(타입 우회 버그 은폐 없음). `(c.env as any)` 4건만 타입 보강 후보(저우선, 이슈화 보류)
> - **신규 이슈 #341(I-031, N+1 미전환)**: cashFlow.ts:456 현금흐름 예측 핫패스(12개월×6쿼리=72) 최우선 + purchaseRequests read N+1 + import 루프(clients/cardExpenses/kakao/attendance) + child INSERT 루프들. **자동수정 안 함**: read 집계 재작성은 정합성 검증 필요, INSERT 루프는 leaves.ts 행별 try-catch 에러수집/2-pass last_row_id 의존이라 batch 전환 시 에러·트랜잭션 시맨틱 변경(런타임 검증 불가 환경)
> - **신규 이슈 #342(I-032, rip.ts entity_id 미배선)**: equipment_consumables·maintenance_schedules가 0237에서 entity_id 추가됐으나 rip.ts 전체 entity 처리 전무. 단 **부모 equipment가 전역 공유(entity_id 없음)** → 자식만 격리는 반쪽 정합, 설비 전역공유 유지/법인분리 정책 판단 필요(owner 결정). 현재 전부 entity 1로 수렴해 실질 위협 낮음
> - **오탐 차단 4건**(엄밀 재검): activity_logs.entity_id(다형성 참조), attendance/employees(동적컬럼+getEntityId fallback/#322 서버강제), migration_logs(ADMIN 운영로그), 채번/2-pass parent 루프(순차 불가피)
> - 자동 수정 0건(안전+런타임검증 기준 미충족), 신규 이슈 2건(#341, #342)
>
> **Area 1 프로덕션 헬스 (2026-06-03T10:30):**
> - **방법**: GitHub Actions 최근 15런 분석 + 프로덕션 헬스(샌드박스 egress는 Cloudflare 엣지 403 차단으로 직접 호출 불가 → CI 로그 기반 판정)
> - **🔴 자동 수정 A-010 (배포 파이프라인 복구)**: 최근 2개 push(Area 5·6 docs)의 **Deploy 실패**. Cloudflare API `Invalid commit message, must be valid UTF-8 [8000111]`. **근본 원인 = byte 길이**: Area 4(98B) 성공 / Area 5(119B)·6(106B) 실패 — 모두 유효 UTF-8이나 Cloudflare가 ~100B에서 commit message를 절단하며 **한글 멀티바이트 절단** → 깨진 UTF-8. wrangler가 git 메시지를 자동 전송하던 것을 `--commit-message="${{ github.sha }}"`(ASCII 고정)로 차단. `deploy.yml:62`. verify(typecheck+build) 통과
>   - **기능 영향 없음 재확인**: Area 5·6은 docs-only 커밋이라 dist/ 동일 → 실제 프로덕션 기능은 마지막 코드 배포(A-009/e8c8992) 기준 정상. 다만 파이프라인 RED라 **다음 실코드 변경도 배포 불가** 상태였음 (구조적 차단 해소)
> - **신규 이슈 #340 (I-030, E2E CI 신뢰도)**: E2E 프로덕션 테스트 다수 날짜 연속 RED — `fixtures.ts:59` authedPage `waitForURL` 30s 타임아웃(cold start, flaky) + `crud-order-lifecycle.spec.ts:57` 주문생성 `res.success=false`(hard fail, 프로덕션 직접 주문생성=데이터 오염 설계). 안전 자동수정 불가 → 이슈
> - **E2E 게이팅 확인**: e2e.yml은 deploy 성공 시에만 실행(`workflow_run conclusion==success`) → 배포가 막혀 최근 E2E run들이 `skipped`로 표시되던 것. A-010으로 deploy 복구되면 E2E도 재가동됨
> - typecheck PASS·build PASS(351 modules, 4.9MB worker)·npm ci 정상. Daily D1 Backup 정상 success
> - 자동 수정 1건(A-010), 신규 이슈 1건(#340)
>
> **Area 6 자기 진화 (2026-06-02T17:00):**
> - **GitHub ↔ 백로그 동기화 완료**: open auto-improve 이슈는 5건(#334~#338)뿐, 나머지 전부 closed 재확인
> - **I-013~I-024 (11건, #32~#46) → done 확정**: 각 이슈 코멘트/코드 교차검증
>   - 완료 코멘트 명시: #32(보안헤더 3종, HSTS/CSP는 근거와 함께 보류)·#33(change-pw rate limit)·#34(XSS escapeHtml 39개소)·#35(dashboard e2e spec)
>   - 코멘트無 → 코드로 구현 확인: #39(SELECT* 157→8)·#37(printSystem batch 적용, 채번부 순차는 주석 근거)·#38·#45
>   - owner 논의로 기능 확장 후 closed: #43(결재 연계)·#44(작업큐 통합)·#46(가동시간 기반 가동률, 코멘트 👍)
> - **신규 open 3건 new 표 편입**: #335(I-027 저장형 XSS)·#336(I-028 CI 폴백 자격증명)·#337(I-029 debug+error.message) — 이전 세션 last_run_area 미동기로 누락됐던 잔여
> - **탐지 규칙 강화 (스킬 2개 업데이트)**:
>   - security-audit + auto-improve: 시크릿 폴백 grep 규칙 `c.env.X || '리터럴'` 명문화 (#314가 놓치고 #338이 net-new로 잡은 패턴)
>   - auto-improve Area 4: ground-truth 기법(로컬 D1에 migrations 적용→실제 스키마 교차검증) 문서화
> - **오탐 패턴 2건 추가**: CORS `!origin→'*'`(Bearer 인증), rate limiter in-memory Map(아키텍처 제약) — 양 스킬 + 하단 표 갱신
> - 자동 수정 0건(메타 정리), 신규 이슈 0건(정리 전용)
>
> **Area 5 보안 (2026-06-02T15:30):**
> - **방법**: 백엔드/프론트 3개 에이전트 병렬 — SQLi+인증 / XSS+에러노출+rate / 보안헤더+시크릿+CORS
> - **SQLi 0건**: 1,206개 `DB.prepare` 전수 — entityFilter·`.bind()`·ORDER BY 화이트리스트(`cards/queries.ts:302,802`)·`PRAGMA table_info` ALLOWED_TABLES(`attendance.ts:31`) 전부 안전
> - **인증 누락 0건**: 전 라우터 authMiddleware/portalAuth/agentKey/verifySelfToken 적절 보호
> - **rate limit 누락 0건**: login/change-password/refresh/self-auth/verify-document/verify-token 8개 커버(`index.tsx:239-246`)
> - **신규 이슈 #338(I-026)**: 하드코딩/약한 자격증명 2건 — hr.ts 주민번호 AES 키 `'fallback-dev-key'` 폴백 4곳(HIGH-data) + users.ts reset-password 기본값 `'password'`(MED). **이전 Area 5(#314) "하드코딩 시크릿 없음" 단언이 놓친 net-new**
> - **#335에 코멘트 추가**: 서버사이드 템플릿 XSS(laborContract.ts/employmentCertificate.ts `c.html()` 무이스케이프) — 클라이언트 escapeHtml과 다른 코드경로라 #335가 놓침. 잔여 클라이언트 누락분(invoice/quotation 인쇄빌더, activityLog, hr.js)도 함께 기재
> - **동기화 메모**: 오늘 더 이른 Area 5 산출물 = #335(저장형 XSS, open) / #336(CI 폴백 자격증명, open) / #337(debug 엔드포인트+error.message, open). 백로그 last_run_area가 4로 미동기였음 → 이번 실행에서 정정. #314(closed)는 직전 Area 5 자동수정(XSS 11건+SQLi cashFlow)
> - **오탐 차단**: CORS `!origin → '*'`(`index.tsx:213`) — Bearer 토큰 인증(쿠키 미사용)이라 브라우저 CORS만 영향+브라우저는 항상 Origin 전송 → 실질 무해, 이슈화 보류. rate limiter in-memory Map(`rateLimit.ts:6`) isolate 분산 한계 — 기존 인지 사항
> - 자동 수정 0건(전부 동작/정책 변경 또는 #335 검토 대기 XSS), 신규 이슈 1건(#338), 코멘트 1건(#335)
>
> **Area 4 데이터 정합성 (2026-06-02T13:30):**
> - **방법**: 프로덕션 D1 직접접근 불가(API 토큰 없음) → 278개 마이그레이션을 로컬 D1에 적용해 **실제 해석 스키마**(169테이블·424인덱스) ground truth 확보 + 코드 정적분석 병행
> - **자동 수정 A-009**: PO 번호 생성 entity 필터 누락 3곳(core.ts reorder/quick + templates.ts) → 정규 시퀀스 경로(getNextSeqNumber+getEntityId)로 정렬, 0281 복합 UNIQUE 정합. verify 통과, commit e8c8992
> - **신규 이슈 #334(I-025)**: order_templates entity_id 부재 — 주문 템플릿 전 법인 공유 (격리 갭)
> - **오탐 차단 2건**(에이전트 보고 → ground truth 반증): tax_invoices `idx_ti_number_entity` UNIQUE 이미 존재 / shipments `shipment_number` 전역 UNIQUE(복합보다 강함)
> - **인덱스 후보 37건 교차검증**: 대부분 오탐(컬럼 존재하나 실제 hot query path 아님). print_file_map·returns·cash_receipts hot path는 이미 인덱스 보유 확인. inventory_receipts.po_id만 저빈도 WHERE(core.ts:445) — 영향 미미로 이슈화 보류
> - 자동 수정 1건(A-009), 신규 이슈 1건(#334)
>
> **Area 3 UX/기능 감사 (2026-05-14T13:30):**
> - 75개 페이지/스크립트 전수 UX 패턴 분석 (검색·필터·페이지네이션·빈상태·로딩)
> - approvals.js 3탭 결재 목록 검색·필터·페이지네이션 전무 → #43 등록 (MEDIUM, 2~3h)
> - tasks.js 작업 큐 limit:200 하드코딩 (API max:500) — 200건+ 실패 태스크 미표시 → #44 등록 (SMALL, 30m)
> - deliveryAnalytics + financialReports CSV 내보내기 없음 (productionReports와 불일치) → #45 등록 (MEDIUM, 2h)
> - 대시보드 장비 가동률 % KPI 부재 — 생산 용량 즉시 파악 불가 → #46 등록 (SMALL, 1~2h)
> - 자동 수정 0건 (안전 기준 미충족), 신규 이슈 4건 (#43~#46)
>
> **Area 2 코드 품질 (2026-05-14T11:00):**
> - authMiddleware: 84개 라우트 파일 전수 확인 — 모두 적절히 보호됨 ✓
> - try-catch 누락 17핸들러 자동 수정 (A-008): permissions(5) + finishing(7) + messageTemplates(4) + iaAuto(1)
> - N+1 신규 패턴 3건 발견: printSystem.ts rebuildItemPrices/대량생성 → #37 등록, settings.ts+priceLists.ts → #38 등록
> - SELECT * 잔여 157건 (이전 수정 범위 플랫 파일 한정) → #39 등록
> - floating HEAD 18개 커밋 main fast-forward 통합 완료
> - 자동 수정 1건 (A-008), 신규 이슈 3건 (#37/#38/#39)
>
> **Area 1 프로덕션 헬스 (2026-05-14T09:15):**
> - TypeScript typecheck: PASS ✓, Vite build: PASS ✓ (4.2MB worker, 307 modules)
> - 65개 라우트 등록 전수 확인 — 누락·충돌 없음 ✓
> - npm audit: esbuild GHSA-67mh (SSRF) — 기존 거절 패턴 (#23), 신규 조치 없음
> - 신규 발견 2건 (#35 대시보드 E2E 커버리지 부재, #36 try-catch 누락 4개 라우트)
> - 자동 수정 0건 (자동 수정 가능 항목 없음)
>
> **Area 6 자기 진화 (2026-05-13T16:00):**
> - GitHub 실제 상태 ↔ 백로그 대조: 18개 "new" 중 14개 완료·1개 거절 확인 → 동기화
> - 오탐 패턴 2건 문서화: dev server SSRF(#23 거절), webhooks.ts Popbill IP 화이트리스트(의도적 보안 제어 → 하드코딩 아님)
> - F-004 패턴 확장: 비활성 필드 UI 힌트 등 미세 UX 제안 금지 규칙 추가
> - 스킬 파일 3개 업데이트: auto-improve(오탐 제외 목록), security-audit(dev-server 제외), review-checklist(§13 N+1 패턴)
> - 미추적 완료 이슈 2건 추가: #24(inventory.ts N+1), #25(priceList+inspections N+1)
> - 신규 이슈 0건 (기존 발견 사항 정리 완료, 다음 Area 1부터 신규 탐지)
>
> **Area 5 보안 (2026-05-13T13:30):**
> - SQL Injection 전수 검사: entityFilter() + 파라미터 바인딩 확인 → 취약점 없음
> - XSS 5건 자동 수정 (A-006): approvals.js:380, invoice.js:203, purchaseInvoice.js:193, quotation.js:202, clients.js:463 → escapeHtml() 적용
> - XSS 잔여 (approvals.js:119-276, cards.js document.write) → #34 등록 (HIGH)
> - 보안 헤더 (CSP/X-Frame-Options/HSTS) 전무 → #32 등록 (HIGH)
> - /api/portal/auth/change-password rate limit 누락 → #33 등록 (MEDIUM)
> - CI 폴백 자격증명 (admin/password) 낮은 위험, GitHub Secrets 분리 권고
> - Popbill IP 화이트리스트 하드코딩 → #32 포함 기재 *(이후 오탐으로 재분류: 의도적 보안 제어)*
>
> **Area 4 데이터 정합성 (2026-05-13T11:30):**
> - tax_invoice_items/tax_invoice_orders tax_invoice_id 인덱스 누락 → A-005 자동 수정 (0193 migration)
> - shipment_items UNIQUE(shipment_id, card_id) 없음 → #31 등록 → 완료 (0194 migration)
> - order 삭제 캐스케이드, 상태 머신, 트랜잭션 경계 등 검토 → 기존 코드에서 대부분 적절 처리됨
> - bank_transactions, inventory_transactions 인덱스 이미 존재 확인 → 추가 조치 불필요
>
> **Area 3 UX/기능 감사 (2026-05-13T10:00):**
> - 출고 → 세금계산서 이동 링크 없음 → #27 등록 → 완료
> - 주문 상세 → 카드 현황 버튼 없음 → #28 등록 → 완료
> - 납기 준수율 KPI 없음 → #29 등록 → 완료 (대시보드 전면 재설계)
> - 원단 소모 예측 검색/필터 없음 → #30 등록 → 완료
>
> **Area 2 코드 품질 (2026-05-13T00:00):**
> - authMiddleware 전수 검사 (73개 라우트): 전부 적절히 보호됨 — 이슈 없음
> - models.ts 미사용 타입 8개 자동 제거 → A-004
> - SELECT * 178건 발견 → #26 등록 → 완료 (145건 제거 96%)
>
> **Area 1 헬스체크 (2026-05-12T16:30):**
> - hono JWT CVE + postcss XSS — 즉시 자동 패치 (A-003)
> - esbuild/vite dev server SSRF → #23 등록 → 거절 (로컬 서버 전용)
>
> **Area 2 코드 품질 (2026-05-12T12:15):**
> - N+1 쿼리 6건 발견 (#16~#22) → 전량 완료
> - entity_id 누락 테이블 11개 (#18) → 완료 (0193 마이그레이션)
> - as any 270건 (#17) → 완료 (902→45, 95% 제거)

---

## ✅ Approved / 👀 Reviewed (owner 피드백 수신)

> **비어 있음** — 직전 approved 2건(#340 I-030·#342 I-032)은 06-09 구현·close 완료 → Done 표 이관(Area 6 06-09T22:00).

## 🆕 New (미검토)

> 전부 GitHub open + 👍 미수신. 용준님 리뷰 대기. (open **실측 2건** — 2026-06-09T22:00 Area 6 전수 재동기)

| ID | 제목 | 영역 | Issue | 공수 |
|----|------|------|-------|------|
| I-061 | [MED bug] 입고검수 CANCELLED 시 재고만 역분개·PO status/received_quantity 미롤백 → PO 영구 RECEIVED 잔류 + 취소수량 재입고 불가(400 차단). #369(재고측)와 별개 PO측 롤백 | Area 4 | #373 | ~1.5h |
| I-060 | [improvement] CSV export 5곳 `LIMIT 5000` 무경고 silent truncation — 정산/감사 다운로드 불완전 가능(발주목록/입고이력/검수결과/발주요청/현금일정). 잘림 감지+경고 헬퍼 1개 5곳 적용 | Area 3 | #372 | ~1.5h |

> ✅ 직전 New 8건(#336·#341·#350·#358·#359·#360·#362·#363) + Approved 2건(#340·#342) + 무ID close 7건(#361·#364·#365·#366·#367·#368·#369)은 Area 6(06-09T22:00) 전수 검증 후 **17건 전부 done 확정** → Done 표 이관.

---

## 🔧 Auto-fixed (자동 수정 완료)

| ID | 제목 | 커밋 | 날짜 |
|----|------|------|------|
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
| "escapeHtml 헬퍼 전무(`grep -c escapeHtml`=0) → XSS" | `layout.ts:1185`가 `window.escapeHtml`를 **전역 정의**(+`portalLayout.ts` 포털용) → 모든 스크립트가 로컬 정의 없이 전역 헬퍼 호출 가능. 파일에 escapeHtml 미정의/미참조 ≠ 취약. 올바른 판정: 실제 `innerHTML` 싱크의 보간값이 (a)사용자 제어 free-text **이고** (b)미escape인지 확인. `Number()` 강제 숫자·시스템 채번코드(order_number 등)·서버 하드코딩 문자열은 싱크 아님 | Area 6 (2026-06-06) |
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
