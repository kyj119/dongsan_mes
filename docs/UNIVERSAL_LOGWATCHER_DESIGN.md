# 범용 LogWatcher 설계 문서

> 작성: 2026-05-12
> 목적: 7가지 이상 장비의 로그를 **1개 에이전트 + 설정 파일**로 통합 감시
> 상태: 설계 완료 + Epson 로그 분석 완료 (2026-05-12), 구현 착수 가능

---

## 1. 현재 상태와 문제

### 현재 아키텍처

```
LogWatcher.exe (C# .NET 8)
├── PrintLogParser.cs     ← TopazRip 전용 (바이너리, EUC-KR)
├── PrintExpLogParser.cs  ← PrintExp 전용 (텍스트, UTF-16LE)
└── Program.cs            ← 단일 파서만 실행
```

- 장비 1종 = 파서 코드 1개 (400~600줄)
- 새 장비 추가 = C# 코드 개발 + 빌드 + 배포
- 7가지 이상 장비에 대응 불가

### 확인된 장비별 로그 형식

| 장비 | RIP 소프트웨어 | 로그 형식 | 현재 파서 |
|------|---------------|----------|----------|
| TopazRip (솔벤트) | TNSRip-X1/X11 | 바이너리 (EUC-KR, 필드 길이 접두사) | ✅ PrintLogParser |
| PrintExp (UV?) | PrintExp | 텍스트 (UTF-16LE, 상태 머신) | ✅ PrintExpLogParser |
| Epson Edge Print (에코솔벤트) | Epson Edge Print 7.6 | **SQLite DB** (Job+Log 테이블) + JDF XML + log.txt | ❌ 없음 |
| 장비 4~7+ | 미확인 | 미확인 | ❌ 없음 |

### Epson Edge Print 로그 분석 결과 (2026-05-12 확인)

