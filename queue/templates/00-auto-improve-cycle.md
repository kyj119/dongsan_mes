---
model: opus
max_turns: 100
---
/auto-improve 스킬(.claude/skills/auto-improve/SKILL.md)을 실행해줘 — 다음 순번 Area 1회.

절차 (스킬 워크플로우 그대로):
1. IMPROVEMENT_BACKLOG.md의 last_run_area 확인 → 다음 순번 Area 결정 (7개 순환, Area 7=구조·일관성 포함)
2. 해당 Area deep dive (Explore 병렬 가능, 발견 전수 직접 검증 — 오탐 차단 규칙 준수)
3. 발견 분류: 안전 자동수정(스킬 규칙 내) / GitHub 이슈 등록 + queue/drafts/ 큐 초안 생성 / 백로그 제안
4. IMPROVEMENT_BACKLOG.md 사이클 로그 + last_run_area 마커 갱신
5. open 14일+ 정체 이슈 있으면 "⏰ 정체" 섹션 보고

커밋하지 말 것 (자동수정 분은 워킹트리에 남기고 보고 — 사람이 검토 후 커밋).
