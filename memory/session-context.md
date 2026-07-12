# 세션 컨텍스트 (2026-07-13) — IA 분석/렌더 잡 crash·temp 하드닝 4갭

> 세션별 덮어쓰기 파일. 직전(07-12 IA 저장 스케일 분리) 내용은 auto-memory [[project-ia-editor]] 참조.
> **이 세션 정본 = auto-memory [[project-ia-editor]] (2026-07-13 엔트리) + PROJECT_STATUS 현재 진행 중 최상단.**

## 이 세션에서 한 것
직전 세션 "분석 중 crash/temp 처리 조사"에서 확정한 미조치 4갭을 하드닝. **웹 ②④ prod 배포 완료**, **에이전트 ①③ 커밋만(publish 대기)**.

### 웹 (배포됨, main `0bc747b9`, 마이그 0458 remote)
- **② stale 재큐**: 각 에이전트 폴 엔드포인트 진입 시 stale 잡 자동 재큐(하드 crash/에이전트 death 회복).
  - `aiAnalysis.ts` GET `/`(status=pending일 때): `processing` + updated_at<-10min → retry_count+1, 한도 내 `pending` 복귀·초과 `error`.
  - `workbench.ts` `/render-queue`(sheet_layouts)·`/process-queue`(ia_process_jobs): `rendering` + <-10min → requeue_count<3면 `queued`·초과 `error`.
  - best-effort(try/catch)·global(entity 무관, :610 프리뷰 정리와 동일 정책). authMiddleware 뒤라 unauth 부작용 0.
- **④ 폴링 데드라인**: `iaEditor.js` 분석 파일 pending/processing 진입 후 서버 updated_at(UTC) 기준 10분 초과 시 폴 중단 + "지연·시간초과" 배지·패널 안내. `workbench.ts` `/files` 응답에 `updated_at` emit 추가(없으면 판정 불가였음). 렌더 폴(iaePollRender)은 이미 2분 데드라인 → 무관.

### 마이그 0458 (ADD COLUMN, 비멱등·가산형)
- `ia_process_jobs.requeue_count`·`sheet_layouts.requeue_count` INTEGER DEFAULT 0. prod 적용 완료(PRAGMA proc_ok/sheet_ok=1). ai_analysis_requests는 기존 retry_count/max_retries(0130)로 이미 bound.

### 에이전트 C# (커밋만, `0bc747b9` 내 Program.cs / worker 무관 → publish+재기동 필요)
- **① hang 재시작**: `RunJsxScript` 타임아웃 시 `RestartIllustrator()` — Illustrator.exe kill(leaked COM DoJavaScript 스레드 해제)→`_ilApp=null`→다음 잡 fresh. kill 범위 = appsettings `IllustratorKillScope`(기본 `all`=전 인스턴스·전용머신 가정 / `owned`=시작 PID만, 다중 시 생략). `_ilPid`는 직접 start 경로에서 best-effort 캡처.
- **③ temp 스윕**: `SweepTempFolder(ttl)` — 시작 시 1회 + 주기(_heartbeatTick%360 ≈1h) `%TEMP%\IllustratorAutomat` 하위 폴더/파일 LastWriteTime>TTL 삭제. TTL = appsettings `TempTtlHours`(기본 24). 사용중/권한 폴더는 조용히 skip.

## 결정 + 이유
- **미확정 2결정(kill scope·배포순서)은 차단 대신 config/기본값 처리** — 사용자 부재 중 진행 위해. kill scope=`all` 기본(전용머신 가정), 임계값 상수화(10분/24h/10분).
- **에이전트(①③)는 웹과 분리 배포** — Program.cs는 worker 번들 무관, publish+재기동은 진행중 IA 렌더 중단 유발 → 잡 없을 때 별도 수행. 커밋은 완료(dirty WIP 금지 원칙).
- 통합 배포: 타 세션 근태 배지(`f5a52865`) + origin 봇 4커밋 rebase 통합 → push-first → deploy:prod `--branch main`.

## 검증 (실측)
- verify green(tsc+vite)·dotnet build 0err(CA1416 기존 경고만).
- **재큐 SQL 로컬 D1 9케이스 실증**: sheet/proc/analysis × (stale→재큐 cnt+1 / poison cnt≥3→error / fresh→미변경) 전부 정확. dummy 990xxx 정리 완료.
- 0458 prod 적용·PRAGMA 확인. apex: root 302·workbench(files/process-queue/render-queue)·ai-analysis 전부 401(라우트 라이브)·attendance 200.

## 판단기준 / 주의사항
- ⚠️ **에이전트 ①③ 미publish 상태** — publish+재기동 전까지 hang 재시작·temp 스윕 미작동(웹 ②④는 이미 라이브). 운영자가 에이전트 PC에서 Illustrator를 대화형으로 쓰면 배포 전 `IllustratorKillScope=owned` 검토.
- ⚠️ **근태 배지 시각검증(#5)·updated_at emit 실인증 확인 = prod 로그인 필요**(현재 prod 세션 미인증, 안전규칙상 Claude 로그인 불가 → 사용자 확인).
- 재큐 무한루프 방지: 시트/가공=requeue_count 3회 후 error, 분석=retry_count(기존)로 bound. 프론트 데드라인은 서버 재큐와 독립(에이전트 완전 death 시 재큐 트리거 없음→프론트가 timeout 표기로 정직).
- 0458은 비멱등 ADD COLUMN — 재적용 금지(이미 prod 반영).

## 다음 세션 TODO
- 에이전트 ①③ publish+재기동(kill scope 최종 결정) → hang/temp 실동작 확인.
- 근태 배지(#5)·updated_at emit prod 로그인 후 시각 확인.
- (직전 이월) 주문-통합 출력(ProcessOrderAsync) 파일명 토큰·프리셋 기본값 조정 검토.

## 배포 검증 명령 (PowerShell)
```powershell
npm run verify                                           # tsc + vite
# 0458 prod: npx wrangler d1 execute webapp-production --remote --file=./migrations/0458_ia_job_requeue_guard.sql (적용 완료)
npm run deploy:prod                                      # build + wrangler --branch main (적용 완료)
# 에이전트(미완): dotnet publish → bin\Release\net8.0\win-x64\publish\ 재기동 (진행중 잡 없을 때)
# prod: https://webapp-9i0.pages.dev (root 302·API 401 정상)
```
