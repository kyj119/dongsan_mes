# 세션 인계 — 2026-09-11

## 이번 세션이 한 일 (커밋 `2f84b8a4` · **IA 배포 완료 09-11** — 축2/3/4 드리프트 0, 재시작 후 호스트 0.12.0·셸 0.19.0·플래그·주석 검토모드 재검증)

용준님 보고 「일러 패널 주석이 안 나온다 · 내용칸에 한글이 안 들어가고 좌상단에 글자가 뜬다」 → **다른 결함 둘**로 갈라 각각 원인을 잡고 실기 검증까지 끝냈다.

| 결함 | 원인 | 조치 | 검증 |
|---|---|---|---|
| 한글 IME 좌상단 박스 | CEP 12(CEF 99)의 `TSFImeSupport` 기본 ON — Adobe CEP-3029 미수정. CEP 10(CEF 74)은 OFF 라 정상이었다 | `manifest.xml` `--disable-features=TSFImeSupport` 1줄 | 이 PC 실키 입력: composition 이벤트 발생·조합 중 `value="한"`·좌상단 박스 없음 |
| 주석 소실 | `bL~bB` 가 `if (P.border_line !== false)` 안에 선언 → 경계선 OFF(08-06 기본값)면 NaN → 빈 catch 가 삼킴 | 호스트 0.12.0: 선언 밖으로 + `annotation_error`/warn `A` · 패널 0.19.0 문구 정정 · 게이트 7e | 검토모드 A/B: 0.11.0 밴드 0개(좌표불량 2) → 0.12.0 상1·하1 |

경위 전문 = `.claude/PROJECT_STATUS_ARCHIVE.md` §2026-09-11 · 메모리 `feedback-cep12-korean-ime-tsf`.

## 다음 세션 TODO

1. ~~`npm run ia:deploy`~~ 완료(09-11). 이 PC 는 재시작·재검증까지 끝. 한글 실키 재검증만 사람 타이핑으로 닫는다(다른 터미널이 패널 위에 있어 자동 클릭 불가).
2. 배포 뒤 전 디자이너 PC: 패널 열면 축4 자동갱신 → **일러 완전 재시작**(manifest 는 시작 때만 읽는다). 「패널만 닫았다 열기」로는 IME 플래그가 안 붙는다.
3. 재시작 뒤 디자이너에게 한글 타이핑·주석(경계선 OFF 상태) 1건씩 확인 받기 — 성공 기준 = 조합 중 글자가 칸 안에 보인다 · 주석이 상/하 여백에 찍힌다.
4. 이 PC 축4 설치본은 검증용으로 manifest 만 먼저 바꿔 둔 상태(백업 `%APPDATA%\Adobe\CEP\extensions\com.mes.a0.panel\CSXS\manifest.xml.bak-tsf-20260911`). 배포 후 자동갱신이 덮으므로 손댈 것 없음.
5. 직전 세션 흐름(발주→입고→검수 원단 2주 테스트, 담당 용준님/강지영)은 그대로 진행 중 — 2주 뒤 숫자로 규정 확정.

## 판단 기준·주의

- **IME 검증은 진짜 키로만** — CDP `Input.imeSetComposition` 은 OS IME 아래층이라 반증도 입증도 안 된다. 세션 scratchpad 의 `typing.ps1` 방식(`SetForegroundWindow`+클릭+`keybd_event`, 입력칸 리스너를 CDP 로 읽기).
- **`$.evalFile` 핫스왑은 evalScript 문자열 최상위에서** — IIFE 안에서 부르면 「loaded 0.12.0」이라 답하고도 전역은 옛 버전이다(이번에 한 번 속았다).
- **manifest 에 값이 있다 ≠ 그려졌다** — 주석은 `annotation` 값이 멀쩡히 기록된 채 산출물에서만 빠져 있었다. 산출물을 세는 검증(검토모드 + `mesA0_reviewPlace` 가로채기, Z: 부작용 0)이 정답이었다.
- 일러 재시작 때 미저장 문서가 있으면 「저장하시겠습니까」 대화상자(DroverLord, 텍스트 못 읽음)가 종료를 막는다 — `PrintWindow` 로 캡처해 읽고 좌표 클릭. 이번엔 사본을 `Downloads\*-autosave-20260911.ai` 로 먼저 저장했다.

## 검증 명령 (PowerShell)

```powershell
npm run panel:smoke        # 192/192 (7e 포함)
npm run audit:ia-jsx       # 배포 전 = 드리프트 3건(호스트·main.js·manifest)이 정상, 배포 후 0
node scripts/doc-diet-audit.cjs
```
