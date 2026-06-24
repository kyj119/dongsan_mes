# PROJECT_STATUS.md — 프로젝트 현황판

> **현재 초점**: 품목 마스터 신모델 등록(출력물·후가공/소분류 UI) — 제품 ~83, 남은=솔벤캔버스·배너류·단가·간판BOM.
> **마지막 prod 배포**: bank 보안/버그 수정 (dep `e9c1155d` — IDOR#1·#2·#3·#5·#8, 정본 `memory/project-ship-pipeline.md`). 이전: 회계허브 6탭.
> **블로커**: 솔벤캔버스 원단 미파악(보류) · 품목 단가 전부 0(미입력) · 활성화(is_active=1) 시점 미결정.
> **다음 액션**: 솔벤캔버스/배너류 등록 → 단가 입력 → 간판 BOM → split-billing P5-continued.
> **핸드오프 정본** = `memory/session-context.md`.
> 완료 이력 → `PROJECT_STATUS_ARCHIVE.md` (매 세션 읽을 필요 없음, 필요 시 참조).

---

## 🔒 편집 중 (충돌 방지)

- (없음)

---

## 🔴 현재 진행 중

- **✅ [2026-06-24] 연차관리(/leaves) 제안서 + P1 정상화 배포 (정본 `docs/superpowers/specs/2026-06-24-leave-management-proposal.md` + `memory/project-leave-management.md`)**:
  - 에이전트 팀 5축 병렬 감사 → 제안서. **P1(보안·통제) 6건 구현·prod 배포**(커밋 `291cb392`, dep `5af043ab`, 롤백 `7da7ff4d`): B1 `/unused-allowance` IDOR(entityFilter·bank#1 동일클래스) · B3 POST·DELETE /requests requireRole(위조차단) · B2 approve 잔여검증(음수방지) · B5 cancel-approved 신설(잔여복원+근태해제, status=CANCELLED) · B7 approve batch원자화 · B9 전역 showPrompt 모달.
  - **Playwright 검증**: B1 200·B3 400(403아님)·B5 404핸들러·B9 모달 입력반환 ✓ (prod 휴가신청 0건이라 B2/B5 실데이터 미발생 — 로직은 build+검증). 
  - **D1~D6 확정**(입사일·소멸+촉진·직책수당·신청승인·전법인적용). **P2-1~3 구현·prod 배포**(커밋 `d69cd7a5`, dep `65e81674`, 롤백 `11e38ea2`): ①소정근로일 차감(주말+공휴일, Playwright 7→5일 ✓) ②통상임금 수당(포괄임금 calcInclusivePay 분해+직책수당, 검증 ✓) ③KST 적립.
  - **P2 남음(후속)**: ③사용촉진 모듈+④소멸 batch+⑥만1년 병존(연관, 1세션) · ⑤80% 출근율 게이트(근태집계 설계 후). P3 셀프·알림 / P4.

- **✅ [2026-06-24] 전 페이지 표 열폭 규격 일괄 정비 (에이전트 팀, 정본 `memory/project-table-spec-sweep.md`)**:
  - 전역 `col-*` 폭 유틸 신설(shared-styles.ts) + 12클러스터 fan-out으로 **~101개 표 정비**(ds-table 보장+콘텐츠 유형별 고정폭+가변 주열만 흡수+긴 td `title` 호버). 인쇄양식·편집그리드·동적matrix·밀집표 의도적 제외.
  - 검증: tsc/build green · **node --check 55/55**(?raw JS 문법) · **Playwright 시각검증 6페이지**(clients/reports/shipments/hr/inventory/purchase-orders: fixed·오버플로0·콘솔에러0·title동작, 측정스크립트 정밀). 
  - **유일 결함=col-date 104px 14px폰트 날짜 3px클립 → 112px 전역수정**. **prod 배포**(`3a64af56`+`8d3fc9da`, dep `01ce3db0`, 롤백 `47fbec9e`). bank 리뷰처럼 백로그 완결.

- **✅ [2026-06-24] Claude Code 셋업 정비 + bank 보안/버그 수정 (별도 세션 — 정본 `memory/project-ship-pipeline.md`)**:
  - **CC 셋업**: 죽은 jq훅→node 전환(`.claude/hooks/*.cjs` + SessionStart 자가진단) · `/ship` full-auto-prod 파이프라인(skill+ship:gate) · MCP(context7 + cloudflare-observability, 옛 cloudflare 제거) · 권한정리(통짜Bash 제거) · STATUS 다이어트 · **claude update 2.1.158→2.1.187**(agent teams 활성, **재시작 필요**) · env `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`. 훅 경로버그(.js 오탐) 수정.
  - **bank 버그(3에이전트 병렬리뷰)**: ✅**#1 IDOR**(card_fee_rates PUT/DELETE entity격리, #437/#434 클래스) · ✅#2 dead `/card-fee-calculate` 삭제 · ✅**#3 auto-match 파생잔액 복원**(폐기 clients.balance→deriveClientBalance; 가드=입금만·유일잔액만·suggest전용) · ✅#5 D1 IN 80청크 · ✅#8 KST 월경계. **전부 prod 배포·검증**(커밋 f29a266b·06c4b653·5f8793c2 → dep e9c1155d). ✅**#4 client-search 파생잔액 복원**(폐기 c.balance=0→order_billing_groups[BILLED]−payments−adjustments, /receivables 동일정의; FE 미수금 힌트 부활·FE 무변경) · ✅**#7 /transactions bt.\* → FE 소비 컬럼 명시SELECT**(리네임 시 silent null→SQL에러 노출). **prod 배포·검증**(커밋 4d2f3fdb → dep `5c1fa54c`; apex /transactions·/client-search 200, 파생잔액 /receivables와 일치=현재 미수금 0건). #6 변경불요. **bank 리뷰 백로그 완결.** + `/ship` 가드 정식 추가(배포 전 git status, SKILL.md).
  - ⚠️**교훈**: `deploy:prod`는 워킹트리 전체 빌드 → **배포 전 `git status`로 타세션 미커밋 확인 필수**(IDOR 배포 시 cardExpenses WIP 동반배포됨). agent teams=**v2.1.178+** 필요(2.1.158 미작동). observability wrangler config=**Pages 미지원**(347e438e 되돌림, 대시보드 토글 경로). bank 잔여 리뷰=`docs/bank-review-2026-06-24.md`.

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
  - **▶ 남은 미등록 출력물**: ①조명시트(백릿비닐 LT4071/LT4080·LC2000·SPE030A 브랜드, 부착/시공) ②백릿/와이드컬러 ③솔벤캔버스 ④어깨띠/머리띠 ⑤배너류(윈드/워킹/솔벤매쉬/실내/자이언트/미니/외국기/태극기배너). 출력물아님: PVC=켈원단·열승화폰지=폰지원단(등록됨), 코팅지 추가종류(자재), 판재(별도TODO). 뽀닥/고휘도 후가공 미연결(다이컷 등 필요시).
  - **✅ [2026-06-23] 유통 시트 등록(0372)**: 사서 파는 시트=dual(매입+판매), 판매=주문 라인 직접선택. **LC2000(보조시트100)·SPE030A(옥외랩핑137)=상품(GOODS, 출력X 순수판매 — 상품 카탈로그 첫 등록 0→2)** / **SPC031G(투명시트 105/127/137/152)=원자재 dual**(전폭 판매+출력 137). **SPC031G 출력=UV 투명시트(0375, 137폭만 연결)**. **조명시트=generic 1종(0376, JMS-GEN, 매입기록용)** — 간판제작 소비자재, 색상별 재고는 간판BOM 구축 시 확장(결정 '가').
  - **✅ 수성 어깨띠 등록(0377)**: 부직포 수성출력. 원단 부직포 5폭(60/90/127/152/180·50m) + 제품 수성 어깨띠(소분류 '어깨띠' 신설). 머리띠 보류(미확정). 수성 8→9.
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

- **⚠️ (폐기·정리됨 — 변종/규격그룹 접근 무효, 정본=session-context) 🟢 [2026-06-21 PM] 품목 대개편 인프라(Phase 2~3) 구축·로컬검증 완료 — 규격그룹 관리 + 변종 생성 엔진**:
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
