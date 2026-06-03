# 2026-06-03 브레인스토밍 — 미수금 회수 예측 · 매입 관리 · 바로빌 멀티계정

> 상태: **탐색 단계 (착수 전)**. 용준님 확인 대기. 코드 미작성.
> 출처: 2026-06-03 세션. 자금 일원화 4-3 확장 + 신규 2건.

## ✅ 용준님 결정 (2026-06-03)
- **Q1 결제주기 = 거래처별 제각각 (혼합 필수)**. 실제 형태: ①월정산→당월 말일 결제 ②월정산→익월 말일 결제 ③주단위, 누적 일정금액 초과 시 정산(임계 기반) ④청구건별 정산. → `client_payment_terms` 유연 모델 필요(cycle_type=MONTHLY/WEEKLY/THRESHOLD/PER_INVOICE + 마감규칙 + 결제월오프셋(당월/익월) + payment_day + threshold_amount).
- **Q2 회수율 = 딥서치로 더 나은 방법 제안** → 아래 "주제1 부록: 회수율 예측 딥리서치" 참조.
- **Q3 매입 = 입고·확정 분리** (선택지 나). 입고(수량 확인) ↔ 매입확정(거래명세서 보고 실단가 입력·금액 lock) 별도 단계.
- **Q4 바로빌 = 요금 일괄결제만** (선택지 가). MES는 **법인간 정산 미관리**, 법인별 corpNum/CERTKEY 매핑만 정확히. "파트너 결제"는 바로빌 사이트 쪽 설정.

---

## 주제 1 — 미수금 회수 예측 (자금 일원화 4-3 확장)

### 출발점 (당초 4-3)
"미수금↔입금예정 단순 표시 (client_id로 receivables ↔ cash_schedule IN 연결)".
용준님 통찰: **그것만으론 부족** — ① 거래처마다 결제 주기가 다르고 ② 미수금 중 실제로 들어올 비율(회수율)이 다르다.

### 현재 코드 자산 (이미 있음)
| 요소 | 위치 | 한계 |
|------|------|------|
| `clients.payment_terms_days` (기본 30) | 0106_cash_schedule | **정적 단일값** — 청구일+N일로만 예정일 계산 |
| `clients.credit_risk_score/grade` (0~100, A~F) | 0221_ai_credit_risk | 존재하나 회수 예측에 미연결 |
| `collection_logs` (promised_date, promised_amount) | reports 연계 | 약속 입금 추적 — 예측에 미반영 |
| `payments` (payment_date, amount) | 0002 | 과거 실제 회수 이력 보유 → 평균 회수일 산출 가능 |
| aging/회수율 분석 | `reports.ts:465-536` | 리포트만, 예측 엔진(cashflowEngine) 미연결 |
| cash_schedule IN 물질화 | `cashSchedule.ts:289-304` | billed_at + payment_terms_days, **액면 100%** |

**핵심 문제**: 예측 입금이 ① 정적 30일 가정 ② 액면 100%로 잡혀 **시점·금액 둘 다 낙관 편향**. 회수율을 빼면 자금예측이 과대평가됨.

### 두 축으로 분해
1. **시점 (언제)** = 결제 주기 모델링
2. **금액 (얼마나)** = 회수율/회수 확률

### 설계 선택지

**시점 — 결제 주기 모델 (택1 또는 혼합)**
- (가) **월 단위 정산**: 마감일(예: 말일) → 결제일(예: 익월 25일). 한국 B2B 전형. `corporate_cards`의 cutoff_day/payment_day 패턴과 **동일** → 일관성↑.
- (나) **건별 net-days**: 청구일 + N일 (현재 방식 유지·정교화).
- (다) **혼합**: 거래처별 `payment_cycle_type`(NET_DAYS | MONTHLY_CLOSING | FIXED_DAY) + closing_day + payment_day.

**금액 — 회수율 추정 (택1 또는 혼합)**
- (A) **과거 이력 자동**: payments vs billed_at로 거래처별 평균 회수일·회수율 산출(실시간 가공, 학습모델 아님 → 폐기된 ML 파이프라인과 무관).
- (B) **신용등급 가중**: 기존 credit_risk_grade로 haircut (A=100% B=95% C=85% D=70% F=제외). 수동·설명가능.
- (C) **aging 가중**: current 98% / 30-60 90% / 60-90 70% / 90+ 40%.
- (D) **액면 유지 + 경고만**: 예측은 100%, 위험 거래처만 배지/알림.

