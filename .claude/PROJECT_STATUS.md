# PROJECT_STATUS.md — 프로젝트 현황판

> **현재 초점**: 워크플로우 마스터 기획(`docs/superpowers/specs/2026-07-01-workflow-improvement-master-plan.md`) 실행 + 인사/급여/근태 강화. **배포완료**: Phase0·X2·X4·X5·G-1·G-7 + HR(B1 급여확정잠금·B2 CAPS경보·B4 연차무인+촉진소멸배너·미사용연차수당 주입) + **급여관리 기본뷰=급여대장 전환**. 전부 무마이그·매입세션 무충돌. **HR 남은**=B3 직원셀프(급여명세서·전자서명 hrSelf)·B5 4대보험 7월요율. 그외=Phase1~5(단가·실원가·간판BOM 등).
> **마지막 prod 배포**: **급여대장 단일 뷰**(`75cbecc4`, prod `8af1d04d`). 이전: **배송 시스템 P1~P3**(`ba255fc6`, dep `2f91a63e`, 마이그 0436·0437): shipment 생성 일원화(ensureShipmentForOrder)+orders.shipped_at+합배송 후보(cross-entity)+합포장(merged_into) → 정본 [[project-delivery-system]]·결정 BG. 이전: **자금계획 달력 하이브리드 엔진 재배선 + bank 드롭다운 가림 수정**(`0bcee65a`/`a57c4c84`, prod `bc686bfc`): 달력이 물질화 행만 읽어 카드대금(CARD_EXPECTED)·고정비·대출·급여·예상입출 누락 → buildCashflowDays 사용(carryOverdueToStart 옵션·forecast와 숫자일치, 일자모달=물질화만 완료/삭제) + bank 매칭 드롭다운 td overflow:hidden 클리핑 해제(ds-wrap)+하단 공간부족 시 위로 플립. apex 마커·페이지15·API13 검증. 이전: **바로빌 통합포인트 표시 정합**(`8dad40f7`/`18343022`, prod `01bb23e8`): 자금관리(/bank status)·세금계산서 연결테스트가 회원사 지갑(동산0·미등록법인 -10001)→**통합(파트너) 지갑**(`getPartnerBalance`=102194, CERTKEY 공통) 조회로 통일 + 설정 연결카드 partner_point 정정 + 법인별 senderId(`getEntityBarobillSenderId`, -24005 방지) 통일. 정본 [[barobill-charge-balance]]. 이전: **#470/#471 IDOR 2건**(`4d78be6b`, apex 401 검증): payroll sync-attendance entity 필터·client_notes 삭제 2축검증. 이전: **git issues 5건**(`d2ebed69`, apex 검증): #457 데드코드삭제·#467 연차 촉진/소멸 배너(`/alerts-summary`)·#466 메시지 단가 SOAP 7→2콜(`/unit-cost`)·#469 연차수당 주입 시 총액/공제/net 재계산·#465 Step1 bom_items split-brain 해소. 이전: **품목 마스터 대량등록 세션**(마이그 0420~0434: 솔벤캔버스·간판자재157·조광/화진/프라임 코팅지·변종분리·C2 사용자별품목 `a3139a6a`) + 바로빌 파트너포인트/발송단가(알림톡/SMS/팩스, 부가세별도) + 주문서 원자재토글·품목 라인별명. 이전: 급여관리 급여대장 전환(`151f4cb7`/`e2fbe7e1`) + HR B4(`8d3b34cf`·`aba9234d`). 이전 세션분: B1·B2(`feb3b461`/`12eeb58f`)·G1·G7(`f17ae5c9`/`87763cad`)·X4·X5(`de4df2ed`/`84483450`·워커 `a2b06cc6`)·Phase0·X2(`3fd127f4`·마이그0420).
> **⚠️ 급여계산 진단(신현서 케이스, 코드정상·입력차이)**: MES 공제가 ECOUNT보다 높음 = **①부양가족 0명(→본인1, 소득세 +66k 최대) ②차량유지비 20만 비과세 미처리(taxable=400만) ③국민연금 base=당월급여(400만) vs ECOUNT 기준소득월액(~371만)**. MES 간이세액표 룩업·100/120옵션·요율(9.5/7.19/13.14%)·상한(637만) 전부 정상. 조치=부양가족·차량유지비 비과세 입력 / 개선여지=국민연금 기준소득월액 필드. → [[payroll-calc-ecount-diff]]
> **블로커**: 품목 단가 전부 0(전역 과제·매입세션 진행중) · 간판 BOM=brainstorming 후 보류.
> **다음 액션**: ①B5 4대보험 7월요율 적용(**상한 637만→659만·하한 40만→41만** 리서치완료·prod insurance_rates 반영 확인대기) ②B3 직원셀프서비스 ③국민연금 기준소득월액 필드 ④단가.
> **▶ git issues 후속 (2026-07-01 세션)**: ✅**#470/#471 배포완료·이슈 Close**(`4d78be6b`, apex 401 검증) — #470 `sync-attendance` targetQuery에 `entityFilter(c,'p')` 추가(cross-tenant write IDOR 차단, SELECT 게이트=UPDATE 게이트), #471 메모삭제 `WHERE id=? AND client_id=?${ef.clause}` 2축 SELECT/DELETE 검증. ⏸**#472 보류**(OPEN 유지·GitHub 보류 코멘트) BOM 계획 Step2(`materialRequirement.ts`) — print_events 실측으로 출력완료 order_item 제외(autoDeduct 이중계상 방지), 미출력분만 계획. **brainstorming 선행**(부분출력 처리 정책).
> **핸드오프 정본** = `memory/session-context.md`(품목) + `memory/project-workflow-master-plan.md`(워크플로우·HR).
> **🔧 멀티세션**: 동시 작업은 `scripts/new-session.ps1 <이름>`(worktree 격리, 메인 직접작업 지양) → `docs/WORKTREE_WORKFLOW.md`.
> 완료 이력 → `PROJECT_STATUS_ARCHIVE.md` (매 세션 읽을 필요 없음, 필요 시 참조).

---

## 🔒 편집 중 (충돌 방지)

- (없음)

---

## 🔴 현재 진행 중

- **✅ [2026-07-02] 급여대장 단일 뷰 + 지급/공제 좌우 분리 (prod `1d633924`, 커밋 `75cbecc4`→`7aacd7b1`→`701ac955`)**: ①compact 간단표·토글 폐기(용준님: "급여대장 아닌 폼 불필요") — 체크박스·상태·액션·근태마크를 대장에 통합. ②공제 안 보이는 원인=표폭 1822px(prod 공제 상세데이터는 정상). 시행착오: 0컬럼 자동숨김→"다 보이게"·세로 2단 밴드→"위아래 어색, 좌우로" 피드백 거쳐 **좌우 분리 확정**(`prBandHtml`+`BAND_PAY_GRID`/`BAND_DED_GRID`): 좌=지급 블록(5칸×2단), 우=공제 블록(4칸×2단), 그룹헤더(지 급|공 제)+라벨 2단, 2단째 층 진한 톤(grp-*2)·0원 흐림(`.z`). 직원당 2행·신원/실지급/상태/액션 rowspan=2·폭 1440px=가로스크롤 없음. 인쇄=동일구조(UI열 제외)·CSV=평면 전체컬럼. Playwright+apex 마커 검증. ⚠️apex 전파 ~수십초 지연 관찰(직후 grep 구코드→8초 후 신코드). +급여·4대보험 자금계획 (N명) 합산 표기(`f76dcba7`, prod `4f036e58`).

- **✅ [2026-07-02] 자금계획 달력 카드대금 + bank 드롭다운 가림 (prod `bc686bfc`, 커밋 `0bcee65a`·`a57c4c84`)**: ①달력 `/schedule/calendar`가 cash_schedule 물질화 행만 읽어 카드 결제예정 등 온더플라이 전부 누락 → `buildCashflowDays` 재배선(엔진 Phase3 완결). `carryOverdueToStart:false` 신설=월뷰는 연체를 원래 예정일에 표시(forecast는 기존 from 끌어옴 유지). 프론트=pill 한글라벨+추정 `~`, 일자 상세 모달을 달력 데이터 기반 전환(물질화=완료/삭제, 온더플라이=자동/추정 배지), 연체 KPI 물질화만 집계. 검증=로컬 시드 카드(7/25 125,889=실적+AVG_3M)·forecast 합계 일치. ②bank 매칭 드롭다운: `.ds-table(-striped) tbody td{overflow:hidden}`이 셀 내 절대배치 드롭다운 클리핑 → 매칭 td `ds-wrap` + `positionTxDropdown`(하단 공간부족 시 위로 플립, 인라인 스타일=Tailwind CDN 타이밍 비의존). 셀 내 드롭다운 패턴=bank 2곳뿐 전수확인. Playwright 첫/마지막 행·거래처 검색 검증. 배포=push→`--branch main`→apex 마커(SCH_TYPE_LABELS·positionTxDropdown)+페이지15 200+API13 401.

- **✅ [2026-07-02] 배송 시스템 P1~P3 — prod 배포완료 (push `ba255fc6`→main, dep `2f91a63e`, 마이그 0436·0437 remote 적용·검증)**: 스모크=페이지 14/14 200·API 16/16 401게이트·신규 라우트 5종 도달성 ✓ (콘솔에러 수집만 공유 Playwright 타 세션 점유로 생략). ※prod orders=1건(주문 모듈 실운영 전)이라 백필 0건 — 실사용 전 선제 정합화. 주문플로우·배송 전수분석(에이전트2) → 용준님 확정(출발지 10~20분·직배 일10건+·기사3~4명, 가안+①②). **P1 정합화**(`c849cee2`+마이그0436): `ensureShipmentForOrder` 헬퍼로 출고확정 전 경로(bulk-ship 전량/분할·대시보드ship·수동전이·sync무인·카드 단건/QR/일괄) shipment 생성 일원화 + `orders.shipped_at` 신설(백필+전이7곳 스탬프·취소 리셋) + /daily 송장/라벨 재표시 수정(미조인 버그) + 수신자주소 저장 + **PATCH /by-order/:orderId 신설**(주문ID 저장이 shipment PK 오매칭하던 잠복버그 제거) + dtMap 7종 정본화(utils/shipmentHelper). **P2 합배송 가시화**(`a19b4acd`): GET /consolidation-candidates(ADMIN·MANAGER, **명시적 cross-entity**) — 동일거래처×복수법인 + 권역(delivery_info `[12345]` 쿼리시점 파생, 자가배송 직배/용차/퀵) 후보 → /shipments 상단 카드 + 법인 배지. **P3 합포장**(`6242e9bb`+0437): `merged_into_id` 모델(행 유지·대표=정본), merge/unmerge API(같은 거래처+납품일 검증·체인 방지), 부속→대표 쓰기 리다이렉트, /daily 대표 상속(COALESCE), 후보 카드 묶기/해제 버튼. 검증=tsc·build·node --check·로컬 D1 실데이터(부속 상속/우편 파생/조인, 테스트행 정리). **후속 백로그**: ③동선 최적화(지도·경유 순서 — 직배 일10건+이라 가치 확인)·한진 반출엑셀 import·통합배송솔루션 계약(기결정 2026-06-11)·합포장 알림톡 dedup·'직배' sectionOf etc빠짐. 정본=[[project-delivery-system]]

