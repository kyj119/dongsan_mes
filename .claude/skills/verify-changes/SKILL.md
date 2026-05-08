---
name: verify-changes
description: 코드 수정 후 Playwright MCP로 실제 브라우저 인터랙션 검증. 스크린샷만 보고 "잘 되네요"가 아니라, 버튼 클릭·폼 입력·API 응답·에러 콘솔까지 체계적으로 확인. "검증해줘", "확인해줘", "테스트해줘", "verify" 요청 시 사용.
---

# 변경사항 검증 (Playwright MCP 인터랙션 테스트)

## 핵심 원칙

**"스크린샷 한 장 보고 잘 되네요" 금지.**

검증이란:
1. 버튼을 **직접 클릭**해서 결과 확인
2. 폼에 **실제 데이터 입력** 후 제출 결과 확인
3. **console.error 0건** 확인 (browser_console_messages)
4. **네트워크 에러** 확인 (browser_network_requests)
5. 변경 전후 **차이를 명시적으로 보고**

## 사전 조건

- 서버가 `http://192.168.0.94:3000`에서 실행 중이어야 함 (용준님이 직접 실행)
- 코드 수정 시 `npm run build` 먼저 실행 (dev:d1은 dist/ 서빙)
- 서버 실행 여부는 `curl -s http://192.168.0.94:3000/api/health` 로 확인

## 변경 유형별 검증 체크리스트

### A. 새 페이지 / UI 변경

```
□ 페이지 이동 (browser_navigate)
□ 스냅샷 확인 (browser_snapshot) — 주요 요소 존재 여부
□ 스크린샷 (browser_take_screenshot) — 시각적 레이아웃
□ console.error 0건 (browser_console_messages)
□ 인터랙티브 요소 클릭 (browser_click) — 모든 버튼·탭·드롭다운
□ 모달/드롭다운 열림 확인 (browser_snapshot 재실행)
□ 폼 입력 테스트 (browser_fill_form / browser_type)
  - 검색 필드 → 검색 결과 표시 확인
  - 셀렉트 → 옵션 변경 후 연동 필드 확인
  - 숫자 입력 → 합계 계산 반영 확인
□ 폼 제출 (browser_click submit) → 성공 토스트/리다이렉트 확인
□ 에러 케이스: 필수 필드 비우고 제출 → 경고 메시지 확인
```

### B. API 변경 (백엔드)

```
□ browser_evaluate로 API 직접 호출:
  await fetch('/api/endpoint', { method: 'GET', headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') } }).then(r => r.json())
□ 응답 형식 확인: { success: true/false, data: ... }
□ 에러 케이스: 잘못된 파라미터 → 적절한 에러 메시지
□ 관련 UI가 있으면 → UI에서도 데이터 반영 확인
```

### C. 버튼/기능 추가

```
□ 해당 페이지 이동
□ 버튼 존재 확인 (browser_snapshot → 텍스트/아이콘 확인)
□ 버튼 클릭 (browser_click)
□ 클릭 후 결과 확인:
  - 모달 열림? → 모달 내용 확인
  - API 호출? → 네트워크 요청 확인 (browser_network_requests)
  - 토스트 메시지? → 스냅샷에서 확인
  - 페이지 전환? → URL 확인
□ 취소/닫기 동작 확인
```

### D. 인쇄 기능

```
□ 인쇄 버튼 클릭 전 스크린샷
□ 인쇄 영역(#printArea, #printListArea 등) HTML 내용 확인:
  browser_evaluate → document.getElementById('printArea').innerHTML
□ 데이터가 올바르게 채워졌는지 확인
□ (인쇄 자체는 브라우저 대화상자라 자동 테스트 불가 → 내용만 확인)
```

### E. CSS/스타일 변경

```
□ 해당 페이지 스크린샷 (기본 뷰포트)
□ 모바일 뷰 확인: browser_resize width=375, height=812 → 스크린샷
□ CSS 텍스트 유출 없는지 확인 (style 태그가 화면에 노출되지 않는지)
□ 다크모드 토글 시 깨지지 않는지 (해당 시)
```

## 검증 보고서 형식

검증 완료 후 반드시 아래 형식으로 보고:

```
## 검증 결과

### 확인 항목
| # | 항목 | 결과 | 비고 |
|---|------|------|------|
| 1 | 페이지 렌더링 | PASS | 정상 로드, 에러 없음 |
| 2 | 거래처 검색 | PASS | "동산" 입력 → 1건 검색됨 |
| 3 | 품목 추가 | PASS | 드롭다운 표시, 단가 자동 |
| 4 | 폼 제출 | PASS | "유통 주문이 등록되었습니다" 토스트 |
| 5 | console.error | PASS | 0건 |
| 6 | 출고 확정 버튼 | FAIL | 클릭 시 "카드가 없습니다" 에러 |

### 발견된 문제
- #6: 유통 주문은 카드 미생성이므로 bulk-ship에서 카드 기반 체크 로직 수정 필요

### 스크린샷
- 첨부 또는 경로 표시
```

## 절대 하지 말 것

1. **스크린샷만 보고 "정상입니다" 보고** → 버튼을 1개도 안 눌렀으면 검증 아님
2. **빌드 통과 = 검증 완료** → 타입체크는 기능 검증이 아님
3. **에러가 있는데 "사소한 문제" 처리** → 모든 console.error 보고
4. **"서버가 안 떠서 확인 못 했습니다"** → 용준님께 서버 실행 요청 후 대기
5. **이전 세션 스크린샷 기억에 의존** → 항상 새로 확인

## 사용 예시

사용자: "유통 주문서 검증해줘"
→ 이 스킬 실행:
1. /order-form?type=dist 이동
2. 거래처 "동산" 검색 → 선택
3. 품목 검색 "현수막" → 선택 → 수량 3, 단가 확인
4. + 품목 추가 버튼 → 2번째 품목 추가
5. 배송정보 입력
6. 합계 계산 확인
7. 제출 → 결과 확인
8. /orders에서 새 주문 확인
9. 보고서 작성
