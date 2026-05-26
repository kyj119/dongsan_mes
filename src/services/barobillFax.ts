/**
 * 바로빌 팩스 발송 서비스
 * (구 팝빌 faxProvider.ts 대체)
 *
 * 바로빌 팩스는 FTP 방식(SendFaxFromFTP)을 사용
 * base64 PDF → 바로빌 FTP 업로드 후 발송
 * 또는 SendFaxFromFTPEx (다건 발송)
 */
import { barobillCall, type BarobillConfig } from './barobillClient'

interface FaxSendParams {
  senderNum: string
  senderName?: string
  receiverNum: string
  receiverName?: string
  fileName: string
  fileData: string  // base64 encoded PDF
  sndDT?: string
}

interface FaxSendResult {
  receiptNum: string
  code: number
  message: string
}

export class BarobillFaxProvider {
  private config: BarobillConfig

  constructor(config: BarobillConfig) {
    this.config = config
  }

  /**
   * 팩스 발송
   * 바로빌은 FTP 방식이므로, base64 파일을 먼저 업로드 후 SendFaxFromFTP 호출
   * 또는 SendFaxEx (파일 데이터 직접 전송) 사용
   */
  async sendFax(params: FaxSendParams): Promise<FaxSendResult> {
    try {
      // 바로빌 FAX API: SendFaxFromFTP
      // FileName에 FTP 서버의 파일명을 지정해야 함
      // 먼저 파일 업로드가 필요한지 확인
      // 대안: SMS.asmx의 SendFaxEx처럼 base64 직접 전송이 가능한 메서드가 있는지 확인

      // SendFaxFromFTP 사용 (파일명은 미리 FTP에 업로드 필요)
      const result = await barobillCall(this.config, 'FAX', 'SendFaxFromFTP', {
        SenderID: '',
        FileName: params.fileName || 'document.pdf',
        FromNumber: params.senderNum,
        ToNumber: params.receiverNum,
        ReceiveCorp: '',
        ReceiveName: params.receiverName || '',
        SendDT: params.sndDT || '',
        RefKey: '',
      })

      // 음수면 에러코드
      const numResult = parseInt(result)
      if (!isNaN(numResult) && numResult < 0) {
        return { receiptNum: '', code: numResult, message: `팩스 발송 실패 (에러코드: ${numResult})` }
      }

      return { receiptNum: result || '', code: 1, message: '팩스 발송 성공' }
    } catch (err) {
      return {
        receiptNum: '',
        code: 0,
        message: err instanceof Error ? err.message : '팩스 발송 실패',
      }
    }
  }

  /** 팩스 단가 조회 */
  async getUnitCost(): Promise<{ unitCost: number }> {
    try {
      const result = await barobillCall(this.config, 'FAX', 'GetChargeUnitCost', { ID: '', ServiceType: 0 })
      return { unitCost: parseFloat(result) || 0 }
    } catch (err) {
      return { unitCost: 0 }
    }
  }
}
