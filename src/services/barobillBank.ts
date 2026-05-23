/**
 * 바로빌 계좌 거래내역 조회 서비스
 */
import { barobillCall, parseXmlArray, type BarobillConfig } from './barobillClient'

export interface BankTransLog {
  BankAccountNum: string
  TransRefKey: string       // 거래 고유키 (중복 방지용)
  TransDirection: string    // 입금/출금
  Withdraw: string          // 출금액
  Deposit: string           // 입금액
  Balance: string           // 잔액
  TransDT: string           // 거래일시 (YYYYMMDDHHMMSS)
  TransType: string         // 거래유형
  TransOffice: string       // 거래점
  TransRemark1: string      // 적요1 (입금자명/출금처)
  TransRemark2: string      // 적요2
  CurrencyCode: string
  CmsCode: string
  Memo: string
}

/** 등록된 계좌 목록 조회 */
export async function getBankAccountList(config: BarobillConfig): Promise<any[]> {
  const result = await barobillCall(config, 'BANKACCOUNT', 'GetBankAccountEx', { ID: config.senderId || '', BankAccountStatus: 0 })
  return parseXmlArray(result, 'BankAccount')
}

/** 일별 계좌 거래내역 조회 */
export async function getDailyBankLog(
  config: BarobillConfig,
  bankAccountNum: string,
  baseDate: string,  // YYYYMMDD
  transDirection: number = 0,  // 0:전체, 1:입금, 2:출금
  page: number = 1,
  countPerPage: number = 100
): Promise<{ items: BankTransLog[]; maxPage: number }> {
  const result = await barobillCall(config, 'BANKACCOUNT', 'GetDailyBankAccountTransLog', {
    ID: config.senderId || '',
    BankAccountNum: bankAccountNum,
    BaseDate: baseDate,
    TransDirection: transDirection,
    CountPerPage: countPerPage,
    CurrentPage: page,
    OrderDirection: 0,
  })

  const items = parseXmlArray(result, 'BankAccountTransLog') as unknown as BankTransLog[]
  const maxPageMatch = result.match(/<MaxPageNum>(\d+)<\/MaxPageNum>/)

  return {
    items,
    maxPage: maxPageMatch ? parseInt(maxPageMatch[1]) : 1,
  }
}

/** 월별 계좌 거래내역 조회 */
export async function getMonthlyBankLog(
  config: BarobillConfig,
  bankAccountNum: string,
  baseMonth: string,  // YYYYMM
  transDirection: number = 0,
  page: number = 1,
  countPerPage: number = 100
): Promise<{ items: BankTransLog[]; maxPage: number }> {
  const result = await barobillCall(config, 'BANKACCOUNT', 'GetMonthlyBankAccountTransLog', {
    ID: config.senderId || '',
    BankAccountNum: bankAccountNum,
    BaseMonth: baseMonth,
    TransDirection: transDirection,
    CountPerPage: countPerPage,
    CurrentPage: page,
    OrderDirection: 0,
  })

  const items = parseXmlArray(result, 'BankAccountTransLog') as unknown as BankTransLog[]
  const maxPageMatch = result.match(/<MaxPageNum>(\d+)<\/MaxPageNum>/)

  return {
    items,
    maxPage: maxPageMatch ? parseInt(maxPageMatch[1]) : 1,
  }
}
