# 작업지시서 자동 발행·관리 — 카드=작업지시서 승격

- 작성: 2026-08-05
- 관련: memory `design-work-order-system`(2026-05-25 봉제실 통합), `design-card-page-roles`(뷰어 우선), `feedback-imported-orders-status-timestamp`(화이트리스트 SSOT)

## 0. 배경·결정

주문접수 → `generateCardsForOrder`(`src/routes/orders/helpers.ts:172`)가 card_group×담당법인별 카드를 이미 자동 생성한다.
`/cards/:id`는 작업지시서 뷰어로 확정(2026-05-26). 이번 설계는 **별도 작업지시서 엔티티를 만들지 않고**
카드를 정식 지시서로 승격해 ①현장 진행 체크 ②발행 현황판 ③하이브리드 산출물을 채운다.

### 확정 결정 (2026-08-05, 용준님)

| 결정 | 선택 |
|---|---|
| 대상 범위 | **전 카드 공통** (OUTPUT·전사/태극기·간판) |
| 산출물 | **하이브리드** — 화면 정본 + 브라우저 인쇄/PDF |
| 관리 범위 | **현장 진행 체크 + 발행 현황판** (개정 이력 관리는 미선택 — 플래그만) |
| 체크 저장 | **별도 테이블** `card_checklist_items` (감사·통계, JSON 경합 회피) |
| 현황판 위치 | **/cards 탭 흡수** (흡수-탭 패턴, 신규 페이지·권한 등록 없음) |
| NAS 배치 | **보류** — QR/화면 전환이 목표. 구 워크플로우(NAS JPG) 고착화 투자 배제. 전환 실패 시에만 에이전트 잡으로 재검토 |

## 1. P1 — 현장 진행 체크

### DB (마이그 0522)

```sql
CREATE TABLE card_checklist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  step_code TEXT NOT NULL,        -- 'PRINT' | 'SEW' | PP코드(PP-GROMMET…) | 'INSPECT'
  label TEXT NOT NULL,            -- 표시명 (파라미터 포함: '하도매 5호 2구')
  sort_order INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'AUTO',   -- AUTO=카드 생성 시 파생
  checked_by INTEGER,             -- users.id (FK 미선언 — 시스템/탈퇴 사용자 대비, 코드베이스 관례)
  checked_at TEXT,                -- UTC CURRENT_TIMESTAMP, 표시는 formatKST
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE cards ADD COLUMN needs_reissue INTEGER NOT NULL DEFAULT 0;
```

### 스텝 자동 파생 (generateCardsForOrder 내)

물리 공정 순서 = 출력 → 봉제(마감) → 후가공 → 검수:

1. `PRINT` — OUTPUT·TRANSFER_FLAG='출력', SIGN='제작' (sort 10)
2. `SEW` — cardFinishing 있을 때만, 라벨=면수 요약 '봉제(3면쌍침)' (sort 20)
3. uniquePP 각각 — step_code=pp.code, 라벨=name+params 값 ('없음' 제외) (sort 30+)
4. `INSPECT` '검수' — 항상 마지막 (sort 90)

- 체크 행 자체가 감사 로그(checked_by/checked_at) — card_events 테이블 없음(card_status_history가 상태 이력 정본).
- category별 settings 템플릿 override는 **후속** (기본 파생 규칙으로 시작, YAGNI).
- print_completed 파이프라인(출력완료 이벤트)과 체크리스트는 **분리** — 자동 상호 체크 없음. 현장 체크가 공정 완료의 정본.

### API (routes/cards/)

- `GET /api/cards/:id/checklist` — 목록 + u.name 조인 (queries.ts)
- `PATCH /api/cards/:id/checklist/:itemId` `{checked: bool}` — 토글, cardEntityScope 격리 (lifecycle.ts)
  - **전 스텝 완료 && status='PRINTING' → PRINT_DONE 자동 전이** (기존 상태머신 준수: PRINTING→PRINT_DONE만).
    pp_status = hasPP ? 'DONE' : 'N/A' (체크리스트가 후가공 스텝 포함하므로 전체완료=후가공완료),
    card_status_history 기록 + syncOrderStatusFromCards 전파.

### 주문 수정 연동 (update.ts)

- 재생성 경로(canRegenerateCards): 카드 삭제 배치에 `DELETE FROM card_checklist_items WHERE card_id IN (...)` 추가 (CASCADE 있어도 명시 삭제 — card_items 관례).
- 보존 경로(cardsPreserved): 라인 교체가 일어났으므로 `needs_reissue=1` 세팅 → 현황판 개정필요 큐.
- `PATCH /api/cards/:id/reissue-ack` — 관리자 확인 시 0 리셋.

## 2. P2 — 발행 현황판 (/cards 「지시 현황」 탭)

`GET /api/cards/issue-status` (⚠️ `/:id` 라우트보다 앞에 등록) — 3개 큐:

1. **누락**: `orders.status IN ('CONFIRMED','PRINTING')` 화이트리스트 + `EXISTS(order_items.shipment_ready=0)` + 활성 카드 0건.
   shipment_ready 불변식 활용 — 카드 미생성 라인은 생성 시 1로 세팅되므로, 0인 라인이 있는데 카드가 없으면 = 생성 실패/이관 누락.
2. **진행**: 활성 카드 × 체크 진행률(step_done/step_total). 완료(전체체크+PRINT_DONE)는 제외.
3. **개정 필요**: `needs_reissue=1`.

- 전 큐 `ORDER BY (delivery_date IS NULL), delivery_date ASC, id ASC` (tie-break 필수).
- entity: 누락=orders.entity_id(entityFilter), 진행/개정=cardEntityScope(order_id→orders).
- 프론트: cards.ts에 탭 바(현장 칸반 | 지시 현황) + `#issueStatusView`, 스크립트 `cards/issueStatus.js` 신규 청크(전역 prefix `is*`).

## 3. P3 — 하이브리드 산출물

- 인쇄 버튼 라벨 '인쇄/PDF 저장' (window.print → 브라우저 PDF). @media print 봉제실 양식은 기존 유지.
- 체크리스트 섹션은 no-print (실물 양식에 없음).
- NAS 배치: **보류 확정** (§0 결정 표).

## 4. 함정 체크리스트 (구현 시)

- [ ] 모든 신규 ORDER BY에 id tie-break
- [ ] issue-status 라우트를 `/:id`보다 앞에 등록
- [ ] cards.ts 탭 추가 시 기존 getElementById 대상 id 전부 보존 (kanban 스크립트 silent fail 방지)
- [ ] ?raw 전역: issueStatus.js 함수 prefix
- [ ] checked_at 저장 UTC·표시 formatKST
- [ ] 체크리스트 batch INSERT는 카드당 ~6행 — D1 바인드 한도 무관하나 다카드 주문은 80청크 유지
- [ ] 로컬 D1 prepare 실행 확인 (타입체크는 SQL 오류 못 잡음)

## 5. 후속 (미착수 기록)

- category별 체크리스트 settings 템플릿 override
- MANUAL 스텝 추가 UI (테이블 source 컬럼은 준비됨)
- print_completed ↔ PRINT 스텝 자동 연동 (운영 피드백 후)
- NAS 배치 에이전트 잡 (전환 실패 시에만)
