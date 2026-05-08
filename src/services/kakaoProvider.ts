// ============================================================================
// 팝빌 카카오톡 알림톡 Provider (Cloudflare Workers 호환)
// 인증: linkhubAuth.ts 공통 모듈 사용
// ============================================================================

import { getLinkhubToken, popbillApiCall, getLinkhubBalance } from './linkhubAuth'

interface KakaoConfig {
  linkedId: string
  secretKey: string        // Base64 encoded
  corpNum: string          // 사업자등록번호 (하이픈 제거)
  isTest: boolean
}

// SMS/LMS 수신자
export interface SMSMessage {
  rcv: string              // 수신번호 (하이픈 포함 가능)
  rcvnm: string            // 수신자명
  msg?: string             // 개별 메시지 (없으면 공통 content 사용)
}

// 알림톡 메시지
export interface ATSMessage {
  rcv: string              // 수신번호 (하이픈 포함 가능)
  rcvnm: string            // 수신자명
  msg: string              // 알림톡 메시지 본문
  altmsg?: string          // 대체문자 (SMS fallback)
  altsjt?: string          // 대체문자 제목
  btns?: Array<{           // 버튼 (최대 5개)
    n: string              // 버튼명
    t: string              // 버튼 타입 (WL: 웹링크, AL: 앱링크, DS: 배송조회, BK: 봇키워드, MD: 메시지전달)
    u1?: string            // 링크1 (모바일)
    u2?: string            // 링크2 (PC)
  }>
}

// 발송 결과
export interface SendResult {
  receiptNum: string       // 접수번호
  code: number             // 응답코드 (1: 성공)
  message: string          // 응답메시지
}

// 알림톡 템플릿
export interface ATSTemplate {
  templateCode: string
  templateName: string
  template: string         // 템플릿 본문
  plusFriendID: string
  ads: string              // 광고 여부
  appendix: string
  btns?: any[]
  state: string            // 승인상태 (R:대기, S:승인, N:반려)
}

export class KakaoProvider {
  private config: KakaoConfig

  constructor(config: KakaoConfig) {
    this.config = config
  }

  private get serviceUrl(): string {
    return this.config.isTest
      ? 'https://popbill-test.linkhub.co.kr'
      : 'https://popbill.linkhub.co.kr'
  }

