import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'

const autoProcessRouter = new Hono<HonoEnv>()

autoProcessRouter.use('/*', authMiddleware, requireRole('ADMIN'))

// ── 축소비율 / 여백 규칙 ─────────────────────────────────────────

const SCALE_RULES: Record<string, number> = {
  '현수막': 5, '게시대': 5, '게릴라': 5, '솔벤현수막': 5,
  '패트': 1, '솔벤시트': 1, '합성지': 1, '포맥스': 1,
  'UV': 1, '클리어필름': 1, '간판': 1,
}

const MARGIN_RULES: Record<string, { w: number; h: number }> = {
  '미싱': { w: 83, h: 0 },
  '사방접어미싱': { w: 61, h: 61 },
  '접어미싱': { w: 34, h: 0 },
  '봉미싱': { w: 0, h: 55 },
  '밴드미싱': { w: 2, h: 0 },
  '사방미싱': { w: 2, h: 0 },
  '열재단': { w: 14, h: 0 },
  '재단만': { w: 0, h: 0 },
  '사방큰펀칭': { w: 0, h: 0 },
  '양옆접어미싱+사방큰펀칭': { w: 34, h: 0 },
  '열재단+사방큰펀칭': { w: 14, h: 0 },
}

function getScale(product: string, widthCm: number): number {
  const base = SCALE_RULES[product] ?? 5
  if (['현수막', '게시대', '솔벤현수막', '게릴라'].includes(product)) {
    if (widthCm > 300) return 5
    if (widthCm > 150) return 2
    return base
  }
  return base
}

function getMargins(finishing: string): { w: number; h: number } {
  if (!finishing) return { w: 0, h: 0 }
  if (MARGIN_RULES[finishing]) return MARGIN_RULES[finishing]
  const keys = Object.keys(MARGIN_RULES).sort((a, b) => b.length - a.length)
  for (const k of keys) {
    if (finishing.includes(k)) return MARGIN_RULES[k]
  }
  return { w: 0, h: 0 }
}

