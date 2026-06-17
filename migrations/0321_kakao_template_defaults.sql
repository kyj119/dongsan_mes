-- 0321: 카카오 알림톡 발송 위치별 기본 템플릿 매핑
--
-- 발송 위치(context)·세부조건(match_key)·법인(entity_id)별로 기본 선택될 template_code 저장.
-- resolve 우선순위: (context, match_key, entity) → (context, '', entity) → 없으면 수동.
-- 템플릿명(template_code = 바로빌 TemplateName)은 동산·선명 동일이라 시드는 공통값.

CREATE TABLE IF NOT EXISTS kakao_template_defaults (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  context TEXT NOT NULL,                       -- shipments / ledger / messages / shell:<related_type>
  match_key TEXT NOT NULL DEFAULT '',          -- 출고 섹션(freight/hanjin/daesintaekbae/quick) 등, 빈값=context 공통
  entity_id INTEGER NOT NULL DEFAULT 1 REFERENCES entities(id),
  template_code TEXT NOT NULL DEFAULT '',
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(context, match_key, entity_id)
);

-- 시드: 동산(1)·선명(2) 공통값. 출고는 섹션별, 미수금은 공통.
-- 한진택배(hanjin)는 승인 템플릿 미등록 → 시드 제외(등록 후 관리자 설정에서 추가).
INSERT INTO kakao_template_defaults (context, match_key, entity_id, template_code) VALUES
  ('shipments', 'freight',       1, '대신화물 출고'),
  ('shipments', 'daesintaekbae', 1, '대신택배 출고'),
  ('shipments', 'quick',         1, '방문 수령 준비 완료'),
  ('ledger',    '',              1, '거래내역,미수금 안내'),
  ('shipments', 'freight',       2, '대신화물 출고'),
  ('shipments', 'daesintaekbae', 2, '대신택배 출고'),
  ('shipments', 'quick',         2, '방문 수령 준비 완료'),
  ('ledger',    '',              2, '거래내역,미수금 안내')
ON CONFLICT(context, match_key, entity_id) DO UPDATE SET template_code = excluded.template_code;
