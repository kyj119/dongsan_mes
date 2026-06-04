# PROJECT_STATUS.md — 프로젝트 현황판

> **최종 업데이트**: 2026-06-04

---

## 🔒 편집 중 (충돌 방지)

- (없음)

---

## 🔴 현재 진행 중

- **바로빌 멀티계정 — 계좌·카드 법인별화**: **prod 배포 완료(0be34406)**. 바로빌 API 모델 검증(공식 .asmx: `RegistCorp`/`CheckCorpIsMember` → **단일 파트너 CERTKEY + 회원사별 CorpNum**). 글로벌 corpNum 하드코딩 4곳 법인별화(`barobill.ts`·`cardExpenses.ts`·`bank.ts×2` → `getEntityCorpNum(getEntityId(c))`), CERTKEY 전역 유지, **각 법인 자체 corpNum**(청주도 자체 BRN·회원사 등록 완료). 마이그 없음·HTTP 스모크 통과. **▶ 실사용 검증=선명/청주 회원사·서비스·계좌/카드/발신번호 바로빌 등록 후**(용준님). 상세 → `docs/superpowers/specs/2026-06-03-receivables-purchase-barobill-brainstorm.md`
- **미수금 회수예측 (4-3 확장)**: **4-3a 시점 + 4-3b 회수율 둘 다 prod 배포 완료**. 4-3a(9d40b745) 거래처별 결제주기(NET/MONTHLY, 마이그 `0288`, `paymentSchedule.ts` 단위테스트 7/7) → cashSchedule·cashflowEngine 입금예정 날짜 현실화 + 거래처 모달 '결제 주기' UI. 4-3b(6a613633) IFRS9 provision matrix(마이그 `0289` `ar_provision_rates`·`ar_grade_multipliers`, `provisionMatrix.ts`) → `/bank` 미수금 탭 예상회수액 KPI·예상회수율/예상회수액(위험조정=잔액×(1−등급×aging손실률)). 시드·스모크 통과. **▶ 용준님 실사용 테스트**(거래처별 결제주기 설정 → 입금예정일 확인 / 미수금 탭 위험조정 확인). 후속: 4-3a-2 median lag, 충당률 편집 UI, 4-3c 조기경보, 4-3d 임계정산. 딥리서치·설계 → `docs/superpowers/specs/2026-06-03-receivables-purchase-barobill-brainstorm.md`
- **매입 관리 — 입고·매입확정 분리** (브레인스토밍+딥리서치 후 착수): **P1~P3 전체 prod 배포 완료**. P1(6c72eb4b) 발주 단가미정(`price_status`)·입고 거래명세서 첨부(`statement_file_key`,R2,마이그 `0287`). P2(9949a74c) 매입확정 페이지 `/purchase-invoices`(확정대기·실단가입력·3-way·인보이스목록). P3(d2f76f4c) 매입확정 시 `cash_schedule` OUT(지급예정) UPSERT. typecheck/build/로컬SQL/HTTP스모크 통과. **▶ 용준님 실사용 테스트 대기**(단가미정 발주→입고+명세서첨부→매입확정→지급예정). 잔여: 그룹연쇄(price_linked)·부분확정 후순위. 설계·딥리서치 전체 → `docs/superpowers/specs/2026-06-03-receivables-purchase-barobill-brainstorm.md` (미수금 회수예측·바로빌 멀티계정 포함, **미착수**)
- **자금 예측/계획 일원화** (캐시플로 탭→`/cash-schedule` 흡수): **Phase 1~4 + 프로덕션 배포·검증 완료**(5탭 허브·하이브리드 엔진·시작잔액 prefill·은행매칭→DONE). **▶ 다음 예정 작업: 4-3 미수금↔입금예정 표시** (receivables ↔ cash_schedule IN 연결, 키 client_id). 후속 백로그: 카드 예측(corporate_cards에 cutoff_day/payment_day 추가 후)·월별요약 KPI수입 일관성·apply→DONE 운영 자연검증. 설계 → `memory/project-cashflow-unification.md`

> **다음 세션 TODO**: ①향후 기성 PRODUCT는 품목 UI '기성품' 토글로 지정(코드 완비) ②혼합주문(제작+기성) 부분출고·재고차감 실사용 모니터링 ③cards 외 스키마 드리프트 의심 시 PRAGMA 확인 ④#329(3) withSeqRetry INSERT 래핑(후순위) ⑤로컬 dev:d1 중복 3개 정리 ⑥**[예정] 자금 일원화 4-3 미수금↔입금예정 표시** (receivables ↔ cash_schedule IN, 키 client_id) ⑦자금 후속(백로그): 카드 예측(corporate_cards cutoff/payment_day 추가 후), 월별요약 KPI수입 일관성, apply→DONE 운영검증 ⑧DB 초기화 시 마이그(0106·0071) 재적용+permission_pages seed / 프로덕션 admin 비번 'password' 변경(용준님 예정) ⑨**한진 송장 자동화**: export(한진 업로드 엑셀 `POST /shipments/hanjin-export`) **prod 배포·E2E검증 완료** / 조사=굿스플로(유료중계) or **엑셀일괄(채택)** / **import(송장 일괄입력) 대기=한진 송장다운 양식·출고번호 보존 확인 후** / E2E 한진주문 365~368(entity99) 정리 / `downloadHanjinExcel` 전화 fallback에 `client_mobile` 추가 권장 ⑩**[용준님] 바로빌 알림톡 템플릿 6종 등록·검수**(문안 `docs/kakao-alimtalk-templates.md`) ⑪**[용준님] 거래처 배송방식 개별 정리**(방문수령 186건→실제 택배/화물) ⑫바로빌 `order_received` 등록 후 `orders.js` autoTemplate 확정 ⑬(선택) 주문목록 메인품목 규격 specification 표시·생산주문서 자식품목(child) spec/unit

