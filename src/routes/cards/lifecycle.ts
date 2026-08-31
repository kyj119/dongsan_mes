/**
 * cards/lifecycle.ts — 카드 상태 전환 + 출고 + 불량 + 카드 생성 (14 라우트)
 * Phase 3.1.A 분할: 2026-05-09
 *   - PATCH /bulk/status, /:id/status, /:id/pp-complete, /bulk/pp-complete
 *   - POST /bulk-ship, /:id/ship, /:id/defects
 *   - PATCH /:id/ship, /:id/unship, /:id/complete, /:id/revert
 *   - PATCH /defects/:defectId, /:cardId/items/:itemId/print-toggle
 *   - POST /generate/:orderId
 *
 * 내부 헬퍼: syncOrderStatusFromCards (cards.ts의 카드 상태 → 주문 상태 동기화)
 */
import { Hono } from 'hono'
import type { Context } from 'hono'
import type { HonoEnv } from '../../types/env'
import { kstYmdCompact } from '../../utils/kstDate'
import { authMiddleware, requireRole } from '../../middleware/auth'
import { requireAnyPagePermission, requireEditOrRole } from '../../middleware/permissions'
import { logActivity } from '../../utils/activityLog'
import { entityFilter, getEntityId } from '../../utils/entityFilter'
import { ensureShipmentForOrder } from '../../utils/shipmentHelper'
import { deductStockLinesOnShip, restoreStockLinesOnUnship } from '../../utils/stockShip'
import { restoreAutoDeductionsByCards } from '../../utils/autoDeductRestore'

const cardsLifecycleRouter = new Hono<HonoEnv>()
cardsLifecycleRouter.use('/*', authMiddleware, requireAnyPagePermission('/cards', '/orders'))

// #432: cards 테이블엔 entity_id 컬럼이 없음 → 소유 법인은 order_id→orders.entity_id로 격리.
// (cards/scheduling.ts cardEntityScope 패턴과 동일. JOIN 없이 WHERE id=? 뒤에 append.)
// entityId=0(ADMIN 전체모드)·X-Agent-Key(전체모드)는 빈 절 → 자동화/관리자 기존 동작 유지,
// 비전체모드(법인 사용자)만 자기 법인 주문의 카드로 제한. 실 생산 상태는 에이전트(전체모드)가 갱신.
function cardEntityScope(c: Context<HonoEnv>): { clause: string; params: number[] } {
  const entityId = getEntityId(c)
  if (entityId === 0) return { clause: '', params: [] }
  return { clause: ' AND order_id IN (SELECT id FROM orders WHERE entity_id = ?)', params: [entityId] }
}

/**
 * 「체크리스트 전 공정 완료 && 출력중」 → 출력완료 자동 전이. **불변식 정의는 여기 한 곳.**
 *
 * ⚠️ 체크 토글에서만 평가하면 구멍이 난다 — 출력대기 카드에 전 스텝을 먼저 체크해 두면
 *    그 뒤 출력중으로 올려도 전이가 **영영 오지 않는다**(체크를 풀었다 다시 걸어야만 동작).
 *    그래서 상태 변경 직후에도 같은 불변식을 다시 본다.
 * ⚠️ card_items.print_completed 를 함께 세팅한다 — PATCH /:id/complete 와 맞추지 않으면
 *    카드는 '출력완료'인데 같은 화면 생산현황이 0/N 0% 로 남아 진행률 두 개가 서로 어긋난다.
 * 반환 = 이번 호출로 실제 전이가 일어났는지.
 */
async function maybeAutoCompleteCard(db: D1Database, cardId: number, userId: number | null): Promise<boolean> {
  const card = await db.prepare(
    `SELECT id, status, order_id, post_processing FROM cards WHERE id = ?`
  ).bind(cardId).first<{ id: number; status: string; order_id: number; post_processing: string | null }>()
  if (!card || card.status !== 'PRINTING') return false

  const agg = await db.prepare(
    `SELECT COUNT(*) as total, SUM(CASE WHEN checked_at IS NOT NULL THEN 1 ELSE 0 END) as done
     FROM card_checklist_items WHERE card_id = ?`
  ).bind(cardId).first<{ total: number; done: number }>()
  if (!agg || !agg.total || agg.done !== agg.total) return false

  // 체크리스트가 후가공 스텝을 포함하므로 전체 완료 = 후가공도 완료 → pp_status DONE
  const hasPP = card.post_processing && card.post_processing !== '[]' && card.post_processing !== ''
  const tr = await db.prepare(`
    UPDATE cards SET status = 'PRINT_DONE', pp_status = ?,${hasPP ? ' pp_completed_at = CURRENT_TIMESTAMP,' : ''}
      print_done_at = CURRENT_TIMESTAMP, hold_reason = NULL, hold_at = NULL, hold_by = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'PRINTING'
  `).bind(hasPP ? 'DONE' : 'N/A', cardId).run()
  if (!tr.meta.changes) return false

  await db.prepare(
    `UPDATE card_items SET print_completed = 1, print_completed_at = CURRENT_TIMESTAMP, print_completed_by = ?
     WHERE card_id = ? AND print_completed = 0`
  ).bind(userId, cardId).run()
  await db.prepare(`
    INSERT INTO card_status_history (card_id, from_status, to_status, changed_by, change_reason)
    VALUES (?, 'PRINTING', 'PRINT_DONE', ?, '체크리스트 전체 완료 자동 전이')
  `).bind(cardId, userId).run()
  await syncOrderStatusFromCards(db, card.order_id)
  return true
}

async function syncOrderStatusFromCards(db: D1Database, orderId: number) {
  // Option B: 단일 SELECT로 카드+주문 상태를 원자적 스냅샷으로 조회
  const snapshot = await db.prepare(`
    SELECT
      o.status as order_status,
      COUNT(c.id) as card_count,
      SUM(CASE WHEN c.status = 'HOLD' THEN 1 ELSE 0 END) as hold_count,
      SUM(CASE WHEN c.status = 'PRINT_DONE' THEN 1 ELSE 0 END) as done_count,
      SUM(CASE WHEN c.status = 'PRINTING' THEN 1 ELSE 0 END) as printing_count
    FROM orders o
    LEFT JOIN cards c ON c.order_id = o.id AND c.status != 'CANCELLED'
    WHERE o.id = ?
    GROUP BY o.id
  `).bind(orderId).first<{
    order_status: string
    card_count: number
    hold_count: number
    done_count: number
    printing_count: number
  }>()

  if (!snapshot || snapshot.card_count === 0) return

  // 제작 라인 readiness 전파: PRINT_DONE 카드에 연결된 order_item을 shipment_ready=1로
  // (기성/유통 라인은 생성 시 이미 1 → 이로써 출고/완료 게이트가 라인 단위로 통일됨)
  await db.prepare(`
    UPDATE order_items SET shipment_ready = 1
    WHERE order_id = ?
      AND COALESCE(shipment_ready, 0) = 0
      AND id IN (SELECT ci.order_item_id FROM card_items ci JOIN cards c ON c.id = ci.card_id WHERE c.order_id = ? AND c.status = 'PRINT_DONE')
  `).bind(orderId, orderId).run()

  const skipStatuses = ['SHIPPED', 'CANCELLED', 'HOLD']
  if (skipStatuses.includes(snapshot.order_status)) return

  // 카드 상태 집계 → 주문 상태 결정
  let newStatus: string | null = null
  if (snapshot.hold_count === 0 && snapshot.done_count === snapshot.card_count) {
    // 모든 카드가 PRINT_DONE (HOLD 없음)
    newStatus = 'PRINT_DONE'
  } else if (snapshot.hold_count === snapshot.card_count) {
    // #100: 모든 카드가 HOLD → 주문도 HOLD 반영
    newStatus = 'HOLD'
  } else if (snapshot.printing_count > 0) {
    // CONFIRMED에서 카드 생성 직후(아직 실제 출력 안 한 상태) → CONFIRMED 유지
    if (snapshot.order_status === 'CONFIRMED' && snapshot.done_count === 0) {
      return
    }
    newStatus = 'PRINTING'
  }

  // 원자적 조건부 UPDATE: order_status가 스냅샷과 동일할 때만 실행 (race 방지)
  if (newStatus && newStatus !== snapshot.order_status) {
    const result = await db.prepare(`
      UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = ?
    `).bind(newStatus, orderId, snapshot.order_status).run()

    // 실제로 UPDATE된 경우에만 이력 기록
    if (result.meta.changes > 0) {
      // 시스템 자동 전이 = changed_by NULL (user FK 리터럴 금지 — prod user id=1 부재 시 INSERT 전멸 전례)
      await db.prepare(`
        INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, change_reason)
        VALUES (?, ?, ?, NULL, ?)
      `).bind(orderId, snapshot.order_status, newStatus, '카드 상태 자동 동기화').run()
    }
  }
}

