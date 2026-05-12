# LogWatcher 사용방법 가이드

## 1. 개요

LogWatcher는 각 RIP/프린터 PC에 설치되어 출력 이벤트를 실시간 감시하고, MES 서버에 자동 보고하는 에이전트 프로그램입니다.

### v2.0 — 두 가지 모드

| 모드 | 설정 파일 | 장비 수 | 용도 |
|------|-----------|---------|------|
| **Universal** (신규) | `equipment.json` | 다중 | 여러 장비를 1개 프로세스로 감시 |
| **Legacy** (기존) | `appsettings.json` | 단일 | 기존 TopazRip/PrintExp 전용 배포 호환 |

> `equipment.json`이 실행 폴더에 있으면 Universal 모드, 없으면 Legacy 모드로 자동 전환됩니다.

---

## 1-A. Universal 모드 (v2.0)

### 동작 흐름

```
equipment.json (장비 설정)
  ↓
WatcherManager → 장비별 파서 생성
  ↓
[TNS 파서]  [PrintExp 파서]  [SQLite DB 파서 (Epson)]  ...
  ↓              ↓                   ↓
  ← ← ← ← PrintEvent 통합 ← ← ← ←
  ↓
POST /api/print-events → MES
```

### equipment.json 설정

```json
{
  "poll_interval_seconds": 5,
  "heartbeat_interval_seconds": 60,
  "watchers": [
    {
      "equipment_id": "TPM-01",
      "name": "TopazRip 1호기",
      "enabled": true,
      "parser_type": "tns",
      "config": {
        "log_path": "C:\\TNSRip-X1\\Print.log"
      }
    },
    {
      "equipment_id": "EPSON-01",
      "name": "Epson 에코솔벤트 (SC-S9100)",
      "enabled": true,
      "parser_type": "sqlite_db",
      "config": {
        "db_path": "C:\\ProgramData\\Epson\\Epson Edge Print\\DB\\Data.db",
        "query": "SELECT j.JobID, j.JobName, l.FinishPrintTime, p.OriginalSizeWidth, p.OriginalSizeHeight FROM Job j JOIN Log l ON j.JobID = l.JobID LEFT JOIN Page p ON j.JobID = p.JobID AND p.PageID = 1 WHERE j.JobStatus = 12 AND j.JobID > @last_id ORDER BY j.JobID",
        "id_column": "JobID",
        "filename_column": "JobName",
        "timestamp_column": "FinishPrintTime",
        "size_columns": ["OriginalSizeWidth", "OriginalSizeHeight"],
        "size_unit": "pt",
        "read_only": true
      }
    }
  ]
}
```

### 전역 설정

| 항목 | 설명 | 기본값 |
|------|------|--------|
| `poll_interval_seconds` | 전체 폴링 주기 | `5` |
| `heartbeat_interval_seconds` | 장비별 heartbeat 주기 | `60` |

### 파서 타입별 config

#### `tns` — TopazRip 바이너리 로그

| 파라미터 | 필수 | 설명 |
|---------|------|------|
| `log_path` | ✅ | Print.log 파일 경로 |

#### `printexp` — PrintExp 텍스트 로그

| 파라미터 | 필수 | 설명 |
|---------|------|------|
| `log_path` | ✅ | 로그 폴더 경로 (Log[날짜].txt가 있는 폴더) |

#### `sqlite_db` — SQLite DB 폴링 (Epson 등)

| 파라미터 | 필수 | 설명 | 예시 |
|---------|------|------|------|
| `db_path` | ✅ | SQLite DB 파일 경로 | `C:\ProgramData\Epson\...\Data.db` |
| `query` | ✅ | 새 완료 건 조회 SQL. `@last_id` 파라미터 사용 | 위 예시 참조 |
| `id_column` | ✅ | ID 컬럼명 (위치 추적용, 단조 증가) | `JobID` |
| `filename_column` | ✅ | 파일명 컬럼명 | `JobName` |
| `timestamp_column` | | 완료 시간 컬럼명 | `FinishPrintTime` |
| `size_columns` | | 크기 컬럼 [width, height] | `["OriginalSizeWidth", "OriginalSizeHeight"]` |
| `size_unit` | | 크기 단위 (`pt`/`mm`/`inch`) | `pt` |
| `read_only` | | 읽기 전용 모드 | `true` |

### CLI 명령어 (Universal 모드)

```bash
# 특정 장비 파싱 테스트 (API 전송 없음, 전체 재읽기)
LogWatcher.exe --test EPSON-01

# 모든 장비 파싱 테스트
LogWatcher.exe --test

# 등록된 장비 목록 + 상태 확인
LogWatcher.exe --list

# equipment.json 유효성 검사
LogWatcher.exe --validate

# 일반 실행 (폴링 시작)
LogWatcher.exe
```

