// ============================================================================
// 팝빌 전자세금계산서 Provider (Cloudflare Workers 호환)
// Linkhub 인증 + Popbill REST API
// ============================================================================

import type { TaxProvider, TaxInvoicePayload, IssueResult, StatusResult } from './taxProvider'
import { getLinkhubToken, popbillApiCall } from './linkhubAuth'

interface PopbillConfig {
  linkedId: string
  secretKey: string          // Base64 encoded
  supplierBRN: string        // 사업자등록번호 (하이픈 제거)
  isTest: boolean
}

// Linkhub 토큰 응답
interface LinkhubToken {
  session_token: string
  serviceID: string
  linkID: string
  usercode: string
  expiration: string
}

export class PopbillProvider implements TaxProvider {
  private config: PopbillConfig

  constructor(config: PopbillConfig) {
    this.config = config
  }

  private get authUrl(): string {
    return this.config.isTest
      ? 'https://auth.linkhub.co.kr'
      : 'https://auth.linkhub.co.kr'
  }

  private get serviceUrl(): string {
    return this.config.isTest
      ? 'https://popbill-test.linkhub.co.kr'
      : 'https://popbill.linkhub.co.kr'
  }

  // ========================================================================
  // Linkhub 토큰 발급 (HMAC-SHA256, Web Crypto API)
  // scope: 110=세금계산서, 140=현금영수증, 170=홈택스세금계산서
  // ========================================================================
  private async getToken(scopes: string[] = ['member', '110']): Promise<string> {
    return getLinkhubToken({
      linkedId: this.config.linkedId,
      secretKey: this.config.secretKey,
      corpNum: this.config.supplierBRN,
      isTest: this.config.isTest,
      scopes
    })
  }

  private async apiCall<T = any>(
    method: string,
    path: string,
    body?: any,
    userId?: string,
    scopes?: string[]
  ): Promise<T> {
    const token = await this.getToken(scopes)
    return popbillApiCall<T>(this.serviceUrl, token, method, path, body, userId)
  }

  // ========================================================================
  // TaxProvider 구현
  // ========================================================================