**데이터 위치**: `C:\ProgramData\Epson\Epson Edge Print\` (로컬) / `Z:\Designs\Epson Edge Print\` (NAS 백업)

```
Epson Edge Print/
├── DB/Data.db          ← SQLite 3.x ★ 핵심 데이터 소스
├── Job/{번호}/         ← 잡별 폴더 (1898~2124, 총 140개)
│   ├── Rip/1_RipJdf.jdf   ← JDF XML (잡 설정, 크기 정보)
│   ├── Source/Source.eps   ← 원본 파일
│   └── Preview/            ← 썸네일
├── Log/log.txt         ← 시스템 로그 (드라이버 레벨, 저수준)
└── Settings/           ← 앱 설정
```

**DB 핵심 테이블:**

| 테이블 | 역할 | 핵심 컬럼 |
|--------|------|-----------|
| `Job` | 잡 마스터 | `JobID`, `JobName`, `JobStatus`, `OriginalFileName` |
| `Log` | 인쇄 이력 | `JobID`, `EntryTime`, `StartPrintTime`, **`FinishPrintTime`**, `PrintTimes` |
| `Page` | 페이지 크기 | `OriginalSizeWidth`, `OriginalSizeHeight` (포인트 단위) |

**JobStatus 코드:**
| Status | 의미 | 비고 |
|--------|------|------|
| 2 | 등록/대기 | |
| 6 | RIP 완료 (인쇄 대기) | |
| 7 | 인쇄 중 | |
| **12** | **인쇄 완료** | 132/140건 |

**JobName 형식 (현재):**
- `(솔벤시트)2-5(141X172-1장).eps` — 카드번호-파일번호(크기) 패턴
- `KR유통04(93x173-1장).eps` — 거래처+번호(크기) 패턴
- `25-(솔벤시트)푸른광고-옷걸이(24x10)-12일 점심 자동문.eps` — 긴급건

> ⚠️ IA 명명규칙(`YYYYMMDD-NNN`)이 아직 적용되지 않음. OrderMatcher 확장 필요.

**데이터 소스 비교 (설계 결정):**
| 방식 | 장점 | 단점 |
|------|------|------|
| JDF 폴더 감시 | XML에서 크기 추출 가능 | RIP 완료만 감지, 인쇄 완료 시점 모름 |
| log.txt 텍스트 파싱 | ClosePrinterDriver로 인쇄 완료 감지 | JobName 없음, Job ID로 JDF 재조회 필요 |
| **DB 폴링 ★ 채택** | `FinishPrintTime` + `JobName` + `JobStatus` 한 쿼리 | DB 잠금 가능성 (읽기 전용+WAL이면 안전) |

### 공통점 (설계 기반)

모든 장비가 공유하는 특성:
1. **로그 파일이 존재** — 형식만 다를 뿐 로그는 있음
2. **폴더 구조가 유사** — Job/Log/Output 패턴
3. **파일명에 주문번호 포함** — IA가 `YYYYMMDD-NNN` 형식으로 통일
4. **완료 이벤트가 존재** — "출력 완료" 시점을 나타내는 마커

---

## 2. 설계 목표

```
새 장비 추가 = equipment.json에 규칙 1개 추가 (5분)
코드 변경 없음. 빌드 없음. 재시작만.
```

### 핵심 원칙

1. **Config-driven**: 파싱 규칙은 JSON 설정으로 정의, 코드에 하드코딩 금지
2. **Plugin 구조**: 파서 타입별 플러그인, 새 타입 추가는 1클래스
3. **주문번호 추출 통일**: 파일명에서 `YYYYMMDD-NNN` 정규식으로 추출 (IA 명명 규칙)
4. **기존 파서 호환**: TNS/PrintExp 파서는 그대로 유지, 플러그인으로 래핑
5. **다중 장비 동시 감시**: 1개 프로세스에서 N개 장비 병렬 폴링

---

## 3. 아키텍처

### 전체 구조

```
LogWatcher.exe (범용)
│
├── equipment.json          ← 장비별 파싱 규칙 (유일한 설정 파일)
│
├── Core/
│   ├── WatcherManager.cs   ← 장비별 워처 생성/관리, 병렬 폴링
│   ├── EventDispatcher.cs  ← API 전송 + 오프라인 큐 (기존 로직)
│   └── OrderMatcher.cs     ← 파일명 → 주문번호 추출 (공통)
│
├── Parsers/                ← 플러그인 (ILogParser 인터페이스)
│   ├── TnsParser.cs        ← 기존 PrintLogParser 래핑
│   ├── PrintExpParser.cs   ← 기존 PrintExpLogParser 래핑
│   ├── TextLogParser.cs    ← 정규식 기반 범용 텍스트 파서
│   ├── SqliteDbParser.cs   ← SQLite DB 폴링 (Epson 등) ★ 핵심
│   ├── JdfFolderParser.cs  ← XML JDF 폴더 감시 (폴백)
│   └── CsvLogParser.cs     ← CSV 컬럼 매핑 파서
│
└── appsettings.json        ← MES URL, API 키 등 (기존)
```

### 데이터 흐름

```
[장비 N대의 로그 파일들]
    ↓ (5초마다 폴링)
WatcherManager: equipment.json 읽기 → 장비별 파서 인스턴스 생성
    ↓
각 파서: last_position 이후 새 데이터 읽기 → PrintEvent 생성
    ↓
OrderMatcher: 파일명에서 주문번호 추출 (YYYYMMDD-NNN)
    ↓
EventDispatcher: POST /api/print-events → MES
    ↓ (실패 시)
OfflineQueue: pending_events.json 큐잉 → 다음 폴링에서 재시도
    ↓
