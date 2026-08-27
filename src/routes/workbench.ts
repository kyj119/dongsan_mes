// src/routes/workbench.ts — 웹 캔버스 IA 워크벤치 P1: 시안 검수 (그룹 ↔ 품목 매칭)
// spec: docs/archive/superpowers/specs/2026-06-11-web-canvas-ia-workbench.md §5 (ia-editor 마스터에 흡수)
import { Hono } from 'hono'
import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { entityFilter, orderVisibilityFilter, getEntityId, getWriteEntityId, ENTITY_ALL_MODE_WRITE_ERROR } from '../utils/entityFilter'
import { validateUpload } from '../utils/uploadValidation'
import { hydrateGroups, hydrateGroupsJson, hydrateCanvasJson, externalizeGroups } from '../utils/thumbnailStore'
import { kstDateOf } from '../utils/kstDate'

const workbenchRouter = new Hono<HonoEnv>()

// ★S5(2026-08-05) — /ia-editor 폐기로 **판 렌더·검수 라우트를 제거**했다.
//   spec: docs/superpowers/specs/2026-08-05-ia-editor-sunset.md §2.3
//   제거: /orders · /analyses/:orderId · /match · /archives · /files · /files/analyze · /archive
//         · /sheets(CRUD) · /sheets/:id/render · /render-queue · /sheets/:id/download
//   ⚠️ **남긴 것**은 에이전트가 쓰기 때문이다:
//     · /render-asset  — job_type 이 sheet **와 process** 둘 다다(Program.cs:1756·1987). 단건 가공이 공유한다.
//     · /process/*     — 단건 가공 파이프라인
//     · /intakes · /intake-config · /agent-status — 패널·에이전트 상시 경로
//   헬퍼(touchAgentHeartbeat·serveRenderAsset·pickR2Key 등)도 남긴다 — 위 경로가 쓴다.

workbenchRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER', 'DESIGNER'))

// ── 시트 네스팅 (sheet_layouts) CRUD — IA 편집기 P3 ──
// spec: docs/superpowers/specs/2026-06-16-ia-editor-nesting-intake.md §5.4·6·7·12
// 자동배치(shelfBinPack)는 브라우저에서 수행, 서버는 결과 좌표·메타를 entity 격리 보존.
// 실제 출력(EPS/DXF/JPG)은 SheetLayout.jsx(P5). canvas_json/placements_json은 JSON 문자열.
function strOrJson(v: unknown): string | null {
  if (v == null) return null
  return typeof v === 'string' ? v : JSON.stringify(v)
}

// ── 에이전트 heartbeat: 폴링 자체를 last_seen 으로 기록 (settings 키-값) — spec R1 ② ──
// settings.setting_key UNIQUE → ON CONFLICT UPSERT (caps.ts 패턴). 실패해도 폴링은 진행.
async function touchAgentHeartbeat(c: any) {
  try {
    await c.env.DB.prepare(
      `INSERT INTO settings (setting_key, setting_value) VALUES ('ia_agent_last_seen', datetime('now'))
       ON CONFLICT(setting_key) DO UPDATE SET setting_value = datetime('now')`
    ).run()
  } catch (e) { console.error('Workbench heartbeat error:', e) }
}

// ── GET /api/workbench/agent-status — IA 에이전트 온라인 여부 (last_seen<60s) — spec R1 ② ──
workbenchRouter.get('/agent-status', async (c) => {
  try {
    const row = await c.env.DB.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'ia_agent_last_seen'`
    ).first<{ setting_value: string | null }>()
    const lastSeen = row?.setting_value ?? null
    // last_seen·now 모두 UTC datetime('now') 문자열 → julianday 차이를 초로 환산
    let online = false
    if (lastSeen) {
      const sec = await c.env.DB.prepare(
        `SELECT (julianday('now') - julianday(?)) * 86400 AS sec`
      ).bind(lastSeen).first<{ sec: number | null }>()
      online = !!(sec && sec.sec != null && sec.sec < 60)
    }
    return c.json({ success: true, data: { online, last_seen: lastSeen } })
  } catch (error) {
    console.error('Workbench agent-status error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 판에 실린 대기물 소비 — 판짜기 은퇴 대비(웹 네스팅이 mes-sheet.jsx의 consumed_intake_ids를 대체).
//   sheet의 source_analysis_ids → designer_intakes.ai_analysis_id 역참조(POST /intakes가 분석 1건을
//   1:1로 만들므로 유일). waiting 인 것만 바꾸므로 재렌더·중복 콜백에 멱등.
//   미리보기(preview_only) 시트는 산출물이 없으므로 제외 — 조회 조건에서 걸러낸다.
//   반환 = 소비된 대기물 수(0이면 웹 업로드 소스라 대응 대기물이 없는 정상 케이스 포함).
async function consumeSheetIntakes(c: Context<HonoEnv>, sheetId: number): Promise<number> {
  const row = await c.env.DB.prepare(
    `SELECT source_analysis_ids FROM sheet_layouts
      WHERE id = ? AND COALESCE(canvas_json,'') NOT LIKE '%"preview_only":true%'`
  ).bind(sheetId).first<{ source_analysis_ids: string | null }>()
  if (!row?.source_analysis_ids) return 0
  let aids: number[] = []
  try {
    const parsed = JSON.parse(row.source_analysis_ids)
    if (Array.isArray(parsed)) aids = parsed.map(Number).filter((n) => Number.isFinite(n) && n > 0)
  } catch (_e) { return 0 }
  if (!aids.length) return 0

  const ef = entityFilter(c, 'designer_intakes')
  let total = 0
  for (let i = 0; i < aids.length; i += 80) { // D1 바인드 한도([[d1-bind-param-limit]])
    const chunk = aids.slice(i, i + 80)
    const ph = chunk.map(() => '?').join(',')
    const r = await c.env.DB.prepare(
      `UPDATE designer_intakes SET status = 'absorbed', absorbed_at = datetime('now')
        WHERE status = 'waiting' AND ai_analysis_id IN (${ph})${ef.clause}`
    ).bind(...chunk, ...ef.params).run()
    total += r.meta?.changes ?? 0
  }
  return total
}

// ── Export-first (주문 없이 가공 EPS 추출) — spec 2026-06-25-ia-editor-eps-export.md §3·§5 ──
// 에이전트가 NAS 산출물을 R2로 업로드 → 워커가 R2 blob을 attachment로 서빙(인증=헤더 전용).
// R2 키 규칙: render-outputs/{jobType}/{jobId}/{safeName}  (jobType = sheet | process)

// kind → Content-Type 매핑 (다운로드 attachment 헤더)
const RENDER_CONTENT_TYPES: Record<string, string> = {
  eps: 'application/postscript',
  dxf: 'application/dxf',
  jpg: 'image/jpeg',
}

// result_json 에서 kind 별 R2 키를 꺼낸다 ({eps_r2, dxf_r2, jpg_r2}).
function pickR2Key(resultJson: string | null, kind: string): string | null {
  if (!resultJson) return null
  try {
    const obj = JSON.parse(resultJson)
    const v = obj && obj[`${kind}_r2`]
    return (typeof v === 'string' && v) ? v : null
  } catch (_e) { return null }
}

// W2: result_json 의 R2 산출물(eps/dxf/jpg)을 best-effort 삭제(이력 삭제 시 orphan 방지). 실패는 무시.
async function deleteRenderAssets(c: any, resultJson: string | null): Promise<void> {
  if (!resultJson) return
  let obj: any
  try { obj = JSON.parse(resultJson) } catch (_e) { return }
  for (const kind of ['eps', 'dxf', 'jpg']) {
    const key = obj && obj[`${kind}_r2`]
    if (typeof key === 'string' && key) { try { await c.env.R2_BUCKET.delete(key) } catch (_e) { /* best-effort */ } }
  }
}

// 공통 R2 blob 다운로드 응답 (entity 격리·완료 검증은 호출부에서 수행)
async function serveRenderAsset(c: any, r2Key: string, kind: string) {
  const obj = await c.env.R2_BUCKET.get(r2Key)
  if (!obj) return c.json({ success: false, error: '산출물을 찾을 수 없습니다.' }, 404)
  const filename = r2Key.split('/').pop() || `render.${kind}`
  return new Response(obj.body, {
    headers: {
      'Content-Type': RENDER_CONTENT_TYPES[kind] || 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}

// ── POST /api/workbench/render-asset — 에이전트 산출물 업로드 수신 (multipart) ──
// spec §3.2(A). 에이전트가 EPS/DXF/JPG 를 1개씩 업로드 → R2.put → r2_key 반환.
workbenchRouter.post('/render-asset', async (c) => {
  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File | null
    if (!file) return c.json({ success: false, error: '파일이 없습니다.' }, 400)

    const jobType = String(formData.get('job_type') || '')
    if (jobType !== 'sheet' && jobType !== 'process') {
      return c.json({ success: false, error: 'job_type은 sheet|process여야 합니다.' }, 400)
    }
    const jobId = parseInt(String(formData.get('job_id') || ''), 10)
    if (!jobId || jobId < 1) return c.json({ success: false, error: '잘못된 job_id' }, 400)
    const kind = String(formData.get('kind') || '')
    if (!['eps', 'dxf', 'jpg'].includes(kind)) {
      return c.json({ success: false, error: 'kind는 eps|dxf|jpg여야 합니다.' }, 400)
    }

    // #444: job 소유 검증 — 타법인 job 산출물 경로(r2Key)에 인젝션/덮어쓰기 차단
    const efJob = entityFilter(c)
    const jobTbl = jobType === 'sheet' ? 'sheet_layouts' : 'ia_process_jobs'
    const ownsJob = await c.env.DB.prepare(`SELECT 1 FROM ${jobTbl} WHERE id = ?${efJob.clause} LIMIT 1`).bind(jobId, ...efJob.params).first()
    if (!ownsJob) return c.json({ success: false, error: '잘못된 job_id' }, 404)

    // 확장자·크기 검증 (eps/dxf/jpg, 50MB)
    const v = validateUpload(file, {
      maxBytes: 50 * 1024 * 1024,
      allowedMimePrefixes: ['image/', 'application/postscript', 'application/dxf', 'application/octet-stream'],
      allowedExts: ['eps', 'dxf', 'jpg', 'jpeg'],
    })
    if (!v.ok) return c.json({ success: false, error: v.error }, 400)

    // 키 sanitize (path traversal / 키 인젝션 방어) — files/analyze 패턴 재사용
    const safeName = (file.name || `render.${kind}`).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200)
    const r2Key = `render-outputs/${jobType}/${jobId}/${safeName}`
    await c.env.R2_BUCKET.put(r2Key, file.stream(), {
      httpMetadata: { contentType: file.type || RENDER_CONTENT_TYPES[kind] || 'application/octet-stream' },
    })

    return c.json({ success: true, data: { r2_key: r2Key } })
  } catch (error) {
    console.error('Workbench render-asset upload error:', error)
    return c.json({ success: false, error: '산출물 업로드 실패' }, 500)
  }
})

// ── GET /api/workbench/process/:id/download?kind=eps|dxf|jpg — 단일 가공 산출물 다운로드 ──
// spec §3.2(B)·§5. ia_process_jobs.result_json[kind+'_r2'] → R2.get → attachment.
workbenchRouter.get('/process/:id/download', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10)
    if (!id) return c.json({ success: false, error: '잘못된 ID' }, 400)
    const kind = String(c.req.query('kind') || '')
    if (!['eps', 'dxf', 'jpg'].includes(kind)) {
      return c.json({ success: false, error: 'kind는 eps|dxf|jpg여야 합니다.' }, 400)
    }

    const ef = entityFilter(c, 'ia_process_jobs')
    const row = await c.env.DB.prepare(
      `SELECT status, result_json FROM ia_process_jobs WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ status: string; result_json: string | null }>()
    if (!row || row.status !== 'done') {
      return c.json({ success: false, error: '완료된 가공이 없습니다.' }, 404)
    }
    const r2Key = pickR2Key(row.result_json, kind)
    if (!r2Key) return c.json({ success: false, error: '해당 포맷 산출물이 없습니다.' }, 404)
    return serveRenderAsset(c, r2Key, kind)
  } catch (error) {
    console.error('Workbench process download error:', error)
    return c.json({ success: false, error: '다운로드 실패' }, 500)
  }
})

