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

/** 품목의 기본 재고 창고 id. NULL = 미배정(아직 창고 미지정). */
export async function getItemDefaultZone(db: D1Database, itemId: number): Promise<number | null> {
  const row = await db
    .prepare('SELECT storage_zone_id FROM items WHERE id = ?')
    .bind(itemId)
    .first<{ storage_zone_id: number | null }>()
  return row?.storage_zone_id ?? null
}

/** 여러 품목의 기본 창고를 한 번에 (Map<item_id, zone_id|null>). 입고 등 배치 경로용. */
export async function getItemDefaultZones(db: D1Database, itemIds: number[]): Promise<Map<number, number | null>> {
  const map = new Map<number, number | null>()
  if (itemIds.length === 0) return map
  // D1 바인드 한도(~100) → 80개 청크
  for (let i = 0; i < itemIds.length; i += 80) {
    const chunk = itemIds.slice(i, i + 80)
    const ph = chunk.map(() => '?').join(',')
    const { results } = await db
      .prepare(`SELECT id, storage_zone_id FROM items WHERE id IN (${ph})`)
      .bind(...chunk)
      .all<{ id: number; storage_zone_id: number | null }>()
    for (const r of results || []) map.set(Number(r.id), r.storage_zone_id ?? null)
  }
  return map
}
