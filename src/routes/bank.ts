// ============================================================================
// 은행 거래내역 연동 API
// 모든 엔드포인트: authMiddleware + requireRole('ADMIN')
// ============================================================================

import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { createPayment, validatePayment, preparePaymentStatements } from '../lib/payments'
import { entityFilter, getEntityId } from '../utils/entityFilter'

const bankRouter = new Hono<HonoEnv>()

bankRouter.use('/*', authMiddleware)

// ---------------------------------------------------------------------------
// 계좌 관리
// ---------------------------------------------------------------------------

// GET /api/bank/accounts — 연결 계좌 목록
bankRouter.get('/accounts', requireRole('ADMIN'), async (c) => {
  try {
    const ef = entityFilter(c, 'bank_accounts')
    const { results } = await c.env.DB.prepare(
      `SELECT id, bank_code, bank_name, account_number, account_holder, connected_id, is_active, last_synced_at, last_synced_date, entity_id, created_at FROM bank_accounts WHERE is_active = 1${ef.clause} ORDER BY created_at DESC`
    ).bind(...ef.params).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('Bank error:', error)
    return c.json({ success: false, error: '서버 서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /api/bank/accounts — 계좌 등록
bankRouter.post('/accounts', requireRole('ADMIN'), async (c) => {
  try {
    const body = await c.req.json()
    const { bank_code, bank_name, account_number, account_holder } = body

    if (!bank_code || !bank_name || !account_number) {
      return c.json({
        success: false,
        error: 'bank_code, bank_name, account_number 필수'
      }, 400)
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO bank_accounts (bank_code, bank_name, account_number, account_holder, entity_id)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      bank_code,
      bank_name,
      account_number,
      account_holder ?? null,
      getEntityId(c)
    ).run()

    return c.json({
      success: true,
      data: { id: result.meta.last_row_id },
      message: '계좌가 등록되었습니다'
    })
  } catch (error) {
    console.error('Create bank account error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// PUT /api/bank/accounts/:id — 계좌 수정
bankRouter.put('/accounts/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const { bank_code, bank_name, account_number, account_holder } = body

    const account = await c.env.DB.prepare(
      'SELECT id FROM bank_accounts WHERE id = ? AND is_active = 1'
    ).bind(id).first()

    if (!account) {
      return c.json({ success: false, error: '계좌를 찾을 수 없습니다' }, 404)
    }

    await c.env.DB.prepare(`
      UPDATE bank_accounts
      SET bank_code = COALESCE(?, bank_code),
          bank_name = COALESCE(?, bank_name),
          account_number = COALESCE(?, account_number),
          account_holder = COALESCE(?, account_holder)
      WHERE id = ?
    `).bind(
      bank_code ?? null,
      bank_name ?? null,
      account_number ?? null,
      account_holder ?? null,
      id
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

// DELETE /api/bank/accounts/:id — 비활성화 (soft delete)
bankRouter.delete('/accounts/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')

    const account = await c.env.DB.prepare(
      'SELECT id FROM bank_accounts WHERE id = ? AND is_active = 1'
    ).bind(id).first()

    if (!account) {
      return c.json({ success: false, error: '계좌를 찾을 수 없습니다' }, 404)
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

    let query = `
      SELECT
        bt.*,
        ba.bank_name, ba.account_number, ba.account_holder,
        c.client_name as matched_client_name, c.representative as matched_client_representative,
        ec.name as matched_category_name, ec.icon as matched_category_icon, ec.color as matched_category_color
      FROM bank_transactions bt
      LEFT JOIN bank_accounts ba ON bt.bank_account_id = ba.id
      LEFT JOIN clients c ON bt.matched_client_id = c.id
      LEFT JOIN expense_categories ec ON bt.matched_category_id = ec.id
      WHERE 1=1${entityFilter(c, 'bt').clause}
    `
    const params: (string | number)[] = [...entityFilter(c, 'bt').params]

    if (account_id) {
      query += ' AND bt.bank_account_id = ?'
      params.push(account_id)
    }
    if (date_start) {
      query += ' AND bt.transaction_date >= ?'
      params.push(date_start.replace(/-/g, ''))
    }
    if (date_end) {
      query += ' AND bt.transaction_date <= ?'
      params.push(date_end.replace(/-/g, ''))
    }
    if (matchStatuses.length > 1) {
      const ph = matchStatuses.map(() => '?').join(', ')
      query += ` AND bt.match_status IN (${ph})`
      params.push(...matchStatuses)
    } else if (singleStatus) {
      query += ' AND bt.match_status = ?'
      params.push(singleStatus)
    }
    if (transaction_type) {
      query += ' AND bt.transaction_type = ?'
      params.push(transaction_type)
    }

    query += ' ORDER BY bt.transaction_date DESC, bt.transaction_time DESC'

    const { results } = params.length > 0
      ? await c.env.DB.prepare(query).bind(...params).all()
      : await c.env.DB.prepare(query).all()

    return c.json({ success: true, data: results })
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

    // 계좌 존재 확인
    const account = await c.env.DB.prepare(
      'SELECT id FROM bank_accounts WHERE id = ? AND is_active = 1'
    ).bind(account_id).first()
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

    let inserted = 0, skipped = 0
    const stmts: D1PreparedStatement[] = []

    for (const row of rows) {
      const txDate = row.transaction_date.replace(/-/g, '')
      const txTime = row.transaction_time || null
      const amount = Math.abs(row.amount)
      const counterpart = (row.counterpart_name || '').trim()
      const key = `${txDate}|${amount}|${counterpart}|${txTime || ''}`

      if (existingSet.has(key)) { skipped++; continue }
      existingSet.add(key) // 같은 배치 내 중복도 방지

      stmts.push(c.env.DB.prepare(`
        INSERT INTO bank_transactions (bank_account_id, transaction_date, transaction_time, transaction_type, amount, balance_after, counterpart_name, description, match_status, entity_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'UNMATCHED', ?)
      `).bind(
        account_id, txDate, txTime,
        row.transaction_type, amount,
        row.balance_after ?? null,
        counterpart || null,
        row.description || null,
        entityId
      ))
      inserted++
    }

    // 100개 단위 batch 실행
    for (let i = 0; i < stmts.length; i += 100) {
      await c.env.DB.batch(stmts.slice(i, i + 100))
    }

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
    const now = new Date()
    const today = now.toISOString().slice(0, 10).replace(/-/g, '')
    const dateStart = body.date_start?.replace(/-/g, '') || today
    const dateEnd = body.date_end?.replace(/-/g, '') || today

    // 바로빌 설정 로드
    const testModeRow = await c.env.DB.prepare(
      "SELECT setting_value FROM settings WHERE setting_key = 'barobill_test_mode'"
    ).first() as { setting_value: string } | null
    const isTest = testModeRow?.setting_value !== '0'
    const certKey = isTest ? c.env.BAROBILL_CERT_KEY : c.env.BAROBILL_CERT_KEY_PROD
    if (!certKey) return c.json({ success: false, error: 'BAROBILL_CERT_KEY 미설정' }, 400)

    const corpNumRow = await c.env.DB.prepare(
      "SELECT setting_value FROM settings WHERE setting_key = 'company_business_registration_number'"
    ).first() as { setting_value: string } | null
    const corpNum = (corpNumRow?.setting_value || '').replace(/-/g, '')
    if (!corpNum) return c.json({ success: false, error: '사업자등록번호 미설정' }, 400)

    const senderIdRow = await c.env.DB.prepare(
      "SELECT setting_value FROM settings WHERE setting_key = 'barobill_sender_id'"
    ).first() as { setting_value: string } | null
    const senderId = senderIdRow?.setting_value || 'DONGSAN'

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
        'SELECT id FROM bank_accounts WHERE account_number = ? AND is_active = 1'
      ).bind(accNum).first()
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

    // 계좌 × 날짜 조회 → bank_transactions 적재
    for (const acc of accounts) {
      const accNum = acc.BankAccountNum || ''
      if (!accNum) continue

      // bank_accounts.id 조회
      const bankAcc = await c.env.DB.prepare(
        'SELECT id FROM bank_accounts WHERE account_number = ? AND is_active = 1'
      ).bind(accNum).first() as { id: number } | null
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

            // 중복 체크: TransRefKey 기준
            if (refKey) {
              const dup = await c.env.DB.prepare(
                "SELECT id FROM bank_transactions WHERE bank_account_id = ? AND codef_transaction_id = ?"
              ).bind(bankAcc.id, refKey).first()
              if (dup) { totalSkipped++; continue }
            }

            await c.env.DB.prepare(`
              INSERT INTO bank_transactions (bank_account_id, transaction_date, transaction_time, transaction_type, amount, balance_after, counterpart_name, description, match_status, codef_transaction_id, entity_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'UNMATCHED', ?, ?)
            `).bind(
              bankAcc.id, txDate, txTime, txType, amount,
              parseFloat(item.Balance || '0') || null,
              item.TransRemark1 || null,
              item.TransRemark2 || null,
              refKey || null,
              entityId
            ).run()
            totalInserted++
          }
        } catch (err) {
          console.error(`Bank sync error ${accNum} ${dateStr}:`, err)
        }
      }
    }

    // 자동매칭 실행 (기존 auto-match 로직 재활용)
    let matchedCount = 0
    if (totalInserted > 0) {
      // 미매칭 입금 건 자동매칭
      const efSyncTx = entityFilter(c, 'bank_transactions')
      const { results: unmatchedTxs } = await c.env.DB.prepare(
        `SELECT id, amount, counterpart_name, description FROM bank_transactions WHERE match_status = 'UNMATCHED' AND transaction_type = 'DEPOSIT'${efSyncTx.clause}`
      ).bind(...efSyncTx.params).all<{ id: number; amount: number; counterpart_name: string | null; description: string | null }>()

      const { results: clients } = await c.env.DB.prepare(
        "SELECT id, client_name, search_keywords, balance FROM clients WHERE is_active = 1 ORDER BY balance DESC"
      ).all<{ id: number; client_name: string; search_keywords: string | null; balance: number | null }>()

      const efSyncRl = entityFilter(c, 'bank_match_rules')
      const { results: syncMatchRules } = await c.env.DB.prepare(
        `SELECT counterpart_name, matched_client_id, matched_category_id FROM bank_match_rules WHERE 1=1${efSyncRl.clause}`
      ).bind(...efSyncRl.params).all<{ counterpart_name: string; matched_client_id: number | null; matched_category_id: number | null }>()
      const syncRuleMap = new Map(syncMatchRules.map(r => [r.counterpart_name, { clientId: r.matched_client_id, categoryId: r.matched_category_id }]))

      for (const tx of unmatchedTxs) {
        const txName = (tx.counterpart_name ?? '').trim()
        if (!txName) continue

        let bestClientId: number | null = null
        let bestConfidence = 0
        let bestReason = ''

        const syncRule = syncRuleMap.get(txName)
        if (syncRule) {
          if (syncRule.categoryId) {
            // 비용 카테고리 규칙 → 바로 APPLIED
            await c.env.DB.prepare(
              "UPDATE bank_transactions SET match_status = 'APPLIED', matched_category_id = ?, match_confidence = 0.95, match_reason = '학습된 규칙 (비용분류)' WHERE id = ?"
            ).bind(syncRule.categoryId, tx.id).run()
            matchedCount++
            continue
          }
          bestClientId = syncRule.clientId
          bestConfidence = 0.95
          bestReason = '학습된 규칙'
        } else {
          for (const client of clients) {
            const clientName = client.client_name.trim()
            const keywords = (client.search_keywords ?? '').split(/[,\s]+/).map(k => k.trim()).filter(Boolean)
            let confidence = 0, reason = ''
            if (txName === clientName) { confidence = 0.9; reason = '입금자명 완전일치' }
            else if (keywords.some(k => k && txName.includes(k))) { confidence = 0.7; reason = '검색키워드 일치' }
            else if (clientName.includes(txName) || txName.includes(clientName)) { confidence = 0.6; reason = '부분일치' }
            if (confidence > bestConfidence) { bestConfidence = confidence; bestClientId = client.id; bestReason = reason }
          }
        }

        if (bestConfidence >= 0.5 && bestClientId !== null) {
          await c.env.DB.prepare(
            "UPDATE bank_transactions SET match_status = 'SUGGESTED', matched_client_id = ?, match_confidence = ?, match_reason = ? WHERE id = ?"
          ).bind(bestClientId, bestConfidence, bestReason, tx.id).run()
          matchedCount++
        }
      }
    }

    return c.json({
      success: true,
      data: {
        accounts: accounts.length,
        dates: dates.length,
        inserted: totalInserted,
        skipped: totalSkipped,
        matched: matchedCount,
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
      ORDER BY sort_order
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
      ORDER BY r.match_count DESC
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
    const { counterpart_name, matched_client_id, matched_category_id } = body
    const user = c.get('user')

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

    // INSERT OR REPLACE + match_count 증가 (entity_id별 UNIQUE)
    const res = await c.env.DB.prepare(`
      INSERT INTO bank_match_rules (counterpart_name, matched_client_id, matched_category_id, created_by, match_count, entity_id)
      VALUES (?, ?, ?, ?, 1, ?)
      ON CONFLICT(entity_id, counterpart_name) DO UPDATE SET
        matched_client_id = excluded.matched_client_id,
        matched_category_id = excluded.matched_category_id,
        match_count = match_count + 1,
        last_used_at = CURRENT_TIMESTAMP
    `).bind(counterpart_name, matched_client_id || null, matched_category_id || null, user?.id ?? 1, getEntityId(c) || 1).run()

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
    const { matched_client_id, matched_category_id } = body

    if (!matched_client_id && !matched_category_id) {
      return c.json({ success: false, error: 'matched_client_id 또는 matched_category_id 필수' }, 400)
    }

    const rule = await c.env.DB.prepare(
      'SELECT id FROM bank_match_rules WHERE id = ?'
    ).bind(id).first()

    if (!rule) {
      return c.json({ success: false, error: '규칙을 찾을 수 없습니다' }, 404)
    }

    await c.env.DB.prepare(
      'UPDATE bank_match_rules SET matched_client_id = ?, matched_category_id = ?, last_used_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(matched_client_id || null, matched_category_id || null, id).run()

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

    const rule = await c.env.DB.prepare(
      'SELECT id FROM bank_match_rules WHERE id = ?'
    ).bind(id).first()

    if (!rule) {
      return c.json({ success: false, error: '규칙을 찾을 수 없습니다' }, 404)
    }

    await c.env.DB.prepare(
      'DELETE FROM bank_match_rules WHERE id = ?'
    ).bind(id).run()

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

// POST /api/bank/transactions/auto-match — 미매칭 거래 자동매칭 (입금+출금, 규칙 학습 포함)
bankRouter.post('/transactions/auto-match', requireRole('ADMIN'), async (c) => {
  try {
    const ef = entityFilter(c, 'bank_transactions')
    // 1. 모든 UNMATCHED 거래내역 가져오기 (입금+출금 모두)
    const { results: unmatchedTxs } = await c.env.DB.prepare(`
      SELECT id, amount, counterpart_name, description, transaction_type
      FROM bank_transactions
      WHERE match_status = 'UNMATCHED'${ef.clause}
    `).bind(...ef.params).all<{
      id: number
      amount: number
      counterpart_name: string | null
      description: string | null
      transaction_type: string
    }>()

    if (unmatchedTxs.length === 0) {
      return c.json({ success: true, data: { matched: 0 }, message: '매칭할 거래가 없습니다' })
    }

    // 2. 모든 활성 거래처 가져오기 (잔액 > 0 우선)
    const { results: clients } = await c.env.DB.prepare(`
      SELECT id, client_name, search_keywords, balance
      FROM clients
      WHERE is_active = 1
      ORDER BY balance DESC
    `).all<{
      id: number
      client_name: string
      search_keywords: string | null
      balance: number | null
    }>()

    // 3. bank_match_rules 캐시 로드 (거래처 + 비용카테고리 규칙)
    const efRules = entityFilter(c, 'bank_match_rules')
    const { results: matchRules } = await c.env.DB.prepare(`
      SELECT counterpart_name, matched_client_id, matched_category_id FROM bank_match_rules WHERE 1=1${efRules.clause}
    `).bind(...efRules.params).all<{
      counterpart_name: string
      matched_client_id: number | null
      matched_category_id: number | null
    }>()

    const ruleMap = new Map(matchRules.map(r => [r.counterpart_name, { clientId: r.matched_client_id, categoryId: r.matched_category_id }]))

    let matchedCount = 0

    for (const tx of unmatchedTxs) {
      const txName = (tx.counterpart_name ?? '').trim()
      if (!txName) continue

      let bestClientId: number | null = null
      let bestConfidence = 0
      let bestReason = ''

      // Step 1: 먼저 bank_match_rules에서 정확히 일치하는 규칙 찾기
      const rule = ruleMap.get(txName)
      if (rule) {
        // match_count 증가
        await c.env.DB.prepare(`
          UPDATE bank_match_rules
          SET match_count = match_count + 1, last_used_at = CURRENT_TIMESTAMP
          WHERE counterpart_name = ?
        `).bind(txName).run()

        if (rule.categoryId) {
          // 비용 카테고리 규칙 → 바로 APPLIED
          await c.env.DB.prepare(`
            UPDATE bank_transactions
            SET match_status = 'APPLIED',
                matched_category_id = ?,
                matched_client_id = NULL,
                match_confidence = 0.95,
                match_reason = '학습된 규칙 (비용분류)'
            WHERE id = ?
          `).bind(rule.categoryId, tx.id).run()
          matchedCount++
          continue
        }

        bestClientId = rule.clientId
        bestConfidence = 0.95
        bestReason = '학습된 규칙'
      } else {
        // Step 2: 규칙이 없으면 기존 로직으로 매칭 시도
        for (const client of clients) {
          const clientName = client.client_name.trim()
          const keywords   = (client.search_keywords ?? '')
            .split(/[,\s]+/)
            .map(k => k.trim())
            .filter(Boolean)

          let confidence = 0
          let reason     = ''

          // 규칙 1: 입금자명 == 거래처명 → 0.9
          if (txName === clientName) {
            confidence = 0.9
            reason     = '입금자명 완전일치'
          }
          // 규칙 2: 입금자명이 search_keywords에 포함 → 0.7
          else if (keywords.some(k => k && txName.includes(k))) {
            confidence = 0.7
            reason     = '검색키워드 일치'
          }
          // 규칙 3: 금액 == 미수금 (잔액 일치)
          if ((client.balance ?? 0) > 0 && tx.amount === client.balance) {
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
        }
      }

      // 신뢰도 기반 상태 분리: >= 0.8 → CONFIRMED, 0.5~0.8 → SUGGESTED
      if (bestConfidence >= 0.5 && bestClientId !== null) {
        const autoStatus = bestConfidence >= 0.8 ? 'CONFIRMED' : 'SUGGESTED'
        await c.env.DB.prepare(`
          UPDATE bank_transactions
          SET match_status = ?,
              matched_client_id = ?,
              match_confidence = ?,
              match_reason = ?
          WHERE id = ?
        `).bind(autoStatus, bestClientId, bestConfidence, bestReason, tx.id).run()
        matchedCount++
      }
    }

    return c.json({
      success: true,
      data: { matched: matchedCount, total: unmatchedTxs.length },
      message: `${unmatchedTxs.length}건 중 ${matchedCount}건 매칭 제안`
    })
  } catch (error) {
    console.error('Auto-match error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
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
    const { client_id, category_id } = body

    if (!client_id && !category_id) {
      return c.json({ success: false, error: 'client_id 또는 category_id 필수' }, 400)
    }

    const ef = entityFilter(c, 'bank_transactions')
    const tx = await c.env.DB.prepare(
      `SELECT id, match_status, counterpart_name FROM bank_transactions WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ id: number; match_status: string; counterpart_name: string | null }>()

    if (!tx) {
      return c.json({ success: false, error: '거래내역을 찾을 수 없습니다' }, 404)
    }
    if (tx.match_status === 'APPLIED') {
      return c.json({ success: false, error: '이미 적용된 거래는 변경할 수 없습니다' }, 400)
    }

    const user = c.get('user')

    if (category_id) {
      // 비용 카테고리 매칭
      await c.env.DB.prepare(`
        UPDATE bank_transactions
        SET match_status = 'APPLIED',
            matched_category_id = ?,
            matched_client_id = NULL,
            matched_by = ?,
            matched_at = CURRENT_TIMESTAMP,
            match_confidence = 1.0,
            match_reason = '비용분류'
        WHERE id = ?
      `).bind(category_id, user?.id ?? 1, id).run()

      // 규칙 학습
      if (tx.counterpart_name && tx.counterpart_name.trim()) {
        await c.env.DB.prepare(`
          INSERT INTO bank_match_rules (counterpart_name, matched_client_id, matched_category_id, created_by, match_count, entity_id)
          VALUES (?, NULL, ?, ?, 1, ?)
          ON CONFLICT(entity_id, counterpart_name) DO UPDATE SET
            matched_client_id = NULL,
            matched_category_id = excluded.matched_category_id,
            match_count = match_count + 1,
            last_used_at = CURRENT_TIMESTAMP
        `).bind(tx.counterpart_name.trim(), category_id, user?.id ?? 1, getEntityId(c) || 1).run()
      }

      return c.json({ success: true, message: '비용 분류가 적용되었습니다' })
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

// POST /api/bank/transactions/:id/apply — 입금 생성 (CONFIRMED/SUGGESTED → APPLIED)
bankRouter.post('/transactions/:id/apply', requireRole('ADMIN'), async (c) => {
  try {
    const id   = c.req.param('id')
    const user = c.get('user')
    const body = await c.req.json().catch(() => ({})) as any

    const ef = entityFilter(c, 'bank_transactions')
    const tx = await c.env.DB.prepare(
      `SELECT id, bank_account_id, transaction_date, transaction_time, transaction_type, amount, balance_after, counterpart_name, description, match_status, matched_client_id, matched_payment_id, entity_id FROM bank_transactions WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{
      id: number
      transaction_date: string
      amount: number
      match_status: string
      matched_client_id: number | null
      counterpart_name: string | null
      description: string | null
    }>()

    if (!tx) {
      return c.json({ success: false, error: '거래내역을 찾을 수 없습니다' }, 404)
    }
    if (tx.match_status === 'APPLIED') {
      return c.json({ success: false, error: '이미 적용된 거래입니다' }, 400)
    }

    // body에서 client_id가 오면 우선 사용, 없으면 기존 matched_client_id
    const clientId = body.client_id || tx.matched_client_id
    if (!clientId) {
      return c.json({ success: false, error: '매칭된 거래처가 없습니다. 먼저 매칭을 확인하세요' }, 400)
    }
    if (!['CONFIRMED', 'SUGGESTED', 'UNMATCHED'].includes(tx.match_status)) {
      return c.json({
        success: false,
        error: 'APPLIED 또는 IGNORED 상태의 거래는 적용할 수 없습니다'
      }, 400)
    }

    // client_id가 body에서 왔으면 matched_client_id도 업데이트
    if (body.client_id && body.client_id !== tx.matched_client_id) {
      await c.env.DB.prepare(
        'UPDATE bank_transactions SET matched_client_id = ? WHERE id = ?'
      ).bind(body.client_id, id).run()
    }

    // 날짜 포맷: YYYYMMDD → YYYY-MM-DD
    const rawDate = tx.transaction_date
    const payDate = rawDate.length === 8
      ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
      : rawDate

    const defaultNotes = '[은행연동] ' + [tx.counterpart_name, tx.description].filter(Boolean).join(' ')

    // #216: 읽기(검증) + 쓰기(batch) 분리로 원자성 보장
    const paymentData = {
      client_id: clientId,
      payment_date: payDate,
      amount: parseFloat(String(tx.amount)),
      payment_method: body.payment_method || '계좌이체',
      reference_number: String(tx.id),
      notes: body.notes || defaultNotes,
      created_by: user?.id ?? 1,
    }

    let validated: { newBalance: number }
    try {
      validated = await validatePayment(c.env.DB, paymentData)
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Client not found')) {
        return c.json({ success: false, error: '매칭된 거래처를 찾을 수 없습니다' }, 404)
      }
      throw err
    }

    // 입금 INSERT + 잔액 차감 + 거래내역 APPLIED를 단일 batch로 원자적 처리
    const payStmts = preparePaymentStatements(c.env.DB, paymentData, validated.newBalance)
    payStmts.push(
      c.env.DB.prepare(`
        UPDATE bank_transactions
        SET match_status = 'APPLIED',
            matched_by = ?,
            matched_at = CURRENT_TIMESTAMP
        WHERE id = ? AND match_status != 'APPLIED'
      `).bind(user?.id ?? 1, id)
    )
    const batchResults = await c.env.DB.batch(payStmts)

    // 첫 번째 결과에서 payment_id 추출
    const paymentId = batchResults[0].meta.last_row_id

    // matched_payment_id는 payment_id를 알아야 하므로 후속 업데이트
    await c.env.DB.prepare(
      'UPDATE bank_transactions SET matched_payment_id = ? WHERE id = ?'
    ).bind(paymentId, id).run()

    return c.json({
      success: true,
      data: {
        payment_id: paymentId,
        new_balance: validated.newBalance,
      },
      message: '입금이 생성되었습니다'
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
    const { transaction_ids, client_map } = body as {
      transaction_ids: number[]
      client_map?: Record<string, number>  // txId -> clientId (UI에서 선택한 거래처)
    }
    const user = c.get('user')

    if (!Array.isArray(transaction_ids) || transaction_ids.length === 0) {
      return c.json({ success: false, error: 'transaction_ids 배열 필수' }, 400)
    }

    const results: { id: number; success: boolean; error?: string; payment_id?: number }[] = []

    // Bulk-fetch all transactions in one query instead of N individual SELECTs
    const placeholders = transaction_ids.map(() => '?').join(', ')
    const ef = entityFilter(c, 'bank_transactions')
    const { results: txRows } = await c.env.DB.prepare(
      `SELECT id, transaction_date, amount, match_status, matched_client_id, counterpart_name, description FROM bank_transactions WHERE id IN (${placeholders})${ef.clause}`
    ).bind(...transaction_ids, ...ef.params).all<{
      id: number
      transaction_date: string
      amount: number
      match_status: string
      matched_client_id: number | null
      counterpart_name: string | null
      description: string | null
    }>()
    const txMap = new Map(txRows.map(row => [row.id, row]))

    for (const txId of transaction_ids) {
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

      if (!effectiveClientId) {
        results.push({ id: txId, success: false, error: '매칭된 거래처 없음' })
        continue
      }
      if (!['CONFIRMED', 'SUGGESTED', 'UNMATCHED'].includes(tx.match_status)) {
        results.push({ id: txId, success: false, error: `적용 불가 상태: ${tx.match_status}` })
        continue
      }

      const rawDate = tx.transaction_date
      const payDate = rawDate.length === 8
        ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
        : rawDate

      // UNMATCHED에서 client_map으로 온 경우 matched_client_id도 업데이트
      if (uiClientId && tx.matched_client_id !== uiClientId) {
        await c.env.DB.prepare(
          'UPDATE bank_transactions SET matched_client_id = ? WHERE id = ?'
        ).bind(uiClientId, txId).run()
      }

      try {
        const payResult = await createPayment(c.env.DB, {
          client_id: effectiveClientId,
          payment_date: payDate,
          amount: parseFloat(String(tx.amount)),
          payment_method: '계좌이체',
          reference_number: String(tx.id),
          notes: [tx.counterpart_name, tx.description].filter(Boolean).join(' ') || undefined,
          created_by: user?.id ?? 1,
        })

        await c.env.DB.prepare(`
          UPDATE bank_transactions
          SET match_status = 'APPLIED',
              matched_payment_id = ?,
              matched_by = ?,
              matched_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(payResult.payment_id, user?.id ?? 1, txId).run()

        results.push({ id: txId, success: true, payment_id: payResult.payment_id })
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
      },
      message: `${results.length}건 중 ${succeededCount}건 적용 완료`
    })
  } catch (error) {
    console.error('Batch apply error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// POST /api/bank/transactions/batch-match — 일괄 매칭
bankRouter.post('/transactions/batch-match', requireRole('ADMIN'), async (c) => {
  try {
    const body = await c.req.json()
    const { matches } = body as { matches: { transaction_id: number; client_id: number }[] }
    const user = c.get('user')

    if (!Array.isArray(matches) || matches.length === 0) {
      return c.json({ success: false, error: 'matches 배열 필수 (각 항목: transaction_id, client_id)' }, 400)
    }

    const results: { id: number; success: boolean; error?: string }[] = []

    // Bulk-fetch transactions
    const txIds = matches.map(m => m.transaction_id)
    const placeholders = txIds.map(() => '?').join(', ')
    const ef = entityFilter(c, 'bank_transactions')
    const { results: txRows } = await c.env.DB.prepare(
      `SELECT id, match_status, counterpart_name FROM bank_transactions WHERE id IN (${placeholders})${ef.clause}`
    ).bind(...txIds, ...ef.params).all<{
      id: number; match_status: string; counterpart_name: string | null
    }>()
    const txMap = new Map(txRows.map(row => [row.id, row]))

    // Validate all client_ids exist
    const clientIds = [...new Set(matches.map(m => m.client_id))]
    const clientPlaceholders = clientIds.map(() => '?').join(', ')
    const { results: clientRows } = await c.env.DB.prepare(
      `SELECT id FROM clients WHERE id IN (${clientPlaceholders}) AND is_active = 1`
    ).bind(...clientIds).all<{ id: number }>()
    const validClientIds = new Set(clientRows.map(r => r.id))

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

// POST /api/bank/transactions/:id/unapply — APPLIED 해제 (payment 삭제 + balance 복원)
bankRouter.post('/transactions/:id/unapply', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user')
    const ef = entityFilter(c, 'bank_transactions')

    const tx = await c.env.DB.prepare(
      `SELECT id, match_status, matched_payment_id, matched_client_id, amount FROM bank_transactions WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{
      id: number; match_status: string; matched_payment_id: number | null
      matched_client_id: number | null; amount: number
    }>()

    if (!tx) {
      return c.json({ success: false, error: '거래내역을 찾을 수 없습니다' }, 404)
    }
    if (tx.match_status !== 'APPLIED') {
      return c.json({ success: false, error: 'APPLIED 상태의 거래만 취소할 수 있습니다' }, 400)
    }

    // 1. payment 삭제 + client balance 복원
    if (tx.matched_payment_id) {
      const payment = await c.env.DB.prepare(
        'SELECT id, client_id, amount FROM payments WHERE id = ?'
      ).bind(tx.matched_payment_id).first<{ id: number; client_id: number; amount: number }>()

      if (payment) {
        // #261: balance 복원 + payment 삭제 + transaction 상태 복원을 원자적 처리
        await c.env.DB.batch([
          c.env.DB.prepare(
            'UPDATE clients SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
          ).bind(payment.amount, payment.client_id),
          c.env.DB.prepare('DELETE FROM payments WHERE id = ?').bind(tx.matched_payment_id),
          c.env.DB.prepare(`
            UPDATE bank_transactions
            SET match_status = 'UNMATCHED',
                matched_client_id = NULL, matched_payment_id = NULL,
                matched_by = NULL, matched_at = NULL,
                match_confidence = NULL, match_reason = NULL
            WHERE id = ?
          `).bind(id),
        ])
      } else {
        // payment 없이 transaction만 복원
        await c.env.DB.prepare(`
          UPDATE bank_transactions
          SET match_status = 'UNMATCHED',
              matched_client_id = NULL, matched_payment_id = NULL,
              matched_by = NULL, matched_at = NULL,
              match_confidence = NULL, match_reason = NULL
          WHERE id = ?
        `).bind(id).run()
      }
    } else {
      // matched_payment_id 없는 경우 transaction만 복원
      await c.env.DB.prepare(`
        UPDATE bank_transactions
        SET match_status = 'UNMATCHED',
            matched_client_id = NULL, matched_payment_id = NULL,
            matched_by = NULL, matched_at = NULL,
            match_confidence = NULL, match_reason = NULL
        WHERE id = ?
      `).bind(id).run()
    }

    return c.json({ success: true, message: '적용이 취소되었습니다. 입금 기록이 삭제되고 잔액이 복원되었습니다.' })
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
        (row.counterpart_name || '').replace(/"/g, '""'),
        (row.description || '').replace(/"/g, '""'),
        statusMap[row.match_status] || row.match_status,
        (row.matched_client_name || '').replace(/"/g, '""')
      ]
      csv += fields.map(f => `"${f}"`).join(',') + '\n'
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
    const today = new Date()
    const threeDaysAgo = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000)
    const dateStart = threeDaysAgo.toISOString().slice(0, 10)
    const dateEnd = today.toISOString().slice(0, 10)

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

    // 바로빌 설정 로드
    const testModeRow = await c.env.DB.prepare(
      "SELECT setting_value FROM settings WHERE setting_key = 'barobill_test_mode'"
    ).first() as { setting_value: string } | null
    const isTest = testModeRow?.setting_value !== '0'
    const certKey = isTest ? (c.env as any).BAROBILL_CERT_KEY : (c.env as any).BAROBILL_CERT_KEY_PROD
    if (!certKey) {
      return c.json({ success: false, error: 'BAROBILL_CERT_KEY 미설정' }, 400)
    }

    const corpNumRow = await c.env.DB.prepare(
      "SELECT setting_value FROM settings WHERE setting_key = 'company_business_registration_number'"
    ).first() as { setting_value: string } | null
    const corpNum = (corpNumRow?.setting_value || '').replace(/-/g, '')
    if (!corpNum) {
      return c.json({ success: false, error: '사업자등록번호 미설정' }, 400)
    }

    const senderIdRow = await c.env.DB.prepare(
      "SELECT setting_value FROM settings WHERE setting_key = 'barobill_sender_id'"
    ).first() as { setting_value: string } | null
    const senderId = senderIdRow?.setting_value || 'DONGSAN'

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
          'SELECT id, entity_id FROM bank_accounts WHERE account_number = ? AND is_active = 1'
        ).bind(accNum).first() as { id: number; entity_id: number } | null
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

              if (refKey) {
                const dup = await c.env.DB.prepare(
                  'SELECT id FROM bank_transactions WHERE bank_account_id = ? AND codef_transaction_id = ?'
                ).bind(bankAcc.id, refKey).first()
                if (dup) { totalSkipped++; continue }
              }

              await c.env.DB.prepare(`
                INSERT INTO bank_transactions (bank_account_id, transaction_date, transaction_time, transaction_type, amount, balance_after, counterpart_name, description, codef_transaction_id, match_status, entity_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'UNMATCHED', ?)
              `).bind(
                bankAcc.id, txDate, txTime, txType, amount,
                parseFloat(item.Balance || '0'),
                item.TransRemark1 || null, item.TransOffice || null,
                refKey || null, bankAcc.entity_id ?? getEntityId(c)
              ).run()
              totalInserted++
            }
          } catch (_dayErr) {
            // 특정 날짜 실패는 무시
          }
        }
      }
    } catch (importErr: any) {
      errors.push(`바로빌 서비스 오류: ${importErr.message}`)
    }

    // 자동매칭 실행 (신규 건에 대해)
    if (totalInserted > 0) {
      try {
        const efSync = entityFilter(c, 'bank_transactions')
        const efSyncRules = entityFilter(c, 'bank_match_rules')
        const { results: unmatchedTxs } = await c.env.DB.prepare(`
          SELECT id, amount, counterpart_name, description, transaction_type
          FROM bank_transactions WHERE match_status = 'UNMATCHED'${efSync.clause}
        `).bind(...efSync.params).all<{ id: number; amount: number; counterpart_name: string | null; description: string | null; transaction_type: string }>()

        const { results: matchRulesSync } = await c.env.DB.prepare(
          `SELECT counterpart_name, matched_client_id, matched_category_id FROM bank_match_rules WHERE 1=1${efSyncRules.clause}`
        ).bind(...efSyncRules.params).all<{ counterpart_name: string; matched_client_id: number | null; matched_category_id: number | null }>()

        const autoRuleMap = new Map(matchRulesSync.map(r => [r.counterpart_name, { clientId: r.matched_client_id, categoryId: r.matched_category_id }]))

        for (const tx of unmatchedTxs) {
          const txName = (tx.counterpart_name ?? '').trim()
          if (!txName || !autoRuleMap.has(txName)) continue

          const autoRule = autoRuleMap.get(txName)!
          if (autoRule.categoryId) {
            await c.env.DB.prepare(`
              UPDATE bank_transactions
              SET match_status = 'APPLIED', matched_category_id = ?, match_confidence = 0.95, match_reason = '자동동기화 규칙매칭 (비용분류)'
              WHERE id = ?
            `).bind(autoRule.categoryId, tx.id).run()
          } else if (autoRule.clientId) {
            await c.env.DB.prepare(`
              UPDATE bank_transactions
              SET match_status = 'CONFIRMED', matched_client_id = ?, match_confidence = 0.95, match_reason = '자동동기화 규칙매칭'
              WHERE id = ?
            `).bind(autoRule.clientId, tx.id).run()
          }
          totalMatched++
        }
      } catch (matchErr) {
        // 자동매칭 실패는 치명적이 아님
      }
    }

    // 계좌 last_synced_at 업데이트
    await c.env.DB.prepare(
      'UPDATE bank_accounts SET last_synced_at = CURRENT_TIMESTAMP WHERE is_active = 1'
    ).run()

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
    // clients 테이블에는 entity_id가 없으므로 entityFilter 미사용
    const { results: receivables } = await c.env.DB.prepare(`
      SELECT
        c.id, c.client_name, c.representative, c.balance,
        (SELECT MAX(p.payment_date) FROM payments p WHERE p.client_id = c.id) as last_payment_date,
        (SELECT COUNT(*) FROM payments p WHERE p.client_id = c.id) as total_payments,
        (SELECT SUM(p.amount) FROM payments p WHERE p.client_id = c.id
         AND p.payment_date >= date('now', '-90 days')) as recent_90d_payments
      FROM clients c
      WHERE c.is_active = 1 AND c.balance > 0
      ORDER BY c.balance DESC
    `).all<{
      id: number
      client_name: string
      representative: string | null
      balance: number
      last_payment_date: string | null
      total_payments: number
      recent_90d_payments: number | null
    }>()

    // 에이징 분석 (30/60/90일 초과)
    const today = new Date()
    const summary = {
      total_receivable: 0,
      client_count: receivables.length,
      aging_30: 0,   // 30일 이내 입금 있음 (정상)
      aging_60: 0,   // 31~60일
      aging_90: 0,   // 61~90일
      aging_over: 0, // 90일 초과 미입금
      no_payment: 0, // 입금 이력 없음
    }

    const clients = receivables.map(r => {
      summary.total_receivable += r.balance

      let aging_category = 'normal'
      if (!r.last_payment_date) {
        summary.no_payment++
        aging_category = 'no_payment'
      } else {
        const lastDate = new Date(r.last_payment_date)
        const diffDays = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
        if (diffDays <= 30) {
          summary.aging_30++
          aging_category = 'normal'
        } else if (diffDays <= 60) {
          summary.aging_60++
          aging_category = 'warning'
        } else if (diffDays <= 90) {
          summary.aging_90++
          aging_category = 'danger'
        } else {
          summary.aging_over++
          aging_category = 'critical'
        }
      }

      return { ...r, aging_category }
    })

    return c.json({ success: true, data: { summary, clients } })
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
    if (!q || q.length < 1) return c.json({ success: true, data: [] })

    // clients 테이블에 entity_id 없음 — entityFilter 미적용
    const { results } = await c.env.DB.prepare(`
      SELECT c.id, c.client_name, c.representative, c.business_registration_number, c.balance
      FROM clients c
      WHERE c.is_active = 1
        AND (c.client_name LIKE ? OR c.representative LIKE ? OR c.search_keywords LIKE ?)
      ORDER BY c.balance DESC
      LIMIT 15
    `).bind(`%${q}%`, `%${q}%`, `%${q}%`).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    return c.json({ success: false, error: '검색 실패' }, 500)
  }
})

// ---------------------------------------------------------------------------
// 카드사 수수료율 관리
// ---------------------------------------------------------------------------

// GET /api/bank/card-fee-rates — 카드사 수수료율 목록
bankRouter.get('/card-fee-rates', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const ef = entityFilter(c, 'card_fee_rates')
    const { results } = await c.env.DB.prepare(
      `SELECT id, card_company, fee_rate, keywords, entity_id, is_active, created_at, updated_at
       FROM card_fee_rates WHERE is_active = 1${ef.clause} ORDER BY card_company`
    ).bind(...ef.params).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('Card fee rates error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /api/bank/card-fee-rates — 카드사 수수료율 등록
bankRouter.post('/card-fee-rates', requireRole('ADMIN'), async (c) => {
  try {
    const body = await c.req.json()
    const { card_company, fee_rate, keywords } = body
    if (!card_company || fee_rate == null) {
      return c.json({ success: false, error: 'card_company, fee_rate 필수' }, 400)
    }
    if (fee_rate < 0 || fee_rate > 100) {
      return c.json({ success: false, error: '수수료율은 0~100 사이 값이어야 합니다' }, 400)
    }
    const entityId = getEntityId(c)
    const result = await c.env.DB.prepare(`
      INSERT INTO card_fee_rates (card_company, fee_rate, keywords, entity_id)
      VALUES (?, ?, ?, ?)
    `).bind(card_company, fee_rate, keywords || null, entityId).run()
    return c.json({ success: true, data: { id: result.meta.last_row_id }, message: '등록 완료' })
  } catch (error: any) {
    if (error.message?.includes('UNIQUE')) {
      return c.json({ success: false, error: '이미 등록된 카드사입니다' }, 409)
    }
    console.error('Card fee rate create error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PUT /api/bank/card-fee-rates/:id — 수수료율 수정
bankRouter.put('/card-fee-rates/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const { card_company, fee_rate, keywords } = body
    if (fee_rate != null && (fee_rate < 0 || fee_rate > 100)) {
      return c.json({ success: false, error: '수수료율은 0~100 사이 값이어야 합니다' }, 400)
    }
    await c.env.DB.prepare(`
      UPDATE card_fee_rates
      SET card_company = COALESCE(?, card_company),
          fee_rate = COALESCE(?, fee_rate),
          keywords = COALESCE(?, keywords),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(card_company || null, fee_rate ?? null, keywords ?? null, id).run()
    return c.json({ success: true, message: '수정 완료' })
  } catch (error) {
    console.error('Card fee rate update error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// DELETE /api/bank/card-fee-rates/:id — 비활성화
bankRouter.delete('/card-fee-rates/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    await c.env.DB.prepare(
      'UPDATE card_fee_rates SET is_active = 0 WHERE id = ?'
    ).bind(id).run()
    return c.json({ success: true, message: '삭제 완료' })
  } catch (error) {
    console.error('Card fee rate delete error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /api/bank/card-fee-calculate — 카드 입금액으로 수수료 역산
// body: { deposit_amount, card_company? } 또는 배열
bankRouter.post('/card-fee-calculate', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const body = await c.req.json()
    const ef = entityFilter(c, 'card_fee_rates')

    // 카드사 수수료율 전체 로드
    const { results: rates } = await c.env.DB.prepare(
      `SELECT card_company, fee_rate, keywords FROM card_fee_rates WHERE is_active = 1${ef.clause}`
    ).bind(...ef.params).all<{ card_company: string; fee_rate: number; keywords: string | null }>()

    // 단건 또는 배열
    const items: Array<{ deposit_amount: number; card_company?: string; counterpart_name?: string }> =
      Array.isArray(body) ? body : [body]

    const results = items.map(item => {
      const depositAmount = parseFloat(String(item.deposit_amount))
      if (isNaN(depositAmount) || depositAmount <= 0) {
        return { ...item, error: '유효하지 않은 금액' }
      }

      // 카드사 매칭: card_company 직접 지정 또는 counterpart_name에서 키워드 매칭
      let matchedRate: { card_company: string; fee_rate: number } | null = null

      if (item.card_company) {
        matchedRate = rates.find(r => r.card_company === item.card_company) || null
      }

      if (!matchedRate && item.counterpart_name) {
        const name = item.counterpart_name
        for (const r of rates) {
          // 카드사명 직접 포함
          if (name.includes(r.card_company)) { matchedRate = r; break }
          // keywords 매칭
          if (r.keywords) {
            const kws = r.keywords.split(',').map(k => k.trim()).filter(Boolean)
            if (kws.some(kw => name.includes(kw))) { matchedRate = r; break }
          }
        }
      }

      if (!matchedRate) {
        return { ...item, deposit_amount: depositAmount, is_card: false }
      }

      const feeRate = matchedRate.fee_rate / 100
      // 입금액 = 결제금액 × (1 - 수수료율)
      // 결제금액 = 입금액 / (1 - 수수료율)
      const originalAmount = Math.round(depositAmount / (1 - feeRate))
      const feeAmount = originalAmount - depositAmount

      return {
        deposit_amount: depositAmount,
        card_company: matchedRate.card_company,
        fee_rate_percent: matchedRate.fee_rate,
        original_amount: originalAmount,
        fee_amount: feeAmount,
        is_card: true,
      }
    })

    // 배열이 아닌 단건 요청이었으면 첫 번째 결과만 반환
    return c.json({
      success: true,
      data: Array.isArray(body) ? results : results[0]
    })
  } catch (error) {
    console.error('Card fee calculate error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /api/bank/card-fee-summary — 기간별 카드 수수료 요약
bankRouter.get('/card-fee-summary', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const { date_start, date_end } = c.req.query()
    const ef = entityFilter(c, 'bt')

    // 카드사 수수료율 로드
    const efRate = entityFilter(c, 'card_fee_rates')
    const { results: rates } = await c.env.DB.prepare(
      `SELECT card_company, fee_rate, keywords FROM card_fee_rates WHERE is_active = 1${efRate.clause}`
    ).bind(...efRate.params).all<{ card_company: string; fee_rate: number; keywords: string | null }>()

    // 입금 거래 조회
    let query = `SELECT id, transaction_date, amount, counterpart_name, description
      FROM bank_transactions bt
      WHERE transaction_type = 'DEPOSIT'${ef.clause}`
    const params: (string | number)[] = [...ef.params]

    if (date_start) { query += ' AND bt.transaction_date >= ?'; params.push(date_start.replace(/-/g, '')) }
    if (date_end) { query += ' AND bt.transaction_date <= ?'; params.push(date_end.replace(/-/g, '')) }
    query += ' ORDER BY bt.transaction_date DESC'

    const { results: txs } = await c.env.DB.prepare(query).bind(...params).all<{
      id: number; transaction_date: string; amount: number; counterpart_name: string | null; description: string | null
    }>()

    // 카드사별 집계
    const summary: Record<string, { card_company: string; fee_rate: number; count: number; total_deposit: number; total_original: number; total_fee: number }> = {}

    for (const tx of txs) {
      const name = tx.counterpart_name || tx.description || ''
      let matched: { card_company: string; fee_rate: number } | null = null
      for (const r of rates) {
        if (name.includes(r.card_company)) { matched = r; break }
        if (r.keywords) {
          const kws = r.keywords.split(',').map(k => k.trim()).filter(Boolean)
          if (kws.some(kw => name.includes(kw))) { matched = r; break }
        }
      }
      if (!matched) continue

      if (!summary[matched.card_company]) {
        summary[matched.card_company] = {
          card_company: matched.card_company,
          fee_rate: matched.fee_rate,
          count: 0, total_deposit: 0, total_original: 0, total_fee: 0
        }
      }
      const s = summary[matched.card_company]
      const feeRate = matched.fee_rate / 100
      const original = Math.round(tx.amount / (1 - feeRate))
      const fee = original - tx.amount
      s.count++
      s.total_deposit += tx.amount
      s.total_original += original
      s.total_fee += fee
    }

    const data = Object.values(summary).sort((a, b) => b.total_fee - a.total_fee)
    const totals = data.reduce((acc, s) => ({
      count: acc.count + s.count,
      total_deposit: acc.total_deposit + s.total_deposit,
      total_original: acc.total_original + s.total_original,
      total_fee: acc.total_fee + s.total_fee,
    }), { count: 0, total_deposit: 0, total_original: 0, total_fee: 0 })

    return c.json({ success: true, data: { by_company: data, totals } })
  } catch (error) {
    console.error('Card fee summary error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default bankRouter