> **직전 세션 결과 (2026-06-04 PM-3) — 주문접수 재고차감 entity 정책 결정·구현(미배포)**: brainstorming 후 **담당 법인 우선** 채택. 근거=재고는 물리 실체이므로 자재를 실제 보유·소비하는 담당 법인에서 차감해야 매출(청구법인)/재고(담당법인)/내부정산 3분리가 정합. 청구법인 차감 시 보유 안 한 원단 음수왜곡+자동발주 오작동+내부정산 근거 상실. 구현: ①`stockShip.ts`(출고 기성/유통) 쿼리를 `COALESCE(oi.assigned_entity_id, o.entity_id)` 라인별 그룹+차감으로 전환. ②`autoDeductInventory.ts`(생산 RIP 원단) 차감 entity를 `cards.requesting_entity_id`(=담당법인, Phase2 주입) 우선→`orders.entity_id` fallback. ③두 경로 모두 담당법인 재고 row 부재 시 `INSERT OR IGNORE`(item_id,entity_id,0) 가드 후 음수 차감(UPDATE silent miss 방지). ④`inventory_auto_deductions` INSERT에 `entity_id` 추가(기존 누락→DEFAULT 1 오기록 수정). **assigned NULL=청구법인 fallback → 일반 주문 회귀 0.** typecheck+build 통과, 로컬 D1 가드 검증(부재 row 생성→−7 음수 유지→재호출 미클로버) PASS. **1차 prod 배포 완료(597076b→f570fa6d)**, 핵심 페이지 스모크 PASS.
> **실증 + 엣지 버그 발견·수정(같은 세션 후속)**: 로컬 혼합주문 E2E(배포 함수 SQL) 실증 — **현실적 케이스(다른 품목→다른 담당) 정상**(담당 선명품목 entity2 −5, 청구품목 entity99 −3, 거래기록 entity별 분리). **⚠️ 동시 발견**: `inventory_transactions` 부분 UNIQUE 인덱스 `idx_inventory_tx_unique_ref(reference_type, reference_id, item_id, transaction_type)`가 entity_id 미포함 → **같은 품목**을 한 주문에서 복수 법인 담당으로 분할 시 stockShip item단위 dedup이 두 번째 그룹 silent skip(한 법인만 차감, 비결정). 내 변경이 도입한 엣지(과거엔 단일 entity). **수정**: ①마이그 `0293`(부분 인덱스에 entity_id 추가, 인덱스 DROP+CREATE만·테이블 재생성 불필요·기존 키의 상위집합이라 위반 불가) ②`stockShip.ts` dedup `AND entity_id=?` 1줄(주문×품목×법인 멱등). 로컬 적용 후 같은품목 다법인 분할 재검증 PASS(99→97, 2→95, 거래기록 2행). ▶ **다음: prod 마이그 0293 적용 + 코드 재배포.** 후속: 코디 교차권한·유통폼/견적 담당. 설계 → spec §9.5/§10, 메모리 `design-order-intake-split`.

> **직전 세션 결과 (2026-06-04 PM-2) — 주문접수 법인협업 Phase 2(분배·알림) 구현·검증·배포**: ①카드 담당법인별 생성(`generateCardsForOrder`: 카드그룹×`assigned_entity_id` 그룹핑, `requesting_entity_id`=담당법인, POST 호출 `entityId=billingEntityId`). ②카드 큐 9곳 필터 전환(`cardEntityFilter` 공통 유틸 신설→`entityFilter.ts`, `cards/queries.ts` 9곳 `entityFilter(c,'o')`→`cardEntityFilter(c,'c')` requesting_entity_id 기준). ③타법인 배정 알림(POST /api/orders 카드생성 후 타법인 담당 품목→그 법인 DESIGNER/MANAGER `notifyRoles`). typecheck+build 통과. **런타임 검증**: 카드 큐 API 4종(queues·board·daily·categories) 200/success(회귀 없음), **혼합주문 카드 분배 실증**(현수막→requesting_entity_id 1동산, 간판→2선명, 테스트 정리 완료). 효과: 타법인 담당 카드가 그 법인 작업 큐 자동 표시+알림 → 통증①②해결. **마이그레이션 없음(코드만)**. spec Phase 3(카드큐 전환)은 Phase 2에 흡수=완료. **▶ 다음: 코디네이터 교차 가시성 권한(접수 시 타법인 주문 열람, Phase 2서 분리=후속), 유통폼/견적 담당 셀렉트, 재고차감 entity 정책(미결).** 설계 → `docs/superpowers/specs/2026-06-04-order-intake-entity-split.md`, 메모리 `design-order-intake-split`.

