/**
 * 바로빌 SOAP API 클라이언트
 * Cloudflare Workers에서 동작하도록 raw XML fetch 방식
 *
 * 엔드포인트:
 *   테스트: https://testws.baroservice.com/{service}.asmx
 *   운영:   https://ws.baroservice.com/{service}.asmx
 *
 * 서비스: TI(세금계산서), SMS(문자/알림톡), FAX(팩스), CARD(카드), BANKACCOUNT(통장)
 */

const TEST_BASE = 'https://testws.baroservice.com'
const PROD_BASE = 'https://ws.baroservice.com'

export type BarobillService = 'TI' | 'SMS' | 'FAX' | 'CARD' | 'BANKACCOUNT'

export interface BarobillConfig {
  certKey: string
  corpNum: string
  isTest: boolean
  senderId?: string  // 바로빌 로그인 ID (예: DONGSAN)
}

/**
 * SOAP envelope 생성
 */
function buildSoapEnvelope(method: string, service: BarobillService, params: Record<string, any>): string {
  const ns = `http://ws.baroservice.com/`
  let paramXml = ''
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) {
      paramXml += `<${key} xsi:nil="true" />`
    } else if (Array.isArray(value)) {
      // ArrayOfString 타입 (예: ForeignCurrencyCodes). 빈 배열은 빈 엘리먼트.
      paramXml += value.length === 0
        ? `<${key} />`
        : `<${key}>${value.map((v) => `<string>${escapeXml(String(v))}</string>`).join('')}</${key}>`
    } else {
      paramXml += `<${key}>${escapeXml(String(value))}</${key}>`
    }
  }
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <${method} xmlns="${ns}">
      ${paramXml}
    </${method}>
  </soap:Body>
</soap:Envelope>`
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * SOAP 응답에서 메서드 결과 추출
 */
function extractResult(xml: string, method: string): string {
  // <MethodResult> 또는 <MethodResponse> 내부의 값 추출
  const resultTag = `${method}Result`
  const startTag = `<${resultTag}>`
  const endTag = `</${resultTag}>`
  const startIdx = xml.indexOf(startTag)
  const endIdx = xml.indexOf(endTag)
  if (startIdx === -1 || endIdx === -1) {
    // 에러 응답 체크
    const faultIdx = xml.indexOf('<faultstring>')
    if (faultIdx !== -1) {
      const faultEnd = xml.indexOf('</faultstring>')
      throw new Error(`SOAP Fault: ${xml.slice(faultIdx + 13, faultEnd)}`)
    }
    return xml
  }
  return xml.slice(startIdx + startTag.length, endIdx)
}

/**
 * XML에서 단순 키-값 파싱 (1-depth)
 */
export function parseXmlValues(xml: string): Record<string, string> {
  const result: Record<string, string> = {}
  const regex = /<(\w+)>(.*?)<\/\1>/gs
  let match
  while ((match = regex.exec(xml)) !== null) {
    result[match[1]] = match[2]
  }
  return result
}

/**
 * XML에서 배열 파싱 (반복 요소)
 */
export function parseXmlArray(xml: string, itemTag: string): Record<string, string>[] {
  const results: Record<string, string>[] = []
  const itemRegex = new RegExp(`<${itemTag}>(.*?)</${itemTag}>`, 'gs')
  let itemMatch
  while ((itemMatch = itemRegex.exec(xml)) !== null) {
    results.push(parseXmlValues(itemMatch[1]))
  }
  return results
}

/**
 * 바로빌 SOAP API 호출
 */
export async function barobillCall(
  config: BarobillConfig,
  service: BarobillService,
  method: string,
  params: Record<string, any> = {}
): Promise<string> {
  const base = config.isTest ? TEST_BASE : PROD_BASE
  const url = `${base}/${service}.asmx`
  const ns = 'http://ws.baroservice.com/'
  const soapAction = `${ns}${method}`

  // certKey와 corpNum은 항상 첫 번째 파라미터
  const fullParams = {
    CERTKEY: config.certKey,
    CorpNum: config.corpNum,
    ...params,
  }

  const envelope = buildSoapEnvelope(method, service, fullParams)

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': soapAction,
    },
    body: envelope,
  })

  const text = await resp.text()

  if (!resp.ok) {
    throw new Error(`Barobill HTTP ${resp.status}: ${text.slice(0, 500)}`)
  }

  return extractResult(text, method)
}

/**
 * Ping 테스트 — 연결 확인용
 */
export async function barobillPing(config: BarobillConfig, service: BarobillService = 'TI'): Promise<string> {
  const base = config.isTest ? TEST_BASE : PROD_BASE
  const url = `${base}/${service}.asmx`
  const ns = `http://ws.baroservice.com/`

  const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Ping xmlns="${ns}">
      <CERTKEY>${escapeXml(config.certKey)}</CERTKEY>
    </Ping>
  </soap:Body>
</soap:Envelope>`

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': `${ns}Ping`,
    },
    body: envelope,
  })

  const text = await resp.text()
  const resultMatch = text.match(/<PingResult>(.*?)<\/PingResult>/)
  return resultMatch ? resultMatch[1] : text.slice(0, 200)
}

/**
 * 회원사 보유금액(포인트) 조회 — 모든 서비스 공통 단일 지갑
 */
export async function getBarobillBalance(config: BarobillConfig): Promise<number> {
  const result = await barobillCall(config, 'TI', 'GetBalanceCostAmount', {})
  return parseFloat(result) || 0
}

/**
 * 파트너 보유금액 조회 (GetBalanceCostAmountOfInterOP) — 회원사 0이어도 파트너 정산 가능 여부 판단용.
 * CERTKEY만 필요하나 barobillCall이 CorpNum도 전송(서버측 무시 기대). 실패 시 throw.
 */
export async function getPartnerBalance(config: BarobillConfig): Promise<number> {
  const result = await barobillCall(config, 'TI', 'GetBalanceCostAmountOfInterOP', {})
  return parseFloat(result) || 0
}

/**
 * 서비스별 단가 조회 (GetChargeUnitCostEx).
 * ChargeCode 예: 31=카드조회(1일), 45=계좌조회(1일), 41~44=계좌조회(10분/30분/1시간/4시간)
 */
export async function getChargeUnitCost(config: BarobillConfig, chargeCode: number): Promise<number> {
  const result = await barobillCall(config, 'TI', 'GetChargeUnitCostEx', { ChargeCode: chargeCode })
  return parseFloat(result) || 0
}
