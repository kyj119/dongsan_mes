# 세션 핸드오프 — IA 편집기 세션루프 v2 (팔레트·반자동 큐) 설계 spec + A0 PoC (2026-07-23)

> 세션별 덮어쓰기 파일. durable 내용은 [[project-ia-designer-loop]]·[[project-ia-web-sunset]]·[[project-ia-editor]]에 보존.

## 이 세션 = 브레인스토밍·문서화만 (코드 변경/배포 없음)
IA 편집기의 일러 JSX "선택→실행" 방식 심층 고찰 → 세션루프 UX 전반 재설계 spec 신규 작성 + 3차 검토 반영 + **Phase A0 PoC 산출물** 생성. **prod·에이전트·마이그 무변경.**

## 산출물
| 종류 | 경로 |
|---|---|
| **정본 spec** | `docs/superpowers/specs/2026-07-23-ia-palette-session-loop.md` (D1~D9·기능표 A/B/C/D·흐름·Phase·리스크) |
| **A0 PoC** | `IllustratorAutomat/designer/poc-a0/` (a0-dock-palette.jsx·a0-roster.json·a0-canvas-probe.jsx·README-a0.md) — node --check 3/3 통과 |
| **별건 task** | Task #1 = 사용자 하드 삭제(참조 0건 가드, FK 위험) — IA와 무관·미착수 |

## 확정 결정 (spec D1~D9 요약)
- **D1 폼 = ScriptUI 도킹 팔레트**(네트워크 불요→HTTPS 명분 없음, 저리스크). CEP는 큐 UI 답답 시 승격만.
- **D2 다중 디자인 = 반자동 큐**(사람 선택 + ExtractGroups 자동감지 '첫 제안 시드'). 혼합 컨테이너(마스크/아트보드/그룹)라 단독 자동은 '추출 부정확' 재발.
- **D3 큐 교정 = 삭제·추가만**(병합/분할=네스팅 영역).
- **D4 검토 = 일러 검토문서(디자인당 아트보드) + 확정 게이트**. 확정 시에만 EPS 배치 저장(프리즈 완화).
- **D5 거래처 = 단일입력+상속**(가공 시 1회 자동완성→주문 상속, clients.id 해소).
- **D6 대기물 = 작업(원본 파일 batch_key) 그룹핑 + "내 작업"=MES 로그인 유저(registered_by)**.
- **D7 오퍼레이터 = 기존 카드/생산+/ship에 카드상태 대기열+Z:경로 얹기**(신규 화면 최소).
- **D8 파일 = 건별 폴더 SSOT, 취소해도 유지, _출력 중복 제거(C 시)**.
- **D9 성능 = 확정 후 배치 저장**.

## 판단 기준 (이 세션 근거)
- 파일 선행 지배(가공 시 주문 대개 없음) → 연동은 가공→대기함→주문 프리필 방향(주문 선택 UI 폐기).
- 자동 감지는 부정확(과거 헤드리스 폐기 사유) → 사람-루프 유지, 자동은 '시드'로만.
- 정밀 검토는 일러 캔버스가 최선 → 전용 패널(CEP) 불요, ScriptUI로 충분.
- 저리스크 우선(용준님 도착점) → A→C 병렬, D는 후속.

## 검토 3회 반영분 (spec에 모두 패치됨)
- 1차 설계공백: 배치 검토 방식·"내 작업" 신원·거래처 client_id 해소.
- 2차 코드결함 A~F: **검토문서 대지 한도(~577cm)→size-aware 순차 폴백**·**EPS 파일명 충돌→디자인 index**·**그룹핑 키=batch_key(≠memo, memo는 per-run 유니크 `mes-core.jsx:314`)**·배치 부분실패 멱등·**상주 도킹=Startup Scripts 설치**·registered_by=user id.
- 3차 G~K: **원본 불가침(시드 감지는 read-only, ExtractGroups CMYK/아웃라인 `:216-228` 제외)**·**배치 흡수=order_item_id 매핑(`workbench.ts:1268`, bulk `:1252` 부적합)**·**브랜치 정합(mes-sheet P1a clobber 주의)**·NAS 타이밍·모드 분리(큐=단일출력).

## ⚠️ 주의사항
- **ScriptUI 도킹은 미검증** — A0 PoC가 바로 그걸 검증(Go→A1 / No-go→CEP). 반드시 **디자이너 최신 일러**에서.
- **한글 리터럴 = UTF-8 BOM 필수**(mes-core 관례). PoC는 회피 위해 한글을 roster.json에서 로드.
- **브랜치**: 현 체크아웃 **main**(=origin/main 계열). mes-sheet(판짜기) P1a·크래시픽스(`31c88d00`)는 `session/ia-web-sunset` 워크트리에만 있고 **main 미머지**(실측 후 push 예정) → A-track은 **판짜기 무수정(런처만)** + 착수 전 정합.
- **4인 MES 계정 매핑** — "내 작업" 성립 전제(용준님 계정 생성 완료했다 함, 매핑 확인은 구현 시).
- spec·PoC는 **미커밋 상태**(untracked). 커밋 시 경로지정 add(타 세션 WIP 스윕 금지).

