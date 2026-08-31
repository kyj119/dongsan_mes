# LogWatcher 현장 설치 안내서 (전사 8색 + 일반 장비)

> 대상: 장비 PC 앞에서 직접 작업하는 사람. 코드 지식 불필요.
> 작성 2026-08-05 · 인벤토리 = `docs/LOGWATCHER_EQUIPMENT_INVENTORY.md`

---

## 0. 전사 8색은 한 PC에 프로그램이 2개다 (헷갈리기 쉬운 부분)

**PC 1대 = 호기 1대**이고, 그 안에 리핑 SW 와 출력 제어 SW 가 **같이** 있다.

| PC | 리핑 | 출력 제어 |
|---|---|---|
| `DESKTOP-5C9D04J` (1호기) | neoStampa 10.2.4 | PrintExp_X64 |
| `PC-202605141926` (2호기) | 〃 | 〃 |

| SW | 무엇을 아는가 | 무엇을 모르는가 |
|---|---|---|
| neoStampa | 도안명 · **합판에 어떤 도안들이 들어갔나** · 판 치수 | 실제로 출력됐는지 (취소를 기록하지 않는다) |
| PrintExp_X64 | 실제 출력·취소 · **진짜 소요시간** | **도안이 뭔지조차 모른다** |

→ **watcher 를 2개 만들지 않는다.** 하나(`neostampa_printexp`)가 두 로그를 읽어 합친 뒤
**완성된 이벤트 1건**만 보낸다. 따로 보내면 물리 출력 1건이 2행이 되어 실적이 2배가 된다.

두 로그는 **temp 폴더 타임스탬프**로 이어진다 (실측 133/133, ±2초, 1:1).

---

## 1. 두 로그가 이어지는 방식 (규명 완료)

PrintExp 는 도안명을 **전혀 모른다.** neoStampa 가 넘긴 `~sectionN.prn` 을 이렇게 받을 뿐이다:

```
作业ID:1587814906, 删除TCP文件:C:\PrintExp_X64\temp\20260804091715\~section0.prn
                                                   └─ = neoStampa 잡의 StartTime
```

**폴더 이름의 타임스탬프가 조인 키**다. 2026-08-05 실측으로 **133건 전부 ±2초 이내, 1:N 중복 0**.

```
node scripts/printexp-join-check.mjs          # 언제든 다시 검사 가능
```

### 남은 확인 — PrintExp 가 neoStampa 와 같은 PC 인가

같으면 `equipment.json` 에 watcher 2개만 넣으면 되고, 다르면 PC 2곳에 설치해야 한다.
**`LogWatcher.exe --probe` 를 전사 8색 PC 에서 한 번 돌리면 판정된다** — 마커 출력 시
로그가 2개 걸리면 같은 PC, 1개면 다른 PC다 (§4 참조).

---

## 2. 설치 (장비 PC 1대당 ~20분)

### 준비물

