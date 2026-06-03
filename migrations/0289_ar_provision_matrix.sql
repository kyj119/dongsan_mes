-- 0289: 미수금 회수율 4-3b — IFRS9 단순화 provision matrix
-- 설계·딥리서치: docs/superpowers/specs/2026-06-03-receivables-purchase-barobill-brainstorm.md
-- aging 버킷별 손실률(단조증가) × 거래처 신용등급 승수 → 위험조정 회수액 = 잔액 × (1 - 유효손실률)

-- aging 버킷별 손실률 (편집 가능). 평탄값 금지 — 오래될수록 단조증가 (연구 검증).
CREATE TABLE IF NOT EXISTS ar_provision_rates (
  aging_bucket TEXT PRIMARY KEY,   -- CURRENT | D1_30 | D31_60 | D61_90 | D90_PLUS
  loss_rate REAL NOT NULL,         -- 0.0 ~ 1.0
  sort_order INTEGER DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO ar_provision_rates (aging_bucket, loss_rate, sort_order) VALUES
  ('CURRENT',  0.005, 1),
  ('D1_30',    0.02,  2),
  ('D31_60',   0.05,  3),
  ('D61_90',   0.15,  4),
  ('D90_PLUS', 0.40,  5);

-- 신용등급 승수 (세분화 — 단일 행렬은 부적합, 연구 권장: 등급을 손실률 승수로)
CREATE TABLE IF NOT EXISTS ar_grade_multipliers (
  grade TEXT PRIMARY KEY,          -- A | B | C | D | F | N/A
  multiplier REAL NOT NULL
);
INSERT OR IGNORE INTO ar_grade_multipliers (grade, multiplier) VALUES
  ('A', 0.5), ('B', 0.8), ('C', 1.0), ('D', 1.5), ('F', 2.5), ('N/A', 1.0);