// ── 단일 가공 렌더잡 (ia_process_jobs) — spec §5.2 ──
// 주문 없이 단일 그룹을 ProcessOrderItem.jsx로 가공. /sheets/:id/render 계열을 복제.
// status: queued(사용자) → rendering(에이전트 claim) → done | error.

// POST /api/workbench/process — 가공 큐잉
workbenchRouter.post('/process', async (c) => {
  try {
    const body = await c.req.json<{
      analysis_id?: number; group_index?: number
      target_w_cm?: number; target_h_cm?: number
      finishing?: unknown; trim?: unknown; rotate90?: unknown
      scale_factor?: number; rotation?: number
      real_size?: boolean
      preview_only?: boolean
      offset?: unknown; punching?: unknown; annotation?: unknown
    }>()
    const analysisId = parseInt(String(body.analysis_id ?? ''), 10)
    if (!analysisId) return c.json({ success: false, error: 'analysis_id가 필요합니다.' }, 400)
    const gi = body.group_index
    if (typeof gi !== 'number' || gi < 0 || !Number.isInteger(gi)) {
      return c.json({ success: false, error: 'group_index는 0 이상의 정수여야 합니다.' }, 400)
    }

    // analysis 소유(entity) + status='done' 검증
    const ef = entityFilter(c, 'ai_analysis_requests')
    const an = await c.env.DB.prepare(
      `SELECT id, status FROM ai_analysis_requests WHERE id = ?${ef.clause}`
    ).bind(analysisId, ...ef.params).first<{ id: number; status: string }>()
    if (!an) return c.json({ success: false, error: '분석을 찾을 수 없습니다.' }, 404)
    if (an.status !== 'done') return c.json({ success: false, error: '소스 분석이 완료되지 않았습니다.' }, 400)

    // ⑥ 회전 정규화: rotation(0/90/180/270) 우선, 없으면 rotate90 boolean → 90/0 매핑
    const rotation = [0, 90, 180, 270].includes(body.rotation as number)
      ? (body.rotation as number)
      : (body.rotate90 ? 90 : 0)
    const params = {
      target_w_cm: (typeof body.target_w_cm === 'number') ? body.target_w_cm : null,
      target_h_cm: (typeof body.target_h_cm === 'number') ? body.target_h_cm : null,
      finishing: body.finishing ?? null,
      trim: body.trim ?? null,
      rotate90: body.rotate90 ?? false,
      // ⑤ 파일배율(1/N): 1 이상 숫자만 허용, 아니면 1 — jsx/에이전트가 scaleFactor 키로 읽음
      scale_factor: (typeof body.scale_factor === 'number' && body.scale_factor >= 1) ? body.scale_factor : 1,
      // 실물 저장: 축소본(1/N)을 ×N 확대해 EPS를 실물 크기로 저장(RIP 100% 출력). 미지정=false=현행 축소 저장.
      real_size: !!body.real_size,
      rotation,
      // ③ 미리보기 잡: 실렌더 JPG만 콜백(EPS/DXF 스킵), 이력 목록에서 제외 — spec R1 ③
      preview_only: !!body.preview_only,
      // R3a-2 고급 후가공 패스스루(도련 offset·펀칭·주석): 값 검증은 jsx가 처리 — null 허용
      offset: body.offset ?? null,
      punching: body.punching ?? null,
      annotation: body.annotation ?? null,
    }
    const user = c.get('user')
    const created = await c.env.DB.prepare(`
      INSERT INTO ia_process_jobs
        (analysis_id, group_index, params_json, status, entity_id, created_by, updated_at)
      VALUES (?, ?, ?, 'queued', ?, ?, datetime('now'))
      RETURNING id
    `).bind(
      analysisId, gi, JSON.stringify(params), getEntityId(c) || 1, user?.id ?? null,
    ).first<{ id: number }>()
    return c.json({ success: true, data: { id: created?.id ?? null } })
  } catch (error) {
    console.error('Workbench process queue error:', error)
    return c.json({ success: false, error: '가공 요청 실패' }, 500)
  }
})

