// ============================================================================
// CODEF API 클라이언트 (Cloudflare Workers fetch 기반)
// 문서: https://developer.codef.io/
// ============================================================================

import type { D1Database } from '@cloudflare/workers-types'

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------

export type CodefServiceType = 'sandbox' | 'demo' | 'api'

export interface CodefTransactionParams {
  connectedId: string
  organization: string     // 은행 기관 코드 (예: '0004' = 국민은행)
  account: string          // 계좌번호
  startDate: string        // YYYYMMDD
  endDate: string          // YYYYMMDD
  orderBy?: '0' | '1'     // 0=최신순, 1=오래된순 (기본 '0')
}

export interface CodefTransaction {
  resAccountTrDate: string      // 거래일자 YYYYMMDD
  resAccountTrTime: string      // 거래시간 HHmmss
  resAccountIn: string          // 입금금액
  resAccountOut: string         // 출금금액
  resAfterTranBalance: string   // 거래후 잔액
  resAccountDesc1: string       // 적요1 (입금자명 등)
  resAccountDesc2: string       // 적요2
  resAccountDesc3: string       // 적요3
  resAccountDesc4: string       // 적요4
  resTransactionId?: string     // 거래고유번호 (지원 은행에 한함)
}

export interface CodefTransactionResponse {
  result: { code: string; message: string; extraMessage?: string }
  data?: {
    resAccountStartDate: string
    resAccountEndDate: string
    resTrHistoryList: CodefTransaction[]
  }
}

export interface ConnectedIdParams {
  organization: string
  loginType: string       // '0' = 인증서, '1' = ID/PW
  certType?: string
  certFile?: string
  certPassword?: string
  id?: string
  password?: string
}

// ---------------------------------------------------------------------------
// 내부 헬퍼
// ---------------------------------------------------------------------------

/** CODEF 서비스 타입별 베이스 URL */
export function getBaseUrl(serviceType: CodefServiceType): string {
  switch (serviceType) {
    case 'sandbox': return 'https://sandbox.codef.io'
    case 'demo':    return 'https://development.codef.io'
    case 'api':     return 'https://api.codef.io'
    default:        return 'https://sandbox.codef.io'
  }
}

/** settings 테이블에서 단일 값 읽기 */
async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare(
    'SELECT setting_value FROM settings WHERE setting_key = ?'
  ).bind(key).first<{ setting_value: string | null }>()
  return row?.setting_value ?? null
}

/** settings 테이블에 값 저장 (없으면 INSERT, 있으면 UPDATE) */
async function setSetting(db: D1Database, key: string, value: string): Promise<void> {
  await db.prepare(
    'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP'
  ).bind(key, value).run()
}

// ---------------------------------------------------------------------------
// RSA 암호화 (CODEF 비밀번호 암호화용, Web Crypto API)
// ---------------------------------------------------------------------------

/** CODEF 공개키(Base64 DER)로 비밀번호를 RSA-OAEP 암호화 → Base64 반환 */
async function rsaEncrypt(publicKeyB64: string, plaintext: string): Promise<string> {
  const binaryDer = Uint8Array.from(atob(publicKeyB64), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'spki',
    binaryDer.buffer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  )
  const encoded = new TextEncoder().encode(plaintext)
  const encrypted = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, cryptoKey, encoded)
  return btoa(String.fromCharCode(...new Uint8Array(encrypted)))
}

// ---------------------------------------------------------------------------
// 공개 API
// ---------------------------------------------------------------------------

/**
 * CODEF OAuth 액세스 토큰 조회.
 * settings에 캐시된 토큰이 유효하면 재사용, 만료 시 새로 발급.
 */
export async function getAccessToken(db: D1Database): Promise<string> {
  // 캐시 확인
  const cachedToken   = await getSetting(db, 'codef_access_token')
  const tokenExpires  = await getSetting(db, 'codef_token_expires')

  if (cachedToken && tokenExpires) {
    const expiresAt = parseInt(tokenExpires, 10)
    // 만료 60초 전까지 캐시 사용
    if (Date.now() < expiresAt - 60_000) {
      return cachedToken
    }
  }

  // 새 토큰 발급
  const clientId     = await getSetting(db, 'codef_client_id')
  const clientSecret = await getSetting(db, 'codef_client_secret')
  const serviceType  = (await getSetting(db, 'codef_service_type') ?? 'sandbox') as CodefServiceType

  if (!clientId || !clientSecret) {
    throw new Error('CODEF 인증 정보(codef_client_id, codef_client_secret)가 설정되지 않았습니다')
  }

  const basicAuth  = btoa(`${clientId}:${clientSecret}`)

  // CODEF OAuth 토큰 엔드포인트는 모든 환경에서 oauth.codef.io 사용
  const res = await fetch('https://oauth.codef.io/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      'Authorization': `Basic ${basicAuth}`,
    },
    body: 'grant_type=client_credentials',
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`CODEF 토큰 발급 실패 (${res.status}): ${text}`)
  }

  const json = await res.json<{ access_token: string; expires_in: number }>()
  const expiresAt = Date.now() + json.expires_in * 1000

  // 캐시 저장
  await setSetting(db, 'codef_access_token', json.access_token)
  await setSetting(db, 'codef_token_expires', String(expiresAt))

  return json.access_token
}

