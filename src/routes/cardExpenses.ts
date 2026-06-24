// ============================================================================
// 법인카드 관리 API
// Phase 1~5: 카드 등록, 거래 수집, 영수증, 결제예정, 보고서
// ============================================================================

import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { entityFilter, getEntityId } from '../utils/entityFilter'
import { getEntityCorpNum } from '../utils/entitySettings'
import { validateUpload } from '../utils/uploadValidation'

const cardExpRouter = new Hono<HonoEnv>()
cardExpRouter.use('/*', authMiddleware)

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
  const senderIdRow = await c.env.DB.prepare(
    "SELECT setting_value FROM settings WHERE setting_key = 'barobill_sender_id'"
  ).first() as { setting_value: string } | null
  return { certKey, corpNum, isTest, senderId: senderIdRow?.setting_value || 'DONGSAN' }
}

/** YYYYMMDD → epoch ms (로컬). 형식 불량 시 NaN. */
function parseTxDate(s: string | null): number {
  if (!s || s.length < 8) return NaN
  return new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)).getTime()
}

/**
 * 승인↔취소 자동 상계: 같은 카드+금액+가맹점이고 날짜가 ±30일 이내인
 * 미상계 승인/취소 쌍을 1:1로 매칭해 양쪽 is_offset=1 + 상호 offset_pair_id 설정.
 * (바로빌에 원승인번호 참조가 없어 카드·금액·가맹점·근접일자로 추정 매칭)
 * 전체 미상계 건을 대상으로 하므로 기존 데이터도 동기화 시 백필됨. 멱등.
 * @returns 새로 상계 처리된 쌍 수
 */
