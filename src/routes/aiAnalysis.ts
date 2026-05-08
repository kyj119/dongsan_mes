import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'


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
      `INSERT INTO ai_analysis_requests (file_path, status) VALUES (?, 'uploading')
       RETURNING id, file_path, status, created_at`
    ).bind(file_path).first()

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
    const created: any[] = []
    const errors: string[] = []

    for (const fp of file_paths) {
      try {
        const result = await c.env.DB.prepare(
          `INSERT INTO ai_analysis_requests (file_path, status)
           VALUES (?, 'pending')
           RETURNING id, file_path, status, created_at`
        ).bind(fp).first()
        created.push({ ...result, batch_tag: batchTag })
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
      created_ids: created.map((r: any) => r.id),
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

    if (idsParam) {
      const ids = idsParam.split(',').map(Number).filter(n => !isNaN(n))
      if (ids.length === 0) return c.json({ success: false, error: 'ids 파라미터 오류' }, 400)
      const placeholders = ids.map(() => '?').join(',')
      query = `SELECT id, file_path, status, groups_json, error_message, created_at, updated_at
               FROM ai_analysis_requests WHERE id IN (${placeholders}) ORDER BY id ASC`
      binds = ids
    } else if (fromId && toId) {
      query = `SELECT id, file_path, status, groups_json, error_message, created_at, updated_at
               FROM ai_analysis_requests WHERE id >= ? AND id <= ? ORDER BY id ASC LIMIT 200`
      binds = [Number(fromId), Number(toId)]
    } else {
      // 최근 50건
      query = `SELECT id, file_path, status, groups_json, error_message, created_at, updated_at
               FROM ai_analysis_requests ORDER BY id DESC LIMIT 50`
      binds = []
    }

    const stmt = c.env.DB.prepare(query)
    const { results } = binds.length > 0 ? await stmt.bind(...binds).all() : await stmt.all()

    // 요약 통계
    const summary = {
      total: results.length,
      pending: results.filter((r: any) => r.status === 'pending').length,
      processing: results.filter((r: any) => r.status === 'processing').length,
      done: results.filter((r: any) => r.status === 'done').length,
      error: results.filter((r: any) => r.status === 'error').length,
    }

    return c.json({ success: true, summary, results })
  } catch (error) {
    console.error('AI Analysis batch-results error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /api/ai-analysis/upload - R2 기반 분석 요청 (파일 직접 업로드)
aiAnalysisRouter.post('/upload', async (c) => {
  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File | null
    if (!file) return c.json({ success: false, error: 'No file provided' }, 400)

    // 분석 요청 생성
    const result = await c.env.DB.prepare(
      `INSERT INTO ai_analysis_requests (file_path, status) VALUES (?, 'pending')
       RETURNING id, file_path, status, created_at`
    ).bind(file.name).first() as any

    const analysisId = result.id

    // R2에 소스 파일 업로드
    const r2Key = `sources/${analysisId}/${file.name}`
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
      data: { id: analysisId, file_path: `r2://${r2Key}`, status: 'pending', r2_key: r2Key }
    })
  } catch (error) {
    console.error('AI Analysis upload error:', error)
    return c.json({ success: false, error: '업로드 실패' }, 500)
  }
})

// GET /api/ai-analysis/:id/download - R2 소스 파일 다운로드 (IA C# 용)
aiAnalysisRouter.get('/:id/download', async (c) => {
  try {
    const id = c.req.param('id')
    const row = await c.env.DB.prepare(
      'SELECT file_path FROM ai_analysis_requests WHERE id = ?'
    ).bind(id).first() as any
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
    const { results } = await c.env.DB.prepare(
      `SELECT id, file_path, status, error_message, retry_count, max_retries, last_error_at, created_at
       FROM ai_analysis_requests WHERE status = ? ORDER BY created_at ASC LIMIT 10`
    ).bind(status).all()

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
    const row = await c.env.DB.prepare(
      `SELECT id, file_path, status, groups_json, error_message,
              retry_count, max_retries, last_error_at, created_at, updated_at
       FROM ai_analysis_requests WHERE id = ?`
    ).bind(id).first()

    if (!row) return c.json({ success: false, error: 'Not found' }, 404)
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
    }>()

    const { status, groups_json, error_message, file_path } = body

    if (status === 'error') {
      const row = await c.env.DB.prepare(
        `SELECT retry_count, max_retries FROM ai_analysis_requests WHERE id = ?`
      ).bind(id).first() as any
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

    await c.env.DB.prepare(
      `UPDATE ai_analysis_requests
       SET status = COALESCE(?, status),
           groups_json = ?,
           error_message = ?,
           file_path = COALESCE(?, file_path),
           updated_at = datetime('now')
       WHERE id = ?`
    ).bind(status ?? null, groups_json ?? null, error_message ?? null, file_path ?? null, id).run()

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
