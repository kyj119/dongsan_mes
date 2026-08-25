# 문서 인덱스 (Single Source Map)

> 이 프로젝트의 모든 문서가 **무엇이고 / 활성인지 / 어디 있는지**를 한곳에서 본다.
> 새 문서를 만들면 여기 한 줄 추가. 상태가 바뀌면 여기서 갱신.
> 최종 정리: 2026-08-25 (md·스킬 전수 점검 — 8월 spec 6건 등록, 건수 갱신)
> 이전: 2026-07-27 (정합성 감사 — 유령 항목 2건 제거, 미등록 문서 등록, 건수 갱신)
> 이전: 2026-07-02 (md 전수 점검 — 구 아카이브·완료 큐 삭제, 완료/흡수 spec 13건 archive 이동, 전면 재작성)

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
| `IMPROVEMENT_BACKLOG.md` | 🟢 | 개선 백로그(활성 단일본) | **2026-07-27 다이어트 + 자동 트림 도입: 196KB→62KB**. `npm run backlog:trim`을 auto-improve가 매 사이클 호출(13건↑ 시 8건으로, 무손실·계약 검증·실패 시 롤백) — **수동 트림 불필요**. 카운터·오탐표·형식 절은 스킬 계약이라 보존 |
| `IMPROVEMENT_BACKLOG_ARCHIVE.md` | 🗄️ | 과거 auto-improve 사이클 이관 싱크 | **삭제 금지** — 백로그 다이어트의 이관 목적지 |

## 2. `.claude/` (운영 메모리)

| 문서 | 상태 | 성격 | 비고 |
|---|---|---|---|
| `PROJECT_STATUS.md` | 🟢 | 현황판(단일 소스) | 작업 시작/완료 시 갱신. **2026-07-27 다이어트 + 자동 트림 도입: 192KB→43KB.** `npm run status:trim`(배포 후·sync-docs가 호출, 임계 미만 no-op) — **수동 트림 불필요**. 완료분은 ARCHIVE, 미해결은 상단 "⚠️ 미해결 잠복" 절 |
| `PROJECT_STATUS_ARCHIVE.md` | 🗄️ | 현황판 과거분 이관 싱크 | **삭제 금지** — 다이어트 이관 목적지 |
| `design-decisions.md` | 🟢 | 설계 결정 인덱스(A~BI) | references/decisions-*와 연결. ⚠️BI(역할확장)는 인덱스 전용 — 상세는 auto-memory 정본 |
| `references/` 8건 | 🟢 | architecture-flow·decisions-{business,code,money}·glossary·project-context·agent-team-guide·hex-to-tailwind-map | 정리됨, 손대지 말 것 |
| `skills/` · `templates/` | 🟢 | 스킬 정의·스캐폴딩 템플릿 | 각 SKILL.md 참조 |

## 3. `docs/` 최상위

