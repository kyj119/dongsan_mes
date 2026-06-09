/**
 * 바로빌 SMS + 카카오톡 알림톡 Provider
 *
 * WSDL:
 *   SMS: SMS.asmx (SendSMSMessage, SendLMSMessage, SendMessages)
 *   알림톡: KakaoTalk.asmx (SendATKakaotalk, SendATKakaotalks, GetKakaotalkTemplates)
 */
import { barobillCall, parseXmlArray, parseXmlValues, type BarobillConfig } from './barobillClient'

// ── 메시지 타입 (기존 kakaoProvider.ts에서 이관) ──

export interface SMSMessage {
  rcv: string              // 수신번호
  rcvnm: string            // 수신자명
  msg?: string             // 개별 메시지
}

export interface ATSMessage {
  rcv: string              // 수신번호
  rcvnm: string            // 수신자명
  msg: string              // 알림톡 본문
  altmsg?: string          // 대체문자
  altsjt?: string          // 대체문자 제목
  btns?: Array<{
    n: string; t: string; u1?: string; u2?: string
  }>
}

export interface SendResult {
  receiptNum: string
  code: number
  message: string
}

export interface ATSTemplate {
  templateCode: string
  templateName: string
  template: string
  plusFriendID: string
  ads: string
  appendix: string
  btns?: any[]
  state: string
}

export class BarobillSmsProvider {
  private config: BarobillConfig

  constructor(config: BarobillConfig) {
    this.config = config
  }

  // ========================================================================
  // 카카오톡 알림톡
  // ========================================================================

