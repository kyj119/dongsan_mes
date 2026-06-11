# 대형 파일 분할 계획 — 컨텍스트 효율 P1 (TODO ⑯)

- **작성일**: 2026-06-11
- **상태**: ✅ **확정 (2026-06-11 용준님 결정)** — 순서: orders/core(#377 동세션) → taxInvoices → ledger/AR → purchaseOrders/core → cards.js·shell.js. 파일별 경계는 착수 세션에서 심볼 맵 뜬 후 확정
- **⚠️ 정정 (2026-06-11)**: 정적 에셋 외부화는 **폐기·재시도 금지**(P0 롤백, prod 2회 다운 — PROJECT_STATUS 참조). cards.js·shell.js 분할은 **`?raw` 유지 전제**로 layout.ts 다중 import 방식(§2-6) 적용. §2-6의 `<script src>` 전환 언급 무효
- **선례**: layout.ts 3259→228줄 분할 (2026-06-09 세션2) — 검증된 패턴
- **목표**: 1,500줄+ 파일 해체로 ① Claude Read 컨텍스트 절감 ② 병렬 에이전트 파일 잘림 사고 면적 축소 ③ 리뷰 단위 축소

---

## 1. 대상 (우선순위순)

| # | 파일 | 줄수 | 유형 | 분할 후보 경계 (착수 시 확정) |
|---|---|---|---|---|
| 1 | `src/scripts/cards.js` | 2,642 | 클라 JS (`?raw`) | 보드 렌더 / 카드 상세·모달 / 상태 전이 액션 / 필터·검색 |
| 2 | `src/routes/orders/core.ts` | 2,597 | Hono 라우트 | CRUD / 품목(items) 처리 / 상태·청구 전이 / AI 자동가공(:1435~) — 이미 orders/ 디렉토리라 파일 추가만 |
| 3 | `src/routes/taxInvoices.ts` | 2,257 | Hono 라우트 | 발행(단건/직접/batch) / 취소·정정 / 조회·목록 / 바로빌 연동부 |
| 4 | `src/routes/ledger/accounts-receivable.ts` | 2,209 | Hono 라우트 | 원장 조회 / aging·회수예측 / 독촉 |
| 5 | `src/routes/purchaseOrders/core.ts` | 2,194 | Hono 라우트 | CRUD / 입고(receive) / 템플릿·복사·재주문 |

2차(후속): `src/scripts/ledger.js`(2,140) · `src/routes/bank.ts`(2,080) · `src/routes/rip.ts`(2,028) · `src/scripts/layout/shell.js`(1,914 — 정적 에셋 P1~P3와 함께 처리).

---

## 2. 방법론 (layout.ts 선례 일반화)

### 라우트(.ts) 분할
1. 착수 시 해당 파일 심볼 맵 추출(핸들러 경로·줄범위) → 도메인 묶음 확정
2. `core.ts` → `queries.ts`(읽기) / `mutations.ts`(쓰기) / `lifecycle.ts`(상태전이) 식으로 동일 디렉토리 내 분할 — orders/·purchaseOrders/·ledger/는 디렉토리 기존재
3. **Hono 공유 마운트 활용**: 같은 prefix에 여러 라우터 마운트 가능(내부 경로 중복만 회피 — MEMORY 2026-04-07 교훈)
4. `index.tsx` 마운트 변경 최소화 — 디렉토리 barrel(`index.ts`)에서 결합

### 클라 JS(.js) 분할 (`?raw` import)
5. 전역 `window.*` 등록 패턴 유지 — **IIFE 초기화는 분할 후에도 마지막 로드 파일 맨 아래** (호이스팅 함정, MEMORY 2026-04-07)
6. layout.ts에서 `?raw` 다중 import 후 연결 주입 (shell.js 분할 선례) — 단, 정적 에셋 P1~P3 진행 시 `<script src>` 다중 태그로 전환되므로 **분할 순서를 P1~P3와 조율**
7. 전역 유틸(showToast 등) 재정의 금지 규칙 유지

### 공통 가드레일
- 분할 = **이동만, 로직 수정 0** (동작 보존). 리팩토링 욕심 금지 — 별도 세션
- 파일당 목표 ≤ 800줄, 1커밋 = 1파일 분할
- 병렬 에이전트 투입 금지(파일 잘림 이력 2회) — 인라인 순차 처리

---

## 3. 검증 (파일마다 반복)

1. `npm run verify` (tsc + build)
2. 클라 JS는 `node --check` 전 분할 파일 (이제 hook이 자동 실행)
3. `npm run check:dom` 래칫 통과 (hook 자동)
4. smoke 103 + 해당 페이지 Playwright 클릭 검증 (cards는 보드 DnD·상태전이 필수)
5. 분할 전후 라우트 응답 diff (대표 엔드포인트 3개 curl 비교)

## 4. 공수 / 순서

파일당 0.5~1세션 × 5 = 3~4세션. 권장 순서: **2번(orders/core — 디렉토리 기존재·#377 수정과 동세션 시너지) → 1번(cards.js) → 3·4·5**.
선행 의존: 없음. 단 cards.js·shell.js는 정적 에셋 P1~P3 일정과 조율.