`Z:\Designs\LogWatcher-v2.zip` (최신본). 압축을 `C:\Logwatcher\` 에 푼다.

### 순서

**① 서버에 장비를 먼저 등록한다** — 안 하면 이벤트는 쌓이는데 **장비 온라인 표시만 조용히 안 된다.**

전사 8색 2대는 마이그레이션 `0519` 에 이미 들어 있다(`TRANS-8C-01`, `TRANS-8C-02`).
다른 장비는 `/equipment` 화면에서 추가하거나 관리자에게 요청한다.

**② `appsettings.json` 에 서버 주소·키를 넣는다**

```json
{
  "MesApiUrl": "https://webapp-9i0.pages.dev",
  "ApiKey": "(관리자에게 문의)"
}
```

**③ `equipment.json` 을 만든다** — `equipment.json.example` 을 복사해 쓴다.

전사 8색 예시 — **watcher 1개가 두 로그를 다 본다**:

```json
{
  "poll_interval_seconds": 5,
  "heartbeat_interval_seconds": 60,
  "watchers": [
    {
      "equipment_id": "TRANS-8C-01",
      "name": "전사 8색 1호기 (Longyin Q2000)",
      "enabled": true,
      "parser_type": "neostampa_printexp",
      "config": {
        "rip_log_root": "C:\\Users\\Public\\Documents\\neoStampa 10\\Log",
        "print_log_dir": "C:\\PrintExp_X64\\Log\\main",
        "join_tolerance_seconds": 5
      }
    }
  ]
}
```

> ✅ 두 경로 모두 실물로 확인됨(2026-08-05). `print_log_dir` 은 `Log[2026_08_04].txt` 같은 파일이
> 들어 있는 폴더다 — 다른 PC 에서 다르면 탐색기로 확인하거나 `--probe` 결과를 쓴다.

> `equipment_id` 는 **서버에 등록된 id 와 글자 하나까지 같아야 한다.**
> 경로의 백슬래시는 JSON 이라 `\\` 로 두 번 쓴다.

**④ 전송 없이 파싱만 확인한다**

```
C:\Logwatcher\LogWatcher.exe --test TRANS-8C-01
```

- `[OK] 도안명` / `[CANCEL] 도안명` 이 뜨면 성공이다. (`--test` 는 서버로 아무것도 보내지 않는다)
- 앞의 `[TRANS-8C-01] OK 55분 도안명` 줄에서 **실제 출력 소요시간**을 확인할 수 있다.
- 합판을 출력한 적이 있으면 `[NEST] 선언 3 / 복원 3 → OK` 처럼 멤버가 펼쳐진다.
- `결과 미확정 블록 건너뜀` 은 **정상**이다 — 완료/취소 기록이 없는 잡(로그가 중간에 끊긴 경우).
- `⚠ 리핑 잡을 못 찾음` 이 많이 나오면 `rip_log_root` 가 틀렸거나 `join_tolerance_seconds` 를 늘려야 한다.

**⑤ 서비스로 등록한다** (관리자 권한 명령 프롬프트)

```
C:\Logwatcher\install-service.bat
```

**⑥ 웹에서 확인한다**

- `/equipment` → 해당 장비가 **온라인**
- `/production` → 출력 1건 후 이벤트가 뜨는지

> ⚠️ `/rip` 페이지는 폐기됐다. 접속하면 빈 화면이니 `/equipment` 를 본다.

---

## 3. 자주 막히는 곳

| 증상 | 원인 | 조치 |
|---|---|---|
| 서비스만 실패, 콘솔 실행은 정상 | `install-service.bat` 의 경로 끝 백슬래시 | 이벤트뷰어에서 **nssm EventID 1010** 확인. 최신 zip 에는 수정됨 |
| 이벤트는 오는데 장비가 오프라인 | `equipment` 테이블에 id 미등록 | 서버에 같은 id 로 행 추가 |
| `--test` 에 아무것도 안 뜸 | 로그 경로 오타 / 최근 출력이 없음 | 경로를 탐색기에 붙여넣어 실제 존재 확인 |
| 처음 켰는데 과거 이벤트가 안 올라옴 | **정상** | `neostampa` 는 최초 실행 시 과거분을 보내지 않는다(`backfill_days: 0`) |
| 한글이 깨져 보임 | 콘솔 코드페이지 | 파싱 자체는 정상. `--test` 결과 판단에만 영향 |

---

## 4. 로그 위치를 모를 때 → `--probe` (권장)

**마커 파일을 한 번 출력하면 로그를 확정한다.** 추측이 아니라 증거로 찾는다.

```
LogWatcher.exe --probe
```

1. `MESPROBE-<PC명>-<시각>` 형태의 마커 이름을 만들어 준다.
2. 출력 전 스냅샷을 찍고 대기한다.
3. **아무 작은 파일이나 그 이름으로 저장해 평소대로 출력한다.** (원단·잉크가 실제로 소모되니 작게)
4. Enter → 출력 후 스냅샷을 찍고, **변화한 파일 안에서만** 마커를 찾는다(전체 스캔 아님, 수 초).
5. `equipment.json` 초안을 출력해 준다.

같이 알아내 주는 것:

| | 어떻게 |
|---|---|
| **인코딩** | 마커를 UTF-8 / UTF-16LE / cp949 로 각각 인코딩해 찾는다 → 걸린 쪽이 로그 인코딩 |
| **로그 형태** | 파일이 커졌으면 append 형, 새로 생겼으면 잡별 파일 생성형 → **파서 타입이 갈리는 지점** |
| **축 개수** | 로그가 2개 걸리면 RIP SW 와 제어 SW 가 분리된 장비다 (전사 8색이 이 경우) |

옵션:

```
--template "C:\test.eps"   # 이 파일을 마커 이름으로 바탕화면에 복사해 준다
--path "D:\어딘가"          # 스캔 범위 지정 (기본: 고정 드라이브 + 알려진 RIP 경로)
--marker "직접지정"         # 마커 이름 직접 지정
```

> 마커 잡은 **서버가 무시**하므로 실적·가동률에 잡히지 않는다. 몇 번을 돌려도 안전하다.

### 마커가 안 걸릴 때

잡 이름을 RIP 이 자체적으로 다시 붙이는 제품이면 마커명이 로그에 안 남는다.
그래도 **변화한 파일 목록은 그대로 나오므로** 거기서 로그를 골라 아래 도구로 이어간다.

```
LogWatcher.exe --discover          # 최근 수정된 로그 후보 + 형식 판별 (추정 방식)
LogWatcher.exe --analyze "<경로>"  # 기존 로그로 완료 패턴 후보 뽑기
LogWatcher.exe --learn "<경로>"    # 출력 1건을 실시간으로 지켜보며 패턴 추출 (text_log 전용)
LogWatcher.exe --init              # discover + analyze → equipment.json 초안
```

---

## 5. 이미 설치된 PC 에 코드 수정 반영 (업데이트 롤아웃)

§2 는 **신규 설치**다. 여기는 **이미 도는 PC 에 새 빌드를 넣는** 절차 — `#616`(tns_printexp 파서)·
`#617`(kit 센서스)처럼 웹 배포로는 절대 반영되지 않는 수동 축이다.