// GET /api/workbench/process-queue — 에이전트 폴링 (queued → rendering claim)
workbenchRouter.get('/process-queue', async (c) => {
  try {
    await touchAgentHeartbeat(c)
    // W2: 미리보기(preview_only) 잡은 일회성 → 1시간 경과분 자동 정리(D1 비대 방지). 에이전트 폴 주기에 편승.
    try {
      await c.env.DB.prepare(
        `DELETE FROM ia_process_jobs WHERE params_json LIKE '%"preview_only":true%' AND updated_at < datetime('now','-1 hour')`
      ).run()
    } catch (_e) { /* 정리는 best-effort */ }
    // 갭②(crash 하드닝): 하드 crash/에이전트 death로 'rendering'에 굳은 가공잡을 재큐(10분 정체).
    //   requeue_count<3 이면 queued 복귀, 초과 시 error 확정(poison 무한재큐 방지). best-effort·global.
    try {
      await c.env.DB.prepare(
        `UPDATE ia_process_jobs
           SET status = CASE WHEN COALESCE(requeue_count,0) < 3 THEN 'queued' ELSE 'error' END,
               error_message = CASE WHEN COALESCE(requeue_count,0) < 3 THEN error_message
                                    ELSE COALESCE(error_message,'가공이 응답 없이 중단되어 자동 실패 처리됨(재큐 한도 초과)') END,
               requeue_count = COALESCE(requeue_count,0) + 1,
               updated_at = datetime('now')
         WHERE status = 'rendering' AND updated_at < datetime('now','-10 minutes')`
      ).run()
    } catch (_e) { /* best-effort */ }
    const ef = entityFilter(c, 'j')
    const { results } = await c.env.DB.prepare(`
      SELECT j.id, j.analysis_id, j.group_index, j.params_json, ar.file_path AS source_file_path
      FROM ia_process_jobs j
      LEFT JOIN ai_analysis_requests ar ON ar.id = j.analysis_id
      WHERE j.status='queued'${ef.clause}
      ORDER BY j.id ASC
      LIMIT 3
    `).bind(...ef.params).all<{
      id: number; analysis_id: number; group_index: number
      params_json: string; source_file_path: string | null
    }>()
    if (!results.length) return c.json({ success: true, data: [] })

    // claim: queued → rendering (재폴링 중복 처리 방지)
    const ids = results.map((r) => r.id)
    const ph = ids.map(() => '?').join(',')
    await c.env.DB.prepare(
      `UPDATE ia_process_jobs SET status='rendering', updated_at=datetime('now') WHERE id IN (${ph}) AND status='queued'`
    ).bind(...ids).run()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('Workbench process-queue poll error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /api/workbench/process?limit=N — 가공 이력 목록 (entity 격리, created_at desc) — spec P1 ③
// 영속 재다운로드 보드용. result_meta(width/height/has_*·jpg_base64 썸네일)는 result_json에서 추출.
workbenchRouter.get('/process', async (c) => {
  try {
    const limit = Math.min(parseInt(c.req.query('limit') || '12', 10) || 12, 50)
    const ef = entityFilter(c, 'ia_process_jobs')
    const { results } = await c.env.DB.prepare(`
      SELECT id, status, group_index, analysis_id, error_message, created_at, result_json
      FROM ia_process_jobs
      WHERE 1=1${ef.clause}
        AND (params_json IS NULL OR params_json NOT LIKE '%"preview_only":true%')
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).bind(...ef.params, limit).all<{
      id: number; status: string; group_index: number; analysis_id: number
      error_message: string | null; created_at: string; result_json: string | null
    }>()

    const data = results.map((r) => {
      let result_meta: {
        width_cm: number | null; height_cm: number | null
        has_eps: boolean; has_dxf: boolean; has_jpg: boolean; jpg_base64: string | null
      } | null = null
      if (r.result_json) {
        try {
          const obj = JSON.parse(r.result_json)
          result_meta = {
            width_cm: (obj && obj.width_cm != null) ? Number(obj.width_cm) : null,
            height_cm: (obj && obj.height_cm != null) ? Number(obj.height_cm) : null,
            has_eps: !!(obj && obj.eps_r2),
            has_dxf: !!(obj && obj.dxf_r2),
            has_jpg: !!(obj && obj.jpg_r2),
            jpg_base64: (obj && obj.jpg_base64) ? String(obj.jpg_base64) : null,
          }
        } catch (_e) { result_meta = null }
      }
      return {
        id: r.id, status: r.status, group_index: r.group_index, analysis_id: r.analysis_id,
        error_message: r.error_message, created_at: r.created_at, result_meta,
      }
    })

    return c.json({ success: true, data })
  } catch (error) {
    console.error('Workbench process list error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /api/workbench/process/:id — 프론트 폴링 (entity 격리)
workbenchRouter.get('/process/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10)
    if (!id) return c.json({ success: false, error: '잘못된 ID' }, 400)
    const ef = entityFilter(c, 'ia_process_jobs')
    const row = await c.env.DB.prepare(
      `SELECT id, status, error_message, result_json FROM ia_process_jobs WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ id: number; status: string; error_message: string | null; result_json: string | null }>()
    if (!row) return c.json({ success: false, error: '가공 작업을 찾을 수 없습니다.' }, 404)
    return c.json({ success: true, data: row })
  } catch (error) {
    console.error('Workbench process get error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PATCH /api/workbench/process/:id — 에이전트 결과 콜백
workbenchRouter.patch('/process/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10)
    if (!id) return c.json({ success: false, error: '잘못된 ID' }, 400)
    const body = await c.req.json<{ status?: string; result_json?: unknown; error_message?: string }>()
    const status = (body.status === 'error') ? 'error' : 'done'
    const resultStr = body.result_json == null ? null : (typeof body.result_json === 'string' ? body.result_json : JSON.stringify(body.result_json))
    const ef = entityFilter(c)  // #444: 타법인 ia_process_jobs 콜백 변조 차단(형제 격리, 콜백만 누락)
    // #520: 재큐 트리거(:922 rendering→queued/error)로 세대가 교체된 지연 콜백 lost-update 차단.
    //   ia_process_jobs의 진행중=claim 상태 'rendering'(:943 claim·:922 reaper 모두 'rendering' 기준·'processing' 아님) → 그 때만 확정.
    let res
    if (status === 'done') {
      res = await c.env.DB.prepare(
        `UPDATE ia_process_jobs SET status='done', result_json=?, error_message=NULL, updated_at=datetime('now') WHERE id = ?${ef.clause} AND status='rendering'`
      ).bind(resultStr, id, ...ef.params).run()
    } else {
      res = await c.env.DB.prepare(
        `UPDATE ia_process_jobs SET status='error', error_message=?, updated_at=datetime('now') WHERE id = ?${ef.clause} AND status='rendering'`
      ).bind(body.error_message ?? '가공 실패', id, ...ef.params).run()
    }
    // 0-row = 재큐로 세대 교체됨(이미 다른 세대가 처리) → 500 금지, 무시 응답.
    return c.json({ success: true, ignored: (res.meta?.changes ?? 0) === 0 })
  } catch (error) {
    console.error('Workbench process callback error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── POST /api/workbench/process/:id/retry — 실패/멈춘 가공 재큐잉 — spec R1 ② ──
// entity 격리 소유 검증 후 status가 error|rendering 이면 queued 로 되돌리고 결과/오류 초기화.
// (rendering=에이전트 claim 후 타임아웃/유실 회복, error=가공 실패 재시도). done/queued 는 400.
workbenchRouter.post('/process/:id/retry', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10)
    if (!id) return c.json({ success: false, error: '잘못된 ID' }, 400)
    const ef = entityFilter(c, 'ia_process_jobs')
    const row = await c.env.DB.prepare(
      `SELECT id, status FROM ia_process_jobs WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ id: number; status: string }>()
    if (!row) return c.json({ success: false, error: '가공 작업을 찾을 수 없습니다.' }, 404)
    if (row.status !== 'error' && row.status !== 'rendering') {
      return c.json({ success: false, error: `재시도 불가 상태입니다 (${row.status}).` }, 400)
    }
    await c.env.DB.prepare(
      `UPDATE ia_process_jobs SET status='queued', result_json=NULL, error_message=NULL, updated_at=datetime('now') WHERE id = ?`
    ).bind(id).run()
    return c.json({ success: true, data: { id, status: 'queued' } })
  } catch (error) {
    console.error('Workbench process retry error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── POST /api/workbench/process/clear — 완료·실패 가공 이력 일괄 삭제 (W2: 누적 정리) ──
// entity 격리. status IN (done,error)만 삭제(queued/rendering=진행 중 보존). R2 산출물도 best-effort 삭제.
workbenchRouter.post('/process/clear', async (c) => {
  try {
    const ef = entityFilter(c, 'ia_process_jobs')
    // #506: 행당 최대 3회 R2.delete → 무제한이면 CF Workers 1000-subrequest 한도 초과 위험.
    //       배치 상한(150행 = 최대 450 R2 delete)으로 1회 호출 부하 제한. 초과분은 hasMore로 재호출.
    const BATCH = 150
    const { results } = await c.env.DB.prepare(
      `SELECT id, result_json FROM ia_process_jobs WHERE status IN ('done','error')${ef.clause} ORDER BY id LIMIT ${BATCH}`
    ).bind(...ef.params).all<{ id: number; result_json: string | null }>()
    if (results.length === 0) return c.json({ success: true, data: { deleted: 0, hasMore: false } })

    // R2 산출물 삭제(유한 동시성). status 기반 전체 DELETE는 R2 미정리 행까지 지워 orphan을 만들므로,
    // 이번 배치에서 실제 정리한 id만 DELETE → R2·DB 정합 유지.
    const R2_CONCURRENCY = 10
    for (let i = 0; i < results.length; i += R2_CONCURRENCY) {
      await Promise.all(results.slice(i, i + R2_CONCURRENCY).map((r) => deleteRenderAssets(c, r.result_json)))
    }

    // id IN 삭제 — D1 바인드 한도(~100) 대비 80개 청크 분할([[d1-bind-param-limit]]).
    const ids = results.map((r) => r.id)
    for (let i = 0; i < ids.length; i += 80) {
      const chunk = ids.slice(i, i + 80)
      const ph = chunk.map(() => '?').join(',')
      await c.env.DB.prepare(`DELETE FROM ia_process_jobs WHERE id IN (${ph})`).bind(...chunk).run()
    }
    return c.json({ success: true, data: { deleted: results.length, hasMore: results.length === BATCH } })
  } catch (error) {
    console.error('Workbench process clear error:', error)
    return c.json({ success: false, error: '이력 삭제 실패' }, 500)
  }
})

// ═══ 디자이너 세션 루프(2026-07-16): 가공 대기함(designer_intakes) ═══
// spec: docs/superpowers/specs/2026-07-16-ia-designer-session-loop.md §4.4
// 흐름: 디자이너 일러 세션 가공(mes-core.jsx) → Z: manifest → 에이전트 POST /intakes(waiting)
//       → 주문서 프리필 피커 → POST /intakes/:id/absorb(absorbed) | /void

// ── GET /api/workbench/intake-config — 에이전트 _config 브로드캐스트 소스 ──
// JSX(ExtendScript)는 HTTPS 호출 불가 → 에이전트가 이 응답을 {IA-등록}\_config\config.json으로 중계.
workbenchRouter.get('/intake-config', async (c) => {
  try {
    // 거래처 리스트 재도입(2026-07-27, spec 2026-07-23 D5): CEP 패널 자동완성 소스(id+name 경량 전체).
    // workers = 가공자↔MES user id 매핑(spec §3.5) — manifest worker_id → 대기함 "내 작업" 상관.
    const [methods, presets, workerDomains, workers, clients] = await Promise.all([
      c.env.DB.prepare(
        `SELECT id, name, margin_cm, method_group FROM finishing_methods WHERE is_active = 1 ORDER BY sort_order, id`
      ).all(),
      c.env.DB.prepare(
        `SELECT id, name, config, method_group FROM finishing_presets WHERE is_active = 1 ORDER BY sort_order, id`
      ).all(),
      c.env.DB.prepare(
        `SELECT worker_name, domain FROM designer_worker_domains`
      ).all(),
      c.env.DB.prepare(
        `SELECT id, name FROM users WHERE is_active = 1 AND (role = 'DESIGNER' OR job_role = 'DESIGNER') ORDER BY name`
      ).all(),
      c.env.DB.prepare(
        `SELECT id, client_name FROM clients WHERE COALESCE(is_active, 1) = 1 ORDER BY client_name, id`
      ).all(),
    ])
    // 경로①(주문 선행)용 미가공 라인: 파일 미연결 + 진행 중 주문만
    const ovf = orderVisibilityFilter(c, 'o')
    const { results: openLines } = await c.env.DB.prepare(`
      SELECT oi.id AS order_item_id, o.order_number, cl.client_name, oi.item_name,
             oi.width, oi.height, oi.quantity, oi.finishing
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN clients cl ON cl.id = o.client_id
      WHERE o.status IN ('CONFIRMED','PRODUCTION') AND oi.ai_analysis_id IS NULL${ovf.clause}
      ORDER BY o.id DESC LIMIT 200
    `).bind(...ovf.params).all()
    // ★S5(2026-08-05) — 모아찍기 대기물 목록 제거. 소비자(/ia-editor 판짜기)가 없어졌다.
    return c.json({
      success: true,
      data: {
        generated_at: new Date().toISOString(),
        entity_id: getEntityId(c), // 디자이너 에이전트가 POST /intakes에 채워 넣을 귀속 법인(0=전체모드)
        methods: methods.results,
        presets: presets.results,
        worker_domains: workerDomains.results, // 가공자→도메인(CEP 필터·프로파일)
        workers: workers.results, // 가공자↔user id 매핑(id, name) — 패널 worker_id 해소
        clients: clients.results, // 거래처 자동완성(id, client_name) — 정확일치 시 client_id 해소
        open_lines: openLines,
      },
    })
  } catch (error) {
    console.error('Workbench intake-config error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── POST /api/workbench/intakes — 에이전트 manifest 등록 ──
// 분석 레코드(status=done, 무인 분석 미경유)를 함께 생성해 임포지션 팔레트/직접연결과 호환.
workbenchRouter.post('/intakes', async (c) => {
  try {
    const body = await c.req.json<Record<string, unknown>>().catch(() => null)
    if (!body) return c.json({ success: false, error: 'JSON 본문이 필요합니다.' }, 400)

    // 거래처=선택 입력(2026-07-17 미니창 제거) — 표시명(주문라인 거래처 or 원본 문서명) 폴백
    const clientName = String(body.client_name || '').trim() || '미지정'
    const workAiPath = body.work_ai_path ? String(body.work_ai_path) : null
    const epsPath = body.eps_path ? String(body.eps_path) : null
    if (!workAiPath && !epsPath) return c.json({ success: false, error: 'work.ai 또는 EPS 파일이 필요합니다.' }, 400)

    // 멱등 2차 안전망(.ingested 마커가 1차): 같은 source_folder 재등록 시 기존 레코드 반환
    const sourceFolder = body.source_folder ? String(body.source_folder) : null
    if (sourceFolder) {
      // 중복이면 **기존 값을 함께 돌려준다**(2026-08-12). 스캐너가 이걸로 「파일이 바뀌었나」를 판정한다.
      //   전엔 id 만 돌려줘서, 규격을 고쳐 다시 저장해도 스캐너가 조용히 건너뛰고 MES 는 옛 값 그대로였다.
      const dup = await c.env.DB.prepare(
        `SELECT id, ai_analysis_id, width_cm, height_cm, qty, client_id, item_id, status
           FROM designer_intakes WHERE memo = ? LIMIT 1`
      ).bind(sourceFolder).first<Record<string, unknown>>()
      if (dup) {
        return c.json({
          success: true,
          data: {
            intake_id: dup.id, ai_analysis_id: dup.ai_analysis_id, duplicated: true,
            existing: {
              width_cm: dup.width_cm, height_cm: dup.height_cm, qty: dup.qty,
              client_id: dup.client_id, item_id: dup.item_id, status: dup.status,
            },
          },
        })
      }
    }

    // 귀속 법인: body.entity_id 명시 우선, 없으면 세션 법인. 전체모드(null)는 400(조용한 동산1 오귀속 차단, #531)
    const entityId = Number(body.entity_id) || getWriteEntityId(c)
    if (entityId === null) return c.json({ success: false, error: ENTITY_ALL_MODE_WRITE_ERROR }, 400)
    const qty = Math.max(1, parseInt(String(body.qty ?? '1'), 10) || 1)
    const measured = (body.measured_cm || {}) as Record<string, unknown>
    const w = measured.w != null && Number.isFinite(Number(measured.w)) ? Number(measured.w) : null
    const h = measured.h != null && Number.isFinite(Number(measured.h)) ? Number(measured.h) : null
    const scalePct = Math.min(100, Math.max(1, parseInt(String(body.scale_pct ?? '100'), 10) || 100))
    const mode = ['single', 'impose', 'both'].includes(String(body.mode)) ? String(body.mode) : 'single'
    const finishing = body.finishing && typeof body.finishing === 'object' ? JSON.stringify(body.finishing) : null
    // CEP 패널 신규 필드 캐리(0472) — 구 mes-core manifest엔 없어 NULL(하위호환)
    const keyword = body.keyword != null ? String(body.keyword) : null
    const postDesc = body.post_desc != null ? String(body.post_desc) : null
    const punchJson = body.punch && typeof body.punch === 'object' ? JSON.stringify(body.punch) : null
    const workerName = body.worker_name != null ? String(body.worker_name) : null
    const workerId = Number.isFinite(Number(body.worker_id)) && Number(body.worker_id) > 0 ? Number(body.worker_id) : null
    // 작업 그룹핑 키(0477, D6): 일괄 확정의 공유 배치 폴더. 단건 확정은 null(단독 작업).
    const batchKey = body.batch_folder != null && String(body.batch_folder).trim() !== '' ? String(body.batch_folder) : null
    // 거래처 자동완성 해소분(D5): 존재 검증 통과 시만 저장(불량 id는 free-text 폴백 — FK 실패로 ingest 전체가 죽지 않게)
    let clientId: number | null = null
    const rawClientId = Number(body.client_id)
    if (Number.isFinite(rawClientId) && rawClientId > 0) {
      const cl = await c.env.DB.prepare(`SELECT id FROM clients WHERE id = ?`).bind(rawClientId).first<{ id: number }>()
      if (cl) clientId = cl.id
    }
    // 품목(0532) — 파일명 제품유형 → 품목 매핑 결과. 거래처와 같은 정책:
    //   존재 검증 통과분만 저장하고 불량 id는 NULL 폴백(FK 실패로 ingest 전체가 죽지 않게).
    //   NULL = 미해소 → 사람이 주문서에서 고른다(자동 확정 금지).
    let itemId: number | null = null
    const rawItemId = Number(body.item_id)
    if (Number.isFinite(rawItemId) && rawItemId > 0) {
      const it = await c.env.DB.prepare(`SELECT id FROM items WHERE id = ?`).bind(rawItemId).first<{ id: number }>()
      if (it) itemId = it.id
    }

    // 임포지션 팔레트 호환용 분석 레코드. file_path 소비자 규칙:
    //   single → EPS(직접연결 -3 passthrough가 완성본을 복사) / impose·both → work.ai(SheetLayout 소스 해석)
    const filePath = mode === 'single' ? (epsPath || workAiPath) : (workAiPath || epsPath)
    const ins = await c.env.DB.prepare(
      `INSERT INTO ai_analysis_requests (file_path, status, entity_id) VALUES (?, 'done', ?) RETURNING id`
    ).bind(filePath, entityId).first<{ id: number }>()
    const analysisId = ins!.id

    // 썸네일: R2 외부화(0449 정책) 후 groups_json 저장 — 실패 시 base64 인라인 폴백
    if (body.thumb_base64) {
      const groups = [{
        index: 0,
        name: 'design',
        thumbnail_base64: String(body.thumb_base64),
        width_mm: w != null ? Math.round(w * 10) : undefined,
        height_mm: h != null ? Math.round(h * 10) : undefined,
      }]
      let groupsJson: string
      try {
        groupsJson = JSON.stringify(await externalizeGroups(c.env, analysisId, groups as never))
      } catch {
        groupsJson = JSON.stringify(groups)
      }
      await c.env.DB.prepare(
        `UPDATE ai_analysis_requests SET groups_json = ?, updated_at = datetime('now') WHERE id = ?`
      ).bind(groupsJson, analysisId).run()
    }

    const intake = await c.env.DB.prepare(`
      INSERT INTO designer_intakes (
        entity_id, ai_analysis_id, client_name, client_id, qty, finishing_json, width_cm, height_cm,
        scale_pct, trim, mode, eps_path, work_ai_path, status,
        registered_by, pc_name, script_version, outline_failed, memo,
        keyword, post_desc, punch_json, worker_name, worker_id, batch_key, item_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'waiting', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `).bind(
      entityId, analysisId, clientName, clientId, qty, finishing, w, h,
      scalePct, body.trim ? 1 : 0, mode, epsPath, workAiPath,
      body.registered_by != null ? String(body.registered_by) : null,
      body.pc_name != null ? String(body.pc_name) : null,
      body.script_version != null ? String(body.script_version) : null,
      body.outline_failed ? 1 : 0,
      sourceFolder,
      keyword, postDesc, punchJson, workerName, workerId, batchKey, itemId
    ).first<{ id: number }>()

    // 판짜기(sheet) manifest: 판에 소비된 조각 대기물 absorbed 처리 (mes-sheet.jsx consumed_intake_ids)
    const consumed = Array.isArray(body.consumed_intake_ids)
      ? (body.consumed_intake_ids as unknown[]).map(Number).filter((n) => Number.isFinite(n) && n > 0)
      : []
    const efC = entityFilter(c, 'designer_intakes') // #539: 판 소비 대기물도 세션 법인으로 격리(전체모드=빈 절)
    for (let ci = 0; ci < consumed.length; ci += 80) { // D1 바인드 한도 청크([[d1-bind-param-limit]])
      const chunk = consumed.slice(ci, ci + 80)
      const ph = chunk.map(() => '?').join(',')
      await c.env.DB.prepare(
        `UPDATE designer_intakes SET status = 'absorbed', absorbed_at = datetime('now') WHERE status = 'waiting' AND id IN (${ph})${efC.clause}`
      ).bind(...chunk, ...efC.params).run()
    }

    // 경로①(주문 선행): manifest에 order_item_id 있으면 즉시 라인 연결(-3=완성본 passthrough 약속값)
    let absorbed = false
    const orderItemId = Number(body.order_item_id) || null
    if (orderItemId) {
      // #582 IDOR: 라인 소유 법인 검증 없이는 타법인 주문 라인에 남의 분석을 물릴 수 있었다(write 오염).
      // 필터는 이 id의 출처인 /intake-config open_lines(:1140)와 동일한 orderVisibilityFilter —
      // 분할청구 협업 라인(assigned_entity_id)은 통과, 타법인 라인은 차단(피커가 준 것만 링크 가능).
      const ovf = orderVisibilityFilter(c, 'o')
      const line = await c.env.DB.prepare(
        `SELECT oi.id FROM order_items oi JOIN orders o ON o.id = oi.order_id
          WHERE oi.id = ? AND oi.ai_analysis_id IS NULL${ovf.clause}`
      ).bind(orderItemId, ...ovf.params).first<{ id: number }>()
      if (line) {
        await c.env.DB.prepare(
          `UPDATE order_items SET ai_analysis_id = ?, ai_group_index = -3 WHERE id = ?`
        ).bind(analysisId, orderItemId).run()
        await c.env.DB.prepare(
          `UPDATE designer_intakes SET status = 'absorbed', order_item_id = ?, absorbed_at = datetime('now') WHERE id = ?`
        ).bind(orderItemId, intake!.id).run()
        absorbed = true
      }
    }

    return c.json({ success: true, data: { intake_id: intake!.id, ai_analysis_id: analysisId, absorbed } })
  } catch (error) {
    console.error('Workbench intake create error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── GET /api/workbench/intakes — 대기함 목록 (주문서 프리필 피커·트레이·지표) ──
// lite=1(트레이): 썸네일 eager hydrate 생략, has_thumbnail 플래그만 — 실물은 /intakes/:id/thumb lazy
// ([[feedback-r2-thumbnail-marker-leak]] — 마커 원문을 목록에 싣지 않는다)
workbenchRouter.get('/intakes', async (c) => {
  try {
    const status = (c.req.query('status') || 'waiting').trim()
    const client = (c.req.query('client') || '').trim()
    const worker = (c.req.query('worker') || '').trim()
    const lite = c.req.query('lite') === '1'
    const limit = Math.min(parseInt(c.req.query('limit') || '100', 10) || 100, 200)
    const ef = entityFilter(c, 'designer_intakes')
    let where = `1=1${ef.clause}`
    const params: unknown[] = [...ef.params]
    // 콤마 다중 허용(2026-07-31): 트레이 '처리됨 보기' = absorbed,void 한 번에 조회. 단일값은 기존과 동일.
    if (status && status !== 'all') {
      const sts = status.split(',').map((s) => s.trim()).filter(Boolean)
      where += ` AND designer_intakes.status IN (${sts.map(() => '?').join(',')})`
      params.push(...sts)
    }
    // 거래처 필터 시 '미지정'(디자이너 미입력)은 항상 노출 — 전멸 방지(D2)
    if (client) { where += ` AND (designer_intakes.client_name LIKE ? OR designer_intakes.client_name = '미지정')`; params.push(`%${client}%`) }
    if (worker) { where += ` AND designer_intakes.worker_name LIKE ?`; params.push(`%${worker}%`) }
    // #576 키워드·기간 검색 — 200건 상한을 넘어간 오래된 항목은 담당자 드롭다운(로드된 rows에서
    //   추출)에도 안 잡혀 사실상 접근 불가였다. 검색을 서버로 내려 상한 밖도 찾을 수 있게 한다.
    const q = (c.req.query('q') || '').trim()
    if (q) {
      where += ` AND (designer_intakes.client_name LIKE ? OR designer_intakes.worker_name LIKE ?`
        + ` OR designer_intakes.memo LIKE ? OR designer_intakes.keyword LIKE ?`
        + ` OR designer_intakes.batch_key LIKE ?)`
      const like = `%${q}%`
      params.push(like, like, like, like, like)
    }
    // created_at은 'YYYY-MM-DD HH:MM:SS' → 날짜 경계는 문자열 비교로 충분(인덱스 친화적)
    const dateFrom = (c.req.query('date_from') || '').trim()
    const dateTo = (c.req.query('date_to') || '').trim()
    if (dateFrom) { where += ` AND designer_intakes.created_at >= ?`; params.push(`${dateFrom} 00:00:00`) }
    if (dateTo) { where += ` AND designer_intakes.created_at <= ?`; params.push(`${dateTo} 23:59:59`) }
    // 용도 필터(2026-07-28): 단건=주문서 트레이, 모아찍기=ia-editor 로 목적지 분리.
    //   미지정/`all` = 전체 → 기존 호출자 비파괴(하위호환). 콤마 다중 허용.
    //   ⚠️ 레거시 'both'는 양쪽 호출 모두에 포함시켜야 어느 목록에서도 사라지지 않는다
    //     (패널 폼에서는 제거했지만 과거 레코드 보호. prod 0건이나 방어).
    const modeQ = (c.req.query('mode') || '').trim()
    if (modeQ && modeQ !== 'all') {
      const modes = modeQ.split(',').map((s) => s.trim()).filter((s) => ['single', 'impose', 'both'].includes(s))
      if (modes.length) {
        where += ` AND designer_intakes.mode IN (${modes.map(() => '?').join(',')})`
        params.push(...modes)
      }
    }

    // #576 절단 사실을 노출한다 — 예전엔 상한에 걸려도 "200건"만 보이고 초과분이 있다는 것조차
    //   어디에도 안 나타났다. 담당자 옵션도 로드된 rows에서 뽑아 상한 밖 담당자는 필터에도 없었다
    //   → 전체 집합 기준 distinct를 함께 준다(응답의 data는 배열 그대로 = 기존 호출자 비파괴).
    const totalRow = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM designer_intakes WHERE ${where}`
    ).bind(...params).first<{ n: number }>()
    const total = totalRow?.n ?? 0
    const { results: workerRows } = await c.env.DB.prepare(
      `SELECT DISTINCT worker_name FROM designer_intakes WHERE ${where} AND worker_name IS NOT NULL AND worker_name != ''
       ORDER BY worker_name`
    ).bind(...params).all<{ worker_name: string }>()
    const workerNames = (workerRows || []).map((r) => r.worker_name)

    // ★has_thumbnail 판정 = 두 저장 형태를 모두 본다(2026-07-30 수정).
    //   R2 이관 후 썸네일은 thumbnail_r2_key 로 저장되고 externalizeGroups 가 thumbnail_base64 키를
    //   **삭제**한다(thumbnailStore.ts). 그런데 판정이 옛 키만 찾아 prod waiting 39건 전부
    //   has_thumbnail=0 이었고, 프론트가 <img> 를 아예 만들지 않아 **썸네일이 한 장도 안 보였다**
    //   (/intakes/:id/thumb 는 hydrate 로 정상 base64 를 반환하는데 요청조차 되지 않았다).
    //   R2 이관 시 이 판정을 같이 고치지 않은 형제-불완전이고, 소비자 3곳(주문서 트레이 ·
    //   ia-editor 대기함 · 주문 라인 프리필)이 모두 이 플래그를 보므로 여기가 정본 1곳이다.
    //   패턴에 '":"' 를 붙여 값이 null 인 경우("thumbnail_base64":null)를 함께 배제한다.
    //   ⚠️ SQL 안에 이 설명을 두지 않는다 — 백틱이 템플릿 리터럴을 끊고, 주석이 매 쿼리에 실린다.
    if (lite) {
      const { results } = await c.env.DB.prepare(`
        SELECT designer_intakes.*, it.item_name,
               CASE WHEN ar.groups_json LIKE '%thumbnail_r2_key":"%'
                      OR ar.groups_json LIKE '%thumbnail_base64":"%' THEN 1 ELSE 0 END AS has_thumbnail
        FROM designer_intakes
        LEFT JOIN ai_analysis_requests ar ON ar.id = designer_intakes.ai_analysis_id
        LEFT JOIN items it ON it.id = designer_intakes.item_id
        WHERE ${where}
        ORDER BY designer_intakes.id DESC LIMIT ${limit}
      `).bind(...params).all<Record<string, unknown>>()
      return c.json({
        success: true, data: results,
        total, returned: results.length, truncated: total > results.length, worker_names: workerNames,
      })
    }

    const { results } = await c.env.DB.prepare(`
      SELECT designer_intakes.*, ar.groups_json, it.item_name
      FROM designer_intakes
      LEFT JOIN ai_analysis_requests ar ON ar.id = designer_intakes.ai_analysis_id
      LEFT JOIN items it ON it.id = designer_intakes.item_id
      WHERE ${where}
      ORDER BY designer_intakes.id DESC LIMIT ${limit}
    `).bind(...params).all<Record<string, unknown>>()

    // 피커 표시용 썸네일 hydrate(R2 ref → base64)
    const rows = await Promise.all(results.map(async (r) => {
      let thumbnail: string | null = null
      try {
        const gj = await hydrateGroupsJson(c.env, r.groups_json as string | null)
        const groups = gj ? JSON.parse(gj) : []
        thumbnail = groups?.[0]?.thumbnail_base64 || null
      } catch { /* 썸네일 실패는 목록을 막지 않음 */ }
      const { groups_json: _gj, ...rest } = r
      return { ...rest, thumbnail }
    }))
    return c.json({
      success: true, data: rows,
      total, returned: rows.length, truncated: total > rows.length, worker_names: workerNames,
    })
  } catch (error) {
    console.error('Workbench intakes list error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── GET /api/workbench/intakes/stats — 지표(D8): 일별·PC별 등록/흡수 ──
workbenchRouter.get('/intakes/stats', async (c) => {
  try {
    const ef = entityFilter(c, 'designer_intakes')
    const { results } = await c.env.DB.prepare(`
      SELECT ${kstDateOf('designer_intakes.created_at')} AS day, pc_name,
             COUNT(*) AS cnt,
             SUM(CASE WHEN status = 'absorbed' THEN 1 ELSE 0 END) AS absorbed,
             SUM(CASE WHEN status = 'void' THEN 1 ELSE 0 END) AS voided
      FROM designer_intakes WHERE 1=1${ef.clause}
      GROUP BY day, pc_name ORDER BY day DESC LIMIT 60
    `).bind(...ef.params).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('Workbench intake stats error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── GET /api/workbench/intakes/:id/thumb — 트레이 lazy 썸네일 (R2 ref hydrate → base64) ──
workbenchRouter.get('/intakes/:id/thumb', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10)
    if (!Number.isFinite(id)) return c.json({ success: false, error: '잘못된 ID' }, 400)
    const ef = entityFilter(c, 'designer_intakes')
    const row = await c.env.DB.prepare(
      `SELECT ar.groups_json AS groups_json
       FROM designer_intakes
       LEFT JOIN ai_analysis_requests ar ON ar.id = designer_intakes.ai_analysis_id
       WHERE designer_intakes.id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ groups_json: string | null }>()
    if (!row) return c.json({ success: false, error: '대기물을 찾을 수 없습니다.' }, 404)
    let thumbnail: string | null = null
    try {
      const gj = await hydrateGroupsJson(c.env, row.groups_json)
      const groups = gj ? JSON.parse(gj) : []
      thumbnail = groups?.[0]?.thumbnail_base64 || null
    } catch { /* 썸네일 실패는 목록/트레이를 막지 않음 — null 반환 */ }
    return c.json({ success: true, data: { id, thumbnail } })
  } catch (error) {
    console.error('Workbench intake thumb error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── POST /api/workbench/intakes/:id/absorb — 주문 라인 흡수 ──
// 주문서 저장 성공 후 프론트가 호출. order_item_id는 선택(라인 추적은 ai_analysis_id JOIN으로도 가능).
workbenchRouter.post('/intakes/:id/absorb', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10)
    if (!Number.isFinite(id)) return c.json({ success: false, error: '잘못된 ID' }, 400)
    const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>))
    let orderItemId = Number(body?.order_item_id) || null
    const orderId = Number(body?.order_id) || null
    const bodyAnalysisId = Number(body?.ai_analysis_id) || null

    const ef = entityFilter(c, 'designer_intakes')
    const row = await c.env.DB.prepare(
      `SELECT id, status, ai_analysis_id FROM designer_intakes WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ id: number; status: string; ai_analysis_id: number | null }>()
    if (!row) return c.json({ success: false, error: '대기물을 찾을 수 없습니다.' }, 404)
    if (row.status !== 'waiting') return c.json({ success: false, error: `대기 상태가 아닙니다 (${row.status}).` }, 409)

    // #582 변종: body로 명시된 order_item_id도 소유 검증 후에만 링크. 무검증이면 타법인 라인에
    // provenance가 꽂히고, 그 라인은 아래 역추적의 NOT EXISTS에 걸려 정당한 흡수까지 막힌다.
    // (미지정 경로는 아래 역추적이 자체 entity 가드를 가짐. 현재 웹 클라는 order_item_id를 보내지 않음)
    if (orderItemId) {
      const ovfB = orderVisibilityFilter(c, 'o')
      const ok = await c.env.DB.prepare(
        `SELECT oi.id FROM order_items oi JOIN orders o ON o.id = oi.order_id
          WHERE oi.id = ?${ovfB.clause}`
      ).bind(orderItemId, ...ovfB.params).first<{ id: number }>()
      if (!ok) return c.json({ success: false, error: '주문 라인을 찾을 수 없습니다.' }, 404)
    }

    // order_item_id 미지정 시: 대기물의 ai_analysis_id 로 방금 생성된 통과 라인(ai_group_index=-3 passthrough)을
    // 역추적해 링크(대기물↔order_item 추적성). 현재 법인·미링크 후보가 정확히 1건일 때만 연결 —
    // 애매(0/다건)하면 링크 생략(오매핑 방지). calc.js 훅이 order_id 를 넘기면 그 주문으로 범위 축소.
    const analysisId = row.ai_analysis_id ?? bodyAnalysisId
    if (!orderItemId && analysisId != null) {
      const oef = entityFilter(c, 'o')
      const cand = await c.env.DB.prepare(
        `SELECT oi.id AS id FROM order_items oi JOIN orders o ON o.id = oi.order_id
          WHERE oi.ai_analysis_id = ? AND oi.ai_group_index = -3
            AND NOT EXISTS (SELECT 1 FROM designer_intakes di WHERE di.order_item_id = oi.id)
            ${orderId ? 'AND oi.order_id = ?' : ''}${oef.clause}
          ORDER BY oi.id DESC LIMIT 2`
      ).bind(analysisId, ...(orderId ? [orderId] : []), ...oef.params).all<{ id: number }>()
      const cands = cand.results || []
      if (cands.length === 1) orderItemId = cands[0].id
    }

    const upd = await c.env.DB.prepare(
      `UPDATE designer_intakes SET status = 'absorbed', order_item_id = ?, absorbed_at = datetime('now') WHERE id = ? AND status = 'waiting'`
    ).bind(orderItemId, id).run() // #534: TOCTOU 가드(선행 SELECT 이후 동시 흡수 차단)
    if (upd.meta.changes === 0) return c.json({ success: false, error: '이미 처리된 대기물입니다.' }, 409)

    // ── 별칭 학습(2026-08-12) — 같은 일을 두 번 하지 않게 만든다 ──────────────
    // Z: 파일명의 거래처 표기는 마스터 등록명과 자주 다르다(약칭·지점 생략·오타).
    // 스캐너가 자동 해소하는 건 58% 뿐이고 나머지는 사람이 주문서에서 골라야 하는데,
    // **그 선택을 버리면 다음 달에 같은 이름을 또 고르게 된다.**
    // 흡수 시점에는 「파일 표기」와 「사람이 고른 거래처」가 둘 다 있다 — 그때 붙여 둔다.
    //   다음 스캔부터 그 표기가 search_keywords 에 걸려 자동 해소된다(반복이 0으로 수렴).
    // ⚠️ 이미 있는 키워드는 건드리지 않고 **덧붙이기만** 한다. 덮어쓰면 남의 별칭이 날아간다.
    try {
      const learned = await c.env.DB.prepare(
        `SELECT di.client_name AS fileName, o.client_id AS clientId,
                cl.client_name AS masterName, cl.search_keywords AS kw
           FROM designer_intakes di
           JOIN order_items oi ON oi.id = di.order_item_id
           JOIN orders o ON o.id = oi.order_id
           JOIN clients cl ON cl.id = o.client_id
          WHERE di.id = ?`
      ).bind(id).first<{ fileName: string; clientId: number; masterName: string; kw: string | null }>()
      const raw = (learned?.fileName || '').trim()
      const strip = (s: string) => s.replace(/[\s.,()\-_]/g, '').toLowerCase()
      if (learned && raw && raw !== '미지정' && raw.length >= 2) {
        const already = strip(raw) === strip(learned.masterName || '')
          || (learned.kw || '').split(',').some((k) => strip(k) === strip(raw))
        if (!already) {
          const next = [(learned.kw || '').trim(), raw].filter(Boolean).join(',').slice(0, 900)
          await c.env.DB.prepare(`UPDATE clients SET search_keywords = ? WHERE id = ?`)
            .bind(next, learned.clientId).run()
        }
      }
    } catch (_learnErr) {
      // 학습 실패가 흡수를 되돌리면 안 된다 — 다음 흡수 때 다시 시도된다.
    }

    // ── ★출력완료 매칭 학습 (2026-08-27) ────────────────────────────────
    // LogWatcher 는 RIP 에 들어간 **파일명**만 본다. 그런데 디자이너는 주문이 생기기 **전에**
    // 파일을 만든다(가공 → 주문서 순서) — 그래서 파일명에 주문번호를 미리 심을 수가 없다.
    //   실측(2026-08-26): 8월 print_events 5,554건 중 card_id 매칭 **0건**,
    //   작업파일 962건 중 주문 코드를 가진 것 **0건**. 매칭이 통째로 죽어 있었다.
    //   printEvents.ts:1107 주석이 이미 알고 있었다 — "파일명 규칙을 강제하는 대신 … 학습".
    //   그 학습 경로(POST /print-events/link)는 15행에서 멈춰 있다(사람이 눌러야 해서).
    //
    // ★키는 앞에서 심는 게 아니라 **뒤에서 붙인다.** 흡수 시점에는 「파일」과 「사람이 고른
    //   주문 라인」이 둘 다 있다 — 바로 위 거래처 별칭 학습과 **같은 논리·같은 자리**다.
    //   이후 resolveCard 2차(file_name 일치)가 이벤트를 해소한다.
    // ⚠️ 카드가 아직 0건이라 card_id 는 null 로 둔다 — print_file_map 은 이미 NULL 을 허용하고
    //    (orders/core.ts 가 카드 삭제 시 SET NULL 한다) resolveCard 는 order_number·order_item_id
    //    만으로도 이벤트를 주문에 붙일 수 있다.
    // ⚠️ 파일명은 패널이 실물 규약으로 지은 등록 EPS 이름이다(CUT-CEP-0.22.0+).
    //    구 이름(거래처-WxH-NEA-nest.eps)이면 RIP 에 그 이름으로 들어갈 일이 없어 매칭도 안 되지만,
    //    학습해 둬서 손해는 없다(중복은 UNIQUE 로 흡수된다).
    try {
      const linkRow = await c.env.DB.prepare(
        `SELECT di.eps_path AS epsPath, di.entity_id AS entityId, o.order_number AS orderNumber,
                oi.id AS orderItemId
           FROM designer_intakes di
           JOIN order_items oi ON oi.id = di.order_item_id
           JOIN orders o ON o.id = oi.order_id
          WHERE di.id = ?`
      ).bind(id).first<{ epsPath: string | null; entityId: number; orderNumber: string | null; orderItemId: number }>()
      const fileName = String(linkRow?.epsPath || '').replace(/^.*[\\/]/, '').trim()
      if (linkRow?.orderNumber && fileName) {
        const seen = await c.env.DB.prepare(
          'SELECT file_seq FROM print_file_map WHERE order_number = ? AND file_name = ?'
        ).bind(linkRow.orderNumber, fileName).first<{ file_seq: number }>()
        let fileSeq = seen?.file_seq
        if (!fileSeq) {
          const mx = await c.env.DB.prepare(
            'SELECT COALESCE(MAX(file_seq), 0) AS m FROM print_file_map WHERE order_number = ?'
          ).bind(linkRow.orderNumber).first<{ m: number }>()
          fileSeq = (mx?.m || 0) + 1
        }
        await c.env.DB.prepare(`
          INSERT INTO print_file_map (order_number, file_seq, card_id, card_number, order_item_id, file_name, entity_id)
          VALUES (?, ?, NULL, NULL, ?, ?, ?)
          ON CONFLICT(order_number, file_seq) DO UPDATE SET
            order_item_id = excluded.order_item_id, file_name = excluded.file_name, entity_id = excluded.entity_id
        `).bind(linkRow.orderNumber, fileSeq, linkRow.orderItemId, fileName, linkRow.entityId).run()

        // 소급 — 이 이름으로 이미 들어온 미매칭 이벤트에 주문을 붙인다(확장자 유무 양쪽).
        const noExt = fileName.replace(/\.[^.]+$/, '')
        await c.env.DB.prepare(`
          UPDATE print_events SET order_number = ?
           WHERE order_number IS NULL AND (file_name = ? OR file_name = ?)
        `).bind(linkRow.orderNumber, fileName, noExt).run()
      }
    } catch (_mapErr) {
      // 매칭 학습 실패가 흡수를 되돌리면 안 된다 — 위 별칭 학습과 같은 원칙.
    }

    return c.json({ success: true, data: { id, status: 'absorbed', order_item_id: orderItemId } })
  } catch (error) {
    console.error('Workbench intake absorb error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 대기물 취소 권한(2026-07-28): 등록자 본인 또는 ADMIN/MANAGER.
//   여러 디자이너가 한 대기함에 올리므로 남의 작업을 실수로 지우는 사고를 막는다.
//   ⚠️ worker_id NULL(패널 도입 전 등록분)은 소유자 판정이 불가 → 제한 없음(현행 유지).
//     관리자 전용으로 막으면 기존 잔류물을 디자이너가 못 치우고, 지금도 누구나 지울 수
//     있는 상태라 보안이 후퇴하지도 않는다. 신규 등록분부터 자연히 소유자 규칙이 적용된다.
function canVoidIntake(c: Context<HonoEnv>, workerId: number | null): boolean {
  if (workerId == null) return true
  const user = c.get('user') as { id?: number; role?: string } | undefined
  if (!user) return false
  if (user.role === 'ADMIN' || user.role === 'MANAGER') return true
  return Number(user.id) === Number(workerId)
}

// ── POST /api/workbench/intakes/void-bulk — 선택 대기물 일괄 취소 ──
// 관리 화면의 [선택 N건 취소]. 권한 없는 건은 조용히 건너뛰고(전체 실패로 만들지 않음)
// 결과 카운트로 알린다. :id/void 와 동일한 소유자 규칙.
// ⚠️ :id 라우트보다 먼저 등록 — 경로 형태가 달라 충돌은 없으나 순서로도 못박는다.
workbenchRouter.post('/intakes/void-bulk', async (c) => {
  try {
    const body = await c.req.json<{ ids?: unknown }>().catch(() => ({} as { ids?: unknown }))
    const ids = Array.isArray(body.ids)
      ? (body.ids as unknown[]).map(Number).filter((n) => Number.isFinite(n) && n > 0)
      : []
    if (!ids.length) return c.json({ success: false, error: '취소할 대기물을 선택하세요.' }, 400)

    const ef = entityFilter(c, 'designer_intakes')
    const allowed: number[] = []
    let denied = 0, skipped = 0
    for (let i = 0; i < ids.length; i += 80) { // D1 바인드 한도([[d1-bind-param-limit]])
      const chunk = ids.slice(i, i + 80)
      const ph = chunk.map(() => '?').join(',')
      const { results } = await c.env.DB.prepare(
        `SELECT id, status, worker_id FROM designer_intakes WHERE id IN (${ph})${ef.clause}`
      ).bind(...chunk, ...ef.params).all<{ id: number; status: string; worker_id: number | null }>()
      for (const r of results || []) {
        if (r.status !== 'waiting') { skipped++; continue }
        if (!canVoidIntake(c, r.worker_id)) { denied++; continue }
        allowed.push(r.id)
      }
    }

    let voided = 0
    for (let i = 0; i < allowed.length; i += 80) {
      const chunk = allowed.slice(i, i + 80)
      const ph = chunk.map(() => '?').join(',')
      const r = await c.env.DB.prepare(
        `UPDATE designer_intakes SET status = 'void' WHERE id IN (${ph}) AND status = 'waiting'${ef.clause}`
      ).bind(...chunk, ...ef.params).run()
      voided += r.meta?.changes ?? 0
    }
    return c.json({ success: true, data: { voided, denied, skipped } })
  } catch (error) {
    console.error('Workbench intake void-bulk error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── POST /api/workbench/intakes/:id/void — 대기물 취소 ──
workbenchRouter.post('/intakes/:id/void', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10)
    if (!Number.isFinite(id)) return c.json({ success: false, error: '잘못된 ID' }, 400)
    const ef = entityFilter(c, 'designer_intakes')
    const row = await c.env.DB.prepare(
      `SELECT id, status, worker_id FROM designer_intakes WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ id: number; status: string; worker_id: number | null }>()
    if (!row) return c.json({ success: false, error: '대기물을 찾을 수 없습니다.' }, 404)
    if (!canVoidIntake(c, row.worker_id)) {
      return c.json({ success: false, error: '등록한 본인 또는 관리자만 취소할 수 있습니다.' }, 403)
    }
    if (row.status !== 'waiting') return c.json({ success: false, error: `대기 상태가 아닙니다 (${row.status}).` }, 409)
    await c.env.DB.prepare(
      `UPDATE designer_intakes SET status = 'void' WHERE id = ?`
    ).bind(id).run()
    return c.json({ success: true, data: { id, status: 'void' } })
  } catch (error) {
    console.error('Workbench intake void error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── POST /api/workbench/intakes/:id/restore — 처리된 대기물 waiting 복귀 (2026-07-31) ──
// absorbed·void → waiting. absorbed는 intake↔주문라인 링크만 해제 — **주문 라인 자체는 불변**
// (이미 저장된 주문의 ai_analysis_id·파일 연결을 여기서 건드리면 조용한 주문 변조가 된다).
// 소유자 규칙 = void와 동일(등록 본인 또는 관리자, canVoidIntake).
workbenchRouter.post('/intakes/:id/restore', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10)
    if (!Number.isFinite(id)) return c.json({ success: false, error: '잘못된 ID' }, 400)
    const ef = entityFilter(c, 'designer_intakes')
    const row = await c.env.DB.prepare(
      `SELECT id, status, worker_id, order_item_id FROM designer_intakes WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ id: number; status: string; worker_id: number | null; order_item_id: number | null }>()
    if (!row) return c.json({ success: false, error: '대기물을 찾을 수 없습니다.' }, 404)
    if (!canVoidIntake(c, row.worker_id)) {
      return c.json({ success: false, error: '등록한 본인 또는 관리자만 복구할 수 있습니다.' }, 403)
    }
    if (row.status === 'waiting') return c.json({ success: false, error: '이미 대기 상태입니다.' }, 409)
    // TOCTOU 가드: 상태 조건을 UPDATE에 재명시(absorb #534와 동일 패턴)
    const upd = await c.env.DB.prepare(
      `UPDATE designer_intakes SET status = 'waiting', order_item_id = NULL, absorbed_at = NULL
       WHERE id = ? AND status IN ('absorbed', 'void')`
    ).bind(id).run()
    if (upd.meta.changes === 0) return c.json({ success: false, error: '이미 처리된 요청입니다.' }, 409)
    return c.json({ success: true, data: { id, status: 'waiting', prev_status: row.status, unlinked_order_item_id: row.order_item_id } })
  } catch (error) {
    console.error('Workbench intake restore error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default workbenchRouter
