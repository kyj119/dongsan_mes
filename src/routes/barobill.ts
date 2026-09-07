/**
 * 바로빌 카드/통장 내역 조회 라우트
 * - 등록된 카드/계좌 목록
 * - 일별/월별 내역 조회
 * - 연결 테스트
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import type { BarobillConfig } from '../services/barobillClient'
import { getBarobillBalance } from '../services/barobillClient'
import { getCardList, getDailyCardLog, getMonthlyCardLog } from '../services/barobillCard'
import { getBankAccountList, getDailyBankLog, getMonthlyBankLog } from '../services/barobillBank'
import { getEntityId, entityFilter } from '../utils/entityFilter'
import { getEntityCorpNum, getEntityBarobillSenderId } from '../utils/entitySettings'

const barobillRouter = new Hono<HonoEnv>()
barobillRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))

/** 설정에서 바로빌 config 생성 */
// cron 의 예산 점검(`/api/cron/budget-check`)이 잔액 조회에 같은 설정을 써야 해서 export 한다.
// 별칭을 둔 이유 = 파일 안 호출부 40여 곳을 건드리지 않으려고(이름이 짧아 충돌 위험도 있다).
export { getConfig as getBarobillConfig }

async function getConfig(c: any): Promise<BarobillConfig> {
  // 테스트모드 설정 확인
  const testModeRow = await c.env.DB.prepare(
    "SELECT setting_value FROM settings WHERE setting_key = 'barobill_test_mode'"
  ).first() as { setting_value: string } | null
  const isTest = testModeRow?.setting_value !== '0'

  // CERTKEY는 단일 파트너 키(전역 env) — 바로빌은 1 CERTKEY + 회원사별 CorpNum 모델(검증 완료)
  const certKey = isTest ? c.env.BAROBILL_CERT_KEY : c.env.BAROBILL_CERT_KEY_PROD
  if (!certKey) throw new Error('BAROBILL_CERT_KEY 환경변수 미설정')

  // CorpNum은 법인별 (각 법인 자체 사업자번호로 회원사 등록 — 청주 포함)
  const corpNum = await getEntityCorpNum(c.env.DB, getEntityId(c))
  if (!corpNum || corpNum.length !== 10) throw new Error('사업자등록번호 미설정 (법인별 corpNum 확인)')

  // senderId는 법인별(entity_settings) — corpNum과 짝 맞춤 필수. 선명=sunm2596.
  const senderId = await getEntityBarobillSenderId(c.env.DB, getEntityId(c))

  return { certKey, corpNum, isTest, senderId }
}

// -------------------------------------------------------
// 연결 테스트 & 잔액
// -------------------------------------------------------

// GET /api/barobill/status
barobillRouter.get('/status', async (c) => {
  try {
    const config = await getConfig(c)
    const { getPartnerBalance } = await import('../services/barobillClient')
    // 표시 잔액 = 통합(파트너) 지갑. CERTKEY 단위 공통 실잔액이라 모든 법인 동일값.
    // 회원사 지갑(getBarobillBalance)은 미충전(동산 0)·미등록 법인은 -10001 에러코드가 그대로 노출됨 → 통합 지갑 사용.
    let balance = 0
    try { const p = await getPartnerBalance(config); if (p > 0) balance = p } catch (_) { /* 실패 시 0 유지 */ }
    return c.json({ success: true, data: { balance, isTest: config.isTest, corpNum: config.corpNum } })
  } catch (error: any) {
    console.error('Barobill API error:', error)
    return c.json({ success: false, error: '바로빌 요청 처리 중 오류가 발생했습니다' }, 500)
  }
})

// GET /api/barobill/charge-info — 잔액(회원사·파트너) + 카드/계좌조회 단가 진단
barobillRouter.get('/charge-info', async (c) => {
  try {
    const config = await getConfig(c)
    const { getPartnerBalance, getChargeUnitCost } = await import('../services/barobillClient')
    const corpBalance = await getBarobillBalance(config)
    const safe = async (fn: () => Promise<number>) => { try { return await fn() } catch (e: any) { return `ERR: ${e?.message || 'unknown'}` } }
    const partnerBalance = await safe(() => getPartnerBalance(config))
    const cardDailyCost = await safe(() => getChargeUnitCost(config, 31))   // 카드조회(1일)
    const bankDailyCost = await safe(() => getChargeUnitCost(config, 45))   // 계좌조회(1일)
    const bankHourCost = await safe(() => getChargeUnitCost(config, 43))    // 계좌조회(1시간)
    return c.json({ success: true, data: { corpNum: config.corpNum, isTest: config.isTest, corpBalance, partnerBalance, cardDailyCost, bankDailyCost, bankHourCost } })
  } catch (error: any) {
    console.error('Barobill charge-info error:', error?.message || 'unknown')
    return c.json({ success: false, error: '바로빌 요청 처리 중 오류가 발생했습니다' }, 500)
  }
})

