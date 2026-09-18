-- 0623: 공휴일 달력에 법인 축 추가
--
-- 왜: 법인마다 쉬는 날이 다르다. 2026-08-03~05 는 **선명만** 여름휴가였는데
--   holidays 가 holiday_date PRIMARY KEY 라 전사 공통뿐이어서 등록할 방법이 없었다.
--   그 결과 선명 10명이 사흘씩 **결근**으로 잡혀 8월 결근공제 3,803,820원이 붙었다
--   (같은 달 동산은 24명 중 결근 1.5일). 이카운트에는 그 결근이 없어 급여가 어긋났다.
--   창립기념일·법인별 휴무는 앞으로도 생기므로 달력 자체에 축을 넣는다.
--
-- ★휴일은 attendance 를 고치지 않고 **달력에서 파생**한다(core.ts 주석 「달력만 바꾸면
--   자동 반영」). 그래서 이 축만 생기면 과거 급여도 재계산으로 바로 맞는다.
--
-- entity_id = 0 → 전 법인 공통(법정공휴일). >0 → 그 법인만.
--   ⚠️0 을 쓰는 이유: SQLite 는 UNIQUE 에서 NULL 을 서로 다른 값으로 봐서 중복이 뚫린다.
--     읽는 쪽은 `h.entity_id = 0 OR h.entity_id = <직원 법인>` 로 본다.
--     (전역 entityId=0 함정과 달리 여기 0 은 '전사'를 뜻하는 **저장값**이다 — falsy 체크 금지)

CREATE TABLE IF NOT EXISTS holidays_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  holiday_date TEXT NOT NULL,                 -- 'YYYY-MM-DD'
  entity_id INTEGER NOT NULL DEFAULT 0,       -- 0 = 전 법인
  name TEXT NOT NULL DEFAULT '공휴일',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(holiday_date, entity_id)
);

INSERT OR IGNORE INTO holidays_v2 (holiday_date, entity_id, name, created_at)
  SELECT holiday_date, 0, name, created_at FROM holidays;

DROP TABLE holidays;
ALTER TABLE holidays_v2 RENAME TO holidays;

CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(holiday_date);
CREATE INDEX IF NOT EXISTS idx_holidays_entity ON holidays(entity_id, holiday_date);
