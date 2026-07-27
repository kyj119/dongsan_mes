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

### Phase 4: 배포 후 스모크 테스트

1. **API 스모크 (정본·자동)** — 하드코딩 목록을 만들지 말고 기존 러너를 쓴다:
   ```bash
   npm run smoke      # scripts/smoke.cjs — 엔드포인트 ~102개 자동 호출
   ```
   - 엔드포인트 목록의 **단일 소스는 `scripts/smoke.cjs`의 `ENDPOINTS`**. 신규 라우트를 추가했으면 이 스킬이 아니라 그 배열에 등록한다.
   - 통과 기준: `PASS n / n` (예: 102/102). 1건이라도 FAIL이면 롤백 판단.

2. **페이지 로드 검증 (Playwright MCP 또는 curl)** — 배포 대상 도메인에서 주요 페이지가 200/302를 내는지.
   - 이번 배포가 **건드린 페이지는 반드시 포함**하고, 나머지는 대시보드·주문·거래처·카드·재고·원장 등 핵심 동선으로.
   - apex(커스텀 도메인) 확인은 `curl` + 브라우저 UA 병행(→ [[project-scalability-audit]]).

3. **변경분 마커 실측** — 이번 배포에서 바뀐 필드·문구·토글이 prod 번들에 실제로 들어갔는지 문자열로 확인.
   빌드 성공이 반영을 보장하지 않는다(멀티세션 배포에서 되돌아간 전례 다수).

4. **콘솔 에러 수집**: 각 페이지에서 error 레벨 메시지 확인

### Phase 5: 결과 보고
```
배포 + 검증 완료
━━━━━━━━━━━━━━━━━━
빌드: OK / FAIL
타입체크: OK / FAIL
Entity 감사: OK / N건 누락
배포: OK / FAIL
API 스모크: PASS n/n (npm run smoke)
페이지 로드: N/N 통과 (변경 페이지 포함)
변경분 마커: 확인 / 미확인
콘솔 에러: N건
━━━━━━━━━━━━━━━━━━
```

실패 항목이 있으면 구체적 에러와 수정 방안 제시.

## 주의사항
- 배포 후 CDN 캐시 갱신 대기 (~5초)
- 로그인 상태 필요 (이미 로그인된 Playwright 세션 활용)
- 롤백은 자동으로 하지 않음 (사용자 확인 후 진행)
