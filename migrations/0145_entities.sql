-- 0145: 멀티사업자(Multi-Entity) 기반 - entities 테이블
CREATE TABLE IF NOT EXISTS entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                    -- 정식 상호명
  short_name TEXT NOT NULL,              -- 약칭 (UI 표시용)
  business_reg_no TEXT,                  -- 사업자등록번호 (000-00-00000)
  representative TEXT,                   -- 대표자명
  business_type TEXT,                    -- 업태
  business_item TEXT,                    -- 종목
  address TEXT,
  phone TEXT,
  email TEXT,
  tax_email TEXT,                        -- 세금계산서 수신 이메일
  popbill_corp_num TEXT,                 -- 팝빌 corpNum (사업자번호 하이픈 없이)
  bank_info TEXT,                        -- 입금 계좌 정보 (JSON)
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 시드: 3개 사업자 (실제 상호명은 용준님이 추후 수정)
INSERT INTO entities (id, name, short_name, sort_order) VALUES
  (1, '동산기획', '동산기획', 1),
  (2, '선명', '선명', 2),
  (3, '동산기획(청주)', '동산기획(청주)', 3);
