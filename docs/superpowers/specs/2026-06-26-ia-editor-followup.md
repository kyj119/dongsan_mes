# IA 편집기 — 실사용 피드백 후속 (다음 세션 작업 명세)

> **✅ 2026-06-26 구현 완료·prod 배포·실렌더 검증: W1·W2·W3·W4·W6·W7** (커밋 `0f775f6a`+`eef5cbc6`, web dep `ac51753e`, 에이전트 PID 43588 로컬 단일, smoke 101/101).
> - **W3 핵심 정정**: spec의 "÷ vs × 반대방향" 진단은 **오진**. 용준님 의도(1/N 축소본 마감·돔보 비율보정)=현행 ÷N이 정답. **실제 버그=마감(finishing)·여백(margin)이 ÷scaleFactor 누락**(target·offset·돔보만 적용)→scale>1에서 마감 N배 과대. 수정=마감·여백 ÷scaleFactor(scale=1 noop). E2E: scale=10·마감4cm→height 9.2(=8.8+0.4, 구버그면 12.8) ✅.
> - **W7**: 둘레 재단선(§5 cutlines)·DXF만 trim 게이트, 마감 접는선(§5a-2)은 유지. E2E: trim=OFF→dxf 없음, trim=ON→dxf 있음 ✅. SheetLayout(네스팅)은 재단 레이아웃 특성상 미변경.
> - **W2**: jpg_base64 result_json 미저장(jpg_r2 R2 blob 서빙)·미리보기 1h TTL·POST /process/clear(이력 비우기). E2E: base64 없음·jpg_r2 있음·clear deleted=16 ✅.
> - **W1**: named Mutex 단일 인스턴스(2번째 자동종료 검증)·PID/경로 배너·agent.log heartbeat·운영 publish=로컬 단일(Z 폐기) 문서화.
> - **W5(대지편집 폐기·네스팅 탭 신설)**: 큰 재설계+회귀 위험 → **착수 보류, 범위 재확정 대기**(아래 W5 참조).

- **작성일**: 2026-06-26 (P1·P2·P3 완료 후 용준님 실사용 피드백 7건 → 진단·정리. **W1~W7(W5 제외) 구현 완료**)
- **선행 정본**: `memory/project-ia-editor.md` 맨끝(P1/P2/P3 완결), spec `2026-06-25-ia-editor-eps-export.md`·`-p1-improvements.md`·`-p2-p3.md`
- **핵심**: 기능은 대체로 동작(prod E2E 통과). 피드백은 **운영(배포 위치)·데이터 관리·UX 개념 혼란**이 주류.

---

## 진단 요약 (용준님 피드백 ↔ 원인)

| 작업# | 피드백 | 진단 | 성격 |
|-------|--------|------|------|
| **W1** | 가공 EPS 저장 안 됨 + exe 문구 없음 (구 4·5) | **운영 문제**: 용준님 운영 위치 `Z:\…\publish`=**구버전(6/19)**이라 process-queue 모름→반응 없음. 새 코드는 제 로컬 `bin\Release\publish`(PID 9092)에만 있어 거기서 처리됨(E2E 통과). **에이전트 2개 동시 실행**(9092 로컬 + 18044 Z) = prod 큐 경쟁 | 운영/배포 |
| **W2** | 데이터 어디 남나 + DB 부하 (구 2·3) | `ia_process_jobs` **무한 누적**(정리 0)·result_json에 **jpg_base64(행당 17~91KB)** 영구 저장→D1 비대. 미리보기 잡(일회성)도 영구 | 데이터 관리 |
| **W3** | 파일배율 적용 시 목표크기가 늘어야 (구 1) | **개념 반대**: 현재 `scaleFactor`는 target·마진·돔보를 `÷scaleFactor`(소스 1/N 축소본 보정). 용준님 멘탈모델=출력 크기 ×배율 | UX 개념 |
| **W4** | 전체 가공 후 하나하나 받아야 불편 (구 2) | 일괄 가공은 되나 결과를 그룹별 개별 다운로드. 한번에 설정→가공→**한번에 받기** 흐름 부재(ZIP 자동화 미흡) | UX 흐름 |
| **W5** | 대지편집 드래그/배치 부자연 (구 6) | Konva 자유드래그 한계. **검증된 `orderForm/sheet.js` 네스팅** 활용 요청 | UX 재설계 |
| **W6** | "규격으로 채우기" 제거 (구 7) | 단일 가공 규격 프리셋(R2-2) 불필요 — 제거 | 제거 |

