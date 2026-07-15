# 선명 매입매출 이관 — 실행 핸드오프 v2 (2026-07-14)

> 품목 등록(0462)·별칭(0463)=이전 세션 완료(로컬 main b9015c22, origin 미push·prod 실적용).
> **v2**: 원천 매출을 `판매현황_선명_01~06.xlsx`(BRN·규격·실VAT 포함)로 교체. 파이프라인 재구성·로컬 검증 완료.

## 0. 확정 결정
1. 매입+매출 모두. 2. 미등록 거래처=사용자 직접 등록(파일 제공). 3. 품목 못붙는 라인=item_id NULL+원문명, 서비스성(배송/할인/가공/수리)은 기타 카테고리 5품목. 4. 미수금=엑셀 금액 전액(결제기록 없이), 결제내역 추후 별도 import.

## 1. 원천 (v2)
| 구분 | 파일(시트) | 라인 | 주문/전표 | 거래처 | 공급가액 | VAT | 합계 |
|---|---|---|---|---|---|---|---|
| 매출 | 판매현황_선명_01~06.xlsx(판매현황) | 2,861 | 1,001 | 95 | 616,169,203 | 61,418,545 | **677,587,748** |
| 매입 | 매입내역_선명_01.01~06.30.xlsx(구매현황) | 1,098 | 242 | 19 | 451,055,542 | 45,105,554 | **496,161,096** |
- 매출 컬럼: 일자-No·**거래처코드(BRN)**·거래처명·담당·품목명·**규격**·품목코드(선명내부)·내용·적요·수량·단가·공급가액·**부가세**·출고일·주소·출고방법·적요2. (블랭크 1행 drop, 실질 01/01~06/30)
- 매입 컬럼: BRN 없음 → 공급처 이름매칭.
- 매핑 키 = `품목명 [규격]`(구 CSV 재사용). 커버리지: high 2024·med 436·med_star 307·dash 23·none 20·notfound 52.

## 2. 거래처 — BRN 매칭 (정본)
prod 3,750 clients(그중 BRN 2,664)와 **사업자번호 대조**. 표기변형 자동확정.
- ⚠️ **정정**: 지난번 "신규 등록"하기로 한 홀리·국가대표·동아광고·하나기획(여수)·위드광고(경기도)·서산광고기획은 **BRN상 기존 거래처와 동일** → 기존 매핑(신규 등록 시 중복). 예: 홀리=홀리(디자인나인), 반산기획(부여)=반산기획.
- 사용자 등록 진행 중(첫 pull 이후 4곳 등록됨, 하나기획(여수) 등).
- **아직 등록 필요**: 매출 21종(BRN 보유, `선명_미등록거래처_등록용.xlsx` 시트1) + 매입공급처 3(프라임젯·조광미디어·동산기획(청주), 시트2). 동산기획(청주)=자법인 entity3, BRN 316-24-02549.
- 재현시스템(원단)+(청주)=동일 BRN 564-06-03333 → 1곳 등록(두 이름 별칭).
- 최종 import 직전 **prod clients 재pull → BRN로 전량 재해석**(다중이름→단일 id).

## 3. 타겟·규칙 (prod 실측)
- **매출 3종**: orders + order_items + **order_billing_groups(BILLED)**. 미수금 정본=billing_groups(deriveClientBalance). entity_id=2·billing_status='BILLED'·billed/supply/tax·billed_at=주문일.
- **매입 2종**: purchase_invoices(payment_status='UNPAID') + purchase_invoice_items(⚠️item_name 컬럼 없음→미매핑 원문명은 invoice.notes 보존).
- order_number=`E2-YYYYMMDD-NNN`(기존 E2-20260626-001 충돌→`-IMP` 접미 자동회피). invoice=`SM-YYYYMMDD-NNN`(entity2 매입 0).
- status=**SHIPPED**(CHECK: QUOTATION/DRAFT/CONFIRMED/PRINTING/PRINT_DONE/SHIPPED/HOLD/CANCELLED). created_by=**5(admin)**. 트리거 0개(부작용 없음).
- **기타 카테고리 + 서비스 5품목**(ETC-SHIP/EXP/CUT/DISC/REPAIR): ⚠️`item_type='GOODS'`(CHECK가 PRODUCT/GOODS/MATERIAL만 허용, SERVICE 불가). category='기타'·deduction_method='NONE'·production_required=0. 서비스 26라인 연결.
- NULL+원문명: 매출 380·매입 148(폭 마스터 미등록·모호품목·비품목).

## 4. 로컬 검증 (prod 미러 sqlite, 전량 실행) — 통과 ✅
orders 1001/final 677,587,748 · order_items 2861/616,169,203 · billing BILLED 1001(billed 677.6M·supply 616.2M·tax 61.4M) · 매입 242/496,161,096 · items 1098/451,055,542 · client/supplier NULL 0 · FK 위반 0 · ETC 5 · 미수금 파생 정확.

## 5. 잔여 블로커
- git: 0462 충돌(main sunmyung vs feat/dept-pnl card_group). import는 **날짜명 SQL + execute --remote --file 직접 적용**, 커밋 worktree→main.
- prod 쓰기=최종 사용자 확인 후에만. 거래처 등록 완료가 선행.

## 6. 다음 단계
1. 사용자: 매출 21 + 매입공급처 3 등록(파일). 2. prod clients 재pull→cmap 전량 해석. 3. build_import_v2 재생성(literal id). 4. 시드 sqlite 재검증. 5. 사용자 최종확인→prod 적용→선명 미수금·매입 조회 검증.

## 7. 산출물(scratchpad)
analyze_v2.py · build_client_map_v3.py · build_import_v2.py · validate_v2.py · sql/{00_etc_items,01_sales,02_purchase}.sql · parsed_sales_v2.json · client_map_v2.json · clients_fresh.json
