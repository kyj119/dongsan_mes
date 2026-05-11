# 동산현수막 ERP+MES — 로드맵

> **최종 업데이트**: 2026-05-11 (Phase 0, 1, 3.1~3.3, 5.3 완료)
> **기준 자료**: `.claude/PROJECT_STATUS.md`, `memory/session-context.md`, `.claude/design-decisions.md`, `feedback-sheet-layout.md`

## 진행 상태 요약 (2026-05-09)

| Phase | 상태 | 비고 |
|-------|------|------|
| 0 — 인프라 안정화 | ✅ 완료 | CI/CD 가동 + 거래처 정책 UI 배포 + git 7GB→2.5MB |
| 1.1 — 즉시수금 증빙 유형 | ✅ 완료 | 마이그레이션 0189, 회계반영 모달에 select |
| 1.2 — 멀티사업자 이메일 | ✅ 완료 | 마이그레이션 0190, entity별 발신 |
| 1.3 — 팝빌 LinkedID | ✅ 완료 | 사용자가 settings에서 직접 입력 |
| 2 — 운영 차단 해소 | ⏳ 외부 의존 | CAPS 경리 PC 접속 / RIP-LogWatcher 현장 / 라벨 프린터 |
| 3.3 — Client 타입 갱신 | ✅ 완료 | Entity, PricePolicy 인터페이스 추가, Client/Order 보강 |
| 3.1 — 대형 파일 리팩토링 | ✅ 완료 | cards→3파일, items→5파일, orderForm→6파일 (2026-05-09) |
| 3.2 — 견적서 분리 (1:N) | ✅ 완료 | quotations 테이블, 견적서→주문 변환, E2E 포함 (2026-05-09) |
| 5.3 — Playwright E2E | ✅ 완료 | 5 spec / 10 테스트, deploy 후 자동 + 매일 KST 9시 |
| 4 — IA 오프셋 버그 | 🟡 대기 | Illustrator MCP 디버깅 세션 |
| 5 — 모니터링·피드백 | 🔁 상시 | v2 피드백 / E2E 쓰기 확장 / 카카오톡 알림 |

---

## 한눈에 보기

| 시점 | Phase | 핵심 산출물 | 의존성 |
|------|-------|-------------|--------|
| **W0 (오늘~3일)** | 인프라 안정화 | CI/CD 가동 + 거래처 정책 UI 프로덕션 검증 | GitHub Secrets, 첫 push |
| **W1 (1주)** | 회계·재무 정합성 | 증빙 유형 분류 + 멀티사업자 이메일 + 팝빌 LinkedID | 사용자 입력 1건 |
| **W1~3 (외부 의존)** | 운영 차단 해소 | CAPS 워커 가동 + RIP/LogWatcher 현장 배포 + 라벨 프린터 | 경리 PC 접속, 현장 테스트 |
| **W2~4 (별도 세션)** | 기술 부채 | 대형 파일 리팩토링 + 견적서 전환 재설계 + Client 타입 갱신 | brainstorming 선행 |
| **W3~6 (디버깅 세션)** | IA 오프셋 버그 | SheetLayout 3mm 확장 미작동 해결 | Illustrator MCP 연결 |
| **상시** | 모니터링·피드백 | 작업지시서 v2 피드백 / 주문 템플릿 보류 / E2E 도입 | — |

---

## Phase 0 — 인프라 안정화 (W0, 오늘~3일)

**목표**: 검증·배포·헬스체크를 자동화해서 사용자 부담 제거.

### 진행 항목

