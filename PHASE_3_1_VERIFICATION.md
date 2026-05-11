# Phase 3.1 리팩토링 — 수동 검증 체크리스트

> 작성: 2026-05-09
> 자동 검증 통과 (typecheck + build + dist 함수 검증). 아래 시나리오는 사용자가 PowerShell + 브라우저에서 진행.

## 사전 작업

### 1. PowerShell에서 빌드 확인 (이미 자동 검증 통과했지만 재확인)
```powershell
cd C:\Users\user\dongsan_mes
npm run verify
```
기대 결과: `vite v5.4.21 building SSR bundle...  ✓ 306 modules transformed.  ✓ built in <10s`

### 2. 로컬 서버 띄우기 + smoke
```powershell
npm run db:reset      # (선택) 깨끗한 상태로
npm run dev:d1        # 별도 터미널에서 백그라운드
# 다른 터미널에서:
npm run smoke
```

### 3. git tag (롤백 대비) — 커밋 전에 baseline 태그
```powershell
git tag refactor/phase-3-1-baseline-pre HEAD
```

---

## 시나리오 A — cards.ts 라우트 검증 (Phase 3.1.A)

### A1. 작업카드 목록 페이지 (`/cards`)
- [ ] 페이지 로드: 카드 목록 표시
- [ ] 검색: "test" 입력 → 결과 필터링
- [ ] 우선순위 정렬, 출고일 정렬 동작
- [ ] 카테고리 필터 (라벨/배너/현수막) 동작
- [ ] urgency 필터 (긴급/오늘/내일/일반)

### A2. 카드 상세 + 상태 변경
- [ ] 카드 클릭 → 상세 모달 (이력 포함)
- [ ] PRINTING → PRINT_DONE 상태 변경
- [ ] 출고 처리 (POST /:id/ship)
- [ ] 출고 취소 (PATCH /:id/unship)

### A3. 일괄 작업
- [ ] 여러 카드 선택 → 일괄 상태 변경
- [ ] 일괄 출고 (bulk-ship)
- [ ] 일괄 우선순위 변경

### A4. 칸반 + 통계
- [ ] `/cards/kanban` → kanban-summary 호출, 컬럼별 카운트
- [ ] 일일 통계 (stats/daily)
- [ ] 불량 통계 (defect-stats)

### A5. 스케줄
- [ ] `/scheduling` → schedule/queues, schedule/unassigned
- [ ] 카드 → 장비 배정 (PUT /schedule/assign/:id)

### A6. EdgeAgent / LogWatcher 연동
- [ ] `/by-number/:cardNumber` 응답 — LogWatcher가 카드번호로 조회 시 정상 응답

---

## 시나리오 B — items.js 검증 (Phase 3.1.B)

### B1. 메인 탭 전환
- [ ] 출력/전사/태극기/간판/상품/원자재/설정 탭 7개 전환
- [ ] 각 탭에서 목록 로드

### B2. 품목 CRUD
- [ ] 신규 품목 추가 (모달 → 기본 정보 → 그룹 → 단가 탭)
- [ ] 품목 수정 (자재 매핑 포함)
- [ ] 품목 삭제

### B3. 인쇄매체 그룹
- [ ] 그룹 모달 열기 → 인쇄방식 일괄 변경
- [ ] 그룹 가격 일괄 변경 + 미리보기 → 적용
- [ ] 매체 일괄 추가 (소재 일괄 추가 마법사)

### B4. 원자재 그룹
- [ ] RM 그룹 펼치기/접기
- [ ] 그룹 내 항목 일괄 편집 (이름, 폭, 가격)

### B5. 가격 이력
- [ ] 품목 → 가격 이력 보기 → 모달

---

## 시나리오 C — orderForm.js 검증 (Phase 3.1.C — 매출 직결, 가장 중요)

### C1. 신규 주문서 작성 (`/order-form`)
- [ ] 거래처 검색 → Enter → 모달 → 선택
- [ ] 여신 배너 표시 (한도 초과 시)
- [ ] 배송 방법/시간 선택

### C2. 품목 행 작업
- [ ] 품목 추가 → 자동완성으로 검색 → 선택
- [ ] 단가 자동 반영 (FIXED / AREA / SHEET 모두)
- [ ] 폭/높이/수량 변경 → 금액 재계산
- [ ] 품목 행 삭제
- [ ] 스케일 팩터 (배율) 변경

