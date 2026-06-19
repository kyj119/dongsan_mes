// ============================================================================
// 주간 일괄 발주 분석 + PR 자동 생성 (Phase 4)
// ============================================================================

import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { getEntityId, entityFilter } from '../utils/entityFilter'
import { getNextEntitySeqNumber, withSeqRetry } from '../utils/sequenceGenerator'
import { getConsumptionForecast } from '../utils/consumptionForecast'
import { buildWeeklyPurchaseSMS } from '../utils/inventoryAlert'
import { getKakaoProvider, getKakaoSettings } from './kakao'
import { notifyRoles } from '../utils/notify'

const weeklyPurchaseRouter = new Hono<HonoEnv>()
weeklyPurchaseRouter.use('*', authMiddleware)
weeklyPurchaseRouter.use('*', requireRole('ADMIN', 'MANAGER'))

const LEAD_TIME_WEEKS = 1

// ─── GET /analyze — 주간 발주 분석 ─────────────────────────────────────────────
weeklyPurchaseRouter.get('/analyze', async (c) => {
  try {
    const entityId = getEntityId(c)
    const effectiveEntity = entityId || 1
    const weeksBack = Number(c.req.query('weeks_back')) || 8

    // 1. 소모 예측
    const forecast = await getConsumptionForecast(c.env.DB, {
      entityId: effectiveEntity,
      weeksBack,
    })

    // 2. MRP 소요량 (확정/생산중 주문)
    const { results: mrpDemand } = await c.env.DB.prepare(`
      SELECT
        b.material_item_id,
        inv_mat.item_id as material_real_item_id,
        b.material_name,
        SUM(
          (COALESCE(oi.width, 0) / 100.0) * (COALESCE(oi.height, 0) / 100.0)
          * COALESCE(oi.quantity, 1) * b.usage_per_sqm * b.waste_factor
        ) as mrp_required
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN bom_items b ON (
        (b.item_id IS NOT NULL AND b.item_id = oi.item_id)
        OR (b.item_id IS NULL AND b.category_name IS NOT NULL AND b.category_name = oi.category_name)
      )
      LEFT JOIN inventory inv_mat ON b.material_item_id = inv_mat.id
      WHERE o.status IN ('CONFIRMED', 'IN_PRODUCTION')
        AND b.is_active = 1
        AND COALESCE(oi.width, 0) > 0 AND COALESCE(oi.height, 0) > 0
      GROUP BY b.material_item_id
    `).all()

    const mrpMap: Record<number, { demand: number; materialName: string }> = {}
    for (const m of mrpDemand as any[]) {
      const realItemId = m.material_real_item_id as number
      if (realItemId) {
        mrpMap[realItemId] = {
          demand: m.mrp_required as number,
          materialName: m.material_name as string,
        }
      }
    }

    // 3. 발주 중 수량 (DRAFT/CONFIRMED PO)
    const itemIds = forecast.map(f => f.item_id)
    let onOrderMap: Record<number, number> = {}
    if (itemIds.length > 0) {
      const ef = entityId > 0 ? 'AND po.entity_id = ?' : ''
      const efParams = entityId > 0 ? [entityId] : []
      // 바인드 한도 회피(B): forecast 품목(=활성 매입품목)을 서브쿼리로 제한 (itemIds IN 제거)
      const { results: onOrder } = await c.env.DB.prepare(`
        SELECT poi.item_id, SUM(poi.quantity - COALESCE(poi.received_quantity, 0)) as pending_qty
        FROM purchase_order_items poi
        JOIN purchase_orders po ON poi.po_id = po.id
        WHERE po.status IN ('DRAFT', 'CONFIRMED', 'PARTIAL_RECEIVED')
          AND poi.item_id IN (SELECT id FROM items WHERE is_purchase_item = 1 AND is_active = 1)
          ${ef}
        GROUP BY poi.item_id
      `).bind(...efParams).all()

      for (const o of onOrder) {
        onOrderMap[o.item_id as number] = Math.max(0, o.pending_qty as number)
      }
    }

    // 4. 최근 공급처 조회 (품목별)
    let supplierMap: Record<number, { supplier_id: number; supplier_name: string }> = {}
    if (itemIds.length > 0) {
      // 바인드 한도 회피(B): forecast 품목 서브쿼리로 제한 (itemIds IN 제거)
      const { results: suppliers } = await c.env.DB.prepare(`
        SELECT poi.item_id, po.supplier_id, cl.client_name as supplier_name,
          MAX(po.created_at) as latest
        FROM purchase_order_items poi
        JOIN purchase_orders po ON poi.po_id = po.id
        LEFT JOIN clients cl ON po.supplier_id = cl.id
        WHERE poi.item_id IN (SELECT id FROM items WHERE is_purchase_item = 1 AND is_active = 1)
          AND po.supplier_id IS NOT NULL
        GROUP BY poi.item_id, po.supplier_id
        ORDER BY poi.item_id, latest DESC
      `).all()

      // 각 item에 대해 가장 최근 PO의 공급처
      for (const s of suppliers as any[]) {
        if (!supplierMap[s.item_id]) {
          supplierMap[s.item_id] = {
            supplier_id: s.supplier_id,
            supplier_name: s.supplier_name || '공급업체',
          }
        }
      }
    }

    // 5. 제안 목록 생성
    const suggestions = forecast.map(f => {
      const mrp = mrpMap[f.item_id] || { demand: 0 }
      const onOrder = onOrderMap[f.item_id] || 0
      const supplier = supplierMap[f.item_id] || null

      // 예상 소진량 = (주간소모 × 리드타임) + MRP 소요
      const expectedDemand = (f.weekly_avg * LEAD_TIME_WEEKS) + mrp.demand
      // 가용재고 = 현재고 + 발주중
      const available = f.current_stock + onOrder
      // 부족량 = 예상소진 + 안전재고 - 가용재고
      const shortage = Math.max(0, expectedDemand + f.safe_stock - available)
      // 권장 발주량 = 부족량 (올림)
      const recommended_qty = Math.ceil(shortage)

      // 발주 필요 여부
      const needs_order = recommended_qty > 0 && (f.auto_pr_enabled || f.safe_stock > 0)
      // 긴급도
      const urgency = f.current_stock <= 0 ? 'URGENT'
        : f.current_stock <= f.safe_stock ? 'HIGH'
        : shortage > 0 ? 'NORMAL' : 'LOW'

      return {
        item_id: f.item_id,
        item_name: f.item_name,
        category: f.category,
        unit: f.unit,
        entity_id: f.entity_id,
        // 재고 상태
        current_stock: f.current_stock,
        safe_stock: f.safe_stock,
        on_order: onOrder,
        // 소모 예측
        weekly_avg: f.weekly_avg,
        active_weeks: f.active_weeks,
        // MRP
        mrp_demand: Math.round((mrp.demand || 0) * 100) / 100,
        // 계산 결과
        expected_demand: Math.round(expectedDemand * 100) / 100,
        shortage: Math.round(shortage * 100) / 100,
        recommended_qty,
        // 공급처
        supplier_id: supplier?.supplier_id || null,
        supplier_name: supplier?.supplier_name || null,
        // 메타
        needs_order,
        urgency,
      }
    })

    // needs_order인 것 먼저, 긴급도 순 정렬
    const urgencyOrder: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 }
    suggestions.sort((a, b) => {
      if (a.needs_order !== b.needs_order) return a.needs_order ? -1 : 1
      return (urgencyOrder[a.urgency] || 3) - (urgencyOrder[b.urgency] || 3)
    })

    // 요약 통계
    const needsOrderItems = suggestions.filter(s => s.needs_order)
    const summary = {
      total_items: suggestions.length,
      needs_order: needsOrderItems.length,
      urgent: needsOrderItems.filter(s => s.urgency === 'URGENT').length,
      high: needsOrderItems.filter(s => s.urgency === 'HIGH').length,
      supplier_count: new Set(needsOrderItems.filter(s => s.supplier_id).map(s => s.supplier_id)).size,
      lead_time_weeks: LEAD_TIME_WEEKS,
      analysis_weeks: weeksBack,
    }

    return c.json({ success: true, data: { suggestions, summary } })
  } catch (error) {
    console.error('weekly-purchase analyze error:', error)
    return c.json({ success: false, error: '분석 중 오류가 발생했습니다.' }, 500)
  }
})