| 작업 | 상태 | 다음 액션 |
|------|------|----------|
| `.github/workflows/deploy.yml` 작성 | ✅ 완료 | — |
| `.github/workflows/verify.yml` 작성 | ✅ 완료 | — |
| 거래처 정책 UI 코드 (3파일) | ✅ 완료 | — |
| typecheck + build 샌드박스 검증 | ✅ 통과 | — |
| **GitHub Secrets 등록** | ⏳ 사용자 | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` 등록 |
| **첫 push로 워크플로우 가동** | ⏳ 사용자 | `git push` → Actions 탭에서 진행 확인 |
| 프로덕션에서 거래처 모달 정책 드롭다운 동작 확인 | ⏳ 배포 후 | `/clients` → 수정 → 정책 선택/저장 |

### 완료 기준
- main push 한 번으로 배포 완료까지 자동
- 정책 드롭다운이 프로덕션에 떠 있고, 단가 자동 반영 동작

### 리스크
- Cloudflare API Token 권한 부족 → "Edit Cloudflare Workers" 템플릿으로 재생성
- smoke 401 → `SMOKE_USER`/`SMOKE_PASS` 시크릿 추가 등록

---

## Phase 1 — 회계·재무 정합성 (W1, ~1주)

**목표**: 회계반영 + 세금계산서 흐름의 마지막 정합성 퍼즐 정리.

### 1.1 즉시수금 증빙 유형 분류 (P1)
- **무엇**: 회계반영 시 세금계산서/현금영수증/카드/간이 증빙 유형 선택
- **변경**: `receipts` 테이블에 `receipt_type` 컬럼 추가 (마이그레이션 0188)
- **UI**: 회계반영 모달에 라디오/select 추가
- **연쇄 영향**: 세무 정확성 ↑, 세금계산서 페이지 [회계반영 대기] 탭에 유형 뱃지 표시
- **선행**: brainstorming 세션 권장 (4가지 유형의 발행 규칙 차이)
- **검증**: 신규 마이그레이션 → typecheck → 회계반영 모달 동작 → 세무사용 데이터 정합성 확인

### 1.2 멀티사업자 이메일 (P1)
- **무엇**: entity별 발신 이메일 주소 분리 (현재는 단일 발신)
- **변경**: `entities.email_from_address` 컬럼 추가
- **UI**: 사업자 설정 페이지에 발신 주소 입력
- **연쇄 영향**: 거래명세서/원장 이메일이 각 entity의 도메인으로 발신 → 수신자 신뢰도 ↑
- **검증**: Resend 발신 테스트 + DKIM 검증

### 1.3 팝빌 LinkedID 프로덕션 설정 (사용자 액션)
- **무엇**: `tax_provider_linked_id` 프로덕션 설정 UI 입력
- **누가**: 용준님 1회 입력
- **연쇄 영향**: 세금계산서 발행 정상화

### 완료 기준
- 회계반영 시 4가지 증빙 유형 중 선택 가능
- entity별 이메일이 각자 도메인으로 발신
- 팝빌 발행 정상 동작

---

## Phase 2 — 운영 차단 해소 (W1~3, 외부 의존)

**목표**: 코드는 완료된 항목들의 현장/외부 가동.

### 2.1 CAPS 경리PC 워커 실행
- **현재**: `.env`/시크릿 모두 배포 완료, 경리 PC에서 `node src/index.js` 실행만 남음
- **차단 요인**: 경리 PC 접속 불가 (2026-05-08 사용자 보고)
- **다음 액션**: 경리 PC 접속 가능 시점에 워커 실행 + Windows 작업 스케줄러 자동시작 등록
- **검증**: 폴링 로그 + 근태 동기화 결과 확인

### 2.2 RIP 전송 / LogWatcher PrintExp
- **현재**: 코드 완료, 현장 테스트/배포 대기
- **차단**: 현장 일정
- **다음 액션**: 현장 방문 시 일괄 배포 + 동작 확인

### 2.3 라벨 프린터 인쇄
- **현재**: CSS color 강화 완료
- **차단**: 프린터 모델 확인 필요
- **다음 액션**: 사용 중인 라벨 프린터 모델 확인 → 드라이버별 추가 테스트

---

## Phase 3 — 기술 부채 (W2~4, 별도 세션)

**목표**: 코드 품질·유지보수성 향상. 회귀 리스크 큼 → brainstorming 선행 필수.

### 3.1 대형 파일 리팩토링 (가장 큰 작업)
- **대상**:
  - `src/scripts/orderForm.js` 3,966줄
  - `src/scripts/items.js` 3,235줄
  - `src/routes/cards.ts` 2,122줄
- **방향**:
  - `src/services/` 레이어 확장 (도메인 로직 분리)
  - `SELECT *` → 명시적 컬럼 (점진적, 마이그레이션 단위로)
- **세션 분리 필수**: 5 Phase 이상 → 2~3 Phase 단위 세션 분리, 검증 체크포인트
- **선행**: brainstorming 스킬로 분리 경계 확정 후 시작

### 3.2 견적서→주문 전환 재설계
- **현재**: 상태 변경(QUOTATION→CONFIRMED)으로 동작 중
- **방향**: 별도 전환 기능, 견적서 원본 보존
- **긴급도**: 낮음 (현재 동작 중)

### 3.3 Client 타입 인터페이스 갱신
- **현재**: `Client` 인터페이스에 `price_list_id`, `price_policy_id`, `auto_billing` 등 신규 컬럼 누락 (캐스팅으로 우회)
- **방향**: `src/types/models.ts` 전체 갱신, `as unknown as` 캐스팅 제거
- **긴급도**: 중간 (IDE 지원 + 회귀 방지)

---

## Phase 4 — IA 오프셋 버그 (W3~6, 디버깅 세션)

**목표**: SheetLayout 3mm 확장이 안 되는 원인 파악 및 수정.

### 현재 상태 (session-context.md에서 이월)
- `SheetLayout.jsx` line 168~197: `createEdgeStrip` 함수 존재
- `bleed_mm = _params.bleed_mm || 3` 기본값 3mm
- C# Program.cs:1512에서 `bleed_mm = sheetBleedMm` 전달 ✓
- **미확인**: `allDesignItems`가 실제 채워져 있는지 (SheetLayout.jsx:322~344)

### 다음 액션
- Illustrator MCP로 SheetLayout.jsx를 test.eps에 직접 실행 → edge_strip 작동 여부 확인
- `_ia_params_override_path` 변수로 파라미터 파일 직접 지정 가능 (line 40~41)

### 알려진 함정
- Illustrator 최대 문서 크기 ~577cm (스케일 10배 시 619cm → PARM 에러) — feedback-sheet-layout.md
- DXF `visible=false` 레이어 → 잠금 변환됨 (`remove()` 사용해야 함)

---

## Phase 5 — 모니터링·피드백 (상시)

### 5.1 작업지시서 v2 피드백 (2026-05-02 구현 완료)
- **현재**: 시각적 작업지시서 v2 (썸네일+마감 다이어그램) 운영 중
- **다음**: 실사용 피드백 수집 → 추가 개선

### 5.2 주문 템플릿 UI
- **현재**: API 완성, UI 연결 보류 (당장 불필요)
- **결정**: 보류 유지

### 5.3 자동 회귀 테스트 도입 (Phase 0 후속)
- **방향**: Playwright E2E 시나리오 5~10개 (로그인 → 주문 생성 → 출고 → 회계반영)
- **시기**: CI/CD 셋업 안정화 후
- **목표**: 매 배포 후 자동 시나리오 검증

### 5.4 카카오톡 알림 시스템
- **현재**: 미구현 (decisions-business.md C 항목)
- **시기**: 외부 알림 채널 정리 후 (이메일/팩스 안정화 후)

---

## 의존성 그래프

```
Phase 0 (CI/CD)
    │
    ├─→ Phase 1.1 (증빙 유형) ─┐
    ├─→ Phase 1.2 (멀티 이메일) ─┼─→ 자동 회귀 테스트 (Phase 5.3)
    ├─→ Phase 3.x (리팩토링) ────┘
    │
    └─→ Phase 1.3 (팝빌 LinkedID) — 사용자 입력 1회

