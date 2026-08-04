# CAPS 워커 배포 + 근태 공백 복구 절차 (선명)

> 작성 2026-08-04. 웹 축은 이미 prod 배포 완료(커밋 `81664371`·배포 `c8a19538`).
> 남은 것은 **선명 PC의 `caps-worker` 수동 갱신**과 **7/29~30 근태 복구** 두 가지.

---

## 0. 먼저 알아야 할 사실 3가지

### ① 선명 PC는 이미 켜져 있다
prod 동기화 이력 기준 **2026-08-03 19:00 KST부터 정상 재개**됐고, 지금도 하루 3회(09:00/13:00/19:00 KST) 돌고 있다.
"PC 켜지면"이 아니라 **지금 바로 배포 가능**하다.

### ② 실제 누락은 7/26~30이 아니라 **7/29~30 이틀**이다
선명(SM) 동기화 이력 실측:

| 마지막 정상 | 2026-07-28 19:00 KST · 조회범위 `20260725~20260728` |
|---|---|
| 다음 성공 | 2026-08-03 19:00 KST · 조회범위 `20260731~20260803` |

복귀 시 `LOOKBACK_DAYS=3`이라 **7/31부터만** 다시 읽었다. 따라서:

| 날짜 | 상태 |
|---|---|
| 7/26 · 7/27 | ✅ 정상 (7/27·7/28 동기화가 커버) |
| **7/28** | ⚠️ **19:00 KST 스냅샷만** — 그 이후 퇴근 펀치 누락 가능 |
| **7/29 · 7/30** | ❌ **완전 누락** |
| 7/31 ~ | ✅ 정상 (8/3 동기화가 커버) |

### ③ 자동 갭 복구로는 이 건이 안 고쳐진다 — 반드시 기간 지정
자동 갭 복구는 "마지막 성공일보다 **과거로만**" 확장한다. 선명은 이미 8/3~8/4 동기화가 성공해
`last_ok_to_date = 20260804`이므로 확장 조건에 걸리지 않는다.
**이번 건은 기간 지정(3단계)이 유일한 복구 경로다.** 자동 갭 복구는 *다음번* 공백을 막아준다.

---

## 1. 배포 경로 = Z: 공유 (호스트명 불필요)

### 관리공유(`\\호스트\c$`) 직접 복사는 안 된다 — 실측 확인
```
Test-Path \\192.168.0.107\c$   →  False
net view  \\192.168.0.107      →  System error 53 (네트워크 경로를 찾을 수 없음)
```
동산 CAPS PC조차 SMB가 막혀 있다. **`package.json`의 `npm run deploy`(xcopy `\\DESKTOP-9R7B2DD\c$\...`)는 현재 동작하지 않는다.**
→ IA 스크립트와 동일하게 **Z: 공유를 경유**한다. 호스트명·IP를 몰라도 된다.

> 참고: 호스트명이 필요하면 `nbtstat -A <IP>` (검증됨: `192.168.0.107` → `DESKTOP-9R7B2DD`).
> 다만 이 절차에는 필요 없다.

### 1-1. Z: 에 배포본 올리기 (개발 PC에서 1회)
```powershell
$dst = 'Z:\<배포폴더>\caps-worker-deploy'      # 예: Z:\DESIGNS\IA-등록\_scripts\caps-worker-deploy
New-Item -ItemType Directory $dst -Force | Out-Null
Copy-Item C:\Users\user\dongsan_mes\caps-worker\src              $dst -Recurse -Force
Copy-Item C:\Users\user\dongsan_mes\scripts\install-caps-worker.ps1 $dst -Force
```
결과 구조 — 설치 스크립트가 `src`를 **자기 옆에서 자동으로 찾는다**:
```
caps-worker-deploy\
  ├ src\                       (index.js·range.js·test-range.js …)
  └ install-caps-worker.ps1
```

---

## 2. 워커 갱신 (선명 PC에서 1줄)

선명 PC에서 PowerShell을 열고:
```powershell
Z:\<배포폴더>\caps-worker-deploy\install-caps-worker.ps1
```
관리자 권한 불요. 스크립트가 전부 처리한다:

| 단계 | 내용 |
|---|---|
| 1/5 | 예약작업 `CapsWorker` 정지 + 남은 `node.exe` 정리 |
| 2/5 | 기존 `src` → `src.bak-<날짜시각>` 백업 |
| 3/5 | 새 `src` **통째 교체** (병합 아님 — 구버전 잔존 파일 제거) |
| 4/5 | 자체검사 `test-range` 30건 → **실패하면 자동 롤백 후 중단** |
| 5/5 | 재시작 + 기동 로그 출력 |

`.env`·`logs`·`node_modules`는 건드리지 않는다 → `SITE_ID=SM`·API 키·`LOOKBACK_DAYS=3` 그대로 유지.
새 설정 키(`MAX_BACKFILL_DAYS`·`AUTO_GAP_RECOVERY`)는 `config.js`에 기본값이 있어 **`.env` 수정 불필요**.
새 의존성이 없으므로 **`npm install` 불필요**.

