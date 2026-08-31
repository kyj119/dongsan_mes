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

#### `tns_printexp` — TopazRip + PrintExp 2축 조인 ★

| 파라미터 | 필수 | 설명 | 예시 |
|---------|------|------|------|
| `log_path` | ✅ | TNS `Print.log` (신원 축 — `tns` 와 같은 키라 설정 이관 호환) | `C:\TNSRip-X1\Print.log` |
| `print_log_dir` | ✅ | PrintExp 일자 로그 폴더 | `C:\Program Files (x86)\PrintExp_X64_...\Log` |
| `join_tolerance_seconds` | | 启动任务 가 립 시작보다 앞서도 허용 (기본 30) | `30` |
| `result_wait_seconds` | | 미조인 결과를 숙성 후 신원미상 송출 (기본 180) | `180` |
| `rip_fallback_hours` | | 결과가 안 붙은 립을 립 기준으로 송출 (기본 6, 0=끄기) | `6` |

> **HSM-04 취소 3라운드 실측 (2026-08-31)** — TNS 단독으로는 못 잡는다는 것이 재확인됐다:
> | 라운드 | `Print.log`(립) | PrintExp(인쇄) | 단축 판정 | 실제 |
> |---|---|---|---|---|
> | R1 정상 | OK 13:55:09→11 (2초) | START 13:55:10 → **완료 13:55:33** (23초) | OK | OK |
> | R2 립 중 취소 | **CANCEL** 13:56:54→57 | START 2회, 완결 없음 | CANCEL | CANCEL |
> | R3 전송 후 취소 | **OK** 13:58:11→16 (5초) | START 13:58:13 → **被取消 13:58:28** | **OK(오판)** | **CANCEL** |
>
> R1 만 봐도 소요가 2초 vs 23초다 — 단축 실적은 취소뿐 아니라 **가동시간도 틀린다**.

> ★ **설치 폴더 이름에 접두사가 붙을 수 있다** — HSM-04 는 `RIC_PrintExp_X64_V5.7.6.5.90.BS` 다.
> 키트 [2] 의 자동 탐지 글롭이 `PrintExp*` 였을 때는 이걸 **통째로 놓쳐** 자동 전환이 조용히 안 됐다
> (지금은 `*PrintExp*`). 같은 PC 에 죽은 `C:\Program Files (x86)\PrintExp`(2024-02-01 마지막)가 남아 있어도
> 30일 규칙과 마커(`启动任务`) 검증이 걸러 준다.

> 조인은 **FIFO + 시간창**이다. `flexi_printexp` 와 달리 스탬프가 없다 —
> PrintExp 가 잡을 **`~section0.prn`** 이라는 고정 임시명으로만 기록하기 때문이다.
> `Data\recordTask.tf`(레코드 836B)에도 같은 임시명뿐이라 신원은 TNS 쪽에서만 온다.

> **⚠ 신원 없는 취소가 남는다 — 버그가 아니라 물리적 한계** (HSM-06 6일치 실측: 고아 8건).
> PrintExp **자체 큐에서 재출력**하면 TNSRip 은 아무 기록도 남기지 않는다
> (08-22 13:20~13:49 에 START→CANCEL 5회, 그 30분간 `Print.log`·`Job.log` 모두 무기록).
> 이런 건은 `UNMATCHED-<시각>` 으로 나가고 카드·주문에 붙지 않는다 — **붙이면 오귀속이라 그게 맞다.**
> ↳ 립이 중간에 끊긴 경우(8건 중 3건)는 `Job.log` 에 0초 등록 레코드로 이름이 남아 있어 복구 여지가 있다.
>   `Job.log` 는 `Print.log` 의 상위집합(HSM-06 17,322 vs 9,707)이고 레코드 구조가 같다.
>   단 **필드 수가 32개**라 역방향 탐색 상한 22를 넘어(경로가 28번째) 그대로는 안 읽힌다.

