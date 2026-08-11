# PROJECT_STATUS.md — 프로젝트 현황판

> **운영 규칙(2026-08-10 확정)**: ①완료(✅)=아래 인덱스 1줄(제목+남은 것)만, 경위 전문은 `PROJECT_STATUS_ARCHIVE.md`에 직접 쓴다 ②의미 없는 대기=보류함으로 과감히 이관 ③대기 항목=빠른 처리 우선 ④"커밋·미배포" 기록은 믿지 말고 prod 실측(deploy.yml=main push 자동배포). 게이트=`node scripts/doc-diet-audit.cjs`(훅·세션 시작 배너 연동).

## ✅ 최근 완료 — 후속 대기 인덱스 (경위·상세 전문 = `PROJECT_STATUS_ARCHIVE.md`)

- **08-11 출력실적 장비 다중선택 + 장비 조회 법인공유 prod**(`379a7b7a`·배포 `19c0af92`·smoke 110/110·선명 세션 25대 실측) — 출력실적 필터=체크박스 드롭다운(`equipment_ids`), **장비 읽기 6곳 격리 해제**(rip 목록/상세·facility 배치도/구역·dashboard 장비상태·queue workload — 전 장비가 동산 소유라 타법인 세션이 전부 빈 화면이던 근본원인). 쓰기 가드 #342 유지·카드/큐 카운트는 격리 유지. ⚠️타 세션 커밋 `93c9927a`가 공유 체크아웃의 다중선택 편집분을 함께 커밋(내용 정상·라벨만 어긋남). 남은: 없음
- **08-11 LogWatcher 현장키트 1차 가동**(`1793f6ac`~`30c977c7`·`Z:\Designs\LogWatcher-kit`) — 5대 업데이트(KM전사1~3·8색 2대) 전수 검증·KM전사4=INACTIVE·코스테크-전사-01 등록+config 준비(현장 [2] 실행만 남음). 남은: 솔벤3200 RIP측 로그 --probe · EPSON 취소코드 수거 · 미지 3종(수성·UV·평판) 진단

