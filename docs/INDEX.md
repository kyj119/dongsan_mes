# 문서 인덱스 (Single Source Map)

> 이 프로젝트의 모든 문서가 **무엇이고 / 활성인지 / 어디 있는지**를 한곳에서 본다.
> 새 문서를 만들면 여기 한 줄 추가. 상태가 바뀌면 여기서 갱신.
> 최종 정리: 2026-06-10 (정리 계획 실행 완료 — 이동/삭제 반영)

## 상태 범례
- 🟢 **활성** — 현재 참조/갱신 대상
- 🟡 **참고** — 변경 적지만 유효
- 🗄️ **보관** — 완료/일회성. `docs/archive/`로 이동 권장
- ⛔ **폐기** — 삭제 대상

---

## 1. 루트 (최소만 유지)

| 문서 | 상태 | 성격 | 비고 |
|---|---|---|---|
| `README.md` | 🟢 | 프로젝트 소개·실행법 | 루트 유지(표준) |
| `CLAUDE.md` | 🟢 | Claude 작업 규칙 | 루트 유지 |
| ~~`ROADMAP.md`~~ | ✅ | 전체 로드맵 (2026-05-11 이후 stale) | `docs/archive/ROADMAP-2026-05-11.md`로 이동 (2026-06-10). 잔여 항목은 PROJECT_STATUS가 단일 소스 |
| `IMPROVEMENT_BACKLOG.md` (30K) | 🟢 | 개선 백로그(활성) | **단일본**. 최근 1사이클 로그만 유지 |
| `IMPROVEMENT_BACKLOG_ARCHIVE.md` (95K) | 🗄️ | 과거 auto-improve 사이클 로그 47블록 | 2026-06-10 분리 |
| ~~`HANJIN_INTEGRATION_ROADMAP.md`~~ | ✅ | 한진택배 통합 로드맵 | `docs/integrations/`로 이동 완료 (2026-06-10) |
| ~~`PHASE_3_1_*`~~ | ✅ | 완료된 리팩토링 계획/검증/스크립트 | `docs/archive/`로 이동 완료 |

## 2. `.claude/` (운영 메모리)

| 문서 | 상태 | 성격 | 비고 |
|---|---|---|---|
| `PROJECT_STATUS.md` | 🟢 | 현황판 | 작업 시작/완료 시 갱신 |
| `PROJECT_STATUS_ARCHIVE.md` | 🗄️ | 현황판 과거분 | 유지 |
| `design-decisions.md` | 🟢 | 설계 결정 인덱스 | references/decisions-*와 연결 |
| ~~`MEMORY.md`~~ | ✅ | DEPRECATED 보존본 | `docs/archive/MEMORY-claude-deprecated.md`로 이동 완료 (2026-06-10) |
| ~~`IMPROVEMENT_BACKLOG.md` (2.3K)~~ | ✅ | stale 사본 | 삭제 완료 (2026-06-10, 루트본이 단일 소스) |
| `mcp-optional.json` | 🟢 | illustrator/excel MCP 분리 설정 | 필요 시 `claude --mcp-config .claude/mcp-optional.json` |

### `.claude/references/` — 🟢 정리됨, 손대지 말 것
`architecture-flow.md` · `decisions-business.md` · `decisions-code.md` · `decisions-money.md` · `glossary.md` · `project-context.md` · `agent-team-guide.md`

## 3. `docs/` (설계·리뷰)

