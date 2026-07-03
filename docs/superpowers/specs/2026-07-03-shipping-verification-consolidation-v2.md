# 출고관리 고도화 v2 — 포장 검수(누락 방지) + 합배송 범위 확장

- **작성일**: 2026-07-03
- **상태**: ✅ **P1~P4 prod 배포완료 (2026-07-03)** — 순서 준수: 0439 remote 적용·검증(테이블 6컬럼·/pack 권한 2건) → push `82dddf2a..2efd34de`→main → deploy `4723f7db` → **apex 검증 14/14**(pack/shipments 마커·checklist/candidates 401·페이지 7종 200·API 게이트 401). 타 세션 커밋 3건(storageZones·production 필터) 머지 동봉, main 워킹트리 미커밋 WIP(bank·barobill·payroll)는 원칙대로 제외. 잔여=실주문 검수 플로우 1회 확인(용준님)·worktree 정리(`end-session.ps1 shipping-verify -DeleteBranch`, ⚠️타 세션 dev서버 종료 부작용).
- **검증(로컬 D1 E2E)**: 기본 11/11 + 게이트/머지 스위트 — 하드게이트 차단(사유·미완성카드 반환)·카드 스탬프 0·주문 상태 보존 / 납품일 다른 merge 허용 / merge→0438 예약 동기 / unmerge→예약 클리어 / 수동등록 전량 게이트 400 / 무인증 401 / tsc·build·node --check green
- **배경**: 배송 P1~P3 + 후속 P1~P4(0438 접수 예약) prod 완결 이후 추가 고도화. 요구 2축 = ①하나의 주문 내 물건 누락 방지 ②동일 거래처 다른 주문 포괄(합배송) 출고 확대.
- **정본 관계**: `memory/project-delivery-system.md` · 선행 spec `2026-07-02-delivery-consolidation-intake-visibility.md` · merge 모델 = `shipments.merged_into_id` · 예약 = `orders.consolidate_with_order_id`(0438)

## 현행 갭 (2026-07-03 코드 실측)

| # | 갭 | 근거 |
|---|---|---|
| 1 | 수량 대조 없음 — 출고 검증이 카드 상태(PRINT_DONE)·`shipment_ready` 플래그뿐 | `orders/queries.ts:266` |
| 2 | 포장 체크리스트/피킹 UI 없음 — 품목 요약 3건 텍스트만 | `shipments.js:363` |
| 3 | 카드 미생성 품목(상품·부속품)은 생성 시 `shipment_ready=1` → 무검증 통과 | `cards/lifecycle.ts:57` |
| 4 | QR 스캔 출고는 카드 단위·별도 화면, 포장 흐름과 미통합 | `scan.ts:209` |
| 5 | 합배송 후보가 "같은 날+복수 법인"만 — 같은 법인 복수 주문 미감지 | `shipments.ts:250` |
| 6 | merge가 같은 납품일 검증 — 납품일 다른 주문 묶기(보류 후 합배송) 불가 | `shipments.ts:306` |
| 7 | bulk-ship이 PRINT_DONE 아닌 카드를 **조용히 제외**하고 부분출고 처리 → 잔여 잊힘 | `orders/queries.ts:277` |

## 용준님 확정 사항 (2026-07-03, 3라운드 12문)

| 결정 | 내용 |
|---|---|
| 누락 지점 | 포장 시 실물 빠뜨림 · 합배송 시 섞임/누락 · (부분출고 잔여는 "부분출고 자체가 없어야" — 추적 기능 아닌 **silent 부분출고 방지**로 해석, 확인 필요) |
| 검증 방식 | **포장 체크리스트 + 출고 명세서 출력물** 기본. 업계 리서치 추가 반영(아래) |
| 체크 단위 | **라인 체크 + 예외 시에만 수량 입력** (기본 ✓=전량 담음) |
| 강제성 | **소프트 게이트** — 미체크 라인 있으면 경고 모달 후 진행 허용 |
| 명세서 | 3종 모두: ①내부 검수 체크지 ②박스 동봉 거래처용 ③합배송 통합 명세서 |
| 기기 | **종이 먼저(체크박스 명세서 인쇄+사후 입력), 모바일/태블릿은 2단계** |
| 합배송 범위 | **같은 법인 복수 주문 포함** + **납품일 다른 주문 묶기 허용** |
| 후보 기준 | 납품일 무관 **미출고 전체** |
| 보류 정책 | **수동 결정 + 가시성** — '합배송 대기' 배지+목표일 상시 노출, 기한 강제 없음 |
| 묶음 결정 | **혼합** — 접수 예약(0438) + 출고 당일 화면 제안 양쪽 강화 |

