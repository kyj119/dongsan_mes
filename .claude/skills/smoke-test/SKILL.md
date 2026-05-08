---
name: smoke-test
description: Playwright MCP로 MES 핵심 페이지 E2E 스모크 테스트. 로그인→주요 페이지 로드→권한 차단→API 응답을 자동 검증. "스모크", "smoke", "페이지 테스트", "E2E" 요청 시 사용. 배포 전/코드 수정 후 UI 깨짐과 라우트 오류를 조기 발견.
---

# MES 스모크 테스트 (Playwright MCP)

`npm run build` 이후, Playwright MCP로 로컬 서버(http://192.168.0.94:3000)에 접속하여 핵심 경로를 검증한다.

## 사전 조건
- `npm run dev:d1` 서버가 실행 중이어야 함
- 코드 수정 시 `npm run build` 먼저 실행 (dev:d1은 dist/ 서빙)

## 테스트 순서

### Step 1: 빌드 + 서버 확인
```bash
npm run build
```
서버 응답 확인: `http://192.168.0.94:3000/api/health` → 200

### Step 2: Playwright로 로그인
1. `browser_navigate` → `http://192.168.0.94:3000/login`
2. `browser_snapshot` → 로그인 폼 확인
3. `browser_fill_form` → username: `admin`, password: `password`
4. 로그인 버튼 클릭 → 대시보드로 리다이렉트 확인

### Step 3: 핵심 페이지 로드 확인 (8개)
로그인 상태에서 각 페이지 이동 후 `browser_snapshot`으로 정상 로드 확인:

| 순서 | 페이지 | 확인 항목 |
|------|--------|-----------|
| 1 | `/dashboard` | 대시보드 카드/통계 존재 |
| 2 | `/orders` | 주문 목록 테이블 존재 |
| 3 | `/clients` | 거래처 목록 테이블 존재 |
| 4 | `/cards` | 카드(생산단위) 목록 존재 |
| 5 | `/production` | 생산 현황 존재 |
| 6 | `/inventory` | 재고 테이블 존재 |
| 7 | `/items` | 품목 목록 존재 |
| 8 | `/ledger` | 원장 테이블 존재 |

각 페이지에서:
- HTTP 에러 (4xx/5xx 화면) 없는지 확인
- "Error", "Cannot read", "undefined" 같은 JS 에러 텍스트 없는지 확인
- 주요 UI 요소(테이블, 카드 등) 1개 이상 렌더링되었는지 확인

### Step 4: 권한 차단 확인
1. 로그아웃 또는 새 시크릿 탭
2. 비로그인 상태에서 `/dashboard` 접근 → `/login`으로 리다이렉트 확인
3. (선택) 일반 사용자 로그인 후 `/users` (관리자 전용) 접근 → 접근 거부 확인

### Step 5: API 응답 확인
`browser_evaluate`로 fetch 테스트:
```javascript
const res = await fetch('/api/health');
return res.status;
```
→ 200 확인

### Step 6: 콘솔 에러 수집
`browser_console_messages` → error 레벨 메시지가 있으면 보고

## 결과 보고
모든 테스트 통과 시:
```
스모크 테스트 통과 (8/8 페이지, 권한 OK, 콘솔 에러 0건)
```

실패 시 실패 항목과 스크린샷을 함께 보고.

## 주의사항
- 이 테스트는 **읽기 전용** — 데이터를 생성/수정/삭제하지 않음
- 페이지 로드 후 2초 대기 (JS 초기화 시간)
- 네트워크 요청 모니터링으로 실패한 API 호출 감지
