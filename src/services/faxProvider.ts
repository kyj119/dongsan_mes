/**
 * 팝빌 팩스 발송 서비스
 * 인증: linkhubAuth.ts 공통 모듈 사용
 */

import { getLinkhubToken } from './linkhubAuth'

interface FaxSendParams {
  senderNum: string
  senderName?: string
  receiverNum: string
  receiverName?: string
  fileName: string
  fileData: string  // base64 encoded PDF/image
  sndDT?: string    // 예약발송 yyyyMMddHHmmss
}

interface FaxSendResult {
  receiptNum: string
  code: number
  message: string
}

export class FaxProvider {
  private linkedId: string
  private secretKey: string
  private corpNum: string
  private serviceUrl: string
  private serviceID: string

  constructor(opts: {
    linkedId: string
    secretKey: string
    corpNum: string
    testMode?: boolean
  }) {
    this.linkedId = opts.linkedId
    this.secretKey = opts.secretKey
    this.corpNum = opts.corpNum
    this.serviceID = opts.testMode ? 'POPBILL_TEST' : 'POPBILL'
    this.serviceUrl = opts.testMode
      ? 'https://popbill-test.linkhub.co.kr'
      : 'https://popbill.linkhub.co.kr'
  }

  private async getToken(): Promise<string> {
    return getLinkhubToken({
      linkedId: this.linkedId,
      secretKey: this.secretKey,
      corpNum: this.corpNum,
      isTest: this.serviceID === 'POPBILL_TEST',
      scopes: ['member', '160', '161', '162']
    })
  }

  /**
   * 팩스 발송
   * 팝빌 API: POST /{corpNum}/FAX (multipart/form-data)
   */
  async sendFax(params: FaxSendParams): Promise<FaxSendResult> {
    const token = await this.getToken()

    // base64 → binary
    const binaryStr = atob(params.fileData)
    const bytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i)
    }

    // 팝빌 FAX 발송 JSON form
    const faxBody: any = {
      snd: params.senderNum,
      sndnm: params.senderName || '',
      rcvs: [{
        rcv: params.receiverNum,
        rcvnm: params.receiverName || '',
      }],
    }
    if (params.sndDT) {
      faxBody.sndDT = params.sndDT
    }

    // multipart/form-data 구성
    const formData = new FormData()
    formData.append('form', JSON.stringify(faxBody))

    const blob = new Blob([bytes], { type: 'application/pdf' })
    formData.append('file', blob, params.fileName || 'document.pdf')

    const resp = await fetch(`${this.serviceUrl}/FAX`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    })

    const result = await resp.json() as any

    if (result.code && result.code < 0) {
      return {
        receiptNum: '',
        code: result.code,
        message: result.message || '팩스 발송 실패',
      }
    }

    return {
      receiptNum: result.receiptNum || '',
      code: result.code || 1,
      message: result.message || '성공',
    }
  }

  /**
   * 팩스 발송 단가 조회
   */
  async getUnitCost(): Promise<{ unitCost: number }> {
    const token = await this.getToken()
    const resp = await fetch(`${this.serviceUrl}/FAX/UnitCost`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    })
    const data = await resp.json() as any
    return { unitCost: data.unitCost || 0 }
  }
}
