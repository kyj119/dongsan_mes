# 법인 분리(Entity Separation) 현황 지도

> 최종 갱신: 2026-06-19 (split-billing P1~P5 + 마이그 0305~0321 반영) | 기준일: 2026-06-19
> 이전 기준: 2026-05-27

---

## 한눈에 보기

```
 ✅ 법인 분리 완료 (entity_id 있음)     : 86개 테이블 (migration 0264로 14건 추가)
 ⚠️ 법인 분리 필요 (entity_id 없음, 버그): 0개 테이블 ← 전부 해소
 🔗 부모 FK로 간접 분리 (자식 테이블)    : 28개 테이블
 🌐 법인 공유 (설계 결정)               : 42개 테이블
 ⚙️ 시스템/인프라                       : 18개 테이블
```

---

## 🆕 청구 법인 분할 — `order_billing_groups` (split-billing, 2026-06-11 prod)

> 정본 spec: `docs/superpowers/specs/2026-06-10-split-billing-by-entity.md` · 마이그 0305(P1)·0306(P4)

**전환 핵심**: 청구법인 = `orders.entity_id`(접수 법인) 단일 → **품목 `assigned_entity_id`별 생산법인 분할 청구**.
한 주문이 동산(현수막)·선명(간판)을 섞어도 각 생산법인이 자기 몫을 직접 청구.

### 신규 테이블 `order_billing_groups` (주문 × 법인)
| 컬럼 | 역할 |
|------|------|
| `order_id` | FK → orders |
| **`entity_id`** | **청구(=생산 담당) 법인 — 이 테이블의 entity 격리 기준** |
| `billing_status` | NULL \| BILLED \| PAID (orders에서 이동) |
| `billed_amount` / `supply_amount` / `tax_amount` | 법인 몫 청구금액·공급가·세액 |
| `tax_invoice_id` | 발행 시 연결 (FK → tax_invoices, 1계산서:N그룹) |
| | `UNIQUE(order_id, entity_id)` + idx_obg_order/entity/status/tax_invoice |

- **entity 격리 전환**: 청구·매출·미수금 집계 쿼리는 `orders.entity_id` → **`order_billing_groups.entity_id` 기준**으로 전환.
  - 청구확정(BILLED): `orders/queries.ts:164~178` — 그룹 `billing_status` UPDATE (`IS NOT 'BILLED'`/`IS NOT 'PAID'` 가드).
  - 세금계산서: `tax_invoices`가 청구그룹 참조, 발행 시 (주문×법인) 단위 BILLED.
- **품목 귀속**: `order_items.assigned_entity_id`로 그룹 결정. NULL(상품·부자재 등 미생산) → 주문 주(主)법인(`orders.entity_id`) 그룹.
- **백필**: 기존 주문 전수 → 주문당 1그룹 (멱등 `INSERT OR IGNORE`). BILLED/PAID 동결, NULL은 신규 코드에서 재계산.

### `clients.balance` 캐시 폐기 → `deriveClientBalance` 파생
- 기존: `clients.balance` 단일 캐시(**법인 무구분** 버그) → split-billing이 무력화.
- 전환: **(거래처 × 법인)별 파생 계산** = `Σ billing_groups[BILLED].billed_amount − payments − adjustments`, group by (client_id, entity_id).
- `payments.entity_id` / `adjustments.entity_id`는 이미 법인별 보유 → 미수금 파생의 입력으로 그대로 사용.
- `clients.balance`는 전환기 레거시 컬럼으로 잔존(읽기는 파생, P5 prod 검증 후 별도 마이그로 제거 예정).
- → ⚙️ **분류 변경**: `clients`는 여전히 entity_id 없는 법인 공유 마스터지만, **잔액(미수금)은 법인별 파생**으로 격리됨.

---

## ~~⚠️ 법인 분리 필요 (버그) — 14건~~ → ✅ 전부 해소 (migration 0264, 2026-05-27)

