import { Hono } from 'hono'
import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware } from '../middleware/auth'
import { entityFilter, getWriteEntityId } from '../utils/entityFilter'

// TODO: priceList /calculate와 로직 중복 — 향후 공유 헬퍼로 통합
// (Phase 1 스코프: priceList.ts를 건드리지 않기 위해 적용가 계산을 여기 자체 구현.
//  priceList.ts:213 GET /calculate 우선순위를 동일하게 복제 — 품목고정가 > 품목할인율 > 카테고리율 > 전체기본.)

const priceSheetsRouter = new Hono<HonoEnv>()
priceSheetsRouter.use('/*', authMiddleware)

interface PriceRule { category: string | null; item_id: number | null; rate_percent: number; fixed_price: number | null }
interface SheetItemRow {
  item_id: number
  item_code: string
  item_name: string
  specification: string | null
  unit: string | null
  base_price: number | null
  sales_price: number | null
  category: string | null
}

/** priceList /calculate와 동일 우선순위로 적용가 계산. rules 비었으면 base(=sales_price||base_price). */
function computeAppliedPrice(item: SheetItemRow, rules: PriceRule[]): number {
  const base = item.sales_price || item.base_price || 0
  if (!rules.length) return base

  const itemFixed = rules.find((r) => r.item_id === item.item_id && r.fixed_price != null)
  if (itemFixed) return itemFixed.fixed_price as number

  const itemRate = rules.find((r) => r.item_id === item.item_id && !r.fixed_price)
  if (itemRate) return Math.round(base * (1 + itemRate.rate_percent / 100))

  const catRate = rules.find((r) => !r.item_id && r.category === item.category)
  if (catRate) return Math.round(base * (1 + catRate.rate_percent / 100))

  const defaultRate = rules.find((r) => !r.item_id && !r.category)
  if (defaultRate) return Math.round(base * (1 + defaultRate.rate_percent / 100))

  return base
}

/** client_id로 정책 규칙 로드(없으면 빈 배열). */
async function loadPolicyRules(c: Context<HonoEnv>, clientId: number | null): Promise<PriceRule[]> {
  if (!clientId) return []
  const client = await c.env.DB.prepare(
    'SELECT price_policy_id FROM clients WHERE id = ?'
  ).bind(clientId).first<{ price_policy_id: number | null }>()
  if (!client?.price_policy_id) return []
  const { results } = await c.env.DB.prepare(`
    SELECT category, item_id, rate_percent, fixed_price
    FROM price_policy_rules WHERE policy_id = ?
  `).bind(client.price_policy_id).all<PriceRule>()
  return results || []
}

// ============================================================================
// GET / — 세트 목록 (entity별): id, name, client_id, client명, valid_until, 품목수, updated_at
// ============================================================================
priceSheetsRouter.get('/', async (c) => {
  try {
    const ef = entityFilter(c, 's')
    const { results } = await c.env.DB.prepare(`
      SELECT s.id, s.name, s.client_id, s.valid_until, s.updated_at,
             (SELECT client_name FROM clients WHERE id = s.client_id) AS client_name,
             (SELECT COUNT(*) FROM price_sheet_items WHERE sheet_id = s.id) AS item_count
      FROM price_sheets s
      WHERE 1=1${ef.clause}
      ORDER BY s.updated_at DESC, s.id DESC
    `).bind(...ef.params).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('priceSheets GET / error:', error)
    return c.json({ success: false, error: '단가표 세트 목록 조회 실패' }, 500)
  }
})

