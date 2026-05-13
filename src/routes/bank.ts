// ============================================================================
// 은행 거래내역 연동 API
// 모든 엔드포인트: authMiddleware + requireRole('ADMIN')
// ============================================================================

import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { fetchTransactions, createConnectedId } from '../lib/codef'
import { createPayment } from '../lib/payments'
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
    const { bank_code, bank_name, account_number, account_holder, connected_id } = body

    if (!bank_code || !bank_name || !account_number) {
      return c.json({
        success: false,
        error: 'bank_code, bank_name, account_number 필수'
      }, 400)
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO bank_accounts (bank_code, bank_name, account_number, account_holder, connected_id, entity_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      bank_code,
      bank_name,
      account_number,
      account_holder ?? null,
      connected_id ?? null,
      getEntityId(c)
    ).run()

    // CODEF 설정값이 있으면 settings 테이블에 저장
    const { codef_client_id, codef_client_secret, codef_service_type } = body
    if (codef_client_id || codef_client_secret || codef_service_type) {
      const settingsToSave: [string, string][] = []
      if (codef_client_id)     settingsToSave.push(['codef_client_id', codef_client_id])
      if (codef_client_secret) settingsToSave.push(['codef_client_secret', codef_client_secret])
      if (codef_service_type)  settingsToSave.push(['codef_service_type', codef_service_type])
      for (const [key, val] of settingsToSave) {
        await c.env.DB.prepare(
          'INSERT OR REPLACE INTO settings (setting_key, setting_value) VALUES (?, ?)'
        ).bind(key, val).run()
      }
    }

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
    const { bank_code, bank_name, account_number, account_holder, connected_id } = body

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
          account_holder = COALESCE(?, account_holder),
          connected_id = ?
      WHERE id = ?
    `).bind(
      bank_code ?? null,
      bank_name ?? null,
      account_number ?? null,
      account_holder ?? null,
      connected_id ?? null,
      id
    ).run()

    // CODEF 설정값 업데이트
    const { codef_client_id, codef_client_secret, codef_service_type } = body
    if (codef_client_id || codef_client_secret || codef_service_type) {
      const settingsToSave: [string, string][] = []
      if (codef_client_id)     settingsToSave.push(['codef_client_id', codef_client_id])
      if (codef_client_secret) settingsToSave.push(['codef_client_secret', codef_client_secret])
      if (codef_service_type)  settingsToSave.push(['codef_service_type', codef_service_type])
      for (const [key, val] of settingsToSave) {
        await c.env.DB.prepare(
          'INSERT OR REPLACE INTO settings (setting_key, setting_value) VALUES (?, ?)'
        ).bind(key, val).run()
      }
    }

    return c.json({ success: true, message: '계좌가 수정되었습니다' })
  } catch (error) {
    console.error('Update bank account error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// GET /api/bank/settings — CODEF 설정 조회
bankRouter.get('/settings', requireRole('ADMIN'), async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      "SELECT setting_key, setting_value FROM settings WHERE setting_key LIKE 'codef_%'"
    ).all<{ setting_key: string; setting_value: string }>()

    const settings: Record<string, string> = {}
    for (const r of results) {
      settings[r.setting_key] = r.setting_value
    }
    return c.json({ success: true, data: settings })
  } catch (error) {
    return c.json({ success: false, error: 'Settings load failed' }, 500)
  }
})

// PUT /api/bank/settings — CODEF 설정 저장
bankRouter.put('/settings', requireRole('ADMIN'), async (c) => {
  try {
    const body = await c.req.json() as Record<string, string>
    const allowedKeys = ['codef_client_id', 'codef_client_secret', 'codef_service_type']
    for (const [key, val] of Object.entries(body)) {
      if (allowedKeys.includes(key) && val) {
        await c.env.DB.prepare(
          'INSERT OR REPLACE INTO settings (setting_key, setting_value) VALUES (?, ?)'
        ).bind(key, val).run()
      }
    }
    return c.json({ success: true, message: 'CODEF 설정이 저장되었습니다' })
  } catch (error) {
    return c.json({ success: false, error: 'Settings save failed' }, 500)
  }
})

// POST /api/bank/connected-id — CODEF Connected ID 발급
bankRouter.post('/connected-id', requireRole('ADMIN'), async (c) => {
  try {
    const body = await c.req.json()
    const { organization, loginType, id, password } = body

    if (!organization) {
      return c.json({ success: false, error: '기관코드(organization) 필수' }, 400)
    }

    const result = await createConnectedId(c.env.DB, {
      countryCode: 'KR',
      businessType: 'BK',
      clientType: 'P',
      organization,
      loginType: loginType || '1',
      id: id || '',
      password: password || '',
    })

    const code = result.result?.code
    if (code === 'CF-00000' || code === 'CF-04012') {
      const connectedId = result.data?.connectedId
      if (connectedId) {
        return c.json({
          success: true,
          data: { connectedId },
          message: 'Connected ID가 발급되었습니다'
        })
      }
    }

    return c.json({
      success: false,
      error: `CODEF 오류 [${code}]`,
      detail: result
    }, 400)
  } catch (error) {
    console.error('Create connectedId error:', error)
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

// POST /api/bank/accounts/:id/sync-preview — 동기화 미리보기 (DB에 저장 안함)
bankRouter.post('/accounts/:id/sync-preview', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json().catch(() => ({})) as {
      start_date?: string
      end_date?: string
    }

    const account = await c.env.DB.prepare(
      'SELECT id, bank_code, account_number, connected_id FROM bank_accounts WHERE id = ? AND is_active = 1'
    ).bind(id).first<{
      id: number
      bank_code: string
      account_number: string
      connected_id: string | null
    }>()

    if (!account) {
      return c.json({ success: false, error: '계좌를 찾을 수 없습니다' }, 404)
    }

    if (!account.connected_id) {
      return c.json({ success: false, error: 'connected_id가 등록되지 않은 계좌입니다' }, 400)
    }

    // 날짜 범위 기본값: 최근 30일
    const today = new Date()
    const defaultEnd   = today.toISOString().slice(0, 10).replace(/-/g, '')
    const defaultStart = new Date(today.setDate(today.getDate() - 30))
      .toISOString().slice(0, 10).replace(/-/g, '')

    const startDate = (body.start_date ?? defaultStart).replace(/-/g, '')
    const endDate   = (body.end_date ?? defaultEnd).replace(/-/g, '')

    // CODEF API 호출
    const codefRes = await fetchTransactions(c.env.DB, {
      connectedId:  account.connected_id,
      organization: account.bank_code,
      account:      account.account_number,
      startDate,
      endDate,
    })

    if (codefRes.result.code !== 'CF-00000') {
      console.error('CODEF API error:', codefRes.result)
      return c.json({
        success: false,
        error: '거래내역 조회 중 오류가 발생했습니다'
      }, 502)
    }

    const txList = codefRes.data?.resTrHistoryList ?? []
    const { results: existingTxs } = await c.env.DB.prepare(`
      SELECT codef_transaction_id FROM bank_transactions
      WHERE bank_account_id = ?
    `).bind(account.id).all<{ codef_transaction_id: string }>()

    const existingCodefIds = new Set(existingTxs.map(t => t.codef_transaction_id))

    const newTransactions: any[] = []
    let duplicateCount = 0

    for (const tx of txList) {
      const inAmount  = parseFloat(tx.resAccountIn  || '0')
      const outAmount = parseFloat(tx.resAccountOut || '0')
      const type      = inAmount > 0 ? 'DEPOSIT' : 'WITHDRAWAL'
      const amount    = inAmount > 0 ? inAmount : outAmount

      const codefId = tx.resTransactionId
        ?? `${tx.resAccountTrDate}${tx.resAccountTrTime}${amount}`

      if (existingCodefIds.has(codefId)) {
        duplicateCount++
        continue
      }

      newTransactions.push({
        bank_account_id: account.id,
        transaction_date: tx.resAccountTrDate,
        transaction_time: tx.resAccountTrTime ?? null,
        transaction_type: type,
        amount,
        balance_after: parseFloat(tx.resAfterTranBalance || '0'),
        counterpart_name: tx.resAccountDesc1 ?? null,
        description: [tx.resAccountDesc2, tx.resAccountDesc3, tx.resAccountDesc4]
          .filter(Boolean).join(' ').trim() || null,
        codef_transaction_id: codefId,
      })
    }

    return c.json({
      success: true,
      data: {
        total: txList.length,
        new_count: newTransactions.length,
        duplicate_count: duplicateCount,
        new_transactions: newTransactions,
        date_range: { start: startDate, end: endDate }
      }
    })
  } catch (error) {
    console.error('Sync preview error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// POST /api/bank/accounts/:id/sync — CODEF 거래내역 조회 후 INSERT OR IGNORE
bankRouter.post('/accounts/:id/sync', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json().catch(() => ({})) as {
      start_date?: string
      end_date?: string
    }

    const account = await c.env.DB.prepare(
      'SELECT id, bank_code, account_number, connected_id FROM bank_accounts WHERE id = ? AND is_active = 1'
    ).bind(id).first<{
      id: number
      bank_code: string
      account_number: string
      connected_id: string | null
    }>()

    if (!account) {
      return c.json({ success: false, error: '계좌를 찾을 수 없습니다' }, 404)
    }

    if (!account.connected_id) {
      return c.json({ success: false, error: 'connected_id가 등록되지 않은 계좌입니다' }, 400)
    }

    // 날짜 범위 기본값: 최근 30일
    const today = new Date()
    const defaultEnd   = today.toISOString().slice(0, 10).replace(/-/g, '')
    const defaultStart = new Date(today.setDate(today.getDate() - 30))
      .toISOString().slice(0, 10).replace(/-/g, '')

    const startDate = (body.start_date ?? defaultStart).replace(/-/g, '')
    const endDate   = (body.end_date ?? defaultEnd).replace(/-/g, '')

    // CODEF API 호출
    const codefRes = await fetchTransactions(c.env.DB, {
      connectedId:  account.connected_id,
      organization: account.bank_code,
      account:      account.account_number,
      startDate,
      endDate,
    })

    if (codefRes.result.code !== 'CF-00000') {
      console.error('CODEF API error:', codefRes.result)
      return c.json({
        success: false,
        error: '거래내역 동기화 중 오류가 발생했습니다'
      }, 502)
    }

    const txList = codefRes.data?.resTrHistoryList ?? []
    let insertedCount = 0

    for (const tx of txList) {
      const inAmount  = parseFloat(tx.resAccountIn  || '0')
      const outAmount = parseFloat(tx.resAccountOut || '0')
      const type      = inAmount > 0 ? 'DEPOSIT' : 'WITHDRAWAL'
      const amount    = inAmount > 0 ? inAmount : outAmount

      // codef_transaction_id: 지원되면 사용, 없으면 날짜+시간+금액 조합
      const codefId = tx.resTransactionId
        ?? `${tx.resAccountTrDate}${tx.resAccountTrTime}${amount}`

      const res = await c.env.DB.prepare(`
        INSERT OR IGNORE INTO bank_transactions (
          bank_account_id, transaction_date, transaction_time,
          transaction_type, amount, balance_after,
          counterpart_name, description, codef_transaction_id, entity_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        account.id,
        tx.resAccountTrDate,
        tx.resAccountTrTime ?? null,
        type,
        amount,
        parseFloat(tx.resAfterTranBalance || '0'),
        tx.resAccountDesc1 ?? null,
        [tx.resAccountDesc2, tx.resAccountDesc3, tx.resAccountDesc4]
          .filter(Boolean).join(' ').trim() || null,
        codefId,
        getEntityId(c)
      ).run()

      if (res.meta.changes > 0) insertedCount++
    }

    // last_synced_at 업데이트
    await c.env.DB.prepare(
      'UPDATE bank_accounts SET last_synced_at = CURRENT_TIMESTAMP, last_synced_date = ? WHERE id = ?'
    ).bind(endDate, id).run()

    return c.json({
      success: true,
      data: {
        total_fetched: txList.length,
        newly_inserted: insertedCount,
      },
      message: `거래내역 ${txList.length}건 조회, ${insertedCount}건 신규 저장`
    })
  } catch (error) {
    console.error('Sync bank transactions error:', error)
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
    const { account_id, date_start, date_end, match_status, transaction_type } = c.req.query()

    let query = `
      SELECT
        bt.*,
        ba.bank_name, ba.account_number,
        c.client_name as matched_client_name
      FROM bank_transactions bt
      LEFT JOIN bank_accounts ba ON bt.bank_account_id = ba.id
      LEFT JOIN clients c ON bt.matched_client_id = c.id
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
    if (match_status) {
      query += ' AND bt.match_status = ?'
      params.push(match_status)
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
// 매칭 규칙 관리
// ---------------------------------------------------------------------------

// GET /api/bank/match-rules — 매칭 규칙 목록
bankRouter.get('/match-rules', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT r.*, c.client_name
      FROM bank_match_rules r
      LEFT JOIN clients c ON r.matched_client_id = c.id
      ORDER BY r.match_count DESC
    `).all<{
      id: number
      counterpart_name: string
      matched_client_id: number
      match_count: number
      last_used_at: string
      created_at: string
      created_by: number | null
      client_name: string | null
    }>()

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
    const { counterpart_name, matched_client_id } = body
    const user = c.get('user')

    if (!counterpart_name || !matched_client_id) {
      return c.json({
        success: false,
        error: 'counterpart_name, matched_client_id 필수'
      }, 400)
    }

    // 거래처 확인
    const client = await c.env.DB.prepare(
      'SELECT id FROM clients WHERE id = ? AND is_active = 1'
    ).bind(matched_client_id).first()

    if (!client) {
      return c.json({ success: false, error: '거래처를 찾을 수 없습니다' }, 404)
    }

    // INSERT OR REPLACE + match_count 증가
    const res = await c.env.DB.prepare(`
      INSERT INTO bank_match_rules (counterpart_name, matched_client_id, created_by, match_count, entity_id)
      VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(counterpart_name) DO UPDATE SET
        matched_client_id = excluded.matched_client_id,
        match_count = match_count + 1,
        last_used_at = CURRENT_TIMESTAMP
    `).bind(counterpart_name, matched_client_id, user?.id ?? 1, getEntityId(c) || 1).run()

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

