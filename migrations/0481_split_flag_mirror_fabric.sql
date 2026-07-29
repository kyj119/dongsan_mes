-- 0481_split_flag_mirror_fabric.sql
-- 자재그룹 분류 정정 — 깃발천·미러천이 '수성 현수막원단 1코팅' 그룹에 섞여 있던 것을 분리.
--
-- 배경: 0480(코인텍 코팅지) 배포 직후 dup_widths 감사가 잡은 건.
--   수성 현수막원단 1코팅  700mm : AQ1-070 ↔ GITBAL-070(깃발천)
--                          900mm : AQ1-090 ↔ MIRROR-090(미러천)
--   이름 그대로 별개 자재다(현수막 원단 ≠ 깃발천 ≠ 미러천). 그룹의 나머지 21품목은
--   전부 AQ1-* 동일 자재의 폭 변종이라, 이 둘만 겉돌고 있었다.
--
-- 각각 1품목뿐이므로 그룹명 = 품목명(프로젝트 관행: 단독 품목은 동명 그룹).
-- 분리 후 '수성 현수막원단 1코팅' 그룹 동폭 중복 0.
--
-- 위험: 두 품목 모두 product_materials 연결 0개 → 인쇄 자동차감 후보가 아니라 동작 변화 없음.
--   매입 이력은 있다(GITBAL-070 2건 · MIRROR-090 1건) — 실취급 품목이므로 비활성이 아니라 분리.
--
-- 성격: 데이터 정정(UPDATE만). item_code 기준이라 멱등.

UPDATE items SET item_group = '깃발천', updated_at = CURRENT_TIMESTAMP
 WHERE item_code = 'GITBAL-070';

UPDATE items SET item_group = '미러천', updated_at = CURRENT_TIMESTAMP
 WHERE item_code = 'MIRROR-090';
