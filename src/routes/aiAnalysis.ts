import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { getEntityId, entityFilter } from '../utils/entityFilter'
import { externalizeGroups, externalizeCanvasJson, hydrateGroupsJson, putThumbnail, thumbRef, analysisThumbKey } from '../utils/thumbnailStore'


const aiAnalysisRouter = new Hono<HonoEnv>()

aiAnalysisRouter.use('/*', authMiddleware, requireRole('ADMIN'))

// POST /api/ai-analysis - 분석 요청 생성 (브라우저에서 호출)
// 파일 내용은 /:id/chunks 로 별도 업로드 (D1 크기 제한 우회)
aiAnalysisRouter.post('/', async (c) => {
  try {
    const { file_path } = await c.req.json<{ file_path: string }>()
    if (!file_path) {
      return c.json({ success: false, error: 'file_path is required' }, 400)
    }
    if (file_path.includes('..') || file_path.includes('\0')) {
      return c.json({ success: false, error: 'Invalid file path' }, 400)
    }

    // 초기 status = 'uploading' (청크 업로드 완료 후 브라우저가 'pending'으로 변경)
    const result = await c.env.DB.prepare(
      `INSERT INTO ai_analysis_requests (file_path, status, entity_id) VALUES (?, 'uploading', ?)
       RETURNING id, file_path, status, created_at`
    ).bind(file_path, getEntityId(c) || 1).first()

    return c.json({ success: true, data: result })
  } catch (error) {
    console.error('AI Analysis error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ── POST /api/ai-analysis/batch-test ──────────────────────────────
// 배치 테스트: Z드라이브 원본 파일 경로 목록을 받아 일괄 분석 요청 생성
// Z드라이브에 파일이 이미 있으므로 청크 업로드 불필요, 바로 pending 상태로 생성
aiAnalysisRouter.post('/batch-test', async (c) => {
  try {
    const { file_paths, tag } = await c.req.json<{
      file_paths: string[]
      tag?: string  // 배치 식별용 태그 (예: 'batch_현수막_20260326')
    }>()

    if (!file_paths?.length) {
      return c.json({ success: false, error: 'file_paths 배열 필요' }, 400)
    }

    if (file_paths.length > 100) {
      return c.json({ success: false, error: '한 번에 최대 100건까지 가능합니다' }, 400)
    }

    const batchTag = tag || `batch_${Date.now()}`
    const created: Array<{ id: number; file_path: string; status: string; created_at: string; batch_tag: string }> = []
    const errors: string[] = []

    for (const fp of file_paths) {
      try {
        const result = await c.env.DB.prepare(
          `INSERT INTO ai_analysis_requests (file_path, status, entity_id)
           VALUES (?, 'pending', ?)
           RETURNING id, file_path, status, created_at`
        ).bind(fp, getEntityId(c) || 1).first<{ id: number; file_path: string; status: string; created_at: string }>()
        if (result) created.push({ ...result, batch_tag: batchTag })
      } catch (err) {
        errors.push(`${fp}: ${err}`)
      }
    }

    return c.json({
      success: true,
      batch_tag: batchTag,
      total_requested: file_paths.length,
      created_count: created.length,
      error_count: errors.length,
      created_ids: created.map((r) => r.id),
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (error) {
    console.error('AI Analysis batch error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── GET /api/ai-analysis/batch-results ────────────────────────────
// 배치 테스트 결과 조회: ID 범위로 조회하여 groups_json + 상태 반환
// 주의: /:id 라우트보다 앞에 위치해야 함 (Hono 라우트 우선순위)
aiAnalysisRouter.get('/batch-results', async (c) => {
  try {
    const idsParam = c.req.query('ids') // comma-separated: "101,102,103"
    const fromId = c.req.query('from')  // 또는 범위: from=101&to=120
    const toId = c.req.query('to')

    let query: string
    let binds: any[]
    let idsTruncated = false
    const ef = entityFilter(c)  // #339: 법인 격리 (admin 글로벌 entity 0 → 빈 절)
    // #502: 행당 groups_json 하이드레이션이 그룹마다 R2 get 1회 → 행수 무제한이면 CF Workers
    //       1000-subrequest 한도 초과 위험. from/to·기본 경로(LIMIT 200/50)와 동일하게 ids도 상한.
    const MAX_BATCH_ROWS = 200

    if (idsParam) {
      let ids = idsParam.split(',').map(Number).filter(n => !isNaN(n))
      if (ids.length === 0) return c.json({ success: false, error: 'ids 파라미터 오류' }, 400)
      if (ids.length > MAX_BATCH_ROWS) { idsTruncated = true; ids = ids.slice(0, MAX_BATCH_ROWS) }
      const placeholders = ids.map(() => '?').join(',')
      query = `SELECT id, file_path, status, groups_json, error_message, created_at, updated_at
               FROM ai_analysis_requests WHERE id IN (${placeholders})${ef.clause} ORDER BY id ASC`
      binds = [...ids, ...ef.params]
    } else if (fromId && toId) {
      query = `SELECT id, file_path, status, groups_json, error_message, created_at, updated_at
               FROM ai_analysis_requests WHERE id >= ? AND id <= ?${ef.clause} ORDER BY id ASC LIMIT 200`
      binds = [Number(fromId), Number(toId), ...ef.params]
    } else {
      // 최근 50건
      query = `SELECT id, file_path, status, groups_json, error_message, created_at, updated_at
               FROM ai_analysis_requests WHERE 1=1${ef.clause} ORDER BY id DESC LIMIT 50`
      binds = [...ef.params]
    }

    type AnalysisRow = { id: number; file_path: string; status: string; groups_json: string | null; error_message: string | null; created_at: string; updated_at: string }
    const stmt = c.env.DB.prepare(query)
    const { results } = binds.length > 0 ? await stmt.bind(...binds).all<AnalysisRow>() : await stmt.all<AnalysisRow>()

    // R2 이관: groups_json 썸네일을 emit 직전 base64로 복원(프론트 무수정). r2_key 없으면 no-op.
    // #502: 순차 await(N+1) → 유한 동시성 배치로 전환(행수는 위에서 상한). r2_key 없는 행은 no-op라 저렴.
    const HYDRATE_CONCURRENCY = 10
    for (let i = 0; i < results.length; i += HYDRATE_CONCURRENCY) {
      const chunk = results.slice(i, i + HYDRATE_CONCURRENCY)
      await Promise.all(chunk.map(async (r) => {
        r.groups_json = (await hydrateGroupsJson(c.env, r.groups_json)) ?? null
      }))
    }

    // 요약 통계
    const summary = {
      total: results.length,
      pending: results.filter((r) => r.status === 'pending').length,
      processing: results.filter((r) => r.status === 'processing').length,
      done: results.filter((r) => r.status === 'done').length,
      error: results.filter((r) => r.status === 'error').length,
    }

    return c.json({ success: true, summary, results, truncated: idsTruncated, maxRows: MAX_BATCH_ROWS })
  } catch (error) {
    console.error('AI Analysis batch-results error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /api/ai-analysis/admin/backfill-thumbnails-r2 — 기존 D1 base64 썸네일을 R2로 일괄 이관(멱등).
// 확장성 감사 P3 백필. 신규 쓰기는 이미 R2로 저장되므로 이 라우트는 잔존 레거시 행만 정리한다.
// 인증: 라우터 전역 ADMIN 가드. dry_run=1이면 대상 건수만 반환.
aiAnalysisRouter.post('/admin/backfill-thumbnails-r2', async (c) => {
  try {
    const dryRun = c.req.query('dry_run') === '1'
    const report = { groups_scanned: 0, groups_migrated: 0, canvas_scanned: 0, canvas_migrated: 0, cards_scanned: 0, cards_migrated: 0, thumbs_to_r2: 0 }

    // 1) ai_analysis_requests.groups_json 에 base64가 남아있는 행
    const { results: aRows } = await c.env.DB.prepare(
      `SELECT id, groups_json FROM ai_analysis_requests WHERE groups_json LIKE '%thumbnail_base64%'`
    ).all<{ id: number; groups_json: string | null }>()
    for (const r of (aRows || [])) {
      report.groups_scanned++
      if (!r.groups_json) continue
      let parsed: Array<Record<string, unknown>>
      try { parsed = JSON.parse(r.groups_json) } catch { continue }
      if (!Array.isArray(parsed)) continue
      const before = parsed.filter((g) => typeof g?.thumbnail_base64 === 'string').length
      report.thumbs_to_r2 += before
      if (dryRun) continue
      await externalizeGroups(c.env, r.id, parsed)
      await c.env.DB.prepare('UPDATE ai_analysis_requests SET groups_json = ? WHERE id = ?')
        .bind(JSON.stringify(parsed), r.id).run()
      report.groups_migrated++
    }

    // 1b) ai_analysis_requests.canvas_json 에 render_base64가 남아있는 행
    const { results: cvRows } = await c.env.DB.prepare(
      `SELECT id, canvas_json FROM ai_analysis_requests WHERE canvas_json LIKE '%render_base64%'`
    ).all<{ id: number; canvas_json: string | null }>()
    for (const r of (cvRows || [])) {
      report.canvas_scanned++
      if (dryRun || !r.canvas_json) continue
      const lean = await externalizeCanvasJson(c.env, r.id, r.canvas_json)
      if (lean && lean !== r.canvas_json) {
        await c.env.DB.prepare('UPDATE ai_analysis_requests SET canvas_json = ? WHERE id = ?').bind(lean, r.id).run()
        report.canvas_migrated++
      }
    }

    // 2) cards.thumbnail_url 에 data URI가 남아있는 행
    const { results: cRows } = await c.env.DB.prepare(
      `SELECT id, thumbnail_url FROM cards WHERE thumbnail_url LIKE 'data:%'`
    ).all<{ id: number; thumbnail_url: string }>()
    for (const r of (cRows || [])) {
      report.cards_scanned++
      if (dryRun) continue
      const key = `thumbnails/card/${r.id}.png`
      try {
        await putThumbnail(c.env, key, r.thumbnail_url)
        await c.env.DB.prepare('UPDATE cards SET thumbnail_url = ? WHERE id = ?')
          .bind(thumbRef(key), r.id).run()
        report.cards_migrated++
      } catch (_e) { /* 개별 실패는 건너뜀(다음 실행 재시도) */ }
    }

    return c.json({ success: true, dry_run: dryRun, report })
  } catch (error) {
    console.error('backfill-thumbnails-r2 error:', error)
    return c.json({ success: false, error: '백필 실패' }, 500)
  }
})

// POST /api/ai-analysis/upload - R2 기반 분석 요청 (파일 직접 업로드)
aiAnalysisRouter.post('/upload', async (c) => {
  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File | null
    if (!file) return c.json({ success: false, error: 'No file provided' }, 400)

    // 직접연결(그룹추출 우회): skip_analysis면 status='direct'로 저장 → IllustratorAutomat의
    // 분석 폴링(status='pending')이 건너뜀. 파일관리(ai_analysis_requests) 체계는 동일 유지,
    // 출력 시 /:id/download로 r2:// 소스를 동일하게 사용. (status에 CHECK 제약 없음 → 마이그 불필요)
    const skipAnalysis = (formData.get('skip_analysis') as string) === '1' || (formData.get('skip_analysis') as string) === 'true'
    const initStatus = skipAnalysis ? 'direct' : 'pending'

    // 분석 요청 생성
    const result = await c.env.DB.prepare(
      `INSERT INTO ai_analysis_requests (file_path, status, entity_id) VALUES (?, ?, ?)
       RETURNING id, file_path, status, created_at`
    ).bind(file.name, initStatus, getEntityId(c) || 1).first<{ id: number; file_path: string; status: string; created_at: string }>()

    const analysisId = result!.id

    // R2에 소스 파일 업로드 (file.name sanitize: path traversal / 헤더 인젝션 방어)
    const safeName = (file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200)
    const r2Key = `sources/${analysisId}/${safeName}`
    await c.env.R2_BUCKET.put(r2Key, file.stream(), {
      httpMetadata: {
        contentType: file.type || 'application/octet-stream',
      },
    })

    // file_path를 R2 키로 업데이트
    await c.env.DB.prepare(
      `UPDATE ai_analysis_requests SET file_path = ? WHERE id = ?`
    ).bind(`r2://${r2Key}`, analysisId).run()

    return c.json({
      success: true,
      data: { id: analysisId, file_path: `r2://${r2Key}`, status: initStatus, r2_key: r2Key }
    })
  } catch (error) {
    console.error('AI Analysis upload error:', error)
    return c.json({ success: false, error: '업로드 실패' }, 500)
  }
})

// POST /api/ai-analysis/:id/thumbnail — 직접연결(그룹추출 우회) 출력 후 IllustratorAutomat이 썸네일 보고.
// groups_json이 비어있으면 1그룹으로 채워(그룹분석과 동일 체계) 카드/주문에 썸네일을 반영한다.
aiAnalysisRouter.post('/:id/thumbnail', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json<{ thumbnail_base64?: string; width_mm?: number; height_mm?: number }>()
    const thumb = body.thumbnail_base64
    if (!thumb) return c.json({ success: false, error: 'thumbnail_base64 required' }, 400)

    // 에이전트 전용 콜백 — Bearer 인증으로 충분. entityFilter 미적용
    // (분석 행 entity ≠ 에이전트 토큰 entity일 때 404 나는 문제 방지; file-map 콜백과 동일 정책)
    const row = await c.env.DB.prepare(
      `SELECT id, status, groups_json FROM ai_analysis_requests WHERE id = ?`
    ).bind(id).first<{ id: number; status: string; groups_json: string | null }>()
    if (!row) return c.json({ success: false, error: 'Not found' }, 404)

    // R2 이관: 썸네일을 R2에 1회 저장하고 D1엔 참조(key/마커)만 남긴다. 실패 시 레거시 data URI 폴백(무손실).
    const thumbKey = analysisThumbKey(id, 0)
    let cardThumbValue: string
    let storedToR2 = false
    try {
      await putThumbnail(c.env, thumbKey, thumb)
      cardThumbValue = thumbRef(thumbKey)
      storedToR2 = true
    } catch (_e) {
      cardThumbValue = thumb.startsWith('data:') ? thumb : `data:image/png;base64,${thumb}`
    }

    // groups_json 비어있으면(직접연결) 1그룹으로 저장 + status done 승격
    let groups: Array<Record<string, unknown>> = []
    try { groups = JSON.parse(row.groups_json || '[]') } catch { groups = [] }
    if (groups.length === 0) {
      const g: Record<string, unknown> = { index: 0, name: '직접연결', width_mm: body.width_mm ?? null, height_mm: body.height_mm ?? null }
      if (storedToR2) g.thumbnail_r2_key = thumbKey; else g.thumbnail_base64 = thumb
      groups = [g]
      await c.env.DB.prepare(
        `UPDATE ai_analysis_requests SET groups_json = ?, status = CASE WHEN status = 'direct' THEN 'done' ELSE status END WHERE id = ?`
      ).bind(JSON.stringify(groups), id).run()
    }

    // 이 분석을 ai_analysis_id로 참조하는 order_items의 카드 썸네일 채우기 (아직 비어있는 카드만)
    await c.env.DB.prepare(`
      UPDATE cards SET thumbnail_url = ?, updated_at = CURRENT_TIMESTAMP
      WHERE thumbnail_url IS NULL AND id IN (
        SELECT c2.id FROM cards c2
        JOIN card_items ci ON ci.card_id = c2.id
        JOIN order_items oi ON oi.id = ci.order_item_id
        WHERE oi.ai_analysis_id = ?
      )
    `).bind(cardThumbValue, id).run()

    return c.json({ success: true })
  } catch (error) {
    console.error('AI Analysis thumbnail callback error:', error)
    return c.json({ success: false, error: '썸네일 저장 실패' }, 500)
  }
})

// GET /api/ai-analysis/:id/download - R2 소스 파일 다운로드 (IA C# 용)
aiAnalysisRouter.get('/:id/download', async (c) => {
  try {
    const id = c.req.param('id')
    const ef = entityFilter(c)  // #339: 법인 격리
    const row = await c.env.DB.prepare(
      `SELECT file_path FROM ai_analysis_requests WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ file_path: string }>()
    if (!row) return c.json({ success: false, error: 'Not found' }, 404)

    // R2 경로인 경우
    if (row.file_path?.startsWith('r2://')) {
      const r2Key = row.file_path.replace('r2://', '')
      const object = await c.env.R2_BUCKET.get(r2Key)
      if (!object) return c.json({ success: false, error: 'File not found in R2' }, 404)
      return new Response(object.body, {
        headers: {
          'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${r2Key.split('/').pop()}"`,
        }
      })
    }

    // 로컬 경로인 경우 → 청크 방식으로 폴백
    return c.json({ success: false, error: 'File is local path, use chunks endpoint' }, 400)
  } catch (error) {
    return c.json({ success: false, error: 'Download failed' }, 500)
  }
})

// POST /api/ai-analysis/:id/chunks - 파일 청크 업로드 (레거시, 호환 유지)
aiAnalysisRouter.post('/:id/chunks', async (c) => {
  try {
    const id = c.req.param('id')
    const { chunk_index, chunk_data } = await c.req.json<{
      chunk_index: number
      chunk_data: string
    }>()

    if (chunk_data === undefined || chunk_index === undefined) {
      return c.json({ success: false, error: 'chunk_index and chunk_data are required' }, 400)
    }

    await c.env.DB.prepare(
      `INSERT OR REPLACE INTO ai_file_chunks (analysis_id, chunk_index, chunk_data)
       VALUES (?, ?, ?)`
    ).bind(id, chunk_index, chunk_data).run()

    return c.json({ success: true })
  } catch (error) {
    console.error('AI Analysis error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// GET /api/ai-analysis/:id/chunks - 청크 목록 조회 (IllustratorAutomat이 파일 조립용)
aiAnalysisRouter.get('/:id/chunks', async (c) => {
  try {
    const id = c.req.param('id')
    const { results } = await c.env.DB.prepare(
      `SELECT chunk_index, chunk_data FROM ai_file_chunks
       WHERE analysis_id = ? ORDER BY chunk_index ASC`
    ).bind(id).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('AI Analysis error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// GET /api/ai-analysis - 목록 조회 (IllustratorAutomat 폴링용, pending만)
aiAnalysisRouter.get('/', async (c) => {
  try {
    const status = c.req.query('status') || 'pending'
    // 갭②(crash 하드닝): 하드 crash/에이전트 death로 'processing'에 굳은 분석을 재큐.
    //   soft 실패(jsx 예외/타임아웃)는 PATCH error가 이미 재시도 처리(0130). 여기선 콜백조차
    //   없이 'processing'으로 남은 잡만 대상(updated_at 10분 정체). retry_count 재사용해 무한재큐 방지.
    //   에이전트 폴(status=pending) 진입 시에만 실행. best-effort·global(:610 프리뷰 정리와 동일 정책).
    if (status === 'pending') {
      try {
        await c.env.DB.prepare(
          `UPDATE ai_analysis_requests
             SET status = CASE WHEN COALESCE(retry_count,0)+1 < COALESCE(max_retries,3) THEN 'pending' ELSE 'error' END,
                 retry_count = COALESCE(retry_count,0)+1,
                 last_error_at = datetime('now'),
                 error_message = CASE WHEN COALESCE(retry_count,0)+1 < COALESCE(max_retries,3)
                                      THEN error_message
                                      ELSE COALESCE(error_message,'분석이 응답 없이 중단되어 자동 실패 처리됨(재큐 한도 초과)') END,
                 updated_at = datetime('now')
           WHERE status = 'processing'
             AND updated_at < datetime('now','-10 minutes')`
        ).run()
      } catch (_e) { /* best-effort maintenance */ }
    }
    const ef = entityFilter(c, 'ai_analysis_requests')
    const { results } = await c.env.DB.prepare(
      `SELECT id, file_path, status, error_message, retry_count, max_retries, last_error_at, created_at
       FROM ai_analysis_requests WHERE status = ?${ef.clause} ORDER BY created_at ASC LIMIT 10`
    ).bind(status, ...ef.params).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('AI Analysis error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// GET /api/ai-analysis/:id - 단건 조회 (브라우저 폴링용)
aiAnalysisRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const ef = entityFilter(c)  // #339: 법인 격리
    const row = await c.env.DB.prepare(
      `SELECT id, file_path, status, groups_json, error_message,
              retry_count, max_retries, last_error_at, created_at, updated_at
       FROM ai_analysis_requests WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first()

    if (!row) return c.json({ success: false, error: 'Not found' }, 404)
    // R2 이관: groups_json 썸네일을 emit 직전 base64로 복원(프론트 무수정)
    ;(row as { groups_json?: string | null }).groups_json = (await hydrateGroupsJson(c.env, (row as { groups_json?: string | null }).groups_json)) ?? null
    return c.json({ success: true, data: row })
  } catch (error) {
    console.error('AI Analysis error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// PATCH /api/ai-analysis/:id - 상태 업데이트 (브라우저 + IllustratorAutomat)
//
// Retry policy (migration 0130):
//   * On status='error', increment retry_count and stamp last_error_at.
//   * Auto-requeue to 'pending' while retry_count < max_retries so
//     IllustratorAutomat picks it up again on its next poll cycle.
//   * Surface the final 'error' status to the UI only once attempts are
//     exhausted — /tasks admin page shows the last_error_at so operators
//     can manually retry.
aiAnalysisRouter.patch('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json<{
      status?: string
      groups_json?: string
      error_message?: string
      file_path?: string
      canvas_json?: string
    }>()

    const { status, error_message, file_path } = body
    let groups_json = body.groups_json
    let canvas_json = body.canvas_json

    if (status === 'error') {
      const row = await c.env.DB.prepare(
        `SELECT retry_count, max_retries FROM ai_analysis_requests WHERE id = ?`
      ).bind(id).first<{ retry_count: number | null; max_retries: number | null }>()
      if (!row) return c.json({ success: false, error: 'Not found' }, 404)

      const newCount = (row.retry_count ?? 0) + 1
      const shouldRequeue = newCount < (row.max_retries ?? 3)
      const finalStatus = shouldRequeue ? 'pending' : 'error'

      await c.env.DB.prepare(
        `UPDATE ai_analysis_requests
         SET status = ?,
             error_message = ?,
             retry_count = ?,
             last_error_at = datetime('now'),
             file_path = COALESCE(?, file_path),
             updated_at = datetime('now')
         WHERE id = ?`
      ).bind(finalStatus, error_message ?? null, newCount, file_path ?? null, id).run()

      return c.json({ success: true, requeued: shouldRequeue, retry_count: newCount })
    }

    // R2 이관: 에이전트가 보낸 base64 썸네일을 R2로 옮기고 D1엔 thumbnail_r2_key만 저장(누적 차단).
    if (typeof groups_json === 'string' && groups_json.indexOf('thumbnail_base64') >= 0) {
      try {
        const parsed = JSON.parse(groups_json)
        if (Array.isArray(parsed)) {
          await externalizeGroups(c.env, id, parsed)
          groups_json = JSON.stringify(parsed)
        }
      } catch (_e) { /* 파싱 실패 시 원본(base64) 저장 — 무손실 */ }
    }
    // R2 이관: canvas_json.render_base64도 R2로 externalize(누적 차단)
    canvas_json = (await externalizeCanvasJson(c.env, id, canvas_json)) ?? undefined

    await c.env.DB.prepare(
      `UPDATE ai_analysis_requests
       SET status = COALESCE(?, status),
           groups_json = ?,
           error_message = ?,
           file_path = COALESCE(?, file_path),
           canvas_json = COALESCE(?, canvas_json),
           updated_at = datetime('now')
       WHERE id = ?`
    ).bind(status ?? null, groups_json ?? null, error_message ?? null, file_path ?? null, canvas_json ?? null, id).run()

    return c.json({ success: true })
  } catch (error) {
    console.error('AI Analysis error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

export default aiAnalysisRouter
