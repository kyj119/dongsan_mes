# 문서 인덱스 (Single Source Map)

> 이 프로젝트의 모든 문서가 **무엇이고 / 활성인지 / 어디 있는지**를 한곳에서 본다.
> 새 문서를 만들면 여기 한 줄 추가. 상태가 바뀌면 여기서 갱신.
> 최종 정리: 2026-07-02 (md 전수 점검 — 구 아카이브·완료 큐 삭제, 완료/흡수 spec 13건 archive 이동, 전면 재작성)

## 상태 범례
- 🟢 **활성** — 현재 참조/갱신 대상
- 🟡 **참고** — 변경 적지만 유효 (보류·외부 의존 포함)
- 🗄️ **보관** — 완료/흡수/대체 → `docs/archive/` (원문 필요 시 git 히스토리)

---

## 1. 루트

| 문서 | 상태 | 성격 | 비고 |
|---|---|---|---|
| `README.md` | 🟢 | 프로젝트 소개·실행법 | 루트 유지(표준) |
| `CLAUDE.md` | 🟢 | Claude 작업 규칙 | 루트 유지 |
| `IMPROVEMENT_BACKLOG.md` | 🟢 | 개선 백로그(활성 단일본) | ⚠️266K 비대 — 다이어트 필요(auto-improve 연동이라 수동 절삭 금지, 사이클 이관으로) |
| `IMPROVEMENT_BACKLOG_ARCHIVE.md` | 🗄️ | 과거 auto-improve 사이클 이관 싱크 | **삭제 금지** — 백로그 다이어트의 이관 목적지 |

## 2. `.claude/` (운영 메모리)

| 문서 | 상태 | 성격 | 비고 |
|---|---|---|---|
| `PROJECT_STATUS.md` | 🟢 | 현황판(단일 소스) | 작업 시작/완료 시 갱신 |
| `PROJECT_STATUS_ARCHIVE.md` | 🗄️ | 현황판 과거분 이관 싱크 | **삭제 금지** — 다이어트 이관 목적지 |
| `design-decisions.md` | 🟢 | 설계 결정 인덱스(A~BB) | references/decisions-*와 연결 |
| `references/` 8건 | 🟢 | architecture-flow·decisions-{business,code,money}·glossary·project-context·agent-team-guide·hex-to-tailwind-map | 정리됨, 손대지 말 것 |
| `skills/` · `templates/` | 🟢 | 스킬 정의·스캐폴딩 템플릿 | 각 SKILL.md 참조 |

## 3. `docs/` 최상위

