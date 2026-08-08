-- 담당자 소속 법인(default_entity_id) — 청주 거래처 화이트리스트 은퇴 (P5, 2026-08-08)
--
-- 지금까지 청주(entity 3) 분리는 `docs/sunmyung-import/14_cheongju_move.sql` 의
-- **거래처 11곳 하드코딩**이었다. 그 방식이 재현시스템 6건을 잘못 보냈다 —
-- 같은 거래처인데 담당자에 따라 법인이 갈리는 걸 거래처 목록으로는 표현할 수 없기 때문이다.
-- 담당자 필드(0523)가 생겼으니 판정 근거를 **데이터**로 옮긴다. 사람이 옮겨가면 이 값만 바꾸면 된다.
--
-- ★ 강제 규칙으로 만들지 않는다 (실측 근거)
--   담당 12명 중 **10명은 단일 법인**이지만 **2명은 두 법인에 걸친다**:
--     임선미 591건(e2 71 · e1 520) · 김용준 106건(e2 27 · e1 79)
--   「담당자 = 법인」을 create 시점에 강제하면 이 591건 같은 정상 거래가 깨진다.
--   법인협업 접수·청구 법인분할이 이미 지원되는 흐름이라 **막으면 안 된다**.
--   ⇒ default 는 **기본값 제안과 감사 기준**으로만 쓴다. `billingEntityId` 결정 순서
--     (명시 billing_entity_id > 세션 법인)는 건드리지 않는다 — 주문번호 채번의
--     불변식 「번호 E{eid} = 행 entity_id」가 거기 걸려 있다.
--
-- 값 설정 근거 = 실적 전수. 한 법인에만 나타나는 담당만 채우고, 걸치는 2명은 **NULL** 로 둔다
--   (틀린 기본값보다 없는 게 낫다).

ALTER TABLE employees ADD COLUMN default_entity_id INTEGER REFERENCES entities(id);

-- 단일 법인 담당만 설정. 두 법인에 걸치는 임선미·김용준은 제외한다.
UPDATE employees SET default_entity_id = (
  SELECT o.entity_id FROM orders o
  WHERE o.sales_rep_id = employees.id AND o.status != 'CANCELLED'
  GROUP BY o.entity_id ORDER BY COUNT(*) DESC LIMIT 1
)
WHERE id IN (
  SELECT sales_rep_id FROM orders
  WHERE sales_rep_id IS NOT NULL AND status != 'CANCELLED'
  GROUP BY sales_rep_id
  HAVING COUNT(DISTINCT entity_id) = 1
);