- **08-11 품목 단가 배선 3종 + base_price 백필 155품목 prod**(`46052278`·마이그 0529 적용·smoke 110/110) — 최소 청구 규격(0.5×0.7m→1×1m)·특약단가 조회(주문서만 빠져 있었음)·AREA 환산 근본수정(이관 unit_price=장당금액 99.9%). 단가공백 773→618, prod 실측 이력있음=최근거래가·없음=기본단가. **에누리 오염도 해소(마이그 0530 — 이관 라인 12,142건 unit_price→㎡단가, amount 불변 실측, 재계산 일치 98.5%, 백업 `_bak_0530_unit_price`)**. **C등급도 처리(마이그 0531 — 27품목)**: C 를 "정확한가"가 아니라 **틀렸을 때 얼마나 해로운가**로 갈랐다 — AREA(면적이 오차 흡수)·FIXED 소액은 적용, 무질서(변동≥2.0, 할인·조정)·표본편향(거래처<3)·주문제작(FIXED 고액=간판·운임)은 의도적 보류. 단가공백 **773→591**. 남은: **의도적 보류 29품목(간판=BOM 조립견적으로 풀 문제·운임=거리별) · N 표본부족 165 · X 이력없음 387**(근거=`docs/pricing/derived-prices.csv` 등급 컬럼에 사유 기재) → [[design-order-line-billing-rules]] · [[feedback-imported-unit-price-semantics]]
- **08-11 예산 감시 통합(바로빌 잔액 + Cloudflare 사용량) prod**(`93c9927a`·워커 재배포 완료·매일 06:00 KST) — `POST /api/cron/budget-check`, 임계=settings 3키, ADMIN 알림 당일 1회 dedup. **★감시가 조용히 꺼지는 경우(토큰 만료·스키마 변경·잔액 조회 실패)도 알림** — breached=false 라 급증해도 안 울리는 게 제일 위험. **✅ 3축 전부 prod 실동작 확인**(바로빌 1,984원·D1 51,320,194행·요청 23,744건). ⚠️**Pages 시크릿은 재배포해야 적용된다**(토큰 넣고도 "미설정"으로 나옴 — 빈 커밋으로 Actions 배포. `deploy:prod` 는 공유 체크아웃의 타 세션 dirty 를 휩쓸어 금지). ⚠️**요청 데이터셋 함정**: MES 는 Pages 라 `workersInvocationsAdaptive` 가 **항상 0** → `pagesFunctionsInvocationsAdaptiveGroups` 로 교체+후보 폴백, "D1 읽기 있는데 요청 0"이면 데이터셋 불일치로 판정(0 을 정상 통과시키면 감시하는 척만 한다). 남은(용준님): **🔴바로빌 잔액 1,984원 — 충전 필요**(마르면 계좌·카드 수집 cron 이 조용히 실패) · 대시보드 Billing usage alert(지출 하드 상한 기능 자체가 없어 앱 감시로 대체 불가) → [[design-nav-badge-cost-guard]]
- **08-11 스킬·위임 구성 점검 + `auto-improve` 분해(57K→3.3K토큰, 유실 0) + 후속 4종 완결** — 게이트 `npm run audit:skills` 신설, 가이드 §스킬 설계 규칙 신설, Area 6개를 `references/area-N-*.md` 축자 이관. 후속: ①`line N` 29건 정리를 auto-improve 사이클 2-b 로 분산 배선(잔여 카운터=게이트) ②트리거 낱말 배제 문구 8스킬 + 검사기 3종 오탐 제거(수동전용 스킬·배제 문구 자체·한정어 붙은 형태) → 실충돌 0 ③`context: fork` = `auto-scan`·`qa-audit` 만 채택(런타임 사실), `security-audit`·`entity-audit` 는 인라인 유지(코드 주장=메인 전수검증이 안전장치) ④`audit:skills` 는 `ship:gate` 대신 **커밋 훅 차단**(배포 산출물 아님). ⑤**위험명령 훅 근본 결함 수정** — checkout/restore 가 같은 의도를 다르게 앵커해 **오탐(`git checkout -- .claude/x` 차단)과 미탐(`git checkout .` 무방비)이 한 원인에서** 나왔다 → 「pathspec 이 트리 전체인가」로 재작성 + 패턴 정본 분리 + `npm run test:hookguard`(차단 15·통과 14, 구 패턴이면 4건 실패). 남은: `line N` 잔여 29→0 은 사이클이 소화
- **08-11 문서 다이어트·브랜치 대청소(원격 129·로컬 10 삭제, SHA=ARCHIVE 말미)** — 남은: 로컬 feat 3종(dept-pnl·neostampa-rip·price-sheet) 처분 판단 — EPSON 커밋 `89097982`·RIP 코드 보존 목적, main 흡수 확인 후 삭제
- **08-10 #77 주문서 왕복 소실 3종+이슈 7건**(`c3969236`) — 남은: 왕복감사(`audit:orderform-roundtrip`) /deploy-verify 편입 검토 · DXF 첨부 실물 1건 자연검증 · 판단대기 #606·#608·#609(재고 환산=별도 세션 권고)
- **08-10 #74 Cloudflare $125 과금 근본수정+HAVING 오바인딩 복구**(`d940d5ae`) — 남은: LogWatcher SendResult PC 롤아웃(다음 현장) · 예산 알림 임계 하향 검토 · 월말 청구 재확인
- **08-10 #69~#72 매입 스윕·껍데기 종결·마이그 드리프트 감사(코드 0)** — 남은(용준님): 정운교역 6·7월 청구서 · 진안 07-17 전표 50001 삭제(세무) · 케이엠테크 07-31 전표 확인. 시스템: 07월 계산서 시차 +2,168,815 · 동산기획→선명 −761,475 · 선명 매출원장 확보 시 e2 보정 348,029 실주문 대체 · 청주 717→3757 승계 시 e3 미러 동반 필수
- **08-05 #47 매입 대사 2차(AP 세무장부 대비 +2,018만 3.1%)** — 남은: 보류 7건 74.3M · 현대상사·대진국기사·NTIC 거래처 확정 · 하나 73142 잔액=세무장부 293 주기 갱신
- **08-08~08-01 재단 패널·재단선 모델(host 0.20.0·shell 0.55.0)** — 남은: 플로터/CNC 실기 투입 미검증 · MIN_HOLE_MM 물리 근거 · 라운드 조각 공유 변(라벨 맵) · 패널 이식 2건(A0→재단 클리핑·재단→A0 경계정확도, 확정·미착수) · 칼선 파일 가드(잉크<5%, 미결정) · `mesCut_rasterizeItem` 임시문서 재사용
- **★디자이너 PC 4대 공통 잔여** — `install-a0-panel.ps1` 미실행(인호동14·김보연8·김영주15·정소은16, 원격 수단 없음·사람이 실행) → 실행 전까지 해당 PC는 구 껍데기(고장 아님) · 전 PC 설치 확인 후 shim 제거 · A0 리모델(0.1.3)·work.ai 축2 반영분 포함
- **08-09 전사 8색 LogWatcher 2대 현장 설치**(`4d242c87`) — 남은: 실출력 1건 자연검증 · 첫 건 카드 미연결=정상 → `/production` 「출력파일 연결」 1회 후 학습
- **08-08 목록 UX 이카운트 갭 P1-1~4**(`39f16b50`) — 남은: 반품 2단계(등록 UI=/quality 기존) · `orders.is_voucher` · 분석탭 명세 칩 · CSV 없는 목록 5개(조회조건 SSOT 빌더 선행 — WHERE 사본 5벌 금지) · `entity-attribution-audit` UI(제품 결정)
- **07-30 work.ai 용량 근본 조치(pdfCompatible=false)** — 남은: 기존 981MB 재저장 여부(ia-editor 브랜치 건은 S4 페이지 삭제로 무효)

