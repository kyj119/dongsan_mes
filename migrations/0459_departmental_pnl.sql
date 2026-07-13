-- 0459_departmental_pnl.sql
-- 부문(부서)별 손익 관리회계 P1 — 부문 마스터(계층) + 공정(category)→부문 매핑 + employees.department_id
-- 설계 정본: memory/design-departmental-pnl.md
-- 성격: 관리회계 전용(세무신고=법인단위 무관). 전부 추가형(신규 테이블 2 + 신규 컬럼 1). 기존 데이터 파괴 없음.

-- 1) 부문 마스터 (계층 트리: parent_id 자기참조 → 디자인 산하 하위부문 등 롤업 지원)
CREATE TABLE IF NOT EXISTS departments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL,
  parent_id    INTEGER REFERENCES departments(id),
  dept_type    TEXT    NOT NULL DEFAULT 'SUPPORT' CHECK (dept_type IN ('PRODUCTION','SUPPORT')), -- 매출발생 vs 공통(원가만)
  legacy_codes TEXT,   -- JSON 배열: 구 employees.department 코드(드리프트 브리지/백필 근거)
  sort_order   INTEGER NOT NULL DEFAULT 0,
  is_active    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))  -- UTC 저장(표시=KST)
);
CREATE INDEX IF NOT EXISTS idx_departments_parent ON departments(parent_id);

-- 2) 공정(items.category 실제값) → 부문 매핑 : 매출·자재비 귀속 엔진
CREATE TABLE IF NOT EXISTS department_category_map (
  category      TEXT    PRIMARY KEY,   -- items.category 실제 저장값
  department_id INTEGER NOT NULL REFERENCES departments(id)
);

-- 3) 직원 → 부문 FK (인건비 귀속). 레거시 employees.department(text)는 보존(제거 불가·SSOT 브리지).
ALTER TABLE employees ADD COLUMN department_id INTEGER REFERENCES departments(id);
CREATE INDEX IF NOT EXISTS idx_employees_department_id ON employees(department_id);

-- 4) 부문 시드 — 매출부문 4(출력/전사/간판/유통) + 지원부문(디자인 트리 + 관리/본사)
--    디자인=parent, 그 아래 디자인팀·봉제/후가공(사용자: 봉제는 디자인 산하). 하위부문 추가는 UI로.
INSERT INTO departments (id, name, parent_id, dept_type, legacy_codes, sort_order) VALUES
  (1, '출력',        NULL, 'PRODUCTION', '["PRODUCTION","PRINTING"]',       10),
  (2, '전사',        NULL, 'PRODUCTION', '["TRANSFER"]',                    20),
  (3, '간판',        NULL, 'PRODUCTION', '["UV_SIGN","SIGN"]',              30),
  (4, '유통',        NULL, 'PRODUCTION', '[]',                              40),
  (5, '디자인',      NULL, 'SUPPORT',    '[]',                              50),
  (6, '디자인팀',    5,    'SUPPORT',    '["DESIGN"]',                      51),
  (7, '봉제/후가공', 5,    'SUPPORT',    '["FINISHING","ASSEMBLY"]',        52),
  (8, '관리/본사',   NULL, 'SUPPORT',    '["OFFICE","EXECUTIVE","SALES","ADMIN_DEPT"]', 60);

-- 5) 공정→부문 매핑 시드 (items.category 실제값 기준; 미매핑=매출 귀속 제외=미분류)
INSERT INTO department_category_map (category, department_id) VALUES
  ('수성', 1), ('솔벤', 1), ('UV', 1), ('현수막', 1), ('배너', 1), ('스티커', 1),
  ('전사', 2), ('태극기', 2),
  ('간판', 3), ('현판', 3),
  ('상품', 4);
-- (원자재/부속품/기타/인코딩깨짐 등은 매출 아님 → 매핑 없음)

-- 6) 직원 부문 백필: 레거시 department → department_id (드리프트 실데이터 + enum 코드 양쪽 브리지)
UPDATE employees SET department_id = 1 WHERE department_id IS NULL AND department IN ('PRODUCTION','PRINTING');
UPDATE employees SET department_id = 2 WHERE department_id IS NULL AND department = 'TRANSFER';
UPDATE employees SET department_id = 3 WHERE department_id IS NULL AND department IN ('UV_SIGN','SIGN');
UPDATE employees SET department_id = 6 WHERE department_id IS NULL AND department = 'DESIGN';
UPDATE employees SET department_id = 7 WHERE department_id IS NULL AND department IN ('FINISHING','ASSEMBLY');
UPDATE employees SET department_id = 8 WHERE department_id IS NULL AND department IN ('OFFICE','EXECUTIVE','SALES','ADMIN_DEPT');