### 5-0. 축이 둘이고, 반영 방식이 다르다

`make-kit.ps1` **하나가 둘 다** `Z:\Designs\LogWatcher-kit` 에 올린다. 하지만 현장 도달 방식이 다르다.

| 축 | 무엇 | 어떻게 반영되나 |
|---|---|---|
| **A** | `bin\LogWatcher.exe` (파서·전송) | **PC 마다 [2] 실행해야** 반영. 서비스가 들고 있는 파일이라 자동 갱신 없음 |
| **B** | `kit.ps1` · `START.bat` · `config\<PC명>\` | **Z: 갱신만으로 즉시.** 현장이 Z: 에서 직접 실행하므로 방문 불요 |

⇒ `#617`(센서스 열거기)은 **축 B 라 PC 방문이 필요 없다.** `#616`(파서)은 축 A 라 대상 PC 를 돌아야 한다.

### 5-1. 개발 PC — 게이트 먼저 (실기에서 되돌리는 것보다 싸다)

```
dotnet build LogWatcher\LogWatcher.csproj
dotnet run --project LogWatcher\LogWatcher.csproj -- --selftest-pexp
powershell -NoProfile -ExecutionPolicy Bypass -File LogWatcher\kit\kit.ps1 -Action census-selftest
```

- `--selftest-pexp` = 합성 서식지로 조인/폴백 억제 4항목. equipment.json·실기 로그 불요.
- `census-selftest` = ACL 거부 폴더를 만들어 열거기 4항목. **반드시 `powershell.exe`(5.1)** 로 —
  현장 `START.bat` 이 그 호스트를 쓰고, .NET Framework 와 .NET Core 는 열거 실패 동작이 다르다.

### 5-2. 키트 조립·배포 (개발 PC)

```
cd LogWatcher\kit
.\make-kit.ps1
```

`dotnet publish` → `Z:\Designs\LogWatcher-kit` 조립. 조립기가 인코딩 계약도 강제한다
(kit ps1 = UTF-8 BOM · START.bat = ASCII+CRLF · `equipment*.json` 은 bin 에 절대 미포함).

**`version.txt` = `kit git=<sha> built=<시각>`** — 현장에서 어느 빌드가 깔렸는지 알 수 있는 **유일한 지문**이다.
[2] 실행 후 이 값이 안 바뀌면 그 PC 는 갱신되지 않은 것이다.

