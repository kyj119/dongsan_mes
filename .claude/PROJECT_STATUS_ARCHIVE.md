# PROJECT_STATUS_ARCHIVE.md — 완료 이력

> 이 파일은 PROJECT_STATUS.md에서 분리된 완료 항목 아카이브입니다.
> AI 에이전트가 매 세션 읽을 필요 없음. 필요 시 수동 참조.

---

### 2026-06-05 (상태모델 단일화 + 정기변동비 + 후가공 + 자금 4-3)
- [상태모델 단일화] 카드/주문 이중 상태모델(PRINT_PENDING vs PRINTING+rip_status) 충돌 4 Phase 해소: 보드 status기준·PRINTING=LogWatcher 단일화·유통 즉시 SHIPPED·마이그 0298. 상태 라벨 단일소스화(`statusLabels.ts`→`window.MES_STATUS`, 16스크립트). 커밋 210585e·b9b03ea, spec `2026-06-05-status-model-unification.md`
- [정기변동비 Phase1~3] fixed_expenses ESTIMATED 확장(마이그 0299)+`expenseEstimator.ts`(AVG_3M/SAME_MONTH_LAST_YEAR)+cashflowEngine 분기. 커밋 8a786c4. Phase4(정산)·5(UI) 대기
- [후가공 연결 복구] `printSystem.ts` items-for-order에 `LEFT JOIN pp_applicable_subcategories`. 커밋 55e097e. 소재별 소분류 매핑(운영) 남음
- [자금 4-3] BILLED-미물질화 주문을 ORDER_EXPECTED 합성(거래처 balance cap·이중계산 방지)+미수금 예상입금일. 커밋 607b3e4
- [바로빌 멀티계정] corpNum 법인별화(`getEntityCorpNum` 4곳), CERTKEY 전역. dep 0be34406. 실사용 검증 대기
- [미수금 회수예측] 4-3a 결제주기(마이그 0288)+4-3b IFRS9 provision matrix(마이그 0289, `provisionMatrix.ts`). 커밋 9d40b745·6a613633

### 2026-06-04 (주문접수 멀티법인 협업 MVP + 채번/재고 버그)
- [멀티법인 협업] 방향전환: 강제분리 폐기→유연한 그릇(`order_items.assigned_entity_id` 품목별 담당). P1 담당태그+추천(마이그 0292)→P2 카드 담당법인별 생성·알림→재고차감 담당법인 우선(마이그 0293)→유통/견적 담당 셀렉트(마이그 0294)→코디네이터 교차가시성(마이그 0295). spec `2026-06-04-order-intake-entity-split.md`
- [버그] orders POST 채번 billingEntityId 불일치 수정(커밋 e487a45), 채번 E{eid} 통일(PR/클레임/반품), inventory_transactions 부분 UNIQUE에 entity_id 추가

### 2026-06-03 (자금 일원화 Phase1~4 + 매입관리 + 규격 + 한진/카카오)
- [자금 일원화] 캐시플로 탭→`/cash-schedule` 흡수(5탭 허브), `cashflowEngine.ts` 하이브리드 엔진(물질화+온더플라이), monthly/forecast, 시작잔액 prefill, 은행매칭→DONE
- [매입관리] 입고·매입확정 분리 P1~P3: 단가미정 발주·거래명세서 첨부(마이그 0287)·`/purchase-invoices`·지급예정 UPSERT
- [규격] `order_items.specification`(폭) 전면(마이그 0291)+주문 일괄 상태변경
- [한진/카카오] 한진 export(엑셀 일괄), 알림톡 템플릿 6종, 거래처 배송방식 7종(마이그 0290)

### 2026-06-02 (상태CHECK 버그 + GitHub 이슈 11건 + 견적 개편)
- [버그] cards.status CHECK에 PRINT_PENDING 누락→PRODUCTION 주문 500(마이그 0284), card_number 충돌 수정
- [이슈] #323~333 전수 수정·close(보안격리·cascade·채번·홈택스 dedup 마이그 0282/0283)
- [기성품/유통 즉시출고] `items.production_required`(마이그 0285·0286), 카드 미생성·즉시 SHIPPED·출고 재고차감
- [견적] 관리 개편(표·품목·전환 prefill)+생산주문서 유통품목 행 단순화+채번 경계 버그 근본수정(E{eid} 내장)

### 2026-06-01 (거래처원장 + GitHub 이슈 29건)
- [원장] 전기이월·기간컨트롤·실계산 미수, 표헤더 정렬 전역 수정(layout.ts `.ds-table thead th`)
- [이슈] 29건 전수 종료(런타임500·멀티법인격리·UNIQUE·보안, 마이그 0278~0281)

