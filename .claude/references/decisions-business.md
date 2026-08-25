# 설계 결정: 비즈니스·인프라

## 시스템 구성

```
[서버 PC]
  └── npm run dev:d1 → http://192.168.0.94:3000 (MES 웹서버)

[Automat PC — Illustrator 설치 PC]
  ├── IllustratorAutomat.exe (COM 자동화, 5초 폴링)
  └── Z:\ → \\192.168.0.122\... (NAS 매핑)

[디자인 PC ×8대 / 현장 PC ×~20대]
  └── LogWatcher.exe (Print.log 감시, 5초 폴링, is_printing 자동 감지)

[NAS Z:\]
  └── \\192.168.0.122\... — PDF/PNG 출력 저장, 모든 PC 접근 가능
```

## A. Print.log 모니터링 — LogWatcher (2026-02-25)

**아키텍처**
```
[각 PC — LogWatcher.exe]
  ├── 5초 폴링으로 Print.log 파일 크기 감시 (마지막 읽은 offset 기억)
  ├── 신규 로그 엔트리 파싱 → 주문번호 추출 → POST /api/print-events
  └── 미전송 이벤트 로컬 SQLite 큐 저장 → 재시도 (오프라인 내성)

[MES 서버 — /api/print-events]
  ├── POST 수신 → order_number 매칭
  ├── 주문/카드 PRINT_DONE 자동 전환
  └── 중복 방지: (file_path + timestamp) 복합 idempotency key
```

**TNSRip-X11 Print.log 파싱 규칙**
- 파일 형식: **바이너리** (필드별 4바이트 길이 접두사 + 데이터)
- 문자열 인코딩: **EUC-KR** (codepage 949)
- 상태 마커: `OK!` / `Cancel!` / `Error!` (ASCII 바이트 매칭)
- 파싱 방식: 상태 마커 위치에서 역방향으로 필드 추출 (ReadFieldsBackward)
- 카드번호: `(E\d+-)?\d{8}-\d{3}-\d{2}`, 주문번호: `(E\d+-)?\d{8}-\d{3}` — 법인채번 `E{eid}-` 접두 포함(2026-06 도입). 서버측 매칭 정본=printEvents.ts resolveCard(E-prefix 대응, 2026-07-04)
- 인쇄 상태 감지: 파일 크기 변화 + 90초 타임아웃 → is_printing 플래그

**LogWatcher 설정 (appsettings.json)**
```json
{
  "MesApiUrl": "http://192.168.0.94:3000",
  "ApiKey": "agent-key",
  "PrintLogPath": "C:\\TNSRip-X11\\Print.log",
  "PollIntervalSeconds": 5,
  "HeartbeatIntervalSeconds": 60,
  "EquipmentId": "PRINTER-01"
}
```

**추가 기능**: 하트비트 60초, 오프라인 큐, RIP Job 폴링, Copy/Tile Layout 추출

---

## B. 묶음 주문 확정 워크플로우 (2026-02-20)
- PackGroups 완료 → ai_layout_requests.status='done'
- 웹 [확정] 버튼 → POST /api/ai-layout/:id/confirm
- 순서: PDF 존재 확인 → Z드라이브 복사 → 상태 PRODUCTION
- 중간 실패 시 전체 롤백

---

## C. 카카오톡 알림 (2026-02-20 설계 → **2026-06-10 구현·운영 중**)
- 이벤트: PRINT_DONE, SHIPPED, HOLD
- 구조: notifications 테이블 → 발송 워커
- ⚠️ 「미구현」은 2026-02-20 시점 표기였다. **현재는 바로빌 KakaoTalk 로 발송 중**(`src/routes/kakao.ts`·`src/services/barobillSms.ts`).
  동작·발송 함정(SenderID=연동ID · 성공판정=음수 아님 · -24005) 정본 = auto-memory `project-alimtalk-status`

---

## D. 현장 카드 인쇄 (2026-02-20)
- 정보: 거래처명+주문번호, 품목명+규격, 납품일+방법, QR, 썸네일
- 인쇄: 복수 선택 → CSS @media print

**긴급도 알고리즘** (deliveryDate - today): D-0 이하 🔴긴급 | D-1 🟠높음 | D-2~3 🟡보통 | D-4+ 🟢여유

---

## E. 묶음 주문 두 가지 유형 (2026-02-20)
- **유형1**: 동일 품목 내 개별 내용 (parent_item_id 구조)
- **유형2**: 파일 내 그룹을 롤 너비에 배치 (PackGroups — 구현완료)

---

## F. 납품 방법 7종 (2026-02-20)

