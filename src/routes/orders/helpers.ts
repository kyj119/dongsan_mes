/**
 * orders/helpers.ts — 주문 공유 헬퍼 (core.ts에서 분리, 2026-06-11 대형파일 분할)
 *
 * 카드 그룹 판정 / 담당 법인 추천 / 청구 그룹 재계산 / 청구 상태 설정 / 카드 생성.
 * POST(create)·PUT(update)·lifecycle 라우트 + approvals.ts(동적 import)에서 공유.
 * 순수 로직 — 라우트 등록 순서와 무관. ⚠️ 이동만, 로직 수정 0.
 */

// card_group 결정 함수: 품목의 카드 그룹(생산 라인)을 결정
function getCardGroup(item: any): string | null {
  // 0. 기성품/유통(production_required=0): 제작 불필요 → 카드 미생성 (카테고리 매칭보다 우선)
  //    태극기 호수별 등 "생산 카테고리"라도 기성품이면 여기서 즉시 제외 → shipment_ready로 즉시 출고
  if (item.production_required === 0) return null
  // 1. print_method_id가 있으면 → print_methods.card_group 사용
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
  db: D1Database, orderId: number, status: 'BILLED' | 'PAID' | null, billedBy: number | null
): Promise<boolean> {
  if (status === 'BILLED') {
    const r = await db.batch([
      db.prepare(`UPDATE order_billing_groups SET billing_status = 'BILLED', billed_at = CURRENT_TIMESTAMP, billed_by = ?
                  WHERE order_id = ? AND billing_status IS NOT 'BILLED' AND billing_status IS NOT 'PAID'`).bind(billedBy, orderId),
      db.prepare(`UPDATE orders SET billing_status = 'BILLED', billed_at = CURRENT_TIMESTAMP, billed_by = ?, billed_amount = final_amount, updated_at = CURRENT_TIMESTAMP
                  WHERE id = ? AND billing_status IS NOT 'BILLED' AND billing_status IS NOT 'PAID'`).bind(billedBy, orderId)
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
      db.prepare(`UPDATE order_billing_groups SET billing_status = NULL, billed_at = NULL, billed_by = NULL WHERE order_id = ?`).bind(orderId),
      db.prepare(`UPDATE orders SET billing_status = NULL, billed_at = NULL, billed_by = NULL, billed_amount = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(orderId)
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
}

export async function generateCardsForOrder(params: GenerateCardsParams): Promise<number> {
  const { db, orderId, orderNumber, clientId, deliveryDate, priority, notes, entityId } = params
  const cardPriority = priority === 'URGENT' ? 1 : 0

  const client = await db.prepare(`
    SELECT client_name FROM clients WHERE id = ?
  `).bind(clientId).first<{ client_name: string }>()

  const { results: orderItems } = await db.prepare(`
    SELECT oi.*, i.category, i.sub_category, i.print_method_id, i.print_media_id,
           i.item_type, i.production_required, pm.card_group as print_method_card_group
    FROM order_items oi
    LEFT JOIN items i ON oi.item_id = i.id
    LEFT JOIN print_methods pm ON i.print_method_id = pm.id
    WHERE oi.order_id = ?
    ORDER BY oi.sort_order ASC
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

  // 카드 그룹핑: 카드그룹 × 담당법인(assigned_entity_id). 타법인 담당 품목은 별도 카드로 그 법인(requesting_entity_id)에 배정.
  // assigned_entity_id NULL = 청구 법인(entityId) 담당 → 단일 법인 주문은 기존과 동일(전부 entityId).
  const effEntityOf = (it: OIRow): number | null => {
    const a = it.assigned_entity_id
    return (a !== null && a !== undefined) ? Number(a) : (entityId ?? null)
  }
  const itemsByCardGroup = new Map<string, Array<{ item: OIRow; ppJson: string | null; qty: number; cardGroup: string; reqEntity: number | null }>>()

  for (const item of regularItems) {
    const cg = getCardGroup(item)
    if (!cg) continue
    const ee = effEntityOf(item)
    const key = `${cg}__${ee ?? 'null'}`
    if (!itemsByCardGroup.has(key)) itemsByCardGroup.set(key, [])
    itemsByCardGroup.get(key)!.push({ item, ppJson: (item.post_processing as string) || null, qty: (item.quantity as number) || 0, cardGroup: cg, reqEntity: ee })
  }

  for (const child of childItems) {
    const parent = parentMap.get(child.parent_item_id as number)
    if (!parent) continue
    const cg = getCardGroup(parent)
    if (!cg) continue
    const ee = effEntityOf(parent)  // 자식은 부모 담당 법인 상속
    const key = `${cg}__${ee ?? 'null'}`
    if (!itemsByCardGroup.has(key)) itemsByCardGroup.set(key, [])
    itemsByCardGroup.get(key)!.push({ item: child, ppJson: (parent.post_processing as string) || null, qty: 1, cardGroup: cg, reqEntity: ee })
  }

  // shipment_ready: 카드 미생성 품목은 바로 출고 준비 완료
  const cardGroupItems = new Set<number>()
  for (const entries of itemsByCardGroup.values()) {
    for (const entry of entries) cardGroupItems.add(entry.item.id as number)
  }
  const noCardItems = (orderItems as OIRow[]).filter((i) => !cardGroupItems.has(i.id as number))
  if (noCardItems.length > 0) {
    const ids = noCardItems.map((i) => i.id as number)
    await db.prepare(
      `UPDATE order_items SET shipment_ready = 1 WHERE id IN (${ids.map(() => '?').join(',')})`
    ).bind(...ids).run()
  }

  // D1 batch로 원자적 카드 생성
  const cardStatements: D1PreparedStatement[] = []
  const cardGroupEntries: Array<{ cardNumber: string; entries: Array<{ item: OIRow; ppJson: string | null; qty: number }> }> = []

  let cardIndex = 0
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

    cardGroupEntries.push({ cardNumber, entries })
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

  // card_items INSERT (카드 ID 기반)
  const itemStatements: D1PreparedStatement[] = []
  for (let i = 0; i < batchResults.length; i++) {
    const cardId = batchResults[i].meta.last_row_id
    for (const entry of cardGroupEntries[i].entries) {
      itemStatements.push(
        db.prepare(`INSERT INTO card_items (card_id, order_item_id, quantity) VALUES (?, ?, ?)`)
          .bind(cardId, entry.item.id as number, entry.qty)
      )
    }
  }
  if (itemStatements.length > 0) {
    await db.batch(itemStatements)
  }

  return cardStatements.length
}
