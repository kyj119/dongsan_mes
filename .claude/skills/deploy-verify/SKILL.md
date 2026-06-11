---
name: deploy-verify
description: 프로덕션 배포 + 자동 검증 체인 (빌드→타입체크→entity감사→배포→스모크). 트리거: 배포해줘, deploy, 프로덕션 반영, 배포 검증
---

# 배포 + 자동 검증 체인

프로덕션 배포 후 자동으로 전체 검증을 실행한다. "배포해줘", "deploy", "프로덕션 반영" 요청 시 사용.

## 실행 순서

### Phase 1: 사전 검증
```bash
npx tsc --noEmit    # 타입체크
npm run build       # 빌드
```
하나라도 실패하면 중단 + 에러 보고.

### Phase 2: entity 필터 감사
배포 전에 반드시 entity 필터 감사를 실행한다:
1. `src/routes/*.ts`의 모든 SELECT 쿼리를 탐색
2. `bank_transactions`, `card_transactions`, `corporate_cards`, `bank_accounts`, `bank_match_rules`, `card_fee_rates`, `expense_auto_rules` 테이블 참조 시 entityFilter 호출 여부 검사
3. 누락 건이 있으면 배포 전에 수정

### Phase 3: 프로덕션 배포
```bash
npm run deploy:prod
```

### Phase 4: 배포 후 스모크 테스트 (Playwright MCP)
배포 완료 후 프로덕션 URL(https://webapp-9i0.pages.dev)에서:

1. **페이지 로드 검증** (14개):
   `/dashboard`, `/orders`, `/clients`, `/cards`, `/production`, `/inventory`,
   `/items`, `/ledger`, `/bank`, `/card-expenses`, `/quotations`, `/shipments`,
   `/purchase-orders`, `/settings`

2. **API 응답 검증** (11개):
   `bank/stats`, `bank/transactions`, `bank/receivables`, `bank/match-rules`,
   `card-expenses/cards`, `card-expenses/categories`, `card-expenses/transactions`,
   `card-expenses/stats`, `card-expenses/payment-schedule`, `card-expenses/report`,
   `card-expenses/auto-rules`

3. **콘솔 에러 수집**: 각 페이지에서 error 레벨 메시지 확인

### Phase 5: 결과 보고
```
배포 + 검증 완료
━━━━━━━━━━━━━━━━━━
빌드: OK / FAIL
타입체크: OK / FAIL
Entity 감사: OK / N건 누락
배포: OK / FAIL
페이지 로드: N/14 통과
API 응답: N/11 OK
콘솔 에러: N건
━━━━━━━━━━━━━━━━━━
```

실패 항목이 있으면 구체적 에러와 수정 방안 제시.

## 주의사항
- 배포 후 CDN 캐시 갱신 대기 (~5초)
- 로그인 상태 필요 (이미 로그인된 Playwright 세션 활용)
- 롤백은 자동으로 하지 않음 (사용자 확인 후 진행)
