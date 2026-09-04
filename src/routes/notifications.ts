import { Hono } from 'hono'
import { RECEIVING_ZONE_JOIN_SQL } from '../utils/inventoryZone'
import type { HonoEnv } from '../types/env'
import type { D1Database } from '@cloudflare/workers-types'
import { authMiddleware, requireRole } from '../middleware/auth'
import { entityFilter, getEntityId } from '../utils/entityFilter'
import { excludeArExcludedClientsSql } from '../constants/arPolicy'
import { kstYmd, kstDate, kstDateOf } from '../utils/kstDate'

const notificationsRouter = new Hono<HonoEnv>()
notificationsRouter.use('/*', authMiddleware)

// ── nav-badges TTL 캐시 ──
// 미수금 카운트가 무거운 집계라 열린 탭 수 × 60초 폴링과 곱해지면 D1 읽기가 과금 지배 항목이 된다
// (2026-08 실측: 이 엔드포인트 하나가 일 28.5B행 = D1 읽기의 98% → 월 $99 과금). 재계산 자체를 TTL로 묶는다.
// key = entity:user (my-receiving이 user별, supervisorClause가 role 파생이라 user 단위면 충분)
const NAV_BADGE_TTL_MS = 5 * 60 * 1000
const navBadgeCache = new Map<string, { at: number, data: Record<string, number> }>()

// ── 알림 가시성 조건 (읽기·읽음처리 전 경로 공유) ──
// 개인 지정(user_id) + 자기 역할 대상 + **ADMIN 은 역할 지정 전부**.
// ADMIN 예외를 넣는 이유: `requirePagePermission` 에서 ADMIN 이 권한 매트릭스를 우회하는 것과 같은 규칙인데
//   알림만 예외가 없어서, `MANAGER` 역할 사용자가 0명인 동안 일일 알림 4종(납기지연·발주초과·장비정비·재고부족)이
//   **생성은 되는데 아무에게도 안 보였다** (2026-08-25 실측: target_role='MANAGER' 15건이 그렇게 쌓여 있었다).
// 바인드 순서 = user.id, user.role, user.role — `visibleParams()` 로 함께 넘긴다.
const VISIBLE_SQL = `(user_id = ? OR (user_id IS NULL AND (target_role = ? OR ? = 'ADMIN')))`
const visibleParams = (u: { id: number, role: string }) => [u.id, u.role, u.role]

// ── Helper: 중복 방지 알림 생성 (당일 동일 title 스킵) ──
// ⚠️ 중복 판정에 entity_id 를 반드시 넣는다 — cron 이 법인 루프를 돌 때 건수가 같으면 제목도 같아서
//    ("납기 지연 3건") 선명·청주 알림이 동산의 같은 제목 때문에 조용히 생성되지 않았다.
async function createIfNotExists(db: D1Database, targetRole: string, title: string, message: string, link: string, entityId: number = 1) {
  const existing = await db.prepare(
    `SELECT id FROM notifications WHERE target_role = ? AND title = ? AND entity_id = ? AND ${kstDateOf('created_at')} = ${kstDate()} LIMIT 1`
  ).bind(targetRole, title, entityId).first()
  if (existing) return
  await db.prepare(
    `INSERT INTO notifications (target_role, title, message, link, entity_id) VALUES (?, ?, ?, ?, ?)`
  ).bind(targetRole, title, message, link, entityId).run()
}

