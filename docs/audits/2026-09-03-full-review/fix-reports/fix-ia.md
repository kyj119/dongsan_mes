# 번들 ⑦ IllustratorAutomat — 수정 보고 (2026-09-03)

워크트리 `C:\Users\user\dongsan_mes-worktrees\fix-ia` · 브랜치 `session/fix-ia` · **배포 안 함**

## 결과 요약

| | 수 |
|---|---|
| 수정 | 12 |
| 건너뜀(SKIPPED) | 1 |

| 게이트 | 이전 | 이후 |
|---|---|---|
| `npm run panel:smoke` | 130 | **141** |
| `npm run cut:smoke` | 462 | **467** |
| `npm run cut:shellsync` | 24 | **30** |
| `node --check` (편집한 .jsx 7개) | — | 전부 통과 |
| ES3 토큰 스캔(diff 코드줄) | — | `let`/`const`/`=>`/`forEach`/`JSON`/템플릿리터럴 **0** |
| `npm run audit:ia-jsx` | — | 드리프트 11건 = **예상된 결과**(repo만 고치고 배포 안 함) |

---

## HIGH

### 1. 호스트 게이트에 배열이 아니라 문자열 — 기능 2개가 영구 잠김
`js/cut-main.js:2439`(SELALL) · `:238`(BAKE1) · `:183` `hostAtLeast`

`hostAtLeast(min)` 은 `min[i]` 를 숫자로 읽는데 두 상수만 버전 문자열이었다. 글자와 숫자 비교라 **항상 false**.

- **[◎ 전체]** = 영구 사용 불가 + "호스트가 구버전이라… Z: 의 mes-cut-host.jsx 를 배포하세요" 라는 **틀린 진단**(실제 호스트 0.30.0, `mesCut_selectAllTop` 은 0.24.0부터 존재) → 엉뚱한 재배포를 유도했다.
- **`hostSupportsOneBake()`** 상시 false → `wantInk` 가 늘 false → 도련을 마스크 굽기와 같이 못 받고 매번 다시 구웠다(주석 실측 5.7초/회 낭비). 결과가 같아서 조용히 잠복.

두 상수를 배열로 고치고, `hostAtLeast` 가 **문자열 인자도 파싱**하도록 정규화를 넣었다 — 같은 실수가 다시 기능을 조용히 잠그지 못한다.

### 2. 재단 등록 manifest 가 저장 배율을 반영하지 않았다
`designer/mes-cut-host.jsx:3073`(measured_cm) · `:3159`(scale_pct)

판 문서는 `mesCut_sc` 로 **실물/N** 저장인데 아트보드를 그대로 cm 로 적고 `scale_pct` 는 100 하드코딩이었다. 1/2 로 짜면 파일명은 실물인데 대기물은 **가로·세로 절반**, 배율칸 1 → 주문 라인 규격 1/S · **청구면적 1/S²**.

`measured_cm` 에 `MESCUT_SCALE_N` 을 곱해 실물로 되돌리고 `scale_pct = 100/N` 으로 바꿨다. A0 규약(`mes-a0-host.jsx:982~983`)과 동일하고, 주문서(`orderForm/intake.js:620·801·845`)가 기대하는 계약과 맞다.

---

## MEDIUM

