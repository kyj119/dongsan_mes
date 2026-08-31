# 배포 매뉴얼 (정본)

> 2026-08-05 정리. 흩어져 있던 배포 절차를 한곳에 모음.
> 흡수: `A0-panel-designer-deploy.md`(→archive) · `CAPS-WORKER-DEPLOY.md`(§4 요약, 원문은 복구 절차 포함)
> 관련 도구 주석: `scripts/ia-jsx-audit.cjs` · `scripts/ia-deploy.cjs` · `.claude/skills/deploy-verify/`

## 0. 가장 중요한 사실

**`git push` 와 `npm run deploy` 로 나가는 것은 웹뿐이다.** 나머지 7축은 전부 수동이다.
main 에 커밋돼 있어도 런타임은 옛날 파일일 수 있고, **브랜치·커밋 기록으로 배포 여부를 추론하면 틀린다.**

> 실제 사고(2026-07-29): `SheetLayout.jsx` 수정이 exe 폴더에 미복사 → 판 렌더가 6일간 실패.
> 커밋 기록만 보면 "이미 고쳤음"으로 보였다.
> 실제 사고(2026-08-05): 패널 수정을 커밋만 하고 Z: 에 안 올려 감사가 드리프트로 잡아냄.

**배포는 명시 요청이 있을 때만 한다.** "고쳐줘"는 배포 요청이 아니다.

---

## 1. 무엇을 고쳤나 → 어디까지 가야 하나

| 고친 것 | 명령 | 반영 범위 | 놓치면 |
|---|---|---|---|
| `src/**` (웹) | `/deploy-verify` | 전체 즉시 | — |
| `migrations/*.sql` | §2.2 | 전체 즉시 | 배포된 코드가 없는 컬럼을 읽음 → 500 |
| `IllustratorAutomat/*.jsx` · `*.cs` | §3.2 축1 | 에이전트 PC 1대 | 구버전 JSX 가 계속 돔 |
| **가공·재단 패널** (로직·화면) | **§3-A** | 축2=전 PC 즉시 · 축3→4=PC별 | 축3만 하면 **아무 PC에도 반영 안 됨** |
| `caps-worker/**` | §4 | 경리 PC별 | 근태 동기화가 구버전 로직 |
| `LogWatcher/**` | §5 | 장비 PC별 | 그 장비만 이벤트 누락 |

**순서 규칙 2개**
- 패널: **축3(Z:) 먼저, 축4(설치) 나중.** 뒤집으면 구버전이 깔린다.
- 마이그레이션: **DB 먼저, 코드 나중.** 반대로 하면 배포된 코드가 없는 스키마를 읽는다.

---

## 2. 웹 (Cloudflare Pages)

### 2.1 표준 경로
```powershell
# 스킬이 전 체인을 돈다: 타입체크 → 빌드 → entity 감사 → 배포 → 스모크 → 현황판
/deploy-verify
```

수동으로 할 때:
```powershell
npm run verify          # typecheck + build
npm run audit:entity    # entity 필터 누락
npm run deploy:prod     # --branch main 포함됨
$env:SMOKE_URL='https://webapp-9i0.pages.dev'; npm run smoke
```

| 함정 | 내용 |
|---|---|
| `--branch main` | `deploy:prod` 에 이미 들어 있다. 직접 `wrangler pages deploy` 하면 **프리뷰로 나간다** |
| 커밋 메시지 | 한글이면 PowerShell 5.1 에서 깨진다 → `--commit-message` 는 ASCII |
| 멀티세션 | `deploy:prod` 는 **워킹트리 전체**를 빌드한다. 남의 미완성 코드가 같이 나간다 → **push FIRST**, dirty WIP 금지 |
| `dev:d1` | `dist/` 를 서빙한다. 코드 고쳤으면 `npm run build` 먼저 |

### 2.2 D1 마이그레이션
```powershell
npm run db:migrate:local                      # 로컬 먼저
npm run db:migrate:prod                       # 추적표가 맞을 때
npx wrangler d1 execute webapp-production --remote --file migrations/0521_x.sql   # 신규는 이쪽
```
> 추적표(`d1_migrations`)와 파일 목록이 자주 어긋난다. **신규 파일은 `execute --file` 직접**이 안전하다.
> 마이그레이션 작성 시 `/migration-check` 가 멱등성을 본다.