| code | label |
|------|-------|
| HANJIN | 한진택배 |
| DAESHIN_PARCEL | 대신택배 |
| DAESHIN_CARGO | 대신화물 |
| QUICK | 퀵 |
| DIRECT | 직배 |
| PICKUP | 방문수령 |
| TRUCK | 용차 |

---

## G. 묶음 편집 + 카드 생성 규칙 (2026-03-01)

**묶음 편집 DB 구조** (migration 0019)
```
order_items
  부모행: parent_item_id=NULL, quantity=N, amount=N×단가 (청구기준, 카드미생성)
  자식행: parent_item_id=부모id, quantity=1, amount=0 (출력기준)
```

**카드 생성: 대분류(카테고리)별 1카드**

| 행 유형 | 조건 | 카드 |
|---------|------|------|
| 부모행 | parent_item_id=NULL, 자식 있음 | 미생성 (메타데이터만) |
| 자식행 | parent_item_id IS NOT NULL | 부모 카테고리 카드에 card_item 추가 |
| 단독행 | parent_item_id=NULL, 자식 없음 | 해당 카테고리 카드에 card_item 추가 |

- `cards.order_item_id = NULL`, `cards.item_name = 카테고리명`
- 자식행: 부모의 카테고리/PP 상속, qty=1

---

## H. JSX getFullBounds 케이스 계층

```
Case 0: 부모 Layer clipping===true PathItem geometricBounds (폭/높이 25%~130%)
        → Strip clip 예외: 폭>=70%·높이<25%
Case 1: group.clipped===true → 직속 clipping===true PathItem
Case 2: 직속 자식 GroupItem 내부 clipping===true PathItem → 면적 최대
Case 3: 열재단 파일 휴리스틱 → root와 5% 이내 자식 GroupItem
Case 4: 모든 실패 → group.visibleBounds
```

**JSX 로그 파일**: `publish/ia_debug.log`(ProcessOrderItem), `publish/ia_diag.log`(ExtractGroups), `publish/ia_error.log`(예외), `publish/error.log`(PackGroups)

---

## I. UI/UX 디자인 시스템 (2026-04-04)