  private async getToken(scopes?: string[]): Promise<string> {
    return getLinkhubToken({
      linkedId: this.config.linkedId,
      secretKey: this.config.secretKey,
      corpNum: this.config.corpNum,
      isTest: this.config.isTest,
      scopes: scopes || ['member', '153', '154', '155']
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
  // 카카오톡 알림톡 API 메서드
  // ========================================================================

  /**
   * 알림톡 단건 발송
   * POST /ATS
   */
  async sendATS(params: {
    templateCode: string      // 카카오 승인된 템플릿 코드
    snd: string               // 발신번호
    content: string           // 템플릿 본문
    altSendType?: string      // 대체문자 타입 ('C': 알림톡과 동일, 'A': 대체문자 내용)
    messages: ATSMessage[]    // 수신자 목록 (최대 1000)
    sndDT?: string            // 예약전송일시 (yyyyMMddHHmmss)
    requestNum?: string       // 요청번호 (중복방지)
  }): Promise<SendResult> {
    try {
      const payload: any = {
        templateCode: params.templateCode,
        snd: params.snd,
        content: params.content,
        msgs: params.messages,
      }

      if (params.altSendType) {
        payload.altSendType = params.altSendType
      }
      if (params.sndDT) {
        payload.sndDT = params.sndDT
      }
      if (params.requestNum) {
        payload.requestNum = params.requestNum
      }

      const result = await this.apiCall<any>(
        'POST',
        `/ATS`,
        payload
      )

      return {
        receiptNum: result.receiptNum || '',
        code: result.code || 0,
        message: result.message || 'No response',
      }
    } catch (err) {
      return {
        receiptNum: '',
        code: 0,
        message: err instanceof Error ? err.message : 'Unknown error',
      }
    }
  }

  /**
   * SMS 단문 발송 (90byte 이하)
   * POST /SMS
   * scope: 150,151,152 = 문자
   */
  async sendSMS(params: {
    snd: string             // 발신번호
    sndnm?: string          // 발신자명
    content: string         // 공통 내용
    messages: SMSMessage[]  // 수신자 목록 (최대 1000)
    sndDT?: string          // 예약발송 (yyyyMMddHHmmss)
  }): Promise<SendResult> {
    try {
      const payload: any = {
        snd: params.snd,
        content: params.content,
        msgs: params.messages,
      }
      if (params.sndnm) payload.sndnm = params.sndnm
      if (params.sndDT) payload.sndDT = params.sndDT

      const result = await this.apiCall<any>(
        'POST',
        `/SMS`,
        payload,
        undefined,
        ['member', '150', '151', '152']
      )

      return {
        receiptNum: result.receiptNum || '',
        code: result.code || 0,
        message: result.message || 'No response',
      }
    } catch (err) {
      return {
        receiptNum: '',
        code: 0,
        message: err instanceof Error ? err.message : 'Unknown error',
      }
    }
  }

  /**
   * LMS 장문 발송 (2000byte 이하)
   * POST /LMS
   * scope: 150 = 문자
   */
  async sendLMS(params: {
    snd: string             // 발신번호
    sndnm?: string          // 발신자명
    subject?: string        // 제목 (LMS 전용)
    content: string         // 공통 내용
    messages: SMSMessage[]  // 수신자 목록 (최대 1000)
    sndDT?: string          // 예약발송 (yyyyMMddHHmmss)
  }): Promise<SendResult> {
    try {
      const payload: any = {
        snd: params.snd,
        content: params.content,
        msgs: params.messages,
      }
      if (params.sndnm) payload.sndnm = params.sndnm
      if (params.subject) payload.subject = params.subject
      if (params.sndDT) payload.sndDT = params.sndDT

      const result = await this.apiCall<any>(
        'POST',
        `/LMS`,
        payload,
        undefined,
        ['member', '150', '151', '152']
      )

      return {
        receiptNum: result.receiptNum || '',
        code: result.code || 0,
        message: result.message || 'No response',
      }
    } catch (err) {
      return {
        receiptNum: '',
        code: 0,
        message: err instanceof Error ? err.message : 'Unknown error',
      }
    }
  }

  /**
   * 알림톡 템플릿 목록 조회
   * GET /KakaoTalk/ListATSTemplate
   */
  async listATSTemplate(): Promise<ATSTemplate[]> {
    const result = await this.apiCall<any>(
      'GET',
      `/KakaoTalk/ListATSTemplate`
    )

    if (Array.isArray(result)) {
      return result
    }
    if (result.list && Array.isArray(result.list)) {
      return result.list
    }
    return []
  }

  /**
   * 알림톡 전송 결과 조회
   * GET /KakaoTalk/{corpNum}/Messages/{receiptNum}
   */
  async getMessages(receiptNum: string): Promise<any> {
    try {
      const result = await this.apiCall<any>(
        'GET',
        `/ATS/Messages/${receiptNum}`
      )
      return result
    } catch (err) {
      console.error('Error getting ATS messages:', err)
      return null
    }
  }

  /**
   * 발송 단가 조회
   * GET /KakaoTalk/UnitCost?Type=ATS
   */
  async getUnitCost(): Promise<{ unitCost: number }> {
    try {
      const result = await this.apiCall<any>(
        'GET',
        `/KakaoTalk/UnitCost?Type=ATS`
      )

      return {
        unitCost: result.unitCost || 0,
      }
    } catch (err) {
      console.error('Error getting unit cost:', err)
      return { unitCost: 0 }
    }
  }

  /**
   * 잔여 포인트 조회
   * GET /KakaoTalk/{corpNum}/Balance
   */
  async getBalance(): Promise<{ remainPoint: number; partnerPoint: number }> {
    try {
      const token = await this.getToken()
      return getLinkhubBalance(token, this.config.isTest)
    } catch (err) {
      console.error('Error getting balance:', err)
      return { remainPoint: 0, partnerPoint: 0 }
    }
  }
}

// ========================================================================
// Factory 함수
// ========================================================================
export function createKakaoProvider(
  linkedId: string,
  secretKey: string,
  corpNum: string,
  isTest: boolean = true
): KakaoProvider {
  return new KakaoProvider({ linkedId, secretKey, corpNum, isTest })
}
