# 세션 핸드오프 — IA 편집기 대용량·모달·큐 안정화 + NAS 경로 분석 (2026-07-16 오후)

> 세션별 덮어쓰기 파일. 이전(선명 매입 이관·품목매칭)은 PROJECT_STATUS [2026-07-16] 항목 + [[project-sunmyung-item-import]]에 보존.

## 배포 상태 (최종)
- **origin/main = `75fea1cf`** (superset, push 완료 — 재롤백 방지)
- **웹 prod 배포 완료** (webapp-9i0.pages.dev = 커스텀도메인 **dongsanplan.com** 동일 배포)
- **에이전트 재빌드·재기동 완료** (PID 26032, `bin\Release\net8.0\win-x64\publish\`) — P-STOP + E + NAS 스캔 + 동적타임아웃 포함
- **NAS 입력폴더 생성**: `Z:\Designs\IA-입력`
- 런타임 JSX 동기화됨: SheetLayout(회전/mm/돔보17)·ExtractGroups(폰트프리체크 철회본)·ProcessOrderItem(돔보17)

## 이번 세션 변경 (커밋 `af533ba3`·`34b74d10`·`75fea1cf`)

### 1. SheetLayout.jsx — 모아찍기/개별 렌더 (JSX only, 런타임 동기화로 반영)
- **재단선 회전정렬 수정**: Layer B(CutLine)·C(돔보)가 `rotated?height:width` 스왑을 했는데, placements의 width/height는 이미 `iaeCanRotBBox` 회전후 bbox(정본)라 스왑=전치 버그 → 스왑 제거. Layer A(디자인)는 회전 전 스케일이라 스왑 유지가 정상.
- **저장 단위 mm**: `newDoc.rulerUnits = RulerUnits.Millimeters`.
- **돔보 간격**: `CORNER_DIST` 10→**17mm** (SheetLayout·ProcessOrderItem 양쪽) = 디자인모서리↔돔보 **바깥끝 20mm**(중심17+반지름3).
- **⚠️ 0.5mm 우하단 밀림 = 보정 철회·미해결**: position(visibleBounds)↔스케일(geometricBounds) 오버슈트가 원인. translate 시도→부호오류로 디자인 소실. visibleBounds 접근→래스터/복잡아트에서 **COM hang**(중간멈춤). → 원본 `copied.position=[xPt,yTopPt]`로 복귀. (visibleBounds 필요→hang이라 포기)

### 2. 큐 A+B+C + P-STOP (서버 aiAnalysis.ts + 에이전트 Program.cs)
- **자동만료**: AI분석 `pending` 10분+ → **terminal error(retry_count=max, 재큐 안 함)**. 리퍼는 에이전트 폴 진입 시만 실행(에이전트 death 중 정상대기 잡 오살 방지).
- **취소**: `POST /api/ai-analysis/:id/cancel`(terminal) + IA편집기 "분석 취소" 버튼.
- **P-STOP(에이전트)**: 무거운 COM 직전 `IsJobTerminatedAsync`로 서버 상태 재확인 → 취소/만료면 skip(ai-analysis·sheet 양쪽).
- **★근본**: 기존 만료·에러가 전부 재큐(retry<max)라 terminal 취소가 없어 "MES 만료인데 에이전트 계속 막힘" 발생 → **retry_count=max로 못박아** 에이전트 error-PATCH도 재큐 못 하게 함.

### 3. 폰트 프리체크 → 철회 (실패한 시도, 교훈)
- **원인 규명**: `.eps` 열 때 hang = 미설치 **일본어 CID 폰트(Heisei-*/Jun101, RKSJ)** → 폰트 대체 **모달** → 헤드리스 COM hang. `DONTDISPLAYALERTS`는 이 모달 못 막음.
- **철회 이유**: CID `resourcestatus` 참조가 **프롤로그 boilerplate**(사용/미사용 파일이 동일 21개 참조)라 파싱으로 구분 불가 → 이미지전용 파일까지 오탐(회귀). → 프리체크·헬퍼 전부 제거, 원본 `app.open` 복귀.

### 4. E(우아한 실패) + A(안내) — 모달 파일 대응
- **E(에이전트)**: ExtractGroups 타임아웃 → `[OPEN_HANG]` 마커 + "레거시 텍스트·폰트·프로파일 등 열기경고 — 아웃라인 후 재업로드" 메시지 → 서버가 terminal(재큐 금지). 큐 안 막고 안내.
- **서버**: error_message에 `[FONT_MISSING]`·`[OPEN_HANG]` 있으면 terminal + 마커는 사용자 표시에서 제거.
- **A(UI)**: 업로드 존에 "텍스트 아웃라인 권장 · 열기경고 파일 처리불가" 힌트.

### 5. ★ NAS 경로 직접 분석 (대용량, A안) — 신규 기능
- 대용량(고해상·배치 100MB+)을 브라우저 업로드 없이 처리. **CF/청크/50MB 전부 우회**.
- **입력폴더** `Z:\Designs\IA-입력` (appsettings `NasInputDir` override 가능).
- **에이전트**: 폴 3주기(~30초)마다 폴더 스캔 → `POST /api/ai-analysis/nas-listing` 보고(name/path/size/mtime).
- **서버**: `nas-listing`(GET/POST, settings 테이블 저장) + `from-nas`(선택 파일→pending, **경로는 에이전트 목록 값만 사용=주입 방지**). 라우트는 `/:id`보다 앞.
- **UI**: "NAS에서 분석" 버튼 → 목록 → 선택 → `iaeAddId`+`iaeRefresh`(업로드와 동일 탭 반영).
- **동적 타임아웃**: ExtractGroups `timeoutMinutes = clamp(2 + 파일MB/15, 2, 12)` (100MB≈8분). 대용량=hang 아니라 느린 것 → 여유.
- **검증**: end-to-end(dongsanplan.com) — 테스트파일→목록→from-nas→pending·NAS경로 확인·정리 완료.

## 진단: `C:\Users\user\Downloads\썬팅11-동산.ai`
- **100.47MB**(업로드 한도 2배) + **레거시 텍스트**(`Creator: Adobe Illustrator 13.0`=CS3/2007 생성 → 30.3 열 때 업데이트 모달). 크기+모달 이중 문제. 해결=아웃라인+이미지 다운샘플+"PDF 호환 파일" 해제로 50MB↓ or NAS 경로.

## 추출 품질 논의 (보류)
- ExtractGroups=**구조기반**(top-level 아이템=디자인·겹침병합 없음:258·완전포함만 흡수:319·아트보드 클램핑:285). 공간 클러스터링 없음 → 과분할·중복·경계걸침.
- 개선안: ①상류규약(아트보드=디자인) ②사용자 보정UI(합치기/나누기/삭제) ③근접 클러스터링. **ML 비권장**(라벨데이터 없음·학습파이프라인 기폐기). **거래처 방식 제각각 → ①강제 불가 → 보류.** 재개 시 **②사용자 보정UI**가 최선(추출 로직 안 건드리고 사람이 확정).

## 주의사항 / 교훈
- **IA JSX 런타임 = 실행 exe의 BaseDirectory = `bin\Release\net8.0\win-x64\publish\`**(repo publish·NAS 아님). SheetLayout은 csproj 미포함이라 dotnet publish가 안 건드림→수동 동기화 필수. → [[feedback-ia-jsx-runtime-path]]
- **열기 모달(폰트·레거시텍스트·프로파일)=헤드리스 COM hang**, DONTDISPLAYALERTS 무력. 파싱 프리체크 불가(boilerplate 오탐) → **E(타임아웃 우아실패)로만 대응**. 자동 열기는 워치도그(Win32 모달 자동수락)뿐.
- **멀티세션 배포 충돌**: 내 배포가 타 세션에 덮여 apex 롤백됨(취소 엔드포인트 404로 발각). → **커밋+push-to-main(superset) 후 배포** 필수.
- 브라우저 "업로드 무반응"은 대부분 그 탭/파일 문제(코드·prod 정상 실증).

## 다음 세션 TODO (선택)
1. **추출 보정 UI**(합치기/나누기/삭제) — 추출품질 개선 권장 경로.
2. 사용자 실물 검증: 돔보 20mm·재단선 회전·mm 단위 (모아찍기/개별 실출력) / 100MB 썬팅=NAS경로+아웃라인.
3. (옵션) 업로드 한도 상향은 NAS 경로로 대체됨.