## 진행 업데이트 (2026-07-23 이어서, 커밋 `baf20532`)
- **④ 대지 한도 = 577cm 실측 확정**(Claude MCP·AI 2026/30.3.0, 578 FAIL, `documents.add`). spec §6 확증.
- **`a0-canvas-probe.jsx` 결함 수정**: 모서리고정 `[0,0,w,-w]`이 캔버스 좌표범위(초기 문서크기 의존)에 걸려 200cm 오보고 → `documents.add(목표크기)` 방식으로 교정. **교훈=검토문서 생성기는 작은 기본문서 리사이즈 금지·목표크기 생성 필수.**
- **`mes-a0-startup.jsx` 스텁 신규**: ③ 도킹 검증 턴키화(Startup Scripts 로더, File.exists 가드). README 판정표·절차 갱신.
- ①② 데이터계층=mes-core 동일 패턴 저리스크(MCP Window 인스턴스화 시 COM 끊김 확인 → 실 도킹은 디자이너 몫 확정).
- **남은 = ③ 상주 도킹 Go/No-go만** — 디자이너 최신 일러에서 스텁 복사→재시작→육안. 자율 불가.

## A0 → CEP 승격 (2026-07-23 이어서, 실기 검증 완료)
- **③ ScriptUI 도킹 = No-go 확정**: 자동실행·표시는 성공(단 **`#targetengine` 필수** + **Startup 폴더=설치 디렉터리 루트**, Plug-ins 하위 아님 = 경로버그 확정)했으나, **ScriptUI palette가 일러 네이티브 도킹 실패**(플로팅·창 뒤로 감·조작난). 실기(일러 2026/30.3.0)에서 사용자 직접 확인.
- **→ CEP 승격 실행(spec §8)**: `IllustratorAutomat/designer/poc-a0-cep/com.mes.a0.panel/` — **네이티브 도킹 CEP 패널(A1 사용가능 수준)**. 에이전트가 스켈레톤 생성(`69b61ac1`)→**mes-core 실처리 연결로 업그레이드**(가공자 신원·마감/프리셋(Z config)·실측·수량/배율/용도·돔보·거래처·**[가공 실행]→work.ai+EPS+thumb+manifest**). host.jsx=mes-core 전 로직 포팅, **manifest 스키마 동일**(+worker/source). 한글=cep.fs(UTF-8)·evalScript는 ASCII만.
- **설치 완료(이 PC)**: `%APPDATA%\Adobe\CEP\extensions\com.mes.a0.panel\` + PlayerDebugMode CSXS 10/11/12=1. 일러 2026=CEP 12(CSXS.12). 검증=node --check 3/3·XML 유효.
- **⚠️ 미검증**: 패널 실기동(Window>Extensions>MES A0 Panel)·네이티브 도킹·실 가공 E2E(한글 인코딩·EPS 규약명·ingest source='cep')는 **일러 재시작 후 사용자/디자이너 확인 필요**(MCP는 CEP UI 검증 불가).

## 다음 세션 TODO
1. **CEP 패널 실기 테스트**(일러 재시작): Window>Extensions>MES A0 Panel → 도킹 드래그 → 가공자 선택 → 객체 선택·실측 → [가공 실행] → Z: 산출물+대기함 E2E. 판정 Go→A1 지속.
2. Go 시 A1 잔여: **검토문서(아트보드)+확정게이트**·**거래처 자동완성**(clients config 재도입)·**가공자↔MES user id 매핑**(registered_by_id).
3. No-go/이슈 시: `.debug` 포트 8888(Chrome localhost:8888)로 콘솔 디버그.
2. Go → **Phase A1 착수**(worktree 격리): 팔레트 골격+거래처 자동완성+검토문서/확정게이트+저장 SSOT.
3. No-go → CEP 승격으로 A1 재설계.
4. (병렬) C 오퍼레이터 = 기존 생산/카드+/ship 확장 스코핑.
5. 4인 MES 계정↔디자이너 역할 매핑 확인.

## 검증/빌드 명령 (참고)
- 코드 미변경이라 build 불요. spec/PoC만. (A1 착수 시) `npm run verify` → `npm run build && npm run smoke`.
- PoC 문법: `node --check`(#target 제외) 통과 확인함.