- **✅ [2026-07-02] md 문서 전수 정리 (docs-only, 무배포)**: ①구 아카이브 32건+queue/done 6건+pending 중복 1건 삭제(git 히스토리 보존) ②완료/흡수/대체 spec 12건+bank-review → `docs/archive/` 이동(코드 주석·spec 상호참조 경로 7곳 동기 수정) ③`docs/INDEX.md` 전면 재작성(2026-06-10 이후 미등재 ~25건 해소) ④알림톡 템플릿 문서 stale 상태("실발송 0")→실발송 완료로 정정 ⑤repo `memory/session-context.md` 스테일 배너(정본=auto-memory). **유지 판단**: ARCHIVE 2종(다이어트 이관 싱크)·static-assets-rootcause spec(decisions-code 재외부화 금지 앵커). 잔여=IMPROVEMENT_BACKLOG.md 266K 다이어트(auto-improve 연동이라 미조치).

- **✅ [2026-07-02] 바로빌 통합포인트 표시 정합 + 법인별 senderId 통일 (prod `01bb23e8`, 커밋 `18343022`·`8dad40f7`)**:
  - **증상**: 설정→메시지 연결카드·자금관리(/bank)·세금계산서 연결테스트에서 통합포인트 **0원**, 미연결 법인(청주·오다플래그)은 **-10001** 표시. 실잔액 102,194원.
  - **근본원인**: 표시가 **회원사 지갑**(`GetBalanceCostAmount`)을 조회 — 동산=0(미충전)·미등록 법인=-10001(에러코드 노출). 실잔액은 **통합(파트너) 지갑**(`GetBalanceCostAmountOfInterOP`, CERTKEY 단위 공통·corpNum 무관)에만 존재. 라이브 SOAP로 확정(모든 corpNum에서 102194).
  - **수정 3곳 전수**: settings.js 연결카드(`remain_point`→`partner_point`, 단가 `unit_cost_alimtalk` 정정) · barobill.ts `/status`(자금관리, `getPartnerBalance`+음수 클램프) · barobillTax.ts `getBalance`(`partnerPoint:0` 하드코딩 해소, barobillSms 형제버그). 회원사 지갑은 어디서도 메인표시 금지.
  - **⚠️ 동시세션 WIP 얽힘 처리**: 워킹트리에 타세션 미커밋 **법인별 senderId 통일**(`getEntityBarobillSenderId`: bank/cardExpenses senderId 전역→entity_settings, 멀티법인 -24005 방지)이 있었고 배포·내 커밋에 엉킴(Edit "modified since read"가 신호). 완결·컴파일·이미 prod라 별도 커밋(`8dad40f7`)으로 정리 → origin/main 빌드정합 회복(force-push 회피). 교훈 → [[feedback-multi-session-deploy]].
  - 정본 → [[barobill-charge-balance]] ④⑤. **후속 확인**: senderId WIP 유지 여부(유익·유지 권장) / 담당 세션 진행 여부.

- **✅ [2026-07-01] 품목 마스터 대량 등록 + 바로빌 단가/포인트 + 주문 UX (마이그 0420~0434, 전부 prod·push)**:
  - **바로빌 메시지**: 파트너포인트 잔액 실조회(회원사 0·파트너 지갑=통합포인트) + 발송단가 알림톡/SMS/팩스 3종 표시(**부가세별도=GetChargeUnitCostEx÷1.1**, ChargeCode 라이브 확정). 팩스 동일버그도 교정. 정본 [[barobill-charge-balance]].
  - **솔벤캔버스**(0420): 제품+원단(127폭·20m·yd·ROLL)+연결. **솔벤 조명시트**(0425): SPT031M substrate화(yd·137폭·ROLL) + 출력제품.
  - **간판 사업부 자재 157**(0421 채널바류 95·0422 전기/구조 56): `원자재`+`sub_category=간판자재`·MATERIAL·NONE·매입전용. **변종=spec_group**(간판색상14×규격5). 매입기준(선명 매입내역).
  - **코팅지/원단 상품**: 조광 26(0424)·화진 27+프라임 24(0426) = GOODS·미분류·폭별(spec_group 코팅지폭). 도안지·조명시트 dual(LT/LC/SPT)·LW2800M 상품(0423). 머리띠(0427).
  - **변종 분리**: 복수규격→규격별(0428 깃발/액자 11변종)·부속품 다속성→조합별(0429, 25품목)·볼로프 4/5mm(0431)→원자재 dual 전환(0433). CPP 코팅지 상품 일원화(0430).
  - **주문 UX**: 생산주문서 '원자재 포함' 토글(기본=판매품만) + 품목관리 그룹뷰 **라인별 품목명** 표시.
  - **★C2 사용자별 사용품목 분리**(0432): `user_item_access(user_id,item_group)` + `/users` 품목배정 UI + 주문검색 `for_user=1` 필터. **규칙 없으면 전체노출**(default-open, Q권한모델 default-deny와 상반). item_group 단위.
  - **정리**: 비활성 stub 10건 하드삭제(0434, 참조0). 변종 모품목(spec_group 템플릿)은 보존(is_active=0). 로컬 발산 시 prod 직접적용.
  - **★남은**: 단가(전 품목 0, 매입 통해 차차) · 간판 BOM(설계선행 보류) · 볼로프 등 dual은 is_sales=1이라 주문검색 노출(C2로 사용자 제한 가능).

- **✅ [2026-07-01] git issues 5건 처리 + 일괄배포** (`d2ebed69`, prod, apex 검증):
  - #457 고아 `clientPrices.js` 삭제 · #468 CSV 자동수정 확인(닫음) · #467 연차 촉진/소멸 배너 항상 400 실패 → `GET /api/leaves/alerts-summary` 신설(ADMIN·MANAGER, 6조합 유니크+소멸 집계) · #466 메시지 단가 매 로드 SOAP 7콜 → 상수 정본화+`/unit-cost` 수동 새로고침(7→2콜) · #469 연차수당 주입 시 total/공제/net 인라인 재계산(과소지급 차단) · #465 Step1 bom_items split-brain 해소.
  - **#465 Step1**: 부족체크·주간발주를 신모델(`computeMaterialRequirements` 헬퍼, autoDeduct 산식·폭 초과 최대폭 분할 근사)로 재배선. `mrpCalculator.ts` 삭제 → bom_items reader 0. **Step2=#472**(print_events 실측으로 출력완료분 제외, brainstorming 선행).

