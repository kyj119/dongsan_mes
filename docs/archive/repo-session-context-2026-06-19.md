# session-context.md — 세션 맥락 (다음 세션 핸드오프)

> ⚠️ **스테일 스냅샷 (2026-07-02 표기)**: 이 저장소 사본은 2026-06-19 이후 갱신되지 않음. **세션 핸드오프 정본 = auto-memory `session-context.md`** (세션 시작 시 자동 로드, 품목 마스터 신모델 정본). 아래 ia-editor 운영 절차(에이전트 교체·배포 규약)는 유효한 참조로 보존.

> **최종: 2026-06-19 PM** — **주문 라인 append**(API+ia-editor UI) + **직접연결(-3) 썸네일 공백버그 수정**(에이전트) + #3 /files 근본원인 정정 + #4 뱃지 누수 — **전부 prod 배포·E2E 검증·커밋·push 완료**.
> **상태**: `main` = `origin/feat/ia-editor-canvas-n1` = **`74272977`** · 웹 prod dep **`b90d3635`** · 에이전트 **PID 21000**(수정본 라이브).
> **이전(2026-06-19 오전, `0783c75e`)**: EPS suffix 버그 + ia-editor 캔버스 N1~N5 + N4 출력 fidelity — 전부 prod 라이브.

## ⚠️ 핵심 주의사항 (다음 세션 필독)
- **webapp = CF Pages Direct Upload**: `git push`는 자동빌드 **없음**. `wrangler pages deploy dist --project-name webapp --branch main`이 **유일한 prod 반영**. 배포 후 `git push origin <branch>:main`으로 main 동기화.
- **봇 push**: auto-improve가 origin/main에 주기적 push(문서/SKILL). **배포·push 전 항상** `git fetch origin main` → 분기 시 `git merge origin/main` 후 진행(안 하면 봇 커밋 롤백).
- **wrangler/tsc/vite는 `node_modules/.bin` 부재** → node 직접 실행(아래 명령).
- **에이전트 교체 절차**(C#/JSX 변경 시 — 이번 세션 성공 패턴):
  1. `dotnet publish IllustratorAutomat/IllustratorAutomat.csproj -c Release -r win-x64 --self-contained true -o IllustratorAutomat/publish-new` (csproj에 RID/single-file/self-contained 고정됨)
  2. 진행 중 작업 확인(auto_process_jobs status='processing' = 0), Illustrator(COM) 가동 확인 → `Get-Process IllustratorAutomat | Stop-Process -Force`
  3. 백업: `robocopy Z:\…\publish <backup> /E`
  4. 배포: `robocopy publish-new Z:\Designs\IllustratorAutomat\publish /MIR /XF appsettings.json *.log ia_params.json` (**prod appsettings·ia_params·log 보존** 필수)
  5. 재시작: `Start-Process …\IllustratorAutomat.exe -WorkingDirectory …\publish -RedirectStandardOutput <log>` → 로그에 "Login successful!"·"Polling" 확인.
  - ⚠️ webapp(wrangler)와 **완전 별개**. Illustrator 미가동 시 COM 연결 불가.
- **ia-editor 주문 페이로드 규약**(에이전트 계약):
  - `finishing` = **per-side JSON 객체** `{"top","bottom","left","right"}`(단일 문자열 보내면 무시). 헬퍼 `iaeFinJson`.
  - `post_processing` = **배열 JSON**(객체 단독 무시). 코드: `TRIM`(돔보)·`RESIZE`{w_cm,h_cm}·`SHEET`{roll_width_cm,total_height_cm,margin_cm,scale_factor,placements}(per-item 다중시트). **이 3코드는 후가공 아님 → 카드 뱃지서 숨김**(`isPPHidden` IAE_INTERNAL_PP).
  - `scale_factor`(파일 배율) = 소스가 실제의 1/N. 에이전트가 마진/돔보/placement를 ÷scale_factor.
  - `order_items.ai_analysis_id`는 **실제 ai_analysis_requests 행** 필요(가짜 id면 FK 500).
- **append 규약**: `POST /api/orders/:id/items` = 기존 품목/카드 **무변경**, 신규 라인만 INSERT→신규 라인만 카드생성(`generateCardsForOrder` `itemIdsFilter`). 가드 = 상태 **PRINT_DONE(출력완료)까지만**(CONFIRMED·PRINTING·PRINT_DONE·HOLD 허용 / SHIPPED·COMPLETED·CANCELLED·QUOTATION·DRAFT 차단). PRINT_DONE에 추가 시 PRINTING 되돌림. recalcOrderBillingGroups 동결 보존.
- **직접연결 썸네일**: 에이전트가 EPS(공백 보존)/PNG(Illustrator exportFile 하이픈화) 파일명 미스매치를 **자동 폴백 탐색**(해결됨, B안). 거래처명 공백 무관하게 썸네일 생성됨.
- **canvas_json 마이그 드리프트**: `/api/workbench/files`가 `canvas_json`(마이그 0317) SELECT → 미적용 환경서 "no such column" 500. prod 정상. **로컬 500이면 `node …/wrangler.js d1 migrations apply webapp-production --local`**.
- **e2e 한글 인코딩 함정**: PowerShell `Invoke-RestMethod`가 한글 UTF-8 mojibake → 한글 포함 페이로드 e2e는 **브라우저(axios)** 또는 ASCII 임시파일 경유. wrangler 커밋메시지도 ASCII.

## 🟢 ia-editor 현황 (전부 prod 라이브)
- 흐름: 파일 업로드/분석 → **대지 편집**(객체 배치·크기·마감·돔보·네스팅[목표크기·파일배율·다중시트]) → **주문으로 보내기(신규 OR 기존 주문 추가)** → AI_PROCESS → 주문폴더 EPS(마감/돔보/스케일/네스팅 반영) + 카드 썸네일.
- UI 2탭: **파일 처리** · **대지 편집(네스팅 포함)**. 주문모달 = **신규/기존 토글**(기존=주문 검색 picker, 출력완료까지 선택).
- 직접연결(D): 라인별 완성 EPS/AI 직접첨부(group_index -3 완성본 / -1 가공) → passthrough + 썸네일 카드.

## 이번 세션(2026-06-19 PM) 완료 — 상세 = [[project-ia-editor]]·[[bug-history]]
1. **주문 라인 append**(신규): `create.ts` POST /:id/items + `helpers.ts`(itemIdsFilter·enqueueAutoProcessJobsForItems) + `iaEditor.js` 모달 토글/picker. E2E 로컬(품목+2·카드번호연속·중복0·가드400/404/409·PRINT_DONE→PRINTING) + prod(smoke 103/103·append 라이브).
2. **직접연결 썸네일 공백버그**(에이전트 B안): `Program.cs ReportDirectThumbnailAsync` File.Exists 실패 시 공백→하이픈 + glob 폴백. 재배포 PID 21000. e2e=공백거래처 신규주문 009 자동생성 + 007 백필 + 무공백 회귀0(008).
3. **#3** /files 500 = canvas_json 드리프트(코드정상). **#4** SHEET/RESIZE/TRIM 뱃지 누수 → isPPHidden 숨김.
4. 커밋 `74272977` → push main. 웹 dep `b90d3635`. 임시파일(e2e-thumb-src.eps·agent-thumbfix.log) 정리.

## ▶ 다음 세션 TODO (ia-editor 후속, 전부 선택)
1. **이형(비정사각형) true-shape 네스팅** — 현재 바운딩박스(사각형)만. 용준님 검토 중. 옵션: **(c) 수동 인터록**(대지 자유드래그→배치 그대로 출력; 최소공수=SHEET pp에 수동 placements, 회전/충돌 수동) ⭐권장 / (b) 래스터 패킹 / (a) NFP·SVGnest 자동. **(별도 세션)**
2. ~~append~~ ✅ / ~~/files 500~~ ✅(드리프트) / ~~다중시트 UX~~ ✅(뱃지) / ~~썸네일 공백버그~~ ✅
3. 정리(선택): 빈 Z 출력폴더 잔재(NAS 일시잠금), `IllustratorAutomat/publish-new`·`publish-backup-20260619-thumbfix`(롤백 불요 시), 로컬 D1 테스트주문.
4. (선택) append 실사용 검증 = ia-editor에서 대지 객체 → '기존 주문에 추가' 실저장 + 다중시트 출력 시 file-seq별 EPS 주문페이지 UX.

## 명령 (PowerShell/Bash)
```
# 타입체크·빌드·문법
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
node --check src/scripts/iaEditor.js          # ?raw JS는 빌드가 문법 안 잡음 → 필수
# 로컬 검증 (admin/password → /ia-editor)
node node_modules/wrangler/bin/wrangler.js pages dev dist --local --ip 127.0.0.1 --port 3000 --d1=webapp-production
node node_modules/wrangler/bin/wrangler.js d1 migrations apply webapp-production --local   # /files 500(canvas_json) 시
# prod 배포 (Direct Upload) → main 동기화
node node_modules/wrangler/bin/wrangler.js pages deploy dist --project-name webapp --branch main --commit-dirty=true --commit-message "ascii"
git fetch origin main && git push origin feat/ia-editor-canvas-n1:main
# 에이전트 재빌드·교체 (위 '에이전트 교체 절차' 참조)
dotnet publish IllustratorAutomat/IllustratorAutomat.csproj -c Release -r win-x64 --self-contained true -o IllustratorAutomat/publish-new
# prod DB
node node_modules/wrangler/bin/wrangler.js d1 execute webapp-production --remote --command "SELECT ..."
```

> **정본 spec**: `docs/superpowers/specs/2026-06-16-ia-editor-nesting-intake.md` §14. 상세 진행/결정 = [[project-ia-editor]]. 버그이력 = [[bug-history]].
