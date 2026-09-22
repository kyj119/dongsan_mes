import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { getEntityId } from '../utils/entityFilter'
import { notifyRoles } from '../utils/notify'

// 병행테스트 문제 접수함 (0626) — 설계 근거는 마이그레이션 주석이 정본.
//
// ★접수는 **권한을 걸지 않는다**(로그인만). 모두가 내야 하는 창구라 권한을 걸면
//   정작 막힌 사람이 못 낸다. 열람·처리만 ADMIN/MANAGER.
// ★첨부는 **접수와 분리**한다 — 접수를 먼저 확정해야(항상 성공) 업로드가 실패해도
//   신고 자체는 남는다. 큰 파일 하나가 접수를 통째로 날리는 구조를 만들지 않는다.

const feedbackRouter = new Hono<HonoEnv>()
feedbackRouter.use('/*', authMiddleware)

const CATEGORIES = ['MISSING', 'NOTFOUND', 'ERROR', 'WRONG'] as const
const CATEGORY_LABEL: Record<string, string> = {
  MISSING: '기능이 없어요',
  NOTFOUND: '못 찾겠어요',
  ERROR: '오류·느려요',
  WRONG: '값이 틀려요',
}

// 캡처 10MB · 파일 50MB. 넘으면 Z: 경로를 적으라고 화면이 안내한다
// (같은 망에 원본이 있는데 올렸다 받는 건 돌아가는 길이다 — 0626 주석 ②).
const MAX_CAPTURE = 10 * 1024 * 1024
const MAX_FILE = 50 * 1024 * 1024
const MAX_ATTACH_COUNT = 10

type Attachment = { kind: 'capture' | 'file'; key: string; name: string; size: number; type?: string }

function parseAttachments(raw: unknown): Attachment[] {
  if (!raw || typeof raw !== 'string') return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : []
  } catch (_e) {
    // ignore: 손상된 JSON 은 첨부 없음으로 본다 — 신고 본문을 못 읽는 것보다 낫다
    return []
  }
}

// 문자열 칸 상한 — 자동 수집분이 길어져 행이 비대해지는 것을 막는다(last_error 가 스택이면 길다)
function clip(v: unknown, max: number): string | null {
  if (v == null) return null
  const s = String(v).trim()
  if (!s) return null
  return s.length > max ? s.slice(0, max) : s
}