> **✘ `C:\TNSRip-X1\PrintLog\<잡명>.log` 는 두 번째 축이 아니다** (HSM-04 실측, 2026-08-27).
> `[PRINTJOB]` INI 로 `StartTime`·`EndTime` 이 보여 인쇄 축처럼 생겼지만,
> `Print.log` 와 대조한 31건이 **초 단위까지 전부 동일**했다. 같은 립 축의 다른 표현일 뿐이다.
> 추가로 있는 건 0초짜리 잡 등록 레코드 5건뿐. **이걸로는 전송 후 취소를 못 잡는다.**

#### `printexp` — PrintExp 텍스트 로그

| 파라미터 | 필수 | 설명 |
|---------|------|------|
| `log_path` | ✅ | 로그 폴더 경로 (Log[날짜].txt가 있는 폴더) |

#### `flexi` — SAi FlexiPRINT HTML 로그

| 파라미터 | 필수 | 설명 | 예시 |
|---------|------|------|------|
| `log_path` | ✅ | RIPLOG.HTML 파일 경로 | `C:\Program Files\SAi\...\Jobs and Settings\RIPLOG.HTML` |

> FlexiPRINT의 RIPLOG.HTML은 append-only HTML 파일. "인쇄 시작"~"출력 끝" 블록에서 파일명, 치수(mm/inch 자동변환), 시작/종료 시간, 상태(OK/CANCEL/ERROR), 인쇄 매수를 추출합니다.

> **★ 인코딩은 PC 별로 갈린다 (2026-08-26 실측)** — 같은 FlexiPRINT 19 라도 RIPLOG.HTML 이
> UTF-8 인 PC 와 cp949(ANSI) 인 PC 가 섞여 있다(수거 7대 중 5:2). 파서가 첫 비ASCII 청크에서
> 자동 판별하므로 설정할 것은 없다. 다만 **구버전(UTF-8 고정)에서는 cp949 PC 가 조용히 죽어 있었다** —
> 필드 라벨이 전부 깨져 이벤트 0건, 게다가 위치 전진을 UTF-8 바이트로 세는 바람에 한글 1자(2바이트)가
> 6바이트로 계산돼 위치가 파일 끝을 넘고 → `truncated, resetting to 0` → 68MB 재독 → 무한 루프
> (HYB-3200-01 service.log 77,608줄이 전부 그 한 줄, 실적 0건).
> ↳ 위치 파일은 `위치|길이` 로 저장한다. **파일이 실제로 줄었을 때만** 0 부터 다시 읽고,
>   길이를 모르거나 줄지 않았으면 파일 끝으로 정렬한다(업그레이드 첫 폴에 과거가 통째로 재송출되지 않게).

> **⚠ 취소는 절반만 잡힌다** — RIPLOG 의 '인쇄' 블록은 RIP→프린터 **전송** 구간이다.
> 립·전송 중 취소는 `정보: Aborted` 로 남지만(인쇄 블록 자체가 안 생김), **전송 완료 후 프린터
> 조작부에서 누른 취소는 무흔적**이라 정상 OK 로 쌓인다(‘유령 OK’). 같은 PC 에 PrintExp 가 있으면
> `flexi_printexp` 로 올려야 이 구간이 잡힌다.

#### `flexi_printexp` — FlexiPRINT + PrintExp 2축 조인 ★

| 파라미터 | 필수 | 설명 | 예시 |
|---------|------|------|------|
| `log_path` | ✅ | RIPLOG.HTML (신원 축 — `flexi` 와 같은 키라 설정 이관 호환) | `...\Jobs and Settings\RIPLOG.HTML` |
| `print_log_dir` | ✅ | PrintExp 본 로그 폴더 (`Log[yyyy_MM_dd].txt` 가 있는 곳) | `C:\Program Files (x86)\PrintExp\Log\main` |
| `join_tolerance_seconds` | | 시각 조인 허용오차 (기본 5) | `5` |
| `rip_fallback_hours` | | PrintExp 가 이 시간 동안 안 물면 RIPLOG 이벤트를 그대로 송출 (기본 6, 0=끄기) | `6` |

