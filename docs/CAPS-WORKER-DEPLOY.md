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

## 1. 사전 확인 (개발 PC에서)

```powershell
# 선명 워커가 아직 구버전인지 확인 — "미보고"면 구버전
# MES → /settings → CAPS 탭 → 선명 선택 → 동기화 이력 행 클릭 → "워커 버전"
```

필요한 정보 **1가지**: 선명 PC의 호스트명 또는 IP.
MES `caps_sites.worker_endpoint`가 선명은 비어 있어 시스템이 모른다(동산은 `192.168.0.107`).
→ 경리 담당자에게 확인하거나, 선명 PC에서 `hostname` / `ipconfig` 실행.

---

## 2. 워커 파일 교체 (선명 PC)

### 2-1. 워커 중지
```powershell
schtasks /End /TN "CapsWorker"
# 자식 node 프로세스가 남을 수 있으므로 확인 후 정리
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*caps-worker*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

### 2-2. 백업 (필수)
```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
Copy-Item C:\caps-worker\src "C:\caps-worker\src.bak-$stamp" -Recurse
```

### 2-3. 파일 복사
개발 PC에서 (`<선명PC>`를 실제 호스트명/IP로):
```powershell
xcopy C:\Users\user\dongsan_mes\caps-worker\src \\<선명PC>\c$\caps-worker\src /E /Y /I
```
> `package.json`의 `npm run deploy`는 **동산 PC(`DESKTOP-9R7B2DD`) 전용 하드코딩**이라 선명에는 쓰면 안 된다.

**`.env`는 복사 대상이 아니다** — `src`만 덮으므로 사이트별 설정(`SITE_ID=SM`·API 키·`LOOKBACK_DAYS=3`)은 그대로 유지된다.
새 설정 키(`MAX_BACKFILL_DAYS`·`AUTO_GAP_RECOVERY`)는 `config.js`에 기본값이 있어 **`.env` 수정 불필요**.

**`npm install` 불필요** — 새 의존성이 없다(`range.js`·`test-range.js` 모두 외부 의존성 0).

### 2-4. 교체 검증 (재시작 전)
```powershell
cd C:\caps-worker
npm run test-range      # ODBC·MES 없이 로직만 검사
```
**`전체 통과 (30건)`** 이 나와야 한다. 하나라도 실패하면 재시작하지 말고 5단계(롤백)로.

### 2-5. 재시작
```powershell
schtasks /Run /TN "CapsWorker"
```

### 2-6. 기동 확인
```powershell
Get-Content "C:\caps-worker\logs\caps-worker-$(Get-Date -Format 'yyyyMMdd').log" -Tail 20
```
다음 3줄이 보여야 한다:
```
CAPS Worker 시작 (v1.1.0)
Lookback: 3일 (상한 60일)
자동 갭 복구: ON
```
> ⚠️ 로그 시각은 **UTC**다(KST−9h). 09:00 KST 동기화는 로그에 `00:00`으로 찍힌다.

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
동산은 `npm run deploy`(하드코딩 경로)가 그대로 쓸 수 있고, 나머지 절차는 동일하다.

관련 메모리: `design-caps-sync-gap-recovery`
