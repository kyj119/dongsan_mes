# 핸드오프: Flexi 네스팅 멤버 추적 — 배포 인계 (2026-06-21)

> 다른 세션/담당자가 이 문서만 보고 **MES 배포 + 전사 PC 설치**를 끝낼 수 있도록 정리.
> 작업 자체(코드·검증)는 완료, **prod 미배포** 상태. 카드 매칭(B)은 보류.

## 1. 무엇을 한 작업인가
전사장비 Flexi(Production Manager)가 RIP 단계에서 여러 작업을 한 시트로 합쳐 출력("네스팅(N개 작업)")하면
RIPLOG.HTML 인쇄 블록엔 라벨만 남아 멤버 추적이 안 됐음. → **립핑(RIP) 블록의 실제 파일명을
직전 인쇄 이후로 모아 중복제거**하면 멤버 복원 가능(“N개 작업”의 N이 내장 체크섬, 보류 재출력은 멤버 상속).
LogWatcher 파서가 이를 분해해 `print_events.nest_members`(JSON)로 저장하고 /production 에서 표시.

## 2. 현재 상태
- 코드 커밋 완료: **`e1be4a05`** (브랜치 `feat/ia-editor-canvas-n1`), 7개 파일만:
  - `LogWatcher/Parsers/FlexiHtmlParser.cs` (네스트 분해: 립핑버퍼·dedup·N체크섬·재인쇄상속, UTF-8 바이트오프셋 수정)
  - `LogWatcher/PrintLogParser.cs` (PrintEvent: IsNest/NestDeclaredCount/NestMembers)
  - `LogWatcher/MesApiClient.cs` (payload에 nest_members)
  - `LogWatcher/Core/WatcherManager.cs` (--test 멤버 출력)
  - `src/routes/printEvents.ts` (단일·배치 INSERT에 nest_members 저장)
  - `src/scripts/production.js` (출력이력에 네스트 뱃지 + 멤버 펼치기)
  - `migrations/0334_print_events_nest_members.sql` (컬럼 추가)
- 검증 완료: 과거 RIPLOG로 `--test` → 네스트 **8/8 정확 복원**, 로컬 `/production` 표시 확인. C# 빌드·`tsc --noEmit` 0오류.
- **미배포**: prod 코드·마이그 미적용. 전사 PC LogWatcher 미설치.
- 미푸시: 로컬이 origin/feat-branch보다 앞섬(내 커밋 포함). 배포 후 push 필요.

## 3. ★ MES 배포 (이것부터)
> **순서 필수: 마이그레이션 먼저, 코드 나중.** 코드 먼저 가면 새 INSERT가 없는 컬럼을 참조해 **전 장비 출력이벤트 적재가 깨짐.** 마이그 먼저면 구코드는 컬럼 무시라 무해.

```bash
# 1) 마이그 0334 (execute --file = 팀 관례; migrations apply 추적불일치 회피)
wrangler d1 execute webapp-production --remote --file migrations/0334_print_events_nest_members.sql

# 2) 빌드 + 배포 (프로젝트명 webapp / HEAD 커밋이 한글 → --commit-message ASCII 필수)
npm run build
wrangler pages deploy dist --project-name webapp --commit-message "deploy: flexi nest tracking"

# 3) 푸시 (deploy != push)
git push origin feat/ia-editor-canvas-n1

# 4) 검증: /production 출력이력 정상 로드. (이후 전사 네스트 출력 시 멤버 표시)
```
- 배포 대상 = 현재 HEAD. 다른 세션 미커밋분이 있으면 함께 실리니, **트리가 깨끗(다른 세션 정지/커밋 완료)할 때** 배포할 것.

## 4. ★ 전사 PC LogWatcher 설치 (MES 배포가 prod에 올라간 뒤)
- 준비된 패키지: **`C:\Users\user\flexi-sample\transfer-logwatcher\`** (self-contained + nssm + flexi용 equipment.json + install-transfer.bat + 상세 README)
- 절차 요약:
  1. 전사 PC가 **실시간 기록하는 RIPLOG.HTML 경로** 확인 (Z:\…는 NAS 사본일 수 있음)
  2. 패키지 폴더 → 전사 PC `C:\LogWatcher\` 복사
  3. `equipment.json` 의 `log_path` 를 1의 경로로 교체(UTF-8 저장), equipment_id 기본 `TRANSFER-01`
  4. `install-transfer.bat` **관리자 권한** 실행 → `--test`로 `[NEST] 선언 N/복원 N` 확인 후 서비스 설치·시작
  5. 검증: `--list` OK → /production 에이전트 온라인 → 전사 네스트 1건 출력 시 `네스팅 N개`+멤버 표시
- 🔴 **네트워크 경로 주의**: RIPLOG가 매핑드라이브(Z:)면 기본 LocalSystem 서비스가 못 읽음 → log_path를 UNC(`\\192.168.0.122\...`)로 + `nssm set LogWatcher ObjectName ".\사용자" "비번"`. 로컬(C:/D:)이면 무시.
- 상세·문제해결: 패키지 안 **`README_전사배포.md`**

## 5. 동작/주의 메모
- 서비스 시작 시점 **이후 새 출력만** 감지(과거분 미적재) — 처음 켜도 과거를 안 쏟음.
- 전사 4패스 / 4패스 신형 두 대가 같은 RIPLOG 공유 → 한 watcher(TRANSFER-01)로 집계(개별 장치명은 printer_name에 남음).
- appsettings.json 의 ParserType/PrintLogPath/EquipmentId 등은 **레거시 필드, universal 모드에서 무시**(equipment.json 우선). MesApiUrl=prod, ApiKey=`dongsan-rip-agent-2026`.
- 표시는 하위호환: 마이그 전이면 nest_members 없음 → 기존 동작 그대로.

## 6. 보류 (B: 멤버 → 카드 자동매칭)
전사 파일명이 `YYYYMMDD-NNN-FFF` 규칙 이전이라 `resolveCard` 매칭 불가. 사용자가 **추적만 목표**로 확인 → 매칭은 보류.
(향후 하려면: 이름·규격·납기 기반 매칭 또는 전사도 IA 규칙 파일명 사용.)

## 7. 분석 산출물(참고, 외부 폴더 `C:\Users\user\flexi-sample\`)
- `nest_report.py` — RIPLOG.HTML → 네스트 멤버 리포트 생성(재사용 가능)
- `nest_membership.txt` — 과거 8건 복원 결과
- `parse_rip.py` / `rip_timeline.txt` — 블록 타임라인 분석
- `transfer-logwatcher/` — 전사 배포 패키지