- **✅ [2026-07-01] 자재명세(BOM) 페이지 신모델 재배선 — prod 라이브** (`9bd6c2ff`):
  - **문제**: 품목 신모델(product_materials) 도입으로 레거시 `bom_items` 기반 자재명세/MRP가 고립(0행·`material_item_id` 생산자(inventory 행PK)↔소비자(item_id) 의미 불일치).
  - **재배선**(용준님 결정 B+MRP 은퇴): 자재명세 탭 = `product_materials` 미러 **읽기전용 개요**(제품→자재+차감설정 ROLL/BOARD·폭/규격/로스율/단위, 카테고리 그룹·rowspan·검색). 편집 SSOT=items(원자재 연결) 링크. **자재 미연결 제품 경고**(prod 39건 — 인쇄해도 차감 안 됨 가시화). MRP/이력 탭·bom_items CRUD·`/mrp/*` 은퇴, `GET /api/bom/overview` 신설.
  - **✅ 후속 해소 (2026-07-01, #465 Step1 `d2ebed69`)**: weeklyPurchase·materialShortageCheck를 신모델(product_materials, autoDeduct 산식)로 재배선 + `mrpCalculator.ts` 삭제 → **bom_items reader 0(완전 orphan)**. Step2(print_events 실측 정확도)=후속 #472.
  - prod 검증(Playwright): 131 제품/연결92/미연결39·302행·콘솔0에러. 정본 → [[design-bom-overview-rewire]].

- **▶ [2026-06-30] 품목 미등록 갭 감사 + 판재 등록 (worktree `session/master-banner`)**:
  - **갭 감사**(에이전트, 원천 18,491라인 vs prod 371등록): 등록률 79%. **미등록 갭 6.4억의 본질=간판 사업부 전체**(채널·프레임·돌출·LED/SMPS·갈바·각관 ~900라인·3.19억, 마스터에 `간판` 분류 자체 없음). 그다음 게양/부속(~618·1.54억)·판재(~606·0.51억)·자재원단(~128)·상품(~78). **출력물은 사실상 전량 등록**(배너 마무리로).
  - **✅ 판재 dual 등록**(0412+0413): 포맥스·아크릴·폼보드·스카시·광확산PC·알마이트 × 두께 × **색상** × **사이즈**. **보드 MATERIAL 39**(원자재·BOARD·장·dual, **사이즈 변종**: 포맥스 3×6+4×8·스카시 3×6·나머지 4×8) + **UV 평판 출력 PRODUCT 29**(AREA·사이즈무관, 자작나무 패턴) + 링크39. prod 검증 39/29/39. 단가 보류. ★보드만 사이즈분리(UV는 운영 보드선택).
  - **✅ 게양/부속 하드웨어 GOODS 22**(0414·0415, ACC-029~050): 게양16(깃대5·까치발·꽂이·로프3·수기대·아연날개·황금봉·국기봉·대대기·멕기, item_group `게양 부속품`) + 현수막6(아일렛·인치밴드·큐방·쌍클립·족자봉·삼각접착고리, `현수막 부속품`). 단독 유통판매도 발생.
  - **✅ 깃발 제품 6**(0416·0417): 태극기 수기 2(30×20·45×30 나염) + 자수 3(정기·태극기정기·근조기) + 본염 정기 1. 태극기 분류·기존 호수깃발 패턴(PRODUCT·FIXED·매입+판매 외주·ROLL·차감없음). **★SET(수기대조립·자수삼발이)=깃발제품+부속 라인 모델**(완제품 SKU 없음=이중계상 방지). 깃대조립SET=기존 호수깃발+깃대 부속으로 커버.
  - **✅ 자재/원단·상품 18**(0418·0419): 자재/원단 MATERIAL(열전사원단·타포린·그라스화이바·원형나무·각목 + 200g코팅지 3(판매용·NONE) + 3M인쇄비닐 + SPM011M(무광·재고1롤 소진용)) + 상품 GOODS(좌우보필형 액자·A3자석액자·국기함3등급·청사초롱·탁상용국기·지퍼가방). **스킵**: 저밀도원단(기등록 동일)·LD59THG(LD59HTG 오타). (~~솔벤캔버스 미취급~~ → 2026-07-01 등록됨 0420)
  - **★남은 (2026-07-01 갱신)**: ①**간판 구성요소 BOM·조립견적**(설계선행 보류) — ⚠️간판 *자재*는 2026-07-01 등록 완료(0421/0422, 157품목), 남은 건 견적구조(BOM)뿐 ②**단가**(전 품목 base_price=0, 매입 통해 차차). 참고(보류): 가로기 깃발(품목 자체 없음=오탐 확인)·미러천(취급X). 태극기/근조 본염·복수규격은 2026-07-01 규격별 분리 완료(0428).
  - **세션 누적(0398~0419)**: 배너 출력8형+형옵션범용+부속18 / 판재 보드39+UV29 / 게양·현수막부속22 / 깃발제품6 / 자재·상품18. = **즉시등록 영역 사실상 소진**. (worktree `session/master-banner`, 매 단계 prod 적용·검증·push)

- **✅ [2026-06-29~30] 품목 마스터 배너류 등록 완료 (worktree `session/master-banner`)**:
  - **✅ 출력 배너 6종(9품목) 등록+자동차감+형옵션 prod 라이브** (마이그 **0398~0407**): 윈드/워킹=전사 폰지·매쉬(**0405 정정** — 니트 아님) / 실내·미니=수성·패트 / 자이언트=전사 폰지·매쉬(2제품) / 솔벤패트=솔벤·나투라(0406). 전부 AREA·is_active=1·매입X.
  - **✅ 원단 자동차감(폭매칭 ROLL)**: 9제품 전부 product_materials 링크(0404/0405/0406) — 폰지5·매쉬2·패트4·나투라2.
  - **✅ 형(S/F/H) = 범용 선택옵션 메커니즘**(0407 + finishing/calc/parent.js): pp_category 비하드코딩→일반 select 자동렌더·수집·복원. 윈드 S/F·워킹 S/F/H 게이팅. **향후 선택형 옵션은 마이그(데이터)만으로 추가=코드불요**(코팅·WAY 이은 3번째 패턴 일반화). prod API 검증(윈드 2·워킹 3 반환·자이언트 0). dep `fb45ea0f`.
  - 결정: 배너=출력 PRODUCT + 거치대=부속 GOODS 라인 / 형=주문옵션(범용) / 규격=AREA / 가로등=규격확대 / 실외·철제=물통SET GOODS.
  - **✅ 태극기배너(TRTB)·외국기배너(TRFB)** 등록 완료(0408, 전사·AREA·폰지·자동차감). 배너 출력물 8종 전부 등록.
  - **✅ 가로등 규격확대**(0409, 60×160 폰지/매쉬·변종4→6) + **✅ 부속품 GOODS 18종**(0410·0411, ACC-011~028, 상품·매입+판매·item_group='배너 부속품'). 철제배너=판매내역 기반 3 SKU(실외거치대/실외물통SET/실내거치대). 걸이부속(족자봉/삼각접착고리)=현수막 도메인 제외.
  - **배너 전체 완료** — 출력 8종+자동차감+형옵션·가로등확대·부속품18. **남은=단가(전역 보류, 별도 과제)만.**

- **✅ [2026-06-26→06-29] 현장 잉크 재고관리 + 단위 SSOT/multi-UOM — prod 라이브 (정본 `memory/design-ink-inventory.md`)**:
  - 잉크 **74품목** 등록(마이그 `0394` **prod 적용**·동산72/선명6·수성잉크테크 LcLm=선명 매출 2). `item_type=MATERIAL`·`unit=L`·`deduction_method=NONE`(수동, 차감X)·코드 `RM-I0001~0074`(자동채번 규칙, 의미코드 금지=채번 깨짐). **장비별 분리**(같은 KM테크라도 솔벤1800/3200 별도·UV평판≠3200).
  - **단위 SSOT 신설**(`constants/units.ts`, hr.ts 패턴)+폼 input→select. ⚠️yd(ROLL)·장(BOARD)=autoDeduct 리터럴, 변경금지.
  - **✅ [2026-06-29] multi-UOM 단위 드롭다운 = prod 라이브 (이전 "미배포 보류" 해소)**: 타 세션이 MU1~MU5(items.base_unit/pack_size/stock_mode SELECT)를 main 커밋 → cashflow 세션 superset 배포로 prod 반영(한때 0395 미적용 500 장애 → `0395 --remote` 복구). factory P3(0391/0392/0396)도 그간 prod 적용(smoke facility/zones 200) → **얽힘 무관**. prod `#itemUnit` 9단위 라이브 확인·**smoke101**.
    - **orphan `UNITS_JS`(window.UNIT_DEFS) 주입 = 폐기**: SSR `unitOptions` 방식 채택으로 클라 주입 소비처 0건(死코드). `wip/multi-uom-unit-ui` 브랜치 삭제(2026-06-29). 복구 필요 시 commit `19868226`(`git branch <name> 19868226`).

- **✅ [2026-06-26] 공장 배치도 P0~P2 — 장비 공정·구역·도면배경 (정본 `memory/design-factory-layout.md`, spec `docs/superpowers/specs/2026-06-25-factory-layout-integration.md`)**:
  - 공정 SSOT **확정=items.category 1:1 6종**(AQUEOUS/SOLVENT/UV/TRANSFER/SUBLIMATION/SIGN, 평판=UV흡수·나염=태극기, 사용자 결정) `src/constants/process.ts`+layout 주입.
  - **P0**: 마이그 `0389_equipment_processes`(M:N·FK없음)·`PUT /api/rip/equipment/:id/processes`·GET/PUT equipment에 processes+zone_id·편집모달 공정 다중지정+구역 select+ID접두사 추천(EPSON→솔벤·FLEXI→전사).
  - **P1**: 배치도 동적 구역bounds(prod=%좌표=장비와 동일계)·**도면배경 R2**(POST multipart/GET-image blob/DELETE, base64 폐기)·편집모드 업로드.
  - **P2**: 핀 대표공정 색상점·공정필터 dim·팝오버 공정배지+출력이력(`/production?equipment_ids=` 딥링크)·구역요약 공정.
  - **+90°회전**: 마이그 `0390` `equipment.layout_rotation`·편집모드 팝오버 "90°회전"(0/90/180/270 순환·영속)·position PATCH 부분업데이트 리팩터. 커밋 `e7eefa35`·dep `8adc578d`.
  - 검증: tsc0·build·**smoke 101/101**·Playwright(로컬+prod). **prod 배포·push 완료**(커밋 `68c7a41c`+`e7eefa35`·dep `8adc578d`·마이그0389·0390 remote).
  - **✅ 운영 적용완료**(DB UPDATE, 코드무관): 23대 공정·구역·위치 배정 / HSM 13대=현수막실·수성·1.8m / IP 일괄반영(0.x 20대·127.x 3대 비움) / **배치도 사용자 레이아웃 기준 정렬**(★격자 강제 금지 교훈, align/restore SQL) / TPM ID 재배정(TPM-01→TOPM-01·PC A→TPM-01·PC B 유지+이벤트 재귀속). 도면 이미지만 미업로드.
  - **다음=P3~P5 재고게이지**(재고 데이터 정책 합의 후, 별도 세션).

- **▶ [2026-06-26] LogWatcher 후속 (정본 `memory/project-logwatcher-rollout.md`)**:
  - **EPSON 취소/실패 파서 — 보류**(커밋 `89097982` push): SqliteDbParser `PrintStatus="OK"` 하드코딩 → status-aware 개조(`status_column`+`status_cancel`/`status_error` 매핑, query `LEFT JOIN Log`+`JobStatus IN(종료)`). ⚠️EPSON Edge JobStatus enum 비공개 → **13/14 임시추정·실코드 EPSON PC `Data.db` 확인 대기**(`SELECT JobStatus,COUNT(*) FROM Job GROUP BY JobStatus`) → 확정 후 equipment.json + EPSON 2대 재배포.
  - **교훈**: 장비ID=현장 appsettings EquipmentId(변경=현장 재시작이 본질)·하트비트 자가치유는 agent/ip/log만(이름·설정·과거이력 잔존→수동 재귀속)·GetLocalIp 첫IPv4=dual-NIC 127.x 오보고.
  - **선명 CAPS 6/1~8 복구완료** 29/30(사용자 SM PC 런북 실행, 검증=prod 조회). 잔여=이희섭 6/8 출근펀치 누락 1건. 6월 선명 급여 생성 시 재계산 필요. ([[caps-backfill-recovery]])

- **✅ [2026-06-25] IA 편집기 Export-first — 주문 없이 가공 EPS 추출·다운로드 (정본 `memory/project-ia-editor.md` 맨 끝, spec `docs/superpowers/specs/2026-06-25-ia-editor-eps-export.md`)**:
  - 목적: IA 편집기를 무거운 주문통합(주문·카드·청구 생성) 없이 **"가공 EPS 뽑는 가벼운 도구"로 먼저 활용**. **두 경로**: 파일처리 탭=그룹 1개씩 후가공 가공 / 대지편집 탭=네스팅 → **EPS+JPG+DXF 브라우저 blob 다운로드**. 주문/카드/재고 미생성.
  - **에이전트 3팀 병렬 구현**(파일분리 무충돌): `workbench.ts`+마이그 0386(신규 `ia_process_jobs` 큐 + 엔드포인트 7) / `Program.cs`+`ProcessOrderItem.jsx`(R2업로드·PollProcessJobs·DXF/JPG export) / `iaEditor.js`(blob다운로드·EPS출력·가공버튼). **핵심제약**: CF 워커가 NAS 못읽음 → R2 왕복(에이전트 업로드→워커 blob 서빙).
  - 검증: npm build·dotnet build0·**smoke 101/101**·apex 7엔드포인트 401(도달성). **prod 배포·push 완료**(커밋 `c133d8a8`, dep `87b34e47`, 마이그 0386 prod).
  - **✅ 에이전트 라이브 + prod 실파일 E2E 완전통과**(에이전트 커밋 `f527a3d4`, PID 28180): ★운영=**서버PC=일러PC(이 작업PC)**, IA exe는 로컬 `bin/Release/net8.0/win-x64/publish/`(appsettings ErpApiUrl=prod). E2E(업로드→분석→가공→R2→download): EPS(c5d0d3c6)/DXF(SECTION)/JPG(ffd8) 200·시그니처 정상. **E2E가 3버그 발견·수정**: ①process 경로 `NormalizeArtboardEpsName` 누락(suffix→EPS 못찾음) ②multipart 한글 filename→CF formData 실패 ③**.NET MultipartFormDataContent를 CF Workers formData()가 500 거부→curl.exe -F 우회**. ⚠️CF Pages observability/tail 제약→직접 INSERT·curl 재현 진단. 정본 = `memory/project-ia-editor.md` 맨끝.
  - **✅ P1 실사용 개선 6항목** (실효성 점검 후속, 커밋 `9db24ef9`·dep `67f2cba6`·에이전트 PID 11564·smoke 101/101): 용준님 실효성 의문 → **에이전트 팀 5축 점검**(Workflow) → P1 전체. ①파일처리 돔보 토글 ②네스팅 W·H 비율잠금 ③**가공 이력 보드**(GET /process 목록+영속 재다운로드, critical 해소) ④복제수 오해 차단 ⑤파일배율 전스택 ⑥**90°회전 silent drop 제거**(jsx 아트워크 회전). prod E2E: baseline 196×560 vs 회전90+돔보 995×343=**종횡비 swap 회전 정확**·돔보 마크·이력·다운로드 200. 점검이 찾은 진짜 갭=이력재다운로드·일괄처리·회전. **남은=P2**(다중그룹 일괄+ZIP·heartbeat·실렌더 미리보기·배치 예상치·돔보 형상일치·RESIZE 0.1cm)·**P3**(Export→Order·MaxRects·회전토글·스냅·커스텀규격·평판 다중판). spec `2026-06-25-ia-editor-p1-improvements.md`. ⚠️이력 width_cm=0(P2 보강).
  - **✅ P2+P3 전체 13항목** (점검 후속, ULTRATHINK 3라운드, R1 `7c1e02a5`·R2 `093ff13f`·R3a `e41555dd`·R3b `adb4ab44`·dep `ee82f279`·smoke101·에이전트 PID 9092): **R1(P2)** 다중그룹 일괄+ZIP·진행가시성(heartbeat·agent-status·retry)·실렌더 미리보기(jsx preview)·배치 예상치·돔보 형상일치·0.1cm 정밀도·좌표 일원화·width_cm 보강. **R2(P3안전)** Export→Order 브리지·커스텀 규격/프리셋·파일명 규칙·회전허용 토글. **R3a(저위험)** 드래그 스냅·고급 후가공(도련/펀칭/주석). **R3b(고위험·격리 회귀0)** MaxRects 토글(shelf 미변경)·평판 다중판 잡분할(SheetLayout 무변경). E2E: agent online·preview·width_cm·단일가공 회귀0. spec `2026-06-25-ia-editor-p2-p3.md`. **점검 15항목 전부 완료**.
  - **▶ [2026-06-26] 실사용 피드백 7건 → 후속 spec `2026-06-26-ia-editor-followup.md`(다음 세션, 미착수)**: **W1**(긴급) Z 배포동기화+단일에이전트(★용준님 운영=`Z:\…\publish` 구버전6/19라 가공 안보임=진짜원인, 기능은 새버전이 처리해 정상. 에이전트 2개 동시실행 위험) · **W2**(높음) DB정리(ia_process_jobs 누적·jpg_base64 비대→R2분리+미리보기TTL) · **W6** 규격채우기 제거 · **W4** 전체가공 자동ZIP · **W3** 파일배율 의미재정의(÷→× brainstorming) · **W5** 대지편집→orderForm 네스팅 활용 · **W7** 재단선=돔보 연동(trim일때만 재단선·DXF 생성). 우선순위 W1>W2>W6>W7>W4>W3>W5. ✅에이전트 2개 종료(2026-06-26, 다음세션 W1 Z단일 재기동).

- **✅ [2026-06-24] 연차관리(/leaves) 제안서 + P1 정상화 배포 (정본 `docs/superpowers/specs/2026-06-24-leave-management-proposal.md` + `memory/project-leave-management.md`)**:
  - 에이전트 팀 5축 병렬 감사 → 제안서. **P1(보안·통제) 6건 구현·prod 배포**(커밋 `291cb392`, dep `5af043ab`, 롤백 `7da7ff4d`): B1 `/unused-allowance` IDOR(entityFilter·bank#1 동일클래스) · B3 POST·DELETE /requests requireRole(위조차단) · B2 approve 잔여검증(음수방지) · B5 cancel-approved 신설(잔여복원+근태해제, status=CANCELLED) · B7 approve batch원자화 · B9 전역 showPrompt 모달.
  - **Playwright 검증**: B1 200·B3 400(403아님)·B5 404핸들러·B9 모달 입력반환 ✓ (prod 휴가신청 0건이라 B2/B5 실데이터 미발생 — 로직은 build+검증). 
  - **D1~D6 확정**(입사일·소멸+촉진·직책수당·신청승인·전법인적용). **P2-1~3 구현·prod 배포**(커밋 `d69cd7a5`, dep `65e81674`, 롤백 `11e38ea2`): ①소정근로일 차감(주말+공휴일, Playwright 7→5일 ✓) ②통상임금 수당(포괄임금 calcInclusivePay 분해+직책수당, 검증 ✓) ③KST 적립.
  - **P2 후속 W1(26일 병존+만료인프라) 배포·검증 완료**(2026-06-25, 커밋 `08a3bbcc`, dep `b2a2f3c1`, 마이그 0383~0385): 월차 leave_type='MONTHLY' 분리·합산·차감 FIFO·만료일. **안전게이트=prod 잔여 628 완전보존**(ANNUAL488+MONTHLY140), API/UI 검증. 설계=`docs/superpowers/specs/2026-06-24-leave-promotion-expiry-design.md`.
  - **P2-W2 촉진 통지+소멸 sweep 배포·검증 완료**(2026-06-25, 커밋 `9da0a5b1`+`f74fbc8f`, dep `a504f6a4`): `/promotion/run`(입사일 기준 1·2차 윈도우→이메일 통지+이력) · `/expire`(촉진 적법분만 소멸, 미이행 제외) · 사용촉진 모달+소멸 버튼. 검증=dryRun MONTHLY_B 2차 실제 3명·이메일없음 플래그·alias 500버그 수정.
  - **연차관리 = P1+P2(1~3·W1·W2) 전부 prod.** 남음: ⑤80% 출근율 게이트 · 미사용수당→payroll 자동주입 · 알림톡 템플릿 활성화(바로빌 승인)·발송 운영. P3 셀프·알림 / P4.

- **✅ [2026-06-24] 전 페이지 표 열폭 규격 일괄 정비 (에이전트 팀, 정본 `memory/project-table-spec-sweep.md`)**:
  - 전역 `col-*` 폭 유틸 신설(shared-styles.ts) + 12클러스터 fan-out으로 **~101개 표 정비**(ds-table 보장+콘텐츠 유형별 고정폭+가변 주열만 흡수+긴 td `title` 호버). 인쇄양식·편집그리드·동적matrix·밀집표 의도적 제외.
  - 검증: tsc/build green · **node --check 55/55**(?raw JS 문법) · **Playwright 시각검증 6페이지**(clients/reports/shipments/hr/inventory/purchase-orders: fixed·오버플로0·콘솔에러0·title동작, 측정스크립트 정밀). 
  - **유일 결함=col-date 104px 14px폰트 날짜 3px클립 → 112px 전역수정**. **prod 배포**(`3a64af56`+`8d3fc9da`, dep `01ce3db0`, 롤백 `47fbec9e`). bank 리뷰처럼 백로그 완결.

- **✅ [2026-06-24] Claude Code 셋업 정비 + bank 보안/버그 수정 (별도 세션 — 정본 `memory/project-ship-pipeline.md`)**:
  - **CC 셋업**: 죽은 jq훅→node 전환(`.claude/hooks/*.cjs` + SessionStart 자가진단) · `/ship` full-auto-prod 파이프라인(skill+ship:gate) · MCP(context7 + cloudflare-observability, 옛 cloudflare 제거) · 권한정리(통짜Bash 제거) · STATUS 다이어트 · **claude update 2.1.158→2.1.187**(agent teams 활성, **재시작 필요**) · env `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`. 훅 경로버그(.js 오탐) 수정.
  - **bank 버그(3에이전트 병렬리뷰)**: ✅**#1 IDOR**(card_fee_rates PUT/DELETE entity격리, #437/#434 클래스) · ✅#2 dead `/card-fee-calculate` 삭제 · ✅**#3 auto-match 파생잔액 복원**(폐기 clients.balance→deriveClientBalance; 가드=입금만·유일잔액만·suggest전용) · ✅#5 D1 IN 80청크 · ✅#8 KST 월경계. **전부 prod 배포·검증**(커밋 f29a266b·06c4b653·5f8793c2 → dep e9c1155d). ✅**#4 client-search 파생잔액 복원**(폐기 c.balance=0→order_billing_groups[BILLED]−payments−adjustments, /receivables 동일정의; FE 미수금 힌트 부활·FE 무변경) · ✅**#7 /transactions bt.\* → FE 소비 컬럼 명시SELECT**(리네임 시 silent null→SQL에러 노출). **prod 배포·검증**(커밋 4d2f3fdb → dep `5c1fa54c`; apex /transactions·/client-search 200, 파생잔액 /receivables와 일치=현재 미수금 0건). #6 변경불요. **bank 리뷰 백로그 완결.** + `/ship` 가드 정식 추가(배포 전 git status, SKILL.md).
  - ⚠️**교훈**: `deploy:prod`는 워킹트리 전체 빌드 → **배포 전 `git status`로 타세션 미커밋 확인 필수**(IDOR 배포 시 cardExpenses WIP 동반배포됨). agent teams=**v2.1.178+** 필요(2.1.158 미작동). observability wrangler config=**Pages 미지원**(347e438e 되돌림, 대시보드 토글 경로). bank 잔여 리뷰=`docs/archive/bank-review-2026-06-24.md`(완결·아카이브).

- **🟢 [2026-06-24] LogWatcher TPM-01 현장 배포(TopazRip)**: prod·`E:\TNSRip-X1\Print.log`·Legacy(TNS)·`TPM-01`. 추출 정상(사용자 확인). ⚠️검증=**`/equipment`·`/production`** (/rip 페이지 폐기·404). 함정=repo `install-service.bat`·`install.bat` **LF 줄바꿈**→cmd 명령 토막 → `publish\install-service.bat`만 CRLF+ASCII 수정, **소스 LF 정리 보류**(나중에). RIP-03 `/equipment` 비활성화(soft delete=status INACTIVE)→동일 PC RIP-02 전환 깨끗(부활X). 정본=`memory/project-logwatcher-rollout.md`.

- **🟢 [2026-06-23] 품목 마스터 신모델 등록 (정본 = `memory/session-context.md`)**:
  - 신모델 = **분류8 + 인쇄방식별 개별제품 + 폭/규격별 원단 + product_materials + autoDeduct(차감방식 구조화)**. 단가 전부 0.
  - 등록: 수성**10**·솔벤8·UV**21**·전사11·태극기33(나염) 제품 + 원자재 다수그룹. **마이그 0336~0378 prod 적용·고아0** (출력물 0360~0378 = 가로등배너·랩핑·솔벤텐트·UV엠보/클리어/뽀닥/고휘도·유통시트·UV투명·조명시트generic·수성어깨띠·백릿). 제품~83·소분류 100% 매핑(정확수치=아래 항목별).
  - **[2026-06-23] 가로등배너(0360)+랩핑시트(0361) 등록**: 원천주문 동산3파일 15,943라인 분석→prod 대조→미등록 출력물 추천. ①**가로등배너**=전사 직접출력, 폰지/매쉬 × 60×180/60×150 = **4규격변종(FIXED, 호수변종 방식)**, 출력물 단독(배너대=주문 추가라인), 원단 깃발 공유. ②**랩핑시트**=솔벤·UV **공용매체**, 원단 LD59HTG 137단일폭, AREA. ③**솔벤텐트천**(0362)=공용매체(수성텐트천과 텐트천 원단 공유), AREA. ④**UV엠보시트**(0363)=원단 EP115(100/122폭), WAY=출력옵션(변종X). **★EP115 dual→출력 없이 재단만 판매 시 원단 직접 주문라인**(별도 품목 불요). ⑤**UV클리어필름**(0364)=원단 클리어필름(127/152폭, 중국산 코드없음), UV전용. **Tier1 전부 완료**(그레이후렉스=비조명후렉스→등록불요).

- **🟢 [2026-06-23] 후가공/소분류 선택 UI 서브프로젝트 (brainstorm→Phase별)**:
  - 발견: 인프라 거의 완비(finishing.js `loadItemPP(subcat)`가 items.sub_category 텍스트로 후가공 게이팅, 기존옵션 이미 연결). **진짜 블로커=신모델 제품 sub_category 미설정**(0). 코팅만 UI 분기 없음.
  - **✅ Phase1 완료(0365·0366 prod)**: 75제품 전부 sub_category 부여(미지정0) — 현수막13·시트8·후렉스5·평판5·가로등4·태극기33 + **신설'깃발'7**(전사 깃발/만장기/어구실명제). 깃발↔마감·하도매·부직포·수술 연결. 윈도우필름(엠보/클리어)→시트. Playwright 검증(솔벤시트→시트→펀칭/주석/오프셋 게이팅 작동). 기존 후가공이 신모델 제품에 즉시 작동.
  - **✅ Phase2 완료(0367+코드3파일, dep `eab88296`)**: finishing.js **coating 분기**(무광/유광 select, 면전체) + calc.js 수집 + parent.js 복원 + PP-COAT-M/G↔'시트' 소분류 연결. Playwright 검증(시트 제품→코팅 select 렌더). 출고 시 코팅지 폭매칭 자동차감(엔진0352) 발동조건 충족. 코팅=시트만 연결(현수막/후렉스 필요시 확장).
  - **✅ Phase3 완료(0368+코드3파일, dep `cd886a2c`)**: WAY=`print_layer` 옵션(1/2/3WAY, 차감없음) + **'윈도우필름' 소분류 신설**(엠보·클리어 시트→이동, 시트 후가공 복사·코팅 제외). WAY는 윈도우필름만 노출(일반 시트 누수0). finishing/calc/parent print_layer 분기. Playwright 검증(윈도우필름→WAY·코팅X / 일반시트→WAY X·코팅O).
  - **✅ 켈/합성지/패트 코팅 완료(0369·0370, dep `1f68b782`)**: 새 **'수성미디어' 소분류**(0370에서 '합성지'→개명; 켈·켈그레이·합성지·합성지그레이·패트 — 현수막13→8) + 전용 **코팅지 9SKU**(**무광 120g-호홍 4폭·무광 180g-호홍 4폭·유광-호홍 127**, yd·ROLL·폭매칭, 롤길이 spec; 0370에서 제조사 호홍 표기=item_name+item_group+PP material_item_group 동시) + 코팅옵션 3종(무광120g/무광180g/유광→각 코팅지그룹)→수성미디어만 연결. parent.js 코팅복원 일반화(`PP-COAT*`). 시트 코팅(SPP031)과 완전 분리. **평량(120/180)·광택은 차감자재가 달라 별도 그룹·옵션 필수**. Playwright 검증(수성미디어→3코팅+펀칭/주석 / 시트→SPP031 2코팅 분리, 차감키 4/4/1 매칭).
  - **소분류**: 태극기33·현수막8·깃발7·시트6·후렉스5·수성미디어5·평판5·가로등4·윈도우필름2·뽀닥2·고휘도반사2.
  - **✅ [2026-06-23] 출력물 누락 감사 + UV뽀닥·UV고휘도반사 등록(0371)**: 원천 4파일 936 distinct 대조. **UV뽀닥**=직물형/호일형(137·30m) 원단별 제품2 / **UV고휘도반사**=프리즘반사시트 백색·노랑×94·122폭(50yd), **색상=차감엔진이 폭으로 못 고르므로 색별 제품+원단그룹 분리**(백색제품→백색원단). 순수데이터(배포불요), 고아0, UV15→19·제품79/활성235.
  - **▶ 남은 미등록 출력물** (2026-07-01 대거 소진): ~~①조명시트(0425·솔벤조명시트+LT/LC/SPT 원자재)~~ ~~③솔벤캔버스(0420)~~ ~~④머리띠(0427·어깨띠는 0377)~~ 등록완료. ②백릿/와이드컬러=기등록(0378 수성백릿 커버)·⑤배너류=0398~ 등록완료. 출력물아님: PVC=켈원단·열승화폰지=폰지원단(등록됨). 뽀닥/고휘도 후가공 미연결(다이컷 등 필요시). **실질 잔여 없음**(배너/판재/코팅지/간판자재 등록완료).
  - **✅ [2026-06-23] 유통 시트 등록(0372)**: 사서 파는 시트=dual(매입+판매), 판매=주문 라인 직접선택. **LC2000(보조시트100)·SPE030A(옥외랩핑137)=상품(GOODS, 출력X 순수판매 — 상품 카탈로그 첫 등록 0→2)** / **SPC031G(투명시트 105/127/137/152)=원자재 dual**(전폭 판매+출력 137). **SPC031G 출력=UV 투명시트(0375, 137폭만 연결)**. **조명시트=generic 1종(0376, JMS-GEN, 매입기록용)** — 간판제작 소비자재, 색상별 재고는 간판BOM 구축 시 확장(결정 '가').
  - **✅ 수성 어깨띠 등록(0377)**: 부직포 수성출력. 원단 부직포 5폭(60/90/127/152/180·50m) + 제품 수성 어깨띠(소분류 '어깨띠' 신설). 머리띠=2026-07-01 등록완료(0427·AQ-HEADBAND). 수성 8→9.
  - **✅ 백릿 등록(0378)**: 수성/UV 다른 원단(공용X). 수성 백릿→수성백릿-호홍(90/127/150·30m) / UV 백릿→멀티백릿-호홍(127·30m). 와이드컬러(백릿)=수성백릿 커버. 수성9→10·UV20→21.
  - **다음**: 솔벤캔버스 · 배너류 · 단가 · (머리띠·간판 BOM).
  - **공용매체**(솔벤·UV 둘 다 출력)=제품 분리+원단 공유(폭매칭 정합). **나염깃발**=PRODUCT(매입+판매+생산,호수별). **전사 직접출력**=깃발/만장기/어구실명제.
  - **★`deduction_method`(0359)**: ROLL(폭매칭+yd)/BOARD(판재 면적→장,sheet_spec ㎡환산)/NONE. autoDeduct 일반화. 신규 판재=등록+연결만(코드0). 자작나무 BOARD 적용·e2e검증.
  - 분류탭 묶음표시(item_group)·검색 폭뱃지·원단 규격(spec) 식별. 후가공(코팅) 차감엔진(0352, 선택UI 보류).
  - **다음 TODO**: 단가 · 소분류/후가공 매핑(코팅 선택UI) · 간판 BOM · 상품 · 다른 판재(아크릴·포맥스 등 BOARD) · 미등록 출력물.

- **✅ [2026-06-23] 발주(PO) 라인 원단 폭 표시 — 수정·prod 배포·검증 완료 (dep `7835937e`)** *(▶ 코드/마이그 untracked — 커밋 필요)*:
  - 문제: 원단 품목명엔 폭 미포함(설계) → 발주 **저장/재로드/인쇄 시 폭 누락**(`purchase_order_items`에 specification 컬럼 없음, item_id로만 고정). 입력 중엔 보이나 저장 안 됨.
  - 방식 = **품목마스터 파생**(저장 아님, 마이그 X). `item_id`가 폭을 이미 고정하므로 GET 시 JOIN으로 폭 조회 표시. 입고검수가 쓰던 방식과 통일.
  - 수정 6: 백엔드 2(core.ts GET /:id + po-queries `/:id/invoice`에 `i.specification AS item_specification`(+invoice엔 items JOIN)) / 프런트 4(편집로드 규격칸·상세모달 뱃지·입고모달 뱃지·**발주서 인쇄** `폰지 [85cm]`).
  - **★부수 발견·수정**: 발주서 인쇄 페이지(`purchaseInvoice.js`)가 독립 HTML이라 `formatKST`·`escapeHtml` 전역 없어 **렌더 전체 실패 상태였음(2026-06-09 KST 리팩토링 회귀, prod 라이브)** → 두 헬퍼 로컬 폴백 정의로 복구.
  - 검증: build/tsc green, 백엔드 JOIN 데이터(폰지→850·"85cm"), Playwright 로컬(동일번들) 상세 "폰지 85cm"·인쇄 "폰지 [85cm]" 렌더 확인. prod 원단 spec/폭 보유 확인. 미커밋(코드 5파일 + 마이그 0360·0361 untracked).

- **⚠️ (정정 2026-07-01 — spec_groups 테이블·변종 방식은 **현행 정본**이며 이번 세션 대량 재사용: 간판자재/코팅지/깃발 0421~0432. 단 아래 "규격그룹 관리 UI·자동생성 엔진"은 미사용 — 변종은 마이그레이션으로 직접 INSERT. 정본=session-context) 🟢 [2026-06-21 PM] 품목 대개편 인프라(Phase 2~3) — 규격그룹 관리 + 변종 생성 엔진**:
  - **신규 API**: `src/routes/specGroups.ts`(`/api/spec-groups` 그룹·값 CRUD) + items.ts `POST /:id/generate-variants`(멱등·안전3규칙)·`GET /:id/variants`·`GET /variant-bases`·`GET /group-stats`. PATCH 허용필드에 `spec_group_id`·`spec_value` 추가, GET /:id에 spec 컬럼 추가.
  - **신규 페이지**: `/spec-groups`(pages/specGroups.ts + scripts/specGroups.js) — 그룹·값 CRUD + **변종 생성 모달**(값 선택→생성) + **base 품목 연결/해제**(기존 품목에 spec_group_id 지정). 메뉴(기준정보) + 권한 마이그 **0330**.
  - **검증(Playwright E2E·로컬)**: 그룹3 렌더(판재두께 25품목·호수 41품목)·호수 base7+변종 모달13체크박스·**멱등(태극기 skip3)·신규생성(만국기1호 created1) 검증 후 정리**·연결/해제 PATCH 양방향 정상. **smoke 103/103 회귀0**. 빌드·타입체크 클린.
  - **★다축(multi-axis) — 게양방식 (마이그0331)**: 용준님 결정=게양방식 별도 규격그룹·호수×게양 2축. `items.spec_group_id2`·`spec_value2` 추가, generate-variants **2D 카테시안**(변종코드 `{base}-{값1}-{값2}` 예 P-0033-7HO-GY), spec-groups bases 축2 인식, 변종모달 2D 그리드(호수13×게양4), 품목연결 축2 자동, `include_inactive`(staged base 검색). **로컬 E2E**(태극기 7호×게양용/구게양용 생성·멱등·모달13×4 검증 후 정리).
  - **✅ prod 배포·푸시·검증 완료**: 커밋 `a877f727`(인프라)+`c8e027cf`(다축), 봇11 merge `2cd570cd`. 마이그 **0330·0331 prod 적용**(execute --remote). web dep `b03b3942`(`--branch main`). origin/main 정합(0/0). prod 검증=`/spec-groups` 200·API 401·규격그룹 4(판재두께·호수·원단폭·게양방식). smoke 103/103.
  - **보류**: #4 주문 2단 picker(핵심경로·전품목 staged라 효과0·활성화 정책 의존, 백엔드 variant-bases·/:id/variants 준비완료) / #5f BOM 자재차감(자재 분리방침 선행).
  - **▶ 용준님 결정 완료(2026-06-21)**: ①자재=**매입/판매 별도 품목 분리**(⚠️[[design-item-role-multi-flag]] dual-flag 정본을 go-forward로 뒤집음) ②변종단가=**0원 보류** ③게양방식=**별도 규격그룹(다축)** ✅구현·배포 ④원단폭=**보류(후순위)**.
  - **▶ 다음(데이터 작업)**: ①누락 자재 ~167 등록(매입/판매 별도·`품목마스터/` 원천+build 스크립트, 단가0) ②게양방식 실제 호수×게양 combo 생성(용준님 조합 데이터) ③품목 활성화(is_active=1) 시점 결정 ④단가·원단폭(후순위) ⑤활성화 후 #4 picker·#5f BOM.

- **🟢 [2026-06-21] 품목 등록 진행 — 규격그룹 스키마(0326)+변종 전개(0328 판재두께·0329 호수)+단순제품64(0327) prod staged. items 0→123(변종53, is_active=0). 모델·코드체계는 아래 유지**:
  - **★진행 현황**: 마이그 0326(spec_groups·values+items 컬럼)·0327(수정본298 중 PRODUCT&주문1회+ = 64)·0328(판재두께 base6+변종19)·0329(호수 base7+변종34) **prod 직접 적용**(execute --remote --file). **변종=base별 실제 주문값만**(죽은변종 방지): 포맥스 1~10T·자작나무 6·9·12T·스카시 10·20·30T(두께체계 상이)·태극기 1~9호+4-1/7-1/8-1·깃발 3~8호. 단순제품·변종 전부 staged=라이브 미노출.
  - **★검증 결과(에이전트3, 코드기반)**: 6분류=item_type 3개+역할플래그(반제품없음 확정·무형 택배비6%=order_items.item_id nullable 자유입력). **단가·재고 구조 정확**(변종별 독립재고·base_price 독립·겸업 단일출처·단가 스냅샷). **자동화 4개 미구현**=생산시 두께/호수 자재차감(현재 width_mm만, BOM 필요)·주문 picker 2단·통계 GROUP BY item_group·avg_unit_cost 이동평균(0089 stale=기존결함).
  - **★분석**: 통합본609(동산_품목표준화_통합본.xlsx, 변종펼침1213) vs 298 = **506누락**(자재167·인쇄방식별출력195·변종조립80·비품목33). 수요(주문18,491 매칭92%): 파레토 **상위50품목=94%**·판매품 절반(0~2회)=매출6%·죽은품목=UV×소재×WAY조합(면적흡수로 정리). "외"패턴=18건0.1%(문제아님).
  - **모델 확정**: 규격그룹(spec_groups) → 변종품목 자동생성. **EAV 옵션-축·order_items 컬럼안 = 폐기**(재고 정확성=두께/호수/폭별 품목이 맞음). 변종품목=독립 일반품목(재고·단가·통계 per-variant), 그룹=생성·묶음·통계 메타데이터(인스턴스 비구속). 안전3규칙=①생성은 빠진조합만 멱등 ②변종은 생성후 자유수정 ③그룹값 변경=기존품목 무영향(스냅샷). 정본 spec=`docs/superpowers/specs/2026-06-20-spec-group-variant-item-plan.md`.
  - **코드체계 A 확정**: `{타입P/G/M}-{base순번4}[-{변종코드}]` (P-0001 / M-0019-5T / P-0033-7HO). 카테고리·인쇄방식 인코딩 금지(재분류 거짓말 방지), 변종값(불변)만 suffix 허용. `ecount_code`=별도 참조컬럼.
  - **규격그룹**: 판재두께(1·2·3·5·8·10T)·호수(1~10호+특수 4-1/7-1/8-1)·원단폭(코팅=base×폭, parent_media_id 소재연결). 변종대상=원자재판재·깃발호수·원단 / 단일=면적출력·부속품·간판.
  - **★업로드본 빌드·검증 loop PASS**: `scripts/master/{build_master,validate_master}.py` → `품목마스터/업로드양식/품목업로드_최종.xlsx`(4시트=품목마스터298·규격그룹·변종전개예시·검토필요52). 검증=코드유니크·타입/분류/단가 enum·spec_group↔category 정합·겸업페어링 전건매칭 **에러0**. **구조 완벽**.
  - **검토필요 52(용준님 도메인 정보 대기)**: ①이름확인 16(패트·배너·LED·잉크 등 약어→정식명 or ad-hoc) ②호수 적합성 11(태극기 세트/수기대 등 호수변종 아님→FIXED 판정) ③원단폭 값 7(폭mm 목록) ④간판자재 18(견적 단계 후속). 지어내기 불가=사람 입력 필요.
  - **마이그 0322~0325(prod 적용됨)**: 0322 카테고리13·0323 items.pricing_profile·0324 size_grade_prices(호수=변종품목이면 불요화)·0325 표준품목 로드(공장초기화로 삭제됨). 스키마는 유지.
  - **▶ 다음**: ①**자재/상품 분리 방침**(용준님 매입전용 vs 겸업 — 잉크는 판매도 됨) ②**단가 입력**(변종별 base_price=호수·두께별 가격, size_grade_prices 0324는 死스키마·base_price 사용) ③**죽은품목 검토**(UV조합117→면적흡수=print_media 확장, 계절품 0회분 살림) ④**게양방식 옵션**(태극기 게양용/구게양용/대형/영구용=주문서 base통합) ⑤**인프라**: 규격그룹 관리 페이지+권한→변종생성 API→주문 2단 picker→통계 GROUP BY→자동화4(생산 두께/호수 자재차감=BOM) ⑥**원단폭 변종**(값 미정=폭mm 목록). 상세=`memory/session-context.md`.

- **✅ [2026-06-13] GitHub 이슈 18건 전수 픽스·prod 배포·close + 휴가→근태 연동(▶커밋·미배포)**:
  - **이슈 18건**(승인분 전수, 봇이슈라 코드/스키마 대조 후 수정 → 각 이슈에 처리 코멘트 후 close): **보안HIGH** #384(printEvents `cards.entity_id`→`requesting_entity_id`+order폴백)·#375(cards 4엔드포인트 entity필터, by-number는 agent-key겸용 인증으로 분리)·#381(orders 쓰기 7핸들러 소유법인 IDOR 가드). **MED/개선** #388·#391(UTC업무일자→KST 저장+비교)·#392·#393(4대보험 신고서 산재컬럼·사업장별 entity)·#386·#387(split billing DRAFT링크정리·**동결 그룹단위 정밀화**)·#385(출고알림톡 품목 COALESCE)·#389·#390(급여 N+1 prefetch·skipped_names)·#372·#379(CSV truncation경고·printSystem N+1 batch)·#376(죽은 getElementById)·#374·#382·#383(**정적에셋 파이프라인 완전제거**: build:assets 삭제, hono플러그인 `_routes.json {exclude:[]}` 자체생성=MIME장애 클래스 구조소멸. smoke 로그인재시도+프론트부트스트랩 게이트). 커밋 `018ec4d0`·`70d8d0cc`·`644fbabe`·`645ae537`·`3f8fd0d8`·`83ded42c`·`c17e9448`. **prod smoke 103/103 + 프론트게이트 + by-number 3종 검증**.
  - **휴가→근태 자동연동(큐06)** — ▶**커밋됨·미배포**: `leaves.ts` 승인→`markLeaveAttendance`(start~end 날짜별 attendance UPSERT)·반려/삭제→`clearLeaveAttendance` 롤백, `caps.ts` 동기화 가드(휴가 attendance_type/status 보존·출퇴근시각 갱신·지각0), 신규 `utils/leaveAttendance.ts`. **★결정**: 반차/반반차=attendance_type 코드 그대로(시간맵 기준출근 지각보정), **종일휴가(ANNUAL/SICK/경조)=`VACATION`**(payroll work_days `NOT IN(ABSENT,VACATION,HOLIDAY)` 정합 — raw 'ANNUAL'은 근무일 오집계). `source='LEAVE'`로 CAPS skip 회피. **★승인-취소 엔드포인트 없어 롤백은 PENDING만 도달(방어배선, 필요시 cancel-approved 추가)**. verify(393모듈)+로컬 SQL 7/7 PASS. 정본→[[design-leave-attendance-link]]. **▶다음: prod 배포 + 실 반차 승인 E2E**.

- **🟡 [워크벤치 P1] 시안 검수 페이지 — 코드 커밋·prod 배포됨(2026-06-11, `b0df71c4`), 권한 0307 미적용=비노출 유지**: spec `2026-06-11-web-canvas-ia-workbench.md` P1 구현. 전체 `npm run verify`(tsc+build) PASS 확인(이번 세션). **▶ 다음: ①`db:migrate:prod`(0307 권한) ②본인 계정 /workbench 실확인 후 권한 개방.** (이하 원 구현 상세 ↓) 신규: `src/routes/workbench.ts`(orders/analyses/:orderId/match, orderVisibilityFilter+그룹범위 검증) · `src/pages/workbench.ts` · `src/scripts/workbench.js`(전역 showToast·IIFE 하단·getElementById 가드) · `migrations/0307_workbench_permission.sql`(ADMIN/MANAGER/DESIGNER). index.tsx 라우트 2건+menu.ts 생산그룹. **검증**: 신규 파일 격리 tsc(strict) PASS·node --check PASS·check:dom 회귀 0. ⚠️ Cowork 마운트 불안정으로 전체 tsc/build 미실행 → 커밋 hook+CI 게이트 의존. **▶ 다음: ①로컬 `npm run verify` ②`db:migrate:local`+확인 ③커밋·push ④`db:migrate:prod`(0307) ⑤본인 계정 /workbench 실확인 후 권한 개방**

- **🟢 [구현중] 주문 청구 법인 분할(split billing) (2026-06-10) — P1·P2·P3·P4 완료 + ◐P5 부분 prod 배포**: 청구법인 = '로그인 법인 자동' → **'담당 생산법인 기준 분할'**. 한 주문에 동산·선명 혼재 시 각 생산법인이 자기 품목 직접 청구(세금계산서·매출·미수금 분리). 기존 "매출=청구법인 단일"(2026-06-04) 뒤집음. 신규 `order_billing_groups`(주문×법인), `clients.balance` 캐시 폐기·파생. 6 Phase(P1~P5 MVP, P6 내부정산 후속), 세션 분리. **✅ P1(스키마+백필) prod**: 마이그 `0305`, 435주문→435그룹 1:1, BILLED 3 동결. **✅ P2(주문 생성/수정+UI)**: 헬퍼 `recalcOrderBillingGroups`(POST/PUT, `COALESCE(assigned_entity_id,주법인)` group by, tax/discount 비례배분+주법인 잔차흡수, BILLED/PAID 동결), 청구법인 셀렉트 제거→도출칩, 상세 분할요약. **✅ P3(청구 billing + 미수금 파생) prod 배포·라이브 검증 (2026-06-11, 커밋 66b2fea6, deploy 7d6f77bc, push 17852929)**: 헬퍼 `setOrderBillingStatus`(그룹 billing_status + orders 미러 batch, `IS NOT 'BILLED' AND IS NOT 'PAID'`) 6개 청구경로 교체 + `deriveClientBalance`(거래처×법인 파생 = `order_billing_groups[BILLED] JOIN orders(≠CANCELLED) − payments − adjustments`, entityFilter g/p/a). `clients.balance` 캐시 **전면 폐기**(읽기/쓰기 ~20지점 파생전환: receivables·overdue·collection-period·독촉·ledger·settlement·dashboard TOP10·financialReports·payment/adjustment new_balance, UPDATE 전부 제거). orders.billing_status/billed_* **미러 유지**(P5 매출집계·롤백용). 검증: 로컬 혼합주문 2그룹·미수금 분리(동산22k/선명11k)·입금차감·smoke 103/103, prod 라이브 receivables·balance-snapshot AR −9,224,710(파생 정본)·14페이지·API. **배포 전 prod비교 60k 차이=취소주문155 stale캐시 1건(파생 0이 정답, 배포로 교정)**. **✅ P4(세금계산서 법인 자동분할) prod 배포·검증 (2026-06-11, 커밋 68472035, dep 8d7009f 자동빌드)**: 헬퍼 `createSplitInvoices`로 발행 단위=(주문×법인). 혼합주문→법인당 1장(공급자·채번·금액·품목 각 법인), 단일법인=기존 동일 1장. 단건/일괄/월합산/직접발행 전부 분할, `issueTaxInvoice`=해당 법인 그룹만 BILLED+`group.tax_invoice_id` 연결(orders 미러는 전 그룹 청구완료 시만), `cancel`=해당 계산서 그룹만 초기화. 연결=기존 `order_billing_groups.tax_invoice_id` FK(spec 신규 M:N 테이블 대신, 1계산서:N그룹이라 충분). 마이그 0306(supply/tax 백필 435건·계산서연결·인덱스). 검증: 로컬 E2E 혼합주문 2장(동산110k/선명55k), 발행 부분청구·취소 그룹스코프, prod 페이지·API 0err, smoke 103/103. **✅ monthly-eligible 섀도잉 수정 + ◐P5 부분 (2026-06-11, 커밋 20f06907, dep auto)**: `/:id{[0-9]+}` 숫자제약→월합산 대상조회 200 복구. P5부분=`financialReports`(/pnl·monthly·CSV 매출=청구그룹)+`cashSchedule` 입금예정 (주문×법인) 물질화. **✅ P5 cashflowEngine (커밋 dce9f50b, dep auto)**: 자금예측 §4를 청구그룹 단위로 통합 — **2버그 수정** ①§4b가 P3 폐기 stale `clients.balance`를 미수 cap으로 읽던 것(balance 미유지)→(거래처×법인) 파생잔여 ②§4a order단위라 혼합주문 부분청구 §4b와 이중계산→그룹분할. 차감법 검증(stale balance=0+혼합: 법인1 기여=110k 파생·법인0=165k 무중복). prod forecast 200. 단일법인 무변화. **P5 잔여(P5-continued, 단일법인 현재 무영향·혼합 대비)=`dashboard.ts`(month_billed52·aging345·total_receivables366·billed_order_count336·clients_with_balance368)·`accounts-receivable.ts`(closing/profit/collection 월매출 2009/2044/2090/2150/1497)·`clients.ts`(has_balance102·총미수297/425·balance433)·`aiInsights.ts`(14/23)·`portal.ts`·`bank.ts`(1736)·레거시 컬럼제거**. smoke 103/103. **▶ 다음 = P5-continued(잔여 ~6파일 그룹화, 변환패턴=session-context) → 전량검증 후 orders.billing_status/billed_* 레거시 컬럼 제거 + clients.balance/recalculate 정리 → P6 내부정산.** 핸드오프 = `docs/superpowers/specs/2026-06-10-split-billing-IMPLEMENTATION-PLAN.md`, 설계정본 = `2026-06-10-split-billing-by-entity.md`, 메모리 = `design-split-billing`

> **다음 세션 TODO**: ⓪**[세션5 미배포]** N+1 8파일 + 청구 NULL버그 수정 = 로컬 검증완료·**미커밋·미배포** → `/deploy-verify`로 커밋·배포(write경로라 smoke 외 prod 회귀주의). 변경파일: orders/core·orders/queries·purchaseInvoices·purchaseOrders/templates·purchaseRequests·quotations·rip·taxInvoices ①향후 기성 PRODUCT는 품목 UI '기성품' 토글로 지정(코드 완비) ②혼합주문(제작+기성) 부분출고·재고차감 실사용 모니터링 ③cards 외 스키마 드리프트 의심 시 PRAGMA 확인 ④#329(3) withSeqRetry INSERT 래핑(후순위) ⑤로컬 dev:d1 중복 정리 ⑥자금 후속(백로그): 카드 예측(corporate_cards cutoff/payment_day 추가 후), 월별요약 KPI수입 일관성 ⑦DB 초기화 시 마이그(0106·0071) 재적용+permission_pages seed / **[#336 closed·위험수용]** admin/password 강화는 owner 수용으로 보류(원하면 codebase hashPassword로 prod UPDATE 가능) ⑧**한진 송장 자동화**: export(엑셀 일괄) prod 완료 / import(송장 일괄입력) 대기=한진 양식·출고번호 보존 확인 후 ⑨**✅ 알림톡 발송 동작 확정(2026-06-10)** — 템플릿 4종 승인·실발송 성공. **잔여=출고 자동발송 구현(option C, order.delivery_method 매핑)·한진 템플릿 등록·`barobill_test_mode=0` go-live** ⑩**[용준님] 거래처 배송방식 개별 정리**(생성버그 수정완료=신규는 '방문수령' 저장. 기존 '방문수령' 통합분 중 실제 택배/화물 거래처는 개별 정리 필요) ⑪바로빌 `order_received` 등록 후 `orders.js` autoTemplate 확정 ⑫**주문접수 멀티법인 협업 후속(미착수)**: (a)Phase 4 내부정산 집계(spec §9~11) (b)Phase 5 거래처 셀프 주문 포털 (c)[용준님] 코디네이터 사용자 지정(`/users` 토글, 지정 후 재로그인 필수) (d)실사용 검증=유통/견적 담당 실저장·타법인 교차열람 ⑬**[#366 선택잔여]** 타 8파일 `date('now','+9 hours')` 리터럴 ~24곳 헬퍼 점진치환 + 일/주/월 추이차트 그룹핑 KST 버킷(우선순위 낮음) ⑭**[#342 후속]** equipment 격리 — facility/equipmentQueue/cards-queries/dashboard/aiInsights는 배선 완료(세션2). **잔여=scheduling/printSystem의 equipment 읽기** 다법인 운영 시작 시 배선 ⑮**[#372 미착수]** CSV export 5엔드포인트 LIMIT 5000 silent truncation 경고/페이지네이션 ⑯**[구조 P1·컨텍스트 효율]** 1,500줄+ 대형 파일 분할 — ~~orders/core(2661→597)✅~~ 차순 우선순위: `src/routes/taxInvoices.ts`(2257) `src/routes/ledger/accounts-receivable.ts`(2209) `src/routes/purchaseOrders/core.ts`(2194) `src/scripts/cards.js`(2642, `?raw` 다중 import 방식). orders/core 분할 패턴(awk슬라이스+sed리네임, 배럴 마운트, 커밋마다 verify+smoke+도달성) 재사용. 분할 전 Read는 offset/limit 사용 ⑰**[용준님·보안]** Cloudflare API 토큰 회전 필수(.mcp.json 평문 노출분, git 이력 포함) → 새 토큰을 시스템 환경변수 `CLOUDFLARE_API_TOKEN`·`CLOUDFLARE_ACCOUNT_ID`로 등록(setx) 후 사용 ⑱**[하네스 P2·P3 채택]** entity-verify.mjs를 `.github/workflows/verify.yml`에 추가(~30분) + auto-improve 야간 스케줄 등록

> **📐 설계 확정 spec (2026-06-11, 결정 완료 → 구현 대기)**: ①`alimtalk-golive-package`(D1 결과모달+재발송/D2 bulk 단일화/D3 한진 skip — **다음 세션 권장**, #378+자동발송+go-live) ②`ontime-kpi-redesign`(#380 — COALESCE 출고일·마지막출고·SHIPPED+COMPLETED·납기월) ③`large-file-split-plan`(orders/core부터, #377 동세션) ④`card-cashflow-forecast`(일시불·AVG_3M 혼합·기존 OUT 흐름) ⑤`hanjin-courier-decision`(통합 솔루션 방향, import 동시 진행) ⑥`client-self-order-portal`(제작품 포함 최종 — **IA 안정화 선행**, brainstorming 필요) ⑦`web-canvas-ia-workbench`(**설계 확정 2026-06-11, Cowork 상세화 완료**: D-A 업로드 즉시 변환 큐잉 / **D-B bleed=미세확대 → createEdgeStrip 폐기, 오프셋 디버깅 영구 제거** / D-C 시트 잠금 / D-D 하이브리드 자동배치. placement JSON=기존 ia_params 포맷 재사용, Tier1은 썸네일 기반이라 pdf.js 불요. 마이그 1건+workbench.ts+2페이지. 잔여=spec §8 로컬 PoC 5항목(★좌표 왕복) 후 P1). 전부 `docs/superpowers/specs/2026-06-11-*.md`

> **⚖️ 운영 결정 (2026-06-11 용준님 확정)**: ⓐ**#377 활성화=플래그 게이트** — `ia_auto_enabled` settings 키 + `/pending` 응답 게이트, 기본 OFF→stale pending 정리→수동 테스트 1건→ON ⓑ~~정적 에셋 P1~P3~~ **무효(2026-06-11 P0 폐기·롤백 — prod 2회 다운, 재시도 금지)** → cards.js·shell.js 분할은 `?raw` 유지 전제(layout.ts 다중 import 방식)로 진행 ⓒ**SMS 대체문자 안 함**(`smsReplyOf=N` 유지, 발신번호 승인 액션 불요) ⓓ**미수금 독촉=추천+수동승인 목록**(후속 0.5세션, alimtalk spec Phase 4) ⓔ**test_mode=0 = go-live 패키지 검증 직후 같은 세션** ⓕ**admin 비번·E2E prod 오염 = 테스트 단계 동안 현행 유지, 실사용 전환 시 admin 계정 삭제+E2E 데이터 정리** (전환 시점 트리거 — 잊지 말 것) ⓖ~~split-billing = 수요 시 착수~~ **무효(결정 당시 이미 구현 진행 중이었음 — P1~P5 부분 prod 배포 완료, 위 항목 참조)** ⓗ**하네스 P2+P3 채택** → ⑱ 등록 ⓘ**정적 에셋 = 옵션 A PoC 승인**(`static-assets-rootcause-redesign` spec §6 — env.ASSETS+명시 MIME, 비임계 1파일 무중단 실측, 우선순위 낮음. ⓑ 금지의 해제 조건 충족 시에만 확대) ⓙ**정기변동비 Phase 4·5 = 카드예측 spec과 동세션**, 선행=split-billing P5-continued 완료(cashflowEngine 충돌 방지) ⓚ**미수금 고도화 3건(median lag·충당률 UI·조기경보) = 실사용 검증 후 선별** ⓛ**split-billing P6 내부정산 = 다법인 실거래 발생 후**(정산 단가·상계 주기는 그때 결정)

---

## 🟡 대기 중 (사용자 선택/승인 필요)

### 🆕 신규 설계 — 구현 미착수 (2026-06-13~16, 문서정리 세션서 STATUS 등록)
- **[품목·단가·재고 통합 개편] — north-star 수렴 · 게이트 통과(B-1 검증→A 채택, 2026-06-19)**: 표준품목 3역할(PRODUCT/GOODS/MATERIAL) + 단가 자동계산(기본 ㎡단가표×거래처 override) + 소재=자재 재고연결 + 프리셋 입력. 목적="ECOUNT가 못 하던 것"(전품목 통계·재고/원가 정확·단가 자동, 입력속도 아님). **게이트 결과(prod 검증)**: B-1 겹업물건=프로덕션 63/103 다중역할(MATERIAL 53건이 판매겸업) → **dual 플래그 유지=역할 정본, item_type enum collapse 금지**(A 채택), **전면 재설계(다) 불요**. realign Phase 2 '단일출처화' 단계 삭제. B-2(깃발 호수·간판 BOM)·B-6(단가 다형성)은 단가 개편서 plug-in 흡수. → [[design-item-role-multi-flag]]. 옵션(축) 시스템=EAV·규격 듀얼모드(출력물 NUMERIC/자재·상품 LIST)·동적 화면·카테고리 상속·권한 = v3 구조 확정. spec 4: `2026-06-13-item-pricing-inventory-FINAL`·`item-axis-realign-plan`·`item-master-review`·`option-axis-system-design`. **▶ 진행(2026-06-19): 마스터 로드 먼저** — 결정 확정(인쇄방식 분리·1차 단가엔진 AREA+FIXED+GRADE(깃발 호수)·기존103↔신규298 병행+매핑·겸업 2행). 로드원본=`표준품목_등록구조_수정본.xlsx`(298행). **P1a 스키마(`0322`카테고리9·`0323`pricing_profile(B-6)·`0324`size_grade_prices) + P1b 마스터로드(`0325`=231품목 **staged is_active=0**+14겸업링크) = prod 적용·검증 완료**(execute --file --remote, 추적드리프트 회피). prod 검증: 카테고리13·pricing_profile백필103·231 staged(active0·기존103 미변경)·GRADE34·링크77(기존63+14)·category NULL0·**prod 스모크 103/103**. 스테이징=picker(is_active=1 필터) 무오염. 정본 spec=`docs/superpowers/specs/2026-06-19-item-master-load-phase1.md`. **✅ 바인드 한도 버그 = 수정·배포 완료**(`5fd0dfcd` B안=IN→`IN(SELECT id FROM items WHERE is_purchase_item=1 AND is_active=1)` 서브쿼리/JOIN, 바인드 0개 → active 무관. push→CF 자동빌드 `420280` 라이브·**prod 스모크 103/103**). P1c 활성화 전 차단조건 해소. **다음=P1c(기존103 dedup·ecount매핑·인쇄방식카테고리 비활성·바인드픽스 → 활성화)·P1d 단가배선(GRADE룩업·㎡단가표)·기성PRODUCT 토글.** 미확인=원단53 재고이중장부 PoC. 이름확인16·간판52·선명19=후속.
- **[간판 구성요소 견적(조립 견적/BOM)] — 방향 확정, 세부 보류**: 간판=면적 아닌 "구성요소 라인 합"(채널·LED·SMPS·알루미늄바·까치발…). 기존 items+order_items.parent_item_id 위 "조립 견적 품목" 확장, calc_type 4종(FIXED/PER_QTY/BY_SIZE/BY_SPEC_QTY). **▶ 품목 개편과 병행, 구성요소 전수 확정 선행.** spec `2026-06-13-signage-component-estimate-structure`
- **[원본 파일 아카이브] — 결정 확정(D1~D9), 미착수**: 현행 IA가 고객 원본을 가공 후 폐기(Program.cs:1760) → 작업 EPS와 동일 규칙으로 `Z:\원본\...` 별도 트리 영구보존 + `/workbench` 보드 조회. **▶ ia-editor §14 P1.** spec `2026-06-16-ia-editor-nesting-intake`(`incoming-file-board` 흡수)
- **[수신 파일 간편 편집기] — 방향 확정, 보류**: 들어오는 AI/EPS를 일러 없이 웹서 수정("그림 수정❌, 처리 설정⭕"로 축소 재정의). 워크벤치 P2 후 착수. spec `2026-06-11-incoming-file-editor`

### 🆕 [LogWatcher 장비중심 모델] — P1~P3 구현·미배포, P4 대기 (2026-06-15)
- 마이그 0312+heartbeat 자동등록+/equipment 보강(P1)·LogWatcher heartbeat 확장(P2)·/equipment 표시+/rip 페이지 폐기(P3) 빌드 완료. **▶ P4: permission_pages '/rip' 정리+스모크+prod 배포+LogWatcher 재배포.** spec `2026-06-15-logwatcher-equipment-centric`, 메모리 `project-logwatcher-rollout`

### [기성품/유통 즉시출고] — ✅ 전체 완료 (Phase 1+2+3 + UI 클릭검증 + 태극기 지정)
- 코드/마이그(0285·0286) prod 반영. 기성/유통 = 카드 미생성·즉시 출고가능·SHIPPED 전이·출고 시 재고차감(음수 허용·멱등)·주문서 재고부족 경고.
- **태극기 9종(수기·1~6호·특호·탁상용) 기성품 지정 완료**. 향후 추가 기성 PRODUCT는 품목 UI '기성품' 체크로 지정.

### [포털 rate-limit] — ✅ 프로덕션 배포됨 (2026-06-02)
- portal verify-document/verify-token에 `rateLimitMiddleware`(10·30/분) 적용(commit 4a2fc28). prod 활성화.
### [#310 직접발행 폼] — 실사용 검증 대기 (2026-06-01)
- 백엔드(POST /tax-invoices/direct)+UI 배포됨. 세금계산서 '직접발행' 첫 발행 테스트 권장 (tax_invoices 0건)

### [바로빌 전환] — 통합 완료, 잔여 작업 대기
- 전환 완료: `messaging_provider=barobill`, 실데이터 조회 성공. 통장→수금 반자동 플로우 구현됨. 자금관리 탭 정리 완료(바로빌 통장 탭→은행 연동 통합).
- **✅ 알림톡 발송 동작 확정(2026-06-10)**: 템플릿 4종(대신화물 출고·대신택배 출고·방문 수령 준비 완료·미수금) 승인 완료, 실발송 성공(SendKey 수신). 3버그(SenderID/SmsReply/성공판정) 수정·배포(커밋 9bf1cb2e). **대기**: SMS 발신번호 승인(대체문자 E/A용), 한진택배 템플릿 등록, **barobill_test_mode=0 전환(go-live)**, 나머지 카드/계좌 등록
- **알림톡 코드 정합 완료**(2026-06-03): 출고 4종·주문접수·미수금 템플릿 코드 연동. **버튼 미전송**(sendATS) → 링크는 본문. **한진 송장 수동입력**(자동화 조사 완료)

### [선명2 CAPS Worker 설치] — PC 설정 대기
- S2 사이트 DB 등록 완료, API_KEY 발급됨. 선명2 PC에 caps-worker 폴더 복사 + .env 설정 + 실행 필요

### [배송 관리 최적화] — 출고 대기 보드
- 배송방법별 그룹화 + 마감시간 카운트다운 + 일괄 출고 + 카카오톡 발송
- **✅ 수동 알림톡 발송 정합(2026-06-10, 커밋 0a329a02)**: autoCodeMap 실제 템플릿명 교정 + 모달 본문순서. **자동발송=다음 세션**(option C, order.delivery_method 매핑; 트리거 shipments.ts:504 이미 배선, template_code+resolveMsg만 채우면 됨). '배송' 381건은 E2E noise였음(실데이터는 택배사 정상 지정)
### [기존 계약 일괄 등록] — 엑셀 import 스크립트 제공 대기
### [라벨 프린터 인쇄] — 프린터 모델 확인 필요 (외부 의존)
### [RIP 전송] — 코드 완료, 현장 테스트 대기 (외부 의존)
### [LogWatcher PrintExp] — 구현 완료, 현장 배포 대기 (외부 의존)
### [한진택배 자동화] — 솔루션 선정 대기 (사용자 결정 필요)

### [GitHub 이슈 백로그]
- **보류**: #342(equipment entity_id, 다법인 도입 직전 전용세션), #340(E2E CI 인프라·외부의존), #341·#350 잔여(write경로 N+1, 실데이터 검증세션)
- **owner 운영**: #336 프로덕션 admin/password 교체(+CI SMOKE/E2E 시크릿 갱신)
- **남은 open 이슈**: ⏸️owner/검증세션=#336(prod 비번)·#340(E2E CI)·#341·#350(write경로 N+1)·#342(설비 entity 다법인 시점) / 🆕미착수 actionable=**#369**(입고검수 전량취소 멱등·재고 이중차감)·**#370**(HTML↔JS silent-fail, 독촉이력 조회/삭제 등 5건)·**#392**(4대보험 신고서 산재 컬럼 미표시)·**#393**(4대보험 신고서 생성 entity 필터 누락=전 법인 합산) / 부분=**#366** ②카테고리B(대시보드 created_at "오늘"KPI, 저우선)·templates/stock-alerts /:id IDOR 점검(별도)

---

## 📌 기존 에러
- (없음) — 2026-05-19 확인: 3건 모두 200 정상

---

> 📦 **2026-06-05 이전 완료 항목 + 2026-06-09~10 완료 세션 + 2026-06-24 다이어트 이관분은 `PROJECT_STATUS_ARCHIVE.md`로 이관됨**
