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
| 3 | **미확인** | Topaz-RIP | **실제로 출력됐나·취소됐나** | `tns` |

- **Topaz PC를 먼저 붙인다.** neoStampa 로그만 붙이면 "리핑됨"이 출력 실적처럼 보인다.
- neoStampa 는 취소를 기록하지 않는다. 취소는 Topaz 에서 일어난다.
- Topaz 는 판 1장을 잡 1건으로만 본다. 합판에 주문이 3건 들어 있어도 이름은 하나다.

---

## 1. Topaz PC 찾기 + 로그 수집 (지금 필요한 것)

전사 8색에 붙은 Topaz PC가 어느 것인지 아직 확정되지 않았다.

**① 후보 PC에서 로그 위치 확인** — TopazRip 설치 폴더 안에 `Print.log` 가 있다.

```powershell
# 드라이브 전체에서 TNSRip 폴더 찾기
Get-ChildItem C:\, D:\, E:\ -Directory -Filter "TNSRip*" -Recurse -ErrorAction SilentlyContinue |
  Select-Object FullName
```

**② 로그를 Z: 로 복사** (분석용, 원본은 건드리지 않는다)

```powershell
$dst = "Z:\Designs\Log-Topaz"
New-Item -ItemType Directory -Path $dst -Force | Out-Null
Copy-Item "E:\TNSRip-X1\Print.log" "$dst\Print-$env:COMPUTERNAME.log"
```

**③ 확인해야 할 것 (★핵심)**

Topaz 가 기록하는 **잡 이름이 neoStampa 의 `Document` 와 같은 문자열인지**. 이게 두 로그를 잇는
유일한 키다. 예를 들어 neoStampa 에 이렇게 남았다면:

```
Document = 하우사인 원청교섭2(51-122-2장).eps + 6.SLC(30-20-2벌).eps + 5.솔로몬(30-20-1벌).eps
```

Topaz 쪽에도 같은 문자열(또는 최소한 앞부분)이 남아야 한다.
**다르면 시각 근접(neoStampa 종료 직후 Topaz 시작)으로 잇는 폴백이 필요하다.**

> `Print.log` 는 바이너리라 메모장으로 열면 깨진다. 그대로 복사만 하면 된다 — 분석은 이쪽에서 한다.

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

## 4. 로그 위치를 아예 모를 때

```
LogWatcher.exe --discover          # 최근 수정된 로그 후보 + 형식 자동 판별
LogWatcher.exe --analyze "<경로>"  # 기존 로그로 완료 패턴 후보 뽑기
LogWatcher.exe --learn "<경로>"    # 출력 1건을 실시간으로 지켜보며 패턴 추출
LogWatcher.exe --init              # discover + analyze → equipment.json 초안
```

`--discover` 는 **최근 수정 시각**으로 후보를 좁히는 방식이라, 무관한 로그가 같이 걸릴 수 있다.
확정적으로 찾는 방법(마커 파일을 출력해 그 이름이 들어간 로그를 역추적)은 검토 중이다 —
`docs/superpowers/specs/2026-08-05-neostampa-rip-integration.md` 참조.
