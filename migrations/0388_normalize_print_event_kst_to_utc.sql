-- 0388_normalize_print_event_kst_to_utc.sql
-- print_events 시각(print_completed_at / print_started_at) 과거분 KST naive → UTC 정규화.
-- 배경: LogWatcher(장비 PC 로컬시간=KST)가 보낸 값이 tz 변환 없이 그대로 저장돼 KST naive 상태.
--       created_at 은 UTC(CURRENT_TIMESTAMP) → prod 검증: print_completed_at - created_at = 정확히 +9.0h.
--       프론트 fmtTime(toKstDate)이 tz표식 없는 값을 UTC로 간주 +9h 표시 → KST naive는 +9h 과다 표시.
-- 보정: created_at 대비 약 9h 큰(=KST naive 판별) 행만 -9h. completed 기준 판별 후 started 동반 보정.
-- 멱등성: 이미 UTC로 정규화된 신규분(diff≈0)은 BETWEEN 8 AND 10 범위 밖이라 미해당 → 재적용 안전.
--         (prod: started_only 행 0건 확인 → completed 기준 일괄 처리로 충분)

UPDATE print_events
SET print_completed_at = datetime(print_completed_at, '-9 hours'),
    print_started_at = CASE WHEN print_started_at IS NOT NULL THEN datetime(print_started_at, '-9 hours') ELSE print_started_at END
WHERE print_completed_at IS NOT NULL
  AND (julianday(print_completed_at) - julianday(created_at)) * 24.0 BETWEEN 8 AND 10;