Heartbeat: 60초마다 장비별 heartbeat 전송
```

---

## 4. equipment.json 스키마

```json
{
  "$schema": "equipment-schema.json",
  "poll_interval_seconds": 5,
  "heartbeat_interval_seconds": 60,

  "watchers": [
    {
      "equipment_id": "TPM-01",
      "name": "TopazRip 1호기 (솔벤트)",
      "enabled": true,
      "parser_type": "tns",
      "config": {
        "log_path": "C:\\TNSRip-X1\\Print.log",
        "encoding": "euc-kr"
      }
    },
    {
      "equipment_id": "RIP-03",
      "name": "TopazRip 2호기 (솔벤트)",
      "enabled": true,
      "parser_type": "tns",
      "config": {
        "log_path": "C:\\TNSRip-X11\\Print.log",
        "encoding": "euc-kr"
      }
    },
    {
      "equipment_id": "EPSON-01",
      "name": "Epson 에코솔벤트 (SC-S9100)",
      "enabled": true,
      "parser_type": "epson",
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
    },
    {
      "equipment_id": "UV-01",
      "name": "UV 평판 프린터",
      "enabled": true,
      "parser_type": "text_log",
      "config": {
        "log_path": "D:\\UV\\print.log",
        "encoding": "utf-8",
        "completion_pattern": "Print completed:\\s*(.+)",
        "filename_group": 1,
        "error_pattern": "Print failed:\\s*(.+)",
        "timestamp_pattern": "^(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2})",
        "timestamp_format": "yyyy-MM-dd HH:mm:ss"
      }
    },
    {
      "equipment_id": "CUT-01",
      "name": "카팅기",
      "enabled": true,
      "parser_type": "csv_log",
      "config": {
        "log_path": "D:\\Cutter\\job_log.csv",
        "encoding": "utf-8",
        "delimiter": ",",
        "has_header": true,
        "timestamp_column": 0,
        "filename_column": 3,
        "status_column": 5,
        "success_values": ["OK", "DONE", "완료"],
        "error_values": ["ERROR", "FAIL", "실패"]
      }
    },
    {
      "equipment_id": "SIGN-01",
      "name": "간판기",
      "enabled": false,
      "parser_type": "text_log",
      "config": {
        "log_path": "E:\\Sign\\output.log",
        "encoding": "cp949",
        "completion_pattern": "작업완료\\s+파일명=(.+?)\\s",
        "filename_group": 1
      }
    }
  ]
}
```

---

## 5. 파서 타입 상세

### 5.1 `tns` — TopazRip 바이너리 (기존)

기존 `PrintLogParser.cs`를 `ILogParser` 인터페이스로 래핑.
변경 없이 그대로 사용.

- 입력: 바이너리 Print.log (EUC-KR, 필드 길이 접두사)
- 출력: PrintEvent (파일명, 크기, DPI, 상태, 시간)
- 위치 추적: 바이트 오프셋 (`last_position_{equipment_id}.txt`)

### 5.2 `printexp` — PrintExp 텍스트 (기존)

기존 `PrintExpLogParser.cs`를 `ILogParser` 인터페이스로 래핑.
변경 없이 그대로 사용.

- 입력: UTF-16LE 텍스트 (`Log[YYYY_MM_DD].txt`)
- 출력: PrintEvent (파일명, DPI, 크기, 상태)
- 위치 추적: `날짜|오프셋` 형식

### 5.3 `text_log` — 정규식 기반 범용 텍스트 파서 ★

**가장 많은 장비를 커버하는 핵심 파서.**

config 파라미터:
| 파라미터 | 필수 | 설명 | 예시 |
|---------|------|------|------|
| `log_path` | ✅ | 로그 파일 경로 | `D:\\UV\\print.log` |
| `encoding` | ✅ | 인코딩 | `utf-8`, `cp949`, `euc-kr` |
| `completion_pattern` | ✅ | 완료 이벤트 정규식 | `Print completed:\s*(.+)` |
| `filename_group` | ✅ | 정규식에서 파일명 캡처 그룹 번호 | `1` |
| `error_pattern` | | 에러 이벤트 정규식 | `Print failed:\s*(.+)` |
| `timestamp_pattern` | | 타임스탬프 정규식 | `^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})` |
| `timestamp_format` | | 타임스탬프 포맷 | `yyyy-MM-dd HH:mm:ss` |
| `size_pattern` | | 출력 크기 정규식 | `Size:\s*(\d+)x(\d+)mm` |
| `multiline_start` | | 멀티라인 이벤트 시작 마커 | `--- Job Start ---` |
| `multiline_end` | | 멀티라인 이벤트 종료 마커 | `--- Job End ---` |
| `rotation` | | 파일 로테이션 방식 | `none` (기본), `daily_suffix`, `size` |
| `daily_suffix_format` | | 일별 파일명 패턴 | `log_{yyyy_MM_dd}.txt` |

동작 방식:
```
1. log_path 파일 열기 (last_position부터)
2. 새 라인마다 completion_pattern 매칭
3. 매칭되면 → filename_group에서 파일명 추출
4. OrderMatcher로 주문번호 추출
5. PrintEvent 생성 → 전송
```

### 5.4 `jdf_folder` — XML JDF 폴더 감시

Epson Edge Print처럼 **잡별 폴더가 생성되는 구조**용.

config 파라미터:
| 파라미터 | 필수 | 설명 |
|---------|------|------|
| `job_folder` | ✅ | 잡 폴더 루트 경로 |
| `jdf_subpath` | ✅ | 잡 폴더 내 JDF 파일 상대 경로 |
| `filename_attribute` | ✅ | JDF XML에서 파일명 속성명 |
| `size_attribute` | | 출력 크기 속성명 |
| `completion_check` | | 완료 판정 방식 (기본: JDF 파일 존재) |

동작 방식:
```
1. job_folder 스캔 → 숫자 폴더명 목록
2. last_job_id 이후 새 폴더 감지
3. jdf_subpath 파일 존재 확인 (= RIP 완료)
4. XML 파싱 → filename_attribute에서 파일명 추출
5. PrintEvent 생성
```

### 5.5 `csv_log` — CSV 컬럼 매핑 파서

CSV 형식 로그용. 컬럼 인덱스로 데이터 매핑.

config 파라미터:
| 파라미터 | 필수 | 설명 |
|---------|------|------|
| `log_path` | ✅ | CSV 파일 경로 |
| `delimiter` | | 구분자 (기본 `,`) |
| `has_header` | | 헤더 행 여부 |
| `timestamp_column` | ✅ | 타임스탬프 컬럼 인덱스 |
| `filename_column` | ✅ | 파일명 컬럼 인덱스 |
| `status_column` | | 상태 컬럼 인덱스 |
| `success_values` | | 성공 상태 값 목록 |
| `error_values` | | 에러 상태 값 목록 |
| `size_columns` | | 크기 컬럼 [width_idx, height_idx] |

### 5.6 `epson` — SQLite DB 폴링 ★ (Epson 등)

**RIP 소프트웨어가 자체 SQLite DB를 사용하는 장비용.**
Epson Edge Print가 대표적. DB에 잡 상태, 타임스탬프, 파일명이 모두 있어 가장 정확한 데이터 추출 가능.

config 파라미터:
| 파라미터 | 필수 | 설명 | 예시 |
|---------|------|------|------|
| `db_path` | ✅ | SQLite DB 파일 경로 | `C:\ProgramData\Epson\...\Data.db` |
| `query` | ✅ | 새 완료 건 조회 SQL (`@last_id` 파라미터 사용) | 아래 참조 |
| `id_column` | ✅ | 결과에서 ID로 사용할 컬럼명 (위치 추적용) | `JobID` |
| `filename_column` | ✅ | 결과에서 파일명으로 사용할 컬럼명 | `JobName` |
| `timestamp_column` | | 완료 시간 컬럼명 | `FinishPrintTime` |
| `size_columns` | | 크기 컬럼 [width, height] | `["OriginalSizeWidth", "OriginalSizeHeight"]` |
| `size_unit` | | 크기 단위 (`pt`, `mm`, `inch`) 기본 `mm` | `pt` |
| `read_only` | | 읽기 전용 모드 (기본 `true`) | `true` |
| `null_timestamp_value` | | 미완료 타임스탬프 값 (필터링용) | `0001-01-01` |

동작 방식:
```
1. db_path를 읽기 전용 + 불변 모드로 열기 (SQLITE_OPEN_READONLY)
   → "Data Source={path};Mode=ReadOnly;Pooling=false;"
