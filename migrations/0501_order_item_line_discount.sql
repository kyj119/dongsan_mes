-- 0501: 행 에누리(할인) 구조화
--
-- 배경 — 주문서 금액칸은 수동 수정 UI(주황 테두리 + "수동 수정됨" 툴팁)가 있는데도
--   ① 화면 합계가 수동값을 무시했고(행 200,000인데 합계 62,000)
--   ② payload 에 amount 가 없고 서버가 item.amount 를 한 번도 읽지 않아 **저장 자체가 안 됐다**.
--   prod 실측: 산식과 다른 행 = 전부 이관 원천값(100원 반올림 미적용)이고 수동 조정 이력은 0건.
--
-- 의미 확정(2026-07-30 사용자 결정) — 금액칸 수정 = **행 에누리(할인)**.
--   단가·치수·수량은 건드리지 않는다 → 단가 마스터가 보존되고(재견적 근거 유지),
--   에누리가 에누리로 잡혀 세금계산서·원장·부문손익이 맞는다.
--
-- ★설계 핵심 = amount 의 의미를 **'에누리 반영 후 최종 금액'으로 불변** 유지한다.
--   기존 소비자가 모두 '그 행의 최종 금액'으로 읽고 있어(taxInvoices/helpers.ts:453 ·
--   departments.ts:183 · reports.ts:126,143) 코드 수정 0 으로 자동 정합된다.
--
--   auto_amount     = 당시 자동 계산값 스냅샷. 단가·규칙이 나중에 바뀌어도
--                     '무엇을 부정했는지' 재현할 수 있게 남긴다.
--   line_discount   = auto_amount - amount. 추가작업비로 **증액**이면 음수.
--   discount_reason = 사유(선택). 필수로 막으면 아무 말이나 채워 기록 품질이 떨어진다 →
--                     비면 조회·감사에서 '사유 미기재'로 드러내는 방식.
--   discount_by     = 수정자 user id. FK 는 걸지 않는다(시스템 기록 user FK NULL 전례).
--
-- ⚠️ orders.discount_amount(주문 레벨 할인)와는 **독립**이다(사용자 확인).
--    행 에누리는 amount 에 이미 반영됐으므로 이중 차감이 아니고,
--    주문 레벨 할인은 '전체 추가 할인'으로 그대로 남는다.
--
-- ⚠️ ALTER TABLE ADD COLUMN 은 멱등이 아니다(이미 있으면 오류) → 재실행 금지.
--    적용은 wrangler d1 execute --file 로 직접 한다.

ALTER TABLE order_items ADD COLUMN auto_amount REAL;
ALTER TABLE order_items ADD COLUMN line_discount REAL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN discount_reason TEXT;
ALTER TABLE order_items ADD COLUMN discount_by INTEGER;

-- 기존 행 백필 — 여태 amount 는 항상 자동 계산값이었으므로 auto_amount = amount, 에누리 0.
--   (departments.ts:183 의 COALESCE(oi.amount, ...) 폴백 때문에 amount NULL 은 금지 —
--    NULL 이면 에누리가 사라지고 단가×수량으로 되돌아간다)
UPDATE order_items SET auto_amount = amount WHERE auto_amount IS NULL;
UPDATE order_items SET line_discount = 0 WHERE line_discount IS NULL;
