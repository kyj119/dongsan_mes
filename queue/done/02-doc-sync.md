---
model: sonnet
max_turns: 100
---
⚠️ 착수 전 필수: git log -20과 대상 문서 현황을 먼저 확인하고, 이미 반영된 내용은 중복 추가하지 말 것.

참조 문서 4건이 최근 코드 변화를 못 쫓아갔다. 각각 현재 코드 기준으로 동기화해줘. **코드 수정 금지, 문서 갱신만.**

1. docs/entity-separation-map.md (5/27 기준) — split-billing 반영:
   - order_billing_groups 테이블 추가 (주문×법인 청구그룹, entity 격리 기준 명시)
   - clients.balance 캐시 폐기 → deriveClientBalance 파생 전환 반영
   - 마이그 0305~0308 신규 테이블/컬럼 점검 후 맵에 추가
   - 근거: docs/superpowers/specs/2026-06-10-split-billing-by-entity.md + PROJECT_STATUS

2. .claude/references/architecture-flow.md (5/27 기준) — 구조 변화 전부 반영:
   - 대형파일 분할 5대 전부: orders/(helpers·lifecycle·create·update·core 배럴), taxInvoices/(5파일 배럴), ledger/AR 배럴, purchaseOrders/(po-queries·po-receipts·po-receive·po-special·core 배럴)
   - cards.js → src/scripts/cards/ 5청크(?raw 다중 import 결합)
   - workbench.ts 신규 라우터
   - 근거: 실제 src/routes/·src/scripts/ 디렉토리 구조 확인 (추측 금지)

3. .claude/references/decisions-code.md (5/26 이후 누락) — 6월 결정 추가 (각 1~3줄, 기존 포맷 유지):
   - split-billing: 청구법인 = 담당 생산법인 분할 / clients.balance 캐시 폐기→파생
   - billing_status 비교는 IS NOT 사용 (NULL 함정)
   - 출고일 권위 소스 = COALESCE(shipments→cards→폴백) (#380)
   - ia_auto_enabled 플래그 게이트 (#377)
   - bleed = 디자인 미세확대 (createEdgeStrip 폐기 예정)
   - 정적 에셋 외부화 재시도 금지 (해제 조건 = rootcause spec)
   - DB 마스터가 존재하는 선택지는 UI 하드코딩 금지 — API 로드 (entities·caps_sites 사례, 2026-06-12)
   - 근거: PROJECT_STATUS ⚖️ 블록 + docs/superpowers/specs/2026-06-11-*.md

4. docs/kakao-alimtalk-templates.md (6/3 기준) — 알림톡 P2 반영:
   - 자동발송 매핑(delivery_method→템플릿, 한진/미매핑 skip), 멱등 가드, 일괄발송 results[]/결과모달/재발송
   - test_mode 유지 중 = 실발송 0, go-live 대기 상태 명시
   - 근거: PROJECT_STATUS + src/routes/kakao.ts 실코드 대조

완료 기준: 4개 문서 날짜 갱신 + 변경 요약을 PROJECT_STATUS 진행중 섹션에 1줄 추가.
커밋하지 말 것 (사람이 검토 후 커밋).