### 2.3 배포 후 확인 (3개 다 해야 끝)
1. `npm run smoke` — `PASS n/n`. 1건이라도 FAIL 이면 롤백 판단
2. **변경 페이지** 로드 + 콘솔 에러 0
3. **변경분 마커 실측** — 바뀐 문구·필드가 prod 번들에 실제로 있는지. 빌드 성공이 반영을 보장하지 않는다

### 2.4 롤백
Cloudflare Pages 대시보드에서 이전 배포 **Rollback**. DB 변경이 섞였으면 마이그레이션 역방향을 먼저 준비할 것.

---

## 3. IA 5축 — 축 지도

| 축 | repo | 런타임 정본 | 반영 |
|---|---|---|---|
| 1 에이전트 JSX | `IllustratorAutomat/*.jsx` | **실행 중 exe 폴더** (`Get-Process IllustratorAutomat`) | 빌드가 복사 |
| 2 디자이너 호스트 | `IllustratorAutomat/designer/*.jsx` | `Z:\DESIGNS\IA-등록\_scripts\` | **Z: 1개 = 전 PC 즉시** |
| 3 패널 배포본 | `.../com.mes.a0.panel/**` (폴더 전체) | `Z:\...\_scripts\a0-panel\com.mes.a0.panel\` | 설치 원본만 |
| 4 패널 설치본 | 같은 repo 원본 | `%APPDATA%\Adobe\CEP\extensions\com.mes.a0.panel` | **일러가 실제로 읽는 것** |
| 5 배포 도구 | `scripts/install-*.ps1` | `Z:\...\_scripts\` · `Z:\Designs\caps-worker\` | **디자이너가 실제로 실행하는 설치기** |

> **축3 은 파일 목록이 아니라 폴더 전체다.** 감사가 repo 패널 폴더를 **열거**하므로 새 파일(`js/*.js` 추가 등)이
> 자동으로 편입된다 — 등록을 잊어서 감사망 밖에 놓이는 일이 없다(2026-08-06 근본수정).
>
> **축5 가 왜 따로 있나**: 배포를 *수행하는* 스크립트도 repo→Z: 수동 축이다. 축2도 축3도 아니라 여태
> 무주공산이었고, 실제로 Z: 사본이 병합(08-04) 전 버전인 채 남았는데 감사는 통과했다.
> 낡은 설치기는 **껍데기가 아니라 배포 절차 자체를 구버전으로 만든다**(은퇴한 재단 확장을 못 지운다).

### 3.1 도구 2개
```powershell
npm run audit:ia-jsx                 # 4축 드리프트 (exit 1 = 불일치). 축1은 실행 중 프로세스 실측
npm run ia:deploy                    # 미커밋 경고 → 게이트 → 나갈 파일 확인(y/n) → 백업 → 복사 → 재감사
npm run ia:deploy -- --dry-run       # 뭐가 나갈지만
npm run ia:deploy -- --install       # 축4(이 PC 설치)까지
```
배포 대상 목록은 감사 도구(`--json`)를 그대로 쓴다 — 따로 적으면 둘이 갈린다.
**축2가 섞이면 `--yes` 여도 한 번 더 묻는다**(전 PC 즉시 반영이라서). **축1은 복사하지 않는다** — 빌드가 한다.

### 3.2 축1 — 에이전트
`.csproj` 가 `CopyToOutputDirectory=Always` 라 **빌드하면 자동 복사**된다. 빌드를 안 돌리면 미반영.
```powershell
Get-Process IllustratorAutomat | Stop-Process        # exe 실행 중이면 파일 잠김
dotnet build IllustratorAutomat -c Release
# 에이전트 재시작 → 로그에 "에이전트 시작 (PID ...)" 와 JSX 지문 확인
npm run audit:ia-jsx
```
- JSX만 바뀌었으면 **에이전트 재시작 불필요**(잡마다 새로 읽는다). 급하면 `audit:ia-jsx --sync-agent`.
- `.jsx` 는 `node --check` 불가 → `sed 's/^#/\/\/#/'` 로 `.js` 사본 만들어 검사.
- JSX 조기 `return` 은 반드시 `_ia_status` 설정. 미설정 = 반환 `""` → 에이전트가 "JSX 반환 빈값(모달 의심)"이라는 **틀린 진단**을 UI에 띄운다.

---

## 3-A. 가공·재단 패널 배포 (실무 정본)

### A-0. 먼저 알 것 — 패널은 1개다

2026-08-04 병합으로 **재단 패널은 A0 패널의 「재단」 탭**이 됐다. 설치·배포 대상은 `com.mes.a0.panel` **하나뿐**이고,
`install-cut-panel.ps1` 은 은퇴했다(구 확장 `com.mes.cut.panel` 은 설치 스크립트가 백업 후 지운다).

다만 **호스트(로직)는 2파일로 유지**한다 — 재단만 되돌리는 롤백이 **Z: 파일 1개 교체**로 끝나게 하려고.

```
패널 1개 ─┬─ 「가공」 탭  : js/main.js      ↔ mes-a0-host.jsx
          ├─ 「재단」 탭  : js/cut-main.js  ↔ mes-cut-host.jsx
          └─ 공용        : tabs.js · geometry.js · nesting.js · bleed.js · index.html · css
```
`main.js`·`cut-main.js`·`tabs.js` 는 **각각 IIFE** 다. 벗기거나 DOM id 를 겹치게 만들면 조용히 서로를 덮어쓴다
(겹쳤던 `out`·`ver` → `cutOut`·`cutVer` 로 개명한 전례).

### A-1. 뭘 고쳤나 → 어디까지

| 고친 파일 | 무엇 | 축 | 각 PC 설치 | 일러 재시작 |
|---|---|---|---|---|
| `designer/mes-a0-host.jsx` | 가공 로직 | 2 | **불요** | **불요** |
| `designer/mes-cut-host.jsx` | 재단 로직 | 2 | **불요** | **불요** |
| `designer/mes-lock.jsx` | 두 탭 공용 잠금 | 2 | 불요 | 불요 |
| `js/main.js` | 가공 화면 | 3→4 | 필요 | 필요 |
| `js/cut-main.js` | 재단 화면 | 3→4 | 필요 | 필요 |
| `js/tabs.js` | 최상위 탭 | 3→4 | 필요 | 필요 |
| `js/geometry.js` · `nesting.js` · `bleed.js` | 기하·네스팅·도련 | 3→4 | 필요 | 필요 |
| `index.html` · `css/style.css` | 화면 구조 | 3→4 | 필요 | 필요 |

> **축2(로직)가 재시작 불요인 이유**: 패널의 `jsx/host.jsx` 는 스텁이고, 실행할 때마다 Z: 정본을 `$.evalFile` 한다.
> Z: 파일 1개 교체 = **전 디자이너 PC 즉시 반영**. 그래서 백업·실기 확인이 **선행**돼야 한다.
>
> **축3만 하면 아무 PC에도 반영되지 않는다.** Z: 는 설치 *원본*일 뿐이다.

### A-2. 절차

**① 게이트 (배포 전 필수)**
```powershell
npm run panel:smoke        # 가공 탭 — 탭 구조·실루엣 분리
npm run cut:smoke          # 재단 탭 — 칼선·네스팅·도련
npm run audit:ia-jsx       # 현재 드리프트 확인
```

**② 축2·축3 — 관리 PC 1회**
```powershell
npm run ia:deploy
#  미커밋 IA 변경 경고 → 게이트 → 나갈 파일 목록 확인(y/n) → 백업 → 복사 → 재감사
#  축2가 섞이면 --yes 여도 한 번 더 묻는다
```
백업 위치 = `Z:\DESIGNS\IA-등록\_scripts\_backup\<yyyyMMdd-HHmmss>\`

**③ 축4 — 각 디자이너 PC (화면을 고쳤을 때만)**
```powershell
# 1) 일러스트레이터 완전 종료
# 2) PowerShell (관리자 권한 불요)
powershell -ExecutionPolicy Bypass -File "Z:\DESIGNS\IA-등록\_scripts\install-a0-panel.ps1"
# 3) 일러 재시작 → 창(Window) > 확장(Extensions) > MES A0 Panel
```
이 PC 만이면 `npm run ia:deploy -- --install` 로 ②③ 을 한 번에.

설치 스크립트가 하는 일: 껍데기 **제자리 덮어쓰기**(기존은 `_panel_backups\` 로 Copy 백업·3세대 보관) ·
`PlayerDebugMode=1`(HKCU CSXS 10/11/12 — 미서명 확장 허용) · Z: 정본 존재 확인 · `host.jsx` 가 스텁인지 검증 ·
**구 재단 확장(`com.mes.cut.panel`) 백업 후 제거**(`$OLD_CUT_EXT`).

> 설치 스크립트 정본 = repo `scripts/install-a0-panel.ps1`. **축5 로 감사·배포된다**(2026-08-06 신설).
> 그전에는 감사망 밖이라 Z: 사본이 07-31 자(병합 전)인 채 방치됐는데 감사는 "드리프트 없음"을 냈다.

**④ 확인**
```powershell
npm run audit:ia-jsx       # 드리프트 없음 = 4축 일치
```
패널에서 육안 확인 — **버전 표시가 축별로 다르다**:

| 위치 | 표시 | 무슨 축 |
|---|---|---|
| 가공 탭 우상단 | `· A0-CEP-x.y.z / 화면 0.2.0` | 앞=축2 · **뒤(화면)=축3·4** |
| 재단 탭 우상단 | `shell 0.22.0 · host CUT-CEP-0.14.0` | 앞(shell)=축3·4 · 뒤(host)=축2 |

> ⚠️ **화면(shell) 버전으로 축3·4 반영 여부를 본다.** 호스트 버전은 축2라, 껍데기만 바꾼 배포에서는 안 움직인다.

### A-3. 전제조건 — 여기서 대부분 실패한다

NAS 를 반드시 **`Z:`** 로 매핑. 경로가 3곳에 하드코딩이다.

| 파일 | 하드코딩 |
|---|---|
| `jsx/host.jsx` | `Z:/DESIGNS/IA-등록/_scripts/mes-a0-host.jsx` (로직 정본) |
| `mes-a0-host.jsx` | `Z:/DESIGNS/IA-등록` (산출물 저장 루트) |
| `js/main.js` | `Z:/DESIGNS/IA-등록/_config/config.json` (가공자·거래처) |

다른 문자로 매핑하면 패널이 `ERROR 정본 없음`. 이 PC 기준 `Z:` = `\\192.168.0.122\공유폴더`.

### A-4. 개발 중 빠른 반영 (핫스왑 — 일러 재시작 없이)

패널 디버그 포트 **8888**(`.debug`). 손이 닿지 않는 디자이너 PC 진단에도 이게 유일한 수단이다.

| 대상 | 방법 | 함정 |
|---|---|---|
| 화면(HTML/JS/CSS) | `%APPDATA%\...` 에 복사 → CDP `Page.reload {ignoreCache:true}` + `Network.setCacheDisabled` | `location.reload()` 는 CEF 캐시를 그대로 써서 **새 JS 가 안 붙는다** |
| 호스트(ExtendScript) | `evalScript` 로 `$.evalFile("<ASCII 경로>")` | ⚠️ **반드시 전역 스코프.** IIFE 안에서 부르면 함수가 지역에 갇혀 이후 "함수가 아닙니다" |

- 패널 리로드는 HTML/JS만 갱신한다 — `ScriptPath`(host.jsx)는 재실행되지 않는다.
- **MCP illustrator(COM)는 CEP 와 다른 엔진**이다. COM 에서 `mesA0_*` 가 안 보이는 게 정상이고, COM 은 문서 close 에서 hang 전례가 있다 → 패널 상태 조회도 CDP 경유가 안전.
- 핫스왑은 **검증 수단이지 배포가 아니다.** 확인이 끝나면 A-2 절차로 정식 배포할 것.

### A-5. 롤백

| 범위 | 방법 |
|---|---|
| 재단 로직만 | `Z:\...\_scripts\mes-cut-host.jsx` 를 백업본으로 교체 — **가공은 안 건드린다** |
| 가공 로직만 | 같은 방식으로 `mes-a0-host.jsx` |
| 화면 (이 PC) | `%APPDATA%\Adobe\CEP\_panel_backups\com.mes.a0.panel.bak-<시각>` 복원 |
| 화면 (전체) | `_scripts\_backup\<시각>\` → Z: 복원 후 각 PC 재설치 |
| 패널 제거 | `install-a0-panel.ps1 -Uninstall` |

> ⚠️ **`.bak-*` 폴더를 `extensions\` 안에 두지 말 것.** manifest 의 `ExtensionBundleId` 가 원본과 같아
> **일러가 백업 폴더를 읽는다**(실측: `location.href` 가 `...bak-20260730-205701/index.html` 이었다).
> "설치 완료" + **`audit:ia-jsx` 드리프트 0 인데 화면은 구버전**이 되어 원인 추적이 매우 어렵다.
> CEP baseUrl 은 로드 시점 고정이라 하드 리로드로도 못 바꾸고 **패널을 닫았다 열어야** 한다.
> 현재 설치 스크립트는 백업을 `Copy-Item` 으로 뜨고 **제자리 덮어쓰기**를 하므로 이 문제가 없다.

### A-6. 산출물 감사
```powershell
npm run audit:ia-storage   # work.ai/판.ai 첫 바이트가 %PDF- 인지 = pdfCompatible 켜짐 = 같은 그림 2벌
```

---

## 4. caps-worker (근태 동기화)

**PC push 전용이다** — 서버에서 pull 할 수 없고, 웹 배포에 실리지 않는다.

```powershell
# ① Z: 배포본 갱신 (관리 PC)
#    정본 = Z:\Designs\caps-worker\
# ② 대상 PC에서
powershell -ExecutionPolicy Bypass -File "Z:\Designs\caps-worker\install-caps-worker.ps1"
```

| 함정 | 내용 |
|---|---|
| `.env` | **법인별로 다르다.** Z: 의 `.env` 는 동산(DJ) 설정 — 선명 PC 에 그대로 복사하면 안 된다 |
| 관리공유 | `\\호스트\c$` 는 막혀 있다(실측). `package.json` 의 xcopy 경로는 **동작하지 않는다** → Z: 경유 |
| 갭 복구 | 자동 복구는 "마지막 성공일보다 **과거로만**" 확장한다. 그 뒤로 성공한 구간의 공백은 **기간 지정 재조회**가 유일한 경로 |

상세·복구 절차 = `docs/CAPS-WORKER-DEPLOY.md`.

---

## 5. LogWatcher (장비 로그)

장비 PC별 설치. 장비 ID 정본은 **그 PC 의 `appsettings.json`** 이다.

```
C:\Logwatcher\LogWatcher.exe --test <장비ID>    # 전송 없이 파싱만 확인 — 반드시 먼저
C:\Logwatcher\install-service.bat               # 관리자 권한
```
확인: `/equipment` 온라인 → `/production` 이벤트.
`equipment_id` 는 서버 등록값과 **글자 하나까지** 같아야 한다. 경로의 `\` 는 JSON 이라 `\\`.

**이미 설치된 PC 에 새 빌드를 넣는 절차(업데이트 롤아웃)는 별도다** — 축이 둘이고 반영 방식이 다르다:
`binLogWatcher.exe` 는 **PC 마다 [2] 실행**해야 하고, `kit.ps1`·`START.bat` 은 **Z: 갱신만으로 즉시**다.
조립·배포는 `LogWatcherkitmake-kit.ps1` 하나가 둘 다 한다. → **§5**

상세 = `docs/LOGWATCHER_FIELD_SETUP.md`.

---

## 6. 게이트 한눈에

| 명령 | 무엇을 막나 |
|---|---|
| `npm run verify` | 타입 오류·빌드 실패 |
| `npm run smoke` | 라우트·컬럼명·JOIN·권한 (읽기 전용) |
| `npm run audit:entity` | entity 필터 누락 = 법인 데이터 유출 |
| `node scripts/sort-audit.cjs` | `ORDER BY` tie-break 누락 = 목록 순서 뒤집힘·페이징 중복 |
| `npm run audit:ia-jsx` | IA 4축 드리프트 = 구버전이 조용히 도는 것 |
| `npm run audit:ia-storage` | work.ai 용량 회귀(PDF 사본 동봉) |
| `npm run panel:smoke` · `cut:smoke` | 패널 구조·기하 회귀 |
| `/migration-check` | 마이그레이션 멱등성 |

---

## 7. 실제로 났던 사고 (같은 길 다시 가지 않게)

| 날짜 | 사고 | 원인 | 지금 막는 것 |
|---|---|---|---|
| 2026-07-29 | 판 렌더 6일간 실패 | 축1 미복사 — 커밋은 돼 있었음 | `audit:ia-jsx`(실행 중 프로세스 실측) |
| 2026-08-05 | 패널 수정이 Z: 미반영 | 커밋만 하고 축3 누락 | `audit:ia-jsx` · `ia:deploy` |
| 2026-07-31 | 일러가 백업 폴더를 읽음 | `.bak-*` 가 `extensions\` 안에 있고 BundleId 동일 | 설치 스크립트가 밖으로 이동 |
| multi-UOM | dirty WIP 가 prod 로 | `deploy:prod` = 워킹트리 전체 빌드 | worktree 격리 · push FIRST |
| 2026-08-05 | 폴더 선택 3일간 고장 | 스모크가 **깨진 형태를 정답으로 고정** | 게이트에 호출 가능 형태 검증 추가 |
