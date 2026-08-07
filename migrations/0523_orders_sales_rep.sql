-- 주문서 담당자(sales_rep) 필드 신설 (2026-08-07)
--
-- 왜 필요한가: **담당자가 법인 귀속·실적의 판정 근거인데 MES 안에 없었다.**
--   · 청주(entity 3) 분리를 **거래처 화이트리스트**(`14_cheongju_move.sql`)로 대신하고 있었는데,
--     재현시스템처럼 **같은 거래처인데 담당자에 따라 법인이 갈리는** 경우를 그걸로는 못 가른다
--     (용준님: 「강지영 담당일 땐 선명에서 발행, 최인호로 바뀌고는 청주」). 실제로 6건이 잘못 가 있었다.
--   · 담당별 매출(분석문서 §3)도 이카운트 원본에서만 낼 수 있었다 — MES 로는 재현이 안 됐다.
--
-- ★ 왜 `users` 가 아니라 `employees` 인가
--   MES `users` 는 실계정 7명뿐이고 **정해선(동산 매출 52.9% 담당)에게 계정이 없다.**
--   로그인하지 않는 영업 담당까지 계정을 만들면 권한·비밀번호 관리 부담만 는다.
--   `employees` 는 이카운트 담당 12명이 **전원 존재**하고, 퇴사자도 `RESIGNED` 로 남아 있어
--   **이탈 담당의 과거 실적이 보존**된다(신은주 5월·최상호 6월 이탈 = §3 의 핵심 신호).
--   부서·직급도 이미 있어 부문별 손익과 자연스럽게 붙는다.
--
-- ★ `created_by`(등록자)와 **역할이 다르다** — 합치면 안 된다.
--   등록자 = 누가 입력했나(불변 감사기록) · 담당자 = 누가 책임지나(**바뀐다**).
--   둘을 같은 값으로 두면 담당이 한 번이라도 바뀐 뒤엔 과거 데이터에서 구분할 수 없게 된다.
--
-- 기본값 = **로그인 사용자**(용준님 선택). `employees.user_id` 로 users→employees 를 잇는다.
--   현재 employees.user_id 는 전원 비어 있어 이 마이그레이션에서 **이름 일치로 7명을 연결**한다
--   (실계정 7명 전부 employees 에 동명으로 존재함을 실측 확인. designer/admin/e2e/123 은 시스템 계정이라 제외).
--   ⚠️ 동명이인이 생기면 이 방식이 깨진다 — 이후로는 사용자 등록 시 직원을 직접 고르게 해야 한다.

ALTER TABLE orders ADD COLUMN sales_rep_id INTEGER REFERENCES employees(id);

-- 목록·실적 집계가 담당자로 필터/그룹하므로 인덱스를 둔다.
--   법인별 실적이 주 질의라 entity 와 복합으로 잡는다.
CREATE INDEX IF NOT EXISTS idx_orders_sales_rep ON orders(sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_orders_entity_sales_rep ON orders(entity_id, sales_rep_id);

-- users ↔ employees 연결 (이름 일치 · 실계정만)
UPDATE employees SET user_id = (
  SELECT u.id FROM users u
  WHERE u.name = employees.name AND u.is_active = 1
    AND u.username NOT IN ('designer', 'admin', 'e2e_tester', '123')
)
WHERE user_id IS NULL
  AND EXISTS (
    SELECT 1 FROM users u
    WHERE u.name = employees.name AND u.is_active = 1
      AND u.username NOT IN ('designer', 'admin', 'e2e_tester', '123')
  );
