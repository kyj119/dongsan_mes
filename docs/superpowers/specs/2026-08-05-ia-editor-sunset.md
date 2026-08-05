# 웹 모아찍기 + /ia-editor 폐기 — 설계

> 2026-08-05 · **설계만. 실행은 재단 패널 실기 검증 후**(§4 선행 조건).
> 관련 = `2026-07-31-cut-file-panel.md` · memory `project-ia-web-sunset` · `project-ia-editor`

## 1. 왜

재단 패널이 웹 모아찍기가 하던 일을 **더 잘하게 됐다**(2026-08-05).

| | 웹 모아찍기 | 재단 패널 |
|---|---|---|
| 배치 | MaxRects(사각 bbox) | **래스터 true-shape** — 이형이 맞물리고 오목부에 조각이 들어간다 |
| 칼선 | 없음(판만) | 조각별 벡터 칼선 + DXF |
| 도련 | 없음 | Repeat Last Pixel · 맞붙임에선 판 바깥 테두리만 |
| 붙이기 | — | **맞붙임**(여백·간격 0 → 칼선 포갬, 재단 1회) |
| 배율 | 단일 | **파일 배율 / 저장 배율** 분리 |

진입점 통합의 마지막 단계다(`project-ia-web-sunset`: JSX 스텁 은퇴 → `/workbench` 흡수 → **여기**).
남는 진입점은 **CEP 패널 1개**.

> ⚠️ 사용량 데이터(impose absorbed 18건 등)는 **판단 근거가 아니다** — 전부 개발자 본인 테스트였다(2026-08-05 확인).
> 근거는 "기능적으로 대체되는가" 하나이고, 그 답이 위 표다.

## 2. 폐기 범위

### 2.1 웹 UI
| 대상 | 규모 |
|---|---|
| `src/pages/iaEditor.ts` | 121줄 |
| `src/scripts/iaEditor.js` | 2,562줄 — 캔버스 뷰(대기함·임포지션·네스팅·EPS) + 검수 뷰 토글 |
| `src/scripts/workbench.js` | 검수 뷰 스크립트(`/workbench` 폐지 때 흡수됨) |
| `src/index.tsx:442` | 라우트 등록 |
| `src/layout/menu.ts:99` | 메뉴 항목 |
| `permission_pages` | `/ia-editor` 행 + 역할 매핑(마이그 `0315`) |

**시안 검수도 함께 폐기**한다(2026-08-05 결정). 별도 페이지로 빼지 않는다.

### 2.2 CEP 패널
- A0 패널 **「웹 모아찍기 등록」 탭** — impose 를 만드는 유일한 입구. 이걸 남기면 아무도 안 보는 대기함에 계속 쌓인다.
- 관련: `modeValue()`, `stripFinishing()`, `imposeGuard`, `applyTabUi` 의 impose 분기.

### 2.3 서버 API — **판 렌더 파이프라인만**
`workbench.ts`(1,689줄)는 **에이전트 API 이기도 하다.** 통째로 지우면 안 된다.

| 라우트 | 처분 | 이유 |
|---|---|---|
| `POST /sheets` · `GET /sheets` · `GET /sheets/:id` | **제거** | ia-editor 가 짠 판의 저장소 |
| `POST /sheets/:id/render` · `PATCH /sheets/:id/render` · `GET /render-queue` | **제거** | 모아찍기 판 렌더 큐 |
| `POST /render-asset` | **유지** | ★조사 정정 — `job_type` 이 `sheet` **와 `process`** 둘 다다(`Program.cs:1756`·`1987`). 단건 가공이 공유한다 |
| `GET /orders` · `GET /analyses/:orderId` · `GET /archives` · `POST /archive` · `GET /files` · `POST /files/analyze` | **제거** | 검수 뷰 전용 |
| `POST /intakes` | **유지** | 에이전트 등록 경로(단건 포함) |
| `GET /intake-config` | **유지** | 패널이 매번 읽는다(가공자·거래처·프리셋) |
| `GET /process-queue` · `GET /agent-status` | **유지** | 단건 가공 파이프라인 |

`intake-config` 응답의 `intakes`(모아찍기 대기물) 필드만 제거한다.

### 2.4 데이터
- `designer_intakes` 테이블은 **유지**. `mode='single'` 을 주문서 트레이가 쓴다(참조 57곳·라우트 3개).
- `mode IN ('impose','both')` **경로만** 폐기. 기존 행은 지우지 않고 `void` 처리(이력 보존).
- 현재 `impose` waiting **4건** → 폐기 전에 `void`.

## 3. 남기는 것 — 지우면 다른 게 깨진다