2. query 실행 (WHERE id > @last_id)
3. 결과 행마다 PrintEvent 생성:
   - filename = filename_column 값
   - timestamp = timestamp_column 값 파싱
   - size = size_columns 값을 size_unit에 따라 mm로 변환 (pt → ÷ 2.835)
4. OrderMatcher로 주문번호 추출
5. last_id = 마지막 행의 id_column 값으로 갱신
```

**Epson 전용 쿼리:**
```sql
SELECT j.JobID, j.JobName, l.FinishPrintTime,
       p.OriginalSizeWidth, p.OriginalSizeHeight
FROM Job j
JOIN Log l ON j.JobID = l.JobID
LEFT JOIN Page p ON j.JobID = p.JobID AND p.PageID = 1
WHERE j.JobStatus = 12 AND j.JobID > @last_id
ORDER BY j.JobID
```

**DB 잠금 안전성:**
- Epson Edge Print는 SQLite WAL 모드 미사용 (journal mode) 이나,
  읽기 전용 + 불변 모드(`immutable=1`)로 열면 잠금 없이 읽기 가능
- 단, 앱이 쓰기 중이면 SQLITE_BUSY 발생 → 5초 후 재시도 (1폴링 스킵)
- 폴링 간격 5초이므로 실질적 영향 없음

---

## 6. 공통 모듈

### 6.1 ILogParser 인터페이스

```csharp
public interface ILogParser
{
    string EquipmentId { get; }
    List<PrintEvent> ReadNewEntries();
    void ResetPosition();
    bool IsFileAccessible();
}
```

모든 파서가 이 인터페이스를 구현. WatcherManager는 인터페이스만 알면 됨.

### 6.2 OrderMatcher (주문번호 추출)

```csharp
public static class OrderMatcher
{
    // IA 명명 규칙: YYYYMMDD-NNN[-FFF]
    private static readonly Regex OrderPattern =
        new Regex(@"(\d{8}-\d{3})(?:-(\d+))?");

