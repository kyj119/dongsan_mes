# IA 디자이너 JSX 세션 루프 고도화 (2026-07-20 브레인스토밍)

관련: `project-ia-designer-loop` · `project-ia-web-sunset` · `project-ia-editor` · `feedback-ia-jsx-runtime-path`
정본 상위 spec: `2026-07-16-ia-designer-session-loop.md`

## 배경 / 진짜 목적
웹 `/ia-editor`(헤드리스 무인 처리)는 실사용 ≈0으로 게이트 폐기. 대체 = **디자이너 세션 루프**(사람-루프): 디자이너가 일러에서 직접 파일을 열어 검수 → JSX 미니창(`mes-core.jsx` 가공 / `mes-sheet.jsx` 판짜기) → Z: 폴더 산출물+manifest(커밋 마커) → 에이전트 ingest → `designer_intakes`(대기함) → 주문서 프리필.

**현재 = v0.1.0 PoC, 실파일 동반 테스트/판정 미완.** 고도화의 진짜 목적 = 이 PoC 루프를 **실운영(일 30건+) 감당 가능한 품질/자동화 수준**으로 끌어올리기. 단, 검증 안 된 토대 위 대량 구현은 리스크 → **출력 기하를 바꾸는 항목은 spec 확정만, 저위험 additive만 선구현**.

## 고도화 4축 인벤토리 (코드 기반 격차 · 위험도 · Phase)

### A. 세션루프 MES 구조화 (워크플로우) — web-sunset 지목 우선순위
| 항목 | 격차 근거 | 위험 |
|---|---|---|
| A1 1파일 다중디자인 자동분할 | `mes-core` 1선택=1등록 수동반복. web-sunset ① 격차 | 중 |
| A2 무가공(-1)·외부파일 즉시첨부 대체 | 대기함이 -3 완성본만 대체, -1 미대체(web-sunset ③) | 중 |
| A3 진행상태·이력·되돌리기 | alert 단발, 세션 내 재작업/취소 경로 없음 | 중 |
| A4 배치/큐(일 30건+) | 반복 작업 자동화·단축키 확장 부재 | 중 |
| A5 지표 대시보드 | `intakes/stats` 존재하나 생산성 가시화 UI 없음 | 저 |

### B. 판짜기 패킹 지능 (자재절감)
| 항목 | 격차 근거 | 위험 |
|---|---|---|
| **B0 자재효율% 표시·지표** | 없음 → **★이번 세션 구현** | 저 |
| B1 회전 최적화 | `mes-sheet:236` 폭초과 시에만 90° | 중 |
| B2 MaxRects/Guillotine 패킹 | shelf 단순배치(`:239` 높이내림 행채움) | 중 |
| B3 이형 true-shape(NFP) | 전수동(일러 끼워맞춤). spec §9-1 = 현상유지 확정 | 고 |
| B4 공유 재단선(인접 맞물림) | 조각별 bbox rect(`:336`), 간격0 공유 없음 | 중 |
| B5 소재 혼재 가드 | intake에 material 필드 없음(데이터 모델) | 중 |

### C. 출력 정합·프리플라이트 (품질/RIP)
| 항목 | 격차 근거 | 위험 |
|---|---|---|
| **C0 프리플라이트 경고** | 없음 → **★이번 세션 구현**(원본RGB·미아웃라인·미임베드) | 저 |
| C1 저해상 래스터 검사 | ES3 RasterItem 픽셀치수 직접노출 난 → 별도 기법 필요 | 중 |
| C2 도련(bleed) 처리 | 마감여백만, 인쇄 도련 없음 → **출력 기하 변경** | 중 |
| C3 PDF 출력 | EPS만. RIP는 PDF 수용(spec 배경) → 핸드오프 계약 변경 | 중 |
| C4 별색/overprint 정책 | 검사·정규화 없음 | 중 |

### D. 코드 구조 정비 (유지보수) — 착수 비용 절감 선행 권장
| 항목 | 격차 근거 | 위험 |
|---|---|---|
| D1 공유 lib `mes-lib.jsx`($.evalFile) | 유틸·돔보 블록 3중복(core/sheet/ProcessOrderItem) | 중 |
| D2 돔보/마감 상수 SSOT | 17/6/60/500mm 하드코딩 3곳 이원화 | 중 |
| D3 로깅 | alert만, 파일 로그 없음 | 저 |
| D4 배포 안전 | 런타임 경로 함정(`feedback-ia-jsx-runtime-path`)·테스트 하네스 부재 | — |

> ⚠️ D1은 "저위험"으로 보이나 **3파일 동시수정 + Z: 배포 파일 추가 의존 + 테스트 하네스 부재**로 실제 최고 회귀리스크 → 별도 세션에서 신중히.

## 이번 세션 구현 & 배포 (2026-07-21 갱신)
- **C0 프리플라이트** (`mes-core.jsx`): 원본 RGB문서·아웃라인 잔여 텍스트·미임베드(placed) 이미지 → 완료 alert 경고 + `manifest.preflight{source_rgb,remaining_text,linked_images}`. **✅ Z: 동기화·검증 완료**(해시 일치·BOM 보존·백업 `mes-core.jsx.bak-20260721`). ES3 문법 게이트(node --check) + **COM 런타임 검증**(3 API 표현식 유효: CMYK doc isRGB=false·outline후 textFrames=0·placedItems.length OK) 통과.
- **B0 자재효율%** (`mes-sheet.jsx`): ⚠️ **이미 P1a**(`session/ia-web-sunset` `69f6535c`, Z: 07-20 배포본)가 `sheetShelfBinPack`+효율%로 구현·동기화 완료 → 이번 세션 feat/dept-pnl 위 재구현은 **중복**이라 되돌림. **Z: mes-sheet=P1a 유지**. feat/dept-pnl의 mes-sheet는 P1a보다 뒤짐 → 실측 통과 후 `69f6535c`→main→feat 병합으로 정합(선점 금지).

**안전성**: 에이전트(`Program.cs:1042` permissive DOM 필드명 read→전체 forward)·서버(`workbench.ts:1158` `body.field` 화이트리스트)가 미지 manifest 필드 무시 → 400/격리 없음. 효과=디자이너 in-Illustrator alert(즉시). MES persist는 후속(서버 컬럼).

**배포 blast radius 0**: 디자이너 JSX는 npm/csproj 무관, 스텁이 매 실행 `$.evalFile(Z:...)` → 재설치·에이전트 재시작 불요, 다음 실행부터 자동 반영.

## 우선순위 제안 (다음 세션 이후)
D1·D2(공유lib·SSOT) → A(구조화 A1 다중분할·A2 즉시첨부) → B(B1 회전·B2 MaxRects, B0 지표를 MES 표시로) → C(C2 도련·C3 PDF는 출력계약 변경이라 RIP 협의 후).

## 열린 결정 (다음 브레인스토밍)
- A1 다중분할 트리거: 아트보드 기준? 사용자 다중선택 반복? 자동 그룹감지?
- C3 PDF: RIP가 EPS/PDF 중 무엇을 최종 수용? 병행 산출?
- B0 효율% → MES persist 시 `designer_intakes.efficiency_pct` 컬럼 추가 여부.
