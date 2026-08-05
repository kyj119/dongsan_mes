-- G3 선행: 고정자산 → 부문 직접 지정
-- equipment 경유(자산→장비→공정→부문)는 막혔다. 세무장부 자산명이
--   "컴퓨터 및 주변기기 외" · "TELEIOS HEXA 외 5건" 처럼 **묶음 단위**라 장비 1:1 매핑이 원천적으로 안 된다
--   (확실한 매칭은 SUPERCOLOR H8 ↔ RIP-03 하나뿐이고 그마저 INACTIVE).
--   → 자산에 부문을 직접 붙인다. 상위 20건만 지정해도 월 감가상각의 92.5%가 부문에 정확히 귀속된다.
ALTER TABLE fixed_assets ADD COLUMN department_id INTEGER REFERENCES departments(id);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_dept ON fixed_assets(department_id);
