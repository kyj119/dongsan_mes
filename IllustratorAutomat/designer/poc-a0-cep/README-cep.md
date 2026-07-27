# MES A0 — CEP 도킹 패널 (ScriptUI 도킹 승격)

**성격**: A0 PoC 후속. ScriptUI palette가 일러 2026에서 **네이티브 도킹 실패**(플로팅·뒤로 감·조작난) → spec §8 "CEP 승격" 실행. 이 패널은 **일러 내부에 네이티브 도킹**되고 조작 정상.
**spec**: `docs/superpowers/specs/2026-07-23-ia-palette-session-loop.md` (D1 CEP 승격 · Phase A1)
**호스트**: Illustrator (ILST) · CEP 12(일러 2026, CSXS.12 확인).

## 무엇이 되는가 (A1 사용가능 수준)
기존 `mes-core.jsx`(프로덕션 가공 로직)를 **CEP 패널에서 파라미터로 호출** — ScriptUI 다이얼로그를 네이티브 도킹 HTML 폼으로 대체:
- **가공자 드롭다운**(인호동·김보연·정소은·김영주) + **localStorage 영속**(재시작 유지 = 신원 태깅, spec §3.5)
- **실측**(현재 선택 객체 크기, 배율 연동 실물환산)
- **수량 · 파일 배율(1/N) · 용도(단건/모아찍기/둘다)**
- **마감** 4면(방식+cm) + **프리셋**(Z: `_config/config.json`에서 실데이터 로드) + **돔보**
- **거래처**(free-text — clients 리스트 미도입 상태, spec §5 B단계)
- **직전값 기억**(localStorage)
- **[가공 실행]** → 복제문서 가공 → work.ai + EPS(규약명) + thumb + **manifest(커밋마커)** 를 `Z:\DESIGNS\IA-등록\<건별폴더>`에 저장 → 에이전트 ingest → 대기함
- **manifest 스키마 = mes-core와 동일**(+worker_name/worker_id/source 추가) → 기존 ingest·대기함 계약 불변
- **큐 행↔폼 연동 (A안, 2026-07-27)**: 순서=`묶음분리로 분해 → 행 클릭(연동) → 가공·후가공 탭에서 행별 세팅 → 일괄 확정`. 행 클릭 시 그 행의 params가 폼에 로드되고, 폼 수정이 그 행에만 반영(post_desc·주석 게이트 행별 재계산). [전체 적용]=현재 폼 설정을 모든 행에(수량·키워드·거래처는 행값 유지). 행 다시 클릭=해제.

> 한글 인코딩 안전설계: config·params는 **cep.fs(UTF-8)** 로만 오가고, evalScript 인자/반환은 **ASCII(경로·상태코드)만** → CEP 브릿지 한글 깨짐 회피.

## 설치 (이 PC엔 이미 적용됨 — 다른 PC는 아래대로)
1. `com.mes.a0.panel` 폴더를 아래로 복사(사용자 폴더 — 관리자 불요·일러 업데이트에도 생존):
   ```
   %APPDATA%\Adobe\CEP\extensions\com.mes.a0.panel\
   (= C:\Users\<user>\AppData\Roaming\Adobe\CEP\extensions\com.mes.a0.panel\)
   ```
2. **미서명 확장 허용** — 레지스트리 `PlayerDebugMode="1"`(String):
   ```
   HKCU\Software\Adobe\CSXS.12\PlayerDebugMode = "1"   (일러 2026)
   (호환 위해 CSXS.10/11도 함께 두면 무해)
   ```
3. 일러 **완전 종료 후 재시작**.

> 이 PC(개발기)엔 부모 세션이 설치+레지스트리(10/11/12)까지 적용 완료.

## 테스트 (사용가능 판정)
1. 일러 재시작 → **Window(창) > Extensions(확장) > MES A0 Panel** 클릭 → 패널이 뜬다.
2. **패널 탭을 다른 패널 독으로 드래그** → **네이티브 도킹되는지 확인**(ScriptUI가 못하던 것). ✅=CEP Go.
3. 가공자 선택(재시작해도 유지되는지) → 디자인 객체 선택 → `↻`로 실측 확인.
4. 수량/배율/마감/용도 지정 → **[가공 실행]** →
   - 완료 메시지(실물 크기·EPS명·건별폴더) 확인
   - `Z:\DESIGNS\IA-등록\<폴더>`에 work.ai·EPS·thumb.png·manifest.json 생성 확인
   - 에이전트 ingest 후 MES 대기함에 뜨는지 확인
5. **판정**: 도킹 ✓ + 실측·가공 동작 ✓ + 신원 영속 ✓ → **CEP 채택(A1 진행)**.

## 디버깅 (선택)
`.debug`로 포트 8888 원격 디버그 — Chrome에서 `http://localhost:8888` 접속(패널 열린 상태). 콘솔 오류 확인용.

## 정리(제거)
`%APPDATA%\Adobe\CEP\extensions\com.mes.a0.panel` 폴더 삭제 + 일러 재시작. (레지스트리 PlayerDebugMode는 타 미서명 확장 개발 공용이라 보존 무방.)

## 파일
| 파일 | 용도 |
|---|---|
| `CSXS/manifest.xml` | CEP 매니페스트(ILST·Panel·도킹) |
| `index.html` | 패널 폼 |
| `css/style.css` | 일러 다크 테마 |
| `js/CSInterface.js` | 최소 CEP 브릿지 shim(공식 SDK 아님) |
| `js/main.js` | 폼 로직·config 로드·가공 실행 |
| `jsx/host.jsx` | ExtendScript 호스트 = **mes-core 처리 포팅**(ping/config/measure/process) |
| `.debug` | 원격 디버그 포트 |

## 남은 것(후속)
- **가공자↔MES user id 매핑**(registered_by_id, spec §3.5·B단계) — 현재 worker_name만, id는 null.
- **거래처 자동완성**(clients 리스트 config 재도입, spec §5) — 현재 free-text.
- ~~반자동 큐(A2) 행별 세팅~~ → **완료(행↔폼 연동)**. 남은 A2/A3=자동감지 시드·검토문서 확정게이트(A1 후반).
- ⚠️ 큐 항목은 라이브 문서 참조 — 행별 세팅으로 확정까지 시간이 길어지면 원본 문서를 닫지 말 것(확정 시 `stale`/`docgone`).
- 실사용 검증: 실제 디자인으로 [가공 실행] → 대기함까지 E2E(한글 인코딩·EPS 규약명·ingest source='cep' 인식).