### 5-3. 대상 PC — `#616` 은 2대뿐이다

`TnsPrintExpParser` 를 쓰는 PC 는 `kit\config\` 기준 **둘**이다:

| PC | 장비 | parser |
|---|---|---|
| `DESKTOP-8BR0QSJ` | **HSM-03** | `tns_printexp` |
| `DESKTOP-GMKQE13` | **TOPM-01** | `tns_printexp` |

나머지 12대(`flexi`·`flexi_printexp`·`epson`·`tns`·`tns_flora`)는 이번 수정과 무관하다 —
exe 는 공통이라 언젠가 같이 올라가지만, **이 건 때문에 방문할 이유는 없다.**
※ HSM-04 는 08-31 에 PrintExp 를 찾았으나 아직 `kit\config\` 에 설정이 없다. 전환하면 대상이 3대가 된다.

### 5-4. 현장 절차 (PC 1대 ~5분)

1. `Z:\Designs\LogWatcher-kit\START.bat` 더블클릭
2. **[2] LogWatcher 설치/업데이트** → `y`
3. 관리자 권한 창이 뜨면 **[예]**
4. 끝나면 설치 로그 마지막 25줄이 화면에 뜬다 — **FATAL 이 없는지**, 버전이 바뀌었는지 확인

내부적으로: C: 스테이징(승격 세션은 Z: 를 못 본다) → 서비스 중지 → 바이너리 교체 →
**`appsettings.json`·`equipment.json`·재전송 큐 보존** → 시작 → 기동 검증.

### 5-5. 확인

```
C:\Logwatcher\LogWatcher.exe --test HSM-03     # 전송 없이 파싱만. 반드시 먼저
```
그다음 웹에서 `/equipment` 온라인 · `/production` 이벤트.

**`#616` 은 「없어져야 할 것」으로 판정한다.** 같은 물리 인쇄에 대해 파일명 있는 이벤트와
`UNMATCHED-<타임스탬프>` 가 **쌍으로 들어오는 게 사라져야** 한다. 억제가 실제로 돌면 콘솔·로그에
`고아 완료 억제 — 폴백 송출(립 MM-dd HH:mm:ss)과 같은 건으로 판정` 이 남는다.
⚠️ 발동 조건이 **립 시작 후 `rip_fallback_hours`(기본 6h) 초과**라 한가한 날엔 아무 일도 안 일어난다 —
「조용하다」를 「고쳐졌다」로 읽지 말 것. 대기열이 긴 날의 실적을 봐야 판정이 된다.

**`#617` 은 census 결과 파일로 판정한다.** [1] 진단 또는 [2] 에서 PrintExp 미발견 시 자동 수거되는
`수거\<PC명>-<시각>\census-<PC명>.txt` 에, 해당 상황이면
`(접근 거부 폴더 N곳 건너뜀 — 나머지는 그대로 열거했습니다)` ·
`(목록 상한 4000건 도달 — 최근 변경순 4000건만 기록, 실제 N건)` 줄이 찍힌다.
종전엔 이 두 경우가 **아무 표시 없이 「파일 0건」** 으로 보여 기사를 재방문시켰다.

### 5-6. 되돌리기

| 대상 | 방법 |
|---|---|
| 설정(`equipment.json`·`appsettings.json`) | 교체 전 자동 백업 `*.bak-<타임스탬프>`. 자동 전환분은 기동 로그 FATAL 시 **자동 롤백** |
| **바이너리** | **백업이 없다.** 이전 커밋에서 `make-kit.ps1` 재조립 후 [2] 재실행이 유일한 경로 |
| 상태파일 `<장비ID>.pexpend.json` | 손댈 필요 없다. `#616` 이 `FallbackStarts` 를 추가했지만 System.Text.Json 은 미지 필드를 무시하므로 **구 exe 로 되돌려도 안전**(양방향 호환) |

### 5-7. 순서 권고

2대뿐이라 한 번에 가도 되지만, **TOPM-01 먼저 → 며칠 관찰 → HSM-03** 이 안전하다.
바이너리 롤백 경로가 재조립뿐이라, 한 대를 남겨 두면 비교 대상이 생긴다.
