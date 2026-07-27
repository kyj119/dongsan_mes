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

// ── A안(2026-07-16): NAS 경로 직접 분석 (업로드 우회) — 대용량 파일용 ──────────
// 웹워커는 Z:를 못 보므로 에이전트가 입력폴더를 스캔해 목록 보고(POST) → UI 조회(GET) → 선택(from-nas).
// 경로는 항상 에이전트 목록에서만 취함(사용자 입력 경로 불신) = 경로 주입 방지. /:id 라우트보다 앞이어야 함.

// POST /api/ai-analysis/nas-listing — 에이전트가 입력폴더 파일목록 보고
aiAnalysisRouter.post('/nas-listing', async (c) => {
  try {
    const body = await c.req.json<{ files?: Array<{ name: string; path: string; size?: number; mtime?: string }> }>()
    const files = Array.isArray(body.files) ? body.files.filter((f) => f && f.name && f.path).slice(0, 500) : []
    await c.env.DB.prepare(
      `INSERT INTO settings (setting_key, setting_value) VALUES ('ia_nas_input_files', ?)
       ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value`
    ).bind(JSON.stringify(files)).run()
    await c.env.DB.prepare(
      `INSERT INTO settings (setting_key, setting_value) VALUES ('ia_nas_input_files_at', datetime('now'))
       ON CONFLICT(setting_key) DO UPDATE SET setting_value = datetime('now')`
    ).run()
    return c.json({ success: true, count: files.length })
  } catch (error) {
    console.error('AI nas-listing post error:', error)
    return c.json({ success: false, error: '목록 저장 실패' }, 500)
  }
})

// GET /api/ai-analysis/nas-listing — UI가 NAS 입력폴더 목록 조회
aiAnalysisRouter.get('/nas-listing', async (c) => {
  try {
    const fr = await c.env.DB.prepare(`SELECT setting_value FROM settings WHERE setting_key='ia_nas_input_files'`).first<{ setting_value: string | null }>()
    const ar = await c.env.DB.prepare(`SELECT setting_value FROM settings WHERE setting_key='ia_nas_input_files_at'`).first<{ setting_value: string | null }>()
    let files: unknown[] = []
    try { files = fr?.setting_value ? JSON.parse(fr.setting_value) : [] } catch { files = [] }
    return c.json({ success: true, data: { files, reported_at: ar?.setting_value ?? null } })
  } catch (error) {
    console.error('AI nas-listing get error:', error)
    return c.json({ success: false, error: '목록 조회 실패' }, 500)
  }
})

