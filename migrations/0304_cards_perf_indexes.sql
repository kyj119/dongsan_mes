-- 0304_cards_perf_indexes.sql
-- 카드 목록 로딩 성능 개선 (카드 누적 시 지연 완화)
--
-- 대상 쿼리: GET /api/cards 의 칸반 4개 호출
--   WHERE c.status = ? ORDER BY c.priority DESC, c.delivery_date ASC, c.created_at ASC LIMIT ?
-- 기존: idx_cards_status(상태 단일) + idx_cards_priority(우선순위 단일) → 상태 필터 후 filesort 발생.
-- 개선: status 등식 + 정렬 키 3개를 단일 복합 인덱스로 커버 → 정렬 제거 + LIMIT 조기 종료.
--
-- 컬럼 방향은 ORDER BY와 정확히 일치시켜야 정렬 생략 가능 (priority DESC, delivery_date ASC, created_at ASC).
-- 동작/표시 변화 없음 (읽기 경로 최적화만).
CREATE INDEX IF NOT EXISTS idx_cards_status_priority_delivery
  ON cards(status, priority DESC, delivery_date ASC, created_at ASC);