| # | 테이블 | 도메인 | 위험도 | 비고 |
|---|--------|--------|--------|------|
| 1 | `print_events` | 생산 | **HIGH** | 출력 이벤트 = 법인별 생산 데이터 |
| 2 | `cost_snapshots` | 원가 | **HIGH** | 법인별 원가 분석 혼재 |
| 3 | `inventory_auto_deductions` | 재고 | **HIGH** | 재고 법인분리(Phase1~6) 완료 후 누락 |
| 4 | `price_policies` | 단가 | **MEDIUM** | 법인별 다른 가격 정책 필요 |
| 5 | `notifications` | 알림 | **MEDIUM** | 타 법인 알림 노출 가능 |
| 6 | `year_end_settlements` | 급여 | **MEDIUM** | 연말정산 법인 미분리 |
| 7 | `leave_balances` | 인사 | **MEDIUM** | 연차 잔여 (employee FK로 간접 가능하나 직접 필터 불가) |
| 8 | `leave_requests` | 인사 | **MEDIUM** | 휴가 신청 (동일) |
| 9 | `inspection_results` | 검수 | **MEDIUM** | 입고 검수 결과 |
| 10 | `portal_access_tokens` | 포털 | **LOW** | 거래처 포털 접근 토큰 |
| 11 | `portal_reorder_requests` | 포털 | **LOW** | 거래처 재주문 요청 |
| 12 | `collection_logs` | 수금 | **LOW** | 수금 로그 |
| 13 | `client_notes` | 거래처 | **LOW** | 거래처 메모 (clients 자체가 공유) |
| 14 | `client_accounts` | 거래처 | **LOW** | 거래처 계정 |

---

## ✅ 법인 분리 완료 — 72건

### 핵심 거래/재무
| 테이블 | 도메인 | entity 컬럼 |
|--------|--------|-------------|
| `orders` | 주문 | entity_id (접수=주(主)법인. 청구는 order_billing_groups로 분할) |
| `order_billing_groups` | 청구그룹 | entity_id (청구=생산 담당 법인, 마이그 0305) |
| `cards` | 카드 | requesting_entity_id |
| `quotations` | 견적 | entity_id |
| `quotation_items` | 견적 품목 | entity_id |
| `payments` | 수금 | entity_id |
| `tax_invoices` | 세금계산서 | entity_id |
| `cash_receipts` | 현금영수증 | entity_id |
| `shipments` | 출고 | entity_id |
| `purchase_orders` | 발주 | entity_id |
| `purchase_requests` | 발주요청 | entity_id |
| `purchase_invoices` | 매입 | entity_id |
| `purchase_payments` | 매입결제 | entity_id |

### 재고/생산
| 테이블 | 도메인 |
|--------|--------|
| `inventory` | 재고 |
| `inventory_counts` | 재고실사 |
| `inventory_receipts` | 입고 |
| `inventory_releases` | 출고 |
| `inventory_transactions` | 재고 이동 |
| `inventory_fifo_layers` | FIFO 계층 |
| `inventory_adjustments` | 재고 조정 |
| `production_logs` | 생산 로그 |
| `work_records` | 작업 기록 |
| `quality_issues` | 품질 이슈 |
| `waste_records` | 폐기 기록 |
| `stock_alerts` | 재고 경고 |
| `storage_zones` | 창고 구역 |
| `mrp_runs` / `mrp_results` | MRP |

### 인사/급여
| 테이블 | 도메인 |
|--------|--------|
| `employees` | 직원 |
| `attendance` | 근태 |
| `payroll` | 급여 |
| `labor_contracts` | 근로계약 |
| `insurance_reports` | 4대보험 |

