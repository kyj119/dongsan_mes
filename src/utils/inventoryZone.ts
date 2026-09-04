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
 *  - 미배정(items.storage_zone_id NULL) → **요청 법인 기본창고**(없으면 NULL)
 *  - 배정 zone이 요청 법인 소유(활성) → 그 zone
 *  - 타법인 zone 배정(법인 누수 위험) → 요청 법인 기본창고(없으면 NULL)
 *  ※ 품목은 법인 공유(items에 entity 없음)이나 창고는 법인 소유 → 입고/차감이 항상 자기 법인 창고에 안착.
 *
 * ★2026-09-04 변경 — 종전엔 첫 줄이 **NULL 을 그대로 반환**했다. 그래서 축1 없는 품목이 입고되면
 *   구역 없는 재고 행이 생겼고, 그 행은 **어느 구역 실사에도 안 뜬다**(실사는 storage_zone_id 로 잡는다).
 *   그렇게 쌓인 44행을 `0565` 로 치웠는데, 뿌리를 안 고치면 다시 쌓인다.
 *   ⚠️차감도 이 헬퍼를 쓴다 — 종전엔 음수가 **보이지 않는 NULL 행**에 생겼다. 이제 기본창고에
 *     생겨 실사표에 드러난다. 오류를 없애는 게 아니라 **보이게** 만드는 변경이다.
 *   ⚠️적용 전 실측(2026-09-04): 축1 NULL 매입품목 643개 중 재고 행이 있는 건 61개이고 **전부 선명2**,
 *     그런데 선명2 가 선명의 기본창고라 폴백 결과가 같다 → **동작 변화 0**.
 *     「축1 NULL 인데 기본창고가 아닌 구역에 재고」는 **0건**이었다. 청주·오다플래그는 구역이 0개라
 *     폴백이 NULL 을 돌려준다(종전과 동일).
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
  // ⚠️「행이 없다」와 「행은 있는데 축1 이 NULL」을 구분한다 — 없는 품목에 창고를 돌려주면
  //    호출부가 유령 재고 행을 만든다(자체검증이 첫 실행에서 잡았다).
  if (!row) return null
  if (row.zid == null) return getEntityDefaultZone(db, entityId)
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
      // 단수판(getItemDefaultZone)과 **같은 규칙**이어야 한다 — 갈리면 배치 입고만 미배정이 된다.
      if (r.zid == null) resolved = entDefault
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
 * 소모(차감) 대상 창고 해석 — 품목 기본창고, 없으면 **법인 기본창고**(그것도 없으면 NULL).
 * equipmentId는 시그니처 유지용(공간인식 재도입 대비). 현재는 미사용.
 */
export async function resolveDeductionZone(
  db: D1Database,
  opts: { equipmentId: string | null | undefined; itemId: number; entityId: number }
): Promise<number | null> {
  return getItemDefaultZone(db, opts.itemId, opts.entityId)
}