> 이전 배포 이력 전량 → `.claude/PROJECT_STATUS_ARCHIVE.md` (매 세션 읽을 필요 없음)

---

## 🔴 진행 중

- **★MES 실사용 전환 (전략 방향 확정 2026-08-11 — 자체 ERP+MES 일원화, 이카운트 단계적 해지)**: prod 실측이 전제였다 — **8월 주문 0·견적 0·카드 0·재고이동 1·활동로그 12건/1명**(6월 2,348건에서 급락). 살아 있는 건 **사람 입력이 필요 없는 자동수집 4종뿐**(장비로그 8월 2,534·근태 550·통장·IA). 즉 MES 는 "자동 수집기 + 이카운트 사본 보관소"이고 사람 업무는 전부 이카운트에서 돈다. 중단 사유=**미완성**(용준님) → 실체는 단가 공백. 구조는 이미 완비돼 있고 **데이터만 비어 있다**(단가표 11테이블 0건·`journal_entries` 코드 참조 0). **전환 관문 = 경리가 MES 에 매출을 직접 입력할 수 있는가** → 0단계(단가) 155품목 착수 완료. 다음 = 잔여 단가 판단 → 경리 1명 병행입력 → 월말 채권 대사 3개월 오차 0 → 이카운트 해지. **목표선 = 관리회계까지. 복식부기·재무제표·세무신고는 만들지 않는다**(WEHAGO·세무사 유지)

> 착수 핸드오프 = `memory/session-context.md` (2026-08-11 — 5건 각각 다음 단계·착수 지점·주의 정리)

- **동산 이카운트 이관 — Phase 0 완료(3중 교차검증 오차 0·코드 커버리지 100%), Phase 1 대기**: 다음=세부점검 4종(①거래처 미등록 ②품목 매칭률 ③월별 금액 대사 ④법인간거래 중복)→승인→적재. 정본=`docs/dongsan-import/EXPORT-SPEC.md`(확보 파일 9개·매입은 ⏸보류 중)
- **IA 멀티소스 임포지션(모아찍기)**: ★S4(08-05)가 /ia-editor 페이지·스크립트를 삭제 — 웹 축은 `routes/workbench.ts`로 이관 생존. 남은=P4(에이전트 EPS 실저장·preview_only publish)만 유효(브랜치 머지 항목은 무효·잔재 정리 완료 08-10). spec=`2026-07-08-ia-editor-multisource-imposition.md`
- **분할청구(split billing) — P1~P4+◐P5 prod**: 다음=P5-continued(잔여 ~6파일 그룹화)→전량검증 후 레거시 컬럼 제거→P6 내부정산(다법인 실거래 발생 후). 핸드오프=`2026-06-10-split-billing-IMPLEMENTATION-PLAN.md`
- **품목 미등록 갭 — 즉시등록 영역 소진(0398~0422), 잔여 갭 6.4억=간판 사업부 전체**: 간판 BOM 1차(자재·원가)=08-01 완결 — 다음=2차 조립견적(아래 설계 대기와 동일 건)
- **LogWatcher 후속**: **EPSON 취소 실측 확정 완료(2026-08-11)** — 완료=12·취소=2(13/14 폐기), 진행중↔취소 구분은 정착 규칙 쿼리(뒤에 완료 잡 생긴 2만 수집·수거 DB 51건 실증). 파서(`89097982`)는 이미 main 포함(구 기록 "미포함"은 구식). config 2대(EPSON-01/02) 키트 준비 — **현장 [2] 실행만 남음** · 이희섭 6/8 펀치 1건 · 6월 선명 급여 재계산 필요

