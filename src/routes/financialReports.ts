// 재무제표 (간이 손익계산서) — 기존 데이터로 집계
// 매출=청구그룹(billed) · 매출원가=매입(전표) · 판관비=통장·카드 계정분류(정본) 로 산출
import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { entityFilter, getEntityId } from '../utils/entityFilter'
import { LATEST_BALANCE_SUBQUERY, NOT_PERSONAL_ACCOUNT } from '../utils/bankBalance'
import { excludePurchaseNonCounterpartiesSql, INTERNAL_ENTITY_CLIENT_IDS } from '../constants/intercompany'
import { excludeArExcludedClientsSql } from '../constants/arPolicy'
import { kstYear } from '../utils/kstDate'
import { deriveArSplit } from './ledger/ar-helpers'
import { cardNetAmountSql, cardSpendFilterSql } from '../utils/cardSpend'

// ── Row types for D1 queries ──
interface ApRow { payable: number; prepaid: number; prepaid_suppliers: number }
interface InventoryRow { total_inventory: number }
interface BankRow { total_bank: number }
interface LoanRow { total_loan: number }

const financialReportsRouter = new Hono<HonoEnv>()
financialReportsRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))

// ============================================================
// 손익계산서 (P&L) — 판관비 정본 기반 재설계 (2026-08-24)
//
// 정본 = scripts/finance-diagnose.cjs (2026-08-14 개정 · 판관비=통장·카드 계정분류) 의 웹 포트.
//   구방식(payment_requests+payroll_slips+fixed_expenses, order_costs `.catch` 0 폴백)은
//   통장 비용이 통째로 빠지고 없는 테이블이 0 으로 삼켜져 영업이익이 구조적으로 과대였다.
// ★재고증감은 실사 앵커 없이는 미반영(기말=기초 가정) — caveats 로 명시한다.
// ★법인 스코프: entityId=0(전체) → 그룹 연결(내부거래 양변 제거) · 개별 법인 → 별도 기준(내부 포함 표시).
// ============================================================

// ⚠️ CAT_ROLE 은 scripts/finance-diagnose.cjs 와 사본 쌍 — 한쪽을 바꾸면 반드시 같이 바꾼다.
//   NOT_EXPENSE = 돈은 나가지만 비용이 아닌 현금흐름(부채 상환·예수금·자산 취득·리스료=차입 원금).
const CAT_ROLE: Record<string, string[]> = {
  COGS: ['원재료비', '외주가공비'],
  NONOP: ['이자비용', '기부금'],
  TAX: ['법인세'],
  NOT_EXPENSE: ['대출상환', '대출금', '부가세', '가수금', '가지급금', '보증금(자산)', '고정자산취득', '리스료'],
}
function roleOf(nm: string): string {
  for (const [role, names] of Object.entries(CAT_ROLE)) if (names.includes(nm)) return role
  return 'SGA'
}
const ymdCompact = (s: string) => s.replace(/-/g, '')   // bank/card transaction_date = YYYYMMDD 문자열

interface KvRow { v: number; cnt?: number }
interface CatRow { nm: string; cnt: number; amt: number; month?: string }
interface CovRow { badv: number }

