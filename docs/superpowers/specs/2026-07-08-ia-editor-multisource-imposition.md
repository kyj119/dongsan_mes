# IA 편집기 멀티소스 임포지션(모아찍기) — 설계 spec

**상태**: brainstorming 완료, 착수 대기 (미해결 2건 사용자 확정 필요)
**작성**: 2026-07-08
**연관**: [[project-ia-editor]], `2026-06-25-ia-editor-eps-export.md`(Export-first), `0316_sheet_layouts.sql`

## 배경 / 목적

여러 디자인 파일에서 원하는 아트보드를 골라 **한 판(시트)에 모아 배치하고, 전체에 재단 마크(돔보)를 넣어 한 번에 출력**하는 인쇄 현장의 **모아찍기(임포지션)** 도구. 기존 네스팅(`SheetLayout.jsx`)은 "한 파일·동일 품목"만 가능한 단일소스 구조 → 멀티소스로 확장.

## 확정 요구사항 (사용자 답변 2026-07-08)

| 항목 | 결정 |
|------|------|
| 흐름 | 다중 파일 업로드 → 파일별 아트보드 썸네일 나열 → 다중 선택 → 조각별 배율/개수/도련 설정 → 자동 패킹 → 미리보기 → 돔보 → 다운로드 |
| 산출물 | **EPS/JPG/DXF 다운로드** (주문·카드 미생성, Export-first) |
| 혼합 | **이종 혼합 + 동일 복제 둘 다** (동일품목 가드 제거) |
| 배율 | 조각별 **확대/축소 배율 ×N** (배치크기 = 원본 × N) |
| 개수 | 조각별 복제 수량 |
| 판 규격 | **롤**(폭 90·105·127·137·152cm) / **평판**(900×1800·1200×2400) 모드 선택 |
| 도련 | 조각별 **재단 여백(bleed)** 추가 |
| 돔보 | **조각별 재단 라인** + **전체 판 둘레 인식용 검정 원** |

## 확정 세부 결정 (2026-07-08)

### D1. 배치 미리보기 = 하이브리드
웹 썸네일 배치(즉시 조정) + "실제 렌더" 버튼(SheetLayout `preview_only`, JPG-only 조기종료 신규). 현재 웹 미리보기(`iaeNestRenderPreview`)는 파란 박스만 → 썸네일 채우기 개선 포함.

### D2. 조각별 재단 라인 = DXF 조각 외곽선 (기존 재사용)
사용자 확정: "재단 라인"은 **조각 외곽 재단선이며 DXF 파일에 포함되는 선**. 기존 SheetLayout DXF export가 이미 조각 경계 재단경로를 생성 → **신규 생성 불필요**. 멀티소스에서 각 조각 외곽이 올바른 소스 기준으로 DXF에 나오게 배관만 보장. EPS 인쇄면 별도 재단선 불요. 전체 판 돔보 검정 원(기존)과 함께 = 사용자의 "돔보(조각별 재단선 + 전체 원)" 정의 충족. → **P4 부담 축소: 신규 마크 그리기 없음, 멀티소스 DXF 정확성 검증만.**

## 기존 현황 (Explore 조사 2026-07-08, file:line 근거는 조사 리포트)

| 부분 | 판정 | 핵심 |
|------|------|------|
| 아트보드 나열(멀티파일 통합) | ✅ 이미 됨 | `iaeCanAllGroups`(iaEditor.js:1459) — 모든 done 파일 그룹 평탄화, `key=fid:gi` |
| 전체 판 돔보 검정 원 | ✅ 이미 됨 | SheetLayout.jsx:347-378, placements 합집합 둘레 기준(소스 무관) |
| 자동 패킹(롤/평판) | ✅ 이미 됨 | `shelfBinPack`(orderForm/sheet.js), 롤 폭고정·평판 W×H |
| DB 스키마 | ✅ 멀티소스 예견 | `source_analysis_ids` JSON 배열(0316:14), placements에 `analysis_id` 예약(0316:5) → **마이그 불필요** |
| 멀티소스 배치·렌더 | ⚠️ 신규 | 단일소스 가드 4곳 + SheetLayout 단일 `source` |
| 조각별 재단 라인 | ⚠️ 신규 | 현재 전체 원만 |
| 판 전체 실렌더 미리보기 | ⚠️ 신규 | SheetLayout에 preview(JPG-only) 모드 없음 |

