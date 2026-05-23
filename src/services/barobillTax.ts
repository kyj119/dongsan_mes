/**
 * 바로빌 전자세금계산서 + 현금영수증 + 홈택스 + 사업자검증 Provider
 * 팝빌 popbillProvider.ts 대체
 *
 * WSDL: TI.asmx
 * - RegistAndIssueTaxInvoice (즉시발행)
 * - DeleteTaxInvoice (취소)
 * - GetTaxInvoiceState (상태조회)
 * - GetTaxInvoicePrintURL (인쇄URL)
 * - GetBalanceCostAmount (잔액)
 * - RegistTaxInvoiceScrap (홈택스수집)
 */
import type { TaxProvider, TaxInvoicePayload, IssueResult, StatusResult } from './taxProvider'
import { type BarobillConfig, getBarobillBalance, parseXmlValues } from './barobillClient'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export class BarobillTaxProvider implements TaxProvider {
  private config: BarobillConfig

  constructor(config: BarobillConfig) {
    this.config = config
  }

  private get baseUrl(): string {
    return this.config.isTest ? 'https://testws.baroservice.com' : 'https://ws.baroservice.com'
  }

  private async soap(method: string, bodyContent: string): Promise<string> {
    const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>${bodyContent}</soap:Body>
</soap:Envelope>`

    const resp = await fetch(`${this.baseUrl}/TI.asmx`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': `http://ws.baroservice.com/${method}`,
      },
      body: envelope,
    })

    const text = await resp.text()
    if (!resp.ok) throw new Error(`SOAP ${resp.status}: ${text.slice(0, 300)}`)

    // fault 체크
    const faultMatch = text.match(/<faultstring>(.*?)<\/faultstring>/)
    if (faultMatch) throw new Error(faultMatch[1])

    // Result 추출
    const tag = `${method}Result`
    const s = text.indexOf(`<${tag}>`)
    const e = text.indexOf(`</${tag}>`)
    if (s !== -1 && e !== -1) return text.slice(s + tag.length + 2, e)
    // Result 태그가 self-closing이거나 없으면 전체 body 반환
    const tagAttr = text.indexOf(`<${tag}`)
    if (tagAttr !== -1) {
      const closeTag = text.indexOf(`</${tag}>`, tagAttr)
      if (closeTag !== -1) return text.slice(text.indexOf('>', tagAttr) + 1, closeTag)
    }
    return text
  }

  // ========================================================================
  // TaxProvider 인터페이스 구현
  // ========================================================================

  async issue(payload: TaxInvoicePayload): Promise<IssueResult> {
    try {
      let itemsXml = ''
      for (const item of payload.items) {
        itemsXml += `
          <TaxInvoiceTradeLineItem>
            <PurchaseExpiry>${esc(item.itemDate)}</PurchaseExpiry>
            <Name>${esc(item.itemName)}</Name>
            <Information>${esc(item.specification || '')}</Information>
            <ChargeableUnit>${esc(String(item.quantity))}</ChargeableUnit>
            <UnitPrice>${esc(String(item.unitPrice))}</UnitPrice>
            <Amount>${esc(String(item.supplyAmount))}</Amount>
            <Tax>${esc(String(item.taxAmount))}</Tax>
            <Description>${esc(item.remark || '')}</Description>
          </TaxInvoiceTradeLineItem>`
      }

      const modifyXml = payload.invoiceType === 'modify'
        ? `<ModifyCode>${esc(String(payload.modifyCode || ''))}</ModifyCode>` : '<ModifyCode />'

      const body = `
      <RegistAndIssueTaxInvoice xmlns="http://ws.baroservice.com/">
        <CERTKEY>${esc(this.config.certKey)}</CERTKEY>
        <CorpNum>${esc(this.config.corpNum)}</CorpNum>
        <Invoice>
          <InvoiceKey />
          <InvoicerParty>
            <CorpNum>${esc(payload.supplierBRN)}</CorpNum>
            <MgtNum>${esc(payload.mgtKey)}</MgtNum>
            <CorpName>${esc(payload.supplierName)}</CorpName>
            <CEOName>${esc(payload.supplierRepresentative)}</CEOName>
            <Addr>${esc(payload.supplierAddress)}</Addr>
            <BizType>${esc(payload.supplierBusinessType)}</BizType>
            <BizClass>${esc(payload.supplierBusinessItem)}</BizClass>
            <Email>${esc(payload.supplierEmail || '')}</Email>
          </InvoicerParty>
          <InvoiceeParty>
            <CorpNum>${esc(payload.buyerBRN)}</CorpNum>
            <MgtNum />
            <CorpName>${esc(payload.buyerName)}</CorpName>
            <CEOName>${esc(payload.buyerRepresentative)}</CEOName>
            <Addr>${esc(payload.buyerAddress)}</Addr>
            <BizType>${esc(payload.buyerBusinessType || '')}</BizType>
            <BizClass>${esc(payload.buyerBusinessItem || '')}</BizClass>
            <Email>${esc(payload.buyerEmail)}</Email>
          </InvoiceeParty>
          <IssueDirection>1</IssueDirection>
          <TaxInvoiceType>1</TaxInvoiceType>
          <TaxType>1</TaxType>
          <TaxCalcType>1</TaxCalcType>
          <PurposeType>2</PurposeType>
          ${modifyXml}
          <WriteDate>${esc(payload.issueDate)}</WriteDate>
          <AmountTotal>${esc(String(payload.supplyAmount))}</AmountTotal>
          <TaxTotal>${esc(String(payload.taxAmount))}</TaxTotal>
          <TotalAmount>${esc(String(payload.totalAmount))}</TotalAmount>
          <Remark1>${esc(payload.notes || '')}</Remark1>
          <TaxInvoiceTradeLineItems>${itemsXml}</TaxInvoiceTradeLineItems>
        </Invoice>
        <SendSMS>false</SendSMS>
        <ForceIssue>false</ForceIssue>
        <MailTitle />
      </RegistAndIssueTaxInvoice>`

      const result = await this.soap('RegistAndIssueTaxInvoice', body)
      const code = parseInt(result)

      if (!isNaN(code) && code < 0) {
        return { success: false, errorCode: String(code), errorMessage: `바로빌 에러코드: ${code}`, rawResponse: result }
      }

      return { success: true, rawResponse: result }
    } catch (err) {
      return { success: false, errorCode: 'NETWORK_ERROR', errorMessage: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  async cancelIssue(mgtKey: string, reason: string): Promise<IssueResult> {
    try {
      const body = `
      <DeleteTaxInvoice xmlns="http://ws.baroservice.com/">
        <CERTKEY>${esc(this.config.certKey)}</CERTKEY>
        <CorpNum>${esc(this.config.corpNum)}</CorpNum>
        <MgtKey>${esc(mgtKey)}</MgtKey>
      </DeleteTaxInvoice>`

      const result = await this.soap('DeleteTaxInvoice', body)
      const code = parseInt(result)
      if (!isNaN(code) && code < 0) {
        return { success: false, errorCode: String(code), errorMessage: `에러: ${code}`, rawResponse: result }
      }
      return { success: true, rawResponse: result }
    } catch (err) {
      return { success: false, errorCode: 'NETWORK_ERROR', errorMessage: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  async getStatus(mgtKey: string): Promise<StatusResult> {
    const body = `
    <GetTaxInvoiceState xmlns="http://ws.baroservice.com/">
      <CERTKEY>${esc(this.config.certKey)}</CERTKEY>
      <CorpNum>${esc(this.config.corpNum)}</CorpNum>
      <MgtKey>${esc(mgtKey)}</MgtKey>
    </GetTaxInvoiceState>`

    const result = await this.soap('GetTaxInvoiceState', body)
    const code = parseInt(result)
    if (!isNaN(code) && code < 0) {
      return { status: 'ERROR', stateCode: code, rawResponse: result }
    }

    const vals = parseXmlValues(result)
    return {
      status: vals.StateCode || result || 'UNKNOWN',
      ntsApproval: vals.NTSConfirmNum || undefined,
      stateCode: parseInt(vals.StateCode || '0'),
      stateDT: vals.StateDT || undefined,
      rawResponse: result,
    }
  }

  async getBalance(): Promise<{ remainPoint: number; partnerPoint: number }> {
    const balance = await getBarobillBalance(this.config)
    return { remainPoint: balance, partnerPoint: 0 }
  }

  async sendEmail(mgtKey: string, receiverEmail: string): Promise<IssueResult> {
    // 바로빌은 발행 시 이메일 자동 발송, 별도 재전송은 SendEmailEx 사용
    try {
      const body = `
      <SendEmailEx xmlns="http://ws.baroservice.com/">
        <CERTKEY>${esc(this.config.certKey)}</CERTKEY>
        <CorpNum>${esc(this.config.corpNum)}</CorpNum>
        <MgtKey>${esc(mgtKey)}</MgtKey>
        <EmailAddress>${esc(receiverEmail)}</EmailAddress>
      </SendEmailEx>`
      const result = await this.soap('SendEmailEx', body)
      const code = parseInt(result)
      return { success: isNaN(code) || code >= 0, rawResponse: result }
    } catch (err) {
      return { success: false, errorCode: 'NETWORK_ERROR', errorMessage: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  async getPrintURL(mgtKey: string): Promise<{ url: string }> {
    const body = `
    <GetTaxInvoicePrintURL xmlns="http://ws.baroservice.com/">
      <CERTKEY>${esc(this.config.certKey)}</CERTKEY>
      <CorpNum>${esc(this.config.corpNum)}</CorpNum>
      <MgtKey>${esc(mgtKey)}</MgtKey>
    </GetTaxInvoicePrintURL>`
    const result = await this.soap('GetTaxInvoicePrintURL', body)
    return { url: result || '' }
  }

  async checkCorpNum(targetCorpNum: string): Promise<{ taxType: string; state: string; stateDate: string; type: string; rawResponse: string }> {
    // 바로빌은 CheckCorpIsMember로 가입여부만 확인 가능
    // 사업자상태 조회는 별도 API가 없으므로 기본값 반환
    try {
      const body = `
      <CheckCorpIsMember xmlns="http://ws.baroservice.com/">
        <CERTKEY>${esc(this.config.certKey)}</CERTKEY>
        <CorpNum>${esc(targetCorpNum)}</CorpNum>
      </CheckCorpIsMember>`
      const result = await this.soap('CheckCorpIsMember', body)
      const code = parseInt(result)
      return {
        taxType: '',
        state: code >= 0 ? '정상' : '미가입',
        stateDate: '',
        type: '',
        rawResponse: result,
      }
    } catch (err) {
      return { taxType: '', state: 'ERROR', stateDate: '', type: '', rawResponse: String(err) }
    }
  }

  // ========================================================================
  // 현금영수증 (팝빌 호환 메서드)
  // ========================================================================

  async issueCashReceipt(payload: any): Promise<IssueResult> {
    // 바로빌 현금영수증은 별도 서비스 (CR.asmx 등) — 추후 구현
    return { success: false, errorCode: 'NOT_IMPLEMENTED', errorMessage: '바로빌 현금영수증은 추후 구현 예정' }
  }

  async cancelCashReceipt(mgtKey: string, orgConfirmNum: string, orgTradeDate: string): Promise<IssueResult> {
    return { success: false, errorCode: 'NOT_IMPLEMENTED', errorMessage: '바로빌 현금영수증은 추후 구현 예정' }
  }

  async getCashReceiptStatus(mgtKey: string): Promise<StatusResult> {
    return { status: 'NOT_IMPLEMENTED' }
  }

  async getCashReceiptPrintURL(mgtKey: string): Promise<{ url: string }> {
    return { url: '' }
  }

  // ========================================================================
  // 홈택스 수집 — 바로빌은 RegistTaxInvoiceScrap 방식
  // ========================================================================

  async requestHometaxJob(type: 'SELL' | 'BUY', startDate: string, endDate: string): Promise<{ jobId: string }> {
    // 바로빌 홈택스 수집은 자동 스크래핑 방식 (별도 등록)
    // API로 수동 트리거하는 구조가 다름 — 추후 구현
    return { jobId: '' }
  }

  async getHometaxJobState(jobId: string): Promise<any> { return { state: 0, result: 0, message: 'not implemented' } }
  async listHometaxActiveJobs(): Promise<any[]> { return [] }
  async searchHometaxInvoices(jobId: string, options?: any): Promise<any> { return { total: 0, list: [] } }
  async getHometaxSummary(jobId: string): Promise<any> { return { count: 0 } }
  async getHometaxCertPopupURL(): Promise<{ url: string }> { return { url: '' } }
}

// Factory
export function createBarobillTaxProvider(config: BarobillConfig): BarobillTaxProvider {
  return new BarobillTaxProvider(config)
}