## 업계 리서치 요약 (packing-research 에이전트, 2026-07-03)

- 소규모 인쇄업 표준 조합 = **스캔 검수 + 주문별 토트 분리 + 사진 증빙**. 중량 검수(커스텀 사이즈 편차 오탐)·pick-to-light·비전 라인 = 과투자 제외.
- 커스텀 제작물 바코드 부재 → **MES가 주문/카드 QR 발행→라벨 부착→포장대 스캔**으로 해소(기존 카드 QR·scan.ts 재활용).
- 기본안 위 추천: **1순위 포장대 QR 스캔 검수**(스캐너 수만원, 오품목 사실상 제거) · **2순위 합포장 토트 분리+토트 스캔**(섞임 구조 차단) · **3순위 포장 사진 증빙**(기존 폰, 분쟁 증거).
- 소스: HandiFox·Kladana·GroovePacker·ShipStation·vAudit·Kardex·Extensiv·NetSuite 등.

## 설계

### 공통 골격 — 검수 정본 = shipment_items 승격
- 현행은 출고 확정 시점 생성 → **PREPARING(검수 시작) 시점에 order_items 스냅샷 생성**(ensureShipmentForOrder 확장 또는 검수 시작 액션).
- 마이그 0439: `shipment_items.packed_quantity INTEGER NULL`(NULL=전량), `checked_at`, `checked_by`.
- 주문 수량 vs 실은 수량 대조가 처음 가능(갭 1·3 해소 — 카드 없는 라인도 체크 대상).

### P1 — 검수 데이터 기반 + 라인 체크 UI(PC) + 소프트 게이트
- 체크 API: `PATCH /api/shipments/:id/check-items` (라인별 checked/packed_quantity, checker 기록).
- /shipments 행 확장 시 라인 체크리스트 렌더.
- bulk-ship(`orders/queries.ts:239`)·`PATCH /by-order/:orderId` 확정 응답에 `unchecked_count` 포함 → 프론트 경고 모달("N개 라인 미검수, 그래도 출고?").

### P2 — 명세서 3종 + silent 부분출고 명시화
- ①내부 검수 체크지: 체크박스+품목+규격(specification)+수량+주문/라인 QR — 종이 운영 정본.
- ②거래처 동봉 납품명세서(가격 제외) ③합배송 통합 명세서(대표 shipment 기준 묶음 전체, 주문별 구분·소계). 기존 label-card/printShipmentList 패턴 확장.
- 갭 7: PRINT_DONE 미달 카드 존재 시 확정 전 경고 모달("카드 N건 미완성 — 전량 출고 원칙") — 조용한 부분출고 제거.

### P3 — 합배송 범위 확장 (독립적, 선착수 가능)
- consolidation-candidates ①에 **같은 법인 복수 주문** 그룹 추가(거래처×미출고 2건+, 법인 수 무관).
- 후보 범위 같은 날 → **미출고 전체**: "오늘 출고 가능"/"대기 중" 구분 표시.
- merge 납품일 동일 검증 완화(다른 납품일 허용, 확인 플래그).
- '합배송 대기 → MM/DD' 배지: 0438 예약 보유 + 상대 주문 납품일이 미래인 주문에 /shipments·주문 목록 표시(목표일=상대 납품일).

### P4 — 모바일 체크 페이지 + QR 스캔 검수 (기기 2단계)
- 신규 페이지 `/pack`(모바일 최적화) — **permission_pages INSERT + requirePagePermission 필수**.
- 명세서 QR 스캔 → 해당 출고건 체크 화면 직행. 라인 QR/카드 QR 스캔 = 라인 체크 대체(스캔 검수).

### P5 — 포장 사진 증빙 (선택)
- 봉인 직전 촬영 → R2 업로드, shipment 링크. 조회는 blob 다운로드(인증 헤더 전용 함정 주의).

### 보류 — 토트 스캔(리서치 2순위): P4 정착 후 재판단.

## 영향 범위
- **DB**: 0439(shipment_items 3컬럼) · P5 시 사진 필드/R2
- **백엔드**: `shipments.ts`(check-items·후보 확장·merge 완화·명세서 데이터) · `shipmentHelper.ts`(PREPARING 스냅샷) · `orders/queries.ts`(게이트 응답)
- **프론트**: `shipments.js`(체크 UI·경고 모달·배지·인쇄 3종) · P4 신규 `/pack` 페이지+스크립트
- **공수**: P1+P2 ≈ 1세션 · P3 ≈ 0.5세션 · P4 ≈ 1세션 · P5 ≈ 0.5세션 → 5 Phase = worktree 세션 분리(`session/shipping-verify`)

