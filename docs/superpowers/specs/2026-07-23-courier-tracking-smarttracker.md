# 배송추적/POD — 스마트택배(스윗트래커) 조회 API 연동 (B안)

- **작성일**: 2026-07-23
- **상태**: 📝 **spec (설계 확정, 구현 착수 전)** — 착수 조건 = 스마트택배 **무료 조회 API key 발급**
- **결정**: **B안** (용준님, 2026-07-23) — A(조회 딥링크) + 스마트택배 조회 API로 **경동택배 자동추적 + 배송완료 자동확정**. 대신화물은 딥링크 유지. POD(C)는 후속.
- **정본 메모**: [[project-delivery-system]] · 선행 [[project-ship-pipeline]]
- **범위 밖(명시)**: 송장 자동발급, 동선 최적화(배차), 유료 추적/webhook API — 아래 §2 참조

---

## 1. 배경 & 문제

| 항목 | 현재 | 문제 |
|---|---|---|
| 배송완료(DELIVERED) 판정 | **시간 추정** — 출고 시 `orders.auto_complete_date = date('now','+9h','+N days')`, `sync-statuses`가 도래 시 자동 전이 (`orders/lifecycle.ts:517·522-541`) | "배송완료"가 실제 수령이 아닌 **경과시간 추측**. 부정확 |
| 운송장 | 수기 입력 (`shipments.ts:1005-1007` PATCH `tracking_number`) | 실배송 상태를 시스템이 모름 |
| 조회 | 한진만 딥링크(`portalOrders.js:59 renderTrackingButton`, `shipments.js`) | **경동택배·대신화물 조회 링크 없음** |
| 고객 가시성 | 포털 상태 타임라인(#1, 2026-07-23 추가) + card_progress | 출고 이후 **실제 배송 진척(집화→배송중→완료) 없음** |

목표: **경동택배** 물량의 배송 상태를 API로 끌어와 "배송완료=추정"을 **API 확인 기반**으로 대체하고, 포털/내부에 실배송 진척을 노출.

## 2. 선행 결정과의 정합성 (재론 방지 — 필독)

`2026-06-11-hanjin-courier-decision.md`: **통합배송솔루션 계약 기각(2026-07-02)** — 동선 최적화 + 유료 송장발급 프로젝트 폐기.

본 spec은 그 기각 범위와 **다름**:

| | 기각된 통합솔루션 | 본 spec (B안) |
|---|---|---|
| 송장 발급 자동화 | 포함 | ❌ 제외 (기존 수기/엑셀 유지) |
| 동선 최적화·배차 | 포함 | ❌ 제외 |
| 과금 | 건당 100~300원 | **무료 조회 API 등급** (조회 API는 무료, 20회/일·운송장 한도) |
| 용도 | 발급+추적 풀패키지 | **배송 상태 조회(추적)만** |

→ B안 = **무료 조회 API 단일 용도**. 유료 계약 아님. 기각 결정과 상충하지 않음.

## 3. 조사 결과 — 택배사별 실현 가능성

| 택배사 | 스마트택배 지원 | 방안 |
|---|---|---|
| **경동택배** | ★ 완전 지원 (코드 `KDEXP`, 실시간 조회 API) | **API 자동추적 + 배송완료 자동확정** |
| **대신화물** | △ freight = 표준 aggregator 밖(대신"택배" kr.daesin은 지원, 대신"화물"은 별개) | **딥링크 + 시간추정 유지** (POD는 C에서) |
| 한진택배 | 지원(코드 있음) | 잔여 물량 시 경동과 동일 파이프라인 재사용 가능 |

**스윗트래커 조회 API 사실**:
- Base `http://info.sweettracker.co.kr`
- 택배사 목록: `GET /api/v1/companylist?t_key={KEY}`
- 실시간 조회: `GET /api/v1/trackingInfo?t_key={KEY}&t_code={택배사코드}&t_invoice={운송장}`
- 응답 핵심: `level`(1~6), `complete`(bool)/`completeYN`('Y'/'N'), `trackingDetails[]`(단계별 시각·위치), `lastDetail`
- **level 매핑**: 1 배송준비 · 2 집화완료 · 3 배송중 · 4 지점도착 · 5 배송출발 · **6 배송완료**
- **한도**: 동일 운송장 **1일 최대 20회** 조회 → 폴링 설계는 shipment당 하루 수회 이내로 제약

## 4. 범위 (B안)

- **In**: 경동택배 운송장 → 스마트택배 조회 API 폴링 → `shipments.status`/배송완료 자동확정 → 포털·내부 배송진척 노출. 경동/대신화물/한진 **조회 딥링크** 정비.
- **Out(후속 C)**: POD(수령확인 버튼/사진·서명) — 자가배송(직배/퀵/용차)·대신화물 실물 수령확인. 별도 spec.
- **Out(영구)**: 송장 자동발급, 동선 최적화.

## 5. 현재 구현 (변경 대상 — 근거)

- `shipments.status`: `PREPARING/SHIPPED/IN_TRANSIT/DELIVERED/CANCELLED` (`shipments.ts:1116`)
- 출고 시 `orders.auto_complete_date` 설정 (`shipments.ts:881`), `tracking_number/courier_name` 수기 (`shipments.ts:1005-1007`)
- 시간기반 자동완료: `POST /sync-statuses` (`orders/lifecycle.ts:517`, Step1 `522-541`)
- 조회 딥링크(한진만): `portalOrders.js:59`, `shipments.js`
- 무인 cron 인프라: `workers/barobill-cron` → `/api/cron/*` (`agentKeyMiddleware`, `cron.ts`). ★ **폴링 cron을 여기 재사용**
- 포털 배송 표시: `portal.ts` 주문상세 `shipments` + `#1 timeline`; `portalOrders.js renderShipmentInfo`

⚠️ **경동택배가 현재 `delivery_method` 드롭다운에 없음** (`orders.ts:87-93` = 대신택배/대신화물/한진택배/직배/용차/퀵/방문수령). → P1에서 **경동택배 옵션 추가** 필수.

## 6. 설계

### 6.1 택배사 코드 매핑 (SSOT)
`src/constants/couriers.ts` 신설 — `delivery_method`/`courier_name` → 스마트택배 `t_code`.

| delivery_method | t_code | 추적 |
|---|---|---|
| 경동택배 | `KDEXP` | API |
| 한진택배 | (companylist로 확인) | API(선택) |
| 대신화물 | — | 딥링크만 |
| 대신택배 | (kr.daesin 대응코드) | API(선택) |
| 직배/용차/퀵/방문수령 | — | 자가배송(POD=C) |

딥링크 URL도 이 상수에 함께 정의(단일소스). 경동 `kdexp.com` barcode 조회 URL·대신화물 `daesin.co.kr` 화물조회 URL은 **구현 시 실URL 검증**(대신화물은 GET 딥링크 불가 시 조회 페이지 링크로 폴백).

### 6.2 조회 API 서비스
`src/services/smartTracker.ts` — `getTrackingInfo(tCode, invoice)`, `getCompanyList()`.
- key = **secret `SMART_TRACKER_KEY`**(wrangler secret) + 게이트 `settings.smart_tracker_enabled='1'`. (알림톡 `kakao_enabled` 패턴 동일)
- 실패/미등록 운송장(level 0·에러코드) graceful 처리 — silent catch 금지, 진단 surfacing([[project-card-sync-collection]] 교훈).

### 6.3 폴링 cron
`/api/cron/courier-track` (`agentKeyMiddleware`), `workers/barobill-cron` 스케줄에 추가(예: 3회/일 — 20회/일 한도 내).
- 대상 shipment: `status IN ('SHIPPED','IN_TRANSIT')` AND `tracking_number` 有 AND `courier`가 API대상(경동 등) AND `delivered_at IS NULL`.
- 각 건 `getTrackingInfo` → level 매핑 → 상태/`delivered_at`/`tracking_level`/`last_tracked_at` 갱신.
- 법인별 반복(기존 cron 패턴), `X-Agent-Key` 인증.

### 6.4 상태 매핑 & 전이
| API level | shipments.status | 부수효과 |
|---|---|---|
| 1~2 | SHIPPED | tracking_level 갱신 |
| 3~5 | IN_TRANSIT | tracking_level·last_tracked_at |
| **6 (complete)** | **DELIVERED** | `delivered_at=수령시각`, **orders 배송완료 확정**(auto_complete_date 대체·`sync-statuses`와 정합), (선택) 고객 알림톡 |

- 배송완료 확정 로직은 `sync-statuses`의 시간기반 전이와 **이원화 금지** — API 확정이 우선, 미추적(대신화물/자가배송)은 기존 시간기반 폴백 유지. 공통 확정 헬퍼로 수렴.

### 6.5 대신화물·자가배송
- 대신화물: 조회 딥링크(포털+내부) 추가 + 기존 시간추정 배송완료 유지.
- 자가배송(직배/퀵/용차): 변경 없음 → POD(C)에서 수령확인.

### 6.6 스키마 (마이그레이션 — PRAGMA 확인 후 확정)
`shipments` 추가(가안): `delivered_at DATETIME`, `tracking_level INTEGER`, `last_tracked_at DATETIME`, (필요시)`courier_code TEXT`.
- ⚠️ 컬럼 존재 여부 `PRAGMA table_info(shipments)` 선확인([[feedback-db-schema-check]]), 신규 마이그는 `execute --file` 직접 적용([[feedback-migration-idempotency]]).
- `settings`: `smart_tracker_enabled`. secret: `SMART_TRACKER_KEY`.

### 6.7 프론트
- 포털: `renderShipmentInfo`에 배송 stage(level 라벨)·최근 추적시각·조회버튼(경동/대신화물). `#1 timeline`에 "배송완료(수령)" 실시각 반영.
- 내부 `/shipments`: 배송상태 배지(집화/배송중/완료) + 최근추적시각 컬럼.

## 7. Phase 분할

| P | 내용 | 산출물 |
|---|---|---|
| **P1** | 상수(couriers.ts)·경동택배 옵션 추가·smartTracker service·companylist 확인·스키마 마이그·settings/secret | 조회 API 단건 동작(수동 호출) |
| **P2** | 폴링 cron `/api/cron/courier-track` + 상태전이/배송완료 확정 헬퍼(시간기반과 수렴) | 경동 자동추적·자동확정 |
| **P3** | 포털·내부 배송진척 UI + 조회 딥링크(경동/대신화물) | 고객/직원 가시성 |
| **P4(후속)** | POD — 자가배송/대신화물 수령확인(버튼·사진·서명) | 별도 spec(C) |

## 8. 미결정 / 리스크

1. **API key 발급 주체·등급** — 무료 조회 등급 한도(일 조회수·운송장수) 확인. 물량(일 10~20건, [[project-delivery-system]]) 대비 20회/일·건 한도 충분.
2. **대신화물 딥링크** — GET 파라미터 조회 가능 여부 불확실(고객정보 추가입력 요구 가능) → 조회 페이지 링크 폴백.
3. **경동택배 courier_name/delivery_method 표기 표준화** — 기존 데이터에 경동 표기 혼재 가능 → 매핑 시 정규화.
4. **rate limit 준수** — shipment당 폴링 3회/일 이하로 스케줄, DELIVERED 도달 시 폴링 중단(`delivered_at` 가드).
5. **이원 확정 정합** — API 확정 vs 시간기반 `sync-statuses` 충돌 방지(공통 헬퍼·API 우선).

## 9. 착수 조건

```
[용준님] 스마트택배 무료 조회 API key 발급 ──→ P1 착수
[P1 companylist 확인] 경동/대신/한진 t_code 확정 ──→ 매핑 상수 확정
[P3 후] POD 필요 판단 ──→ C spec 착수
```

**공수(가안)**: P1 ~1세션 · P2 ~1세션 · P3 ~1세션. (POD 별도)