  async issue(payload: TaxInvoicePayload): Promise<IssueResult> {
    // 팝빌 RegistIssue (즉시발행) 요청 구성
    const taxinvoice: any = {
      writeDate: payload.issueDate,
      chargeDirection: '정과금',
      issueType: '정발행',
      purposeType: '영수',
      taxType: '과세',
      supplyCostTotal: String(payload.supplyAmount),
      taxTotal: String(payload.taxAmount),
      totalAmount: String(payload.totalAmount),
      remark1: payload.notes || '',

      invoicerCorpNum: payload.supplierBRN,
      invoicerCorpName: payload.supplierName,
      invoicerCEOName: payload.supplierRepresentative,
      invoicerAddr: payload.supplierAddress,
      invoicerBizType: payload.supplierBusinessType,
      invoicerBizClass: payload.supplierBusinessItem,
      invoicerEmail: payload.supplierEmail || '',
      invoicerMgtKey: payload.mgtKey,

      invoiceeType: '사업자',
      invoiceeCorpNum: payload.buyerBRN,
      invoiceeCorpName: payload.buyerName,
      invoiceeCEOName: payload.buyerRepresentative,
      invoiceeAddr: payload.buyerAddress,
      invoiceeBizType: payload.buyerBusinessType || '',
      invoiceeBizClass: payload.buyerBusinessItem || '',
      invoiceeEmail1: payload.buyerEmail,

      detailList: payload.items.map(item => ({
        serialNum: item.serialNum,
        purchaseDT: item.itemDate,
        itemName: item.itemName,
        spec: item.specification || '',
        qty: String(item.quantity),
        unitCost: String(item.unitPrice),
        supplyCost: String(item.supplyAmount),
        tax: String(item.taxAmount),
        remark: item.remark || '',
      })),
    }

    if (payload.invoiceType === 'modify') {
      taxinvoice.modifyCode = payload.modifyCode
      taxinvoice.orgNTSConfirmNum = payload.originalNTSApproval
    }

    try {
      const result = await this.apiCall<any>(
        'ISSUE',
        `/Taxinvoice`,
        taxinvoice
      )

      if (result.code && result.code === 1) {
        return {
          success: true,
          ntsApprovalNumber: result.ntsConfirmNum || undefined,
          rawResponse: JSON.stringify(result),
        }
      }

      return {
        success: false,
        errorCode: String(result.code || ''),
        errorMessage: result.message || 'Unknown error',
        rawResponse: JSON.stringify(result),
      }
    } catch (err) {
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
      }
    }
  }

  async cancelIssue(mgtKey: string, reason: string): Promise<IssueResult> {
    try {
      const result = await this.apiCall<any>(
        'CANCELISSUE',
        `/Taxinvoice/SELL/${mgtKey}`,
        { memo: reason }
      )

      return {
        success: result.code === 1,
        errorCode: result.code !== 1 ? String(result.code) : undefined,
        errorMessage: result.code !== 1 ? result.message : undefined,
        rawResponse: JSON.stringify(result),
      }
    } catch (err) {
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
      }
    }
  }

  async getStatus(mgtKey: string): Promise<StatusResult> {
    const result = await this.apiCall<any>(
      'GET',
      `/Taxinvoice/SELL/${mgtKey}`
    )

    return {
      status: result.stateCode ? String(result.stateCode) : 'UNKNOWN',
      ntsApproval: result.ntsconfirmNum || undefined,
      stateCode: result.stateCode,
      stateDT: result.stateDT,
    }
  }

  async checkCorpNum(targetCorpNum: string): Promise<{ taxType: string; state: string; stateDate: string; type: string; rawResponse: string }> {
    const result = await this.apiCall<any>(
      'GET',
      `/CloseDown?CN=${targetCorpNum}`
    )

    // 팝빌 /CloseDown은 배열로 응답 (단건도 배열)
    // e.g. [{ corpNum, taxType, state, stateDate, type }]
    const item = Array.isArray(result) ? result[0] : result

    return {
      taxType: item?.taxType || '',
      state: item?.state || '',
      stateDate: item?.stateDate || '',
      type: item?.type || '',
      rawResponse: JSON.stringify(result)
    }
  }

  async sendEmail(mgtKey: string, receiverEmail: string): Promise<IssueResult> {
    try {
      // 팝빌 SendEmail: POST /Taxinvoice/SELL/{MgtKey}
      // X-HTTP-Method-Override: SENDEMAIL, body: "email@example.com"
      const result = await this.apiCall<any>(
        'SENDEMAIL',
        `/Taxinvoice/SELL/${mgtKey}`,
        receiverEmail  // JSON.stringify가 문자열을 "email@..." 형태로 직렬화
      )
      if (result.code === 1) {
        return { success: true, rawResponse: JSON.stringify(result) }
      }
      return { success: false, errorCode: String(result.code || ''), errorMessage: result.message || 'Unknown', rawResponse: JSON.stringify(result) }
    } catch (err) {
      return { success: false, errorCode: 'NETWORK_ERROR', errorMessage: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  async getPrintURL(mgtKey: string): Promise<{ url: string }> {
    // 팝빌 GetPrintURL: GET /Taxinvoice/SELL/{MgtKey}?TG=PRINT
    const result = await this.apiCall<any>('GET', `/Taxinvoice/SELL/${mgtKey}?TG=PRINT`)
    return { url: result.url || '' }
  }

  async getViewURL(mgtKey: string): Promise<{ url: string }> {
    // 팝빌 GetViewURL: GET /Taxinvoice/SELL/{MgtKey}?TG=TBOX
    const result = await this.apiCall<any>('GET', `/Taxinvoice/SELL/${mgtKey}?TG=TBOX`)
    return { url: result.url || '' }
  }

  async getBalance(): Promise<{ remainPoint: number; partnerPoint: number }> {
    // Linkhub auth 서버에서 포인트 조회 (공식 SDK 방식)
    const token = await this.getToken()
    const serviceID = this.config.isTest ? 'POPBILL_TEST' : 'POPBILL'
    const headers = {
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'CF-WORKERS DONGSAN-MES',
    }

    // 회원 포인트 + 파트너 포인트 동시 조회
    const [pointResp, partnerResp] = await Promise.all([
      fetch(`${this.authUrl}/${serviceID}/Point`, { method: 'GET', headers }),
      fetch(`${this.authUrl}/${serviceID}/PartnerPoint`, { method: 'GET', headers }),
    ])

    if (!pointResp.ok) {
      const err = await pointResp.text()
      throw new Error(`Linkhub balance error: ${pointResp.status} ${err}`)
    }

    const pointResult = await pointResp.json() as { remainPoint: number }
    const partnerResult = partnerResp.ok
      ? await partnerResp.json() as { remainPoint: number }
      : { remainPoint: 0 }

    return {
      remainPoint: pointResult.remainPoint || 0,
      partnerPoint: partnerResult.remainPoint || 0,
    }
  }
  // ========================================================================
  // 현금영수증 API
  // scope: ['member', '140']
  // ========================================================================

  private cashScope = ['member', '140']

  /** 현금영수증 즉시발행 (RegistIssue) */
  async issueCashReceipt(payload: {
    mgtKey: string
    tradeDate: string         // YYYYMMDD
    tradeType: string         // 승인거래
    identityNum: string       // 식별번호
    itemName?: string
    supplyCost: number
    tax: number
    serviceFee?: number
    totalAmount: number
    franchiseCorpNum: string  // 가맹점(공급자) 사업자번호
    franchiseCorpName: string
    franchiseCEOName: string
    smssendYN?: boolean
  }): Promise<IssueResult> {
    const cashbill: any = {
      mgtKey: payload.mgtKey,
      tradeType: payload.tradeType || '승인거래',
      tradeUsage: '지출증빙',
      taxationType: '과세',
      tradeDT: payload.tradeDate,
      identityNum: payload.identityNum,
      itemName: payload.itemName || '',
      supplyCost: String(payload.supplyCost),
      tax: String(payload.tax),
      serviceFee: String(payload.serviceFee || 0),
      totalAmount: String(payload.totalAmount),
      franchiseCorpNum: payload.franchiseCorpNum,
      franchiseCorpName: payload.franchiseCorpName,
      franchiseCEOName: payload.franchiseCEOName,
      smssendYN: payload.smssendYN || false,
    }

    try {
      const result = await this.apiCall<any>(
        'ISSUE',
        `/Cashbill`,
        cashbill,
        undefined,
        this.cashScope
      )

      if (result.code === 1) {
        return {
          success: true,
          ntsApprovalNumber: result.confirmNum || undefined,
          rawResponse: JSON.stringify(result),
        }
      }
      return {
        success: false,
        errorCode: String(result.code || ''),
        errorMessage: result.message || 'Unknown error',
        rawResponse: JSON.stringify(result),
      }
    } catch (err) {
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
      }
    }
  }

  /** 현금영수증 취소발행 (RevokeRegistIssue) */
  async cancelCashReceipt(mgtKey: string, orgConfirmNum: string, orgTradeDate: string): Promise<IssueResult> {
    const cashbill: any = {
      mgtKey: mgtKey,
      tradeType: '취소거래',
      tradeUsage: '지출증빙',
      taxationType: '과세',
      orgConfirmNum: orgConfirmNum,
      orgTradeDate: orgTradeDate,
      supplyCost: '0',
      tax: '0',
      serviceFee: '0',
      totalAmount: '0',
      franchiseCorpNum: this.config.supplierBRN,
    }

    try {
      const result = await this.apiCall<any>(
        'ISSUE',
        `/Cashbill`,
        cashbill,
        undefined,
        this.cashScope
      )

      if (result.code === 1) {
        return { success: true, rawResponse: JSON.stringify(result) }
      }
      return {
        success: false,
        errorCode: String(result.code || ''),
        errorMessage: result.message || 'Unknown error',
        rawResponse: JSON.stringify(result),
      }
    } catch (err) {
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
      }
    }
  }

  /** 현금영수증 상태 조회 (GetInfo) */
  async getCashReceiptStatus(mgtKey: string): Promise<StatusResult> {
    const result = await this.apiCall<any>(
      'GET',
      `/Cashbill/${mgtKey}`,
      undefined,
      undefined,
      this.cashScope
    )

    return {
      status: result.stateCode ? String(result.stateCode) : 'UNKNOWN',
      ntsApproval: result.confirmNum || undefined,
      stateCode: result.stateCode,
      stateDT: result.stateDT,
    }
  }

  /** 현금영수증 인쇄 URL */
  async getCashReceiptPrintURL(mgtKey: string): Promise<{ url: string }> {
    const result = await this.apiCall<any>(
      'GET',
      `/Cashbill/${mgtKey}?TG=PRINT`,
      undefined,
      undefined,
      this.cashScope
    )
    return { url: result.url || '' }
  }

  // ========================================================================
  // 홈택스 세금계산서 수집 API
  // scope: ['member', '170']
  // ========================================================================

  private htScope = ['member', '170']

  /** 홈택스 수집 요청 (RequestJob) */
  async requestHometaxJob(type: 'SELL' | 'BUY', startDate: string, endDate: string): Promise<{ jobId: string }> {
    // GET /HomeTax/Taxinvoice/{CorpNum}?Type={type}&DType=S&SDate={start}&EDate={end}
    const corpNum = this.config.supplierBRN
    const path = `/HomeTax/Taxinvoice/${corpNum}?Type=${type}&DType=S&SDate=${startDate}&EDate=${endDate}`

    const result = await this.apiCall<any>(
      'GET',
      path,
      undefined,
      undefined,
      this.htScope
    )

    if (result.jobID) {
      return { jobId: result.jobID }
    }
    throw new Error(result.message || '홈택스 수집 요청 실패')
  }

  /** 홈택스 작업 상태 조회 (GetJobState) */
  async getHometaxJobState(jobId: string): Promise<{
    state: number
    result: number
    message: string
    jobStartDT: string
    jobEndDT: string
  }> {
    const corpNum = this.config.supplierBRN
    const result = await this.apiCall<any>(
      'GET',
      `/HomeTax/Taxinvoice/${corpNum}/${jobId}/State`,
      undefined,
      undefined,
      this.htScope
    )

    return {
      state: result.jobState ?? result.state ?? 0,
      result: result.jobResult ?? result.result ?? 0,
      message: result.message || '',
      jobStartDT: result.jobStartDT || '',
      jobEndDT: result.jobEndDT || '',
    }
  }

  /** 홈택스 활성 작업 목록 (ListActiveJob) */
  async listHometaxActiveJobs(): Promise<any[]> {
    const corpNum = this.config.supplierBRN
    const result = await this.apiCall<any>(
      'GET',
      `/HomeTax/Taxinvoice/${corpNum}/Jobs`,
      undefined,
      undefined,
      this.htScope
    )
    return Array.isArray(result) ? result : (result.list || [])
  }

  /** 홈택스 수집 결과 검색 (Search) */
  async searchHometaxInvoices(jobId: string, options?: {
    type?: string[]
    taxType?: string[]
    purposeType?: string[]
    taxRegIDType?: string
    taxRegIDYN?: string
    taxRegID?: string
    page?: number
    perPage?: number
    order?: string
  }): Promise<{
    total: number
    perPage: number
    pageNum: number
    list: any[]
  }> {
    const corpNum = this.config.supplierBRN
    const p = options || {}
    const params = new URLSearchParams()
    if (p.type) params.set('Type', p.type.join(','))
    if (p.taxType) params.set('TaxType', p.taxType.join(','))
    if (p.purposeType) params.set('PurposeType', p.purposeType.join(','))
    if (p.taxRegIDType) params.set('TaxRegIDType', p.taxRegIDType)
    if (p.taxRegIDYN) params.set('TaxRegIDYN', p.taxRegIDYN)
    if (p.taxRegID) params.set('TaxRegID', p.taxRegID)
    params.set('Page', String(p.page || 1))
    params.set('PerPage', String(p.perPage || 100))
    if (p.order) params.set('Order', p.order)

    const result = await this.apiCall<any>(
      'GET',
      `/HomeTax/Taxinvoice/${corpNum}/${jobId}?${params.toString()}`,
      undefined,
      undefined,
      this.htScope
    )

    return {
      total: result.total || 0,
      perPage: result.perPage || 100,
      pageNum: result.pageNum || 1,
      list: result.list || [],
    }
  }

  /** 홈택스 수집 결과 요약 (Summary) */
  async getHometaxSummary(jobId: string): Promise<{
    count: number
    supplyCostTotal: number
    taxTotal: number
    totalAmount: number
  }> {
    const corpNum = this.config.supplierBRN
    const result = await this.apiCall<any>(
      'GET',
      `/HomeTax/Taxinvoice/${corpNum}/${jobId}/Summary`,
      undefined,
      undefined,
      this.htScope
    )

    return {
      count: result.count || 0,
      supplyCostTotal: result.supplyCostTotal || 0,
      taxTotal: result.taxTotal || 0,
      totalAmount: result.totalAmount || 0,
    }
  }

  /** 홈택스 인증 관리 팝업 URL */
  async getHometaxCertPopupURL(): Promise<{ url: string }> {
    const corpNum = this.config.supplierBRN
    const result = await this.apiCall<any>(
      'GET',
      `/HomeTax/Taxinvoice/${corpNum}/CertificatePopUpURL`,
      undefined,
      undefined,
      this.htScope
    )
    return { url: result.url || '' }
  }
}

// ========================================================================
// Factory 함수
// ========================================================================
export function createPopbillProvider(
  linkedId: string,
  secretKey: string,
  supplierBRN: string,
  isTest: boolean = true
): TaxProvider {
  return new PopbillProvider({ linkedId, secretKey, supplierBRN, isTest })
}
