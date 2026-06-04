-- 0298_normalize_card_status_single_axis.sql
-- 단일 상태축 정규화 (status-model-unification, 2026-06-05).
-- 새 생산보드 버킷은 cards.status 기준(PRINT_PENDING/PRINTING/PRINT_DONE/HOLD/SHIPPED).
-- 레거시 RIP_WAITING/PRINT_ERROR 상태 카드는 어느 버킷에도 안 잡혀 보드에서 사라지므로 표준값으로 이관.
--   · PRINT_ERROR  → 출력오류는 rip_status='ERROR'로 보존하고 status는 PRINT_PENDING(재출력 대기)으로 환원.
--   · RIP_WAITING  → PRINT_PENDING(출력대기). RIP 진행은 rip_status로만 관리.
-- 멱등: 이미 정규화된 행은 영향 없음. CHECK는 0284/0296(7값 superset) 그대로 유지 → 재빌드 불필요.

UPDATE cards SET rip_status = 'ERROR'
  WHERE status = 'PRINT_ERROR' AND (rip_status IS NULL OR rip_status = '');

UPDATE cards SET status = 'PRINT_PENDING'
  WHERE status IN ('RIP_WAITING', 'PRINT_ERROR');
