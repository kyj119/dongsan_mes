-- 0586: 거래처별 발주 담당자 (법인 × 거래처 → 사람)
--
-- 왜 (2026-09-08, 용준님):
--   「선명에서 운산직물 발주건은 강지영 과장이 담당한다」 같은 규칙을 담을 자리가 없었다.
--   `clients` 에는 **`entity_id` 가 없다**(법인 공유) — 그래서 「선명에서는 강지영, 동산에서는 한두선」을
--   한 칸에 못 넣는다. 담당은 (법인, 거래처) 쌍에 붙으므로 별도 매핑이 필요하다.
--
-- ★자재 위치(구역 담당)와 **다른 축**이다:
--     구역 담당 = 「이 자재를 **받는** 사람」  (`storage_zones.manager_id`)
--     발주 담당 = 「이 거래처에 **주문하는** 사람」 (여기)
--   대개 같은 사람이지만 항상 그렇지는 않다 — 한 거래처가 여러 구역 자재를 팔면 갈린다.
--
-- ★씨앗은 **손으로 넣지 않는다** — 2026년 매입 이력에서 역산한다:
--   그 거래처에서 산 품목 → 그 품목의 귀속 구역 → 구역 담당자, 매입액이 가장 큰 담당자를 고른다.
--   137개 (법인×거래처) 중 구역이 잡히는 것만 들어온다. 나머지는 품목 구역 배정이 끝나면
--   같은 쿼리를 다시 돌려 채울 수 있다(이 마이그레이션은 멱등이라 재실행해도 기존 배정을 덮지 않는다).
--
-- ⚠️ `ROW_NUMBER() OVER (...)` 는 **어느 행이 선택되는지**를 정하는 쓰기 경로다 —
--    `ORDER BY` 에 고유키 tie-break(`sz.id`)를 반드시 둔다. 없으면 같은 금액일 때
--    실행마다 담당자가 달라진다(CLAUDE.md 「목록 정렬 = 고유키 tie-break 필수」).
--
-- ⚠️ 귀속 구역 식은 `utils/inventoryZone.RECEIVING_ZONE_JOIN_SQL` 과 **같아야** 한다.
--    (2026-09-08 개정: 재고 행 → 품목 기본창고 → 법인 기본창고 순)
--    여기 사본이 생긴 것은 마이그레이션이 TS 를 못 부르기 때문이고, **판정 정본은 그쪽**이다.
--
-- 되돌리기: `DROP TABLE supplier_owners`.

CREATE TABLE IF NOT EXISTS supplier_owners (
  entity_id   INTEGER NOT NULL REFERENCES entities(id),
  client_id   INTEGER NOT NULL REFERENCES clients(id),
  -- NULL = 아직 정하지 않음. 행이 있는데 담당자가 없는 것과 행 자체가 없는 것을 구분한다.
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  note        TEXT,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_by  INTEGER REFERENCES users(id),
  PRIMARY KEY (entity_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_owners_user ON supplier_owners(user_id);

-- ── 씨앗 = 2026 매입 이력에서 역산 ──────────────────────────────────────────
INSERT OR IGNORE INTO supplier_owners (entity_id, client_id, user_id, note)
SELECT t.entity_id, t.supplier_id, t.manager_id, '2026 매입 이력 역산(자동)'
  FROM (
    SELECT po.entity_id                AS entity_id,
           po.supplier_id              AS supplier_id,
           sz.manager_id               AS manager_id,
           ROW_NUMBER() OVER (
             PARTITION BY po.entity_id, po.supplier_id
             ORDER BY SUM(poi.amount) DESC, sz.id ASC
           ) AS rn
      FROM purchase_order_items poi
      JOIN purchase_orders po ON po.id = poi.po_id
      LEFT JOIN items i ON i.id = poi.item_id
      LEFT JOIN storage_zones iz ON iz.id = i.storage_zone_id
      LEFT JOIN storage_zones sz ON sz.id = COALESCE(
        poi.storage_zone_id,
        (SELECT v.storage_zone_id
           FROM inventory v
           JOIN storage_zones vz ON vz.id = v.storage_zone_id
                                AND vz.is_active = 1 AND vz.entity_id = po.entity_id
          WHERE v.item_id = poi.item_id AND v.entity_id = po.entity_id
          ORDER BY (CASE WHEN v.quantity > 0 THEN 0 ELSE 1 END), v.storage_zone_id
          LIMIT 1),
        CASE WHEN iz.entity_id = po.entity_id AND iz.is_active = 1 THEN iz.id END,
        CASE WHEN iz.id IS NOT NULL THEN (
          SELECT dz.id FROM storage_zones dz
           WHERE dz.entity_id = po.entity_id AND dz.is_default = 1 AND dz.is_active = 1
           ORDER BY dz.id LIMIT 1
        ) END
      )
     WHERE po.order_date >= '2026-01-01'
       AND po.status <> 'CANCELLED'
       AND po.supplier_id IS NOT NULL
       AND sz.manager_id IS NOT NULL
     GROUP BY po.entity_id, po.supplier_id, sz.manager_id, sz.id
  ) t
 WHERE t.rn = 1;