### C3. 마감 (Finishing)
- [ ] 1행에 PP+타공 적용 → 단가 반영
- [ ] "전체 적용" 버튼 → 다른 행에 일괄 적용 (`applyFinishingAll`)
- [ ] 마감 상세 토글 (열기/닫기)
- [ ] 오프셋(다이컷) 체크 → 단가 반영

### C4. AI 합판 (Sheet)
- [ ] AI 파일 업로드 (PDF/PNG)
- [ ] 분석 폴링 → 그룹 추출
- [ ] 합판 미리보기 (preview canvas)
- [ ] 시트 양/스케일 변경 → 재계산
- [ ] 시트 통계 표시
- [ ] 합판 확정 (`confirmSheetLayout`)

### C5. 부모-자식 (Grouped Item)
- [ ] AI 결과 → "그룹 품목으로 추가" 클릭
- [ ] 부모 행 + 자식 행 자동 생성
- [ ] 자식 추가/삭제
- [ ] 부모 스케일 변경 → 자식 동기화

### C6. 제출
- [ ] 견적서로 제출 (`submitAsQuotation`)
- [ ] 주문서로 제출 (submitOrder)
- [ ] 수정 모드 (`?id=...&mode=edit`) — 기존 데이터 로드 + 후가공 복원 (`restorePostProcessing`) 정상

### C7. 유통 주문서 (orderFormDist.js — 통합 안 함, 회귀만 확인)
- [ ] `/order-form?type=dist` 페이지 로드 정상
- [ ] 거래처 선택 정상
- [ ] 품목 추가/계산 정상

---

## 회귀 신호 (이상 시 즉시 롤백)

다음 중 하나라도 발생하면 즉시 롤백:

1. **JS 콘솔 에러**: `Uncaught ReferenceError: <함수명> is not defined`
2. **계산 차이**: 같은 입력으로 단가/총액이 이전과 다름
3. **저장 실패**: HTTP 500 응답
4. **페이지 무한 로딩**

---

## 롤백 명령

```powershell
git reset --hard refactor/phase-3-1-baseline-pre
git push --force-with-lease origin main
```

또는 부분 롤백 (한 단계만):
```powershell
# orderForm만 롤백:
mv src/scripts/orderForm.js.refactor-baseline src/scripts/orderForm.js
# pages/orderForm.ts에서 import 라인 원복
```

---

## 커밋 / 배포 명령

검증 통과 후 PowerShell에서:

```powershell
cd C:\Users\user\dongsan_mes

# 1. 백업 파일 정리 (검증 통과 후)
Remove-Item src/scripts/items.js.refactor-baseline
Remove-Item src/scripts/orderForm.js.refactor-baseline

# 2. 빌드 산출물 최신화
npm run build

# 3. git 상태 확인
git status

# 4. 스테이징
git add src/routes/cards.ts src/routes/cards/
git add src/scripts/items/ src/pages/items.ts
git add src/scripts/orderForm/ src/pages/orderForm.ts
git add memory/session-context.md PHASE_3_1_REFACTORING_PLAN.md PHASE_3_1_VERIFICATION.md
git add -u src/scripts/items.js src/scripts/orderForm.js  # 삭제 마킹

# 5. 커밋
git commit -m "Phase 3.1: 대형 파일 3개 리팩토링 (cards.ts/items.js/orderForm.js)

- cards.ts (2121줄) → aggregator + queries/scheduling/lifecycle (4 파일)
- items.js (3235줄) → core/modals/tabs/media/bulk (5 파일, ?raw concat)
- orderForm.js (3966줄) → client/itemRow/finishing/calc/sheet/parent (6 파일)
- orderFormDist.js는 그대로 (351줄)

검증: typecheck + build (306 modules) + dist 함수 검증 통과
백업 태그: refactor/phase-3-1-baseline-pre"

# 6. 푸시 (자동 배포 트리거)
git push origin main
```

GitHub Actions가 자동으로 배포 → 5분 내 production 반영.

---

## 다음 세션 후보

- Playwright E2E 도입 (Phase 5.3) — 이번 세션에서 시간상 보류
- Phase 3.2: 견적서→주문 전환 재설계
- Phase 4: 카카오톡 알림 / 통합 메시지 발송 마무리
