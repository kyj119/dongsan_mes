# LogWatcher 장비 중심 모델 + 페이지 정리 설계

> 작성: 2026-06-15
> 상태: **P1~P3 구현 완료 (미배포)**, P4(검증/배포) 대기. (2026-06-15)
> - P1 서버: 마이그 0312 + heartbeat 자동등록 + /equipment 조회 보강 — 타입+빌드+로컬DB 검증 완료
> - P2 LogWatcher: heartbeat에 equipment_name·print_log_path 추가 — 빌드 완료(재배포 필요)
> - P3 프론트: /equipment 수집PC·로그경로 표시 + /rip 페이지 폐기(/api/rip 유지) — 빌드 완료
> - P4 남음: permission_pages '/rip' 정리, 스모크, 프로덕션 배포 + LogWatcher 재배포
> 관련: `docs/UNIVERSAL_LOGWATCHER_DESIGN.md`, `docs/LOGWATCHER_EQUIPMENT_INVENTORY.md`, 메모리 `project-logwatcher-rollout`

---

## 1. 배경 / 문제

LogWatcher Universal 모드로 현장 PC(예: PC-202605061622, FlexiPRINT+PrintExp 2장비)를 가동한 뒤 드러난 3가지 문제:

| 관찰 | 진짜 원인 (코드 근거) |
|------|----------------------|
| 생산현황(/production)엔 PC가 뜨는데 장비관리(/equipment)엔 안 뜸 | `/production`은 `agent_heartbeats`(LogWatcher **자동 upsert**)를, `/equipment`는 `equipment` 테이블(**수동 등록**)을 본다. heartbeat가 `equipment_id`로 equipment를 조회해 없으면 **무음 스킵** (`src/routes/printEvents.ts:385-401`) |
| /rip ↔ /production 중복 | 둘 다 `print_events` + `/api/print-events/agents` 동일 API. KPI·장비상태·출력이력·7일차트 전부 중복. `/rip`은 메뉴 미노출(숨김), `/production`이 정식 메뉴 |
| /rip에 Print.log 경로 안 나옴 | Universal heartbeat(`MesApiClient.SendHeartbeatForEquipmentAsync`, `LogWatcher/MesApiClient.cs:127`)가 `print_log_path`를 **안 보냄**(Legacy `SendHeartbeatAsync`만 보냄). 또한 한 PC=에이전트 1행이라 장비 N개의 로그경로 표현 불가 |

### 근본 구조 문제
- 한 PC에 장비가 여러 개인데 `agent_heartbeats`는 **PC당 1행**(`agent_id` = `Environment.MachineName`, `LogWatcher/Program.cs:81`).
- `agent_heartbeats.equipment_id`는 마지막으로 heartbeat 보낸 장비 값만 남아 장비 구분 불가.
- `equipment` 테이블과 `agent_heartbeats`는 **FK 없는 분리 구조** (`migrations/0020`, `0021`, `0027`).

---

## 2. 현재 구조 (코드 근거)

### 페이지
| 페이지 | 경로/정의 | 데이터소스 | 역할 | 메뉴 |
|--------|----------|-----------|------|------|
| 생산 현황 | `/production` (`src/pages/production.ts`, `src/routes/production.ts`) | `/api/print-events/*`, `/api/cards`, `/api/production/*` | KPI·장비상태·출력이력·스케줄(드래그&드롭) | ✅ "생산 현황" |
| RIP 모니터 | `/rip` (`src/pages/rip.ts`, `src/routes/rip.ts`) | `print_events`, `agent_heartbeats`, `/api/print-events/*`, `/api/rip/*` | 에이전트 목록·이벤트·통계 | ❌ 숨김 |
| 장비 관리 | `/equipment` (`src/pages/equipment.ts`, API는 `src/routes/rip.ts`) | `equipment*` 테이블, `/api/rip/equipment/*` | 장비 등록·배치도·가동률·헤드·소모품·정비 | ✅ "장비 관리" |

메뉴 정의: `src/layout/menu.ts` ("생산" 그룹). `/rip`은 메뉴에 없음.

### 테이블
**`equipment`** (`migrations/0027` + `0049`/`0072`/`0083`/`0302` 확장): `id TEXT PK`, `name`, `printer_name`, `ip_address`, `status`, `equipment_status`(RUNNING/IDLE/MAINTENANCE/BROKEN), `head_count`, `location_x/y`, `zone_id`, `daily_capacity`, `size_type`, `entity_id`.
**`agent_heartbeats`** (`migrations/0020` + `0021`/`0050`): `id PK`, `agent_id UNIQUE`, `equipment_id`(FK 없음), `agent_version`, `ip_address`, `last_seen_at`, `print_log_path`, `status`, `is_printing`.

### heartbeat 처리 (`src/routes/printEvents.ts:360-412`)
- `agent_heartbeats` upsert (사전등록 불필요).
- `equipment_id` 있으면 `SELECT equipment_status FROM equipment WHERE id=?` → **있을 때만** RUNNING/IDLE 자동전환(MAINTENANCE/BROKEN 수동 유지). 없으면 무음 스킵.

---

## 3. 목표

1. LogWatcher가 감지한 장비가 **/equipment(장비관리)에 장비별로** 자동 등장 — 가동상태·온라인·Print.log경로·출력실적 표시.
2. `/rip` ↔ `/production` **중복 제거** (/rip 폐기).
3. **장비별 Print.log 경로** 표시 (heartbeat 보강).

---

## 4. 설계 결정 (합의됨)

