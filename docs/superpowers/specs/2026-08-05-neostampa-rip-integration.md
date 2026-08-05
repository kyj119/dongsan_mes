# neoStampa RIP 로그 연동 — 전사 8색 합판 해체 + 출력 실적 확보

- 작성: 2026-08-05
- 대상 장비: 전사 8색 (Longyin Q2000), RIP SW = neoStampa 10.2.4
- 관련: `docs/LOGWATCHER_EQUIPMENT_INVENTORY.md`(전사 행 `?` 미확인 상태 해소), memory `project-logwatcher-rollout`

## 0. 배경

전사(TRANSFER_FLAG) 공정은 LogWatcher 미개척 상태로, 카드 상태 전환이 전부 수동이다.
2026-08-05 neoStampa 로그 위치가 확인되어(`C:\Users\Public\Documents\neoStampa 10\Log`, 사본 `Z:\Designs\Log`)
145건을 전수 분석했다.

### 파이프라인 (확정)

```
디자이너/IA → 개별 EPS ─┐
                        ├→ neoStampa(RIP·합판 배치) → Topaz-RIP(송출·취소) → Q2000
오퍼레이터 합판 배치 ───┘
```

- **합판은 오퍼레이터가 neoStampa에서 배치한다** → MES는 판 구성을 사전에 알 수 없다.
  RIP 로그가 합판 구성의 **유일한 정보원**이다.
- **실제 취소는 Topaz에서 발생**한다. neoStampa 로그에는 취소 상태 필드가 없다.
- neoStampa `StartTime`~`EndTime` = **리핑 시간**이며 출력 시간이 아니다.
  이 로그로 낸 m²/h 는 RIP 스루풋이지 생산성 지표가 아니다.

## 1. 로그 구조 (실측)

| 항목 | 내용 |
|---|---|
| 경로 | `Log\YYYY-MM-DD\<Document>.txt`, 같은 문서 재RIP 시 ` - N` 증가 |
| 형식 | INI. 섹션 = `General`/`UserData`/`Costs`/`PrintSettings`/`ColorManagement`/`[1..N]` |
| 기록 시점 | 잡 종료 시 **1회 생성**(append 없음). 파일 mtime ≈ `EndTime` |
| 인코딩 | UTF-8. 단 `ICC` 값만 neoStampa가 한글을 `?`로 치환해 기록 |
| PC | 2대 확인 — `DESKTOP-5C9D04J`, `PC-202605141926` |

### 주요 키

- `[General]` — `ComputerName` `SoftwareVersion` `JobID` `Document` `FileCount` `StartTime` `EndTime` `Driver`
- `[Costs]` — `PageWidthMM`(세팅 원단폭, **운영상 무의미**) `PrintWidthMM` `PrintHeightMM` `KDots[채널][드롭]`
- `[PrintSettings]` — `PrintMode`(예 `720x2400 8pass`)
- `[ColorManagement]` — `Inkset`(`KCMYOBRk` = 8색) `InkLimit` `InkUsage` `Linearization` `ICC`
- `[N]` (배치 아이템, N = `FileCount`) — `Name` `HPositionMM` `VPositionMM` `WidthMM` `HeightMM`
  `Rotation` `OutputScaleX/Y` `Copies`(스텝앤리피트, 없으면 1) + 멤버별 `KDots`

### 함정

- **`JobID`를 고유키로 쓰면 안 된다.** 날짜 넘어가며 리셋(07-31 `74` → 08-03 `43`), 같은 날 중복(`36` 2회),
  빈 값 12건. 고유키는 `ComputerName + StartTime + Document`(또는 파일 경로).
- **`Document`의 ` + ` 문자열을 파싱해 멤버를 구하지 말 것.** 도안명 자체에 ` + `가 들어갈 수 있다.
  멤버 정본은 **`[N]` 섹션의 `Name`**이다. `Document`는 표시용 결합 문자열일 뿐이다.
- `PageWidthMM`(3300 / 1550)은 세팅값이라 폭 활용률 계산에 쓰면 잘못된 결론이 나온다.

## 2. 이 로그로만 알 수 있는 것

### 2-1. 합판 구성 (최대 가치)

