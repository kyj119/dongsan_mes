/**
 * 바로빌 계좌 거래내역 조회 서비스
 */
import { barobillCall, parseXmlArray, assertBarobillQueryOk, stripBarobillErrorRows, type BarobillConfig } from './barobillClient'

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
  assertBarobillQueryOk(result, 'GetBankAccountEx')
  // 미등록 회원사는 오류코드를 목록 1건처럼 담아 보낸다 → 유령 계좌가 화면에 뜬다. 카드 쪽과 짝.
  return stripBarobillErrorRows(parseXmlArray(result, 'BankAccount'), 'GetBankAccountEx')
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

  assertBarobillQueryOk(result, 'GetDailyBankAccountTransLog')
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

  assertBarobillQueryOk(result, 'GetMonthlyBankAccountTransLog')
  const items = parseXmlArray(result, 'BankAccountTransLog') as unknown as BankTransLog[]
  const maxPageMatch = result.match(/<MaxPageNum>(\d+)<\/MaxPageNum>/)

  return {
    items,
    maxPage: maxPageMatch ? parseInt(maxPageMatch[1]) : 1,
  }
}

// ---------------------------------------------------------------------------
// 계좌 수집 등록 / 해지 / 즉시조회 (write)
// ⚠️ 인증정보(BankAccountPwd/WebPwd)는 호출 시 1회만 바로빌로 전송. DB·로그 미저장.
// ---------------------------------------------------------------------------

export interface RegistBankAccountParams {
  collectCycle: string      // 수집주기 (바로빌 CollectCycle 코드)
  bank: string              // 은행코드 (4자리)
  bankAccountType: string   // 계좌 구분 (개인/법인)
  bankAccountNum: string    // 계좌번호 (하이픈 제거)
  bankAccountPwd: string    // 계좌 비밀번호 ⚠️
  webId: string             // 인터넷뱅킹/조회전용 ID ⚠️
  webPwd: string            // 인터넷뱅킹/조회전용 PW ⚠️
  identityNum: string       // 예금주 식별 (사업자번호/생년월일)
  alias?: string
  usage?: string
  foreignCurrencyCodes?: string[]
}

/**
 * 계좌 수집 등록 (RegistBankAccountEx)
 * @returns 바로빌 결과코드 — 1 이상이면 성공, 음수면 오류코드
 */
export async function registBankAccount(config: BarobillConfig, p: RegistBankAccountParams): Promise<number> {
  const result = await barobillCall(config, 'BANKACCOUNT', 'RegistBankAccountEx', {
    CollectCycle: p.collectCycle,
    Bank: p.bank,
    BankAccountType: p.bankAccountType,
    BankAccountNum: p.bankAccountNum,
    BankAccountPwd: p.bankAccountPwd,
    WebId: p.webId,
    WebPwd: p.webPwd,
    IdentityNum: p.identityNum,
    ForeignCurrencyCodes: p.foreignCurrencyCodes || [],
    Alias: p.alias || '',
    Usage: p.usage || '',
  })
  return parseInt(result.trim()) || 0
}

/** 계좌 수집 해지 (StopBankAccount) — 1 이상 성공 */
export async function stopBankAccount(config: BarobillConfig, bankAccountNum: string): Promise<number> {
  const result = await barobillCall(config, 'BANKACCOUNT', 'StopBankAccount', { BankAccountNum: bankAccountNum })
  return parseInt(result.trim()) || 0
}

/** 계좌 즉시조회 요청 (RefreshBankAccount) — 1 이상 성공.
 *  WSDL 순서: CERTKEY, CorpNum, ID, BankAccountNum. ID(담당자) 누락 시 -24005. */
export async function refreshBankAccount(config: BarobillConfig, bankAccountNum: string): Promise<number> {
  const result = await barobillCall(config, 'BANKACCOUNT', 'RefreshBankAccount', { ID: config.senderId || '', BankAccountNum: bankAccountNum })
  return parseInt(result.trim()) || 0
}

/**
 * 경로 B — 바로빌 호스팅 계좌 관리/등록 화면 URL 조회 (GetBankAccountManagementURL).
 * WSDL 순서: CERTKEY, CorpNum, ID, PWD. PWD는 빈 문자열로도 동작(파트너 CERTKEY 인증, 실측 확인).
 * 반환: https://www.barobill.co.kr/interop/?TK=...&TL=BANKACCOUNTMGT (임시 토큰 URL).
 * 이 화면에서 사용자가 은행별 필드를 직접 입력 → 은행이 즉시 검증(계좌비번형/빠른조회형 추측 불필요).
 * 실패 시 바로빌은 음수코드 문자열 반환 → URL(http) 아니면 오류로 처리.
 */
export async function getBankAccountManagementUrl(config: BarobillConfig): Promise<string> {
  const result = await barobillCall(config, 'BANKACCOUNT', 'GetBankAccountManagementURL', { ID: config.senderId || '', PWD: '' })
  // SOAP 응답은 XML 엔티티 인코딩(&amp;) 상태 → URL 파라미터 구분자 복원.
  const url = result.trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`바로빌 관리화면 URL 조회 실패 (응답: ${url.slice(0, 60)})`)
  }
  return url
}