[독립 트랙 — 외부 의존]
Phase 2.1 (CAPS) ── 경리 PC 접속 복구
Phase 2.2 (RIP/LogWatcher) ── 현장 일정
Phase 2.3 (라벨 프린터) ── 모델 확인

Phase 4 (IA 오프셋) ── Illustrator MCP, 별도 디버깅 세션
```

---

## 즉시 시작 옵션

용준님 다음 액션 선택지:

- **(가) Phase 0 마무리 — GitHub Secrets 등록 + 첫 push** *(권장)*
  - 5분 작업, CI/CD 가동 확인. 이후 모든 작업의 기반.
- **(나) Phase 1.1 즉시수금 증빙 유형 분류 — brainstorming 세션 시작**
  - DB 스키마 변경 포함 → 설계부터.
- **(다) Phase 1.2 멀티사업자 이메일 — 즉시 구현**
  - 작은 작업, Phase 0 가동 후 첫 PR로 적합.
- **(라) Phase 3.3 Client 타입 갱신 — 빠른 정리 작업**
  - 작고 안전, CI/CD 가동 검증용 첫 PR로 활용 가능.
- **(마) Phase 4 IA 오프셋 버그 — Illustrator MCP 디버깅**
  - 다른 트랙. 코드 작업과 병행 가능.

---

## 참조 문서

| 문서 | 용도 |
|------|------|
| `.claude/PROJECT_STATUS.md` | 작업 현황판 (실시간 갱신) |
| `memory/session-context.md` | 직전 세션 결정·맥락 |
| `.claude/design-decisions.md` | 설계 결정 인덱스 |
| `.claude/references/decisions-business.md` | LogWatcher, 묶음 주문, 알림 등 |
| `.claude/references/decisions-money.md` | 금액 포맷 규칙 |
| `.claude/references/decisions-code.md` | 가격 정책(U), Linkhub(V), 권한 모델(Q) 등 |
| `.claude/projects/.../feedback-sheet-layout.md` | IA 오프셋 디버깅 컨텍스트 |
| `.claude/references/architecture-flow.md` | 코드 영향 범위 분석용 |
