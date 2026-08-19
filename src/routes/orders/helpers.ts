/**
 * orders/helpers.ts — 주문 공유 헬퍼 (core.ts에서 분리, 2026-06-11 대형파일 분할)
 *
 * 카드 그룹 판정 / 담당 법인 추천 / 청구 그룹 재계산 / 청구 상태 설정 / 카드 생성.
 * POST(create)·PUT(update)·lifecycle 라우트 + approvals.ts(동적 import)에서 공유.
 * 순수 로직 — 라우트 등록 순서와 무관. ⚠️ 이동만, 로직 수정 0.
 */

import { formatFinishing, formatPP } from '../../utils/finishingLabel'

// card_group 결정 함수: 품목의 카드 그룹(생산 라인)을 결정
function getCardGroup(item: any): string | null {
  // 0. 기성품/유통(production_required=0): 제작 불필요 → 카드 미생성 (카테고리 매칭보다 우선)
  //    태극기 호수별 등 "생산 카테고리"라도 기성품이면 여기서 즉시 제외 → shipment_ready로 즉시 출고
  if (item.production_required === 0) return null
  // 1. print_method_id가 있으면 → print_methods.card_group 사용
  // ⚠️ 현재 **항상 미발동**이다. prod `print_methods` 는 `(id INTEGER PRIMARY KEY)` 스텁(0행)이라
  //    card_group 컬럼이 없고, `items.print_method_id` 도 전 행 NULL이며, 아래 카드 생성 쿼리도
  //    print_methods 를 조인하지 않는다(=이 필드가 채워질 경로가 없다). 인쇄방식 모델을 실제로
  //    도입할 때 **컬럼 신설 → 조인 추가**를 같이 해야 한다 — 조인만 먼저 넣으면 없는 컬럼 참조로 500.
  if (item.print_method_card_group) return item.print_method_card_group
  // 2. category 기반 판단 (기존 품목 호환)
  const cat = (item.category_name || item.category || '').toLowerCase()
  if (['전사', '깃발', '윈드배너', '가로등배너', '민방위기', '태극기', '새마을기'].some(k => cat.includes(k))) return 'TRANSFER_FLAG'
  if (cat.includes('간판')) return 'SIGN'
  // 3. 출력 관련 카테고리 (기존 데이터 호환)
  if (['현수막', '배너', '스티커', '현판', 'uv', '솔벤', '수성', '평판'].some(k => cat.includes(k))) return 'OUTPUT'
  // 4. 상품/부자재 등 → 카드 미생성
  const itemType = (item.item_type || '').toUpperCase()
  if (['GOODS', 'MATERIAL'].includes(itemType)) return null
  // 5. 기본값: OUTPUT (기존 호환)
  return 'OUTPUT'
}

// 담당 법인 자동추천: 품목의 카드그룹(생산 라인) 기준으로 생산/공정 담당 법인을 추천한다.
// 멀티법인 협업(유연한 그릇) — 추천일 뿐이며 코디네이터가 UI에서 수정 가능.
// 반환 NULL = 청구 법인(billingEntityId)이 담당 → 단일 법인·자기 법인 품목은 태그 불필요(투명).
// 법인 ID: 동산기획=1, 선명=2 (entities 시드 기준 고정).
const ENTITY_DONGSAN = 1
const ENTITY_SEONMYEONG = 2
export function recommendAssignedEntity(item: any, billingEntityId: number | null): number | null {
  const group = getCardGroup(item)
  let entity: number | null = null
  if (group === 'SIGN') entity = ENTITY_SEONMYEONG                                  // 간판 → 선명
  else if (group === 'OUTPUT' || group === 'TRANSFER_FLAG') entity = ENTITY_DONGSAN // 현수막·솔벤·UV·평판·전사·태극기 → 동산
  // group === null (유통·상품·부자재) → 추천 없음(청구 법인 담당)
  // 추천이 청구 법인과 같으면 태그 불필요 → NULL (단일 법인 주문 투명)
  if (entity === null || entity === billingEntityId) return null
  return entity
}