// POST /api/bank/transactions/auto-match — 미매칭 입금건 자동매칭 (규칙 학습 포함)
bankRouter.post('/transactions/auto-match', requireRole('ADMIN'), async (c) => {
  try {
    // 1. 모든 UNMATCHED DEPOSIT 거래내역 가져오기
    const { results: unmatchedTxs } = await c.env.DB.prepare(`
      SELECT id, amount, counterpart_name, description
      FROM bank_transactions
      WHERE match_status = 'UNMATCHED' AND transaction_type = 'DEPOSIT'
    `).all<{
      id: number
      amount: number
      counterpart_name: string | null
      description: string | null
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

    // 3. bank_match_rules 캐시 로드
    const { results: matchRules } = await c.env.DB.prepare(`
      SELECT counterpart_name, matched_client_id FROM bank_match_rules
    `).all<{
      counterpart_name: string
      matched_client_id: number
    }>()

    const ruleMap = new Map(matchRules.map(r => [r.counterpart_name, r.matched_client_id]))

    let matchedCount = 0

    for (const tx of unmatchedTxs) {
      const txName = (tx.counterpart_name ?? '').trim()
      if (!txName) continue

      let bestClientId: number | null = null
      let bestConfidence = 0
      let bestReason = ''

      // Step 1: 먼저 bank_match_rules에서 정확히 일치하는 규칙 찾기
      if (ruleMap.has(txName)) {
        bestClientId = (ruleMap.get(txName) as number) ?? null
        bestConfidence = 0.95
        bestReason = '학습된 규칙'

        // match_count 증가 + last_used_at 업데이트
        if (bestClientId) {
          await c.env.DB.prepare(`
            UPDATE bank_match_rules
            SET match_count = match_count + 1, last_used_at = CURRENT_TIMESTAMP
            WHERE counterpart_name = ?
          `).bind(txName).run()
        }
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

      // 신뢰도 0.5 이상이면 SUGGESTED
      if (bestConfidence >= 0.5 && bestClientId !== null) {
        await c.env.DB.prepare(`
          UPDATE bank_transactions
          SET match_status = 'SUGGESTED',
              matched_client_id = ?,
              match_confidence = ?,
              match_reason = ?
          WHERE id = ?
        `).bind(bestClientId, bestConfidence, bestReason, tx.id).run()
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
    const { client_id } = body

    if (!client_id) {
      return c.json({ success: false, error: 'client_id 필수' }, 400)
    }

    const tx = await c.env.DB.prepare(
      "SELECT id, match_status, counterpart_name FROM bank_transactions WHERE id = ?"
    ).bind(id).first<{ id: number; match_status: string; counterpart_name: string | null }>()

    if (!tx) {
      return c.json({ success: false, error: '거래내역을 찾을 수 없습니다' }, 404)
    }
    if (tx.match_status === 'APPLIED') {
      return c.json({ success: false, error: '이미 적용된 거래는 변경할 수 없습니다' }, 400)
    }

    const client = await c.env.DB.prepare(
      'SELECT id FROM clients WHERE id = ? AND is_active = 1'
    ).bind(client_id).first()

    if (!client) {
      return c.json({ success: false, error: '거래처를 찾을 수 없습니다' }, 404)
    }

    const user = c.get('user')
    await c.env.DB.prepare(`
      UPDATE bank_transactions
      SET match_status = 'CONFIRMED',
          matched_client_id = ?,
          matched_by = ?,
          matched_at = CURRENT_TIMESTAMP,
          match_confidence = 1.0,
          match_reason = '수동매칭'
      WHERE id = ?
    `).bind(client_id, user?.id ?? 1, id).run()

    // 규칙 학습: counterpart_name이 있으면 bank_match_rules에 추가/업데이트
    if (tx.counterpart_name && tx.counterpart_name.trim()) {
      await c.env.DB.prepare(`
        INSERT INTO bank_match_rules (counterpart_name, matched_client_id, created_by, match_count, entity_id)
        VALUES (?, ?, ?, 1, ?)
        ON CONFLICT(counterpart_name) DO UPDATE SET
          matched_client_id = excluded.matched_client_id,
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

    const tx = await c.env.DB.prepare(
      'SELECT id, bank_account_id, transaction_date, transaction_time, transaction_type, amount, balance_after, counterpart_name, description, match_status, matched_client_id, matched_payment_id, entity_id FROM bank_transactions WHERE id = ?'
    ).bind(id).first<{
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

    // createPayment 공유 함수로 입금 생성
    let payResult: { payment_id: number; new_balance: number }
    try {
      payResult = await createPayment(c.env.DB, {
        client_id: clientId,
        payment_date: payDate,
        amount: parseFloat(String(tx.amount)),
        payment_method: body.payment_method || '계좌이체',
        reference_number: String(tx.id),
        notes: body.notes || defaultNotes,
        created_by: user?.id ?? 1,
      })
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Client not found')) {
        return c.json({ success: false, error: '매칭된 거래처를 찾을 수 없습니다' }, 404)
      }
      throw err
    }

    // match_status → APPLIED
    await c.env.DB.prepare(`
      UPDATE bank_transactions
      SET match_status = 'APPLIED',
          matched_payment_id = ?,
          matched_by = ?,
          matched_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(payResult.payment_id, user?.id ?? 1, id).run()

    return c.json({
      success: true,
      data: {
        payment_id: payResult.payment_id,
        new_balance: payResult.new_balance,
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
    const { transaction_ids } = body as { transaction_ids: number[] }
    const user = c.get('user')

    if (!Array.isArray(transaction_ids) || transaction_ids.length === 0) {
      return c.json({ success: false, error: 'transaction_ids 배열 필수' }, 400)
    }

    const results: { id: number; success: boolean; error?: string; payment_id?: number }[] = []

    // Bulk-fetch all transactions in one query instead of N individual SELECTs
    const placeholders = transaction_ids.map(() => '?').join(', ')
    const { results: txRows } = await c.env.DB.prepare(
      `SELECT id, transaction_date, amount, match_status, matched_client_id, counterpart_name, description FROM bank_transactions WHERE id IN (${placeholders})`
    ).bind(...transaction_ids).all<{
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
      if (!tx.matched_client_id) {
        results.push({ id: txId, success: false, error: '매칭된 거래처 없음' })
        continue
      }
      if (!['CONFIRMED', 'SUGGESTED'].includes(tx.match_status)) {
        results.push({ id: txId, success: false, error: `적용 불가 상태: ${tx.match_status}` })
        continue
      }

      const rawDate = tx.transaction_date
      const payDate = rawDate.length === 8
        ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
        : rawDate

      try {
        const payResult = await createPayment(c.env.DB, {
          client_id: tx.matched_client_id,
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

// POST /api/bank/transactions/:id/ignore — IGNORED 처리
bankRouter.post('/transactions/:id/ignore', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')

    const tx = await c.env.DB.prepare(
      'SELECT id, match_status FROM bank_transactions WHERE id = ?'
    ).bind(id).first<{ id: number; match_status: string }>()

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

// POST /api/bank/transactions/:id/unmatch — UNMATCHED로 되돌리기
bankRouter.post('/transactions/:id/unmatch', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')

    const tx = await c.env.DB.prepare(
      'SELECT id, match_status FROM bank_transactions WHERE id = ?'
    ).bind(id).first<{ id: number; match_status: string }>()

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
    const stats = await c.env.DB.prepare(`
      SELECT
        SUM(CASE WHEN match_status = 'UNMATCHED'  AND transaction_type = 'DEPOSIT' THEN 1 ELSE 0 END) as unmatched_count,
        SUM(CASE WHEN match_status = 'SUGGESTED'  AND transaction_type = 'DEPOSIT' THEN 1 ELSE 0 END) as suggested_count,
        SUM(CASE WHEN match_status = 'APPLIED'    THEN 1 ELSE 0 END) as applied_count
      FROM bank_transactions
    `).first<{
      unmatched_count: number
      suggested_count: number
      applied_count: number
    }>()

    const lastSync = await c.env.DB.prepare(
      'SELECT MAX(last_synced_at) as last_sync FROM bank_accounts WHERE is_active = 1'
    ).first<{ last_sync: string | null }>()

    return c.json({
      success: true,
      data: {
        unmatched_count: stats?.unmatched_count ?? 0,
        suggested_count: stats?.suggested_count ?? 0,
        applied_count:   stats?.applied_count   ?? 0,
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

export default bankRouter
