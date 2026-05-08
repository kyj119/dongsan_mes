// ============================================================================
// 전자세금계산서 Provider 인터페이스
// ============================================================================

export interface TaxInvoicePayload {
  // 공급자
  supplierBRN: string       // 사업자등록번호 (하이픈 제거)
  supplierName: string
  supplierRepresentative: string
  supplierAddress: string
  supplierBusinessType: string
  supplierBusinessItem: string

  supplierEmail?: string            // 공급자 이메일 (팝빌 발행 알림용)

  // 공급받는자
  buyerBRN: string
  buyerName: string
  buyerRepresentative: string
  buyerAddress: string
  buyerBusinessType?: string        // 업태
  buyerBusinessItem?: string        // 종목
  buyerEmail: string

  // 금액
  supplyAmount: number      // 공급가액
  taxAmount: number         // 세액
  totalAmount: number       // 합계

  // 메타
  mgtKey: string            // 관리번호 (내부 식별용)
  issueDate: string         // YYYYMMDD
  invoiceType: 'normal' | 'modify'
  modifyCode?: number       // 수정사유코드 1~5
  originalNTSApproval?: string

  items: TaxInvoiceItemPayload[]
  notes?: string
}

export interface TaxInvoiceItemPayload {
  serialNum: number
  itemDate: string          // YYYYMMDD
  itemName: string
  specification?: string
  quantity: number
  unitPrice: number
  supplyAmount: number
  taxAmount: number
  remark?: string
}

export interface IssueResult {
  success: boolean
  ntsApprovalNumber?: string
  errorCode?: string
  errorMessage?: string
  rawResponse?: string
}

export interface StatusResult {
  status: string
  ntsApproval?: string
  stateCode?: number
  stateDT?: string
  rawResponse?: string
}

export interface TaxProvider {
  /** 즉시발행 (RegistIssue) */
  issue(payload: TaxInvoicePayload): Promise<IssueResult>
  /** 발행취소 */
  cancelIssue(mgtKey: string, reason: string): Promise<IssueResult>
  /** 상태 조회 */
  getStatus(mgtKey: string): Promise<StatusResult>
  /** 잔여 포인트/건수 확인 */
  getBalance(): Promise<{ remainPoint: number; partnerPoint: number }>
  /** 이메일 재전송 */
  sendEmail(mgtKey: string, receiverEmail: string): Promise<IssueResult>
  /** 인쇄용 URL 조회 */
  getPrintURL(mgtKey: string): Promise<{ url: string }>
  /** 사업자번호 상태 조회 */
  checkCorpNum(corpNum: string): Promise<any>
}
