-- 공휴일(법정공휴일) 달력 — 평일 공휴일 근무를 휴일근로(×1.5)로 인정하기 위함
-- CAPS 인제스트/재분류가 휴일 판정 시 토·일 OR 이 테이블의 날짜를 HOLIDAY로 분류.
-- 날짜 데이터는 요율관리 > 공휴일 탭에서 '기본 공휴일 불러오기'로 적재 후 검증/수정.
CREATE TABLE IF NOT EXISTS holidays (
  holiday_date TEXT PRIMARY KEY,        -- 'YYYY-MM-DD'
  name TEXT NOT NULL DEFAULT '공휴일',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
