-- 라인별 파일 1:N — 재단 완성 시트의 칼선(DXF)을 EPS 와 나란히 주문 라인에 붙인다.
-- 여태 라인→파일은 order_items.ai_file_id 하나뿐(1:1)이라 "EPS + DXF" 두 개를 못 실었다.
--   재단 패널은 EPS 와 **같은 이름의 DXF** 를 나란히 만드는데(mes-cut-host.jsx: nestRegister),
--   -3 완성본 passthrough 가 EPS 한 장만 복사해 칼선이 주문에서 사라졌다.
-- order_ai_files 를 재사용한다(주문 단위 소스 파일 목록). 컬럼 2개만 늘려 라인 소속과 종류를 준다:
--   order_item_id NULL = 기존 주문 단위 소스 파일(동작 불변) / 값 있음 = 그 라인에 붙는 파일
--   kind 'source'  = 기존 AI 소스 / 'dxf' = 재단 칼선
ALTER TABLE order_ai_files ADD COLUMN order_item_id INTEGER REFERENCES order_items(id);
ALTER TABLE order_ai_files ADD COLUMN kind TEXT DEFAULT 'source';
CREATE INDEX IF NOT EXISTS idx_order_ai_files_item ON order_ai_files(order_item_id, kind);
