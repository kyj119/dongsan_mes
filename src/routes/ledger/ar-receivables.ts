/**
 * ledger/ar-receivables.ts — 미수금/정합성 라우트 (accounts-receivable.ts에서 분리, 2026-06-12 대형파일 분할 3/5)
 *
 * 정합성(integrity-check·integrity-fix·recalculate) · 미수금 경고(overdue) ·
 * 미수금 목록/주문/연체체크(receivables·:id/orders·check-overdue) · 평균 회수기간(collection-period).
 * 배럴(accounts-receivable.ts)에서 마운트. ⚠️ 이동만, 로직 수정 0.
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import { authMiddleware } from '../../middleware/auth'
import { requireEditOrRole } from '../../middleware/permissions'
import { notifyRoles } from '../../utils/notify'
import { entityFilter } from '../../utils/entityFilter'
import { kstYmd } from '../../utils/kstDate'
import { excludeArExcludedClientsSql } from '../../constants/arPolicy'
import {
  deriveClientBalance, buildIntegrityQuery, getAgingCategory, queryFifoOverdue, agingDaysFromOldest,
  type PaymentRow, type IntegrityRow, type ReceivableClientRow,
  type ReceivableOrderRow, type NotifLinkRow,
} from './ar-helpers'

const arReceivablesRouter = new Hono<HonoEnv>()
arReceivablesRouter.use('/*', authMiddleware, requireEditOrRole('/ledger', 'MANAGER'))

// =============================================================================
// 잔액 재계산 / 미수금 경고 / 감액 관리
// =============================================================================

// GET /integrity-check - 전체 거래처 잔액 정합성 검사
arReceivablesRouter.get('/integrity-check', requireEditOrRole('/ledger', 'MANAGER'), async (c) => {
  try {
    const { query: integrityQuery, params: integrityParams } = buildIntegrityQuery(c)
    const { results: rows } = integrityParams.length > 0
      ? await c.env.DB.prepare(integrityQuery).bind(...integrityParams).all<IntegrityRow>()
      : await c.env.DB.prepare(integrityQuery).all<IntegrityRow>()

    interface DiscrepancyRow { client_id: number; client_code: string; client_name: string; cached_balance: number; calculated_balance: number; difference: number }
    const discrepancies: DiscrepancyRow[] = []
    for (const row of rows) {
      const calculated = Number(row.total_billed) - Number(row.total_paid) - Number(row.total_adj)
      const cached = Number(row.balance) || 0
      if (Math.abs(calculated - cached) > 0.01) {
        discrepancies.push({
          client_id: row.id,
          client_code: row.client_code,
          client_name: row.client_name,
          cached_balance: cached,
          calculated_balance: +(calculated.toFixed(2)),
          difference: +(calculated - cached).toFixed(2)
        })
      }
    }

    return c.json({
      success: true,
      data: {
        total_checked: rows.length,
        discrepancy_count: discrepancies.length,
        discrepancies
      }
    })
  } catch (error) {
    console.error('src/routes/ledger.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /integrity-fix - 불일치 거래처 일괄 재계산
arReceivablesRouter.post('/integrity-fix', requireEditOrRole('/ledger', 'MANAGER'), async (c) => {
  try {
    const { client_ids } = await c.req.json() as { client_ids?: number[] }

    const { query: integrityQuery, params: integrityParams } = buildIntegrityQuery(c)
    const { results: rows } = integrityParams.length > 0
      ? await c.env.DB.prepare(integrityQuery).bind(...integrityParams).all<IntegrityRow>()
      : await c.env.DB.prepare(integrityQuery).all<IntegrityRow>()

    let fixed = 0
    interface FixResult { client_id: number; client_name: string; old: number; new: number }
    const fixResults: FixResult[] = []

    for (const row of rows) {
      if (client_ids && client_ids.length > 0 && !client_ids.includes(row.id)) continue

      const calculated = Number(row.total_billed) - Number(row.total_paid) - Number(row.total_adj)
      const cached = Number(row.balance) || 0

      if (Math.abs(calculated - cached) > 0.01) {
        // X5: clients.balance 캐시 폐기 — 미수금 정본=파생(deriveClientBalance). 죽은 캐시에 write하지 않고 차이만 리포트.
        fixResults.push({ client_id: row.id, client_name: row.client_name, old: cached, new: +(calculated.toFixed(2)) })
        fixed++
      }
    }

    return c.json({
      success: true,
      data: { fixed, results: fixResults },
      message: `${fixed}건 잔액 수정 완료`
    })
  } catch (error) {
    console.error('src/routes/ledger.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /recalculate/:clientId - 잔액 재계산 (MANAGER+)
arReceivablesRouter.post('/recalculate/:clientId', requireEditOrRole('/ledger', 'MANAGER'), async (c) => {
  try {
    const clientId = c.req.param('clientId')

    const client = await c.env.DB.prepare(
      'SELECT id, balance FROM clients WHERE id = ?'
    ).bind(clientId).first<{ id: number; balance: number }>()

    if (!client) {
      return c.json({ success: false, error: 'Client not found' }, 404)
    }

    // 실계산: BILLED 청구그룹 합계 (split billing P3: 청구 법인 g 기준)
    const { clause: recalcOrderEf, params: recalcOrderEfParams } = entityFilter(c, 'g')
    const billedRow = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(CASE WHEN g.billing_status = 'BILLED' THEN g.billed_amount ELSE 0 END), 0) as total_billed
      FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
      WHERE o.client_id = ? AND o.status != 'CANCELLED'${recalcOrderEf}
    `).bind(clientId, ...recalcOrderEfParams).first<{ total_billed: number }>()

    // 입금 합계
    const { clause: recalcPaymentEf, params: recalcPaymentEfParams } = entityFilter(c)
    const paymentRow = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total_payments FROM payments WHERE client_id = ?${recalcPaymentEf}
    `).bind(clientId, ...recalcPaymentEfParams).first<{ total_payments: number }>()

    // 감액 합계
    const { clause: recalcAdjEf, params: recalcAdjEfParams } = entityFilter(c)
    const adjRow = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total_adjustments FROM adjustments WHERE client_id = ?${recalcAdjEf}
    `).bind(clientId, ...recalcAdjEfParams).first<{ total_adjustments: number }>()

    const newBalance = Number(billedRow!.total_billed) - Number(paymentRow!.total_payments) - Number(adjRow!.total_adjustments)
    const oldBalance = Number(client.balance) || 0

    // X5: clients.balance 캐시 폐기 — 미수금 정본=파생. 캐시 write 제거(파생값을 리포트만).

    return c.json({
      success: true,
      data: {
        old_balance: oldBalance,
        new_balance: newBalance,
        difference: newBalance - oldBalance
      }
    })
  } catch (error) {
    console.error('Recalculate balance error:', error)
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// GET /overdue - 미수금 경고 목록
//   판정 = FIFO 충당 SSOT(ar-helpers.queryFifoOverdue). 종전 `min(연체청구합, 잔액)`(=LIFO 가정)은
//   거래 중인 거래처의 최근 청구분 잔액까지 연체로 계상해 경고가 과대했다(2026-08-11 정정).
arReceivablesRouter.get('/overdue', async (c) => {
  try {
    const rows = (await queryFifoOverdue(c)).map(r => ({
      client_id: r.client_id,
      client_name: r.client_name,
      overdue_alert_days: r.overdue_alert_days,
      overdue_count: r.overdue_count,
      overdue_amount: r.overdue_amount,
      carryover_amount: r.carryover_amount,   // 이관 기초잔액(OPEN 전표) 유래분 — UI '이월' 표기용
      oldest_billed_at: r.oldest_unpaid_at,
    }))

    return c.json({ success: true, data: rows })
  } catch (error) {
    console.error('Get overdue error:', error)
    console.error('src/routes/ledger.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// =============================================================================
// 미수금 Aging 상세 분석
// =============================================================================

// GET /receivables - 미수금 거래처 전체 목록
arReceivablesRouter.get('/receivables', async (c) => {
  try {
    const { sort = 'balance_desc', min_balance = '0', overdue_only = '' } = c.req.query()
    const minBalance = parseFloat(min_balance)

    // split billing P3: clients.balance 캐시 폐기 → (거래처 미수금) 파생. billed=order_billing_groups[BILLED](청구법인 g), 미수=billed−payments−adjustments.
    // 확장성: 거래처별 상관 서브쿼리(O(clients×scans)) → client_id 사전집계 서브쿼리 LEFT JOIN(O(1 pass))로 재작성. 값 동일(dashboard.ts H4 동일 패턴).
    const efBg = entityFilter(c, 'g')     // billed_sum + billed_order_count (동일 조인·필터 → 1회 집계로 통합)
    const efPay = entityFilter(c, 'p')    // paid_sum + last_payment_date (동일 소스 → 1회 집계로 통합)
    const efAdj = entityFilter(c, 'a')    // adj_sum
    const efOupG = entityFilter(c, 'g')   // oldest_unpaid_date 대상 청구그룹
    const efOupP = entityFilter(c, 'p')   // oldest_unpaid_date NOT EXISTS 결제
    const { results: clients } = await c.env.DB.prepare(`
      SELECT * FROM (
        SELECT
          c.id,
          c.client_code,
          c.client_name,
          c.overdue_alert_days,
          (COALESCE(bg.billed_sum, 0) - COALESCE(pay.paid_sum, 0) - COALESCE(adj.adj_sum, 0)) as balance,
          pay.last_payment_date as last_payment_date,
          COALESCE(bg.billed_order_count, 0) as billed_order_count,
          oup.oldest_unpaid_date as oldest_unpaid_date
        FROM clients c
        LEFT JOIN (
          SELECT o.client_id AS client_id,
                 COALESCE(SUM(g.billed_amount), 0) AS billed_sum,
                 COUNT(*) AS billed_order_count
          FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
          WHERE g.billing_status = 'BILLED' AND o.status != 'CANCELLED'${efBg.clause}
          GROUP BY o.client_id
        ) bg ON bg.client_id = c.id
        LEFT JOIN (
          SELECT p.client_id AS client_id,
                 COALESCE(SUM(p.amount), 0) AS paid_sum,
                 MAX(p.payment_date) AS last_payment_date
          FROM payments p WHERE 1=1${efPay.clause}
          GROUP BY p.client_id
        ) pay ON pay.client_id = c.id
        LEFT JOIN (
          SELECT a.client_id AS client_id, COALESCE(SUM(a.amount), 0) AS adj_sum
          FROM adjustments a WHERE 1=1${efAdj.clause}
          GROUP BY a.client_id
        ) adj ON adj.client_id = c.id
        LEFT JOIN (
          SELECT o.client_id AS client_id,
                 MIN(COALESCE(g.accounting_date, g.billed_at)) AS oldest_unpaid_date
          FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
          WHERE g.billing_status = 'BILLED' AND o.status != 'CANCELLED'${efOupG.clause}
            AND NOT EXISTS (
              SELECT 1 FROM payments p
              WHERE p.client_id = o.client_id${efOupP.clause}
                AND p.amount >= g.billed_amount
                AND p.payment_date >= COALESCE(g.accounting_date, g.billed_at)
            )
          GROUP BY o.client_id
        ) oup ON oup.client_id = c.id
        WHERE c.is_active = 1${excludeArExcludedClientsSql('c.id')}
      ) WHERE balance > ?
    `).bind(...efBg.params, ...efPay.params, ...efAdj.params, ...efOupG.params, ...efOupP.params, minBalance).all<ReceivableClientRow>()

    // aging_days, aging_category 계산 (JS에서)
    const today = new Date(kstYmd() + 'T00:00:00Z')

    let rows = clients.map(client => {
      let agingDays: number | null = null
      if (client.oldest_unpaid_date) {
        const oldest = new Date(client.oldest_unpaid_date)
        oldest.setHours(0, 0, 0, 0)
        agingDays = Math.floor((today.getTime() - oldest.getTime()) / (1000 * 60 * 60 * 24))
      }
      return {
        ...client,
        balance: Number(client.balance) || 0,
        aging_days: agingDays,
        aging_category: getAgingCategory(agingDays)
      }
    })

    // overdue_only 필터 — /overdue 배너와 **동일한 FIFO 판정**(queryFifoOverdue)을 그대로 쓴다.
    //   종전엔 aging_days(채권나이) > overdue_alert_days 로 자체 판정해 배너와 기준이 갈렸다
    //   (배너엔 없는 거래처가 목록 '연체만'에는 뜨는 모순). 필터를 켤 때만 추가 쿼리 1회.
    if (overdue_only === '1') {
      const overdueIds = new Set((await queryFifoOverdue(c)).map(r => r.client_id))
      rows = rows.filter(r => overdueIds.has(Number(r.id)))
    }

    // 정렬
    if (sort === 'balance_asc') {
      rows.sort((a, b) => a.balance - b.balance)
    } else if (sort === 'oldest_first') {
      rows.sort((a, b) => {
        if (a.oldest_unpaid_date === null) return 1
        if (b.oldest_unpaid_date === null) return -1
        return a.oldest_unpaid_date.localeCompare(b.oldest_unpaid_date)
      })
    } else {
      // balance_desc (기본)
      rows.sort((a, b) => b.balance - a.balance)
    }

    return c.json({ success: true, data: rows })
  } catch (error) {
    console.error('Get receivables error:', error)
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// GET /receivables/:clientId/orders - 특정 거래처의 미입금 주문 목록
arReceivablesRouter.get('/receivables/:clientId/orders', async (c) => {
  try {
    const clientId = c.req.param('clientId')

    // 거래처 존재 확인
    const client = await c.env.DB.prepare(
      'SELECT id, client_name, balance FROM clients WHERE id = ? AND is_active = 1'
    ).bind(clientId).first<{ id: number; client_name: string; balance: number }>()

    if (!client) {
      return c.json({ success: false, error: 'Client not found' }, 404)
    }

    // 미입금 주문 (billing_status = BILLED)
    const { clause: recvOrdDetailEf, params: recvOrdDetailEfParams } = entityFilter(c, 'o')
    const { results: orders } = await c.env.DB.prepare(`
      SELECT
        o.id,
        o.order_number,
        o.order_date,
        o.delivery_date,
        o.final_amount,
        o.billed_amount,
        o.billing_status,
        o.billed_at,
        CAST(julianday('now') - julianday(COALESCE(o.accounting_date, o.billed_at)) AS INTEGER) as days_since_billed
      FROM orders o
      WHERE o.client_id = ? AND o.billing_status = 'BILLED'${recvOrdDetailEf}
      ORDER BY COALESCE(o.accounting_date, o.billed_at) ASC, o.id ASC
    `).bind(clientId, ...recvOrdDetailEfParams).all<ReceivableOrderRow>()

    // 입금 내역
    const { clause: recvPayDetailEf, params: recvPayDetailEfParams } = entityFilter(c)
    const { results: payments } = await c.env.DB.prepare(`
      SELECT
        id,
        payment_date,
        amount,
        payment_method,
        notes
      FROM payments
      WHERE client_id = ?${recvPayDetailEf}
      ORDER BY payment_date DESC, id DESC
      LIMIT 50
    `).bind(clientId, ...recvPayDetailEfParams).all<PaymentRow>()

    // 미입금 잔액 계산
    const totalBilled = orders.reduce((sum, o) => sum + (Number(o.billed_amount) || 0), 0)
    const totalPayments = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
    const unpaidBalance = totalBilled - totalPayments

    return c.json({
      success: true,
      data: {
        client: {
          id: client.id,
          client_name: client.client_name,
          balance: await deriveClientBalance(c, clientId)  // split billing P3: 캐시 폐기 → 파생
        },
        orders: orders.map(o => ({
          ...o,
          final_amount: Number(o.final_amount) || 0,
          billed_amount: Number(o.billed_amount) || 0
        })),
        payments: payments.map(p => ({
          ...p,
          amount: Number(p.amount) || 0
        })),
        summary: {
          total_billed: totalBilled,
          total_payments: totalPayments,
          unpaid_balance: unpaidBalance
        }
      }
    })
  } catch (error) {
    console.error('Get receivables orders error:', error)
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// POST /receivables/check-overdue - 연체 자동 알림 생성 (ADMIN/MANAGER)
//   판정·금액 = /overdue 배너와 **동일한 FIFO SSOT**(queryFifoOverdue). 종전엔 자체 쿼리로
//   `잔액 전액 + 최고령 청구일 경과일`을 알렸다 → 이관 기초잔액 때문에 "미수금 3천만원, 최장 연체 223일"
//   같은 알림이 거래 정상인 거래처에도 나갔다(2026-08-11 정정).
arReceivablesRouter.post('/receivables/check-overdue', requireEditOrRole('/ledger', 'MANAGER'), async (c) => {
  try {
    const overdueClients = await queryFifoOverdue(c)

    let alertsCreated = 0
    const checked = overdueClients.length

    // 24시간 내 이미 발송된 연체 알림 link를 한 번에 로드 (N+1 방지)
    const { results: recentNotifs } = await c.env.DB.prepare(`
      SELECT DISTINCT link FROM notifications
      WHERE title LIKE '연체 경고:%'
        AND created_at > datetime('now', '-24 hours')
    `).all<NotifLinkRow>()
    const recentLinks = new Set((recentNotifs || []).map(n => n.link))

    for (const client of overdueClients) {
      const link = `/ledger?client=${client.client_id}`
      if (recentLinks.has(link)) continue

      const overdueFormatted = client.overdue_amount.toLocaleString()
      const days = agingDaysFromOldest(client.oldest_unpaid_at)
      const alertDays = client.overdue_alert_days != null ? Number(client.overdue_alert_days) : 30
      // 이관 기초잔액(OPEN 전표) 유래분은 연체일수가 '이관 기준일 경과일'이라 오독을 부른다 → 본문에 명시.
      const carryNote = client.carryover_amount > 0
        ? ` · 이월분 ${client.carryover_amount.toLocaleString()}원 포함`
        : ''

      await notifyRoles(
        c.env.DB,
        ['ADMIN', 'MANAGER'],
        `연체 경고: ${client.client_name}`,
        `연체 미수금 ${overdueFormatted}원, 최장 연체 ${days ?? '-'}일 (기준 ${alertDays}일)${carryNote}`,
        link
      )

      alertsCreated++
    }

    return c.json({
      success: true,
      data: {
        checked,
        alerts_created: alertsCreated
      }
    })
  } catch (error) {
    console.error('Check overdue error:', error)
    console.error('src/routes/ledger.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// GET /collection-period - 거래처별 평균 회수 기간
arReceivablesRouter.get('/collection-period', async (c) => {
  try {
    const ef = entityFilter(c, 'o')
    // split billing P3: 미수 잔액은 청구그룹(청구 법인) 파생
    const cpGEf = entityFilter(c, 'g')
    const cpPEf = entityFilter(c, 'p2')
    const cpAEf = entityFilter(c, 'a2')

    // 거래처별: 주문 생성일 ~ 마지막 입금일 평균 차이 계산
    // 완납된 주문(balance = 0, 입금 있음) 기준
    // 확장성: 거래처별 billed/결제/감액 상관 서브쿼리 → client_id 사전집계 LEFT JOIN(1회 집계). 값 동일.
    //   각 집계는 client당 1행 → sub 팬아웃 없음(settled_orders/avg_days 등 불변). ⚠️ bind 순서=SQL 등장순(ef→cpG→cpP→cpA).
    const { results } = await c.env.DB.prepare(`
      SELECT
        c.id as client_id,
        c.client_name,
        (
          COALESCE(cpbg.billed_sum, 0)
          - COALESCE(cppay.paid_sum, 0)
          - COALESCE(cpadj.adj_sum, 0)
        ) as balance,
        COUNT(DISTINCT sub.order_id) as settled_orders,
        ROUND(AVG(sub.days_to_pay), 0) as avg_days,
        MIN(sub.days_to_pay) as min_days,
        MAX(sub.days_to_pay) as max_days,
        MAX(sub.last_payment_date) as last_payment_date
      FROM clients c
      INNER JOIN (
        SELECT
          o.client_id,
          o.id as order_id,
          julianday(p.payment_date) - julianday(date(o.created_at)) as days_to_pay,
          p.payment_date as last_payment_date
        FROM orders o
        INNER JOIN payments p ON p.client_id = o.client_id
          AND p.payment_date >= date(o.created_at)
        WHERE o.status != 'CANCELLED'
          AND o.billing_status = 'BILLED'${ef.clause}
        GROUP BY o.id
        HAVING days_to_pay >= 0
      ) sub ON sub.client_id = c.id
      LEFT JOIN (
        SELECT o2.client_id AS client_id, COALESCE(SUM(g.billed_amount), 0) AS billed_sum
        FROM order_billing_groups g JOIN orders o2 ON o2.id = g.order_id
        WHERE g.billing_status = 'BILLED' AND o2.status != 'CANCELLED'${cpGEf.clause}
        GROUP BY o2.client_id
      ) cpbg ON cpbg.client_id = c.id
      LEFT JOIN (
        SELECT p2.client_id AS client_id, COALESCE(SUM(p2.amount), 0) AS paid_sum
        FROM payments p2 WHERE 1=1${cpPEf.clause}
        GROUP BY p2.client_id
      ) cppay ON cppay.client_id = c.id
      LEFT JOIN (
        SELECT a2.client_id AS client_id, COALESCE(SUM(a2.amount), 0) AS adj_sum
        FROM adjustments a2 WHERE 1=1${cpAEf.clause}
        GROUP BY a2.client_id
      ) cpadj ON cpadj.client_id = c.id
      WHERE c.is_active = 1${excludeArExcludedClientsSql('c.id')}
      GROUP BY c.id
      HAVING settled_orders >= 2
      ORDER BY avg_days DESC
    `).bind(...ef.params, ...cpGEf.params, ...cpPEf.params, ...cpAEf.params).all<{
      client_id: number; client_name: string; balance: number
      settled_orders: number; avg_days: number; min_days: number; max_days: number
      last_payment_date: string | null
    }>()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('Collection period error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})


export default arReceivablesRouter
