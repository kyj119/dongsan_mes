import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { getEntityId, entityFilter, isZoneOwnedByEntity, getWriteEntityId, ENTITY_ALL_MODE_WRITE_ERROR } from '../utils/entityFilter'
import { getItemDefaultZones } from '../utils/inventoryZone'
import { resolveStockUnit } from '../utils/rollConsumption'
import { kstStamp14, kstYmd } from '../utils/kstDate'

const inventoryCountRouter = new Hono<HonoEnv>()
inventoryCountRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))

// GET / — 실사 목록 (페이징, 필터)
inventoryCountRouter.get('/', async (c) => {
  try {
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100)
    const offset = parseInt(c.req.query('offset') || '0')
    const status = c.req.query('status')
    const storageZoneId = c.req.query('storage_zone_id')
    const scope = c.req.query('scope')  // 'mine' = 내가 담당인 구역만 (receiving.js scope 패턴과 동일)

    const ef = entityFilter(c, 'ic')  // #279: 법인별 격리 (sz JOIN으로 entity_id 모호 → alias 필수)
    let query = `SELECT ic.id, ic.count_number, ic.count_date, ic.count_type, ic.status, ic.submitted_at, ic.approved_at, ic.notes, ic.storage_zone_id, sz.zone_name AS storage_zone_name,
      sz.manager_id AS zone_manager_id, mu.name AS zone_manager_name,
      (SELECT COUNT(*) FROM inventory_count_items ci WHERE ci.count_id = ic.id) AS item_count
      FROM inventory_counts ic
      LEFT JOIN storage_zones sz ON ic.storage_zone_id = sz.id
      LEFT JOIN users mu ON mu.id = sz.manager_id
      WHERE 1=1` + ef.clause
    const params: any[] = [...ef.params]

    // scope=mine: 내 담당 구역. 담당자 미지정(NULL) 구역과 전수 실사는 ADMIN·MANAGER 에게만 보인다
    //   — receiving.js:388-393 과 같은 규칙(미지정은 관리자 몫).
    if (scope === 'mine') {
      const u = c.get('user')
      const isSupervisor = u?.role === 'ADMIN' || u?.role === 'MANAGER'
      if (isSupervisor) {
        query += ' AND (sz.manager_id = ? OR sz.manager_id IS NULL)'
        params.push(u?.id ?? 0)
      } else {
        query += ' AND sz.manager_id = ?'
        params.push(u?.id ?? 0)
      }
    }

    if (status) {
      query += ' AND ic.status = ?'
      params.push(status)
    }
    if (storageZoneId) {
      query += ' AND ic.storage_zone_id = ?'
      params.push(Number(storageZoneId))
    }

    query += ' ORDER BY ic.count_date DESC, ic.id DESC LIMIT ? OFFSET ?'  // 정렬 규약: 고유키 tie-break
    params.push(limit, offset)

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    // 전체 개수 (LIMIT/OFFSET 제외 → params.slice(0, -2))
    let countQuery = 'SELECT COUNT(*) as cnt FROM inventory_counts ic WHERE 1=1' + ef.clause
    if (status) {
      countQuery += ' AND ic.status = ?'
    }
    if (storageZoneId) {
      countQuery += ' AND ic.storage_zone_id = ?'
    }
    const countRes = await c.env.DB.prepare(countQuery).bind(...params.slice(0, -2)).first()

    return c.json({
      success: true,
      data: results || [],
      total: (countRes as { cnt: number } | null)?.cnt || 0,
      limit,
      offset
    })
  } catch (error) {
    console.error('src/routes/inventoryCount.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /consumption — 실사 회차 사이의 **소모량** (기초 + 매입 − 기말)
//
// 왜 필요한가 (용준님 2026-08-19)
//   주간 실사는 「그날 얼마 남았나」만 답한다. 판단에 필요한 건 「얼마를 썼나」다.
//   두 회차 사이에 매입이 끼면 단순 차감(기초−기말)은 소모를 과소평가하고,
//   많이 사서 많이 남은 주를 「덜 썼다」고 읽게 만든다.
//
//   ★반드시 `/:id` 보다 먼저 등록한다 — 뒤에 두면 'consumption' 이 :id 로 잡혀 NaN 조회가 된다.
//
// 산식   소모 = 기초 + 매입 − 기말      (구간 = 인접한 두 실사 회차)
//
// 단위 — 실사·재고는 base_unit(M·L), 발주는 unit(롤·통)이다. **매입만** pack_size 로 환산한다.
//   base_unit 이 NULL 인 품목(현수막 원단 AQ*)은 발주도 재고도 yd 라 환산하지 않는다.
//   그 pack_size=130 은 실사 입력 편의 계수일 뿐 환산계수가 아니다(마이그 0540).
//   이 구분을 놓치면 현수막 매입이 130배로 잡혀 소모량이 통째로 무의미해진다.
//
// 알려진 한계 — 숨기지 말고 flags 로 같이 낸다. 이 수치는 「추정」이지 「실측」이 아니다.
//   ① 매입 구역 귀속 = items.storage_zone_id.
//      purchase_order_items.storage_zone_id 는 prod 전량 NULL 이라 쓸 수 없다.
//      품목이 한 구역에만 속한다는 가정 위에 선다.
//   ② 날짜 기준 = po.order_date. inventory_receipts 가 prod 0행이라 실입고일을 모른다.
//      발주일↔입고일 시차만큼 구간이 밀린다(주 단위 실사에서 특히 크다).
//   ③ 양끝 중 한쪽이라도 미입력(NULL)이면 그 품목은 그 구간에서 **제외**한다.
//      0 으로 채우면 재고 전량이 소모로 잡힌다.
//   ④ 동일 (발주,품목,수량,단가) 라인이 한 전표에 여러 번 나온다(2026-08-19 기준 21행).
//      ★2026-08-24 대사 결과 **중복이 아니라 정상**이었다 — 매입 원천이 「월 청구서」라
//      납품 건별로 줄이 나뉜다. 정운교역 6월분은 적재 합계 119,732,538원/119,699Y 가
//      청구서 PDF 헤더와 **차이 0**(한 줄 빼면 −6,760,040 어긋남), 서울경금속은 월 전표를
//      일자별로 쪼갤 때 「월 재합산 불변」 게이트를 통과했다.
//      그래도 건수는 계속 보고한다 — 다음에 진짜 중복이 섞이면 이 숫자가 먼저 움직인다.
//      **절대 자동으로 합치지 않는다.**
inventoryCountRouter.get('/consumption', async (c) => {
  try {
    const zoneId = c.req.query('zone_id') ? Number(c.req.query('zone_id')) : null
    const from = c.req.query('from') || null
    const to = c.req.query('to') || null

    // ── 회차 나열 (날짜 오름차순). DRAFT 는 제외 — 아직 실사표가 확정되지 않았다.
    const ef = entityFilter(c, 'ic')
    const cParams: any[] = [...ef.params]
    let cQuery = `SELECT ic.id, ic.count_date, ic.status, ic.storage_zone_id
                    FROM inventory_counts ic
                   WHERE ic.status IN ('SUBMITTED', 'APPROVED')` + ef.clause
    if (zoneId) { cQuery += ' AND ic.storage_zone_id = ?'; cParams.push(zoneId) }
    if (from) { cQuery += ' AND ic.count_date >= ?'; cParams.push(from) }
    if (to) { cQuery += ' AND ic.count_date <= ?'; cParams.push(to) }
    // 정렬 규약: 같은 날 두 회차가 있으면 id 로 tie-break (구간 경계가 흔들리면 소모량이 뒤집힌다)
    cQuery += ' ORDER BY ic.count_date ASC, ic.id ASC LIMIT 60'

    const { results: counts } = await c.env.DB.prepare(cQuery).bind(...cParams)
      .all<{ id: number; count_date: string; status: string; storage_zone_id: number | null }>()

    if (!counts || counts.length < 2) {
      return c.json({
        success: true,
        data: { counts: counts || [], periods: [], items: [], flags: { reason: '소모량 산출에는 실사 회차가 2개 이상 필요합니다' } }
      })
    }

    // ── 회차별 실사 라인 (바인드 한도: 회차 수 ≤ 60 이라 IN 절 안전)
    const ids = counts.map((r) => r.id)
    const { results: lines } = await c.env.DB.prepare(`
      SELECT ci.count_id, ci.item_id, ci.counted_quantity,
             i.item_code, i.item_name, i.unit, i.base_unit, i.pack_size, i.avg_unit_cost
        FROM inventory_count_items ci
        JOIN items i ON i.id = ci.item_id
       WHERE ci.count_id IN (${ids.map(() => '?').join(',')})
    `).bind(...ids).all<{
      count_id: number; item_id: number; counted_quantity: number | null
      item_code: string; item_name: string; unit: string | null
      base_unit: string | null; pack_size: number | null; avg_unit_cost: number | null
    }>()

    type Meta = { code: string; name: string; unit: string; baseUnit: string | null; pack: number; cost: number }
    const meta = new Map<number, Meta>()
    const counted = new Map<string, number>()   // `${countId}:${itemId}` → base 수량
    for (const l of lines || []) {
      if (!meta.has(l.item_id)) {
        meta.set(l.item_id, {
          code: l.item_code, name: l.item_name,
          // 표시 단위는 재고 단위(base)가 정본 — 실사·소모가 그 단위다
          unit: l.base_unit || l.unit || '',
          baseUnit: l.base_unit,
          pack: l.pack_size && l.pack_size > 0 ? Number(l.pack_size) : 1,
          cost: Number(l.avg_unit_cost || 0),
        })
      }
      if (l.counted_quantity != null) counted.set(`${l.count_id}:${l.item_id}`, Number(l.counted_quantity))
    }

    // ── 매입 (전 구간 한 번에 조회 후 JS 에서 구간 배분)
    const firstDate = counts[0].count_date
    const lastDate = counts[counts.length - 1].count_date
    const pef = entityFilter(c, 'po')
    const pParams: any[] = [firstDate, lastDate, ...pef.params]
    let pQuery = `SELECT poi.po_id, poi.item_id, poi.quantity, poi.unit_price, po.order_date
                    FROM purchase_order_items poi
                    JOIN purchase_orders po ON po.id = poi.po_id
                    JOIN items i ON i.id = poi.item_id
                   WHERE po.order_date > ? AND po.order_date <= ?` + pef.clause
    if (zoneId) { pQuery += ' AND i.storage_zone_id = ?'; pParams.push(zoneId) }
    const { results: buys } = await c.env.DB.prepare(pQuery).bind(...pParams)
      .all<{ po_id: number; item_id: number; quantity: number; unit_price: number; order_date: string }>()

    // 동일 (발주, 품목, 수량, 단가) 반복. 합치지 않고 세기만 한다 — 위 ④ 참고(정상이 확인됐다).
    const dupSeen = new Map<string, number>()
    let dupLines = 0
    for (const b of buys || []) {
      const k = `${b.po_id}:${b.item_id}:${b.quantity}:${b.unit_price}`
      const n = (dupSeen.get(k) || 0) + 1
      dupSeen.set(k, n)
      if (n > 1) dupLines++
    }

    // ★품목 미연결 매입 — 위 조회는 `JOIN items` 라 `item_id IS NULL` 라인이 **통째로 빠진다**.
    //   빠지는 게 맞다(어느 품목인지 모르니 배분할 수 없다). 문제는 **조용히** 빠지는 것이다:
    //   그러면 「매입 0원인데 재고가 늘었다」= 음수 소모로만 나타나 원인을 못 짚는다.
    //   2026-08-24 실측 — 7월 동산 매입 66라인 중 **36라인(6,731만·44%)이 미연결**이었고,
    //   그 안에 코스테크 전사잉크(`ST1000N`)와 케이엠테크 뭉친 전표 2줄이 들어 있었다.
    //   구역을 못 가르니(품목이 없어 `storage_zone_id` 도 없다) 법인·기간 전체 금액으로 낸다.
    const unattributed = await c.env.DB.prepare(
      `SELECT COUNT(*) n, COALESCE(SUM(poi.amount), 0) amt
         FROM purchase_order_items poi
         JOIN purchase_orders po ON po.id = poi.po_id
        WHERE poi.item_id IS NULL
          AND po.order_date > ? AND po.order_date <= ?` + pef.clause
    ).bind(firstDate, lastDate, ...pef.params).first<{ n: number; amt: number }>()

    // ── 구간별 집계
    //
    // ★구간은 **품목마다 다르다** — 그 품목이 실제로 세어진 회차만 이어 붙인다.
    //   전체 회차를 인접쌍으로 자르면, 한 품목만 담은 회차(예: 현수막만 센 주)가 끼는 순간
    //   나머지 품목이 그 구간에서 통째로 빠져 **소모량이 사라진다**. 실사 회차를 추가하는 것이
    //   기존 집계를 망가뜨리면 안 된다.
    const buysByItem = new Map<number, typeof buys>()
    for (const b of buys || []) {
      const arr = buysByItem.get(b.item_id) || []
      arr.push(b)
      buysByItem.set(b.item_id, arr)
    }

    const perItem = new Map<number, { used: number; buy: number; segs: any[] }>()
    const periodAgg = new Map<string, { from: string; to: string; days: number; items: number; spanned: number; used_amount: number; purchase_amount: number }>()
    let singleCount = 0
    let negatives = 0
    let spannedTotal = 0

    for (const [itemId, m] of meta) {
      const seq = counts.filter((cn) => counted.has(`${cn.id}:${itemId}`))
      if (seq.length < 2) { singleCount++; continue }   // 한 번만 세었으면 소모를 알 수 없다
      const myBuys = buysByItem.get(itemId) || []
      // ★base_unit 이 있는 품목만 환산한다. NULL 이면 발주 단위 = 재고 단위.
      const factor = m.baseUnit ? m.pack : 1

      for (let i = 1; i < seq.length; i++) {
        const t0 = seq[i - 1], t1 = seq[i]
        const open = counted.get(`${t0.id}:${itemId}`)!
        const close = counted.get(`${t1.id}:${itemId}`)!
        const days = Math.max(1, Math.round((Date.parse(t1.count_date) - Date.parse(t0.count_date)) / 86400000))

        let buy = 0, buyAmt = 0
        for (const b of myBuys) {
          if (b.order_date <= t0.count_date || b.order_date > t1.count_date) continue
          buy += Number(b.quantity) * factor
          buyAmt += Number(b.quantity) * Number(b.unit_price || 0)
        }
        const used = open + buy - close
        if (used < 0) negatives++

        // 이 품목이 중간 회차를 건너뛰었으면 구간이 여러 회차를 덮는다 — 숨기지 말고 표시한다
        const skippedCounts = counts.filter((cn) =>
          cn.count_date > t0.count_date && cn.count_date < t1.count_date).length
        if (skippedCounts > 0) spannedTotal++

        const rec = perItem.get(itemId) || { used: 0, buy: 0, segs: [] }
        rec.used += used
        rec.buy += buy
        rec.segs.push({ from: t0.count_date, to: t1.count_date, days, open, buy, close, used, spans_counts: skippedCounts })
        perItem.set(itemId, rec)

        // 전체 표는 구간이 **끝나는 날짜**에 귀속시킨다(품목별 구간 길이가 달라 시작일로는 못 묶는다)
        const key = t1.count_date
        const agg = periodAgg.get(key) || { from: t0.count_date, to: t1.count_date, days, items: 0, spanned: 0, used_amount: 0, purchase_amount: 0 }
        if (t0.count_date > agg.from) { agg.from = t0.count_date; agg.days = days }  // 가장 짧은(=대표) 구간을 표기
        agg.items++
        if (skippedCounts > 0) agg.spanned++
        agg.used_amount += used * m.cost
        agg.purchase_amount += buyAmt
        periodAgg.set(key, agg)
      }
    }

    const periods = [...periodAgg.values()]
      .sort((a, b) => a.to.localeCompare(b.to))
      .map((p) => ({ ...p, used_amount: Math.round(p.used_amount), purchase_amount: Math.round(p.purchase_amount) }))

    const items = [...perItem.entries()].map(([itemId, r]) => {
      const m = meta.get(itemId)!
      return {
        item_id: itemId, item_code: m.code, item_name: m.name, unit: m.unit,
        total_used: Math.round(r.used * 1000) / 1000,
        total_purchased: Math.round(r.buy * 1000) / 1000,
        used_amount: Math.round(r.used * m.cost),
        periods: r.segs,
      }
    }).sort((a, b) => b.used_amount - a.used_amount || a.item_code.localeCompare(b.item_code))

    return c.json({
      success: true,
      data: {
        counts: counts.map((r) => ({ id: r.id, date: r.count_date, status: r.status })),
        periods,
        items,
        flags: {
          // 이 수치를 어디까지 믿을지 판단할 근거. 화면에도 그대로 띄운다.
          zone_attribution: 'items.storage_zone_id (발주 라인에 구역이 없어 품목 마스터로 귀속)',
          date_basis: 'purchase_orders.order_date (입고 기록이 없어 발주일 기준 — 시차만큼 구간이 밀림)',
          period_basis: '품목별로 그 품목을 실제 센 회차끼리 이었다. spans_counts>0 = 중간 회차를 건너뛴 구간',
          items_counted_once: singleCount,
          spanned_segments: spannedTotal,
          repeated_purchase_lines: dupLines,   // 중복 아님(월 청구서가 납품 건별로 나뉜 것) — 급변하면 그때 의심한다
          // ★음수 소모가 나오면 여기부터 본다. 이 금액만큼의 매입은 어느 품목에도 안 붙었다.
          unattributed_purchase_lines: unattributed?.n || 0,
          unattributed_purchase_amount: Math.round(unattributed?.amt || 0),
          negative_consumption_items: negatives,
        },
      },
    })
  } catch (error) {
    console.error('src/routes/inventoryCount.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST / — 실사 생성 (DRAFT)
inventoryCountRouter.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const { count_type = 'FULL', notes = '', category = '' } = body
    // P3: 구역 기반 실사 — storage_zone_id 있으면 count_type='ZONE', 품목을 그 구역으로 스코프
    const zoneId = (body.storage_zone_id != null && body.storage_zone_id !== '') ? Number(body.storage_zone_id) : null

    // count_number 생성: IC-YYYYMMDDHHMMSS (초까지 — 같은 분 다중 생성 UNIQUE 충돌 방지. P3 구역 실사로 연속 생성 빈번)
    const countNumber = 'IC-' + kstStamp14()
    const countDate = kstYmd()

    // 실사 유형: 구역(ZONE) > 부분(PERIODIC, category) > 전체(FULL)
    const actualType = zoneId ? 'ZONE' : (category ? 'PERIODIC' : count_type)
    const countNotes = category ? `[${category}] ${notes}` : notes

    // 전체모드(0) 쓰기 차단 + 구역 법인 소유 검증 (2026-07-06 감사 #3·#5)
    const countEntityId = getWriteEntityId(c)
    if (countEntityId == null) {
      return c.json({ success: false, error: ENTITY_ALL_MODE_WRITE_ERROR }, 400)
    }
    if (zoneId != null && !(await isZoneOwnedByEntity(c, zoneId))) {
      return c.json({ success: false, error: '유효하지 않은 창고입니다' }, 400)
    }

    // 구역 실사면 구역명 조회 (응답용)
    let zoneName: string | null = null
    if (zoneId) {
      const zoneRow = await c.env.DB.prepare(
        'SELECT zone_name FROM storage_zones WHERE id = ?'
      ).bind(zoneId).first<{ zone_name: string }>()
      zoneName = zoneRow?.zone_name || null
    }

    // inventory_counts 생성
    const result = await c.env.DB.prepare(`
      INSERT INTO inventory_counts (count_number, count_date, count_type, status, notes, entity_id, storage_zone_id)
      VALUES (?, ?, ?, 'DRAFT', ?, ?, ?)
    `).bind(countNumber, countDate, actualType, countNotes, countEntityId, zoneId).run()

    const countId = (result.meta.last_row_id as number)

    // 품목 로드: 구역(zone) 우선 > category 필터 > 전체
    let items: Array<{ id: number; item_code: string; item_name: string; unit: string; base_unit?: string | null; category: string; storage_zone_id: number | null; quantity: number | null }> = []
    if (zoneId) {
      // 구역 실사: 해당 구역·법인 재고가 있는 품목만 (INNER JOIN). 라인 창고 = 그 구역(inv.storage_zone_id=zoneId)
      const { results } = await c.env.DB.prepare(`
        SELECT i.id, i.item_code, i.item_name, i.unit, i.base_unit, i.pack_size, i.category, inv.storage_zone_id, inv.quantity
        FROM items i
        JOIN inventory inv ON i.id = inv.item_id AND inv.entity_id = ? AND inv.storage_zone_id = ?
        WHERE i.is_active = 1 AND i.is_purchase_item = 1
        ORDER BY i.category, i.item_name, i.id
      `).bind(countEntityId, zoneId).all<typeof items[number]>()
      items = results || []
    } else {
      // 0396 다중행: 라인 창고 = 법인 인식 기본창고(getItemDefaultZones) — raw items.storage_zone_id는
      //   타법인 zone 배정 품목의 실사 승인 시 entity≠zone소유 어긋난 행을 만듦 (2026-07-06 감사 #3)
      let itemQuery = `
        SELECT i.id, i.item_code, i.item_name, i.unit, i.base_unit, i.pack_size, i.category
        FROM items i
        WHERE i.is_active = 1 AND i.is_purchase_item = 1
      `
      const params: any[] = []
      if (category) {
        itemQuery += ' AND i.category = ?'
        params.push(category)
      }
      itemQuery += ' ORDER BY i.category, i.item_name'
      const { results: baseItems } = await c.env.DB.prepare(itemQuery).bind(...params).all<{ id: number; item_code: string; item_name: string; unit: string; base_unit?: string | null; category: string }>()
      const ids = (baseItems || []).map(r => Number(r.id))
      const zoneMap = await getItemDefaultZones(c.env.DB, ids, countEntityId)
      // 실사 UX 라④: 전수 실사는 (item, zone) 재고 행별로 라인 전개 — 기본창고 1행만 스냅샷하면
      //   타 창고 재고가 실사 범위 밖(총량 입력 시 이중계상)이었음. 재고 행 없는 품목=기본창고 1행(qty 0).
      const invByItem = new Map<number, Array<{ zone: number | null; qty: number }>>()
      for (let i = 0; i < ids.length; i += 80) {
        const chunk = ids.slice(i, i + 80)
        const ph = chunk.map(() => '?').join(',')
        const { results: invRows } = await c.env.DB.prepare(
          `SELECT item_id, storage_zone_id, quantity FROM inventory WHERE entity_id = ? AND item_id IN (${ph})`
        ).bind(countEntityId, ...chunk).all<{ item_id: number; storage_zone_id: number | null; quantity: number }>()
        for (const r of (invRows || [])) {
          const list = invByItem.get(Number(r.item_id)) || []
          list.push({ zone: (r.storage_zone_id as number | null) ?? null, qty: Number(r.quantity) || 0 })
          invByItem.set(Number(r.item_id), list)
        }
      }
      items = (baseItems || []).flatMap(r => {
        const rows = invByItem.get(Number(r.id))
        if (rows && rows.length > 0) {
          return rows.map(v => ({ ...r, storage_zone_id: v.zone, quantity: v.qty }))
        }
        const z = zoneMap.get(Number(r.id)) ?? null
        return [{ ...r, storage_zone_id: z, quantity: 0 }]
      })
    }

    // 실사 단위 = **재고 단위**(base_unit) — items.unit 은 입고·발주 단위('롤')라
    // 수량(base·미터)과 짝이 맞지 않는다. 150m 를 '150 롤'로 보여주면 오입력을 부른다.
    if (items && items.length > 0) {
      await c.env.DB.batch(
        items.map((item) =>
          // 0540: per_pack_qty 기본값 = items.pack_size. 규격품(시트 50m·잉크 1.5L)은 이 값 그대로 쓰고
          //   현수막 원단처럼 롤마다 다른 것만 실사 때 손으로 고친다. 없으면 NULL(=환산 없는 자재).
          c.env.DB.prepare(`
            INSERT INTO inventory_count_items (count_id, item_id, system_quantity, unit, storage_zone_id, per_pack_qty)
            VALUES (?, ?, ?, ?, ?, ?)
          `).bind(countId, item.id, item.quantity || 0, resolveStockUnit(item), item.storage_zone_id ?? null,
            (item as any).pack_size && Number((item as any).pack_size) > 0 ? Number((item as any).pack_size) : null)
        )
      )
    }

    return c.json({
      success: true,
      data: {
        id: countId,
        count_number: countNumber,
        count_date: countDate,
        count_type: actualType,
        status: 'DRAFT',
        notes: countNotes,
        storage_zone_id: zoneId,
        storage_zone_name: zoneName,
        item_count: (items || []).length
      }
    })
  } catch (error) {
    console.error('src/routes/inventoryCount.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /:id — 실사 상세
inventoryCountRouter.get('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    const ef = entityFilter(c, 'ic')  // sz JOIN으로 entity_id 모호 → alias 필수

    const count = await c.env.DB.prepare(`
      SELECT ic.id, ic.count_number, ic.count_date, ic.count_type, ic.status, ic.submitted_by, ic.submitted_at, ic.approved_by, ic.approved_at, ic.notes, ic.created_at, ic.entity_id, ic.storage_zone_id, sz.zone_name AS storage_zone_name
      FROM inventory_counts ic
      LEFT JOIN storage_zones sz ON ic.storage_zone_id = sz.id
      WHERE ic.id = ?${ef.clause}
    `).bind(id, ...ef.params).first<{ count_type: string; status: string; entity_id: number; storage_zone_id: number | null }>()

    if (!count) {
      return c.json({ success: false, error: 'Count not found' }, 404)
    }

    // 라⑤: current_quantity = 지금 재고 — system_quantity 스냅샷과 다르면 실사 중 입출고 발생(승인 전 경고용)
    const countEntityId = (count as any).entity_id || getEntityId(c) || 1
    const { results: items } = await c.env.DB.prepare(`
      SELECT ci.id, ci.count_id, ci.item_id, ci.system_quantity, ci.counted_quantity, ci.difference, ci.difference_pct, ci.unit, ci.notes,
             ci.pack_count, ci.per_pack_qty,
             ci.storage_zone_id, sz.zone_name AS storage_zone_name,
             i.item_code, i.item_name, i.unit AS item_unit, i.base_unit, i.pack_size, i.stock_mode,
             (SELECT inv.quantity FROM inventory inv
               WHERE inv.item_id = ci.item_id AND inv.entity_id = ?
                 AND IFNULL(inv.storage_zone_id, 0) = IFNULL(ci.storage_zone_id, 0)) AS current_quantity
      FROM inventory_count_items ci
      JOIN items i ON ci.item_id = i.id
      LEFT JOIN storage_zones sz ON ci.storage_zone_id = sz.id
      WHERE ci.count_id = ?
      ORDER BY i.item_code
    `).bind(countEntityId, id).all()

    // P3: ZONE 실사 + DRAFT일 때만 미배정 품목(구역 없는 재고) 제시 — 첫 실사가 구역 배정을 겸함
    let unassignedItems: any[] = []
    if (count.count_type === 'ZONE' && count.status === 'DRAFT') {
      const entityId = count.entity_id || getEntityId(c) || 1
      const { results: unassigned } = await c.env.DB.prepare(`
        SELECT i.id AS item_id, i.item_code, i.item_name, i.unit, i.base_unit, i.pack_size, i.stock_mode, inv.quantity
        FROM inventory inv
        JOIN items i ON i.id = inv.item_id
        WHERE inv.storage_zone_id IS NULL AND inv.entity_id = ?
          AND i.is_active = 1 AND i.is_purchase_item = 1
          AND i.id NOT IN (SELECT item_id FROM inventory_count_items WHERE count_id = ?)
        ORDER BY i.category, i.item_name, inv.id
      `).bind(entityId, id).all()
      unassignedItems = unassigned || []
    }

    return c.json({
      success: true,
      data: {
        ...count,
        items: items || [],
        unassigned_items: unassignedItems
      }
    })
  } catch (error) {
    console.error('src/routes/inventoryCount.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PUT /:id/items — 실사 항목 일괄 업데이트 (APPROVED 잠금 — 승인 후 기록 변조 방지)
inventoryCountRouter.put('/:id/items', async (c) => {
  try {
    const countId = parseInt(c.req.param('id'))
    const body = await c.req.json<{ items?: { id: number; system_quantity: string; counted_quantity: string | null; notes?: string; pack_count?: string | number | null; per_pack_qty?: string | number | null }[] }>()
    const { items = [] } = body

    // 타법인 실사 항목 수정 차단: 부모 count가 호출자 법인 소속인지 확인
    const efItems = entityFilter(c)
    const ownCount = await c.env.DB.prepare(
      `SELECT id, status FROM inventory_counts WHERE id = ?${efItems.clause}`
    ).bind(countId, ...efItems.params).first<{ status: string }>()
    if (!ownCount) {
      return c.json({ success: false, error: 'Count not found' }, 404)
    }
    if (ownCount.status === 'APPROVED') {
      return c.json({ success: false, error: '승인된 실사는 수정할 수 없습니다' }, 400)
    }

    // 일괄 업데이트 (batch). counted_quantity null/빈값 = 미입력(NULL) 되돌림 → 승인 시 보정 제외
    //
    // 0540 두 칸 입력 — pack_count(포장 수) × per_pack_qty(포장당 수량) = counted_quantity(base).
    //   ★포장당 수량이 **롤마다 다른** 자재(현수막 원단 112~135yd)를 담기 위한 것이다.
    //     고정 계수(items.pack_size)만으로는 못 담고, 현장에 곱셈을 시키면 오입력이 난다.
    //   pack_count 가 오면 그걸로 계산하고, 안 오면 counted_quantity 를 그대로 쓴다(기존 경로 보존).
    const numOrNull = (v: any) => {
      if (v === null || v === undefined || v === '') return null
      const n = Number(v)
      return Number.isFinite(n) ? n : null
    }
    if (items.length > 0) {
      await c.env.DB.batch(
        items.map((item: any) => {
          const packCount = numOrNull(item.pack_count)
          const perPack = numOrNull(item.per_pack_qty)
          // 두 칸 입력이면 곱해서 counted 를 만든다. per_pack_qty 미지정은 1 로 본다(환산 없는 자재).
          const counted = packCount !== null
            ? packCount * (perPack !== null && perPack > 0 ? perPack : 1)
            : numOrNull(item.counted_quantity)

          if (counted === null) {
            return c.env.DB.prepare(`
              UPDATE inventory_count_items
              SET counted_quantity = NULL, difference = NULL, difference_pct = NULL,
                  pack_count = NULL, per_pack_qty = ?, notes = ?
              WHERE id = ? AND count_id = ?
            `).bind(perPack, item.notes || '', item.id, countId)
          }
          const systemQty = Number(item.system_quantity)
          const diff = counted - systemQty
          const diffPct = systemQty !== 0 ? (diff / systemQty) * 100 : 0
          return c.env.DB.prepare(`
            UPDATE inventory_count_items
            SET counted_quantity = ?, difference = ?, difference_pct = ?,
                pack_count = ?, per_pack_qty = ?, notes = ?
            WHERE id = ? AND count_id = ?
          `).bind(counted, diff, diffPct, packCount, perPack, item.notes || '', item.id, countId)
        })
      )
    }

    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/inventoryCount.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /:id/add-items — 미배정 품목을 실사에 추가 (+선택적 구역 배정)
// P3: ZONE 실사 첫 단계에서 storage_zone_id IS NULL 품목을 실사에 편입하고, assign_zone=true면 그 구역으로 배정
inventoryCountRouter.post('/:id/add-items', async (c) => {
  try {
    const countId = parseInt(c.req.param('id'))
    const body = await c.req.json<{ item_ids?: number[]; assign_zone?: boolean }>()
    const itemIds = Array.from(new Set((body.item_ids || []).map(Number).filter((n) => Number.isFinite(n))))
    const assignZone = body.assign_zone === true

    // 타법인 차단: 부모 count가 호출자 법인 소속인지 확인 + count 정보 확보
    const ef = entityFilter(c)
    const count = await c.env.DB.prepare(
      `SELECT id, status, storage_zone_id, entity_id FROM inventory_counts WHERE id = ?${ef.clause}`
    ).bind(countId, ...ef.params).first<{ id: number; status: string; storage_zone_id: number | null; entity_id: number }>()
    if (!count) {
      return c.json({ success: false, error: 'Count not found' }, 404)
    }
    // 품목 편입(+구역 배정=재고 이동)은 작성중 실사에만 — 제출/승인 후 추가는 스냅샷 정합 붕괴
    if (count.status !== 'DRAFT') {
      return c.json({ success: false, error: '작성중 실사에만 품목을 추가할 수 있습니다' }, 400)
    }

    if (itemIds.length === 0) {
      return c.json({ success: true, added: 0 })
    }

    const entityId = count.entity_id || getEntityId(c) || 1
    const zoneId = count.storage_zone_id

    // 이미 이 실사에 든 품목 제외 (중복 방지) — IN 청크 80개 (D1 바인드 한도)
    const existing = new Set<number>()
    for (let i = 0; i < itemIds.length; i += 80) {
      const chunk = itemIds.slice(i, i + 80)
      const placeholders = chunk.map(() => '?').join(',')
      const { results } = await c.env.DB.prepare(
        `SELECT item_id FROM inventory_count_items WHERE count_id = ? AND item_id IN (${placeholders})`
      ).bind(countId, ...chunk).all<{ item_id: number }>()
      for (const r of (results || [])) existing.add(r.item_id)
    }
    const toAdd = itemIds.filter((id) => !existing.has(id))

    if (toAdd.length === 0) {
      return c.json({ success: true, added: 0 })
    }

    // 각 품목의 미배정(NULL zone) 재고·단위 조회 (system_quantity 산정) — 미배정 품목 편입이므로 NULL행 기준. IN 청크 80개
    const invMap = new Map<number, { quantity: number; unit: string }>()
    for (let i = 0; i < toAdd.length; i += 80) {
      const chunk = toAdd.slice(i, i + 80)
      const placeholders = chunk.map(() => '?').join(',')
      const { results } = await c.env.DB.prepare(`
        SELECT i.id AS item_id, COALESCE(inv.quantity, 0) AS quantity, i.unit
        FROM items i
        LEFT JOIN inventory inv ON inv.item_id = i.id AND inv.entity_id = ? AND inv.storage_zone_id IS NULL
        WHERE i.id IN (${placeholders})
      `).bind(entityId, ...chunk).all<{ item_id: number; quantity: number; unit: string | null }>()
      for (const r of (results || [])) invMap.set(r.item_id, { quantity: r.quantity || 0, unit: r.unit || 'YD' })
    }

    // batch: INSERT count_item(storage_zone_id=구역) (+ assign_zone면 미배정 NULL행을 구역으로 이동)
    const stmts = []
    for (const itemId of toAdd) {
      const inv = invMap.get(itemId) || { quantity: 0, unit: 'YD' }
      stmts.push(
        c.env.DB.prepare(`
          INSERT INTO inventory_count_items (count_id, item_id, system_quantity, unit, storage_zone_id)
          VALUES (?, ?, ?, ?, ?)
        `).bind(countId, itemId, inv.quantity, inv.unit, zoneId)
      )
      if (assignZone && zoneId) {
        // 0396: 미배정(NULL zone) 행을 대상 창고로 이동. 대상 행이 이미 있으면 수량 합산 후 NULL행 삭제.
        stmts.push(
          // 대상 창고 행 보장 (없으면 0으로 생성)
          c.env.DB.prepare(
            `INSERT OR IGNORE INTO inventory (item_id, entity_id, storage_zone_id, quantity) VALUES (?, ?, ?, 0)`
          ).bind(itemId, entityId, zoneId),
          // NULL행 수량을 대상 창고 행에 합산
          c.env.DB.prepare(
            `UPDATE inventory SET quantity = quantity + COALESCE(
               (SELECT quantity FROM inventory n WHERE n.item_id = ? AND n.entity_id = ? AND n.storage_zone_id IS NULL), 0),
               last_updated = CURRENT_TIMESTAMP
             WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id,0) = IFNULL(?,0)`
          ).bind(itemId, entityId, itemId, entityId, zoneId),
          // NULL행 삭제 (이동 완료)
          c.env.DB.prepare(
            `DELETE FROM inventory WHERE item_id = ? AND entity_id = ? AND storage_zone_id IS NULL`
          ).bind(itemId, entityId)
        )
      }
    }
    await c.env.DB.batch(stmts)

    return c.json({ success: true, added: toAdd.length })
  } catch (error) {
    console.error('src/routes/inventoryCount.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PATCH /:id/submit — 제출 (SUBMITTED)
inventoryCountRouter.patch('/:id/submit', async (c) => {
  try {
    const countId = parseInt(c.req.param('id'))
    // #436: 미전송 X-User-Id 헤더(항상 undefined)→'system' 고정 버그. JWT 검증 유저로 실제 제출자 기록
    const userId = c.get('user')?.username || 'system'
    const ef = entityFilter(c)

    const result = await c.env.DB.prepare(`
      UPDATE inventory_counts
      SET status = 'SUBMITTED', submitted_by = ?, submitted_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'DRAFT'${ef.clause}
    `).bind(userId, countId, ...ef.params).run()

    if ((result.meta.changes || 0) === 0) {
      return c.json({ success: false, error: 'Count not found or already submitted' }, 400)
    }

    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/inventoryCount.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PATCH /:id/reject — 반려 (SUBMITTED → DRAFT, 실사 UX 라⑥)
inventoryCountRouter.patch('/:id/reject', async (c) => {
  try {
    const countId = parseInt(c.req.param('id'))
    const ef = entityFilter(c)
    const result = await c.env.DB.prepare(`
      UPDATE inventory_counts
      SET status = 'DRAFT', submitted_by = NULL, submitted_at = NULL
      WHERE id = ? AND status = 'SUBMITTED'${ef.clause}
    `).bind(countId, ...ef.params).run()
    if ((result.meta.changes || 0) === 0) {
      return c.json({ success: false, error: '제출됨 상태의 실사만 반려할 수 있습니다' }, 400)
    }
    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/inventoryCount.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// DELETE /:id — 작성중(DRAFT) 실사 삭제 (실사 UX 라⑥ — 잘못 만든 실사 정리)
inventoryCountRouter.delete('/:id', async (c) => {
  try {
    const countId = parseInt(c.req.param('id'))
    const ef = entityFilter(c)
    const count = await c.env.DB.prepare(
      `SELECT id, status FROM inventory_counts WHERE id = ?${ef.clause}`
    ).bind(countId, ...ef.params).first<{ status: string }>()
    if (!count) {
      return c.json({ success: false, error: 'Count not found' }, 404)
    }
    if (count.status !== 'DRAFT') {
      return c.json({ success: false, error: '작성중 실사만 삭제할 수 있습니다' }, 400)
    }
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM inventory_count_items WHERE count_id = ?').bind(countId),
      c.env.DB.prepare(`DELETE FROM inventory_counts WHERE id = ? AND status = 'DRAFT'`).bind(countId),
    ])
    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/inventoryCount.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PATCH /:id/approve — 승인 (APPROVED) + inventory 보정
inventoryCountRouter.patch('/:id/approve', async (c) => {
  try {
    const countId = parseInt(c.req.param('id'))
    // #436: 미전송 X-User-Id 헤더(항상 undefined)→'system' 고정 버그. JWT 검증 유저로 실제 승인자 기록
    const userId = c.get('user')?.username || 'system'

    // 먼저 count 조회 (타법인 실사 승인 차단)
    const ef = entityFilter(c)
    const count = await c.env.DB.prepare(`
      SELECT id, count_number, count_date, count_type, status, submitted_by, submitted_at, approved_by, approved_at, notes, created_at, entity_id FROM inventory_counts WHERE id = ?${ef.clause}
    `).bind(countId, ...ef.params).first<{ status: string; entity_id: number }>()

    if (!count || count.status !== 'SUBMITTED') {
      return c.json({ success: false, error: 'Count not found or not submitted' }, 400)
    }

    // count_items 조회 (0396: storage_zone_id 포함 — 그 창고 행을 보정)
    const { results: countItems } = await c.env.DB.prepare(`
      SELECT id, count_id, item_id, system_quantity, counted_quantity, difference, difference_pct, unit, notes, storage_zone_id FROM inventory_count_items WHERE count_id = ?
    `).bind(countId).all<{ item_id: number; system_quantity: number; counted_quantity: number | null; storage_zone_id: number | null }>()

    // 미입력(counted_quantity NULL) 항목은 보정 제외 — NULL 바인드 시 inventory.quantity=NULL 재고 소실
    const adjustable = (countItems || []).filter(
      (item): item is typeof item & { counted_quantity: number } => item.counted_quantity != null
    )
    const skippedCount = (countItems || []).length - adjustable.length

    // #152: 재고 보정 + 상태 변경을 단일 batch로 원자화 (이중 조정 방지)
    // #356: 호출자 entity가 아닌 실사 행의 entity로 보정 (타법인 재고 오조정 방지)
    const entityId = count.entity_id || getEntityId(c) || 1
    const batchStmts = adjustable.flatMap((item) => {
      const zoneId = item.storage_zone_id ?? null
      return [
        // 0396: 대상 창고 행이 없으면 생성 (이후 UPDATE가 counted로 보정). 키 = (item, entity, zone)
        c.env.DB.prepare(
          `INSERT OR IGNORE INTO inventory (item_id, entity_id, storage_zone_id, quantity) VALUES (?, ?, ?, 0)`
        ).bind(item.item_id, entityId, zoneId),
        c.env.DB.prepare(`
          UPDATE inventory SET quantity = ?, last_updated = CURRENT_TIMESTAMP
          WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id,0) = IFNULL(?,0)
        `).bind(item.counted_quantity, item.item_id, entityId, zoneId),
        // #394: inventory_transactions 실제 스키마로 재작성 (inventory.ts:505 패턴).
        // 기존 컬럼셋(quantity_before/after/change/created_by)은 inventory_adjustments 것 — 혼동 버그.
        c.env.DB.prepare(`
          INSERT INTO inventory_transactions (item_id, transaction_type, quantity, balance_after, reference_type, reference_id, reason, notes, handled_by, transaction_date, entity_id, storage_zone_id)
          VALUES (?, 'ADJUST', ?, ?, 'STOCK_COUNT', ?, 'STOCK_COUNT', ?, ?, datetime('now'), ?, ?)
        `).bind(
          item.item_id,
          item.counted_quantity - item.system_quantity, // quantity: 조정 변화량(부호 유지)
          item.counted_quantity,                         // balance_after: 보정 후 잔량
          countId,                                       // reference_id
          `Inventory Count ID: ${countId}`,              // notes
          c.get('user')?.id || null,                     // #394: handled_by는 users(id) FK — 'system' 문자열은 FK 위반(prod FK 강제). JWT user.id 또는 NULL(inventory.ts:505 패턴)
          entityId,
          zoneId                                         // 0396: 창고별 거래 추적
        )
      ]
    })
    // 상태 변경을 batch 마지막에 포함 — 보정+상태가 동시에 반영
    batchStmts.push(
      c.env.DB.prepare(`UPDATE inventory_counts SET status = 'APPROVED', approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'SUBMITTED'`).bind(userId, countId)
    )
    await c.env.DB.batch(batchStmts)

    return c.json({ success: true, adjusted: adjustable.length, skipped: skippedCount })
  } catch (error) {
    console.error('src/routes/inventoryCount.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default inventoryCountRouter