/**
 * CODEF 은행 거래내역 조회.
 * POST /v1/kr/bank/b/account/transaction-list
 */
export async function fetchTransactions(
  db: D1Database,
  params: CodefTransactionParams
): Promise<CodefTransactionResponse> {
  const serviceType = (await getSetting(db, 'codef_service_type') ?? 'sandbox') as CodefServiceType
  const baseUrl     = getBaseUrl(serviceType)
  const token       = await getAccessToken(db)

  const body = {
    connectedId:      params.connectedId,
    organization:     params.organization,
    account:          params.account,
    startDate:        params.startDate,
    endDate:          params.endDate,
    orderBy:          params.orderBy ?? '0',
    inquiryType:      '0',  // 0=전체, 1=입금, 2=출금
  }

  const res = await fetch(`${baseUrl}/v1/kr/bank/b/account/transaction-list`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`CODEF 거래내역 조회 실패 (${res.status}): ${text}`)
  }

  return res.json<CodefTransactionResponse>()
}

// ---------------------------------------------------------------------------
// 법인카드 승인내역 조회
// POST /v1/kr/card/b/account/approval-list
// ---------------------------------------------------------------------------

export interface CodefCardApprovalParams {
  connectedId: string
  organization: string     // 카드사 기관 코드 (예: '0301' = 신한, '0302' = 현대, '0303' = 삼성 등)
  startDate: string        // YYYYMMDD
  endDate: string          // YYYYMMDD
  orderBy?: '0' | '1'
  cardNo?: string          // 특정 카드번호 (선택)
  memberStoreInfoType?: '0' | '1'  // 0=가맹점명, 1=가맹점번호
}

export interface CodefCardApproval {
  resCardNo: string            // 카드번호
  resApprovalNo: string        // 승인번호
  resUsedDate: string          // 이용일자 YYYYMMDD
  resUsedTime: string          // 이용시간
  resMemberStoreName: string   // 가맹점명
  resUsedAmount: string        // 이용금액
  resInstallmentCount: string  // 할부개월
  resCardName: string          // 카드명
  resCurrency?: string         // 통화
}

export interface CodefCardApprovalResponse {
  result: { code: string; message: string; extraMessage?: string }
  data?: {
    resApprovalList?: CodefCardApproval[]
    [key: string]: any
  }
}

export async function fetchCardApprovals(
  db: D1Database,
  params: CodefCardApprovalParams
): Promise<CodefCardApprovalResponse> {
  const serviceType = (await getSetting(db, 'codef_service_type') ?? 'sandbox') as CodefServiceType
  const baseUrl = getBaseUrl(serviceType)
  const token = await getAccessToken(db)

  const body: Record<string, string> = {
    connectedId: params.connectedId,
    organization: params.organization,
    startDate: params.startDate,
    endDate: params.endDate,
    orderBy: params.orderBy ?? '0',
    memberStoreInfoType: params.memberStoreInfoType ?? '0',
  }
  if (params.cardNo) body.cardNo = params.cardNo

  const res = await fetch(`${baseUrl}/v1/kr/card/b/account/approval-list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`CODEF 카드 승인내역 조회 실패 (${res.status}): ${text}`)
  }
  return res.json<CodefCardApprovalResponse>()
}

// ---------------------------------------------------------------------------
// 고용산재보험 보험료 조회
// POST /v1/kr/public/pp/insurance-payment-list (개인별 부과고지 보험료)
// ---------------------------------------------------------------------------

export interface CodefInsurancePaymentParams {
  connectedId: string
  organization: string     // '0019' = 고용산재보험 토탈서비스
  inquiryType: string      // '0'=고용보험, '1'=산재보험
  startDate: string        // YYYYMM
  endDate: string          // YYYYMM
}

export interface CodefInsurancePayment {
  resCompanyName?: string       // 사업장명
  resEmployeeName?: string      // 근로자명
  resIdentityNo?: string        // 주민번호 (마스킹)
  resPaymentAmount?: string     // 보험료
  resCompanyAmount?: string     // 사업주부담금
  resEmployeeAmount?: string    // 근로자부담금
  resBaseAmount?: string        // 보수월액
  resRate?: string              // 요율
  [key: string]: string | undefined
}

export interface CodefInsuranceResponse {
  result: { code: string; message: string; extraMessage?: string }
  data?: any
}

export async function fetchInsurancePayments(
  db: D1Database,
  params: CodefInsurancePaymentParams
): Promise<CodefInsuranceResponse> {
  const serviceType = (await getSetting(db, 'codef_service_type') ?? 'sandbox') as CodefServiceType
  const baseUrl = getBaseUrl(serviceType)
  const token = await getAccessToken(db)

  const res = await fetch(`${baseUrl}/v1/kr/public/pp/imposing-contribution-list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      connectedId: params.connectedId,
      organization: params.organization || '0019',
      inquiryType: params.inquiryType,
      startDate: params.startDate,
      endDate: params.endDate,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`CODEF 보험료 조회 실패 (${res.status}): ${text}`)
  }
  return res.json<CodefInsuranceResponse>()
}

