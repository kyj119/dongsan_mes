# 세션 컨텍스트 (2026-07-12) — IA 편집기 저장 스케일 분리(출력≠저장)

> 세션별 덮어쓰기 파일. 직전(07-12 근태/급여 연장·휴일 개편) 내용은 auto-memory [[design-payroll-overtime-breakdown]] 참조.
> **이 세션 정본 = auto-memory [[project-ia-editor]] (2026-07-12 엔트리).**

## 이 세션에서 한 것 (prod 배포·실렌더 E2E·apex 검증 완료)
사용자 요구: "IA 편집기가 **최대폭 기준 강제 축소**하지 말고 **추천만** 하고 저장방식 선택. **출력 스케일**(파일명·카드·주문)과 **저장 스케일**(실제 파일 물리 크기) 분리. 예: 출력 500 / 기본 50 → 저장 50·100·200 선택." + 질문2(분석 중 crash·temp 처리 조사).

1. **저장 스케일 분리 모델** (커밋 `a30c655b`, web dep `911ffad6`, 에이전트 PID 47184 publish 재기동)
   - 목표크기=출력 O. 저장%(프리셋 `100/50/25/20/10`, localStorage `iae_save_presets_v1` 편집가능) → `scale_factor=100/저장%`.
   - 에이전트가 아트워크를 O÷scale_factor=저장크기로 리사이즈 + 마감·돔보 ÷scale_factor. **기존 realSize=false 축소경로 재사용, jsx 무변경**(스케일 수학 미변경=저위험).
   - 파일명 토큰 `_1-N`(`FormatScaleToken`, Program.cs 단일가공:1681·시트:1463 baseName; '/'불가→'-', 표시 1/N)=출력크기+축소표기 병기.
   - 범위: 단일가공(process/preview/batch/이력→주문) + 네스팅(iaeCanNestPlace) + 모아찍기(iaeImposePlace) 전부.
2. **자동축소 추천화 + 안전 하한** — 강제 ceil 대신 프론트 추천(IL 560cm 안 드는 최대 프리셋). 초과 판은 `scaleFactor=max(선택, ceil(maxDim/560))` 자동 보장(PARM 방지). 클라 iaeSheetFinalFactor + 에이전트 양쪽 클램프(방어).
3. **추천값 동적화** (커밋 `e10c238a`, web dep `91aa1eac`) — 단일=목표크기 변경 시 sync 추종, 네스팅/모아찍기=estimate.sheet_max_dim_cm 추종(통합 iaeUpdateSaveScaleRec). `_save_scale_auto` 플래그: 미선택 시 추천 추종, 수동 선택 후 마커만 갱신.

## 결정 + 이유 (사용자 확정, AskUserQuestion)
- **범위 = 단일가공 + 네스팅/모아찍기 둘 다.**
- **선택 방식 = 출력 대비 % 프리셋 드롭다운**(값 편집 가능, 환산 cm·RIP 배율 병기).
- **RIP 계약 = 파일명에 출력크기 + 축소표기 `1/N` 병기**, 카드/주문=출력크기. 저장≠출력 시 RIP ×N 확대.
- 파일명 토큰 = `1/5` 형식(디스크 '/' 불가 → `1-5`).

## 검증 (prod 실측)
- **실렌더 E2E**: 분석18 group0 출력500×300·저장20% → **EPS BBox `2834.6×1700.8pt` = 정확히 100×60cm(÷5)** · 파일명 `500x300cm_group0_1-5.eps` · agent online.
- **브라우저**: 프리셋 전배포·추천(출력500→100%·판800→50%·판1200 수동100→마커25)·힌트("저장100×60·1/5·RIP×5")·콘솔0.
- 빌드: `npm run build` 0err · `dotnet build`/`publish` 0err(경고 CA1416만, 기존).

## 판단기준 / 주의사항
- **⚠️ RIP 오퍼레이터 공지 필수**: 파일명 `1/N` 토큰 있으면 RIP가 ×N 확대 출력. **100% 출력 시 1/N 크기 오출력** = 이 기능 최대 리스크.
- **⚠️ 에이전트 운영 publish 경로 = `bin/Release/net8.0/win-x64/publish/`** (PID 47184, 이전 build-dir PID49048 대체). 재기동은 publish exe. Mutex 단일인스턴스라 중복 기동 시 2번째 자동종료.
- 스케일 수학(jsx) 미변경 — 이번 변경=파일명 토큰 + max() 클램프 + 프론트 UX. 회귀 위험 낮음.
- 주문 경로 REALSIZE는 `real_size===true` legacy만 트리거(신모델=축소저장 기본).
- 배포: origin/main push-first(타 세션 `9187e671` docs 인터리브·정합 확인) → `deploy:prod --branch main`. 워킹트리 clean(untracked spec .md만).

## 조사 답변 (질문2 — 분석 중 crash·temp 처리, 코드 사실)
- 소프트 실패(jsx 예외/2분 타임아웃 정상반환)=`error` PATCH → 서버 자동 재큐 max 3회(aiAnalysis).
- **미조치 갭 4건**: ①진짜 일러 hang은 COM 취소 안 됨·kill/재시작 로직 없음 ②하드 crash로 `processing`/`rendering` 낀 잡 자동 재큐 없음(수동 retry만)·분석은 `pending` 필터라 재처리 불가 ③에이전트 temp(`%TEMP%\IllustratorAutomat\req_/process_/render_sheet_`) 시작시/주기 스윕·TTL 없음 → 누적 ④프론트 분석 폴링 데드라인 없음(무한 "처리 중"). 하드닝 보류.

## 다음 세션 TODO (선택)
- 주문-통합 출력(ProcessOrderAsync) 파일명 토큰 적용 — 현재 Export-first만 토큰, 주문 경로는 축소저장은 되나 파일명 토큰 없음.
- 분석 crash/temp 하드닝 4갭(위) — 시작시 temp 스윕/TTL·stale 잡 재큐·hang 감지 재시작·프론트 폴링 데드라인.
- 실사용 후 프리셋 기본값(100/50/25/20/10) 조정 검토.

## 배포 검증 명령 (PowerShell)
```powershell
npm run build            # 웹 번들
dotnet build "IllustratorAutomat\IllustratorAutomat.csproj" -c Release   # 에이전트
# 에이전트 재기동: Stop → dotnet publish → bin\Release\net8.0\win-x64\publish\IllustratorAutomat.exe 실행
npm run deploy:prod      # build + wrangler --branch main (apex)
# prod: https://webapp-9i0.pages.dev  (apex root 302·API 401 = 정상)
```