/** 법인 1개의 손익 원자료 (기간 range). monthly=true 면 월 축 포함 rows 반환용 쿼리로 바뀐다. */
async function fetchEntityPnl(db: D1Database, E: number, from: string, to: string) {
  const internal = INTERNAL_ENTITY_CLIENT_IDS.join(',')
  const bFrom = ymdCompact(from), bTo = ymdCompact(to)
  const [sales, salesInt, purch, purchInt, equip, dep, expBank, expCard, covBank, covCard] = await Promise.all([
    db.prepare(`SELECT CAST(COALESCE(SUM(g.billed_amount),0) AS INT) v, COUNT(DISTINCT g.order_id) cnt
      FROM order_billing_groups g JOIN orders o ON o.id=g.order_id
      WHERE g.billing_status='BILLED' AND o.status!='CANCELLED' AND g.entity_id=?
        AND date(COALESCE(g.accounting_date,g.billed_at)) BETWEEN ? AND ?`).bind(E, from, to).first<KvRow>(),
    db.prepare(`SELECT CAST(COALESCE(SUM(g.billed_amount),0) AS INT) v
      FROM order_billing_groups g JOIN orders o ON o.id=g.order_id
      WHERE g.billing_status='BILLED' AND o.status!='CANCELLED' AND g.entity_id=?
        AND o.client_id IN (${internal})
        AND date(COALESCE(g.accounting_date,g.billed_at)) BETWEEN ? AND ?`).bind(E, from, to).first<KvRow>(),
    db.prepare(`SELECT CAST(COALESCE(SUM(final_amount),0) AS INT) v, COUNT(*) cnt
      FROM purchase_orders WHERE entity_id=? AND status NOT IN ('DRAFT','CANCELLED')
        AND date(order_date) BETWEEN ? AND ? AND po_number NOT LIKE '%-OPEN%'`).bind(E, from, to).first<KvRow>(),
    db.prepare(`SELECT CAST(COALESCE(SUM(final_amount),0) AS INT) v
      FROM purchase_orders WHERE entity_id=? AND status NOT IN ('DRAFT','CANCELLED')
        AND supplier_id IN (${internal})
        AND date(order_date) BETWEEN ? AND ? AND po_number NOT LIKE '%-OPEN%'`).bind(E, from, to).first<KvRow>(),
    // ★장비 취득은 매출원가가 아니라 자산(감가상각으로 비용화) — 동산(e1)만. 선명은 장비를 사서 판다(상품)
    E === 1
      ? db.prepare(`SELECT CAST(COALESCE(SUM(poi.amount),0) AS INT) v
          FROM purchase_order_items poi JOIN purchase_orders po ON po.id=poi.po_id JOIN items i ON i.id=poi.item_id
          WHERE po.entity_id=1 AND po.status NOT IN ('DRAFT','CANCELLED')
            AND date(po.order_date) BETWEEN ? AND ? AND po.po_number NOT LIKE '%-OPEN%'
            AND i.item_code LIKE 'GDS-EQ-%'`).bind(from, to).first<KvRow>()
      : Promise.resolve({ v: 0 } as KvRow),
    db.prepare(`SELECT CAST(COALESCE(SUM(depreciation_amount),0) AS INT) v
      FROM depreciation_records WHERE entity_id=?
        AND substr(period,1,7) BETWEEN substr(?,1,7) AND substr(?,1,7)`).bind(E, from, to).first<KvRow>(),
    db.prepare(`SELECT ec.name nm, COUNT(*) cnt, CAST(SUM(bt.amount) AS INT) amt
      FROM bank_transactions bt
      JOIN bank_accounts ba ON ba.id=bt.bank_account_id
      JOIN expense_categories ec ON ec.id=bt.matched_category_id
      WHERE ba.entity_id=? AND COALESCE(ba.is_personal,0)=0 AND bt.transaction_type='WITHDRAWAL'
        AND bt.transaction_date BETWEEN ? AND ?
      GROUP BY ec.name`).bind(E, bFrom, bTo).all<CatRow>(),
    // 카드 판관비 = 순지출 정본(utils/cardSpend): 취소 차감 + 상계쌍·가승인 제외.
    //   is_offset 만 걸면 상계 실패한 취소(±30일 밖·가맹점명 상이·부분취소)가 +로 합산돼 판관비가 과대.
    db.prepare(`SELECT ec.name nm, COUNT(*) cnt, CAST(SUM(${cardNetAmountSql('t')}) AS INT) amt
      FROM card_transactions t
      JOIN corporate_cards cc ON cc.id=t.card_id
      JOIN expense_categories ec ON ec.id=t.category_id
      WHERE cc.entity_id=?${cardSpendFilterSql('t')}
        AND t.transaction_date BETWEEN ? AND ?
      GROUP BY ec.name`).bind(E, bFrom, bTo).all<CatRow>(),
    // 커버리지 — 미분류(계정도 거래처도 없음)는 판관비에서 빠져 있다 = 판관비 과소 경고용
    db.prepare(`SELECT CAST(COALESCE(SUM(CASE WHEN bt.matched_category_id IS NULL AND bt.matched_client_id IS NULL
                     AND bt.transfer_pair_id IS NULL AND bt.match_status <> 'IGNORED' THEN bt.amount ELSE 0 END),0) AS INT) badv
      FROM bank_transactions bt JOIN bank_accounts ba ON ba.id=bt.bank_account_id
      WHERE ba.entity_id=? AND COALESCE(ba.is_personal,0)=0 AND bt.transaction_type='WITHDRAWAL'
        AND bt.transaction_date BETWEEN ? AND ?`).bind(E, bFrom, bTo).first<CovRow>(),
    db.prepare(`SELECT CAST(COALESCE(SUM(CASE WHEN t.category_id IS NULL THEN t.amount ELSE 0 END),0) AS INT) badv
      FROM card_transactions t JOIN corporate_cards cc ON cc.id=t.card_id
      WHERE cc.entity_id=? AND COALESCE(t.is_offset,0)=0
        AND t.transaction_date BETWEEN ? AND ?`).bind(E, bFrom, bTo).first<CovRow>(),
  ])

  // 계정 rows 합치기 (bank+card 같은 계정 합산)
  const catMap = new Map<string, { name: string; role: string; amount: number; count: number }>()
  for (const r of [...(expBank?.results || []), ...(expCard?.results || [])]) {
    if (!r || !r.nm) continue
    const e = catMap.get(r.nm) || { name: r.nm, role: roleOf(r.nm), amount: 0, count: 0 }
    e.amount += Number(r.amt) || 0
    e.count += Number(r.cnt) || 0
    catMap.set(r.nm, e)
  }
  const cats = [...catMap.values()]
  const sumRole = (role: string) => cats.filter(cEnt => cEnt.role === role).reduce((a, cEnt) => a + cEnt.amount, 0)

  return {
    sales: Number(sales?.v) || 0, sales_count: Number(sales?.cnt) || 0,
    sales_internal: Number(salesInt?.v) || 0,
    purchase: Number(purch?.v) || 0,
    purchase_internal: Number(purchInt?.v) || 0,
    purchase_equip: Number(equip?.v) || 0,
    depreciation: Number(dep?.v) || 0,
    cogs_direct: sumRole('COGS'), sga: sumRole('SGA'), nonop: sumRole('NONOP'), tax: sumRole('TAX'),
    unclassified: (Number(covBank?.badv) || 0) + (Number(covCard?.badv) || 0),
    cats,
  }
}

