-- 0525: 목록 화면 사용자별 설정 (2026-08-08)
--
-- 감사 docs/audits/2026-08-08-list-ux-ecount-gap.md 의 G8(조회조건 프리셋)·G9(열 선택)·G12(페이지당 건수).
-- settings 테이블은 전역 키-값(ADMIN 전용)이라 사용자별 저장에 쓸 수 없어 별도로 둔다.
--
-- 왜 서버인가: 같은 사람이 사무실 PC·디자인실 PC를 오가며 쓴다. localStorage 면 PC 마다 따로 놀고
-- 공용 PC 에서는 남의 설정이 보인다. (사용자 결정 2026-08-08)

-- 이름 붙여 저장하는 조회조건 세트 (이카운트 '조회조건 저장' 대응)
CREATE TABLE IF NOT EXISTS user_filter_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  page_key TEXT NOT NULL,               -- 'orders' | 'purchase-orders' | 'quotations' | 'receiving'
  name TEXT NOT NULL,
  params_json TEXT NOT NULL,            -- 화면 조회조건 스냅샷 (페이지가 정의하는 형태)
  is_default INTEGER NOT NULL DEFAULT 0, -- 1 = 페이지 진입 시 자동 적용
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, page_key, name),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ufp_user_page ON user_filter_presets(user_id, page_key);

-- 가벼운 화면 설정 (열 표시 여부·페이지당 건수 등). 키 하나에 값 하나.
CREATE TABLE IF NOT EXISTS user_ui_prefs (
  user_id INTEGER NOT NULL,
  pref_key TEXT NOT NULL,               -- 'orders.columns' | 'orders.pageSize' | ...
  pref_value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, pref_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
