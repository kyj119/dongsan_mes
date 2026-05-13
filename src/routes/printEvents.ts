import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, agentKeyMiddleware } from '../middleware/auth'
import { autoDeductInventory } from '../utils/autoDeductInventory'

const printEventsRouter = new Hono<HonoEnv>()

// 인쇄 소요시간(초) 계산 헬퍼
function calcPrintDuration(startedAt: string | null, completedAt: string | null): number | null {
  if (!startedAt || !completedAt) return null
  const start = new Date(startedAt).getTime()
  const end = new Date(completedAt).getTime()
  if (isNaN(start) || isNaN(end) || end <= start) return null
  return Math.round((end - start) / 1000)
}

// 인쇄 에러/취소 → quality_issues 자동 등록 헬퍼
async function autoCreateQualityIssue(
  db: any, cardId: number, printStatus: string, agentId: string,
  filePath: string, copyTotal: number
) {
  const issueType = printStatus === 'ERROR' ? 'DEFECT' : 'REWORK'
  const defectCategory = 'OTHER'
  const description = printStatus === 'ERROR'
    ? `인쇄 에러 자동 감지 (${agentId}, 파일: ${filePath})`
    : `인쇄 취소 자동 감지 (${copyTotal}매 중 취소, ${agentId})`
  try {
    await db.prepare(`
      INSERT INTO quality_issues (card_id, issue_type, defect_category, description, status, reported_by, reported_at, entity_id)
      VALUES (?, ?, ?, ?, 'REPORTED', 1, CURRENT_TIMESTAMP, COALESCE((SELECT entity_id FROM cards WHERE id = ?), 1))
    `).bind(cardId, issueType, defectCategory, description, cardId).run()
  } catch { /* 중복 등 무시 */ }
}

// ─── 카드 매칭 헬퍼 ───
// 파일명에서 order_number + file_seq를 추출하고, print_file_map → fallback regex 순으로 카드 조회
async function resolveCard(db: any, extractedName: string): Promise<{
  cardId: number | null, cardNumber: string | null, orderNumber: string | null, orderItemId: number | null
}> {
  // 1차: file_map 조회 (YYYYMMDD-NNN-FFF 패턴)
  const seqMatch = extractedName.match(/^(\d{8}-\d{3})-(\d{3})/)
  if (seqMatch) {
    const orderNum = seqMatch[1]
    const fileSeq = parseInt(seqMatch[2])
    const map = await db.prepare(
      'SELECT card_id, card_number, order_item_id FROM print_file_map WHERE order_number = ? AND file_seq = ?'
    ).bind(orderNum, fileSeq).first() as any
    if (map) return { cardId: map.card_id, cardNumber: map.card_number, orderNumber: orderNum, orderItemId: map.order_item_id || null }
  }
  // 2차: 파일명 직접 매칭
  const fnMap = await db.prepare(
    'SELECT card_id, card_number, order_number, order_item_id FROM print_file_map WHERE file_name = ?'
  ).bind(extractedName).first() as any
  if (fnMap) return { cardId: fnMap.card_id, cardNumber: fnMap.card_number, orderNumber: fnMap.order_number, orderItemId: fnMap.order_item_id || null }
  // 3차: 기존 regex fallback (order_number만)
  const orderMatch = extractedName.match(/(\d{8}-\d{3})/)
  return { cardId: null, cardNumber: null, orderNumber: orderMatch?.[1] || null, orderItemId: null }
}

// ─── 타일 완료 판단: 같은 파일의 고유 tile_index 기준 ───
async function checkAllTilesComplete(db: any, filePath: string, tileCount: number): Promise<boolean> {
  if (!tileCount || tileCount <= 1) return true // 타일 분할 없으면 즉시 완료
  // 같은 file_path에서 OK인 고유 tile_index 개수 카운트
  const result = await db.prepare(
    "SELECT COUNT(DISTINCT tile_index) as done_tiles FROM print_events WHERE file_path = ? AND print_status = 'OK' AND tile_index > 0"
  ).bind(filePath).first() as any
  return (result?.done_tiles || 0) >= tileCount
}

