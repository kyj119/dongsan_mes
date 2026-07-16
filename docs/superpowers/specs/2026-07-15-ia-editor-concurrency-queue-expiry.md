# IA 편집기 동시성·큐 만료 개선 — 설계 spec

**상태**: 결정 확정(2026-07-15) → 구현 착수
**작성**: 2026-07-15
**연관**: [[project-ia-editor]], [[feedback-ia-jsx-runtime-path]], `2026-07-08-ia-editor-multisource-imposition.md`, `routes/aiAnalysis.ts`, `routes/workbench.ts`, `IllustratorAutomat/Program.cs`

## 확정 결정 (2026-07-15)

| 항목 | 결정 |
|------|------|
| 구현 범위 | **A+B+C 전부** (자동만료 + 포이즌/즉시종료 + 취소 UI) |
| 에이전트 stop | **필수** — MES 만료·취소를 에이전트가 존중해 즉시 중단(현재 "MES 만료인데 iaautomat 계속 막힘" 해결) |
| `.eps` 방향 | **`.eps`·`.ai` 둘 다 분석 가능**해야 함 (거부 아님 → ExtractGroups `.eps` 지원) |
| 자동만료 임계 | **10분** |
| 다중 법인 | IA편집기는 **통합 사용**(법인 분리 안 함) → 에이전트/큐는 전 법인 통합 조회(ENT-3=통합 확정) |

### ★ 근본원인 (에이전트 stop의 핵심)
현재 만료·에러 경로가 전부 `retry_count < max_retries`면 **`pending` 재큐**(`aiAnalysis.ts:412`·`488-509`) → **진짜 terminal 취소가 없음**. MES가 만료 표시해도 재시도 한도 전이면 pending 복귀 → 에이전트가 재요청 → "MES 만료인데 iaautomat 계속 막힘". **해결 = terminal 상태(`cancelled`/`expired`, 재큐 안 함) 도입 + 에이전트가 무거운 COM 전 상태 재확인.**

## 배경 / 목적

