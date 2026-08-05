import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { getEntityId, entityFilter } from '../utils/entityFilter'

const fixedAssets = new Hono<HonoEnv>()
fixedAssets.use('*', authMiddleware)

// ─── 고정자산 목록 ──────────────────────────────────────────────────────────
fixedAssets.get('/', async (c) => {
  const category = c.req.query('category')
  const status = c.req.query('status')
  // 상각완료(장부가=잔존가액) 자산을 걸러내는 필터. 세무장부는 신고 목적상 끝까지 끌고 가지만,
  //   MES 는 관리회계용이라 상각이 끝난 자산은 부문 손익 기여가 0 이다 — 목록에서 노이즈만 된다.
  //   삭제가 아니라 필터인 이유: 지우면 자산 총계(취득가)가 줄어 보유 현황 파악이 어긋난다.
  const depreciating = c.req.query('depreciating')
  // alias 필수 — equipment JOIN에도 entity_id가 있어 bare `entity_id`는
  //   "ambiguous column name: entity_id"(SQLITE_ERROR)로 목록 전체가 500이었다.
  //   상세(:57)는 이미 'fa'를 쓰고 있어 정상이었다 — 형제 비대칭 (2026-07-29 실측)
  const eFilter = entityFilter(c, 'fa')
  let where = `WHERE 1=1 ${eFilter.clause}`
  const binds: any[] = [...eFilter.params]
  if (category) { where += ' AND fa.category = ?'; binds.push(category) }
  if (status) { where += ' AND fa.status = ?'; binds.push(status) }
  if (depreciating === '1') where += ' AND fa.current_book_value > COALESCE(fa.salvage_value, 0)'

  const { results } = await c.env.DB.prepare(`
    SELECT fa.*, e.name as equipment_name,
      l.creditor as loan_creditor, l.current_balance as loan_balance,
      l.maturity_date as loan_maturity, l.is_active as loan_active,
      dp.name as department_name,
      (SELECT d.depreciation_amount FROM depreciation_records d
        WHERE d.asset_id = fa.id ORDER BY d.period DESC, d.id DESC LIMIT 1) as last_depreciation
    FROM fixed_assets fa
    LEFT JOIN equipment e ON fa.equipment_id = e.id
    LEFT JOIN loans l ON fa.loan_id = l.id
    LEFT JOIN departments dp ON fa.department_id = dp.id
    ${where}
    ORDER BY fa.acquisition_date DESC, fa.id DESC
  `).bind(...binds).all()

  return c.json({ success: true, data: results })
})