> **직전 세션 결과 (2026-06-04 PM) — 주문접수 법인협업 Phase 1 구현·검증 완료**: 설계(유연한 그릇) 확정 후 Phase 1 착수·완료. ①마이그 `0292`(`order_items.assigned_entity_id`+`assignment_status`, **로컬+prod 적용 완료**·컬럼·인덱스 검증). ②`recommendAssignedEntity` 헬퍼(카드그룹→법인: SIGN=선명·OUTPUT/TRANSFER_FLAG=동산, 자기 청구법인과 같으면 NULL=투명). ③`order_items` INSERT 8경로 담당 반영(core POST/PUT 부모=추천+명시·자식=명시, operations 복사+SELECT/타입 보강, quotations NULL, taxInvoices 역주입 생략). ④청구법인 명시(`billing_entity_id`→`orders.entity_id`, core.ts). ⑤주문폼 UI: 헤더 청구법인 셀렉트+품목행 담당 셀렉트+`sheet.js` entities fetch(`/api/auth/entities`)+`calc.js` payload. typecheck+build 통과. **런타임 검증(Playwright)**: 청구법인/담당 셀렉트 렌더·entities 4법인 로드·콘솔에러0 확인, **첫 행 타이밍 버그 발견·수정**(entities fetch 전 생성된 첫 품목행 담당 셀렉트 빈 옵션 → `loadEntities` .then에서 기존 행 갱신). Phase 1 범위밖=유통폼/견적 담당·**카드큐 `requesting_entity_id` 필터 전환(점검 🔴, Phase 2~3)**. **▶ 다음: prod 코드 배포(`deploy:prod` — 마이그 0292는 적용 완료, 코드 미배포라 새 기능 prod 미반영. 마이그 먼저 적용됐으므로 배포 안전)/Phase 2(분배·알림·코디 교차권한)/Phase 3(카드큐 생산연결).** 설계·점검 → `docs/superpowers/specs/2026-06-04-order-intake-entity-split.md`, 메모리 `design-order-intake-split`.

> **직전 세션 결과 (2026-06-04) — 주문접수 법인 협업 설계 (⚠️방향 전환: 강제분리 폐기→유연한 그릇)**: 장시간 브레인스토밍. 초기 '수주(상위)→법인별 주문서 2단 + 카드그룹 자동분류' 6 Phase 설계를 **전면 폐기**. 폐기 이유: **생산이 물리적으로 섞임** — 간판(선명) 완제품 안에 출력물(동산 후렉스/시트)이 부품으로 들어가고, 현수막/솔벤은 독립이나 원단·단가는 동산 전문 → 품목 단위 강제 분류 불가, 케이스 무한 분기, 강제 분리가 충돌 원인. **새 방향(유연한 그릇)**: 시스템이 안 나눔, **주문은 한 그릇**(기존 orders 유지, receipts 등 신규테이블·통합배송정교화·권한EXISTS 폐기), `order_items.assigned_entity_id`+`assignment_status`로 **품목별 담당을 사람이 지정**(자동은 추천만), `orders.entity_id`=청구(매출)법인/assigned_entity_id=생산담당 분리, **법인별 게이트 코디네이터**(역할·현행수신유지·수신~분배까지·규격/단가는 담당 디자이너·타법인 교차열람), 타법인 공정=`cards.requesting_entity_id`(기존)로 그 법인 큐+알림, **매출=청구법인 단일**+타법인 공정 내부정산(월말 상계), 미래=거래처 셀프 포털. 통증 ①②③ 모두 쪼개기 없이 해결. Phase 축소(P1 담당태그+추천+UI→P2 분배·알림·코디권한→P3 생산연결→P4 내부정산→P5 포털), P1~P3=MVP. **spec 전면 재작성 완료** → `docs/superpowers/specs/2026-06-04-order-intake-entity-split.md`, 메모리 `design-order-intake-split`. **▶ 다음: 용준님 spec 리뷰. 미결=독립제품 청구분리 빈도·내부정산 단가기준·결합vs독립 비중(운영 데이터로 확인).** 핵심교훈: 멀티법인 생산이 물리적으로 섞이면 시스템 강제분류 금지, 사람이 판단·시스템은 그릇.

> **직전 세션 결과 (2026-06-03 PM-3) — 유통/원자재 규격(specification) 전면 + 주문 일괄 상태변경**: ①**일괄 상태변경/회계반영**(`a204024`): 드롭다운 교집합→합집합(SHIPPED 제외)·목표상태 가능분만 처리+결과 리포트 모달(`bulkResultModal`)·회계반영 이미반영/출고전 사유분류. ②**유통품목 규격**(`9514c0a`, 마이그 `0291`): `order_items.specification` 추가, 유통주문서 규격칸+품목 unit(yd/롤) 저장, 명세서·원장·포털·세금계산서 specification 우선, 한진/카카오 품목명 "대표 외 N건". ③**생산주문서 규격 확장**(`bbe57fb`): 원자재/GOODS 선택 시 가로(cm)→규격칸 전환+자동채움, 견적/주문/수정폼 spec+unit. ④**상세·이메일 규격**(`3907d7b`): 주문상세 모달·명세서/견적 이메일·출고알림 이메일 specification 우선. **영향분석으로 주문수정(PUT) INSERT specification 누락 버그 발견·수정**. 재고차감=quantity만(폭 무관) 확인. prod 배포 다수(최신 `698c771d`), HTTP 스모크+함수검증+로컬 실저장(specification/unit) 통과. 설계 → `memory/design-item-specification.md`. **✅ 용준님 프로덕션 UI 검증 완료**(생산주문서 원자재→규격칸/저장→상세·명세서·이메일·수정 후 규격 유지 정상).