### 권장 합성 (제안)
예측 입금 = **시점(다: 거래처별 주기) × 금액(우선순위 폴백)**:
1. `collection_logs` 약속 있으면 → 약속일·약속액 (확정 우선)
2. 없으면 → 거래처 주기 모델로 예정일, 회수율(A 또는 B/C)로 금액 조정
3. 화면엔 **예상입금(액면)**과 **위험조정입금** 둘 다 표시(자금예측엔 위험조정 사용).

모두 **단일 cashflowEngine 헬퍼**에 흡수 → 화면 간 숫자 일치(이번 일원화 원칙 유지).

### 열린 질문 → Q1, Q2 (아래 질문 섹션)

---

## 주제 2 — 거래처 매입 관리 (발주 단가미정 → 매입확정 → 거래명세서 첨부)

### 용준님 요구
1. 발주 시 **단가 미정** 가능, **매입확정 시 금액 확인**
2. **검수(입고) 시 거래명세서 첨부**

### 현재 코드 자산
| 요소 | 위치 | 상태 |
|------|------|------|
| 발주 단가 미정 | `purchase_order_items.unit_price DEFAULT 0` (0032) | 0 입력 가능. 단 입고 시 0이면 재고반영 skip |
| PR 단가 흐름 | estimated_unit_price → admin_unit_price (purchaseRequests) | 승인 시 단가 확정 패턴 존재 |
| 입고/검수 | `purchaseOrders/core.ts:1257-1642` receive | 수량·합격/불합격, inspection_status(NORMAL/PENDING_REVIEW), 입고 시 단가 upsert |
| **매입확정 단계** | 없음 (발주=매입, receive가 암묵 확정) | 명시적 "금액 확정" 단계 부재 |
| **매입 인보이스 3-way** | `purchase_invoices` (0215) | PO-입고-인보이스 매칭, match_status(PRICE_VARIANCE 등) **이미 존재** |
| 매입처 단가 자동갱신 | receive Phase 4 | client_item_prices upsert + items.base_price + price_linked 연쇄 |
| **발주/입고 첨부파일** | 없음 | pr_comments(협의)만. PO/receipt 첨부 컬럼 없음 |
| R2 업로드 패턴 | `files.ts:37-76`, 법인카드 영수증(카메라→R2→체크) | 첨부 기능 그대로 재사용 가능 |

**핵심 갭 3개**: ① 단가 미정 명시 플래그 부재(0=미정인지 무료인지 모호) ② 매입확정(실단가 입력) 단계 부재 ③ 거래명세서 첨부 컬럼·UI 부재.

### 설계 선택지
- **(가) 입고에 통합**: 검수 화면에서 실단가 입력 = 매입확정. `purchase_order_items.price_status`(PENDING|CONFIRMED) 추가, receive payload에 `confirmed_unit_price`, 거래명세서는 `inventory_receipts.statement_file_key`. → 단순·빠름. 물품 도착=금액 확정 가정.
- **(나) 입고/매입확정 분리**: 입고(수량 확인) → 매입확정(거래명세서 보고 실단가 입력·금액 lock) 별도 단계. 물품 먼저 받고 단가는 나중(거래명세서/세금계산서 도착 시). → 회계적으로 정확. 단가 미정 자금예측 정확도↑.
- **(다) purchase_invoices 활용**: 기존 3-way matching을 "매입확정"으로 승격. 입고(수량+명세서) → 인보이스 등록(실단가, 자동 매칭) → 미지급 확정. → 기존 인프라 재사용, 가장 정석. 단 운영 복잡도↑.

### 자금 연결 (주제 1과 교차)
지급예정(cash_schedule OUT)을 **발주확정 시점**(금액 부정확) vs **매입확정 시점**(금액 정확) 중 언제 잡을지 결정 필요. 단가 미정이면 발주확정 시점 예측이 틀어짐.

### 열린 질문 → Q3 + 파일 하단 추가 질문

---

## 주제 3 — 바로빌 멀티계정 ⚠️ (의미 불명확 — 확인 필수)

### 용준님 원문
> "바로빌의 세금계산서·계좌·카드·카카오톡·메시지를 **다른 계정**으로 사용 예정. **금액 결제는 DONGSAN에 파트너로 선명커뮤니케이션을 추가**해서 관리."

### 현재 코드 (멀티계정 준비 상태)
| 영역 | 상태 | 비고 |
|------|------|------|
| entity별 corpNum | ✅ `entities.business_reg_no`/`popbill_corp_num` | entity 1=동산기획 2=선명(구 선명커뮤니케이션) 3=동산기획 청주 |
| 세금계산서·팩스·카카오·현금영수증 | ✅ getEntityId 기반 corpNum | entity-aware |
| **CERTKEY** | ❌ **전역 단일** env(`BAROBILL_CERT_KEY`/`_PROD`) | 법인별 분리 안 됨 |
| 계좌·카드 조회 (`barobill.ts`) | ❌ 글로벌 corpNum 하드코딩 | settings에서 단일 corpNum 읽음 |
| settings 테이블 | ❌ entity_id 컬럼 없음 (글로벌) | `entity_settings`(0146) 존재하나 **미사용** |

