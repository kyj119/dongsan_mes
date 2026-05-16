import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { getEntityId, entityFilter } from '../utils/entityFilter'

const gl = new Hono<HonoEnv>()
gl.use('*', authMiddleware)

// ─── 계정과목 목록 ──────────────────────────────────────────────────────────
gl.get('/accounts', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT a.*, p.name as parent_name
    FROM chart_of_accounts a
    LEFT JOIN chart_of_accounts p ON a.parent_id = p.id
    WHERE a.is_active = 1
    ORDER BY a.sort_order
  `).all()
  return c.json({ success: true, data: results })
})

// ─── 분개장 목록 ────────────────────────────────────────────────────────────
gl.get('/journal', async (c) => {
  const from = c.req.query('from')
  const to = c.req.query('to')
  const refType = c.req.query('reference_type')
  const eFilter = entityFilter(c)

  let where = `WHERE 1=1 ${eFilter.clause}`
  const binds: any[] = [...eFilter.params]
  if (from) { where += ' AND je.entry_date >= ?'; binds.push(from) }
  if (to) { where += ' AND je.entry_date <= ?'; binds.push(to) }
  if (refType) { where += ' AND je.reference_type = ?'; binds.push(refType) }

  const { results } = await c.env.DB.prepare(`
    SELECT je.*, u.name as created_by_name
    FROM journal_entries je
    LEFT JOIN users u ON je.created_by = u.id
    ${where}
    ORDER BY je.entry_date DESC, je.id DESC
    LIMIT 200
  `).bind(...binds).all()

  return c.json({ success: true, data: results })
})

// ─── 분개 상세 (라인 포함) ───────────────────────────────────────────────────
gl.get('/journal/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const entry = await c.env.DB.prepare(`SELECT * FROM journal_entries WHERE id = ?`).bind(id).first()
  const { results: lines } = await c.env.DB.prepare(`
    SELECT jl.*, ca.code as account_code, ca.name as account_name
    FROM journal_lines jl
    JOIN chart_of_accounts ca ON jl.account_id = ca.id
    WHERE jl.entry_id = ?
    ORDER BY jl.id
  `).bind(id).all()
  return c.json({ success: true, data: { ...entry, lines } })
})

// ─── 수동 분개 생성 ──────────────────────────────────────────────────────────
gl.post('/journal', requireRole('ADMIN'), async (c) => {
  const body = await c.req.json()
  const userId = c.get('user')?.id
  const { entry_date, description, lines } = body
  // lines: [{ account_id, debit, credit, description }]

  if (!entry_date || !lines?.length) {
    return c.json({ success: false, error: 'entry_date, lines 필수' }, 400)
  }

  // 차대변 합계 검증
  const totalDebit = lines.reduce((s: number, l: any) => s + (l.debit || 0), 0)
  const totalCredit = lines.reduce((s: number, l: any) => s + (l.credit || 0), 0)
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    return c.json({ success: false, error: `차변합(${totalDebit}) ≠ 대변합(${totalCredit})` }, 400)
  }

  // 번호 생성
  const dateStr = entry_date.replace(/-/g, '')
  const { results: existing } = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM journal_entries WHERE entry_number LIKE ?`
  ).bind(`JE-${dateStr}-%`).all<{ cnt: number }>()
  const seq = (existing[0]?.cnt || 0) + 1
  const entryNumber = `JE-${dateStr}-${String(seq).padStart(3, '0')}`

  const result = await c.env.DB.prepare(`
    INSERT INTO journal_entries (entry_number, entry_date, description, reference_type, is_auto, entity_id, created_by)
    VALUES (?, ?, ?, 'MANUAL', 0, ?, ?)
  `).bind(entryNumber, entry_date, description || null, getEntityId(c), userId).run()

  const entryId = result.meta.last_row_id as number

  const lineStmts = lines.map((l: any) =>
    c.env.DB.prepare(`
      INSERT INTO journal_lines (entry_id, account_id, debit, credit, description)
      VALUES (?, ?, ?, ?, ?)
    `).bind(entryId, l.account_id, l.debit || 0, l.credit || 0, l.description || null)
  )
  await c.env.DB.batch(lineStmts)

  return c.json({ success: true, data: { id: entryId, entry_number: entryNumber } })
})