| # | 위치 | 조치 |
|---|---|---|
| 3 | `ExtractGroups.jsx:492` | `pdfCompatible=false`. 소비자가 `app.open` 하나뿐이라 PDF 스트림이 불필요 — 용량 2배·`%PDF-` 마커 해소 |
| 4 | `SheetLayout.jsx` 검증 3종 | `newDoc.close()` **뒤**라 매번 예외 → 각 catch 가 삼켜 `verifyErrors` 가 영원히 빈 배열 = 항상 "모든 검증 통과". `layerA.remove()` 앞(10-2.5절)으로 옮기고, 기대 아트보드식에 **돔보 확장**을 반영했다. 검증 자체가 실패하면 이제 그 사실을 기록한다 |
| 5 | `SheetLayout.jsx` 최상위 catch | `_ia_status` 를 **먼저** 대입하고 로그는 별도 try. 로그 경로가 `$.fileName`(에이전트 실행에선 없음)이라 던지면 반환이 ""가 되어 `JsxDiag()` 가 "JSX 반환 빈값" 이라는 틀린 진단을 띄웠다. 폴백 경로도 `_ia_trace_path` 를 먼저 본다 |
| 6 | `PackGroups.jsx:33`·`:556` | `_iaScriptDir()` 도입 — 주입 경로 우선, 각 단계 try, 최후 `Folder.temp`. 여태 파라미터를 읽기 **전에** `$.fileName` 을 무조건 실행해 죽었고 catch 폴백도 같은 식이라 `ia_error.log` 조차 안 남았다 |
| 7 | `designer/mes-a0-host.jsx` 서명 | 삭제 대응. 상세는 아래 |
| 8 | `js/main.js` queueRemove 2곳 | 호스트 반환(남은 개수)을 확인하고 **성공일 때만** splice. 실패·불일치는 화면에 알린다 |
| 9 | `js/main.js` `seedSilhouette` | `hostBusy` 조기 반환이 `done('작업 중입니다…')` 를 부른다 — 콜백 무음 사멸 차단 |
| 10 | `js/main.js` 「조」 표기 | `setRowQty(p, n)` 도입. 행 수량으로 덮어쓸 때 단위 표기도 같이 맞춘다(`#qtyUnit` 가시성 게이트, `seedKeyword` 와 같은 방식). **환산 지점(`gatherParams` 1곳)은 그대로** |
| 11 | `mes-sheet.jsx:224` · `mes-core.jsx:322` | `mesSheet_newDocMM` · `mesCore_newDocMM` 추가 — DocumentPreset 경로 |
| 12 | `PackGroups.jsx` 4곳 | `_pgNewDocMM` 추가(`:364`·`:407`·`:459`·`:491`) |

### 7 상세 — 셸 자동 갱신이 삭제를 못 넘겼다
서명이 `버전/파일수/총바이트` 인데 `copyTree` 는 덧쓰기만 한다. Z: 배포본에서 파일이 하나 빠지면 설치본 파일수가 영영 많아 **매 로드 `ERROR verify` + 롤백 → 2회 뒤 `skip;why=retrylimit`** 로 그 PC 는 조용히 영구 중단됐다(셸이 안 오는 줄도 모른다).

- 서명에 **정렬된 상대경로 목록 해시**를 넣었다 — 삭제·개명이 보인다(개수·바이트만으로는 개명이 상쇄된다).
- 비교를 **src 기준**으로 바꿨다(`mesPanel_signAs`) — dst 여분이 있어도 수렴한다. 여분은 `extra=N` 으로 상태에 실어 알린다.
- **계약 유지**: `.bak-*` 양쪽 제외 · 백업은 extensions **밖** `_panel_backups` · 롤백 성패는 재서명으로 판정 · 2회 실패 중단 · extensions 아래 파일은 **지우지 않는다**.
- 부수 효과: 서명 **형식**이 바뀌어 guard 키가 달라지므로, 이미 `retrylimit` 로 멈춘 PC 도 축2 배포 후 **자동으로 재시도가 풀린다**.

---

## SKIPPED (1건)

### manifest `entity_id` 하드코딩 1 — 고치지 않았다
`designer/mes-a0-host.jsx:964`(현 `:1053`) · `designer/mes-cut-host.jsx:3141`

**리뷰가 2026-09-01 결정을 못 봤다.** `src/routes/workbench.ts:25~36` 이 이 상황을 정면으로 다루고 반대 방향으로 해결했다 — 「대기물의 법인 = 아직 없다」. 등록 시점에 귀속 법인을 아는 주체가 없으므로(디자이너는 거래처만 안다), 패널이 1 을 보내는 것을 전제로 **주문에 붙기 전까지 법인 격리를 풀고**(`waitingOpenFilter`, 7곳 사용) **흡수 시점에 주문의 법인으로 확정**한다(`absorbEntityOf`, `:796`·`:1024`).

패널이 법인을 보내게 만들면 이 결정을 되돌리게 된다. 게다가 패널은 세션이 없고 Z: 의 `config.json`(에이전트 계정 기준)만 읽으므로, 실어 보낼 값은 **디자이너의 법인도 청구 법인도 아니다**.