### 내가 이해한 바 (검증 필요)
- "선명커뮤니케이션" = entity 2 (선명). 마이그 0149에서 "선명"으로 개명됨.
- 두 가지가 동시에 의미됨으로 추정:
  - **기능적**: 각 법인이 자기 바로빌 계정/자격으로 문서 발행 → 법인별 corpNum(+CERTKEY?) 필요.
  - **상업적**: 바로빌 *이용료 결제*는 동산기획이 파트너(마스터 결제계정), 선명을 연동회원으로 묶어 일괄 결제.
- 즉 "다른 계정 사용" = 법인별 발행 계정 분리, "금액 결제 = DONGSAN 파트너" = 바로빌 요금 청구를 동산기획이 통합 부담.

### MES 관점 영향 (해석과 무관하게 필요한 변경)
1. CERTKEY를 전역 env → **법인별 저장**(entity_settings 또는 entities 컬럼)으로 이전.
2. **모든** 바로빌 호출 entity-aware화: 계좌·카드(`barobill.ts`) 글로벌 → entity 기반 수정.
3. 법인별 바로빌 자격(corpNum/CERTKEY/sender_id) 입력 **설정 UI**.

### ⚠️ 결정/확인이 필요한 불명확 지점 (질문)
**바로빌 정책 사실 (벤더 확인 필요, 용준님도 모를 수 있음):**
- (T1) 파트너 모델에서 CERTKEY가 **법인별로 각각 발급**되는가, 아니면 **파트너 CERTKEY 하나로 여러 corpNum 호출** 가능한가? → MES 저장 구조(법인별 CERTKEY vs 단일 파트너키+법인별 corpNum)가 갈림.
- (T2) "세금계산서·계좌·카드·카톡·메시지를 다른 계정으로" 가 **법인별 분리**인가, **서비스별 분리**(같은 법인 내 세금계산서 계정 ≠ 카톡 계정)인가?

**용준님 의도 (Q4로 질문):**
- (B1) "금액 결제 = DONGSAN 파트너" = 단순히 바로빌 요금을 동산기획이 일괄 결제(바로빌 쪽 설정, MES 무관, MES는 매핑만)인가? 아니면 **MES에서 법인간 바로빌 비용 정산**까지 관리(선명 사용분을 동산기획이 대납 → 법인간 미지급/정산 추적)하고 싶은가?

**기타:**
- (E1) 동산기획 청주(entity 3)는 바로빌을 어떻게? 별도 계정 / 동산기획 공유 / 미사용?
- (E2) 실계정 CERTKEY 발급 일정 (현재 test mode) — 멀티계정 전환은 발급 후 가능.

---

## 사용자 확인 질문 (요약)

| # | 주제 | 질문 |
|---|------|------|
| Q1 | 미수금 | 거래처 결제 패턴 형태? (월말마감-익월결제 / 청구일+N일 / 혼합) |
| Q2 | 미수금 | 회수율 추정 방식? (과거이력 자동 / 신용등급 가중 / aging / 액면+경고) |
| Q3 | 매입 | 단가미정→확정 흐름? (입고시 통합 / 입고·확정 분리 / 매입인보이스 활용) |
| Q4 | 바로빌 | "DONGSAN 파트너 결제"의 의미? (요금 일괄결제만 / 법인간 정산까지 / 추가설명) |
| 추가 | 매입 | 거래명세서 첨부 단위(발주/입고/인보이스)? 단가 미정 발주 빈도? OCR 자동입력 여부? 지급예정 인식 시점? |
| 추가 | 바로빌 | T1·T2(벤더 확인), E1(청주 entity), E2(발급 일정) |

---

## 제안 진행 순서 (확정 후)
1. **주제 1 (미수금 회수예측)**: 방금 끝난 자금 일원화의 자연스러운 4-3 확장. 외부 의존 없음 → **착수 용이**.
2. **주제 2 (매입 관리)**: 독립 작업. 기존 receive/purchase_invoices 인프라 활용. 중간 난이도.
3. **주제 3 (바로빌 멀티계정)**: 실계정 CERTKEY 발급(외부) **선행 필요** + 의미 확인 필요 → 마지막. 단 코드 구조(entity_settings CERTKEY 이전)는 미리 준비 가능.

---

## 결정 반영 상세 설계 (연구 무관 항목 — 착수 전 검토용)