### 자금/회계
| 테이블 | 도메인 |
|--------|--------|
| `bank_accounts` | 은행계좌 |
| `bank_transactions` | 은행거래 |
| `bank_match_rules` | 자동매칭 |
| `loans` / `loan_payments` / `loan_rate_history` | 차입금 |
| `fixed_expenses` | 고정비 |
| `cash_schedule` | 자금계획 |
| `journal_entries` | 분개 |
| `chart_of_accounts` | 계정과목 |
| `budgets` | 예산 |
| `vat_reports` | 부가세 |
| `fixed_assets` / `depreciation_records` | 고정자산 |
| `card_fee_rates` | 카드수수료 |
| `corporate_cards` / `card_transactions` | 법인카드 |
| `expense_categories` / `expense_auto_rules` | 경비분류 |

### 기타
| 테이블 | 도메인 |
|--------|--------|
| `billing_groups` | 청구그룹 |
| `price_lists` | 단가표 |
| `returns` / `return_items` | 반품 |
| `customer_claims` | 클레임 |
| `ai_analysis_requests` | AI분석 |
| `auto_process_jobs` | 자동가공 |
| `order_ai_files` | AI파일 |
| `kakao_send_logs` | 알림로그 |
| `hometax_invoices` / `hometax_jobs` | 홈택스 |
| `approval_requests` / `approval_templates` | 전자결재 |
| `credit_overrides` | 여신 |
| `payment_requests` | 지출결의 |
| `tasks` | 작업 큐 |
| `defect_codes` | 불량코드 |
| `maintenance_schedules` | 정비계획 |
| `activity_logs` | 활동로그 |
| `portal_access_logs` | 포털로그 |

---

## 🔗 부모 FK로 간접 분리 — 28건

> 부모 테이블에 entity_id가 있어 JOIN으로 필터 가능. 직접 entity_id 불필요.

| 테이블 | 부모 테이블 | FK |
|--------|-----------|-----|
| `order_items` | orders | order_id → orders.entity_id |
| `order_status_history` | orders | order_id |
| `card_items` | cards | card_id → cards.requesting_entity_id |
| `card_status_history` | cards | card_id |
| `shipment_items` | shipments | shipment_id |
| `purchase_order_items` | purchase_orders | po_id |
| `purchase_request_items` | purchase_requests | request_id |
| `purchase_payment_items` | purchase_payments | payment_id |
| `purchase_invoice_items` | purchase_invoices | invoice_id |
| `tax_invoice_items` | tax_invoices | invoice_id |
| `tax_invoice_orders` | tax_invoices | invoice_id |
| `journal_lines` | journal_entries | entry_id |
| `inventory_count_items` | inventory_counts | count_id |
| `inventory_receipt_items` | inventory_receipts | receipt_id |
| `inventory_release_items` | inventory_releases | release_id |
| `approval_steps` | approval_templates | template_id |
| `approval_attachments` | approval_requests | request_id |
| `inspection_result_items` | inspection_results | result_id |
| `inspection_template_items` | inspection_templates | template_id |
| `pr_comments` / `pr_status_history` | purchase_requests | request_id |
| `po_status_history` | purchase_orders | po_id |
| `price_policy_rules` | price_policies | policy_id |
| `price_change_history` | - | 이력 참조 |
| `year_end_deduction_items` | year_end_settlements | settlement_id |
| `leave_accrual_logs` | employees | employee_id |
| `email_logs` | - | 시스템 로그 |
| `print_file_map` | print_events | event_id |

---

## 🌐 법인 공유 (설계 결정) — 42건

> 모든 법인이 동일한 마스터 데이터를 사용. entity_id 의도적 미추가.

| 분류 | 테이블 |
|------|--------|
| **품목 마스터** | `items`, `item_categories`, `item_subcategories`, `item_post_processing_defaults` |
| **BOM** | `bom_items` (설계 결정 AF: 법인 간 공유) |
| **후가공** | `finishing_methods`, `finishing_presets`, `post_processing_options`, `pp_applicable_subcategories`, `pp_option_subcategories` |
| **출력 시스템** | `print_methods`, `print_media`, `print_method_media`, `media_material_groups` |
| **설비** | `equipment`, `equipment_heads`, `equipment_presets` |
| **단가** | `client_item_prices`, `client_price_rates`, `cost_standards` |
| **거래처** | `clients` (설계 결정: clients에 entity_id 없음, MEMORY 확인) |
| **검수** | `inspection_templates`, `inspection_template_items` (설계 결정: 법인 공용) |
| **인사 기준** | `leave_types`, `income_tax_table`, `insurance_rates`, `family_event_rules` |
| **템플릿** | `message_templates`, `order_templates`, `po_templates`, `po_template_items` |
| **기타** | `ai_file_chunks`, `ai_layout_requests`, `inventory_items`, `inventory_locations`, `facility_settings`, `facility_zones`, `product_materials` |

