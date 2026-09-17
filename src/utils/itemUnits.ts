// 품목 단위표(item_units) — 정본과 파생 열의 동기 (2026-09-17)
// spec: docs/superpowers/specs/2026-09-17-item-units.md
//
// ── 모델 ──
//   item_units 한 행 = 그 품목이 쓰는 단위 하나. factor = 1 unit 이 기본단위 몇 개인가(기본단위 행은 1).
//   role_purchase(발주·입고 기본) · role_sales(주문서·견적서 기본) · role_count(실사 입력 단위) — 각 최대 1행.
//
// ── 파생 열 ──
//   items.unit / base_unit / pack_size 는 이 표에서 파생된다(정본=표). 쓰기 경로 5곳·읽기 3곳·감사 F1~F6·
//   unitConvert.packFactor() 는 그 열을 그대로 읽으므로 이번 단계에서 동작이 바뀌지 않는다.
//     다단위(발주단위 ≠ 기본단위, factor>1) → unit=발주단위 · base_unit=기본단위 · pack_size=factor
//     단일단위                                → unit=기본단위 · base_unit=NULL · pack_size 는 **건드리지 않는다**
//       ★현수막 AQ* 의 pack_size 130 은 환산계수가 아니라 실사 편의계수(마이그 0540)라 지우면 실사 두 칸이 깨진다.
//   레거시 API(이관 스크립트·bulk)가 열을 직접 쓰면 syncUnitsFromPair() 가 표를 열에 맞춘다.
//
// ── 막는 것 ──
//   잉크 RM-I* : 용량은 이름이 갖는다(2026-09-04 결정) — 다단위 저장 거부.
//   현수막 AQ* : yd 단일(pack 130 = 편의계수) — 다단위 저장 거부.

export interface ItemUnitRow {
  unit: string
  factor: number
  is_base: number
  role_purchase: number
  role_sales: number
  role_count: number
  sort_order?: number
}

export interface LegacyPair { unit: string | null; base_unit: string | null; pack_size: number | null }

const MAX_ROWS = 6
const UNIT_RE = /^[A-Za-z가-힣㎡㎥]{1,10}$/

/** 다단위를 허용하지 않는 품목 — 사유를 돌려준다(없으면 null). */
export function multiUnitBlockReason(itemCode: string | null | undefined): string | null {
  const code = String(itemCode || '')
  if (/^RM-I/i.test(code)) return '잉크는 단일 단위(통)로 관리합니다 — 용량은 품목명에 적습니다(2026-09-04 결정)'
  if (/^AQ/i.test(code)) return '현수막 원단(AQ)은 yd 단일 단위입니다 — pack 130 은 실사 편의계수라 환산 단위로 쓰지 않습니다'
  return null
}

/**
 * 단위 집합 검증 + 정규화. 오류면 message, 아니면 정렬·역할 보정된 rows.
 *   · 1~6행, 단위 이름 유일(1~10자), factor > 0
 *   · 기본단위 정확히 1행(factor 는 1로 강제)
 *   · 역할은 각 최대 1행 — 없으면 기본단위 행에 붙인다
 */
export function normalizeUnitSet(input: Array<Partial<ItemUnitRow>>, itemCode?: string | null): { rows?: ItemUnitRow[]; error?: string } {
  if (!Array.isArray(input) || input.length === 0) return { error: '단위가 최소 1행 필요합니다' }
  if (input.length > MAX_ROWS) return { error: `단위는 최대 ${MAX_ROWS}행입니다` }
  const rows: ItemUnitRow[] = []
  const seen = new Set<string>()
  for (const r of input) {
    const unit = String(r.unit ?? '').trim()
    if (!UNIT_RE.test(unit)) return { error: `단위 이름이 올바르지 않습니다: "${unit}"` }
    if (seen.has(unit)) return { error: `단위가 중복됩니다: ${unit}` }
    seen.add(unit)
    const factor = Number(r.factor)
    if (!Number.isFinite(factor) || factor <= 0) return { error: `${unit} 의 환산 계수는 0 보다 커야 합니다` }
    rows.push({
      unit,
      factor,
      is_base: r.is_base ? 1 : 0,
      role_purchase: r.role_purchase ? 1 : 0,
      role_sales: r.role_sales ? 1 : 0,
      role_count: r.role_count ? 1 : 0,
      sort_order: Number.isFinite(Number(r.sort_order)) ? Number(r.sort_order) : rows.length,
    })
  }
  const bases = rows.filter((r) => r.is_base)
  if (bases.length !== 1) return { error: '기본단위는 정확히 1행이어야 합니다' }
  const base = bases[0]
  base.factor = 1
  for (const role of ['role_purchase', 'role_sales', 'role_count'] as const) {
    const n = rows.filter((r) => r[role]).length
    if (n > 1) return { error: `${role === 'role_purchase' ? '발주·입고' : role === 'role_sales' ? '판매' : '실사'} 단위는 1행만 고를 수 있습니다` }
    if (n === 0) base[role] = 1
  }
  if (rows.length > 1) {
    const why = multiUnitBlockReason(itemCode)
    if (why) return { error: why }
  }
  rows.sort((a, b) => (b.is_base - a.is_base) || ((a.sort_order ?? 0) - (b.sort_order ?? 0)) || a.factor - b.factor)
  rows.forEach((r, i) => { r.sort_order = i })
  return { rows }
}