// ---------------------------------------------------------------------------
// 고용산재보험 근로자 고용정보 현황 조회
// ---------------------------------------------------------------------------

export async function fetchEmploymentInfo(
  db: D1Database,
  connectedId: string,
  identityNo?: string  // 주민번호 (선택, 특정 직원 조회)
): Promise<CodefInsuranceResponse> {
  const serviceType = (await getSetting(db, 'codef_service_type') ?? 'sandbox') as CodefServiceType
  const baseUrl = getBaseUrl(serviceType)
  const token = await getAccessToken(db)

  const body: Record<string, string> = {
    connectedId,
    organization: '0019',
  }
  if (identityNo) body.identity = identityNo

  const res = await fetch(`${baseUrl}/v1/kr/public/pp/employment-detail`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`CODEF 고용정보 조회 실패 (${res.status}): ${text}`)
  }
  return res.json<CodefInsuranceResponse>()
}

// ---------------------------------------------------------------------------
// 국세청 홈택스 전자세금계산서 조회
// ---------------------------------------------------------------------------

export async function fetchTaxInvoices(
  db: D1Database,
  connectedId: string,
  params: { startDate: string; endDate: string; type?: '0' | '1' | '2' }  // 0=전체, 1=매출, 2=매입
): Promise<CodefInsuranceResponse> {
  const serviceType = (await getSetting(db, 'codef_service_type') ?? 'sandbox') as CodefServiceType
  const baseUrl = getBaseUrl(serviceType)
  const token = await getAccessToken(db)

  const res = await fetch(`${baseUrl}/v1/kr/public/pp/taxinvoice-integrated-list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      connectedId,
      organization: '0004',  // 국세청
      startDate: params.startDate,
      endDate: params.endDate,
      inquiryType: params.type ?? '0',
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`CODEF 세금계산서 조회 실패 (${res.status}): ${text}`)
  }
  return res.json<CodefInsuranceResponse>()
}

// ---------------------------------------------------------------------------
// 사업자등록상태 조회 (거래처 검증용)
// ---------------------------------------------------------------------------

export async function checkBusinessStatus(
  db: D1Database,
  businessNumber: string  // 사업자등록번호 (하이픈 없이 10자리)
): Promise<CodefInsuranceResponse> {
  const serviceType = (await getSetting(db, 'codef_service_type') ?? 'sandbox') as CodefServiceType
  const baseUrl = getBaseUrl(serviceType)
  const token = await getAccessToken(db)

  const res = await fetch(`${baseUrl}/v1/kr/public/ck/business-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ organization: '0004', businessNo: businessNumber }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`CODEF 사업자 상태 조회 실패 (${res.status}): ${text}`)
  }
  return res.json<CodefInsuranceResponse>()
}

/**
 * CODEF connectedId 생성.
 * POST /v1/account/create
 */
export async function createConnectedId(
  db: D1Database,
  params: {
    countryCode?: string
    businessType?: string
    clientType?: string
    organization: string
    loginType: string
    id?: string
    password?: string
    [key: string]: string | undefined
  }
): Promise<{ connectedId?: string; result: { code: string; message: string }; data?: any }> {
  const serviceType = (await getSetting(db, 'codef_service_type') ?? 'sandbox') as CodefServiceType
  const baseUrl     = getBaseUrl(serviceType)
  const token       = await getAccessToken(db)

  const accountEntry: Record<string, string> = {
    countryCode:  params.countryCode ?? 'KR',
    businessType: params.businessType ?? 'BK',
    clientType:   params.clientType ?? 'P',
    organization: params.organization,
    loginType:    params.loginType,
  }
  if (params.id) accountEntry.id = params.id

  // RSA 공개키로 비밀번호 암호화 (sandbox 제외)
  if (params.password) {
    if (serviceType !== 'sandbox') {
      try {
        const keyRes = await fetch(`${baseUrl}/v1/account/getPublicKey`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: '{}',
        })
        if (keyRes.ok) {
          const keyJson = await keyRes.json<{ data?: { publicKey?: string } }>()
          const pubKeyB64 = keyJson.data?.publicKey
          if (pubKeyB64) {
            accountEntry.password = await rsaEncrypt(pubKeyB64, params.password)
          } else {
            accountEntry.password = params.password
          }
        } else {
          accountEntry.password = params.password
        }
      } catch (_) {
        accountEntry.password = params.password
      }
    } else {
      accountEntry.password = params.password
    }
  }

  const body = { accountList: [accountEntry] }

  const res = await fetch(`${baseUrl}/v1/account/create`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`CODEF connectedId 생성 실패 (${res.status}): ${text}`)
  }

  return res.json()
}
