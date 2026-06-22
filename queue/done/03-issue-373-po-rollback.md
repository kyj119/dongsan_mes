---
model: opus
max_turns: 60
---
GitHub 이슈 #373을 수정해줘. 먼저 `gh issue view 373`으로 본문·코멘트를 읽고 시작.

요지 (auto-improve 진단): 입고검수 전량취소(inspection-decision CANCELLED) 시 재고만 역분개되고 **PO status/received_quantity가 미롤백** → PO가 영구 RECEIVED 잔류 + 취소 수량 재입고가 400으로 차단. (#369에서 재고측 멱등·원자화는 처리됨 — 이건 PO측 롤백, 별개)

구현:
1. inventory.ts 검수취소 경로에서 PO received_quantity 차감 + 전량 취소면 status 롤백 (RECEIVED→이전 상태)
2. #369의 멱등 가드·단일 batch 원자화 패턴과 정합 유지 (이중 롤백 방지)
3. 부분취소/재입고 시나리오 로컬 E2E: 입고→검수취소→재입고가 400 없이 동작

완료 기준: npm run verify + npm run smoke 통과 + 위 시나리오 검증 로그를 PROJECT_STATUS 진행중 섹션에 1줄 기록.
커밋·이슈 코멘트·close 하지 말 것 (사람 검토 후 일괄 처리).
# [큐 외부에서 완료됨] 2026-06-12 로컬 세션이 처리 (커밋 4adc9b11 — PO 상태 롤백 + 합격분만 역분개) — 러너 미실행
