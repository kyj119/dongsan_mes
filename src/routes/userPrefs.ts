/**
 * userPrefs.ts — 목록 화면 사용자별 설정 (2026-08-08)
 *
 * 감사 docs/audits/2026-08-08-list-ux-ecount-gap.md 의 G8(프리셋)·G9(열 선택)·G12(페이지당 건수).
 * 마이그레이션 0525.
 *
 * ⚠️ 전부 '로그인한 본인 것'만 읽고 쓴다. user_id 는 요청 body 가 아니라 토큰에서만 온다
 *    (body 로 받으면 남의 설정을 조작할 수 있다).
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware } from '../middleware/auth'

const userPrefsRouter = new Hono<HonoEnv>()
userPrefsRouter.use('/*', authMiddleware)

/** 토큰의 사용자 id — 이 라우터의 모든 쿼리는 이 값으로만 좁힌다 */
function currentUserId(c: any): number {
  const user = c.get('user') as { id?: number; userId?: number } | undefined
  return Number(user?.id ?? user?.userId ?? 0) || 0
}

const MAX_PRESETS_PER_PAGE = 30      // 무한 생성 방지 (UI 로도 못 넘게 막지만 서버가 정본)
const MAX_VALUE_BYTES = 8000         // 조회조건 스냅샷은 작다. 큰 값이 오면 오용이다.

