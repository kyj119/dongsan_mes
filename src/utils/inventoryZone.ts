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

// ── UP2: 소모(차감) 대상 창고 해석 ──────────────────────────────────────────
// 0440: 창고 배치도 독립으로 facility_zone 매핑(0391) deprecated → 구 체인
//   (equipment.zone_id → storage_zones.facility_zone_id) 제거. prod 매핑 0건이라
//   실동작은 항상 품목 기본창고 폴백이었음 = 동작 불변.
// 공간인식 소모를 재도입하려면 equipment → storage_zone 직접 링크(신규 컬럼)로 재배선할 것.

/**
 * 소모(차감) 대상 창고 해석 — 품목 기본창고, 없으면 미배정(NULL).
 * equipmentId는 시그니처 유지용(공간인식 재도입 대비). 현재는 미사용.
 */
export async function resolveDeductionZone(
  db: D1Database,
  opts: { equipmentId: string | null | undefined; itemId: number; entityId: number }
): Promise<number | null> {
  return getItemDefaultZone(db, opts.itemId, opts.entityId)
}
