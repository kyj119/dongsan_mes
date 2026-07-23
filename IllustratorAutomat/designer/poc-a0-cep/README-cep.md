# CEP A0 PoC — Illustrator 도킹 패널 검증

**목적**: ScriptUI 팔레트(`poc-a0/`)가 상주 도킹에 실패할 경우의 fallback. CEP 패널은
Illustrator 패널 독에 **네이티브로** 도킹 가능 — 이것이 검증 대상.
**spec**: `docs/superpowers/specs/2026-07-23-ia-palette-session-loop.md` §Phase A0
**성격**: throwaway PoC. prod 무관. host id = `ILST`(Illustrator).

## 파일
| 파일 | 용도 |
|---|---|
| `com.mes.a0.panel/CSXS/manifest.xml` | CEP 익스텐션 매니페스트 (ExtensionBundleId, Host, UI 지오메트리) |
| `com.mes.a0.panel/index.html` | 패널 UI (가공자 드롭다운·저장됨 표시·테스트 버튼 2개) |
| `com.mes.a0.panel/css/style.css` | 일러스트레이터 다크 UI에 맞춘 최소 스타일 |
| `com.mes.a0.panel/js/CSInterface.js` | `window.__adobe_cep__` 위 최소 자체 shim (네트워크 의존 없음) |
| `com.mes.a0.panel/js/main.js` | roster 4명 + localStorage 영속 + 버튼 핸들러 |
| `com.mes.a0.panel/jsx/host.jsx` | ExtendScript 호스트 (`mesA0_getDocInfo()`) |
| `com.mes.a0.panel/.debug` | 원격 디버깅(포트 8888) 활성화 |

## 설치
`com.mes.a0.panel` 폴더 전체를 아래 경로로 복사(사용자 레벨, 관리자 권한 불요, 일러 업데이트에도 유지):

```
%APPDATA%\Adobe\CEP\extensions\com.mes.a0.panel\
```

즉 최종 구조:
```
%APPDATA%\Adobe\CEP\extensions\com.mes.a0.panel\CSXS\manifest.xml
%APPDATA%\Adobe\CEP\extensions\com.mes.a0.panel\index.html
%APPDATA%\Adobe\CEP\extensions\com.mes.a0.panel\css\style.css
%APPDATA%\Adobe\CEP\extensions\com.mes.a0.panel\js\CSInterface.js
%APPDATA%\Adobe\CEP\extensions\com.mes.a0.panel\js\main.js
%APPDATA%\Adobe\CEP\extensions\com.mes.a0.panel\jsx\host.jsx
%APPDATA%\Adobe\CEP\extensions\com.mes.a0.panel\.debug
```

## 서명되지 않은 익스텐션 허용 (필수)
CEP는 기본적으로 서명된 익스텐션만 로드한다. 레지스트리에 `PlayerDebugMode`를 설정해야
이 PoC(미서명)가 로드된다. Illustrator 2026이 CSXS 11 또는 12 중 무엇을 쓰는지 버전마다
다를 수 있으므로 **둘 다** 설정 권장:

```
HKCU\Software\Adobe\CSXS.11\PlayerDebugMode = "1"  (문자열 값)
HKCU\Software\Adobe\CSXS.12\PlayerDebugMode = "1"  (문자열 값)
```

설정 후 **Illustrator 완전 재시작** 필요.

> 이 레지스트리 변경과 %APPDATA% 설치는 부모 세션(환경 소유)이 수행한다. 이 작업 폴더는
> 리포에 파일만 작성한다 — 설치/레지스트리 변경은 하지 않았다.

## 테스트 절차
1. Illustrator 재시작.
2. `Window > Extensions > MES A0 Panel` → 패널이 뜨는지 확인.
3. **패널 탭을 다른 패널 독으로 드래그하여 네이티브 도킹 확인** (핵심 판정 항목).
4. 가공자 드롭다운에서 이름 선택 → "저장됨: &lt;이름&gt;" 갱신 확인.
5. `process (test)` 클릭 → `#out`에 `process OK / worker=... / doc=...` 표시 확인
   (ExtendScript `mesA0_getDocInfo()` 왕복 확인 — 문서 없으면 `doc=(none)`).
6. `sheet (test)` 클릭 → `#out`에 `sheet OK` 표시 확인.
7. Illustrator를 완전히 재시작 → 패널을 다시 열고 드롭다운 선택이 **영속**되는지 확인
   (localStorage는 Illustrator 재시작에도 유지됨 — ScriptUI 로컬 파일 영속의 CEP 네이티브 대응).

## 판정
- **네이티브 도킹 + 인터랙티브 + 영속 = CEP Go** → A1을 CEP 패널로 채택.
- 도킹 실패/불안정 → 추가 조사 필요(추정상 CEP는 사실상 항상 도킹 가능하므로 이 경로는 낮은 확률).

## 정리 (테스트 후 삭제)
```
%APPDATA%\Adobe\CEP\extensions\com.mes.a0.panel\
```
폴더를 삭제하면 제거 완료(레지스트리 `PlayerDebugMode`는 다른 미서명 익스텐션 개발에도
공용으로 쓰이므로 보존해도 무방 — 되돌리려면 값 삭제 또는 `"0"`으로 변경).

---
throwaway PoC, prod 무관.