## 🟡 결정·확인 대기 (사용자)

- **워크벤치 P1 노출**: 코드·권한 prod 배포 완료 — 메뉴 노출 여부 결정만 남음
- **급여 신현서 케이스 = 입력차이(코드 정상)**: 부양가족·차량유지비 비과세 입력 필요 → [[payroll-calc-ecount-diff]]
- **실검증 대기**: 수신번호 1개 확정 → 알림톡+MMS 실발송 검증 동시 해제(~400원)
- **자연검증(실사용 시 자동 소화)**: #310 직접발행 첫 건 · RIP 전송 현장 테스트 · 휴가→근태 첫 실휴가

## 🆕 설계 확정 — 구현 대기

- **품목·단가·재고 통합 개편(north-star·A안 채택)**: 다음=P1c(기존103 dedup·ecount매핑·활성화 — 바인드 버그는 해소됨)→P1d 단가배선(GRADE 룩업·㎡단가표)·기성 PRODUCT 토글
- **간판 조립견적(BOM 2차)**: 간판=구성요소 라인 합·calc_type 4종. 구성요소 전수 확정 선행. spec `2026-06-13-signage-component-estimate-structure`
- **LogWatcher 장비중심 P4**: '/rip' 권한 정리+prod 배포+LogWatcher 재배포. spec `2026-06-15-logwatcher-equipment-centric`
- **설계 확정 spec 7종(2026-06-11)**: alimtalk-golive · ontime-kpi · large-file-split · card-cashflow · hanjin-courier · self-order-portal · web-canvas-workbench — 전부 `docs/superpowers/specs/2026-06-11-*.md`
- **운영 결정(용준님 확정, 유효분)**: #377 활성화=`ia_auto_enabled` 플래그 게이트(기본 OFF) · SMS 대체문자 안 함 · 미수금 독촉=추천+수동승인 · 정적에셋 P0 재시도 금지(옵션 A PoC만) · **★실사용 전환 시 admin 계정 삭제+E2E 데이터 정리(트리거 잊지 말 것)**

## 🗄️ 보류함 (필요성 재확인 전 착수 금지 — 상세=ARCHIVE·spec)

- 원본 파일 아카이브(D1~D9) · 수신 파일 간편 편집기 · IA 세션루프 v2 · 배송 출고 대기 보드+알림톡 자동발송(option C) · 한진택배 자동화 · 기존 계약 엑셀 등록 · 라벨 프린터 · MMS 규격 상향(300KB로 운영 중)

## 🔒 편집 중 (충돌 방지)

- (없음) — iaEditor.js 잠금 해제: `2fe74b91` main 포함 + S4(08-05)에서 파일 자체 삭제, 2026-08-10 실측

## ⚠️ 잠복·블로커

- **품목 단가 전역(블로커)**: 원가 avg_unit_cost 315개 backfill 완료 — 남은=매출 base_price·무이력 514·자재비 소진연결 → [[project-item-pricing]]
- `quotations.ts`(동적 IN 1·for 5)·`taxInvoices/batch.ts`(동적 IN 2) N+1 재감사 → auto-improve Area 2
- 핸드오프 정본=`memory/session-context.md` + [[project-workflow-master-plan]](Phase1~5 잔여)

## 📌 기존 에러

- (없음)

> 📦 완료 이력·다이어트 압축 전 원본 전문 = `PROJECT_STATUS_ARCHIVE.md`