// ── 접수 (로그인만) ──────────────────────────────────────────────
feedbackRouter.post('/', async (c) => {
  try {
    const user = c.get('user')
    const body = await c.req.json().catch(() => null) as any
    if (!body) return c.json({ success: false, error: '요청 본문이 없습니다.' }, 400)

    const category = String(body.category || '').toUpperCase()
    if (!CATEGORIES.includes(category as any)) {
      return c.json({ success: false, error: '분류를 골라 주세요.' }, 400)
    }
    const text = clip(body.body, 2000)
    if (!text) return c.json({ success: false, error: '무슨 일이 있었는지 한 줄만 적어 주세요.' }, 400)

    // entity_id 는 DEFAULT 1 이지만 명시한다(전역 DEFAULT 1 함정). 전체모드(0)면 1로 떨어뜨린다.
    const actingEntity = getEntityId(c) || 1

    const row = await c.env.DB.prepare(
      `INSERT INTO feedback_reports
         (user_id, reporter_name, entity_id, category, body,
          page_path, page_label, context_ref, client_info, last_error, file_path)
       VALUES (?, (SELECT name FROM users WHERE id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id, created_at`
    ).bind(
      user.id, user.id, actingEntity, category, text,
      clip(body.page_path, 500),
      clip(body.page_label, 120),
      clip(body.context_ref, 300),
      clip(body.client_info, 1000),
      clip(body.last_error, 2000),
      clip(body.file_path, 1000)
    ).first<{ id: number; created_at: string }>()

    // ADMIN 에게 알린다. 배지(폴링×집계)는 만들지 않는다 — 이건 이벤트라 비용이 안 붙는다.
    await notifyRoles(
      c.env.DB, ['ADMIN'],
      `문제 신고 — ${CATEGORY_LABEL[category]}`,
      `${text.slice(0, 80)}${text.length > 80 ? '…' : ''}`,
      `/feedback?id=${row!.id}`,
      actingEntity
    )

    return c.json({ success: true, data: { id: row!.id, created_at: row!.created_at } })
  } catch (error) {
    console.error('feedback create error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── 첨부 (신고자 본인 또는 ADMIN/MANAGER) ────────────────────────
feedbackRouter.post('/:id/attach', async (c) => {
  try {
    const user = c.get('user')
    const id = parseInt(c.req.param('id'))
    if (!id) return c.json({ success: false, error: '잘못된 요청입니다.' }, 400)

    const target = await c.env.DB.prepare(
      `SELECT id, user_id, attachments_json FROM feedback_reports WHERE id = ?`
    ).bind(id).first<{ id: number; user_id: number | null; attachments_json: string | null }>()
    if (!target) return c.json({ success: false, error: '신고를 찾을 수 없습니다.' }, 404)

    const isManager = user.role === 'ADMIN' || user.role === 'MANAGER'
    if (target.user_id !== user.id && !isManager) {
      return c.json({ success: false, error: '권한이 없습니다.' }, 403)
    }

    const form = await c.req.formData()
    const file = form.get('file') as File | null
    if (!file) return c.json({ success: false, error: '파일이 없습니다.' }, 400)
    const kind = (form.get('kind') as string) === 'capture' ? 'capture' : 'file'

    const limit = kind === 'capture' ? MAX_CAPTURE : MAX_FILE
    if (file.size > limit) {
      return c.json({
        success: false,
        error: kind === 'capture'
          ? '캡처가 10MB를 넘습니다.'
          : '파일이 50MB를 넘습니다. Z: 경로를 적어 주시면 원본을 그대로 열어 봅니다.',
      }, 413)
    }

    const existing = parseAttachments(target.attachments_json)
    if (existing.length >= MAX_ATTACH_COUNT) {
      return c.json({ success: false, error: `첨부는 ${MAX_ATTACH_COUNT}개까지입니다.` }, 400)
    }

    // 키 sanitize: path traversal / 헤더 인젝션 방어 (aiAnalysis.ts 업로드와 같은 규칙)
    const rawName = file.name || (kind === 'capture' ? 'capture.png' : 'file')
    const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
    const key = `feedback/${id}/${Date.now()}-${safeName}`
    await c.env.R2_BUCKET.put(key, file.stream(), {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
    })

    const next: Attachment[] = existing.concat([{
      kind, key, name: rawName.slice(0, 200), size: file.size, type: file.type || undefined,
    }])
    await c.env.DB.prepare(`UPDATE feedback_reports SET attachments_json = ? WHERE id = ?`)
      .bind(JSON.stringify(next), id).run()

    return c.json({ success: true, data: { index: next.length - 1, name: rawName, size: file.size } })
  } catch (error) {
    console.error('feedback attach error:', error)
    return c.json({ success: false, error: '첨부 저장에 실패했습니다.' }, 500)
  }
})

// ── 내가 낸 것 (전원) ────────────────────────────────────────────
// 「내 신고가 어떻게 됐나」를 본인이 볼 수 있어야 같은 건을 다시 내지 않는다.
feedbackRouter.get('/mine', async (c) => {
  try {
    const user = c.get('user')
    const { results } = await c.env.DB.prepare(
      `SELECT id, category, body, page_label, status, created_at, handled_at, handled_note
         FROM feedback_reports WHERE user_id = ? ORDER BY id DESC LIMIT 30`
    ).bind(user.id).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('feedback mine error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── 목록 (ADMIN/MANAGER) ─────────────────────────────────────────
feedbackRouter.get('/', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const { status = '', category = '', user_id = '', search = '', page = '1', limit = '50' } = c.req.query()
    const safeLimit = Math.min(parseInt(limit) || 50, 100)
    const offset = ((parseInt(page) || 1) - 1) * safeLimit

    const where: string[] = []
    const params: any[] = []

    // 법인 격리 — activityLogs 와 같은 규칙(ADMIN 전체모드만 전 법인)
    const actingEntity = getEntityId(c)
    if (actingEntity !== 0) { where.push('f.entity_id = ?'); params.push(actingEntity) }

    if (status) { where.push('f.status = ?'); params.push(status) }
    if (category) { where.push('f.category = ?'); params.push(category) }
    if (user_id) { where.push('f.user_id = ?'); params.push(parseInt(user_id)) }
    if (search) { where.push('(f.body LIKE ? OR f.page_label LIKE ? OR f.reporter_name LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`) }

    const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : ''

    // id DESC 단독으로 유일(AUTOINCREMENT) — tie-break 불요
    const { results } = await c.env.DB.prepare(
      `SELECT f.id, f.user_id, f.reporter_name, f.category, f.body, f.page_path, f.page_label,
              f.file_path, f.status, f.created_at, f.handled_at, f.notified_at,
              (SELECT COUNT(*) FROM json_each(COALESCE(f.attachments_json, '[]'))) AS attach_count
         FROM feedback_reports f${whereSql}
        ORDER BY f.id DESC LIMIT ? OFFSET ?`
    ).bind(...params, safeLimit, offset).all()

    const counts = await c.env.DB.prepare(
      `SELECT SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) AS open_n, COUNT(*) AS total_n
         FROM feedback_reports f${whereSql}`
    ).bind(...params).first<{ open_n: number; total_n: number }>()

    return c.json({ success: true, data: results, summary: counts })
  } catch (error) {
    console.error('feedback list error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── 상세 (ADMIN/MANAGER 또는 본인) ───────────────────────────────
feedbackRouter.get('/:id', async (c) => {
  try {
    const user = c.get('user')
    const id = parseInt(c.req.param('id'))
    const row = await c.env.DB.prepare(
      `SELECT f.*, u.name AS handled_by_name
         FROM feedback_reports f
         LEFT JOIN users u ON u.id = f.handled_by
        WHERE f.id = ?`
    ).bind(id).first<any>()
    if (!row) return c.json({ success: false, error: '신고를 찾을 수 없습니다.' }, 404)

    const isManager = user.role === 'ADMIN' || user.role === 'MANAGER'
    if (row.user_id !== user.id && !isManager) return c.json({ success: false, error: '권한이 없습니다.' }, 403)

    row.attachments = parseAttachments(row.attachments_json)
    delete row.attachments_json
    return c.json({ success: true, data: row })
  } catch (error) {
    console.error('feedback detail error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── 첨부 내려받기 (ADMIN/MANAGER 또는 본인) ──────────────────────
// ⚠️인증이 Authorization 헤더 전용이라 <a href> 직링크는 401 빈 탭이 된다 — 화면은 blob 으로 받는다.
feedbackRouter.get('/:id/attachment/:index', async (c) => {
  try {
    const user = c.get('user')
    const id = parseInt(c.req.param('id'))
    const index = parseInt(c.req.param('index'))
    const row = await c.env.DB.prepare(
      `SELECT user_id, attachments_json FROM feedback_reports WHERE id = ?`
    ).bind(id).first<{ user_id: number | null; attachments_json: string | null }>()
    if (!row) return c.json({ success: false, error: '신고를 찾을 수 없습니다.' }, 404)

    const isManager = user.role === 'ADMIN' || user.role === 'MANAGER'
    if (row.user_id !== user.id && !isManager) return c.json({ success: false, error: '권한이 없습니다.' }, 403)

    const list = parseAttachments(row.attachments_json)
    const att = list[index]
    if (!att) return c.json({ success: false, error: '첨부를 찾을 수 없습니다.' }, 404)

    const obj = await c.env.R2_BUCKET.get(att.key)
    if (!obj) return c.json({ success: false, error: '파일이 저장소에 없습니다.' }, 404)

    return new Response(obj.body, {
      headers: {
        'Content-Type': att.type || 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(att.name)}`,
      },
    })
  } catch (error) {
    console.error('feedback attachment error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── 처리 (ADMIN/MANAGER) ─────────────────────────────────────────
feedbackRouter.patch('/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const user = c.get('user')
    const id = parseInt(c.req.param('id'))
    const body = await c.req.json().catch(() => ({})) as any

    const row = await c.env.DB.prepare(
      `SELECT id, user_id, status, category, body, entity_id, notified_at FROM feedback_reports WHERE id = ?`
    ).bind(id).first<any>()
    if (!row) return c.json({ success: false, error: '신고를 찾을 수 없습니다.' }, 404)

    const nextStatus = body.status === 'DONE' ? 'DONE' : (body.status === 'OPEN' ? 'OPEN' : row.status)
    const note = clip(body.handled_note, 2000)
    const becameDone = nextStatus === 'DONE' && row.status !== 'DONE'

    await c.env.DB.prepare(
      `UPDATE feedback_reports
          SET status = ?, handled_note = ?, handled_by = ?,
              handled_at = CASE WHEN ? = 'DONE' THEN CURRENT_TIMESTAMP ELSE NULL END
        WHERE id = ?`
    ).bind(nextStatus, note, user.id, nextStatus, id).run()

    // ★고친 걸 본인에게 알린다 — 안 알리면 다음부터 신고를 안 한다.
    //   notified_at 은 **알림이 실제로 들어간 뒤에만** 찍는다(찍어 놓고 안 보내면 보냈다고 착각한다).
    if (becameDone && row.user_id) {
      try {
        await c.env.DB.prepare(
          `INSERT INTO notifications (user_id, title, message, link, entity_id) VALUES (?, ?, ?, ?, ?)`
        ).bind(
          row.user_id,
          '신고하신 건이 처리됐습니다',
          note ? note.slice(0, 200) : String(row.body || '').slice(0, 80),
          `/feedback?id=${id}`,
          row.entity_id || 1
        ).run()
        await c.env.DB.prepare(`UPDATE feedback_reports SET notified_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(id).run()
      } catch (e) {
        // 알림 실패가 처리 자체를 막지는 않는다. notified_at 이 비어 있으면 화면이 「미통보」로 보여 준다.
        console.error('feedback notify failed:', e)
      }
    }

    return c.json({ success: true })
  } catch (error) {
    console.error('feedback patch error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default feedbackRouter
