-- 0318: 카드 거래 분류-상태 정합성 보정
--
-- 배경: PUT /transactions/:id 가 category_id는 저장하되 status 승격이 누락되는 경로가 있어
-- (편집 모달이 status='UNCLASSIFIED'를 명시 전송하면 category가 있어도 미분류로 남음),
-- category_id가 있는데 status='UNCLASSIFIED'인 거래가 존재. 백엔드 로직 보강과 함께 기존 데이터 보정.
-- 멱등: 재실행해도 대상이 없으면 무변경.

UPDATE card_transactions
SET status = 'CLASSIFIED', updated_at = CURRENT_TIMESTAMP
WHERE category_id IS NOT NULL AND status = 'UNCLASSIFIED';
