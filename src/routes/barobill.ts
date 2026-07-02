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
import { getEntityId } from '../utils/entityFilter'
import { getEntityCorpNum, getEntityBarobillSenderId } from '../utils/entitySettings'

const barobillRouter = new Hono<HonoEnv>()
barobillRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))

/** 설정에서 바로빌 config 생성 */
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

export default barobillRouter
