# LogWatcher 현장 설치 안내서 (전사 8색 + 일반 장비)

> 대상: 장비 PC 앞에서 직접 작업하는 사람. 코드 지식 불필요.
> 작성 2026-08-05 · 인벤토리 = `docs/LOGWATCHER_EQUIPMENT_INVENTORY.md`

---

## 0. 전사 8색은 PC가 3대다 (헷갈리기 쉬운 부분)

전사는 **리핑 PC와 출력 제어 PC가 다르다.** 둘 다 붙여야 완결된다.

| # | PC | SW | 무엇을 아는가 | 파서 |
|---|---|---|---|---|
| 1 | `DESKTOP-5C9D04J` | neoStampa | **합판에 어떤 도안들이 들어갔나** | `neostampa` |
| 2 | `PC-202605141926` | neoStampa | 〃 (2호기) | `neostampa` |
| 3 | **미확인** | PrintExp_X64 | **실제로 출력됐나·취소됐나** | 신규 필요 |

- **출력 제어 PC(PrintExp)를 먼저 붙인다.** neoStampa 로그만 붙이면 "리핑됨"이 출력 실적처럼 보인다.
- neoStampa 는 취소를 기록하지 않는다. 취소는 PrintExp 에서 일어난다.
- PrintExp 는 **도안명을 아예 모른다**. temp 폴더 타임스탬프로만 neoStampa 와 이어진다(실측 133/133 일치).

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

전사 8색(neoStampa) 예시:

```json
{
  "poll_interval_seconds": 5,
  "heartbeat_interval_seconds": 60,
  "watchers": [
    {
      "equipment_id": "TRANS-8C-01",
      "name": "전사 8색 1호기 (Longyin Q2000)",
      "enabled": true,
      "parser_type": "neostampa",
      "config": {
        "log_root": "C:\\Users\\Public\\Documents\\neoStampa 10\\Log",
        "settle_seconds": 5,
        "backfill_days": 0
      }
    }
  ]
}
```

> `equipment_id` 는 **서버에 등록된 id 와 글자 하나까지 같아야 한다.**
> 경로의 백슬래시는 JSON 이라 `\\` 로 두 번 쓴다.

**④ 전송 없이 파싱만 확인한다**

```
C:\Logwatcher\LogWatcher.exe --test TRANS-8C-01
```

- 최근 출력한 파일 이름들이 목록에 뜨면 성공이다. (`--test` 는 서버로 아무것도 보내지 않는다)
- 합판을 출력한 적이 있으면 `[NEST] 선언 3 / 복원 3 → OK` 처럼 멤버가 펼쳐진다.
- `RIP 중단 감지` 줄은 **정상이다** — 리핑을 중간에 멈춘 잡이며, 불량으로 올라가지 않는다.

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
