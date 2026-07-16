-- 0463_designer_intakes.sql
-- IA 디자이너 세션 루프 P0 — 가공 대기함(designer_intakes)
-- 설계 정본: docs/superpowers/specs/2026-07-16-ia-designer-session-loop.md §4.4
-- 성격: 전부 추가형(신규 테이블 1). 기존 데이터 파괴 없음.
-- 흐름: 디자이너 세션 가공 → manifest → 에이전트 ingest 등록(waiting)
--       → 주문서 프리필 피커 흡수(absorbed, order_item_id 연결) | 취소(void)

CREATE TABLE IF NOT EXISTS designer_intakes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id       INTEGER NOT NULL DEFAULT 1,
  ai_analysis_id  INTEGER REFERENCES ai_analysis_requests(id), -- work.ai 분석 레코드(임포지션 팔레트 호환)
  client_name     TEXT    NOT NULL,                            -- 디자이너 입력(자유 텍스트)
  client_id       INTEGER REFERENCES clients(id),              -- 매칭 성공 시(자동/흡수 시 확정)
  qty             INTEGER NOT NULL DEFAULT 1,
  finishing_json  TEXT,                                        -- per-side JSON {top,bottom,left,right}
  width_cm        REAL,                                        -- 실측(선택 객체 bbox)
  height_cm       REAL,
  scale_pct       INTEGER NOT NULL DEFAULT 100,                -- 저장 %(100/50/25/20/10) → scale_factor=100/pct
  trim            INTEGER NOT NULL DEFAULT 0,                  -- 돔보 여부
  mode            TEXT    NOT NULL DEFAULT 'single' CHECK (mode IN ('single','impose','both')),
  eps_path        TEXT,                                        -- 가공 완료 EPS (Z: 경로)
  work_ai_path    TEXT,                                        -- 정제 work.ai (Z: 경로)
  status          TEXT    NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','absorbed','void')),
  order_item_id   INTEGER REFERENCES order_items(id),          -- 흡수 시 연결
  registered_by   TEXT,                                        -- PC명\사용자 (manifest)
  pc_name         TEXT,
  script_version  TEXT,
  outline_failed  INTEGER NOT NULL DEFAULT 0,                  -- 아웃라인 우아 강등 플래그
  memo            TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),  -- UTC 저장(표시=KST)
  absorbed_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_designer_intakes_status ON designer_intakes(entity_id, status);
CREATE INDEX IF NOT EXISTS idx_designer_intakes_client ON designer_intakes(client_name);
CREATE INDEX IF NOT EXISTS idx_designer_intakes_analysis ON designer_intakes(ai_analysis_id);