async function reconcileCardOffsets(c: any): Promise<number> {
  const OFFSET_WINDOW_DAYS = 30
  const ef = entityFilter(c, 'card_transactions')
  const { results } = await c.env.DB.prepare(
    `SELECT id, card_id, transaction_date, merchant_name, amount, approval_type
     FROM card_transactions
     WHERE is_offset = 0 AND merchant_name IS NOT NULL AND merchant_name != ''${ef.clause}`
  ).bind(...ef.params).all()

  const rows = results as any[]
  const cancels = rows.filter(r => r.approval_type === 'CANCEL')
  const approvals = rows.filter(r => r.approval_type !== 'CANCEL')
  if (!cancels.length || !approvals.length) return 0

  const used = new Set<number>()
  const pairs: Array<[number, number]> = []  // [cancelId, approvalId]

  for (const cancel of cancels) {
    const cDate = parseTxDate(cancel.transaction_date)
    let best: any = null
    let bestDiff = Infinity
    for (const ap of approvals) {
      if (used.has(ap.id)) continue
      if (ap.card_id !== cancel.card_id) continue
      if (Math.round(ap.amount) !== Math.round(cancel.amount)) continue
      if ((ap.merchant_name || '') !== (cancel.merchant_name || '')) continue
      const diffDays = Math.abs(cDate - parseTxDate(ap.transaction_date)) / 86400000
      if (!(diffDays <= OFFSET_WINDOW_DAYS)) continue  // NaN-safe
      if (diffDays < bestDiff) { bestDiff = diffDays; best = ap }
    }
    if (best) { used.add(best.id); pairs.push([cancel.id, best.id]) }
  }

  if (!pairs.length) return 0
  const stmts: any[] = []
  for (const [cid, aid] of pairs) {
    stmts.push(c.env.DB.prepare('UPDATE card_transactions SET is_offset = 1, offset_pair_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(aid, cid))
    stmts.push(c.env.DB.prepare('UPDATE card_transactions SET is_offset = 1, offset_pair_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(cid, aid))
  }
  for (let i = 0; i < stmts.length; i += 80) await c.env.DB.batch(stmts.slice(i, i + 80))
  return pairs.length
}

// ===========================================================================
// Phase 1: 법인카드 CRUD
// ===========================================================================

// GET /api/card-expenses/cards
cardExpRouter.get('/cards', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const ef = entityFilter(c, 'cc')
    const now = new Date()
    const thisMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
    const { results } = await c.env.DB.prepare(`
      SELECT cc.*, u.name as assigned_user_name,
        (SELECT COUNT(*) FROM card_transactions ct WHERE ct.card_id = cc.id AND ct.transaction_date >= ? AND ct.transaction_date <= ?) as tx_count,
        (SELECT COALESCE(SUM(CASE WHEN ct2.approval_type != 'CANCEL' THEN ct2.amount ELSE -ct2.amount END), 0) FROM card_transactions ct2 WHERE ct2.card_id = cc.id AND ct2.transaction_date >= ? AND ct2.transaction_date <= ?) as month_total
      FROM corporate_cards cc
      LEFT JOIN users u ON cc.assigned_user_id = u.id
      WHERE cc.is_active = 1${ef.clause}
      ORDER BY cc.created_at DESC
    `).bind(thisMonth + '01', thisMonth + '31', thisMonth + '01', thisMonth + '31', ...ef.params).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('Get cards error:', error)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// POST /api/card-expenses/cards
cardExpRouter.post('/cards', requireRole('ADMIN'), async (c) => {
  try {
    const body = await c.req.json()
    const {
      card_name, card_company, card_number_last4, holder_name, monthly_limit, cutoff_day, payment_day, assigned_user_id,
      barobill_sync, card_number, web_id, web_pwd, card_type, collect_cycle,
    } = body
    if (!card_name || !card_company) {
      return c.json({ success: false, error: 'card_name, card_company 필수' }, 400)
    }
    const entityId = getEntityId(c)

    // 바로빌 연동 시 전체 카드번호에서 last4 도출
    let last4 = card_number_last4
    if (barobill_sync && card_number) last4 = String(card_number).replace(/[^0-9]/g, '').slice(-4)

    // 카드번호 중복 체크 (#190)
    if (last4) {
      const existing = await c.env.DB.prepare(
        'SELECT id FROM corporate_cards WHERE card_number_last4 = ? AND entity_id = ?'
      ).bind(last4, entityId).first()
      if (existing) {
        return c.json({ success: false, error: '동일한 카드번호(끝 4자리)가 이미 등록되어 있습니다' }, 409)
      }
    }

    let barobillRegistered = 0
    let cycle: string | null = null

    // 바로빌 자동 수집등록 (RegistCardEx). 인증정보(WebPwd)·전체 카드번호는 1회 전송, DB 미저장.
    if (barobill_sync) {
      if (!card_number || !web_id || !web_pwd) {
        return c.json({ success: false, error: '바로빌 연동에는 전체 카드번호·카드사 홈페이지 ID/PW가 필요합니다' }, 400)
      }
      const { registCard } = await import('../services/barobillCard')
      const { BAROBILL_COLLECT_CYCLE, BAROBILL_CARD_TYPE, toBarobillCardCompany, barobillErrorMessage } = await import('../constants/barobillCodes')
      const bbCardCompany = toBarobillCardCompany(card_company)
      if (!bbCardCompany) {
        return c.json({ success: false, error: '선택한 카드사는 바로빌 카드조회를 지원하지 않습니다.' }, 400)
      }
      const config = await getBarobillConfig(c)
      const cyc: string = collect_cycle || BAROBILL_COLLECT_CYCLE.DEFAULT
      cycle = cyc
      const code = await registCard(config, {
        collectCycle: cyc,
        cardCompany: bbCardCompany,
        cardType: card_type || BAROBILL_CARD_TYPE.CORPORATE,
        cardNum: String(card_number).replace(/[^0-9]/g, ''),
        webId: web_id,
        webPwd: web_pwd,
        alias: card_name,
      })
      if (code <= 0) {
        return c.json({ success: false, error: '바로빌 카드 수집등록 실패: ' + barobillErrorMessage(code) }, 400)
      }
      barobillRegistered = 1
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO corporate_cards (card_name, card_company, card_number_last4, holder_name, monthly_limit, cutoff_day, payment_day, assigned_user_id, entity_id, barobill_registered, collect_cycle, barobill_registered_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${barobillRegistered ? 'CURRENT_TIMESTAMP' : 'NULL'})
    `).bind(card_name, card_company, last4 || null, holder_name || null, monthly_limit || 0, cutoff_day || 15, payment_day || 15, assigned_user_id || null, entityId, barobillRegistered, cycle).run()
    return c.json({ success: true, data: { id: result.meta.last_row_id }, message: barobillRegistered ? '카드 등록 + 바로빌 수집연동 완료' : '카드 등록 완료' })
  } catch (error: any) {
    console.error('Create card error:', error?.message || 'unknown')
    const msg = String(error?.message || '')
    return c.json({ success: false, error: msg.includes('미설정') ? msg : '서버 오류' }, 500)
  }
})

// PUT /api/card-expenses/cards/:id
cardExpRouter.put('/cards/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const { card_name, card_company, card_number_last4, holder_name, monthly_limit, cutoff_day, payment_day, assigned_user_id } = body
    const ef = entityFilter(c)  // #360: 타법인 법인카드 수정 차단
    await c.env.DB.prepare(`
      UPDATE corporate_cards
      SET card_name = COALESCE(?, card_name),
          card_company = COALESCE(?, card_company),
          card_number_last4 = COALESCE(?, card_number_last4),
          holder_name = COALESCE(?, holder_name),
          monthly_limit = COALESCE(?, monthly_limit),
          cutoff_day = COALESCE(?, cutoff_day),
          payment_day = COALESCE(?, payment_day),
          assigned_user_id = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?${ef.clause}
    `).bind(card_name || null, card_company || null, card_number_last4 || null, holder_name || null, monthly_limit ?? null, cutoff_day ?? null, payment_day ?? null, assigned_user_id ?? null, id, ...ef.params).run()
    return c.json({ success: true, message: '카드 수정 완료' })
  } catch (error) {
    console.error('Update card error:', error)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// DELETE /api/card-expenses/cards/:id
cardExpRouter.delete('/cards/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    const ef = entityFilter(c)  // #360: 타법인 법인카드 비활성화 차단
    const card = await c.env.DB.prepare(
      `SELECT card_number_last4, barobill_registered FROM corporate_cards WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first() as { card_number_last4: string | null; barobill_registered: number } | null
    if (!card) return c.json({ success: false, error: '카드를 찾을 수 없습니다' }, 404)

    // 바로빌 수집 해지 (연동된 카드만): 카드목록에서 last4로 전체번호 역참조 후 StopCard
    if (card.barobill_registered && card.card_number_last4) {
      try {
        const { getCardList, stopCard } = await import('../services/barobillCard')
        const { barobillErrorMessage } = await import('../constants/barobillCodes')
        const config = await getBarobillConfig(c)
        const bbCards = await getCardList(config)
        const match = bbCards.find((bc: any) => (bc.CardNum || '').slice(-4) === card.card_number_last4)
        if (match && match.CardNum) {
          const code = await stopCard(config, match.CardNum)
          if (code <= 0) {
            return c.json({ success: false, error: '바로빌 카드 수집 해지 실패: ' + barobillErrorMessage(code) }, 400)
          }
        }
      } catch (e: any) {
        console.error('Card stop error:', e?.message || 'unknown')
        return c.json({ success: false, error: '바로빌 해지 중 오류가 발생했습니다.' }, 500)
      }
    }

    await c.env.DB.prepare(`UPDATE corporate_cards SET is_active = 0 WHERE id = ?${ef.clause}`).bind(id, ...ef.params).run()
    return c.json({ success: true, message: '카드 삭제 완료' })
  } catch (error) {
    console.error('Delete card error:', error)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// POST /api/card-expenses/cards/:id/refresh — 바로빌 즉시조회 요청 (RefreshCard)
cardExpRouter.post('/cards/:id/refresh', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    const ef = entityFilter(c)
    const card = await c.env.DB.prepare(
      `SELECT card_number_last4, barobill_registered FROM corporate_cards WHERE id = ? AND is_active = 1${ef.clause}`
    ).bind(id, ...ef.params).first() as { card_number_last4: string | null; barobill_registered: number } | null
    if (!card) return c.json({ success: false, error: '카드를 찾을 수 없습니다' }, 404)
    if (!card.barobill_registered) return c.json({ success: false, error: '바로빌에 연동되지 않은 카드입니다' }, 400)

    const { getCardList, refreshCard } = await import('../services/barobillCard')
    const { barobillErrorMessage } = await import('../constants/barobillCodes')
    const config = await getBarobillConfig(c)
    const bbCards = await getCardList(config)
    const match = bbCards.find((bc: any) => (bc.CardNum || '').slice(-4) === card.card_number_last4)
    if (!match || !match.CardNum) return c.json({ success: false, error: '바로빌에서 카드를 찾을 수 없습니다' }, 404)
    const code = await refreshCard(config, match.CardNum)
    if (code <= 0) return c.json({ success: false, error: '즉시조회 요청 실패: ' + barobillErrorMessage(code) }, 400)
    return c.json({ success: true, message: '바로빌 즉시조회를 요청했습니다. 잠시 후 동기화하세요.' })
  } catch (error: any) {
    console.error('Card refresh error:', error?.message || 'unknown')
    const msg = String(error?.message || '')
    return c.json({ success: false, error: msg.includes('미설정') ? msg : '서버 오류' }, 500)
  }
})

// ===========================================================================
// Phase 1: 경비 분류 CRUD
// ===========================================================================

cardExpRouter.get('/categories', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const ef = entityFilter(c, 'expense_categories')
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM expense_categories WHERE is_active = 1${ef.clause} ORDER BY sort_order`
    ).bind(...ef.params).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

cardExpRouter.post('/categories', requireRole('ADMIN'), async (c) => {
  try {
    const body = await c.req.json()
    const { name, icon, color, sort_order } = body
    if (!name) return c.json({ success: false, error: 'name 필수' }, 400)
    const entityId = getEntityId(c)
    const result = await c.env.DB.prepare(
      'INSERT INTO expense_categories (name, icon, color, sort_order, entity_id) VALUES (?, ?, ?, ?, ?)'
    ).bind(name, icon || 'fa-tag', color || '#6b7280', sort_order || 99, entityId).run()
    return c.json({ success: true, data: { id: result.meta.last_row_id } })
  } catch (error) {
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// ===========================================================================
// Phase 2: 바로빌 카드 내역 동기화
// ===========================================================================

cardExpRouter.post('/sync', requireRole('ADMIN'), async (c) => {
  try {
    const body = await c.req.json().catch(() => ({})) as { date_start?: string; date_end?: string }
    const now = new Date()
    const defaultStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const dateStart = body.date_start?.replace(/-/g, '') || `${defaultStart.getFullYear()}${String(defaultStart.getMonth() + 1).padStart(2, '0')}${String(defaultStart.getDate()).padStart(2, '0')}`
    const dateEnd = body.date_end?.replace(/-/g, '') || now.toISOString().slice(0, 10).replace(/-/g, '')

    // 바로빌 설정
    const testModeRow = await c.env.DB.prepare("SELECT setting_value FROM settings WHERE setting_key = 'barobill_test_mode'").first() as { setting_value: string } | null
    const isTest = testModeRow?.setting_value !== '0'
    const certKey = isTest ? (c.env as any).BAROBILL_CERT_KEY : (c.env as any).BAROBILL_CERT_KEY_PROD
    if (!certKey) return c.json({ success: false, error: 'BAROBILL_CERT_KEY 미설정' }, 400)

    // CorpNum은 법인별 (각 법인 자체 사업자번호 회원사). CERTKEY는 단일 파트너 키.
    const corpNum = await getEntityCorpNum(c.env.DB, getEntityId(c))
    if (!corpNum) return c.json({ success: false, error: '사업자등록번호 미설정 (법인별 corpNum 확인)' }, 400)

    const senderIdRow = await c.env.DB.prepare("SELECT setting_value FROM settings WHERE setting_key = 'barobill_sender_id'").first() as { setting_value: string } | null
    const config = { certKey, corpNum, isTest, senderId: senderIdRow?.setting_value || 'DONGSAN' }
    const entityId = getEntityId(c)

    const { getCardList, getMonthlyCardLog } = await import('../services/barobillCard')
    const cardList = await getCardList(config)

    // 등록된 법인카드와 바로빌 카드 매핑 (뒤 4자리)
    const ef = entityFilter(c, 'corporate_cards')
    const { results: dbCards } = await c.env.DB.prepare(
      `SELECT id, card_number_last4 FROM corporate_cards WHERE is_active = 1${ef.clause}`
    ).bind(...ef.params).all<{ id: number; card_number_last4: string | null }>()

    const cardMap = new Map<string, number>()
    for (const dc of dbCards) {
      if (dc.card_number_last4) cardMap.set(dc.card_number_last4, dc.id)
    }

    // 월 목록 생성
    const months = new Set<string>()
    const cur = new Date(dateStart.slice(0, 4) + '-' + dateStart.slice(4, 6) + '-01')
    const endD = new Date(dateEnd.slice(0, 4) + '-' + dateEnd.slice(4, 6) + '-28')
    while (cur <= endD) {
      months.add(`${cur.getFullYear()}${String(cur.getMonth() + 1).padStart(2, '0')}`)
      cur.setMonth(cur.getMonth() + 1)
    }

    let inserted = 0, skipped = 0

    for (const bbCard of cardList) {
      const cardNum = bbCard.CardNum || ''
      if (!cardNum) continue
      const last4 = cardNum.slice(-4)
      const dbCardId = cardMap.get(last4)
      if (!dbCardId) continue

      for (const month of months) {
        try {
          let page = 1, maxPage = 1
          do {
            const result = await getMonthlyCardLog(config, cardNum, month, page, 100)
            maxPage = result.maxPage
            for (const item of result.items) {
              const refKey = item.ApprovalNum || `${item.UseDT}_${item.ApprovalAmount}_${item.UseStoreName}`
              const dup = await c.env.DB.prepare(
                'SELECT id FROM card_transactions WHERE card_id = ? AND codef_transaction_id = ?'
              ).bind(dbCardId, refKey).first()
              if (dup) { skipped++; continue }

              const txDate = (item.UseDT || '').slice(0, 8)
              if (txDate < dateStart || txDate > dateEnd) continue
              const txTime = (item.UseDT || '').length >= 12 ? `${(item.UseDT || '').slice(8, 10)}:${(item.UseDT || '').slice(10, 12)}:00` : null
              const amount = Math.abs(parseFloat(item.ApprovalAmount || item.TotalAmount || '0'))

              await c.env.DB.prepare(`
                INSERT INTO card_transactions (card_id, transaction_date, transaction_time, merchant_name, amount, supply_amount, tax_amount, approval_number, approval_type, codef_transaction_id, installments, status, entity_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UNCLASSIFIED', ?)
              `).bind(
                dbCardId, txDate, txTime, item.UseStoreName || null, amount,
                parseFloat(item.Amount || '0'), parseFloat(item.Tax || '0'),
                item.ApprovalNum || null, item.ApprovalType === '취소' ? 'CANCEL' : 'APPROVED',
                refKey, parseInt(item.InstallmentMonths || '0') || 1, entityId
              ).run()
              inserted++
            }
            page++
          } while (page <= maxPage)
        } catch (_) { /* skip month */ }
      }
    }

    // 승인↔취소 자동 상계 (신규 건 유무와 무관하게 전체 미상계 대상 → 기존 데이터 백필)
    const offsetPairs = await reconcileCardOffsets(c)

    // 자동 분류 규칙 적용 (상계건 제외)
    if (inserted > 0) {
      const efR = entityFilter(c, 'expense_auto_rules')
      const { results: rules } = await c.env.DB.prepare(
        `SELECT keyword, category_id FROM expense_auto_rules WHERE 1=1${efR.clause}`
      ).bind(...efR.params).all<{ keyword: string; category_id: number }>()

      if (rules.length > 0) {
        const efTx = entityFilter(c, 'card_transactions')
        const { results: unclassified } = await c.env.DB.prepare(
          `SELECT id, merchant_name FROM card_transactions WHERE status = 'UNCLASSIFIED' AND is_offset = 0 AND merchant_name IS NOT NULL${efTx.clause}`
        ).bind(...efTx.params).all<{ id: number; merchant_name: string }>()

        // #178: N+1 → batch 일괄 UPDATE
        const classifyStmts = unclassified
          .map(tx => {
            const matched = rules.find(r => tx.merchant_name.includes(r.keyword))
            if (!matched) return null
            return c.env.DB.prepare("UPDATE card_transactions SET category_id = ?, status = 'CLASSIFIED' WHERE id = ?").bind(matched.category_id, tx.id)
          })
          .filter(Boolean) as any[]
        if (classifyStmts.length > 0) {
          for (let i = 0; i < classifyStmts.length; i += 80) {
            await c.env.DB.batch(classifyStmts.slice(i, i + 80))
          }
        }
      }
    }

    return c.json({ success: true, data: { inserted, skipped, offset_pairs: offsetPairs }, message: `카드 동기화: ${inserted}건 신규, ${skipped}건 중복${offsetPairs ? `, ${offsetPairs}쌍 자동 상계` : ''}` })
  } catch (error) {
    console.error('Card sync error:', error)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// GET /api/card-expenses/transactions
cardExpRouter.get('/transactions', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const q = c.req.query()
    // 프론트는 start_date/end_date를 보냄 — date_start/date_end 별칭도 호환
    const ds = q.start_date || q.date_start
    const de = q.end_date || q.date_end
    const ef = entityFilter(c, 'ct')

    // 삭제(비활성)된 카드의 잔여 내역은 숨김
    let where = `WHERE 1=1${ef.clause} AND EXISTS (SELECT 1 FROM corporate_cards cca WHERE cca.id = ct.card_id AND cca.is_active = 1)`
    const params: (string | number)[] = [...ef.params]
    if (q.id) { where += ' AND ct.id = ?'; params.push(q.id) }
    if (q.card_id) { where += ' AND ct.card_id = ?'; params.push(q.card_id) }
    if (ds) { where += ' AND ct.transaction_date >= ?'; params.push(ds.replace(/-/g, '')) }
    if (de) { where += ' AND ct.transaction_date <= ?'; params.push(de.replace(/-/g, '')) }
    if (q.status) { where += ' AND ct.status = ?'; params.push(q.status) }
    if (q.category_id) { where += ' AND ct.category_id = ?'; params.push(q.category_id) }
    if (q.search) { where += ' AND ct.merchant_name LIKE ?'; params.push('%' + q.search + '%') }

    // 총 건수 (동일 WHERE)
    const countRow = await c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM card_transactions ct ${where}`
    ).bind(...params).first<{ cnt: number }>()
    const total = countRow?.cnt || 0

    const page = Math.max(1, Number(q.page) || 1)
    const limit = Math.min(Math.max(1, Number(q.limit) || 50), 200)
    const offset = (page - 1) * limit

    const { results } = await c.env.DB.prepare(`
      SELECT ct.*, cc.card_name, cc.card_company, cc.card_number_last4,
             cc.holder_name, u.name as assigned_user_name,
             ec.name as category_name, ec.icon as category_icon, ec.color as category_color
      FROM card_transactions ct
      LEFT JOIN corporate_cards cc ON ct.card_id = cc.id
      LEFT JOIN users u ON cc.assigned_user_id = u.id
      LEFT JOIN expense_categories ec ON ct.category_id = ec.id
      ${where}
      ORDER BY ct.transaction_date DESC, ct.transaction_time DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all()

    return c.json({ success: true, data: results, pagination: { total, page, limit } })
  } catch (error) {
    console.error('Get transactions error:', error)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// ===========================================================================
// Phase 3: 영수증 + 적요 + 분류
// ===========================================================================

cardExpRouter.put('/transactions/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const { memo, category_id, status } = body

    const sets: string[] = ['updated_at = CURRENT_TIMESTAMP']
    const params: (string | number | null)[] = []

    if (memo !== undefined) { sets.push('memo = ?'); params.push(memo || null) }
    // 분류-상태 연동: category 설정 시 status를 CLASSIFIED로 보장(미분류/미지정일 때만 승격),
    // category 해제 시 UNCLASSIFIED로 강등. REQUESTED/APPROVED 등 상위 단계는 유지.
    // (행 드롭다운=status 미전송, 편집 모달=status 명시 — 두 경로 모두 정합 보장)
    let finalStatus: string | undefined = status
    if (category_id !== undefined) {
      sets.push('category_id = ?'); params.push(category_id || null)
      if (category_id) {
        if (!finalStatus || finalStatus === 'UNCLASSIFIED') finalStatus = 'CLASSIFIED'
      } else {
        finalStatus = 'UNCLASSIFIED'
      }
    }
    if (finalStatus) { sets.push('status = ?'); params.push(finalStatus) }
    params.push(id)

    const ef = entityFilter(c)
    await c.env.DB.prepare(`UPDATE card_transactions SET ${sets.join(', ')} WHERE id = ?${ef.clause}`).bind(...params, ...ef.params).run()

    // 자동 분류 규칙 학습
    if (category_id) {
      const tx = await c.env.DB.prepare(`SELECT merchant_name FROM card_transactions WHERE id = ?${ef.clause}`).bind(id, ...ef.params).first<{ merchant_name: string | null }>()
      if (tx?.merchant_name) {
        const entityId = getEntityId(c)
        await c.env.DB.prepare(`
          INSERT INTO expense_auto_rules (keyword, category_id, match_count, entity_id) VALUES (?, ?, 1, ?)
          ON CONFLICT(keyword, entity_id) DO UPDATE SET category_id = excluded.category_id, match_count = match_count + 1
        `).bind(tx.merchant_name, category_id, entityId).run()
      }
    }

    return c.json({ success: true, message: '수정 완료' })
  } catch (error) {
    console.error('Update tx error:', error)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// POST /api/card-expenses/transactions/:id/receipt — 영수증 업로드
cardExpRouter.post('/transactions/:id/receipt', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const formData = await c.req.formData()
    const file = formData.get('file') as File | null
    if (!file) return c.json({ success: false, error: '파일 필수' }, 400)

    // #357: 크기·MIME·확장자 검증 (영수증 = 이미지/PDF, 10MB)
    const v = validateUpload(file)
    if (!v.ok) return c.json({ success: false, error: v.error }, 400)
    const ext = v.ext
    const key = `receipts/${new Date().toISOString().slice(0, 10)}/${id}_${Date.now()}.${ext}`
    await (c.env as any).R2_BUCKET.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } })

    const imageUrl = `/api/card-expenses/receipt-image/${key}`
    const ef = entityFilter(c)
    await c.env.DB.prepare(`UPDATE card_transactions SET receipt_image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?${ef.clause}`).bind(imageUrl, id, ...ef.params).run()
    return c.json({ success: true, data: { url: imageUrl }, message: '영수증 업로드 완료' })
  } catch (error) {
    console.error('Receipt upload error:', error)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// GET /api/card-expenses/receipt-image/* — R2 이미지 서빙
cardExpRouter.get('/receipt-image/*', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const key = c.req.path.replace('/api/card-expenses/receipt-image/', '')
    // #357: path traversal 가드
    if (!key || key.includes('..') || key.includes('\\')) return c.json({ success: false, error: '잘못된 경로' }, 400)
    const obj = await (c.env as any).R2_BUCKET.get(key)
    if (!obj) return c.json({ success: false, error: '이미지 없음' }, 404)
    const headers = new Headers()
    headers.set('Content-Type', obj.httpMetadata?.contentType || 'image/jpeg')
    headers.set('Cache-Control', 'public, max-age=86400')
    return new Response(obj.body, { headers })
  } catch (error) {
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// ===========================================================================
// Phase 4: 결제 예정 + 카드↔통장 대사
// ===========================================================================

cardExpRouter.get('/payment-schedule', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const ef = entityFilter(c, 'cc')
    const now = new Date()
    const thisMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`

    const { results } = await c.env.DB.prepare(`
      SELECT
        cc.id as card_id, cc.card_name, cc.card_company, cc.card_number_last4,
        cc.payment_day, cc.monthly_limit, cc.holder_name,
        COUNT(ct.id) as tx_count,
        COALESCE(SUM(CASE WHEN ct.approval_type != 'CANCEL' THEN ct.amount ELSE 0 END), 0) as total_amount,
        COALESCE(SUM(CASE WHEN ct.approval_type = 'CANCEL' THEN ct.amount ELSE 0 END), 0) as cancel_amount
      FROM corporate_cards cc
      LEFT JOIN card_transactions ct ON cc.id = ct.card_id
        AND ct.transaction_date >= ? AND ct.transaction_date <= ?
      WHERE cc.is_active = 1${ef.clause}
      GROUP BY cc.id
      ORDER BY total_amount DESC
    `).bind(thisMonth + '01', thisMonth + '31', ...ef.params).all()

    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const schedule = (results as any[]).map((r: any) => {
      const payDay = r.payment_day || 15
      const nextPayDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), payDay)
      return {
        ...r,
        net_amount: r.total_amount - r.cancel_amount,
        next_payment_date: nextPayDate.toISOString().slice(0, 10),
        limit_usage_pct: r.monthly_limit > 0 ? Math.round(((r.total_amount - r.cancel_amount) / r.monthly_limit) * 100) : null
      }
    })
    const totalNet = schedule.reduce((s: number, r: any) => s + r.net_amount, 0)
    return c.json({ success: true, data: { month: thisMonth, total_payment: totalNet, cards: schedule } })
  } catch (error) {
    console.error('Payment schedule error:', error)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

cardExpRouter.post('/transactions/:id/match-bank', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    const { bank_transaction_id } = await c.req.json()
    if (!bank_transaction_id) return c.json({ success: false, error: 'bank_transaction_id 필수' }, 400)
    const ef = entityFilter(c)
    await c.env.DB.prepare(`UPDATE card_transactions SET matched_bank_tx_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?${ef.clause}`).bind(bank_transaction_id, id, ...ef.params).run()
    return c.json({ success: true, message: '통장 대사 완료' })
  } catch (error) {
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// ===========================================================================
// Phase 5: 통계 + 보고서
// ===========================================================================

cardExpRouter.get('/stats', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const ef = entityFilter(c, 'card_transactions')
    const now = new Date()
    const thisMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`

    const stats = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total_count,
        SUM(CASE WHEN status = 'UNCLASSIFIED' AND is_offset = 0 THEN 1 ELSE 0 END) as unclassified_count,
        SUM(CASE WHEN status = 'CLASSIFIED' AND is_offset = 0 THEN 1 ELSE 0 END) as classified_count,
        SUM(CASE WHEN status = 'APPROVED' AND is_offset = 0 THEN 1 ELSE 0 END) as approved_count,
        COALESCE(SUM(CASE WHEN approval_type != 'CANCEL' AND is_offset = 0 THEN amount ELSE 0 END), 0) as total_amount,
        COALESCE(SUM(CASE WHEN transaction_date >= ? AND approval_type != 'CANCEL' AND is_offset = 0 THEN amount ELSE 0 END), 0) as month_amount
      FROM card_transactions WHERE 1=1${ef.clause}
    `).bind(thisMonth + '01', ...ef.params).first()

    return c.json({ success: true, data: stats })
  } catch (error) {
    console.error('Card stats error:', error)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

cardExpRouter.get('/report', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const { month } = c.req.query()
    if (!month) return c.json({ success: false, error: 'month 필수 (YYYYMM)' }, 400)
    const ef = entityFilter(c, 'ct')
    const dateStart = month + '01', dateEnd = month + '31'

    const { results: byCategory } = await c.env.DB.prepare(`
      SELECT ec.id as category_id, ec.name as category_name, ec.icon, ec.color,
        COUNT(ct.id) as count, COALESCE(SUM(ct.amount), 0) as total
      FROM card_transactions ct
      LEFT JOIN expense_categories ec ON ct.category_id = ec.id
      WHERE ct.transaction_date >= ? AND ct.transaction_date <= ? AND ct.approval_type != 'CANCEL'${ef.clause}
      GROUP BY ec.id ORDER BY total DESC
    `).bind(dateStart, dateEnd, ...ef.params).all()

    const { results: byCard } = await c.env.DB.prepare(`
      SELECT cc.id as card_id, cc.card_name, cc.card_company, cc.card_number_last4,
        COUNT(ct.id) as count, COALESCE(SUM(ct.amount), 0) as total
      FROM card_transactions ct
      LEFT JOIN corporate_cards cc ON ct.card_id = cc.id
      WHERE ct.transaction_date >= ? AND ct.transaction_date <= ? AND ct.approval_type != 'CANCEL'${ef.clause}
      GROUP BY cc.id ORDER BY total DESC
    `).bind(dateStart, dateEnd, ...ef.params).all()

    const grandTotal = (byCategory as any[]).reduce((s: number, r: any) => s + r.total, 0)
    return c.json({ success: true, data: { month, by_category: byCategory, by_card: byCard, grand_total: grandTotal } })
  } catch (error) {
    console.error('Card report error:', error)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// 자동 분류 규칙
cardExpRouter.get('/auto-rules', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const ef = entityFilter(c, 'r')
    const { results } = await c.env.DB.prepare(`
      SELECT r.*, ec.name as category_name FROM expense_auto_rules r
      LEFT JOIN expense_categories ec ON r.category_id = ec.id WHERE 1=1${ef.clause} ORDER BY r.match_count DESC
    `).bind(...ef.params).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

cardExpRouter.delete('/auto-rules/:id', requireRole('ADMIN'), async (c) => {
  try {
    await c.env.DB.prepare('DELETE FROM expense_auto_rules WHERE id = ?').bind(c.req.param('id')).run()
    return c.json({ success: true, message: '규칙 삭제 완료' })
  } catch (error) {
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// ===========================================================================
// 추가 API: summary, bulk-classify, import-csv, transactions POST
// ===========================================================================

// GET /api/card-expenses/transactions/summary
cardExpRouter.get('/transactions/summary', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const ef = entityFilter(c, 'card_transactions')
    const now = new Date()
    const thisMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`

    // is_offset=1(상계됨)은 미분류/대기/승인 카운트·이번달 합계에서 제외
    const summary = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total_count,
        SUM(CASE WHEN status = 'UNCLASSIFIED' AND is_offset = 0 THEN 1 ELSE 0 END) as unclassified_count,
        SUM(CASE WHEN status = 'CLASSIFIED' AND is_offset = 0 THEN 1 ELSE 0 END) as classified_count,
        SUM(CASE WHEN status IN ('REQUESTED','APPROVED') AND is_offset = 0 THEN 1 ELSE 0 END) as approved_count,
        COALESCE(SUM(CASE WHEN transaction_date >= ? AND approval_type != 'CANCEL' AND is_offset = 0 THEN amount ELSE 0 END), 0) as total_amount
      FROM card_transactions WHERE 1=1${ef.clause}
    `).bind(thisMonth + '01', ...ef.params).first()

    return c.json({ success: true, data: { summary } })
  } catch (error) {
    console.error('Summary error:', error)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// POST /api/card-expenses/transactions — 수동 등록
cardExpRouter.post('/transactions', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const body = await c.req.json()
    const { card_id, transaction_date, merchant_name, amount, category_id, memo } = body
    if (!card_id || !transaction_date || !amount) {
      return c.json({ success: false, error: 'card_id, transaction_date, amount 필수' }, 400)
    }
    const user = c.get('user')
    const entityId = getEntityId(c)

    // #176: card_id가 현재 법인 소속인지 검증
    const cardCheck = entityId > 0
      ? await c.env.DB.prepare('SELECT id FROM corporate_cards WHERE id = ? AND entity_id = ? AND is_active = 1').bind(card_id, entityId).first()
      : await c.env.DB.prepare('SELECT id FROM corporate_cards WHERE id = ? AND is_active = 1').bind(card_id).first()
    if (!cardCheck) {
      return c.json({ success: false, error: '해당 법인에 등록된 카드가 아닙니다.' }, 400)
    }

    const status = category_id ? 'CLASSIFIED' : 'UNCLASSIFIED'
    const txDate = transaction_date.replace(/-/g, '')

    const result = await c.env.DB.prepare(`
      INSERT INTO card_transactions (card_id, transaction_date, merchant_name, amount, category_id, memo, status, created_by, entity_id, approval_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED')
    `).bind(card_id, txDate, merchant_name || null, amount, category_id || null, memo || null, status, user?.id ?? 1, entityId).run()

    return c.json({ success: true, data: { id: result.meta.last_row_id }, message: '내역 등록 완료' })
  } catch (error) {
    console.error('Create tx error:', error)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// POST /api/card-expenses/transactions/bulk-classify — 일괄 분류
cardExpRouter.post('/transactions/bulk-classify', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const { ids, category_id } = await c.req.json()
    if (!Array.isArray(ids) || !ids.length || !category_id) {
      return c.json({ success: false, error: 'ids, category_id 필수' }, 400)
    }
    const ph = ids.map(() => '?').join(', ')
    const ef = entityFilter(c)
    // 상계건(is_offset=1)은 분류 대상 제외
    await c.env.DB.prepare(
      `UPDATE card_transactions SET category_id = ?, status = 'CLASSIFIED', updated_at = CURRENT_TIMESTAMP WHERE id IN (${ph}) AND is_offset = 0${ef.clause}`
    ).bind(category_id, ...ids, ...ef.params).run()
    return c.json({ success: true, data: { classified: ids.length }, message: `${ids.length}건 분류 완료` })
  } catch (error) {
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// POST /api/card-expenses/transactions/import-csv — CSV 가져오기
cardExpRouter.post('/transactions/import-csv', requireRole('ADMIN'), async (c) => {
  try {
    const { card_id, rows } = await c.req.json()
    if (!card_id || !Array.isArray(rows)) {
      return c.json({ success: false, error: 'card_id, rows 필수' }, 400)
    }
    const entityId = getEntityId(c)
    const user = c.get('user')
    let imported = 0

    for (const row of rows) {
      const txDate = (row.date || '').replace(/-/g, '')
      if (!txDate || txDate.length !== 8) continue
      const amount = Math.abs(parseFloat(row.amount || '0'))
      if (!amount) continue

      const refKey = `csv_${txDate}_${amount}_${row.merchant || ''}`
      const dup = await c.env.DB.prepare(
        'SELECT id FROM card_transactions WHERE card_id = ? AND codef_transaction_id = ?'
      ).bind(card_id, refKey).first()
      if (dup) continue

      await c.env.DB.prepare(`
        INSERT INTO card_transactions (card_id, transaction_date, transaction_time, merchant_name, amount, installments, codef_transaction_id, status, created_by, entity_id, approval_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'UNCLASSIFIED', ?, ?, 'APPROVED')
      `).bind(
        card_id, txDate, row.time || null, row.merchant || null,
        amount, parseInt(row.installments || '1') || 1,
        refKey, user?.id ?? 1, entityId
      ).run()
      imported++
    }

    return c.json({ success: true, data: { imported, total: rows.length }, message: `${imported}건 가져오기 완료` })
  } catch (error) {
    console.error('CSV import error:', error)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// POST /api/card-expenses/transactions/create-requests — 일괄 결의 생성
cardExpRouter.post('/transactions/create-requests', requireRole('ADMIN'), async (c) => {
  try {
    const { ids } = await c.req.json()
    if (!Array.isArray(ids) || !ids.length) {
      return c.json({ success: false, error: 'ids 필수' }, 400)
    }
    const ph = ids.map(() => '?').join(', ')
    const ef = entityFilter(c)
    // 상계건(is_offset=1)은 결의 대상 제외
    await c.env.DB.prepare(
      `UPDATE card_transactions SET status = 'REQUESTED', updated_at = CURRENT_TIMESTAMP WHERE id IN (${ph}) AND status = 'CLASSIFIED' AND is_offset = 0${ef.clause}`
    ).bind(...ids, ...ef.params).run()
    return c.json({ success: true, data: { created: ids.length }, message: `${ids.length}건 결의 요청 완료` })
  } catch (error) {
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// PUT /api/card-expenses/categories/:id
cardExpRouter.put('/categories/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    const { name, icon, color } = await c.req.json()
    const entityId = getEntityId(c)
    await c.env.DB.prepare(
      `UPDATE expense_categories SET name = COALESCE(?, name), icon = COALESCE(?, icon), color = COALESCE(?, color) WHERE id = ?${entityId > 0 ? ' AND entity_id = ?' : ''}`
    ).bind(name || null, icon || null, color || null, id, ...(entityId > 0 ? [entityId] : [])).run()
    return c.json({ success: true, message: '분류 수정 완료' })
  } catch (error) {
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// DELETE /api/card-expenses/categories/:id
cardExpRouter.delete('/categories/:id', requireRole('ADMIN'), async (c) => {
  try {
    const entityId = getEntityId(c)
    await c.env.DB.prepare(
      `UPDATE expense_categories SET is_active = 0 WHERE id = ?${entityId > 0 ? ' AND entity_id = ?' : ''}`
    ).bind(c.req.param('id'), ...(entityId > 0 ? [entityId] : [])).run()
    return c.json({ success: true, message: '분류 삭제 완료' })
  } catch (error) {
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

export default cardExpRouter