// ─── POST /create-prs — 선택 품목으로 공급처별 PR 일괄 생성 ──────────────────────
weeklyPurchaseRouter.post('/create-prs', async (c) => {
  try {
    const user = c.get('user')
    const entityId = getEntityId(c) || 1
    const { items } = await c.req.json() as {
      items: Array<{
        item_id: number
        item_name: string
        quantity: number
        unit?: string
        supplier_id: number | null
        supplier_name?: string
        urgency?: string
      }>
    }

    if (!items || items.length === 0) {
      return c.json({ success: false, error: '발주할 품목을 선택해주세요.' }, 400)
    }

    // 공급처별 그룹핑
    const groups = new Map<number | string, {
      supplierId: number | null
      supplierName: string
      items: typeof items
    }>()

    for (const item of items) {
      const key = item.supplier_id || 'unassigned'
      if (!groups.has(key)) {
        groups.set(key, {
          supplierId: item.supplier_id,
          supplierName: item.supplier_name || '미지정',
          items: [],
        })
      }
      groups.get(key)!.items.push(item)
    }

    const createdPRs: Array<{
      pr_id: number
      request_number: string
      supplier_name: string
      item_count: number
    }> = []

    const today = new Date().toISOString().split('T')[0].replace(/-/g, '')

    for (const [, group] of groups) {
      // PR 번호 생성 — 법인코드 E{eid} 내장 (행 entity_id와 동일 eid). 채번 경로 통일.
      const requestNumber = await getNextEntitySeqNumber(c.env.DB, 'purchase_requests', 'request_number', entityId, today, { base: 'PR-' })

      // 긴급도: 그룹 내 가장 높은 긴급도 사용
      const urgencyPriority: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 }
      const maxUrgency = group.items.reduce((max, it) => {
        const p = urgencyPriority[it.urgency || 'NORMAL'] ?? 2
        return p < (urgencyPriority[max] ?? 2) ? (it.urgency || 'NORMAL') : max
      }, 'NORMAL')

      // PR 생성
      const prResult = await c.env.DB.prepare(`
        INSERT INTO purchase_requests
          (request_number, requester_id, supplier_id, urgency, status, reason, notes, entity_id)
        VALUES (?, ?, ?, ?, 'PENDING', ?, ?, ?)
      `).bind(
        requestNumber,
        user?.id || 1,
        group.supplierId,
        maxUrgency,
        '주간 일괄 발주 (자동 분석)',
        `소모예측+MRP 기반 자동 생성. 공급처: ${group.supplierName}. 품목 ${group.items.length}건`,
        entityId,
      ).run()

      const prId = prResult.meta?.last_row_id as number

      // #165: PR 품목 일괄 추가 (entity_id 포함)
      const stmts = group.items.map((item, idx) =>
        c.env.DB.prepare(`
          INSERT INTO purchase_request_items
            (request_id, item_id, item_name, quantity, unit, sort_order, notes, entity_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          prId,
          item.item_id,
          item.item_name,
          item.quantity,
          item.unit || 'EA',
          idx,
          `주간 발주 분석 권장 수량`,
          entityId,
        )
      )
      if (stmts.length > 0) await c.env.DB.batch(stmts)

      createdPRs.push({
        pr_id: prId,
        request_number: requestNumber,
        supplier_name: group.supplierName,
        item_count: group.items.length,
      })
    }

    return c.json({
      success: true,
      data: { prs: createdPRs, total_prs: createdPRs.length, total_items: items.length },
      message: `${createdPRs.length}건의 발주 요청이 생성되었습니다.`,
    })
  } catch (error) {
    console.error('weekly-purchase create-prs error:', error)
    return c.json({ success: false, error: 'PR 생성 중 오류가 발생했습니다.' }, 500)
  }
})

// ─── POST /notify — 주간 발주 분석 결과 담당자 알림 발송 (Phase 6) ─────────────
weeklyPurchaseRouter.post('/notify', async (c) => {
  try {
    const user = c.get('user')
    const { summary, channel } = await c.req.json() as {
      summary: { needs_order: number; urgent: number; high: number; supplier_count: number }
      channel?: 'sms' | 'kakao'  // 기본 sms
    }

    if (!summary || summary.needs_order === undefined) {
      return c.json({ success: false, error: 'summary 데이터가 필요합니다.' }, 400)
    }

    const results: { type: string; status: string; detail?: string }[] = []

    // 1. In-app 알림
    await notifyRoles(c.env.DB, ['ADMIN', 'MANAGER'],
      `주간 발주 분석: ${summary.needs_order}건 발주 필요`,
      `긴급 ${summary.urgent}건, 높음 ${summary.high}건. 공급처 ${summary.supplier_count}곳.`,
      '/weekly-purchase'
    )
    results.push({ type: 'in-app', status: 'sent' })

    // 2. 외부 알림 (SMS/카카오) — 설정된 경우만
    const sendChannel = channel || 'sms'
    const kakaoSettings = await getKakaoSettings(c.env.DB, c.get('entityId') || 1)

    if (kakaoSettings.enabled && kakaoSettings.senderNum) {
      const provider = await getKakaoProvider(c)
      if (provider) {
        // 알림 수신 대상: ADMIN/MANAGER 중 mobile 있는 사용자
        const { results: managers } = await c.env.DB.prepare(
          `SELECT id, name, mobile FROM users
           WHERE role IN ('ADMIN', 'MANAGER') AND is_active = 1 AND mobile IS NOT NULL AND mobile != ''`
        ).all()

        if (managers && managers.length > 0) {
          const smsContent = buildWeeklyPurchaseSMS(summary)
          const messages = managers.map((m: any) => ({
            rcv: String(m.mobile).replace(/-/g, ''),
            rcvnm: m.name || '담당자',
            msg: smsContent,
          }))

          try {
            if (sendChannel === 'sms') {
              await provider.sendSMS({
                snd: kakaoSettings.senderNum,
                content: smsContent,
                messages,
              })
            } else {
              await provider.sendLMS({
                snd: kakaoSettings.senderNum,
                subject: '주간 발주 분석 결과',
                content: smsContent,
                messages,
              })
            }

            // 발송 로그
            await c.env.DB.prepare(`
              INSERT INTO kakao_send_logs
                (template_code, receiver_num, receiver_name, related_type, content, status, channel, sent_by, entity_id)
              VALUES (?, ?, ?, 'weekly_purchase', ?, 'SUCCESS', ?, ?, ?)
            `).bind(
              sendChannel === 'sms' ? 'SMS' : 'LMS',
              managers.map((m: any) => m.mobile).join(','),
              `BULK(${managers.length})`,
              smsContent,
              sendChannel,
              user?.id || null,
              getEntityId(c) || 1,
            ).run()

            results.push({
              type: sendChannel,
              status: 'sent',
              detail: `${managers.length}명에게 발송`,
            })
          } catch (sendErr: any) {
            console.error('Weekly purchase SMS send failed:', sendErr)
            results.push({ type: sendChannel, status: 'failed', detail: sendErr.message })
          }
        } else {
          results.push({ type: sendChannel, status: 'skipped', detail: '수신 가능한 담당자 없음 (mobile 미등록)' })
        }
      } else {
        results.push({ type: sendChannel, status: 'skipped', detail: '바로빌 Provider 초기화 실패' })
      }
    } else {
      results.push({ type: 'external', status: 'skipped', detail: '카카오/SMS 비활성화 또는 발신번호 미설정' })
    }

    return c.json({ success: true, data: { results } })
  } catch (error) {
    console.error('weekly-purchase notify error:', error)
    return c.json({ success: false, error: '알림 발송 중 오류가 발생했습니다.' }, 500)
  }
})

export default weeklyPurchaseRouter