financialReportsRouter.get('/pnl', async (c) => {
  try {
    const from = c.req.query('from') || `${kstYear()}-01-01`
    const to = c.req.query('to') || new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
    const entityId = getEntityId(c)
    const scope = entityId > 0 ? 'ENTITY' : 'GROUP'
    const entities = entityId > 0 ? [entityId] : [1, 2, 3]

    const parts = await Promise.all(entities.map(E => fetchEntityPnl(c.env.DB, E, from, to)))
    const S = (k: 'sales' | 'sales_internal' | 'purchase' | 'purchase_internal' | 'purchase_equip' | 'depreciation' | 'cogs_direct' | 'sga' | 'nonop' | 'tax' | 'unclassified' | 'sales_count') =>
      parts.reduce((a, pEnt) => a + (pEnt[k] as number), 0)

    // 그룹=내부거래 양변 제거 · 별도=내부 포함(금액만 표시)
    const removeInternal = scope === 'GROUP'
    const revenue = S('sales') - (removeInternal ? S('sales_internal') : 0)
    const purchase = S('purchase') - (removeInternal ? S('purchase_internal') : 0)
    const equip = S('purchase_equip')
    const cogsDirect = S('cogs_direct')
    const cogs = purchase - equip + cogsDirect          // 재고증감 미반영(실사 앵커 없음)
    const depreciation = S('depreciation')
    const sga = S('sga') + depreciation
    const grossProfit = revenue - cogs
    const operatingProfit = grossProfit - sga
    const nonop = S('nonop'), tax = S('tax')
    const netProfit = operatingProfit - nonop - tax
    const pct = (v: number) => revenue > 0 ? +((v / revenue) * 100).toFixed(1) : 0

    // 판관비 계정 상세 (전 법인 합산, SGA 내림차순)
    const sgaMap = new Map<string, { name: string; amount: number; count: number }>()
    for (const pEnt of parts) for (const cat of pEnt.cats) {
      if (cat.role !== 'SGA') continue
      const e = sgaMap.get(cat.name) || { name: cat.name, amount: 0, count: 0 }
      e.amount += cat.amount; e.count += cat.count
      sgaMap.set(cat.name, e)
    }
    const sgaCategories = [...sgaMap.values()].sort((a, b) => b.amount - a.amount)

    return c.json({
      success: true,
      data: {
        period: { from, to },
        scope, entity_id: entityId,
        revenue: { total: revenue, order_count: S('sales_count'), internal_removed: removeInternal ? S('sales_internal') : 0, internal_included: removeInternal ? 0 : S('sales_internal') },
        cogs: {
          total: cogs, purchase, purchase_internal_removed: removeInternal ? S('purchase_internal') : 0,
          equip_excluded: equip, direct: cogsDirect,
          margin_pct: pct(cogs),
        },
        gross_profit: { total: grossProfit, margin_pct: pct(grossProfit) },
        operating_expense: { total: sga, categories_total: S('sga'), depreciation },
        operating_profit: { total: operatingProfit, margin_pct: pct(operatingProfit) },
        non_operating: { total: nonop },
        tax: { total: tax },
        net_profit: { total: netProfit, margin_pct: pct(netProfit) },
        sga_categories: sgaCategories,
        caveats: {
          stock_change_unreflected: true,               // 실사 앵커 없음 — 재고 증감 0 취급
          unclassified_amount: S('unclassified'),       // 미분류 출금·카드 = 판관비 과소분
          interest_understated: true,                   // 통장 「대출상환」 혼입 이자는 여기 없음
        },
      },
    })
  } catch (error) {
    console.error('financial pnl error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================
// 월별 손익 추이 — 같은 정본 공식의 월 축 (재고증감 미반영 동일)
// GET /pnl/monthly?year=
// ============================================================
interface MonthValRow { m: string; v: number }
interface MonthCatRow { m: string; nm: string; amt: number }

async function fetchEntityMonthly(db: D1Database, E: number, year: number) {
  const internal = INTERNAL_ENTITY_CLIENT_IDS.join(',')
  const y = String(year)
  const [sales, salesInt, purch, purchInt, equip, dep, expBank, expCard] = await Promise.all([
    db.prepare(`SELECT strftime('%m', COALESCE(g.accounting_date,g.billed_at)) m, CAST(COALESCE(SUM(g.billed_amount),0) AS INT) v
      FROM order_billing_groups g JOIN orders o ON o.id=g.order_id
      WHERE g.billing_status='BILLED' AND o.status!='CANCELLED' AND g.entity_id=?
        AND strftime('%Y', COALESCE(g.accounting_date,g.billed_at)) = ? GROUP BY m`).bind(E, y).all<MonthValRow>(),
    db.prepare(`SELECT strftime('%m', COALESCE(g.accounting_date,g.billed_at)) m, CAST(COALESCE(SUM(g.billed_amount),0) AS INT) v
      FROM order_billing_groups g JOIN orders o ON o.id=g.order_id
      WHERE g.billing_status='BILLED' AND o.status!='CANCELLED' AND g.entity_id=? AND o.client_id IN (${internal})
        AND strftime('%Y', COALESCE(g.accounting_date,g.billed_at)) = ? GROUP BY m`).bind(E, y).all<MonthValRow>(),
    db.prepare(`SELECT strftime('%m', order_date) m, CAST(COALESCE(SUM(final_amount),0) AS INT) v
      FROM purchase_orders WHERE entity_id=? AND status NOT IN ('DRAFT','CANCELLED')
        AND strftime('%Y', order_date) = ? AND po_number NOT LIKE '%-OPEN%' GROUP BY m`).bind(E, y).all<MonthValRow>(),
    db.prepare(`SELECT strftime('%m', order_date) m, CAST(COALESCE(SUM(final_amount),0) AS INT) v
      FROM purchase_orders WHERE entity_id=? AND status NOT IN ('DRAFT','CANCELLED') AND supplier_id IN (${internal})
        AND strftime('%Y', order_date) = ? AND po_number NOT LIKE '%-OPEN%' GROUP BY m`).bind(E, y).all<MonthValRow>(),
    E === 1
      ? db.prepare(`SELECT strftime('%m', po.order_date) m, CAST(COALESCE(SUM(poi.amount),0) AS INT) v
          FROM purchase_order_items poi JOIN purchase_orders po ON po.id=poi.po_id JOIN items i ON i.id=poi.item_id
          WHERE po.entity_id=1 AND po.status NOT IN ('DRAFT','CANCELLED')
            AND strftime('%Y', po.order_date) = ? AND po.po_number NOT LIKE '%-OPEN%'
            AND i.item_code LIKE 'GDS-EQ-%' GROUP BY m`).bind(y).all<MonthValRow>()
      : Promise.resolve({ results: [] as MonthValRow[] } as { results: MonthValRow[] }),
    db.prepare(`SELECT substr(period,6,2) m, CAST(COALESCE(SUM(depreciation_amount),0) AS INT) v
      FROM depreciation_records WHERE entity_id=? AND substr(period,1,4) = ? GROUP BY m`).bind(E, y).all<MonthValRow>(),
    db.prepare(`SELECT substr(bt.transaction_date,5,2) m, ec.name nm, CAST(SUM(bt.amount) AS INT) amt
      FROM bank_transactions bt
      JOIN bank_accounts ba ON ba.id=bt.bank_account_id
      JOIN expense_categories ec ON ec.id=bt.matched_category_id
      WHERE ba.entity_id=? AND COALESCE(ba.is_personal,0)=0 AND bt.transaction_type='WITHDRAWAL'
        AND substr(bt.transaction_date,1,4) = ? GROUP BY m, ec.name`).bind(E, y).all<MonthCatRow>(),
    db.prepare(`SELECT substr(t.transaction_date,5,2) m, ec.name nm, CAST(SUM(${cardNetAmountSql('t')}) AS INT) amt
      FROM card_transactions t
      JOIN corporate_cards cc ON cc.id=t.card_id
      JOIN expense_categories ec ON ec.id=t.category_id
      WHERE cc.entity_id=?${cardSpendFilterSql('t')}
        AND substr(t.transaction_date,1,4) = ? GROUP BY m, ec.name`).bind(E, y).all<MonthCatRow>(),
  ])
  return { sales, salesInt, purch, purchInt, equip, dep, expBank, expCard }
}

financialReportsRouter.get('/pnl/monthly', async (c) => {
  try {
    const year = Number(c.req.query('year') || kstYear())
    const entityId = getEntityId(c)
    const scope = entityId > 0 ? 'ENTITY' : 'GROUP'
    const entities = entityId > 0 ? [entityId] : [1, 2, 3]
    const removeInternal = scope === 'GROUP'

    const parts = await Promise.all(entities.map(E => fetchEntityMonthly(c.env.DB, E, year)))

    interface MonthAcc { revenue: number; purchase: number; equip: number; cogs_direct: number; sga: number; dep: number }
    const acc = new Map<string, MonthAcc>()
    const at = (m: string): MonthAcc => {
      let e = acc.get(m)
      if (!e) { e = { revenue: 0, purchase: 0, equip: 0, cogs_direct: 0, sga: 0, dep: 0 }; acc.set(m, e) }
      return e
    }
    for (const pEnt of parts) {
      for (const r of pEnt.sales.results || []) at(r.m).revenue += Number(r.v) || 0
      if (removeInternal) for (const r of pEnt.salesInt.results || []) at(r.m).revenue -= Number(r.v) || 0
      for (const r of pEnt.purch.results || []) at(r.m).purchase += Number(r.v) || 0
      if (removeInternal) for (const r of pEnt.purchInt.results || []) at(r.m).purchase -= Number(r.v) || 0
      for (const r of pEnt.equip.results || []) at(r.m).equip += Number(r.v) || 0
      for (const r of pEnt.dep.results || []) at(r.m).dep += Number(r.v) || 0
      for (const r of [...(pEnt.expBank.results || []), ...(pEnt.expCard.results || [])]) {
        const role = roleOf(r.nm)
        if (role === 'COGS') at(r.m).cogs_direct += Number(r.amt) || 0
        else if (role === 'SGA') at(r.m).sga += Number(r.amt) || 0
        // NONOP·TAX·NOT_EXPENSE 는 월별 영업이익 축에서 제외 (연간 상세는 /pnl)
      }
    }

    const monthly = [] as Array<{ month: number; revenue: number; cogs: number; sga: number; profit: number; margin_pct: number }>
    for (let m = 1; m <= 12; m++) {
      const k = String(m).padStart(2, '0')
      const e = acc.get(k) || { revenue: 0, purchase: 0, equip: 0, cogs_direct: 0, sga: 0, dep: 0 }
      const cogs = e.purchase - e.equip + e.cogs_direct
      const sga = e.sga + e.dep
      const profit = e.revenue - cogs - sga
      monthly.push({
        month: m, revenue: e.revenue, cogs, sga, profit,
        margin_pct: e.revenue > 0 ? +((profit / e.revenue) * 100).toFixed(1) : 0,
      })
    }
    const total = {
      revenue: monthly.reduce((a, mo) => a + mo.revenue, 0),
      cogs: monthly.reduce((a, mo) => a + mo.cogs, 0),
      sga: monthly.reduce((a, mo) => a + mo.sga, 0),
      profit: monthly.reduce((a, mo) => a + mo.profit, 0),
    }

    return c.json({ success: true, data: { year, scope, monthly, total, caveats: { stock_change_unreflected: true } } })
  } catch (error) {
    console.error('financial monthly pnl error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================
// 재무 스냅샷 (현금/미수금/매입미지급/재고)
// GET /balance-snapshot
// ============================================================
financialReportsRouter.get('/balance-snapshot', async (c) => {
  try {
    // split billing P3: clients.balance 캐시 폐기 → 전체 미수금 파생(order_billing_groups[BILLED] − payments − adjustments)
    // ★ 2026-08-06: 거래처별 부호 분리 — 잔액이 음수인 거래처는 **선수금(부채)** 이라 자산에 마이너스로 섞으면 안 된다.
    //   종전엔 뭉쳐 SUM 해서 매출채권이 선수금만큼 과소, 부채는 과소로 **양변이 동시에 축소**됐다(순자산은 동일).
    //   allEntities = 이 엔드포인트는 설계상 전사 기준(entity 무필터)이라 헬퍼도 같은 기준으로 부른다.
    const arSplit = await deriveArSplit(c, { allEntities: true })

    // 매입 미지급 — purchase_balance 캐시 폐기 → 파생(POs[NOT IN DRAFT/CANCELLED] − payments − adjustments). AR과 동일 전사 기준(entity 무필터), 단 내부법인(그룹 3사)은 제외(법인간거래 탭 이관)
    // ★ 2026-08-24: AR(deriveArSplit, 2026-08-06)과 대칭으로 **공급처별 부호 분리** — 잔액이 음수인 공급처는
    //   선급/과지급(자산: 선급금)이라, 뭉쳐 SUM 하면 매입채무·자산이 같은 액수만큼 동시에 과소된다(순자산만 동일).
    //   실측 2026-08-11(§8-Z-41): 음수 4곳 −5,436,465 — 전부 실제 선급/과지급이라 데이터는 손대지 않고 표시만 분리.
    const apRow = await c.env.DB.prepare(`
      WITH bal AS (
        SELECT sid, SUM(v) AS b FROM (
          SELECT supplier_id AS sid, final_amount AS v FROM purchase_orders
           WHERE status NOT IN ('DRAFT', 'CANCELLED')${excludePurchaseNonCounterpartiesSql('supplier_id')}
          UNION ALL
          SELECT supplier_id, -amount FROM purchase_payments WHERE 1=1${excludePurchaseNonCounterpartiesSql('supplier_id')}
          UNION ALL
          SELECT supplier_id, -amount FROM purchase_adjustments WHERE 1=1${excludePurchaseNonCounterpartiesSql('supplier_id')}
        ) GROUP BY sid
      )
      SELECT COALESCE(SUM(CASE WHEN b > 0 THEN b ELSE 0 END), 0) AS payable,
             COALESCE(SUM(CASE WHEN b < 0 THEN -b ELSE 0 END), 0) AS prepaid,
             COALESCE(SUM(CASE WHEN b < 0 THEN 1 ELSE 0 END), 0) AS prepaid_suppliers
        FROM bal
    `).first<ApRow>()

    // 재고 평가액 (#433: 재고는 items가 아니라 inventory.quantity, 평가단가=items.avg_unit_cost 이동평균)
    const inventoryRow = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(inv.quantity * COALESCE(it.avg_unit_cost, 0)), 0) as total_inventory
      FROM inventory inv JOIN items it ON it.id = inv.item_id
      WHERE it.is_active = 1
    `).first<InventoryRow>().catch((): InventoryRow => ({ total_inventory: 0 }))

    // 은행 잔액 합계 (#433: bank_accounts엔 잔액 컬럼 없음 → 계좌별 최신 거래의 balance_after 합산)
    // #537: 현금잔액 SSOT — bankBalance.ts LATEST_BALANCE_SUBQUERY(balance_after IS NOT NULL 필터 포함)로 통일.
    //   bank fund-summary/getTotalBankBalance와 동일 판정 → 페이지 간 현금잔액 불일치 제거.
    //   0539: 대표자 개인통장(is_personal=1)은 법인 자금이 아니라 제외 — 세 곳 모두 같은 기준이어야 한다.
    const efBank = entityFilter(c, 'ba')
    const bankRow = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(${LATEST_BALANCE_SUBQUERY}), 0) as total_bank
      FROM bank_accounts ba
      WHERE ba.is_active = 1 AND ${NOT_PERSONAL_ACCOUNT}${efBank.clause}
    `).bind(...efBank.params).first<BankRow>().catch((): BankRow => ({ total_bank: 0 }))

    // 대출 잔액 (#433: loans 실제 컬럼 = current_balance / is_active. remaining_principal·status는 부재)
    const loanRow = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(current_balance), 0) as total_loan
      FROM loans WHERE is_active = 1
    `).first<LoanRow>().catch((): LoanRow => ({ total_loan: 0 }))

    const cash = Number(bankRow?.total_bank) || 0
    const ar = arSplit.receivable          // 매출채권 = 양수 잔액만
    const advance = arSplit.advance        // 선수금 = 음수 잔액 절대값(부채)
    const inventory = Number(inventoryRow?.total_inventory) || 0
    const ap = Number(apRow?.payable) || 0        // 매입채무 = 양수 잔액만
    const prepaid = Number(apRow?.prepaid) || 0   // 선급금 = 음수 잔액 절대값(자산)
    const loans = Number(loanRow?.total_loan) || 0

    return c.json({
      success: true,
      data: {
        snapshot_at: new Date().toISOString(),
        assets: {
          cash,
          accounts_receivable: ar,
          inventory,
          prepaid_expenses: prepaid,
          total: cash + ar + inventory + prepaid,
        },
        liabilities: {
          accounts_payable: ap,
          advance_received: advance,
          loans,
          total: ap + advance + loans,
        },
        // 순자산은 분리 전후 불변 — (ar − advance)·(ap − prepaid) 가 종전 뭉친 값과 같다
        net_assets: (cash + ar + inventory + prepaid) - (ap + advance + loans),
      }
    })
  } catch (error) {
    console.error('financial balance-snapshot error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================
// CSV 내보내기
// GET /export/csv?type=pnl&from=&to=  OR  ?type=monthly&year=
// 새 정본 로직(fetchEntityPnl/fetchEntityMonthly) 재사용 — 화면과 CSV 숫자가 항상 같다.
// ============================================================
financialReportsRouter.get('/export/csv', async (c) => {
  try {
    const type = c.req.query('type')
    if (!type || !['pnl', 'monthly'].includes(type)) {
      return c.json({ success: false, error: 'type 파라미터 필요 (pnl | monthly)' }, 400)
    }
    const { generateCsv, csvResponse } = await import('../utils/csv')
    const entityId = getEntityId(c)
    const entities = entityId > 0 ? [entityId] : [1, 2, 3]
    const removeInternal = entityId === 0

    if (type === 'pnl') {
      const from = c.req.query('from')
      const to = c.req.query('to')
      if (!from || !to) return c.json({ success: false, error: 'from, to 파라미터 필요' }, 400)
      const parts = await Promise.all(entities.map(E => fetchEntityPnl(c.env.DB, E, from, to)))
      const S = (k: 'sales' | 'sales_internal' | 'purchase' | 'purchase_internal' | 'purchase_equip' | 'depreciation' | 'cogs_direct' | 'sga' | 'nonop' | 'tax') =>
        parts.reduce((a, pEnt) => a + (pEnt[k] as number), 0)
      const revenue = S('sales') - (removeInternal ? S('sales_internal') : 0)
      const purchase = S('purchase') - (removeInternal ? S('purchase_internal') : 0)
      const cogs = purchase - S('purchase_equip') + S('cogs_direct')
      const sga = S('sga') + S('depreciation')
      const op = revenue - cogs - sga
      const rows = [
        ['매출(외부)', revenue], ['매입(외부)', purchase], ['장비 제외(자산)', -S('purchase_equip')],
        ['직접원가(원재료비·외주)', S('cogs_direct')], ['매출원가(재고증감 미반영)', cogs],
        ['매출총이익', revenue - cogs], ['판관비(통장·카드)', S('sga')], ['감가상각비', S('depreciation')],
        ['영업이익', op], ['이자비용·기부금', S('nonop')], ['법인세', S('tax')],
        ['당기순이익', op - S('nonop') - S('tax')],
      ]
      const csv = generateCsv(['항목', '금액'], rows.map(r => [String(r[0]), String(r[1])]))
      return csvResponse(c, `pnl_${from}_${to}.csv`, csv)
    }

    // monthly — /pnl/monthly 와 동일 계산
    const year = Number(c.req.query('year') || kstYear())
    const parts = await Promise.all(entities.map(E => fetchEntityMonthly(c.env.DB, E, year)))
    const acc = new Map<string, { revenue: number; purchase: number; equip: number; cogs_direct: number; sga: number; dep: number }>()
    const at = (m: string) => {
      let e = acc.get(m)
      if (!e) { e = { revenue: 0, purchase: 0, equip: 0, cogs_direct: 0, sga: 0, dep: 0 }; acc.set(m, e) }
      return e
    }
    for (const pEnt of parts) {
      for (const r of pEnt.sales.results || []) at(r.m).revenue += Number(r.v) || 0
      if (removeInternal) for (const r of pEnt.salesInt.results || []) at(r.m).revenue -= Number(r.v) || 0
      for (const r of pEnt.purch.results || []) at(r.m).purchase += Number(r.v) || 0
      if (removeInternal) for (const r of pEnt.purchInt.results || []) at(r.m).purchase -= Number(r.v) || 0
      for (const r of pEnt.equip.results || []) at(r.m).equip += Number(r.v) || 0
      for (const r of pEnt.dep.results || []) at(r.m).dep += Number(r.v) || 0
      for (const r of [...(pEnt.expBank.results || []), ...(pEnt.expCard.results || [])]) {
        const role = roleOf(r.nm)
        if (role === 'COGS') at(r.m).cogs_direct += Number(r.amt) || 0
        else if (role === 'SGA') at(r.m).sga += Number(r.amt) || 0
      }
    }
    const rows: string[][] = []
    for (let m = 1; m <= 12; m++) {
      const k = String(m).padStart(2, '0')
      const e = acc.get(k) || { revenue: 0, purchase: 0, equip: 0, cogs_direct: 0, sga: 0, dep: 0 }
      const cogs = e.purchase - e.equip + e.cogs_direct
      const sga = e.sga + e.dep
      rows.push([`${m}월`, String(e.revenue), String(cogs), String(sga), String(e.revenue - cogs - sga)])
    }
    const csv = generateCsv(['월', '매출', '매출원가', '판관비', '영업이익'], rows)
    return csvResponse(c, `pnl_monthly_${year}.csv`, csv)
  } catch (error) {
    console.error('financial csv error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default financialReportsRouter
