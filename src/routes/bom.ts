// ============================================================================
// 자재명세(BOM) 라우트 — 신모델 product_materials 기반 읽기전용 개요
// ----------------------------------------------------------------------------
// 구버전(bom_items + MRP)은 품목 신모델(2026-06-19, product_materials) 도입으로
// 은퇴. 자재차감 실로직 = utils/autoDeductInventory.ts(print 시점). 이 페이지는
// 제품→자재 매핑(product_materials) + 자재 차감설정을 한눈에 보여주는 개요.
// 편집 SSOT = items 페이지(원자재 연결). bom_items 테이블은 weeklyPurchase /
// materialShortageCheck가 아직 참조하므로 보존(여기선 미사용).
// ============================================================================

import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'

const bom = new Hono<HonoEnv>()
bom.use('*', authMiddleware)
bom.use('*', requireRole('ADMIN', 'MANAGER'))

// GET /overview — 제품별 자재명세 개요 (product_materials 기반)
//   - products: 자재가 연결된 제품 + 각 자재의 차감설정
//   - unmapped: 제품(item_type=PRODUCT)인데 자재 미연결 → 자동차감 누락 경고
//   - 자재(items·product_materials)는 법인 공유 → entity 필터 없음 (BOM 공유정책)
bom.get('/overview', async (c) => {
  try {
    // 1. 제품→자재 매핑 (자재 차감설정 동봉)
    const { results: rows } = await c.env.DB.prepare(`
      SELECT
        p.id            AS product_id,
        p.item_code     AS product_code,
        p.item_name     AS product_name,
        COALESCE(NULLIF(p.category, ''), '미분류') AS category,
        p.item_group    AS item_group,
        pm.material_item_id,
        pm.is_default,
        m.item_code     AS material_code,
        m.item_name     AS material_name,
        COALESCE(m.deduction_method, 'ROLL') AS deduction_method,
        m.width_mm      AS width_mm,
        m.sheet_spec    AS sheet_spec,
        COALESCE(m.waste_factor, 1.0) AS waste_factor,
        m.base_unit     AS base_unit,
        m.unit          AS unit
      FROM product_materials pm
      JOIN items p ON pm.product_item_id = p.id
      JOIN items m ON pm.material_item_id = m.id
      WHERE p.is_active = 1
      ORDER BY category, p.item_name, pm.is_default DESC, m.width_mm, m.item_name
    `).all() as { results: any[] }

    // 제품 단위로 그룹핑 (제품 → materials[])
    const productMap = new Map<number, any>()
    for (const r of rows) {
      let prod = productMap.get(r.product_id)
      if (!prod) {
        prod = {
          id: r.product_id,
          item_code: r.product_code,
          item_name: r.product_name,
          category: r.category,
          item_group: r.item_group,
          materials: [],
        }
        productMap.set(r.product_id, prod)
      }
      prod.materials.push({
        material_item_id: r.material_item_id,
        material_code: r.material_code,
        material_name: r.material_name,
        deduction_method: r.deduction_method,
        width_mm: r.width_mm,
        sheet_spec: r.sheet_spec,
        waste_factor: r.waste_factor,
        base_unit: r.base_unit,
        unit: r.unit,
        is_default: r.is_default,
      })
    }
    const products = Array.from(productMap.values())

    // 2. 자재 미연결 제품 (item_type=PRODUCT인데 product_materials 없음 → 차감 누락)
    const { results: unmapped } = await c.env.DB.prepare(`
      SELECT id, item_code, item_name, COALESCE(NULLIF(category, ''), '미분류') AS category
      FROM items
      WHERE is_active = 1 AND item_type = 'PRODUCT'
        AND id NOT IN (SELECT DISTINCT product_item_id FROM product_materials)
      ORDER BY category, item_name
    `).all() as { results: any[] }

    // 3. 전체 제품 수
    const totalRow = await c.env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM items WHERE is_active = 1 AND item_type = 'PRODUCT'`
    ).first() as any
    const totalProducts = totalRow?.cnt || 0

    return c.json({
      success: true,
      data: {
        products,
        unmapped,
        summary: {
          totalProducts,
          mappedProducts: products.length,
          unmappedProducts: unmapped.length,
        },
      },
    })
  } catch (error) {
    console.error('src/routes/bom.ts overview error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default bom
