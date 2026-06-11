---
name: qa-audit
description: Playwright MCP로 MES 전체 페이지 자동 순회 QA 감사 (콘솔 에러, 깨진 UI, API 실패 탐지). 트리거: QA 감사, 전체 감사, full audit, qa audit
---

# QA 전체 감사 (Full Audit)

Playwright MCP로 MES 전체 페이지를 자동 순회하며 문제를 탐지하는 스킬.

## 트리거
"전체 감사", "full audit", "QA", "전체 검증", "페이지 점검" 요청 시 사용.

## 검증 항목

### Level 1: 페이지 로드
- 사이드바의 모든 페이지 링크 수집
- 각 페이지 HTTP 상태 코드 확인 (200 이외 → 에러)
- 콘솔 JS 에러 캡처

### Level 2: API 헬스체크
- 각 페이지의 주요 API 엔드포인트 호출
- 200 + success:true 이외 → 에러 보고
- 응답 시간 측정

### Level 3: 기능 시나리오
핵심 사용자 플로우를 시뮬레이션:
1. 주문서 작성 (거래처 선택 → 품목 추가 → 금액 계산)
2. 유통 주문서 (거래처 → 자동 채움 → 품목)
3. 단가표 (거래처 선택 → 정책 적용 → 인쇄)
4. 메시지 관리 (카카오 템플릿 조회)
5. 출고/배송 (데이터 로드)

### Level 4: 코드 레벨
- review-checklist 스킬 실행
- security-audit 스킬 실행 (선택)

## 실행 방법
```
/qa-audit          # Level 1~3 자동 실행
/qa-audit full     # Level 1~4 포함
/qa-audit quick    # Level 1만 (빠른 체크)
```

## ⚡ 병렬 실행 규칙 (필수)

- **Level 1·3 (Playwright 순회·시나리오)**: 브라우저 단일 인스턴스라 **순차 유지** (병렬 금지)
- **Level 2 (API 헬스체크)**: 브라우저 불필요 — curl 병렬 또는 Explore 1개에 위임해 Level 1과 **동시 진행**
- **Level 4 (코드 레벨)**: review-checklist·security-audit의 정적 검사를 `Agent(subagent_type:"Explore")` **병렬 fan-out**으로 — 파일 묶음 분담, 보고는 `file:line+1줄`만 회수(덤프 금지)
- 발견은 메인 루프가 전수 직접 검증 후 보고. 수정은 메인 단독(병렬 쓰기 금지)
- 빌드·smoke 실행이 필요하면 **background로 돌리고** 다음 Level 진행

## 출력 형식
```
## QA 감사 결과 — 2026-05-08

### Level 1: 페이지 로드 (44/44 통과)
✅ 전체 정상

### Level 2: API 헬스체크 (15/17 통과)
❌ /api/messages/logs → 500 (컬럼명 오류)
⚠️ /api/ledger/clients → 404 (경로 불일치)

### Level 3: 기능 시나리오 (5/5 통과)
✅ 주문서 작성 — 거래처 선택, 품목 추가, 금액 계산 정상
✅ 유통 주문서 — 자동 채움, 품목 검색 정상
...

### 발견된 문제
| # | 심각도 | 위치 | 설명 | 상태 |
|---|--------|------|------|------|
| 1 | HIGH | messages.ts:404 | u.user_name 컬럼 없음 | 수정 완료 |
```