> **직전 세션 결과 (2026-06-03 PM-2) — 한진 송장 export + 연동 조사**: ①**deep-research**(98 에이전트): 한진 직접 송장API=공개 self-serve 없음(nFocus 포털·원클릭 로그인/전용프로그램→서버리스 부적합). **굿스플로 Sellers Open API**(REST/JSON·Authorization키·HANJIN코드·선충전 22~16.9원/건)가 유료 통합경로. 단 용준님 **엑셀 일괄** 방식 채택(`Z:\Designs\서식_동산기획2.xlsx`=한진 대량등록 양식 12컬럼, "출고번호" 컬럼=매칭키). ②**export 구현·배포**(dd3bea6c): `POST /api/shipments/hanjin-export`(보내는분=`getEntityCompanyInfo` 법인정보, 받는분=프론트전달, 출고번호=`H-{date}-{client_id}`, CSV UTF-8 BOM) + `/shipments` 한진섹션 '한진 업로드 엑셀' 버튼 + `downloadHanjinExcel`(선택/전체). ③**E2E검증**: entity99 한진주문 4건(365~368, `E99-20260603-004~007`) 생성→한진섹션 로드→export CSV 4행 정상(출고번호·거래처·전화숫자·실주소·품목). **▶ 다음: 용준님 한진 업로드 테스트(양식일치·출고번호 보존 확인)→import(송장 일괄입력) 구현 / E2E 주문 365~368 정리 / 전화 fallback `client_mobile` 추가.**

> **직전 세션 결과 (2026-06-03 PM) — 카카오 알림톡 + 출고/주문 배송 정합**: ①**카카오 알림톡 템플릿 문안 6종**(출고4 `shipment_freight`/`hanjin`/`parcel`/`pickup_ready`, `order_received`, `ledger_notice`) 작성 `docs/kakao-alimtalk-templates.md` — 코드 대조 점검(등록템플릿=발송본문 글자일치 필수, **버튼 현재 미전송**=barobillSms `sendATS` XML에 btns 없음→링크는 본문). ②**출고 알림톡 코드 정합**(`shipments.js`): 출고일 `#{날짜}` 변수화, 배송수단별 `autoCode` 분리(화물 본문 다름→단일 불가, `delivery_type` 영문코드라 변수통합 불가), 한진 송장번호 줄·대신화물 터미널 줄. ③**배송지 저장 버그**(`clients.ts`): GET `/:id`·`/:id/detail` SELECT에 `delivery_address` 누락→추가(저장은 정상, 조회 빠져 "저장 안 됨"처럼 보임). ④**주문접수 품목 변수**(`orders.js`·`orders/core.ts`): `#{품목}`=메인품목[규격][내용] 외 n건(`main_item_content` 서브쿼리 추가), autoTemplate→`order_received`, templateVars `{고객명,주문번호,품목,날짜}`. ⑤**거래처 배송방식 세분화**(마이그 `0290`): enum 4종→한글 7종(대신택배/대신화물/한진택배/직배/용차/퀵/방문수령), prod 마이그 적용(SAME 186→방문수령·FREIGHT 14→대신화물, 3017행). ⑥**주문폼 터미널 자동 동기화**(생산 `orderForm/client.js`·`calc.js` + 유통 `orderFormDist.js`): 거래처 `address`(사업장)+`delivery_address`(터미널) 보관, `syncDeliveryInfo`로 거래처/방식 변경 시 deliveryInfo 재설정(대신화물=터미널·그외=사업장), 배송방식 자동선택(한글 1:1), 저장 시 거래처 터미널 자동갱신. 배포 다수(최종 21602715), Playwright 검증(거래처 마이그·라벨전환·동기화 4시나리오 PASS). **▶ 후속: 바로빌 알림톡 등록·검수, 거래처 배송방식 개별정리(방문수령 186), 한진 송장 자동화(deep-research 진행중), `order_received` 등록 후 autoTemplate 확정.**

> **직전 세션 결과 (2026-06-03) — Phase 1~3 프로덕션 검증 + Phase 4 핵심**: Phase 1~3을 프로덕션(webapp-9i0.pages.dev) 배포 후 Playwright 검증 — 5탭 전환·6 API(200)·렌더·콘솔에러0·`/bank` 캐시플로 제거·리다이렉트 전부 PASS. 하이브리드 엔진 실DB 동작 확인(추정자금일보 92행, 고정비 온더플라이 반영). **Phase 4 핵심 구현**: ①`GET /schedule/bank-balance`(계좌별 최신 balance_after 합산)→추정자금일보 시작잔액 자동 prefill ②`bank.ts` apply+batch-apply에 cash_schedule 자동 DONE 연동(client_id+IN+ORDER+금액정확일치+동일법인, try/catch 격리·보조). build/node-check 통과, **미배포**. ※참고: 월별요약 KPI수입(summary 실입금)≠월별표(monthly 예상입금) 소스차이=4-3 개선대상. 프로덕션 admin 비번 'password' 보안점검 권장.

> **직전 세션 결과 (2026-06-03) — Phase 3(UI 흡수) 완료**: 캐시플로 탭을 `/cash-schedule`로 흡수 → **자금계획 5탭**(자금계획·월별요약·고정비·대출·추정자금일보). `cashFlow.js` IIFE 재작성(fmt 충돌 격리·자동초기화 제거·projection→monthly·달력 제거·로더 window 노출), onclick `\'` 이스케이프 수정, `switchScheduleTab` 5탭 확장, `bank.ts` 캐시플로 탭/스크립트 제거(은행연동만), `/cash-flow`→`/cash-schedule` 리다이렉트, summary GET MANAGER 허용. 정적검증 통과(typecheck/build/ID정합성23/이스케이프). **런타임 검증 미실시**(로컬 admin 로그인 불가) → 스테이징 배포 후 5탭 전환·콘솔에러·API 확인 필요.