### 주제 2 구현 계획 — 입고·매입확정 분리 (착수 결정됨, 2026-06-03)
**확정 설계**: 매입확정=`purchase_invoices` 활용 / 거래명세서=입고 건당 / 단가=수기 입력 / 미정·확정 거래처별 혼재.

**현재 스키마 (확인됨)**:
- `purchase_order_items`: unit_price DEFAULT 0 (미정=0, 무료와 혼동). received/accepted/rejected_quantity, line_status, storage_zone_id, received_by/at.
- `inventory_receipts`(0003+): receipt_number, receipt_date, supplier(TEXT), total_amount, status, received_by, notes, +po_id/supplier_id(0032), +inspection_status(0040), +entity_id(0232). **첨부 컬럼 없음**.
- `purchase_invoices`(0215): invoice_number, supplier_id, po_id, invoice_date, due_date, subtotal/vat/total, match_status(UNMATCHED|MATCHED|PRICE_VARIANCE|QUANTITY_VARIANCE|DISPUTED), variance_amount, payment_status(UNPAID|PARTIAL|PAID), paid_amount, entity_id. + purchase_invoice_items(po_item_id, item_id, quantity, unit_price, amount). **백엔드(`purchaseInvoices.ts` 3-way match)만, UI 없음**.
- 현재 receive(`purchaseOrders/core.ts:1531-1599` Phase4)가 **입고 시 즉시** client_item_prices upsert + base_price 갱신 = 입고=매입확정 통합 상태.

**목표 흐름**: 발주(단가 미정 허용) → 입고(수량 검수 + 거래명세서 첨부, 금액 미확정) → 매입확정(purchase_invoices 등록·실단가 수기입력·3-way 매칭·금액 lock·미지급금/지급예정 확정).

**Phase 분리**:
- **P1 단가미정 + 명세서 첨부 — ✅ 구현·prod 배포 완료**: 마이그 `0287`(price_status, statement_file_key) **로컬+prod 적용**. 발주폼 "단가미정" 체크(`purchaseOrderForm.js` createItemRow/calc/save/load + `togglePricePending`), 발주 INSERT/SELECT price_status(`core.ts`). 입고 거래명세서 첨부(`core.ts` POST·GET `/receipts/:receiptId/statement` R2, `receiving.js` 입고이력 첨부/보기, `receiving.ts` 컬럼). typecheck/build/node-check 통과. **prod 배포**(6c72eb4b, 2026-06-03). HTTP 스모크: 신규 라우트 401(no 500)·/receiving 200. **인증 UI 동작은 용준님 실사용 테스트 대기** → 통과 후 P2 착수.
- **P2 매입확정 UI 신규 — ✅ 구현·검증 완료(미배포)**: 신규 페이지 `/purchase-invoices`(매입확정, nav '구매'그룹, `'/purchase-orders'` 권한 재사용→permission_pages 불필요). 백엔드 `purchaseInvoices.ts`: GET `/pending`(단가미정·입고완료 PO), GET `/pending/:poId`(미정품목+거래명세서), POST `/confirm`(실단가→poi 확정·입고라인/재고원장 valuation 정정·base_price/client_item_prices upsert·PO총액 재계산·purchase_invoice 생성+간이 3-way). 프론트 `purchaseInvoices.js`(확정대기 탭+인보이스 탭+확정모달, 거래명세서 보기). typecheck/build/node-check + 로컬 D1 전 쿼리 검증 통과. **prod 미배포(신규 마이그 없음 — 0287+기존 purchase_invoices 재사용)**. 잔여: 그룹연쇄(price_linked) 미반영(receive와 차이), 부분 확정 미지원(PO 단위 일괄).
- **P3 자금 연결 — ✅ 구현·배포 완료**: 매입확정 시 `cash_schedule` OUT(지급예정) UPSERT(`purchaseInvoices.ts /confirm`). 키 source_type='PURCHASE'+source_id=po_id(auto-generate와 dedup). 금액=재계산 PO final_amount, 예정일=due_date 또는 매입일+거래처 payment_terms_days. **이중계산 없음**(cashflowEngine은 PURCHASE OUT을 물질화 전용으로만 읽음). typecheck/build/로컬 SQL 검증 통과. **prod 배포**(d2f76f4c).
- **P4 검증·배포 — ✅ P1·P2·P3 모두 prod 배포 완료**. 마이그 0287만 신규(prod 적용). 잔여: 인증 UI 실사용 테스트(용준님), 그룹연쇄·부분확정 후순위.