`[N]` 섹션에 좌표·회전·배율이 전부 있어 판 배치를 그대로 복원할 수 있다.

- 서로 다른 `Name` ≥ 2 → **혼합 네스팅**(여러 주문 합판)
- 같은 `Name` 반복 또는 `Copies` > 1 → 스텝앤리피트(단일 주문)

Topaz는 판 1개 = 잡 1개로만 인식하므로, **합판 3건 중 어느 주문에 실적을 찍을지 Topaz 로그만으로는 알 수 없다.**

### 2-2. RIP 중단 판정

상태 필드가 없어도 **길이 대조로 판정 가능**하다.

```
ripComplete  =  PrintHeightMM  >=  max(VPositionMM + HeightMM) * 0.995
미리핑 멤버   =  해당 [N] 섹션의 KDots 합 == 0
```

실측: 145건 중 **52건(36%)이 중단**. 07-20은 9건 중 8건, 07-21은 41건 중 17건으로,
같은 도안 ` - N` 연속 패턴과 겹친다 → 주문 취소가 아니라 **RIP 시행착오/재RIP**.

미리핑 멤버를 `nest_members`에서 제외하지 않으면 **판에 들어가지도 않은 주문에 실적이 찍힌다.**

### 2-3. 잉크 소모

`KDots[K/C/M/Y/O/B/R/k][1~3]` = 8색 × 3드롭사이즈 도트수. 드롭 볼륨(pL)을 곱하면 잡별 실 소모량.
단 **중단 잡 36%는 실제 출력되지 않았으므로** 완료율 보정이 필요하다. (본 spec 범위 밖 — 별도 트랙)

## 3. ★ 이중계상 위험 (설계 필수 제약)

Topaz(P4)와 neoStampa(P1)가 **같은 물리 출력 1건을 각각 1행씩** `print_events`에 적재하면
`productionReports.ts` 집계가 2배가 된다.

**대응**: `print_events.event_kind` 도입.

| kind | 발생원 | 카드 상태 영향 | 리포트 집계 |
|---|---|---|---|
| `RIP` | neoStampa | `PRINT_PENDING`/`RIP_WAITING` → `PRINTING` 까지만. **`PRINT_DONE` 금지** | 제외 |
| `PRINT` | Topaz(TNS) 등 기존 파서 | 기존 동작 유지(`PRINT_DONE`·`quality_issues`) | 포함 |

기존 행은 `DEFAULT 'PRINT'` 로 회귀 없음.

## 4. Phase 구성

사용자 결정: **P4(Topaz)를 먼저** 배치한다. 코드 트랙(P1~P3)과 현장 트랙(P0/P4)은 병렬로 가되,
실적 확정(`PRINT_DONE`)은 Topaz가 붙은 뒤에 켠다.

| Phase | 트랙 | 내용 |
|---|---|---|
| **P0** | 현장 | 장비 등록(`equipment`) + neoStampa PC 2대 LogWatcher 세팅. 인벤토리 `?` 해소 |
| **P4'** | 현장 | **Topaz-RIP LogWatcher 세팅**(TNS 파서는 이미 존재 — 코드 작업 거의 없음). 실적 정본 확보 |
| **P1** | 코드 | `NeoStampaParser` 신규 (폴더 감시형 INI 파서) |
| **P2** | 코드 | `resolveCard` 멤버별 확장 + `event_kind` (합판 N건 동시 귀속) |
| **P3** | 코드 | 웹 출력파일↔카드 연결 UI (`print_file_map` 학습) |

### P1 — NeoStampaParser

기존 4버킷(바이너리/SQLite/HTML/텍스트)과 다른 **폴더 감시형**. tail 파싱이 아니라
파일 생성 감지라 오히려 단순하다.

- 상태 저장: 바이트 오프셋이 아니라 **처리 완료 시각(max `LastWriteTimeUtc`)**. 서버가
  `file_path + print_completed_at` 로 멱등 처리하므로 중복 전송은 무해 → overlap 여유를 둔다.
- **최초 실행은 과거분을 보내지 않는다**(`PrintLogParser` 의 position -1 → EOF 스킵과 동일 방침).
  의도적 소급은 config `backfill_days`.
