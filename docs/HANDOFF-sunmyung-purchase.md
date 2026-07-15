# 선명 매입(purchase) 이관/대사 — 다음 세션 실행 핸드오프 (2026-07-15 확정)

> 매출/미수금 대사 = **완결**(선명 전 거래처 채권 엑셀 완벽 일치, 오차~7원). 이 문서 = 매입 이관+미지급 대사 실행계획.
> 정본 SQL=`docs/sunmyung-import/`(00~21). 매출 상세=`HANDOFF-sunmyung-import-execution.md` + auto-memory `project-sunmyung-item-import`.
> **원천 2파일 점검 완료·정합 확인**(매입내역 합계 = 채무 재고매입 512,459,124 정확 일치).

## 0. 원천 파일 (준비 완료·on-disk)
- **매입**: `품목마스터/원천주문데이터/매입내역_선명_01.01~06.30.xlsx` (구매현황, **9열 = 거래처코드(BRN) 포함**, 1,133라인).
- **채무(대사 기준)**: `품목마스터/원천주문데이터/거래처별 채무 선명_01.01~06.30.xlsx` (거래처별채무, 19매입처).
- **지급 소스**: `통장거래내역_선명01.01~06.30.xlsx` 출금 308건.
- 거래처맵/BRN 스냅샷: scratchpad `clients_fresh.json`(prod clients+BRN)·`client_map_v2.json`.

## 1. 확정 수치 (대사 목표)
| 항목 | 금액 | 비고 |
|---|---|---|
| 재고매입(매입내역 합계) | **512,459,124** | 공급 465,871,932 + VAT 46,587,192 |
| 기초채무(이월, 1월 前) | **187,259,834** | 매입처별 음수 adjustment |
| 지급합계 | **453,608,178** | 통장 출금 매입분 |
| **미지급 잔액(목표)** | **246,187,780** | 대사 최종 목표 |
- 매입처 **19 전부 BRN 보유**. 전표 244(매입내역) vs 채무 소계행(합계/·계/00001 김용준계).
- ⚠️ 현재 prod 매입 = **구파일 496,161,096·242전표** → **제거 후 새 파일(512M·BRN)로 재이관** 필수.

## 2. 실행 순서 (매출과 대칭)
1. **구 매입 제거**: `DELETE FROM purchase_invoice_items WHERE invoice_id IN (SELECT id FROM purchase_invoices WHERE entity_id=2 AND notes LIKE '선명 이관%'); DELETE FROM purchase_invoices WHERE entity_id=2 AND notes LIKE '선명 이관%';` (99_rollback 매입부분과 동일).
2. **매입 재이관**(BRN): 매입내역 → `purchase_invoices`(supplier_id=BRN매칭, entity_id=2, invoice_number=`SM-YYYYMMDD-No`, payment_status='UNPAID') + `purchase_invoice_items`(item_id 매핑 or NULL; ⚠️item_name 컬럼 없음→미매핑 원문은 invoice.notes). 비품목(화물·경동화물 등)=item_id NULL.
3. **기초채무 이월**: 매입처별 음수 `adjustments`(client_id=매입처, amount=−기초채무, type='CARRYOVER', created_at='2025-12-31', entity_id=2). **단 AP 미지급 파생이 adjustments를 쓰는지 확인**(매출은 deriveClientBalance=billed−paid−adj. 매입=accounts-payable.ts 확인 필요 — 구조 다를 수 있음).
4. **지급**: 통장 출금 → BRN 매칭 매입처만 `purchase_payments`(supplier_id·payment_date·amount·payment_method·entity_id=2) + `purchase_invoices.payment_status`/`paid_amount` 갱신. ⚠️출금엔 급여·공장보증금(50M)·대출·계좌이체·수수료 섞임 → **매입처 BRN 매칭분만**. 이체=제외.
5. **미지급 대사**: 매입처별 (매입 − 지급 + 이월 − 할인) = vs 채무 파일 잔액. 매출처럼 정확 일치까지 소액 대사조정.

## 3. `purchase_payments` 스키마 (지급)
supplier_id(FK clients,NOT NULL)·payment_date·amount·payment_method·reference_number·po_id(nullable)·notes·created_by·**entity_id(DEFAULT 1→2 명시)**. CHECK 없음.
- ⚠️ **AP 미지급 계산 로직 먼저 확인**: `src/routes/ledger/accounts-payable.ts`. 매출(deriveClientBalance)과 파생 구조가 다를 수 있음(purchase_invoices.paid_amount 기반 or purchase_payments 합). 이월/할인 반영 방식이 매출과 다르면 3·5단계 조정.

## 4. ★핵심 교훈 (매출에서 검증됨)
- **BRN 매칭 우선**. CHECK 실DDL 확인(match_status='MATCHED'무효→APPLIED, item_type='SERVICE'무효→GOODS). content_key 중복방지(통장 출금은 06-29~07-14 동기화분 존재→06-28컷 or dedup, date=YYYYMMDD·time HH:MM:00·type WITHDRAWAL).
- **🐛 D1 읽기복제 지연**: 집계(SUM GROUP BY) 간헐 stale → **검증은 raw 원장 행 합산**이 정본(대운 991,100 stale vs raw 598,400).
- **원장 created_at 함정**: 이관 레코드 created_at=import시각이면 기간필터 누락 → 실제 일자로 UPDATE(0518 참고).
- entity_id=2 전 INSERT 명시. 커밋=main push(공유 체크아웃, autostash rebase; SheetLayout.jsx 등 타세션 dirty 무시). `/import` API 간헐 인증오류→`--command` 우회.

## 5. 매출 대사 완결 요약 (참고)
선명 미수금=채권 엑셀 완벽일치. 청주12→동산청주(entity3, E3번호), 재현/태성 6월분만 청주, 김진수14M 오매칭제거, 계산서-only(오케이/인효/대운), 통장06-29/30·카드·할인·이월·소액조정 전량. 원장UI(일자112px·부가세·과거순잔액·모달스크롤) 배포.
