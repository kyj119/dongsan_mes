// ============================================================================
// ERP+MES System - TypeScript Type Definitions
// File: src/types/models.ts
// ============================================================================

// ============================================================================
// Enums
// ============================================================================

export enum UserRole {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  DESIGNER = 'DESIGNER',
  OPERATOR = 'OPERATOR'
}

export enum OrderStatus {
  QUOTATION = 'QUOTATION',
  CONFIRMED = 'CONFIRMED',
  PRINTING = 'PRINTING',
  PRINT_DONE = 'PRINT_DONE',
  SHIPPED = 'SHIPPED',
  CANCELLED = 'CANCELLED'
}

export enum CardStatus {
  PRINTING = 'PRINTING',
  PRINT_DONE = 'PRINT_DONE',
  HOLD = 'HOLD'
}

// NotificationType enum removed — 인앱 알림은 자유 텍스트 title/message 사용

// ============================================================================
// User & Authentication
// ============================================================================

export interface AuthUser {
  id: number;
  username: string;
  role: string;
  entityId: number;
}

export interface User {
  id: number;
  username: string;
  password_hash: string;
  name: string;
  email?: string;
  phone?: string;
  role: UserRole;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface UserSession {
  id: number;
  user_id: number;
  token: string;
  ip_address?: string;
  user_agent?: string;
  expires_at: string;
  created_at: string;
}

// ============================================================================
// Client (거래처)
// ============================================================================

export interface Client {
  id: number;
  client_code: string;
  client_name: string;
  representative?: string;
  business_registration_number?: string;
  business_type?: string;
  business_item?: string;
  phone?: string;
  mobile?: string;
  fax?: string;
  email?: string;
  address?: string;
  postal_code?: string;
  address_detail?: string;
  search_keywords?: string;
  transfer_info?: string;
  is_active: number;
  balance: number;
  notes?: string;
  // 거래처 분류·배송·결제
  client_type?: 'SALES' | 'PURCHASE' | 'BOTH';
  delivery_method?: 'SAME' | 'FREIGHT' | 'DIRECT' | 'PICKUP';
  delivery_address?: string;
  delivery_invoice_type?: string;
  invoice_method?: string;
  bank_info?: string;
  // 단가 시스템 (구 + 신)
  price_list_id?: number | null;       // 0035 구 단가표 시스템
  price_policy_id?: number | null;     // 0187 신 가격 정책 (Phase 0)
  // 자동 회계반영 (0183)
  auto_billing?: number;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Entity (멀티사업자/법인 — 0145, 0149)
// ============================================================================

export interface Entity {
  id: number;
  name: string;
  short_name?: string;
  business_reg_no?: string;
  representative?: string;
  business_type?: string;
  business_item?: string;
  address?: string;
  phone?: string;
  fax?: string;            // 0185
  email?: string;
  tax_email?: string;
  popbill_corp_num?: string;
  bank_info?: string;
  stamp_base64?: string;   // 0152
  // Phase 1.2: 멀티사업자 이메일 발신 (0190)
  email_from_address?: string;
  email_from_name?: string;
  is_active?: number;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Price Policy (가격 정책 — 0187, Phase 0)
// ============================================================================

export interface PricePolicy {
  id: number;
  name: string;
  description?: string;
  is_default: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface PricePolicyRule {
  id: number;
  policy_id: number;
  category?: string;          // NULL이면 전체 적용
  item_id?: number;           // 특정 품목 우선
  rate_percent: number;       // 양수=할증, 음수=할인
  fixed_price?: number;       // 우선순위 1: 고정가
  sort_order: number;
}

// ============================================================================
// Item (품목)
// ============================================================================

export interface ItemCategory {
  id: number;
  category_name: string;
  category_code: string;
  sort_order: number;
  is_active: number;
  created_at: string;
}

export interface ItemSubcategory {
  id: number;
  category_id: number;
  subcategory_name: string;
  subcategory_code: string;
  sort_order: number;
  is_active: number;
  created_at: string;
}

export interface Item {
  id: number;
  category_id: number;
  subcategory_id?: number;
  item_code: string;
  item_name: string;
  description?: string;
  unit: string;
  base_price: number;
  pricing_method?: 'FIXED' | 'AREA';
  is_active: number;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Post-Processing (후가공)
// ============================================================================

export interface PostProcessingOption {
  id: number;
  option_code: string;
  option_name: string;
  margin_left: number;
  margin_right: number;
  margin_top: number;
  margin_bottom: number;
  additional_cost: number;
  description?: string;
  is_active: number;
  created_at: string;
}

// ============================================================================
// Order (주문)
// ============================================================================

export type BillingStatus = 'PENDING' | 'BILLED' | 'PAID';
export type ReceiptType = 'TAX_INVOICE' | 'CASH_RECEIPT' | 'CARD' | 'SIMPLE';
export type OrderType = 'NORMAL' | 'DISTRIBUTION';

export interface Order {
  id: number;
  order_number: string;
  client_id: number;
  status: OrderStatus;
  order_type?: OrderType;
  order_year?: number;
  order_month?: number;
  reception_location?: string;
  delivery_info?: string;
  delivery_date?: string;
  order_date: string;
  total_amount: number;
  vat_amount: number;
  discount_amount: number;
  final_amount: number;
  notes?: string;
  internal_notes?: string;
  contact_phone?: string;
  contact_mobile?: string;
  shipping_payment?: string;
  // 회계반영 (0102/0183/0189)
  billing_status?: BillingStatus;
  billed_at?: string;
  billed_by?: number;
  billed_amount?: number;
  billable_after?: string;       // 0178: PICKUP +1일 등 회계반영 가능 시점
  receipt_type?: ReceiptType;    // 0189: Phase 1.1 증빙 유형 분류
  // 취소 (0184)
  cancel_reason?: string;
  cancelled_at?: string;
  cancelled_by?: number;
  // 자동 완료
  auto_complete_date?: string;   // 0182
  created_by: number;
  updated_by?: number;
  confirmed_at?: string;
  confirmed_by?: number;
  valid_until?: string;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: number;
  order_id: number;
  item_id: number;
  item_name: string;
  category_name?: string;
  width?: number;
  height?: number;
  quantity: number;
  unit: string;
  unit_price: number;
  amount: number;
  vat_included: number;
  post_processing?: string; // JSON array
  content?: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Card (현장 카드)
// ============================================================================

export interface Card {
  id: number;
  card_number: string;
  order_id: number;
  order_item_id?: number;
  status: CardStatus;
  client_name: string;
  item_name: string;
  category_name: string;
  width: number;
  height: number;
  quantity: number;
  unit: string;
  rip_filename?: string;
  post_processing?: string; // JSON
  final_width?: number;
  final_height?: number;
  delivery_date: string;
  priority: number;
  rip_sent_at?: string;
  rip_preview_path?: string;
  rip_job_path?: string;
  rip_status?: string;
  hold_reason?: string;
  hold_at?: string;
  hold_by?: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Status History
// ============================================================================

export interface OrderStatusHistory {
  id: number;
  order_id: number;
  from_status?: string;
  to_status: string;
  changed_by: number;
  change_reason?: string;
  created_at: string;
}

export interface CardStatusHistory {
  id: number;
  card_id: number;
  from_status?: string;
  to_status: string;
  changed_by: number;
  change_reason?: string;
  created_at: string;
}

// ============================================================================
// Notification (인앱 알림)
// ============================================================================

export interface Notification {
  id: number;
  user_id?: number;
  target_role?: string;
  title: string;
  message?: string;
  link?: string;
  is_read: number;
  created_at: string;
}

// ============================================================================
// System Setting
// ============================================================================

export interface Setting {
  id: number;
  setting_key: string;
  setting_value?: string;
  description?: string;
  updated_by?: number;
  updated_at: string;
}

// ============================================================================
// Purchase Order (발주)
// ============================================================================

export enum PurchaseOrderStatus {
  DRAFT = 'DRAFT',
  CONFIRMED = 'CONFIRMED',
  PARTIAL_RECEIVED = 'PARTIAL_RECEIVED',
  RECEIVED = 'RECEIVED',
  CANCELLED = 'CANCELLED'
}

export enum PurchaseRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CONVERTED = 'CONVERTED'
}

export enum PurchaseRequestUrgency {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  URGENT = 'URGENT'
}

export enum InspectionQualityStatus {
  PASSED = 'PASSED',
  PARTIAL = 'PARTIAL',
  FAILED = 'FAILED'
}

/**
 * inventory_receipts.inspection_status — 검수 워크플로우 상태 (2026-04-15 추가)
 * NULL: 미검수 (입고 후 검수 전)
 * NORMAL: 정상 완료 (문제 없음 또는 관리자가 PARTIAL_ACCEPT로 결정)
 * PENDING_REVIEW: 수량 부족 또는 FAIL 검출 → 관리자 결정 필요
 * WAITING_RESHIP: 관리자가 재입고 대기로 결정 (거래처 추가 발송 요청)
 * CANCELLED: 관리자가 전량 취소로 결정 (receipt.status도 CANCELLED)
 */
export enum InspectionWorkflowStatus {
  NORMAL = 'NORMAL',
  PENDING_REVIEW = 'PENDING_REVIEW',
  WAITING_RESHIP = 'WAITING_RESHIP',
  CANCELLED = 'CANCELLED'
}

/**
 * inspection_results.overall_result — 검수 결과 판정
 */
export enum InspectionOverallResult {
  PENDING = 'PENDING',
  PASSED = 'PASSED',
  FAILED = 'FAILED',
  PARTIAL = 'PARTIAL'
}

/**
 * inspection_result_items.check_result — 개별 항목 결과
 */
export enum InspectionCheckResult {
  PASS = 'PASS',
  FAIL = 'FAIL',
  NA = 'NA'
}

export interface PurchaseRequest {
  id: number;
  request_number: string;
  requester_id: number;
  supplier_id: number | null;
  urgency: PurchaseRequestUrgency;
  status: PurchaseRequestStatus;
  reason: string | null;
  reject_reason: string | null;
  notes: string | null;
  approved_by: number | null;
  approved_at: string | null;
  converted_po_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseRequestItem {
  id: number;
  request_id: number;
  item_id: number | null;
  item_name: string;
  category_name: string | null;
  quantity: number;
  unit: string;
  estimated_unit_price: number;
  admin_unit_price: number | null;
  admin_quantity: number | null;
  sort_order: number;
  notes: string | null;
  created_at: string;
}

export interface PurchaseOrder {
  id: number;
  po_number: string;
  supplier_id: number;
  status: PurchaseOrderStatus;
  order_date: string;
  expected_date?: string;
  total_amount: number;
  vat_amount: number;
  discount_amount: number;
  final_amount: number;
  notes?: string;
  internal_notes?: string;
  created_by: number;
  updated_by?: number;
  confirmed_at?: string;
  confirmed_by?: number;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderItem {
  id: number;
  po_id: number;
  item_id?: number;
  item_name: string;
  category_name?: string;
  quantity: number;
  received_quantity: number;
  unit: string;
  unit_price: number;
  amount: number;
  vat_included: number;
  sort_order: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface PurchasePayment {
  id: number;
  supplier_id: number;
  payment_date: string;
  amount: number;
  payment_method?: string;
  reference_number?: string;
  po_id?: number;
  notes?: string;
  created_by?: number;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Tax Invoice (세금계산서)
// ============================================================================

export type TaxInvoiceStatus = 'DRAFT' | 'ISSUED' | 'SENT' | 'FAILED' | 'CANCELLED'
export type TaxInvoiceType = 'NORMAL' | 'MODIFY'

export interface TaxInvoice {
  id: number;
  invoice_number: string;
  order_id: number;
  invoice_type: TaxInvoiceType;
  modify_code?: string;
  original_invoice_id?: number;

  supplier_brn: string;
  supplier_name: string;
  supplier_representative?: string;
  supplier_address?: string;
  supplier_business_type?: string;
  supplier_business_item?: string;

  buyer_client_id: number;
  buyer_brn: string;
  buyer_name: string;
  buyer_representative?: string;
  buyer_address?: string;
  buyer_business_type?: string;
  buyer_business_item?: string;
  buyer_email?: string;

  supply_amount: number;
  tax_amount: number;
  total_amount: number;

  status: TaxInvoiceStatus;

  nts_approval_number?: string;
  nts_sent_at?: string;
  nts_result_code?: string;
  nts_result_message?: string;

  provider_name?: string;
  provider_invoice_id?: string;
  provider_response?: string;

  issue_date: string;
  notes?: string;

  issued_by?: number;
  cancelled_at?: string;
  cancelled_by?: number;
  cancel_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface TaxInvoiceItem {
  id: number;
  tax_invoice_id: number;
  item_date?: string;
  item_name: string;
  specification?: string;
  quantity: number;
  unit_price: number;
  supply_amount: number;
  tax_amount: number;
  notes?: string;
  sort_order: number;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}
