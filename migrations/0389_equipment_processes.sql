-- Migration 0389: 장비↔공정 매핑 (공장 배치도 P0)
-- spec: docs/superpowers/specs/2026-06-25-factory-layout-integration.md §4.2
-- 장비별 겸용 공정(M:N). process_code = 신모델 품목분류(items.category)와 1:1 코드
--   (AQUEOUS/SOLVENT/UV/TRANSFER/SUBLIMATION/SIGN, SSOT=src/constants/process.ts).
-- FK 미설정(인덱스만) — D1 FK 컬럼 영구제거 함정 회피 + process_code는 enum 상수라 FK 불요.
--   (장비 entity 격리는 equipment.entity_id 로 처리, 이 테이블은 equipment_id로 귀속)
CREATE TABLE IF NOT EXISTS equipment_processes (
  equipment_id TEXT NOT NULL,
  process_code TEXT NOT NULL,              -- 신모델 분류 코드 (SSOT)
  is_primary   INTEGER NOT NULL DEFAULT 0, -- 대표 공정 1개(배지·필터 기본)
  created_at   TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (equipment_id, process_code)
);

CREATE INDEX IF NOT EXISTS idx_eqproc_equipment ON equipment_processes(equipment_id);
CREATE INDEX IF NOT EXISTS idx_eqproc_process ON equipment_processes(process_code);
