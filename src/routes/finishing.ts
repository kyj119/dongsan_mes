import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'

const finishingRouter = new Hono<HonoEnv>()
finishingRouter.use('/*', authMiddleware)

// 멀티테넌시 (감사 2026-06-09): finishing_methods·finishing_presets는 entity_id 없음 = 전사 공용.
// 후가공 방법/프리셋 정의는 마스터·카탈로그 데이터로, BOM·품목·단가와 동일하게 법인 공유 정책.
// → entityFilter 미적용이 의도된 설계. (법인별 후가공 단가가 필요해지면 별도 entity 스코프 검토)

// 화면의 칸 이름 — 사용자는 '출력(현수막)'·'전사(봉제)' 라는 칸으로 보므로 오류 문구도 같은 말을
// 써야 어느 칸을 봐야 하는지 바로 안다. 표시 원본 = src/pages/postProcessing.ts 그룹 헤더.
const METHOD_GROUP_LABEL: Record<string, string> = {
  output: '출력(현수막)',
  transfer: '전사(봉제)',
  sign: '간판',
}

// 이름 UNIQUE 충돌 문구 — 추가(POST)·이름 변경(PUT) 양쪽이 같은 문구를 쓴다.
//
// ★ name UNIQUE 는 method_group 을 가리지 않는 전역 제약이다. 프리셋 config 와 CEP 패널이
//   방식을 '이름'으로 찾으므로 전역 유일이 요구사항이고, 그래서 다른 칸에 있는 이름으로도 거부된다.
//   그런데 사용자가 보고 있는 칸의 목록엔 그 이름이 없어 이유를 알 수 없는 실패로 보인다
//   (2026-07-30 실제 신고: 출력 칸에 추가했는데 봉제 칸의 이름과 충돌) → 어느 칸에 있는지,
//   삭제 처리된 항목인지를 문구에 실어 준다. reqGroup 을 모르면(부분 수정) 칸 힌트는 생략.
async function uniqueNameMessage(db: D1Database, name: string, reqGroup: string | null): Promise<string> {
  const dup = name
    ? await db
        .prepare('SELECT is_active, method_group FROM finishing_methods WHERE name = ?')
        .bind(name)
        .first<{ is_active: number; method_group: string | null }>()
    : null
  const dupGroup = dup?.method_group || 'output'
  const hints: string[] = []
  if (dup && reqGroup && dupGroup !== reqGroup) {
    hints.push(`'${METHOD_GROUP_LABEL[dupGroup] || dupGroup}' 칸에 등록돼 있습니다 (이름은 칸을 합쳐 유일해야 합니다)`)
  }
  if (dup && dup.is_active === 0) hints.push('삭제 처리된 항목에 같은 이름이 남아 있습니다')
  return `'${name}' 은(는) 이미 있는 마감 방식입니다${hints.length ? ' — ' + hints.join(' · ') : ''}`
}