/** 표 → 파생 열. 단일단위면 pack_size 는 현재값 유지(AQ 편의계수 보존). */
export function deriveLegacyPair(rows: ItemUnitRow[], current: LegacyPair): LegacyPair {
  const base = rows.find((r) => r.is_base) || rows[0]
  const purchase = rows.find((r) => r.role_purchase) || base
  const multi = purchase.unit !== base.unit && purchase.factor > 1
  if (multi) return { unit: purchase.unit, base_unit: base.unit, pack_size: purchase.factor }
  // 단일단위 — 예전에 base_unit 이 있었다면(퇴화한 쌍 `장/장/10` 포함) 쌍을 해제하고, 아니면 pack_size 를 남긴다.
  //   ★AQ* 는 base_unit 이 NULL 이라 130 이 보존된다 — 그것이 이 분기의 존재 이유.
  const hadPair = !!current.base_unit
  return { unit: base.unit, base_unit: null, pack_size: hadPair ? null : current.pack_size }
}

/** 파생 열 → 표(레거시 쓰기 뒤 보정). 기본단위 행·발주 행만 맞추고 그 밖의 행(단·조)은 보존한다. */
export function unitsFromLegacyPair(pair: LegacyPair, existing: ItemUnitRow[]): ItemUnitRow[] {
  const unit = String(pair.unit || 'EA').trim() || 'EA'
  const multi = !!(pair.base_unit && pair.base_unit !== unit && (pair.pack_size || 0) > 1)
  const baseUnit = multi ? String(pair.base_unit) : unit
  // 옛 기본단위 행은 버린다 — 계수가 옛 기본단위 기준이라 새 기본단위 아래서는 뜻이 없다. 환산 행(단·조)만 보존.
  const keep = existing.filter((r) => !r.is_base && r.unit !== baseUnit && r.unit !== unit)
    .map((r) => ({ ...r, is_base: 0, role_purchase: 0 }))
  const rows: ItemUnitRow[] = [{ unit: baseUnit, factor: 1, is_base: 1, role_purchase: multi ? 0 : 1, role_sales: 0, role_count: multi ? 0 : 1, sort_order: 0 }]
  if (multi) rows.push({ unit, factor: Number(pair.pack_size), is_base: 0, role_purchase: 1, role_sales: 0, role_count: 1, sort_order: 1 })
  // 판매 역할: 기존에 판매 행이 남아 있으면 유지, 아니면 기본단위
  const salesKept = keep.some((r) => r.role_sales)
  if (!salesKept) rows[0].role_sales = 1
  // 실사 역할이 보존 행에 있으면 기본/발주 행의 실사 역할은 끈다
  const countKept = keep.some((r) => r.role_count)
  if (countKept) for (const r of rows) r.role_count = 0
  return [...rows, ...keep.map((r, i) => ({ ...r, sort_order: rows.length + i }))]
}

// ── D1 ────────────────────────────────────────────────────────────────────────
export async function loadItemUnits(db: D1Database, itemId: number): Promise<ItemUnitRow[]> {
  const { results } = await db.prepare(
    `SELECT unit, factor, is_base, role_purchase, role_sales, role_count, sort_order
       FROM item_units WHERE item_id = ? ORDER BY is_base DESC, sort_order, factor`
  ).bind(itemId).all<ItemUnitRow>()
  return results || []
}

/** 표를 통째로 바꾸고 파생 열을 맞춘다(한 batch). */
export async function replaceItemUnits(db: D1Database, itemId: number, rows: ItemUnitRow[]): Promise<LegacyPair> {
  const cur = await db.prepare(`SELECT unit, base_unit, pack_size FROM items WHERE id = ?`).bind(itemId).first<LegacyPair>()
  if (!cur) throw new Error('item not found')
  const pair = deriveLegacyPair(rows, cur)
  const stmts: D1PreparedStatement[] = [db.prepare(`DELETE FROM item_units WHERE item_id = ?`).bind(itemId)]
  for (const r of rows) {
    stmts.push(db.prepare(
      `INSERT INTO item_units (item_id, unit, factor, is_base, role_purchase, role_sales, role_count, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(itemId, r.unit, r.factor, r.is_base, r.role_purchase, r.role_sales, r.role_count, r.sort_order ?? 0))
  }
  stmts.push(db.prepare(`UPDATE items SET unit = ?, base_unit = ?, pack_size = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(pair.unit, pair.base_unit, pair.pack_size, itemId))
  await db.batch(stmts)
  return pair
}

/** 레거시 열(unit/base_unit/pack_size)이 직접 쓰인 뒤 표를 열에 맞춘다. 실패해도 호출부를 막지 않는다. */
export async function syncUnitsFromPair(db: D1Database, itemId: number): Promise<void> {
  const pair = await db.prepare(`SELECT unit, base_unit, pack_size FROM items WHERE id = ?`).bind(itemId).first<LegacyPair>()
  if (!pair) return
  const existing = await loadItemUnits(db, itemId)
  const rows = unitsFromLegacyPair(pair, existing)
  const stmts: D1PreparedStatement[] = [db.prepare(`DELETE FROM item_units WHERE item_id = ?`).bind(itemId)]
  for (const r of rows) {
    stmts.push(db.prepare(
      `INSERT INTO item_units (item_id, unit, factor, is_base, role_purchase, role_sales, role_count, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(itemId, r.unit, r.factor, r.is_base, r.role_purchase, r.role_sales, r.role_count, r.sort_order ?? 0))
  }
  await db.batch(stmts)
}