| 대상 | 왜 남기나 |
|---|---|
| **`SheetLayout.jsx`** (축1) | 모아찍기 전용이 **아니다**. `ia_process_jobs.job_type='sheet_layout'` 잡을 `process-queue` 경로가 실행한다(`Program.cs:768`) |
| `designer_intakes` | 단건 트레이가 정본으로 쓴다 |
| `ia_process_jobs` · `process-queue` | 단건 가공 파이프라인 |
| `POST /intakes` · `GET /intake-config` | 패널·에이전트가 쓴다 |

> ⚠️ `SheetLayout.jsx` 를 "모아찍기 렌더용"으로만 알고 지우면 단건 가공의 sheet_layout 잡이 조용히 죽는다.
> 2026-07-29 에 이 파일이 exe 폴더에 미복사돼 **6일간 판 렌더가 실패**한 전례가 있다.

## 4. 선행 조건 — 이게 통과하기 전에는 실행하지 않는다

재단 패널의 대체 기능은 **2026-08-05 에 만들어졌고 실기 검증이 0회**다. 대체재를 먼저 없애면 돌아갈 곳이 사라진다.

| # | 확인 | 통과 기준 |
|---|---|---|
| 1 | 맞붙임 | 여백·간격 0 에서 조각이 실제로 붙고 칼선이 포개진다 |
| 2 | 도련 | 맞붙임 + 도련 3mm 에서 **판 바깥 테두리에만** 남는다 |
| 3 | 두 배율 | `F=1·S=2` 로 실물 치수가 맞고 파일명이 실물 규격이다 |
| 4 | 판 여러 개 | 2판 이상에서 EPS·DXF 가 판마다 나온다(`-1p`·`-2p`) |
| 5 | 실사용 1건 | 실제 주문 1건을 패널만으로 판까지 완주 |

5번이 핵심이다. **모아찍기로 하던 작업 하나를 패널로 끝까지 해 보는 것**이 유일하게 믿을 만한 근거다.

## 5. 실행 단계 — 단계마다 되돌릴 수 있게

각 단계를 **개별 커밋**으로. 문제가 보이면 그 단계만 revert.

| 단계 | 내용 | 되돌리기 |
|---|---|---|
| **S1** | 메뉴에서 `/ia-editor` 숨김(라우트·코드는 그대로) | 한 줄 복구 |
| **S2** | A0 패널 「웹 모아찍기 등록」 탭 제거 + impose waiting 4건 `void` | 패널 재배포 |
| **S3** | 관측 — S1·S2 후 **2주간** 문제 제기 없는지 | — |
| **S4** | 웹 UI 삭제(`pages/iaEditor.ts`·`scripts/iaEditor.js`·`workbench.js`·라우트·권한) | revert |
| **S5** | 서버 API 삭제(§2.3 제거 목록) + `intake-config` 의 `intakes` 필드 | revert |
| **S6** | 에이전트 `render-queue` 폴링 제거(`Program.cs`) · 축1 재배포 | 축1 재배포 |

**S1~S3 이 실질 폐기다.** S4~S6 은 코드 정리이고 급할 게 없다.
S6 은 에이전트 배포축이라 **빌드 + exe 폴더 복사**가 필요하다(`npm run audit:ia-jsx` 로 확인).

## 6. 위험

| 위험 | 완화 |
|---|---|
| 패널이 못 하는 일이 뒤늦게 드러남 | S3(2주 관측) · S1 은 한 줄 복구 |
| `SheetLayout.jsx` 오삭제 → 단건 가공 정지 | §3 에 명시. S6 에서 **건드리지 않는다** |
| `workbench.ts` 통째 삭제 → 에이전트 정지 | §2.3 라우트별 처분표를 그대로 따른다 |
| 검수 뷰를 쓰던 사람 | 폐기 결정됨(2026-08-05). S3 관측에서 드러나면 재검토 |
| 여러 건을 모으는 수작업 부담 | 패널에 대기함 연동이 필요해지면 **그때** 별건으로 |

## 7. 검증

```
npm run build && npm run smoke      # 웹 — 라우트·페이지 제거 후
npm run panel:smoke                 # A0 패널 탭 구조
npm run cut:smoke                   # 재단 패널
npm run audit:ia-jsx                # S6 후 축1 드리프트 0
```

S4·S5 후 **주문서 트레이(단건)가 여전히 동작하는지** 반드시 확인한다 — `designer_intakes` 를 공유하므로 여기가 같이 깨질 수 있는 유일한 지점이다.

## 8. 열린 질문

- **대기함 연동**: 여러 건을 모으는 일이 잦아지면 재단 패널이 `designer_intakes` 에서 조각을 불러와야 한다. 지금은 일러에 열린 것만 다룬다. 필요해지면 별건.
- **`ia_process_jobs.job_type='sheet_layout'`** 을 만드는 주체가 ia-editor 뿐인지 미확인. S5 전에 확인해 ia-editor 전용이면 그 잡 타입도 정리 대상.