- 쓰기 중 파일 방어: mtime 이 `settle_seconds`(기본 5) 이내면 다음 폴에서 처리.
- 멤버 = `[N]` 섹션 `Name` 의 distinct. `qty` = 같은 이름 섹션 수 × `Copies`.
  distinct ≥ 2 일 때만 `IsNest = true`.
- 미리핑 멤버(KDots 합 0) 제외. 전량 미리핑이면 이벤트 자체를 버린다.
- `PrintStatus` = RIP 완료 `OK` / 중단 `CANCEL`.

config 키:
```
log_root        (required) 예 "C:\\Users\\Public\\Documents\\neoStampa 10\\Log"
settle_seconds  (default 5)
backfill_days   (default 0 = 과거분 무시)
```

### P2 — resolveCard 멤버별 확장

현재 `resolveCard`(`src/routes/printEvents.ts:106`)는 이름 1개 → 카드 1개다.
`nest_members` 는 이미 존재하지만 **`production.js:389` 표시 전용**이고 매칭에는 안 쓰인다
→ **Flexi 네스팅도 지금 같은 구멍**(합판 N건 중 1건만 매칭)을 갖고 있다. 함께 고친다.

- `nest_members` 가 있으면 멤버별 `resolveCard` → 카드 배열 → 상태 전환 루프
- 멤버 매칭 0건이면 기존 단건 경로로 폴백 (회귀 방지)
- `event_kind='RIP'` 이면 `PRINT_DONE`·`quality_issues` 경로를 타지 않는다

### P3 — 웹 출력파일↔카드 연결

파일명 145건 실측상 **규격과 수량이 거의 항상 들어 있다**:

| 파일명 | 추출 |
|---|---|
| `해양호-빨강(75-60-300장).eps` | 해양호 · 75×60 · 300장 |
| `제75보병사단-탁상기붙임(135-90-1벌).eps` | 135×90 · 1벌 |
| `민방위(120-80).eps` | 120×80 |

→ 파일명 파싱으로 **카드 후보 자동 추천 → 1클릭 확정 → `print_file_map` 등록(학습)**.
같은 파일명 재출력은 이후 완전 자동. 디자이너 명명 습관을 바꾸지 않아도 된다(A안 취지).

## 5. 구현 현황 (2026-08-05, 미배포)

P1~P3 코드 완료 + 로컬 검증. **prod 미배포** — P4(Topaz) 선행 방침.

| 항목 | 파일 |
|---|---|
| neoStampa 파서 | `LogWatcher/Parsers/NeoStampaParser.cs` (신규), `ParserFactory.cs` `"neostampa"` |
| RIP/PRINT 구분 | `LogWatcher/PrintLogParser.cs` `PrintEvent.EventKind`, `MesApiClient.cs` `event_kind` |
| 마이그레이션 | `migrations/0518_print_events_event_kind.sql` |
| 멤버별 매칭 | `src/routes/printEvents.ts` `nestMatchNames` · `applyEventToCard` (단건·batch 양쪽) |
| 실적 집계 격리 | dashboard(5)·equipmentQueue(1)·forecast(3)·oee(2)·productionReports(15)·printEvents stats(3) |
| 연결 API | `printEvents.ts` `/unmatched` · `/link-candidates` · `/link` + `parseDesignFileName` |
| 연결 UI | `src/pages/production.ts` 탭4, `src/scripts/production.js` `loadUnmatchedFiles` 외 |

### 검증 결과

- **P1**: 실로그 145건 파싱 → 이벤트 142건(전량 미리핑 3건 제외), OK 93 / RIP중단 49.
  합성 완전합판으로 NEST 3/3 복원 확인. 부분합판은 실제 리핑된 도안명을 `file_name` 으로 전송.
- **P2**: 합판 3멤버 → **카드 3장 모두 PRINTING 전환**(기존엔 1장). RIP CANCEL 은 `rip_status`·불량 미등록,
  PRINT CANCEL 은 기존대로 ERROR+불량 등록(회귀 없음). 집계 쿼리는 RIP 제외 확인.