- **상세 가이드**: `mes-ui-consistency` 스킬 참조
- **핵심**: 비주얼 8개(호버쉐도우, 트랜지션, 글래스톱, #F0F1F3, Inter, tabular-nums, 포커스링, 호버전용액션) + UX 5개(스켈레톤, 빈상태, 밀도토글, 줄무늬, 헤더고정)
- **제외**: 라운드 코너, 다크 액센트

---

## 작업 공간 (장비 구역)

| 구역 | 장비/작업 |
|------|----------|
| 전사출력실 | 전사 프린터 — 깃발, 가로등배너 |
| 봉재실 | 봉제기 — 전사 후 봉제 |
| 출력실 | 솔벤트/UV/현수막 복합 출력 + 재단 |
| 현수막실 | 현수막 전용 출력 + 미싱 |
| UV실 | UV/솔벤트 3.2m 대형 — 대량 물량, 후렉스 |
| 간판실 | 간판 제조/조립 |

## 공통 상수

| 상수 | 값 | 사용처 |
|------|-----|--------|
| ERP_API_URL | http://192.168.0.94:3000 | Program.cs, LogWatcher, 개발서버 |
| NAS 경로 | \\\\192.168.0.122\\... (Z:\\) | PDF/PNG 출력 |
| 프로덕션 URL | https://webapp-9i0.pages.dev | Cloudflare Pages |

---

## AD. 출고번호(shipment_number) 포맷 (2026-05-21)

포맷: `SHP-E{entity_id}-YYYYMMDD-NNN`
- entity별 독립 시퀀스 (법인 간 번호 충돌 없음)
- NNN: 당일 entity 내 출고 순번 (001~)

## AE. CODEF API 전면 제거 (2026-05-21)

- 이유: 월 80만원 이용료 — 비용 대비 효과 없음
- `src/lib/codef.ts` 삭제, `cardExpenses.ts`의 CODEF 연동 엔드포인트 제거
- DB 컬럼 `codef_transaction_id`는 유지 (CSV import 등 다른 경로 활용 가능)
- 대안 검토: 이메일 파싱(Cloudflare Email Worker), 카드사 오픈API 직접 문의 진행 중
- 상세 → `memory/project-card-data-collection.md`

## AF. BOM 법인 간 공유 정책 (2026-05-21)

- BOM 테이블에 entity_id 미추가 — 전 법인 공통 BOM 사용
- 이유: 동산기획/선명/청주 간 제조 공정이 동일, 분리 실익 없음
- 재검토 트리거: 법인별 공정 차이가 발생할 경우

## AL. 자금관리 바로빌 통장 탭 은행 연동 통합 (2026-05-24)

- 바로빌 통장 탭(실시간 API 조회 전용) 제거 → 은행 연동 탭에 통합
- 이유: 은행 연동의 "바로빌 동기화"가 동일 API를 호출하여 DB에 적재+매칭까지 처리, 별도 조회 탭은 중복
- 통합 내용: 바로빌 연결 상태 바, 잔액 열 추가
- 삭제: `src/scripts/barobillView.js` (310줄, dead card 코드 포함)
- 탭 구조: 은행 연동 / 캐시플로 (3탭→2탭)

## BF. 휴일/공휴일 derive-at-read 단일소스 (2026-06-12)

- 휴일 판정의 유일 소스 = `holidays` 달력 테이블(마이그 0311) + 토·일 (둘 다 휴일)
- 근태·급여는 저장된 휴일 플래그가 아니라 **날짜에서 파생** — attendance를 재분류(mutate)하는 "반영 버튼" 방식 금지
- 상세 → memory `design-holiday-derive`

## BG. 배송/출고 정합화 · 합배송 · 합포장 (2026-07-02)

- **shipment 생성 일원화**: `ensureShipmentForOrder`(`src/utils/shipmentHelper.ts`) — 출고확정 전 경로(bulk-ship·대시보드 ship·수동/무인 전이·카드 단건/QR/일괄)가 공용 호출. delivery_method→delivery_type 매핑 정본 = `DELIVERY_TYPE_MAP`(부분 복제 금지)
- **orders.shipped_at**(마이그 0436) = 주문 단위 출고일 정본 (cards.shipped_at 분산 보완, 유통주문 커버). SHIPPED 전이 시 COALESCE 스탬프, 출고취소 복원 시 NULL
- **합배송 후보 API** `GET /api/shipments/consolidation-candidates` = **명시적 cross-entity**(entityFilter 의도적 미적용, ADMIN·MANAGER 게이트) — 법인 데이터 분리 정책의 예외. 목적=복수 법인 같은 날 출고의 합짐·합포장 조율
- **우편번호 = 컬럼이 아닌 쿼리시점 파생**: `delivery_info`의 `[12345]` 프리픽스를 substr+GLOB 추출(권역=앞 3자리). 쓰기경로 무변경·수정과 상시 동기
- **합포장 = merged_into_id 포인터 모델**(마이그 0437): 주문별 shipment 행 유지(법인별 이력 보존), 부속→대표 포인터. 송장/라벨/수신자 정본=대표(쓰기 리다이렉트=`applyShipmentFieldPatch`). 주문ID 저장은 `PATCH /api/shipments/by-order/:orderId`(shipment PK 오매칭 방지)
- 상세 → memory `project-delivery-system`

## BH. 출고 검수 · 전량 출고 하드게이트 · /pack 권한 (2026-07-03, 출고관리 v2)

- **부분출고 전면 불가 = 전량 출고 하드게이트** (용준님 확정): 미완성(미출고·PRINT_DONE 미달) 카드가 1장이라도 있으면 주문 단위 출고 확정 자체를 차단(카드 스탬프 없이 사유+카드목록 반환). bulk-ship의 "완성분만 조용히 부분출고" 경로 제거, `POST /api/shipments`도 ①미완성 카드 400 ②card_ids 미커버 400. 카드 단건 QR 스탬프(scan)는 적재 기록으로 유지(주문 전이는 전량 시에만)
- **검수 정본 = `shipment_checks` 별도 테이블**(마이그 0439, shipment×order_item UNIQUE): shipment_items 승격안 기각 — 카드행/라인행 혼합 의미라 라인당 중복행 위험. `packed_quantity NULL=전량`(예외 시에만 수량), checked_at은 최초 체크 시각 COALESCE 보존. 검수 게이트=소프트(경고 후 진행 허용), 출고 게이트=하드 — 두 강제성 분리
- **/pack 권한 모델**: 페이지=`requirePagePermission('/pack')`(permission_pages 0439, MANAGER/OPERATOR 기본), shipments API 라우터 게이트=`requireAnyPagePermission('/shipments','/pack')`로 확장(orders 라우터의 '/orders','/cards' 패턴)
- **합배송 v2**: 후보=당일 anchor 거래처의 미출고 전체(같은 법인 복수주문 포함, rows≥2), merge 납품일 검증 제거(대기 배지=`consolidate_partner_pending_date`), merge 시 0438 예약 포인터 동기(unmerge 클리어와 대칭)
- 상세 → memory `project-delivery-system` · spec `2026-07-03-shipping-verification-consolidation-v2.md`