// GET /methods?group=output|transfer (optional filter)
finishingRouter.get('/methods', async (c) => {
  try {
    const group = c.req.query('group')
    let query = 'SELECT id, name, margin_cm, description, sort_order, method_group, pricing_type, unit_price FROM finishing_methods WHERE is_active = 1'
    const params: string[] = []
    if (group) {
      query += ' AND method_group = ?'
      params.push(group)
    }
    query += ' ORDER BY sort_order ASC'
    const { results } = await c.env.DB.prepare(query).bind(...params).all()
    return c.json({ success: true, data: results })
  } catch {
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// POST /methods
finishingRouter.post('/methods', requireRole('ADMIN', 'MANAGER'), async (c) => {
  // name·group 을 try 밖에 둔다 — 충돌 메시지에 쓰는데 c.req.json() 은 두 번 읽을 수 없다
  let name = ''
  let reqGroup = 'output'
  try {
    const body = await c.req.json()
    name = body.name
    const { margin_cm, description, method_group } = body
    reqGroup = method_group || 'output'
    if (!name) return c.json({ success: false, error: '이름 필수' }, 400)
    const r = await c.env.DB.prepare(
      'INSERT INTO finishing_methods (name, margin_cm, description, method_group, sort_order) VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order),0)+1 FROM finishing_methods))'
    ).bind(name, margin_cm || 0, description || null, reqGroup).run()
    return c.json({ success: true, data: { id: r.meta.last_row_id } })
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) {
      return c.json({ success: false, error: await uniqueNameMessage(c.env.DB, name, reqGroup) }, 409)
    }
    console.error('finishing POST /methods error:', e)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// PUT /methods/:id
finishingRouter.put('/methods/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  // 이름 변경도 같은 UNIQUE 를 밟는다 — 추가 경로만 고치면 '수정하다 서버 오류'로 남는다(형제 완전성)
  let name: string | undefined
  let reqGroup: string | null = null
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const { margin_cm, description, method_group } = body
    name = body.name
    if (method_group !== undefined) reqGroup = method_group || 'output'
    const sets: string[] = [], params: any[] = []
    if (name !== undefined) { sets.push('name = ?'); params.push(name) }
    if (margin_cm !== undefined) { sets.push('margin_cm = ?'); params.push(margin_cm) }
    if (description !== undefined) { sets.push('description = ?'); params.push(description) }
    if (method_group !== undefined) { sets.push('method_group = ?'); params.push(method_group) }
    if (!sets.length) return c.json({ success: false, error: '변경 없음' }, 400)
    params.push(parseInt(id))
    await c.env.DB.prepare(`UPDATE finishing_methods SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run()
    return c.json({ success: true })
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) {
      return c.json({ success: false, error: await uniqueNameMessage(c.env.DB, name || '', reqGroup) }, 409)
    }
    console.error('finishing PUT /methods/:id error:', e)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// DELETE /methods/:id
finishingRouter.delete('/methods/:id', requireRole('ADMIN'), async (c) => {
  try {
    await c.env.DB.prepare('UPDATE finishing_methods SET is_active = 0 WHERE id = ?').bind(parseInt(c.req.param('id'))).run()
    return c.json({ success: true })
  } catch {
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// GET /presets?group=output|transfer (optional filter)
finishingRouter.get('/presets', async (c) => {
  try {
    const group = c.req.query('group')
    let query = 'SELECT id, name, config, sort_order, method_group FROM finishing_presets WHERE is_active = 1'
    const params: string[] = []
    if (group) {
      query += ' AND method_group = ?'
      params.push(group)
    }
    query += ' ORDER BY sort_order ASC'
    const { results } = await c.env.DB.prepare(query).bind(...params).all()
    return c.json({ success: true, data: results })
  } catch {
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// POST /presets
finishingRouter.post('/presets', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const { name, config, method_group } = await c.req.json()
    if (!name || !config) return c.json({ success: false, error: '이름과 설정 필수' }, 400)
    const configStr = typeof config === 'string' ? config : JSON.stringify(config)
    const r = await c.env.DB.prepare(
      'INSERT INTO finishing_presets (name, config, method_group, sort_order) VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order),0)+1 FROM finishing_presets))'
    ).bind(name, configStr, method_group || 'output').run()
    return c.json({ success: true, data: { id: r.meta.last_row_id } })
  } catch {
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// PUT /presets/:id
finishingRouter.put('/presets/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const { name, config, method_group } = await c.req.json()
    const sets: string[] = [], params: any[] = []
    if (name !== undefined) { sets.push('name = ?'); params.push(name) }
    if (config !== undefined) { sets.push('config = ?'); params.push(typeof config === 'string' ? config : JSON.stringify(config)) }
    if (method_group !== undefined) { sets.push('method_group = ?'); params.push(method_group) }
    if (!sets.length) return c.json({ success: false, error: '변경 없음' }, 400)
    params.push(parseInt(id))
    await c.env.DB.prepare(`UPDATE finishing_presets SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run()
    return c.json({ success: true })
  } catch {
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// DELETE /presets/:id
finishingRouter.delete('/presets/:id', requireRole('ADMIN'), async (c) => {
  try {
    await c.env.DB.prepare('DELETE FROM finishing_presets WHERE id = ?').bind(parseInt(c.req.param('id'))).run()
    return c.json({ success: true })
  } catch {
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// ── 가공자 ↔ 도메인 매핑 (후가공 프로파일 A1) ──────────────────────────
// CEP 가공자 선택 → 도메인(output/transfer/sign) 자동 판별 → 해당 방식·프리셋만 로드
finishingRouter.get('/worker-domains', async (c) => {
  try {
    // #577 매핑은 worker_name(문자열)으로만 연결되는데, CEP가 실제 작업자를 식별하는 축은
    //   users(role/job_role=DESIGNER)다. 등록 화면이 자유 텍스트라 한 글자만 달라도 매핑이
    //   어긋나고, CEP는 못 찾으면 기본 도메인(현수막)으로 조용히 폴백한다(경고 없음).
    //   → 선택 가능한 가공자 목록을 함께 내려 드롭다운으로 만들고, 목록에 없는 기존 매핑은
    //     화면에서 경고로 드러낸다. 쿼리는 workbench intake-config의 workers와 동일 기준.
    const [mappings, workers] = await Promise.all([
      c.env.DB.prepare('SELECT worker_name, domain FROM designer_worker_domains ORDER BY worker_name').all(),
      c.env.DB.prepare(
        `SELECT id, name FROM users WHERE is_active = 1 AND (role = 'DESIGNER' OR job_role = 'DESIGNER') ORDER BY name`
      ).all<{ id: number; name: string }>(),
    ])
    return c.json({ success: true, data: mappings.results, workers: workers.results || [] })
  } catch {
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// PUT /worker-domains — 매핑 일괄 upsert (body: { mappings: [{worker_name, domain}] })
finishingRouter.put('/worker-domains', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as { mappings?: Array<{ worker_name?: string; domain?: string }> }
    const mappings = Array.isArray(body.mappings) ? body.mappings : []
    let count = 0
    for (const m of mappings) {
      const wn = String(m.worker_name || '').trim()
      if (!wn) continue
      const dom = ['output', 'transfer', 'sign'].includes(String(m.domain)) ? String(m.domain) : 'output'
      await c.env.DB.prepare(
        `INSERT INTO designer_worker_domains (worker_name, domain, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(worker_name) DO UPDATE SET domain = excluded.domain, updated_at = datetime('now')`
      ).bind(wn, dom).run()
      count++
    }
    return c.json({ success: true, data: { count } })
  } catch (e) {
    console.error('finishing PUT /worker-domains error:', e)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

export default finishingRouter