> RIPLOG = **신원**(파일명·주문번호·규격·네스트 멤버), PrintExp = **결과**(실인쇄 시작/종료·취소).
> 완성 이벤트 1건만 나간다.
>
> **조인 키는 PrintExp 가 `启动任务：` 뒤에 무엇을 찍는가에 따라 두 가지**(둘 다 자동 처리):
> | 값의 모양 | 조인 방식 | 확인된 장비 |
> |---|---|---|
> | `20260812120424151` (14자리 스탬프) | RIPLOG 인쇄 블록의 '출력 시작 날짜 및 시간' 과 시각 조인 | KM전사1·2, FLEXI-01/03 |
> | `<파일명>.prt` | 확장자 뗀 **basename** 으로 이름 조인 | HYB-3200-01 |
>
> 이름 조인은 립핑 신원을 큐에서 **빼지 않고 표시만** 한다 — 취소 후 재출력하면 립핑은 1건인데
> 인쇄 시작은 여러 번이라(08-24 실측 3회) 빼버리면 2·3회차가 미아가 된다.
>
> **⚠ PrintExp 로그는 코드페이지가 섞여 있다** — 프로그램 문구는 GBK(cp936), 파일명은 OS ANSI(cp949).
> 한 인코딩으로는 둘 다 못 읽으므로 마커는 cp936 으로 읽고 파일명만 되돌린다(실측 8/8 복원).
> UTF-16LE 로그(KM전사 계열)는 이미 정상이라 건드리지 않는다.
>
> **완료/취소 판정** — 완료 `_PrintWait---打印完成`, 취소 `打印控制线程---被取消` · `_PrintWait---PRINT_RESULT_CANCEL`.
> ★ `CancelDataSend`·`Cancel()开始` 는 **정상 완료에도 나오는 정리 호출**이라 취소로 세면 전건 오탐이다.

#### `tns_flora` — TopazRip + Flora 2축 조인 (평판·UV-3200) ★

| 파라미터 | 필수 | 설명 | 예시 |
|---------|------|------|------|
| `log_path` | ✅ | TNSRip `Print.log` (신원 축 — 기존 `tns` 와 같은 키라 설정 이관 호환) | `C:\TNSRip-X\Print.log` |
| `print_rec_path` | ✅ | Flora 실인쇄 기록 | `D:\220304\Flora_...\REC\print_rec.dat` |
| `record_size` | | **비우면 자동판별**(매직 간격). 기종마다 다르다 — 평판 2376 / UV-3200 2248 | (비움) |
| `rip_fallback_hours` | | Flora 축이 이 시간 동안 안 물면 Print.log 이벤트를 그대로 송출 (기본 6, 0=끄기) | `6` |

