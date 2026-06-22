---
model: opus
max_turns: 50
---
⚠️ 착수 전 필수: git log -20과 해당 코드 현황을 먼저 확인하고, 이미 처리된 부분은 건너뛸 것.
(2026-06-12 확인: #379의 media/bulk 쪽은 db.batch가 일부 적용돼 있음 — repair-links(:1144 부근 3중 N+1)는 미처리 확정)

GitHub 이슈 #374와 #379 (둘 다 소형 improvement)를 수정해줘. `gh issue view 374` / `gh issue view 379`로 본문 확인 후 시작.

[#374] 배포 스모크 cold-start 취약:
- scripts/smoke.cjs login()이 1회 fetch 후 5xx 즉시 throw → prod cold-start 일시 500이 deploy 게이트를 깨고 E2E까지 skip시킴 (실측 2회)
- 수정: login에 bounded 재시도 (5xx/연결오류 시 2~3회, backoff 2s/5s) — 4xx(자격증명 오류)는 즉시 실패 유지
- 검증: 로컬 smoke 정상 통과 + 재시도 로직 단위 확인(서버 미기동 상태로 1회 실행해 재시도 로그 확인)

[#379] printSystem.ts N+1 2곳:
- /media/bulk(:650 부근) 2중루프 건별 SELECT — media id를 이미 메모리에 보유하므로 재조회 제거
- /repair-links(:1157 부근) 3중 N+1(~3000쿼리) — 메모리 매칭 + DB.batch()
- 주의: N+1 제거는 동작 보존 원칙 (세션5 bb7bec6 패턴 — 빈 배열 IN() 가드, 매핑 인덱스 정합)
- 검증: npm run verify + smoke + /media/bulk 로컬 실행 결과 전후 동일

완료 기준: 두 건 모두 verify+smoke 통과 + PROJECT_STATUS 1줄.
커밋·이슈 코멘트·close 하지 말 것 (사람 검토 후 일괄 처리).
