-- 0324: 호수별 단가표 (깃발·태극기 GRADE 엔진, Phase 1a)
-- 근거: item-master-review B-2(빠진 GRADE 엔진) / spec 2026-06-19-item-master-load-phase1
-- pricing_profile='GRADE' 품목의 호수 → 단가 룩업. 단가=법인 공유(entity_id 없음, 단가정책 정합).
-- 데이터(호수별 단가)는 희소 → 구조 먼저, 값 백필은 운영 단계.
CREATE TABLE IF NOT EXISTS size_grade_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  grade TEXT NOT NULL,             -- 호수: 1호~8호/특호/수기/대형 등
  price REAL NOT NULL DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  UNIQUE(item_id, grade)
);
CREATE INDEX IF NOT EXISTS idx_size_grade_item ON size_grade_prices(item_id);