    public static (string? orderNumber, int? fileSeq) Extract(string filename)
    {
        var match = OrderPattern.Match(filename);
        if (!match.Success) return (null, null);
        var seq = match.Groups[2].Success ? int.Parse(match.Groups[2].Value) : (int?)null;
        return (match.Groups[1].Value, seq);
    }
}
```

모든 파서가 공유. 파일명에서 주문번호를 추출하는 로직은 1곳에만 존재.

### 6.3 WatcherManager (다중 장비 관리)

```csharp
public class WatcherManager
{
    private readonly List<ILogParser> _parsers = new();

    public void LoadConfig(string configPath)
    {
        var config = JsonSerializer.Deserialize<EquipmentConfig>(File.ReadAllText(configPath));
        foreach (var watcher in config.Watchers.Where(w => w.Enabled))
        {
            _parsers.Add(ParserFactory.Create(watcher));
        }
    }

    public async Task PollAll()
    {
        foreach (var parser in _parsers)
        {
            var events = parser.ReadNewEntries();
            foreach (var evt in events)
            {
                await _dispatcher.SendEventAsync(evt);
            }
            await _dispatcher.SendHeartbeatAsync(parser.EquipmentId, ...);
        }
    }
}
```

### 6.4 ParserFactory (파서 생성)

```csharp
public static class ParserFactory
{
    public static ILogParser Create(WatcherConfig config)
    {
        return config.ParserType switch
        {
            "tns"        => new TnsParser(config),
            "printexp"   => new PrintExpParser(config),
            "text_log"   => new TextLogParser(config),
            "epson"  => new SqliteDbParser(config),
            "jdf_folder" => new JdfFolderParser(config),
            "csv_log"    => new CsvLogParser(config),
            _ => throw new ArgumentException($"Unknown parser type: {config.ParserType}")
        };
    }
}
```

---

## 7. 위치 추적 (Position Tracking)

각 장비별 독립적인 위치 파일:

```
positions/
├── TPM-01.pos          ← "123456" (바이트 오프셋)
├── RIP-03.pos          ← "789012"
├── EPSON-01.pos        ← "2116" (마지막 완료 JobID)
├── UV-01.pos           ← "45678" (바이트 오프셋)
└── CUT-01.pos          ← "2026-05-12|1234" (날짜|오프셋)
```

파서 타입별 위치 형식:
| 타입 | 위치 형식 | 리셋 조건 |
|------|----------|----------|
| `tns` | 바이트 오프셋 | 파일 크기 < 위치 |
| `printexp` | `날짜\|오프셋` | 날짜 변경 시 새 파일 |
| `text_log` | 바이트 오프셋 | 파일 크기 < 위치 |
| `epson` | 마지막 완료 ID (예: JobID) | - (단조 증가) |
| `jdf_folder` | 마지막 잡 ID (폴더 번호) | - |
| `csv_log` | 라인 번호 | 파일 크기 < 위치 |

---

## 8. 오프라인 큐 + 에러 처리

기존 LogWatcher의 `EventQueue` + `pending_events.json` 그대로 활용.

추가 사항:
- 장비별 독립 큐 (한 장비 에러가 다른 장비에 영향 없음)
- 장비별 백오프 (한 장비 파일 접근 실패 시 해당 장비만 백오프)
- 장비 비활성화: `"enabled": false`로 즉시 중단 (재시작 없이 config reload)

---

## 9. MES 서버 측 변경

### 현재 API (변경 없음)

```
POST /api/print-events          ← 이벤트 수신 (그대로)
POST /api/print-events/heartbeat ← 하트비트 (그대로)
GET  /api/print-events/agents    ← 에이전트 목록 (그대로)
```

이벤트 페이로드에 `equipment_id`가 이미 포함되므로 서버 변경 불필요.

### 추가 검토 (선택)

- `/api/equipment` 에 LogWatcher 연결 상태 표시 (heartbeat 기반)
- 장비별 일일 출력 통계 대시보드
- equipment.json 원격 관리 API (MES에서 장비 config 수정 → LogWatcher 자동 반영)

---

## 10. 새 장비 추가 절차

### 단계 1: 로그 샘플 수집 (5분)

장비 PC에서 로그 파일 위치 확인. 출력 1건 실행 후 로그 변화 확인.

### 단계 2: 파서 타입 결정 (5분)

| 로그 특성 | 파서 타입 |
|----------|----------|
| 바이너리 파일 | 전용 파서 필요 (드문 케이스) |
| 텍스트 로그 (한 줄에 이벤트 1개) | `text_log` |
| 텍스트 로그 (멀티라인 이벤트) | `text_log` (multiline 옵션) |
| XML/JDF 잡 폴더 | `jdf_folder` |
| CSV/TSV 형식 | `csv_log` |

### 단계 3: config 작성 (5분)

```json
{
  "equipment_id": "NEW-01",
  "name": "새 장비",
  "enabled": true,
  "parser_type": "text_log",
  "config": {
    "log_path": "경로",
    "encoding": "utf-8",
    "completion_pattern": "완료 패턴 정규식",
    "filename_group": 1
  }
}
```

### 단계 4: 테스트 (5분)

```powershell
LogWatcher.exe --test --equipment NEW-01
# → 로그 파일을 읽어서 파싱 결과만 콘솔에 출력 (API 전송 없음)
```

### 단계 5: 적용

```powershell
# equipment.json 수정 후 서비스 재시작
nssm restart LogWatcher
```

**총 소요: 20분. 코드 변경 없음.**

---

## 11. 구현 로드맵 (수정: 2026-05-12)

### Phase 1: 기반 구조 리팩토링 (1세션)

- `ILogParser` 인터페이스 정의
- `WatcherManager`, `ParserFactory` 구현
- 기존 `PrintLogParser` → `TnsParser`로 래핑
- 기존 `PrintExpLogParser` → `PrintExpParser`로 래핑
- `equipment.json` 스키마 정의 + 로딩
- 기존 `appsettings.json` 호환 유지 (마이그레이션 경로)
- 장비별 독립 위치 파일 (`positions/`)
- **검증**: 기존 TNS/PrintExp 동작이 깨지지 않는지 확인

### Phase 2: SqliteDbParser — Epson 연동 ★ (0.5~1세션)

> **우선순위 상향**: 로그 분석 완료, 즉시 구현 가능. NuGet `Microsoft.Data.Sqlite` 추가.

- `SqliteDbParser` 구현 (config 기반 SQL 쿼리 실행)
- 읽기 전용 모드 + SQLITE_BUSY 재시도 (3회, 1초 간격)
- `@last_id` 파라미터 바인딩 → 새 완료 건만 조회
- 크기 단위 변환 (pt → mm: ÷ 2.835)
- `--test --equipment EPSON-01`로 실제 Data.db 대상 테스트
- **검증**: NAS의 `Z:\Designs\Epson Edge Print\DB\Data.db`로 연결 테스트
- **주의**: Epson Edge Print 실행 중에도 읽기 가능한지 현장 검증

### Phase 3: TextLogParser 범용 파서 (1세션)

- 정규식 기반 텍스트 파서 구현
- 싱글라인 + 멀티라인 모드
- 인코딩 자동 감지 (BOM)
- 파일 로테이션 지원 (daily suffix)
- `--test` 모드로 파싱 결과 검증
- **검증**: 실제 장비 로그 샘플로 테스트

### Phase 4: CsvLogParser + JdfFolderParser (0.5세션)

- CSV 컬럼 매핑 파서 (카팅기 등)
- JDF 폴더 파서 (epson 사용 불가한 장비 폴백용)
- **검증**: 실제 로그 샘플로 테스트

### Phase 5: OrderMatcher 확장 + 관리 도구 (1세션)

- OrderMatcher: 현재 Epson JobName 패턴 지원 추가
  - `(솔벤시트){카드번호}-{파일번호}(WxH-N장).eps` → 카드 매핑
  - `YYYYMMDD-NNN` 패턴 (IA 적용 후)
- `--test --equipment {id}` 모드 (장비별 테스트)
- `--list` 모드 (등록된 장비 목록 + 상태)
- `--validate` 모드 (equipment.json 검증)
- Config hot-reload (재시작 없이 설정 반영, 선택)

---

## 12. 마이그레이션 경로

기존 LogWatcher → 범용 LogWatcher 전환:

```
1. appsettings.json의 기존 설정을 equipment.json으로 변환
   (자동 변환 스크립트 제공)