> **직전 세션 결과 (2026-06-03)**: **자금 예측/계획 일원화 Phase 1+2 완료(백엔드).** 캐시플로 탭(`/bank`)을 `/cash-schedule`로 흡수하는 통합의 백엔드. ①신규 `cashflowEngine.ts` 하이브리드 합성 헬퍼(물질화 cash_schedule + 온더플라이 고정비·대출·미청구주문 예상입금). ②`forecast` 헬퍼 기반 재작성, 신규 `GET /schedule/monthly`(거친 projection 대체). ③cash_schedule 조회/수정/삭제 전부 `entity_id` 필터(법인격리+보안). ④`auto-generate` FIXED 생성 제거(온더플라이 통일·이중계산 차단). ⑤고정비/대출 GET을 MANAGER 허용(변경은 ADMIN). 카드 예측은 `corporate_cards` cutoff/payment_day 부재로 백로그. typecheck/build/SQL 검증 통과. **Phase 3(UI: cashFlow.js 488줄+탭HTML 이관·달력 일원화·bank.ts 정리) 대기.**

> **직전 세션 결과 (2026-06-02 PM-4)**: **기성품/유통 즉시출고 — 전체 완료(Phase 1+2+3 + UI 클릭검증 + 태극기 9종 지정).** `items.production_required`(0285, GOODS/MATERIAL=0·그 외 UI), getCardGroup 최우선 분기(카테고리보다 우선), 카드 PRINT_DONE→shipment_ready 전파, 완료 파이프라인 PRINT_DONE 게이트 제거(유통/기성도 SHIPPED), 출고 재고차감 일반화(음수허용·멱등), 주문서 재고부족 경고. 드리프트 수정: cards.print_done_at·shipped_by(0286). UI 클릭검증(토글 저장·경고 토스트)+태극기 9종 지정 완료. (commits 9c90306, 4f75790, d5ad1b6)

> **직전 세션 결과 (2026-06-02 PM-3)**: **한진 E2E(entity 99) 워크플로우 점검 → 치명 버그 2건 발견·수정·배포.** ①카드 생성 차단(1cb77e9가 status='PRINT_PENDING' 도입했으나 cards.status CHECK 미갱신 → 2026-06-01 이후 PRODUCTION 주문 생성 전부 500): 마이그 0284로 CHECK 확장(prod 적용). ②card_number를 order_number.split로 만들어 E{eid} 주문 같은날·법인 충돌: order_number 전체 기반으로 수정. ③#330 회귀(cards.entity_id 없음→orders 조인) 수정. 한진 리스트 착선불/수량 실데이터 검증 통과. **전 법인(1/2/3) 라이브 검증**: 각 법인 PRODUCTION 주문 생성→카드 PRINT_PENDING·card_number `E{eid}-…-01`(법인 유일)·격리 확인→완전 정리(잔여 0·번호 반환). 실데이터 피해 0건. (commits 3dff91c, 18769f7)

> **직전 세션 결과 (2026-06-02 PM-2)**: 출고/배송 페이지 수정 3건 — 한진/대신 리스트 착선불 한글화(`payTypeKo`)·수량 중복 버그 수정(`items` 초기화), 전체 라벨→선택 항목만 출력, 계산서 발행 링크 제거. 배포 + 5/8 실데이터 검증 통과 (commit b261673)