// -------------------------------------------------------
// 카드
// -------------------------------------------------------

// GET /api/barobill/cards — 등록 카드 목록
barobillRouter.get('/cards', async (c) => {
  try {
    const config = await getConfig(c)
    const cards = await getCardList(config)
    return c.json({ success: true, data: cards })
  } catch (error: any) {
    console.error('Barobill API error:', error)
    return c.json({ success: false, error: '바로빌 요청 처리 중 오류가 발생했습니다' }, 500)
  }
})

// GET /api/barobill/cards/logs?card_num=&date=YYYYMMDD 또는 month=YYYYMM
barobillRouter.get('/cards/logs', async (c) => {
  try {
    const config = await getConfig(c)
    const { card_num, date, month, page } = c.req.query()
    const pageNum = parseInt(page || '1')

    if (!card_num) return c.json({ success: false, error: 'card_num 필수' }, 400)

    if (date) {
      const result = await getDailyCardLog(config, card_num, date, pageNum)
      return c.json({ success: true, data: result })
    } else if (month) {
      const result = await getMonthlyCardLog(config, card_num, month, pageNum)
      return c.json({ success: true, data: result })
    } else {
      return c.json({ success: false, error: 'date(YYYYMMDD) 또는 month(YYYYMM) 필수' }, 400)
    }
  } catch (error: any) {
    console.error('Barobill API error:', error)
    return c.json({ success: false, error: '바로빌 요청 처리 중 오류가 발생했습니다' }, 500)
  }
})

// -------------------------------------------------------
// 통장
// -------------------------------------------------------

// GET /api/barobill/bank-accounts — 등록 계좌 목록
barobillRouter.get('/bank-accounts', async (c) => {
  try {
    const config = await getConfig(c)
    const accounts = await getBankAccountList(config)
    return c.json({ success: true, data: accounts })
  } catch (error: any) {
    console.error('Barobill API error:', error)
    return c.json({ success: false, error: '바로빌 요청 처리 중 오류가 발생했습니다' }, 500)
  }
})

// GET /api/barobill/bank-accounts/logs?account_num=&date=YYYYMMDD 또는 month=YYYYMM
barobillRouter.get('/bank-accounts/logs', async (c) => {
  try {
    const config = await getConfig(c)
    const { account_num, date, month, page, direction } = c.req.query()
    const pageNum = parseInt(page || '1')
    const dir = parseInt(direction || '0') // 0:전체, 1:입금, 2:출금

    if (!account_num) return c.json({ success: false, error: 'account_num 필수' }, 400)

    if (date) {
      const result = await getDailyBankLog(config, account_num, date, dir, pageNum)
      return c.json({ success: true, data: result })
    } else if (month) {
      const result = await getMonthlyBankLog(config, account_num, month, dir, pageNum)
      return c.json({ success: true, data: result })
    } else {
      return c.json({ success: false, error: 'date(YYYYMMDD) 또는 month(YYYYMM) 필수' }, 400)
    }
  } catch (error: any) {
    console.error('Barobill API error:', error)
    return c.json({ success: false, error: '바로빌 요청 처리 중 오류가 발생했습니다' }, 500)
  }
})

// -------------------------------------------------------
// 등록 현황 대조 (바로빌 실등록 ↔ MES 플래그)
// -------------------------------------------------------

/**
 * GET /api/barobill/registration-audit — 바로빌에 실제로 등록된 계좌·카드와 MES 플래그를 대조한다.
 *
 * 왜 필요한가: `barobill_registered` 를 **0으로 되돌리는 코드가 없었다**. 해지에 성공해도 1로 남아
 * 「지금 무엇에 요금을 내고 있는가」를 DB 로 판별할 수 없었다(2026-09-07 선명 BC카드 3 실사고 —
 * MES 에서는 삭제됐는데 바로빌에는 살아 있어 요금이 계속 나갔다). 정본은 바로빌이므로 **거기서 받아
 * 우리 것과 맞춰 본다**.
 *
 * ⚠️ 바로빌 계정은 **법인별**(corpNum·senderId)이라 전체모드(entityId=0)에서는 조회 자체가 성립하지 않는다.
 * ⚠️ 목록이 비면 「등록 0건」이 아니라 **수집 설정 실패**일 수 있다(senderId 폴백 → -24005 빈배열).
 *    그래서 `empty_suspicious` 로 표시해 화면이 「없음」과 「못 받았음」을 구분하게 한다.
 */
