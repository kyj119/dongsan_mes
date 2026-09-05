// ============================================================================
// 은행 거래내역 연동 API
// 모든 엔드포인트: authMiddleware + requireRole('ADMIN')
// ============================================================================

import { Hono } from 'hono'
import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { validatePayment, preparePaymentStatements } from '../lib/payments'
import { normalizeCounterpart, stripBankPrefix, isNonCounterpartName } from '../utils/counterpartName'
import { entityFilter, getEntityId } from '../utils/entityFilter'
import { excludeArExcludedClientsSql } from '../constants/arPolicy'
import { getEntityCorpNum, getEntityBarobillSenderId } from '../utils/entitySettings'
import { loadProvision, agingCategoryToBucket, effectiveLossRate } from '../utils/provisionMatrix'
import { buildOldestUnpaidJoin, agingDaysFromOldest, getAgingCategory } from './ledger/ar-helpers'
import { computeExpectedPaymentDate } from '../utils/paymentSchedule'
import { escapeCsvField } from '../utils/csv'
import { kstYmd, kstYmdCompact, kstYear } from '../utils/kstDate'
import { counterpartKey, unescapeCounterpart } from '../utils/counterpart'
import { LATEST_BALANCE_SUBQUERY, isInCashPlan } from '../utils/bankBalance'

const bankRouter = new Hono<HonoEnv>()

bankRouter.use('/*', authMiddleware)

// H5: 무인 auto-match/sync가 매칭 실패건(UNMATCHED 잔존)을 매일 전건 재스캔하며 대상 집합이
//     무한 성장하는 것 방지. 스캔 대상을 최근 N일 + 오래된 순 상한으로 제한(매칭 알고리즘 자체는 불변).
const MATCH_LOOKBACK_DAYS = 90
const MATCH_SCAN_CAP = 500

/**
 * 계좌간 이체 수수료 허용폭(원). 보내는 계좌에서 수수료가 함께 빠져나가
 * 출금액 = 입금액 + 수수료(보통 500)가 된다. 정확일치만 보면 이 건들이 통째로 안 붙는다.
 * (2026-08-12 실측: 동산 자기앞 송금 129건 중 정확일치 54.9% → 수수료 허용 96.5%)
 */
const TRANSFER_FEE_MAX = 2000

/** KST 기준 (오늘 - days)를 YYYYMMDD(무구분자, transaction_date 저장형식)로 반환. */
function lookbackYmd(days: number): string {
  const d = new Date(Date.now() + 9 * 3600000 - days * 86400000)
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
}

/** 바로빌 SOAP config 생성 (법인별 corpNum, 단일 파트너 CERTKEY). 미설정 시 throw. */
async function getBarobillConfig(c: any) {
  const testModeRow = await c.env.DB.prepare(
    "SELECT setting_value FROM settings WHERE setting_key = 'barobill_test_mode'"
  ).first() as { setting_value: string } | null
  const isTest = testModeRow?.setting_value !== '0'
  const certKey = isTest ? c.env.BAROBILL_CERT_KEY : c.env.BAROBILL_CERT_KEY_PROD
  if (!certKey) throw new Error('BAROBILL_CERT_KEY 미설정')
  const corpNum = await getEntityCorpNum(c.env.DB, getEntityId(c))
  if (!corpNum) throw new Error('사업자등록번호 미설정 (법인별 corpNum 확인)')
  // senderId는 법인별(entity_settings) — corpNum과 짝 맞춤 필수. 선명=sunm2596.
  const senderId = await getEntityBarobillSenderId(c.env.DB, getEntityId(c))
  return { certKey, corpNum, isTest, senderId }
}

// ---------------------------------------------------------------------------
// 계좌 관리
// ---------------------------------------------------------------------------