| 문서 | 상태 | 성격 · 비고 |
|---|---|---|
| `INDEX.md` | 🟢 | 이 파일 (단일 지도) |
| `DEPLOY_MANUAL.md` | 🟢 | **배포 정본** — 8축 전부(웹·D1·IA 4축·caps-worker·LogWatcher). **§3-A = 가공·재단 패널 배포 실무**. `A0-panel-designer-deploy.md` 흡수(→archive) |
| `entity-separation-map.md` | 🟢 | 법인분리 현황 지도 (최종 2026-06-19) |
| `kakao-alimtalk-templates.md` | 🟢 | 알림톡 템플릿 문안 — 실발송 전환 완료(2026-06) |
| `WORKTREE_WORKFLOW.md` | 🟢 | 멀티세션 git worktree 표준 (CLAUDE.md가 참조) |
| `IA_EDITOR_USAGE.md` | ⛔ | **사문화** — `/ia-editor` 페이지가 2026-08-05 폐기됨(웹 모아찍기 sunset S4). 대체 = CEP 패널 → `DEPLOY_MANUAL.md` §3-A · `CUT_PANEL_USAGE.md`. 정리 대상 |
| `A0-panel-designer-deploy.md` | 🗄️ | → `archive/`. 대체 = `DEPLOY_MANUAL.md` §3-A |
| `CAPS-WORKER-DEPLOY.md` | 🟡 | caps-worker 배포 + 근태 공백 복구 원문. 배포 요약은 `DEPLOY_MANUAL.md` §4 |
| `REWORK_RULES.md` | 🟢 | **재작업 처리 규칙**(오퍼레이터·디자이너) — 재작업은 기능화하지 않고 규칙으로 처리 확정(2026-08-05). CLAUDE.md가 참조 |
| `LOGWATCHER_EQUIPMENT_INVENTORY.md` | 🟡 | 장비 인벤토리 매핑표 — 현장 확인 채움 대기 |
| `BARCODE_INVENTORY_SPEC_PENDING.md` | 🟡 | 바코드 입출고 재고 — 구체화 대기(#412, owner 결정) |
| `HANDOFF-flexi-nest-tracking.md` | 🟡 | Flexi 네스팅 추적 — 코드 완료·**prod 미배포** 인계 |
| `HANDOFF-fax-barobill.md` | 🟡 | 바로빌 팩스 FTP — prod 배포완료·**실전 미검증** |
| `HANDOFF-doc-diet.md` | 🟢 | **상태판·백로그 다이어트 인계** — 복붙용 프롬프트 포함. PROJECT_STATUS가 읽기 상한 초과로 잘리는 현행 장애 해소용 |
| `HANDOFF-sunmyung-import-execution.md` | 🟡 | 선명 매입매출 이관 실행 인계 (이관 완결) |
| `HANDOFF-sunmyung-purchase.md` | 🟡 | 선명 매입 인계 (이관 완결) |
| `HANDOFF-bleed-repeat-last-pixel.md` | 🟡 | 도련(Repeat Last Pixel) 배선 인계 — 배선·게이트 통과, **실기 검증·축3/축4 배포 대기**. spec = `superpowers/specs/2026-07-31-cut-file-panel.md` |
| `EQUIPMENT_SURVEY.md` | 🟡 | 장비 전수조사 시트(entity 1, 24대) — 현장 입력 대기. 실물 정본은 `equipment` 테이블 |
| ~~`bank-review-2026-06-24.md`~~ | 🗄️ | 완결 → `archive/` 이동 (2026-07-02) |
| ~~`UNIVERSAL_LOGWATCHER_DESIGN.md`~~ | ❌ | **파일 없음** — 인덱스 유령 항목이었음, 2026-07-27 제거 |
| ~~`integrations/HANJIN_INTEGRATION_ROADMAP.md`~~ | ❌ | **파일·디렉토리 없음** — 유령 항목, 2026-07-27 제거. 한진 관련 현황은 spec `2026-06-11-hanjin-courier-decision.md` |

## 3-1. `docs/audits/` — 감사 기록

| 문서 | 상태 | 성격 · 비고 |
|---|---|---|
| `2026-07-27-list-sort-tiebreak.md` | 🟢 | 목록 정렬 tie-break 전수 감사 정본 (CLAUDE.md 함정 항목이 참조) |
| `2026-07-10-kst-english-audit.md` | 🟡 | KST/영문 표기 감사 |
| `2026-07-29-structure-audit.md` | 🟡 | 코드 구조 전수 감사(src 387파일) — `npm run audit:structure` 산출. 분할 후보·entity 비대칭·tie-break 잠복 목록 |
| `2026-08-08-list-ux-ecount-gap.md` | 🟡 | 목록 UX 이카운트 갭 감사 |

## 3-2. `docs/receivables/` — 채권 실무 산출물

| 문서 | 상태 | 성격 · 비고 |
|---|---|---|
| `sunmyung-overdue-plan-2026-07-20.md` | 🟢 | 선명 연체 조사 정본 (내부/외부 분해·후속 결정) |
| `sunmyung-purchase-ledger-fund-match-diagnosis-2026-07-20.md` | 🟡 | 선명 매입원장↔자금 매칭 진단 |
| `intercompany-mirror/` | 🟢 | 법인간거래 대사 산출물 (git 미추적 — 커밋 여부 확인 필요) |
| `선명_*.sql` / `*.csv` 다수 | 🟡 | 일회성 반영·롤백 스크립트 + 분류표. **실행 이력물이라 삭제 전 확인** |

## 3-3. `docs/analysis/` — 일회성 진단·분석 기록

| 문서 | 상태 | 성격 · 비고 |
|---|---|---|
| `*.md` 9건 | 🟡 | 재무·원가·그룹 진단 기록(2026-08). 그룹 진단 정본 = `2026-08-12-group-diagnosis.md` · 최신 = `2026-08-19-장비-고정자산-대조표.md`. **/reports 재무 숫자 인용 금지** 규칙은 auto-memory `design-finance-diagnosis` |
| `*-rollback.sql` | 🟡 | prod 일괄 작업 롤백 스크립트(백업 테이블 참조 — PII 리터럴 없음). **삭제 전 적용 여부 확인** |
| `*.csv` / `*.xlsx` | ⛔ | 통장·카드·거래처 원자료 = PII → **gitignore**(2026-08-18). 로컬 산출물이며 재생성 가능 |

## 3-4. 이관·분석 작업 디렉터리 (데이터 덤프는 gitignore, 문서·스크립트만 추적)

| 위치 | 상태 | 성격 · 비고 |
|---|---|---|
| `dongsan-import/` | 🟡 | 동산 이카운트 이관 — **완결**(818곳 잔액 오차 0). md 9건 + 규칙 py. csv·`load/`·backup은 PII로 미추적 |
| `sunmyung-import/` · `cheongju-import/` | 🟡 | 선명·청주 이관 산출물(sql/csv). 실행 이력물 — 삭제 전 확인 |
| `order-file-matching/` | 🟢 | **파일→주문서 자동생성 백테스트** — 성립(그룹 90.7%). 정본 문서 = `HOW-IT-WORKS.md`. py 36건 = 분석 하네스, csv는 PII로 미추적 |
| `price/` · `pricing/` | 🟡 | 단가표 작업 산출물(csv·xlsx) |
| `mockups/` | 🟡 | 마감 스티커 A5/A6 인쇄 목업 — 프린터 구매 후 실물 테스트 대기 |
| `design/ASSET_LIABILITY_DESIGN.md` | 🟡 | 자산·부채 설계 초안 |
| `specs/` 3건 | 🟡 | superpowers 이전 spec 잔여분 |

## 4. `docs/superpowers/specs/` — 활성 spec **46건** (2026-08-25 실측)

> ⚠️ 아래 트랙별 목록은 2026-07-02 기준 발췌라 46건 전수가 아니다. 신규 spec 추가 시 해당 트랙에 한 줄 등록할 것.

### 최상위 로드맵·정본
| 문서 | 상태 |
|---|---|
| `2026-07-01-workflow-improvement-master-plan.md` | 🟢 전수분석 마스터 — Phase0·X2·X4·X5 등 배포완료, Phase1~5 잔여 |
| `2026-06-13-item-pricing-inventory-FINAL.md` | 🟢 품목·단가·재고 north-star 정본 |
| `2026-06-16-ia-editor-nesting-intake.md` | 🟢 IA편집·네스팅 마스터 (workbench·file-board·file-editor 3 spec 흡수) |
| `2026-06-27-inventory-redesign-unified.md` | 🟢 재고 통합 재설계 정본 (warehouse+multi-uom 2 spec 대체, UP1~UP4 prod) |

### 품목 마스터 트랙
`2026-06-13-item-axis-realign-plan.md`(게이트 통과) · `2026-06-13-item-master-review.md`(참고) · `2026-06-19-item-master-load-phase1.md` · `2026-06-20-spec-group-variant-item-plan.md`(정본) · `2026-06-20-p1c-mapping-draft.md`(초안·사람검토 필수) · `2026-06-13-signage-component-estimate-structure.md`(간판 BOM 선행설계, 보류)

### 배송/출고 트랙 (완결 → 🗄️ archive 이동 완료)
~~`2026-07-02-delivery-consolidation-intake-visibility.md`~~ · ~~`2026-07-03-shipping-verification-consolidation-v2.md`~~
→ 둘 다 `docs/archive/superpowers/specs/`. (2026-07-27 확인: 인덱스가 활성으로 잘못 표기하고 있었음)

### 진행·잔여 있음
`2026-06-03-receivables-purchase-barobill-brainstorm.md`(잔여 3건) · `2026-06-05-recurring-variable-expense.md`(P4·5 잔여) · `2026-06-10-split-billing-by-entity.md`+`2026-06-10-split-billing-IMPLEMENTATION-PLAN.md`(P5~) · `2026-06-15-logwatcher-equipment-centric.md`(P4 배포 대기) · `2026-06-25-ia-editor-eps-export.md` · `2026-06-25-ia-editor-p2-p3.md`(R2·R3 잔여) · `2026-06-25-factory-layout-integration.md`(P3~P5 재고게이지) · `2026-06-24-leave-management-proposal.md`(정본)+`2026-06-24-leave-promotion-expiry-design.md`(일부 배포·확정 대기)

### 7월 트랙 (2026-07-27 신규 등록 — 그간 인덱스 누락분)
| 문서 | 상태 |
|---|---|
| `2026-07-10-role-expansion-rw-permissions.md` | 🟢 역할 4→8 + can_edit 2단 권한 (prod) |
| `2026-07-10-bank-fund-management-expansion.md` | 🟢 자금관리 P1~P3 prod (이체 pair·일괄매칭·자동매칭 정밀규칙) |
| `2026-07-13-departmental-pnl.md` | 🟢 부문별 손익 P1~P5 prod (/hr 3탭) |
| `2026-07-16-ia-designer-session-loop.md` | 🟢 IA 디자이너 세션 루프 — B단계 prod(#11). 잔여=실가공 자연검증·판짜기 E2E |
| `2026-07-18-inter-entity-transactions.md` | 🟢 법인간거래 원장 이관 (3법인 대사 일치, prod) |
| `2026-07-07-price-sheet-delivery.md` | 🟡 단가표 세트·전달 `/price-list` |
| `2026-07-08-ia-editor-multisource-imposition.md` | 🟡 IA 멀티소스 임포지션 |
| `2026-07-15-ia-editor-concurrency-queue-expiry.md` | 🟡 IA 편집기 동시성·큐 만료 |
| `2026-07-20-ia-jsx-enhancement.md` | 🟡 IA 웹 폐기 → JSX 전환 (P1a 미push) |
| `2026-07-23-ia-palette-session-loop.md` | 🟡 IA 팔레트 세션 루프 |
| `2026-07-24-designer-intake-field-carry.md` | 🟡 대기함 필드 이월 |
| `2026-07-24-postproc-domain-profiles.md` | 🟡 후가공 도메인 프로파일 |
| `2026-07-23-courier-tracking-smarttracker.md` | 🟡 배송추적 스마트택배 KDEXP — **구현 대기**(API key 발급 선행) |
| ~~`2026-07-10-role-expansion-rw-permissions.local-copy.md`~~ | 🗑️ **삭제 완료 (2026-07-27)** — 원본보다 1커밋 뒤처진 stale 사본이었음 |

### 8월 트랙 (2026-08-25 신규 등록 — 그간 인덱스 누락분)
| 문서 | 상태 |
|---|---|
| `2026-08-25-employee-requirements-protocol.md` | 🟢 요구 발굴 + 마스터 데이터 합의 프로토콜 — **실행용 체크리스트 정본**. 전문 아티팩트 링크 내장 |
| `2026-08-24-file-dimension-probe.md` | 🟢 파일 규격 자동 판독(일러 불요) — 설계 확정(「다: 전부」), **별도 세션 구현 대기** |
| `2026-08-06-butt-exact-and-cutline-weld.md` | 🟡 맞붙임 = mm 배치 + 공유 변 단일 출력 — 설계 재작성분. 관련 `2026-07-31-cut-file-panel.md` |
| `2026-08-05-ia-editor-sunset.md` | 🟡 웹 모아찍기 + /ia-editor 폐기 — **설계만**. 실행은 재단 패널 실기 검증 후 |
| `2026-08-05-work-order-auto-issue.md` | 🟡 작업지시서 자동 발행 — 카드=작업지시서 승격 |
| `2026-08-05-neostampa-rip-integration.md` | 🟡 전사 8색(Longyin Q2000·neoStampa) RIP 로그 연동 — **prod 미배포**(Topaz 조인키 미검증) |

### 결정 대기·보류·가드레일 (🟡)
`2026-06-11-alimtalk-golive-package.md`(잔여 결정) · `2026-06-11-card-cashflow-forecast.md` · `2026-06-11-hanjin-courier-decision.md`(외부 의존) · `2026-06-11-client-self-order-portal.md`(선행 대기) · `2026-06-11-card-feed-cost-research.md`(⏸️보류) · `2026-06-11-static-assets-rootcause-redesign.md`(**삭제 금지** — decisions-code "재외부화 금지" 해제조건 앵커)

## 5. `docs/archive/` — 보관 (2026-07-02 재편 · 2026-07-27 실측 반영)

- 2026-06-10 이전 구 아카이브(4~5월 spec·일회성 리뷰 32건)는 **삭제** — git 히스토리로 조회.
- **2026-07-27 추가 확인분 4건** (이미 archive에 있는데 §4가 활성으로 표기하던 것):
  `2026-07-02-delivery-consolidation-intake-visibility` · `2026-07-03-shipping-verification-consolidation-v2`(배송/출고 완결) ·
  `2026-06-26-storage-facility-zone-integration`(창고 배치 운영 전환) · `2026-06-11-ontime-kpi-redesign`(#380 미구현 보류)
- 그 외 내용: 완료/흡수/대체된 6월 spec 12건 + `bank-review-2026-06-24.md`
  - 완료: `large-file-split-plan` · `accounting-hub`(정본=메모리) · `claude-queue-runner` · `ia-editor-p1-improvements` · `ia-editor-followup`
  - 흡수(→nesting-intake 마스터): `web-canvas-ia-workbench` · `incoming-file-board` · `incoming-file-editor`(축소 재정의·보류)
  - 대체(→inventory-redesign-unified): `warehouse-stock-separation` · `multi-uom-inventory`
  - 폐기(→spec-group-variant): `option-axis-implementation-plan` · `option-axis-system-design`(EAV 미채택·장래옵션)

## 6. 기타 위치

| 문서 | 상태 | 성격 |
|---|---|---|
| `queue/README.md` + `templates/` | 🟢 | 작업 큐 러너 사용법 (done/pending 완료분은 삭제, 러너가 디렉토리 자동생성) |
| `memory/session-context.md` | 🟢 | 세션 핸드오프 (세션마다 **덮어쓰기**) — 최근 배포·결정 인계용. 장기 교훈 정본은 auto-memory |
| `LogWatcher/USAGE.md` | 🟢 | LogWatcher 운영 매뉴얼 |
| `IllustratorAutomat/README.md`·`ARCHITECTURE.md` | 🟢 | IA 에이전트 문서 |

---

## 정리 원칙
1. **단일 소스**: 같은 내용 두 벌 금지. 사본 발견 시 한쪽을 archive/삭제.
2. **완료물은 archive**: 끝난 spec은 `docs/archive/superpowers/specs/`로 이동하고, 코드 주석 등 경로 참조를 함께 갱신.
3. **새 문서 = 인덱스 한 줄**: 만들 때 여기 등록, 안 하면 "유령 문서".
4. **아카이브 싱크 2종**(`IMPROVEMENT_BACKLOG_ARCHIVE`·`PROJECT_STATUS_ARCHIVE`)과 **가드레일 앵커**(`static-assets-rootcause-redesign`)는 삭제 금지.