2. 기존 last_position.txt → positions/{equipment_id}.pos 이동

3. 새 LogWatcher.exe 배포 (기존과 같은 위치)

4. nssm restart LogWatcher

5. 동작 확인 후 기존 appsettings.json 파싱 코드 제거 (Phase 2+)
```

호환성:
- `equipment.json`이 없으면 기존 `appsettings.json`으로 폴백
- 기존 배포 환경에서 즉시 교체 가능

---

## 13. 비용 대비 효과

### Before (현재)

| 항목 | 비용 |
|------|------|
| 새 장비 1종 추가 | C# 파서 개발 1~2세션 + 빌드 + 배포 |
| 7가지 장비 전체 | 7~14세션 (비현실적) |
| 유지보수 | 파서 7개 × RIP 업데이트 대응 |

### After (범용 LogWatcher)

| 항목 | 비용 |
|------|------|
| 초기 구축 | 3~4세션 (Phase 1~4) |
| 새 장비 1종 추가 | **20분** (config 1개 + 테스트) |
| 7가지 장비 전체 | 초기 3~4세션 + 장비당 20분 = **4~5세션** |
| 유지보수 | 정규식 패턴만 수정 (코드 변경 없음) |

---

## 14. 사전 필요 사항

### ✅ 완료된 항목

| 항목 | 상태 | 내용 |
|------|------|------|
| Epson 로그 분석 | ✅ 완료 | SQLite DB (Job+Log 테이블), JobStatus=12=완료, 132건 히스토리 |
| Epson 데이터 경로 | ✅ 확인 | 로컬: `C:\ProgramData\Epson\Epson Edge Print\DB\Data.db` / NAS: Z: |
| 파서 전략 결정 | ✅ 확정 | `epson` 타입 (DB 폴링 방���) |

### ⬜ 미완료 항목

1. **나머지 장비 목록** — Epson 외 5~6가지 장비명, 종류, RIP 소프트웨어
2. **나머지 장비 로그 샘플** — 각 장비의 로그 파일 경로 + 샘플
3. **PC 배치** — 어떤 장비가 어떤 PC에 연결되어 있는지 (Epson: DESKTOP-CB8Q1D6)
4. **Epson PC 현장 검증** — Epson 실행 중 DB 읽�� 가능 여부 (동시 접근 테스트)
5. **OrderMatcher 매핑 규칙** — 현재 JobName에서 주문/카드 매핑 방식 확정

> Phase 1 + Phase 2 (기반 + Epson)는 위 미완료 항목 없이도 착수 가능.
> 나머지 장비는 Phase 3~4에서 로그 샘플 확보 후 대응.

---

## 15. 참조

| 문서 | 용도 |
|------|------|
| `LogWatcher/USAGE.md` | 기존 LogWatcher 사용법 |
| `LogWatcher/PrintLogParser.cs` | TNS 파서 구현 |
| `LogWatcher/PrintExpLogParser.cs` | PrintExp 파서 구현 |
| `HANJIN_INTEGRATION_ROADMAP.md` | 한진택배 자동화 (별도 트랙) |
| `.claude/design-decisions.md` | 설계 결정 인덱스 (A: Print.log 모니터링) |
