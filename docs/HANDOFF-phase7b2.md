# Phase 7b-2 완료 기록 — ia-editor '파일 처리' 뷰 제거

> **완료 2026-07-28** · 커밋 `7c1fff74` · 이 문서는 인계용이었고 지금은 결과 기록이다.
> 정본 메모리 = [[project-ia-web-sunset]] · IA 진입점 통합은 이로써 **전 단계 종료**.

## 결과 — ia-editor 2뷰

`[네스팅/모아찍기] [시안 검수]` + 뷰 밖 공통 **소스바**(모아찍기 대기함 · 에이전트 배지 ·
세션 파일 탭 · 파일 상태줄). 검수 뷰에서는 소스바를 숨긴다.

`src/scripts/iaEditor.js` 3,077 → 2,494줄 (−704 / +115).

## 제거·유지 판정 (계획 대비)

| 대상 | 판정 | 근거 |
|---|---|---|
| 업로드 `#iaeDrop`·`#iaeFileInput` | 제거 | 패널이 대체 |
| NAS에서 분석 | 제거 | 07-16 이후 0건 |
| 인스펙터 설정 폼 · 설정 전체적용 | 제거 | `iaeSettings` 소비자 = 인스펙터 자신 + `iaeApplyActiveToAll` 뿐. **네스팅·모아찍기는 `fin:{top:'',…}` 하드코딩**(`iaeCanNestPlace`·`iaeImposePlace`)이라 배치 무영향 |
| **그룹 카드 `#iaePanel`** | **제거 + 상태줄 신설** | 팔레트가 썸네일·크기·선택을 이미 제공. 단 카드가 겸하던 *분석 진행/실패/지연 + 분석 취소*는 기능이라 상태줄로 이전 |
| **프리플라이트 · 근사 미리보기** | **제거** | ⚠️인계 문서에 적힌 "텍스트 잔존·링크 이미지 경고"는 **코드에 없었다**. 실제 경고 3종(목표크기 미입력·비율 왜곡·확대배율)은 전부 인스펙터 입력값 의존이라 폼과 함께 죽는다. 비율 왜곡 QC는 주문 생성 경로(`iaeDistortRatio`)에 살아 있음 |
| 대기함 · 에이전트 배지 · 파일 탭 | 유지·이동 | 소스바 |

**활성 파일(`iaeActiveId`/`iaeActiveGroup`) 개념도 소멸** — 그 파일만 보여주던 카드/인스펙터가
사라지면서 선택 상태가 의미를 잃었다(팔레트는 전 파일의 done 그룹을 한꺼번에 노출).

함께 정리한 **기존 dead code**: `iaeHistCardHTML` · `iaeLoadKonva`+Konva 로더 변수 ·
`iaeScaleHint` · `iaeAdvBody` · `iaeProcElapsedStart`. 이번 퍼지가 고아로 만든
`iaeScaleToken`/`iaeScaleLabel`도 제거(유일 소비자가 인스펙터 저장스케일 힌트였다).

## ★ 신규 배선 — 뷰 전환이 없어져 생긴 갭

'파일 처리' 뷰가 있을 땐 **뷰를 옮기는 행위가 팔레트를 갱신**했다(`iaeSetView('canvas')` →
`iaeRenderCanvas()`). 뷰가 하나로 줄면서 그 경로가 사라져, 대기함에서 담아도 팔레트가
**그대로 비어 있는** 상태가 된다.

→ `iaeAfterFilesChanged()` 신설: 탭·상태줄 렌더 + **done 그룹 지문이 바뀐 경우에만**
`iaeRenderCanvas()`. 지문 비교를 넣은 이유는 `iaeRenderCanvas`가 좌측 설정 폼을 통째로
다시 그려서, 3초 폴링이 입력 중인 값을 날릴 수 있기 때문.

⚠️ **첫 구현에서 `first` 가드를 넣어 초기 로드를 건너뛰게 만든 것이 버그였다.** 초기
`iaeSetView('canvas')`는 `iaeRefresh` 응답 **전**이라 빈 팔레트를 그린다 → 첫 로드도 반드시
재렌더해야 한다. **정적 검사 전부 통과 상태에서 브라우저 실클릭만이 잡았다.**

## 검증 결과

| 게이트 | 결과 |
|---|---|
| `node --check` | OK |
| 정적 링크검사 v2(함수+변수 전수) | dangling **0** (퍼지 전후 동일) |
| `npm run check:dom` | **9건 = 기준선 유지** |
| `npm run verify` | typecheck·build OK |
| `node scripts/entity-audit.mjs` | 60/60 |
| 브라우저 실클릭(Playwright) | 아래 |

실클릭: 콘솔 에러 **0**(로드 시점 포함) · 에이전트 배지 갱신(확인 중→오프라인) ·
대기함 2단 그룹핑(가공자→묶음, 내 작업 자동 ON) · 탭 ×→팔레트 3→2 · **대기함 담기→팔레트
2→3 자동 복구(뷰 전환 없이)** · 네스팅 자동배치 조각 10개+시트+SVG · 모아찍기 멀티소스
2파일 3조각 · 검수 뷰 전환 시 소스바 숨김·통계 로드 · 분석 취소 바인딩(confirm 스텁으로 검증).
로컬 시드·localStorage 정리 완료.

## 이 작업에서 재확인된 위험 (다음 퍼지에 그대로 적용)

1. **라인 범위 삭제는 시작·끝 + 바로 바깥 한 줄을 assert** — 이번에도 NAS 블록에서
   `iaeRefresh`의 닫는 `}`를 함께 지웠고, assert가 즉시 잡았다(`node --check` 이전에).
2. **정적 검사 통과 ≠ 동작** — 위 `first` 가드 버그는 dangling 0·check:dom 9·typecheck
   전부 통과 상태였다. 브라우저 실클릭이 유일한 검출 수단.
3. **낡은 안내 문구도 퍼지 대상** — 팔레트 빈 메시지가 "파일 처리 탭에서 업로드·추출하세요"로
   남아 없는 화면을 가리키고 있었다.

## 남은 것 (이번 범위 밖)

- **프론트 호출 0이 된 라우트 3개** — `POST /api/workbench/files/analyze` ·
  `GET /api/ai-analysis/nas-listing` · `POST /api/ai-analysis/from-nas`.
  ⚠️에이전트가 NAS 스캔 결과를 보고하는 쓰기 경로가 살아 있을 수 있어 **에이전트 측 확인 후** 판단.
  (`POST /api/workbench/process` 계열 dead route 정리도 함께)
- **§14.5 폐기 Konva 자유드래그 캔버스 잔재 13개** — `iaeCanStage`·`iaeCanLayer`·`iaeCanGrid`·
  `iaeCanOverlay`·`iaeCanTr`·`iaeCanGuide`·`iaeCanSnapThreshMm`·`iaeCanSnapTargets`·`iaeCanSel`·
  `iaeCanPxPerMm`·`iaeCanThumbCache`·`iaeCanRatioLock`·`iaeCanHotkeysBound`.
  (`iaeCanSheetByUid`·`iaeCanUpdateMembership` 2개는 타 세션 `f80e02f5` 가 정리 — 15→13) **이번 퍼지 이전부터 참조 0**(별건 은퇴의 잔재)이라 범위 분리.
- `orderForm.ts` `IA_WEB_INTAKE_ENABLED=false` 게이트로 숨긴 옛 AI추출·합판 패널 코드 완전 제거.