// ─── 고정자산 생성 ──────────────────────────────────────────────────────────
fixedAssets.post('/', requireRole('ADMIN', 'MANAGER'), async (c) => {
  const body = await c.req.json()
  const userId = c.get('user')?.id
  const { asset_code, name, category, equipment_id, acquisition_date, acquisition_cost,
    useful_life_months, depreciation_method, salvage_value, location, serial_number, notes, loan_id,
    depreciation_rate, current_book_value } = body

  if (!asset_code || !name || !category || !acquisition_date || !acquisition_cost || !useful_life_months) {
    return c.json({ success: false, error: 'asset_code, name, category, acquisition_date, acquisition_cost, useful_life_months 필수' }, 400)
  }

  const result = await c.env.DB.prepare(`
    INSERT INTO fixed_assets (asset_code, name, category, equipment_id, acquisition_date, acquisition_cost,
      useful_life_months, depreciation_method, salvage_value, current_book_value, location, serial_number, notes, loan_id, depreciation_rate, entity_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    asset_code, name, category, equipment_id || null, acquisition_date, acquisition_cost,
    useful_life_months, depreciation_method || 'STRAIGHT_LINE', salvage_value || 0,
    // 기존 자산을 이관할 땐 전기말 상각누계를 반영한 장부가로 시작한다. 미지정이면 신규 취득 = 취득가
    current_book_value != null ? Number(current_book_value) : acquisition_cost,
    location || null, serial_number || null, notes || null,
    loan_id ? Number(loan_id) : null, depreciation_rate != null ? Number(depreciation_rate) : null,
    getEntityId(c), userId
  ).run()

  return c.json({ success: true, data: { id: result.meta.last_row_id } })
})

// ─── 고정자산 상세 ──────────────────────────────────────────────────────────
fixedAssets.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const eFilter = entityFilter(c, 'fa')
  const asset = await c.env.DB.prepare(`
    SELECT fa.*, e.name as equipment_name,
      l.creditor as loan_creditor, l.loan_number, l.description as loan_description,
      l.current_balance as loan_balance, l.current_rate as loan_rate,
      l.start_date as loan_start, l.maturity_date as loan_maturity, l.is_active as loan_active
    FROM fixed_assets fa
    LEFT JOIN equipment e ON fa.equipment_id = e.id
    LEFT JOIN loans l ON fa.loan_id = l.id
    WHERE fa.id = ? ${eFilter.clause}
  `).bind(id, ...eFilter.params).first()

  const { results: depreciations } = await c.env.DB.prepare(`
    SELECT * FROM depreciation_records WHERE asset_id = ? ORDER BY period DESC, id DESC LIMIT 24
  `).bind(id).all()

  return c.json({ success: true, data: { ...asset, depreciations } })
})

// ─── 부채(대출·리스) 연결 / 해제 ────────────────────────────────────────────
// loan_id = null 이면 해제. 처분(:151)과 같은 소유 검증을 선행한다 —
//   선행 조회 없이 UPDATE 하면 타법인 자산에도 부채가 붙는다.
fixedAssets.patch('/:id/loan', requireRole('ADMIN', 'MANAGER'), async (c) => {
  const id = Number(c.req.param('id'))
  const { loan_id } = await c.req.json()

  const ef = entityFilter(c, 'fa')
  const owned = await c.env.DB.prepare(
    `SELECT fa.id FROM fixed_assets fa WHERE fa.id = ?${ef.clause}`
  ).bind(id, ...ef.params).first()
  if (!owned) return c.json({ success: false, error: '자산을 찾을 수 없습니다.' }, 404)

  let linkId: number | null = null
  if (loan_id !== null && loan_id !== undefined && loan_id !== '') {
    linkId = Number(loan_id)
    // 대출도 같은 법인 것만 — 자산은 동산기획인데 부채는 선명 것을 붙이는 교차연결 차단
    const efl = entityFilter(c, 'l')
    const loan = await c.env.DB.prepare(
      `SELECT l.id FROM loans l WHERE l.id = ?${efl.clause}`
    ).bind(linkId, ...efl.params).first()
    if (!loan) return c.json({ success: false, error: '대출을 찾을 수 없습니다.' }, 404)
  }

  await c.env.DB.prepare(
    `UPDATE fixed_assets SET loan_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(linkId, id).run()

  return c.json({ success: true, data: { id, loan_id: linkId } })
})

// ─── 부문 지정 / 해제 (G3 배부 기준) ────────────────────────────────────────
// 미지정이면 감가상각비가 공통비 풀로 간다 — 부문 손익에서 사라지는 게 아니라 안분된다.
fixedAssets.patch('/:id/department', requireRole('ADMIN', 'MANAGER'), async (c) => {
  const id = Number(c.req.param('id'))
  const { department_id } = await c.req.json()

  const ef = entityFilter(c, 'fa')
  const owned = await c.env.DB.prepare(
    `SELECT fa.id FROM fixed_assets fa WHERE fa.id = ?${ef.clause}`
  ).bind(id, ...ef.params).first()
  if (!owned) return c.json({ success: false, error: '자산을 찾을 수 없습니다.' }, 404)

  let deptId: number | null = null
  if (department_id !== null && department_id !== undefined && department_id !== '') {
    deptId = Number(department_id)
    // departments 에는 entity_id 가 없다(전사 공용) — 존재 여부만 검증한다
    const dept = await c.env.DB.prepare(`SELECT id FROM departments WHERE id = ?`).bind(deptId).first()
    if (!dept) return c.json({ success: false, error: '부문을 찾을 수 없습니다.' }, 404)
  }

  await c.env.DB.prepare(
    `UPDATE fixed_assets SET department_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(deptId, id).run()

  return c.json({ success: true, data: { id, department_id: deptId } })
})

// ─── 감가상각 계산 (월별 일괄) ──────────────────────────────────────────────
fixedAssets.post('/depreciate', requireRole('ADMIN'), async (c) => {
  const { period } = await c.req.json() // YYYY-MM
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return c.json({ success: false, error: 'period (YYYY-MM) 필수' }, 400)
  }

  const eFilter = entityFilter(c)
  const { results: assets } = await c.env.DB.prepare(`
    SELECT * FROM fixed_assets WHERE status = 'IN_USE' ${eFilter.clause}
  `).bind(...eFilter.params).all<any>()

  // #131: entity_id 필터 추가
  const eid = getEntityId(c) || 1
  const { results: existingPeriods } = await c.env.DB.prepare(
    `SELECT asset_id FROM depreciation_records WHERE period = ? AND entity_id = ?`
  ).bind(period, eid).all<{ asset_id: number }>()
  const alreadyProcessed = new Set(existingPeriods.map(r => r.asset_id))

  const { results: latestRecords } = await c.env.DB.prepare(`
    SELECT dr.asset_id, dr.accumulated_depreciation, dr.book_value
    FROM depreciation_records dr
    INNER JOIN (
      SELECT asset_id, MAX(period) as max_period FROM depreciation_records WHERE entity_id = ? GROUP BY asset_id
    ) latest ON dr.asset_id = latest.asset_id AND dr.period = latest.max_period
    WHERE dr.entity_id = ?
  `).bind(eid, eid).all<{ asset_id: number; accumulated_depreciation: number; book_value: number }>()
  const latestMap = new Map(latestRecords.map(r => [r.asset_id, r]))

  // 정률법 기준액 = **연초 미상각잔액**. 세법은 사업연도 단위로
  //   상각액 = 연초 미상각잔액 × 상각률 × (보유월수/12) 를 계산하므로,
  //   같은 해 안에서는 월 상각액이 일정하다. 매월 장부가에 곱하면(월복리) 세무장부와 어긋난다.
  const yearStart = `${period.slice(0, 4)}-01`
  const { results: prevYearEnd } = await c.env.DB.prepare(`
    SELECT dr.asset_id, dr.accumulated_depreciation
    FROM depreciation_records dr
    INNER JOIN (
      SELECT asset_id, MAX(period) as max_period FROM depreciation_records
      WHERE entity_id = ? AND period < ? GROUP BY asset_id
    ) prev ON dr.asset_id = prev.asset_id AND dr.period = prev.max_period
    WHERE dr.entity_id = ?
  `).bind(eid, yearStart, eid).all<{ asset_id: number; accumulated_depreciation: number }>()
  const prevYearMap = new Map(prevYearEnd.map(r => [r.asset_id, r.accumulated_depreciation]))

  const stmts: any[] = []

  for (const asset of assets) {
    if (alreadyProcessed.has(asset.id)) continue

    // 취득월 이전 기간은 상각하지 않는다. 이 가드가 없으면 4월 취득 자산에 1월분을
    //   태울 수 있어(소급 실행 시 실제 발생) 장부가가 취득가보다 과소계상된다.
    //   세법도 월할상각(취득한 달 포함) 기준. (2026-08-04)
    if (String(asset.acquisition_date).slice(0, 7) > period) continue

    const lastRecord = latestMap.get(asset.id)
    const accumulated = lastRecord?.accumulated_depreciation ?? 0
    // ?? 필수 — `||` 면 상각완료(장부가 0) 자산이 취득가로 되살아나 무한 상각된다.
    const bookValue = lastRecord?.book_value ?? asset.current_book_value ?? asset.acquisition_cost

    // 잔존가치 도달 시 스킵
    if (bookValue <= (asset.salvage_value || 0)) continue

    // 월별 감가상각액 계산
    let monthlyDepreciation: number
    if (asset.depreciation_method === 'DECLINING_BALANCE') {
      // 세법 정률법: 연초 미상각잔액 × 연 상각률 ÷ 12 (같은 해 안에서는 정액)
      //   depreciation_rate 는 세무장부 rt_depre(연율, 5년 0.451 · 10년 0.259).
      //   미설정 자산은 종전 이중체감(2/내용연수)으로 폴백 — 세법과 다르니 rate 를 채우는 게 정답이다.
      const rate = asset.depreciation_rate
      if (rate && rate > 0) {
        const openingAcc = prevYearMap.get(asset.id) || 0
        const openingBase = asset.acquisition_cost - openingAcc
        monthlyDepreciation = Math.round(openingBase * rate / 12)
      } else {
        monthlyDepreciation = Math.round(bookValue * (2 / asset.useful_life_months))
      }
    } else {
      // 정액법: (취득가 - 잔존) / 내용연수
      monthlyDepreciation = Math.round((asset.acquisition_cost - (asset.salvage_value || 0)) / asset.useful_life_months)
    }

    // 잔존가치 이하로 내려가지 않도록
    monthlyDepreciation = Math.min(monthlyDepreciation, bookValue - (asset.salvage_value || 0))
    if (monthlyDepreciation <= 0) continue

    const newAccumulated = accumulated + monthlyDepreciation
    const newBookValue = asset.acquisition_cost - newAccumulated

    stmts.push(
      c.env.DB.prepare(`
        INSERT INTO depreciation_records (asset_id, period, depreciation_amount, accumulated_depreciation, book_value, entity_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(asset.id, period, monthlyDepreciation, newAccumulated, newBookValue, eid)
    )
    stmts.push(
      c.env.DB.prepare(`UPDATE fixed_assets SET current_book_value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .bind(newBookValue, asset.id)
    )
  }

  if (stmts.length > 0) await c.env.DB.batch(stmts)

  return c.json({ success: true, data: { processed: Math.floor(stmts.length / 2), period } })
})

// ─── 자산 처분 ──────────────────────────────────────────────────────────────
fixedAssets.patch('/:id/dispose', requireRole('ADMIN'), async (c) => {
  const id = Number(c.req.param('id'))
  const { disposal_amount, disposal_reason } = await c.req.json()

  // 소유 검증 — 목록(:13)과 동일 격리. 선행 조회가 아예 없어 타법인 자산도 처분되던 경로 차단
  //   (2026-07-29 구조감사). ADMIN 전체모드(entityId=0)는 clause가 비므로 종전대로 전 법인 처분 가능.
  const ef = entityFilter(c)
  const owned = await c.env.DB.prepare(
    `SELECT id FROM fixed_assets WHERE id = ?${ef.clause}`
  ).bind(id, ...ef.params).first()
  if (!owned) return c.json({ success: false, error: '자산을 찾을 수 없습니다.' }, 404)

  await c.env.DB.prepare(`
    UPDATE fixed_assets SET status = 'DISPOSED', disposed_at = date('now', '+9 hours'),
      disposal_amount = ?, disposal_reason = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(disposal_amount || 0, disposal_reason || null, id).run()

  return c.json({ success: true })
})

// ─── 자산 요약 보고서 ────────────────────────────────────────────────────────
fixedAssets.get('/report/summary', async (c) => {
  const eFilter = entityFilter(c)
  const { results } = await c.env.DB.prepare(`
    SELECT category,
      COUNT(*) as count,
      ROUND(SUM(acquisition_cost), 0) as total_acquisition,
      ROUND(SUM(current_book_value), 0) as total_book_value,
      ROUND(SUM(acquisition_cost) - SUM(current_book_value), 0) as total_depreciation
    FROM fixed_assets fa
    WHERE fa.status = 'IN_USE' ${eFilter.clause}
    GROUP BY category
    ORDER BY total_acquisition DESC
  `).bind(...eFilter.params).all()

  return c.json({ success: true, data: results })
})

export default fixedAssets
