-- 수성미디어 무광코팅을 120g 하나로 통일 (2026-09-18 용준님 지시)
--
-- 왜: 수성미디어 소분류에 무광코팅이 120g·180g 둘로 갈려 있어 주문서에서 매번 고르게 했다.
--     현장은 120g 하나만 쓰기로 정리 → 옵션도 하나만 남기고 이름에서 평량을 뺀다.
--
-- ★소분류가 이미 품목↔후가공을 갈라 준다(pp_option_subcategories):
--     시트      → PP-COAT-M(무광코팅지 SPP031M) · PP-COAT-G(유광코팅지 SPP031G)
--     수성미디어 → PP-COAT-M120(120g-호홍) · PP-COAT-M180(180g-호홍) · PP-COAT-G2(유광코팅지-호홍)
--   그래서 이름이 겹쳐도 주문서는 안 헷갈린다 — 품목 소분류로 조회하기 때문이다
--   (`/api/post-processing/by-subcategory`). 이름을 「무광코팅」으로 맞추면 오히려
--   재단 패널 목록(`GROUP BY option_name`)에서도 하나로 보여 두 화면이 같아진다.
--
-- ⚠️자재 연결(`material_item_group`)은 **건드리지 않는다** — 자동차감의 유일한 키다
--   (`utils/autoDeductPostProcessingMaterials.ts`: option_code → material_item_group).
--   이름만 바꾸므로 차감 대상은 그대로 「무광코팅지 120g-호홍」이다.
--
-- 안전: 적용 시점 prod 실측으로 **과거 사용 0건**이다
--   (후가공이 선택된 order_items 18건 중 PP-COAT-M120/M180 각 0건).
--   180g 는 지우지 않고 **비활성**만 한다 — 되돌리려면 is_active=1 로 올리면 된다.
--   ⚠️180g 실물 재고(적용 시점 1,530)는 그대로 남는다. 소진 방법은 업무 판단이다.
-- 멱등: UPDATE 뿐이라 여러 번 실행해도 같은 상태로 수렴한다.

-- ① 수성미디어 무광코팅 = 120g 하나. 이름에서 평량을 뺀다.
UPDATE post_processing_options
   SET option_name = '무광코팅'
 WHERE option_code = 'PP-COAT-M120';

-- ② 180g 는 목록에서 내린다(행은 남긴다 — 자재 연결·이력 보존)
UPDATE post_processing_options
   SET is_active = 0
 WHERE option_code = 'PP-COAT-M180';
