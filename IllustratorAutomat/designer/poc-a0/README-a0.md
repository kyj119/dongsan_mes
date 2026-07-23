# Phase A0 PoC — ScriptUI 상주 도킹 검증

**목적**: IA 팔레트(ScriptUI) 방향의 최대 리스크 = "디자이너 일러에서 팔레트가 실제로 **상주 도킹**되는가"를 A1 착수 전 검증.
**spec**: `docs/superpowers/specs/2026-07-23-ia-palette-session-loop.md` §Phase A0
**성격**: throwaway PoC. prod 무관·설치만(되돌릴 것 없음). **반드시 디자이너의 최신 일러에서** 실행(버전별 quirk).

## 파일
| 파일 | 용도 |
|---|---|
| `a0-dock-palette.jsx` | 도킹 팔레트 본체(가공자 드롭다운·로컬 영속·더미 버튼) |
| `a0-roster.json` | 가공자 roster(인호동·김보연·정소은·김영주) — 팔레트가 UTF-8로 로드 |
| `a0-canvas-probe.jsx` | 대지/아트보드 크기 한도 실측 + 타일 폴백 경계 |

## 검증 절차

### ① 팔레트 실행 (플로팅 먼저)
1. 일러 실행 → `File > Scripts > Other Script (Ctrl+F12)` → `a0-dock-palette.jsx` 선택.
2. **Pass**: 팔레트 창이 뜨고, 드롭다운에 4명 표시, 버튼 클릭 시 alert.

### ② 로컬 영속
1. 드롭다운에서 본인 선택 → 팔레트 닫기 → ①을 다시 실행.
2. **Pass**: "persisted: <선택한 이름>" 표시(선택이 유지됨). 저장 위치 = `%APPDATA%\...\mes_a0_palette.txt`.

### ③ 상주 도킹 (핵심 — Startup Scripts 모델)
> ScriptUI 팔레트는 **Startup Scripts 폴더에서 로드돼야** 일러 UI에 도킹된다(F키/Other Script 실행 시엔 플로팅).
1. 일러 설치 폴더의 `Plug-ins\Startup Scripts\` 에 아래 스텁을 `mes-a0-startup.jsx`로 저장:
   ```
   #target illustrator
   $.evalFile(new File("<이 폴더 절대경로>/a0-dock-palette.jsx"));
   ```
   (NAS 정본 검증까지 하려면 `Z:\DESIGNS\IA-등록\_scripts\...` 경로로 지정 → ⑤)
2. **일러 완전 종료 후 재시작.**
3. **Pass**: 재시작 시 팔레트가 **자동으로 뜨고 다른 패널 옆에 도킹**됨(드래그로 패널 독에 붙일 수 있음).
   **Fail(플로팅만/미표시)**: ScriptUI 도킹 불가 → **CEP 승격** 결정(spec §8).

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
| ③ 상주 도킹 | 재시작 후 자동 도킹 | ☐ |
| ② 로컬 영속 | 선택 유지 | ☐ |
| ①/②③ roster | 4명 표시 | ☐ |
| ④ 대지 한도 | max cm 실측값 기록 | ☐ (____ cm) |

- **③ Pass** → A1 착수.
- **③ Fail** → CEP 승격으로 A1 재설계(네트워크 불요 유지).

## 정리(테스트 후)
- Startup Scripts의 `mes-a0-startup.jsx` 제거 + 일러 재시작(팔레트 미표시 확인).
- 로컬 `mes_a0_palette.txt` / `mes_a0_canvas.log` 삭제(선택).