---

## W1. 배포 위치 통일 + 단일 에이전트 (최우선)

### 현상
- 운영 publish 위치 2곳 혼재: 용준님=`Z:\Designs\IllustratorAutomat\publish\`(MEMORY 핵심환경에도 이 경로), 이번 세션 작업=로컬 `C:\Users\user\dongsan_mes\IllustratorAutomat\bin\Release\net8.0\win-x64\publish\`.
- Z publish = **6/19 구버전**(exe·jsx 모두). 이번 Export-first·P1·P2·P3 코드 전무.
- 에이전트 2개 동시 실행 중(로컬 PID 9092 최신 + Z PID 18044 구버전) → 같은 prod 큐 경쟁.

### 작업
1. **운영 publish = Z 단일로 못박기**(MEMORY 핵심환경 = `Z:\…\publish`가 정본). 로컬 빌드 산출물을 Z로 동기화:
   ```powershell
   Get-Process IllustratorAutomat | Stop-Process -Force   # 양쪽 다 종료
   cd C:\Users\user\dongsan_mes\IllustratorAutomat; dotnet publish -c Release
   robocopy "<로컬 publish>" "Z:\Designs\IllustratorAutomat\publish" /MIR /XF appsettings.json ia_params.json *.log
   # Z appsettings ErpApiUrl=prod 확인 후 Z exe 단일 실행
   ```
2. **단일 인스턴스 가드**: `Program.cs` 시작 시 named `Mutex`로 중복 실행 차단(이미 떠 있으면 "이미 실행 중" 출력 후 종료).
3. **시작 가시성**(구 5): 콘솔 시작 배너 + 상태 로그 파일(`publish\agent.log`) 또는 트레이 아이콘. 용준님이 "도는지" 즉시 확인 가능하게.
4. ⚠️ **W1 완료 후 가공 EPS 저장(구 4) 재검증** — Z 최신 단일 에이전트로 실파일 1건 E2E.

### 배포 프로세스 재정립 (재발 방지)
- 이후 에이전트 배포 = **반드시 Z publish 동기화**. 로컬 publish는 빌드/검증 전용. `IA_EDITOR_USAGE.md`·MEMORY에 명시.

---

## W2. 데이터 위치 + DB 정리 정책

### 데이터 위치 (현황 문서화)
| 데이터 | 위치 |
|--------|------|
| 일반 가공 EPS/DXF/JPG | `Z:\DESIGN\가공\{yyyy}\{MM}\{dd}\process_{잡ID}\` (NAS) `Program.cs:1579` |
| 다운로드용 사본 | R2 `render-outputs/process/{잡ID}/render.{kind}` |
| 미리보기 JPG | `%TEMP%\IllustratorAutomat\process_preview_{잡ID}\` (임시) + D1 `result_json.jpg_base64` |
| 소스 .ai 임시 | `%TEMP%\IllustratorAutomat\process_{잡ID}\` |
| 잡 메타·결과 | D1 `ia_process_jobs.result_json` (**jpg_base64 포함 → 비대 원인**) |

### 작업 (D1 비대 해소)
1. **jpg_base64를 D1에서 분리**: 썸네일도 R2로(`render-outputs/process/{id}/thumb.jpg`), `result_json`엔 r2 키만. `GET /process` 목록·이력은 R2 키로 `<img>`(인증 blob) 또는 thumb 다운로드. → result_json 수십KB→수백B.
2. **미리보기 잡 정리**: preview_only 잡은 done 후 result 확인 즉시 또는 **단기 TTL(예: 1시간)**로 자동 삭제(배치 또는 다운로드 후 DELETE). 영구 누적 방지.
3. **오래된 가공잡 정리**: N일 경과 done 잡 자동 정리(설정 가능) 또는 수동 "이력 비우기". 현재 15행 누적분 정리.
4. (선택) `ia_process_jobs` 행수·R2 용량 모니터링.

---

## W3. 파일배율 의미 재정의 (개념 충돌)

### 현상
- 현재 `scaleFactor`(jsx:256,291,733): `targetW * 10 * ptPerMm / scaleFactor` — 소스가 실물의 1/N 축소본일 때 **소스 좌표로 환산(÷)**. 마진·돔보도 ÷scaleFactor. 출력 후 실물은 N배.
- 용준님 멘탈모델: **"파일배율 = 출력 크기 배율"** → 배율 적용 시 목표크기가 **늘어나야**.
- 즉 현재(÷, 축소본 보정)와 기대(×, 출력 확대)가 **반대 방향**.

### 작업 (brainstorming 선행 권장 — 용도 확정)
- 용준님과 "파일배율" 용도 재확인:
  - (A) 출력 크기 배율로 재정의: 목표크기 × 배율 (직관적). 단 기존 "소스 1/N 축소본 보정"(대지편집 현수막 등) 용도와 분리 필요.
  - (B) "파일배율"(소스 축소본 보정)과 "출력 배율"(크기 ×)을 **별도 입력**으로 분리·레이블 명확화.
- 결정 후 jsx/프론트 재설계. **단일 가공·대지편집·네스팅의 scale_factor 의미 일관성** 확보(현재 경로마다 미묘).

---

## W4. 전체 가공 "한번에 설정 → 한번에 받기"

### 현상
- `iaeBatchProcess`(iaEditor.js:880): 그룹별 settings로 순차 큐잉. 완료 후 결과를 **그룹별 개별 다운로드**(하단에서 하나하나). "전체 가공"인데 받기가 분산 = 구조적 불편.

### 작업
1. **일괄 받기 자동화**: 전체 가공 완료 시 **자동 ZIP 일괄 다운로드**(또는 큰 `ZIP 전체 받기` 1버튼). `iaeBatchZip` 이미 있음 → 완료 후 자동 호출/강조.
2. **공통 설정 옵션**: "모든 그룹에 현재 설정 적용" 토글(목표크기·마감·돔보·배율을 일괄 동일 적용) — 그룹마다 따로 설정 불필요. 또는 그룹별 설정 요약 테이블 1화면.
3. 진행 표시·완료 후 액션(ZIP 받기) 명확화. 라벨 "전체 가공"의 의미 안내(툴팁/가이드).

---

## W5. 대지편집 배치 → orderForm 네스팅 활용

> **⏸️ 2026-06-26 결정: 별도 세션·brainstorming 먼저** (용준님). 대지편집엔 N4 주문연결·이형 수동 인터록·N5 단일그룹 돔보·N1 자유대지·N2 마감/돔보가 **전부 prod 라이브** → "폐기" 범위가 회귀 위험 큼. 다음 세션에서 brainstorming 스킬로 **폐기/유지 범위 확정**(네스팅 부분만 교체 vs 전체 폐기·주문연결 재구현) 후 착수. 미착수.

### 현상
- 대지편집 Konva 자유드래그(R3a 스냅 추가해도) 부자연. 용준님: **검증된 네스팅 기능(주문서 작성)** 활용 요청.
- 기존 자산: `src/scripts/orderForm/sheet.js`에 네스팅(shelfBinPack·드래그·시트) — 주문서에서 검증됨.

### 작업 (brainstorming/설계 선행)
- 방향 결정: 대지편집 자유드래그 캔버스를 **orderForm 네스팅 방식(자동 배치 중심 + 최소 조정)**으로 대체/통합.
- 옵션:
  - (A) orderForm/sheet.js 네스팅 UI를 ia-editor에 이식·공용화.
  - (B) ia-editor 대지편집을 폐기하고 "네스팅" 탭을 orderForm 컴포넌트 재사용으로 재구성.
- 기존 ia-editor 네스팅(N3·이형 인터록·R3b)과의 관계 정리(중복/대체). **이미 ia-editor에도 shelfBinPack·MaxRects가 있으므로**, 핵심은 "자유드래그 UX" 대신 "자동배치+간단조정 UX"로 전환.
- ⚠️ 회귀 주의: 기존 대지편집 사용자/주문 연결 경로.

---

## W6. "규격으로 채우기" 제거

### 작업 (단순)
- `iaEditor.js` `iaeSizePresetOptions`(~447)·`iaeSizePreset` select(~488)·핸들러(~572) 제거. 단일 가공 인스펙터에서 규격 프리셋 드롭다운 삭제.
- 네스팅 패널의 규격 프리셋(롤폭/평판)은 **유지**(거긴 유효). 커스텀 규격(R2-2)도 네스팅에만.

---

## W7. 재단선 = 돔보(trim) 연동

### 현상
- 재단선은 두 곳에서 생성: ① EPS 내부 `cutlines` 레이어(`ProcessOrderItem.jsx` §5, ~339~399·548) — 마감 여백/오프셋 둘레 ② **DXF 재단선**(~802 `if (outputDxf && !preview)`) — dxfOutput 있으면 항상. **둘 다 돔보(trim)와 무관하게 생성**.
- 돔보 마크(§9.5, ~729)만 `trim=true` 조건.
- 용준님: **재단선은 돔보 켰을 때만** 필요(돔보 + 재단선 = 재단 작업 세트). 돔보 안 켜면 재단선·DXF 불필요.

### 작업
- 재단선(cutlines)·DXF export를 **`trim=true` 조건으로 게이트**: trim=false → EPS에 재단선 없음·DXF 미생성(EPS+JPG만), trim=true → 재단선+돔보+DXF 세트.
- ⚠️ **마감(finishing) 접는선/도련 재단선**과 돔보 재단선의 용도 구분 확인 — 마감 시 접는선은 별개 필요 가능(용준님 확인). 기본 방향: **돔보 토글 = 재단선 포함**.
- 프론트(`iaEditor.js`): 돔보 토글이 곧 재단선 on/off. **DXF 다운로드 버튼은 trim 켰을 때만 노출**(돔보 없으면 DXF 자체가 없음).
- 네스팅(`SheetLayout.jsx`)도 동일 정책(돔보=재단선) 적용 검토.

---

## 다음 세션 우선순위
1. **W1**(긴급): Z 동기화 + 단일 에이전트 + 가공 재검증 — 이게 안 되면 실사용 불가
2. **W2**(높음): jpg_base64 R2 분리 + 미리보기 TTL + 누적 정리 — D1 비대 시한폭탄
3. **W6**(빠름): 규격 채우기 제거
4. **W7**(빠름): 재단선=돔보 연동 (trim 게이트 + DXF 버튼 조건부)
5. **W4**(중): 전체 가공 한번에 받기
6. **W3**(중, brainstorming): 파일배율 의미 재정의
7. **W5**(중·큼, 설계): 대지편집 → orderForm 네스팅 (회귀 주의, 별도 세션 가능)

## ⚠️ 즉시 위험
에이전트 2개 동시 실행(9092·18044)이 prod 큐를 경쟁 폴링 중. 다음 세션 전이라도 하나로 정리 권장. ia_process_jobs 15행(테스트+실사용 혼재) 잔존.
