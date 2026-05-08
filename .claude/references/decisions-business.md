# 설계 결정: 비즈니스·인프라 (A~I)

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
- 카드번호: `\d{8}-\d{3}-\d{2}`, 주문번호: `\d{8}-\d{3}`
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

## C. 카카오톡 알림 — 미구현 (2026-02-20)
- 이벤트: PRINT_DONE, SHIPPED, HOLD
- 구조: notifications 테이블 → 발송 워커

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
