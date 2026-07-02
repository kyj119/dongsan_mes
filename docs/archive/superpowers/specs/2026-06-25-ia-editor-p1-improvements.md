# IA 편집기 Export-first — P1 실사용 개선 (실효성 점검 후속)

- **작성일**: 2026-06-25 (에이전트 팀 5축 점검 → 용준님 P1 전체 승인)
- **선행**: `2026-06-25-ia-editor-eps-export.md`(Export-first 구현). 점검 결과 정본 = `project-ia-editor` 메모리.
- **목적**: 점검이 찾은 critical/high 갭 중 **실사용 최소 필수 6항목**. 사용자 지적(돔보·파일배율·네스팅 비율) + critical 갭(이력 재다운로드·일괄 전 단계·회전 silent drop). 대부분 백엔드·jsx는 이미 완비, 프론트 배선 위주.

## P1 항목 (6)

### ① 파일처리 탭 돔보(trim) 토글 — 난이도 S, 프론트 only
- `iaEditor.js`: `iaeGetSettings` 기본 settings에 `trim:false` 추가. `iaeRenderInspector`의 회전/복제 줄(~391~395)에 `<input id="iaeTrim" type="checkbox"> 돔보` 추가, sync에서 `s.trim` 반영. `iaeProcessGroup` body.trim은 이미 `s.trim` 참조 → 추가 변경 불요. 미리보기 라벨에 `· 돔보` 표기.
- 워커·에이전트·jsx는 trim 이미 완비 → **프론트만 고치면 end-to-end 즉시 동작**.

### ② 네스팅 패널 조각 W·H 비율잠금 — 난이도 S, 프론트 only
- `iaEditor.js`: `iaeCanRenderNestPanel`의 조각 W/H 입력(~1454~1455) 옆에 `비율` 체크박스(기본 on). 인스펙터 `detAspect` 자동연동(applySize ~1119~1126 패턴) 재사용 → W 입력 시 H 자동계산(검출 종횡비). `iaeCanNestOpts`에 `ratio_lock` 보존. 현재 단순 parseFloat 독립저장(~1485~1486)이 왜곡 원인.

### ③ 가공 이력 보드 + 영속 재다운로드 — 난이도 S
- **워커 신규**: `GET /api/workbench/process?limit=N` — entity 격리, `ia_process_jobs` 최근 N건(created_at desc). 응답: `{id, status, group_index, analysis_id, error_message, created_at, result_meta:{width_cm,height_cm,has_eps,has_dxf,has_jpg,jpg_base64}}`. jpg_base64는 썸네일용(limit 기본 12로 작게). `pickR2Key` 패턴으로 r2 키 존재만 확인.
- (선택) 네스팅 이력도 `GET /api/workbench/sheets?render_status=done` 재사용(기존 sheets 목록에 render 상태 추가).
- **프론트**: 파일처리/대지편집 공통 `내 출력 이력` 패널/섹션 → 카드별 상태·썸네일 + `[EPS][JPG][DXF]` 재다운로드(`iaeDownloadBlob('/api/workbench/process/'+id+'/download?kind=...')`). 새로고침/탭전환에도 보존. 폴링 결과도 완료 시 이력에 합류.

### ④ 복제수(dup_count) 오해 차단 — 난이도 S, 프론트 only
- `iaEditor.js`: 단일 가공 출력은 1매(정설계). 미리보기 `× N매` 표기(~557)·복제수 입력(~394)을 **제거**하거나, 복제수>1이면 `여러 매 면付은 대지편집 네스팅 사용` 안내. 미리보기 신뢰=출력 일치.

