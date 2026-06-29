// 창고별 다중행 재고 (UP1) — 공통 zone 해석 헬퍼
// spec: docs/superpowers/specs/2026-06-27-inventory-redesign-unified.md
//
// 재고 행 키 = (item_id, entity_id, storage_zone_id). NULL storage_zone = 미배정.
// UNIQUE INDEX idx_inventory_item_entity_zone ON inventory(item_id, entity_id, IFNULL(storage_zone_id, 0)).
//
// 입고(사용자 결정: 품목 기본창고 고정) + 소모(UP1 interim) 대상 창고 = items.storage_zone_id.
//   UP2에서 소모는 card.equipment → zone 파생으로 확장 예정.
//
// ── 쓰기경로 키잉 규칙 (모든 inventory UPDATE/INSERT가 반드시 따를 것) ──
//   UPDATE: WHERE item_id=? AND entity_id=? AND IFNULL(storage_zone_id,0)=IFNULL(?,0)
//   INSERT: storage_zone_id 명시 (없으면 미배정 NULL 행 생성됨)
//   존재 확인 후 분기(SELECT→UPDATE/INSERT) 또는 INSERT OR IGNORE + UPDATE 사용.
//   ⚠️ `WHERE item_id=? AND entity_id=?`만 쓰면 다중 창고 행을 동시에 건드림(버그).

import type { D1Database } from '@cloudflare/workers-types'

/** 법인의 기본 창고(is_default). 없으면 NULL. */
export async function getEntityDefaultZone(db: D1Database, entityId: number): Promise<number | null> {
  const d = await db
    .prepare('SELECT id FROM storage_zones WHERE entity_id = ? AND is_default = 1 AND is_active = 1 ORDER BY id LIMIT 1')
    .bind(entityId)
    .first<{ id: number }>()
  return d?.id ?? null
}

/**
 * 품목의 기본 재고 창고 id (법인 인식).
 *  - 미배정(items.storage_zone_id NULL) → NULL (미배정 유지)
 *  - 배정 zone이 요청 법인 소유(활성) → 그 zone
 *  - 타법인 zone 배정(법인 누수 위험) → 요청 법인 기본창고(없으면 NULL)
 *  ※ 품목은 법인 공유(items에 entity 없음)이나 창고는 법인 소유 → 입고/차감이 항상 자기 법인 창고에 안착.
 */
export async function getItemDefaultZone(db: D1Database, itemId: number, entityId: number): Promise<number | null> {
  const row = await db
    .prepare(
      `SELECT i.storage_zone_id AS zid, sz.entity_id AS zent, sz.is_active AS zact
         FROM items i LEFT JOIN storage_zones sz ON sz.id = i.storage_zone_id
        WHERE i.id = ?`
    )
    .bind(itemId)
    .first<{ zid: number | null; zent: number | null; zact: number | null }>()
  if (row?.zid == null) return null
  if (row.zent === entityId && row.zact === 1) return row.zid
  return getEntityDefaultZone(db, entityId)
}

/** 여러 품목의 기본 창고를 한 번에 (Map<item_id, zone_id|null>), 법인 인식. 입고 등 배치 경로용. */
export async function getItemDefaultZones(db: D1Database, itemIds: number[], entityId: number): Promise<Map<number, number | null>> {
  const map = new Map<number, number | null>()
  if (itemIds.length === 0) return map
  const entDefault = await getEntityDefaultZone(db, entityId)
  // D1 바인드 한도(~100) → 80개 청크
  for (let i = 0; i < itemIds.length; i += 80) {
    const chunk = itemIds.slice(i, i + 80)
    const ph = chunk.map(() => '?').join(',')
    const { results } = await db
      .prepare(
        `SELECT i.id AS iid, i.storage_zone_id AS zid, sz.entity_id AS zent, sz.is_active AS zact
           FROM items i LEFT JOIN storage_zones sz ON sz.id = i.storage_zone_id
          WHERE i.id IN (${ph})`
      )
      .bind(...chunk)
      .all<{ iid: number; zid: number | null; zent: number | null; zact: number | null }>()
    for (const r of results || []) {
      let resolved: number | null
      if (r.zid == null) resolved = null
      else if (r.zent === entityId && r.zact === 1) resolved = r.zid
      else resolved = entDefault
      map.set(Number(r.iid), resolved)
    }
  }
  return map
}

// ── UP2: 공간인식 소모 (장비 위치 → 소모 창고) ──────────────────────────────
// 데이터 체인: equipment.zone_id(→facility_zones, 0072) → storage_zones.facility_zone_id(0391)
// 한 배치도 구역에 창고가 여럿(N:1)일 수 있어 결정 규칙 필요: 차감법인 정합 + is_default 우선.
// 폴백(spec): 장비zone → 품목 기본창고 → 미배정(NULL). 장비 미배선이면 현행(품목 기본창고)과 동일 → 회귀 안전.

/**
 * 장비가 배치된 구역(facility_zone)에 매핑된 창고(storage_zone)를 해석.
 * @returns storage_zone.id | null (장비 미지정·zone 미배선·entity 정합 창고 부재 시)
 */
export async function resolveEquipmentZone(
  db: D1Database,
  equipmentId: string | null | undefined,
  entityId: number
): Promise<number | null> {
  if (!equipmentId) return null
  // 차감 법인(entityId)의 창고만 — 같은 물리 구역에 타법인 창고가 있어도 침범 금지.
  // 여럿이면 is_default 우선, 그다음 가장 낮은 id (결정적).
  const row = await db
    .prepare(
      `SELECT sz.id
         FROM equipment e
         JOIN storage_zones sz ON sz.facility_zone_id = e.zone_id
        WHERE e.id = ? AND e.zone_id IS NOT NULL
          AND sz.is_active = 1 AND sz.entity_id = ?
        ORDER BY sz.is_default DESC, sz.id ASC
        LIMIT 1`
    )
    .bind(equipmentId, entityId)
    .first<{ id: number }>()
  return row?.id ?? null
}

/**
 * 소모(차감) 대상 창고 해석 — 장비 위치 우선, 없으면 품목 기본창고, 없으면 미배정(NULL).
 * 인쇄 자동차감 등 "소모 장비가 명확한" 경로에서 사용. 장비 신호가 없는 경로(출고 피킹·수동 스캔)는
 * getItemDefaultZone을 직접 쓸 것(잘못된 장비 zone을 끌어오면 더 부정확).
 */
export async function resolveDeductionZone(
  db: D1Database,
  opts: { equipmentId: string | null | undefined; itemId: number; entityId: number }
): Promise<number | null> {
  const eqZone = await resolveEquipmentZone(db, opts.equipmentId, opts.entityId)
  if (eqZone != null) return eqZone
  return getItemDefaultZone(db, opts.itemId, opts.entityId)
}
