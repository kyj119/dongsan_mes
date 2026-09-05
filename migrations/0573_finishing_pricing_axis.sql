-- 0573: 마감(봉제)에 **과금 축**을 만든다 — Phase 0 (청구액 영향 없음)
--
-- 무엇이 없었나:
--   후가공(`post_processing_options`)은 `pricing_type`·`unit_price` 가 있고 가산 계산도
--   `orderForm/calc.js` 에 이미 구현돼 있다(fixed·per_length·per_sqm·per_meter·per_unit).
--   그런데 **마감(`finishing_methods`)에는 가격 칸 자체가 없었다** — `margin_cm`(여백)만 있다.
--   용준님이 서비스로 빼주신다는 **줄미싱이 바로 이 축**이다(id 3 · margin 5 · group output).
--
-- 왜 `per_side_length` 인가:
--   `order_items.finishing` 은 **변별 JSON** 이다 — `{top:'줄미싱', bottom:'열재단', left:'줄미싱', ...}`.
--   그래서 「줄미싱인 변만」 길이를 더할 수 있다:
--     길이(m) = (상 ? 가로 : 0) + (하 ? 가로 : 0) + (좌 ? 세로 : 0) + (우 ? 세로 : 0) ÷ 100
--   후가공의 `per_meter`(둘레 전체 × 단가)로는 안 된다 — 변마다 방식이 다르기 때문이다.
--
-- ★단가는 전부 0으로 시작한다. 후가공 17종도 전부 0원이라 상태가 같고,
--   값이 채워지기 전까지 **금액이 한 푼도 바뀌지 않는다**(Phase 1 에서 조립을 붙인다).
--   ⚠️`열재단`·`원형나무`의 과금 기준은 아직 정해지지 않았다 — 열재단은 기본 재단이라 무료로 보이고
--     원형나무는 봉이 들어가니 개수 기준일 수 있다. 값을 채울 때 함께 정한다 → 지금은 'none'.
--
-- 되돌리기: 두 컬럼은 남겨 두고 `unit_price` 를 0 으로 되돌리면 동작이 원복된다
--   (D1 은 컬럼 제거가 사실상 불가 — [[feedback-d1-fk-column-removal]]).

-- ⚠️ADD COLUMN 은 멱등이 아니다. 이미 적용됐다면 이 두 줄만 지우고 나머지를 돌린다.
ALTER TABLE finishing_methods ADD COLUMN pricing_type TEXT NOT NULL DEFAULT 'none';
ALTER TABLE finishing_methods ADD COLUMN unit_price REAL NOT NULL DEFAULT 0;

-- 미싱 계열 = 변별 길이 과금. 이름에 '미싱'이 들어가는 것 + 전사 봉제(쌍침·오바).
UPDATE finishing_methods
   SET pricing_type = 'per_side_length'
 WHERE name LIKE '%미싱%' OR name IN ('쌍침', '오바');