// ─── 자동 분개: 입금 등록 시 (payments 연동) ─────────────────────────────────
gl.post('/auto-journal/payment', requireRole('ADMIN', 'MANAGER'), async (c) => {
  const { payment_id } = await c.req.json()
  if (!payment_id) return c.json({ success: false, error: 'payment_id 필수' }, 400)

  const payment = await c.env.DB.prepare(
    `SELECT * FROM payments WHERE id = ?`
  ).bind(payment_id).first<any>()
  if (!payment) return c.json({ success: false, error: '결제 내역 없음' }, 404)

  // 결제 방법에 따른 차변 계정 결정
  let debitAccountCode: string
  switch (payment.payment_method) {
    case '현금': debitAccountCode = '1120'; break  // 현금
    case '카드': debitAccountCode = '1110'; break  // 보통예금 (카드 매출은 예금 입금)
    default: debitAccountCode = '1110'; break       // 계좌이체 = 보통예금
  }

  const debitAccount = await c.env.DB.prepare(
    `SELECT id FROM chart_of_accounts WHERE code = ?`
  ).bind(debitAccountCode).first<{ id: number }>()
  const creditAccount = await c.env.DB.prepare(
    `SELECT id FROM chart_of_accounts WHERE code = '1130'`  // 매출채권
  ).first<{ id: number }>()

  if (!debitAccount || !creditAccount) {
    return c.json({ success: false, error: '계정과목 미설정' }, 500)
  }

  const dateStr = (payment.payment_date || new Date().toISOString().split('T')[0]).replace(/-/g, '')
  const { results: existing } = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM journal_entries WHERE entry_number LIKE ?`
  ).bind(`JE-${dateStr}-%`).all<{ cnt: number }>()
  const seq = (existing[0]?.cnt || 0) + 1
  const entryNumber = `JE-${dateStr}-${String(seq).padStart(3, '0')}`

  const result = await c.env.DB.prepare(`
    INSERT INTO journal_entries (entry_number, entry_date, description, reference_type, reference_id, is_auto, entity_id, created_by)
    VALUES (?, ?, ?, 'PAYMENT', ?, 1, ?, ?)
  `).bind(
    entryNumber, payment.payment_date, `입금 — ${payment.payment_method || '계좌이체'} ₩${payment.amount}`,
    payment_id, getEntityId(c), c.get('user')?.id
  ).run()

  const entryId = result.meta.last_row_id as number
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO journal_lines (entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, 0, ?)`)
      .bind(entryId, debitAccount.id, payment.amount, `${payment.payment_method || '계좌이체'} 입금`),
    c.env.DB.prepare(`INSERT INTO journal_lines (entry_id, account_id, debit, credit, description) VALUES (?, ?, 0, ?, ?)`)
      .bind(entryId, creditAccount.id, payment.amount, '매출채권 회수')
  ])

  return c.json({ success: true, data: { entry_id: entryId, entry_number: entryNumber } })
})

// ���── 시산표 (Trial Balance) ──────────────────────────────────────────────────
gl.get('/trial-balance', async (c) => {
  const asOf = c.req.query('as_of') || new Date().toISOString().split('T')[0]
  const eFilter = entityFilter(c)

  const { results } = await c.env.DB.prepare(`
    SELECT ca.id, ca.code, ca.name, ca.account_type,
      COALESCE(SUM(jl.debit), 0) as total_debit,
      COALESCE(SUM(jl.credit), 0) as total_credit,
      COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0) as balance
    FROM chart_of_accounts ca
    LEFT JOIN journal_lines jl ON jl.account_id = ca.id
    LEFT JOIN journal_entries je ON jl.entry_id = je.id AND je.entry_date <= ? ${eFilter.clause.replace(/\bb\./g, 'je.')}
    WHERE ca.is_active = 1
    GROUP BY ca.id
    HAVING total_debit > 0 OR total_credit > 0
    ORDER BY ca.sort_order
  `).bind(asOf, ...eFilter.params).all()

  const totalDebit = results.reduce((s: number, r: any) => s + r.total_debit, 0)
  const totalCredit = results.reduce((s: number, r: any) => s + r.total_credit, 0)

  return c.json({ success: true, data: { accounts: results, total_debit: totalDebit, total_credit: totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.01 } })
})

export default gl