### 정상 출력
```
[3/5] 새 src 복사
  복사 완료 (.env·logs·node_modules 미변경)
[4/5] 자체검사 (test-range)
  전체 통과 (30건)
[5/5] 워커 재시작
[OK] CAPS Worker 시작 (v1.1.0)
```

### 워커 폴더가 `C:\caps-worker`가 아니면
```powershell
Z:\<배포폴더>\caps-worker-deploy\install-caps-worker.ps1 -WorkerDir D:\caps-worker
```
(자동 탐색: `C:\caps-worker` → `D:\caps-worker` → `%USERPROFILE%\caps-worker`)

### 재시작 없이 교체만
```powershell
... \install-caps-worker.ps1 -NoRestart
```

> ⚠️ 워커 로그(`logs\caps-worker-YYYYMMDD.log`) 시각은 **UTC**다(KST−9h).
> 09:00 KST 동기화는 로그에 `00:00`으로 찍힌다.

> ⚠️ 예약작업이 등록돼 있지 않다면 스크립트가 알려준다 →
> `cd C:\caps-worker ; npm run install-service` (로그온 시 자동 시작으로 등록)

---

## 3. 7/29~30 근태 복구 (MES 화면)

1. `/settings` → **CAPS 근태 연동** 탭
2. 사이트 카드에서 **선명** 선택
3. 기간에 **2026-07-28 ~ 2026-07-31** 입력
   - 7/28을 포함시키는 이유 = 그날 19:00 이후 퇴근분 보정
   - 7/31은 겹쳐도 무해(UPSERT)
4. **지금 동기화** 클릭 → 워커가 **30초 내** 실행

### 결과 확인
동기화 이력에 새 행이 뜨고 **조회범위 = `20260728~20260731`** 이어야 한다.
범위가 `20260801~20260804`처럼 나오면 **워커가 아직 구버전**이다(2단계 실패) — 기간이 무시된 것.

그다음 `/attendance`에서 7/29·7/30에 선명 직원 행이 채워졌는지 확인.

> **수기 입력분은 덮어쓰지 않는다.** 그 사이 담당자가 손으로 근태를 입력했다면
> 해당 행은 `source=MANUAL`/`CAPS_EDITED`라 CAPS 값이 들어가지 않고 `건너뜀`으로 집계된다.
> 이는 의도된 동작 — 손으로 고친 값이 자동 동기화에 지워지면 안 되기 때문이다.
> 수기분을 CAPS 값으로 바꾸려면 해당 행을 먼저 지워야 한다.

---

## 4. 최종 검증

| 항목 | 확인 방법 | 기대값 |
|---|---|---|
| 워커 버전 | 동기화 이력 행 클릭 → 워커 버전 | `1.1.0` (미보고 아님) |
| 기간 지정 동작 | 이력의 조회범위 | `20260728~20260731` |
| 근태 적재 | `/attendance` 7/29·7/30 | 선명 직원 행 존재 |
| 정기 동기화 | 다음 09:00/13:00/19:00 KST | SUCCESS 계속 |

---

## 5. 롤백 (필요 시)

자체검사 실패는 스크립트가 **자동 롤백**하므로 손댈 일이 없다. 수동 롤백이 필요하면:
```powershell
schtasks /End /TN "CapsWorker"
Remove-Item C:\caps-worker\src -Recurse -Force
Copy-Item "C:\caps-worker\src.bak-<stamp>" C:\caps-worker\src -Recurse
schtasks /Run /TN "CapsWorker"
```
**웹은 롤백 불필요** — 구버전 워커는 pending 플래그만 읽으므로 그대로 동작한다.

---

## 6. 동산(DJ) PC는?

동산은 공백이 없어 급하지 않다. 다만 같은 갱신을 해두면 **다음에 어느 PC가 며칠 꺼져도 자동 복구**된다.
절차는 완전히 동일하다(같은 Z: 경로에서 `install-caps-worker.ps1` 실행).
`npm run deploy`는 SMB가 막혀 있어 쓰지 말 것.

---

## 부록: 설치 스크립트를 고칠 때 걸린 함정 2가지

실제 테스트로 잡은 것들이라 다시 밟지 않도록 남긴다.

1. **PS 5.1은 BOM 없는 `.ps1`을 CP949로 읽는다.** 한글이 든 스크립트를 UTF-8(BOM 없음)으로 저장하면
   따옴표가 깨져 파싱이 통째로 실패한다. → `.ps1`은 **반드시 UTF-8 BOM**으로 저장
   (`scripts/install-a0-panel.ps1`도 BOM 있음).
2. **`$ErrorActionPreference='Stop'` + 네이티브 exe `2>&1`** → stderr 각 줄이 ErrorRecord로 바뀌며
   그 자리에서 예외가 터진다. 자체검사가 실패했을 때 **롤백 코드가 통째로 건너뛰어졌다.**
   → 검사 구간에서만 `Continue`로 낮추고 `$LASTEXITCODE`로 판정.

관련 메모리: `design-caps-sync-gap-recovery`