// ── POST /api/auto-process/start ──────────────────────────────────
// 주문 등록 시 호출: order_id의 모든 ai_group 품목에 대해 가공 job 생성
autoProcessRouter.post('/start', async (c) => {
  try {
    const { order_id } = await c.req.json<{ order_id: number }>()
    if (!order_id) return c.json({ success: false, error: 'order_id 필요' }, 400)

    // 주문 정보 조회
    const order = await c.env.DB.prepare(
      `SELECT id, ai_file_path, ai_analysis_id FROM orders WHERE id = ?`
    ).bind(order_id).first() as any
    if (!order) return c.json({ success: false, error: '주문을 찾을 수 없습니다' }, 404)
    if (!order.ai_analysis_id) return c.json({ success: false, error: 'AI 분석 정보가 없는 주문입니다' }, 400)

    // 분석 결과 조회 (groups_json)
    const analysis = await c.env.DB.prepare(
      `SELECT id, file_path, groups_json FROM ai_analysis_requests WHERE id = ?`
    ).bind(order.ai_analysis_id).first() as any
    if (!analysis) return c.json({ success: false, error: '분석 결과를 찾을 수 없습니다' }, 404)

    const groups = JSON.parse(analysis.groups_json || '[]')

    // 주문 품목 조회 (ai_group_index가 있는 것만)
    const items = await c.env.DB.prepare(
      `SELECT id, item_id, width, height, ai_group_index, scale_factor,
              finishing, finishing2, finishing3
       FROM order_items WHERE order_id = ? AND ai_analysis_id IS NOT NULL`
    ).bind(order_id).all()

    if (!items.results || items.results.length === 0) {
      return c.json({ success: false, error: '자동가공 대상 품목이 없습니다' }, 400)
    }

    const jobs: any[] = []

    // Bulk-fetch item names for all order_items in one query
    const itemIds = [...new Set(
      (items.results as any[]).map((i: any) => i.item_id).filter(Boolean)
    )] as number[]
    let itemNameMap = new Map<number, string>()
    if (itemIds.length > 0) {
      const placeholders = itemIds.map(() => '?').join(', ')
      const { results: itemRows } = await c.env.DB.prepare(
        `SELECT id, name FROM items WHERE id IN (${placeholders})`
      ).bind(...itemIds).all<{ id: number; name: string }>()
      itemNameMap = new Map(itemRows.map(row => [row.id, row.name]))
    }

    for (const item of items.results as any[]) {
      const groupIdx = item.ai_group_index ?? 0
      const group = groups[groupIdx]
      if (!group) continue

      // 품목명 Map에서 조회 (N+1 제거)
      const productName = item.item_id ? (itemNameMap.get(item.item_id) ?? '') : ''

      // 후가공 합치기
      const finishing = [item.finishing, item.finishing2, item.finishing3]
        .filter(Boolean).join('+')

      // 축소비율 결정
      const widthCm = item.width || 0
      const scale = item.scale_factor || getScale(productName, widthCm)

      // 여백 계산
      const margins = getMargins(finishing)
      const marginLcm = margins.w / 10.0 / scale
      const marginRcm = margins.w / 10.0 / scale
      const marginTcm = margins.h > 0 ? margins.h / 10.0 / scale : 0
      const marginBcm = margins.h > 0 ? margins.h / 10.0 / scale : 0

      // clipBounds (그룹의 bounds_mm)
      const clipBounds = group.bounds_mm || null

      // 출력 경로 생성
      const timestamp = Date.now()
      const outputDir = 'Z:\\Designs\\IllustratorAutomat\\_auto_output'
      const srcBase = (analysis.file_path || 'output').split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || 'output'
      const epsOutput = `${outputDir}\\${srcBase}_g${groupIdx}_${timestamp}.eps`
      const pngOutput = `${outputDir}\\${srcBase}_g${groupIdx}_${timestamp}.png`

      // iaParams 구성 (ProcessOrderItem.jsx용)
      const iaParams = {
        mode: 'process',
        source: analysis.file_path,
        output: outputDir,
        epsOutput,
        pngOutput,
        marginL: marginLcm,
        marginR: marginRcm,
        marginT: marginTcm,
        marginB: marginBcm,
        thumbSize: 300,
        scaleFactor: scale,
        clipBounds,
      }

      // job INSERT
      const job = await c.env.DB.prepare(
        `INSERT INTO auto_process_jobs
         (order_id, order_item_id, ai_analysis_id, ai_group_index,
          source_path, product, width_cm, height_cm, finishing,
          scale_factor, clip_bounds, margins, status, ia_params)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
         RETURNING id, status`
      ).bind(
        order_id,
        item.id,
        order.ai_analysis_id,
        groupIdx,
        analysis.file_path,
        productName,
        widthCm,
        item.height || 0,
        finishing,
        scale,
        JSON.stringify(clipBounds),
        JSON.stringify({ L: marginLcm, R: marginRcm, T: marginTcm, B: marginBcm }),
        JSON.stringify(iaParams),
      ).first()

      jobs.push(job)
    }

    return c.json({ success: true, jobs_created: jobs.length, jobs })
  } catch (error) {
    console.error('AutoProcess error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── GET /api/auto-process/pending ────────────────────────────────
// IllustratorAutomat 폴링: 대기 중인 작업 조회
autoProcessRouter.get('/pending', async (c) => {
  try {
    const result = await c.env.DB.prepare(
      `SELECT id, order_id, order_item_id, source_path, product,
              scale_factor, ia_params, created_at
       FROM auto_process_jobs
       WHERE status = 'pending'
       ORDER BY created_at ASC
       LIMIT 10`
    ).all()

    return c.json({ success: true, jobs: result.results || [] })
  } catch (error) {
    console.error('AutoProcess error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── PATCH /api/auto-process/:id ──────────────────────────────────
// IllustratorAutomat 결과 업데이트 (done/failed)
autoProcessRouter.patch('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    const body = await c.req.json<{
      status: string
      output_eps_path?: string
      output_png_path?: string
      output_png_base64?: string
      error_message?: string
    }>()

    if (!['processing', 'done', 'failed'].includes(body.status)) {
      return c.json({ success: false, error: '유효하지 않은 상태: ' + body.status }, 400)
    }

    const updates: string[] = ['status = ?']
    const values: any[] = [body.status]

    if (body.status === 'done') {
      updates.push('processed_at = CURRENT_TIMESTAMP')
      if (body.output_eps_path) { updates.push('output_eps_path = ?'); values.push(body.output_eps_path) }
      if (body.output_png_path) { updates.push('output_png_path = ?'); values.push(body.output_png_path) }
      if (body.output_png_base64) { updates.push('output_png_base64 = ?'); values.push(body.output_png_base64) }
    }

    if (body.status === 'failed' && body.error_message) {
      updates.push('error_message = ?')
      values.push(body.error_message)
    }

    if (body.status === 'processing') {
      updates.push('processed_at = CURRENT_TIMESTAMP')
    }

    values.push(id)

    await c.env.DB.prepare(
      `UPDATE auto_process_jobs SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values).run()

    return c.json({ success: true })
  } catch (error) {
    console.error('AutoProcess error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── GET /api/auto-process/order/:orderId ─────────────────────────
// 주문별 가공 결과 조회
autoProcessRouter.get('/order/:orderId', async (c) => {
  try {
    const orderId = parseInt(c.req.param('orderId'))
    const result = await c.env.DB.prepare(
      `SELECT apj.*, oi.width, oi.height,
              i.item_name as item_name
       FROM auto_process_jobs apj
       LEFT JOIN order_items oi ON apj.order_item_id = oi.id
       LEFT JOIN items i ON oi.item_id = i.id
       WHERE apj.order_id = ?
       ORDER BY apj.ai_group_index ASC`
    ).bind(orderId).all()

    return c.json({ success: true, jobs: result.results || [] })
  } catch (error) {
    console.error('AutoProcess error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── POST /api/auto-process/:id/approve ───────────────────────────
// 디자이너 승인 → 공유폴더 저장 경로 생성
autoProcessRouter.post('/:id/approve', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    const user = c.get('user')

    // job 조회
    const job = await c.env.DB.prepare(
      `SELECT apj.*, o.order_number, oi.item_id
       FROM auto_process_jobs apj
       JOIN orders o ON apj.order_id = o.id
       JOIN order_items oi ON apj.order_item_id = oi.id
       WHERE apj.id = ?`
    ).bind(id).first() as any

    if (!job) return c.json({ success: false, error: '작업을 찾을 수 없습니다' }, 404)
    if (job.status !== 'done') return c.json({ success: false, error: '완료된 작업만 승인 가능합니다' }, 400)

    // 품목 대분류 조회
    const item = await c.env.DB.prepare(
      `SELECT name, category FROM items WHERE id = ?`
    ).bind(job.item_id).first() as any
    const category = item?.category || item?.name || '기타'

    // 저장 경로 생성: Z:\[품목 대분류]\YYYY\MM\DD\주문번호\
    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    const orderNumber = job.order_number || `ORD-${job.order_id}`
    const savedPath = `Z:\\${category}\\${yyyy}\\${mm}\\${dd}\\${orderNumber}\\`

    // 승인 처리
    await c.env.DB.prepare(
      `UPDATE auto_process_jobs
       SET status = 'approved', approved_at = CURRENT_TIMESTAMP, approved_by = ?, saved_path = ?
       WHERE id = ?`
    ).bind(user?.id || 0, savedPath, id).run()

    return c.json({
      success: true,
      saved_path: savedPath,
      message: `승인 완료. EPS 파일이 ${savedPath}에 저장됩니다.`
    })
  } catch (error) {
    console.error('AutoProcess error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── POST /api/auto-process/:id/retry ─────────────────────────────
// 재가공 요청 (파라미터 수정 가능)
autoProcessRouter.post('/:id/retry', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    const body = await c.req.json<{
      scale_factor?: number
      finishing?: string
      clip_bounds?: any
    }>()

    // 기존 job 조회
    const job = await c.env.DB.prepare(
      `SELECT * FROM auto_process_jobs WHERE id = ?`
    ).bind(id).first() as any
    if (!job) return c.json({ success: false, error: '작업을 찾을 수 없습니다' }, 404)

    // 파라미터 업데이트
    const scale = body.scale_factor || job.scale_factor
    const finishing = body.finishing || job.finishing
    const clipBounds = body.clip_bounds || JSON.parse(job.clip_bounds || '{}')

    // 여백 재계산
    const margins = getMargins(finishing)
    const marginLcm = margins.w / 10.0 / scale
    const marginRcm = margins.w / 10.0 / scale
    const marginTcm = margins.h > 0 ? margins.h / 10.0 / scale : 0
    const marginBcm = margins.h > 0 ? margins.h / 10.0 / scale : 0

    // 새 출력 경로
    const timestamp = Date.now()
    const outputDir = 'Z:\\Designs\\IllustratorAutomat\\_auto_output'
    const srcBase = (job.source_path || 'output').split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || 'output'
    const epsOutput = `${outputDir}\\${srcBase}_retry_${timestamp}.eps`
    const pngOutput = `${outputDir}\\${srcBase}_retry_${timestamp}.png`

    const iaParams = {
      mode: 'process',
      source: job.source_path,
      output: outputDir,
      epsOutput,
      pngOutput,
      marginL: marginLcm,
      marginR: marginRcm,
      marginT: marginTcm,
      marginB: marginBcm,
      thumbSize: 300,
      scaleFactor: scale,
      clipBounds,
    }

    // job 업데이트 (pending으로 되돌림)
    await c.env.DB.prepare(
      `UPDATE auto_process_jobs
       SET status = 'pending', scale_factor = ?, finishing = ?,
           clip_bounds = ?, margins = ?, ia_params = ?,
           output_eps_path = NULL, output_png_path = NULL, output_png_base64 = NULL,
           error_message = NULL, processed_at = NULL, approved_at = NULL, approved_by = NULL, saved_path = NULL
       WHERE id = ?`
    ).bind(
      scale, finishing, JSON.stringify(clipBounds),
      JSON.stringify({ L: marginLcm, R: marginRcm, T: marginTcm, B: marginBcm }),
      JSON.stringify(iaParams), id
    ).run()

    return c.json({ success: true, message: '재가공 요청됨', ia_params: iaParams })
  } catch (error) {
    console.error('AutoProcess error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── POST /api/auto-process/auto-match ─────────────────────────────
// 클러스터 자동 매칭: groups_json과 주문 품목 규격을 비교하여 최적 그룹 인덱스 추천
// 전략: 50mm 미만 그룹 제외 + 비율(가로/세로) 가장 가까운 그룹 선택
autoProcessRouter.post('/auto-match', async (c) => {
  try {
    const { ai_analysis_id, items } = await c.req.json<{
      ai_analysis_id: number
      items: Array<{ id: number; width_cm: number; height_cm: number }>
    }>()

    if (!ai_analysis_id || !items?.length) {
      return c.json({ success: false, error: 'ai_analysis_id와 items 필요' }, 400)
    }

    // 분석 결과 조회
    const analysis = await c.env.DB.prepare(
      `SELECT groups_json FROM ai_analysis_requests WHERE id = ?`
    ).bind(ai_analysis_id).first() as any
    if (!analysis?.groups_json) {
      return c.json({ success: false, error: '분석 결과를 찾을 수 없습니다' }, 404)
    }

    const groups: Array<{ index: number; width_mm: number; height_mm: number; name?: string }> =
      JSON.parse(analysis.groups_json)

    // 50mm 미만 그룹 필터링
    const MIN_SIZE_MM = 50
    const validGroups = groups.filter(g =>
      g.width_mm >= MIN_SIZE_MM || g.height_mm >= MIN_SIZE_MM
    )

    const RATIO_TOL = 0.20

    const matches = items.map(item => {
      if (!item.width_cm || !item.height_cm) {
        return { item_id: item.id, matched_group_index: null, confidence: 0, reason: '규격 미입력' }
      }

      const orderRatio = item.width_cm / item.height_cm

      let bestIdx: number | null = null
      let bestDiff = Infinity

      for (const g of validGroups) {
        if (g.width_mm <= 0 || g.height_mm <= 0) continue

        const gRatio = g.width_mm / g.height_mm
        const gRatioRot = g.height_mm / g.width_mm  // 회전 고려

        const diff = Math.min(
          Math.abs(gRatio - orderRatio),
          Math.abs(gRatioRot - orderRatio)
        )

        if (diff < bestDiff) {
          bestDiff = diff
          bestIdx = g.index
        }
      }

      if (bestIdx !== null && bestDiff <= RATIO_TOL) {
        const confidence = Math.round((1 - bestDiff / RATIO_TOL) * 100)
        return {
          item_id: item.id,
          matched_group_index: bestIdx,
          ratio_diff: Math.round(bestDiff * 1000) / 1000,
          confidence,
          reason: 'auto_matched'
        }
      }

      return {
        item_id: item.id,
        matched_group_index: bestIdx,
        ratio_diff: bestDiff !== Infinity ? Math.round(bestDiff * 1000) / 1000 : null,
        confidence: 0,
        reason: bestDiff === Infinity ? 'no_valid_groups' : 'ratio_exceeds_tolerance'
      }
    })

    return c.json({
      success: true,
      total_groups: groups.length,
      valid_groups: validGroups.length,
      filtered_count: groups.length - validGroups.length,
      matches
    })
  } catch (error) {
    console.error('AutoProcess error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default autoProcessRouter