// GET /api/bank/accounts — 연결 계좌 목록
bankRouter.get('/accounts', requireRole('ADMIN'), async (c) => {
  try {
    const ef = entityFilter(c, 'bank_accounts')
    const { results } = await c.env.DB.prepare(
      `SELECT id, bank_code, bank_name, account_number, account_holder, account_alias, is_overdraft, is_personal, include_in_cash_plan, connected_id, is_active, last_synced_at, last_synced_date, entity_id, created_at, barobill_registered, collect_cycle, barobill_registered_at FROM bank_accounts WHERE is_active = 1${ef.clause} ORDER BY created_at DESC, id DESC`
    ).bind(...ef.params).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('Bank error:', error)
    return c.json({ success: false, error: '서버 서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /api/bank/fund-summary — 계좌별 현재잔액 + 총자금/순자금 + 대출 목록
//   현재잔액 = 계좌별 최신 거래의 balance_after(파생).
//   마이너스통장(is_overdraft=1)은 예금이 아니라 한도대출 사용액이라 총 계좌잔액에서 분리한다.
//   0539: 대표자 개인통장(is_personal=1)은 **법인 자금이 아니다** — 목록에는 남기되 total/deposit/net 어디에도 넣지 않는다.
//     입금(수금) 반영 용도로만 살려 둔 계좌라 거래내역·매칭에는 그대로 있다. getTotalBankBalance·재무상태 현금과 같은 기준.
//   순자금 = (예금 + 마이너스통장 잔액) − Σ대출잔액 — 기존 정의 그대로(마통은 잔액이 음수로 이미 반영).
bankRouter.get('/fund-summary', requireRole('ADMIN'), async (c) => {
  try {
    const ef = entityFilter(c, 'ba')
    const { results } = await c.env.DB.prepare(
      `SELECT
        ba.id, ba.bank_name, ba.account_number, ba.account_holder, ba.account_alias,
        ba.is_overdraft, ba.is_personal, ba.include_in_cash_plan, ba.barobill_registered, ba.last_synced_at,
        ${LATEST_BALANCE_SUBQUERY} AS current_balance,
        (SELECT MAX(bt.transaction_date) FROM bank_transactions bt
          WHERE bt.bank_account_id = ba.id) AS last_tx_date
      FROM bank_accounts ba
      WHERE ba.is_active = 1${ef.clause}
      ORDER BY ba.created_at DESC, ba.id DESC`
    ).bind(...ef.params).all<{
      current_balance: number | null; is_overdraft: number; is_personal: number; include_in_cash_plan: number | null
    }>()

    // 개인통장은 어떤 합계에도 넣지 않는다. 화면에는 별도 줄로 보여준다.
    const corporate = results.filter(a => !a.is_personal)
    const personalAccounts = results.filter(a => !!a.is_personal)
    const personalBalance = personalAccounts.reduce((s, a) => s + (Number(a.current_balance) || 0), 0)

    const totalBalance = corporate.reduce((s, a) => s + (Number(a.current_balance) || 0), 0)
    const depositBalance = corporate.filter(a => !a.is_overdraft)
      .reduce((s, a) => s + (Number(a.current_balance) || 0), 0)
    const overdraftAccounts = corporate.filter(a => !!a.is_overdraft)
    const overdraftBalance = overdraftAccounts.reduce((s, a) => s + (Number(a.current_balance) || 0), 0)
    // 자금계획 시작잔액(0574) — 판정은 utils/bankBalance 의 isInCashPlan 하나만 쓴다.
    //   여기서 규칙을 다시 쓰면 계획 탭과 실적 탭이 서로 다른 시작잔액을 말하게 된다.
    const cashPlanBalance = results.filter(isInCashPlan)
      .reduce((s, a) => s + (Number(a.current_balance) || 0), 0)

    // 대출 목록 + 합계 (loans, entity 필터) — 자금현황에서 대출을 분리해 상세 확인
    const loanEf = entityFilter(c, 'loans')
    const { results: loans } = await c.env.DB.prepare(
      `SELECT id, creditor, loan_number, original_amount, current_balance, current_rate, rate_type,
              repayment_type, monthly_payment_day, monthly_payment_amount, maturity_date, maturity_confirmed,
              updated_at
       FROM loans WHERE is_active = 1${loanEf.clause}
       ORDER BY current_balance DESC, id DESC`
    ).bind(...loanEf.params).all<{ current_balance: number }>()
    const loanTotal = loans.reduce((s, l) => s + (Number(l.current_balance) || 0), 0)

    return c.json({
      success: true,
      data: {
        accounts: results,
        total_balance: totalBalance,          // 마통 포함 전체 합 (하위호환)
        deposit_balance: depositBalance,      // 마이너스통장 제외 예금 합
        overdraft_balance: overdraftBalance,  // 마이너스통장 잔액 합 (통상 음수 = 사용액)
        overdraft_count: overdraftAccounts.length,
        cash_plan_balance: cashPlanBalance,   // 자금계획 예측이 출발점으로 쓰는 잔액(0574)
        personal_balance: personalBalance,    // 대표자 개인통장 잔액 합 (총자금·순자금에 미포함)
        personal_count: personalAccounts.length,
        loan_total: loanTotal,
        loan_count: loans.length,
        net_funds: totalBalance - loanTotal,
        loans,
      },
    })
  } catch (error) {
    console.error('Fund summary error:', error)
    return c.json({ success: false, error: '자금현황 조회 오류' }, 500)
  }
})

// GET /api/bank/fixed-expense-status — 당월 고정비 출금 현황(체크리스트)
//   고정비 × 기간(YYYY-MM, 기본=당월 KST) LEFT JOIN 실적 → PAID/OVERDUE/PENDING.
bankRouter.get('/fixed-expense-status', requireRole('ADMIN'), async (c) => {
  try {
    const period = c.req.query('period') || kstYmd().slice(0, 7) // YYYY-MM
    const ef = entityFilter(c, 'fe')
    const { results } = await c.env.DB.prepare(`
      SELECT fe.id, fe.name, fe.category, fe.amount AS base_amount, fe.payment_day, fe.amount_type,
        rea.estimated_amount, rea.actual_amount, rea.actual_source
      FROM fixed_expenses fe
      LEFT JOIN recurring_expense_actuals rea ON rea.fixed_expense_id = fe.id AND rea.period = ?
      WHERE fe.is_active = 1 AND fe.frequency = 'MONTHLY'${ef.clause}
      ORDER BY fe.payment_day, fe.name
    `).bind(period, ...ef.params).all<{
      id: number; name: string; category: string; base_amount: number
      payment_day: number | null; amount_type: string | null
      estimated_amount: number | null; actual_amount: number | null; actual_source: string | null
    }>()

    const today = kstYmd() // YYYY-MM-DD
    const curPeriod = today.slice(0, 7)
    const todayDay = Number(today.slice(8, 10))
    const CAT_LABEL: Record<string, string> = {
      RENT: '임대료', INSURANCE: '보험', UTILITY: '공과금', LEASE: '리스', SALARY: '급여', TAX: '세금', OTHER: '기타',
    }

    const items = results.map(r => {
      let status = 'PENDING'
      if (r.actual_amount != null) status = 'PAID'
      else if (period < curPeriod) status = 'OVERDUE'
      else if (period === curPeriod && r.payment_day && todayDay > r.payment_day) status = 'OVERDUE'
      return {
        id: r.id,
        name: r.name,
        category: r.category,
        category_label: CAT_LABEL[r.category] || r.category,
        payment_day: r.payment_day,
        estimated_amount: r.estimated_amount != null ? r.estimated_amount : r.base_amount,
        actual_amount: r.actual_amount,
        actual_source: r.actual_source,
        status,
      }
    })
    return c.json({ success: true, data: { period, items } })
  } catch (error) {
    console.error('Fixed expense status error:', error)
    return c.json({ success: false, error: '고정비 현황 조회 오류' }, 500)
  }
})

// POST /api/bank/accounts — 계좌 등록
// 반복 출금에서 **미등록 정기지출**을 찾는다. 2026-08-05 에 이 방식으로 월 15,872,480 을 찾았다.
//   통장이 먼저고 세무장부가 확인이다 — 판관비 계정만 훑으면 비정기 거래에 묻혀 정기분이 안 보인다.
bankRouter.get('/recurring-candidates', requireRole('ADMIN'), async (c) => {
  try {
    const minMonths = Math.max(2, Number(c.req.query('min_months') || 5))
    const minAmount = Math.max(0, Number(c.req.query('min_amount') || 30000))
    const from = c.req.query('from') || `${kstYear() - 1}0101`
    const ef = entityFilter(c)

    const { results } = await c.env.DB.prepare(`
      SELECT counterpart_name AS cp, transaction_date AS d, amount
      FROM bank_transactions
      WHERE transaction_type = 'WITHDRAWAL' AND transaction_date >= ?
        AND counterpart_name IS NOT NULL AND counterpart_name <> ''${ef.clause}
    `).bind(from, ...ef.params).all<{ cp: string; d: string; amount: number }>()

    // 정규화 키로 묶는다 — 같은 상대가 채널·경유은행 표기 때문에 갈리면 반복이 안 보인다.
    const groups = new Map<string, { names: Set<string>; months: Set<string>; amts: number[] }>()
    for (const r of results) {
      const key = counterpartKey(r.cp)
      if (!key) continue
      let g = groups.get(key)
      if (!g) { g = { names: new Set(), months: new Set(), amts: [] }; groups.set(key, g) }
      g.names.add(r.cp); g.months.add(String(r.d).slice(0, 6)); g.amts.push(r.amount)
    }

    // 이미 고정비·차입금으로 추적 중인 상대는 후보에서 뺀다(중복 등록 방지).
    //   차입금 상환도 매월 정액이라 빼지 않으면 후보 목록이 계속 시끄럽다.
    const efFe = entityFilter(c)
    const { results: known } = await c.env.DB.prepare(
      `SELECT counterpart_name AS cp, name FROM fixed_expenses WHERE 1=1${efFe.clause}`
    ).bind(...efFe.params).all<{ cp: string | null; name: string }>()
    const efLoan = entityFilter(c)
    const { results: knownLoans } = await c.env.DB.prepare(
      `SELECT creditor, loan_number FROM loans WHERE is_active = 1${efLoan.clause}`
    ).bind(...efLoan.params).all<{ creditor: string; loan_number: string | null }>()
    const knownKeys = new Set<string>()
    for (const k of known || []) {
      if (k.cp) knownKeys.add(counterpartKey(k.cp))
      if (k.name) knownKeys.add(counterpartKey(k.name))
    }
    for (const l of knownLoans || []) {
      if (l.creditor) knownKeys.add(counterpartKey(l.creditor))
      if (l.loan_number) knownKeys.add(counterpartKey(l.loan_number))
    }

    const items = [...groups.entries()]
      .map(([key, g]) => {
        const avg = Math.round(g.amts.reduce((s, n) => s + n, 0) / g.amts.length)
        const mn = Math.min(...g.amts), mx = Math.max(...g.amts)
        return {
          key, months: g.months.size, count: g.amts.length,
          avg_amount: avg, min_amount: mn, max_amount: mx,
          // 편차가 크면 사용량 변동비(전기·수도)일 가능성이 높다 → 고정비가 아니라 변동비 트랙.
          variable: mn > 0 && mx / mn >= 2,
          aliases: [...g.names],
          registered: knownKeys.has(key),
        }
      })
      .filter(i => i.months >= minMonths && i.avg_amount >= minAmount && !i.registered)
      .sort((a, b) => b.avg_amount - a.avg_amount)

    return c.json({ success: true, data: { from, min_months: minMonths, min_amount: minAmount, items } })
  } catch (error) {
    console.error('Recurring candidates error:', error)
    return c.json({ success: false, error: '반복 지출 탐지 오류' }, 500)
  }
})

bankRouter.post('/accounts', requireRole('ADMIN'), async (c) => {
  try {
    const body = await c.req.json()
    const {
      bank_code, bank_name, account_number, account_holder, account_alias, is_overdraft, is_personal,
      include_in_cash_plan,
      barobill_sync, account_password, web_id, web_pwd, identity_num,
      collect_cycle, account_type,
    } = body

    if (!bank_code || !bank_name || !account_number) {
      return c.json({
        success: false,
        error: 'bank_code, bank_name, account_number 필수'
      }, 400)
    }

    const entityId = getEntityId(c)
    let barobillRegistered = 0
    let cycle: string | null = null

    // 바로빌 자동 수집등록 (RegistBankAccountEx). 인증정보는 1회 전송, DB/로그 미저장.
    if (barobill_sync) {
      const { registBankAccount } = await import('../services/barobillBank')
      const { BAROBILL_COLLECT_CYCLE, BAROBILL_BANK_ACCOUNT_TYPE, toBarobillBank, barobillErrorMessage, getBankAuthRequirement } = await import('../constants/barobillCodes')
      const bbBank = toBarobillBank(bank_code)
      if (!bbBank) {
        return c.json({ success: false, error: '선택한 은행은 바로빌 계좌조회를 지원하지 않습니다 (카카오·토스뱅크 제외).' }, 400)
      }
      // 은행별 필수 인증항목 사전 검증 — 크립틱 코드(-5021X) 대신 뭘 채워야 하는지 명시.
      const req = getBankAuthRequirement(bank_code)
      const missing: string[] = []
      if (!identity_num) missing.push(account_type === 'P' ? '예금주 생년월일 6자리' : '예금주 사업자번호')
      if (req.pwd && !account_password) missing.push('계좌비밀번호')
      if (req.webId && !web_id) missing.push(req.webPwd ? '조회전용 ID' : '인터넷뱅킹 ID')
      if (req.webPwd && !web_pwd) missing.push('조회전용 PW')
      if (missing.length) {
        return c.json({ success: false, error: `${bank_name} 계좌조회 등록에 필요한 항목이 비어 있습니다: ${missing.join(', ')}. (${req.hint})` }, 400)
      }
      const config = await getBarobillConfig(c)
      const cyc: string = collect_cycle || BAROBILL_COLLECT_CYCLE.DEFAULT
      cycle = cyc
      const acctType = account_type || BAROBILL_BANK_ACCOUNT_TYPE.CORPORATE
      const identityDigits = String(identity_num).replace(/-/g, '')
      const acctDigits = String(account_number).replace(/-/g, '')
      const code = await registBankAccount(config, {
        collectCycle: cyc,
        bank: bbBank,
        bankAccountType: acctType,
        bankAccountNum: acctDigits,
        bankAccountPwd: account_password || '',
        webId: web_id || '',
        webPwd: web_pwd || '',
        identityNum: identityDigits,
        alias: account_holder || bank_name,
      })
      // 진단 로그 (값 미기록: 비번/ID/식별번호 원문 절대 로그 금지 — 존재여부·길이·코드만)
      console.log(
        '[barobill-regist] entity=%s corpLen=%d bank=%s(%s) type=%s cycle=%s hasPwd=%s hasWebId=%s hasWebPwd=%s identityLen=%d acctLen=%d -> raw=%d',
        getEntityId(c), (config.corpNum || '').length, bbBank, bank_code, acctType, cyc,
        !!account_password, !!web_id, !!web_pwd, identityDigits.length, acctDigits.length, code
      )
      if (code <= 0) {
        // 값(비번/ID/식별번호 원문)은 절대 미포함 — 은행별 필수항목 안내 + 존재여부·길이·코드만.
        return c.json({
          success: false,
          error: `바로빌 계좌 수집등록 실패: ${barobillErrorMessage(code)}\n필요항목: ${req.hint}\n입력현황: 계좌비번=${account_password ? '입력' : '비움'} / 조회ID=${web_id ? '입력' : '비움'} / 조회PW=${web_pwd ? '입력' : '비움'} / 식별번호=${identityDigits.length}자리 / 계좌=${acctDigits.length}자리 / 구분=${acctType === 'P' ? '개인' : '법인'}\n※ 은행 인터넷뱅킹에서 이 계좌의 '빠른조회/조회서비스'가 먼저 신청되어 있어야 합니다.`,
        }, 400)
      }
      barobillRegistered = 1
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO bank_accounts (bank_code, bank_name, account_number, account_holder, account_alias, is_overdraft, is_personal, include_in_cash_plan, entity_id, barobill_registered, collect_cycle, barobill_registered_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${barobillRegistered ? 'CURRENT_TIMESTAMP' : 'NULL'})
    `).bind(
      bank_code,
      bank_name,
      String(account_number).replace(/-/g, ''),
      account_holder ?? null,
      (account_alias && String(account_alias).trim()) || null,
      is_overdraft ? 1 : 0,
      is_personal ? 1 : 0,
      // 미지정이면 마이너스통장은 제외·나머지는 포함 — 0574 마이그레이션의 초기화와 같은 규칙
      include_in_cash_plan != null ? (include_in_cash_plan ? 1 : 0) : (is_overdraft ? 0 : 1),
      entityId,
      barobillRegistered,
      cycle,
    ).run()

    return c.json({
      success: true,
      data: { id: result.meta.last_row_id },
      message: barobillRegistered ? '계좌 등록 + 바로빌 수집연동 완료' : '계좌가 등록되었습니다'
    })
  } catch (error: any) {
    // 인증정보가 포함된 요청 본문은 로그에 남기지 않음 (메시지만)
    console.error('Create bank account error:', error?.message || 'unknown')
    const msg = String(error?.message || '')
    return c.json({
      success: false,
      error: msg.includes('미설정') ? msg : '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// PUT /api/bank/accounts/:id — 계좌 수정
bankRouter.put('/accounts/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const { bank_code, bank_name, account_number, account_holder, account_alias, is_overdraft, is_personal, include_in_cash_plan } = body

    // #437: entity 격리 — 형제 DELETE/refresh와 동일. 미적용 시 타 법인 계좌 master(계좌번호 등) cross-tenant 덮어쓰기(IDOR)
    const ef = entityFilter(c, 'bank_accounts')
    const account = await c.env.DB.prepare(
      `SELECT id FROM bank_accounts WHERE id = ? AND is_active = 1${ef.clause}`
    ).bind(id, ...ef.params).first()

    if (!account) {
      return c.json({ success: false, error: '계좌를 찾을 수 없습니다' }, 404)
    }

    // account_alias는 직접 대입(빈값 전송=별칭 해제 지원). key 미포함 시에만 기존값 유지.
    const aliasProvided = Object.prototype.hasOwnProperty.call(body, 'account_alias')
    const aliasValue = (account_alias && String(account_alias).trim()) || null
    await c.env.DB.prepare(`
      UPDATE bank_accounts
      SET bank_code = COALESCE(?, bank_code),
          bank_name = COALESCE(?, bank_name),
          account_number = COALESCE(?, account_number),
          account_holder = COALESCE(?, account_holder),
          account_alias = CASE WHEN ? = 1 THEN ? ELSE account_alias END,
          is_overdraft = COALESCE(?, is_overdraft),
          is_personal = COALESCE(?, is_personal),
          include_in_cash_plan = COALESCE(?, include_in_cash_plan)
      WHERE id = ?${ef.clause}
    `).bind(
      bank_code ?? null,
      bank_name ?? null,
      account_number != null ? String(account_number).replace(/-/g, '') : null,
      account_holder ?? null,
      aliasProvided ? 1 : 0,
      aliasValue,
      is_overdraft != null ? (is_overdraft ? 1 : 0) : null,
      is_personal != null ? (is_personal ? 1 : 0) : null,
      include_in_cash_plan != null ? (include_in_cash_plan ? 1 : 0) : null,
      id,
      ...ef.params
    ).run()

    return c.json({ success: true, message: '계좌가 수정되었습니다' })
  } catch (error) {
    console.error('Update bank account error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// DELETE /api/bank/accounts/:id — 비활성화 (soft delete) + 바로빌 수집 해지
bankRouter.delete('/accounts/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    const ef = entityFilter(c, 'bank_accounts')
    const account = await c.env.DB.prepare(
      `SELECT id, account_number, barobill_registered FROM bank_accounts WHERE id = ? AND is_active = 1${ef.clause}`
    ).bind(id, ...ef.params).first() as { id: number; account_number: string; barobill_registered: number } | null

    if (!account) {
      return c.json({ success: false, error: '계좌를 찾을 수 없습니다' }, 404)
    }

    // 바로빌 수집 해지 (연동된 계좌만). 실패 시 MES 비활성화 보류 — 상태 불일치 방지.
    if (account.barobill_registered) {
      try {
        const { stopBankAccount } = await import('../services/barobillBank')
        const { barobillErrorMessage } = await import('../constants/barobillCodes')
        const config = await getBarobillConfig(c)
        const code = await stopBankAccount(config, String(account.account_number).replace(/-/g, ''))
        if (code <= 0) {
          return c.json({ success: false, error: '바로빌 계좌 수집 해지 실패: ' + barobillErrorMessage(code) }, 400)
        }
      } catch (e: any) {
        console.error('Bank stop error:', e?.message || 'unknown')
        return c.json({ success: false, error: '바로빌 해지 중 오류가 발생했습니다.' }, 500)
      }
    }

    await c.env.DB.prepare(
      'UPDATE bank_accounts SET is_active = 0 WHERE id = ?'
    ).bind(id).run()

    return c.json({ success: true, message: '계좌가 비활성화되었습니다' })
  } catch (error) {
    console.error('Delete bank account error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// POST /api/bank/accounts/:id/refresh — 바로빌 즉시조회 요청 (RefreshBankAccount)
bankRouter.post('/accounts/:id/refresh', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    const ef = entityFilter(c, 'bank_accounts')
    const account = await c.env.DB.prepare(
      `SELECT account_number, barobill_registered FROM bank_accounts WHERE id = ? AND is_active = 1${ef.clause}`
    ).bind(id, ...ef.params).first() as { account_number: string; barobill_registered: number } | null
    if (!account) return c.json({ success: false, error: '계좌를 찾을 수 없습니다' }, 404)
    if (!account.barobill_registered) return c.json({ success: false, error: '바로빌에 연동되지 않은 계좌입니다' }, 400)

    const { refreshBankAccount } = await import('../services/barobillBank')
    const { barobillErrorMessage } = await import('../constants/barobillCodes')
    const config = await getBarobillConfig(c)
    const code = await refreshBankAccount(config, String(account.account_number).replace(/-/g, ''))
    if (code <= 0) return c.json({ success: false, error: '즉시조회 요청 실패: ' + barobillErrorMessage(code) }, 400)
    return c.json({ success: true, message: '바로빌 즉시조회를 요청했습니다. 잠시 후 동기화하세요.' })
  } catch (error: any) {
    console.error('Bank refresh error:', error?.message || 'unknown')
    const msg = String(error?.message || '')
    return c.json({ success: false, error: msg.includes('미설정') ? msg : '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /api/bank/barobill-manage-url — 경로 B: 바로빌 호스팅 계좌 등록/관리 화면 URL
// 직접입력(경로 A)이 은행별 필드 문제로 실패할 때, 바로빌 화면에서 은행이 직접 검증하도록 위임.
bankRouter.get('/barobill-manage-url', requireRole('ADMIN'), async (c) => {
  try {
    const { getBankAccountManagementUrl } = await import('../services/barobillBank')
    const config = await getBarobillConfig(c)
    const url = await getBankAccountManagementUrl(config)
    return c.json({ success: true, data: { url } })
  } catch (error: any) {
    console.error('Bank manage-url error:', error?.message || 'unknown')
    const msg = String(error?.message || '')
    return c.json({ success: false, error: (msg.includes('미설정') || msg.includes('바로빌')) ? msg : '서버 오류가 발생했습니다.' }, 500)
  }
})

// ---------------------------------------------------------------------------
// 거래내역 조회
// ---------------------------------------------------------------------------

// GET /api/bank/transactions — 거래내역 목록
bankRouter.get('/transactions', requireRole('ADMIN'), async (c) => {
  try {
    const { account_id, date_start, date_end, transaction_type } = c.req.query()
    // match_status는 복수 값 지원 (?match_status=A&match_status=B)
    const matchStatuses = c.req.queries('match_status') || []
    const singleStatus = c.req.query('match_status')

    // 확장성: 무제한 스캔 방지 — limit(기본 500, cap 1000)+offset. 검증·클램프된 정수만 인터폴레이션.
    const limitRaw = parseInt(c.req.query('limit') || '', 10)
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 1000) : 500
    const offsetRaw = parseInt(c.req.query('offset') || '', 10)
    const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0

    const ef = entityFilter(c, 'bt')
    let where = `WHERE 1=1${ef.clause}`
    const params: (string | number)[] = [...ef.params]

    if (account_id) {
      where += ' AND bt.bank_account_id = ?'
      params.push(account_id)
    }
    if (date_start) {
      where += ' AND bt.transaction_date >= ?'
      params.push(date_start.replace(/-/g, ''))
    }
    if (date_end) {
      where += ' AND bt.transaction_date <= ?'
      params.push(date_end.replace(/-/g, ''))
    }
    if (matchStatuses.length > 1) {
      const ph = matchStatuses.map(() => '?').join(', ')
      where += ` AND bt.match_status IN (${ph})`
      params.push(...matchStatuses)
    } else if (singleStatus) {
      where += ' AND bt.match_status = ?'
      params.push(singleStatus)
    }
    if (transaction_type) {
      where += ' AND bt.transaction_type = ?'
      params.push(transaction_type)
    }

    const query = `
      SELECT
        -- #7 회귀방어: bt.* 와일드카드 제거, FE(scripts/bank.js renderTransactions) 소비 필드 명시.
        -- 컬럼 리네임 시 silent null 대신 SQL 에러로 노출됨.
        bt.id, bt.transaction_date, bt.transaction_type, bt.amount, bt.balance_after,
        bt.counterpart_name, bt.description,
        bt.match_status, bt.matched_client_id, bt.matched_category_id, bt.matched_fixed_expense_id,
        bt.matched_purchase_payment_id, bt.matched_link_mode,
        bt.match_reason, bt.transfer_pair_id,
        ba.bank_name, ba.account_number, ba.account_holder, ba.account_alias,
        c.client_name as matched_client_name, c.representative as matched_client_representative,
        ec.name as matched_category_name, ec.icon as matched_category_icon, ec.color as matched_category_color,
        fe.name as matched_fixed_expense_name
      FROM bank_transactions bt
      LEFT JOIN bank_accounts ba ON bt.bank_account_id = ba.id
      LEFT JOIN clients c ON bt.matched_client_id = c.id
      LEFT JOIN expense_categories ec ON bt.matched_category_id = ec.id
      LEFT JOIN fixed_expenses fe ON bt.matched_fixed_expense_id = fe.id
      ${where}
      ORDER BY bt.transaction_date DESC, bt.transaction_time DESC, bt.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    const { results } = params.length > 0
      ? await c.env.DB.prepare(query).bind(...params).all()
      : await c.env.DB.prepare(query).all()

    // 전체 건수(페이지네이션용) — WHERE는 bt만 참조하므로 조인 불필요
    const countQuery = `SELECT COUNT(*) as cnt FROM bank_transactions bt ${where}`
    const countRow = params.length > 0
      ? await c.env.DB.prepare(countQuery).bind(...params).first<{ cnt: number }>()
      : await c.env.DB.prepare(countQuery).first<{ cnt: number }>()
    const total = Number(countRow?.cnt) || 0

    return c.json({ success: true, data: results, total, limit, offset })
  } catch (error) {
    console.error('Get bank transactions error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ---------------------------------------------------------------------------
// CSV 가져오기
// ---------------------------------------------------------------------------

// POST /api/bank/transactions/import — 통장 거래내역 CSV 가져오기
bankRouter.post('/transactions/import', requireRole('ADMIN'), async (c) => {
  try {
    const body = await c.req.json()
    const { account_id, rows } = body as {
      account_id: number
      rows: Array<{
        transaction_date: string   // YYYYMMDD or YYYY-MM-DD
        transaction_time?: string  // HH:MM:SS or HHMMSS
        transaction_type: 'DEPOSIT' | 'WITHDRAWAL'
        amount: number
        balance_after?: number
        counterpart_name?: string
        description?: string
      }>
    }

    if (!account_id) return c.json({ success: false, error: 'account_id 필수' }, 400)
    if (!Array.isArray(rows) || rows.length === 0) return c.json({ success: false, error: '가져올 데이터가 없습니다' }, 400)

    // 계좌 존재 확인 — #437: entity 격리(타 법인 계좌로 거래 import 차단 + 존재 enumeration 방지)
    const efImp = entityFilter(c, 'bank_accounts')
    const account = await c.env.DB.prepare(
      `SELECT id FROM bank_accounts WHERE id = ? AND is_active = 1${efImp.clause}`
    ).bind(account_id, ...efImp.params).first()
    if (!account) return c.json({ success: false, error: '계좌를 찾을 수 없습니다' }, 404)

    const entityId = getEntityId(c)

    // 중복 체크용 기존 거래 로드 (날짜+금액+입금자명 조합)
    const dates = [...new Set(rows.map(r => r.transaction_date.replace(/-/g, '')))]
    const existingSet = new Set<string>()
    for (let i = 0; i < dates.length; i += 20) {
      const chunk = dates.slice(i, i + 20)
      const ph = chunk.map(() => '?').join(',')
      const { results: existing } = await c.env.DB.prepare(
        `SELECT transaction_date, transaction_time, amount, counterpart_name FROM bank_transactions WHERE bank_account_id = ? AND transaction_date IN (${ph})`
      ).bind(account_id, ...chunk).all<{ transaction_date: string; transaction_time: string | null; amount: number; counterpart_name: string | null }>()
      for (const e of existing) {
        existingSet.add(`${e.transaction_date}|${e.amount}|${e.counterpart_name || ''}|${e.transaction_time || ''}`)
      }
    }

    let skipped = 0
    const stmts: D1PreparedStatement[] = []

    for (const row of rows) {
      const txDate = row.transaction_date.replace(/-/g, '')
      const txTime = row.transaction_time || null
      const amount = Math.abs(row.amount)
      const counterpart = unescapeCounterpart((row.counterpart_name || '').trim())
      const key = `${txDate}|${amount}|${counterpart}|${txTime || ''}`

      if (existingSet.has(key)) { skipped++; continue }
      existingSet.add(key) // 같은 배치 내 중복도 방지

      // 0451: INSERT OR IGNORE — content_key(내용키) UNIQUE와 충돌 시 batch 전체 실패 대신 조용히 건너뜀
      //   (앱-레벨 existingSet은 date|amount|counterpart|time, DB 내용키는 계좌|일자|시각|유형|금액|잔액 → 상호 보완)
      stmts.push(c.env.DB.prepare(`
        INSERT OR IGNORE INTO bank_transactions (bank_account_id, transaction_date, transaction_time, transaction_type, amount, balance_after, counterpart_name, description, match_status, entity_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'UNMATCHED', ?)
      `).bind(
        account_id, txDate, txTime,
        row.transaction_type, amount,
        row.balance_after ?? null,
        counterpart || null,
        row.description || null,
        entityId
      ))
    }

    // 100개 단위 batch 실행 — 실제 삽입 수는 batch 결과의 changes 합산(OR IGNORE로 무시된 건 제외)
    let inserted = 0
    for (let i = 0; i < stmts.length; i += 100) {
      const res = await c.env.DB.batch(stmts.slice(i, i + 100))
      for (const r of res) inserted += (r.meta?.changes ?? 0)
    }
    skipped += stmts.length - inserted // 내용키 충돌로 무시된 건도 중복 건너뜀에 포함

    // last_synced 업데이트
    await c.env.DB.prepare(
      'UPDATE bank_accounts SET last_synced_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(account_id).run()

    return c.json({
      success: true,
      data: { inserted, skipped, total: rows.length },
      message: `${rows.length}건 중 ${inserted}건 등록, ${skipped}건 중복 건너뜀`
    })
  } catch (error) {
    console.error('Bank CSV import error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ---------------------------------------------------------------------------
// 바로빌 동기화 → bank_transactions 적재 + 자동매칭
// ---------------------------------------------------------------------------

// POST /api/bank/sync-barobill — 바로빌 통장내역 → DB 적재 + 자동매칭
bankRouter.post('/sync-barobill', requireRole('ADMIN'), async (c) => {
  try {
    const body = await c.req.json().catch(() => ({})) as { date_start?: string; date_end?: string }

    // 기본: 오늘
    const today = kstYmdCompact()
    const dateStart = body.date_start?.replace(/-/g, '') || today
    const dateEnd = body.date_end?.replace(/-/g, '') || today

    // 바로빌 설정 로드
    const testModeRow = await c.env.DB.prepare(
      "SELECT setting_value FROM settings WHERE setting_key = 'barobill_test_mode'"
    ).first() as { setting_value: string } | null
    const isTest = testModeRow?.setting_value !== '0'
    const certKey = isTest ? c.env.BAROBILL_CERT_KEY : c.env.BAROBILL_CERT_KEY_PROD
    if (!certKey) return c.json({ success: false, error: 'BAROBILL_CERT_KEY 미설정' }, 400)

    // CorpNum은 법인별 (각 법인 자체 사업자번호 회원사). CERTKEY는 단일 파트너 키.
    const corpNum = await getEntityCorpNum(c.env.DB, getEntityId(c))
    if (!corpNum) return c.json({ success: false, error: '사업자등록번호 미설정' }, 400)

    // senderId는 법인별(entity_settings) — corpNum과 짝 맞춤 필수. 불일치 시 바로빌 -24005로 0건 수집.
    const senderId = await getEntityBarobillSenderId(c.env.DB, getEntityId(c))

    const config = { certKey, corpNum, isTest, senderId }
    const entityId = getEntityId(c)

    // 바로빌 등록 계좌 목록
    const { getBankAccountList, getDailyBankLog } = await import('../services/barobillBank')
    const accounts = await getBankAccountList(config)
    if (!accounts.length) return c.json({ success: false, error: '바로빌에 등록된 계좌가 없습니다' }, 400)

    // bank_accounts에 없는 계좌면 자동 등록
    for (const acc of accounts) {
      const accNum = acc.BankAccountNum || ''
      if (!accNum) continue
      const existing = await c.env.DB.prepare(
        "SELECT id FROM bank_accounts WHERE replace(account_number,'-','') = ? AND is_active = 1"
      ).bind(accNum.replace(/-/g, '')).first()
      if (!existing) {
        await c.env.DB.prepare(
          'INSERT INTO bank_accounts (bank_code, bank_name, account_number, account_holder, entity_id) VALUES (?, ?, ?, ?, ?)'
        ).bind(acc.BankCode || '', acc.BankName || acc.Alias || '', accNum, acc.Alias || '', entityId).run()
      }
    }

    // 날짜 범위 → 일별 리스트
    const dates: string[] = []
    const cur = new Date(dateStart.slice(0,4) + '-' + dateStart.slice(4,6) + '-' + dateStart.slice(6,8))
    const end = new Date(dateEnd.slice(0,4) + '-' + dateEnd.slice(4,6) + '-' + dateEnd.slice(6,8))
    while (cur <= end) {
      const y = cur.getFullYear()
      const m = String(cur.getMonth() + 1).padStart(2, '0')
      const d = String(cur.getDate()).padStart(2, '0')
      dates.push(`${y}${m}${d}`)
      cur.setDate(cur.getDate() + 1)
    }

    let totalInserted = 0, totalSkipped = 0
    // 관측성: 일별 조회 실패를 로깅+응답 수집 (조용한 미수집 정지 방지 — auto-sync errors[]와 대칭, #494)
    const errors: string[] = []

    // 계좌 × 날짜 조회 → bank_transactions 적재
    for (const acc of accounts) {
      const accNum = acc.BankAccountNum || ''
      if (!accNum) continue

      // bank_accounts.id 조회
      const bankAcc = await c.env.DB.prepare(
        "SELECT id FROM bank_accounts WHERE replace(account_number,'-','') = ? AND is_active = 1"
      ).bind(accNum.replace(/-/g, '')).first() as { id: number } | null
      if (!bankAcc) continue

      for (const dateStr of dates) {
        try {
          const result = await getDailyBankLog(config, accNum, dateStr, 0, 1, 500)

          for (const item of result.items) {
            const refKey = item.TransRefKey || ''
            const deposit = parseFloat(item.Deposit || '0')
            const withdraw = parseFloat(item.Withdraw || '0')
            const amount = deposit || withdraw
            const txType = deposit > 0 ? 'DEPOSIT' : 'WITHDRAWAL'
            const txDate = (item.TransDT || '').slice(0, 8) || dateStr
            const txTime = (item.TransDT || '').length >= 12
              ? (item.TransDT || '').slice(8,10) + ':' + (item.TransDT || '').slice(10,12) + ':00'
              : null

            // #500: 잔액 0원(실제값)과 미제공을 구분. `|| null`은 0을 falsy로 NULL 강등 →
            //       0451 content_key가 balance_after=NULL시 counterpart_name 폴백 → 다른 거래와
            //       UNIQUE 충돌해 INSERT OR IGNORE로 무음 소실. 값이 있으면 0이라도 보존.
            const balanceRaw = item.Balance
            const balanceParsed = (balanceRaw === undefined || balanceRaw === null || balanceRaw === '')
              ? null
              : parseFloat(balanceRaw)
            const balanceAfter = (balanceParsed === null || Number.isNaN(balanceParsed)) ? null : balanceParsed

            // #474: UNIQUE 인덱스에 위임 — 건별 dup-check SELECT 제거(N+1)
            // 0451: dedup 신원을 content_key(내용키)로 이전 → 외부 TransRefKey 재생성돼도 중복 미삽입.
            const r = await c.env.DB.prepare(`
              INSERT OR IGNORE INTO bank_transactions (bank_account_id, transaction_date, transaction_time, transaction_type, amount, balance_after, counterpart_name, description, match_status, codef_transaction_id, entity_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'UNMATCHED', ?, ?)
            `).bind(
              bankAcc.id, txDate, txTime, txType, amount,
              balanceAfter,
              // 바로빌 응답에 HTML 이스케이프가 그대로 실려오는 경우가 있다(`타행농협&gt; 성낙선` 실측).
              //   그대로 적재하면 같은 상대가 표기만 달라져 반복지출 탐지·매칭에서 갈린다.
              item.TransRemark1 ? unescapeCounterpart(String(item.TransRemark1)) : null,
              item.TransRemark2 ? unescapeCounterpart(String(item.TransRemark2)) : null,
              refKey || null,
              entityId
            ).run()
            if ((r.meta.changes ?? 0) > 0) totalInserted++; else totalSkipped++
          }
        } catch (err: any) {
          console.error(`Bank sync error ${accNum} ${dateStr}:`, err)
          if (errors.length < 20) errors.push(`${accNum} ${dateStr}: ${err?.message || '조회 실패'}`)
        }
      }
    }

    // 관측성: MES 등록(barobill_registered=1)됐으나 바로빌 수집목록에 없는 계좌 표기 (조용한 미수집 진단)
    const bbNums = new Set(accounts.map((a: any) => String(a.BankAccountNum || '').replace(/-/g, '')).filter(Boolean))
    const efReg = entityFilter(c, 'bank_accounts')
    const { results: regAccts } = await c.env.DB.prepare(
      `SELECT account_number, bank_name, account_alias FROM bank_accounts WHERE barobill_registered = 1 AND is_active = 1${efReg.clause}`
    ).bind(...efReg.params).all<{ account_number: string; bank_name: string; account_alias: string | null }>()
    for (const ra of regAccts) {
      const stripped = String(ra.account_number).replace(/-/g, '')
      if (!bbNums.has(stripped) && errors.length < 20) {
        errors.push(`${ra.account_alias || ra.bank_name || stripped} (${stripped.slice(0, 4)}****): 바로빌 수집목록에 없음 — 등록지연/인증 확인 필요`)
      }
    }

    // 자동매칭 실행 — 수동 [자동매칭]과 동일 공용 엔진(부분일치·고정비 제안·출금 포함)
    let matchedCount = 0
    if (totalInserted > 0) {
      const r = await runAutoMatchEngine(c)
      matchedCount = r.matched
    }

    return c.json({
      success: true,
      partial: errors.length > 0,
      data: {
        accounts: accounts.length,
        dates: dates.length,
        inserted: totalInserted,
        skipped: totalSkipped,
        matched: matchedCount,
        errors,
      },
      message: `${accounts.length}개 계좌 × ${dates.length}일 동기화: ${totalInserted}건 등록, ${totalSkipped}건 중복, ${matchedCount}건 자동매칭`
    })
  } catch (error: any) {
    console.error('Barobill bank sync error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// ---------------------------------------------------------------------------
// 매칭 규칙 관리
// ---------------------------------------------------------------------------

// GET /api/bank/expense-categories — 비용 카테고리 목록
bankRouter.get('/expense-categories', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const ef = entityFilter(c)
    const { results } = await c.env.DB.prepare(`
      SELECT id, name, icon, color FROM expense_categories
      WHERE is_active = 1${ef.clause}
      ORDER BY sort_order, id
    `).bind(...ef.params).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('Get expense categories error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /api/bank/match-rules — 매칭 규칙 목록
bankRouter.get('/match-rules', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const ef = entityFilter(c, 'r')
    const { results } = await c.env.DB.prepare(`
      SELECT r.*, c.client_name, ec.name as category_name
      FROM bank_match_rules r
      LEFT JOIN clients c ON r.matched_client_id = c.id
      LEFT JOIN expense_categories ec ON r.matched_category_id = ec.id
      WHERE 1=1${ef.clause}
      ORDER BY r.match_count DESC, r.id DESC
    `).bind(...ef.params).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('Get match rules error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// POST /api/bank/match-rules — 매칭 규칙 생성/업데이트
bankRouter.post('/match-rules', requireRole('ADMIN'), async (c) => {
  try {
    const body = await c.req.json()
    const { counterpart_name, matched_client_id, matched_category_id, match_type } = body
    const user = c.get('user')
    const mt = match_type === 'CONTAINS' ? 'CONTAINS' : 'EXACT'

    if (!counterpart_name || (!matched_client_id && !matched_category_id)) {
      return c.json({
        success: false,
        error: 'counterpart_name + (matched_client_id 또는 matched_category_id) 필수'
      }, 400)
    }

    if (matched_client_id) {
      const client = await c.env.DB.prepare(
        'SELECT id FROM clients WHERE id = ? AND is_active = 1'
      ).bind(matched_client_id).first()
      if (!client) return c.json({ success: false, error: '거래처를 찾을 수 없습니다' }, 404)
    }

    // INSERT OR REPLACE + match_count 증가 (entity_id별 UNIQUE). match_type=EXACT|CONTAINS(부분일치).
    const res = await c.env.DB.prepare(`
      INSERT INTO bank_match_rules (counterpart_name, matched_client_id, matched_category_id, match_type, created_by, match_count, entity_id)
      VALUES (?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT(entity_id, counterpart_name) DO UPDATE SET
        matched_client_id = excluded.matched_client_id,
        matched_category_id = excluded.matched_category_id,
        match_type = excluded.match_type,
        match_count = match_count + 1,
        last_used_at = CURRENT_TIMESTAMP
    `).bind(counterpart_name, matched_client_id || null, matched_category_id || null, mt, user?.id ?? 1, getEntityId(c) || 1).run()

    return c.json({
      success: true,
      data: { id: res.meta.last_row_id },
      message: '매칭 규칙이 저장되었습니다'
    })
  } catch (error) {
    console.error('Create match rule error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// PUT /api/bank/match-rules/:id — 매칭 규칙 수정
bankRouter.put('/match-rules/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const { matched_client_id, matched_category_id, match_type } = body
    // match_type 미지정 시 기존값 유지(COALESCE), 지정 시 EXACT|CONTAINS만 허용
    const mt = match_type === 'CONTAINS' ? 'CONTAINS' : (match_type === 'EXACT' ? 'EXACT' : null)

    if (!matched_client_id && !matched_category_id) {
      return c.json({ success: false, error: 'matched_client_id 또는 matched_category_id 필수' }, 400)
    }

    const ef = entityFilter(c)  // #434: 타 법인 규칙 수정 차단 (list/INSERT와 대칭)
    const rule = await c.env.DB.prepare(
      `SELECT id FROM bank_match_rules WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first()

    if (!rule) {
      return c.json({ success: false, error: '규칙을 찾을 수 없습니다' }, 404)
    }

    await c.env.DB.prepare(
      `UPDATE bank_match_rules SET matched_client_id = ?, matched_category_id = ?, match_type = COALESCE(?, match_type), last_used_at = CURRENT_TIMESTAMP WHERE id = ?${ef.clause}`
    ).bind(matched_client_id || null, matched_category_id || null, mt, id, ...ef.params).run()

    return c.json({ success: true, message: '규칙이 수정되었습니다' })
  } catch (error) {
    console.error('Update match rule error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// DELETE /api/bank/match-rules/:id — 매칭 규칙 삭제
bankRouter.delete('/match-rules/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')

    const ef = entityFilter(c)  // #434: 타 법인 규칙 삭제 차단 (list/INSERT와 대칭)
    const rule = await c.env.DB.prepare(
      `SELECT id FROM bank_match_rules WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first()

    if (!rule) {
      return c.json({ success: false, error: '규칙을 찾을 수 없습니다' }, 404)
    }

    await c.env.DB.prepare(
      `DELETE FROM bank_match_rules WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).run()

    return c.json({ success: true, message: '매칭 규칙이 삭제되었습니다' })
  } catch (error) {
    console.error('Delete match rule error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ---------------------------------------------------------------------------
// 자동 매칭
// ---------------------------------------------------------------------------

// 입금자명/거래처명 정규화 — 법인격 표기·공백·괄호·구분기호 차이를 흡수.
//   "(주)동산기획" · "㈜ 동산기획" · "동산기획(주)" → "동산기획"
//   자동매칭에서만 사용(저장값은 원문 유지).
// 매칭 규칙 학습(단일 소스) — 사람이 거래처/비용분류를 확정한 시점마다 호출.
//   다음 동기화부터 같은 적요(counterpart_name)는 자동매칭이 잡는다.
async function learnMatchRule(
  c: Context<HonoEnv>,
  counterpartName: string | null | undefined,
  opts: { clientId?: number | null; categoryId?: number | null; userId?: number | null; entityId?: number | null }
): Promise<void> {
  const name = (counterpartName ?? '').trim()
  if (!name) return
  if (!opts.clientId && !opts.categoryId) return
  await c.env.DB.prepare(`
    INSERT INTO bank_match_rules (counterpart_name, matched_client_id, matched_category_id, created_by, match_count, entity_id)
    VALUES (?, ?, ?, ?, 1, ?)
    ON CONFLICT(entity_id, counterpart_name) DO UPDATE SET
      matched_client_id = excluded.matched_client_id,
      matched_category_id = excluded.matched_category_id,
      match_count = match_count + 1,
      last_used_at = CURRENT_TIMESTAMP
  `).bind(name, opts.clientId ?? null, opts.categoryId ?? null, opts.userId ?? 1, opts.entityId ?? 1).run()
}

// 비용분류(+선택적 고정비) 확정 — 거래처 원장이 아닌 '비용'으로 처리하는 경로(단일 소스).
//   거래처 매칭과 달리 원장(payments) 생성이 없으므로 확정 즉시 APPLIED.
//   /match·단건 apply·batch-apply 3곳 공용 — 어느 경로로 들어와도 동일 결과.
async function applyExpenseCategory(
  c: Context<HonoEnv>,
  tx: { id: number; transaction_date: string; amount: number; counterpart_name: string | null; entity_id: number | null },
  categoryId: number | null,
  fixedExpenseId: number | null,
  userId: number | null
): Promise<{ message: string }> {
  await c.env.DB.prepare(`
    UPDATE bank_transactions
    SET match_status = 'APPLIED',
        matched_category_id = ?,
        matched_fixed_expense_id = ?,
        matched_client_id = NULL,
        matched_by = ?,
        matched_at = CURRENT_TIMESTAMP,
        match_confidence = 1.0,
        match_reason = ?
    WHERE id = ?
  `).bind(categoryId ?? null, fixedExpenseId, userId ?? 1, fixedExpenseId ? '고정비 확정' : '비용분류', tx.id).run()

  const entityId = tx.entity_id ?? (getEntityId(c) || 1)

  if (fixedExpenseId) {
    // 고정비 확정 → 당월 실적 기록(recurring_expense_actuals). 적요 변동 무관, 고정비 앵커.
    const period = (tx.transaction_date || '').length >= 6
      ? `${tx.transaction_date.slice(0, 4)}-${tx.transaction_date.slice(4, 6)}`
      : kstYmd().slice(0, 7)
    await c.env.DB.prepare(`
      INSERT INTO recurring_expense_actuals (fixed_expense_id, period, actual_amount, actual_source, entity_id)
      VALUES (?, ?, ?, 'BANK', ?)
      ON CONFLICT(fixed_expense_id, period) DO UPDATE SET
        actual_amount = excluded.actual_amount,
        actual_source = 'BANK',
        variance = excluded.actual_amount - COALESCE(estimated_amount, 0),
        updated_at = CURRENT_TIMESTAMP
    `).bind(fixedExpenseId, period, Math.abs(Number(tx.amount) || 0), entityId).run()
  } else {
    // 규칙 학습(고정비 확정 제외 — 고정비는 적요가 매달 달라 이름앵커 부적합)
    await learnMatchRule(c, tx.counterpart_name, { categoryId, userId, entityId })
  }

  return { message: fixedExpenseId ? '고정비 실적이 기록되었습니다' : '비용 분류가 적용되었습니다' }
}

// ---------------------------------------------------------------------------
// 자동매칭 엔진 (수동 [자동매칭] 버튼·바로빌 sync·무인 cron 공용 — 단일 소스)
//   규칙(EXACT→APPLIED / CONTAINS→SUGGESTED) → 출금 고정비 제안(SUGGESTED) → 거래처명/키워드/금액.
//   Q3=제안 후 사람 확정: 부분일치·고정비는 SUGGESTED(자동 APPLIED 아님).
// ---------------------------------------------------------------------------
async function runAutoMatchEngine(
  c: Context<HonoEnv>,
  opts?: { lookbackDays?: number; scanCap?: number }
): Promise<{ matched: number; total: number }> {
    const ef = entityFilter(c, 'bank_transactions')
    // H5: 스캔 범위 제한(무인 cron이 실패건을 매일 무한 재스캔하는 것 방지). 기본 90일·500건 상한.
    const lookbackDays = opts?.lookbackDays ?? MATCH_LOOKBACK_DAYS
    const scanCap = opts?.scanCap ?? MATCH_SCAN_CAP
    const dateClause = lookbackDays > 0 ? ' AND transaction_date >= ?' : ''
    const dateParams = lookbackDays > 0 ? [lookbackYmd(lookbackDays)] : []
    // 1. UNMATCHED 거래내역 가져오기 (입금+출금 모두, 최근 우선 소진 위해 오래된 순)
    const { results: unmatchedTxs } = await c.env.DB.prepare(`
      SELECT id, amount, counterpart_name, description, transaction_type
      FROM bank_transactions
      WHERE match_status = 'UNMATCHED'${ef.clause}${dateClause}
      ORDER BY transaction_date ASC, id ASC
      LIMIT ${scanCap}
    `).bind(...ef.params, ...dateParams).all<{
      id: number
      amount: number
      counterpart_name: string | null
      description: string | null
      transaction_type: string
    }>()

    if (unmatchedTxs.length === 0) return { matched: 0, total: 0 }

    // 2. 모든 활성 거래처 가져오기 (대표자명 포함 — 대표자 개인명 입금 대응)
    const { results: clients } = await c.env.DB.prepare(`
      SELECT id, client_name, search_keywords, representative
      FROM clients
      WHERE is_active = 1
      ORDER BY client_name, id
    `).all<{
      id: number
      client_name: string
      search_keywords: string | null
      representative: string | null
    }>()

    // 2-a. 정규화 캐시: 법인격·공백·괄호 제거 후 비교 → "(주)동산기획" ≡ "동산기획 " ≡ "동산기획".
    //      normDup = 정규화 후 같은 이름의 거래처 수(2 이상이면 자동확정 금지 — 모호).
    const normClients = clients.map(cl => ({
      id: cl.id,
      name: cl.client_name.trim(),
      norm: normalizeCounterpart(cl.client_name),
      rep: normalizeCounterpart(cl.representative),
      keywords: (cl.search_keywords ?? '').split(/[,\s]+/).map(k => k.trim()).filter(Boolean),
    }))
    const normDup = new Map<string, number>()
    for (const cl of normClients) {
      if (!cl.norm) continue
      normDup.set(cl.norm, (normDup.get(cl.norm) ?? 0) + 1)
    }

    // 2-b. 거래처별 미수금 파생잔액(1쿼리) — clients.balance 캐시 폐기 → /receivables·deriveClientBalance 동일 정의.
    //      rule 3(금액일치) 매칭에 사용. 같은 잔액 거래처가 여럿이면 모호 → 매칭 제외(유일성 가드).
    const { results: balRows } = await c.env.DB.prepare(`
      SELECT c.id AS client_id,
        (COALESCE(b.amt, 0) - COALESCE(pp.amt, 0) - COALESCE(aa.amt, 0)) AS balance
      FROM clients c
      LEFT JOIN (
        SELECT o.client_id AS cid, SUM(g.billed_amount) AS amt
        FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
        WHERE g.billing_status = 'BILLED' AND o.status != 'CANCELLED'
        GROUP BY o.client_id
      ) b ON b.cid = c.id
      LEFT JOIN (SELECT client_id AS cid, SUM(amount) AS amt FROM payments GROUP BY client_id) pp ON pp.cid = c.id
      LEFT JOIN (SELECT client_id AS cid, SUM(amount) AS amt FROM adjustments GROUP BY client_id) aa ON aa.cid = c.id
      WHERE c.is_active = 1
        AND (COALESCE(b.amt, 0) - COALESCE(pp.amt, 0) - COALESCE(aa.amt, 0)) > 0
    `).all<{ client_id: number; balance: number }>()
    const clientBalance = new Map<number, number>()
    const balanceCount = new Map<number, number>()
    for (const r of balRows) {
      clientBalance.set(r.client_id, r.balance)
      balanceCount.set(r.balance, (balanceCount.get(r.balance) ?? 0) + 1)
    }

    // 3. bank_match_rules 캐시 로드 (거래처 + 비용카테고리 규칙, match_type)
    const efRules = entityFilter(c, 'bank_match_rules')
    const { results: matchRules } = await c.env.DB.prepare(`
      SELECT counterpart_name, matched_client_id, matched_category_id, match_type FROM bank_match_rules WHERE 1=1${efRules.clause}
    `).bind(...efRules.params).all<{
      counterpart_name: string
      matched_client_id: number | null
      matched_category_id: number | null
      match_type: string | null
    }>()

    // EXACT 규칙 = 이름 완전일치 맵. CONTAINS 규칙 = 부분일치 후보 배열(적요 변동 대응).
    const ruleMap = new Map(
      matchRules
        .filter(r => (r.match_type ?? 'EXACT') !== 'CONTAINS')
        .map(r => [r.counterpart_name, { clientId: r.matched_client_id, categoryId: r.matched_category_id }])
    )
    const containsRules = matchRules
      .filter(r => (r.match_type ?? 'EXACT') === 'CONTAINS' && r.counterpart_name.trim())
      .map(r => ({ key: r.counterpart_name.trim(), clientId: r.matched_client_id, categoryId: r.matched_category_id }))

    // 3-b. 활성 고정비 로드 (출금 → 고정비 제안용). 적요 변동 무관: 거래처/키워드 + 금액대로 앵커.
    const efFixed = entityFilter(c, 'fixed_expenses')
    const { results: fixedExpenses } = await c.env.DB.prepare(`
      SELECT id, name, category, amount, amount_type, payment_day, counterpart_name, linked_category_id
      FROM fixed_expenses WHERE is_active = 1${efFixed.clause}
    `).bind(...efFixed.params).all<{
      id: number; name: string; category: string; amount: number
      amount_type: string | null; payment_day: number | null
      counterpart_name: string | null; linked_category_id: number | null
    }>()

    // 출금 tx ↔ 고정비 매칭: 이름/키워드 부분일치 필수 + 금액대(FIXED ±5% / ESTIMATED ±30%). 최소 금액차 우선.
    function matchFixedExpense(txName: string, txAmount: number) {
      let best: { id: number; name: string; categoryId: number | null } | null = null
      let bestDiff = Infinity
      for (const fe of fixedExpenses) {
        const key = (fe.counterpart_name || fe.name || '').trim()
        if (!key) continue
        const tokens = key.split(/[\s,]+/).filter(t => t.length >= 2)
        const nameHit = txName.includes(key) || key.includes(txName) || tokens.some(t => txName.includes(t))
        if (!nameHit) continue
        if (fe.amount && fe.amount > 0) {
          const tol = (fe.amount_type === 'ESTIMATED') ? 0.30 : 0.05
          const diff = Math.abs(txAmount - fe.amount)
          if (diff / fe.amount > tol) continue
          if (diff < bestDiff) { bestDiff = diff; best = { id: fe.id, name: fe.name, categoryId: fe.linked_category_id } }
        } else if (!best) {
          // 금액 미설정 고정비는 이름만으로 약한 후보(금액 후보가 없을 때만)
          best = { id: fe.id, name: fe.name, categoryId: fe.linked_category_id }
        }
      }
      return best
    }

    let matchedCount = 0

    // UPDATE(거래상태 + 규칙 match_count)를 모아 단일 batch 실행 (#321 N+1 제거). per-row try/catch 없음 → 동작 동일.
    const matchUpdateStmts: D1PreparedStatement[] = []

    for (const tx of unmatchedTxs) {
      const txName = (tx.counterpart_name ?? '').trim()
      if (!txName) continue

      // 거래처 수금·지급이 아닌 것을 먼저 걷어낸다 — 카드 매출 정산금(가맹점번호)·계좌번호 표기.
      //   거래처별 payments 로 만들면 AR 이 오염된다(정산금은 여러 매출이 합쳐진 한 덩어리다).
      //   prod 실측 2026-09-06: 428건 537,964,046 이 이 형태로 UNMATCHED 에 쌓여 사람 눈을 가리고 있었다.
      const nonCounterpart = isNonCounterpartName(txName)
      if (nonCounterpart) {
        matchUpdateStmts.push(c.env.DB.prepare(`
          UPDATE bank_transactions
          SET match_status = 'IGNORED', matched_client_id = NULL, match_confidence = 1.0, match_reason = ?
          WHERE id = ?
        `).bind(nonCounterpart === 'CARD' ? '카드매출 정산(거래처 매칭 대상 아님)' : '계좌번호 표기(거래처 매칭 대상 아님)', tx.id))
        matchedCount++
        continue
      }

      let bestClientId: number | null = null
      let bestConfidence = 0
      let bestReason = ''

      // Step 1: 먼저 bank_match_rules에서 정확히 일치하는 규칙 찾기
      const rule = ruleMap.get(txName)
      if (rule) {
        // match_count 증가
        matchUpdateStmts.push(c.env.DB.prepare(`
          UPDATE bank_match_rules
          SET match_count = match_count + 1, last_used_at = CURRENT_TIMESTAMP
          WHERE counterpart_name = ?
        `).bind(txName))

        if (rule.categoryId) {
          // 비용 카테고리 규칙 → 바로 APPLIED
          matchUpdateStmts.push(c.env.DB.prepare(`
            UPDATE bank_transactions
            SET match_status = 'APPLIED',
                matched_category_id = ?,
                matched_client_id = NULL,
                match_confidence = 0.95,
                match_reason = '학습된 규칙 (비용분류)'
            WHERE id = ?
          `).bind(rule.categoryId, tx.id))
          matchedCount++
          continue
        }

        bestClientId = rule.clientId
        bestConfidence = 0.95
        bestReason = '학습된 규칙'
      } else {
        // Step 1-b: CONTAINS 규칙(부분일치) — 적요가 매달 달라도 키워드로 제안
        const cRule = containsRules.find(r => txName.includes(r.key) || r.key.includes(txName))
        if (cRule && cRule.categoryId) {
          // 부분일치 비용분류 → 제안(SUGGESTED, 사람 확정)
          matchUpdateStmts.push(c.env.DB.prepare(`
            UPDATE bank_transactions
            SET match_status = 'SUGGESTED', matched_category_id = ?, matched_fixed_expense_id = NULL,
                matched_client_id = NULL, match_confidence = 0.8, match_reason = '학습된 규칙(부분일치)'
            WHERE id = ?
          `).bind(cRule.categoryId, tx.id))
          matchedCount++
          continue
        }
        if (cRule && cRule.clientId) {
          bestClientId = cRule.clientId
          bestConfidence = 0.75
          bestReason = '학습된 규칙(부분일치)'
        } else {
          // Step 1-c: 출금 → 고정비 제안(SUGGESTED). 확정 시 recurring_expense_actuals 기록.
          if (tx.transaction_type === 'WITHDRAWAL') {
            const fe = matchFixedExpense(txName, Math.abs(Number(tx.amount) || 0))
            if (fe) {
              matchUpdateStmts.push(c.env.DB.prepare(`
                UPDATE bank_transactions
                SET match_status = 'SUGGESTED', matched_category_id = ?, matched_fixed_expense_id = ?,
                    matched_client_id = NULL, match_confidence = 0.7, match_reason = ?
                WHERE id = ?
              `).bind(fe.categoryId, fe.id, '고정비 제안: ' + fe.name, tx.id))
              matchedCount++
              continue
            }
          }
          // Step 2: 규칙이 없으면 기존 로직으로 매칭 시도
          //   강한 규칙(완전일치·정규화 완전일치·키워드·금액)은 즉시 best 갱신,
          //   약한 규칙(거래처명 부분포함·대표자명)은 후보만 모아 "유일할 때만" 채택(SUGGESTED).
          const normTx = normalizeCounterpart(txName)
          // 은행앱 접두를 벗긴 두 번째 키. "홈) 기업(주)정운교역" → "정운교역".
          //   원문 키를 버리지 않고 **둘 다** 본다 — 접두처럼 보이는 글자가 실제 상호의 일부인 경우가 있다.
          const strippedName = stripBankPrefix(txName)
          const normStripped = strippedName === txName ? '' : normalizeCounterpart(strippedName)
          // 괄호 표기는 "개인명(상호)" 형태 → 괄호 안 상호가 실제 거래 주체.
          //   "이성현(무지개기획)" → ['무지개기획'] (닫는 괄호가 없는 "이도운(88광고기획"도 인식)
          const parenNames = (txName.match(/[(（][^)）]*/g) || [])
            .map(s => normalizeCounterpart(s))
            .filter(s => s.length >= 2)
          const hasParen = /[(（]/.test(txName)
          const parenHits = new Set<number>()   // 괄호 안 상호가 이 거래처와 일치
          const prefixHits = new Set<number>()  // 입금자명이 거래처명의 앞부분(잘린 표기)
          const repHits = new Set<number>()     // 대표자명 단독 입금

          for (const client of normClients) {
            const clientName = client.name
            const keywords = client.keywords

            let confidence = 0
            let reason     = ''

            // 규칙 1: 입금자명 == 거래처명 → 0.9
            if (txName === clientName) {
              confidence = 0.9
              reason     = '입금자명 완전일치'
            }
            // 규칙 1-b: 정규화 완전일치("(주)" · 공백 · 괄호 차이만) → 0.85. 동명 거래처가 둘 이상이면 모호 → 제외
            else if (normTx && client.norm && normTx === client.norm && (normDup.get(client.norm) ?? 0) === 1) {
              confidence = 0.85
              reason     = '입금자명 일치(표기차이 무시)'
            }
            // 규칙 1-c: 은행앱 접두를 벗기면 완전일치 → 0.8. 원문 일치보다 한 단계 낮게 둔다(벗긴 건 추정이다).
            else if (normStripped && client.norm && normStripped === client.norm && (normDup.get(client.norm) ?? 0) === 1) {
              confidence = 0.8
              reason     = '입금자명 일치(은행표기 접두 제거)'
            }
            // 규칙 2: 입금자명이 search_keywords에 포함 → 0.7
            else if (keywords.some(k => k && txName.includes(k))) {
              confidence = 0.7
              reason     = '검색키워드 일치'
            }
            // 규칙 3: (입금) 금액 == 미수금 파생잔액 + 해당 잔액 거래처 유일 — 모호/무의미 매칭 방지
            const derivedBal = clientBalance.get(client.id) ?? 0
            if (tx.transaction_type === 'DEPOSIT' && derivedBal > 0 && tx.amount === derivedBal && balanceCount.get(derivedBal) === 1) {
              if (confidence >= 0.5) {
                // 이름도 부분 일치하면 0.8로 상향
                const namePartial = clientName.includes(txName) || txName.includes(clientName)
                confidence = namePartial ? 0.8 : Math.max(confidence, 0.5)
                reason += reason ? ' + 금액일치' : '금액일치'
              } else {
                confidence = 0.5
                reason     = '금액일치'
              }
            }

            if (confidence > bestConfidence) {
              bestConfidence = confidence
              bestClientId   = client.id
              bestReason     = reason
            }

            // 약한 후보 수집(강한 규칙이 하나도 없을 때만 사용).
            //   ⚠️ "포함되기만 하면 후보"는 오매칭을 부른다(prod 실측: '대진'⊂'대진국기사박대혁',
            //   '플랜'⊂'이수정(더플랜디)'). 아래 3가지 신호로만 제한한다.
            if (client.norm.length >= 2 && parenNames.some(inner => client.norm === inner || client.norm.startsWith(inner))) {
              // (a) 괄호 안 상호 = 실제 주체. "이금란(혜윰세이프티)"→혜윰 세이프티,
              //     "이도운(88광고기획"→88광고기획(구미). "이수정(더플랜디)"는 '플랜'과 불일치 → 제외.
              parenHits.add(client.id)
            } else if (normTx.length >= 4 && client.norm.includes(normTx)) {
              // (b) 입금자명이 거래처명의 앞부분/일부(은행 표기 잘림). "대전광역시옥외광"→사단법인 대전광역시옥외광고협회.
              //     반대 방향(입금자명 ⊃ 거래처명)은 우연 포함 오탐이 많아 채택하지 않는다(수동 1회 → 규칙 학습으로 흡수).
              prefixHits.add(client.id)
            } else if (normStripped.length >= 4 && client.norm.includes(normStripped)) {
              // (b') 접두를 벗겨야 비로소 앞부분이 되는 표기. "홈) 하나(주)케이엠테" → 케이엠테크.
              prefixHits.add(client.id)
            }
            if (!hasParen && client.rep.length >= 2 && (normTx === client.rep || normStripped === client.rep)) {
              // (c) 대표자명 단독 입금만 인정. 괄호 상호가 있으면 그 상호가 주체이므로 대표자명 매칭 금지
              //     ("이성현(무지개기획)"에서 무지개기획 미등록인데 동명 대표자의 다른 거래처로 붙는 사고 방지).
              repHits.add(client.id)
            }
          }

          // 약한 규칙은 후보가 정확히 1곳일 때만 제안(SUGGESTED). 여러 곳이면 모호 → 사람이 판단.
          if (bestConfidence < 0.5) {
            if (parenHits.size === 1) {
              bestClientId   = [...parenHits][0]
              bestConfidence = 0.7
              bestReason     = '상호 표기 일치'
            } else if (prefixHits.size === 1) {
              bestClientId   = [...prefixHits][0]
              bestConfidence = 0.65
              bestReason     = '거래처명 부분일치'
            } else if (repHits.size === 1) {
              bestClientId   = [...repHits][0]
              bestConfidence = 0.65
              bestReason     = '대표자명 일치'
            }
          }
        }
      }

      // 신뢰도 기반 상태 분리: >= 0.8 → CONFIRMED, 0.5~0.8 → SUGGESTED
      if (bestConfidence >= 0.5 && bestClientId !== null) {
        const autoStatus = bestConfidence >= 0.8 ? 'CONFIRMED' : 'SUGGESTED'
        matchUpdateStmts.push(c.env.DB.prepare(`
          UPDATE bank_transactions
          SET match_status = ?,
              matched_client_id = ?,
              match_confidence = ?,
              match_reason = ?
          WHERE id = ?
        `).bind(autoStatus, bestClientId, bestConfidence, bestReason, tx.id))
        matchedCount++
      }
    }

    if (matchUpdateStmts.length > 0) await c.env.DB.batch(matchUpdateStmts)
    return { matched: matchedCount, total: unmatchedTxs.length }
}

// POST /api/bank/transactions/auto-match — 미매칭 거래 자동매칭 (입금+출금, 규칙 학습 포함)
bankRouter.post('/transactions/auto-match', requireRole('ADMIN'), async (c) => {
  try {
    // ?days=0(또는 음수)→전체, ?limit=N→상한 조정
    const daysParam = Number(c.req.query('days'))
    const lookbackDays = Number.isFinite(daysParam) ? daysParam : MATCH_LOOKBACK_DAYS
    const limitParam = Number(c.req.query('limit'))
    const scanCap = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.floor(limitParam), 5000) : MATCH_SCAN_CAP
    const r = await runAutoMatchEngine(c, { lookbackDays, scanCap })
    return c.json({
      success: true,
      data: { matched: r.matched, total: r.total },
      message: r.total === 0 ? '매칭할 거래가 없습니다' : `${r.total}건 중 ${r.matched}건 매칭 제안`,
    })
  } catch (error) {
    console.error('Auto-match error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ---------------------------------------------------------------------------
// 개별 거래 처리
// ---------------------------------------------------------------------------

// POST /api/bank/transactions/:id/match — 수동 거래처 매칭 (+ 규칙 학습)
bankRouter.post('/transactions/:id/match', requireRole('ADMIN'), async (c) => {
  try {
    const id   = c.req.param('id')
    const body = await c.req.json()
    const { client_id, category_id, fixed_expense_id } = body
    const feId = fixed_expense_id ? Number(fixed_expense_id) : null

    if (!client_id && !category_id && !feId) {
      return c.json({ success: false, error: 'client_id · category_id · fixed_expense_id 중 하나 필수' }, 400)
    }

    const ef = entityFilter(c, 'bank_transactions')
    const tx = await c.env.DB.prepare(
      `SELECT id, match_status, counterpart_name, transaction_date, amount, entity_id FROM bank_transactions WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ id: number; match_status: string; counterpart_name: string | null; transaction_date: string; amount: number; entity_id: number | null }>()

    if (!tx) {
      return c.json({ success: false, error: '거래내역을 찾을 수 없습니다' }, 404)
    }
    if (tx.match_status === 'APPLIED') {
      return c.json({ success: false, error: '이미 적용된 거래는 변경할 수 없습니다' }, 400)
    }

    const user = c.get('user')

    if (category_id || feId) {
      // 비용 카테고리(+선택적 고정비) 매칭 — 공용 헬퍼(단건/일괄 동일 결과)
      const r = await applyExpenseCategory(c, tx, category_id ?? null, feId, user?.id ?? null)
      return c.json({ success: true, message: r.message })
    }

    // 거래처 매칭 (기존 로직)
    const client = await c.env.DB.prepare(
      'SELECT id FROM clients WHERE id = ? AND is_active = 1'
    ).bind(client_id).first()

    if (!client) {
      return c.json({ success: false, error: '거래처를 찾을 수 없습니다' }, 404)
    }

    await c.env.DB.prepare(`
      UPDATE bank_transactions
      SET match_status = 'CONFIRMED',
          matched_client_id = ?,
          matched_category_id = NULL,
          matched_by = ?,
          matched_at = CURRENT_TIMESTAMP,
          match_confidence = 1.0,
          match_reason = '수동매칭'
      WHERE id = ?
    `).bind(client_id, user?.id ?? 1, id).run()

    // 규칙 학습
    if (tx.counterpart_name && tx.counterpart_name.trim()) {
      await c.env.DB.prepare(`
        INSERT INTO bank_match_rules (counterpart_name, matched_client_id, matched_category_id, created_by, match_count, entity_id)
        VALUES (?, ?, NULL, ?, 1, ?)
        ON CONFLICT(entity_id, counterpart_name) DO UPDATE SET
          matched_client_id = excluded.matched_client_id,
          matched_category_id = NULL,
          match_count = match_count + 1,
          last_used_at = CURRENT_TIMESTAMP
      `).bind(tx.counterpart_name.trim(), client_id, user?.id ?? 1, getEntityId(c) || 1).run()
    }

    return c.json({ success: true, message: '매칭이 확인되었습니다' })
  } catch (error) {
    console.error('Manual match error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ---------------------------------------------------------------------------
// 적용(APPLY) 공용 — link-first: 기존 원장 기록(이관·수동 등록분)이 있으면 연결, 없으면 생성
//   이중계상 방지의 핵심. 입금=payments, 출금=purchase_payments(매입 지급) 대칭 처리.
// ---------------------------------------------------------------------------

interface ApplyTxRow {
  id: number
  transaction_date: string
  transaction_type: string
  amount: number
  match_status: string
  matched_client_id: number | null
  matched_category_id: number | null
  matched_fixed_expense_id: number | null
  counterpart_name: string | null
  description: string | null
  entity_id: number | null
}

interface LinkCandidate {
  id: number
  payment_date: string
  amount: number
  payment_method: string | null
  reference_number: string | null
  notes: string | null
}

function txIsoDate(tx: ApplyTxRow): string {
  const raw = tx.transaction_date || ''
  return raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw
}

// 기존 원장 기록 후보: 동일 거래처 + 동일 금액 + 일자 ±7일 + bank 미연결 + 동일 법인
async function findLinkCandidates(db: D1Database, tx: ApplyTxRow, clientId: number): Promise<LinkCandidate[]> {
  const isoDate = txIsoDate(tx)
  const amount = Math.abs(Number(tx.amount) || 0)
  const entityId = tx.entity_id ?? 1
  if (tx.transaction_type === 'WITHDRAWAL') {
    const { results } = await db.prepare(`
      SELECT pp.id, pp.payment_date, pp.amount, pp.payment_method, pp.reference_number, pp.notes
      FROM purchase_payments pp
      WHERE pp.supplier_id = ? AND ABS(pp.amount - ?) < 0.01
        AND ABS(julianday(pp.payment_date) - julianday(?)) <= 7
        AND COALESCE(pp.entity_id, 1) = ?
        AND NOT EXISTS (SELECT 1 FROM bank_transactions b2 WHERE b2.matched_purchase_payment_id = pp.id)
      ORDER BY ABS(julianday(pp.payment_date) - julianday(?)) ASC, pp.id ASC
      LIMIT 10
    `).bind(clientId, amount, isoDate, entityId, isoDate).all<LinkCandidate>()
    return results || []
  }
  const { results } = await db.prepare(`
    SELECT p.id, p.payment_date, p.amount, p.payment_method, p.reference_number, p.notes
    FROM payments p
    WHERE p.client_id = ? AND ABS(p.amount - ?) < 0.01
      AND ABS(julianday(p.payment_date) - julianday(?)) <= 7
      AND COALESCE(p.entity_id, 1) = ?
      AND NOT EXISTS (SELECT 1 FROM bank_transactions b2 WHERE b2.matched_payment_id = p.id)
    ORDER BY ABS(julianday(p.payment_date) - julianday(?)) ASC, p.id ASC
    LIMIT 10
  `).bind(clientId, amount, isoDate, entityId, isoDate).all<LinkCandidate>()
  return results || []
}

type ApplyOutcome =
  | { ok: true; mode: 'LINKED' | 'CREATED'; ledgerId: number; message: string }
  | { ok: false; error: string; status: number; candidates?: LinkCandidate[] }

async function applyBankTransaction(
  c: Context<HonoEnv>,
  tx: ApplyTxRow,
  clientId: number,
  opts: { linkLedgerId?: number | null; forceCreate?: boolean; paymentMethod?: string; notes?: string } = {}
): Promise<ApplyOutcome> {
  const db = c.env.DB
  const user = c.get('user')
  const payDate = txIsoDate(tx)
  const amount = Math.abs(Number(tx.amount) || 0)
  const isWithdrawal = tx.transaction_type === 'WITHDRAWAL'
  const entityId = tx.entity_id ?? (getEntityId(c) || 1)

  // 1) 연결 대상 결정 — 명시 지정 > 단일 후보 자동연결 > 신규 생성. 후보 2건+는 사용자 선택 요구.
  let linkId = opts.linkLedgerId ?? null
  if (linkId) {
    const row = isWithdrawal
      ? await db.prepare('SELECT id, supplier_id AS client_id, amount, entity_id FROM purchase_payments WHERE id = ?')
          .bind(linkId).first<{ id: number; client_id: number; amount: number; entity_id: number | null }>()
      : await db.prepare('SELECT id, client_id, amount, entity_id FROM payments WHERE id = ?')
          .bind(linkId).first<{ id: number; client_id: number; amount: number; entity_id: number | null }>()
    if (!row) return { ok: false, error: '연결할 원장 기록을 찾을 수 없습니다', status: 404 }
    if (Number(row.client_id) !== Number(clientId)) return { ok: false, error: '원장 기록의 거래처가 일치하지 않습니다', status: 400 }
    // 법인 스코프 (findLinkCandidates와 동일 규약: COALESCE(entity_id,1)). ADMIN 전체모드(0) 제외.
    if (getEntityId(c) !== 0 && (row.entity_id ?? 1) !== entityId) {
      return { ok: false, error: '다른 법인의 원장 기록입니다', status: 400 }
    }
    if (Math.abs(Number(row.amount) - amount) >= 0.01) return { ok: false, error: '원장 기록의 금액이 일치하지 않습니다', status: 400 }
    const linked = isWithdrawal
      ? await db.prepare('SELECT id FROM bank_transactions WHERE matched_purchase_payment_id = ?').bind(linkId).first()
      : await db.prepare('SELECT id FROM bank_transactions WHERE matched_payment_id = ?').bind(linkId).first()
    if (linked) return { ok: false, error: '이미 다른 은행거래와 연결된 원장 기록입니다', status: 400 }
  } else if (!opts.forceCreate) {
    const candidates = await findLinkCandidates(db, tx, clientId)
    if (candidates.length === 1) linkId = candidates[0].id
    else if (candidates.length > 1) {
      return { ok: false, status: 409, error: '동일 조건의 기존 원장 기록이 여러 건입니다. 연결 대상을 선택하세요', candidates }
    }
  }

  // 2-A) 기존 기록에 연결만 (LINKED) — 원장 기록·잔액 무변경 (이중계상 방지)
  //   원자적 클레임: 조건부 UPDATE 1건이 곧 배타적 소유권 획득. changes=0 이면 동시 요청이 선점 → 409.
  //   #535: 위 사전 SELECT(이미 연결 여부)는 UX용 fast-fail — 최종 방어선은 0470 부분 UNIQUE
  //   (idx_bt_matched_pp_uniq / idx_bt_matched_payment_uniq). 서로 다른 은행거래 2건이 같은
  //   원장을 동시 연결하면 둘 다 사전 SELECT를 통과하므로, UNIQUE 위반을 잡아 409로 변환.
  if (linkId) {
    let claim: D1Result
    try {
      claim = await db.prepare(`
        UPDATE bank_transactions
        SET match_status = 'APPLIED',
            matched_client_id = ?,
            ${isWithdrawal ? 'matched_purchase_payment_id' : 'matched_payment_id'} = ?,
            matched_link_mode = 'LINKED',
            matched_by = ?, matched_at = CURRENT_TIMESTAMP,
            match_confidence = 1.0, match_reason = '기존 원장 연결'
        WHERE id = ? AND match_status != 'APPLIED'
      `).bind(clientId, linkId, user?.id ?? 1, tx.id).run()
    } catch (err) {
      if (err instanceof Error && err.message.includes('UNIQUE')) {
        return { ok: false, error: '이미 다른 은행거래와 연결된 원장 기록입니다', status: 409 }
      }
      throw err
    }
    if (!claim.meta.changes) return { ok: false, error: '이미 처리된 은행거래입니다', status: 409 }
    return {
      ok: true, mode: 'LINKED', ledgerId: linkId,
      message: isWithdrawal ? '기존 지급 기록에 연결되었습니다 (신규 생성 없음)' : '기존 입금 기록에 연결되었습니다 (신규 생성 없음)'
    }
  }

  const defaultNotes = '[은행연동] ' + [tx.counterpart_name, tx.description].filter(Boolean).join(' ')

  // 2-B) 출금 → 매입 지급(purchase_payments) 생성 + 미지급 잔액 차감 (accounts-payable POST와 동일 규약)
  if (isWithdrawal) {
    const supplier = await db.prepare('SELECT id FROM clients WHERE id = ?').bind(clientId).first()
    if (!supplier) return { ok: false, error: '매칭된 거래처를 찾을 수 없습니다', status: 404 }
    // 원자적 클레임 우선 — 돈 변동(지급 INSERT·잔액 차감) 전에 배타 소유권 확보. changes=0 이면 동시 요청 선점 → 409, 돈 변동 없음.
    const claim = await db.prepare(`
      UPDATE bank_transactions
      SET match_status = 'APPLIED', matched_client_id = ?, matched_link_mode = 'CREATED',
          matched_by = ?, matched_at = CURRENT_TIMESTAMP
      WHERE id = ? AND match_status != 'APPLIED'
    `).bind(clientId, user?.id ?? 1, tx.id).run()
    if (!claim.meta.changes) return { ok: false, error: '이미 처리된 은행거래입니다', status: 409 }
    const results = await db.batch([
      db.prepare(`
        INSERT INTO purchase_payments (supplier_id, payment_date, amount, payment_method, reference_number, notes, created_by, entity_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(clientId, payDate, amount, opts.paymentMethod || '계좌이체', String(tx.id), opts.notes || defaultNotes, user?.id ?? 1, entityId),
      // AP 잔액은 파생(발주−지급−조정) — purchase_balance 캐시 갱신 제거(2026-08-31)
    ])
    const ppId = Number(results[0].meta.last_row_id)
    await db.prepare('UPDATE bank_transactions SET matched_purchase_payment_id = ? WHERE id = ?').bind(ppId, tx.id).run()
    return { ok: true, mode: 'CREATED', ledgerId: ppId, message: '지급이 생성되었습니다' }
  }

  // 2-C) 입금 → payments 생성 (validate + batch 원자 처리)
  const paymentData = {
    client_id: clientId,
    payment_date: payDate,
    amount,
    payment_method: opts.paymentMethod || '계좌이체',
    reference_number: String(tx.id),
    notes: opts.notes || defaultNotes,
    created_by: user?.id ?? 1,
    entity_id: entityId, // 종전 미전달 → DEFAULT 1로 저장되던 법인 오기록 버그 수정
  }
  let validated: { newBalance: number }
  try {
    validated = await validatePayment(c.env.DB, paymentData)
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Client not found')) {
      return { ok: false, error: '매칭된 거래처를 찾을 수 없습니다', status: 404 }
    }
    if (err instanceof Error && err.message.startsWith('DUPLICATE_PAYMENT')) {
      return { ok: false, error: '1분 이내 동일한 입금이 이미 등록되었습니다', status: 400 }
    }
    throw err
  }
  // 원자적 클레임 우선 — validatePayment(검증 통과) 후, 돈 변동(payments INSERT) 전에 배타 소유권 확보.
  //   검증을 클레임보다 먼저 두어, 검증 실패 시 tx가 미결제 상태로 클레임되어 남는 일이 없게 한다.
  //   changes=0 이면 동시 요청 선점 → 409, 돈 변동 없음.
  const claim = await db.prepare(`
    UPDATE bank_transactions
    SET match_status = 'APPLIED', matched_client_id = ?, matched_link_mode = 'CREATED',
        matched_by = ?, matched_at = CURRENT_TIMESTAMP
    WHERE id = ? AND match_status != 'APPLIED'
  `).bind(clientId, user?.id ?? 1, tx.id).run()
  if (!claim.meta.changes) return { ok: false, error: '이미 처리된 은행거래입니다', status: 409 }
  const payStmts = preparePaymentStatements(c.env.DB, paymentData, validated.newBalance)
  const batchResults = await db.batch(payStmts)
  const paymentId = Number(batchResults[0].meta.last_row_id)
  await db.prepare('UPDATE bank_transactions SET matched_payment_id = ? WHERE id = ?').bind(paymentId, tx.id).run()

  // 입금예정(cash_schedule) 소진은 여기서 찍지 않는다 — payments 행이 곧 근거이고,
  // 어느 예정이 얼마나 회수됐는지는 조회 시점에 FIFO 로 파생한다(utils/cashflowEngine §0).
  //   종전엔 `금액 완전일치` 한 건만 DONE 으로 UPDATE 했다. 부분입금·합산입금·상계 후 입금은
  //   영영 매칭되지 않아 예정이 남았고, 더 나쁘게는 적용 취소(/cancel-apply)가 그 DONE 을
  //   되돌리지 않아 한 번 찍힌 예정이 굳었다. 파생이면 이 취소가 그냥 payments 삭제로 끝난다.
  //   게이트 = npm run test:cash-settle

  return { ok: true, mode: 'CREATED', ledgerId: paymentId, message: '입금이 생성되었습니다' }
}

// GET /api/bank/transactions/:id/link-candidates — 연결 가능한 기존 원장 기록 후보 조회 (UI 적용 모달)
bankRouter.get('/transactions/:id/link-candidates', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    const clientIdRaw = parseInt(c.req.query('client_id') || '', 10)
    const ef = entityFilter(c, 'bank_transactions')
    const tx = await c.env.DB.prepare(
      `SELECT id, transaction_date, transaction_type, amount, match_status, matched_client_id, counterpart_name, description, entity_id
       FROM bank_transactions WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<ApplyTxRow>()
    if (!tx) return c.json({ success: false, error: '거래내역을 찾을 수 없습니다' }, 404)

    const clientId = Number.isFinite(clientIdRaw) && clientIdRaw > 0 ? clientIdRaw : tx.matched_client_id
    if (!clientId) return c.json({ success: true, data: [], transaction_type: tx.transaction_type })

    const candidates = await findLinkCandidates(c.env.DB, tx, clientId)
    return c.json({ success: true, data: candidates, transaction_type: tx.transaction_type })
  } catch (error) {
    console.error('Link candidates error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /api/bank/transactions/:id/apply — 원장 반영 (link-first: 연결 우선, 없으면 생성)
//   입금 → payments · 출금 → purchase_payments(매입 지급). body.link_payment_id=기존 건 연결, body.force_create=강제 신규.
bankRouter.post('/transactions/:id/apply', requireRole('ADMIN'), async (c) => {
  try {
    const id   = c.req.param('id')
    const user = c.get('user')
    const body = await c.req.json().catch(() => ({})) as any

    const ef = entityFilter(c, 'bank_transactions')
    const tx = await c.env.DB.prepare(
      `SELECT id, transaction_date, transaction_type, amount, match_status, matched_client_id, matched_category_id, matched_fixed_expense_id, counterpart_name, description, entity_id
       FROM bank_transactions WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<ApplyTxRow>()

    if (!tx) {
      return c.json({ success: false, error: '거래내역을 찾을 수 없습니다' }, 404)
    }
    if (tx.match_status === 'APPLIED') {
      return c.json({ success: false, error: '이미 적용된 거래입니다' }, 400)
    }
    if (!['CONFIRMED', 'SUGGESTED', 'UNMATCHED'].includes(tx.match_status)) {
      return c.json({
        success: false,
        error: 'APPLIED 또는 IGNORED 상태의 거래는 적용할 수 없습니다'
      }, 400)
    }

    // body에서 client_id가 오면 우선 사용, 없으면 기존 matched_client_id
    const clientId = body.client_id || tx.matched_client_id
    if (!clientId) {
      // 거래처가 없으면 비용분류 경로 — 운임/수수료처럼 채권채무가 아닌 건은 원장이 아니라 비용으로 확정.
      const categoryId = body.category_id || tx.matched_category_id
      const feId = body.fixed_expense_id ?? tx.matched_fixed_expense_id ?? null
      if (categoryId || feId) {
        const r = await applyExpenseCategory(c, tx, categoryId ?? null, feId ? Number(feId) : null, user?.id ?? null)
        return c.json({ success: true, data: { mode: 'CATEGORY' }, message: r.message })
      }
      return c.json({ success: false, error: '거래처 또는 비용분류를 먼저 지정하세요' }, 400)
    }

    // client_id가 body에서 왔으면 matched_client_id도 업데이트
    if (body.client_id && body.client_id !== tx.matched_client_id) {
      await c.env.DB.prepare(
        'UPDATE bank_transactions SET matched_client_id = ? WHERE id = ?'
      ).bind(body.client_id, id).run()
    }

    const outcome = await applyBankTransaction(c, tx, Number(clientId), {
      linkLedgerId: body.link_payment_id ? Number(body.link_payment_id) : null,
      forceCreate: body.force_create === true,
      paymentMethod: body.payment_method,
      notes: body.notes,
    })

    if (!outcome.ok) {
      // 409 = 기존 원장 후보 복수 → UI가 candidates로 선택 모달 표시
      return c.json({
        success: false,
        error: outcome.error,
        needs_choice: outcome.status === 409 ? true : undefined,
        candidates: outcome.candidates,
      }, outcome.status as 400 | 404 | 409)
    }

    // 적용 = 사람이 이 거래처를 승인한 것 → 규칙 학습(다음부터 자동매칭)
    await learnMatchRule(c, tx.counterpart_name, {
      clientId: Number(clientId),
      userId: user?.id ?? 1,
      entityId: tx.entity_id ?? getEntityId(c) ?? 1,
    })

    return c.json({
      success: true,
      data: {
        payment_id: tx.transaction_type === 'WITHDRAWAL' ? undefined : outcome.ledgerId,
        purchase_payment_id: tx.transaction_type === 'WITHDRAWAL' ? outcome.ledgerId : undefined,
        link_mode: outcome.mode,
      },
      message: outcome.message
    })
  } catch (error) {
    console.error('Apply transaction error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// POST /api/bank/transactions/batch-apply — 일괄 적용
bankRouter.post('/transactions/batch-apply', requireRole('ADMIN'), async (c) => {
  try {
    const body = await c.req.json()
    const { transaction_ids, client_map, category_map } = body as {
      transaction_ids: number[]
      client_map?: Record<string, number>    // txId -> clientId (UI에서 선택한 거래처)
      category_map?: Record<string, number>  // txId -> categoryId (UI 비용분류 모드)
    }
    const user = c.get('user')

    if (!Array.isArray(transaction_ids) || transaction_ids.length === 0) {
      return c.json({ success: false, error: 'transaction_ids 배열 필수' }, 400)
    }
    if (transaction_ids.length > 1000) {
      return c.json({ success: false, error: '한 번에 최대 1000건까지 처리할 수 있습니다.' }, 400)
    }

    const results: { id: number; success: boolean; error?: string; payment_id?: number; link_mode?: string }[] = []

    // #572 서브요청 한도 가드 — 건당 순차 D1이 최대 9회다:
    //   findLinkCandidates(1) + applyBankTransaction(입금 신규생성 최대 5·출금 4) +
    //   matched_client_id UPDATE(1) + learnMatchRule(1).
    //   1000건 × 9 = 9,000 > Workers 요청당 서브요청 한도(1000) → 처리 도중 요청이 죽어
    //   "어디까지 반영됐는지 모르는" 반쪽 상태가 된다. Shift 범위선택(7f6afdf)으로 목록
    //   1000건 전체 선택이 두 번 클릭에 가능해지면서 실제로 도달 가능한 경로가 됐다.
    //   → 요청당 처리 상한을 두고 나머지는 remaining으로 반환, 프론트가 이어서 재호출한다.
    //   (#562 monthly-create·#478 orders/lifecycle과 동일한 표준 픽스 패턴)
    //   ⚠️ learnMatchRule을 counterpart별로 dedup하면 서브요청이 더 줄지만 match_count(학습
    //      가중치)가 달라져 자동매칭 정밀도에 영향 → 건수 상한만 적용한다.
    const BATCH_APPLY_MAX = 80 // 80 × 9 = 720 + 조회 1회 < 1000 (헤드룸 확보)
    const idsToProcess = transaction_ids.slice(0, BATCH_APPLY_MAX)
    const remainingIds = transaction_ids.slice(BATCH_APPLY_MAX)

    // Bulk-fetch all transactions (D1 바인드 한도 회피: 80개 청크 분할)
    const ef = entityFilter(c, 'bank_transactions')
    const txMap = new Map<number, ApplyTxRow>()
    for (let i = 0; i < idsToProcess.length; i += 80) {
      const chunk = idsToProcess.slice(i, i + 80)
      const placeholders = chunk.map(() => '?').join(', ')
      const { results: txRows } = await c.env.DB.prepare(
        `SELECT id, transaction_date, transaction_type, amount, match_status, matched_client_id, matched_category_id, matched_fixed_expense_id, counterpart_name, description, entity_id FROM bank_transactions WHERE id IN (${placeholders})${ef.clause}`
      ).bind(...chunk, ...ef.params).all<ApplyTxRow>()
      for (const row of txRows) txMap.set(row.id, row)
    }

    for (const txId of idsToProcess) {
      const tx = txMap.get(txId) ?? null

      if (!tx) {
        results.push({ id: txId, success: false, error: '거래내역 없음' })
        continue
      }
      if (tx.match_status === 'APPLIED') {
        results.push({ id: txId, success: false, error: '이미 적용됨' })
        continue
      }
      // UI에서 거래처를 선택한 경우 client_map에서 가져옴
      const uiClientId = client_map?.[String(txId)]
      const effectiveClientId = uiClientId || tx.matched_client_id
      // 거래처가 없으면 비용분류 경로로 처리(운임·수수료 등 채권채무 아님) — 둘 다 없을 때만 실패.
      const effectiveCategoryId = category_map?.[String(txId)] || tx.matched_category_id

      if (!effectiveClientId && !effectiveCategoryId && !tx.matched_fixed_expense_id) {
        results.push({ id: txId, success: false, error: '거래처·비용분류 미지정' })
        continue
      }
      if (!['CONFIRMED', 'SUGGESTED', 'UNMATCHED'].includes(tx.match_status)) {
        results.push({ id: txId, success: false, error: `적용 불가 상태: ${tx.match_status}` })
        continue
      }

      // 비용분류 확정(원장 생성 없음). 거래처가 지정돼 있으면 거래처 원장 반영이 우선.
      if (!effectiveClientId) {
        try {
          await applyExpenseCategory(c, tx, effectiveCategoryId ?? null, tx.matched_fixed_expense_id ?? null, user?.id ?? null)
          results.push({ id: txId, success: true, link_mode: 'CATEGORY' })
        } catch (err) {
          console.error('Category apply error for transaction:', txId, err)
          results.push({ id: txId, success: false, error: '비용분류 처리 중 오류' })
        }
        continue
      }

      // UNMATCHED에서 client_map으로 온 경우 matched_client_id도 업데이트
      if (uiClientId && tx.matched_client_id !== uiClientId) {
        await c.env.DB.prepare(
          'UPDATE bank_transactions SET matched_client_id = ? WHERE id = ?'
        ).bind(uiClientId, txId).run()
      }

      try {
        // link-first: 단일 후보=기존 원장 연결, 후보 없음=생성, 복수 후보=개별 적용 유도
        const outcome = await applyBankTransaction(c, tx, Number(effectiveClientId), {})
        if (!outcome.ok) {
          results.push({
            id: txId, success: false,
            error: outcome.candidates ? `기존 원장 후보 ${outcome.candidates.length}건 — 개별 적용에서 선택 필요` : outcome.error
          })
          continue
        }
        // 매칭+적용 통합(2026-07-27): 적용 = 거래처 승인 → 규칙 학습까지 한 번에.
        // (구 [일괄 매칭] 버튼이 하던 학습을 여기로 흡수 — '적용만 쓰면 학습 안 되는' 갭 제거)
        await learnMatchRule(c, tx.counterpart_name, {
          clientId: Number(effectiveClientId),
          userId: user?.id ?? 1,
          entityId: tx.entity_id ?? getEntityId(c) ?? 1,
        })
        results.push({ id: txId, success: true, payment_id: outcome.ledgerId, link_mode: outcome.mode })
      } catch (err) {
        console.error('Payment record error for transaction:', txId, err)
        results.push({
          id: txId,
          success: false,
          error: '서버 오류가 발생했습니다'
        })
      }
    }

    const succeededCount = results.filter(r => r.success).length
    return c.json({
      success: true,
      data: {
        results,
        succeeded: succeededCount,
        failed: results.length - succeededCount,
        // #572 이어서 처리할 나머지 — 프론트가 remaining_transaction_ids로 재호출해 완주한다.
        processed_count: idsToProcess.length,
        remaining_transaction_ids: remainingIds,
        remaining_count: remainingIds.length,
        has_more: remainingIds.length > 0,
      },
      message: `${results.length}건 중 ${succeededCount}건 적용 완료`
        + (remainingIds.length > 0 ? ` · 남은 ${remainingIds.length}건 계속 처리` : '')
    })
  } catch (error) {
    console.error('Batch apply error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// POST /api/bank/transactions/batch-match — 일괄 매칭(거래처 확정만, 원장 미반영)
//   2026-07-27 UI 통합: [일괄 매칭] 버튼 제거 → 화면 진입점 없음. batch-apply가 확정+반영+학습을 모두 수행.
//   라우트는 보존(외부/스크립트 호출·되돌리기 대비). UI 복원 시 pages/bank.ts 플로팅바에 버튼 추가.
bankRouter.post('/transactions/batch-match', requireRole('ADMIN'), async (c) => {
  try {
    const body = await c.req.json()
    const { matches } = body as { matches: { transaction_id: number; client_id: number }[] }
    const user = c.get('user')

    if (!Array.isArray(matches) || matches.length === 0) {
      return c.json({ success: false, error: 'matches 배열 필수 (각 항목: transaction_id, client_id)' }, 400)
    }
    if (matches.length > 1000) {
      return c.json({ success: false, error: '한 번에 최대 1000건까지 처리할 수 있습니다.' }, 400)
    }

    const results: { id: number; success: boolean; error?: string }[] = []

    // Bulk-fetch transactions (D1 바인드 한도 회피: 80개 청크 분할)
    const txIds = matches.map(m => m.transaction_id)
    const ef = entityFilter(c, 'bank_transactions')
    type TxMatchRow = { id: number; match_status: string; counterpart_name: string | null }
    const txMap = new Map<number, TxMatchRow>()
    for (let i = 0; i < txIds.length; i += 80) {
      const chunk = txIds.slice(i, i + 80)
      const placeholders = chunk.map(() => '?').join(', ')
      const { results: txRows } = await c.env.DB.prepare(
        `SELECT id, match_status, counterpart_name FROM bank_transactions WHERE id IN (${placeholders})${ef.clause}`
      ).bind(...chunk, ...ef.params).all<TxMatchRow>()
      for (const row of txRows) txMap.set(row.id, row)
    }

    // Validate all client_ids exist (80개 청크 분할)
    const clientIds = [...new Set(matches.map(m => m.client_id))]
    const validClientIds = new Set<number>()
    for (let i = 0; i < clientIds.length; i += 80) {
      const chunk = clientIds.slice(i, i + 80)
      const clientPlaceholders = chunk.map(() => '?').join(', ')
      const { results: clientRows } = await c.env.DB.prepare(
        `SELECT id FROM clients WHERE id IN (${clientPlaceholders}) AND is_active = 1`
      ).bind(...chunk).all<{ id: number }>()
      for (const r of clientRows) validClientIds.add(r.id)
    }

    const entityId = getEntityId(c) || 1

    for (const { transaction_id, client_id } of matches) {
      const tx = txMap.get(transaction_id)
      if (!tx) {
        results.push({ id: transaction_id, success: false, error: '거래내역 없음' })
        continue
      }
      if (tx.match_status === 'APPLIED') {
        results.push({ id: transaction_id, success: false, error: '이미 적용됨' })
        continue
      }
      if (!validClientIds.has(client_id)) {
        results.push({ id: transaction_id, success: false, error: '거래처 없음' })
        continue
      }

      await c.env.DB.prepare(`
        UPDATE bank_transactions
        SET match_status = 'CONFIRMED',
            matched_client_id = ?,
            matched_by = ?,
            matched_at = CURRENT_TIMESTAMP,
            match_confidence = 1.0,
            match_reason = '일괄 수동매칭'
        WHERE id = ?
      `).bind(client_id, user?.id ?? 1, transaction_id).run()

      // 규칙 학습
      if (tx.counterpart_name && tx.counterpart_name.trim()) {
        await c.env.DB.prepare(`
          INSERT INTO bank_match_rules (counterpart_name, matched_client_id, matched_category_id, created_by, match_count, entity_id)
          VALUES (?, ?, NULL, ?, 1, ?)
          ON CONFLICT(entity_id, counterpart_name) DO UPDATE SET
            matched_client_id = excluded.matched_client_id,
            matched_category_id = NULL,
            match_count = match_count + 1,
            last_used_at = CURRENT_TIMESTAMP
        `).bind(tx.counterpart_name.trim(), client_id, user?.id ?? 1, entityId).run()
      }

      results.push({ id: transaction_id, success: true })
    }

    const succeededCount = results.filter(r => r.success).length
    return c.json({
      success: true,
      data: { results, succeeded: succeededCount, failed: results.length - succeededCount },
      message: `${results.length}건 중 ${succeededCount}건 매칭 완료`
    })
  } catch (error) {
    console.error('Batch match error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /api/bank/transactions/:id/ignore — IGNORED 처리
bankRouter.post('/transactions/:id/ignore', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    const ef = entityFilter(c, 'bank_transactions')

    const tx = await c.env.DB.prepare(
      `SELECT id, match_status FROM bank_transactions WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ id: number; match_status: string }>()

    if (!tx) {
      return c.json({ success: false, error: '거래내역을 찾을 수 없습니다' }, 404)
    }
    if (tx.match_status === 'APPLIED') {
      return c.json({ success: false, error: '이미 적용된 거래는 무시할 수 없습니다' }, 400)
    }

    await c.env.DB.prepare(
      "UPDATE bank_transactions SET match_status = 'IGNORED' WHERE id = ?"
    ).bind(id).run()

    return c.json({ success: true, message: '거래가 무시 처리되었습니다' })
  } catch (error) {
    console.error('Ignore transaction error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// POST /api/bank/transactions/:id/unapply — APPLIED 해제
//   CREATED(bank이 생성): 원장 기록 삭제(+AP는 미지급 잔액 복원). LINKED(기존 건 연결): 링크만 해제, 원장 기록 유지.
//   기존 데이터(matched_link_mode NULL)는 CREATED로 간주 — 종전 동작(항상 생성)과 동일.
bankRouter.post('/transactions/:id/unapply', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    const ef = entityFilter(c, 'bank_transactions')

    const tx = await c.env.DB.prepare(
      `SELECT id, match_status, matched_payment_id, matched_purchase_payment_id, matched_link_mode, matched_client_id, matched_fixed_expense_id, transaction_date, amount, entity_id FROM bank_transactions WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{
      id: number; match_status: string; matched_payment_id: number | null
      matched_purchase_payment_id: number | null; matched_link_mode: string | null
      matched_client_id: number | null; matched_fixed_expense_id: number | null
      transaction_date: string; amount: number; entity_id: number | null
    }>()

    if (!tx) {
      return c.json({ success: false, error: '거래내역을 찾을 수 없습니다' }, 404)
    }
    if (tx.match_status !== 'APPLIED') {
      return c.json({ success: false, error: 'APPLIED 상태의 거래만 취소할 수 있습니다' }, 400)
    }

    const clearStmt = c.env.DB.prepare(`
      UPDATE bank_transactions
      SET match_status = 'UNMATCHED',
          matched_client_id = NULL, matched_category_id = NULL, matched_fixed_expense_id = NULL,
          matched_payment_id = NULL, matched_purchase_payment_id = NULL, matched_link_mode = NULL,
          matched_by = NULL, matched_at = NULL,
          match_confidence = NULL, match_reason = NULL
      WHERE id = ?
    `).bind(id)

    const isLinked = tx.matched_link_mode === 'LINKED'
    let restoreMsg = '적용이 취소되었습니다.'

    if (isLinked) {
      // 연결만 해제 — 원장 기록(payments/purchase_payments)은 유지 (이관·수동 등록분)
      await clearStmt.run()
      restoreMsg = '연결이 해제되었습니다. 원장 기록은 유지됩니다.'
    } else if (tx.matched_payment_id) {
      // 1. bank이 생성한 payment 삭제 + transaction 복원
      const payment = await c.env.DB.prepare(
        'SELECT id, client_id, amount FROM payments WHERE id = ?'
      ).bind(tx.matched_payment_id).first<{ id: number; client_id: number; amount: number }>()

      if (payment) {
        // split billing P3: clients.balance 캐시 미사용 — payment 삭제 + transaction 상태 복원만 (미수금 파생)
        await c.env.DB.batch([
          c.env.DB.prepare('DELETE FROM payments WHERE id = ?').bind(tx.matched_payment_id),
          clearStmt,
        ])
        restoreMsg = '적용이 취소되었습니다. 입금 기록이 삭제되고 잔액이 복원되었습니다.'
      } else {
        await clearStmt.run()
      }
    } else if (tx.matched_purchase_payment_id) {
      // 2. bank이 생성한 매입 지급 삭제 (미지급 잔액은 파생이라 지급 행만 지우면 자동 복원)
      const pp = await c.env.DB.prepare(
        'SELECT id, supplier_id, amount FROM purchase_payments WHERE id = ?'
      ).bind(tx.matched_purchase_payment_id).first<{ id: number; supplier_id: number; amount: number }>()

      if (pp) {
        await c.env.DB.batch([
          c.env.DB.prepare('DELETE FROM purchase_payments WHERE id = ?').bind(pp.id),
          // AP 잔액은 파생(발주−지급−조정) — purchase_balance 캐시 갱신 제거(2026-08-31)
          clearStmt,
        ])
        restoreMsg = '적용이 취소되었습니다. 지급 기록이 삭제되고 미지급 잔액이 복원되었습니다.'
      } else {
        await clearStmt.run()
      }
    } else {
      // 원장 기록 없음 (비용분류/고정비 확정 등) — transaction만 복원
      await clearStmt.run()
    }

    // #511: 고정비 확정이었으면 당월 실적행(recurring_expense_actuals) 정리 — 체크리스트가 PAID로 남는 것 방지.
    //   UNIQUE(fixed_expense_id, period)이라 BANK 출처 실적은 이 거래가 만든 것. period=거래일 YYYY-MM.
    if (tx.matched_fixed_expense_id && (tx.transaction_date || '').length >= 6) {
      const period = `${tx.transaction_date.slice(0, 4)}-${tx.transaction_date.slice(4, 6)}`
      await c.env.DB.prepare(
        `DELETE FROM recurring_expense_actuals WHERE fixed_expense_id = ? AND period = ? AND actual_source = 'BANK'`
      ).bind(tx.matched_fixed_expense_id, period).run()
    }

    return c.json({ success: true, message: restoreMsg })
  } catch (error) {
    console.error('Unapply transaction error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /api/bank/transactions/:id/unmatch — UNMATCHED로 되돌리기
bankRouter.post('/transactions/:id/unmatch', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    const ef = entityFilter(c, 'bank_transactions')

    const tx = await c.env.DB.prepare(
      `SELECT id, match_status FROM bank_transactions WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ id: number; match_status: string }>()

    if (!tx) {
      return c.json({ success: false, error: '거래내역을 찾을 수 없습니다' }, 404)
    }
    if (tx.match_status === 'APPLIED') {
      return c.json({ success: false, error: '이미 적용된 거래는 되돌릴 수 없습니다' }, 400)
    }

    await c.env.DB.prepare(`
      UPDATE bank_transactions
      SET match_status = 'UNMATCHED',
          matched_client_id = NULL,
          matched_category_id = NULL,
          matched_fixed_expense_id = NULL,
          matched_purchase_payment_id = NULL,
          matched_link_mode = NULL,
          matched_by = NULL,
          matched_at = NULL,
          match_confidence = NULL,
          match_reason = NULL
      WHERE id = ?
    `).bind(id).run()

    return c.json({ success: true, message: '매칭이 초기화되었습니다' })
  } catch (error) {
    console.error('Unmatch transaction error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ---------------------------------------------------------------------------
// 계좌간 자금이체 (자동감지 → 확인)
// ---------------------------------------------------------------------------

// POST /api/bank/transactions/detect-transfers — 이체 후보쌍 감지(동일금액±수수료·W+D·다계좌·±2일)
//   ?days=N  조회 기간(기본 90). 0 이면 전 기간 — 과거분 소급 정리용.
bankRouter.post('/transactions/detect-transfers', requireRole('ADMIN'), async (c) => {
  try {
    const ef = entityFilter(c, 'bt')
    // 기본은 기존 동작(최근 90일) 유지. days=0 을 줘야 전 기간을 훑는다.
    const daysRaw = Number(c.req.query('days'))
    const lookbackDays = Number.isFinite(daysRaw) && daysRaw >= 0 ? daysRaw : MATCH_LOOKBACK_DAYS
    const dateClause = lookbackDays > 0 ? ' AND bt.transaction_date >= ?' : ''
    const dateParams = lookbackDays > 0 ? [lookbackYmd(lookbackDays)] : []

    type TxRow = {
      id: number; bank_account_id: number; transaction_date: string
      transaction_type: string; amount: number; counterpart_name: string | null
      match_status: string; account_label: string | null
    }
    // APPLIED(실제 수금·지급이 반영된 건)만 제외한다. CONFIRMED 로 잘못 확정된 건도
    // 이체 후보로 다시 볼 수 있어야 한다 — 안 그러면 영구히 손익에 남는다.
    const { results } = await c.env.DB.prepare(`
      SELECT bt.id, bt.bank_account_id, bt.transaction_date, bt.transaction_type, bt.amount, bt.counterpart_name,
        bt.match_status, COALESCE(ba.account_alias, ba.bank_name) AS account_label
      FROM bank_transactions bt
      LEFT JOIN bank_accounts ba ON ba.id = bt.bank_account_id
      WHERE bt.match_status != 'APPLIED' AND bt.transfer_pair_id IS NULL${ef.clause}${dateClause}
      ORDER BY bt.transaction_date ASC, bt.id ASC
    `).bind(...ef.params, ...dateParams).all<TxRow>()

    const withdrawals = results.filter(r => r.transaction_type === 'WITHDRAWAL')
    const usedDep = new Set<number>()
    const ymdEpoch = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8))

    // 입금을 날짜별로 묶어 ±2일 창만 훑는다(days=0 전 기간 조회에서 O(W×D) 폭발 방지)
    const depByDay = new Map<number, TxRow[]>()
    for (const d of results) {
      if (d.transaction_type !== 'DEPOSIT') continue
      const k = ymdEpoch(d.transaction_date)
      const arr = depByDay.get(k)
      if (arr) arr.push(d); else depByDay.set(k, [d])
    }

    // 금액이 정확히 안 맞는 쌍은 상대방명이 같아야 인정한다. 금액만 보면
    // `호명화물-정운교역운임`(출금)에 `삼성117636309`(입금) 같은 무관한 건이 붙는다.
    const normName = (s: string | null) => String(s || '')
      .replace(/[（）]/g, m => (m === '（' ? '(' : ')'))
      .replace(/(주식회사|㈜|\(주\)|\(유\)|유한회사)/g, '')
      .replace(/[\s.·,\-_'"]/g, '')
    const sameParty = (a: string | null, b: string | null) => {
      const x = normName(a), y = normName(b)
      if (x.length < 2 || y.length < 2) return false
      return x.includes(y) || y.includes(x)
    }

    const findMatch = (w: TxRow, exact: boolean): { d: TxRow; fee: number } | null => {
      const wAmt = Math.abs(Number(w.amount) || 0)
      const wt = ymdEpoch(w.transaction_date)
      for (let off = -2; off <= 2; off++) {
        for (const d of depByDay.get(wt + off * 86400000) || []) {
          if (usedDep.has(d.id)) continue
          if (d.bank_account_id === w.bank_account_id) continue
          const fee = wAmt - Math.abs(Number(d.amount) || 0)   // 출금이 수수료만큼 크다
          if (exact) { if (fee !== 0) continue }
          else {
            // 소액에서 엉뚱한 쌍이 붙지 않도록 절대폭·비율(1%)·상대방명을 함께 건다
            if (fee <= 0 || fee > TRANSFER_FEE_MAX || fee > wAmt * 0.01) continue
            if (!sameParty(w.counterpart_name, d.counterpart_name)) continue
          }
          return { d, fee }
        }
      }
      return null
    }

    // 1차 정확일치 → 2차 수수료 허용. 정확히 맞는 쌍이 수수료 후보에 뺏기지 않게 한다.
    const pairs: any[] = []
    const pending: TxRow[] = []
    for (const w of withdrawals) {
      const m = findMatch(w, true)
      if (m) { usedDep.add(m.d.id); pairs.push({ withdrawal: w, deposit: m.d, amount: Math.abs(Number(w.amount) || 0), fee: 0 }) }
      else pending.push(w)
    }
    for (const w of pending) {
      const m = findMatch(w, false)
      if (m) { usedDep.add(m.d.id); pairs.push({ withdrawal: w, deposit: m.d, amount: Math.abs(Number(w.amount) || 0), fee: m.fee }) }
    }
    pairs.sort((a, b) => String(a.withdrawal.transaction_date).localeCompare(String(b.withdrawal.transaction_date)))

    return c.json({
      success: true,
      data: { pairs, count: pairs.length, days: lookbackDays, feeCount: pairs.filter(p => p.fee > 0).length }
    })
  } catch (error) {
    console.error('Detect transfers error:', error)
    return c.json({ success: false, error: '이체 감지 오류' }, 500)
  }
})

// POST /api/bank/transactions/confirm-transfer — 후보쌍을 계좌이체로 확정(상호 링크 + IGNORED)
bankRouter.post('/transactions/confirm-transfer', requireRole('ADMIN'), async (c) => {
  try {
    const { withdrawal_id, deposit_id } = await c.req.json()
    if (!withdrawal_id || !deposit_id || Number(withdrawal_id) === Number(deposit_id)) {
      return c.json({ success: false, error: 'withdrawal_id·deposit_id 필수(서로 달라야 함)' }, 400)
    }
    const ef = entityFilter(c, 'bt')
    const { results: rows } = await c.env.DB.prepare(`
      SELECT bt.id, bt.bank_account_id, bt.transaction_type, bt.match_status, bt.transfer_pair_id
      FROM bank_transactions bt WHERE bt.id IN (?, ?)${ef.clause}
    `).bind(withdrawal_id, deposit_id, ...ef.params).all<{
      id: number; bank_account_id: number; transaction_type: string; match_status: string; transfer_pair_id: number | null
    }>()
    if (rows.length !== 2) return c.json({ success: false, error: '거래를 찾을 수 없습니다' }, 404)
    if (rows.some(r => r.match_status === 'APPLIED' || r.transfer_pair_id != null)) {
      return c.json({ success: false, error: '이미 적용/이체된 거래가 포함되어 있습니다' }, 400)
    }
    const a = rows.find(r => r.id === Number(withdrawal_id))!
    const b = rows.find(r => r.id === Number(deposit_id))!
    if (a.bank_account_id === b.bank_account_id) {
      return c.json({ success: false, error: '같은 계좌 간에는 이체로 처리할 수 없습니다' }, 400)
    }
    // CONFIRMED 였던 건도 이체로 전환되므로 matched_* 를 전 필드 정리한다
    // (형제 경로 /unmatch·/cancel-apply 와 동일 집합. 하나라도 빠지면 상태가 어긋난다)
    const upd = (id: number, pair: number) => c.env.DB.prepare(`
      UPDATE bank_transactions
      SET transfer_pair_id = ?, match_status = 'IGNORED', match_reason = '계좌이체',
          matched_client_id = NULL, matched_category_id = NULL, matched_fixed_expense_id = NULL,
          matched_payment_id = NULL, matched_purchase_payment_id = NULL, matched_link_mode = NULL,
          match_confidence = 1.0
      WHERE id = ?
    `).bind(pair, id)
    await c.env.DB.batch([upd(a.id, b.id), upd(b.id, a.id)])
    return c.json({ success: true, message: '계좌이체로 처리되었습니다' })
  } catch (error) {
    console.error('Confirm transfer error:', error)
    return c.json({ success: false, error: '이체 확정 오류' }, 500)
  }
})

// POST /api/bank/transactions/:id/unlink-transfer — 이체 해제(양쪽 UNMATCHED 복원)
bankRouter.post('/transactions/:id/unlink-transfer', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    const ef = entityFilter(c, 'bt')
    const row = await c.env.DB.prepare(
      `SELECT bt.id, bt.transfer_pair_id FROM bank_transactions bt WHERE bt.id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ id: number; transfer_pair_id: number | null }>()
    if (!row) return c.json({ success: false, error: '거래를 찾을 수 없습니다' }, 404)
    // #513: 이체쌍이 아닌 거래를 리셋하지 않도록 가드(직접 호출·재시도 방어)
    if (!row.transfer_pair_id) return c.json({ success: false, error: '계좌이체로 처리된 거래가 아닙니다' }, 400)
    // #513: 형제 /unmatch와 동일하게 matched_* 전 필드 정리(분류정보 잔존으로 인한 상태 불일치 방지)
    const ids = [row.id, row.transfer_pair_id]
    const ph = ids.map(() => '?').join(',')
    await c.env.DB.prepare(`
      UPDATE bank_transactions
      SET transfer_pair_id = NULL, match_status = 'UNMATCHED',
          matched_client_id = NULL, matched_category_id = NULL, matched_fixed_expense_id = NULL,
          matched_payment_id = NULL, matched_purchase_payment_id = NULL, matched_link_mode = NULL,
          matched_by = NULL, matched_at = NULL,
          match_reason = NULL, match_confidence = NULL
      WHERE id IN (${ph})
    `).bind(...ids).run()
    return c.json({ success: true, message: '계좌이체가 해제되었습니다' })
  } catch (error) {
    console.error('Unlink transfer error:', error)
    return c.json({ success: false, error: '이체 해제 오류' }, 500)
  }
})

// ---------------------------------------------------------------------------
// 통계
// ---------------------------------------------------------------------------

// GET /api/bank/stats
bankRouter.get('/stats', requireRole('ADMIN'), async (c) => {
  try {
    const ef = entityFilter(c, 'bank_transactions')
    const stats = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total_count,
        SUM(CASE WHEN match_status = 'UNMATCHED'  THEN 1 ELSE 0 END) as unmatched_count,
        SUM(CASE WHEN match_status = 'SUGGESTED'  THEN 1 ELSE 0 END) as suggested_count,
        SUM(CASE WHEN match_status = 'CONFIRMED'  THEN 1 ELSE 0 END) as confirmed_count,
        SUM(CASE WHEN match_status = 'APPLIED'    THEN 1 ELSE 0 END) as applied_count,
        SUM(CASE WHEN match_status = 'IGNORED'    THEN 1 ELSE 0 END) as ignored_count
      FROM bank_transactions
      WHERE 1=1${ef.clause}
    `).bind(...ef.params).first<{
      total_count: number
      unmatched_count: number
      suggested_count: number
      confirmed_count: number
      applied_count: number
      ignored_count: number
    }>()

    const efAcc = entityFilter(c, 'bank_accounts')
    const lastSync = await c.env.DB.prepare(
      `SELECT MAX(last_synced_at) as last_sync FROM bank_accounts WHERE is_active = 1${efAcc.clause}`
    ).bind(...efAcc.params).first<{ last_sync: string | null }>()

    return c.json({
      success: true,
      data: {
        total_count:     stats?.total_count     ?? 0,
        unmatched_count: stats?.unmatched_count ?? 0,
        suggested_count: stats?.suggested_count ?? 0,
        confirmed_count: stats?.confirmed_count ?? 0,
        applied_count:   stats?.applied_count   ?? 0,
        ignored_count:   stats?.ignored_count   ?? 0,
        last_sync:       lastSync?.last_sync     ?? null,
      }
    })
  } catch (error) {
    console.error('Bank stats error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ---------------------------------------------------------------------------
// CSV 내보내기
// ---------------------------------------------------------------------------
bankRouter.get('/transactions/export', requireRole('ADMIN'), async (c) => {
  try {
    const { account_id, date_start, date_end, transaction_type } = c.req.query()
    const matchStatuses = c.req.queries('match_status') || []
    const singleStatus = c.req.query('match_status')

    let query = `
      SELECT
        bt.transaction_date, bt.transaction_time, bt.transaction_type, bt.amount,
        bt.balance_after, bt.counterpart_name, bt.description, bt.match_status,
        ba.bank_name, ba.account_number,
        c.client_name as matched_client_name
      FROM bank_transactions bt
      LEFT JOIN bank_accounts ba ON bt.bank_account_id = ba.id
      LEFT JOIN clients c ON bt.matched_client_id = c.id
      WHERE 1=1${entityFilter(c, 'bt').clause}
    `
    const params: (string | number)[] = [...entityFilter(c, 'bt').params]

    if (account_id) { query += ' AND bt.bank_account_id = ?'; params.push(account_id) }
    if (date_start) { query += ' AND bt.transaction_date >= ?'; params.push(date_start.replace(/-/g, '')) }
    if (date_end) { query += ' AND bt.transaction_date <= ?'; params.push(date_end.replace(/-/g, '')) }
    if (matchStatuses.length > 1) {
      query += ` AND bt.match_status IN (${matchStatuses.map(() => '?').join(', ')})`
      params.push(...matchStatuses)
    } else if (singleStatus) {
      query += ' AND bt.match_status = ?'; params.push(singleStatus)
    }
    if (transaction_type) { query += ' AND bt.transaction_type = ?'; params.push(transaction_type) }
    query += ' ORDER BY bt.transaction_date DESC, bt.transaction_time DESC'
    query += ' LIMIT 5000'  // 확장성: CSV 무제한 스캔 방지(orders CSV 관례)

    const { results } = params.length > 0
      ? await c.env.DB.prepare(query).bind(...params).all()
      : await c.env.DB.prepare(query).all()

    // CSV 생성 (BOM + 한글 호환)
    const statusMap: Record<string, string> = {
      UNMATCHED: '미매칭', SUGGESTED: '제안', CONFIRMED: '확인됨', APPLIED: '반영', IGNORED: '무시'
    }
    const typeMap: Record<string, string> = { DEPOSIT: '입금', WITHDRAWAL: '출금' }

    let csv = '\uFEFF'  // UTF-8 BOM
    csv += '날짜,시간,계좌,유형,금액,잔액,입금자/적요,내용,상태,매칭거래처\n'

    for (const row of results as any[]) {
      const d = row.transaction_date || ''
      const dateStr = d.length === 8 ? `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}` : d
      const fields = [
        dateStr,
        row.transaction_time || '',
        `${row.bank_name || ''} ${row.account_number || ''}`.trim(),
        typeMap[row.transaction_type] || row.transaction_type,
        row.amount,
        row.balance_after ?? '',
        row.counterpart_name || '',
        row.description || '',
        statusMap[row.match_status] || row.match_status,
        row.matched_client_name || ''
      ]
      // #367: 공용 formula injection 가드 + CSV 이스케이프(필요시 따옴표 감쌈)
      csv += fields.map(escapeCsvField).join(',') + '\n'
    }

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="bank_transactions_${new Date().toISOString().slice(0,10)}.csv"`
      }
    })
  } catch (error) {
    console.error('CSV export error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ---------------------------------------------------------------------------
// 자동 동기화 (스케줄러/외부 호출용)
// ---------------------------------------------------------------------------

// POST /api/bank/auto-sync — 바로빌 자동 동기화
// 프론트엔드에서 1시간 간격으로 자동 호출 (페이지 열려있는 동안)
bankRouter.post('/auto-sync', requireRole('ADMIN'), async (c) => {
  try {

    // 오늘 날짜 기준 최근 3일 동기화
    const dateEnd = kstYmd()
    const dateStart = kstYmd(-3)

    // 모든 활성 계좌에 대해 바로빌 동기화 실행
    const efAutoAcc = entityFilter(c, 'bank_accounts')
    const { results: activeAccounts } = await c.env.DB.prepare(
      `SELECT id, bank_code, account_number FROM bank_accounts WHERE is_active = 1${efAutoAcc.clause}`
    ).bind(...efAutoAcc.params).all<{ id: number; bank_code: string; account_number: string }>()

    if (activeAccounts.length === 0) {
      return c.json({ success: true, message: '활성 계좌 없음', data: { synced: 0 } })
    }

    let totalInserted = 0
    let totalSkipped = 0
    let totalMatched = 0
    const errors: string[] = []
    const syncedIds = new Set<number>()  // 실제 바로빌 목록서 매칭된 계좌만 last_synced 갱신(정직화)

    // 바로빌 설정 로드
    const testModeRow = await c.env.DB.prepare(
      "SELECT setting_value FROM settings WHERE setting_key = 'barobill_test_mode'"
    ).first() as { setting_value: string } | null
    const isTest = testModeRow?.setting_value !== '0'
    const certKey = isTest ? (c.env as any).BAROBILL_CERT_KEY : (c.env as any).BAROBILL_CERT_KEY_PROD
    if (!certKey) {
      return c.json({ success: false, error: 'BAROBILL_CERT_KEY 미설정' }, 400)
    }

    // CorpNum은 법인별 (각 법인 자체 사업자번호 회원사). CERTKEY는 단일 파트너 키.
    const corpNum = await getEntityCorpNum(c.env.DB, getEntityId(c))
    if (!corpNum) {
      return c.json({ success: false, error: '사업자등록번호 미설정' }, 400)
    }

    // senderId는 법인별(entity_settings) — corpNum과 짝 맞춤 필수. 불일치 시 바로빌 -24005로 0건 수집.
    const senderId = await getEntityBarobillSenderId(c.env.DB, getEntityId(c))

    const config = { certKey, corpNum, isTest, senderId }

    try {
      const { getBankAccountList, getDailyBankLog } = await import('../services/barobillBank')
      const barobillAccounts = await getBankAccountList(config)

      // 날짜 범위 생성
      const dates: string[] = []
      const curDate = new Date(dateStart)
      const endDateObj = new Date(dateEnd)
      while (curDate <= endDateObj) {
        const y = curDate.getFullYear()
        const m = String(curDate.getMonth() + 1).padStart(2, '0')
        const d = String(curDate.getDate()).padStart(2, '0')
        dates.push(`${y}${m}${d}`)
        curDate.setDate(curDate.getDate() + 1)
      }

      for (const acc of barobillAccounts) {
        const accNum = acc.BankAccountNum || ''
        if (!accNum) continue

        const bankAcc = await c.env.DB.prepare(
          "SELECT id, entity_id FROM bank_accounts WHERE replace(account_number,'-','') = ? AND is_active = 1"
        ).bind(accNum.replace(/-/g, '')).first() as { id: number; entity_id: number } | null
        if (!bankAcc) continue
        syncedIds.add(bankAcc.id)

        for (const dateStr of dates) {
          try {
            const result = await getDailyBankLog(config, accNum, dateStr, 0, 1, 500)
            for (const item of result.items) {
              const refKey = item.TransRefKey || ''
              const deposit = parseFloat(item.Deposit || '0')
              const withdraw = parseFloat(item.Withdraw || '0')
              const amount = deposit || withdraw
              const txType = deposit > 0 ? 'DEPOSIT' : 'WITHDRAWAL'
              const txDate = (item.TransDT || '').slice(0, 8) || dateStr
              const txTime = (item.TransDT || '').length >= 12
                ? (item.TransDT || '').slice(8,10) + ':' + (item.TransDT || '').slice(10,12) + ':00'
                : null

              // #474: UNIQUE 인덱스에 위임 — 건별 dup-check SELECT 제거(N+1)
              // 0451: dedup 신원을 content_key(내용키)로 이전 → 외부 TransRefKey 재생성돼도 중복 미삽입.
              // #500 (수동 /sync-barobill 과 동일): 잔액 미제공은 NULL — 0 으로 저장하면 그 건이 계좌의 최신 거래일 때
              //   LATEST_BALANCE_SUBQUERY 가 0 을 잔액으로 읽어 자금현황·재무 스냅샷에서 그 계좌가 사라진다.
              const autoBalRaw = item.Balance
              const autoBalParsed = (autoBalRaw === undefined || autoBalRaw === null || autoBalRaw === '') ? null : parseFloat(autoBalRaw)
              const autoBalanceAfter = (autoBalParsed === null || Number.isNaN(autoBalParsed)) ? null : autoBalParsed
              const r = await c.env.DB.prepare(`
                INSERT OR IGNORE INTO bank_transactions (bank_account_id, transaction_date, transaction_time, transaction_type, amount, balance_after, counterpart_name, description, codef_transaction_id, match_status, entity_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'UNMATCHED', ?)
              `).bind(
                bankAcc.id, txDate, txTime, txType, amount,
                autoBalanceAfter,
                item.TransRemark1 || null, item.TransOffice || null,
                refKey || null, bankAcc.entity_id ?? getEntityId(c)
              ).run()
              if ((r.meta.changes ?? 0) > 0) totalInserted++; else totalSkipped++
            }
          } catch (dayErr: any) {
            // 관측성: 일별 조회 실패를 로깅+응답 수집 (과거 계좌 조용한 미수집 정지 방지 — 카드 syncErrors와 대칭)
            console.error(`[bank-auto-sync] ${accNum} ${dateStr} 조회 실패:`, dayErr?.message || dayErr)
            if (errors.length < 20) errors.push(`${accNum} ${dateStr}: ${dayErr?.message || '조회 실패'}`)
          }
        }
      }

      // 관측성: MES 등록됐으나 바로빌 수집목록에 없는 계좌 표기 (조용한 미수집 진단 — 우리·마이너스 등)
      const bbNums = new Set(barobillAccounts.map((a: any) => String(a.BankAccountNum || '').replace(/-/g, '')).filter(Boolean))
      const { results: regAccts } = await c.env.DB.prepare(
        `SELECT account_number, bank_name, account_alias FROM bank_accounts WHERE barobill_registered = 1 AND is_active = 1${efAutoAcc.clause}`
      ).bind(...efAutoAcc.params).all<{ account_number: string; bank_name: string; account_alias: string | null }>()
      for (const ra of regAccts) {
        const stripped = String(ra.account_number).replace(/-/g, '')
        if (!bbNums.has(stripped) && errors.length < 20) {
          errors.push(`${ra.account_alias || ra.bank_name || stripped} (${stripped.slice(0, 4)}****): 바로빌 수집목록에 없음 — 등록지연/인증 확인 필요`)
        }
      }
    } catch (importErr: any) {
      errors.push(`바로빌 서비스 오류: ${importErr.message}`)
    }

    // 자동매칭 실행 (신규 건) — 수동 [자동매칭]과 동일 공용 엔진(부분일치·고정비 제안·출금 포함)
    if (totalInserted > 0) {
      try {
        const r = await runAutoMatchEngine(c)
        totalMatched = r.matched
      } catch (matchErr: any) {
        // 자동매칭 실패는 치명적이 아니나 관측 위해 로깅
        console.error('[bank-auto-sync] 자동매칭 실패:', matchErr?.message || matchErr)
      }
    }

    // 계좌 last_synced_at 업데이트 — 실제 바로빌 수집목록서 매칭된 계좌만 (정직화; 미매칭은 "미동기화" 유지)
    if (syncedIds.size > 0) {
      const ids = [...syncedIds]
      await c.env.DB.prepare(
        `UPDATE bank_accounts SET last_synced_at = CURRENT_TIMESTAMP WHERE id IN (${ids.map(() => '?').join(',')})`
      ).bind(...ids).run()
    }

    return c.json({
      success: true,
      data: { inserted: totalInserted, skipped: totalSkipped, matched: totalMatched, errors },
      message: `자동동기화 완료: ${totalInserted}건 신규, ${totalMatched}건 자동매칭`
    })
  } catch (error) {
    console.error('Auto-sync error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ---------------------------------------------------------------------------
// 거래처별 미수금 대시보드
// ---------------------------------------------------------------------------
bankRouter.get('/receivables', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    // 사업자(법인)별 분리 (2026-08-18): clients 에는 entity_id 가 없지만 **잔액 원천**에는 전부 있다
    //   (order_billing_groups.entity_id · payments.entity_id · adjustments.entity_id).
    //   → 집계 단위 = 거래처 × 법인. 사이드바에서 법인을 고르면 그 법인 미수만, '전체' 모드면 전 법인 행 + 사업자 열.
    //   기존(법인 무시·거래처 단위 합산) 대비 prod 총액 8.87억 → 8.89억(+0.28%, 236행 → 264행).
    //   차이는 한 거래처가 A법인엔 미수(+)·B법인엔 선수(−)인 경우로, 법인 간 상계가 풀린 게 정확한 표시다.
    // 미수금 일원화(2026-07-17): aging 기준 = 채권 나이(oldest_unpaid_date). ledger/reports 와 동일 SSOT.
    const entityId = getEntityId(c)          // 0 = ADMIN 전체 모드
    const recent90From = kstYmd(-90)         // date('now') 금지 규약 — KST 기준일을 바인드
    const oup = buildOldestUnpaidJoin(c, { byEntity: 'ar.eid' })
    const { results: receivables } = await c.env.DB.prepare(`
      -- 미수금 = clients.balance 캐시(폐기·split billing P3) 대신 라이브 파생.
      -- deriveClientBalance와 동일 정의: order_billing_groups[BILLED] − payments − adjustments.
      -- 다른 점은 집계 키뿐 — 거래처(client_id) 단독이 아니라 (거래처, 청구법인) 이다.
      SELECT
        c.id, c.client_name, c.representative,
        ar.eid AS entity_id,
        ar.balance AS balance,
        oup.oldest_unpaid_date as oldest_unpaid_date,
        c.credit_risk_grade,
        c.payment_cycle_type, c.payment_terms_days, c.closing_day, c.payment_month_offset, c.payment_day,
        pm.last_payment_date as last_payment_date,
        COALESCE(pm.total_payments, 0) as total_payments,
        pm.recent_90d_payments as recent_90d_payments,
        eb.earliest_billed_at as earliest_billed_at
      FROM clients c
      JOIN (
        SELECT cid, eid, SUM(amt) AS balance FROM (
          SELECT o.client_id AS cid, COALESCE(g.entity_id, 1) AS eid, COALESCE(g.billed_amount, 0) AS amt
          FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
          WHERE g.billing_status = 'BILLED' AND o.status != 'CANCELLED'
          UNION ALL
          SELECT client_id, COALESCE(entity_id, 1), -amount FROM payments
          UNION ALL
          SELECT client_id, COALESCE(entity_id, 1), -amount FROM adjustments
        ) GROUP BY cid, eid
      ) ar ON ar.cid = c.id
      LEFT JOIN (
        SELECT o.client_id AS cid, COALESCE(g.entity_id, 1) AS eid,
               MIN(COALESCE(g.accounting_date, g.billed_at)) AS earliest_billed_at
        FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
        WHERE g.billing_status = 'BILLED' AND o.status != 'CANCELLED'
          AND COALESCE(g.accounting_date, g.billed_at) IS NOT NULL
        GROUP BY o.client_id, COALESCE(g.entity_id, 1)
      ) eb ON eb.cid = c.id AND eb.eid = ar.eid
      LEFT JOIN (
        SELECT client_id AS cid, COALESCE(entity_id, 1) AS eid,
               MAX(payment_date) AS last_payment_date,
               COUNT(*) AS total_payments,
               SUM(CASE WHEN payment_date >= ? THEN amount ELSE 0 END) AS recent_90d_payments
        FROM payments GROUP BY client_id, COALESCE(entity_id, 1)
      ) pm ON pm.cid = c.id AND pm.eid = ar.eid${oup.sql}
      WHERE c.is_active = 1${excludeArExcludedClientsSql('c.id')}
        AND ar.balance > 0${entityId ? ' AND ar.eid = ?' : ''}
      ORDER BY ar.eid ASC, ar.balance DESC, c.id ASC
    `).bind(recent90From, ...oup.params, ...(entityId ? [entityId] : [])).all<{
      id: number
      client_name: string
      representative: string | null
      entity_id: number
      balance: number
      credit_risk_grade: string | null
      payment_cycle_type: string | null
      payment_terms_days: number | null
      closing_day: number | null
      payment_month_offset: number | null
      payment_day: number | null
      last_payment_date: string | null
      total_payments: number
      recent_90d_payments: number | null
      earliest_billed_at: string | null
      oldest_unpaid_date: string | null
    }>()

    // 사업자명 — 전체 모드 '사업자' 열/소계 라벨. 3건뿐이라 전량 로드.
    const { results: entityRows } = await c.env.DB.prepare(
      'SELECT id, COALESCE(short_name, name) AS name FROM entities ORDER BY sort_order ASC, id ASC'
    ).all<{ id: number; name: string }>()
    const entityNameMap = new Map(entityRows.map(e => [e.id, e.name]))

    // provision matrix (회수율) 로드 — 4-3b
    const provision = await loadProvision(c.env.DB)

    // 에이징 분석 — 채권 나이(oldest_unpaid_date) 버킷 (30/60/90일 초과). ledger/reports 와 동일 SSOT.
    const summary = {
      total_receivable: 0,
      total_expected_collection: 0, // 위험조정 예상 회수액
      total_expected_loss: 0,       // 예상 손실(충당)
      client_count: receivables.length,
      aging_30: 0,   // 30일 이내 입금 있음 (정상)
      aging_60: 0,   // 31~60일
      aging_90: 0,   // 61~90일
      aging_over: 0, // 90일 초과 미입금
      no_payment: 0, // 입금 이력 없음
    }
    // 사업자별 소계 — 전체 모드 표의 법인별 소계 행
    const byEntityMap = new Map<number, {
      entity_id: number; entity_name: string; client_count: number
      total_receivable: number; total_expected_collection: number
    }>()

    const clients = receivables.map(r => {
      summary.total_receivable += r.balance

      // 채권 나이 = 최고령 미결제 청구건 경과일(oldest_unpaid_date). 미결제 청구건 특정 불가(null)만 no_payment(보수적 중간위험).
      let aging_category = 'normal'
      const agingDays = agingDaysFromOldest(r.oldest_unpaid_date)
      if (r.oldest_unpaid_date == null) {
        summary.no_payment++
        aging_category = 'no_payment'
      } else {
        aging_category = getAgingCategory(agingDays)
        if (aging_category === 'normal') summary.aging_30++
        else if (aging_category === 'warning') summary.aging_60++
        else if (aging_category === 'danger') summary.aging_90++
        else summary.aging_over++
      }

      const bucket = agingCategoryToBucket(aging_category)
      const loss_rate = effectiveLossRate(bucket, r.credit_risk_grade, provision)
      const expected_collection = Math.round(r.balance * (1 - loss_rate))
      const expected_loss = r.balance - expected_collection
      summary.total_expected_collection += expected_collection
      summary.total_expected_loss += expected_loss

      const entity_name = entityNameMap.get(r.entity_id) || `법인 ${r.entity_id}`
      const agg = byEntityMap.get(r.entity_id) || {
        entity_id: r.entity_id, entity_name, client_count: 0,
        total_receivable: 0, total_expected_collection: 0,
      }
      agg.client_count++
      agg.total_receivable += r.balance
      agg.total_expected_collection += expected_collection
      byEntityMap.set(r.entity_id, agg)

      // 예상 입금일: 최초 미입금 청구건(billed_at) + 거래처 결제주기. 청구건 없으면 null.
      const expected_payment_date = r.earliest_billed_at
        ? computeExpectedPaymentDate(r.earliest_billed_at, {
            payment_cycle_type: r.payment_cycle_type, payment_terms_days: r.payment_terms_days,
            closing_day: r.closing_day, payment_month_offset: r.payment_month_offset, payment_day: r.payment_day,
          })
        : null

      return { ...r, entity_name, aging_category, loss_rate, collection_rate: 1 - loss_rate, expected_collection, expected_loss, expected_payment_date }
    })

    // entity_mode: 'all' = 사업자 열·소계 표시, 'single' = 선택 법인만(열 숨김)
    const by_entity = [...byEntityMap.values()].sort((a, b) => a.entity_id - b.entity_id)
    return c.json({
      success: true,
      data: { summary, by_entity, entity_mode: entityId ? 'single' : 'all', entity_id: entityId, clients },
    })
  } catch (error) {
    console.error('Receivables error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ---------------------------------------------------------------------------
// 거래처 검색 (은행 매칭용 — 업체명 + 대표자명)
// ---------------------------------------------------------------------------
bankRouter.get('/client-search', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const q = (c.req.query('q') || '').trim()
    // 빈 검색어 = 모달 브라우즈 모드(전체 나열, 미수 많은 순). 검색어 있으면 필터.
    const like = `%${q}%`
    const searchClause = q ? 'AND (c.client_name LIKE ? OR c.representative LIKE ? OR c.search_keywords LIKE ?)' : ''
    const binds = q ? [like, like, like] : []
    const limit = q ? 20 : 40

    // #4 폐기 캐시 c.balance(prod 전체 0) → 라이브 파생잔액으로 교체.
    //    /receivables·deriveClientBalance 동일 정의: order_billing_groups[BILLED] − payments − adjustments.
    //    FE(bank.js) 추천 드롭다운 미수금 힌트(빨강)가 다시 유효해짐. clients엔 entity_id 없어 엔티티 무관(거래처 전체 합산).
    const { results } = await c.env.DB.prepare(`
      SELECT c.id, c.client_name, c.representative, c.business_registration_number,
        (COALESCE(b.amt, 0) - COALESCE(pp.amt, 0) - COALESCE(aa.amt, 0)) AS balance
      FROM clients c
      LEFT JOIN (
        SELECT o.client_id AS cid, SUM(g.billed_amount) AS amt
        FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
        WHERE g.billing_status = 'BILLED' AND o.status != 'CANCELLED'
        GROUP BY o.client_id
      ) b ON b.cid = c.id
      LEFT JOIN (
        SELECT client_id AS cid, SUM(amount) AS amt FROM payments GROUP BY client_id
      ) pp ON pp.cid = c.id
      LEFT JOIN (
        SELECT client_id AS cid, SUM(amount) AS amt FROM adjustments GROUP BY client_id
      ) aa ON aa.cid = c.id
      WHERE c.is_active = 1
        ${searchClause}
      ORDER BY balance DESC, c.client_name
      LIMIT ${limit}
    `).bind(...binds).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('bank GET /client-search error:', error)
    return c.json({ success: false, error: '검색 실패' }, 500)
  }
})

export default bankRouter
