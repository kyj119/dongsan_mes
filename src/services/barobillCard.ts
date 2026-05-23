/**
 * 바로빌 카드 사용내역 조회 서비스
 */
import { barobillCall, parseXmlArray, type BarobillConfig } from './barobillClient'

export interface CardApprovalLog {
  CardNum: string
  UseDT: string            // 사용일시 (YYYYMMDDHHMMSS)
  ApprovalType: string     // 승인/취소
  ApprovalNum: string      // 승인번호
  ApprovalAmount: string   // 승인금액
  Amount: string           // 공급가액
  Tax: string              // 부가세
  ServiceCharge: string    // 봉사료
  TotalAmount: string      // 총금액
  UseStoreName: string     // 가맹점명
  UseStoreCorpNum: string  // 가맹점 사업자번호
  UseStoreTaxType: string  // 과세유형
  PaymentPlan: string      // 결제방법
  InstallmentMonths: string // 할부개월
  Memo: string
}

/** 등록된 카드 목록 조회 */
export async function getCardList(config: BarobillConfig, id: string = ''): Promise<any[]> {
  const result = await barobillCall(config, 'CARD', 'GetCardEx', { ID: id, CardStatus: 0 })
  return parseXmlArray(result, 'Card')
}

/** 일별 카드 사용내역 조회 */
export async function getDailyCardLog(
  config: BarobillConfig,
  cardNum: string,
  baseDate: string,  // YYYYMMDD
  page: number = 1,
  countPerPage: number = 100
): Promise<{ items: CardApprovalLog[]; maxPage: number; currentPage: number }> {
  const result = await barobillCall(config, 'CARD', 'GetDailyCardApprovalLog', {
    ID: config.senderId || '',
    CardNum: cardNum,
    BaseDate: baseDate,
    CountPerPage: countPerPage,
    CurrentPage: page,
    OrderDirection: 0,
  })

  const items = parseXmlArray(result, 'CardApprovalLog') as unknown as CardApprovalLog[]
  const maxPageMatch = result.match(/<MaxPageNum>(\d+)<\/MaxPageNum>/)
  const currentPageMatch = result.match(/<CurrentPage>(\d+)<\/CurrentPage>/)

  return {
    items,
    maxPage: maxPageMatch ? parseInt(maxPageMatch[1]) : 1,
    currentPage: currentPageMatch ? parseInt(currentPageMatch[1]) : page,
  }
}

/** 월별 카드 사용내역 조회 */
export async function getMonthlyCardLog(
  config: BarobillConfig,
  cardNum: string,
  baseMonth: string,  // YYYYMM
  page: number = 1,
  countPerPage: number = 100
): Promise<{ items: CardApprovalLog[]; maxPage: number }> {
  const result = await barobillCall(config, 'CARD', 'GetMonthlyCardApprovalLog', {
    ID: config.senderId || '',
    CardNum: cardNum,
    BaseMonth: baseMonth,
    CountPerPage: countPerPage,
    CurrentPage: page,
    OrderDirection: 0,
  })

  const items = parseXmlArray(result, 'CardApprovalLog') as unknown as CardApprovalLog[]
  const maxPageMatch = result.match(/<MaxPageNum>(\d+)<\/MaxPageNum>/)

  return {
    items,
    maxPage: maxPageMatch ? parseInt(maxPageMatch[1]) : 1,
  }
}
