/**
 * Linkhub 인증 공통 모듈
 * kakaoProvider, faxProvider, popbillProvider에서 공유
 *
 * CF Workers에서 필수: x-lh-forwarded: * (IP 제한 해제)
 * HMAC 서명 대상에 forwardIP 포함
 */

const LINKHUB_API_VERSION = '2.0'
const AUTH_URL = 'https://auth.linkhub.co.kr'

export interface LinkhubTokenConfig {
  linkedId: string
  secretKey: string    // Base64 encoded
  corpNum: string
  isTest: boolean
  scopes: string[]
}

export async function getLinkhubToken(config: LinkhubTokenConfig): Promise<string> {
  const forwardIP = '*'  // Cloudflare Workers: IP 제한 해제
  const serviceID = config.isTest ? 'POPBILL_TEST' : 'POPBILL'

  const body = JSON.stringify({
    access_id: config.corpNum,
    scope: config.scopes
  })

  // SHA-256 body digest
  const bodyBytes = new TextEncoder().encode(body)
  const hashBuffer = await crypto.subtle.digest('SHA-256', bodyBytes)
  const bodyDigest = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)))

  // Current UTC time
  const xDate = new Date().toISOString()

  // HMAC-SHA256 signature (forwardIP 포함)
  const uri = `/${serviceID}/Token`
  const digestTarget = [
    'POST',
    bodyDigest,
    xDate,
    forwardIP,
    LINKHUB_API_VERSION,
    uri
  ].join('\n')

  const keyBytes = Uint8Array.from(atob(config.secretKey), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sigBuffer = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(digestTarget))
  const signature = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)))

  const resp = await fetch(`${AUTH_URL}${uri}`, {
    method: 'POST',
    headers: {
      'x-lh-date': xDate,
      'x-lh-version': LINKHUB_API_VERSION,
      'x-lh-forwarded': forwardIP,
      'Authorization': `LINKHUB ${config.linkedId} ${signature}`,
      'Content-Type': 'application/json',
      'User-Agent': 'CF-WORKERS DONGSAN-MES',
    },
    body,
  })

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Linkhub token error: ${resp.status} ${err}`)
  }

  const token = await resp.json() as { session_token: string }
  return token.session_token
}

/**
 * Popbill API 호출 헬퍼
 */
export async function popbillApiCall<T = any>(
  serviceUrl: string,
  token: string,
  method: string,
  path: string,
  body?: any,
  userId?: string
): Promise<T> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json;charset=utf-8',
    'Accept-Encoding': 'gzip,deflate',
    'User-Agent': 'CF-WORKERS DONGSAN-MES',
  }
  if (method !== 'GET' && method !== 'POST') {
    headers['X-HTTP-Method-Override'] = method
  }
  if (userId) {
    headers['x-pb-userid'] = userId
  }

  const url = `${serviceUrl}${path}`
  const resp = await fetch(url, {
    method: method === 'GET' ? 'GET' : 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!resp.ok) {
    const errText = await resp.text()
    throw new Error(`Popbill API error: ${resp.status} ${errText}`)
  }

  return await resp.json() as T
}

/**
 * Linkhub Balance 조회 (포인트 잔액)
 */
export async function getLinkhubBalance(
  token: string,
  isTest: boolean
): Promise<{ remainPoint: number; partnerPoint: number }> {
  const serviceID = isTest ? 'POPBILL_TEST' : 'POPBILL'
  const headers = {
    'Authorization': `Bearer ${token}`,
    'User-Agent': 'CF-WORKERS DONGSAN-MES',
  }

  const [pointResp, partnerResp] = await Promise.all([
    fetch(`${AUTH_URL}/${serviceID}/Point`, { method: 'GET', headers }),
    fetch(`${AUTH_URL}/${serviceID}/PartnerPoint`, { method: 'GET', headers }),
  ])

  let remainPoint = 0
  let partnerPoint = 0

  if (pointResp.ok) {
    const data = await pointResp.json() as any
    remainPoint = typeof data === 'number' ? data : (data?.Point || 0)
  }
  if (partnerResp.ok) {
    const data = await partnerResp.json() as any
    partnerPoint = typeof data === 'number' ? data : (data?.Point || 0)
  }

  return { remainPoint, partnerPoint }
}
