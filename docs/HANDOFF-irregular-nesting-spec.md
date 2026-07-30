# HANDOFF — 이형(true-shape) 네스팅 spec 작성

> 작성 2026-07-30 · 목적 = **다음 세션이 spec 문서를 쓸 수 있게 하는 준비**. 이 문서는 spec이 아니다.
> 산출물 = `docs/superpowers/specs/2026-XX-XX-irregular-nesting.md` (brainstorming 스킬 선행 — 신규 기능)

## 1. 한 줄 정의

지금 자동 네스팅은 조각을 **사각형(바운딩박스)** 으로만 취급한다. 삼각형·곡선 조각 사이 빈 공간이 자재 낭비로 남는다. 이형 네스팅 = **조각의 실제 외곽선**으로 맞물리게 배치하는 것.

## 2. 현재 상태 (실측 · 2026-07-30)

| 구분 | 현황 | 근거 |
|---|---|---|
| 자동 패킹 | **bbox 전용** · 패커 정본 = `iaeMaxRectsPack`(maxrects 고정) | `src/scripts/iaEditor.js:943`·`:952` |
| 이형 대응 | **수동 인터록이 prod 라이브** — 사용자가 드래그로 bbox를 겹쳐 끼우고 90° 스냅 회전 | `src/scripts/iaEditor.js:1076~` |
| 시트 멤버십 | 조각 bbox **중심점**의 시트 포함관계(드래그 인/아웃·복제 대응) | `iaeCanSheetForPoint`·`iaeCanReassignSheets`(`:2195`) |
| 출력 계약 | `placements` = **시트상대 bbox + rotation** → `SHEET pp` → `SheetLayout.jsx` | `:1208` 주석 |
| 검증 게이트 | `node scripts/nesting-harness.mjs` (R1~R5 하드·W1 경고) | `scripts/nesting-harness.mjs` |

**사용 설명서는 이미 있다**: `docs/IA_EDITOR_USAGE.md` §4 "이형(true-shape) 수동 인터록".

### ⚠️ 착수 전에 해소할 모순 1건
회전 자유도 기술이 **문서와 코드 주석이 다르다**:
- `IA_EDITOR_USAGE.md:93` → "0/90/**180**/270 모두 가능 (180°는 R 2번)"
- `iaEditor.js:1080` 주석 → "0/90 = 현 에이전트 즉시 동작, **180/270 = placement.rotation + 에이전트 패스스루 필요**"

spec 착수 전 **실동작을 확인**해서 어느 쪽이 사실인지 확정할 것(180° 조각을 실제로 출력까지 보내 확인). 이형 자동화는 회전 자유도가 곧 절감률이라 이 전제가 틀리면 spec 전체가 흔들린다.

## 3. 결정 이력 (되돌리지 말 것)

| 시점 | 결정 |
|---|---|
| 2026-06-16 | SVGnest/Deepnest(true-shape)는 **향후** — "현수막/시트 대부분 사각형" (`specs/2026-06-16-ia-editor-nesting-intake.md:63`) |
| 2026-06-19 | 옵션 (a) NFP·SVGnest 자동 / (b) 래스터 패킹 / **(c) 수동 인터록 ⭐채택** → 구현·prod 완료 |
| 2026-06-26 | 대지편집 폐기 검토는 **별도 세션·brainstorming 먼저** — N4 주문연결·이형 인터록·N5 돔보·N1 자유대지·N2 마감이 전부 prod라 회귀 위험 큼 |

즉 이번 spec은 **(a) 자동 true-shape를 (c) 위에 얹을지**를 다루는 것이고, 수동 인터록을 걷어내는 얘기가 아니다.

## 4. spec이 답해야 할 질문 (체크리스트)

1. **★입력 = 조각의 진짜 외곽선을 어디서 얻나** (최대 미지수)
   현재 웹이 가진 건 치수·썸네일이고 **경로(path) 데이터가 없다**. 후보: ⓐ에이전트가 AI/EPS에서 외곽 path 추출해 API로 올림 ⓑ썸네일 알파를 래스터 트레이싱(옵션 b의 변형) ⓒ일러 JSX에서 배치까지 수행하고 웹은 결과만 받음. **이 선택이 나머지 전부를 결정한다.**
2. **실행 위치·시간 예산** — 브라우저 JS(Web Worker) / 에이전트 C# / 일러 JSX 중 어디서? 조각 N개 기준 허용 대기시간은?
3. **회전 자유도** — 90° 스냅 유지 vs 임의 각도(절감↑·계약 변경↑). §2의 모순 해소 결과에 종속.
4. **도입 판정 기준** — 자재를 몇 % 이상 아껴야 채택인가. 측정 대상 실제 주문 케이스를 미리 3~5건 골라둘 것(현수막·시트는 대부분 사각형이라 **이득이 나는 품목군을 먼저 특정**해야 한다. 안 하면 "구현했는데 쓸 데가 없다"로 끝난다).
5. **수동 인터록과의 관계** — 대체 / 자동배치를 시작점으로 주고 수동 미세조정 유지(현 UX 철학) / 병행 토글.
6. **★하네스 판정 규칙 재정의** — 현 R4는 **bbox 분리거리** 기준이라 true-shape에선 통과해야 할 배치를 실패로 찍는다. polygon 교차 판정 + gap = Minkowski 팽창으로 다시 정의해야 하고, **이게 spec의 필수 산출물**이다(하네스 없이 패킹 손대는 것은 금지 — [[reference-nesting-harness]]).
7. **출력 계약 영향** — `placements`가 bbox+rotation인데 true-shape면 그대로 쓸 수 있나? `SheetLayout.jsx` 소비 지점까지 영향 추적 필요(에이전트 축1 = 수동 배포축이라 변경 비용 있음).
8. **다중 시트·롤 길이 단축** 규칙이 true-shape에서도 성립하는지.

## 5. 착수 시 먼저 돌릴 것

```bash
node scripts/nesting-harness.mjs          # 현 기준선 확보(패킹 수정 전 필수 게이트)
grep -n "iaeCanNestPlace\|iaeMaxRectsPack\|placements" src/scripts/iaEditor.js
```

## 6. 하지 말 것

- `iaeShelfBinPack`·`iaeMaxRectsPack` **기존 경로 변경 금지** — 회귀 0 원칙으로 분기해 온 이력(`:857` 주석). 새 패커는 별 함수 + 옵션 분기로.
- 하네스 통과 없이 패킹 코드 커밋 금지.
- 대지편집(N1·N2·N4·N5) 폐기·재구현으로 범위를 넓히지 말 것 — 2026-06-26 결정대로 별건.
