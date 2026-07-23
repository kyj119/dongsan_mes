# Phase A0 PoC — ScriptUI 상주 도킹 검증

**목적**: IA 팔레트(ScriptUI) 방향의 최대 리스크 = "디자이너 일러에서 팔레트가 실제로 **상주 도킹**되는가"를 A1 착수 전 검증.
**spec**: `docs/superpowers/specs/2026-07-23-ia-palette-session-loop.md` §Phase A0
**성격**: throwaway PoC. prod 무관·설치만(되돌릴 것 없음). **반드시 디자이너의 최신 일러에서** 실행(버전별 quirk).

> **선검증 (2026-07-23, Claude MCP · Illustrator 2026/30.3.0)** — 머신·버전 무관 항목은 사전 실측 완료:
> - **④ 대지 한도 = 577cm 확정**(578cm FAIL, `documents.add` 경로). spec §6 "~577cm/227in" 확증.
> - 원본 `a0-canvas-probe.jsx`가 **200cm를 오보고**하던 방법론 결함 발견·수정(모서리 고정→documents.add). ⇒ 검토문서 생성기는 작은 기본문서 리사이즈 금지, **목표크기로 문서 생성** 필수.
> - ①② 데이터 계층(한글 roster 로드·로컬 영속)은 mes-core와 동일 검증 패턴이라 저리스크(MCP는 Window 인스턴스화에서 COM 끊김 → 실 도킹은 어차피 디자이너 몫).
> - **★핵심 quirk 발견(2026-07-23)**: ScriptUI **palette**는 **`#targetengine "MES_A0"` 없으면 스크립트 종료 시 파괴돼 즉시 사라짐**(startup 로드/Ctrl+F12 모두 아무것도 안 뜸). 팔레트 본체·스텁 양쪽 최상단에 지시자 추가 + `$.global` 참조 유지로 해결.
> - **★Startup 경로 버그 확정**: 자동실행 폴더는 **설치 디렉터리 루트 `Startup Scripts\`**(Plug-ins 하위 아님). Plug-ins 하위에 두면 실행 안 됨(디버그 alert조차 미발화로 확인).
> - **★③ 상주 도킹 = No-go(2026-07-23)**: 루트 Startup으로 자동실행·팔레트 표시는 성공했으나 **ScriptUI palette가 일러 내부 네이티브 도킹 실패**(플로팅·창 뒤로 감·조작 곤란). → spec §8 **CEP 승격 실행**. 후속 정본 = `../poc-a0-cep/`(네이티브 도킹 CEP 패널, mes-core 처리 연결).

## 파일
| 파일 | 용도 |
|---|---|
| `a0-dock-palette.jsx` | 도킹 팔레트 본체(가공자 드롭다운·로컬 영속·더미 버튼) |
| `a0-roster.json` | 가공자 roster(인호동·김보연·정소은·김영주) — 팔레트가 UTF-8로 로드 |
| `a0-canvas-probe.jsx` | 대지/문서 크기 한도 실측 + 타일 폴백 경계 (documents.add 방식, 577cm) |
| `mes-a0-startup.jsx` | ③ 도킹 검증용 Startup Scripts 로더 스텁 (경로 1줄만 수정) |

## 검증 절차

### ① 팔레트 실행 (플로팅 먼저)
1. 일러 실행 → `File > Scripts > Other Script (Ctrl+F12)` → `a0-dock-palette.jsx` 선택.
2. **Pass**: 팔레트 창이 뜨고, 드롭다운에 4명 표시, 버튼 클릭 시 alert.

### ② 로컬 영속
1. 드롭다운에서 본인 선택 → 팔레트 닫기 → ①을 다시 실행.
2. **Pass**: "persisted: <선택한 이름>" 표시(선택이 유지됨). 저장 위치 = `%APPDATA%\...\mes_a0_palette.txt`.

### ③ 상주 도킹 (핵심 — Startup Scripts 모델)
> ScriptUI 팔레트는 **Startup Scripts 폴더에서 로드돼야** 일러 UI에 도킹된다(F키/Other Script 실행 시엔 플로팅).
1. 제공된 **`mes-a0-startup.jsx`**(이 폴더) 를 **일러 설치 디렉터리 루트**의 `Startup Scripts\` 에 복사. ⚠️ **`Plug-ins\` 하위 아님**(Adobe 공식: 설치 디렉터리 직하에 폴더 생성) — 예: `C:\Program Files\Adobe\Adobe Illustrator 2026\Startup Scripts\`.
   - 스텁 안 `jsxPath` 1줄만 이 폴더의 실제 절대경로로 수정(이미 로컬 경로 기본값 있음).
   - `File.exists` 가드 내장(Z: 미마운트 시 조용히 skip, spec §6 리스크 J).
   - (NAS 정본 검증까지 하려면 스텁 안 주석대로 `Z:\DESIGNS\IA-등록\_scripts\...` 경로로 교체 → ⑤)
2. **일러 완전 종료 후 재시작.**
3. **Pass**: 재시작 시 팔레트가 **자동으로 뜨고 다른 패널 옆에 도킹**됨(드래그로 패널 독에 붙일 수 있음).
   **Fail(플로팅만/미표시)**: ScriptUI 도킹 불가 → **CEP 승격** 결정(spec §8).
   > ⚠️ **아무것도 안 뜨면**: ① 팔레트 본체·스텁에 `#targetengine "MES_A0"` 있는지(없으면 창 즉시 소멸) ② 스텁 `jsxPath`가 실제 파일 경로인지(스텁 debug alert가 경로/오류를 표면화) ③ 일러를 **완전 종료** 후 재시작했는지(문서만 닫으면 startup 재로드 안 됨).

### ④ 대지 한도 실측
1. `Ctrl+F12` → `a0-canvas-probe.jsx` 실행.
2. alert/로그(`%APPDATA%\...\mes_a0_canvas.log`)에서 **single-artboard max cm** 와 **300cm 디자인의 타일 폴백 경계** 확인.
3. 이 값이 spec D4의 "합산 타일 한도 초과 시 순차 폴백" 임계 근거가 됨.

### ⑤ NAS 업데이트 모델 (선택)
- 스텁을 `$.evalFile(Z:\DESIGNS\IA-등록\_scripts\a0-dock-palette.jsx)` 로 두고, NAS의 jsx만 수정 → 재시작 시 반영되면 **재설치 없는 중앙 업데이트** 확인(현 mes-core evalFile 장점 유지).
- ⚠️ 일러 실행 시점에 **Z: 미마운트면 로드 실패**(spec §6 리스크 J) — 스텁에 `File.exists` 가드 권장.

## 판정 (Go / No-go)
| 항목 | Pass 기준 | 결과 |
|---|---|---|
| ③ 상주 도킹 | 재시작 후 자동 도킹 | ☐ (디자이너 판정 대기 — 핵심) |
| ② 로컬 영속 | 선택 유지 | ☐ (디자이너 육안) |
| ①/②③ roster | 4명 표시 | ☐ (디자이너 육안) |
| ④ 대지 한도 | max cm 실측값 기록 | ✅ **577cm** (AI 2026/30.3.0 실측, 578 FAIL·documents.add) |

- **③ Pass** → A1 착수.
- **③ Fail** → CEP 승격으로 A1 재설계(네트워크 불요 유지).

## 정리(테스트 후)
- Startup Scripts의 `mes-a0-startup.jsx` 제거 + 일러 재시작(팔레트 미표시 확인).
- 로컬 `mes_a0_palette.txt` / `mes_a0_canvas.log` 삭제(선택).
