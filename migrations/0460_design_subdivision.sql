-- 0460_design_subdivision.sql
-- 디자인 부문 하위 3팀(출력/전사/간판) 미러링 + serves_department_id(반직접 인건비 귀속)
-- 사용자: "디자인도 사실상 전사·출력·간판 3부서로 나뉜다". 봉제/후가공은 디자인 산하 공통.
-- 설계 정본: memory/design-departmental-pnl.md. 추가형(컬럼1 + 부문2 + 재정의).

-- SUPPORT 하위부문이 지원하는 생산부문(P4 리포트에서 그 부문 원가로 직접 귀속 토글용). NULL=공통.
ALTER TABLE departments ADD COLUMN serves_department_id INTEGER REFERENCES departments(id);

-- 디자인팀(6) → '디자인-출력'으로 재정의, serves=출력(1). 기존 DESIGN 17명은 그대로 유지(운영 UI로 전사/간판 세분).
UPDATE departments SET name='디자인-출력', serves_department_id=1, sort_order=53 WHERE id=6;

-- 디자인-전사/간판 신설 (초기 직원 0 — 운영 배정)
INSERT INTO departments (id, name, parent_id, dept_type, legacy_codes, serves_department_id, sort_order) VALUES
  (10, '디자인-전사', 5, 'SUPPORT', '[]', 2, 54),
  (11, '디자인-간판', 5, 'SUPPORT', '[]', 3, 55);

-- 봉제/후가공(7): serves = NULL 유지(여러 생산부문 지원 = 공통, P5 배부 대상)
