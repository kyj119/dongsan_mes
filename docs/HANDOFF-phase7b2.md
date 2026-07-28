# 인계 — Phase 7b-2: ia-editor '파일 처리' 뷰 제거

> 작성 2026-07-28. IA 진입점 통합의 **마지막 단계**. 앞 단계(Phase 1~6·7a·7b-1)는 전부 prod 배포 완료.
> 정본 메모리 = [[project-ia-web-sunset]] · 세션 핸드오프 = `memory/session-context.md`

## 다음 세션에 붙여넣을 프롬프트

```
ia-editor의 '파일 처리' 뷰를 제거해줘 (Phase 7b-2).
docs/HANDOFF-phase7b2.md 를 먼저 읽고, 거기 적힌 위험과 검증 절차를 그대로 따라줘.
```

---

## 왜 하는가

A0 패널이 **소스 공급을 이미 대체**했다. prod `ai_analysis_requests` 경로별 집계:

| 경로 | 건수 | 처음 | 마지막 |
|---|---|---|---|
| 패널/JSX 등록 (`Z:\DESIGNS\IA-등록`) | 25 | 2026-07-16 | **2026-07-28** |
| 웹 업로드 (에이전트 temp) | 25 | 2026-06-25 | **2026-07-16** |
| R2 업로드 | 5 | 2026-07-15 | 2026-07-16 |
| NAS에서 분석 | 1 | 2026-07-16 | 2026-07-16 |

**07-16 기점으로 경로가 통째로 전환**됐다. 단순 미사용이 아니라 대체 정황.
사용자 결정 = **완전 제거**(플래그 숨김 아님, 2026-07-28).

## 무엇을 제거하고 무엇을 남기는가

`src/pages/iaEditor.ts` `#iaeEditView` 안에서:

| 요소 | 처리 | 근거 |
|---|---|---|
`#iaeDrop` + `#iaeFileInput` (업로드) | **제거** | 패널이 대체 |
`#iaeNasBtn` + `#iaeNasPanel` (NAS에서 분석) | **제거** | 07-16 이후 1건, 그 이후 0 |
인스펙터 설정 폼 (목표크기·마감·돔보·회전·저장스케일) | **제거** | `iaeSettings` 소비자 = 인스펙터 자신 + `iaeApplyActiveToAll` 뿐. **네스팅·모아찍기는 안 읽음**(전수 추적 확인) |
`#iaeApplyAllBtn` (설정 전체적용) | **제거** | 위 설정을 복사할 뿐 |
**`#iaeIntakeBtn` + `#iaeIntakePanel` (모아찍기 대기함)** | **유지·이동** | 패널 경로의 **유일한 진입점** |
**`#iaeAgentBadge`** | **유지·이동** | 렌더(EPS 출력) 가능 여부 표시 |
**`#iaeTabs` (파일 탭)** | **유지·이동** | 세션에 담긴 파일 확인·닫기(×) |
**`#iaePanel` (그룹 카드)** | 판단 필요 | 네스팅 팔레트(`iaeCanAllGroups`)와 중복일 수 있음. 다만 분석 진행/실패 상태 표시를 겸함 |
프리플라이트 · 근사 미리보기 | 판단 필요 | 프리플라이트(텍스트 잔존·링크 이미지 경고)는 QC로 유용. 설정 폼과 얽혀 있어 분리 비용 확인 |

목표 형태: **`[네스팅/모아찍기] [시안 검수]` 2뷰**, 대기함·에이전트배지·파일탭은 뷰 밖 공통 영역.

## ⚠️ 이 작업의 위험 — 오늘 실제로 두 번 사고가 났다

### 1. 블록 삭제 경계 초과 (Phase 6에서 발생, 브라우저가 잡음)
`iaeBatchZip` 종료 다음 5줄이 **유지 대상 섹션의 주석 + `var iaeHistLoading`** 이었는데 함께 삭제 →
페이지 로드 시 `ReferenceError: iaeHistLoading is not defined`.

**규칙**: 라인 범위 삭제는 **시작·끝 양쪽 + 바로 바깥 한 줄**을 모두 assert한 뒤에만 실행.
Phase 7a에서 같은 assert가 **두 번 더** 사고를 막았다(시작 경계 오판 1회, 종료 경계가 `var iaeAgentStatusTimer` 1회).