→ 조치 불요. 리뷰 항목 쪽이 낡았다.

---

## 게이트가 실제로 잡는지 확인 (되돌려 보기)

「고쳤다」와 「게이트가 잡는다」는 다르므로 각각 되돌려 실패를 확인했다.

| 되돌린 것 | 결과 |
|---|---|
| 「조」 단위 게이트 제거 | `FAIL 15c 묶음 행에 조 단위가 실리지 않는다 ← set,set,set` |
| SELALL 문자열 + 정규화 제거 | `FAIL 3r2 새 호스트면 실제로 호출한다 ← 호스트가 구버전(CUT-CEP-0.30.0)이라…` (리뷰가 지적한 **그 틀린 문구**를 그대로 재현) |

추가한 케이스는 소스 패턴이 아니라 **동작**을 본다: 재단 패널은 버튼을 실제로 눌러 신·구 호스트 양쪽을 확인하고, A0 패널 스텁은 `mesA0_queueRemove` 의 **실제 반환(남은 개수)** 과 params 쓰기를 모델링하도록 고쳤다.

---

## 커밋

| 해시 | 내용 |
|---|---|
| `14859250` | fix(cut-panel): host version gates were given a string, disabling two features |
| `2ec95f41` | fix(cut-host): registration manifest now carries the real save scale |
| `d4d12f7b` | fix(agent-jsx): verification that never ran, a catch that hid its own error |
| `7c5fcb8d` | fix(a0-host): shell auto-sync could not survive a deleted file |
| `9131473b` | fix(a0-panel): only shrink the queue when the host actually removed the row |
| `cf768583` | fix(designer-jsx): create sheet and copy documents in mm, not points |

버전 문자열도 규약대로 올렸다: `MESCUT_VERSION 0.30.0→0.31.0` · `MESA0_VERSION 0.5.0→0.6.0` · `SHELL_VERSION 0.70.0→0.71.0`.

---

## 배포 — 용준님이 직접 하셔야 하는 축 (여기서는 안 했습니다)

⚠️ IA 는 웹과 분리된 **수동 배포 축**이라 `git push`·`npm run deploy` 로는 반영되지 않습니다.

**축1 — 에이전트 JSX** (`SheetLayout.jsx` · `ExtractGroups.jsx` · `PackGroups.jsx`)
런타임 = **실행 중 exe 폴더**. `.csproj` 가 `CopyToOutputDirectory=Always` 라 빌드하면 따라옵니다.
```
dotnet build IllustratorAutomat/IllustratorAutomat.csproj -c Release -r win-x64
```
에이전트 실행 중이면 exe 잠김으로 빌드 실패 → 중지 후 빌드·재시작. JSX만 급히 반영하려면 `node scripts/ia-jsx-audit.cjs --sync-agent`(에이전트 재시작 불요).

**축2 — 디자이너 JSX** (`mes-cut-host.jsx` · `mes-a0-host.jsx` · `mes-sheet.jsx` · `mes-core.jsx`)
**축3 — CEP 패널 배포본** (`js/cut-main.js` · `js/main.js`)
```
npm run ia:deploy
```
⚠️ 축2 는 **Z: 1개 교체 = 전 PC 즉시 반영**입니다. `ia:deploy` 가 `--yes` 를 거부하고 실기 확인을 물으므로 **실제 터미널에서** 실행하세요. 이번 축2 변경은 등록 규격(배율)과 셸 자동갱신이라 실기 1회 확인 값어치가 큽니다 — 1/2 배율로 판 하나 등록해 대기물 규격이 **실물**로 뜨는지 보시면 됩니다.

**축4 — 패널 설치본**: 축2+축3 배포 후 `mesA0_ping()` → `mesPanel_syncShell()` 이 **스스로 따라옵니다**(PC 방문 불요). 각 PC 에서 일러 재시작만 필요합니다. 이번 수정 덕에 이미 `retrylimit` 로 멈춰 있던 PC 도 같이 풀립니다.

**축5**: 변경 없음.

배포 후 `npm run audit:ia-jsx` 로 드리프트 0 확인.