- **P3**: 파일명 파싱(거래처·규격·수량) → 후보 점수 랭킹(8/6/5) → 연결 → 목록 즉시 제거 →
  **동일 합판 재출력 시 두 멤버 자동 매칭**까지 브라우저 E2E 확인(콘솔 0).

### 남은 것

- P0/P4 현장 작업(장비 등록, LogWatcher 배포) — 코드 밖
- prod 배포 + 마이그 0518 적용
- 합판 이벤트는 `print_events` 1행에 대표 카드만 기록(멤버 귀속은 `nest_members` JSON).
  카드별 실적 집계가 필요해지면 별도 설계 필요 — Flexi 도 동일 구조.

## 6. 마커 출력 기반 자동 탐지 (`--probe`) — **구현완료 2026-08-05, prod 미배포**

구현: `LogWatcher/Tools/MarkerProbe.cs` · `LogProbe.Run` `--probe` 분기 · `Program.cs` 진입점 ·
서버 필터 `isProbeMarker()`(`printEvents.ts`, 단건·batch 양쪽).

검증(샌드박스로 append형 + 잡별 생성형 동시 재현):
- 잡별 생성형 → `neostampa` 추천 + `log_root` 를 **날짜 폴더 위**로 정확히 산출
- append형 → `text_log` 추천 + `log_path`
- 로그 2개 동시 검출 → "RIP/제어 분리 구조" 경고 출력
- 서버 필터 4케이스: 마커 skip · **접미사 붙은 마커도 skip**(위치 무관) · 정상 잡 적재 · batch 2건 중 1건만 적재
- 한글 출력은 실제 콘솔에서 정상(파이프로 받으면 깨져 보이는 건 하네스 문제)

원안 대비 바뀐 점: 마커 잡을 `print_events` 에 **적재조차 하지 않는다**(플래그 컬럼 추가 대신).
플래그로 남기면 리포트 쿼리 29곳을 또 손봐야 하고, 마커 잡은 보존 가치가 없다.

### 출발점

용준님 제안: **설치 프로그램이 마커 파일을 만들고 장비에서 한 번 출력시킨 뒤,
그 파일명이 들어간 로그를 역추적해 경로·형식을 자동 확정한다.**

### 왜 지금 방식으로는 부족한가

| 도구 | 하는 일 | 한계 |
|---|---|---|
| `--discover` | 최근 수정 시각 + 확장자 + 매직바이트로 후보 나열 | **추정**이다. 무관한 로그가 걸리고, 확장자가 특이하면 놓친다 |
| `--learn` | 출력 1건을 지켜보며 완료패턴 추출 | **로그 경로를 이미 알아야 쓴다** — 모르는 게 문제인데 |
| `--learn` | 〃 | `text_log` **전용**. neoStampa 같은 잡별 파일 생성형은 못 배운다 |

방증: 인벤토리의 `?` 칸이 2026-06-13 작성 이후 지금까지 안 채워졌다. 이번 전사 파서도 수동으로 만들었다.

### 마커가 더 나은 이유

1. **확정 증거다.** mtime 휴리스틱과 달리 "이 로그가 맞다"를 증명한다.
2. **인코딩이 역판별된다.** 마커를 UTF-8 / UTF-16LE / cp949(EUC-KR)로 각각 인코딩해 바이트 검색 →
   히트한 인코딩이 곧 로그 인코딩. TNS 바이너리도 EUC-KR 바이트로 잡힌다(`PrintLogParser` 가 EUC-KR 사용).
   SQLite 도 문자열이 파일 안에 그대로 있어 잡히고, 잡히면 테이블·컬럼 특정으로 넘어갈 수 있다.
3. **append형 vs 잡별생성형을 자동 구분한다.** 출력 전후 스냅샷 diff — 크기가 커지면 append(`tail` 계열),
   새 파일이 생기면 폴더 감시형(`neostampa` 계열). **파서 타입 선택의 핵심 갈림길인데 지금은 사람이 판단한다.**
4. **2축 구조를 자동 발견한다.** 전사처럼 RIP/제어가 분리돼 있으면 **양쪽 다 히트**한다.
   이번에 그걸 몰라서 Topaz 축을 놓치고 있었다.