> **왜 2축인가 (2026-08-26 출력실2 취소 3라운드 실측)** — `Print.log` 는 RIP→프린터 **전송** 단위다.
> 전송 중 취소는 `Cancel!` 로 잡히지만 **전송이 끝난 뒤 프린터에서 누른 취소는 무흔적**이라 OK 로 쌓인다.
> R1 정상=OK · R2 전송중 취소=CANCEL · **R3 전송후 취소=OK(오판)**.
> print_rec 전량 20,137건 중 중단 **2,501=12.4%**(최근 20영업일 약 20%)인데 `Print.log` 가 본 취소는 **0.3%**뿐이었다.
>
> **레코드 구조** — 고정 크기 append. **크기는 기종마다 다르다**(평판 XTRA2512UV 2376B / UV-3200 XTRA3300S 2248B).
> 머리 2개는 절대 위치, **꼬리 3개는 레코드 끝 기준 고정 거리**라 크기가 달라도 따라 움직인다:
> | 위치 | 내용 | 2376B | 2248B |
> |---|---|---|---|
> | `0x0000` | 매직 `5C A3 F0 F0` — 형식이 다르면 여기서 걸러진다 | `0x0000` | `0x0000` |
> | `0x0008` | uint16 레코드 ID (단조 증가) | `0x0008` | `0x0008` |
> | `0x0024` | `.prt` 전체 경로 (OS ANSI = 한국어 Windows 면 cp949, NUL 종료) | `0x0024` | `0x0024` |
> | **끝−0x38 / 끝−0x28** | SYSTEMTIME 시작 / 종료 | `0x0910`/`0x0920` | `0x0890`/`0x08A0` |
> | **끝−0x15** | **중단 플래그 0=완주 / 1=취소** — 판정 정본 | `0x0933` | `0x08B3` |
> | 끝−0x10 | pass 수(진행량). 판정에 쓰지 않는다 — 방향성 확인용 | `0x0938` | `0x08B8` |
>
> 실측 파싱 성공률: 평판 20,137/20,137 · UV-3200 15,065/15,065 (매직 불일치 0).
> 완주/취소 소요 중앙값 = 평판 403초/79초 · UV-3200 749초/60초 — 두 기종 모두 취소가 압도적으로 짧다.
>
> **크기 자동판별**: `record_size` 를 비우면 머리 256KB 의 매직 간격에서 알아낸다.
> 최빈 간격이 ① 파일 길이를 나누어떨어지고 ② 그 간격으로 앞쪽 레코드가 전부 매직으로 시작할 때만 채택한다.
> 판별에 실패하면 **Flora 축만 건너뛰고 립 폴백은 살려 둔다** — 실적이 조용히 0 이 되지 않게.
>
> **조인 = 파일명.** print_rec 는 RIP 산출물(`<잡명>NNNN_M.prt`), Print.log 는 원본(.eps/.jpg) 이라
> 꼬리 `NNNN_M.prt` 만 떼면 basename 이 같다. 실데이터 재생 조인율 = 평판 **200건 98.5% · 1,000건 94.2%** · UV-3200 **300건 83.3% · 1,000건 94.6%**.
> ★ 시각 조인은 쓰지 않는다 — 취소 후 재출력이 잦아(1,123종) 시간창으로는 몇 회차인지 못 가린다.
> 이름 조인은 신원을 큐에서 **빼지 않고 표시만** 해서 재출력이 같은 신원을 다시 물게 한다.
>
> ⚠ **활성 설치본을 갱신 시각으로 고른다** — 출력실2 의 실사용 Flora 는 `D:\220304\Flora_XTRA2512UV_KM1024I_N`
> 인데 이름이 비슷한 구 설치본이 함께 있다. 폴더 이름이 맞다고 그게 도는 설치본이 아니다.
> (출력실1 은 구 설치본이 없고 경로에 **공백**이 있다 — `D:\Flora XTRA3300S_KM1024I_N\REC\print_rec.dat`.)

#### `epson` — Epson Edge Print SQLite DB 폴링

| 파라미터 | 필수 | 설명 | 예시 |
|---------|------|------|------|
| `db_path` | ✅ | SQLite DB 파일 경로 | `C:\ProgramData\Epson\...\Data.db` |
| `query` | ✅ | 새 완료 건 조회 SQL. `@last_id` 파라미터 사용 | 위 예시 참조 |
| `id_column` | ✅ | ID 컬럼명 (위치 추적용, 단조 증가) | `JobID` |
| `filename_column` | ✅ | 파일명 컬럼명 | `JobName` |
| `timestamp_column` | | 완료 시간 컬럼명 | `FinishPrintTime` |
| `size_columns` | | 크기 컬럼 [width, height] | `["OriginalSizeWidth", "OriginalSizeHeight"]` |
| `size_unit` | | 크기 단위 (`pt`/`mm`/`inch`) | `pt` |
| `status_column` | | 상태 컬럼명. 설정 시 값→OK/CANCEL/ERROR 매핑 | `JobStatus` |
| `status_ok` | | OK로 볼 상태값(문자열 배열). 목록 밖 값은 경고 로그 후 OK | `["12"]` |
| `status_cancel` | | CANCEL로 매핑할 상태값(문자열 배열) | `["2"]` |
| `status_error` | | ERROR로 매핑할 상태값(문자열 배열) | `[]` |
| `read_only` | | 읽기 전용 모드 | `true` |