// ── UI 설정 (열 표시·페이지당 건수) ────────────────────────────────────
// GET /api/user-prefs — 본인 설정 전부 (페이지 로드 때 한 번)
userPrefsRouter.get('/', async (c) => {
  try {
    const uid = currentUserId(c)
    if (!uid) return c.json({ success: true, data: {} })
    const { results } = await c.env.DB.prepare(
      'SELECT pref_key, pref_value FROM user_ui_prefs WHERE user_id = ?'
    ).bind(uid).all<{ pref_key: string; pref_value: string }>()
    const data: Record<string, string> = {}
    for (const r of results || []) data[r.pref_key] = r.pref_value
    return c.json({ success: true, data })
  } catch (error) {
    console.error('userPrefs.list error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PUT /api/user-prefs/:key — 값 하나 저장(upsert). 빈 값이면 삭제 = 기본값으로 되돌림
userPrefsRouter.put('/:key', async (c) => {
  try {
    const uid = currentUserId(c)
    if (!uid) return c.json({ success: false, error: '로그인이 필요합니다.' }, 401)
    const key = c.req.param('key')
    if (!key || key.length > 80) return c.json({ success: false, error: '잘못된 설정 키입니다.' }, 400)

    const body = await c.req.json().catch(() => ({})) as { value?: unknown }
    const raw = body?.value
    const value = raw == null ? '' : (typeof raw === 'string' ? raw : JSON.stringify(raw))
    if (value.length > MAX_VALUE_BYTES) return c.json({ success: false, error: '설정 값이 너무 큽니다.' }, 400)

    if (!value) {
      await c.env.DB.prepare('DELETE FROM user_ui_prefs WHERE user_id = ? AND pref_key = ?').bind(uid, key).run()
      return c.json({ success: true, data: { key, value: null } })
    }
    await c.env.DB.prepare(
      `INSERT INTO user_ui_prefs (user_id, pref_key, pref_value, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id, pref_key) DO UPDATE SET pref_value = excluded.pref_value, updated_at = CURRENT_TIMESTAMP`
    ).bind(uid, key, value).run()
    return c.json({ success: true, data: { key, value } })
  } catch (error) {
    console.error('userPrefs.put error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── 조회조건 프리셋 ────────────────────────────────────────────────────
// GET /api/user-prefs/presets/:pageKey
userPrefsRouter.get('/presets/:pageKey', async (c) => {
  try {
    const uid = currentUserId(c)
    if (!uid) return c.json({ success: true, data: [] })
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, params_json, is_default
       FROM user_filter_presets
       WHERE user_id = ? AND page_key = ?
       ORDER BY is_default DESC, name ASC, id ASC`   // 정렬 규약: 고유키 tie-break
    ).bind(uid, c.req.param('pageKey')).all()
    return c.json({ success: true, data: results || [] })
  } catch (error) {
    console.error('userPrefs.presets.list error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /api/user-prefs/presets — 저장(같은 이름이면 덮어쓰기)
userPrefsRouter.post('/presets', async (c) => {
  try {
    const uid = currentUserId(c)
    if (!uid) return c.json({ success: false, error: '로그인이 필요합니다.' }, 401)
    const body = await c.req.json().catch(() => ({})) as { page_key?: string; name?: string; params?: unknown; is_default?: boolean }
    const pageKey = (body.page_key || '').trim()
    const name = (body.name || '').trim()
    if (!pageKey || !name) return c.json({ success: false, error: '페이지와 이름이 필요합니다.' }, 400)
    if (name.length > 40) return c.json({ success: false, error: '이름은 40자 이내로 입력해주세요.' }, 400)

    const paramsJson = typeof body.params === 'string' ? body.params : JSON.stringify(body.params ?? {})
    if (paramsJson.length > MAX_VALUE_BYTES) return c.json({ success: false, error: '조회조건이 너무 큽니다.' }, 400)

    const cnt = await c.env.DB.prepare(
      'SELECT COUNT(*) as n FROM user_filter_presets WHERE user_id = ? AND page_key = ?'
    ).bind(uid, pageKey).first<{ n: number }>()
    const exists = await c.env.DB.prepare(
      'SELECT id FROM user_filter_presets WHERE user_id = ? AND page_key = ? AND name = ?'
    ).bind(uid, pageKey, name).first<{ id: number }>()
    if (!exists && (cnt?.n ?? 0) >= MAX_PRESETS_PER_PAGE) {
      return c.json({ success: false, error: `프리셋은 페이지당 ${MAX_PRESETS_PER_PAGE}개까지 저장할 수 있습니다.` }, 400)
    }

    // 기본 프리셋은 페이지당 하나 — 새로 지정하면 기존 것을 내린다
    if (body.is_default) {
      await c.env.DB.prepare(
        'UPDATE user_filter_presets SET is_default = 0 WHERE user_id = ? AND page_key = ?'
      ).bind(uid, pageKey).run()
    }

    await c.env.DB.prepare(
      `INSERT INTO user_filter_presets (user_id, page_key, name, params_json, is_default, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id, page_key, name)
       DO UPDATE SET params_json = excluded.params_json, is_default = excluded.is_default, updated_at = CURRENT_TIMESTAMP`
    ).bind(uid, pageKey, name, paramsJson, body.is_default ? 1 : 0).run()

    return c.json({ success: true })
  } catch (error) {
    console.error('userPrefs.presets.save error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PATCH /api/user-prefs/presets/:id/default — 기본 프리셋 지정/해제
userPrefsRouter.patch('/presets/:id/default', async (c) => {
  try {
    const uid = currentUserId(c)
    if (!uid) return c.json({ success: false, error: '로그인이 필요합니다.' }, 401)
    const id = parseInt(c.req.param('id'))
    // 남의 프리셋을 건드리지 못하도록 소유 확인을 먼저 (id 만으로 UPDATE 하지 않는다)
    const own = await c.env.DB.prepare(
      'SELECT id, page_key, is_default FROM user_filter_presets WHERE id = ? AND user_id = ?'
    ).bind(id, uid).first<{ id: number; page_key: string; is_default: number }>()
    if (!own) return c.json({ success: false, error: '프리셋을 찾을 수 없습니다.' }, 404)

    const next = own.is_default ? 0 : 1
    if (next) {
      await c.env.DB.prepare(
        'UPDATE user_filter_presets SET is_default = 0 WHERE user_id = ? AND page_key = ?'
      ).bind(uid, own.page_key).run()
    }
    await c.env.DB.prepare(
      'UPDATE user_filter_presets SET is_default = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?'
    ).bind(next, id, uid).run()
    return c.json({ success: true, data: { is_default: next } })
  } catch (error) {
    console.error('userPrefs.presets.default error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// DELETE /api/user-prefs/presets/:id
userPrefsRouter.delete('/presets/:id', async (c) => {
  try {
    const uid = currentUserId(c)
    if (!uid) return c.json({ success: false, error: '로그인이 필요합니다.' }, 401)
    const id = parseInt(c.req.param('id'))
    // user_id 를 WHERE 에 함께 걸어 남의 것은 지워지지 않게
    const res = await c.env.DB.prepare(
      'DELETE FROM user_filter_presets WHERE id = ? AND user_id = ?'
    ).bind(id, uid).run()
    if (!res.meta?.changes) return c.json({ success: false, error: '프리셋을 찾을 수 없습니다.' }, 404)
    return c.json({ success: true })
  } catch (error) {
    console.error('userPrefs.presets.delete error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default userPrefsRouter