// Get notifications for current user
notificationsRouter.get('/', async (c) => {
  try {
    const user = c.get('user')
    const { limit = '20', unread_only = '' } = c.req.query()
    const safeLimit = Math.min(Number(limit) || 20, 50)

    const ef = entityFilter(c, '')
    let query = `SELECT id, user_id, target_role, title, message, link, is_read, created_at FROM notifications WHERE ${VISIBLE_SQL}${ef.clause}`
    const params: any[] = [...visibleParams(user), ...ef.params]

    if (unread_only === '1') {
      query += ' AND is_read = 0'
    }

    query += ' ORDER BY is_read ASC, created_at DESC, id DESC LIMIT ?'
    params.push(safeLimit)

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as count FROM notifications WHERE ${VISIBLE_SQL}${ef.clause} AND is_read = 0`
    ).bind(...visibleParams(user), ...ef.params).first<{ count: number }>()

    return c.json({
      success: true,
      data: results,
      unread_count: countResult?.count || 0
    })
  } catch (error) {
    console.error('src/routes/notifications.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// Get unread count only (lightweight polling)
notificationsRouter.get('/unread-count', async (c) => {
  try {
    const user = c.get('user')
    const ef = entityFilter(c, '')
    const result = await c.env.DB.prepare(
      `SELECT COUNT(*) as count FROM notifications WHERE ${VISIBLE_SQL} AND is_read = 0${ef.clause}`
    ).bind(...visibleParams(user), ...ef.params).first<{ count: number }>()

    return c.json({ success: true, count: result?.count || 0 })
  } catch (error) {
    console.error('notifications GET user error:', error)
    return c.json({ success: false, count: 0 }, 500)
  }
})

// Nav badge counts for sidebar
notificationsRouter.get('/nav-badges', async (c) => {
  try {
    const db = c.env.DB
    const user = c.get('user')
    const isSupervisor = user?.role === 'ADMIN' || user?.role === 'MANAGER'
    const supervisorClause = isSupervisor ? "OR sz.manager_id IS NULL OR sz.id IS NULL" : ""

    // entity 필터
    const entityId = c.get('entityId') as number

    const cacheKey = `${entityId || 0}:${user?.id || 0}`
    const cached = navBadgeCache.get(cacheKey)
    if (cached && Date.now() - cached.at < NAV_BADGE_TTL_MS) {
      return c.json({ success: true, data: cached.data })
    }
    const efOrders = (entityId && entityId > 0) ? ' AND entity_id = ?' : ''
    const efOrdersParams = (entityId && entityId > 0) ? [entityId] : []
    const efPO = (entityId && entityId > 0) ? ' AND po.entity_id = ?' : ''
    const efPOParams = (entityId && entityId > 0) ? [entityId] : []

    // nav-badge-receivables: /api/ledger/overdue와 동일 기준(청구그룹 BILLED·거래처별 overdue_alert_days·잔액>0).
    // 구 쿼리(orders.final_amount 합·주문생성일·30일 하드코딩)는 배너와 판정 불일치 → 폐기 (2026-07-20 #546)
    const efNbBg = entityFilter(c, 'g')
    const efNbPay = entityFilter(c, 'p')
    const efNbAdj = entityFilter(c, 'a')
    const efNbMain = entityFilter(c, 'g')

    const [orders, receivables, pr, inspPr, inspOverdue, myReceiving, tasksPending] = await Promise.all([
      db.prepare(`SELECT COUNT(*) as cnt FROM orders WHERE status = 'CONFIRMED'${efOrders}`).bind(...efOrdersParams).first<{ cnt: number }>(),
      // ⚠️ 성능 형태 주의: 구 형태(연체 그룹 행마다 GROUP BY 서브쿼리 3개를 LEFT JOIN)는 D1이
      // 자동 인덱스를 안 만들어 O(그룹행×거래처) = 실행당 690만 행을 읽었다(2026-08 과금 사고).
      // 거래처 단위로 먼저 접고(od/bg/pay/adj) 소집합끼리 조인하는 현재 형태를 유지할 것.
      // 판정 기준은 /api/ledger/overdue 와 동일(#546): 청구그룹 BILLED · 거래처별 overdue_alert_days · 잔액>0
      db.prepare(`
        WITH od AS (
          SELECT o.client_id AS cid
          FROM order_billing_groups g
          JOIN orders o ON o.id = g.order_id
          JOIN clients c ON o.client_id = c.id
          WHERE g.billing_status = 'BILLED'
            AND o.status != 'CANCELLED'
            AND date(COALESCE(g.accounting_date, g.billed_at), '+' || COALESCE(c.overdue_alert_days, 30) || ' days') < date('now', '+9 hours')
            ${efNbMain.clause}${excludeArExcludedClientsSql('c.id')}
          GROUP BY o.client_id
        ),
        bg AS (
          SELECT o.client_id AS cid, SUM(g.billed_amount) AS amt
          FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
          WHERE g.billing_status = 'BILLED' AND o.status != 'CANCELLED'${efNbBg.clause}
          GROUP BY o.client_id
        ),
        pay AS (
          SELECT p.client_id AS cid, SUM(p.amount) AS amt
          FROM payments p WHERE 1=1${efNbPay.clause}
          GROUP BY p.client_id
        ),
        adj AS (
          SELECT a.client_id AS cid, SUM(a.amount) AS amt
          FROM adjustments a WHERE 1=1${efNbAdj.clause}
          GROUP BY a.client_id
        )
        SELECT COUNT(*) as cnt
        FROM od
        LEFT JOIN bg ON bg.cid = od.cid
        LEFT JOIN pay ON pay.cid = od.cid
        LEFT JOIN adj ON adj.cid = od.cid
        WHERE (COALESCE(bg.amt, 0) - COALESCE(pay.amt, 0) - COALESCE(adj.amt, 0)) > 0
      `).bind(...efNbMain.params, ...efNbBg.params, ...efNbPay.params, ...efNbAdj.params).first<{ cnt: number }>(),
      db.prepare(`SELECT COUNT(*) as cnt FROM purchase_requests WHERE status = 'PENDING'${efOrders}`).bind(...efOrdersParams).first<{ cnt: number }>(),
      db.prepare(`SELECT COUNT(*) as cnt FROM inventory_receipts WHERE inspection_status = 'PENDING_REVIEW'${efOrders}`).bind(...efOrdersParams).first<{ cnt: number }>(),
      db.prepare(`SELECT COUNT(*) as cnt FROM inventory_receipts WHERE inspection_status IS NULL AND status != 'CANCELLED' AND created_at <= datetime('now', '-24 hours')${efOrders}`).bind(...efOrdersParams).first<{ cnt: number }>(),
      // nav-badge-my-receiving: 내 담당 창고 입고 대기 라인 수
      db.prepare(`
        SELECT COUNT(*) as cnt
        FROM purchase_order_items poi
        JOIN purchase_orders po ON po.id = poi.po_id
        LEFT JOIN items i ON i.id = poi.item_id
        -- 입고 귀속 창고 = **입고 큐·발주 상세와 같은 문장**(utils/inventoryZone.RECEIVING_ZONE_JOIN_SQL).
        --   사본을 두면 배지 숫자와 목록이 어긋난다.
        ${RECEIVING_ZONE_JOIN_SQL}
        WHERE poi.line_status IN ('PENDING','PARTIAL')
          AND po.status IN ('CONFIRMED','PARTIAL_RECEIVED')
          AND (sz.manager_id = ? ${supervisorClause})${efPO}
      `).bind(user?.id || 0, ...efPOParams).first<{ cnt: number }>(),
      db.prepare(`SELECT COUNT(*) as cnt FROM tasks WHERE status IN ('PENDING','PROCESSING','FAILED')${efOrders}`).bind(...efOrdersParams).first<{ cnt: number }>(),
    ])
    const inspTotal = (inspPr?.cnt || 0) + (inspOverdue?.cnt || 0)
    const data = {
      'nav-badge-orders': orders?.cnt || 0,
      'nav-badge-receivables': receivables?.cnt || 0,
      'nav-badge-pr': pr?.cnt || 0,
      'nav-badge-insp': inspTotal,
      'nav-badge-my-receiving': myReceiving?.cnt || 0,
      'nav-badge-tasks': tasksPending?.cnt || 0,
    }
    if (navBadgeCache.size > 100) {
      const cutoff = Date.now() - NAV_BADGE_TTL_MS
      for (const [k, v] of navBadgeCache) { if (v.at < cutoff) navBadgeCache.delete(k) }
    }
    navBadgeCache.set(cacheKey, { at: Date.now(), data })
    return c.json({ success: true, data })
  } catch (error: any) {
    console.error('nav-badges error:', error?.message || error)
    return c.json({ success: true, data: {} })
  }
})

// Mark all as read (must be before /:id/read)
notificationsRouter.patch('/read-all', async (c) => {
  try {
    const user = c.get('user')
    const ef = entityFilter(c) // #327: 역할 브로드캐스트 알림을 타 법인까지 읽음 처리 방지
    await c.env.DB.prepare(
      `UPDATE notifications SET is_read = 1 WHERE ${VISIBLE_SQL} AND is_read = 0${ef.clause}`
    ).bind(...visibleParams(user), ...ef.params).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/notifications.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// Mark single notification as read
notificationsRouter.patch('/:id/read', async (c) => {
  try {
    const user = c.get('user')
    const id = c.req.param('id')
    const ef = entityFilter(c) // #327: 역할 브로드캐스트 알림을 타 법인까지 읽음 처리 방지
    await c.env.DB.prepare(
      `UPDATE notifications SET is_read = 1 WHERE id = ? AND ${VISIBLE_SQL}${ef.clause}`
    ).bind(id, ...visibleParams(user), ...ef.params).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/notifications.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── POST /generate - 자동 알림 생성 (폴링 시 트리거) ──
notificationsRouter.post('/generate', async (c) => {
  try {
    const db = c.env.DB
    const today = kstYmd()
    const tomorrow = kstYmd(1)

    // 1. 납기 도래/지연 주문
    const ef = entityFilter(c, 'o')
    const { results: dueOrders } = await db.prepare(`
      SELECT o.order_number, o.delivery_date, c.client_name
      FROM orders o LEFT JOIN clients c ON o.client_id = c.id
      WHERE o.status IN ('CONFIRMED','PRINTING','PRINT_DONE')
        AND o.delivery_date IS NOT NULL
        AND o.delivery_date <= ?${ef.clause}
      ORDER BY o.delivery_date ASC, o.id ASC LIMIT 10
    `).bind(tomorrow, ...ef.params).all()

    if (dueOrders && dueOrders.length > 0) {
      const overdue = dueOrders.filter((o) => (o.delivery_date as string) <= today)
      const dueSoon = dueOrders.filter((o) => (o.delivery_date as string) > today)

      const eid = getEntityId(c) || 1
      if (overdue.length > 0) {
        await createIfNotExists(db, 'MANAGER',
          `납기 지연 ${overdue.length}건`,
          overdue.slice(0, 3).map((o) => `${o.order_number} (${o.client_name})`).join(', '),
          '/orders', eid)
      }
      if (dueSoon.length > 0) {
        await createIfNotExists(db, 'MANAGER',
          `내일 납기 ${dueSoon.length}건`,
          dueSoon.slice(0, 3).map((o) => `${o.order_number} (${o.client_name})`).join(', '),
          '/orders', eid)
      }
    }

    // 2. 발주 납기 초과
    const efPo = entityFilter(c)
    const overduePoResult = await db.prepare(`
      SELECT COUNT(*) as cnt FROM purchase_orders
      WHERE status IN ('CONFIRMED','PARTIAL_RECEIVED')
        AND expected_date IS NOT NULL AND expected_date < ?${efPo.clause}
    `).bind(today, ...efPo.params).first<{ cnt: number }>()

    if (overduePoResult?.cnt && overduePoResult.cnt > 0) {
      await createIfNotExists(db, 'MANAGER',
        `발주 납기 초과 ${overduePoResult.cnt}건`,
        '입고 대기 중인 발주서의 납기가 지났습니다.',
        '/purchase-orders', getEntityId(c) || 1)
    }

    // 3. 장비 소모품/정비 기한 도래
    const alertResult = await db.prepare(`
      SELECT COUNT(*) as cnt FROM (
        SELECT id FROM equipment_consumables
        WHERE next_due_at IS NOT NULL AND next_due_at <= ?
        UNION ALL
        SELECT id FROM maintenance_schedules
        WHERE is_active = 1 AND next_due_at IS NOT NULL AND next_due_at <= ?
      )
    `).bind(tomorrow, tomorrow).first<{ cnt: number }>()

    if (alertResult?.cnt && alertResult.cnt > 0) {
      await createIfNotExists(db, 'MANAGER',
        `장비 정비/소모품 알림 ${alertResult.cnt}건`,
        '교체 또는 정비 기한이 도래한 항목이 있습니다.',
        '/equipment', getEntityId(c) || 1)
    }

    // 4. 재고 부족 (reorder_point 설정된 품목)
    //    0396 다중행: 품목×법인 집계(SUM/MAX) + entity 필터 — 행단위 카운트는 창고 행마다 중복·타법인 합산 (2026-07-06 감사 #4)
    const lowEntityId = getEntityId(c)
    const lowEf = lowEntityId > 0 ? 'WHERE entity_id = ?' : ''
    const lowParams = lowEntityId > 0 ? [lowEntityId] : []
    const lowStockResult = await db.prepare(`
      SELECT COUNT(*) as cnt FROM (
        SELECT item_id FROM inventory
        ${lowEf}
        GROUP BY item_id, entity_id
        HAVING MAX(reorder_point) > 0 AND SUM(quantity) <= MAX(reorder_point)
      )
    `).bind(...lowParams).first<{ cnt: number }>()

    if (lowStockResult?.cnt && lowStockResult.cnt > 0) {
      await createIfNotExists(db, 'MANAGER',
        `재고 부족 ${lowStockResult.cnt}개 품목`,
        '재주문점 이하로 떨어진 재고 품목이 있습니다.',
        '/inventory', getEntityId(c) || 1)
    }

    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/notifications.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── DELETE old notifications (30일 이상) + 포털 토큰 정리 (90일) ──
// 역할 가드 필수 — 라우터는 authMiddleware 뿐이라 로그인만 하면 누구나 알림 전량과 포털 토큰을
// 지울 수 있었다. `?token_retention_days=1` 이면 이미 알림톡으로 나간 고객 링크가 통째로 죽는다.
// 보존일수도 하한을 둬 사고 반경을 줄인다(최소 7일).
notificationsRouter.delete('/cleanup', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const retentionDays = Math.max(7, Number(c.req.query('token_retention_days')) || 90)

    const [notifResult, tokenResult] = await Promise.all([
      c.env.DB.prepare(
        `DELETE FROM notifications WHERE created_at < datetime('now', '-30 days')`
      ).run(),
      c.env.DB.prepare(
        `DELETE FROM portal_access_tokens WHERE created_at < datetime('now', '-' || ? || ' days')`
      ).bind(retentionDays).run(),
    ])

    return c.json({
      success: true,
      data: {
        notifications_deleted: notifResult.meta?.changes || 0,
        tokens_deleted: tokenResult.meta?.changes || 0,
        token_retention_days: retentionDays,
      }
    })
  } catch (error) {
    console.error('src/routes/notifications.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default notificationsRouter
