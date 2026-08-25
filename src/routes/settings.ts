import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { getEntityId } from '../utils/entityFilter'
import { getCreditPolicy, buildCreditEvalSql, CREDIT_POLICY_DEFAULTS } from './ledger/credit-helpers'

const settingsRouter = new Hono<HonoEnv>()
settingsRouter.use('/*', authMiddleware)

// GET /api/settings/data-completeness — 데이터 완결성 구간 (전 역할 조회 가능)
//
// 왜 있나: 이카운트 병행 기간에는 주문이 MES 에 **일부만** 들어온다. 그런데 매출·미수금·부문손익은
//   그대로 계산돼 화면에 뜬다 — 에러 없이 **작은 숫자가 조용히** 표시된다. 그걸 보고 판단하면 사고다.
//   `data_complete_through` 이후 구간을 조회할 때만 화면이 경고하게 한다.
//   전환이 끝나면 이 값을 오늘 날짜로 밀면 경고가 저절로 사라진다(코드 수정 불요).
// 역할 게이트를 두지 않는다 — 경고는 숨길수록 위험하다. 값도 날짜 하나라 민감정보가 아니다.
settingsRouter.get('/data-completeness', async (c) => {
  try {
    const row = await c.env.DB.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'data_complete_through'`
    ).first<{ setting_value: string }>()
    const through = (row?.setting_value || '').trim() || null
    return c.json({ success: true, data: { complete_through: through, in_parallel: !!through } })
  } catch (error) {
    console.error('src/routes/settings.ts data-completeness error:', error)
    // 조회 실패가 화면을 막으면 안 된다 — 경고 없이 진행(설정 미도입과 같은 상태)
    return c.json({ success: true, data: { complete_through: null, in_parallel: false } })
  }
})

// GET /api/settings - 전체 설정 조회 (MANAGER+)
settingsRouter.get('/', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT setting_key, setting_value FROM settings'
    ).all()

    const settingsMap: Record<string, string> = {}
    for (const row of results as any[]) {
      settingsMap[row.setting_key] = row.setting_value || ''
    }

    // 바로빌 CERT_KEY 설정 여부 (실제 값은 노출하지 않음)
    settingsMap['tax_secret_key_configured'] = (c.env.BAROBILL_CERT_KEY || c.env.BAROBILL_CERT_KEY_PROD) ? '1' : ''

    return c.json({ success: true, data: settingsMap })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// PATCH /api/settings - 설정 업데이트 (ADMIN)
settingsRouter.patch('/', requireRole('ADMIN'), async (c) => {
  try {
    const { settings } = await c.req.json<{ settings: Record<string, string> }>()

    const stmts = Object.entries(settings).map(([key, value]) =>
      c.env.DB.prepare(
        `INSERT INTO settings (setting_key, setting_value, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP`
      ).bind(key, value)
    )
    await c.env.DB.batch(stmts)

    return c.json({ success: true, message: '설정이 저장되었습니다.' })
  } catch (error) {
    console.error('src/routes/settings.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ── 현재 법인 정보 조회 (entities 테이블) ──
settingsRouter.get('/entity', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const entityId = getEntityId(c)
    if (!entityId || entityId === 0) {
      return c.json({ success: false, error: '법인을 선택해주세요.' }, 400)
    }
    const entity = await c.env.DB.prepare(
      'SELECT id, name, short_name, business_reg_no, representative, business_type, business_item, address, phone, fax, email, tax_email, popbill_corp_num, bank_info, stamp_base64, logo_base64, email_from_address, email_from_name, is_active, sort_order, created_at FROM entities WHERE id = ?'
    ).bind(entityId).first()
    if (!entity) {
      return c.json({ success: false, error: '법인을 찾을 수 없습니다.' }, 404)
    }
    return c.json({ success: true, data: entity })
  } catch (error) {
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── 현재 법인 정보 수정 ──
settingsRouter.patch('/entity', requireRole('ADMIN'), async (c) => {
  try {
    const entityId = getEntityId(c)
    if (!entityId || entityId === 0) {
      return c.json({ success: false, error: '법인을 선택해주세요.' }, 400)
    }
    const body = await c.req.json()
    // 인감 이미지 크기 제한 (~150KB)
    if (body.stamp_base64 && body.stamp_base64.length > 200000) {
      return c.json({ success: false, error: '인감 이미지가 너무 큽니다. 150KB 이하로 줄여주세요.' }, 400)
    }
    const ALLOWED = [
      'name', 'short_name', 'business_reg_no', 'representative',
      'business_type', 'business_item', 'address', 'phone', 'fax', 'email',
      'tax_email', 'popbill_corp_num', 'bank_info', 'stamp_base64',
      // Phase 1.2: entity별 이메일 발신 설정
      'email_from_address', 'email_from_name'
    ]
    const updates: string[] = []
    const params: any[] = []
    for (const key of ALLOWED) {
      if (key in body) {
        updates.push(`${key} = ?`)
        params.push(body[key] ?? null)
      }
    }
    if (updates.length === 0) {
      return c.json({ success: false, error: '수정할 항목이 없습니다.' }, 400)
    }
    params.push(entityId)
    await c.env.DB.prepare(
      `UPDATE entities SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...params).run()

    const updated = await c.env.DB.prepare(
      'SELECT id, name, short_name, business_reg_no, representative, business_type, business_item, address, phone, fax, email, tax_email, popbill_corp_num, bank_info, stamp_base64, logo_base64, email_from_address, email_from_name, is_active, sort_order, created_at FROM entities WHERE id = ?'
    ).bind(entityId).first()
    return c.json({ success: true, data: updated })
  } catch (error) {
    console.error('PATCH /api/settings/entity error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── 여신 정책 (credit policy) ──
//
// 값 자체는 settings KV 라 제네릭 `GET/PATCH /api/settings` 로 읽고 쓴다. 이 엔드포인트는 **영향 시뮬레이션** 전용:
//   배수를 2로 할지 3으로 할지는 "몇 곳이 걸리는가"를 봐야 정할 수 있는데, 그걸 모르면 설정이 추측이 된다.
// ⚠️ 전 거래처 집계라 무겁다 — **ADMIN 수동 호출 전용**. 폴링·뱃지·대시보드 카드에 붙이지 말 것
//    (memory `design-nav-badge-cost-guard`: 폴링 × 무거운 집계가 월 $99 과금을 낸 전례).
settingsRouter.get('/credit-policy', requireRole('ADMIN'), async (c) => {
  try {
    const policy = await getCreditPolicy(c)
    // 저장 전 미리보기 — ?multiplier=3 처럼 후보값을 얹어 시뮬레이션할 수 있다.
    const q = c.req.query()
    const ov = (v: string | undefined, base: number, min: number, max: number) => {
      const n = Number(v)
      return Number.isFinite(n) && n >= min && n <= max ? n : base
    }
    const sim = {
      multiplier: ov(q.multiplier, policy.multiplier, 0.1, 100),
      months: Math.round(ov(q.months, policy.months, 1, 24)),
      floor: ov(q.floor, policy.floor, 0, 1_000_000_000),
      cap: ov(q.cap, policy.cap, 1, 100_000_000_000),
      warnRatio: ov(q.warn_ratio, policy.warnRatio, 0.1, 1),
    }

    // 판정식은 credit-helpers 가 정본 — 여기서 복제하지 않는다(연체 알림 배치와 같은 SQL 을 쓴다).
    //
    // ⚠️ 경고비율을 `?` 로 바인딩하지 말 것 — SQLite 는 `?` 를 **SQL 텍스트에 나온 순서**로 채우는데,
    //    이 자리(바깥 SELECT 목록)는 서브쿼리 `(${sql})` 보다 **앞**이라 buildCreditEvalSql 의 파라미터가
    //    통째로 한 칸씩 밀린다. 2026-08-25 실측 사고: entity 필터 자리에 months(6)가 들어가
    //    `a.entity_id = 6` 이 되면서 adjustments 가 통째로 빠졌다 → 초과 37곳이 **108곳**으로, 3.55억이 5.52억으로.
    //    warnRatio 는 위 ov() 에서 0.1~1 숫자로 검증됐으므로 인라인이 안전하다(months 를 인라인하는 이유와 같다).
    const { sql, params } = buildCreditEvalSql(c, sim)
    const row = await c.env.DB.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN lim >= 0 AND balance >= lim THEN 1 ELSE 0 END) AS exceeded,
              SUM(CASE WHEN lim >= 0 AND balance < lim AND balance >= lim * ${sim.warnRatio} THEN 1 ELSE 0 END) AS warning,
              CAST(SUM(CASE WHEN lim >= 0 AND balance >= lim THEN balance ELSE 0 END) AS INT) AS exceeded_balance,
              SUM(CASE WHEN credit_hold = 1 THEN 1 ELSE 0 END) AS held,
              SUM(CASE WHEN lim < 0 THEN 1 ELSE 0 END) AS unlimited
         FROM (${sql})`
    ).bind(
      ...params
    ).first<{ total: number; exceeded: number; warning: number; exceeded_balance: number; held: number; unlimited: number }>()

    return c.json({
      success: true,
      data: {
        saved: policy,
        simulated: sim,
        defaults: CREDIT_POLICY_DEFAULTS,
        impact: {
          total: Number(row?.total) || 0,
          exceeded: Number(row?.exceeded) || 0,
          warning: Number(row?.warning) || 0,
          exceeded_balance: Number(row?.exceeded_balance) || 0,
          held: Number(row?.held) || 0,
          unlimited: Number(row?.unlimited) || 0,
        },
      },
    })
  } catch (error) {
    console.error('src/routes/settings.ts credit-policy error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── 원가 기준 (cost_standards) CRUD ──

// GET /api/settings/cost-standards - 전체 원가 기준 조회
settingsRouter.get('/cost-standards', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT id, category_name, media_cost_per_sqm, ink_cost_per_sqm, description, updated_at FROM cost_standards ORDER BY category_name'
    ).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/settings.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PUT /api/settings/cost-standards - 원가 기준 일괄 저장 (upsert)
settingsRouter.put('/cost-standards', requireRole('ADMIN'), async (c) => {
  try {
    const { standards } = await c.req.json<{ standards: Array<{ category_name: string, media_cost_per_sqm: number, ink_cost_per_sqm: number, description?: string }> }>()

    if (!standards || !Array.isArray(standards)) {
      return c.json({ success: false, error: '잘못된 요청입니다.' }, 400)
    }

    const stmt = c.env.DB.prepare(`
      INSERT INTO cost_standards (category_name, media_cost_per_sqm, ink_cost_per_sqm, description, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(category_name) DO UPDATE SET
        media_cost_per_sqm = excluded.media_cost_per_sqm,
        ink_cost_per_sqm = excluded.ink_cost_per_sqm,
        description = excluded.description,
        updated_at = CURRENT_TIMESTAMP
    `)

    const batch = standards.map(s =>
      stmt.bind(s.category_name, s.media_cost_per_sqm || 0, s.ink_cost_per_sqm || 0, s.description || null)
    )
    await c.env.DB.batch(batch)

    return c.json({ success: true, message: '원가 기준이 저장되었습니다.' })
  } catch (error) {
    console.error('src/routes/settings.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// DELETE /api/settings/cost-standards/:id - 원가 기준 삭제
settingsRouter.delete('/cost-standards/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    await c.env.DB.prepare('DELETE FROM cost_standards WHERE id = ?').bind(id).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/settings.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// POST /api/settings/barobill-test — 바로빌 연결 테스트
// ============================================================================
settingsRouter.post('/barobill-test', requireRole('ADMIN'), async (c) => {
  try {
    const { barobillPing, getBarobillBalance } = await import('../services/barobillClient')

    const certKey = c.env.BAROBILL_CERT_KEY
    if (!certKey) {
      return c.json({ success: false, error: 'BAROBILL_CERT_KEY 환경변수가 설정되지 않았습니다' }, 400)
    }

    // body 또는 DB에서 사업자번호
    const body = await c.req.json().catch(() => ({})) as { corpNum?: string }
    let corpNum = (body.corpNum || '').replace(/-/g, '')
    if (!corpNum) {
      const row = await c.env.DB.prepare(
        "SELECT setting_value FROM settings WHERE setting_key = 'company_business_registration_number'"
      ).first<{ setting_value: string }>()
      corpNum = (row?.setting_value || '').replace(/-/g, '')
    }
    if (!corpNum || corpNum.length !== 10) {
      return c.json({ success: false, error: '사업자등록번호를 입력하세요 (body.corpNum 또는 설정에 등록)' }, 400)
    }

    const config = { certKey, corpNum, isTest: true }

    // Ping 테스트
    const pingResult = await barobillPing(config, 'TI')

    // 잔액 조회
    let balance: number | null = null
    try {
      balance = await getBarobillBalance(config)
    } catch (_) { /* 잔액 조회 실패해도 ping 성공이면 OK */ }

    return c.json({
      success: true,
      data: {
        ping: pingResult,
        balance,
        testMode: true,
        corpNum,
      },
      message: '바로빌 테스트 연결 성공'
    })
  } catch (error: any) {
    console.error('Barobill test error:', error)
    return c.json({
      success: false,
      error: `바로빌 연결 실패: ${error.message}`,
    }, 500)
  }
})

export default settingsRouter