### 2. 제거한 블록이 유지 대상의 엘리먼트를 만들고 있었다 (Phase 7a)
`#iaeAgentBadge` 를 **가공 이력 보드 헤더가 생성**하고 있어서, 보드를 지우면 에이전트 배지가 함께 죽었다.
→ 페이지 템플릿의 고정 자리로 옮겨 해결.

**규칙**: 제거 대상이 **DOM 엘리먼트를 만들고 있지 않은지** 확인(`createElement`·`id="..."` 문자열).

### 3. 정적 링크검사 v1의 구멍
`iaeXxx(` **함수 호출만** 대조해서 **변수 참조**를 놓쳤다(위 1번을 못 잡음).
→ v2(함수+변수 전수)를 쓸 것. 스크립트는 세션마다 재작성해도 되지만 로직은 이것:

```js
// 정의: function iaeX( · var/let/const iaeX · iaeX = function · window.iaeX =
// 참조: 주석·문자열 제거 후 모든 \biae\w+\b
// 참조 - 정의 = dangling
```

## 검증 절차 (이 순서대로)

1. `node --check src/scripts/iaEditor.js`
2. **정적 링크검사 v2** — dangling 0건 (퍼지 전/후 비교)
3. `npm run check:dom` — **9건이 기준선**. 늘어나면 진입점만 지우고 핸들러를 남긴 것
4. `npm run verify` (typecheck+build) · `node scripts/entity-audit.mjs` (60/60)
5. **브라우저 실클릭** — 이게 1·2번을 잡은 유일한 수단이었다
   - Playwright MCP가 타 세션에 잠겨 있으면 **Chrome 확장**(`mcp__claude-in-chrome__*`) 사용
   - 로그인: `POST /api/auth/login` (admin/password) → `localStorage.token` + `document.cookie`
   - 세션 파일 주입: `localStorage.setItem('iae_session_ids','[<analysisId>]')`
   - 확인: 콘솔 에러 0(로드 시점 포함 — 새로고침 후 read_console) · 에이전트 배지 갱신 ·
     대기함 열림·그룹핑 · 네스팅 [자동 배치] → `iaeCanObjs` 좌표 생성 · 검수 뷰 매칭 저장
   - ⚠️ `confirm()` 쓰는 버튼([취소] 등)은 **클릭 금지** — 브라우저가 블로킹된다. API로 검증
6. 테스트 데이터·localStorage 정리

## 로컬 검증용 시드 (참고)

```sql
-- 네스팅에 쓸 분석 1건(그룹 2개)
INSERT INTO ai_analysis_requests (file_path, status, entity_id, groups_json)
VALUES ('Z:\TNEST\demo.ai','done',1,
 '[{"index":0,"name":"배너A","width_mm":600,"height_mm":1800},{"index":1,"name":"배너B","width_mm":450,"height_mm":1200}]');

-- 모아찍기 대기물(가공자·묶음 그룹핑 확인용) — mode='impose' 여야 ia-editor 대기함에 뜬다
INSERT INTO designer_intakes (entity_id, ai_analysis_id, client_name, qty, width_cm, height_cm,
  work_ai_path, status, mode, worker_id, worker_name, batch_key, memo)
VALUES (1,<aid>,'가나광고',3,60,180,'Z:\T\a.ai','waiting','impose',1,'인호동','batch1','T-a');
```

`dev:d1` 은 `dist/` 를 서빙하므로 **`npm run build` 먼저**. 그리고 build 가 실행 중인 dev 서버를 죽이므로
빌드 후 재기동 필요(오늘 3번 겪음).

## 참고 — 함께 정리할 후보 (선택)

- `POST /api/workbench/process` 계열: Phase 6 이후 **호출하는 프론트 0**(dead route).
  진입점이 없어 404는 안 나지만, 에이전트 `/process-queue` 폴링도 함께 정리할지 판단.
- `orderForm.ts` `IA_WEB_INTAKE_ENABLED=false` 게이트로 숨긴 옛 AI추출·합판 패널 — 코드 완전 제거 여부.