### 스케치 (구현된 흐름)

```
setup.bat
  1) 마커명 생성          MESPROBE-<PC>-<yyyyMMddHHmmss>
  2) 동봉 EPS/PDF 를 그 이름으로 복사 (작은 크기 — 원단·잉크 소모 최소화)
  3) 스냅샷 A             후보 경로의 파일 목록 + 크기 + mtime
  4) "지금 이 파일을 평소대로 출력하세요"  → 오퍼레이터 Enter
  5) 스냅샷 B → diff      커진 파일 / 새로 생긴 파일만 남긴다
  6) 마커 바이트 검색     4개 인코딩으로 diff 대상만 검사 (전체 스캔 아님 → 수 초)
  7) 히트 → 형식 판별 + append/폴더 구분 → equipment.json 자동 생성
  8) --test 자동 실행     전송 없이 파싱 결과 표시
  9) 확인 후 install-service.bat
```

### 한계 (정직하게)

- **실제 출력 1건이 필요하다** — 원단·잉크가 든다. 최소 크기로 만든다.
- RIP 에서 잡 이름을 다시 지정하는 워크플로면 마커명이 로그에 안 남을 수 있다
  → 그때는 **스냅샷 diff 만으로도 로그 파일은 특정된다**(내용 매칭만 실패). 폴백으로 충분.
- 권한/잠긴 파일은 건너뛴다.
- ⚠️ **마커 잡이 실적을 오염시키면 안 된다** — 서버가 `MESPROBE-` 접두 파일명을 무시하도록
  `printEvents.ts` 에 필터 1줄이 함께 필요하다. 이게 없으면 설치할 때마다 가짜 출력이 쌓인다.

### 규모

실제 규모: `MarkerProbe.cs` 약 380줄 + 서버 필터 1함수. 기존 `--discover`/`--learn` 은 폴백으로 유지.
기존 `--discover`/`--learn` 을 대체하지 않고 **앞단에 얹는다**(마커가 실패하면 기존 경로로 폴백).

## 7. ★ 하류 축 규명 완료 (2026-08-05, 실물 로그)

용준님이 `Z:\Designs\Log` 에 제어 SW 로그를 복사 → 전수 분석. **앞선 전제 2개가 틀렸다.**

### 정정 1 — 하류는 Topaz 가 아니라 **PrintExp_X64**

`main\Log[YYYY_MM_DD].txt`, **GBK 인코딩**(중국어 SW). `C:\PrintExp_X64\` 경로가 로그에 박혀 있다.
`rp.log`·`USB[날짜].log`·`VectorWave\`·`cld\` 는 펌웨어/하드웨어 계측 로그라 잡 정보가 없다.

### 정정 2 — 조인 키는 파일명이 아니다

**PrintExp 는 도안명을 전혀 모른다.** neoStampa 가 넘긴 `~sectionN.prn` 을 타임스탬프 폴더로 받을 뿐이다:

```
作业ID:1587814906, 删除TCP文件:C:\PrintExp_X64\temp\20260804091715\~section0.prn
                                                   └─ = neoStampa 잡의 StartTime