// ── 청구 법인 분할: order_billing_groups 재계산 (split billing P2) ──
// 설계: docs/superpowers/specs/2026-06-10-split-billing-by-entity.md
// 품목 assigned_entity_id 별로 청구그룹을 (재)생성. NULL 담당 = 주(主)법인(orders.entity_id) 귀속.
// 금액: supply = 그룹 품목 amount 합, tax/discount = 주문 vat/discount를 비례배분(주법인 잔차 흡수),
//       billed_amount = supply + tax − discount(예상 청구액, billing_status=NULL).
// ⚠️ 동결(#387): BILLED/PAID 그룹(이미 발행된 세금계산서)은 그룹 단위로 보존하고, 미청구(NULL) 그룹만 재계산.
//   기존엔 BILLED 그룹이 하나라도 있으면 주문 전체 재분할을 막아(order-wide freeze) 혼합주문 부분청구 후
//   미청구 법인 품목 편집이 그룹에 반영 안 됐다 → 미청구 그룹만 현재 품목 기준 재산정.
//   ★완전 미청구 주문(동결 그룹 0)은 기존과 byte-identical 동작(잔여=주문 총액, 전 그룹 재계산).
// orders/order_items 만 읽어 자기완결적 → POST/PUT 양쪽에서 저장 직후 한 줄 호출.
export async function recalcOrderBillingGroups(db: D1Database, orderId: number): Promise<void> {
  const order = await db.prepare(
    `SELECT entity_id, vat_amount, discount_amount FROM orders WHERE id = ?`
  ).bind(orderId).first<{ entity_id: number; vat_amount: number; discount_amount: number }>()
  if (!order) return
  const mainEntity = Number(order.entity_id) || 1

  // 동결 그룹 식별: BILLED/PAID 또는 발행 계산서 링크(tax_invoice_id)는 보존, 그 법인은 재계산 대상에서 제외.
  // #395: billing_status=NULL이어도 tax_invoice_id가 있으면(0306 backfill 등) 삭제 시 계산서 연결 소실 → 동결에 포함.
  const { results: existing } = await db.prepare(
    `SELECT entity_id, billing_status, tax_invoice_id, supply_amount, tax_amount, billed_amount FROM order_billing_groups WHERE order_id = ?`
  ).bind(orderId).all<{ entity_id: number; billing_status: string | null; tax_invoice_id: number | null; supply_amount: number; tax_amount: number; billed_amount: number }>()
  const frozen = (existing || []).filter(g => g.billing_status === 'BILLED' || g.billing_status === 'PAID' || g.tax_invoice_id != null)
  const frozenEntities = new Set(frozen.map(g => Number(g.entity_id)))
  // 동결분이 이미 가져간 세액/할인 = 주문 총액에서 차감 후 잔여를 미청구 그룹이 나눠 가짐.
  const frozenTax = frozen.reduce((s, g) => s + Math.round(Number(g.tax_amount) || 0), 0)
  const frozenDiscount = frozen.reduce((s, g) =>
    s + (Math.round(Number(g.supply_amount) || 0) + Math.round(Number(g.tax_amount) || 0) - Math.round(Number(g.billed_amount) || 0)), 0)

  // 품목 → 법인별 집계 (assigned_entity_id NULL → 주법인). 자식/PENDING 품목은 amount=0 → 기여 0.
  const { results: rows } = await db.prepare(`
    SELECT COALESCE(assigned_entity_id, ?) AS eid,
           CAST(COALESCE(SUM(amount), 0) AS INTEGER) AS supply,
           CAST(COALESCE(SUM(CASE WHEN vat_included = 1 THEN amount ELSE 0 END), 0) AS INTEGER) AS vat_base
    FROM order_items
    WHERE order_id = ?
    GROUP BY COALESCE(assigned_entity_id, ?)
  `).bind(mainEntity, orderId, mainEntity).all<{ eid: number; supply: number; vat_base: number }>()

  // 미청구(NULL) 그룹만 제거(동결 그룹은 보존). 그 후 동결 안 된 법인만 현재 품목으로 재INSERT.
  // #395: tax_invoice_id 보유 그룹은 NULL-status여도 삭제 금지(계산서 연결 보존).
  await db.prepare(
    `DELETE FROM order_billing_groups WHERE order_id = ? AND tax_invoice_id IS NULL AND (billing_status IS NULL OR billing_status NOT IN ('BILLED','PAID'))`
  ).bind(orderId).run()

  const unbilledRows = (rows || []).filter(r => !frozenEntities.has(Number(r.eid)))
  if (unbilledRows.length === 0) return

  const totalSupply = unbilledRows.reduce((s, r) => s + Number(r.supply), 0)
  const totalVatBase = unbilledRows.reduce((s, r) => s + Number(r.vat_base), 0)
  const remVat = Math.round(Number(order.vat_amount) || 0) - frozenTax       // 미청구분이 나눠 가질 잔여 세액
  const remDiscount = Math.round(Number(order.discount_amount) || 0) - frozenDiscount

  // 주법인 그룹을 마지막에 두어 라운딩 잔차 흡수(없으면 마지막 그룹이 흡수)
  const ordered = [...unbilledRows].sort((a, b) => (a.eid === mainEntity ? 1 : 0) - (b.eid === mainEntity ? 1 : 0))
  let taxAcc = 0, discAcc = 0
  const stmts = ordered.map((r, i) => {
    const isLast = i === ordered.length - 1
    let tax: number, disc: number
    if (isLast) {
      tax = remVat - taxAcc
      disc = remDiscount - discAcc
    } else {
      tax = totalVatBase > 0 ? Math.round(remVat * Number(r.vat_base) / totalVatBase) : 0
      disc = totalSupply > 0 ? Math.round(remDiscount * Number(r.supply) / totalSupply) : 0
      taxAcc += tax; discAcc += disc
    }
    const billed = Number(r.supply) + tax - disc
    return db.prepare(`
      INSERT INTO order_billing_groups (order_id, entity_id, billing_status, supply_amount, tax_amount, billed_amount)
      VALUES (?, ?, NULL, ?, ?, ?)
    `).bind(orderId, r.eid, Number(r.supply), tax, billed)
  })
  if (stmts.length > 0) await db.batch(stmts)
}