---

## ⚙️ 시스템/인프라 — 18건

> entity 개념이 적용되지 않는 시스템 테이블.

`entities`, `users`, `settings`, `entity_settings`, `permission_pages`, `role_page_permissions`, `d1_migrations`, `migration_logs`, `agent_heartbeats`, `caps_employee_map`, `caps_sites`, `caps_sync_log`, `sqlite_sequence`, `maintenance_logs`

---

## 🆕 마이그 0305~0321 신규 테이블/컬럼 entity 점검 (2026-06-19)

> 0265 이후 추가분 중 법인 데이터 보유 테이블만. (권한/시드/데이터복구 마이그는 제외)

| 마이그 | 테이블/컬럼 | entity 처리 | 분류 |
|--------|-------------|-------------|------|
| 0305 | `order_billing_groups` | `entity_id NOT NULL` (청구 법인) | ✅ 분리 완료 (상단 split-billing 참조) |
| 0306 | `order_billing_groups.tax_invoice_id` | 부모 그룹 entity로 격리 | 🔗 간접 |
| 0314 | `original_archives` | `entity_id NOT NULL DEFAULT 1` + idx | ✅ 분리 완료 (시안 원본 아카이브) |
| 0316/0318 | `sheet_layouts` (+ render_status 등) | `entity_id NOT NULL DEFAULT 1` + idx | ✅ 분리 완료 (시트 네스팅 레이아웃) |
| 0312 | `equipment.last_seen_at/print_log_path/agent_id` | equipment = 법인 공유 마스터 | 🌐 공유 (LogWatcher 수집 상태 컬럼) |
| 0311 | `holidays` | 날짜 달력, 전 법인 공통 | 🌐 공유 |
| 0319 | `entity_settings` 시드 (선명 알림톡) | entity_settings = 시스템(법인별 KV) | ⚙️ 시스템 |
| 0321 | `kakao_template_defaults` | `entity_id NOT NULL DEFAULT 1` (발송위치별 기본 템플릿) | ✅ 분리 완료 |
| 0309 | `entities` id=4 오다플래그 | entities 마스터 | ⚙️ 시스템 |

> 0307(workbench 권한)·0308(ia_auto_enabled 설정)·0310(직원 복구)·0313(quality_issues.severity)·0315(ia-editor 권한)·0317(canvas_render 컬럼)·0320(card_tx 분류상태 보정)은 entity 격리 영향 없음.

---

## 라우트 entity 필터 현황

### ⚠️ entityFilter 미사용 + 법인 데이터 접근 라우트
| 라우트 | 접근 테이블 | 위험도 |
|--------|-----------|--------|
| `costs.ts` | cost_snapshots, inventory_auto_deductions | **HIGH** |
| `printEvents.ts` | print_events | **HIGH** |
| `portal.ts` | portal_reorder_requests, portal_access_tokens | **HIGH** |
| `payroll/year-end.ts` | year_end_settlements | **HIGH** |
| `leaves.ts` | leave_requests, leave_balances | **MEDIUM** |
| `inspections.ts` | inspection_results | **MEDIUM** |
| `priceList.ts` | price_policies | **MEDIUM** |
| `messages.ts` | kakao_send_logs 조회 | **MEDIUM** |
| `postProcessing.ts` (GET /stats) | order_items JOIN orders | **MEDIUM** |