### 2026-05-29~31 (근태 개편 + 법인카드)
- [근태] 레이아웃 전면 개편(11→5 집계열·31일 고정)+유형별 지각/조퇴 스마트 처리(기준시간 맵)
- [법인카드] 마감일 cutoff_day(마이그 0273)+캐시플로 결제예정 배지, 영수증 바로 첨부(R2)

### 2026-05-28 (단가 관리 시스템)
- 매입/매출 2탭, item_group 통합(price_groups 폐기), 입고 자동갱신 연쇄(마이그 0267·0268)

### 2026-05-27 (법인 분리 전체 감사)
- 174테이블 전수 감사(`docs/entity-separation-map.md`), Issues #217~234 Phase1~3 18건 close(마이그 0264~0266)

---

### 2026-04-29 (CAPS on-prem 완료 처리)
- [CAPS] 경리 PC에서 CAPS DB 연동 완료, 자동 시작 + 수동 트리거 모두 작동 확인
- 동기화 하루 3회 (09:00/13:00/19:00) + 근태 페이지 수동 버튼, VBS 래퍼 백그라운드 실행

### 2026-04-25 (재고차감 구조 설계 + 품목 체계 리뷰)
- [설계] 재고차감 통합 설계서 작성: ROLL(yd, 0.1올림) + SHEET(㎡, 면적 기반) 2트랙
- [설계] 품목 체계 전체 리뷰: 코드 범위 현행 유지, category_id TEXT 통일, GOODS 자동설정
- [설계] product_materials 자동 생성 (소재 일괄 등록 시 parent_media_id 매칭)
- [설계] 역할별 기본 품목 필터 (계정 관리 페이지, is_sales/is_purchase 대체)
- [문서] `docs/superpowers/specs/2026-04-25-inventory-deduction-redesign.md` 신규

### 2026-04-24~25 (품목 체계 개편)
- [DB] migration 0154~0158: print_methods/media 테이블, items/order_items 확장, price_change_history
- [API] printSystem.ts 신규: 출력방식/소재/연결 CRUD 12개 엔드포인트
- [UI] items.ts/js: 6탭, 소재 일괄 추가, 단가 이력 모달
- smoke: 60/60 PASS

### 2026-04-23 (이카운트 → MES 거래처 이관)
- [이관] 이카운트 ERP 거래처 2,660건 MES 임포트 완료
- [DB] 마이그레이션 0153, [도구] 변환/검증/보정 스크립트 3개

### 2026-04-22 (코드 리뷰 + 정리 + 멀티사업자 + 리팩토링)
- escapeHtml/금액 포맷 전역 통합, 멀티사업자 인감도장, 고아 정리

### 2026-04-20~21 (메시징 + CAPS + 카드 + PrintExp)
- SMS/카카오톡/이메일 발송 성공, CAPS 동기화, PrintExp 파서

### 2026-04-17 (통합 메시지 + 포털 + UI + 보안 + 검증)
- 4채널 메시지 시스템, 포털 고도화, 보안 감사, smoke 55/55 PASS
- CLAUDE.md 575→121줄 감축

### 2026-04-15 (검수 UI + 타입체크 + 라우트 분할)
- 검수 UI 전체 구현, tsc 타입체크 게이트 구축
- payroll/purchaseOrders/ledger/orders 라우트 분할
- 마이그레이션 0131까지 적용

### 2026-04-10 (심층 검증)
- Track 1 Phase 2 디자인 일관성, 보안 감사, alert→showToast 325건
- Phase B3/B4/B5 완료

### 2026-04-08 (급여/인사 확장 + 개발 환경)
- B1 추가근무/요율, B2 급여명세서, B4 연말정산
- smoke.cjs 신규, templates/ 신규

### 2026-04-05
- 카카오 알림톡 연동, 빌드 에러 수정

### 2026-04-04
- UI/UX 개선 v2 (13항목)

### 2026-03-31
- 주문 무결성 감사, security-audit 스킬

### 2026-03-30
- IA 자동화: ExtractGroups v5, ProcessOrderItem v2, OpenCV, TestRunner

### 2026-03-28
- 설정 페이지 통합

### 2026-03-27
- 문서 정리

### 2026-03-25
- Items 원단폭, 재고실사, 원가 분석

### 2026-03-24
- IA 학습 파이프라인 (이후 폐기)