> **직전 세션 결과 (2026-06-02 PM)**: **GitHub 오픈 이슈 11건(#323~333) 전수 수정·배포·close** — 보안격리(payroll/cards/AR/budgets/aiInsights), cascade(주문/발주요청), 채번 E{eid} 확장, 홈택스/nts dedup(마이그 0282·0283 prod 적용), saveAutoApprove 복구, dead code 정리. prod 스모크 통과. (오픈 이슈 0건)

> **직전 세션 결과 (2026-06-02 AM)**: 채번 경계 버그 근본수정(E{eid} 내장 채번) + 견적서 개편(표·품목·전환 prefill) + 생산주문서 유통품목 행 단순화 + 전체 페이지 점검(storageZones CRITICAL 수정·배포, 이슈 #326~328 등록)

---

## 🟡 대기 중 (사용자 선택/승인 필요)

### [기성품/유통 즉시출고] — ✅ 전체 완료 (Phase 1+2+3 + UI 클릭검증 + 태극기 지정)
- 코드/마이그(0285·0286) prod 반영. 기성/유통 = 카드 미생성·즉시 출고가능·SHIPPED 전이·출고 시 재고차감(음수 허용·멱등)·주문서 재고부족 경고.
- **UI 클릭검증 완료**: 품목 '기성품' 토글 저장(production_required=0 영속), 주문폼 재고부족 경고 토스트 실발생.
- **태극기 9종(수기·1~6호·특호·탁상용) 기성품 지정 완료**. GOODS/MATERIAL 자동. 향후 추가 기성 PRODUCT는 품목 UI '기성품' 체크로 지정.

### [포털 rate-limit] — ✅ 프로덕션 배포됨 (2026-06-02)
- portal verify-document/verify-token에 `rateLimitMiddleware`(10·30/분) 적용(commit 4a2fc28). HEAD(1bd6d01) 빌드에 포함되어 2026-06-02 배포들(60ff92fb~57788bef)로 **prod 활성화**. (Cloudflare 바인딩 방식은 Pages 미지원으로 폐기)
### [#310 직접발행 폼] — 실사용 검증 대기 (2026-06-01)
- 백엔드(POST /tax-invoices/direct)+UI 배포됨. 세금계산서 '직접발행' 첫 발행 테스트 권장 (tax_invoices 0건)

### [자금계획 ↔ 캐시플로 통합] — 구조 논의 대기
- 달력 뷰가 양쪽에서 중복 → 캐시플로에 수동등록/추정자금일보 합치고 자금계획을 탭으로 통합 제안
- 사용자 결정 후 진행

### [바로빌 전환] — 통합 완료, 잔여 작업 대기
- 전환 완료: `messaging_provider=barobill`, 실데이터 조회 성공
- 통장→수금 반자동 플로우 구현됨 (동기화→자동매칭→사람확인→수금반영)
- 자금관리 탭 정리 완료: 바로빌 통장 탭→은행 연동에 통합 (2026-05-24)
- **대기**: SMS 발신번호 승인, **알림톡 템플릿 등록·검수**(문안 6종 작성완료 `docs/kakao-alimtalk-templates.md` → 바로빌 등록·검수), 나머지 카드/계좌 등록
- **알림톡 코드 정합 완료**(2026-06-03): 출고 4종·주문접수·미수금 템플릿 코드 연동. **버튼 미전송**(barobillSms sendATS) → 링크는 본문. **한진 송장 수동입력**(연동 없음, 자동화 deep-research 진행중)

### [선명2 CAPS Worker 설치] — PC 설정 대기
- S2 사이트 DB 등록 완료, API_KEY 발급됨
- 선명2 PC에 caps-worker 폴더 복사 + .env 설정 + 실행 필요

### [배송 관리 최적화] — 출고 대기 보드
- 배송방법별 그룹화 + 마감시간 카운트다운 + 일괄 출고 + 카카오톡 자동 발송
### [기존 계약 일괄 등록] — 엑셀 import 스크립트 제공 대기
### [라벨 프린터 인쇄] — 프린터 모델 확인 필요 (외부 의존)
### [RIP 전송] — 코드 완료, 현장 테스트 대기 (외부 의존)
### [LogWatcher PrintExp] — 구현 완료, 현장 배포 대기 (외부 의존)
### [한진택배 자동화] — 솔루션 선정 대기 (사용자 결정 필요)

---

## 🟢 최근 완료 (2026-06-02)

### 한진 E2E 워크플로우 점검 — 카드 생성 차단 2건 + #330 회귀 수정 (2026-06-02 PM-3)
- **점검 방식**: entity 99(E2E)에 한진 주문 생성 → 워크플로우 실주행. 한진 리스트 착선불(선불/착불)·수량 dedup 실데이터 검증 통과.
- **🔴 발견2 (CRITICAL, pre-existing `1cb77e9`)**: 카드 INSERT status='PRINT_PENDING'인데 `cards.status` CHECK는 0022의 `('PRINTING','PRINT_DONE','HOLD')`만 허용 → 카드 생성 전건 `CHECK constraint failed` → **PRODUCTION 주문 생성 500** (마지막 정상 카드 2026-06-01 04:24, 이후 실법인 production 주문 미생성으로 미발현). → **마이그 0284**: cards 재생성 + CHECK에 PRINT_PENDING/RIP_WAITING/SHIPPED 추가 (prod 136행 보존 적용).
- **🟠 발견3 (E{eid} 채번 후속)**: `generateCardsForOrder`가 card_number를 `order_number.split('-')[0]/[1]`로 생성 → `E99-…-004`가 `E99-날짜-{cardIndex}`가 되어 같은날·법인 2번째+ 주문 **card_number(UNIQUE) 충돌**. → `${order_number}-${cardIndex}` 전체 기반(역호환·전역유일)으로 수정.
- **🔴 발견1 (내 회귀)**: #330이 없는 컬럼 `cards.entity_id` 참조 → 스케줄 라우트 500. `order_id→orders.entity_id` 격리로 재수정(`cards/queries.ts` 패턴). cards는 봇 오탐 — `feedback-autoscan-false-positives` 갱신.
- **검증(entity 99)**: PRODUCTION 주문 2건 연속 → 카드 PRINT_PENDING 생성, card_number `…-004-01`/`…-005-01` 구분(충돌 없음). 테스트 데이터 정리 완료.
- **라이브 검증(법인 1/2/3)**: 각 법인 실 PRODUCTION 주문 1건 생성 → `E{eid}-20260602-001` + 카드 `E{eid}-…-001-01`(법인 유일·PRINT_PENDING)·entity_id·수량 정확 → **완전 정리**(card_items/cards/order_items/status_history/activity_logs/orders 각 3건, 잔여 0, 번호 MAX기반 반환). 주문생성=알림 없음(logActivity만). **버그 창에 실 production 주문 0건 → 실데이터 피해 0건** 확정. commits 3dff91c, 18769f7

### 출고/배송 페이지 수정 3건 (2026-06-02 PM-2)
- **착·선불 한글화**: `shipping_payment`(PREPAID/COLLECT)를 출고 확인 리스트(한진·대신)에 raw 영문 출력 → `payTypeKo()`로 선불/착불 표기
- **수량 중복 버그**: 거래처 그룹화 시 `items: s.items`로 초기화 후 아래 concat에서 첫 주문 items를 재합산 → **첫 주문 품목·수량 2배** → `items: []` 초기화로 수정
- **전체 라벨 출력 → 선택 항목만**: `printAllSection`이 전체 키 순회 → 체크된(`selectedShipments`) 거래처만 출력 + 버튼명 "선택 라벨 출력"
- **계산서 발행 링크 제거**: 5개 섹션(화물/택배/한진/퀵/기타)의 `/tax-invoices` 링크 삭제
- 배포 + **5/8 실데이터 검증**: 7개 그룹 raw=화면 수량 완전 일치(중복 없음), 착선불 선불/착불 정상, 거래처 출고방법 분리 케이스(현대광고 대신택배2+용차1) 정확. commit b261673

### GitHub 오픈 이슈 11건(#323~333) 전수 수정·배포·close (2026-06-02 PM)
- **보안/멀티법인 격리(HIGH)**: #330 cards/scheduling 4라우트 IDOR, #331/#333 payroll 5라우트+tax-agent CSV(PII)+DELETE IDOR(orders/AR수금/budgets)+aiInsights 교차집계, #327 알림 read 필터. 패턴: `entityFilter`(entityId=0 전체모드는 필터 생략 → ADMIN 교차조회 정책 자동 충족)
- **데이터정합성**: #323 홈택스 INSERT OR IGNORE+UNIQUE(0282), #329 채번 E{eid} 확장(approval/PR/inventory) + nts_approval UNIQUE(0283), #324 발주요청/발주 cascade, #332 주문삭제 cascade(tasks/work_records/print_file_map)
- **기능/정리**: #326 saveAutoApproveSettings 복구(parseMoney 콤마제거), #325 migration_logs 5건 보강, #328 dead 4건 삭제+recalc 버튼 복구
- **봇 오탐 3건 검증·제외**: order_items(entity_id 컬럼 없음), cash_receipts·mrp_runs(이미 E{eid} 내장). auto-scan/auto-improve 이슈는 스키마/코드 대조 필수
- 마이그레이션 0282/0283 **prod 적용 완료**(3테이블 중복 0건, DELETE 무영향). commit 1aaf44f, 배포 https://webapp-9i0.pages.dev, prod 스모크(엔드포인트 200·UI 콘솔에러 0) 통과
- **후속 분리**: #329(3) withSeqRetry INSERT 래핑(충돌은 법인별 카운터로 완화), #327 집계 엔드포인트(단일에이전트 교차 설계)

### 채번 경계 버그 근본수정 — 견적서 저장 500 장애 (2026-06-02)
- **원인**: `quotation_number` 등 `*_number`가 **컬럼레벨 전역 UNIQUE**인데 채번은 **법인별 MAX** → E2E(entity 99)가 오늘자 001~007 선점 시 실법인이 001 생성 시도 → `UNIQUE constraint failed` 500
- **해결**: 번호에 법인코드 `E{eid}` 내장(`getNextEntitySeqNumber`, sequenceGenerator.ts). 문자열이 법인별로 달라 전역·복합 UNIQUE 양쪽 호환 → **스키마 변경 없음**
- 적용: quotations(`Q-E{eid}-`)·orders(`E{eid}-`)·purchase_orders(`E{eid}-…-P`)·payment_requests(`PR-E{eid}-`) **12 호출부**. 불변식: 번호 E{eid}=행 entity_id(`getEntityId(c)||1` 통일)
- 프로덕션 검증: `Q-E2-20260601-001`(entity 2), `E2-20260601-001`(entity 2) 정상 생성. 규칙 → `memory/project-entity-policy`

### 견적서 관리 개편 (2026-06-02)
- 저장 후 → `/quotations` 리다이렉트(양식 페이지 대신)
- 표 레이아웃: 주문 `ord-tbl` 패턴 이식(헤더/바디 패딩 통일) + **품목 컬럼**(품목명+규격+외 N건) 추가, 액션 아이콘화
- **견적서→주문 전환 = 주문폼 prefill 기본화**: 즉시생성/confirm 제거, `/order-form?quotation_id=`로 이동(기존 `loadQuotationForPrefill` 활용) → 납품일막힘(#134) 자연 해소. 한계: prefill은 기본 필드만(후가공·번들 제외)

### 생산 주문서 유통 품목 행 자동 단순화 (2026-06-02)
- 생산 주문서에서 `item_type=GOODS/MATERIAL` 품목 선택 시 그 행만: 가로·세로 비활성 + 후가공·마감 섹션 숨김 + '유통' 뱃지. 생산품 선택 시 원복
- 한 주문서로 생산+유통 혼합(서버는 이미 품목별 분기). `layout.ts` 모달 콜백에 item_type 전달 + `itemRow.js applyDistRowMode`. 서버 무변경. 로컬 브라우저 검증(GOODS 단순화/PRODUCT 원복)

### 전체 페이지 점검 (auto-scan, 2026-06-02)
- 정적(백엔드 95파일+프론트, 에이전트 2) + 동적 18페이지(Playwright 로컬 e2e_tester) + 프로덕션 데이터정합성
- **🔴 CRITICAL 수정+배포**: 설정>창고구역 탭 "구역 추가/수정" 크래시(settings 모달에 `zoneModalEntity/Default` 누락) → settings.ts에 두 필드 추가. 재현→수정→재검증(modal OK)
- **이슈 등록**: #326(HIGH `saveAutoApproveSettings` 미정의), #327(LOW entity필터 일관성), #328(LOW dead code) + #325 코멘트(order_items INSERT 위치)
- 데이터정합성 **0건**, `/bank`·`/card-expenses` 로컬 500은 **스키마 드리프트**(프로덕션 컬럼 존재 확인, 정상)
- 배포 6회: 60ff92fb→1688cbab→a24fbf89→c0957421→86fc9bb5→57788bef

---

## 🟢 최근 완료 (2026-06-01)

### 거래처원장 정합성·UX 개편 (2026-06-01)
- **상세 모달**: 전기이월(opening_balance) + 모달 독립 기간 컨트롤(올해/전체) + 인쇄 백지 수정(visibility 기반) + 빠른기간 KST/UTC 하루밀림 보정
- **목록(정산)**: 미수 거래처 누락 수정 — 캐시 clients.balance → 실계산 미수(orders BILLED−payments−adj, entityFilter)
- **표 헤더 정렬 전역 수정**: layout.ts `.ds-table thead th.text-right/center/left`(0,2,2) → ds-table 전 페이지 헤더 정렬 복원
- 프로덕션 캐시 잔액 재계산(거래처 1건 +60,000), 단가 법인공유 정책 문서화(`memory/project-entity-policy`)

### GitHub 이슈 29건 전수 종료 (2026-06-01)
- 자동수정 봇 인용 커밋이 전부 가짜(미반영) 판명 → 서브에이전트 4팀 개별 재검증
- 런타임500/크래시(#316/317/319/303/300), 멀티법인 격리(#279/282/322/313/284/277/286/285/283/274), UNIQUE(#281/287), 보안(#314/315/320), 성능(#276/321), 직접발행(#310 방안A), API정리(#318), 결정/wontfix(#304/293/295/278/306)
- 마이그레이션 0278~0281 prod 적용+추적, 커밋 13·배포 11

---

## 🟢 최근 완료 (2026-05-29~31)

### 근태관리 페이지 레이아웃 전면 개편 (2026-05-29)
- **집계 칼럼 11→5열**: 결근·연차·지각·연장·휴일 (출근/조퇴(건)/병가/휴일/조기(h)/조퇴(h) 제거)
- **연장 = 조기출근 + 연장근무 합산** 표시
- **31일 고정 렌더링**: 28/30일 달도 항상 31열, 초과일은 회색 비활성 → 레이아웃 불변
- **table-layout: fixed + 명시적 열 너비**: 체크 32px, 직원 120px, 일자 36px, 집계 36~50px
- **셀 div width:100%**: td 패딩 1px + div fills → 뱃지 잘림 해소
- **연차 카운팅 보정**: 반차 +0.5, 반반차 +0.25 정확 카운트
- **숫자 포맷 fmtNum()**: 정수=정수, 소수=소수점 유지 (0.25, 7.5, 28.5)
- **0값 "-" 표시**: 깔끔한 집계 표시

### 근태 유형별 지각/조퇴 스마트 처리 (2026-05-29)
- **서버+프론트 양쪽** 기준시간 맵 도입: NORMAL 08:30/18:00, HALF_AM 13:00/18:00, QUARTER_1 10:00/18:00 등
- **풀타임 휴가**: 지각·조퇴 0으로 강제
- **오전반차/반반차1**: 지각 제외 (오후 출근 정상)
- **오후반차/반반차4**: 조퇴 제외 (조기 퇴근 정상)
- **저장 시 자동 재계산**: check_in/check_out 기반으로 late_minutes/early_leave_hours 재계산

### 법인카드 마감일 + 캐시플로 결제 예정 (2026-05-31)
- **DB**: `corporate_cards.cutoff_day` 칼럼 추가 (마이그레이션 0273)
- **카드 관리 UI**: 마감일 입력 필드 추가 (결제일과 별도)
- **캐시플로 달력**: 카드사별 결제 예정을 **보라색 배지**로 결제일에 표시 ("하나 결제" 등)
- **결제액 계산**: 마감일(cutoff_day) 주기 기반 거래액 합산, 같은 카드사 자동 합산

### 법인카드 영수증 바로 첨부 (2026-05-31)
- 테이블 각 행에 **카메라 아이콘** → 파일 선택 즉시 R2 업로드
- 첨부 완료 시 **체크 아이콘(초록)** 전환
- 편집 모달 열 필요 없이 원클릭 완료

---

## 🟢 이전 완료 (2026-05-28)

### 단가 관리 시스템 구축 (2026-05-28)
- **매입단가 탭**: item_group별 그룹 뷰 + 단가연동 토글(price_linked) + 매입처 단가/이력 확장
- **매출단가표 탭**: 거래처 검색→정책 적용 단가 + 인쇄(A4) + 팩스 발송
- **입고 자동갱신**: PO receive → ①매입처단가 upsert ②base_price 갱신 ③item_group 연쇄(price_linked) ④이력기록
- **DB**: 0267(price_groups+price_change_history 스키마 수정), 0268(item_group_settings)
- **설계 결정**: price_groups 별도 테이블 → item_group 통합 (중복 그룹 체계 해소)
- **price_change_history 스키마 불일치 수정**: 기존 이력 기록 silent fail → field_name/old_value/new_value 컬럼 추가
- 프로덕션 배포 완료, 14페이지+11API 스모크 통과

---

## 🟢 이전 완료 (2026-05-27)

### 법인 분리 전체 감사 + Issues #217~#234 Phase 1~3 (2026-05-27)
- **MES 자동 스캔**: 6개 영역(페이지·API·정적분석·데이터정합성·UI·보안) → Issues 6건 등록
- **법인 분리 지도**: `docs/entity-separation-map.md` — 174테이블 전수 감사 (72완료/14버그/28간접/42공유/18시스템)
- **Phase 1** (코드만 11건): entityFilter 누락 8건, auth 누락 1건(CRITICAL), soft-delete 필터 1건, validation 1건
- **Phase 2** (마이그레이션 0264): entity_id 14테이블 추가 + 라우트 8파일 entityFilter 적용
- **Phase 3** (데이터 정합성 6건): 출고 취소 복수 shipment 수정, 소프트삭제 batch, UNIQUE 제약 2건, auto_process 고아 방지, E2E 정리
- 총 18건 close, 마이그레이션 0264~0266, 프로덕션 배포 3회

---

## 📌 기존 에러
- (없음) — 2026-05-19 확인: 3건 모두 200 정상
