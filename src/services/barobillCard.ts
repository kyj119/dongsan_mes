/**
 * 바로빌 카드 사용내역 조회 서비스
 */
import { barobillCall, parseXmlArray, assertBarobillQueryOk, stripBarobillErrorRows, type BarobillConfig } from './barobillClient'

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
  assertBarobillQueryOk(result, 'GetCardEx')
  // 미등록 회원사는 오류코드를 목록 1건처럼 담아 보낸다 → 유령 카드가 화면에 뜬다. 계좌 쪽과 짝.
  return stripBarobillErrorRows(parseXmlArray(result, 'Card'), 'GetCardEx')
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

  assertBarobillQueryOk(result, 'GetDailyCardApprovalLog')
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

  assertBarobillQueryOk(result, 'GetMonthlyCardApprovalLog')
  const items = parseXmlArray(result, 'CardApprovalLog') as unknown as CardApprovalLog[]
  const maxPageMatch = result.match(/<MaxPageNum>(\d+)<\/MaxPageNum>/)

  return {
    items,
    maxPage: maxPageMatch ? parseInt(maxPageMatch[1]) : 1,
  }
}

// ---------------------------------------------------------------------------
// 카드 수집 등록 / 해지 / 즉시조회 (write)
// ⚠️ 인증정보(WebPwd)는 호출 시 1회만 바로빌로 전송. DB·로그 미저장.
// ---------------------------------------------------------------------------

export interface RegistCardParams {
  collectCycle: string    // 수집주기 (바로빌 CollectCycle 코드)
  cardCompany: string     // 카드사 코드 (바로빌 CardCompany 코드)
  cardType: string        // 카드 구분 (개인/법인)
  cardNum: string         // 카드번호 (하이픈 제거)
  webId: string           // 카드사 홈페이지 ID ⚠️
  webPwd: string          // 카드사 홈페이지 PW ⚠️
  alias?: string
  usage?: string
}

/**
 * 카드 수집 등록 (RegistCardEx)
 * @returns 바로빌 결과코드 — 1 이상이면 성공, 음수면 오류코드
 */
export async function registCard(config: BarobillConfig, p: RegistCardParams): Promise<number> {
  const result = await barobillCall(config, 'CARD', 'RegistCardEx', {
    CollectCycle: p.collectCycle, // WSDL 요소명 = CollectCycle (계좌 API와 동일 스펠). 카드 유효값=DAY1
    CardCompany: p.cardCompany,
    CardType: p.cardType,
    CardNum: p.cardNum,
    WebId: p.webId,
    WebPwd: p.webPwd,
    Alias: p.alias || '',
    Usage: p.usage || '',
  })
  return parseInt(result.trim()) || 0
}

/** 카드 수집 해지 (StopCard) — 1 이상 성공 */
export async function stopCard(config: BarobillConfig, cardNum: string): Promise<number> {
  const result = await barobillCall(config, 'CARD', 'StopCard', { CardNum: cardNum })
  return parseInt(result.trim()) || 0
}

/** 카드 즉시조회 요청 (RefreshCard) — 1 이상 성공.
 *  WSDL 순서: CERTKEY, CorpNum, ID, CardNum. ID(담당자) 누락 시 -24005. */
export async function refreshCard(config: BarobillConfig, cardNum: string): Promise<number> {
  const result = await barobillCall(config, 'CARD', 'RefreshCard', { ID: config.senderId || '', CardNum: cardNum })
  return parseInt(result.trim()) || 0
}