// ============================================================================
// GET /:id — 세트 상세: 메타 + items(item_id/code/name/specification/unit/적용가)
// ============================================================================
priceSheetsRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const ef = entityFilter(c)
    const sheet = await c.env.DB.prepare(
      `SELECT id, entity_id, name, client_id, valid_until, notes, contact_person, contact_phone, show_stamp, created_at, updated_at
       FROM price_sheets WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ id: number; client_id: number | null }>()
    if (!sheet) return c.json({ success: false, error: '단가표 세트를 찾을 수 없습니다.' }, 404)

    let clientName = ''
    if (sheet.client_id) {
      const cl = await c.env.DB.prepare('SELECT client_name FROM clients WHERE id = ?')
        .bind(sheet.client_id).first<{ client_name: string }>()
      clientName = cl?.client_name || ''
    }

    const { results: itemRows } = await c.env.DB.prepare(`
      SELECT psi.item_id, i.item_code, i.item_name, i.specification, i.unit,
             i.base_price, i.sales_price, i.category
      FROM price_sheet_items psi
      JOIN items i ON i.id = psi.item_id
      WHERE psi.sheet_id = ?
      ORDER BY psi.sort_order, psi.id
    `).bind(id).all<SheetItemRow>()

    const rules = await loadPolicyRules(c, sheet.client_id)
    const items = (itemRows || []).map((it) => ({
      item_id: it.item_id,
      item_code: it.item_code,
      item_name: it.item_name,
      specification: it.specification,
      unit: it.unit,
      price: computeAppliedPrice(it, rules)
    }))

    return c.json({ success: true, data: { ...sheet, client_name: clientName, items } })
  } catch (error) {
    console.error('priceSheets GET /:id error:', error)
    return c.json({ success: false, error: '단가표 세트 조회 실패' }, 500)
  }
})

// ============================================================================
// POST / — 세트 생성 (entity_id 주입 필수)
// ============================================================================
priceSheetsRouter.post('/', async (c) => {
  try {
    const entityId = getWriteEntityId(c)
    if (entityId == null) {
      return c.json({ success: false, error: '전체 모드에서는 세트를 생성할 수 없습니다. 상단에서 법인을 선택하세요.' }, 400)
    }

    const body = await c.req.json<{
      name?: string; client_id?: number | null; valid_until?: string | null; notes?: string | null;
      contact_person?: string | null; contact_phone?: string | null; show_stamp?: number; item_ids?: number[]
    }>()

    const name = (body.name || '').trim()
    if (!name) return c.json({ success: false, error: '세트 이름은 필수입니다.' }, 400)

    const userId = c.get('user')?.id || null
    const showStamp = body.show_stamp === 0 ? 0 : 1
    const itemIds = dedupeIds(body.item_ids)

    const result = await c.env.DB.prepare(`
      INSERT INTO price_sheets (entity_id, name, client_id, valid_until, notes, contact_person, contact_phone, show_stamp, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      entityId, name, body.client_id || null, body.valid_until || null, body.notes || null,
      body.contact_person || null, body.contact_phone || null, showStamp, userId
    ).run()

    const sheetId = result.meta.last_row_id
    if (itemIds.length) {
      const stmts = itemIds.map((itemId, i) => c.env.DB.prepare(
        'INSERT INTO price_sheet_items (sheet_id, item_id, sort_order) VALUES (?, ?, ?)'
      ).bind(sheetId, itemId, i))
      await c.env.DB.batch(stmts)
    }

    return c.json({ success: true, data: { id: sheetId } })
  } catch (error) {
    console.error('priceSheets POST / error:', error)
    return c.json({ success: false, error: '단가표 세트 생성 실패' }, 500)
  }
})

// ============================================================================
// PUT /:id — 메타 수정 + item_ids 전량 교체(delete+insert) + updated_at
// ============================================================================
priceSheetsRouter.put('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const ef = entityFilter(c)
    const owner = await c.env.DB.prepare(`SELECT id FROM price_sheets WHERE id = ?${ef.clause}`)
      .bind(id, ...ef.params).first()
    if (!owner) return c.json({ success: false, error: '단가표 세트를 찾을 수 없습니다.' }, 404)

    const body = await c.req.json<{
      name?: string; client_id?: number | null; valid_until?: string | null; notes?: string | null;
      contact_person?: string | null; contact_phone?: string | null; show_stamp?: number; item_ids?: number[]
    }>()
    const name = (body.name || '').trim()
    if (!name) return c.json({ success: false, error: '세트 이름은 필수입니다.' }, 400)

    const showStamp = body.show_stamp === 0 ? 0 : 1
    const itemIds = dedupeIds(body.item_ids)

    const stmts: any[] = [
      c.env.DB.prepare(`
        UPDATE price_sheets
        SET name = ?, client_id = ?, valid_until = ?, notes = ?, contact_person = ?, contact_phone = ?, show_stamp = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        name, body.client_id || null, body.valid_until || null, body.notes || null,
        body.contact_person || null, body.contact_phone || null, showStamp, id
      ),
      c.env.DB.prepare('DELETE FROM price_sheet_items WHERE sheet_id = ?').bind(id)
    ]
    itemIds.forEach((itemId, i) => {
      stmts.push(c.env.DB.prepare(
        'INSERT INTO price_sheet_items (sheet_id, item_id, sort_order) VALUES (?, ?, ?)'
      ).bind(id, itemId, i))
    })
    await c.env.DB.batch(stmts)

    return c.json({ success: true })
  } catch (error) {
    console.error('priceSheets PUT /:id error:', error)
    return c.json({ success: false, error: '단가표 세트 수정 실패' }, 500)
  }
})

// ============================================================================
// DELETE /:id — 세트 + items 삭제
// ============================================================================
priceSheetsRouter.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const ef = entityFilter(c)
    const owner = await c.env.DB.prepare(`SELECT id FROM price_sheets WHERE id = ?${ef.clause}`)
      .bind(id, ...ef.params).first()
    if (!owner) return c.json({ success: false, error: '단가표 세트를 찾을 수 없습니다.' }, 404)

    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM price_sheet_items WHERE sheet_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM price_sheets WHERE id = ?').bind(id)
    ])

    return c.json({ success: true })
  } catch (error) {
    console.error('priceSheets DELETE /:id error:', error)
    return c.json({ success: false, error: '단가표 세트 삭제 실패' }, 500)
  }
})

/** item_ids를 정수·양수·중복제거로 정규화(UNIQUE(sheet_id,item_id) 위반·잘못된 값 방지). */
function dedupeIds(raw: number[] | undefined): number[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<number>()
  const out: number[] = []
  for (const v of raw) {
    const n = Number(v)
    if (!Number.isInteger(n) || n <= 0 || seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out
}

export { priceSheetsRouter }
export default priceSheetsRouter
