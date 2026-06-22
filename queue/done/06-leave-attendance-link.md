---
model: sonnet
max_turns: 80
---
⚠️ 착수 전 필수: git log -20과 해당 코드 현황을 먼저 확인하고, 이미 처리된 부분은 건너뛸 것.

휴가 승인 → 근태 유형 자동 연동을 구현해줘. (2026-06-12 점검에서 확인된 갭)

배경:
- leave_types에 HALF_AM(오전반차, 08:30~12:00 비움)·HALF_PM(오후반차, 13:00~18:00 비움)·QUARTER_1~4 정의 존재 (마이그 0123)
- attendance.ts:267-271 기준시간 맵이 attendance_type별 지각/조퇴 판정 지원 (HALF_AM=13:00 출근 기준 등)
- **그러나 leaves.ts(휴가 승인)가 attendance를 전혀 갱신하지 않음** → 반차 승인돼도 근태는 NORMAL → 오전반차자 13시 출근이 "지각"으로 찍힘

구현:
1. 휴가 승인 시(leaves.ts 승인 핸들러): 해당 직원·해당 날짜의 attendance 레코드에 attendance_type = 휴가 코드(HALF_AM/HALF_PM/ANNUAL 등) UPSERT
   - 레코드 없으면 생성(연차 전일이면 status도 휴가 상태로), 있으면 type만 갱신
   - entity_id는 직원의 entity_id 기준 (호출자 아님 — #356 패턴)
2. CAPS 동기화(caps.ts)가 나중에 같은 날짜를 동기화해도 휴가 마킹을 덮어쓰지 않게 가드 — 기존 attendance_type이 휴가 코드면 보존(출퇴근 시각만 갱신)
3. 휴가 취소/반려 시 마킹 롤백 (NORMAL 복원)
4. 멱등성: 같은 승인 재처리 시 중복 부작용 없음

검증:
- 로컬 E2E: 반차 신청→승인→attendance_type 확인→CAPS 모의 동기화 후에도 보존→취소 시 NORMAL 복원
- 기준시간 맵 동작: HALF_AM 직원의 13:00 출근이 지각 0으로 판정되는지
- npm run verify + npm run smoke 통과

완료 후: PROJECT_STATUS 진행중 섹션 1줄 + 관련 결정 기록("반차 = 오전 3.5h/오후 5h 불균형 수용, 차감 동일 0.5 — 2026-06-12 용준님").
커밋하지 말 것 (사람이 검토 후 커밋).
