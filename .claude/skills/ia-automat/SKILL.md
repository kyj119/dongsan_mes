---
name: ia-automat
description: IllustratorAutomat 배포 축 5개 상세 — 감사/배포 절차, 축별 런타임 경로, 패널 구조, 로그 분석. IA(JSX·CEP 패널·에이전트) 수정 후 배포할 때, 드리프트 원인을 찾을 때 사용.
---

# IllustratorAutomat 배포·진단

`$ARGUMENTS`: `deploy`(기본) → §1 · `log` → §2

> 핵심 규칙(절대 반영 안 됨·감사 필수·하드코딩 금지)은 `CLAUDE.md` 「IA 스크립트」 절이 정본.
> 이 스킬은 **그 규칙을 실행하기 위한 상세**만 담는다. 전체 절차 정본 = `docs/DEPLOY_MANUAL.md`(§3-A = 가공·재단 패널 배포).

---

## §1. 배포 축 5개

| 축 | repo | 런타임(정본) |
|---|---|---|
| 1 에이전트 JSX | `IllustratorAutomat/*.jsx` | **실행 중 exe 폴더**(`Get-Process IllustratorAutomat`). `publish\` 아님 |
| 2 디자이너 JSX | `IllustratorAutomat/designer/*.jsx` | `Z:\DESIGNS\IA-등록\_scripts\` |
| 3 CEP 패널 배포본 | `.../com.mes.a0.panel/**` | `Z:\...\_scripts\a0-panel\com.mes.a0.panel\` |
| 4 CEP 패널 설치본 | 같은 repo 원본 | `%APPDATA%\Adobe\CEP\extensions\com.mes.a0.panel` (**일러가 실제 읽는 것**) |
| 5 배포 도구 | `scripts/install-*.ps1` | `Z:\...\_scripts\` · `Z:\Designs\caps-worker\` (**디자이너가 실행하는 설치기**) |

### 절차

1. **감사** `npm run audit:ia-jsx` — 드리프트 시 exit 1. 축3은 repo 패널 폴더를 **열거**해 새 파일이 자동 편입되고, 역방향(런타임 잔재)·정본 없는 설치 스크립트도 잡는다.
2. **배포** `npm run ia:deploy` — 미커밋 IA 변경 경고 → 게이트 → 나갈 파일 확인(y/n) → 백업 → 복사 → 재감사. 대상 목록은 감사 도구(`--json`)를 그대로 쓴다(따로 적으면 둘이 갈린다).
   - 축2가 섞이면 `--yes` 여도 한 번 더 묻는다. 축1은 빌드가 반영하므로 복사하지 않는다.
   - 옵션: `--dry-run` · `--install`(축4까지) · `--sync-agent` · `--skip-gates`(비상)
3. **축3 갱신 후에는 PC별 `install-a0-panel.ps1` 재실행(축4)** — 순서 = ①축3 Z: → ②각 PC 설치. 뒤집으면 구버전이 깔린다.

### 축별 주의

- **축1**: `.csproj CopyToOutputDirectory=Always` → 빌드하면 자동 복사(빌드를 안 돌리면 미반영). JSX만 바뀌면 에이전트 재시작 불필요(잡마다 새로 읽음).
- **축2(로직)만 즉시 반영**: 패널 `jsx/host.jsx`가 스텁이라 실행 때마다 Z: 정본을 `$.evalFile` → Z: 1개 교체 = 전 PC. 백업·실기기 확인 선행, 자동 동기화 금지.
- **패널은 1개다**(2026-08-04 병합). 재단 패널 = A0 패널의 「재단」 탭 → 축3·축4가 각각 하나뿐.
  단 **호스트(축2)는 2파일 유지**: `mes-a0-host.jsx` · `mes-cut-host.jsx` — 재단만 되돌리는 롤백이 Z: 파일 1개 교체로 끝나야 한다(가공은 안 건드린다).
- **껍데기 IIFE 3개**: `main.js`(가공) + `cut-main.js`(재단) + `tabs.js`(최상위 탭). 벗기거나 DOM id 를 겹치게 만들면 조용히 서로를 덮어쓴다(겹쳤던 `out`·`ver` → `cutOut`·`cutVer`).
- **산출물 용량 감사** `npm run audit:ia-storage` — Z: work.ai/판.ai 를 첫 바이트로 판정(`%PDF-` = pdfCompatible 켜짐 = 같은 그림 2벌). 회귀만 exit 1.

### JSX 작성 규칙

- 조기 `return` 은 반드시 `_ia_status` 설정. 미설정=반환 `""` → 에이전트가 "JSX 반환 빈값(모달 의심)"이라는 **틀린 진단**을 UI에 띄운다. 실패 메시지엔 스크립트 지문(`파일@시각·해시`)이 실린다.
- `.jsx`는 `node --check` 불가(확장자+`#target`) → `sed 's/^#/\/\/#/'` 로 `.js` 사본 만들어 검사.

(2026-07-29: SheetLayout 폴백 수정이 exe 폴더에 미복사 → 모아찍기 판 렌더 6일간 실패. 상세 = memory `feedback-ia-jsx-runtime-path`)

---

## §2. 로그 분석

> ⚠️ **로그는 고정 경로가 아니다.** JSX 는 `_scriptDir`(= 자기 자신이 실행된 폴더)에 쓴다
> (`_ia_params_override_path` 가 있으면 그쪽 우선, ExtractGroups 진단은 `_diagOutputDir`).
> 즉 **축1 = 실행 중 exe 폴더**가 로그 위치다 — `Z:\...\publish\` 를 먼저 보면 남의 세대 로그를 읽는다.
> 위치 확인 = `Get-Process IllustratorAutomat | Select-Object Path`.

| 파일 | 쓰는 곳 | 내용 |
|------|------|------|
| ia_diag.log | `_diagOutputDir` → 없으면 `_scriptDir` | ExtractGroups 진단 |
| ia_error.log | `_scriptDir` | JSX 예외 (ExtractGroups·ProcessOrderItem·PackGroups·SheetLayout 공용) |
| ia_debug.log | `_scriptDir` | ProcessOrderItem 파라미터 |
| error.log | 출력 폴더(`_outputForLog`) | ExtractGroups 출력 단계 예외 |

각 파일의 **마지막 100줄**만 Read.

- **에러 패턴**: "error", "fail", "exception", "warning" 추출
- **최근 주문**: `\d{8}-\d{3}` 패턴 추출
- **마지막 실행**: 타임스탬프 기준 최근 엔트리