barobillRouter.get('/registration-audit', async (c) => {
  const entityId = getEntityId(c)
  if (!entityId) {
    return c.json({ success: false, error: '바로빌 계정은 법인별입니다. 법인을 선택한 뒤 조회하세요.' }, 400)
  }

  const norm = (s: any) => String(s ?? '').replace(/[^0-9]/g, '')
  // 주기 필드명 후보. 등록 «파라미터»는 CollectCycle 로 확정돼 있지만(WSDL), 조회 «응답»이 같은
  // 이름을 쓴다는 보장은 없다 — 실제로 못 읽어서 MES 값을 바로빌 값인 양 보여줬다(2026-09-07).
  const CYCLE_KEYS = ['CollectCycle', 'Cycle', 'CollectType', 'CollectCycleType']
  const pick = (r: any, keys: string[]) => {
    for (const k of keys) if (r && r[k] != null && String(r[k]).trim() !== '') return String(r[k]).trim()
    return ''
  }

  const efA = entityFilter(c, 'a')
  const efC = entityFilter(c, 'c')

  // --- MES 쪽 (비활성도 포함한다 — 거짓 플래그가 바로 거기 숨는다)
  const { results: mesAccounts } = await c.env.DB.prepare(`
    SELECT a.id, a.bank_name, a.account_number, a.account_alias, a.is_active,
           a.barobill_registered, a.collect_cycle, a.is_personal,
           COUNT(t.id) AS tx_count, MAX(t.transaction_date) AS last_tx
    FROM bank_accounts a
    LEFT JOIN bank_transactions t ON t.bank_account_id = a.id
    WHERE 1 = 1${efA.clause}
    GROUP BY a.id
    ORDER BY a.id
  `).bind(...efA.params).all<any>()

  const { results: mesCards } = await c.env.DB.prepare(`
    SELECT c.id, c.card_name, c.card_company, c.card_number_last4, c.is_active,
           c.barobill_registered, c.collect_cycle,
           COUNT(t.id) AS tx_count, MAX(t.transaction_date) AS last_tx
    FROM corporate_cards c
    LEFT JOIN card_transactions t ON t.card_id = c.id
    WHERE 1 = 1${efC.clause}
    GROUP BY c.id
    ORDER BY c.id
  `).bind(...efC.params).all<any>()

  const out: any = { entity_id: entityId }

  // --- 계좌
  try {
    const config = await getConfig(c)
    const rows = await getBankAccountList(config)
    // ⚠️ 같은 계좌번호가 MES 에 여러 행일 수 있다(비활성 잔재). 한 행이 매칭을 «가져가 버리면»
    // 진짜 계좌가 「플래그만 켜짐」으로 오표시된다 — 2026-09-07 주거래 하나 …7704(거래 2,700건)가
    // 비활성 중복행에 매칭을 뺏겨 그렇게 떴다. 그래서 소비하지 않고 키가 맞는 행을 «전부» 맞춘다.
    const bbByKey = new Map<string, any[]>()
    for (const r of rows) {
      const k = norm(pick(r, ['BankAccountNum', 'AccountNum']))
      const arr = bbByKey.get(k) || []
      arr.push(r)
      bbByKey.set(k, arr)
    }

    const consumed = new Set<string>()
    const matched: any[] = []
    const onlyMes: any[] = []
    for (const a of mesAccounts as any[]) {
      const key = norm(a.account_number)
      const bb = (bbByKey.get(key) || [])[0]
      const bbCycle = bb ? pick(bb, CYCLE_KEYS) : ''
      const row = {
        id: a.id, name: a.bank_name, number: a.account_number, alias: a.account_alias,
        is_active: a.is_active, flag: a.barobill_registered, is_personal: a.is_personal,
        cycle: bbCycle || a.collect_cycle || '',
        cycle_src: bbCycle ? 'barobill' : (a.collect_cycle ? 'mes' : ''),
        status: bb ? pick(bb, ['BankAccountStatus', 'Status', 'State']) : '',
        tx_count: a.tx_count, last_tx: a.last_tx,
      }
      if (bb) { consumed.add(key); matched.push(row) }
      else if (a.barobill_registered) onlyMes.push(row)
    }
    const onlyBarobill: any[] = []
    for (const [k, arr] of bbByKey) {
      if (consumed.has(k)) continue
      for (const r of arr) onlyBarobill.push({
        number: pick(r, ['BankAccountNum', 'AccountNum']),
        name: pick(r, ['BankName', 'Bank']),
        alias: pick(r, ['Alias']),
        cycle: pick(r, CYCLE_KEYS),
        status: pick(r, ['BankAccountStatus', 'Status', 'State']),
      })
    }
    out.bank = {
      barobill_count: rows.length,
      empty_suspicious: rows.length === 0,
      // 응답 «필드명»은 문서가 아니라 실제 응답이 정본이다. 못 읽는 채로 MES 값을 바로빌 값인 양
      // 보여주면 판단을 그르친다 — 화면이 출처를 밝히려면 무엇이 오는지부터 알아야 한다.
      bb_fields: rows.length ? Object.keys(rows[0]) : [],
      matched, only_mes: onlyMes, only_barobill: onlyBarobill,
    }
  } catch (e: any) {
    out.bank = { error: String(e?.message || e).slice(0, 200) }
  }

  // --- 카드 (매칭키 = 뒤 4자리. 등록/해지 경로가 쓰는 것과 같은 규칙)
  try {
    const config = await getConfig(c)
    const rows = await getCardList(config)
    // ⚠️ GetCardEx 를 CardStatus=0(전체)으로 부르므로 «해지된 카드도 목록에 들어온다».
    // 「목록에 있다 = 요금이 나간다」가 아니다 — 해지 직후의 선명 BC카드 3(…2909)이 그대로
    // 「일치」로 잡혔다(2026-09-07). 상태 원문을 같이 실어 화면이 구분할 수 있게 한다.
    const bbByKey = new Map<string, any[]>()
    for (const r of rows) {
      const k = norm(pick(r, ['CardNum'])).slice(-4)
      const arr = bbByKey.get(k) || []
      arr.push(r)
      bbByKey.set(k, arr)
    }

    const consumed = new Set<string>()
    const matched: any[] = []
    const onlyMes: any[] = []
    for (const cd of mesCards as any[]) {
      const key = String(cd.card_number_last4 || '').slice(-4)
      const bb = key ? (bbByKey.get(key) || [])[0] : undefined
      const bbCycle = bb ? pick(bb, CYCLE_KEYS) : ''
      const row = {
        id: cd.id, name: cd.card_name, company: cd.card_company, last4: cd.card_number_last4,
        is_active: cd.is_active, flag: cd.barobill_registered,
        cycle: bbCycle || cd.collect_cycle || '',
        cycle_src: bbCycle ? 'barobill' : (cd.collect_cycle ? 'mes' : ''),
        status: bb ? pick(bb, ['CardStatus', 'Status', 'State']) : '',
        tx_count: cd.tx_count, last_tx: cd.last_tx,
      }
      if (bb) { consumed.add(key); matched.push(row) }
      else if (cd.barobill_registered) onlyMes.push(row)
    }
    const onlyBarobill: any[] = []
    for (const [k, arr] of bbByKey) {
      if (consumed.has(k)) continue
      for (const r of arr) onlyBarobill.push({
        number: pick(r, ['CardNum']),
        company: pick(r, ['CardCorpName', 'CardCompany', 'CardCorp']),
        alias: pick(r, ['Alias']),
        cycle: pick(r, CYCLE_KEYS),
        status: pick(r, ['CardStatus', 'Status', 'State']),
      })
    }
    out.card = {
      barobill_count: rows.length,
      empty_suspicious: rows.length === 0,
      bb_fields: rows.length ? Object.keys(rows[0]) : [],
      matched, only_mes: onlyMes, only_barobill: onlyBarobill,
    }
  } catch (e: any) {
    out.card = { error: String(e?.message || e).slice(0, 200) }
  }

  out.mismatch_count =
    (out.bank?.only_mes?.length || 0) + (out.bank?.only_barobill?.length || 0) +
    (out.card?.only_mes?.length || 0) + (out.card?.only_barobill?.length || 0)

  return c.json({ success: true, data: out })
})

export default barobillRouter