### 단일소스 가드 4곳 (제거 대상)
1. `iaeCanReassignSheets`(iaEditor.js:1565) — anchor 축소로 타 파일 조각 시트에서 배제
2. `POST /sheets/:id/render`(workbench.ts:526) — `aids.length !== 1` 거부
3. `GET /render-queue`(workbench.ts:598-602) — `aids[0]` 단일만 resolve
4. `SheetLayout.jsx`(49,120,231-238) — 단일 `source` open, group_index로만 복제

## 아키텍처 결정

**기존 `sheet_layouts` + `SheetLayout.jsx` 확장** (신규 테이블/큐 미생성). placement에 조각별 `analysis_id` 추가 → SheetLayout이 소스별 문서를 열어 올바른 소스에서 복제. 대지편집 탭에 "임포지션 모드" 추가.
- 마이그레이션 불필요(스키마가 이미 멀티소스 예견).
- 돔보(전체 원)·레이어·shelfBinPack·아트보드 나열 재사용.

## Phase 계획 (대형 — 세션 분리 권장)

### P1 멀티소스 배관 (백엔드+jsx+에이전트)
- 프론트: `iaeCanReassignSheets` 멀티소스 모드 우회, `iaeCanSyncSheet`(iaEditor.js:1581) placement에 `analysis_id/fid` 실어보내기, `iaeCanSheetExportBody`(1758) 조각별 소스맵 전송
- 백엔드: `workbench.ts:526` 가드 완화, `render-queue`가 `sources[]`(analysis별 file_path) 반환
- 에이전트: `ProcessSheetRenderAsync`(Program.cs:1356) 여러 .ai 다운로드/로컬화, ia_params에 `sources[]` + placement별 소스 인덱스
- SheetLayout.jsx: 소스별 `app.open` + placement의 소스 참조로 복제(단일 source 제거)

### P2 임포지션 UI
- 다중선택 팔레트(iaeCanAllGroups 기반, 체크박스 다중선택)
- 조각별 인스펙터: 배율(×N)·개수·도련(bleed)
- 판규격 선택(롤 5종 / 평판 2종 프리셋)
- 자동 패킹(shelfBinPack, 조각 크기 = 원본 × 배율)

### P3 미리보기 (하이브리드 확정)
- 웹 썸네일 배치도: `iaeNestRenderPreview`를 파란 박스 → 조각 실제 썸네일 채우기로 개선(즉시)
- "실제 렌더" 버튼: SheetLayout.jsx에 `preview_only`(JPG-only, EPS/DXF saveAs·R2·이력 스킵) 조기종료 모드 신규 → 출력 전 실물 판 이미지 확인

### P4 출력/다운로드 E2E (D2=DXF 기존 재사용, 신규 마크 없음)
- 재단선(조각 외곽 DXF)·전체 판 돔보 원 = 기존 SheetLayout 재사용, 신규 생성 없음
- prod 실렌더 검증: 이종 2+ 파일 → 한 판 EPS/JPG/DXF, **조각별 올바른 소스 복제** + 전체 돔보 원 + **각 조각 외곽이 DXF 재단경로에 정확히** 포함되는지 확인

## 리스크 / 주의
- **파일배율(realSize) 최근 수정과 상호작용**: 임포지션 배율(×N)은 placement 크기로 처리(SheetLayout이 width_cm로 스케일) — ProcessOrderItem의 realSize 3-pass와 별개 경로. 혼동 주의.
- **비정사각형 조각**: shelfBinPack은 바운딩박스 패킹(이형 true-shape 미지원, 기존 제약 유지).
- **에이전트 상시 기동 필요**: 렌더는 로컬 IA exe(현재 PID 48848). 종료 시 재기동.
- DXF 재단경로 중복(조각 경계 vs 조각별 재단라인) 검토 — D2에서 결정.