## 배포 절차 (⚠️ 순서 엄수 — 마이그 먼저)
worktree `dongsan_mes-worktrees\shipping-verify`에서 (브랜치에 main 3커밋 머지 완료 = superset):
1. `npx wrangler d1 execute webapp-production --remote --file migrations/0439_shipment_checks.sql` ← **반드시 push 전에**
2. 검증: `--remote --command "SELECT COUNT(*) FROM pragma_table_info('shipment_checks')"` → 6
3. `git push origin session/shipping-verify:main` (거부 시 pull --rebase 후 재시도)
4. `npm run deploy:prod` (스크립트에 `--branch main`·ASCII 커밋메시지 포함)
5. apex 검증: `/pack` 200+`packOrderInput` 마커 · `/shipments` HTML `shipCheckModal` 마커 · `GET /api/shipments/checklist/by-order/1` = 401(404 아님) · /shipments·/orders 페이지 200
6. 세션 정리: `.\scripts\end-session.ps1 shipping-verify -DeleteBranch` (⚠️타 세션 dev 서버 종료 부작용 — 재기동 안내)

## 구현 상세 (2026-07-03 완료분)
- **0439**: `shipment_checks`(shipment_id×order_item_id UNIQUE, packed_quantity NULL=전량, checked_at/by) + permission_pages `/pack` + MANAGER/OPERATOR 권한
- **API**: `GET /api/shipments/checklist/by-order/:orderId`(숫자=ID·비숫자=주문번호, PREPARING ensure+라인 스냅샷 upsert, 합포장 그룹 반환) · `PATCH /api/shipments/checklist/:shipmentId`(최초 체크시각 COALESCE 보존) — 둘 다 `/:id` 라우트보다 먼저 등록
- **하드 게이트**: bulk-ship Step 0 사전차단(미완성 카드 → 스탬프 없이 실패 반환)+else 부분출고 경로 제거 / POST /shipments ①미완성 카드 400 ②card_ids 미커버 400. 카드 단건 QR 스탬프(scan)는 적재 기록으로 유지(주문 전이는 전량 시에만 — 기존 동작)
- **소프트 게이트**: /daily에 chk_total/chk_done → confirmShipSection 경고 문구, 차단 결과는 `showShipBlockedModal`
- **/daily 추가 필드**: chk_total·chk_done·consolidate_with_order_id·consolidate_partner_pending_date(미출고 파트너 MAX 납품일 → `shipmentsWaitBadge` '합배송 대기 →MM/DD')
- **후보 확장**: anchor=당일 출고 거래처, 그 거래처의 미출고 전체 포함(rows≥2, 법인 무관), 비당일=waiting 칩 '납품 MM/DD'. 권역(②)은 당일만 유지
- **merge**: 납품일 검증 제거 + 0438 예약 포인터 동기(root=대표 주문, unmerge 클리어와 대칭)
- **검수 UI(PC)**: 거래처 셀 검수 칩(회/황/녹 n/m) → `shipCheckModal`(주문별 라인 체크+예외수량, 전체체크) / 인쇄 2종: 검수 체크지(QR→/pack)·납품명세서(가격 제외, 복수 주문=통합 명세서 주문별 소계)
- **/pack 모바일**: 주문번호/QR(html5-qrcode) 진입, 탭=즉시 저장, 부분수량 showPrompt, 진행바+완료 배너. 페이지 게이트=requirePagePermission('/pack'), shipments API 게이트=requireAnyPagePermission('/shipments','/pack')로 확장
- **?raw 전역 스코프**: pack.js 식별자 전부 `pack*` 프리픽스 (scan.js `scanner` 충돌 회피)

## 확정 (2026-07-03 용준님)
1. **도입 범위 = 나) P1~P4** (P5 사진 증빙 제외, 토트 보류 유지)
2. **착수 = 즉시** (worktree `session/shipping-verify`)
3. **부분출고 = 전면 불가, 전체 출고만 허용** — 소프트 게이트(경고 후 진행)는 **검수 체크리스트에만** 적용. **주문 단위 출고 확정은 하드 게이트**: 미완성 카드(PRINT_DONE 미달)나 `shipment_ready=0` 라인이 있으면 해당 주문 출고 자체를 차단(사유 반환), 현행 bulk-ship의 "완성분만 조용히 부분출고" 경로 제거. P2의 "silent 부분출고 경고" 항목은 이 하드 게이트로 대체·P1에 흡수.