**✅ 최종 결정 (2026-06-03)**:
- (D1) **확정 발주 = 입고 시 자동확정**(현 receive 동작 유지, 즉시 invoice 자동생성·자동확정). **단가 미정 발주만** 입고 후 수동 매입확정 대기. → price_status로 분기.
- (D2) **단가 미정 입고 재고 평가 = 직전 매입가(base_price) 잠정**, 매입확정 시 inventory_transactions 정정.
- 첨부=입고 건당(`inventory_receipts.statement_file_key`), 단가=수기 입력, 매입확정=`purchase_invoices` 활용.

#### (구설계 메모) 입고·매입확정 분리 (Q3=나)
**상태 흐름 (제안)**: 발주(CONFIRMED, 단가미정 허용) → **입고**(수량·합격/불합격 + 거래명세서 첨부, 금액 미확정) → **매입확정**(거래명세서 보고 실단가 입력 → 금액 lock, 미지급금·지급예정 확정) → (선택) 세금계산서 대사.

**스키마 변경 (제안, PRAGMA 확인 후)**:
- `purchase_order_items.price_status` TEXT (PENDING | CONFIRMED) — 0=무료와 미정 구분. 발주 시 미정이면 PENDING.
- `inventory_receipts.statement_file_key` TEXT — 거래명세서 R2 키 (법인카드 영수증 `files.ts` 패턴 그대로: 카메라 아이콘→R2→체크 아이콘).
- 매입확정 단계: 기존 `purchase_invoices`(0215, 3-way matching)를 **확정 아티팩트로 재사용** 검토 — 입고 시점엔 금액 비확정, 매입확정 = 실단가 입력+invoice 매칭. (선택지 나+다 융합 여지)
- 매입확정 시: ①line unit_price/amount 갱신 ②PO total 재계산 ③client_item_prices·base_price 갱신(기존 receive Phase4 로직을 확정 시점으로 이동) ④cash_schedule OUT(지급예정) **매입확정 시점 금액으로** 생성/갱신.

**자금 교차**: 지급예정(OUT)은 **매입확정 시점**에 정확 금액으로 인식(발주확정 시점은 단가미정이라 부정확). → cashflowEngine OUT 입력원 변경.

**열린 세부 (용준님 확인)**:
- 거래명세서 첨부 단위: 입고 건당(1발주 분할입고 시 명세서 여러 장) 가정 → `inventory_receipts`에 부착이 자연. OK?
- 명세서 단가 입력: 사람이 보고 수기 입력(OCR 자동입력은 별도 큰 작업, 후순위) — 동의?
- 단가 미정 발주 빈도: 일부 품목만? 다수? (UI 노출 강도 결정)

### 주제 3 상세 — 바로빌 멀티계정 (Q4=가, 법인간 정산 미관리)
**MES 범위 = 법인별 자격 매핑만**. 법인간 비용 정산 기능 **불필요**(바로빌 사이트에서 동산기획 일괄결제).

**필요 작업**:
1. **법인별 자격 저장**: `entity_settings`(0146, 현재 미사용) 활성화 또는 `entities`에 컬럼 추가 → 법인별 `barobill_cert_key`, `barobill_corp_num`(이미 business_reg_no), `barobill_sender_id`, `barobill_test_mode`. 전역 env CERTKEY → 법인별 저장으로 이전.
2. **글로벌 하드코딩 제거**: `barobill.ts` 계좌·카드 조회가 settings 단일 corpNum 사용(`barobill.ts:29-32,64-73,104-113`) → `getEntityId(c)` 기반으로 수정. (세금계산서·팩스·카톡·현금영수증은 이미 entity-aware).
3. **설정 UI**: 법인별 바로빌 자격 입력 화면(설정 페이지에 법인 선택 + CERTKEY/corpNum/sender).
4. **호출부 통일**: `getTaxProvider`(taxInvoices.ts:12-21) 등 CERTKEY를 env→entity_settings 조회로.

### ⚠️ 바로빌 벤더 확인 질문지 (착수 전 필수 — 바로빌 지원/영업에 문의)

**컨텍스트(바로빌에 설명)**: 3개 법인(동산기획·선명커뮤니케이션·동산기획 청주)이 자체 MES(Cloudflare Workers·SOAP 연동)에서 바로빌 사용. 서비스=세금계산서·문자·카카오 알림톡·계좌조회·카드조회·팩스. 요금은 **동산기획이 파트너로 일괄결제**, 선명을 연동회원으로 추가 예정.