> **취소 기록 (★2026-08-11 실측 확정)**: EPSON Edge JobStatus = **완료 12 · 취소 2** (13/14 추정은 폐기 —
> 취소 테스트 잡 실측: StartPrintTime 있고 FinishPrintTime NULL·상태 2. 출력 전 취소도 2).
> ⚠️ 상태 2는 **출력 진행 중과 구분이 안 될 수 있다** → 쿼리에서 "뒤에 완료(12) 잡이 생긴 2"만 수집하는
> **정착 규칙**을 쓴다(직렬 큐라 진행 중 잡 위에는 완료가 없다). 정착 전 잡은 last_id 아래로 남았다가
> 다음 완료와 **같은 배치**에 들어오므로 유실이 없다. 취소 건의 `FinishPrintTime` 은 `0001-01-01` 센티널이라
> 시작/접수시각으로 대체한다. 완성 쿼리 = `equipment.json.example`의 EPSON 블록이 정본.
> `status_column` 미설정이면 모든 건 OK(기존 동작).

#### `text_log` — 범용 텍스트 로그 (정규식 기반) ★

일반 텍스트 로그를 쓰는 대부분의 RIP을 **코드 변경 없이** config로 흡수. 완료패턴은 아래 `--learn`/`--analyze`로 자동 도출 가능.

| 파라미터 | 필수 | 설명 | 예시 |
|---------|------|------|------|
| `log_path` | ✅ | 로그 파일 경로 (일별 로테이션 시 폴더 경로) | `D:\UV\print.log` |
| `completion_pattern` | ✅ | 완료 이벤트 정규식 (캡처그룹=파일명) | `완료\\s*:\\s*(\\S+)` |
| `filename_group` | | 파일명 캡처 그룹 번호 (기본 1) | `1` |
| `encoding` | | `auto`(기본)/`utf-8`/`utf-16le`/`cp949`/`euc-kr` | `auto` |
| `error_pattern` | | 에러 정규식 → PrintStatus ERROR | |
| `cancel_pattern` | | 취소 정규식 → PrintStatus CANCEL | |
| `timestamp_pattern` / `timestamp_format` | | 완료시각 추출 (.NET 포맷) | `(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2})` / `yyyy-MM-dd HH:mm:ss` |
| `size_pattern` | | 폭·높이 2그룹 정규식 | `(\\d+)\\s*x\\s*(\\d+)` |
| `size_unit` | | `mm`(기본)/`in`/`pt` | `mm` |
| `daily_suffix_format` | | 일별 파일 로테이션 (없으면 단일 파일) | `print_{yyyy_MM_dd}.txt` |

> `encoding: auto`는 BOM→utf-8→cp949 순으로 자동감지. 개행 없이 끝나는 마지막 완료 줄도 누락하지 않음(stable-EOF: 파일이 더 안 자라면 마지막 줄을 완성으로 처리).

### LogProbe — 로그 자동 탐지·분석 도구 (equipment.json 없이 실행)

config를 작성하기 **전** 단계에서 쓰는 도구. RIP 구조를 몰라도 로그를 찾고 완료패턴을 자동 도출. 결과는 콘솔 + 로컬 JSON으로만 출력하며 **자동 반영하지 않음**(사람이 검토 후 `equipment.json`에 붙임).

