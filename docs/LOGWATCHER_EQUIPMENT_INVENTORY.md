# LogWatcher 장비 인벤토리 매핑표

> 목적: 전사 LogWatcher 세팅의 0단계. 각 **물리 장비 ↔ RIP/제어 SW ↔ 로그 경로 ↔ 파서타입**을 확정해야
> `equipment.json`을 작성할 수 있다. `?`/`⬜` 칸이 현장에서 채워야 할 부분.
> 작성: 2026-06-13 · 참조: `docs/UNIVERSAL_LOGWATCHER_DESIGN.md`, `LogWatcher/USAGE.md`

---

## A. 공정 ↔ RIP ↔ 파서 매핑 (지식 기반 프리필)

card_group 분류는 `src/routes/orders/helpers.ts:18-21` 기준.

| 공정 | 품목코드 | card_group | 법인 | RIP/제어 SW | 로그 형식 | 파서타입 | 파서 구현 |
|------|---------|-----------|------|------------|----------|---------|----------|
| 수성 | PM-1xxx | OUTPUT | 동산 | **?** | ? | **?** | ⬜ 확인 |
| 솔벤 | PM-2xxx | OUTPUT | 동산 | TopazRip (TNSRip-X1/X11) | 바이너리 | `tns` | ✅ |
| UV | PM-3xxx | OUTPUT | 동산 | PrintExp (추정) | UTF-16LE 텍스트 | `printexp` | ✅ |
| 평판 | PM-4xxx | OUTPUT | 동산 | **?** | ? | **?** | ⬜ 확인 |
| 에코솔벤트 | (솔벤 계열) | OUTPUT | 동산 | Epson Edge Print | SQLite DB | `epson` | ✅ |
| 전사 | PM-5xxx | TRANSFER_FLAG | 동산 | **neoStampa 10.2.4 → PrintExp_X64** (2축) | INI 잡파일 / GBK 텍스트 | `neostampa` + **신규 필요** | 🟡 절반 |
| 태극기 | PM-6xxx | TRANSFER_FLAG | 동산 | 전사와 동일 장비 사용 | 〃 | 〃 | 🟡 |
| 간판 | PM-7xxx | SIGN | 선명 | **?** | ? | **?** | ⬜ 확인 |
| (FlexiPRINT 쓰는 장비?) | — | — | — | SAi FlexiPRINT | RIPLOG.HTML | `flexi` | ✅ |

**구현된 파서 6종**: `tns` · `printexp` · `epson` · `flexi` · `text_log` · `neostampa` (`LogWatcher/Core/ParserFactory.cs`)
**미구현**: `csv_log` · `jdf_folder` — 위 `?` 장비가 CSV 로그면 코드 구현 선행 필요(일반 텍스트는 `text_log` 로 흡수).

### ⚠️ 전사는 RIP SW 와 제어 SW 가 분리된 2축 구조

```
디자이너/IA → 개별 EPS ─┐
                        ├→ neoStampa (리핑·합판 배치) → PrintExp_X64 (출력·취소) → Q2000
오퍼레이터 합판 배치 ───┘
```

> ⚠️ **2026-08-05 정정: 하류는 Topaz 가 아니라 PrintExp_X64 다.** 실물 로그로 확인.

| 축 | 로그 | 인코딩 | event_kind | 담는 것 |
|---|---|---|---|---|
| neoStampa | `Log\YYYY-MM-DD\<잡>.txt` | UTF-8 | `RIP` | **합판 멤버 구성**·판 치수·잉크 도트·RIP 중단 |
| PrintExp_X64 | `main\Log[YYYY_MM_DD].txt` | **GBK** | `PRINT` | 실제 출력·취소·**진짜 소요시간** (실적 정본) |

- 둘 다 붙여야 완결된다. neoStampa 만으로는 실제 출력 여부를 알 수 없고(취소는 PrintExp 에서 발생),
  PrintExp 만으로는 **도안이 뭔지조차 모른다** — 아래 참조.

### ★ 조인 키는 파일명이 아니라 temp 폴더 타임스탬프

PrintExp 는 도안명을 **전혀 모른다.** neoStampa 가 넘긴 `~sectionN.prn` 을 이렇게 받을 뿐이다:

```
작업ID:1587814906, 删除TCP文件:C:\PrintExp_X64\temp\20260804091715\~section0.prn
                                                    └─ 이게 조인 키
```

`20260804091715` = **neoStampa 잡의 `StartTime`** 과 같다.

실측(2026-08-05): PrintExp 생산 잡 **133건 전부 ±2초 이내 매칭, 1:N 중복 0** → 정확히 1:1.
검사 도구 = `node scripts/printexp-join-check.mjs`

### PrintExp 로그 파싱 포인트

- 인코딩 **GBK**(중국어 SW). cp949 나 UTF-16LE 로 읽으면 깨진다.
- 잡 블록 = `启动任务：` → `任务精度:...图像大小:...打印模式:` → 결과 → `作业ID:N, 删除TCP文件:...temp\<ts>\`
- 결과 마커: 완료 `_PrintWait---打印完成` · 취소 `打印控制线程---被取消`
- **temp 폴더가 없는 블록은 캘리브레이션/노즐체크**(`593x17mm 1pass`)라 생산이 아니다 → 제외 필수.
  실측 379블록 중 246건이 이것이다.
- ⚠️ **기존 `printexp` 파서로는 못 읽는다** — 그 파서는 UTF-16LE + `作业【파일명】打印完成` 형식을 기대하는데
  이 로그엔 그 패턴이 **0줄**이다. 같은 제품군의 다른 버전/설정으로 보인다.
- **구분 없이 둘 다 적재하면 실적이 이중계상된다** → `print_events.event_kind`(마이그 `0518`)로 분리.
  `RIP` 은 카드를 `PRINTING` 까지만 올리고 `PRINT_DONE`·불량등록·재고차감·실적집계에서 빠진다.
- 상세 = `docs/superpowers/specs/2026-08-05-neostampa-rip-integration.md`

---

## B. 실제 배포 인벤토리 (현장에서 채움)

물리 장비(호기) 1대 = 1행. 한 공정에 여러 호기 가능.

| equipment_id | 장비명 | 공정 | PC명/IP | RIP SW | 로그 경로 | 파서 | --test 검증 | 가동 |
|-------------|-------|------|---------|--------|----------|------|-----------|------|
| TPM-01 | TopazRip 1호기 | 솔벤 | ⬜ | TopazRip | `C:\TNSRip-X1\Print.log` | tns | ⬜ | ⬜ |
| RIP-03 | TopazRip 2호기 | 솔벤 | ⬜ | TopazRip | `C:\TNSRip-X11\Print.log` | tns | ⬜ | ⬜ |
| EPSON-01 | Epson 에코솔벤트 | 에코솔벤트 | DESKTOP-CB8Q1D6 | Epson Edge | `C:\ProgramData\Epson\Epson Edge Print\DB\Data.db` | epson | ⬜ | ⬜ |
| ? | ? 수성 | 수성 | ⬜ | ? | ? | ? | ⬜ | ⬜ |
| ? | ? UV | UV | ⬜ | ? | ? | ? | ⬜ | ⬜ |
| ? | ? 평판 | 평판 | ⬜ | ? | ? | ? | ⬜ | ⬜ |
| TRANS-8C-01 | 전사 8색 1호기 (Longyin Q2000) | 전사/태극기 | DESKTOP-5C9D04J | neoStampa 10.2.4 | `C:\Users\Public\Documents\neoStampa 10\Log` | neostampa | ✅ 실로그 145건 | ⬜ |
| TRANS-8C-02 | 전사 8색 2호기 (Longyin Q2000) | 전사/태극기 | PC-202605141926 | neoStampa 10.2.4 | 〃 | neostampa | ✅ | ⬜ |
| ? | ? 전사 출력 (실적 정본) | 전사 | ⬜ **PC 확인 필요** | PrintExp_X64 | `C:\PrintExp_X64\...\main\Log[날짜].txt` | **신규 필요** | ⬜ | ⬜ |
| ? | ? 간판(선명) | 간판 | ⬜ | ? | ? | ? | ⬜ | ⬜ |

> **전사 배포 순서 = PrintExp(출력) 먼저 → neoStampa(리핑) 나중.**
> RIP 로그만 먼저 붙이면 "리핑됨"을 출력 실적으로 오해할 여지가 남는다.
> ⬜ **남은 확인**: PrintExp 가 neoStampa 와 **같은 PC 인지**. 같으면 watcher 2개로 끝나고,
> 다르면 PC 2곳에 설치해야 한다. `LogWatcher.exe --probe` 한 번이면 판정된다
> (마커 출력 시 로그가 2개 걸리면 같은 PC).

---

## C. `?` 칸 채우는 방법 (각 장비 PC에서)

1. **RIP/제어 SW 확인** — 바탕화면·작업표시줄·`C:\Program Files`에서 어떤 출력 프로그램을 쓰는지.
2. **로그 파일 찾기** — 출력 1건 실행 직후 최근 수정된 로그 탐색:
   ```powershell
   # 최근 1일 내 수정된 log/txt/html/db 파일 검색
   Get-ChildItem C:\,D:\ -Include *.log,*.txt,*.html,Data.db -Recurse -ErrorAction SilentlyContinue |
     Where-Object { $_.LastWriteTime -gt (Get-Date).AddDays(-1) } |
     Sort-Object LastWriteTime -Descending | Select-Object FullName,LastWriteTime -First 20
   ```
3. **로그 형식 판별 → 파서 매칭**:

   | 로그 특성 | 파서 | 구현 |
   |----------|------|------|
   | 바이너리 (TopazRip Print.log) | `tns` | ✅ |
   | UTF-16LE 텍스트 `Log[날짜].txt` (PrintExp) | `printexp` | ✅ |
   | SQLite `.db` 파일 | `epson`(쿼리 작성) | ✅ |
   | append HTML (FlexiPRINT RIPLOG.HTML) | `flexi` | ✅ |
   | 일반 텍스트 (한 줄=1이벤트) | `text_log` | ✅ (정규식 config) |
   | **잡마다 파일 1개 생성** (neoStampa INI) | `neostampa` | ✅ |
   | CSV/TSV | `csv_log` | ❌ 구현필요 |

   > append 로그가 아니라 **잡별로 파일이 새로 생기는** 형식이면 tail 파싱이 아니라 폴더 감시다.
   > `neostampa` 파서가 그 패턴(상태 저장 = 처리한 파일의 최대 mtime)의 참조 구현이다.

---

## D. 주의 — equipment_id 사전등록 (무음 실패 방지)

`equipment` 테이블 `id`는 **TEXT PK** (`migrations/0027`). heartbeat 수신 시
`UPDATE equipment ... WHERE id = equipment_id` 로 가동상태(RUNNING/IDLE)를 자동전환한다
(`src/routes/printEvents.ts:385-397`).

→ **`equipment.json`의 `equipment_id`와 동일한 `id`로 `equipment` 테이블에 미리 행을 넣어야**
   장비 가동상태 자동전환이 작동한다. 없으면 print_events 기록·카드 자동완료는 되지만
   장비 상태 전환만 조용히 누락된다.

```sql
INSERT INTO equipment (id, name, printer_name, status)
VALUES ('TPM-01', 'TopazRip 1호기(솔벤)', 'Super Color ...', 'ACTIVE');
```

---

## E. 장비 1대 추가 절차 (인벤토리 확정 후, 장비당 ~20분)

1. 로그 샘플 확보 → 파서타입 결정 (표 C)
2. `equipment` 테이블에 `id` 등록 (표 D)
3. `equipment.json` watchers에 1행 추가
4. `LogWatcher.exe --test {equipment_id}` → 파싱 결과 눈으로 확인 (API 전송 없음)
5. `LogWatcher.exe --list` → 상태 OK
6. `install-service.bat` (관리자) → **`/equipment`** 에서 온라인 확인
   (⚠️ `/rip` 페이지는 폐기됨 — 접속하면 빈 화면. 출력 이벤트는 `/production`)
7. 실제 출력 1건 → 카드 자동 PRINT_DONE 확인 → **다음 장비**

> `neostampa` 파서는 **최초 실행 시 과거 로그를 보내지 않는다**(`backfill_days: 0` 기본).
> `--test` 는 전량 재파싱하지만 API 전송이 없어 안전하다. 의도적 소급이 필요할 때만 `backfill_days` 를 올린다.
