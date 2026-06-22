---
model: opus
max_turns: 60
---
docs/superpowers/specs/2026-06-11-alimtalk-golive-package.md 를 읽고 Phase 1(#378 일괄발송 오보고 수정)을 구현해줘.

확정 결정 (spec §2): D1=가(결과 모달 + 실패 건 목록 + 실패 건만 재발송 버튼), D2=다(발송 경로 bulk API 단일화 — 이 작업에서는 Phase 1 범위만), D3=가(한진 skip).

구현 범위:
1. interpretBulkResult(src/services/barobillSms.ts:401)를 건별 결과 배열 반환으로 확장 (입력 순서 보장 활용)
2. kakao.ts /send-shipment-bulk 응답에 status·실제 sent_count·fail_count·failures[] 추가 (단건 /send 응답 형식과 정합)
3. shipments.js:981 결과 모달 분기 — 성공 N/실패 M + 실패 건 목록(주문번호·수신번호·사유) + "실패 건만 재발송" 버튼 (kakao_send_logs 멱등 가드)

완료 기준: npm run verify 통과 + npm run smoke 통과 + node --check src/scripts/shipments.js 통과.
완료 후: .claude/PROJECT_STATUS.md 진행중 섹션에 결과 1줄 추가, memory/session-context.md 갱신.
커밋하지 말 것 (사람이 검토 후 커밋).
# [큐 외부에서 완료됨] 2026-06-11 로컬 PM 멀티세션이 구현·배포 (커밋 9be309d5·1de61d1d) — 러너 미실행
