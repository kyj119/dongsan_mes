-- card_items에 개별 파일 출력완료 추적 컬럼 추가
-- 칸반 통합(진행중 | 출력완료): 각 파일별 출력 상태를 추적하여 진행률 표시
-- 모든 card_items가 print_completed=1이 되면 카드 상태가 PRINT_DONE으로 자동 전환

ALTER TABLE card_items ADD COLUMN print_completed INTEGER DEFAULT 0;
ALTER TABLE card_items ADD COLUMN print_completed_at DATETIME;
ALTER TABLE card_items ADD COLUMN print_completed_by INTEGER;