IA 편집기(웹) 다수 사용자 → 파일 업로드·AI 분석·모아찍기 시트 렌더 요청. 이들을 **단일 IllustratorAutomat 에이전트 + 단일 Illustrator COM**이 순차 처리. 2026-07-15 운영 중 **죽은 pending 요청(#25, `.eps` 소스)이 큐 선두에서 종일 정체**하며 뒤의 모아찍기를 지연·차단하는 사고 발생. 다중 사용자 확대 시 한 명의 나쁜 잡이 전원을 막는 구조.

**목적**: (1) 정체·포이즌 잡 자동/강제 만료, (2) 다중 사용자 head-of-line blocking 완화, (3) 단일 에이전트 전제 견고화.

## 점검 결과 (2026-07-15, file:line 근거)

### 안전 확인 (조치 불요)
| 영역 | 근거 |
|------|------|
| 편집 캔버스·시트·설정 = 브라우저별 localStorage | `iaEditor.js:1639-1645` — 사용자 간 편집 충돌 없음 |
| 서버 잡 entity 격리 + source 소유검증 | `workbench.ts:398·442·789` — 법인 간 데이터·아트워크 유출 차단 |
| 에이전트 단일스레드 순차 | 공유 `ia_params.json`·단일 COM 레이스 없음 (단, 아래 CONC-2 전제) |
| 크래시 잡 리핑(processing/rendering 10분) | `aiAnalysis.ts:408-421`, `workbench.ts:611-621` — 재큐/error, retry_count로 무한재큐 방지 |

### 개선 대상 (심각도순)
| ID | 심각도 | 문제 | 근거 |
|----|--------|------|------|
| **EXP-1** | 높음 | `pending`/`queued`(미시작) 정체는 자동만료 대상 아님 → 포이즌 종일 방치 | 리퍼가 processing/rendering만 대상 |
| **EXP-3** | 높음 | 포이즌 pending이 세션당 retry 1회만 증가(에이전트 `processedAnalyses` 메모리) → 소진에 재시작 3회 | `Program.cs:936-941` |
| **HOL-1** | 높음 | 단일 에이전트+단일 Illustrator, `AI분석→시트렌더` 순차 → 한 명의 느린/죽은 잡이 전원 대기. 우선순위·대기순번 없음 | `Program.cs:184-195` |
| **EXP-2** | 중 | AI 분석 강제만료(취소) 수단 없음 — 잘못 올린 파일 못 지움 | ai_analysis cancel/delete 엔드포인트 부재(확인) |
| **ENT-3** | 중(조건부) | 에이전트 entity 범위. admin 전체모드(0) 아니면 타 법인 잡 영구 정체 | `workbench.ts:622` entityFilter + `entityFilter.ts:37` |
| **CONC-2** | 중~낮 | 에이전트 2중 실행 시 render-queue claim이 check-then-act → 동일 잡 이중 렌더 | `workbench.ts:650-652` |

## 개선방안 (Phase 구성)

### P0 — 자동만료 + 포이즌 즉시종료 (서버만, 최소 리스크) · EXP-1·EXP-3

가장 효과 대비 저비용. UI 무변경, 실제 발생 중인 "종일 큐 정체" 해소.

**P0-a. `pending`/`queued` 나이 기반 자동만료**
- AI 분석 리퍼(`aiAnalysis.ts:408-421`)에 조건 추가: `status='pending' AND updated_at < now-N분` → 기존 retry/requeue 로직으로 terminal error.
- 시트 리퍼(`workbench.ts:611-621`)에 조건 추가: `render_status='queued' AND updated_at < now-N분` → requeue_count 로직으로 error.
- **안전장치**: 리퍼는 **에이전트 폴 진입 시에만** 실행 → 에이전트 death 중엔 미실행 → 정상 대기 잡은 안 죽음. 살아있는데 N분+ 미시작 = 확정 포이즌/고아.
- 임계값 `N` = 기본 15분(조정 가능). 근거: 정상 에이전트는 폴 주기(10초)에 즉시 claim → N분 미시작은 비정상.

**P0-b. terminal 상태 도입 (재큐 안 하는 만료/취소)** — ★근본 수정
- 자동만료(P0-a)·수동취소(P2)는 `retry` CASE를 거치지 않고 **곧장 terminal**(`cancelled` 또는 retry_count=max로 `error` 고정)로 세팅. → pending 재큐 루프 차단 = "MES 만료인데 에이전트 계속 막힘" 해결.
- 에이전트 폴 `?status=pending`은 terminal을 제외하므로 재요청 안 함.

**P0-c. `.eps` 분석 지원 (거부 아님)** — 사용자 결정: `.eps`·`.ai` 둘 다 사용
- ExtractGroups.jsx가 `.eps`도 open→추출하도록 보강. Illustrator는 `.eps` open 가능하나 #25가 hang한 실제 원인(모달/무-그룹/대용량) 규명 필요 → **실물 Illustrator 검증 동반**.
- 안전장치: `.eps` open 시 모달 억제(`DONTDISPLAYALERTS` 확인)·타임아웃(RunJsxScript 2분 기존)·open 실패 시 즉시 terminal error(무한재큐 금지).

### P1 — head-of-line blocking 완화 · HOL-1

근본해결(다중 Illustrator/에이전트 풀)은 대공사 → 이번 범위는 **완화**.
- **대기순번 가시성**: 시트 렌더 잡에 큐 내 위치(`ORDER BY id`, `render-queue`/`sheets` 조회)를 계산해 결과 패널에 "대기 N번째" 표시. 사용자가 "멈춤"으로 오인하지 않게.
- **포이즌 스톨 감소**: P0-b로 죽은 AI분석이 2분씩 잡는 것 제거 → 시트 렌더 지연 대폭 감소.
- (선택) **폴 순서/공정성**: 대형 렌더가 장시간 점유해도 AI분석·소형 잡이 굶지 않게 인터리브 검토. 근본해결 아님, 별도 항목으로 분리.

### P2 — 강제만료(취소) · EXP-2

- **`DELETE /api/ai-analysis/:id`** 신설 (entity 격리·소유검증). 또는 `PATCH status='cancelled'`(터미널, TEXT 컬럼이라 마이그 불요). 에이전트는 non-pending 스킵 → 취소 즉시 큐에서 제외.
- IA 편집기 파일 목록에 **취소/삭제 버튼**(pending·error 항목). 운영자는 `/tasks`에서도 정리(기존 언급).
- 시트 렌더는 이미 `DELETE /sheets/:id`(`workbench.ts:508`) 있음 → AI 분석만 보강.

### P-STOP — 에이전트 stop / MES↔에이전트 일관성 (필수) · 근본원인 연동

"MES 만료인데 iaautomat 계속 막힘" 직접 해결. P0-b(terminal 상태)와 짝.
1. **에이전트: 무거운 COM 전 상태 재확인.** ProcessAIAnalysisAsync/ProcessSheetRenderAsync가 ExtractGroups/SheetLayout 실행 직전 서버에서 해당 잡 상태 GET → terminal(`cancelled`/`error`)이면 **즉시 skip**(2분 hang 회피). 이미 claim했어도 실행 전 취소면 중단.
2. **에이전트: 실패 후 재큐 금지 판정.** COM 타임아웃/kill 후 PATCH 전에 서버 상태 재확인 → 이미 취소면 error PATCH 생략(재큐 유발 방지).
3. **서버: 폴 응답에서 terminal 제외 확정.** `?status=pending`은 이미 terminal 제외 → P0-b가 terminal을 보장하면 자동 성립.
4. **(선택) 취소 신호 즉시성.** 장시간 렌더 중 취소 시 RunJsxScript 타임아웃(기존 2~5분)까지는 점유 → 필요 시 취소 플래그 감지해 `RestartIllustrator()`로 강제 중단하는 워치도그 검토(공수 중).

### P3 — 단일 에이전트 전제 견고화 · CONC-2·ENT-3

- **CONC-2**: render-queue claim을 원자적으로. `UPDATE sheet_layouts SET render_status='rendering' WHERE render_status='queued' ... RETURNING`(D1 지원 시) 또는 claim 후 재조회로 이중 렌더 방지. 부수적으로 에이전트 단일 인스턴스 락(파일/DB 하트비트) 검토.
- **ENT-3 (통합 확정)**: 사용자 결정 = IA편집기 통합 사용, 법인 분리 안 함. → 에이전트가 **전 법인 잡을 봐야 함**. 에이전트 admin 토큰이 전체모드(entityId=0)인지 확인, 아니면 render-queue/ai-analysis 폴·callback을 **에이전트 전용 통합 경로**(entityFilter 미적용)로 처리. **선행 확인 1건.**

## 마이그레이션

- **불요**(기본): `retry_count`/`max_retries`(ai_analysis, 0130)·`requeue_count`(sheet_layouts) 기존. `cancelled`는 TEXT status 신규 값이라 스키마 무변경.
- P2에서 `cancelled` 대신 별도 컬럼/인덱스가 필요하면 그때 최소 마이그 추가.

## 구현 순서 (착수)

1. **P0-a·P0-b (서버)** — 자동만료(pending/queued 10분) → **terminal**(재큐 금지). 근본 "계속 막힘" 해결의 절반. 로컬 D1 검증.
2. **P2 (서버+UI)** — ai-analysis 취소 엔드포인트(`cancelled` terminal) + IA편집기 취소 버튼.
3. **P-STOP (에이전트 C#)** — 무거운 COM 전 상태 재확인 skip + 실패 후 재큐 금지 판정. 재빌드·재배포·재시작.
4. **P0-c (JSX)** — ExtractGroups `.eps` 지원. **실물 Illustrator 검증 필수**(#25로 재현).
5. **P1 (UI)** — 대기순번 표시. **P3** — 원자적 claim, ENT-3 통합 확인.

## 잔여 리스크 / 검증 유의

- **P0-c(.eps)·P-STOP(4 워치도그)**: 실물 Illustrator 없이는 최종 검증 불가 → 에이전트 배포 후 사용자 실물 확인 동반.
- 자동만료 10분: 정상 대기 잡 오살 방지 위해 "에이전트 폴 진입 시에만 실행" 유지(에이전트 death 중 미실행).

## 검증 계획

- P0: 로컬 D1에 더미 pending(오래된 updated_at) 삽입 → 폴 1회 후 error 전환 확인. 정상 대기 잡(방금 생성)은 미만료 확인.
- P0-b: `.eps` 업로드 → 즉시 error·pending 미진입 확인.
- P2: 취소 API → pending에서 사라짐 + 에이전트 폴 0건 확인.
- HOL-1: 두 사용자 동시 시트 렌더 → 대기순번 표시·순차 완료 확인(Playwright).
- 회귀: 기존 정상 모아찍기 EPS/DXF/JPG 산출·다운로드 영향 없음.

## 참고 — 이번 사고 즉시조치(별건)

죽은 요청 #25(`.eps`)는 본 spec의 P0/P2가 자동 처리할 대상. spec 착수 전까지는 수동 정리(취소 API 또는 UI 삭제) 필요.
