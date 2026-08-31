---
name: deploy-verify
description: 프로덕션 배포 실행 + 자동 검증 체인 (빌드→타입체크→entity감사→배포→스모크). "배포해줘"의 기본 스킬. 트리거: 배포해줘, deploy, 프로덕션 반영, 배포 검증. 작업 2개 이상을 구현부터 묶어 배포하려면 ship.
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

### Phase 2-B: 마이그레이션 드리프트 감사 (스키마를 건드린 배포면 필수)
```bash
npm run audit:migration-drift    # 드리프트 시 exit 1
```
새 코드가 참조하는 컬럼·테이블이 **prod 에 실제로 있는지**를 본다. `d1_migrations` 추적이 0313 에서
끊겨 있어 목록으로는 적용 여부를 알 수 없으므로, 마이그레이션이 만들 객체를 시뮬레이션해 실제
스키마와 대조한다. 타입체크·빌드·스모크는 SQL 스키마를 모르므로 셋 다 통과시킨다 — 이 축은 여기서만 잡힌다.

> 2026-08-10: 0528 미적용 상태로 `bank_accounts.is_overdraft` 참조 코드가 나가 `/api/bank/accounts` 가
> 500. 이 감사를 먼저 돌렸으면 배포 전에 걸렸다. 드리프트가 뜨면 **배포를 멈추고** 해당 마이그레이션을
> 먼저 적용한다(추적이 끊겨 있으니 `migrations apply` 가 아니라 `execute --file`).

### Phase 3: 프로덕션 배포

**Phase 3-A: 무엇을 배포하는지부터 확인한다 (2026-08-31 사고 후 신설)**

`deploy:prod` 는 **커밋이 아니라 워킹트리를 빌드한다.** 공유 체크아웃에 다른 세션의 미커밋 WIP 가
있으면 그게 통째로 prod 에 나간다.

```bash
git status --short      # 비어 있어야 한다. 한 줄이라도 있으면 그게 prod 에 나간다
git status -sb          # behind 0 이어야 한다. behind 면 내 커밋이 배포본에 없다
```

- **dirty 면 배포하지 않는다.** 내 것이면 커밋, 남의 것이면 `git stash push -u` 후 배포.
- **behind 면 `git pull --rebase origin main` 먼저.** push-FIRST 를 지켰어도 pull 을 안 하면
  "내 커밋은 prod 에 없고 남의 WIP 만 들어간" 상태가 된다.
- 배포 출력의 두 신호를 읽는다 — `WARNING: ... has uncommitted changes` 가 뜨면 **그 배포는 내 커밋이
  아니다.** 빌드 **모듈 수**가 검증 때와 다르면 미추적 파일이 번들에 섞인 것이다.

> 2026-08-31: dirty main 에서 배포해 타 세션 WIP(직배 슬롯)가 prod 에 나갔고, 그 코드가 아직 없는
> 컬럼을 읽어 `/api/cards` 500. 읽기 스모크로는 못 잡는 **주문 등록·수정**까지 걸려 있었다.
> 신호는 배포 로그에 그대로 찍혀 있었다(모듈 442→443).

```bash
npm run deploy:prod
```

### Phase 4: 배포 후 스모크 테스트

1. **API 스모크 (정본·자동)** — 하드코딩 목록을 만들지 말고 기존 러너를 쓴다:
   ```bash
   npm run smoke      # scripts/smoke.cjs — 엔드포인트 111개 자동 호출
   ```
   - 엔드포인트 목록의 **단일 소스는 `scripts/smoke.cjs`의 `ENDPOINTS`**. 신규 라우트를 추가했으면 이 스킬이 아니라 그 배열에 등록한다.
   - 통과 기준: `PASS n / n` (예: 102/102). 1건이라도 FAIL이면 롤백 판단.
   - ⚠️ **대상이 localhost 로 새지 않게 한다** — dev 서버가 떠 있으면 `npm run smoke` 는 조용히
     로컬을 통과시킨다. 배포 검증의 정본은 **`npm run smoke:prod`**.

1-B. **쓰기 경로를 건드렸으면 쓰기 스모크도 (#608)**
   ```bash
   git diff --name-only <직전배포sha>..HEAD -- src/routes | head
   # 결과가 있으면:
   npm run smoke:write     # entity-99 격리·self-cleaning
   ```
   읽기 스모크는 **200 만 본다** — 바인드 개수 불일치·FK drop 같은 쓰기 전용 회귀는 통과시킨다
   (`sales_rep_id` 0523 이 실제로 그랬다). `verify.yml` 의 카나리는 `on: pull_request` 라
   이 프로젝트(main 직접 push)에서는 **생성 이래 0회 실행**이므로 여기서 대신 받는다.

2. **페이지 로드 검증 (Playwright MCP 또는 curl)** — 배포 대상 도메인에서 주요 페이지가 200/302를 내는지.
   - 이번 배포가 **건드린 페이지는 반드시 포함**하고, 나머지는 대시보드·주문·거래처·카드·재고·원장 등 핵심 동선으로.
   - apex(커스텀 도메인) 확인은 `curl` + 브라우저 UA 병행(→ [[project-scalability-audit]]).

3. **변경분 마커 실측** — 이번 배포에서 바뀐 필드·문구·토글이 prod 번들에 실제로 들어갔는지 문자열로 확인.
   빌드 성공이 반영을 보장하지 않는다(멀티세션 배포에서 되돌아간 전례 다수).

4. **콘솔 에러 수집**: 각 페이지에서 error 레벨 메시지 확인

### Phase 5: 현황판 갱신 + 자동 트림

`.claude/PROJECT_STATUS.md` 상단에 배포 배너를 추가한 뒤 **반드시** 실행:

```bash
npm run status:trim      # 배너 12건 이상이면 6건으로 이관, 미만이면 no-op
```

배너는 배포마다 쌓이는데 `CLAUDE.md`는 "세션 시작 시 PROJECT_STATUS 읽기"를 지시한다.
방치하면 읽기 상한에 걸려 **매 세션 현황 파악이 조용히 잘린다**(2026-07-27 실제 발생: 302줄 중 33줄만 로드).
스크립트가 무손실·형식 계약 11항목·BOM을 검증하고 실패 시 원본을 복구하므로 그냥 호출하면 된다.

### Phase 6: 결과 보고
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