**A. 인증/계정 구조 ⭐ (시스템 데이터모델 결정)**
1. 파트너(동산기획) 아래 연동회원(선명·청주)을 둘 때 **CERTKEY가 사업자번호(연동회원)별로 각각 발급**되는가, 아니면 **파트너 CERTKEY 하나로 여러 CorpNum을 호출** 가능한가? → 전자=법인별 CERTKEY 저장, 후자=단일키+법인별 CorpNum.
2. API 호출 시 CorpNum↔CERTKEY 종속 규칙은? (CERTKEY가 특정 CorpNum에 묶이는지)
3. 한 법인이 여러 서비스(TI/SMS/Kakao/BankAccount/Card)를 쓸 때 **CERTKEY는 서비스 공통**인가 서비스별 별도인가?

**B. 파트너 등록·요금 (DONGSAN 일괄결제)**
4. 동산기획=파트너, 선명·청주=연동회원으로 묶는 절차·필요서류?
5. 요금 청구가 파트너(동산기획)로 통합되는가? 충전금(선불)은 파트너 풀 공유인가 연동회원별 개별인가?
6. 파트너 묶음 시 할인/정산 방식·법인별 사용량 명세 제공 여부?

**C. 서비스 활성화 (법인별)**
7. 각 법인이 TI/문자/카카오/계좌/카드를 **각각 별도 신청·활성화**해야 하는가? (법인별 가입 단위 확인)

**D. 운영 준비 (per-법인 사전등록)**
8. 문자 **발신번호 사전등록**이 법인별로 각각 필요한가? 승인 소요기간?
9. 카카오 **알림톡 발신프로필(채널)·템플릿 심사**가 법인별로 각각 필요한가?
10. **계좌조회**: 각 법인 계좌를 연동회원별로 등록(스크래핑 인증)해야 하는가?
11. **카드조회**: 각 법인 법인카드를 연동회원별로 등록해야 하는가?

**E. 테스트→운영 전환**
12. 연동회원별 **테스트(데모) CorpNum과 운영 CorpNum이 별도**인가? 현재 test 모드→운영 전환 절차?
13. 각 법인 운영 CERTKEY 발급 예상 일정?

**※ 벤더 질문 전, 용준님이 먼저 정할 것 (시스템 분기)**
- (T2) "세금계산서·계좌·카드·카톡·메시지를 다른 계정으로" = **법인별**(동산기획 vs 선명)인가 **서비스별**(같은 법인 내 세금계산서 ≠ 카톡)인가? → 후자면 (서비스×법인) 자격 매트릭스 저장 필요. (코드 영향 큼)
- (E1) 동산기획 청주(entity 3)도 바로빌 쓰는가 / 동산기획과 공유인가 / 미사용인가?

### ✅ 검증 결과 + 용준님 답변 (2026-06-03 확정)

**A1·A2·A3 검증 (바로빌 공식 SOAP API operation 목록 직접 확인):**
- `ws.baroservice.com/TI.asmx`·`BANKACCOUNT.asmx` 양쪽에 **`RegistCorp`(회원사 가입)**, **`CheckCorpIsMember`(회원사 가입여부 확인)**, `UpdateCorpInfo`, `AddUserToCorp` 존재 → **CERTKEY 보유자(연동회원=파트너 동산기획)가 여러 회원사(사업자번호=CorpNum)를 등록·관리**하는 구조.
- 우리 코드(`barobillClient.ts:116`)도 모든 호출에 `CERTKEY`+`CorpNum`을 **별도 동반** → 정확히 일치.
- **결론**: **CERTKEY는 연동회원(파트너) 단위 1개. 하나의 CERTKEY로 여러 법인 CorpNum 호출**(해당 CorpNum이 RegistCorp로 회원사 등록되어 있어야 함). 서비스(TI/SMS/Kakao/계좌/카드) **CERTKEY 공통**, 단 (회원사×서비스) 활성화는 별도.
- **교차확증**: 용준님 #5 "충전금도 파트너 공유" = 단일 연동회원 계정(=단일 CERTKEY)에 선명이 회원사로 편입됨을 의미(별도 CERTKEY였다면 충전금 공유 불가).

**용준님 답변 정리**: #4 파트너 연결 완료 / #5 동산기획 통합청구·충전금 파트너 공유 / #6 정산명세 불필요 / #7 서비스별 별도 활성화 필요 / #8 발신번호 승인 ~2일 / #9 카카오 법인별 / #10 계좌 법인별 등록 / #11 카드 법인별 등록 / #12 테스트·운영 CorpNum 별도 / **#14 계정은 법인별, 바로빌 사용 법인은 동산기획·선명 2곳만, 청주(entity 3)는 동산기획 본사 계정 공유**.

