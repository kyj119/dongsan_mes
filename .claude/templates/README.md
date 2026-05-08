# .claude/templates/ — 신규 기능 스캐폴딩 템플릿

동산현수막 ERP+MES 시스템에서 **새로운 라우트/페이지/스크립트를 추가할 때** 매번 기존 파일을 Grep으로 뒤지지 않도록, 검증된 패턴만 뽑아 둔 템플릿입니다.

## 파일 목록

| 파일 | 복사 위치 | 용도 |
|------|----------|------|
| `route.template.ts` | `src/routes/{name}.ts` | CRUD 5개 엔드포인트 (List/Get/Create/Update/Delete) + authMiddleware + 응답 포맷 |
| `page.template.ts` | `src/pages/{name}.ts` | renderPage() + pageScript + SPA 호환 HTML |
| `script.template.js` | `src/scripts/{name}.js` | IIFE 호이스팅 패턴 + window.* 핸들러 + axios 호출 |

## 사용법

```powershell
# 1. 템플릿 복사
Copy-Item .claude\templates\route.template.ts src\routes\newFeature.ts
Copy-Item .claude\templates\page.template.ts src\pages\newFeature.ts
Copy-Item .claude\templates\script.template.js src\scripts\newFeature.js

# 2. 각 파일 안의 {TABLE_NAME}, {RESOURCE}, {RESOURCE_KR}, {PAGE_TITLE}, {API_PATH} 치환
#    (VS Code "찾아 바꾸기" Ctrl+Shift+H 추천)

# 3. src/index.tsx에 import + 라우트 등록
#    import newFeatureRouter from './routes/newFeature'
#    import { newFeaturePage } from './pages/newFeature'
#    app.route('/api/new-feature', newFeatureRouter)
#    app.get('/new-feature', pageAuthMiddleware, newFeaturePage)

# 4. src/layout.ts 사이드바 메뉴 추가

# 5. 빌드 + smoke test
npm run build
# scripts/smoke.cjs ENDPOINTS 배열에 새 엔드포인트 1~2개 추가
npm run smoke
```

## 치환 토큰

| 토큰 | 의미 | 예시 |
|------|------|------|
| `{RESOURCE}` | 영문 소문자 리소스명 (라우터 변수명 등에 사용) | `employee` |
| `{RESOURCE_PLURAL}` | 복수형 | `employees` |
| `{RESOURCE_KR}` | 한글 리소스명 | `직원` |
| `{TABLE_NAME}` | DB 테이블명 | `employees` |
| `{PAGE_TITLE}` | 페이지 타이틀 | `직원 관리` |
| `{API_PATH}` | API 마운트 경로 (앞에 `/api/`) | `employees` |
| `{PAGE_PATH}` | 페이지 경로 (앞에 `/`) | `employees` |
| `{ICON}` | FontAwesome 아이콘 | `fa-user` |

## 규칙 (반드시 지킬 것)

1. **IIFE는 스크립트 파일 맨 아래**. `window.*` 정의보다 먼저 호출하면 ReferenceError.
2. **글로벌 유틸리티(showToast, showFieldError)는 재정의 금지**. layout.ts의 SHARED_AUTH_JS가 제공함.
3. **JOIN 쿼리에서 모든 컬럼은 alias 명시** (`e.name`, `lb.used` 등). ambiguous 에러 원천 차단.
4. **응답 포맷 일관성**: 성공은 `{ success: true, data: ... }`, 실패는 `{ success: false, error: '...', detail: ... }` + HTTP 상태 코드.
5. **트랜잭션 필요 시 D1 batch** 사용 (`db.batch([...])`).

## 참고 파일 (실제 동작 검증 완료)

- 라우트: `src/routes/leaves.ts` (B3 연차), `src/routes/paymentRequests.ts` (A4 지출결의서)
- 페이지: `src/pages/leaves.ts`, `src/pages/payroll.ts`
- 스크립트: `src/scripts/leaves.js`, `src/scripts/cashFlow.js` (인라인 초기화 패턴)

> 템플릿이 실제 현장과 동떨어지면 안 되므로, 패턴이 바뀌면 이 폴더도 함께 업데이트.

## Dry-run 검증 기록

- **2026-04-09**: 더미 치환(`dummy`/`dummies`/`더미`/`clients`)으로 `_dummy_template_test.ts` 생성 → `npx tsc --noEmit`에서 해당 파일 에러 0건 → `npm run build` 통과(3,146.47 kB) → 파일 삭제. `route.template.ts`는 실제 스키마(`HonoEnv`, `authMiddleware`, `requireRole`)와 정합성 확인 완료.
