import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { getWriteEntityId, entityFilter } from '../utils/entityFilter'

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

  // #595: 명시 바인드가 `NOT NULL DEFAULT 1` 을 덮으므로 전체모드(0)를 그대로 넣으면
  //   entity_id=0 자산이 생겨 특정법인 세션에서 **영구히 안 보인다**(0-sentinel, #487 동종).
  //   `getEntityId(c) || 1` 은 전체모드 쓰기를 조용히 동산(1)에 귀속시키는 함정이라
  //   utils/entityFilter.ts 가 이미 경고해 둔 패턴 → 전용 헬퍼로 400 처리한다.
  const eid = getWriteEntityId(c)
  if (eid == null) {
    return c.json({ success: false, error: '법인을 선택한 뒤 등록하세요. 전체모드에서는 자산의 소속 법인을 결정할 수 없습니다.' }, 400)
  }

  // #595: 생성 시점에도 PATCH /:id/loan 과 같은 교차법인 검증을 건다.
  //   등록 모달의 '연결 부채' select 가 loan_id 를 body 로 실어 보내는 정상 경로이므로,
  //   여기가 뚫려 있으면 PATCH 가 막으려던 교차연결이 생성 한 번으로 그대로 성립한다.
  if (loan_id) {
    const efl = entityFilter(c, 'l')
    const loan = await c.env.DB.prepare(
      `SELECT l.id FROM loans l WHERE l.id = ?${efl.clause}`
    ).bind(Number(loan_id), ...efl.params).first()
    if (!loan) return c.json({ success: false, error: '대출을 찾을 수 없습니다.' }, 404)
  }
  // 같은 클래스의 형제 — 장비도 법인 소속이 있다(equipment.entity_id)
  if (equipment_id) {
    const efe = entityFilter(c, 'e')
    const eq = await c.env.DB.prepare(
      `SELECT e.id FROM equipment e WHERE e.id = ?${efe.clause}`
    ).bind(equipment_id, ...efe.params).first()
    if (!eq) return c.json({ success: false, error: '장비를 찾을 수 없습니다.' }, 404)
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
    eid, userId
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

  // #594: 이력 조회는 asset_id 만으로 매칭한다.
  //   asset_id 가 이미 자산(=법인)을 유일하게 결정하므로 entity_id 재필터는 불필요하고,
  //   ADMIN 전체모드에서는 **유해**하다 — 위 SELECT 가 전 법인 자산을 가져오는데
  //   이력만 세션 법인(=전체모드면 1)으로 필터하면 타법인 자산의 지난달 누계를 못 찾아
  //   accumulated_depreciation 이 0 에서 재시작되고 감사추적이 끊긴다.
  const { results: existingPeriods } = await c.env.DB.prepare(
    `SELECT asset_id FROM depreciation_records WHERE period = ?`
  ).bind(period).all<{ asset_id: number }>()
  const alreadyProcessed = new Set(existingPeriods.map(r => r.asset_id))

  const { results: latestRecords } = await c.env.DB.prepare(`
    SELECT dr.asset_id, dr.accumulated_depreciation, dr.book_value
    FROM depreciation_records dr
    INNER JOIN (
      SELECT asset_id, MAX(period) as max_period FROM depreciation_records GROUP BY asset_id
    ) latest ON dr.asset_id = latest.asset_id AND dr.period = latest.max_period
  `).all<{ asset_id: number; accumulated_depreciation: number; book_value: number }>()
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
      WHERE period < ? GROUP BY asset_id
    ) prev ON dr.asset_id = prev.asset_id AND dr.period = prev.max_period
  `).bind(yearStart).all<{ asset_id: number; accumulated_depreciation: number }>()
  const prevYearMap = new Map(prevYearEnd.map(r => [r.asset_id, r.accumulated_depreciation]))

  // 전년도 기록이 아예 없는 자산의 연초 누계 폴백.
  //   이관 자산은 2026-01 부터 적재돼 `period < '2026-01'` 이 0건이라 위 맵이 통째로 비고,
  //   openingAcc=0 → 상각 기준액이 **미상각잔액이 아니라 취득가**가 된다(월 1,020만 과대).
  //   당해연도 첫 기록의 (누계 - 당월액) = 연초 누계 이므로 여기서 정확히 복원한다.
  const { results: yearOpen } = await c.env.DB.prepare(`
    SELECT dr.asset_id, dr.accumulated_depreciation - dr.depreciation_amount AS opening
    FROM depreciation_records dr
    INNER JOIN (
      SELECT asset_id, MIN(period) as min_period FROM depreciation_records
      WHERE period >= ? AND period <= ? GROUP BY asset_id
    ) f ON dr.asset_id = f.asset_id AND dr.period = f.min_period
  `).bind(yearStart, period).all<{ asset_id: number; opening: number }>()
  for (const r of yearOpen) {
    if (!prevYearMap.has(r.asset_id)) prevYearMap.set(r.asset_id, r.opening)
  }

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

    const salvage = asset.salvage_value || 0
    // 잔존가치 도달 시 스킵
    if (bookValue <= salvage) continue

    // 내용연수 만료 사업연도인가. 취득월 포함으로 세므로 마지막 달 = 취득월 + 내용연수 - 1.
    //   Date 파싱은 UTC 로 밀려 월이 어긋나므로 문자열 산술로 계산한다.
    const acqY = Number(String(asset.acquisition_date).slice(0, 4))
    const acqM = Number(String(asset.acquisition_date).slice(5, 7))
    const expiryYear = Math.floor((acqY * 12 + (acqM - 1) + asset.useful_life_months - 1) / 12)
    // `>=` 다 — 임의상각으로 만료 연도를 넘겨 잔액이 남은 자산도 그 다음 해에 털어야 한다.
    const expired = Number(period.slice(0, 4)) >= expiryYear

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
        monthlyDepreciation = expired
          // 내용연수가 끝나는 사업연도엔 미상각잔액을 비망가액만 남기고 **전액** 턴다(세법).
          //   정률법은 원리상 0 에 도달하지 않으므로 이 규칙이 없으면 영원히 상각이 끝나지 않는다.
          //   연 합계를 세무장부와 맞추되 특정 달에 몰아 손익이 튀지 않도록 **남은 달로 균등 배분**한다.
          //   (당해연도 기계상액을 빼므로 규칙이 연중에 켜져도 연 합계는 정확히 일치한다)
          ? Math.round(
              Math.max(0, (openingBase - salvage) - (accumulated - openingAcc)) /
              Math.max(1, 12 - Number(period.slice(5, 7)) + 1)
            )
          : Math.round(openingBase * rate / 12)
      } else {
        monthlyDepreciation = Math.round(bookValue * (2 / asset.useful_life_months))
      }
    } else {
      // 정액법: (취득가 - 잔존) / 내용연수
      monthlyDepreciation = Math.round((asset.acquisition_cost - salvage) / asset.useful_life_months)
    }

    // 잔존가치 이하로 내려가지 않도록
    monthlyDepreciation = Math.min(monthlyDepreciation, bookValue - salvage)
    if (monthlyDepreciation <= 0) continue

    const newAccumulated = accumulated + monthlyDepreciation
    const newBookValue = asset.acquisition_cost - newAccumulated

    stmts.push(
      c.env.DB.prepare(`
        INSERT INTO depreciation_records (asset_id, period, depreciation_amount, accumulated_depreciation, book_value, entity_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(asset.id, period, monthlyDepreciation, newAccumulated, newBookValue,
        // #594: 세션 법인이 아니라 **자산이 속한 법인**으로 기록한다.
        //   전체모드에서 세션값(0→1)을 쓰면 선명 자산의 상각이 동산 원장에 섞인다.
        asset.entity_id || 1)
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