### ✅ 확정 MES 작업 (대폭 단순화 — 법인별 CERTKEY 불필요)
당초 `entity_settings`에 법인별 CERTKEY 저장 계획 **폐기**. CERTKEY는 **전역 유지**.
1. **CorpNum만 법인별** (CERTKEY는 그대로). TI/fax/kakao/현금영수증은 이미 entity corpNum 사용✓.
2. **핵심: `barobill.ts` 계좌·카드 조회의 글로벌 corpNum → `getEntityCorpNum(getEntityId(c))` 기반으로 수정** (현재 settings 단일 corpNum 하드코딩).
3. **청주(entity 3) = 자체 corpNum** (당초 3→1 공유 폐기). 용준님 재확정(2026-06-03): 청주는 세금계산서를 **자체 사업자번호로 발급**해야 하고 **회원사 등록 완료** → 모든 기능 자체 corpNum. 선명=entity 2 자체 corpNum.

**✅ 1~3 구현 완료(로컬검증, 미배포, 2026-06-03)**: 글로벌 corpNum 하드코딩 **4곳** 법인별화: `barobill.ts getConfig`(계좌·카드·status), `cardExpenses.ts`(카드 동기화), `bank.ts ×2`(통장 동기화·자동대사) → 전부 `getEntityCorpNum(getEntityId(c))`. CERTKEY·senderId는 전역(단일 파트너 키) 유지. **각 법인(동산기획·선명·청주) 자체 corpNum** — 청주 3→1 매핑 추가했다가 세금계산서 자체발급 요건 확인 후 **제거**(청주 회원사 등록 완료라 자체 corpNum 정상). 세금계산서·현금영수증·문자/카카오는 원래 `getEntityCompanyInfo`/`business_reg_no`로 이미 entity별 자체 corpNum이라 무영향. **가산적·역호환**: entity 1/0(ADMIN 전체)=동산기획 동일 동작. typecheck/build 통과. 마이그레이션 없음(순수 코드). **prod 배포 완료**(0be34406, HTTP 스모크 통과). 실사용 검증=선명/청주 회원사·계좌·카드 바로빌 등록 후 가능.
- ※ 바로빌 모델 핵심(검증): API CorpNum은 **회원사 등록(RegistCorp)된 사업자만** 사용 가능 — 미등록 CorpNum 호출은 거부(`CheckCorpIsMember`). 발행 사업자 변경 = 그 사업자 회원사 등록이 전제.
4. (운영, 용준님/바로빌) 선명 CorpNum을 동산기획 CERTKEY 계정에 **회원사 등록(RegistCorp)** + (회원사×서비스) 활성화 + 선명 계좌/카드 등록. 일부 "이미 연결".
5. (주의) #12 테스트/운영 CorpNum 분리 — 운영 전환 시 각 법인 **실 CorpNum + prod CERTKEY**. 개발 test 모드 유지하려면 법인별 test CorpNum 필요(운영만 쓰면 무관).
6. 메시징 발신번호·카카오 템플릿·계좌/카드는 **법인별 사전등록**(코드 아닌 운영 준비, #8~11).

---

## 주제 1 부록 — 회수율 예측 딥리서치 결과 (2026-06-03 완료)
> 딥리서치: 5각도·20소스·94주장→25검증(23확정/2기각)·102 에이전트. 출처 IFRS9 Big4(Deloitte/PwC/Forvis Mazars 1차) + arXiv/Springer/Elsevier 논문.

### 핵심 결론: "회수율"과 "회수 시점"은 별개 문제 → 다른 기법 조합
| 축 | 학문적 최선 | 우리 제약(규칙기반·D1) 권장 | 근거 |
|----|-----------|--------------------------|------|
| **회수율(얼마나)** | — | **IFRS9 provision matrix** (aging버킷별 손실률×잔액) | 순수 SQL집계. ASC326 aging-schedule과 동일. SMB 표준·정당 (high) |
| 손실률 도출 | — | **roll-rate/전이행렬**(과거이력 경험적) | ML 불필요, aging 코호트 스냅샷만 (high) |
| **회수 시점(언제)** | survival/MIPP (ML 필요→**제외**) | **거래처별 median lag + payment terms + 이동평균 지연** | 결정적 SQL, 악화탐지 +3~5%p (high) |
| 검증/벤치마크 | — | **DSO·CEI** (후방지향 KPI, 예측 아님) | 모니터링 레이어만 (high) |

### 필수 설계 캐비엇 (연구 검증됨)
1. **손실률 평탄(flat) 금지**: aging 오래될수록 단조증가. PwC 예시 평탄3% vs 차등매트릭스 = 2.86배 과소계상.
2. **세분화 전제**: 포트폴리오는 동질·정상(stationary) 아님 → 단일 행렬 부적합. **신용등급(A~F)·결제유형별 세그먼트 필수**. ("거래처 제각각"에 직결).
3. **roll-rate는 코호트 이력 필요**: 단순 스냅샷 집계로는 부정확 → **거래처별 aging 월스냅샷 이력 테이블** 필요(시점매칭).
4. **cold-start**: 신규/이력부족 거래처 30~40%는 행동피처·median lag 무력 → **payment_terms 기본값 fallback 필수**.
5. **임계정산 거래처**("주단위 누적초과")는 aging/lag로 안 잡힘 → **별도 규칙**(누적 미정산액 추적 + 임계도달 예측).
6. IFRS9 전향적(거시) 조정은 우리 규모(단일 산업·내부 현금예측용)에선 **수동 조정계수 1개로 단순화** 권장(감사재무제표 아님).

### 우리 코드에 매핑 (기존 자산 재사용)
- `clients.payment_terms_days`(정적30) → **cold-start fallback 기본값**으로 재정의.
- `clients.credit_risk_grade`(A~F) → **provision matrix 세그먼트 축**.
- `payments`+`orders.billed_at`/`billed_amount` → median lag + roll-rate 원천(실시간 집계).
- `collection_logs.promised_date` → **시점 최우선 override**.
- `cashflowEngine`(방금 구축) → 위험조정·시점배치된 입금예측 **소비자**.

### 권장 단계적 도입 (4-3 = 단순표시 → 회수예측 모듈로 확장)
- **4-3a 회수 시점 — ✅ 구현·로컬검증 완료(prod 미배포)**: 마이그 `0288`(clients에 payment_cycle_type/closing_day/payment_month_offset/payment_day/settlement_threshold, **로컬만**). 헬퍼 `utils/paymentSchedule.ts`(`computeExpectedPaymentDate`: NET_DAYS·MONTHLY·THRESHOLD폴백) — **단위테스트 7/7**(월정산 당월말·익월말·특정일·마감이월·연말롤오버·2월말). 통합: `cashSchedule.ts` auto-generate ORDER IN + `cashflowEngine.ts` ORDER_EXPECTED 둘 다 정적 terms→헬퍼. UI: 거래처 모달 '결제 주기'(NET/MONTHLY 토글) + clients GET/POST/PATCH 컬럼. typecheck/build/node-check 통과. **가산적**(미설정 거래처=기존 30일 동작 보존). ⚠️ median lag(이력기반 보정)·collection_logs 우선순위는 4-3a-2로 분리(후속). **배포 대기**(prod 마이그 0288 적용 필요).
- **4-3b 회수율 가중 — ✅ 구현·로컬검증(prod 미배포)**: 마이그 `0289`(`ar_provision_rates` aging버킷 손실률 단조증가 0.5%→40%, `ar_grade_multipliers` A~F 승수, 로컬만). 헬퍼 `utils/provisionMatrix.ts`(`loadProvision`/`agingCategoryToBucket`/`effectiveLossRate`, 테이블 부재 시 DEFAULT fallback). `bank.ts /receivables`: credit_risk_grade + 위험조정(잔액×(1−유효손실률)) per-client·summary. UI: 미수금 탭에 **예상 회수액 KPI**(+충당 tooltip) + **예상회수율·예상회수액 컬럼**. 액면/위험조정 병기. typecheck/build/node-check 통과. ⚠️ aging은 현행 '최근입금일 경과' 프록시 사용(송장령 아님). 충당률 편집 UI·전향조정은 후속. **prod 배포 완료**(6a613633, 마이그 0289 prod 적용·시드 검증·HTTP 스모크 통과).
- **4-3c 조기경보+검증**: 이동평균 지연(fast/slow)→악화 거래처 배지/알림. `ar_aging_snapshots` 월 cron→roll-rate로 손실률 데이터 보정. DSO/CEI 대시보드.
- **4-3d 임계정산 거래처**: THRESHOLD 타입 누적추적·정산예측.

### 미해결 결정 (연구 openQuestions → 용준님/추후)
- median lag을 결제유형별로 나눌지 vs 거래처 단일분포로 충분한지 → **권장: 거래처별 + 주기규칙이 유형 흡수, lag는 유형 내 보정**.
- 등급×aging 2차원 매트릭스가 표본부족에 안정적인지 → **권장: 기본 aging 매트릭스 + 등급을 손실률 승수**(2D 직접추정보다 안정).
- 기각된 주장 2건(Survival Boost 순차ensembling, "SMB는 단순>딥 항상 우월·명시선택")은 **인용 금지**.

관련 메모리: [[project-cashflow-unification]] [[project-entity-policy]] [[feedback-popbill-api]] [[multi-entity-progress]] [[feedback-db-schema-check]]
