-- 0625: 근태의 법인을 **직원 소속으로 정렬**한다
--
-- 왜: attendance.entity_id 는 저장 시점의 스냅샷이라, 직원이 법인을 옮기면 과거 근태가
--   옛 법인에 남는다. 그러면 근태 화면(entity 필터)에서 그 사람 줄이 **통째로 빈다**.
--   2026-09-18 실측: 이성용·박운옥 8월이 빈 줄로 보여 8/14·8/28 결근일을 확인할 수 없었다.
--   전사 11명 506건(선명 4명 268 · 오다플래그 6명 204 · 동산 1명 34).
--
-- ★근태는 「그 법인의 기록」이 아니라 **「그 사람의 기록」**이다. 주문·매출처럼 법인 귀속이
--   거래의 성질인 축과 다르다 — 사람이 옮기면 그 사람의 출퇴근 이력도 같이 간다.
--
-- ⚠️급여 집계(payroll/core.ts)는 employee_id 목록으로 근태를 읽어 이 칸을 보지 않는다.
--   그래서 급여는 내내 정상이었고 **화면만** 비어 있었다 — 이 교정으로 급여는 바뀌지 않는다.
--
-- 읽는 쪽(routes/attendance.ts)도 같은 커밋에서 `entityFilter(c,'e')`(직원 기준)로 바꿨다.
-- 둘 중 하나만 고치면 또 어긋나므로 짝으로 간다(§형제 스윕).

UPDATE attendance
   SET entity_id = (SELECT e.entity_id FROM employees e WHERE e.id = attendance.employee_id)
 WHERE EXISTS (
         SELECT 1 FROM employees e
          WHERE e.id = attendance.employee_id
            AND e.entity_id IS NOT NULL
            AND e.entity_id != attendance.entity_id
       );