```bash
# 0) ★권장 — 마커 파일을 1건 출력해 로그를 "증명"으로 확정 (추정 아님)
LogWatcher.exe --probe [--template "C:\test.eps"] [--path "D:\어딘가"] [--marker 이름] [--include-network]
#    출력 전/후 스냅샷 diff → 변화한 파일에서만 마커 검색(수 초) → equipment.json 초안
#    같이 판별: 인코딩(utf-8/utf-16le/cp949) · append형 vs 잡별 파일 생성형 · 로그가 2개면 RIP/제어 분리 구조
#    ⚠️ 실제 출력 1건이 필요(원단·잉크). 마커 잡은 서버가 무시하므로 실적에 안 잡힘

# 0-A) 취소까지 실측 — "취소가 어느 파일에 남는가" 를 같은 방문에서 확정
LogWatcher.exe --probe --cancel-test [--settle 30] [--out "<수거폴더>"]
#    라운드 3개: R1 정상 출력 → R2 립·전송 중 취소(PC 화면) → R3 전송 완료 후 취소(프린터 조작부)
#    라운드마다 시각을 찍고 직전 스냅샷과 비교 → 교차분석
#      · R1 에도 변한 파일   = 정상·취소 공용 로그 (그 시각 구간에서 취소 마커를 찾는다)
#      · R2/R3 에만 변한 파일 = 취소 전용 기록 매체
#      · R2·R3 둘 다 0       = 이 SW 는 취소를 파일로 안 남긴다(2축 파서로도 못 잡는다는 결론)
#    ★취소 2종은 **서로 다른 파일에 남는다**. 전송 후 취소가 유령 OK 의 원인이라 둘 다 재현해야 한다.
#    --out 지정 시 라운드별 전체 변화 목록을 probe-rounds-<PC명>.txt 로 남긴다.

# 1) 이 PC의 로그 파일을 찾아 형식 자동판별 + 추천 파서 제시 (--probe 가 실패할 때)
LogWatcher.exe --discover [경로...] [--days 60] [--depth 4] [--all]
#    → discover-<PC명>.json 저장. 카드패턴(YYYYMMDD-NNN) 있는 로그를 상단 정렬

# 2) 출력 1건으로 완료패턴 자동추출 → equipment.json 블록 생성 (text_log 전용)
LogWatcher.exe --learn "<로그경로>" [--id UV-01] [--name "UV 평판"] [--timeout 300]
#    → 실행 후 그 장비에서 출력 1건을 내면, 새 로그 줄을 분석해 패턴/블록을 출력

# 3) 기존 로그를 정적분석해 완료패턴 후보 N개 제시 (출력을 못 시킬 때)
LogWatcher.exe --analyze "<로그경로>" [--top 5]
```

**권장 흐름**: `--probe`(출력 1건으로 로그 확정) → 초안 검토 후 `equipment.json`에 추가 → `--test <id>`로 파싱 검증 → 가동.
마커가 안 걸리면(RIP이 잡 이름을 자체 부여) `--discover`로 후보 파악 → `--learn`/`--analyze`로 패턴 도출.

> `--discover`는 **최근 수정 시각** 기반 추정이라 무관한 로그가 걸릴 수 있고, `--learn`은 **로그 경로를 이미 알아야** 쓴다.
> `--probe`는 마커 문자열이 로그 안에 있다는 **증거**로 확정하며, `--learn`이 못 다루는 잡별 파일 생성형도 판별한다.

> **스캔 범위**: 기본은 고정 드라이브(C:/D:…) 전체 + RIP 상용 경로를 depth 6 까지.
> **네트워크·이동식 드라이브는 기본 제외** — 라운드마다 스냅샷을 다시 뜨므로 NAS 를 끼면 비용이 4배로 붙는다.
> 로그를 매핑 드라이브(Z:)나 USB 에 쓰는 장비면 `--include-network` 를 붙인다(해당 루트만 깊이 4 로 제한).
> 위치를 이미 안다면 `--path` 가 훨씬 빠르다. 변화 0개로 끝났고 네트워크 드라이브가 실제로 붙어 있을 때만 도구가 이 옵션을 권한다.

> **스냅샷은 확장자 화이트리스트가 아니라 노이즈 블랙리스트**(.exe/.dll/.jpg…만 제외)로 동작한다.
> 화이트리스트(.log/.txt/…)를 쓰면 Flora `REC\print_rec.dat` 처럼 확장자가 로그답지 않은 기록 매체가
> **원천적으로 안 보인다** — UV 2대가 2026-08-19 탐지에서 빠진 직접 원인이다.

> 형식별 분기: `sqlite`→`epson`(+SELECT 쿼리), `html`→`flexi`, `binary`→`tns`, 일반 텍스트→`text_log`(패턴 학습).

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