| 문서 | 상태 | 성격 · 비고 |
|---|---|---|
| `INDEX.md` | 🟢 | 이 파일 (단일 지도) |
| `entity-separation-map.md` | 🟢 | 법인분리 현황 지도 (최종 2026-06-19) |
| `kakao-alimtalk-templates.md` | 🟢 | 알림톡 템플릿 문안 — 실발송 전환 완료(2026-06) |
| `WORKTREE_WORKFLOW.md` | 🟢 | 멀티세션 git worktree 표준 (CLAUDE.md가 참조) |
| `IA_EDITOR_USAGE.md` | 🟢 | /ia-editor 사용 설명서 |
| `UNIVERSAL_LOGWATCHER_DESIGN.md` | 🟡 | 범용 로그워처 설계 (equipment-centric spec이 참조) |
| `LOGWATCHER_EQUIPMENT_INVENTORY.md` | 🟡 | 장비 인벤토리 매핑표 — 현장 확인 채움 대기 |
| `BARCODE_INVENTORY_SPEC_PENDING.md` | 🟡 | 바코드 입출고 재고 — 구체화 대기(#412, owner 결정) |
| `HANDOFF-flexi-nest-tracking.md` | 🟡 | Flexi 네스팅 추적 — 코드 완료·**prod 미배포** 인계 |
| `HANDOFF-fax-barobill.md` | 🟡 | 바로빌 팩스 FTP — prod 배포완료·**실전 미검증** |
| `integrations/HANJIN_INTEGRATION_ROADMAP.md` | 🟡 | 한진택배 통합 로드맵 — 업체 계약 대기(외부 의존) |
| ~~`bank-review-2026-06-24.md`~~ | 🗄️ | 완결 → `archive/` 이동 (2026-07-02) |

## 4. `docs/superpowers/specs/` — 활성 spec 28건

### 최상위 로드맵·정본
| 문서 | 상태 |
|---|---|
| `2026-07-01-workflow-improvement-master-plan.md` | 🟢 전수분석 마스터 — Phase0·X2·X4·X5 등 배포완료, Phase1~5 잔여 |
| `2026-06-13-item-pricing-inventory-FINAL.md` | 🟢 품목·단가·재고 north-star 정본 |
| `2026-06-16-ia-editor-nesting-intake.md` | 🟢 IA편집·네스팅 마스터 (workbench·file-board·file-editor 3 spec 흡수) |
| `2026-06-27-inventory-redesign-unified.md` | 🟢 재고 통합 재설계 정본 (warehouse+multi-uom 2 spec 대체, UP1~UP4 prod) |

### 품목 마스터 트랙
`2026-06-13-item-axis-realign-plan.md`(게이트 통과) · `2026-06-13-item-master-review.md`(참고) · `2026-06-19-item-master-load-phase1.md` · `2026-06-20-spec-group-variant-item-plan.md`(정본) · `2026-06-20-p1c-mapping-draft.md`(초안·사람검토 필수) · `2026-06-13-signage-component-estimate-structure.md`(간판 BOM 선행설계, 보류)

### 진행·잔여 있음
`2026-06-03-receivables-purchase-barobill-brainstorm.md`(잔여 3건) · `2026-06-05-recurring-variable-expense.md`(P4·5 잔여) · `2026-06-10-split-billing-by-entity.md`+`IMPLEMENTATION-PLAN`(P5~) · `2026-06-15-logwatcher-equipment-centric.md`(P4 배포 대기) · `2026-06-25-ia-editor-eps-export.md` · `2026-06-25-ia-editor-p2-p3.md`(R2·R3 잔여) · `2026-06-25-factory-layout-integration.md`(P3~P5 재고게이지) · `2026-06-26-storage-facility-zone-integration.md`(prod 매핑 운영) · `2026-06-24-leave-management-proposal.md`(정본)+`2026-06-24-leave-promotion-expiry-design.md`(일부 배포·확정 대기)

### 결정 대기·보류·가드레일 (🟡)
`2026-06-11-alimtalk-golive-package.md`(잔여 결정) · `2026-06-11-ontime-kpi-redesign.md`(#380 미구현) · `2026-06-11-card-cashflow-forecast.md` · `2026-06-11-hanjin-courier-decision.md`(외부 의존) · `2026-06-11-client-self-order-portal.md`(선행 대기) · `2026-06-11-card-feed-cost-research.md`(⏸️보류) · `2026-06-11-static-assets-rootcause-redesign.md`(**삭제 금지** — decisions-code "재외부화 금지" 해제조건 앵커)

## 5. `docs/archive/` — 보관 (2026-07-02 재편)

- 2026-06-10 이전 구 아카이브(4~5월 spec·일회성 리뷰 32건)는 **삭제** — git 히스토리로 조회.
- 현재 내용: 완료/흡수/대체된 6월 spec 12건 + `bank-review-2026-06-24.md`
  - 완료: `large-file-split-plan` · `accounting-hub`(정본=메모리) · `claude-queue-runner` · `ia-editor-p1-improvements` · `ia-editor-followup`
  - 흡수(→nesting-intake 마스터): `web-canvas-ia-workbench` · `incoming-file-board` · `incoming-file-editor`(축소 재정의·보류)
  - 대체(→inventory-redesign-unified): `warehouse-stock-separation` · `multi-uom-inventory`
  - 폐기(→spec-group-variant): `option-axis-implementation-plan` · `option-axis-system-design`(EAV 미채택·장래옵션)

## 6. 기타 위치

| 문서 | 상태 | 성격 |
|---|---|---|
| `queue/README.md` + `templates/` | 🟢 | 작업 큐 러너 사용법 (done/pending 완료분은 삭제, 러너가 디렉토리 자동생성) |
| `memory/session-context.md` | 🟡 | 2026-06-19 스냅샷 — **정본=auto-memory session-context** (배너 참조) |
| `LogWatcher/USAGE.md` | 🟢 | LogWatcher 운영 매뉴얼 |
| `IllustratorAutomat/README.md`·`ARCHITECTURE.md` | 🟢 | IA 에이전트 문서 |

---

## 정리 원칙
1. **단일 소스**: 같은 내용 두 벌 금지. 사본 발견 시 한쪽을 archive/삭제.
2. **완료물은 archive**: 끝난 spec은 `docs/archive/superpowers/specs/`로 이동하고, 코드 주석 등 경로 참조를 함께 갱신.
3. **새 문서 = 인덱스 한 줄**: 만들 때 여기 등록, 안 하면 "유령 문서".
4. **아카이브 싱크 2종**(`IMPROVEMENT_BACKLOG_ARCHIVE`·`PROJECT_STATUS_ARCHIVE`)과 **가드레일 앵커**(`static-assets-rootcause-redesign`)는 삭제 금지.
