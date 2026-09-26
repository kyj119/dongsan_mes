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
npm run check:fn && npm run audit:jwt-decode && npm run audit:bind-limit && npm run audit:migration-number
                    # CI·ship:gate 에 있는 정적 게이트 — 여기 없으면 로컬 deploy:prod 가 배포 **뒤에야** CI 에서 걸린다
npm run test:calc   # 계산 규칙 값 대조 (deploy.yml 이 CI 에서 돌리는 것과 동일)
npm run journey:gate  # 업무 여정 J0~J6(25단계) — 로컬 D1 스냅샷 위에서 사람처럼 밟는다(≈2.5분). 서버가 없으면 스스로 띄운다
npm run test:local-e2e  # 서버가 필요한 게이트 4종(수정·삭제 대칭 / 출고 재고 / 자동차감 원장 / 출력→카드 매칭). journey 가 띄운 서버를 그대로 쓴다
```
하나라도 실패하면 중단 + 에러 보고.

> `journey:gate` 는 CI 에 없다(로컬 서버·스냅샷 D1 필요) — 여기와 `ship:gate` 가 유일한 배선이다. 핫픽스로 건너뛰려면
> `SKIP_JOURNEY=1` 을 **명시**한다(찍힌다). 서버가 없어서 안 돌았는데 통과로 세는 일은 없다(exit 2). 정본 = `/journey-loop`.

> ⚠️ `test:calc` 를 여기 두는 이유 — 문법이 멀쩡한 계산 오류는 tsc·build·smoke 를 **전부 통과한다**.
> 2026-08-25 여신 리팩터링에서 파라미터가 한 칸 밀렸는데 모든 게이트가 초록불이었고 prod 배포 후
> 숫자를 대조해서야 잡혔다. CI(`deploy.yml`)에만 있으면 로컬 `deploy:prod` 는 통째로 우회한다.

### Phase 2: entity 필터 감사
배포 전에 반드시 entity 필터 감사를 실행한다:
```bash
node scripts/entity-audit.mjs    # deploy.yml·ship:gate 가 돌리는 것과 동일
```
누락 건이 있으면 배포 전에 수정.

> 손으로 SELECT 를 탐색하지 말 것 — 재현되지 않는다. 검사 대상 테이블 목록의 정본은
> `scripts/entity-audit.mjs` 안에 있고, 스크립트가 그걸 유지한다.

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
   npm run smoke:prod # scripts/smoke.cjs — ENDPOINTS 전량 + 목록 응답에서 뽑은 상세 단건 자동 호출(개수 가변). ⚠️`npm run smoke` 는 기본 대상이 localhost 다
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

5. **표 열 잘림 감사 (UI·목록을 건드린 배포면 필수)**
   ```bash
   npm run audit:table-clip -- --base https://webapp-9i0.pages.dev   # ★--base 필수(기본=localhost — Phase 1 journey 가 남긴 :3000 을 재고 통과한다) · prod 56화면·탭 포함, 새 잘림만 exit 1 (≈2분)
   ```
   `.ds-table` 은 `table-layout:fixed` + `td{overflow:hidden}` 이라 **넘친 값이 경고 없이 사라진다** —
   응답은 200 이고 tsc·build·smoke·check:dom 이 전부 통과한다. 기준선(`scripts/table-clip-baseline.json`)에
   없는 (화면, 열)이 잘리면 실패. 열을 고쳐서 해소했으면 기준선을 **줄인다**
   (안 줄이면 다음에 되돌아가도 안 잡힌다) — ⚠️**`--base` 를 반드시 같이 준다**:
   ```bash
   npm run audit:table-clip -- --base https://webapp-9i0.pages.dev --update
   ```
   기본 대상이 **localhost** 라 `--base` 를 빼면 prod 기준선 위에 로컬 측정치가 덮인다.
   로컬은 데이터가 적어 잘림이 덜 잡히므로 기준선이 조용히 줄고 prod 의 알려진 잘림이
   「해소됨」으로 사라진다(2026-09-18 실제로 44→14). 지금은 대상이 다르면 스크립트가
   덮어쓰지 않고 exit 2 한다.
   > 2026-08-09 에도 같은 목록을 실측해 두고 **게이트가 아니라서** 한 달간 방치됐다.

6. **화면 쓰레기 문자열 감사 (UI·API 응답을 건드린 배포면 필수)**
   ```bash
   npm run audit:render-junk -- --base https://webapp-9i0.pages.dev   # prod 57화면·탭 포함 (≈2분)
   ```
   화면에 값 대신 **`undefined`·`NaN`·`[object Object]`·`Invalid Date`·`null`** 이 떠 있는지 본다.
   거의 언제나 **API 가 주는 칸 이름과 화면이 읽는 이름이 다른 것**이고, 그 축은 응답이 200 이라
   tsc·build·smoke·check:dom·check:fn 이 **전부 통과한다**. 기준선(`scripts/render-junk-baseline.json`)은
   **0건이 정상** — 줄이 생기면 기준선에 넣기 전에 **고칠 수 있는지 먼저 본다**.
   자가시험 = `npm run audit:render-junk:selftest`(잡아야 할 것 6 · 잡으면 안 되는 것 5, 양방향).
   > 2026-09-22 신설. 계기 = `/production-reports` 두 표가 API 가 주지 않는 칸을 읽어 열이 통째로
   > 「undefined」였고, `undefined < today`·`undefined > 0` 이 **항상 false** 라 「(지연)」과 에러 수가
   > **영영 안 떴다**. 정적 대조(라우트 SELECT ↔ 스크립트 `o.필드`)는 시제품에서 **후보 566건**이
   > 나와 폐기했다 — 오탐이 그만큼이면 아무도 안 본다. **증상을 직접 보는 쪽이 57화면에 1건**이었다.

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
