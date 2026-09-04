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
 * 소모(차감) 대상 창고 해석.
 *
 * ★**입고와 차감은 다른 물음이다** — 「어디로 넣을지」는 의도(품목 기본창고)이고,
 *   「어디서 뺄지」는 **실제 위치**다. 종전엔 둘 다 `getItemDefaultZone` 을 써서, 자재가 현수막실에
 *   있는데 축1 이 출력실이면 **출력실이 음수가 되고 현수막실은 그대로**였다.
 *
 * 규칙 (2026-09-04)
 *   ① 양수 재고가 있는 구역이 **정확히 하나**면 그 구역 — 실제 케이스의 전부다.
 *   ② 여럿이면 **품목 기본창고가 그중에 있으면 그것**, 없으면 **최다 보유 구역**
 *      (동률은 `storage_zone_id` 오름차순 — 정렬에 tie-break 가 없으면 어느 구역에서 빠지는지가
 *       실행마다 달라진다. 표시가 아니라 **쓰기 대상**이므로 반드시 고정한다).
 *   ③ 재고가 어디에도 없으면 입고 규칙(`getItemDefaultZone`)을 그대로 쓴다 — 음수는 거기 생긴다.
 *
 * ⚠️적용 시점 실측(2026-09-04): 양수 재고를 가진 203품목이 **전부 단일 구역**이고,
 *   축1(또는 폴백)이 가리키는 구역과 실제 보유 구역이 **어긋난 사례가 0건**이었다.
 *   즉 이 변경은 **동작 변화 0**이다 — 구멍이 열리기 전에 닫는다.
 *
 * equipmentId는 시그니처 유지용(공간인식 재도입 대비). 현재는 미사용.
 */
export async function resolveDeductionZone(
  db: D1Database,
  opts: { equipmentId: string | null | undefined; itemId: number; entityId: number }
): Promise<number | null> {
  const { results } = await db
    .prepare(
      `SELECT storage_zone_id AS zid, quantity AS qty FROM inventory
        WHERE item_id = ? AND entity_id = ? AND quantity > 0 AND storage_zone_id IS NOT NULL
        ORDER BY quantity DESC, storage_zone_id ASC`
    )
    .bind(opts.itemId, opts.entityId)
    .all<{ zid: number; qty: number }>()
  const rows = results || []
  if (rows.length === 0) return getItemDefaultZone(db, opts.itemId, opts.entityId)
  if (rows.length === 1) return rows[0].zid
  const preferred = await getItemDefaultZone(db, opts.itemId, opts.entityId)
  if (preferred != null && rows.some((r) => r.zid === preferred)) return preferred
  return rows[0].zid
}

// ── 입고 귀속 창고 SQL — 화면·큐·배지가 **같은 문장**을 써야 한다 ──────────────
//
// 「이 발주 라인이 어느 창고로 들어오나」를 SQL 로 푸는 자리가 4곳(발주 상세·입고 큐·큐 카운트·
// nav 배지)이었고 전부 `COALESCE(poi.storage_zone_id, i.storage_zone_id)` 사본이었다.
// 그 식은 **법인을 안 본다** — 선명 발주 991건이 동산기획 출력실 담당자에게 귀속돼 있었다.
//
// ★규칙은 `getItemDefaultZone` 과 같아야 한다:
//   ①발주 라인 지정 ②품목 기본창고가 이 법인의 활성 구역이면 그것 ③타법인 구역이면 이 법인 기본창고.
//   ⚠️`items.storage_zone_id` 가 NULL 이면 NULL 로 둔다 — 미배정 입고에는 담당자가 없다.
//      (헬퍼는 법인 기본창고로 폴백하지만, 그건 **행을 만들 때**의 규칙이고 여기는 **담당자 귀속**이다.
//       담당자 없는 라인을 기본창고 담당자에게 떠넘기지 않는다.)
//
// 요구 별칭 = `poi`(발주 라인) · `i`(품목) · `po`(발주). 결과 별칭 = `sz`(귀속 구역) · `iz`(품목 기본창고).
export const RECEIVING_ZONE_JOIN_SQL = `
      LEFT JOIN storage_zones iz ON iz.id = i.storage_zone_id
      LEFT JOIN storage_zones sz ON sz.id = COALESCE(
        poi.storage_zone_id,
        CASE WHEN iz.entity_id = po.entity_id AND iz.is_active = 1 THEN iz.id END,
        CASE WHEN iz.id IS NOT NULL THEN (
          SELECT dz.id FROM storage_zones dz
           WHERE dz.entity_id = po.entity_id AND dz.is_default = 1 AND dz.is_active = 1
           ORDER BY dz.id LIMIT 1
        ) END
      )`

/** 같은 규칙의 SELECT 절 표현 — `effective_zone_id` 로 쓰는 곳용. */
export const RECEIVING_ZONE_EXPR_SQL = `COALESCE(
        poi.storage_zone_id,
        CASE WHEN iz.entity_id = po.entity_id AND iz.is_active = 1 THEN iz.id END,
        CASE WHEN iz.id IS NOT NULL THEN (
          SELECT dz.id FROM storage_zones dz
           WHERE dz.entity_id = po.entity_id AND dz.is_default = 1 AND dz.is_active = 1
           ORDER BY dz.id LIMIT 1
        ) END
      )`