### 위치 추적 파일

각 장비별 독립 파일이 `positions/` 폴더에 저장됩니다.

```
positions/
├── TPM-01.pos     ← "123456" (바이트 오프셋)
├── RIP-03.pos     ← "789012"
└── EPSON-01.pos   ← "2116" (마지막 완료 JobID)
```

특정 장비를 처음부터 다시 읽으려면 해당 `.pos` 파일을 삭제하세요.

### 배포 체크리스트 (Universal 모드)

1. `dotnet publish -c Release -r win-x64 --self-contained true -o publish`
2. `publish/` 폴더를 대상 PC에 복사 (권장: `C:\LogWatcher\`)
3. `equipment.json` 작성 (`equipment.json.example` 참조)
4. `appsettings.json`의 `MesApiUrl`, `ApiKey`만 확인 (장비 설정은 equipment.json)
5. `LogWatcher.exe --test` → 파싱 결과 확인
6. `LogWatcher.exe --list` → 장비 상태 OK 확인
7. `install.bat` 관리자 권한으로 실행
8. MES `/rip` 대시보드에서 에이전트 온라인 확인

---

## 1-B. Legacy 모드 (v1.x 호환)

> `equipment.json`이 없으면 자동으로 이 모드로 동작합니다. 기존 배포된 RIP PC는 변경 없이 그대로 동작합니다.

LogWatcher는 단일 RIP 소프트웨어(TopazRip/PrintExp)의 로그를 감시합니다.

### Legacy 동작 흐름

```
RIP PC (TopazRip)
  │
  │  출력 실행 → Print.log에 기록
  │
  ▼
LogWatcher (Windows 서비스)
  │  5초마다 Print.log 감시
  │  새 이벤트 감지 (OK/Cancel/Error)
  │
  ▼
MES 서버 (POST /api/print-events)
  │  ① 이벤트 기록
  │  ② 파일명에서 카드번호 추출 (YYYYMMDD-NNN-CC)
  │  ③ 카드 매칭 시 상태 자동 변경 → PRINT_DONE
  │
  ▼
웹 대시보드 (/rip)
     실시간 출력 현황 모니터링
```

---

## 2. 사전 요구사항 (공통)

| 항목 | 설명 |
|------|------|
| OS | Windows 10/11 (64bit) |
| .NET 런타임 | **불필요** (self-contained 빌드로 내장됨) |
| 네트워크 | MES 서버 `192.168.0.94:3000` 접근 가능 |
| TopazRip | `C:\TNSRip-X11\Print.log` 파일 존재 |
| 디스크 | ~70MB (self-contained EXE + 런타임) |

---

## 3. 빌드 (개발 PC에서)

```bash
cd C:\Users\user\dongsan_mes\LogWatcher
dotnet publish -c Release -r win-x64 --self-contained true -o publish
```

빌드 결과물: `LogWatcher\publish\` 폴더 (약 67MB)

---

## 4. 배포 (Legacy 모드)

### 4.1 폴더 복사

`LogWatcher\publish\` 폴더 전체를 각 RIP PC에 복사합니다.

**권장 경로**: `C:\LogWatcher\`

복사 대상 파일:
```
C:\LogWatcher\
├── LogWatcher.exe          ← 실행 파일
├── appsettings.json        ← 설정 파일 (PC마다 확인)
├── install.bat             ← 서비스 등록 스크립트
└── (기타 런타임 파일들)
```

### 4.2 설정 파일 (appsettings.json)

각 RIP PC에서 `appsettings.json`을 환경에 맞게 확인/수정합니다.

```json
{
  "MesApiUrl": "http://192.168.0.94:3000",
  "ApiKey": "dongsan-rip-agent-2026",
  "PrintLogPath": "C:\\TNSRip-X11\\Print.log",
  "PollIntervalSeconds": 5,
  "HeartbeatIntervalSeconds": 60,
  "OfflineQueuePath": "pending_events.json"
}
```

| 항목 | 설명 | 기본값 |
|------|------|--------|
| `MesApiUrl` | MES 서버 주소 | `http://192.168.0.94:3000` |
| `ApiKey` | 에이전트 인증 키 (변경 금지) | `dongsan-rip-agent-2026` |
| `PrintLogPath` | TopazRip Print.log 경로 | `C:\TNSRip-X11\Print.log` |
| `PollIntervalSeconds` | 로그 확인 주기 (초) | `5` |
| `HeartbeatIntervalSeconds` | 서버 연결 확인 주기 (초) | `60` |
| `OfflineQueuePath` | 오프라인 큐 파일 경로 | `pending_events.json` |

> **참고**: `PrintLogPath`가 PC마다 다를 수 있으므로 반드시 확인하세요.

---

## 5. 실행 방법 (Legacy 모드)

### 5.1 테스트 모드 (파싱 확인용)

Print.log를 읽어서 파싱 결과만 화면에 표시합니다. MES 서버로 전송하지 않습니다.

```bash
# 기본 Print.log 경로 사용
LogWatcher.exe --test

# 특정 파일 지정
LogWatcher.exe --test "C:\TNSRip-X11\Print.log"
```

출력 예시:
```
=== LogWatcher v1.0 ===
PC: RIP-PC-01
[TEST MODE] Parsing: C:\TNSRip-X11\Print.log
Found 24114 events:
  [OK] 20210602_현수막_테스트
    Printer: Super Color New H8_A1
    Path: Z:\DESIGN\현수막\2021\06\20210602-001\20210602_현수막_테스트.eps
    Size: 800.000 X 1207.333  DPI: 720x720 DPI
    Time: 2021-06-02 10:15:30 ~ 2021-06-02 10:23:41
    Card: 20210602-001-01
```

> **먼저 테스트 모드로 파싱이 정상 동작하는지 확인한 후** 서비스를 등록하세요.

### 5.2 수동 실행

`LogWatcher.exe`를 더블클릭하거나 명령 프롬프트에서 실행합니다.
콘솔 창이 열리며 실시간 로그를 확인할 수 있습니다.

```
=== LogWatcher v1.0 ===
PC: RIP-PC-01
API: http://192.168.0.94:3000
Print.log: C:\TNSRip-X11\Print.log
Poll: 5s, Heartbeat: 60s

[START] Monitoring Print.log...

[HEARTBEAT] Sent OK
[INFO] Found 3 new print events
[API] Sent: 테스트파일 (OK)
[API] Sent: 현수막_001 (OK)
[API] Sent: 배너_002 (ERROR)
```

### 5.3 Windows 서비스 등록 (권장)

**관리자 권한**으로 `install.bat`을 실행합니다.

```
install.bat 우클릭 → "관리자 권한으로 실행"
```

서비스가 등록되면 PC 재시작 시에도 자동으로 LogWatcher가 실행됩니다.

#### 서비스 관리 명령어 (관리자 명령 프롬프트)

```bash
# 서비스 상태 확인
C:\Users\user\dongsan_mes\nssm-2.24\win64\nssm.exe status LogWatcher

# 서비스 중지
C:\Users\user\dongsan_mes\nssm-2.24\win64\nssm.exe stop LogWatcher

# 서비스 시작
C:\Users\user\dongsan_mes\nssm-2.24\win64\nssm.exe start LogWatcher

# 서비스 재시작
C:\Users\user\dongsan_mes\nssm-2.24\win64\nssm.exe restart LogWatcher

# 서비스 완전 제거
C:\Users\user\dongsan_mes\nssm-2.24\win64\nssm.exe remove LogWatcher confirm
```

> **참고**: NSSM은 `C:\Users\user\dongsan_mes\nssm-2.24\win64\nssm.exe`에 위치합니다.
> RIP PC에 NSSM이 없으면 `nssm-2.24` 폴더도 함께 복사하거나, `install.bat`의 NSSM 경로를 수정하세요.

---

## 6. MES 자동 연동

### 6.1 카드 상태 자동 변경

LogWatcher가 출력 완료(OK) 이벤트를 감지하면:

1. 파일명에서 카드번호 추출: `YYYYMMDD-NNN-CC` 패턴 (예: `20260223-001-01`)
2. MES DB에서 `CARD-20260223-001-01` 카드 검색
3. 매칭 성공 → 카드 상태를 `PRINT_DONE`으로 자동 변경
4. 해당 주문의 **모든** 카드가 `PRINT_DONE`이면 → 주문 상태도 `PRINT_DONE`

### 6.2 카드번호 매칭 조건

파일명에 `YYYYMMDD-NNN-CC` 형식이 포함되어야 자동 매칭됩니다.

| 파일명 예시 | 매칭 결과 |
|-------------|-----------|
| `20260223-001-01_현수막.eps` | CARD-20260223-001-01 매칭 |
| `현수막_20260223-001-01.pdf` | CARD-20260223-001-01 매칭 |
| `test_banner.eps` | 매칭 안됨 (이벤트는 기록됨) |

> **참고**: 매칭되지 않는 파일도 출력 이벤트 자체는 MES에 기록됩니다. RIP 대시보드에서 모든 출력 내역을 확인할 수 있습니다.

### 6.3 중복 방지

동일한 파일경로 + 완료시간 조합은 한 번만 기록됩니다 (idempotency).
LogWatcher를 재시작하거나 네트워크 복구 시 중복 전송해도 안전합니다.

---

## 7. RIP 대시보드

MES 웹에서 `/rip` 페이지로 접속합니다.

**주소**: `http://192.168.0.94:3000/rip`

### 화면 구성

| 영역 | 내용 |
|------|------|
| 에이전트 상태바 | 전체/온라인/오프라인 에이전트 수, 오프라인 경고 |
| KPI 카드 | 오늘 출력 완료/에러/취소 건수 |
| 이벤트 탭 | 최근 출력 이벤트 목록 (상태 필터, 페이지네이션) |
| 에이전트 탭 | RIP PC 목록, IP, 마지막 접속 시간, 온라인 상태 |
| 통계 탭 | 최근 7일 출력 건수 차트 (OK/Cancel/Error) |

> 대시보드는 15초마다 자동 새로고침됩니다.

---

## 8. 문제 해결

### 8.1 로그 파일 위치

서비스로 실행 시 로그 파일:
```
C:\LogWatcher\logwatcher_stdout.log   ← 정상 출력
C:\LogWatcher\logwatcher_stderr.log   ← 에러 출력
```

> 로그 파일은 5MB 단위로 자동 로테이션됩니다 (NSSM 설정).

### 8.2 오프라인 큐

네트워크 장애로 MES 전송 실패 시 `pending_events.json`에 자동 저장됩니다.
네트워크 복구 후 다음 폴링 시 자동으로 재전송합니다.

```
C:\LogWatcher\pending_events.json
```

### 8.3 주요 에러 메시지

| 메시지 | 원인 | 해결 |
|--------|------|------|
| `[FATAL] Failed to load equipment.json` | equipment.json 파싱 오류 | JSON 문법 확인 (`--validate`로 검증) |
| `[FATAL] No enabled equipment found` | 활성 장비 없음 | equipment.json에서 `"enabled": true` 확인 |
| `[EPSON-01] DB busy` | Epson DB 잠금 | 자동 재시도됨. 반복 시 Epson Edge Print 확인 |
| `[FATAL] appsettings.json not found` | 설정 파일 없음 | 실행 파일과 같은 폴더에 appsettings.json 배치 |
| `[WARN] Print.log not found` | Print.log 경로 틀림 | appsettings.json의 PrintLogPath 확인 |
| `[API] Failed (401)` | API 키 불일치 | appsettings.json의 ApiKey 확인 |
| `[API] Error: ...timeout` | 네트워크 연결 실패 | MES 서버 접근 가능한지 확인 (ping 192.168.0.94) |
| `[QUEUE] Event queued` | 전송 실패, 큐 저장 | 네트워크 복구 시 자동 재전송 |

### 8.4 위치(position) 초기화

**Legacy 모드**: `last_position.txt`를 삭제하면 전체 로그를 다시 읽습니다.

```bash
del C:\LogWatcher\last_position.txt
```

**Universal 모드**: `positions/` 폴더에서 해당 장비 파일을 삭제합니다.

```bash
# 특정 장비만 초기화
del C:\LogWatcher\positions\EPSON-01.pos

# 전체 초기화
del C:\LogWatcher\positions\*.pos
```

### 8.5 서비스 재설치

문제 발생 시 서비스를 제거하고 다시 설치합니다.

```bash
# 관리자 명령 프롬프트에서
C:\Users\user\dongsan_mes\nssm-2.24\win64\nssm.exe stop LogWatcher
C:\Users\user\dongsan_mes\nssm-2.24\win64\nssm.exe remove LogWatcher confirm

# install.bat 다시 실행 (관리자 권한)
install.bat
```

---

## 9. 배포 체크리스트

각 RIP PC에 배포할 때 아래 순서대로 진행합니다.

- [ ] `publish\` 폴더를 RIP PC에 복사 (권장: `C:\LogWatcher\`)
- [ ] `appsettings.json`에서 `PrintLogPath` 경로 확인
- [ ] NSSM 파일 존재 확인 (`C:\Users\user\dongsan_mes\nssm-2.24\` 또는 함께 복사)
- [ ] 테스트 모드 실행: `LogWatcher.exe --test` → 파싱 결과 확인
- [ ] MES 서버 연결 확인: `ping 192.168.0.94`
- [ ] `install.bat` 관리자 권한으로 실행
- [ ] 서비스 상태 확인: `nssm status LogWatcher` → `SERVICE_RUNNING`
- [ ] MES 대시보드(`/rip`)에서 해당 PC 에이전트 온라인 확인
- [ ] TopazRip에서 테스트 출력 → 대시보드에 이벤트 표시 확인