// POST /api/ai-analysis/from-nas — 목록에서 선택한 NAS 파일을 업로드 없이 분석 요청(pending)
aiAnalysisRouter.post('/from-nas', async (c) => {
  try {
    const { name } = await c.req.json<{ name: string }>()
    if (!name) return c.json({ success: false, error: '파일명이 필요합니다.' }, 400)
    const fr = await c.env.DB.prepare(`SELECT setting_value FROM settings WHERE setting_key='ia_nas_input_files'`).first<{ setting_value: string | null }>()
    let files: Array<{ name: string; path: string }> = []
    try { files = fr?.setting_value ? JSON.parse(fr.setting_value) : [] } catch { files = [] }
    const match = files.find((f) => f && f.name === name)
    if (!match) return c.json({ success: false, error: '목록에 없는 파일입니다. 새로고침 후 다시 선택하세요.' }, 404)
    // 경로는 에이전트 목록의 값만 사용(사용자 입력 경로 불신). 업로드 없이 pending → 에이전트가 NAS에서 직접 읽음.
    const result = await c.env.DB.prepare(
      `INSERT INTO ai_analysis_requests (file_path, status, entity_id) VALUES (?, 'pending', ?)
       RETURNING id, file_path, status, created_at`
    ).bind(match.path, getEntityId(c) || 1).first()
    return c.json({ success: true, data: result })
  } catch (error) {
    console.error('AI from-nas error:', error)
    return c.json({ success: false, error: '분석 요청 실패' }, 500)
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
      // EXP-1(2026-07-15): pending이 10분+ 미픽업(포이즌/고아·에이전트 스킵)이면 **terminal error로 확정**.
      //   재큐 CASE를 거치지 않고 retry_count=max로 못박아 "MES 만료인데 에이전트가 계속 재요청"하는 루프를 차단.
      //   리퍼는 에이전트 폴(status=pending) 진입 시에만 실행 → 에이전트 death 중엔 미실행(정상 대기 잡 오살 방지).
      try {
        await c.env.DB.prepare(
          `UPDATE ai_analysis_requests
             SET status = 'error',
                 retry_count = COALESCE(max_retries,3),
                 last_error_at = datetime('now'),
                 error_message = COALESCE(error_message,'10분+ 대기 정체로 자동 만료됨(재큐 안 함)'),
                 updated_at = datetime('now')
           WHERE status = 'pending'
             AND updated_at < datetime('now','-10 minutes')`
        ).run()
      } catch (_e) { /* best-effort maintenance */ }
    }
    const ef = entityFilter(c, 'ai_analysis_requests')
    const { results } = await c.env.DB.prepare(
      `SELECT id, file_path, status, error_message, retry_count, max_retries, last_error_at, created_at
       FROM ai_analysis_requests WHERE status = ?${ef.clause} ORDER BY created_at ASC, id ASC LIMIT 10`
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

      // 영구 실패 마커(2026-07-16): 재시도해도 동일 실패 → 즉시 terminal(재큐 금지) + 메시지 바로 노출.
      //   [FONT_MISSING]=폰트 미설치, [OPEN_HANG]=열기 모달 hang(레거시 텍스트·프로파일 등). 마커는 사용자 표시에서 제거.
      const permMarkers = ['[FONT_MISSING]', '[OPEN_HANG]']
      const isPermanent = typeof error_message === 'string' && permMarkers.some((m) => error_message.indexOf(m) >= 0)
      let cleanMsg: string | null = error_message ?? null
      if (cleanMsg) for (const m of permMarkers) cleanMsg = cleanMsg.split(m + ' ').join('').split(m).join('')
      const maxRetries = row.max_retries ?? 3
      const newCount = isPermanent ? maxRetries : (row.retry_count ?? 0) + 1
      const shouldRequeue = !isPermanent && newCount < maxRetries
      const finalStatus = shouldRequeue ? 'pending' : 'error'

      // #520: 재큐 트리거(:479 processing→pending/error)로 세대가 교체된 지연 error 콜백이
      //   최신 결과(다른 세대의 'done' 또는 재큐된 'pending')를 덮고 retry_count를 중복 증가시키는 lost-update 차단.
      //   진행중('processing')일 때만 확정 — 재큐로 되돌려진 좀비 콜백은 0-row가 되어 무시.
      const res = await c.env.DB.prepare(
        `UPDATE ai_analysis_requests
         SET status = ?,
             error_message = ?,
             retry_count = ?,
             last_error_at = datetime('now'),
             file_path = COALESCE(?, file_path),
             updated_at = datetime('now')
         WHERE id = ? AND status = 'processing'`
      ).bind(finalStatus, cleanMsg, newCount, file_path ?? null, id).run()

      // 0-row = 재큐로 세대 교체됨(이미 다른 세대가 처리) → 500 금지, 무시 응답.
      if ((res.meta?.changes ?? 0) === 0) return c.json({ success: true, ignored: true })
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

    // #520: 완료(done) 지연/좀비 콜백이 재큐(:479 processing→pending)로 세대 교체된 최신 결과를 덮는 lost-update 차단.
    //   진행중('processing')일 때만 done 확정. claim(pending→processing)·부분 갱신은 가드 없이 유지(정상 전이 보존).
    const guardCompletion = status === 'done' ? ` AND status = 'processing'` : ''
    const res = await c.env.DB.prepare(
      `UPDATE ai_analysis_requests
       SET status = COALESCE(?, status),
           groups_json = ?,
           error_message = ?,
           file_path = COALESCE(?, file_path),
           canvas_json = COALESCE(?, canvas_json),
           updated_at = datetime('now')
       WHERE id = ?${guardCompletion}`
    ).bind(status ?? null, groups_json ?? null, error_message ?? null, file_path ?? null, canvas_json ?? null, id).run()

    // done 가드로 0-row면 이미 다른 세대가 처리됨(무시). 그 외(claim/부분갱신)는 정상 처리.
    return c.json({ success: true, ignored: guardCompletion !== '' && (res.meta?.changes ?? 0) === 0 })
  } catch (error) {
    console.error('AI Analysis error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// POST /api/ai-analysis/:id/cancel — 사용자/운영자 강제 취소 (EXP-2, 2026-07-15)
//   PATCH status='error'는 재큐 CASE(:488)를 거쳐 pending으로 되돌아감 → 취소용 별도 경로 필요.
//   여기서는 retry_count=max로 못박아 **terminal**로 확정 → 에이전트 폴(status=pending) 제외 = 즉시 큐에서 빠짐.
//   entity 격리(통합모드 entityId=0이면 전체) — IA편집기 통합 사용 결정 반영.
aiAnalysisRouter.post('/:id/cancel', async (c) => {
  try {
    const id = c.req.param('id')
    const ef = entityFilter(c)
    const row = await c.env.DB.prepare(
      `SELECT id, status FROM ai_analysis_requests WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ id: number; status: string }>()
    if (!row) return c.json({ success: false, error: 'Not found' }, 404)
    if (row.status === 'done') return c.json({ success: false, error: '완료된 분석은 취소할 수 없습니다.' }, 400)

    await c.env.DB.prepare(
      `UPDATE ai_analysis_requests
         SET status = 'error',
             retry_count = COALESCE(max_retries,3),
             error_message = '사용자 취소',
             last_error_at = datetime('now'),
             updated_at = datetime('now')
       WHERE id = ?`
    ).bind(id).run()
    return c.json({ success: true, data: { id: Number(id), cancelled: true } })
  } catch (error) {
    console.error('AI Analysis cancel error:', error)
    return c.json({ success: false, error: '취소 실패' }, 500)
  }
})

export default aiAnalysisRouter
