# 대형 파일 분할 계획 — 컨텍스트 효율 P1 (TODO ⑯)

- **작성일**: 2026-06-11
- **상태**: ✅ **전체 완료 (2026-06-12)** — ~~orders/core~~ ✅ → ~~taxInvoices~~ ✅ → ~~ledger/AR~~ ✅ → ~~purchaseOrders/core~~ ✅ → ~~cards.js~~ ✅. 2차(후속) shell.js·ledger.js·bank.js·rip.js는 별도 판단(현재 ≤2200 미만이거나 우선순위 낮음).
- **✅ cards.js 완료 (2026-06-12, 커밋 5d476b07)**: src/scripts/cards.js 2642줄 → src/scripts/cards/ 5청크(core 696·actions 453·rip 453·detail 668·misc 372). **클라 JS는 라우트와 다른 방식**: pages/cards.ts에서 5개 `?raw` import → **원순서 join('\n')**(shell.js 다중 import 선례). IIFE 없는 단일 전역 스코프라 **연속 라인 슬라이스+원순서 결합 = 원본과 내용 동일**(동작 보존). **★검증=byte-identity**(cat 5청크 == 원본, CRLF→LF만 차이) + node --check 5/5 + build(391모듈) + check:dom(cards 신규 0) + smoke 103/103 + Playwright /cards(16/16 전역함수·loadKanban 정상 빈상태·콘솔에러 0). BOM은 core.js(첫 청크) 보존, 초기화/DnD는 misc(마지막 청크).
- **✅ purchaseOrders/core 완료 (2026-06-12, 커밋 f428617f·4611edf9·9eb833fc·6c89232a)**: core.ts 2194→771줄. **헬퍼 0**(순수 라우트 그룹핑). po-queries.ts(295=stats·csv·:id/invoice·my-lines) / po-receipts.ts(463=receipts·:id/inspections·receiving-queue) / po-receive.ts(409=POST /:id/receive) / po-special.ts(329=copy·reorder·quick) / core.ts(771=CRUD). 배럴(purchaseOrders.ts)이 templates→stock-alerts→**구체경로 서브라우터들→core(/:id 마지막)** 마운트. **★순서**: GET `/:id`가 specific GET들 뒤 등록 → 서브라우터를 core 앞 마운트로 비섀도잉(stats·receipts 200 검증). 경로 같은 depth 무변경. self-auth+무토큰401
- **✅ ledger/AR 완료 (2026-06-12, 커밋 55f55e16·3461f4f2·cbcec138·03ed71b6·e6e3d1da)**: accounts-receivable.ts 2228→28줄(순수 sub-barrel, ledger.ts 무변경). ar-helpers.ts(189, deriveClientBalance·buildIntegrityQuery·getAgingCategory+16타입) / ar-payments.ts(389) / ar-receivables.ts(512) / ar-dunning.ts(449) / ar-ledger.ts(762). **경로 무변경**(서브파일도 ledger/ 동일 depth → 정적·동적 import 그대로). **★순서함정**: `/collection-logs/:clientId`↔`/:id` 동일패턴쌍 → ar-dunning에 원순서 보존(GET /collection-logs/1→200 검증). **교훈**: 추출파일 심볼 `grep -w` 사전검증으로 import 누락 방지(PaymentRow 1회 놓침→보정). self-auth(.use)+무토큰401 검증
- **✅ orders/core 완료 (2026-06-11, 커밋 518f9c3d·036e266e·4dc6be77·e180a23f)**: 2661→597줄. helpers.ts(367, 공유헬퍼) / lifecycle.ts(606) / create.ts(739, POST /) / update.ts(430, PUT /:id) / core.ts(597). 배럴 마운트, 이동만·로직0. 커밋마다 verify+smoke103+라이브 도달성. 패턴=awk슬라이스+sed리네임(전사오류 0)
- **✅ taxInvoices 완료 (2026-06-11, 커밋 1f2afb17·2137b9e7·93c61ac7·38a62578·bc0915ef)**: 2195→30줄(순수 배럴, orders.ts와 동일 패턴). helpers.ts(460, getTaxProvider·번호·설정·issueTaxInvoice·createSplitInvoices+6타입) / queries.ts(458, GET 7) / issue.ts(744, direct·생성·issue·modify·cancel) / batch.ts(271, batch-create·monthly-create) / manage.ts(334, PATCH·DELETE·refresh-status·retry·send-email). **신규=배럴 변환**(기존 flat 파일→디렉토리+배럴), 각 서브라우터 self-auth(.use), getTaxProvider re-export(portal.ts). **안전성**: GET 상세 `/:id{[0-9]+}` 숫자제약+전 라우트 method+path 명확구분 → 마운트순서 무관(라이브 도달성+무토큰401 검증). 바로빌 SOAP은 services/(taxProvider·barobillTax)라 무영향
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