// ── 청구 상태를 그룹 단위로 설정 (split billing P3) ──
// order_billing_groups 가 청구 정본. orders.billing_status/billed_* 는 미러(롤백용, P5 후 제거).
// balance 캐시는 사용 안 함 — 미수금은 (order_billing_groups[BILLED] − payments − adjustments) 파생.
// status: 'BILLED'(청구) | 'PAID'(수금) | null(취소). 반환: orders 행이 실제 변경됐는지(이중 실행 방지).
// ⚠️ NULL!='BILLED'는 SQLite에서 NULL → `IS NOT 'BILLED'` 사용(미청구 NULL 매칭).
export async function setOrderBillingStatus(
  db: D1Database, orderId: number, status: 'BILLED' | 'PAID' | null, billedBy: number | null,
  accountingDate?: string | null   // 회계반영일 override(없으면 billable_after→delivery_date→KST오늘 폴백)
): Promise<boolean> {
  if (status === 'BILLED') {
    const ad = accountingDate || null
    const r = await db.batch([
      db.prepare(`UPDATE order_billing_groups SET billing_status = 'BILLED', billed_at = CURRENT_TIMESTAMP, billed_by = ?,
                    accounting_date = COALESCE(?, (SELECT COALESCE(o.billable_after, o.delivery_date) FROM orders o WHERE o.id = order_billing_groups.order_id), date('now','+9 hours'))
                  WHERE order_id = ? AND billing_status IS NOT 'BILLED' AND billing_status IS NOT 'PAID'`).bind(billedBy, ad, orderId),
      db.prepare(`UPDATE orders SET billing_status = 'BILLED', billed_at = CURRENT_TIMESTAMP, billed_by = ?, billed_amount = final_amount,
                    accounting_date = COALESCE(?, billable_after, delivery_date, date('now','+9 hours')), updated_at = CURRENT_TIMESTAMP
                  WHERE id = ? AND billing_status IS NOT 'BILLED' AND billing_status IS NOT 'PAID'`).bind(billedBy, ad, orderId)
    ])
    return ((r[1].meta.changes as number) || 0) > 0
  } else if (status === 'PAID') {
    const r = await db.batch([
      db.prepare(`UPDATE order_billing_groups SET billing_status = 'PAID' WHERE order_id = ? AND billing_status = 'BILLED'`).bind(orderId),
      db.prepare(`UPDATE orders SET billing_status = 'PAID', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND billing_status = 'BILLED'`).bind(orderId)
    ])
    return ((r[1].meta.changes as number) || 0) > 0
  } else {
    const r = await db.batch([
      db.prepare(`UPDATE order_billing_groups SET billing_status = NULL, billed_at = NULL, billed_by = NULL, accounting_date = NULL WHERE order_id = ?`).bind(orderId),
      db.prepare(`UPDATE orders SET billing_status = NULL, billed_at = NULL, billed_by = NULL, billed_amount = NULL, accounting_date = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(orderId)
    ])
    return ((r[1].meta.changes as number) || 0) > 0
  }
}

// ── 카드 생성 공통 함수 (POST/PUT 중복 제거) ──
export interface GenerateCardsParams {
  db: D1Database
  orderId: number
  orderNumber: string
  clientId: number
  deliveryDate: string | null
  priority: string
  notes?: string | null
  entityId?: number | null
  // append(기존 주문 라인 추가): 지정된 order_item id만 카드 생성 + 카드번호 인덱스를 기존 최대값 뒤로 이어붙임.
  // 미지정(create/update 기존 경로)이면 전 품목 대상 + cardIndex 0부터 — byte-identical 동작 보존.
  itemIdsFilter?: number[]
}

export async function generateCardsForOrder(params: GenerateCardsParams): Promise<number> {
  const { db, orderId, orderNumber, clientId, deliveryDate, priority, notes, entityId } = params
  const cardPriority = priority === 'URGENT' ? 1 : 0

  const client = await db.prepare(`
    SELECT client_name FROM clients WHERE id = ?
  `).bind(clientId).first<{ client_name: string }>()

  const { results: orderItems } = await db.prepare(`
    SELECT oi.*, i.category, i.sub_category,
           i.item_type, i.production_required
    FROM order_items oi
    LEFT JOIN items i ON oi.item_id = i.id
    WHERE oi.order_id = ?
    ORDER BY oi.sort_order ASC, oi.id ASC
  `).bind(orderId).all()

  const { results: finMethods } = await db.prepare(
    `SELECT name, margin_cm FROM finishing_methods WHERE is_active = 1`
  ).all()
  const finMarginMap = new Map<string, number>(
    (finMethods || []).map((m): [string, number] => [m.name as string, (m.margin_cm as number) || 0])
  )

  // (카드번호는 주문번호 전체 기반으로 생성 — 아래 cardNumber 참조)

  // orderItems rows from JOIN query — typed as Record<string, unknown>
  type OIRow = Record<string, unknown>

  const parentIds = new Set<number>(
    (orderItems as OIRow[])
      .filter((i) => i.parent_item_id !== null && i.parent_item_id !== undefined)
      .map((i) => i.parent_item_id as number)
  )
  const parentMap = new Map<number, OIRow>(
    (orderItems as OIRow[]).map((i) => [i.id as number, i])
  )

  const regularItems = (orderItems as OIRow[]).filter(
    (i) => !i.parent_item_id && !parentIds.has(i.id as number)
  )
  const childItems = (orderItems as OIRow[]).filter(
    (i) => i.parent_item_id !== null && i.parent_item_id !== undefined
  )

  // append 모드: 지정 id만 카드 생성 대상. parentMap은 전 품목에서 만들어졌으므로(위) 신규 자식의
  // 기존 부모 참조도 정상 해석된다. 미지정 시 전 품목(기존 동작).
  const appendFilter = (params.itemIdsFilter && params.itemIdsFilter.length)
    ? new Set(params.itemIdsFilter.map(Number)) : null
  const regularItemsToCard = appendFilter ? regularItems.filter((i) => appendFilter.has(i.id as number)) : regularItems
  const childItemsToCard = appendFilter ? childItems.filter((i) => appendFilter.has(i.id as number)) : childItems

  // 카드 그룹핑: 카드그룹 × 담당법인(assigned_entity_id). 타법인 담당 품목은 별도 카드로 그 법인(requesting_entity_id)에 배정.
  // assigned_entity_id NULL = 청구 법인(entityId) 담당 → 단일 법인 주문은 기존과 동일(전부 entityId).
  const effEntityOf = (it: OIRow): number | null => {
    const a = it.assigned_entity_id
    return (a !== null && a !== undefined) ? Number(a) : (entityId ?? null)
  }
  const itemsByCardGroup = new Map<string, Array<{ item: OIRow; ppJson: string | null; qty: number; cardGroup: string; reqEntity: number | null }>>()

  for (const item of regularItemsToCard) {
    const cg = getCardGroup(item)
    if (!cg) continue
    const ee = effEntityOf(item)
    const key = `${cg}__${ee ?? 'null'}`
    if (!itemsByCardGroup.has(key)) itemsByCardGroup.set(key, [])
    itemsByCardGroup.get(key)!.push({ item, ppJson: (item.post_processing as string) || null, qty: (item.quantity as number) || 0, cardGroup: cg, reqEntity: ee })
  }

  for (const child of childItemsToCard) {
    const parent = parentMap.get(child.parent_item_id as number)
    if (!parent) continue
    const cg = getCardGroup(parent)
    if (!cg) continue
    const ee = effEntityOf(parent)  // 자식은 부모 담당 법인 상속
    const key = `${cg}__${ee ?? 'null'}`
    if (!itemsByCardGroup.has(key)) itemsByCardGroup.set(key, [])
    // 자식 수량 반영(2026-07-31) — 대기물 qty≥2 묶음 프리필에서 카드 수량=실제 출력 장수
    itemsByCardGroup.get(key)!.push({ item: child, ppJson: (parent.post_processing as string) || null, qty: (child.quantity as number) || 1, cardGroup: cg, reqEntity: ee })
  }

  // shipment_ready: 카드 미생성 품목은 바로 출고 준비 완료
  const cardGroupItems = new Set<number>()
  for (const entries of itemsByCardGroup.values()) {
    for (const entry of entries) cardGroupItems.add(entry.item.id as number)
  }
  // append 모드는 신규 품목만 대상 (기존 품목 shipment_ready 미변경)
  const shipmentCandidates = appendFilter
    ? (orderItems as OIRow[]).filter((i) => appendFilter.has(i.id as number))
    : (orderItems as OIRow[])
  const noCardItems = shipmentCandidates.filter((i) => !cardGroupItems.has(i.id as number))
  if (noCardItems.length > 0) {
    const ids = noCardItems.map((i) => i.id as number)
    await db.prepare(
      `UPDATE order_items SET shipment_ready = 1 WHERE id IN (${ids.map(() => '?').join(',')})`
    ).bind(...ids).run()
  }

  // D1 batch로 원자적 카드 생성
  const cardStatements: D1PreparedStatement[] = []
  const cardGroupEntries: Array<{
    cardNumber: string
    entries: Array<{ item: OIRow; ppJson: string | null; qty: number }>
    checklistSteps: Array<{ code: string; label: string; sort: number }>
  }> = []

  // append 모드: 카드번호 접미 인덱스를 기존 최대값 뒤로 이어붙여 충돌 방지(${orderNumber}-NN).
  let cardIndex = 0
  if (appendFilter) {
    const { results: exCards } = await db.prepare(
      `SELECT card_number FROM cards WHERE order_id = ?`
    ).bind(orderId).all<{ card_number: string }>()
    for (const r of (exCards || [])) {
      const m = /-(\d+)$/.exec((r.card_number as string) || '')
      if (m) cardIndex = Math.max(cardIndex, parseInt(m[1], 10))
    }
  }
  for (const [, entries] of itemsByCardGroup) {
    const cardGroup = entries[0].cardGroup
    const reqEntity = entries[0].reqEntity
    const category = cardGroup === 'OUTPUT' ? '출력'
      : cardGroup === 'TRANSFER_FLAG' ? '전사/태극기'
      : cardGroup === 'SIGN' ? '간판' : cardGroup
    cardIndex++
    // #card_number: order_number 전체 기반 (E{eid} 접두 호환 + 전역 유일). split([0]/[1]) 방식은 E{eid} 채번에서 같은날·법인 충돌
    const cardNumber = `${orderNumber}-${String(cardIndex).padStart(2, '0')}`

    // PP 합집합 (code 기준 중복 제거)
    const mergedPPMap = new Map<string, any>()
    for (const entry of entries) {
      if (entry.ppJson) {
        try {
          const procs = JSON.parse(entry.ppJson)
          if (Array.isArray(procs)) {
            for (const proc of procs) {
              if (proc && proc.code) mergedPPMap.set(proc.code, proc)
              else if (typeof proc === 'string' && proc) mergedPPMap.set(proc, { code: proc, name: proc })
            }
          }
        } catch (_) {
          if (entry.ppJson.trim()) mergedPPMap.set(entry.ppJson, { code: entry.ppJson, name: entry.ppJson })
        }
      }
    }
    const uniquePP = [...mergedPPMap.values()]

    // 후가공 마진
    let mL = 0, mR = 0, mT = 0, mB = 0
    for (const pp of uniquePP) {
      mL = Math.max(mL, Number(pp.margin_left) || 0)
      mR = Math.max(mR, Number(pp.margin_right) || 0)
      mT = Math.max(mT, Number(pp.margin_top) || 0)
      mB = Math.max(mB, Number(pp.margin_bottom) || 0)
    }
    const ppNames = uniquePP.map((p: any) => p.name || p.code).filter(Boolean)
    const postProcStr = ppNames.length > 0 ? `[${ppNames.join('+')}]` : ''

    // 마감 여백
    let finL = 0, finR = 0, finT = 0, finB = 0
    let cardFinishing: any = null
    let cardFinishingMarginSum = 0
    for (const entry of entries) {
      if (entry.item.finishing) {
        try {
          const fin = typeof entry.item.finishing === 'string'
            ? JSON.parse(entry.item.finishing) : entry.item.finishing
          const fT = fin.top_cm !== undefined ? Number(fin.top_cm) : (finMarginMap.get(fin.top) || 0)
          const fB = fin.bottom_cm !== undefined ? Number(fin.bottom_cm) : (finMarginMap.get(fin.bottom) || 0)
          const fL = fin.left_cm !== undefined ? Number(fin.left_cm) : (finMarginMap.get(fin.left) || 0)
          const fR = fin.right_cm !== undefined ? Number(fin.right_cm) : (finMarginMap.get(fin.right) || 0)
          finT = Math.max(finT, fT)
          finB = Math.max(finB, fB)
          finL = Math.max(finL, fL)
          finR = Math.max(finR, fR)
          const marginSum = fT + fB + fL + fR
          if ((fin.top || fin.bottom || fin.left || fin.right) && marginSum >= cardFinishingMarginSum) {
            cardFinishing = fin
            cardFinishingMarginSum = marginSum
          }
        } catch (_) { /* invalid JSON, skip */ }
      }
    }

    const firstItem = entries[0].item
    const cardWidth = (firstItem.width as number) || 0
    const cardHeight = (firstItem.height as number) || 0
    const totalQty = entries.reduce((s: number, e) => s + e.qty, 0)
    const ripFilename = `${cardNumber}-${client?.client_name || 'Unknown'}-${category}(${entries.length}건)${postProcStr}`

    const totalML = mL + finL, totalMR = mR + finR
    const totalMT = mT + finT, totalMB = mB + finB

    // 작업지시서 체크리스트 스텝 파생 — 물리 공정 순서: 출력 → 봉제(마감) → 후가공 → 검수
    // (2026-08-05 work-order-auto-issue. 체크 행 자체가 감사 로그 — checked_by/checked_at)
    const checklistSteps: Array<{ code: string; label: string; sort: number }> = []
    checklistSteps.push({ code: 'PRINT', label: cardGroup === 'SIGN' ? '제작' : '출력', sort: 10 })
    if (cardFinishing) {
      // 표기 정본 = utils/finishingLabel (화면 사본 = scripts/shared/finishingLabel.js).
      // 예전엔 방식별 개수만 세어(`2면열재단`) **어느 변인지가 사라졌다** — 현장이 카드만 보고 못 잘랐다.
      const sewSummary = formatFinishing(cardFinishing)
      // 라인마다 이 공정의 이름이 다르다 — 전사·태극기는 '봉제'(쌍침·오바), 출력·간판은 '마감'
      // (열재단·접어미싱 등). 예전엔 전부 '봉제'라 출력 카드에 「봉제(2면열재단)」가 떴다.
      const sewLabel = cardGroup === 'TRANSFER_FLAG' ? '봉제' : '마감'
      checklistSteps.push({ code: 'SEW', label: sewSummary ? `${sewLabel}(${sewSummary})` : sewLabel, sort: 20 })
    }
    uniquePP.forEach((pp: any, ppIdx: number) => {
      // 라벨 = 후가공명 + 의미 있는 파라미터 (정본 = utils/finishingLabel).
      //   펀칭은 개수·위치가 지시 정보인데 예전엔 params 값을 순서대로 이어붙여
      //   `펀칭 1cm 1cm 2cm 0cm 0cm 0cm 0cm 0cm` 이 나왔다(개수에 cm·0도 출력·위치 미표기).
      checklistSteps.push({
        code: String(pp.code || pp.name || 'PP'),
        label: formatPP(pp) || String(pp.code || 'PP'),
        sort: 30 + ppIdx,
      })
    })
    checklistSteps.push({ code: 'INSPECT', label: '검수', sort: 90 })

    cardGroupEntries.push({ cardNumber, entries, checklistSteps })
    cardStatements.push(
      db.prepare(`
        INSERT INTO cards (
          card_number, order_id, order_item_id, status,
          client_name, item_name, category_name,
          width, height, quantity, unit,
          rip_filename, post_processing,
          final_width, final_height,
          delivery_date, priority, finishing, notes,
          requesting_entity_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        cardNumber, orderId, null, 'PRINT_PENDING',
        client?.client_name || 'Unknown', category, category,
        cardWidth, cardHeight, totalQty, (firstItem.unit as string) || 'EA',
        ripFilename, JSON.stringify(uniquePP),
        cardWidth > 0 ? cardWidth + totalML + totalMR : 0,
        cardHeight > 0 ? cardHeight + totalMT + totalMB : 0,
        deliveryDate || null, cardPriority,
        cardFinishing ? JSON.stringify(cardFinishing) : null,
        notes || null,
        reqEntity ?? null
      )
    )
  }

  // 카드가 없으면 바로 리턴
  if (cardStatements.length === 0) return 0

  // D1 batch: 카드 INSERT 원자적 실행
  const batchResults = await db.batch(cardStatements)

  // card_items + 체크리스트 INSERT (카드 ID 기반)
  const itemStatements: D1PreparedStatement[] = []
  for (let i = 0; i < batchResults.length; i++) {
    const cardId = batchResults[i].meta.last_row_id
    for (const entry of cardGroupEntries[i].entries) {
      itemStatements.push(
        db.prepare(`INSERT INTO card_items (card_id, order_item_id, quantity) VALUES (?, ?, ?)`)
          .bind(cardId, entry.item.id as number, entry.qty)
      )
    }
    for (const step of cardGroupEntries[i].checklistSteps) {
      itemStatements.push(
        db.prepare(`INSERT INTO card_checklist_items (card_id, step_code, label, sort_order) VALUES (?, ?, ?, ?)`)
          .bind(cardId, step.code, step.label, step.sort)
      )
    }
  }
  // D1 batch 문 수 제한 대비 80청크 (다품목 주문에서 card_items+체크리스트 합산 초과 방지)
  for (let i = 0; i < itemStatements.length; i += 80) {
    await db.batch(itemStatements.slice(i, i + 80))
  }

  return cardStatements.length
}

// ── 자동가공 잡 생성 (에이전트 폴링 큐 auto_process_jobs) — append 전용 ──
// create.ts D섹션(검출기반 ia_params: scale/margin/clipBounds)과 동형이되, **라인별 자기 ai_analysis_id**를
// 사용해 다중 파일(ia-editor 여러 분석) 라인도 정확히 큐잉한다. create는 단일 primary 분석 가정이라 미수정(분리).
// ia_auto_enabled OFF여도 INSERT(에이전트 수동 실행 대비 — create와 동일 정책). 반환: 생성 잡 수.
const AP_SCALE_RULES: Record<string, number> = {
  '현수막': 5, '게시대': 5, '게릴라': 5, '솔벤현수막': 5,
  '패트': 1, '솔벤시트': 1, '합성지': 1, '포맥스': 1, 'UV': 1, '클리어필름': 1, '간판': 1,
}
const AP_MARGIN_RULES: Record<string, { w: number; h: number }> = {
  '미싱': { w: 83, h: 0 }, '사방접어미싱': { w: 61, h: 61 }, '접어미싱': { w: 34, h: 0 }, '봉미싱': { w: 0, h: 55 },
  '밴드미싱': { w: 2, h: 0 }, '사방미싱': { w: 2, h: 0 }, '열재단': { w: 14, h: 0 }, '재단만': { w: 0, h: 0 },
}
function apScale(product: string, widthCm: number): number {
  const base = AP_SCALE_RULES[product] ?? 5
  if (['현수막', '게시대', '솔벤현수막', '게릴라'].includes(product)) {
    if (widthCm > 300) return 5
    if (widthCm > 150) return 2
  }
  return base
}
function apMargins(finishing: string): { w: number; h: number } {
  if (!finishing) return { w: 0, h: 0 }
  if (AP_MARGIN_RULES[finishing]) return AP_MARGIN_RULES[finishing]
  for (const k of Object.keys(AP_MARGIN_RULES).sort((a, b) => b.length - a.length)) {
    if (finishing.includes(k)) return AP_MARGIN_RULES[k]
  }
  return { w: 0, h: 0 }
}

export async function enqueueAutoProcessJobsForItems(
  db: D1Database, orderId: number, itemIds: number[], fallbackAnalysisId: number | null, entityId: number
): Promise<number> {
  if (!itemIds.length) return 0
  const ph = itemIds.map(() => '?').join(',')
  const { results: items } = await db.prepare(
    `SELECT id, item_id, width, height, scale_factor, finishing, ai_group_index, ai_analysis_id
     FROM order_items WHERE id IN (${ph}) AND COALESCE(ai_analysis_id, ?) IS NOT NULL`
  ).bind(...itemIds, fallbackAnalysisId).all<{
    id: number; item_id: number | null; width: number | null; height: number | null; scale_factor: number | null
    finishing: string | null; ai_group_index: number | null; ai_analysis_id: number | null
  }>()
  if (!items || items.length === 0) return 0

  // 분석 일괄 로드 (라인별 ai_analysis_id, 없으면 fallback)
  const analysisIds = [...new Set(items.map((it) => it.ai_analysis_id ?? fallbackAnalysisId).filter((v): v is number => v != null))]
  if (analysisIds.length === 0) return 0
  const aph = analysisIds.map(() => '?').join(',')
  const { results: analyses } = await db.prepare(
    `SELECT id, file_path, groups_json FROM ai_analysis_requests WHERE id IN (${aph})`
  ).bind(...analysisIds).all<{ id: number; file_path: string | null; groups_json: string | null }>()
  const analysisMap = new Map<number, { file_path: string | null; groups: any[] }>()
  for (const a of (analyses || [])) {
    let groups: any[] = []
    if (a.groups_json) { try { groups = JSON.parse(a.groups_json) } catch (_) { groups = [] } }
    analysisMap.set(a.id, { file_path: a.file_path, groups })
  }

  // 품목명 일괄
  const prodIds = [...new Set(items.map((it) => it.item_id).filter((v): v is number => v != null))]
  const prodMap = new Map<number, string>()
  if (prodIds.length > 0) {
    const pph = prodIds.map(() => '?').join(',')
    const { results: nr } = await db.prepare(`SELECT id, item_name FROM items WHERE id IN (${pph})`).bind(...prodIds).all<{ id: number; item_name: string }>()
    for (const r of nr) prodMap.set(r.id, r.item_name)
  }

  const stmts: D1PreparedStatement[] = []
  for (const oi of items) {
    const aid = oi.ai_analysis_id ?? fallbackAnalysisId
    if (aid == null) continue
    const an = analysisMap.get(aid)
    if (!an) continue
    const gIdx = oi.ai_group_index ?? 0
    const group = an.groups[gIdx]
    if (!group) continue
    const finishing = oi.finishing || ''
    const productName = oi.item_id ? (prodMap.get(oi.item_id) || '') : ''
    const scale = oi.scale_factor || apScale(productName, oi.width || 0)
    const m = apMargins(finishing)
    const mL = m.w / 10.0 / scale, mR = m.w / 10.0 / scale
    const mT = m.h > 0 ? m.h / 10.0 / scale : 0, mB = m.h > 0 ? m.h / 10.0 / scale : 0
    const clipBounds = group.bounds_mm || null
    const ts = Date.now()
    const outputDir = 'Z:\\Designs\\IllustratorAutomat\\_auto_output'
    const srcBase = (an.file_path || 'output').split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || 'output'
    const iaParams = {
      mode: 'process', source: an.file_path, output: outputDir,
      epsOutput: `${outputDir}\\${srcBase}_g${gIdx}_${ts}.eps`,
      pngOutput: `${outputDir}\\${srcBase}_g${gIdx}_${ts}.png`,
      marginL: mL, marginR: mR, marginT: mT, marginB: mB, thumbSize: 300, scaleFactor: scale, clipBounds,
    }
    stmts.push(db.prepare(
      `INSERT INTO auto_process_jobs
       (order_id, order_item_id, ai_analysis_id, ai_group_index, source_path, product, width_cm, height_cm, finishing, scale_factor, clip_bounds, margins, status, ia_params, entity_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
    ).bind(orderId, oi.id, aid, gIdx, an.file_path, productName, oi.width || 0, oi.height || 0, finishing, scale, JSON.stringify(clipBounds), JSON.stringify({ L: mL, R: mR, T: mT, B: mB }), JSON.stringify(iaParams), entityId))
  }
  for (let i = 0; i < stmts.length; i += 80) await db.batch(stmts.slice(i, i + 80))
  return stmts.length
}