### 4.1 장비 중심 일원화
- 장비 상태/로그를 **`equipment` 테이블로 통합** (에이전트=PC는 보조 생존정보로 유지).
- `equipment` 테이블 확장:
  - `last_seen_at DATETIME` — 장비별 마지막 heartbeat (온라인 판정용)
  - `print_log_path TEXT` — 장비별 로그 경로
  - `agent_id TEXT` — 이 장비를 수집 중인 PC(호스트명)
  - (`is_printing`은 기존 `equipment_status` RUNNING/IDLE로 이미 표현됨)
- 온라인 판정: `equipment.last_seen_at` 기준 120초 (대시보드 `printEvents.ts:649` 로직과 동일하게).

### 4.2 자동 등록 (heartbeat 시)
- `POST /api/print-events/heartbeat` 핸들러 수정:
  - `equipment_id` 수신 시 `equipment`에 **없으면 자동 INSERT**: `name`(=수신한 `equipment_name`, 없으면 `equipment_id`), `equipment_status='IDLE'`, `entity_id=1`(동산 기본), `agent_id`, `last_seen_at`, `print_log_path`.
  - **있으면** `equipment_status`(RUNNING/IDLE, MAINTENANCE/BROKEN은 보존) + `last_seen_at` + `print_log_path` + `agent_id` 갱신.
- `entity_id`는 기본 동산(1) → 관리자가 /equipment에서 공정·위치·법인 보강(간판=선명 등 수동 조정).
- 기존 `agent_heartbeats` upsert는 **호환 위해 유지**(PC 단위 생존).

### 4.3 LogWatcher heartbeat 보강
- `MesApiClient.SendHeartbeatForEquipmentAsync`에 `equipment_name`, `print_log_path`(장비별 `log_path`) 추가 (`LogWatcher/MesApiClient.cs:127`).
- `WatcherManager`가 장비별 `name`·`log_path`를 전달 (`LogWatcher/Core/WatcherManager.cs:136`).
- 파서별 "로그 경로" 노출: flexi=파일경로, printexp=폴더, epson=db_path, tns/text_log=log_path.
- 재빌드(다중파일 self-contained, 현행 csproj 유지) → `Z:\Designs\LogWatcher-v2.zip` 갱신 → 현장 PC 교체.

### 4.4 페이지 정리 — /rip 폐기
- `GET /rip` 페이지 라우트 제거(`src/index.tsx`) + `src/pages/rip.ts` 제거 + 잔존 링크/참조 정리.
- **`/api/rip/*` API는 유지** (/equipment 페이지가 사용).
- /rip 고유 기능 흡수처:
  - 에이전트(수집 PC) 온라인/오프라인·**Print.log 경로**·오프라인 경고 → **/equipment**(장비별 표시 + 수집PC 정보).
  - 출력 이벤트 이력·KPI·7일차트 → 이미 **/production**에 존재.

---

## 5. Phase 계획

### Phase 1 — 서버: 자동등록 + 장비별 상태
- 마이그레이션 `NNNN_equipment_logwatcher.sql`: `equipment`에 `last_seen_at`, `print_log_path`, `agent_id` 컬럼 추가(멱등 — `ALTER TABLE` 중복 주의, 메모리 `feedback-migration-idempotency`).
- `printEvents.ts` heartbeat 핸들러: 자동 INSERT + 장비별 갱신 로직.
- `GET /api/rip/equipment` 조회에 `computed_status`(online/offline, 120s) + `print_log_path` + `last_seen_at` 포함.
- **검증**: 기존 RIP PC 동작 보존(자동등록이 기존 수동등록 장비 안 깨뜨림), `npm run verify`.

### Phase 2 — LogWatcher heartbeat 보강
- `MesApiClient`/`WatcherManager` 수정 → `equipment_name`·`print_log_path` 전송.
- `dotnet publish`(다중파일) → zip 갱신 → 현장 PC 교체.
- **검증**: `--test` 후 실제 heartbeat로 equipment 자동 등록·로그경로 수신 확인.

### Phase 3 — 프론트: /equipment 강화 + /rip 폐기
- `/equipment` 목록/현황에 온라인상태·Print.log경로·수집PC·최근수집시각 표시(`src/pages/equipment.ts`, `src/scripts/equipment*.js`).
- `/rip` 페이지 폐기(라우트·페이지·메뉴/링크 정리). `/api/rip/*` 유지.
- **검증**: `npm run build && npm run smoke`, /equipment·/production 정상.

### Phase 4 — 검증 / 문서
- 스모크(Playwright), 고아 데이터 점검.
- 문서·메모리 갱신(`project-logwatcher-rollout`, `design-decisions`).

---

## 6. 영향 범위 / 리스크

- **마이그레이션**: 프로덕션 `equipment` 컬럼 추가 — 멱등성·미적용 마이그 주의(메모리 `feedback-migration-idempotency`).
- **기존 RIP PC**: 자동등록 로직이 이미 수동등록된 장비를 덮어쓰지 않게(있으면 UPDATE만). MAINTENANCE/BROKEN 상태 보존.
- **LogWatcher 재배포**: 현장 PC들 zip 교체 필요(현재 PC-202605061622 외 추가 PC 진행 중).
- **entity_id**: 자동등록 기본 동산(1) → 선명 장비(간판 등)는 관리자 보강 필요(누락 시 매출/집계 영향, 메모리 `project-entity-policy`).
- **/rip 폐기**: 외부 링크·북마크·문서 참조 정리.

---

## 7. 미결정 / 추후

- `agent_heartbeats` 테이블 장기 운명(장비중심 전환 후 PC 생존용으로 축소 유지 vs 폐기) — 호환 위해 당분간 유지.
- 한 장비를 여러 PC가 중복 수집하는 경우(현재 없음) 처리.
- csv_log·jdf_folder·multiline 파서(인벤토리 진행 중 필요 시).
