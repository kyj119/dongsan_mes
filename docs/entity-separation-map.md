# 법인 분리(Entity Separation) 현황 지도

> 최종 업데이트: 2026-05-27 | 전체 174 테이블

---

## 한눈에 보기

```
 ✅ 법인 분리 완료 (entity_id 있음)     : 72개 테이블
 ⚠️ 법인 분리 필요 (entity_id 없음, 버그): 14개 테이블
 🔗 부모 FK로 간접 분리 (자식 테이블)    : 28개 테이블
 🌐 법인 공유 (설계 결정)               : 42개 테이블
 ⚙️ 시스템/인프라                       : 18개 테이블
```

---

## ⚠️ 법인 분리 필요 (버그) — 14건

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
| `orders` | 주문 | entity_id |
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