  /** 알림톡 단건/다건 발송 */
  async sendATS(params: {
    templateCode: string
    snd: string               // 발신번호 (SMS 대체 발송용)
    content: string           // 템플릿 본문 (단건용 — 다건은 messages[].msg 사용)
    altSendType?: string
    messages: ATSMessage[]
    sndDT?: string
    requestNum?: string
  }): Promise<SendResult> {
    try {
      if (params.messages.length === 1) {
        // 단건: KakaotalkMessage(복합 타입)가 필요해 raw SOAP로 직접 구성 (sendATSSingle)
        return await this.sendATSSingle(params, params.messages[0])
      } else {
        // 다건 발송
        return await this.sendATSBulk(params)
      }
    } catch (err) {
      return { receiptNum: '', code: 0, message: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  private async sendATSSingle(params: any, msg: ATSMessage): Promise<SendResult> {
    const { buildCustomSoapEnvelope, callSoap } = this.soapHelpers()
    const body = `
      <SendATKakaotalk xmlns="http://ws.baroservice.com/">
        <CERTKEY>${esc(this.config.certKey)}</CERTKEY>
        <CorpNum>${esc(this.config.corpNum)}</CorpNum>
        <SenderID>${esc(this.config.senderId || '')}</SenderID>
        <TemplateName>${esc(params.templateCode)}</TemplateName>
        <SendDT>${esc(params.sndDT || '')}</SendDT>
        <SmsReply>${smsReplyOf(params.altSendType)}</SmsReply>
        <SmsSenderNum>${esc(params.snd)}</SmsSenderNum>
        <KakaotalkMessage>
          <ReceiverName>${esc(msg.rcvnm)}</ReceiverName>
          <ReceiverNum>${esc(msg.rcv)}</ReceiverNum>
          <Title></Title>
          <Message>${esc(msg.msg)}</Message>
          <SmsMessage>${esc(msg.altmsg || '')}</SmsMessage>
        </KakaotalkMessage>
      </SendATKakaotalk>`

    const result = await callSoap('KakaoTalk', 'SendATKakaotalk', body)
    return interpretReceipt(result)
  }

  private async sendATSBulk(params: any): Promise<SendResult> {
    const { callSoap } = this.soapHelpers()
    let msgsXml = ''
    for (const msg of params.messages as ATSMessage[]) {
      msgsXml += `
        <KakaotalkATMessage>
          <ReceiverName>${esc(msg.rcvnm)}</ReceiverName>
          <ReceiverNum>${esc(msg.rcv)}</ReceiverNum>
          <Title></Title>
          <Message>${esc(msg.msg)}</Message>
          <SmsMessage>${esc(msg.altmsg || '')}</SmsMessage>
        </KakaotalkATMessage>`
    }

    const body = `
      <SendATKakaotalks xmlns="http://ws.baroservice.com/">
        <CERTKEY>${esc(this.config.certKey)}</CERTKEY>
        <CorpNum>${esc(this.config.corpNum)}</CorpNum>
        <SenderID>${esc(this.config.senderId || '')}</SenderID>
        <TemplateName>${esc(params.templateCode)}</TemplateName>
        <SendDT>${esc(params.sndDT || '')}</SendDT>
        <SmsReply>${smsReplyOf(params.altSendType)}</SmsReply>
        <SmsSenderNum>${esc(params.snd)}</SmsSenderNum>
        <KakaotalkMessages>${msgsXml}</KakaotalkMessages>
      </SendATKakaotalks>`

    const result = await callSoap('KakaoTalk', 'SendATKakaotalks', body)
    return interpretBulkResult(result)
  }

  // ========================================================================
  // SMS
  // ========================================================================

  /** SMS 단건 발송 */
  async sendSMS(params: {
    snd: string
    sndnm?: string
    content: string
    messages: SMSMessage[]
    sndDT?: string
  }): Promise<SendResult> {
    try {
      if (params.messages.length === 1) {
        const msg = params.messages[0]
        const result = await barobillCall(this.config, 'SMS', 'SendSMSMessage', {
          SenderID: '',
          FromNumber: params.snd,
          ToName: msg.rcvnm || '',
          ToNumber: msg.rcv,
          Contents: msg.msg || params.content,
          SendDT: params.sndDT || '',
          RefKey: '',
        })
        return interpretReceipt(result)
      } else {
        return await this.sendSMSBulk(params, 'SMS')
      }
    } catch (err) {
      return { receiptNum: '', code: 0, message: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  /** LMS 장문 발송 */
  async sendLMS(params: {
    snd: string
    sndnm?: string
    subject?: string
    content: string
    messages: SMSMessage[]
    sndDT?: string
  }): Promise<SendResult> {
    try {
      if (params.messages.length === 1) {
        const msg = params.messages[0]
        const result = await barobillCall(this.config, 'SMS', 'SendLMSMessage', {
          SenderID: '',
          FromNumber: params.snd,
          ToName: msg.rcvnm || '',
          ToNumber: msg.rcv,
          Subject: params.subject || '',
          Contents: msg.msg || params.content,
          SendDT: params.sndDT || '',
          RefKey: '',
        })
        return interpretReceipt(result)
      } else {
        return await this.sendSMSBulk(params, 'LMS')
      }
    } catch (err) {
      return { receiptNum: '', code: 0, message: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  private async sendSMSBulk(params: any, type: 'SMS' | 'LMS'): Promise<SendResult> {
    const { callSoap } = this.soapHelpers()
    let msgsXml = ''
    for (const msg of params.messages as SMSMessage[]) {
      msgsXml += `
        <XMSMessage>
          <SenderNum>${esc(params.snd)}</SenderNum>
          <ReceiverName>${esc(msg.rcvnm || '')}</ReceiverName>
          <ReceiverNum>${esc(msg.rcv)}</ReceiverNum>
          <Message>${esc(msg.msg || params.content)}</Message>
          <RefKey></RefKey>
        </XMSMessage>`
    }

    const body = `
      <SendMessages xmlns="http://ws.baroservice.com/">
        <CERTKEY>${esc(this.config.certKey)}</CERTKEY>
        <CorpNum>${esc(this.config.corpNum)}</CorpNum>
        <SenderID></SenderID>
        <SendCount>${params.messages.length}</SendCount>
        <CutToSMS>${type === 'SMS' ? 'true' : 'false'}</CutToSMS>
        <Messages>${msgsXml}</Messages>
        <SendDT>${esc(params.sndDT || '')}</SendDT>
      </SendMessages>`

    const result = await callSoap('SMS', 'SendMessages', body)
    return interpretReceipt(result)
  }

  // ========================================================================
  // 조회
  // ========================================================================

  /** 카카오 알림톡 채널(발신 프로필) 목록 */
  async listChannels(): Promise<Array<{ channelId: string; channelName: string; status: number }>> {
    const result = await barobillCall(this.config, 'KakaoTalk' as any, 'GetKakaotalkChannels', {})
    return parseXmlArray(result, 'KakaotalkChannel')
      .map(ch => ({
        channelId: ch.ChannelId || '',
        channelName: ch.ChannelName || '',
        status: parseInt(ch.Status || '0', 10),
      }))
      .filter(ch => ch.channelId)
  }

  /**
   * 알림톡 템플릿 목록
   * 바로빌 GetKakaotalkTemplates는 ChannelId가 필수다(빈값 → 에러코드 -31301).
   * 따라서 채널을 먼저 조회한 뒤 채널별 템플릿을 합산한다.
   * 응답 필드(WSDL): KakaotalkTemplate.{ChannelId, TemplateName, TemplateContent, Status(3=승인)}
   */
  async listATSTemplate(): Promise<ATSTemplate[]> {
    try {
      const channels = await this.listChannels()
      const all: ATSTemplate[] = []
      for (const ch of channels) {
        const result = await barobillCall(this.config, 'KakaoTalk' as any, 'GetKakaotalkTemplates', { ChannelId: ch.channelId })
        for (const t of parseXmlArray(result, 'KakaotalkTemplate')) {
          const status = parseInt(t.Status || '0', 10)
          // 음수 Status = 바로빌 에러코드(예: -31301) → 스킵
          if (!t.TemplateName || status < 0) continue
          all.push({
            templateCode: t.TemplateName,        // 발송 시 TemplateName으로 지정
            templateName: t.TemplateName,
            template: t.TemplateContent || '',
            plusFriendID: t.ChannelId || ch.channelId,
            ads: '',
            appendix: t.TemplateExtra || '',
            btns: [],
            state: String(status),               // 3 = 승인
          })
        }
      }
      return all
    } catch (err) {
      console.error('listATSTemplate error:', err)
      return []
    }
  }

  /** 발송 결과 조회 */
  async getMessages(receiptNum: string): Promise<any> {
    try {
      const result = await barobillCall(this.config, 'KakaoTalk' as any, 'GetSendKakaotalk', {
        ID: '',
        ReceiptNum: receiptNum,
      })
      return parseXmlValues(result)
    } catch (err) {
      console.error('getMessages error:', err)
      return null
    }
  }

  /** 잔액 조회 */
  async getBalance(): Promise<{ remainPoint: number; partnerPoint: number }> {
    try {
      const result = await barobillCall(this.config, 'SMS', 'GetBalanceCostAmount', {})
      return { remainPoint: parseFloat(result) || 0, partnerPoint: 0 }
    } catch (err) {
      return { remainPoint: 0, partnerPoint: 0 }
    }
  }

  /** 단가 조회 */
  async getUnitCost(): Promise<{ unitCost: number }> {
    try {
      const result = await barobillCall(this.config, 'KakaoTalk' as any, 'GetChargeUnitCost', { ID: '', ServiceType: 3 })
      return { unitCost: parseFloat(result) || 0 }
    } catch (err) {
      return { unitCost: 0 }
    }
  }

  // ========================================================================
  // SOAP 헬퍼
  // ========================================================================
  private soapHelpers() {
    const config = this.config
    const base = config.isTest ? 'https://testws.baroservice.com' : 'https://ws.baroservice.com'

    async function callSoap(service: string, method: string, bodyContent: string): Promise<string> {
      const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>${bodyContent}</soap:Body>
</soap:Envelope>`

      const resp = await fetch(`${base}/${service}.asmx`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': `http://ws.baroservice.com/${method}`,
        },
        body: envelope,
      })

      const text = await resp.text()
      if (!resp.ok) throw new Error(`SOAP ${resp.status}: ${text.slice(0, 300)}`)

      // Result 태그 추출
      const tag = `${method}Result`
      const startIdx = text.indexOf(`<${tag}>`)
      const endIdx = text.indexOf(`</${tag}>`)
      if (startIdx !== -1 && endIdx !== -1) {
        return text.slice(startIdx + tag.length + 2, endIdx)
      }

      // fault 체크
      const faultMatch = text.match(/<faultstring>(.*?)<\/faultstring>/)
      if (faultMatch) throw new Error(faultMatch[1])

      return text
    }

    function buildCustomSoapEnvelope(bodyContent: string): string {
      return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>${bodyContent}</soap:Body>
</soap:Envelope>`
    }

    return { callSoap, buildCustomSoapEnvelope }
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * SmsReply(대체문자 발송 옵션) 정규화 — 바로빌 유효값: E(템플릿 동일내용 발송)/A(지정 대체문자)/N(미발송).
 * 'Y'는 유효값이 아니라 -31325 "대체문자 유형 오류"를 유발했음.
 * 대체문자(E/A)는 SMS 발신번호 사전등록이 필요하므로, 명시적으로 'E'/'A'일 때만 사용하고
 * 그 외(레거시 'C'/'Y', 빈값 등)는 'N'(미발송)으로 처리해 알림톡이 안전하게 발송되도록 한다.
 */
function smsReplyOf(altSendType: string | undefined): 'E' | 'A' | 'N' {
  if (altSendType === 'E') return 'E'
  if (altSendType === 'A') return 'A'
  return 'N'
}

/**
 * 바로빌 단건 발송 결과 해석.
 * 바로빌 반환(레퍼런스): 실패=음수 문자열(오류코드), 성공=그 외.
 *  - 알림톡 성공 접수번호 = '숫자형식이 아닌 문자열'(예: 영문/혼합 SendKey)
 *  - SMS/LMS 성공 접수번호 = 양수
 *  → '음수면 실패, 그 외 비어있지 않으면 성공'으로 통일 (양수만 성공으로 보면 알림톡 SendKey를 실패로 오판정)
 */
function interpretReceipt(result: string): SendResult {
  const r = (result || '').trim()
  if (!r) return { receiptNum: '', code: 0, message: '발송 실패 (빈 응답)' }
  const num = Number(r)
  if (Number.isFinite(num) && num < 0) {
    return { receiptNum: '', code: Math.trunc(num), message: `발송 실패 (바로빌 코드: ${r})` }
  }
  return { receiptNum: r, code: 1, message: '발송 성공' }
}

/**
 * 바로빌 다건 발송 결과 해석 (SendATKakaotalks → ArrayOfString).
 * <string>접수번호|에러코드</string> 반복 — 음수=에러, 그 외(비숫자 SendKey 등)=접수(성공).
 * 배열이 아니면(단일 문자열) interpretReceipt로 폴백.
 */
function interpretBulkResult(result: string): SendResult {
  const re = /<string>(.*?)<\/string>/gs
  const items: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(result)) !== null) items.push((m[1] || '').trim())
  if (items.length === 0) return interpretReceipt(result)
  let ok = 0, fail = 0, firstReceipt = '', firstErr = 0
  for (const v of items) {
    const n = Number(v)
    if (Number.isFinite(n) && n < 0) { fail++; if (firstErr === 0) firstErr = Math.trunc(n) }
    else if (v) { ok++; if (!firstReceipt) firstReceipt = v }
  }
  if (ok > 0) {
    return { receiptNum: firstReceipt, code: ok, message: `발송 접수 ${ok}건${fail ? `, 실패 ${fail}건` : ''}` }
  }
  return { receiptNum: '', code: firstErr, message: `발송 실패 (${fail}건, 바로빌 코드: ${firstErr || 'empty'})` }
}
