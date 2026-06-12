-- 0310: 퇴사 ≠ 삭제 — 퇴사로 잘못 소프트삭제(is_deleted=1)된 직원 복구
-- 배경: PUT /employees/:id가 퇴사일자 입력 시 is_deleted=1까지 설정 → 목록 쿼리(is_deleted=0)에서
--   영영 사라짐. hr.ts 로직 수정(퇴사는 status만 변경)에 동반하는 데이터 복구.
-- 멱등: 조건부 UPDATE (퇴사 상태 + 퇴사일자 보유 = 명시적 삭제가 아닌 '퇴사 자동삭제' 케이스만 복구).
UPDATE employees
   SET is_deleted = 0
 WHERE is_deleted = 1
   AND status = 'RESIGNED'
   AND resignation_date IS NOT NULL;