### 🟢 활성 설계 문서 (유지)
| 문서 | 성격 |
|---|---|
| `entity-separation-map.md` | 멀티테넌시 격리 맵 |
| `kakao-alimtalk-templates.md` | 알림톡 템플릿 |
| `UNIVERSAL_LOGWATCHER_DESIGN.md` | 로그워처 설계 |
| `BARCODE_INVENTORY_SPEC_PENDING.md` | 바코드 스캔 입출고 재고관리 — 구체화 대기(#412, owner 지시) |

### 🟢 활성 specs (`docs/superpowers/specs/`)
| 문서 | 성격 | 상태 |
|---|---|---|
| `2026-06-10-split-billing-by-entity.md` (+IMPLEMENTATION-PLAN) | 생산법인별 분할 청구 — 내부정산 모델 대체 | 설계 확정·구현 전 |
| `2026-06-11-alimtalk-golive-package.md` | #378 오보고 수정 + 출고 자동발송 + go-live | 결정 대기 (D1~D3) |
| `2026-06-11-ontime-kpi-redesign.md` | #380 납기 준수율 KPI 재정의 | 결정 대기 (D1~D4) |
| `2026-06-11-large-file-split-plan.md` | 1,500줄+ 파일 5건 분할 방법론·순서 | 방법론 확정 |
| `2026-06-11-card-cashflow-forecast.md` | 법인카드 청구 예측 → cashflowEngine 합성 | 결정 대기 (D1~D3) |
| `2026-06-11-hanjin-courier-decision.md` | 택배 솔루션 선정 + import 선행 확인 | 용준님 결정·외부 의존 |
| `2026-06-11-client-self-order-portal.md` | 거래처 셀프 주문 Phase 5 골격 | brainstorming 대기 |
| `2026-06-11-web-canvas-ia-workbench.md` | 웹 캔버스 IA 워크벤치 (뷰어·검수+시트 배치) — IA 오프셋 디버깅 대체 | 방향 확정·PoC 대기 |
| `2026-06-03-receivables-purchase-barobill-brainstorm.md` | 미수금·매입·바로빌 설계 — 본체 배포 완료 | 잔여 3건 실사용 후 |
| `2026-06-05-recurring-variable-expense.md` | 정기변동비 — P1~3 배포, P4·5 잔여 | 카드예측과 동세션 확정 |
| `2026-06-10-split-billing-by-entity.md` (+PLAN) | 분할 청구 — P5 진행 중, P6=다법인 실거래 후 | 구현 중 (로컬) |
| `2026-06-11-static-assets-rootcause-redesign.md` | 정적 에셋 근본원인 + 옵션 A | PoC 승인 (저우선) |
| `2026-06-11-claude-queue-runner.md` | 작업 큐 러너 | ✅ 구축 완료 |
| ~~`2026-06-05-status-model-unification.md`~~ · ~~`docs/design/static-assets-migration.md`~~ | 완료/무효 | → `docs/archive/`로 이동 (2026-06-11) |

### ✅ 일회성·날짜 리뷰 → `docs/archive/` 이동 완료 (2026-06-10)
`comprehensive-review-2026-05-04.md` · `concurrency-safety-report.md` · `proposal-2026-05-01.md` · `review-10items-2026-05-01.md` · `roadmap-operator-improvements.md` · `verification-checklist-2026-05-01.md` · `verification-checklist-2026-05-02.md` · `work-order-usage-research.md`

### 기타 (2026-06-10)
- `.claude/projects/` 잘못 생성된 글로벌 경로 모방 사본 → `docs/archive/claude-projects-stray/`로 이동 후 제거
- **완료 설계문서 14건 → `docs/archive/superpowers/{plans,specs}/`·`docs/archive/specs/` 이동** (활성 참조 0건 확인: plans 4건 168K + 4~5월 specs 9건 + workflow-automation). 활성 specs 6건은 `docs/superpowers/specs/` 유지 (receivables-barobill·split-billing 2건·status-model·recurring-expense·static-assets)

---

## 목표 디렉토리 구조
```
/
├─ README.md, CLAUDE.md, ROADMAP.md, IMPROVEMENT_BACKLOG.md   (루트 최소)
├─ docs/
│  ├─ INDEX.md                  ← 이 파일 (단일 지도)
│  ├─ entity-separation-map.md
│  ├─ kakao-alimtalk-templates.md
│  ├─ UNIVERSAL_LOGWATCHER_DESIGN.md
│  ├─ integrations/             ← HANJIN 등 외부 연동
│  └─ archive/                  ← 완료/일회성 (날짜 리뷰, PHASE_3_1 등)
└─ .claude/                     ← 운영 메모리 (references/는 유지)
```

## 정리 원칙
1. **단일 소스**: 같은 내용 두 벌 금지. 사본 발견 시 한쪽을 이 인덱스에서 ⛔로 표기 후 삭제.
2. **완료물은 archive**: 끝난 작업 문서는 루트/docs 상위에 두지 않는다.
3. **새 문서 = 인덱스 한 줄**: 만들 때 여기 등록, 안 하면 "유령 문서".