```

**실측 결과 (`node scripts/printexp-join-check.mjs`)**

| | |
|---|---|
| 매칭 | **133 / 133 (100%)**, 허용오차 ±2초 |
| 1:N 중복 | **0** → 정확히 1:1 |
| 리핑만 하고 출력 안 함 | 12건 |
| 실제 출력 결과 | OK 59 · CANCEL 54 · 미확정 20 |

→ 앞서 걱정한 "조인 실패 시 시각 근접 폴백"이 아니라, **시각 자체가 정본 키**다. 더 정확하다.

### 이 축이 주는 것

- **진짜 출력 소요시간.** 14.5m 짜리가 neoStampa 리핑은 13분인데 실제 출력은 **55분**이다.
  앞서 낸 m²/h 가 생산성 지표가 아니라는 게 수치로 확인됐다.
- **실제 취소.** 54/113 = 48%. neoStampa 의 RIP 중단 36% 와는 **별개 축**이다(리핑은 됐는데 출력에서 취소).

### 파싱 포인트

- 잡 블록 = `启动任务：` → `任务精度:...图像大小:...打印模式:` → 결과 → `作业ID:N, 删除TCP文件:...temp\<ts>\`
- 완료 `_PrintWait---打印完成` · 취소 `打印控制线程---被取消`
- ⚠️ **temp 폴더 없는 블록은 캘리브레이션**(`593x17mm 1pass`). 379블록 중 **246건**이 이것 → 제외 필수.
- ⚠️ **기존 `printexp` 파서로는 못 읽는다.** 그 파서는 UTF-16LE + `作业【파일명】打印完成` 을 기대하는데
  이 로그엔 그 패턴이 **0줄**. 같은 제품군의 다른 버전/설정이다. → 신규 파서 필요.

### 결정 — B안(에이전트 로컬 조인) 채택, 구현완료

용준님 확인: **두 SW 가 같은 PC 에 있다.** → LogWatcher 가 로컬에서 합쳐 **완성된 이벤트 1건**만 보낸다.
서버 조인(A안)이 필요 없고, 이 장비에 한해 **이중계상 문제 자체가 사라진다**(RIP 이벤트를 안 보내므로).

구현: `LogWatcher/Parsers/TransferPressParser.cs` (`parser_type: "neostampa_printexp"`)
+ 공용 파싱부 분리 `NeoStampaJobFile.cs` (단독 `neostampa` 파서도 이걸 쓴다 — 멤버 판정·미리핑 제외 규칙이 갈리지 않도록)

| 이벤트 필드 | 출처 |
|---|---|
| `file_name`·`nest_members` | neoStampa (도안명·합판 구성) |
| `print_status`(OK/CANCEL) | **PrintExp** (실제 출력 결과) |
| 시작·종료 시각 | **PrintExp** (진짜 출력 시간) |
| `output_size`·`dpi` | PrintExp (실제 출력분) |
| `event_kind` | `PRINT` — 실적 정본 |

config:
```
rip_log_root              (required)
print_log_dir             (required)  Log[yyyy_MM_dd].txt 가 있는 폴더
join_tolerance_seconds    (default 5)
emit_rip_only_after_hours (default 0=끄기)  리핑만 하고 출력 안 한 잡을 RIP 이벤트로 낼지
```

**실측 검증** (`--test`, 실로그 전량):

| | |
|---|---|
| 이벤트 | **113건** (OK 59 · CANCEL 54) |
| 리핑 잡 미발견 | **0** |
| UNMATCHED | **0** |
| 결과 미확정 건너뜀 | 20 (완료/취소 기록이 없는 블록) |

독립 검사 스크립트(`printexp-join-check.mjs`)와 **수치가 정확히 일치**한다.

방어 장치:
- temp 폴더 없는 블록(캘리브레이션 246건) 자동 제외
- 결과 미확정 블록은 이벤트를 내지 않는다(출력 중일 수 있다)
- 리핑 인덱스는 `[General]` 선별 검사 후 파싱 — 로그 루트에 다른 SW 로그가 섞여도 폴이 느려지지 않는다
- 최초 실행은 오늘 로그의 **EOF** 에서 시작(과거분 미전송)

⚠️ **`neostampa` 단독 파서는 계속 필요하다** — 제어 SW 가 다른 PC 인 장비를 만나면 그쪽을 쓴다.

## 8. 미확정 리스크

1. **Topaz 잡명 ↔ neoStampa `Document` 조인 키 미검증.** Topaz 실물 로그를 보지 못했다.
   합판 구성은 RIP 이벤트에만 있고 실적은 PRINT 이벤트에만 있으므로, 둘을 잇지 못하면
   합판 해체 실적이 완성되지 않는다. **P4에서 실물 로그로 확정할 것.**
   조인 실패 시 보조 수단 = 시간 근접(neoStampa `EndTime` < Topaz 시작, 수 분 이내).
2. 전사 EPS 저장 폴더 경로 미확인 (P3 후보 추천의 파일 목록 소스로 쓸지 여부).
3. 전사 디자이너가 A0 CEP 패널을 쓰는지 미확인 (P3 접점을 웹으로 정했으므로 당장은 무관).