// ─── card_item 자동 체크 + 전체 완료 시 PRINT_DONE 전환 ───
async function autoCheckCardItem(db: any, cardId: number, orderItemId: number | null, agentId: string): Promise<void> {
  // orderItemId로 card_item 찾기
  if (orderItemId) {
    await db.prepare(
      'UPDATE card_items SET print_completed = 1, print_completed_at = CURRENT_TIMESTAMP WHERE card_id = ? AND order_item_id = ? AND print_completed = 0'
    ).bind(cardId, orderItemId).run()
  }

  // 모든 card_items 완료 여부 확인
  const { results: allItems } = await db.prepare(
    'SELECT print_completed FROM card_items WHERE card_id = ?'
  ).bind(cardId).all() as any

  if (!allItems || allItems.length === 0) return

  const total = allItems.length
  const done = allItems.filter((i: any) => i.print_completed === 1).length
  const allDone = total > 0 && done === total

  if (allDone) {
    // 카드 상태 확인
    const card = await db.prepare('SELECT status, post_processing, order_id FROM cards WHERE id = ?').bind(cardId).first() as any
    if (card && card.status !== 'PRINT_DONE') {
      // 후가공 여부 → pp_status
      const hasPP = card.post_processing && card.post_processing !== '[]' && card.post_processing !== ''
      const ppStatus = hasPP ? 'PENDING' : 'N/A'

      await db.prepare(
        "UPDATE cards SET status = 'PRINT_DONE', rip_status = 'COMPLETED', pp_status = ?, print_done_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(ppStatus, cardId).run()
      await db.prepare(
        "INSERT INTO card_status_history (card_id, from_status, to_status, changed_by, change_reason) VALUES (?, ?, 'PRINT_DONE', 1, ?)"
      ).bind(cardId, card.status, `All items printed (${agentId})`).run()

      // 주문 상태 동기화
      if (card.order_id) {
        try {
          // syncOrderStatus는 cards.ts 내부 함수라 직접 호출 불가 → 동일 로직 적용
          const { results: siblingCards } = await db.prepare(
            "SELECT status FROM cards WHERE order_id = ? AND status != 'HOLD'"
          ).bind(card.order_id).all() as any
          const orderCheck = await db.prepare(
            "SELECT status FROM orders WHERE id = ?"
          ).bind(card.order_id).first() as any
          const statuses = (siblingCards || []).map((c: any) => c.status)
          let newOrderStatus = null
          if (statuses.every((s: string) => s === 'PRINT_DONE')) {
            newOrderStatus = 'PRINT_DONE'
          } else if (statuses.some((s: string) => s === 'PRINTING')) {
            // CONFIRMED 상태에서 모든 카드가 PRINTING(실제 출력 미시작)이면 전이하지 않음
            if (orderCheck?.status === 'CONFIRMED' && !statuses.some((s: string) => s === 'PRINT_DONE')) {
              newOrderStatus = null
            } else {
              newOrderStatus = 'PRINTING'
            }
          }
          if (newOrderStatus && newOrderStatus !== orderCheck?.status) {
            await db.prepare(
              'UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
            ).bind(newOrderStatus, card.order_id).run()
          }
        } catch { /* 주문 동기화 실패는 무시 */ }
      }
    }
  }
}

// ─── Agent endpoints (API key auth) ───

// POST /api/print-events/file-map — IA가 파일 생성 시 매핑 등록
printEventsRouter.post('/file-map', agentKeyMiddleware, async (c) => {
  try {
    const { order_number, file_seq, card_id, card_number, file_name, order_item_id } = await c.req.json()

    if (!order_number || !file_seq || !file_name) {
      return c.json({ success: false, error: 'order_number, file_seq, file_name required' }, 400)
    }

    await c.env.DB.prepare(`
      INSERT INTO print_file_map (order_number, file_seq, card_id, card_number, order_item_id, file_name)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(order_number, file_seq) DO UPDATE SET
        card_id = excluded.card_id,
        card_number = excluded.card_number,
        order_item_id = excluded.order_item_id,
        file_name = excluded.file_name
    `).bind(order_number, file_seq, card_id || null, card_number || null, order_item_id || null, file_name).run()

    return c.json({ success: true, data: { order_number, file_seq, card_number } })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// POST /api/print-events — receive print event from LogWatcher
printEventsRouter.post('/', agentKeyMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const { agent_id, equipment_id, file_path, print_status, print_completed_at,
            file_name, printer_name, print_started_at,
            output_width, output_height, dpi,
            copy_columns, copy_rows, copy_total, tile_count, tile_index } = body

    if (!agent_id || !file_path || !print_status) {
      return c.json({ success: false, error: 'agent_id, file_path, print_status required' }, 400)
    }

    const validStatuses = ['OK', 'CANCEL', 'ERROR']
    if (!validStatuses.includes(print_status)) {
      return c.json({ success: false, error: 'print_status must be OK, CANCEL, or ERROR' }, 400)
    }

    // Idempotency check
    const existing = await c.env.DB.prepare(
      'SELECT id FROM print_events WHERE file_path = ? AND print_completed_at = ?'
    ).bind(file_path, print_completed_at || '').first()

    if (existing) {
      return c.json({ success: true, message: 'Event already recorded', data: { id: (existing as any).id, duplicate: true } })
    }

    // Extract card/order from file-map or regex fallback
    const extractedName = file_name || file_path.replace(/^.*[\\\/]/, '').replace(/\.[^.]+$/, '')
    const resolved = await resolveCard(c.env.DB, extractedName)
    const cardNumber = resolved.cardNumber
    const orderNumber = resolved.orderNumber
    let cardId = resolved.cardId

    // file_map에서 cardId를 찾았으면 카드 상태 조회, 못 찾았으면 cardNumber로 직접 조회
    if (cardId || cardNumber) {
      const card = cardId
        ? await c.env.DB.prepare('SELECT id, status FROM cards WHERE id = ?').bind(cardId).first() as any
        : cardNumber
          ? await c.env.DB.prepare('SELECT id, status FROM cards WHERE card_number = ?').bind(cardNumber).first() as any
          : null
      if (card) {
        cardId = card.id
        // Auto-update card status for OK — 타일 인식 방식
        if (print_status === 'OK' && card.status !== 'PRINT_DONE') {
          // PRINTING 상태로 전환 (아직 RIP_WAITING이면)
          if (card.status === 'RIP_WAITING') {
            await c.env.DB.prepare(
              "UPDATE cards SET status = 'PRINTING', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
            ).bind(card.id).run()
          }
          // 타일 전체 완료 여부 확인 (이벤트 INSERT 전이므로 현재 건 포함 위해 +1 또는 INSERT 후 체크)
          // → INSERT 후에 체크하도록 아래 afterInsert 플래그 설정
        }
        // Cancel 시 카드 상태를 ERROR로 변경
        if (print_status === 'CANCEL') {
          const copyTotalVal = copy_total || 1
          const reason = copyTotalVal > 1
            ? `Print cancelled (${copyTotalVal}매 배열출력 중 취소) on ${agent_id}`
            : `Print cancelled on ${agent_id}`
          await c.env.DB.prepare(
            `UPDATE cards SET rip_status = 'ERROR', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
          ).bind(card.id).run()
        }
        // ERROR/CANCEL → quality_issues 자동 등록
        if (print_status === 'ERROR' || print_status === 'CANCEL') {
          await autoCreateQualityIssue(c.env.DB, card.id, print_status, agent_id, file_path, copy_total || 1)
        }
      }
    }

    // 인쇄 소요시간 계산
    const durationSec = calcPrintDuration(print_started_at, print_completed_at)

    // Insert event
    const result = await c.env.DB.prepare(`
      INSERT INTO print_events (
        agent_id, equipment_id, card_number, card_id, order_number, file_path, file_name,
        printer_name, print_status, print_started_at, print_completed_at, print_duration_sec,
        output_width, output_height, dpi,
        copy_columns, copy_rows, copy_total, tile_count, tile_index
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      agent_id, equipment_id || null, cardNumber, cardId, orderNumber, file_path, extractedName,
      printer_name || null, print_status, print_started_at || null,
      print_completed_at || null, durationSec,
      output_width || null, output_height || null,
      dpi || null,
      copy_columns || 1, copy_rows || 1, copy_total || 1,
      tile_count || 0, tile_index || 0
    ).run()

    const printEventId = result.meta.last_row_id as number

    // 타일 완료 체크 → card_item 자동 체크 → 전체 완료 시 PRINT_DONE 전환
    if (print_status === 'OK' && cardId) {
      try {
        const tileComplete = await checkAllTilesComplete(c.env.DB, file_path, tile_count || 0)
        if (tileComplete) {
          await autoCheckCardItem(c.env.DB, cardId, resolved.orderItemId, agent_id)
        }
      } catch (tileError) {
        console.error('Tile completion check error:', tileError)
      }
    }

    // Auto-deduct inventory if print_status === 'OK'
    let deductionResult = null
    if (print_status === 'OK' && printEventId) {
      try {
        deductionResult = await autoDeductInventory(c.env.DB, printEventId)
      } catch (deductError) {
        // Log deduction error but don't fail the API response
        console.error('Inventory deduction error:', deductError)
      }
    }

    return c.json({
      success: true,
      data: {
        id: printEventId,
        card_number: cardNumber,
        card_matched: cardId !== null,
        duplicate: false,
        deduction: deductionResult
      }
    })
  } catch (error) {
    console.error('src/routes/printEvents.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// POST /api/print-events/heartbeat — agent heartbeat
printEventsRouter.post('/heartbeat', agentKeyMiddleware, async (c) => {
  try {
    const { agent_id, equipment_id, agent_version, ip_address, print_log_path, is_printing } = await c.req.json()

    if (!agent_id) {
      return c.json({ success: false, error: 'agent_id required' }, 400)
    }

    const isPrinting = is_printing ? 1 : 0

    await c.env.DB.prepare(`
      INSERT INTO agent_heartbeats (agent_id, equipment_id, agent_version, ip_address, last_seen_at, print_log_path, status, is_printing, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, 'online', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(agent_id) DO UPDATE SET
        equipment_id = excluded.equipment_id,
        agent_version = excluded.agent_version,
        ip_address = excluded.ip_address,
        last_seen_at = CURRENT_TIMESTAMP,
        print_log_path = excluded.print_log_path,
        status = 'online',
        is_printing = excluded.is_printing,
        updated_at = CURRENT_TIMESTAMP
    `).bind(agent_id, equipment_id || null, agent_version || null, ip_address || null, print_log_path || null, isPrinting).run()

    // equipment_status 자동 전환: RUNNING/IDLE만 자동, MAINTENANCE/BROKEN은 수동 유지
    if (equipment_id) {
      const equip = await c.env.DB.prepare(
        'SELECT equipment_status FROM equipment WHERE id = ?'
      ).bind(equipment_id).first() as any

      if (equip) {
        const currentStatus = equip.equipment_status || 'IDLE'
        // 수동 상태(MAINTENANCE/BROKEN)는 자동 전환하지 않음
        if (currentStatus !== 'MAINTENANCE' && currentStatus !== 'BROKEN') {
          const newStatus = isPrinting ? 'RUNNING' : 'IDLE'
          if (currentStatus !== newStatus) {
            await c.env.DB.prepare(
              'UPDATE equipment SET equipment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
            ).bind(newStatus, equipment_id).run()
          }
        }
      }
    }

    return c.json({ success: true, message: 'Heartbeat received' })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// POST /api/print-events/batch — receive multiple events at once
printEventsRouter.post('/batch', agentKeyMiddleware, async (c) => {
  try {
    const { agent_id, equipment_id, events } = await c.req.json()

    if (!agent_id || !Array.isArray(events) || events.length === 0) {
      return c.json({ success: false, error: 'agent_id and events array required' }, 400)
    }

    let inserted = 0
    let duplicates = 0
    let errors = 0

    for (const evt of events) {
      try {
        // Idempotency
        const existing = await c.env.DB.prepare(
          'SELECT id FROM print_events WHERE file_path = ? AND print_completed_at = ?'
        ).bind(evt.file_path, evt.print_completed_at || '').first()

        if (existing) { duplicates++; continue }

        const extractedName = evt.file_name || evt.file_path.replace(/^.*[\\\/]/, '').replace(/\.[^.]+$/, '')
        const resolved = await resolveCard(c.env.DB, extractedName)
        const cardNumber = resolved.cardNumber
        const orderNumber = resolved.orderNumber
        let cardId = resolved.cardId

        // file_map 또는 fallback으로 카드 매칭 (status + post_processing 1쿼리로 조회)
        if (cardId || cardNumber) {
          const card = cardId
            ? await c.env.DB.prepare('SELECT id, status, post_processing FROM cards WHERE id = ?').bind(cardId).first() as any
            : cardNumber
              ? await c.env.DB.prepare('SELECT id, status, post_processing FROM cards WHERE card_number = ?').bind(cardNumber).first() as any
              : null
          if (card) {
            cardId = card.id
            if (evt.print_status === 'OK' && card.status !== 'PRINT_DONE') {
              const bHasPP = card.post_processing && card.post_processing !== '[]' && card.post_processing !== ''
              const bPpStatus = bHasPP ? 'PENDING' : 'N/A'

              await c.env.DB.batch([
                c.env.DB.prepare(
                  `UPDATE cards SET status = 'PRINT_DONE', rip_status = 'COMPLETED',
                   pp_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
                ).bind(bPpStatus, card.id),
                c.env.DB.prepare(
                  `INSERT INTO card_status_history (card_id, from_status, to_status, changed_by, change_reason)
                   VALUES (?, ?, 'PRINT_DONE', 1, ?)`
                ).bind(card.id, card.status, `Print completed on ${agent_id}`)
              ])
            }
            if (evt.print_status === 'CANCEL') {
              const evtCopyTotal = evt.copy_total || 1
              const reason = evtCopyTotal > 1
                ? `Print cancelled (${evtCopyTotal}매 배열출력 중 취소) on ${agent_id}`
                : `Print cancelled on ${agent_id}`
              await c.env.DB.batch([
                c.env.DB.prepare(
                  `UPDATE cards SET rip_status = 'ERROR', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
                ).bind(card.id),
                c.env.DB.prepare(
                  `INSERT INTO card_status_history (card_id, from_status, to_status, changed_by, change_reason)
                   VALUES (?, ?, ?, 1, ?)`
                ).bind(card.id, card.status, card.status, reason)
              ])
            }
            if (evt.print_status === 'ERROR' || evt.print_status === 'CANCEL') {
              await autoCreateQualityIssue(c.env.DB, card.id, evt.print_status, agent_id, evt.file_path, evt.copy_total || 1)
            }
          }
        }

        const evtDuration = calcPrintDuration(evt.print_started_at, evt.print_completed_at)

        const batchResult = await c.env.DB.prepare(`
          INSERT INTO print_events (
            agent_id, equipment_id, card_number, card_id, order_number, file_path, file_name,
            printer_name, print_status, print_started_at, print_completed_at, print_duration_sec,
            output_width, output_height, dpi,
            copy_columns, copy_rows, copy_total, tile_count, tile_index
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          agent_id, equipment_id || null, cardNumber, cardId, orderNumber,
          evt.file_path, extractedName, evt.printer_name || null,
          evt.print_status, evt.print_started_at || null,
          evt.print_completed_at || null, evtDuration, evt.output_width || null,
          evt.output_height || null, evt.dpi || null,
          evt.copy_columns || 1, evt.copy_rows || 1, evt.copy_total || 1,
          evt.tile_count || 0, evt.tile_index || 0
        ).run()

        const batchPrintEventId = batchResult.meta.last_row_id as number

        // Auto-deduct inventory if print_status === 'OK'
        if (evt.print_status === 'OK' && batchPrintEventId) {
          try {
            await autoDeductInventory(c.env.DB, batchPrintEventId)
          } catch {
            // Log but don't fail batch processing
          }
        }

        inserted++
      } catch {
        errors++
      }
    }

    return c.json({
      success: true,
      data: { inserted, duplicates, errors, total: events.length }
    })
  } catch (error) {
    console.error('src/routes/printEvents.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ─── Dashboard endpoints (JWT auth) ───

// PATCH /api/print-events/:id/actual-printed — Cancel 이벤트에 실제 출력 매수 입력
printEventsRouter.patch('/:id/actual-printed', authMiddleware, async (c) => {
  try {
    const eventId = c.req.param('id')
    const { actual_printed } = await c.req.json()

    if (actual_printed === undefined || actual_printed === null) {
      return c.json({ success: false, error: 'actual_printed is required' }, 400)
    }

    // 이벤트 존재 확인
    const event = await c.env.DB.prepare(
      'SELECT id, print_status, copy_total FROM print_events WHERE id = ?'
    ).bind(eventId).first()

    if (!event) {
      return c.json({ success: false, error: 'Event not found' }, 404)
    }

    // JWT에서 사용자 정보 추출
    const user = c.get('user') as any
    const userName = user?.username || 'unknown'

    await c.env.DB.prepare(`
      UPDATE print_events SET
        actual_printed = ?,
        actual_printed_by = ?,
        actual_printed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(actual_printed, userName, eventId).run()

    return c.json({
      success: true,
      data: { id: eventId, actual_printed }
    })
  } catch (error) {
    console.error('src/routes/printEvents.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// GET /api/print-events — list events with filters
printEventsRouter.get('/', authMiddleware, async (c) => {
  try {
    const { page = '1', limit = '50', agent_id = '', equipment_id = '', status = '', date = '' } = c.req.query()
    const offset = (parseInt(page) - 1) * parseInt(limit)

    let where = 'WHERE 1=1'
    const params: any[] = []

    if (agent_id) {
      where += ' AND pe.agent_id = ?'
      params.push(agent_id)
    }
    if (equipment_id) {
      where += ' AND pe.equipment_id = ?'
      params.push(equipment_id)
    }
    if (status) {
      where += ' AND pe.print_status = ?'
      params.push(status)
    }
    if (date) {
      where += ' AND date(pe.print_completed_at) = ?'
      params.push(date)
    }

    // Count
    const countQuery = `SELECT COUNT(*) as count FROM print_events pe ${where}`
    const { count } = await c.env.DB.prepare(countQuery).bind(...params).first() as any

    const selectQuery = `SELECT pe.*, COALESCE(pe.printer_name, eq.printer_name) as printer_name FROM print_events pe LEFT JOIN equipment eq ON pe.equipment_id = eq.id ${where} ORDER BY COALESCE(pe.print_completed_at, pe.created_at) DESC LIMIT ? OFFSET ?`
    params.push(parseInt(limit), offset)
    const { results } = await c.env.DB.prepare(selectQuery).bind(...params).all()

    return c.json({
      success: true,
      data: results,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        total_pages: Math.ceil(count / parseInt(limit))
      }
    })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// GET /api/print-events/agents — list all agents with status
printEventsRouter.get('/agents', authMiddleware, async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT *,
        CASE
          WHEN last_seen_at IS NULL THEN 'unknown'
          WHEN (julianday('now') - julianday(last_seen_at)) * 86400 > 120 THEN 'offline'
          ELSE 'online'
        END as computed_status
      FROM agent_heartbeats
      ORDER BY last_seen_at DESC
    `).all()

    const online = (results as any[]).filter((a: any) => a.computed_status === 'online').length
    const offline = (results as any[]).filter((a: any) => a.computed_status === 'offline').length

    return c.json({
      success: true,
      data: {
        agents: results,
        summary: { total: results.length, online, offline }
      }
    })
  } catch (error) {
    console.error('src/routes/printEvents.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// GET /api/print-events/stats — print statistics
printEventsRouter.get('/stats', authMiddleware, async (c) => {
  try {
    const { days = '7' } = c.req.query()

    // Today summary
    const todaySummary = await c.env.DB.prepare(`
      SELECT
        COUNT(CASE WHEN print_status = 'OK' THEN 1 END) as ok_count,
        COUNT(CASE WHEN print_status = 'ERROR' THEN 1 END) as error_count,
        COUNT(CASE WHEN print_status = 'CANCEL' THEN 1 END) as cancel_count,
        COUNT(*) as total_count
      FROM print_events
      WHERE date(created_at) = date('now')
    `).first() as any

    // Daily breakdown
    const { results: daily } = await c.env.DB.prepare(`
      SELECT
        date(created_at) as date,
        COUNT(CASE WHEN print_status = 'OK' THEN 1 END) as ok_count,
        COUNT(CASE WHEN print_status = 'ERROR' THEN 1 END) as error_count,
        COUNT(CASE WHEN print_status = 'CANCEL' THEN 1 END) as cancel_count,
        COUNT(*) as total_count
      FROM print_events
      WHERE date(created_at) >= date('now', ? || ' days')
      GROUP BY date(created_at)
      ORDER BY date DESC
    `).bind(`-${days}`).all()

    // Top agents today
    const { results: topAgents } = await c.env.DB.prepare(`
      SELECT agent_id, COUNT(*) as count,
        COUNT(CASE WHEN print_status = 'OK' THEN 1 END) as ok_count
      FROM print_events
      WHERE date(created_at) = date('now')
      GROUP BY agent_id
      ORDER BY count DESC
      LIMIT 10
    `).all()

    // Recent events (last 20)
    const { results: recent } = await c.env.DB.prepare(`
      SELECT * FROM print_events
      ORDER BY created_at DESC LIMIT 20
    `).all()

    return c.json({
      success: true,
      data: {
        today: todaySummary,
        daily,
        top_agents: topAgents,
        recent
      }
    })
  } catch (error) {
    console.error('src/routes/printEvents.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

export default printEventsRouter