### ⑤ 파일 배율(scale_factor) 전 스택 연결 — 난이도 M
- **프론트**: `iaeGetSettings`에 `scale_factor:1`. 인스펙터에 `파일배율 1/N` 입력(대지편집 `iaeCanNestFS`/`iaeCanScale` 패턴). `iaeProcessGroup` body에 `scale_factor: Math.max(1, Number(s.scale_factor)||1)`.
- **워커**: `POST /process` body에서 `scale_factor` 파싱 → `params_json`에 저장(현 params 객체에 추가, ~759~765).
- **에이전트**: `ProcessSingleProcessJobAsync`가 params에서 `scale_factor` 파싱 → `iaParamsObj`에 `scale_factor` 추가(~1559~1583). **jsx는 scaleFactor 이미 완비(_p.scaleFactor) → 무수정**. (단 jsx가 ia_params 키를 `scaleFactor`로 읽는지 확인: ProcessOrderItem.jsx L61 `_p.scaleFactor`. 에이전트는 `scale_factor`로 쓰므로 키 일치 필요 → 에이전트가 `scaleFactor` 키로 기록.)

### ⑥ 90° 회전 출력 실반영 (silent drop 제거) — 난이도 M
- **현 결함**: 프론트 rotate90 전송 → 워커 저장 → 그러나 에이전트 iaParamsObj·jsx에서 소실. 미리보기는 회전, EPS는 미회전.
- **워커**: `POST /process` params에 `rotation`(0/90/180/270) 저장. 파일처리 프론트의 `rotate90`(boolean)을 `rotation = rotate90 ? 90 : 0`으로 매핑(프론트 또는 워커).
- **에이전트**: params에서 `rotation` 파싱 → `iaParamsObj`에 `rotation` 추가.
- **jsx (ProcessOrderItem.jsx)**: 신규 `var rotation = _p.rotation || 0;`. 아트보드 스케일/마감 **이전**에 디자인 아트워크 그룹을 `group.rotate(-rotation)` (SheetLayout.jsx rotate(-pl.rotation) 패턴 포팅) + 90/270이면 targetW/H swap·아트보드 bbox 재계산. rotation 0이면 무동작(기존 경로 보존).
- (확장) 캔버스 단품(비-시트) 회전도 동일 jsx 경로 재사용 가능하나, **P1은 파일처리 탭 rotate90 우선**(단품 회전은 P2/P3).

## 파일 분담 (3팀 병렬, iaEditor.js는 프론트 단독)
| 팀 | 파일 | 항목 |
|----|------|------|
| **A 프론트** | `src/scripts/iaEditor.js` | ①②③(UI)④⑤(프론트)⑥(프론트 rotation 매핑) |
| **B 워커** | `src/routes/workbench.ts` | ③ GET /process 목록 · ⑤ params scale_factor · ⑥ params rotation |
| **C 에이전트** | `IllustratorAutomat/Program.cs`, `ProcessOrderItem.jsx` | ⑤ scaleFactor 전달 · ⑥ rotation 전달 + jsx 아트워크 회전 |

## API 계약 (고정)
- `GET /api/workbench/process?limit=12` → `{success, data:[{id,status,group_index,analysis_id,error_message,created_at,result_meta}]}` (entity 격리, created_at desc)
- `POST /api/workbench/process` body 확장: `{...기존, scale_factor?:number(기본1), rotation?:0|90|180|270}` (rotate90 boolean도 호환 — 워커가 rotation으로 정규화)
- 다운로드는 기존 `GET /process/:id/download?kind=eps|dxf|jpg` 재사용.

## 검증
- `npm run verify` + `npm run build && npm run smoke` (워커/프론트) · `dotnet build` (에이전트).
- **prod E2E**: 에이전트 재빌드·재시작 후 — ①돔보 켜고 가공→EPS에 재단마크 ②파일배율 2 가공→마감 보정 ③90°회전 가공→회전 EPS ④이력 보드 새로고침 후 재다운로드 ⑤네스팅 비율잠금 W변경→H 자동.

## 배포
- 워커 `--branch main` + 마이그 없음(이번 P1은 스키마 변경 없음 — GET 목록은 기존 테이블) + 에이전트 재빌드·재시작(이 PC publish). git push.
- ⚠️ 회전(⑥) jsx는 fidelity 민감 → E2E에서 90/270 시각 확인 필수.
