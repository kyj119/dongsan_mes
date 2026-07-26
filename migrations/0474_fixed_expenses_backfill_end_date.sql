-- #554: 부문손익(/pnl) 고정비 기간중첩 조회 정합.
-- 비활성화(is_active=0)가 과거엔 end_date를 남기지 않아, departments 쿼리가 is_active 대신
-- 기간중첩으로 전환되면 이 행들이 종료시점 없이 현재/미래 기간까지 부활(과대집계)될 수 있음.
-- → 기존 비활성 + end_date 미기록 행의 종료시점을 updated_at(마지막 변경=대략 비활성화 시점)으로 backfill.
-- 이후 비활성화는 cashFlow.ts DELETE 핸들러가 end_date를 마감하므로 이 상황이 재발하지 않음.
UPDATE fixed_expenses
SET end_date = date(updated_at)
WHERE is_active = 0 AND (end_date IS NULL OR end_date = '');