// Bulk status change (must be before /:id)
cardsLifecycleRouter.patch('/bulk/status', requireEditOrRole('/cards', 'MANAGER', 'OPERATOR'), async (c) => {
  try {
    const user = c.get('user')
    const { card_ids, status, reason, defect_category } = await c.req.json()

    if (!Array.isArray(card_ids) || card_ids.length === 0) {
      return c.json({ success: false, error: 'card_ids array required' }, 400)
    }

    const validStatuses = ['PRINTING', 'PRINT_DONE', 'HOLD']
    if (!validStatuses.includes(status)) {
      return c.json({ success: false, error: 'Invalid status' }, 400)
    }

    const affectedOrderIds = new Set<number>()

    // HOLD + defect_category 시 quality_issues에 사용할 employee_id 조회
    let employeeId: number | null = null
    if (status === 'HOLD' && defect_category && user?.id) {
      const emp = await c.env.DB.prepare('SELECT id FROM employees WHERE user_id = ?').bind(user.id).first<{ id: number }>()
      employeeId = emp?.id || null
    }

    // N+1 → 일괄 SELECT로 현재 상태 조회 (루프 SELECT 제거)
    interface BulkCard { id: number; status: string; order_id: number; post_processing: string | null }
    const efBulk = entityFilter(c, 'o')
    // D1 바인드 한도 → 80청크 분할(#409: card_ids + ef params가 100 초과 시 500)
    const existingCards: BulkCard[] = []
    for (let i = 0; i < card_ids.length; i += 80) {
      const chunk = card_ids.slice(i, i + 80)
      const placeholders = chunk.map(() => '?').join(',')
      const { results } = await c.env.DB.prepare(`
        SELECT cards.id, cards.status, cards.order_id, cards.post_processing
        FROM cards
        JOIN orders o ON cards.order_id = o.id
        WHERE cards.id IN (${placeholders})${efBulk.clause}
      `).bind(...chunk, ...efBulk.params).all<BulkCard>()
      existingCards.push(...results)
    }
    const cardMap = new Map(existingCards.map(c => [c.id, c]))

    // #282: 카드 상태 전이 규칙 (완료 카드가 출력중으로 역행 방지)
    // ⚠️ PRINT_PENDING 키가 없으면 `(undefined || []).includes(...)` 가 false 라 **출력대기 카드의
    //    일괄 출력시작이 400 으로 막힌다**(단건 /:id/status 는 전이표를 안 보므로 되고, 일괄만 안 되는
    //    비대칭이었다). 역행 차단(PRINT_DONE→PRINTING)은 그대로 유지.
    const VALID_TRANSITIONS: Record<string, string[]> = {
      PRINT_PENDING: ['PRINTING', 'PRINT_DONE', 'HOLD'],
      PRINTING: ['PRINT_DONE', 'HOLD'],
      PRINT_DONE: ['HOLD'],
      HOLD: ['PRINTING', 'PRINT_DONE'],
    }

    // batch 문 구성
    const batchStmts: D1PreparedStatement[] = []
    let updated = 0

    for (const cardId of card_ids) {
      const card = cardMap.get(cardId)
      if (!card) continue
      if (card.status === status) continue  // 동일 상태 no-op (history 중복 방지)
      if (!(VALID_TRANSITIONS[card.status] || []).includes(status)) {
        return c.json({ success: false, error: `${card.status} → ${status} 전환 불가 (카드 ${cardId})` }, 400)
      }

      if (status === 'HOLD') {
        batchStmts.push(
          c.env.DB.prepare(`
            UPDATE cards SET status = ?, hold_reason = ?, hold_at = CURRENT_TIMESTAMP,
            hold_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
          `).bind(status, reason || null, user?.id || null, cardId)
        )
        // #99: HOLD 시 진행 중 work_records → PAUSED
        batchStmts.push(
          c.env.DB.prepare(`
            UPDATE work_records SET status = 'PAUSED', updated_at = CURRENT_TIMESTAMP
            WHERE card_id = ? AND status = 'IN_PROGRESS'
          `).bind(cardId)
        )

        // 불량 유형이 있으면 quality_issues 자동 생성
        if (defect_category && employeeId) {
          batchStmts.push(
            c.env.DB.prepare(`
              INSERT OR IGNORE INTO quality_issues (card_id, issue_type, defect_category, description, severity, status, reported_by, entity_id)
              VALUES (?, 'DEFECT', ?, ?, 'MEDIUM', 'OPEN', ?, ?)
            `).bind(cardId, defect_category, reason || defect_category, employeeId, getEntityId(c) || 1)
          )
        }
      } else if (status === 'PRINT_DONE') {
        // 후가공 상태 자동 설정 (이미 일괄 SELECT에서 post_processing 조회됨)
        const hasPP = card.post_processing && card.post_processing !== '[]' && card.post_processing !== ''
        const ppStatus = hasPP ? 'PENDING' : 'N/A'
        batchStmts.push(
          c.env.DB.prepare(`
            UPDATE cards SET status = ?, pp_status = ?, hold_reason = NULL, hold_at = NULL,
            hold_by = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?
          `).bind(status, ppStatus, cardId)
        )
        // #175: HOLD 해제 시 work_records PAUSED → IN_PROGRESS 복구
        if (card.status === 'HOLD') {
          batchStmts.push(
            c.env.DB.prepare(`
              UPDATE work_records SET status = 'IN_PROGRESS', updated_at = CURRENT_TIMESTAMP
              WHERE card_id = ? AND status = 'PAUSED'
            `).bind(cardId)
          )
        }
      } else {
        batchStmts.push(
          c.env.DB.prepare(`
            UPDATE cards SET status = ?, hold_reason = NULL, hold_at = NULL,
            hold_by = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?
          `).bind(status, cardId)
        )
        // #175: HOLD 해제 시 work_records PAUSED → IN_PROGRESS 복구
        if (card.status === 'HOLD') {
          batchStmts.push(
            c.env.DB.prepare(`
              UPDATE work_records SET status = 'IN_PROGRESS', updated_at = CURRENT_TIMESTAMP
              WHERE card_id = ? AND status = 'PAUSED'
            `).bind(cardId)
          )
        }
      }

      // 상태 이력
      batchStmts.push(
        c.env.DB.prepare(`
          INSERT INTO card_status_history (card_id, from_status, to_status, changed_by, change_reason)
          VALUES (?, ?, ?, ?, ?)
        `).bind(cardId, card.status, status, user?.id || null, reason || 'Bulk status change')
      )

      if (card.order_id) affectedOrderIds.add(card.order_id)
      updated++
    }

    // D1 batch로 실행 (100개 단위 분할 — D1 batch 제한)
    for (let i = 0; i < batchStmts.length; i += 80) {
      const chunk = batchStmts.slice(i, i + 80)
      if (chunk.length > 0) await c.env.DB.batch(chunk)
    }

    // 출력중으로 올린 카드 중 **이미 전 스텝 체크 완료**인 것은 곧바로 출력완료로 (단건 경로와 동일 불변식)
    let autoDone = 0
    if (status === 'PRINTING') {
      for (const cardId of card_ids) {
        if (await maybeAutoCompleteCard(c.env.DB, Number(cardId), user?.id || null)) autoDone++
      }
    }

    // 영향받은 주문들의 상태 자동 동기화 (병렬 실행)
    await Promise.all([...affectedOrderIds].map(orderId =>
      syncOrderStatusFromCards(c.env.DB, orderId).catch((err) => {
        console.error('[syncOrderStatus] orderId=' + orderId, err)
      })
    ))

    return c.json({
      success: true,
      data: { updated, auto_done: autoDone },
      message: `${updated}장 상태 변경 완료${autoDone > 0 ? ` (전 공정 완료 ${autoDone}장 출력완료 처리)` : ''}`
    })
  } catch (error) {
    console.error('src/routes/cards.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})


// PATCH /defects/:defectId — 불량 처리 (해결/조치) — must be before /:id
cardsLifecycleRouter.patch('/defects/:defectId', async (c) => {
  try {
    const defectId = c.req.param('defectId')
    const user = c.get('user')
    const { status, corrective_action, root_cause, cost_impact } = await c.req.json()

    const validStatuses = ['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REWORK_REQUIRED']
    if (status && !validStatuses.includes(status)) {
      return c.json({ success: false, error: '유효하지 않은 상태입니다.' }, 400)
    }

    // #571: 멀티법인 격리 — 단건 변경도 entity_id로 소유 검증 (형제 GET /defects/list #375와 대칭)
    const ef = entityFilter(c)
    const owned = await c.env.DB.prepare(
      `SELECT id FROM quality_issues WHERE id = ?${ef.clause}`
    ).bind(defectId, ...ef.params).first()
    if (!owned) {
      return c.json({ success: false, error: '불량 레코드를 찾을 수 없습니다.' }, 404)
    }

    let employeeId: number | null = null
    if (user?.id) {
      const emp = await c.env.DB.prepare('SELECT id FROM employees WHERE user_id = ?').bind(user.id).first<{ id: number }>()
      employeeId = emp?.id || null
    }

    const sets: string[] = ['updated_at = CURRENT_TIMESTAMP']
    const params: (string | number | null)[] = []

    if (status) { sets.push('status = ?'); params.push(status) }
    if (corrective_action !== undefined) { sets.push('corrective_action = ?'); params.push(corrective_action) }
    if (root_cause !== undefined) { sets.push('root_cause = ?'); params.push(root_cause) }
    if (cost_impact !== undefined) { sets.push('cost_impact = ?'); params.push(Number(cost_impact) || 0) }

    if (status === 'RESOLVED') {
      sets.push('resolved_by = ?', 'resolved_at = CURRENT_TIMESTAMP')
      params.push(employeeId)
    }

    params.push(defectId)
    await c.env.DB.prepare(`UPDATE quality_issues SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run()

    return c.json({ success: true, message: '불량 처리가 업데이트되었습니다.' })
  } catch (error) {
    console.error('src/routes/cards.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})


// 일괄 출고 처리 (/:id/ship 보다 먼저 등록되어야 함)
cardsLifecycleRouter.post('/bulk-ship', async (c) => {
  try {
    const user = c.get('user')
    const { card_ids } = await c.req.json() as { card_ids: number[] }

    if (!Array.isArray(card_ids) || card_ids.length === 0) {
      return c.json({ success: false, error: 'card_ids 배열이 필요합니다.' }, 400)
    }

    let shipped = 0
    let failed = 0
    const errors: string[] = []
    const processedOrderIds = new Set<number>()

    // N+1 → 일괄 SELECT로 카드 정보 조회
    interface ShipCard { id: number; status: string; order_id: number; card_number: string; shipped_at: string | null }
    const ef = cardEntityScope(c)  // #432: 타 법인 카드 출고 차단
    // D1 바인드 한도 → 80청크 분할(#409)
    const existingCards: ShipCard[] = []
    for (let i = 0; i < card_ids.length; i += 80) {
      const chunk = card_ids.slice(i, i + 80)
      const placeholders = chunk.map(() => '?').join(',')
      const { results } = await c.env.DB.prepare(`
        SELECT id, status, order_id, card_number, shipped_at FROM cards WHERE id IN (${placeholders})${ef.clause}
      `).bind(...chunk, ...ef.params).all<ShipCard>()
      existingCards.push(...results)
    }
    const cardMap = new Map(existingCards.map(c => [c.id, c]))

    // 적격 카드 필터링 + batch UPDATE 구성
    const shipBatchStmts: D1PreparedStatement[] = []
    for (const cardId of card_ids) {
      const card = cardMap.get(cardId)
      if (!card) { failed++; errors.push(`ID ${cardId}: not found`); continue }
      if (card.status !== 'PRINT_DONE') { failed++; errors.push(`${card.card_number}: 상태 ${card.status}`); continue }
      if (card.shipped_at) { failed++; errors.push(`${card.card_number}: 이미 출고됨`); continue }

      shipBatchStmts.push(
        c.env.DB.prepare('UPDATE cards SET shipped_at = CURRENT_TIMESTAMP WHERE id = ?').bind(card.id)
      )
      shipped++
      processedOrderIds.add(card.order_id)
    }

    // batch로 출고 UPDATE 원자 실행
    if (shipBatchStmts.length > 0) {
      await c.env.DB.batch(shipBatchStmts)
    }

    // 주문 전체 출고 확인 — 주문별 1회 쿼리는 유지 (orderId 수 << card 수)
    let orderShippedCount = 0
    for (const orderId of processedOrderIds) {
      const progress = await c.env.DB.prepare(`
        SELECT COUNT(*) as total,
               SUM(CASE WHEN shipped_at IS NOT NULL THEN 1 ELSE 0 END) as shipped_count
        FROM cards WHERE order_id = ?
      `).bind(orderId).first<{ total: number; shipped_count: number }>()

      // P1 출고 정합화: 일괄 카드 출고도 shipment 기록 동기 (실패해도 출고 유지)
      try {
        await ensureShipmentForOrder(c.env.DB, orderId, { userId: user?.id ?? null, fallbackEntityId: getEntityId(c) || 1 })
      } catch (shipRecErr) {
        console.error('bulk card ship ensureShipment error:', shipRecErr)
      }

      if (progress && progress.total > 0 && progress.total === progress.shipped_count) {
        const order = await c.env.DB.prepare('SELECT status, entity_id FROM orders WHERE id = ?').bind(orderId).first<{ status: string; entity_id: number | null }>()
        if (order && order.status !== 'SHIPPED' && order.status !== 'CANCELLED') {
          // 기성/유통 라인 재고 차감 — 카드 경로도 주문 bulk-ship 과 동일 규칙(멱등).
          //   2026-08-30: 이 호출이 없어 카드 화면에서 출고하면 재고가 안 빠지고 있었다.
          await deductStockLinesOnShip(c.env.DB, Number(orderId), order.entity_id || getEntityId(c) || 1)
          // batch로 UPDATE + 이력 INSERT 원자 처리
          await c.env.DB.batch([
            c.env.DB.prepare(
              `UPDATE orders SET status = 'SHIPPED', shipped_at = COALESCE(shipped_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?`
            ).bind(orderId),
            c.env.DB.prepare(`
              INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, change_reason)
              VALUES (?, ?, 'SHIPPED', ?, '카드 전체 출고 완료 자동 처리')
            `).bind(orderId, order.status, user?.id ?? null)
          ])
          orderShippedCount++
        }
      }
    }

    return c.json({
      success: true,
      data: { shipped, failed, errors, order_shipped_count: orderShippedCount },
      message: `${shipped}건 출고 완료` + (failed > 0 ? `, ${failed}건 실패` : '') + (orderShippedCount > 0 ? `, ${orderShippedCount}건 주문 출고완료` : '')
    })
  } catch (error) {
    console.error('src/routes/cards.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// QR 출고 처리 — card_id(숫자) 또는 card_number(CARD-YYYYMMDD-NNN)로 출고
cardsLifecycleRouter.post('/:id/ship', async (c) => {
  try {
    const idParam = c.req.param('id')
    const user = c.get('user')

    // card_number 패턴 여부 확인
    const isCardNumber = /^CARD-\d{8}-\d{3,}$/i.test(idParam)

    interface CardShipRow { id: number; status: string; order_id: number; card_number: string; shipped_at: string | null }
    const ef = cardEntityScope(c)  // #432: 타 법인 카드 출고 차단
    const card = isCardNumber
      ? await c.env.DB.prepare(`
          SELECT id, status, order_id, card_number, shipped_at FROM cards WHERE card_number = ?${ef.clause}
        `).bind(idParam, ...ef.params).first<CardShipRow>()
      : await c.env.DB.prepare(`
          SELECT id, status, order_id, card_number, shipped_at FROM cards WHERE id = ?${ef.clause}
        `).bind(idParam, ...ef.params).first<CardShipRow>()

    if (!card) {
      return c.json({ success: false, error: 'Card not found' }, 404)
    }

    if (card.status !== 'PRINT_DONE') {
      return c.json({
        success: false,
        error: `출고 처리는 PRINT_DONE 상태에서만 가능합니다. 현재 상태: ${card.status}`
      }, 400)
    }

    if (card.shipped_at) {
      return c.json({ success: false, error: '이미 출고 처리된 카드입니다.' }, 409)
    }

    // 후가공 미완료 체크
    const cardFull = await c.env.DB.prepare('SELECT pp_status FROM cards WHERE id = ?').bind(card.id).first<{ pp_status: string | null }>()
    if (cardFull?.pp_status === 'PENDING') {
      const body = await c.req.json().catch(() => ({})) as { force?: boolean }
      if (!body?.force) {
        return c.json({
          success: false,
          error: '후가공이 완료되지 않은 카드입니다. 강제 출고하려면 force: true를 전달하세요.',
          pp_pending: true
        }, 400)
      }
    }

    // shipped_at 설정으로 출고 처리
    await c.env.DB.prepare(
      'UPDATE cards SET shipped_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(card.id).run()

    // 해당 주문의 모든 카드 출고 여부 확인
    const progress = await c.env.DB.prepare(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN shipped_at IS NOT NULL THEN 1 ELSE 0 END) as shipped_count
      FROM cards WHERE order_id = ?
    `).bind(card.order_id).first<{ total: number; shipped_count: number }>()

    let orderShipped = false
    if (progress && progress.total > 0 && progress.total === progress.shipped_count) {
      const order = await c.env.DB.prepare(
        'SELECT status, entity_id FROM orders WHERE id = ?'
      ).bind(card.order_id).first<{ status: string; entity_id: number | null }>()

      if (order && order.status !== 'SHIPPED' && order.status !== 'CANCELLED') {
        // 기성/유통 라인 재고 차감 (멱등) — 위 bulk-ship 과 같은 규칙
        await deductStockLinesOnShip(c.env.DB, Number(card.order_id), order.entity_id || getEntityId(c) || 1)
        await c.env.DB.batch([
          c.env.DB.prepare(`
            UPDATE orders SET status = 'SHIPPED', shipped_at = COALESCE(shipped_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?
          `).bind(card.order_id),
          c.env.DB.prepare(`
            INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, change_reason)
            VALUES (?, ?, 'SHIPPED', ?, '카드 전체 출고 완료 자동 처리')
          `).bind(card.order_id, order.status, user?.id ?? null),
        ])

        orderShipped = true
      }
    }

    // P1 출고 정합화: QR 출고도 shipment 기록 동기 (실패해도 출고 유지)
    try {
      await ensureShipmentForOrder(c.env.DB, card.order_id, { userId: user?.id ?? null, fallbackEntityId: getEntityId(c) || 1 })
    } catch (shipRecErr) {
      console.error('QR ship ensureShipment error:', shipRecErr)
    }

    return c.json({
      success: true,
      data: {
        card_id: card.id,
        card_number: card.card_number,
        order_shipped: orderShipped
      },
      message: orderShipped
        ? '카드 출고 처리 완료. 주문이 출고완료 상태로 변경되었습니다.'
        : '카드 출고 처리 완료'
    })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})


// POST /:id/defects — 불량 접수
cardsLifecycleRouter.post('/:id/defects', async (c) => {
  try {
    const cardId = c.req.param('id')
    const user = c.get('user')
    const { defect_category, description, severity, auto_hold } = await c.req.json()

    if (!defect_category || !description) {
      return c.json({ success: false, error: '불량 유형과 설명은 필수입니다.' }, 400)
    }

    // 사용자의 employee_id 조회
    let employeeId: number | null = null
    if (user?.id) {
      const emp = await c.env.DB.prepare('SELECT id FROM employees WHERE user_id = ?').bind(user.id).first<{ id: number }>()
      employeeId = emp?.id || null
    }
    if (!employeeId) {
      return c.json({ success: false, error: '직원 정보가 없습니다.' }, 400)
    }

    const ef = cardEntityScope(c)  // #432: 타 법인 카드 불량접수 차단
    const card = await c.env.DB.prepare(`SELECT id, status, order_id FROM cards WHERE id = ?${ef.clause}`).bind(cardId, ...ef.params).first<{ id: number; status: string; order_id: number }>()
    if (!card) return c.json({ success: false, error: '카드를 찾을 수 없습니다.' }, 404)

    // 불량 기록 생성
    const result = await c.env.DB.prepare(`
      INSERT INTO quality_issues (card_id, issue_type, defect_category, description, severity, status, reported_by, entity_id)
      VALUES (?, 'DEFECT', ?, ?, ?, 'OPEN', ?, ?)
    `).bind(cardId, defect_category, description, severity || 'MEDIUM', employeeId, getEntityId(c) || 1).run()

    // auto_hold가 true이고 현재 HOLD 상태가 아니면 HOLD 전환
    if (auto_hold && card.status !== 'HOLD') {
      await c.env.DB.batch([
        c.env.DB.prepare(`
          UPDATE cards SET status = 'HOLD', hold_reason = ?, hold_at = CURRENT_TIMESTAMP,
          hold_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).bind(description, user?.id || null, cardId),
        // #99: HOLD 시 진행 중 work_records → PAUSED
        c.env.DB.prepare(`
          UPDATE work_records SET status = 'PAUSED', updated_at = CURRENT_TIMESTAMP
          WHERE card_id = ? AND status = 'IN_PROGRESS'
        `).bind(cardId),
        c.env.DB.prepare(`
          INSERT INTO card_status_history (card_id, from_status, to_status, changed_by, change_reason)
          VALUES (?, ?, 'HOLD', ?, ?)
        `).bind(cardId, card.status, user?.id || null, '불량 접수: ' + defect_category),
      ])

      if (card.order_id) {
        await syncOrderStatusFromCards(c.env.DB, card.order_id)
      }
    }

    return c.json({ success: true, data: { id: result.meta?.last_row_id }, message: '불량이 접수되었습니다.' })
  } catch (error) {
    console.error('src/routes/cards.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})


// Update card status
cardsLifecycleRouter.patch('/:id/status', async (c) => {
  try {
    const id = c.req.param('id')
    const { status, reason, defect_category, rip_file_path } = await c.req.json() as {
      status: string
      reason?: string
      defect_category?: string
      rip_file_path?: string
    }
    const user = c.get('user')

    // Validate status — PRINT_ERROR added so LogWatcher/EdgeAgent can report
    // RIP failures observed in Print.log (Step 4 / PrintLogMonitor.cs).
    const validStatuses = ['PRINTING', 'PRINT_DONE', 'PRINT_ERROR', 'HOLD']
    if (!validStatuses.includes(status)) {
      return c.json({
        success: false,
        error: 'Invalid status'
      }, 400)
    }

    // Get current status and order_id
    const ef = cardEntityScope(c)  // #432: 타 법인 카드 상태변경 차단
    const card = await c.env.DB.prepare(`SELECT status, order_id, card_number FROM cards WHERE id = ?${ef.clause}`).bind(id, ...ef.params).first<{ status: string; order_id: number; card_number: string }>()

    if (!card) {
      return c.json({
        success: false,
        error: 'Card not found'
      }, 404)
    }

    // Update card status with hold fields
    if (status === 'HOLD') {
      await c.env.DB.batch([
        c.env.DB.prepare(`
          UPDATE cards SET status = ?, hold_reason = ?, hold_at = CURRENT_TIMESTAMP,
          hold_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).bind(status, reason || null, user?.id || null, id),
        // #99: HOLD 시 진행 중 work_records → PAUSED
        c.env.DB.prepare(`
          UPDATE work_records SET status = 'PAUSED', updated_at = CURRENT_TIMESTAMP
          WHERE card_id = ? AND status = 'IN_PROGRESS'
        `).bind(id),
      ])

      // HOLD 전환 시 defect_category가 있으면 quality_issues 자동 생성
      if (defect_category) {
        const validDefectCategories = ['COLOR', 'SIZE', 'DAMAGE', 'MATERIAL', 'DESIGN', 'OTHER']
        const safeCategory = validDefectCategories.includes(defect_category) ? defect_category : 'OTHER'

        // reported_by: employees 테이블에서 user_id로 employee_id 조회
        const empRow = await c.env.DB.prepare(
          'SELECT id FROM employees WHERE user_id = ? LIMIT 1'
        ).bind(user?.id || null).first<{ id: number }>()
        const reportedBy = empRow?.id || null

        if (reportedBy) {
          await c.env.DB.prepare(`
            INSERT INTO quality_issues (
              work_record_id, card_id, issue_type, defect_category,
              quantity_defect, description, status, reported_by, created_at, entity_id
            ) VALUES (NULL, ?, 'DEFECT', ?, 1, ?, 'REPORTED', ?, CURRENT_TIMESTAMP, ?)
          `).bind(parseInt(id), safeCategory, reason || '', reportedBy, getEntityId(c) || 1).run()
        }
      }
    } else if (status === 'PRINT_ERROR') {
      // 단일 상태축(Phase 4): 출력오류는 별도 status가 아니라 rip_status='ERROR'로 기록.
      // 카드 main status는 유지 → 보드 버킷에서 사라지지 않고 재출력 대기로 노출.
      if (rip_file_path) {
        await c.env.DB.prepare(
          "UPDATE cards SET rip_status = 'ERROR', rip_file_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).bind(rip_file_path, id).run()
      } else {
        await c.env.DB.prepare(
          "UPDATE cards SET rip_status = 'ERROR', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).bind(id).run()
      }
    } else {
      // PRINT_DONE 전환 시 후가공 상태 자동 설정
      if (status === 'PRINT_DONE') {
        const cardDetail = await c.env.DB.prepare('SELECT post_processing FROM cards WHERE id = ?').bind(id).first<{ post_processing: string | null }>()
        const hasPP = cardDetail?.post_processing && cardDetail.post_processing !== '[]' && cardDetail.post_processing !== ''
        const ppStatus = hasPP ? 'PENDING' : 'N/A'
        await c.env.DB.prepare(`
          UPDATE cards SET status = ?, pp_status = ?, hold_reason = NULL, hold_at = NULL,
          hold_by = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).bind(status, ppStatus, id).run()
      } else if (rip_file_path) {
        // EdgeAgent/LogWatcher reports the EPS path picked up by RIP so we can
        // trace print-log lines back to the originating card.
        await c.env.DB.prepare(`
          UPDATE cards SET status = ?, rip_file_path = ?, hold_reason = NULL,
          hold_at = NULL, hold_by = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).bind(status, rip_file_path, id).run()
      } else {
        await c.env.DB.prepare(`
          UPDATE cards SET status = ?, hold_reason = NULL, hold_at = NULL,
          hold_by = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).bind(status, id).run()
      }
    }

    // Insert status history
    await c.env.DB.prepare(`
      INSERT INTO card_status_history (card_id, from_status, to_status, changed_by, change_reason)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, card.status, status, user?.id || null, reason || null).run()

    // 출력중으로 올라온 카드가 **이미 전 스텝 체크 완료**면 여기서 곧바로 출력완료로 넘긴다.
    // (체크 토글에서만 평가하면 이 카드는 영영 전이되지 않는다 — maybeAutoCompleteCard 주석 참조)
    let autoDone = false
    if (status === 'PRINTING') {
      autoDone = await maybeAutoCompleteCard(c.env.DB, parseInt(id), user?.id || null)
    }

    // 주문 상태 자동 동기화 (자동 전이가 일어났으면 그 안에서 이미 동기화됨)
    if (card.order_id && !autoDone) {
      await syncOrderStatusFromCards(c.env.DB, card.order_id)
    }

    await logActivity({
      db: c.env.DB, userId: user?.id, userName: user?.username,
      action: 'STATUS_CHANGE', entityType: 'CARD', entityId: parseInt(id),
      entityLabel: card.card_number || String(id),
      details: JSON.stringify({ from: card.status, to: status }),
      actorEntityId: getEntityId(c)
    })

    return c.json({
      success: true,
      message: 'Card status updated successfully',
      data: { auto_done: autoDone }
    })
  } catch (error) {
    console.error('src/routes/cards.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ── 후가공 완료 처리 ──────────────────────────────────────────────────────────
cardsLifecycleRouter.patch('/:id/pp-complete', async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user')

    const ef = cardEntityScope(c)  // #432: 타 법인 카드 후가공완료 차단
    const card = await c.env.DB.prepare(
      `SELECT id, card_number, order_id, status, pp_status, post_processing FROM cards WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ id: number; card_number: string; order_id: number; status: string; pp_status: string | null; post_processing: string | null }>()

    if (!card) return c.json({ success: false, error: 'Card not found' }, 404)
    if (card.status !== 'PRINT_DONE') return c.json({ success: false, error: '인쇄 완료 상태에서만 후가공 완료 처리 가능합니다' }, 400)
    if (card.pp_status === 'DONE') return c.json({ success: false, error: '이미 후가공 완료 처리되었습니다' }, 400)
    if (card.pp_status === 'N/A') return c.json({ success: false, error: '후가공이 없는 카드입니다' }, 400)

    await c.env.DB.prepare(
      `UPDATE cards SET pp_status = 'DONE', pp_completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(id).run()

    await logActivity({
      db: c.env.DB, userId: user?.id, userName: user?.username,
      action: 'PP_COMPLETE', entityType: 'CARD', entityId: parseInt(id),
      entityLabel: card.card_number || String(id),
      details: JSON.stringify({ post_processing: card.post_processing }),
      actorEntityId: getEntityId(c)
    })

    return c.json({ success: true, message: '후가공 완료 처리되었습니다' })
  } catch (error) {
    console.error('src/routes/cards.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── 후가공 완료 일괄 처리 ────────────────────────────────────────────────────
cardsLifecycleRouter.patch('/bulk/pp-complete', async (c) => {
  try {
    const { card_ids } = await c.req.json()
    const user = c.get('user')

    if (!card_ids?.length) return c.json({ success: false, error: 'card_ids required' }, 400)

    // N+1 → 단일 조건부 UPDATE (SELECT 루프 제거)
    const ef = cardEntityScope(c)  // #432: 타 법인 카드 일괄 후가공완료 차단
    // D1 바인드 한도 → 80청크 분할(#409)
    let completed = 0
    for (let i = 0; i < card_ids.length; i += 80) {
      const chunk = card_ids.slice(i, i + 80)
      const placeholders = chunk.map(() => '?').join(',')
      const result = await c.env.DB.prepare(`
        UPDATE cards SET pp_status = 'DONE', pp_completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id IN (${placeholders}) AND status = 'PRINT_DONE' AND pp_status = 'PENDING'${ef.clause}
      `).bind(...chunk, ...ef.params).run()
      completed += result.meta?.changes ?? 0
    }

    return c.json({ success: true, message: `${completed}건 후가공 완료 처리`, data: { completed } })
  } catch (error) {
    console.error('src/routes/cards.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})


// 카드 개별 출고 처리
cardsLifecycleRouter.patch('/:id/ship', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user')

    // 1. 카드 조회
    interface CardFullRow { id: number; status: string; order_id: number; order_item_id: number | null; shipped_at: string | null; pp_status: string | null; card_number: string }
    const ef = cardEntityScope(c)  // #432: 타 법인 카드 출고 차단
    const card = await c.env.DB.prepare(
      `SELECT id, status, order_id, order_item_id, shipped_at, pp_status, card_number FROM cards WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<CardFullRow>()

    if (!card) {
      return c.json({ success: false, error: 'Card not found' }, 404)
    }

    // 2. 검증
    if (card.status !== 'PRINT_DONE') {
      return c.json({
        success: false,
        error: '출력 완료(PRINT_DONE) 상태의 카드만 출고할 수 있습니다.'
      }, 400)
    }

    if (card.shipped_at) {
      return c.json({ success: false, error: '이미 출고된 카드입니다.' }, 400)
    }

    // 후가공 미완료 검증 (경고)
    if (card.pp_status === 'PENDING') {
      const { force } = await c.req.json().catch(() => ({ force: false }))
      if (!force) {
        return c.json({
          success: false,
          error: '후가공이 완료되지 않은 카드입니다. 강제 출고하려면 force: true를 전달하세요.',
          pp_pending: true
        }, 400)
      }
    }

    // 3. 출고 처리
    await c.env.DB.prepare(
      'UPDATE cards SET shipped_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(id).run()

    // 4. 해당 주문의 모든 카드 출고 여부 확인
    const progress = await c.env.DB.prepare(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN shipped_at IS NOT NULL THEN 1 ELSE 0 END) as shipped
      FROM cards WHERE order_id = ?
    `).bind(card.order_id).first<{ total: number; shipped: number }>()

    let orderShipped = false
    let prevOrderStatus = ''
    const allShipped = progress && progress.total > 0 && progress.total === progress.shipped

    // 5. 모두 출고되었으면 주문 상태를 SHIPPED로 변경
    if (allShipped) {
      const order = await c.env.DB.prepare(
        'SELECT status, entity_id FROM orders WHERE id = ?'
      ).bind(card.order_id).first<{ status: string; entity_id: number | null }>()

      if (order && order.status !== 'SHIPPED' && order.status !== 'CANCELLED') {
        prevOrderStatus = order.status
        // 기성/유통 라인 재고 차감 (멱등) — 위 두 출고 경로와 같은 규칙
        await deductStockLinesOnShip(c.env.DB, Number(card.order_id), order.entity_id || getEntityId(c) || 1)
        await c.env.DB.batch([
          c.env.DB.prepare(
            `UPDATE orders SET status = 'SHIPPED', shipped_at = COALESCE(shipped_at, CURRENT_TIMESTAMP), updated_at = datetime('now') WHERE id = ?`
          ).bind(card.order_id),
          c.env.DB.prepare(`
            INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, change_reason)
            VALUES (?, ?, 'SHIPPED', ?, '카드 전체 출고 완료 자동 처리')
          `).bind(card.order_id, order.status, user?.id ?? null),
        ])

        orderShipped = true
      }
    }

    // 5-1. 출고 기록(shipments) 생성/동기 — 공용 헬퍼로 일원화 (P1 출고 정합화, dtMap 정본=utils/shipmentHelper)
    try {
      await ensureShipmentForOrder(c.env.DB, card.order_id, { userId: user?.id ?? null, fallbackEntityId: getEntityId(c) || 1 })
    } catch (shipErr) {
      // #308: 출고 기록 생성 실패 시 카드/주문 출고 상태를 보상 롤백 (불일치 방지)
      console.error('shipment record creation failed — rolling back card ship:', shipErr)
      try {
        const undo: ReturnType<typeof c.env.DB.prepare>[] = [
          c.env.DB.prepare('UPDATE cards SET shipped_at = NULL WHERE id = ?').bind(id)
        ]
        if (orderShipped) {
          undo.push(c.env.DB.prepare(
            `UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?`
          ).bind(prevOrderStatus, card.order_id))
          undo.push(c.env.DB.prepare(`
            INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, change_reason)
            VALUES (?, 'SHIPPED', ?, ?, '출고 기록 생성 실패로 롤백')
          `).bind(card.order_id, prevOrderStatus, user?.id ?? null))
        }
        await c.env.DB.batch(undo)
      } catch (undoErr) {
        console.error('shipment rollback also failed:', undoErr)
      }
      return c.json({ success: false, error: '출고 기록 생성에 실패하여 출고를 취소했습니다. 다시 시도해주세요.' }, 500)
    }

    // 6. 응답
    return c.json({ success: true, card_shipped: true, order_shipped: orderShipped })
  } catch (error) {
    console.error('src/routes/cards.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// 카드 출고 취소
cardsLifecycleRouter.patch('/:id/unship', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user')

    // 1. 카드 조회
    const ef = cardEntityScope(c)  // #432: 타 법인 카드 출고취소 차단
    const card = await c.env.DB.prepare(
      `SELECT id, order_id, shipped_at FROM cards WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ id: number; order_id: number; shipped_at: string | null }>()

    if (!card) {
      return c.json({ success: false, error: 'Card not found' }, 404)
    }

    // 2. 검증
    if (!card.shipped_at) {
      return c.json({ success: false, error: '출고되지 않은 카드입니다.' }, 400)
    }

    // 3. 출고 취소
    await c.env.DB.prepare(
      'UPDATE cards SET shipped_at = NULL WHERE id = ?'
    ).bind(id).run()

    // 4. 주문이 SHIPPED 상태였으면 PRINT_DONE으로 되돌림
    const order = await c.env.DB.prepare(
      'SELECT status, entity_id FROM orders WHERE id = ?'
    ).bind(card.order_id).first<{ status: string; entity_id: number | null }>()

    if (order && order.status === 'SHIPPED') {
      // ★출고 차감 환원 — 이게 없으면 출고취소가 곧 재고 증발이다.
      //   주문 상태 전이표가 'SHIPPED': [] 라 여기가 출고를 되돌리는 유일한 문이다.
      await restoreStockLinesOnUnship(c.env.DB, Number(card.order_id), order.entity_id || getEntityId(c) || 1,
        { userId: user?.id ?? null, userName: user?.username ?? null, entityId: getEntityId(c) })
      await c.env.DB.batch([
        c.env.DB.prepare(
          `UPDATE orders SET status = 'PRINT_DONE', shipped_at = NULL, updated_at = datetime('now') WHERE id = ?`
        ).bind(card.order_id),
        c.env.DB.prepare(`
          INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, change_reason)
          VALUES (?, 'SHIPPED', 'PRINT_DONE', ?, '카드 출고 취소로 주문 상태 복원')
        `).bind(card.order_id, user?.id ?? null),
      ])
    }

    return c.json({ success: true })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})


// Generate cards from order
// ── 작업지시서 체크리스트 (2026-08-05 work-order-auto-issue) ──
// PATCH /:id/checklist/:itemId — 현장 공정 체크/해제. 체크 행 자체가 감사 로그(checked_by/checked_at).
// 전 스텝 완료 && status=PRINTING → PRINT_DONE 자동 전이 (기존 상태머신 준수).
cardsLifecycleRouter.patch('/:id/checklist/:itemId', requireEditOrRole('/cards', 'MANAGER', 'OPERATOR'), async (c) => {
  try {
    const cardId = parseInt(c.req.param('id'))
    const itemId = parseInt(c.req.param('itemId'))
    if (isNaN(cardId) || isNaN(itemId)) return c.json({ success: false, error: '잘못된 ID' }, 400)
    const { checked } = await c.req.json()
    const user = c.get('user')

    const scope = cardEntityScope(c)
    const card = await c.env.DB.prepare(
      `SELECT id, status, order_id, post_processing FROM cards WHERE id = ?${scope.clause}`
    ).bind(cardId, ...scope.params).first<{ id: number; status: string; order_id: number; post_processing: string | null }>()
    if (!card) return c.json({ success: false, error: '카드를 찾을 수 없습니다.' }, 404)

    const upd = checked
      ? c.env.DB.prepare(`UPDATE card_checklist_items SET checked_by = ?, checked_at = CURRENT_TIMESTAMP WHERE id = ? AND card_id = ?`)
          .bind(user?.id || null, itemId, cardId)
      : c.env.DB.prepare(`UPDATE card_checklist_items SET checked_by = NULL, checked_at = NULL WHERE id = ? AND card_id = ?`)
          .bind(itemId, cardId)
    const updRes = await upd.run()
    if (!updRes.meta.changes) return c.json({ success: false, error: '체크 항목을 찾을 수 없습니다.' }, 404)

    const agg = await c.env.DB.prepare(
      `SELECT COUNT(*) as total, SUM(CASE WHEN checked_at IS NOT NULL THEN 1 ELSE 0 END) as done
       FROM card_checklist_items WHERE card_id = ?`
    ).bind(cardId).first<{ total: number; done: number }>()

    // 자동 전이 불변식은 maybeAutoCompleteCard 한 곳에만 있다 (상태 변경 경로와 공유)
    const autoDone = checked ? await maybeAutoCompleteCard(c.env.DB, cardId, user?.id || null) : false

    // 출력대기 카드에 전 스텝을 체크해도 상태는 안 움직인다(상태머신 준수). 화면이 그 사실을
    // 알 수 있게 신호를 준다 — 아무 반응이 없으면 "완료 처리했는데 왜 대기중?" 이 된다.
    const allCheckedButPending = !!agg && agg.total > 0 && agg.done === agg.total && card.status === 'PRINT_PENDING'

    return c.json({
      success: true,
      data: {
        step_total: agg?.total || 0, step_done: agg?.done || 0,
        auto_done: autoDone, card_status: card.status, all_checked_but_pending: allCheckedButPending
      }
    })
  } catch (error) {
    console.error('cards checklist toggle error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PATCH /:id/reissue-ack — 개정필요(needs_reissue) 확인 처리. 주문 수정 시 카드 보존 경로가 1로 세팅한다.
cardsLifecycleRouter.patch('/:id/reissue-ack', requireEditOrRole('/cards', 'MANAGER', 'OPERATOR'), async (c) => {
  try {
    const cardId = parseInt(c.req.param('id'))
    if (isNaN(cardId)) return c.json({ success: false, error: '잘못된 ID' }, 400)
    const scope = cardEntityScope(c)
    const res = await c.env.DB.prepare(
      `UPDATE cards SET needs_reissue = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?${scope.clause}`
    ).bind(cardId, ...scope.params).run()
    if (!res.meta.changes) return c.json({ success: false, error: '카드를 찾을 수 없습니다.' }, 404)
    return c.json({ success: true })
  } catch (error) {
    console.error('cards reissue-ack error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /generate/:orderId — 주문의 카드 수동 생성.
// ★정규 생성기(generateCardsForOrder)에 **위임**한다. 예전엔 여기 별도 구현이 있었는데
//   ①card_items 를 아예 안 만들고(카드 상세·목록이 card_items 조인이라 품목 0개·이미지 0개 유령 카드)
//   ②체크리스트를 파생하지 않고 ③존재하지도 않는 `ai_analysis` 테이블을 참조해 썸네일 연결이
//   try/catch 로 조용히 실패했다. 생성 규칙이 두 벌이면 반드시 한쪽이 썩는다 → 한 벌로 합친다.
cardsLifecycleRouter.post('/generate/:orderId', async (c) => {
  try {
    const orderId = parseInt(c.req.param('orderId'))
    if (isNaN(orderId)) return c.json({ success: false, error: '잘못된 주문 ID' }, 400)
    const user = c.get('user')

    const order = await c.env.DB.prepare(
      'SELECT id, order_number, client_id, delivery_date, priority, notes, entity_id FROM orders WHERE id = ?'
    ).bind(orderId).first<{ id: number; order_number: string; client_id: number; delivery_date: string | null; priority: string | null; notes: string | null; entity_id: number | null }>()
    if (!order) return c.json({ success: false, error: 'Order not found' }, 404)

    const existing = await c.env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM cards WHERE order_id = ? AND status != 'CANCELLED'"
    ).bind(orderId).first<{ cnt: number }>()
    if (existing && existing.cnt > 0) {
      return c.json({ success: false, error: '이미 카드가 있는 주문입니다. 주문 수정으로 반영하세요.' }, 400)
    }

    const { generateCardsForOrder } = await import('../orders/helpers')
    const created = await generateCardsForOrder({
      db: c.env.DB,
      orderId,
      orderNumber: order.order_number,
      clientId: order.client_id,
      deliveryDate: order.delivery_date || null,
      priority: order.priority || 'NORMAL',
      notes: order.notes || null,
      // 카드 귀속 = 주문 법인 기준 (세션 법인 아님 — 전체모드/타법인 세션 오귀속 방지)
      entityId: Number(order.entity_id) || getEntityId(c) || 1
    })

    if (created > 0) {
      await logActivity({
        db: c.env.DB, userId: user?.id, userName: user?.username,
        action: 'CREATE', entityType: 'CARD', entityId: orderId,
        entityLabel: order.order_number,
        details: JSON.stringify({ card_count: created }),
        actorEntityId: getEntityId(c)
      })
    }

    return c.json({
      success: true,
      data: { id: orderId, order_number: order.order_number, card_count: created },
      message: `${created}장의 카드가 생성되었습니다.`
    })
  } catch (error) {
    console.error('Card generation error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})


// ===== 개별 card_item 출력완료 토글 =====
cardsLifecycleRouter.patch('/:cardId/items/:itemId/print-toggle', async (c) => {
  try {
    const cardId = c.req.param('cardId')
    const itemId = c.req.param('itemId')
    const user = c.get('user')

    // card_item 확인
    const ci = await c.env.DB.prepare(
      'SELECT ci.id, ci.card_id, ci.print_completed, c.status, c.order_id FROM card_items ci JOIN cards c ON c.id = ci.card_id WHERE ci.id = ? AND ci.card_id = ?'
    ).bind(itemId, cardId).first<{ id: number; card_id: number; print_completed: number; status: string; order_id: number }>()

    if (!ci) {
      return c.json({ success: false, error: 'Card item not found' }, 404)
    }

    const newVal = ci.print_completed === 1 ? 0 : 1

    if (newVal === 1) {
      await c.env.DB.prepare(
        'UPDATE card_items SET print_completed = 1, print_completed_at = CURRENT_TIMESTAMP, print_completed_by = ? WHERE id = ?'
      ).bind(user?.id || null, itemId).run()
    } else {
      await c.env.DB.prepare(
        'UPDATE card_items SET print_completed = 0, print_completed_at = NULL, print_completed_by = NULL WHERE id = ?'
      ).bind(itemId).run()
    }

    // 전체 완료 여부 확인 → 자동 PRINT_DONE 전환
    const { results: allItems } = await c.env.DB.prepare(
      'SELECT print_completed FROM card_items WHERE card_id = ?'
    ).bind(cardId).all<{ print_completed: number }>()

    const total = allItems.length
    const done = allItems.filter((i) => i.print_completed === 1).length
    const allDone = total > 0 && done === total

    if (allDone && ci.status !== 'PRINT_DONE') {
      // 모든 파일 완료 → PRINT_DONE
      await c.env.DB.prepare(
        "UPDATE cards SET status = 'PRINT_DONE', print_done_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(cardId).run()
      await syncOrderStatusFromCards(c.env.DB, ci.order_id)
    } else if (!allDone && ci.status === 'PRINT_DONE') {
      // 체크 해제로 미완료 → PRINTING으로 되돌림
      await c.env.DB.prepare(
        "UPDATE cards SET status = 'PRINTING', print_done_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(cardId).run()
      await syncOrderStatusFromCards(c.env.DB, ci.order_id)
    }

    return c.json({
      success: true,
      data: { card_item_id: Number(itemId), print_completed: newVal, progress: { total, done } }
    })
  } catch (err) {
    console.error('card item print toggle error:', err)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ===== 전체 품목 출력완료 (카드 PRINT_DONE 단축키) =====
// - 모든 card_items.print_completed = 1
// - cards.status = PRINT_DONE (+ pp_status 자동 설정)
// - card_status_history 기록
// - 주문 상태 동기화
// 단일 경로로 item과 card 상태 동기화를 보장한다.
cardsLifecycleRouter.patch('/:id/complete', async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user')

    const ef = cardEntityScope(c)  // #432: 타 법인 카드 출력완료 차단
    const card = await c.env.DB.prepare(
      `SELECT id, status, order_id, post_processing FROM cards WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ id: number; status: string; order_id: number; post_processing: string | null }>()

    if (!card) {
      return c.json({ success: false, error: 'Card not found' }, 404)
    }
    if (card.status === 'PRINT_DONE') {
      return c.json({ success: false, error: '이미 출력완료 상태입니다.' }, 400)
    }

    // 1) 모든 card_items를 print_completed=1 로 일괄 갱신
    await c.env.DB.prepare(
      'UPDATE card_items SET print_completed = 1, print_completed_at = CURRENT_TIMESTAMP, print_completed_by = ? WHERE card_id = ? AND print_completed = 0'
    ).bind(user?.id || null, id).run()

    // 2) pp_status 결정
    const hasPP = card.post_processing && card.post_processing !== '[]' && card.post_processing !== ''
    const ppStatus = hasPP ? 'PENDING' : 'N/A'

    // 3) 카드 상태 PRINT_DONE 전환
    await c.env.DB.prepare(
      "UPDATE cards SET status = 'PRINT_DONE', pp_status = ?, print_done_at = CURRENT_TIMESTAMP, hold_reason = NULL, hold_at = NULL, hold_by = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(ppStatus, id).run()

    // 4) 상태 이력 기록
    await c.env.DB.prepare(
      "INSERT INTO card_status_history (card_id, from_status, to_status, changed_by, change_reason) VALUES (?, ?, 'PRINT_DONE', ?, '출력완료')"
    ).bind(id, card.status, user?.id || null).run()

    // 5) 주문 상태 동기화
    await syncOrderStatusFromCards(c.env.DB, card.order_id)

    // 6) 진행률 반환
    const { results: allItems } = await c.env.DB.prepare(
      'SELECT print_completed FROM card_items WHERE card_id = ?'
    ).bind(id).all<{ print_completed: number }>()
    const total = allItems.length
    const done = allItems.filter((i) => i.print_completed === 1).length

    return c.json({
      success: true,
      data: { card_id: Number(id), status: 'PRINT_DONE', progress: { total, done } }
    })
  } catch (err) {
    console.error('card complete error:', err)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ===== 출력완료 → 진행중 되돌리기 =====
cardsLifecycleRouter.patch('/:id/revert', async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user')

    const ef = cardEntityScope(c)  // #432: 타 법인 카드 되돌리기 차단
    const card = await c.env.DB.prepare(
      `SELECT id, status, order_id, card_number FROM cards WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ id: number; status: string; order_id: number; card_number: string }>()

    if (!card) {
      return c.json({ success: false, error: 'Card not found' }, 404)
    }
    if (card.status !== 'PRINT_DONE') {
      return c.json({ success: false, error: '출력완료 상태의 카드만 되돌릴 수 있습니다.' }, 400)
    }

    // ★인쇄 자재 자동차감 환원 — 출력을 안 한 것으로 되돌리므로 자재도 돌아와야 한다.
    //   차감 기록까지 지우므로 **재출력하면 다시 차감된다**(UNIQUE print_event_id 로 막히지 않는다).
    await restoreAutoDeductionsByCards(c.env.DB, [Number(id)],
      { userId: user?.id ?? null, userName: user?.username ?? null, entityId: getEntityId(c) })

    // 카드를 출력대기(PRINT_PENDING)로 되돌림 — 단일 상태축(Phase 4). rip_status도 초기화하여 재RIP 가능.
    await c.env.DB.prepare(
      "UPDATE cards SET status = 'PRINT_PENDING', rip_status = NULL, print_done_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(id).run()

    // card_items의 print_completed도 모두 초기화
    await c.env.DB.prepare(
      'UPDATE card_items SET print_completed = 0, print_completed_at = NULL, print_completed_by = NULL WHERE card_id = ?'
    ).bind(id).run()

    // 주문 상태 동기화
    await syncOrderStatusFromCards(c.env.DB, card.order_id)

    return c.json({ success: true, message: '진행중으로 되돌렸습니다.' })
  } catch (err) {
    console.error('card revert error:', err)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})


export default cardsLifecycleRouter
