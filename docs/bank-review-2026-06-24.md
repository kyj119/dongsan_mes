# /bank 영역 리뷰 — 남은 버그 (2026-06-24, 3에이전트 병렬 리뷰)

> #1 IDOR(card_fee_rates PUT/DELETE entity 격리)은 **수정·배포·검증 완료**(커밋 `f29a266b`). 아래는 **남은 항목**.
> **✅ 전체 완결(2026-06-24)**: #1·#2·#3·#5·#8 (dep `e9c1155d`) + **#4·#7** (커밋 `4d2f3fdb`, dep `5c1fa54c`). #6=변경불요. 백로그 종료.
> 리뷰 방식: bank-frontend / bank-backend / bank-contract 3에이전트 독립 + 교차검증.

## 파일별 분담 (에이전트 팀 — 같은 파일 동시편집 금지)

| 담당 | 파일 | 버그 |
|------|------|------|
| **bank-be** | `src/routes/bank.ts` | #2, #5, #7, (#3·#4 BE측) |
| **bank-fe** | `src/scripts/bank.js` | #6, #8, (#4 FE측) |

## 버그 목록

### #2 — HIGH·dead endpoint
- `routes/bank.ts:2055` `POST /api/bank/card-fee-calculate` — **소비처 0건**(전 `src/scripts` 확인). `cardFee.js`는 `-rates`/`-summary`만 사용, bank.js는 card-fee 미사용.
- **수정**: 삭제. (외부/미래용 의도면 주석 명시 후 보존 — 용준님 판단.)

### #3 — MED·폐기캐시 (⚠️ 동작 변경 = plan approval 필수)
- `routes/bank.ts:872` (+`785`,`788`) auto-match 금액일치 분기가 폐기된 `clients.balance`(prod 전체 0)에 의존 → **항상 false = dead**. 입금↔미수금 **금액 자동매칭이 조용히 무력화**됨.
- **수정**: `deriveClientBalance`(ledger/ar-helpers) 또는 `/receivables` 서브쿼리(`order_billing_groups[BILLED] − payments − adjustments`)로 client별 잔액 맵 생성 후 매칭. ⚠️ **false-positive 매칭 위험** — 신뢰도/금액허용오차 신중. **plan approval 받고 진행.**

### #4 — LOW·폐기캐시 (BE+FE 계약, SendMessage 합의)
- `routes/bank.ts:1958` `/client-search`가 `c.balance`(캐시=0) 반환·정렬. FE `bank.js:402,663`가 추천 드롭다운 잔액 힌트로 사용.
- **수정**: BE는 정렬을 이름기준으로·balance를 파생 or 제거. FE는 그에 맞춰 표시 조정. bank-be↔bank-fe SendMessage로 계약 합의.

### #5 — LOW·D1 바인드 한도
- `routes/bank.ts:1174`(batch-apply), `1305`(batch-match) `IN(?…)` 청크분할 없음 → >~99건 일괄선택 시 D1 500.
- **수정**: txIds를 80개 청크 분할 후 SELECT·Map 병합 (import 핸들러 `~349` 패턴 재사용).

### #6 — LOW·FE 전역헬퍼
- `scripts/bank.js:444` 로컬 `escHtml` 재정의(`'` 미escape→onclick마다 `.replace(/'/g)` 수동 보강 `331/404/664/1107`).
- **수정**: `escHtml` 제거→전역 `window.escapeHtml` 사용(`'`까지 escape→수동 .replace 제거 가능). 단 .replace 제거 시 동작 동일 확인.

### #7 — LOW·규격 회귀방어
- `routes/bank.ts:260` `bt.*` 와일드카드 SELECT → 컬럼 리네임 시 FE(`balance_after` 등) silent null.
- **수정**: FE 소비 필드 명시 SELECT.

### #8 — LOW·KST
- `scripts/bank.js:876` 이번달 범위 계산에 UTC `toISOString().slice(0,10)` → 월경계 9h 오차 가능.
- **수정**: `window.kstToday()`/`formatKST` 기반 계산.

## 이상 없음 (리뷰 확인)
FE↔BE 404 위험 0 · 라우트 셰도잉 안전 · getElementById silent-fail 0 · SQL injection 없음 · 거래 entity 격리 견고(#437/#434) · `/receivables` 파생 정상.

## ⚠️ 배포 주의 (멀티세션)
2026-06-24 현재 워킹트리에 **다른 세션의 미커밋 cardExpenses 작업** + `migrations/0380_expense_category_cleanup.sql` 존재. `deploy:prod`는 워킹트리 전체를 빌드하므로 **배포 전 `git status`로 내 변경만 있는지 확인**. cardExpenses가 섞이면 그 세션 마무리까지 배포 보류.
