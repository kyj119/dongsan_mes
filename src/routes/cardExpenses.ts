// ============================================================================
// 법인카드 관리 API
// Phase 1~5: 카드 등록, 거래 수집, 영수증, 결제예정, 보고서
// ============================================================================

import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { entityFilter, getEntityId } from '../utils/entityFilter'
import { getEntityCorpNum, getEntityBarobillSenderId } from '../utils/entitySettings'
import { validateUpload } from '../utils/uploadValidation'
import { generateCsv, csvResponse, CSV_EXPORT_CAP, CSV_TRUNCATION_NOTE } from '../utils/csv'

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
  // senderId는 법인별(entity_settings) — corpNum과 짝 맞춤 필수. 선명=sunm2596.
  const senderId = await getEntityBarobillSenderId(c.env.DB, getEntityId(c))
  return { certKey, corpNum, isTest, senderId }
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
  // H6: 무날짜 전건 스캔 방지 — 최근 90일로 하한. 신규 취소는 항상 원거래 ±30일 이내이므로
  //     양쪽(취소·승인)을 90일로 좁혀도 매칭 손실 없음(판정 로직 자체는 불변).
  const OFFSET_LOOKBACK_DAYS = 90
  const since = new Date(Date.now() + 9 * 3600000 - OFFSET_LOOKBACK_DAYS * 86400000)
  const sinceYmd = `${since.getUTCFullYear()}${String(since.getUTCMonth() + 1).padStart(2, '0')}${String(since.getUTCDate()).padStart(2, '0')}`
  const ef = entityFilter(c, 'card_transactions')
  const { results } = await c.env.DB.prepare(
    `SELECT id, card_id, transaction_date, merchant_name, amount, approval_type
     FROM card_transactions
     WHERE is_offset = 0 AND merchant_name IS NOT NULL AND merchant_name != '' AND transaction_date >= ?${ef.clause}`
  ).bind(sinceYmd, ...ef.params).all()

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
        (SELECT COUNT(*) FROM card_transactions ct WHERE ct.card_id = cc.id AND ct.is_offset = 0 AND ct.transaction_date >= ? AND ct.transaction_date <= ?) as tx_count,
        (SELECT COALESCE(SUM(CASE WHEN ct2.approval_type != 'CANCEL' THEN ct2.amount ELSE -ct2.amount END), 0) FROM card_transactions ct2 WHERE ct2.card_id = cc.id AND ct2.is_offset = 0 AND ct2.transaction_date >= ? AND ct2.transaction_date <= ?) as month_total
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

    // senderId는 법인별(entity_settings) — corpNum과 짝 맞춤 필수. 불일치 시 바로빌 -24005로 0건 수집.
    const senderId = await getEntityBarobillSenderId(c.env.DB, getEntityId(c))
    const config = { certKey, corpNum, isTest, senderId }
    const entityId = getEntityId(c)

    const { getCardList, getMonthlyCardLog, getDailyCardLog } = await import('../services/barobillCard')
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

    // 월 목록(과거 bulk — 효율) 생성
    const months = new Set<string>()
    const cur = new Date(dateStart.slice(0, 4) + '-' + dateStart.slice(4, 6) + '-01')
    const endD = new Date(dateEnd.slice(0, 4) + '-' + dateEnd.slice(4, 6) + '-28')
    while (cur <= endD) {
      months.add(`${cur.getFullYear()}${String(cur.getMonth() + 1).padStart(2, '0')}`)
      cur.setMonth(cur.getMonth() + 1)
    }
    // 최근 41일 일자 목록(마감 후 tail — 정확 수집)
    //   ⚠️ 월별 API(GetMonthlyCardApprovalLog BaseMonth)는 카드 마감일(예 23일) 청구주기 statement로 묶여,
    //   마감 이후 사용분이 미마감 차기 statement에 속해 월별 조회로는 누락됨(실측: prod 6/24~ 0건).
    //   일별 API(GetDailyCardApprovalLog BaseDate)는 특정일 직접 조회라 청구주기 무관 → 최근 구간을 보완 수집.
    //   bulk는 월별로 받고, 최근 41일만 일별로 덧칠(dedup으로 중복 무시) → 호출량 bound(타임아웃 회피).
    const tailDays: string[] = []
    {
      const edMs = Date.UTC(+dateEnd.slice(0, 4), +dateEnd.slice(4, 6) - 1, +(dateEnd.slice(6, 8) || '1'))
      const sdMs = Date.UTC(+dateStart.slice(0, 4), +dateStart.slice(4, 6) - 1, +(dateStart.slice(6, 8) || '1'))
      const startMs = Math.max(edMs - 40 * 86400000, sdMs)
      for (let t = startMs; t <= edMs; t += 86400000) {
        const d = new Date(t)
        tailDays.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`)
      }
    }

    let inserted = 0, skipped = 0
    // 진단/관측: 바로빌 SOAP 호출 결과를 집계(과거 catch(_){}가 에러를 통째로 삼켜 원인 불명이던 문제 해소)
    const syncErrors: string[] = []
    let monthlyFetched = 0, dailyFetched = 0, monthlyCalls = 0, dailyCalls = 0
    const dateSeen = new Set<string>()

    // 단건 처리(dedup + 범위필터 + INSERT) — 월별/일별 양 경로 공용
    const processItems = async (items: any[], dbCardId: number) => {
      for (const item of items) {
        if (item.UseDT) dateSeen.add(String(item.UseDT).slice(0, 8))  // 진단: 바로빌이 실제 반환한 사용일
        // 취소 판정: ApprovalType '취소' 또는 음수 승인금액(변형 문자열·부분취소 대비).
        const isCancel = item.ApprovalType === '취소' || parseFloat(item.ApprovalAmount || '0') < 0
        // dedup 키: 승인은 승인번호 그대로(기존 행 호환), 취소는 'C:' 네임스페이스로 분리.
        //   ⚠️ 가승인(pre-auth)·취소가 원거래와 같은 승인번호를 재사용하면 같은 키로 충돌 → 취소가 중복으로 스킵되던 버그.
        //   (예: 카카오T 가승인 39071162 — 가승인 INSERT 후 동일번호 취소 유실). 취소를 별도 네임스페이스로 두어 승인/취소 공존.
        //   기존 취소 행은 마이그 0412에서 'C:' 백필 → 재동기화 중복 방지.
        const baseKey = item.ApprovalNum || `${item.UseDT}_${item.ApprovalAmount}_${item.UseStoreName}`
        const refKey = isCancel ? `C:${baseKey}` : baseKey
        const dup = await c.env.DB.prepare(
          'SELECT id FROM card_transactions WHERE card_id = ? AND codef_transaction_id = ?'
        ).bind(dbCardId, refKey).first()
        if (dup) { skipped++; continue }

        const txDate = (item.UseDT || '').slice(0, 8)
        if (txDate < dateStart || txDate > dateEnd) continue
        const txTime = (item.UseDT || '').length >= 12 ? `${(item.UseDT || '').slice(8, 10)}:${(item.UseDT || '').slice(10, 12)}:00` : null
        const amount = Math.abs(parseFloat(item.ApprovalAmount || item.TotalAmount || '0'))
        // 가승인(pre-auth)은 임시 홀드일 뿐 실지출 아님(실청구는 별도 거래로 옴). 비용·미분류에서 제외.
        //   is_offset 의미를 "순비용에서 제외"로 확장(상계 OR 가승인). 단독 가승인=offset_pair_id NULL로 진짜 상계와 구분.
        //   기존 모든 합계/미분류 쿼리가 is_offset=0만 집계하므로 쿼리 수정 없이 자동 제외됨. (마이그 0416 백필)
        const isPreauth = (item.UseStoreName || '').includes('가승인')

        await c.env.DB.prepare(`
          INSERT INTO card_transactions (card_id, transaction_date, transaction_time, merchant_name, amount, supply_amount, tax_amount, approval_number, approval_type, codef_transaction_id, installments, status, entity_id, is_offset)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UNCLASSIFIED', ?, ?)
        `).bind(
          dbCardId, txDate, txTime, item.UseStoreName || null, amount,
          parseFloat(item.Amount || '0'), parseFloat(item.Tax || '0'),
          item.ApprovalNum || null, isCancel ? 'CANCEL' : 'APPROVED',
          refKey, parseInt(item.InstallmentMonths || '0') || 1, entityId, isPreauth ? 1 : 0
        ).run()
        inserted++
      }
    }

    for (const bbCard of cardList) {
      const cardNum = bbCard.CardNum || ''
      if (!cardNum) continue
      const last4 = cardNum.slice(-4)
      const dbCardId = cardMap.get(last4)
      if (!dbCardId) continue

      // 1) 월별(bulk)
      for (const month of months) {
        try {
          let page = 1, maxPage = 1
          do {
            monthlyCalls++
            const result = await getMonthlyCardLog(config, cardNum, month, page, 100)
            maxPage = result.maxPage
            monthlyFetched += (result.items || []).length
            await processItems(result.items, dbCardId)
            page++
          } while (page <= maxPage)
        } catch (e: any) { const m = `monthly ${month}/${last4}: ${String(e?.message || e).slice(0, 160)}`; console.error('[card-sync]', m); if (syncErrors.length < 30) syncErrors.push(m) }
      }
      // 2) 최근 41일 일별(마감 후 누락분 보완)
      for (const day of tailDays) {
        try {
          let page = 1, maxPage = 1
          do {
            dailyCalls++
            const result = await getDailyCardLog(config, cardNum, day, page, 100)
            maxPage = result.maxPage
            dailyFetched += (result.items || []).length
            await processItems(result.items, dbCardId)
            page++
          } while (page <= maxPage)
        } catch (e: any) { const m = `daily ${day}/${last4}: ${String(e?.message || e).slice(0, 160)}`; console.error('[card-sync]', m); if (syncErrors.length < 30) syncErrors.push(m) }
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

    const diag = {
      cardListCount: cardList.length,
      mappedCards: (cardList as any[]).map((cd) => (cd.CardNum || '').slice(-4)).filter((l4) => cardMap.has(l4)),
      monthlyCalls, monthlyFetched, dailyCalls, dailyFetched,
      datesReturned: [...dateSeen].sort(),
      errors: syncErrors,
    }
    return c.json({ success: true, data: { inserted, skipped, offset_pairs: offsetPairs, diag }, message: `카드 동기화: ${inserted}건 신규, ${skipped}건 중복${offsetPairs ? `, ${offsetPairs}쌍 자동 상계` : ''}` })
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
    // 미분류 탭 정리: 상계됨(순액0)·취소(비용분류 대상 아님)는 제외 가능 (프론트 미분류 탭이 전달). 전체 탭은 미전달=모두 표시.
    if (q.exclude_offset === '1') where += ' AND ct.is_offset = 0'
    if (q.exclude_cancel === '1') where += " AND ct.approval_type != 'CANCEL'"

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
    // 월별 폴더 정리(receipts/YYYY-MM/) — 세무 보관·조회 편의
    const key = `receipts/${new Date().toISOString().slice(0, 7)}/${id}_${Date.now()}.${ext}`
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
    // #442: R2 키 직접 서빙 IDOR 차단 — 호출자 법인이 소유한 card_transactions 행에
    //   실제 연결된 키만 서빙(키 추측으로 타법인 영수증 금융PII read 차단). ADMIN 전체모드는 ef.clause=''.
    const ef = entityFilter(c)
    const owns = await c.env.DB.prepare(
      `SELECT 1 FROM card_transactions WHERE receipt_image_url = ?${ef.clause} LIMIT 1`
    ).bind(`/api/card-expenses/receipt-image/${key}`, ...ef.params).first()
    if (!owns) return c.json({ success: false, error: '이미지 없음' }, 404)
    const obj = await (c.env as any).R2_BUCKET.get(key)
    if (!obj) return c.json({ success: false, error: '이미지 없음' }, 404)
    const headers = new Headers()
    headers.set('Content-Type', obj.httpMetadata?.contentType || 'image/jpeg')
    headers.set('Cache-Control', 'private, max-age=86400')
    return new Response(obj.body, { headers })
  } catch (error) {
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// ===========================================================================
// Phase 4: 결제 예정 + 카드↔통장 대사
// ===========================================================================

// 결제 예정 = 카드별 "현재 진행 중 청구 사이클"(직전 마감+1 ~ 다음 마감) 누적 사용액(net) + 그 사이클의 결제 예정일.
// 사이클 규칙은 자금예측(cashflowEngine)과 동일: payment_day > cutoff_day면 동월결제, else 익월결제.
// "이번달 사용요금"(거래월 단순합)을 폐기하고 결제일 기준으로 일원화.
cardExpRouter.get('/payment-schedule', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const ef = entityFilter(c, 'cc')
    const { results: cards } = await c.env.DB.prepare(`
      SELECT cc.id as card_id, cc.card_name, cc.card_company, cc.card_number_last4, cc.holder_name,
             cc.monthly_limit, COALESCE(cc.cutoff_day, 15) as cutoff_day, COALESCE(cc.payment_day, 15) as payment_day
      FROM corporate_cards cc WHERE cc.is_active = 1${ef.clause}
      ORDER BY cc.card_name
    `).bind(...ef.params).all<{ card_id: number; card_name: string; card_company: string; card_number_last4: string | null; holder_name: string | null; monthly_limit: number; cutoff_day: number; payment_day: number }>()

    // 오늘(KST) Y/M/D
    const todayRow = await c.env.DB.prepare(
      `SELECT CAST(strftime('%Y','now','+9 hours') AS INTEGER) y, CAST(strftime('%m','now','+9 hours') AS INTEGER) m, CAST(strftime('%d','now','+9 hours') AS INTEGER) d`
    ).first<{ y: number; m: number; d: number }>()
    const ty = todayRow?.y || new Date().getFullYear()
    const tm = todayRow?.m || new Date().getMonth() + 1
    const td = todayRow?.d || new Date().getDate()

    const pad2 = (n: number) => String(n).padStart(2, '0')
    const lastDayOf = (y: number, m1: number) => new Date(y, m1, 0).getDate()        // m1 = 1-indexed
    const clampDay = (y: number, m1: number, day: number) => Math.min(day, lastDayOf(y, m1))
    const ymd = (y: number, m1: number, d: number) => `${y}${pad2(m1)}${pad2(d)}`
    const prevMonth = (y: number, m1: number) => (m1 === 1 ? { y: y - 1, m: 12 } : { y, m: m1 - 1 })
    const nextMonth = (y: number, m1: number) => (m1 === 12 ? { y: y + 1, m: 1 } : { y, m: m1 + 1 })

    const schedule: any[] = []
    for (const card of cards as any[]) {
      const cutoff = card.cutoff_day, payment = card.payment_day

      // 현재 진행 사이클의 마감(close) 월 = 오늘이 이번달 마감일 이후면 다음달, 아니면 이번달
      const cutoffThisMonth = clampDay(ty, tm, cutoff)
      const close = td <= cutoffThisMonth ? { y: ty, m: tm } : nextMonth(ty, tm)
      const cycleEndDay = clampDay(close.y, close.m, cutoff)
      const cycleEnd = ymd(close.y, close.m, cycleEndDay)

      // 사이클 시작 = 직전월 마감 + 1일
      const pm = prevMonth(close.y, close.m)
      const prevCutoffDay = clampDay(pm.y, pm.m, cutoff)
      const csDate = new Date(pm.y, pm.m - 1, prevCutoffDay)
      csDate.setDate(csDate.getDate() + 1)
      const cycleStart = ymd(csDate.getFullYear(), csDate.getMonth() + 1, csDate.getDate())

      // 결제 예정일: 동월결제(payment > cutoff)면 마감월, else 익월
      const pay = payment > cutoff ? close : nextMonth(close.y, close.m)
      const payDay = clampDay(pay.y, pay.m, payment)
      const paymentDate = `${pay.y}-${pad2(pay.m)}-${pad2(payDay)}`

      // 해당 사이클 누적 사용액(net = 승인 - 취소, 상계건 제외)
      const efTx = entityFilter(c, 'ct')
      const agg = await c.env.DB.prepare(`
        SELECT COUNT(*) as tx_count,
               COALESCE(SUM(CASE WHEN approval_type != 'CANCEL' THEN amount ELSE -amount END), 0) as net_amount
        FROM card_transactions ct
        WHERE ct.card_id = ? AND ct.is_offset = 0 AND ct.transaction_date >= ? AND ct.transaction_date <= ?${efTx.clause}
      `).bind(card.card_id, cycleStart, cycleEnd, ...efTx.params).first<{ tx_count: number; net_amount: number }>()

      const net = agg?.net_amount || 0
      schedule.push({
        card_id: card.card_id, card_name: card.card_name, card_company: card.card_company,
        card_number_last4: card.card_number_last4, holder_name: card.holder_name,
        monthly_limit: card.monthly_limit, payment_day: card.payment_day, cutoff_day: card.cutoff_day,
        cycle_start: cycleStart, cycle_end: cycleEnd, payment_date: paymentDate,
        net_amount: net, tx_count: agg?.tx_count || 0,
        limit_usage_pct: card.monthly_limit > 0 ? Math.round((net / card.monthly_limit) * 100) : null,
      })
    }

    const totalNet = schedule.reduce((s, r) => s + r.net_amount, 0)
    const nextPay = schedule.map(r => r.payment_date).sort()[0] || '-'
    return c.json({ success: true, data: { total_payment: totalNet, next_payment_date: nextPay, cards: schedule } })
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
        SUM(CASE WHEN status = 'UNCLASSIFIED' AND is_offset = 0 AND approval_type != 'CANCEL' THEN 1 ELSE 0 END) as unclassified_count,
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

// GET /api/card-expenses/export-csv?start=&end= — 세무사 전달용 카드 사용내역 CSV
// 전체 건 포함(구분=승인/취소/상계), 금액은 취소 시 음수. 영수증 첨부여부·URL 컬럼 포함.
cardExpRouter.get('/export-csv', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const q = c.req.query()
    const ds = (q.start || q.date_start || '').replace(/-/g, '')
    const de = (q.end || q.date_end || '').replace(/-/g, '')
    if (!ds || !de) return c.json({ success: false, error: 'start, end 필수 (YYYY-MM-DD)' }, 400)
    const ef = entityFilter(c, 'ct')

    const { results } = await c.env.DB.prepare(`
      SELECT ct.transaction_date, ct.transaction_time, ct.merchant_name, ct.amount,
             ct.supply_amount, ct.tax_amount, ct.approval_number, ct.approval_type, ct.is_offset,
             ct.memo, ct.status, ct.receipt_image_url,
             cc.card_name, cc.card_number_last4, ec.name as category_name
      FROM card_transactions ct
      LEFT JOIN corporate_cards cc ON ct.card_id = cc.id
      LEFT JOIN expense_categories ec ON ct.category_id = ec.id
      WHERE ct.transaction_date >= ? AND ct.transaction_date <= ?${ef.clause}
      ORDER BY ct.transaction_date ASC, ct.transaction_time ASC
      LIMIT ?
    `).bind(ds, de, ...ef.params, CSV_EXPORT_CAP + 1).all<any>()

    const rows = results as any[]
    const truncated = rows.length > CSV_EXPORT_CAP
    const data = truncated ? rows.slice(0, CSV_EXPORT_CAP) : rows

    const fmtDate = (s: string) => (s && s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : (s || ''))
    const origin = new URL(c.req.url).origin
    const statusLabel: Record<string, string> = { UNCLASSIFIED: '미분류', CLASSIFIED: '분류완료', REQUESTED: '결의요청', APPROVED: '승인완료' }

    const headers = ['사용일', '카드', '카드번호', '가맹점', '공급가액', '부가세', '금액', '구분', '경비분류', '적요', '승인번호', '영수증', '영수증링크']
    const csvRows = data.map((r) => {
      const sign = r.approval_type === 'CANCEL' ? -1 : 1
      const kind = r.is_offset ? (String(r.merchant_name || '').includes('가승인') ? '가승인' : '상계') : (r.approval_type === 'CANCEL' ? '취소' : '승인')
      return [
        fmtDate(String(r.transaction_date)),
        r.card_name || '',
        r.card_number_last4 || '',
        r.merchant_name || '',
        Math.round((r.supply_amount || 0) * sign),
        Math.round((r.tax_amount || 0) * sign),
        Math.round((r.amount || 0) * sign),
        kind,
        r.category_name || '',
        r.memo || '',
        r.approval_number || '',
        r.receipt_image_url ? 'O' : 'X',
        r.receipt_image_url ? origin + r.receipt_image_url : '',
      ]
    })

    const csv = generateCsv(headers, csvRows, truncated ? { footerNote: CSV_TRUNCATION_NOTE } : undefined)
    return csvResponse(c, `card-expenses_${ds}_${de}.csv`, csv)
  } catch (error) {
    console.error('Card export-csv error:', error)
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
      WHERE ct.transaction_date >= ? AND ct.transaction_date <= ? AND ct.is_offset = 0 AND ct.approval_type != 'CANCEL'${ef.clause}
      GROUP BY ec.id ORDER BY total DESC
    `).bind(dateStart, dateEnd, ...ef.params).all()

    const { results: byCard } = await c.env.DB.prepare(`
      SELECT cc.id as card_id, cc.card_name, cc.card_company, cc.card_number_last4,
        COUNT(ct.id) as count, COALESCE(SUM(ct.amount), 0) as total
      FROM card_transactions ct
      LEFT JOIN corporate_cards cc ON ct.card_id = cc.id
      WHERE ct.transaction_date >= ? AND ct.transaction_date <= ? AND ct.is_offset = 0 AND ct.approval_type != 'CANCEL'${ef.clause}
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
        SUM(CASE WHEN status = 'UNCLASSIFIED' AND is_offset = 0 AND approval_type != 'CANCEL' THEN 1 ELSE 0 END) as unclassified_count,
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
    const ef = entityFilter(c)
    // 상계건(is_offset=1)은 분류 대상 제외. D1 바인드 한도 → 80청크 분할(#409)
    for (let i = 0; i < ids.length; i += 80) {
      const chunk = ids.slice(i, i + 80)
      const ph = chunk.map(() => '?').join(', ')
      await c.env.DB.prepare(
        `UPDATE card_transactions SET category_id = ?, status = 'CLASSIFIED', updated_at = CURRENT_TIMESTAMP WHERE id IN (${ph}) AND is_offset = 0${ef.clause}`
      ).bind(category_id, ...chunk, ...ef.params).run()
    }
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

    // #485: card_id가 현재 법인 소속인지 검증 (단건 등록과 동일 규칙, IDOR 방지)
    const cardCheck = entityId > 0
      ? await c.env.DB.prepare('SELECT id FROM corporate_cards WHERE id = ? AND entity_id = ? AND is_active = 1').bind(card_id, entityId).first()
      : await c.env.DB.prepare('SELECT id FROM corporate_cards WHERE id = ? AND is_active = 1').bind(card_id).first()
    if (!cardCheck) {
      return c.json({ success: false, error: '해당 법인에 등록된 카드가 아닙니다.' }, 400)
    }

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
    const ef = entityFilter(c)
    // 상계건(is_offset=1)은 결의 대상 제외. D1 바인드 한도 → 80청크 분할(#409)
    for (let i = 0; i < ids.length; i += 80) {
      const chunk = ids.slice(i, i + 80)
      const ph = chunk.map(() => '?').join(', ')
      await c.env.DB.prepare(
        `UPDATE card_transactions SET status = 'REQUESTED', updated_at = CURRENT_TIMESTAMP WHERE id IN (${ph}) AND status = 'CLASSIFIED' AND is_offset = 0${ef.clause}`
      ).bind(...chunk, ...ef.params).run()
    }
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
