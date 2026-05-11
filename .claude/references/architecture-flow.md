# 코드 아키텍처 흐름

> 코드 수정 시 영향 범위를 빠르게 파악하기 위한 참조 문서.

## 프로젝트 규모 (2026-04-15 기준)

| 항목 | 수량 | 위치 |
|------|------|------|
| API 라우터 | 58개 top-level + 5개 서브파일 = 63개 | `src/routes/*.ts` + `src/routes/{ledger,orders}/*.ts` |
| 페이지 | 82개 (일반 76 + 포털 6) | `src/pages/*.ts` + `src/pages/portal/*.ts` |
| 스크립트 | 78개 | `src/scripts/*.js` |
| DB 마이그레이션 | 127개 파일 (최신 0131) | `migrations/` |
| Seed 파일 | 9개 | 프로젝트 루트 `seed_*.sql` |
| 외부 연동 | IllustratorAutomat(C#), LogWatcher(C#), EdgeAgent | 프로젝트 루트 |

## 요청 처리 흐름 (API)

```
HTTP 요청 → index.tsx
  ↓
1. Trailing Slash Redirect (/api/orders/ → /api/orders)
  ↓
2. CORS Middleware ('/api/*' 경로만)
  ↓
3. 라우터 매칭 (app.route('/api/orders', ordersRouter))
  ↓
4. 라우터 내부 미들웨어 체인
   ├─ authMiddleware → JWT 검증 → c.set('user', payload)
   ├─ requireRole('ADMIN','MANAGER') → 역할 확인 (선택적)
   └─ agentKeyMiddleware → X-Agent-Key 검증 (외부 에이전트 전용)
  ↓
5. 라우트 핸들러 → c.env.DB.prepare(SQL).bind(...).all()
  ↓
6. c.json({ success: true, data: results })
```

## 페이지 렌더링 흐름

```
GET /cards → index.tsx
  ↓
1. pageAuthMiddleware
   ├─ X-SPA-Request='1' → Authorization 헤더 검증
   └─ 일반 요청 → 그대로 통과 (클라이언트 JS가 토큰 확인)
  ↓
2. cardsPage(c) → renderPage(c, { title, pageContent, pageScript })
  ↓
3. renderPage() 분기
   ├─ SPA 요청 → JSON { pageCSS, pageContent, pageScript }
   └─ 초기 로드 → appLayout() → 완전한 HTML
  ↓
4. appLayout() HTML 구조:
   <head> Tailwind CDN + FontAwesome + Axios + SHARED_CSS + pageCSS
   <body>
     sidebarHTML(activePage)    ← 역할별 메뉴 필터링
     topBarHTML(title)          ← 검색 + 알림 + 커맨드 팔레트
     <div class="page-body">   ← pageContent
     SHARED_AUTH_JS             ← JWT 체크 + SPA 네비게이션
     pageScript                 ← 해당 페이지 JS (scripts/*.js)
```

## SPA 네비게이션 흐름

```
사이드바 링크 클릭
  ↓
spaNavigate(url) [SHARED_AUTH_JS]
  ↓
fetch(url, { headers: { 'X-SPA-Request': '1', Authorization: Bearer } })
  ↓
서버: renderPage() → JSON 반환
  ↓
클라이언트:
  1. .page-body innerHTML 교체
  2. #page-css 교체
  3. #page-script 교체 (새 script 실행)
  4. .nav-item 활성 상태 업데이트
  5. history.pushState() → URL 변경 (새로고침 없음)
```

## 데이터 흐름 (프론트 → 백 → DB)

```
scripts/*.js: axios.get('/api/cards', { params })
  ↓ (Authorization: Bearer 자동 추가 — SHARED_AUTH_JS 설정)
routes/cards/{queries,scheduling,lifecycle}.ts: 쿼리 파라미터 파싱 → SQL 동적 구성
  ↓
c.env.DB.prepare(sql).bind(...params).all()
  ↓
c.json({ success: true, data: results })
  ↓
scripts/*.js: res.data.data → 상태 변수 갱신 → DOM 렌더링
```

## JWT 토큰 생명주기

```
POST /api/auth/login → sign(payload, JWT_SECRET, 'HS256') → 8시간 TTL
  ↓
클라이언트: localStorage.setItem('token', token)
  ↓
SHARED_AUTH_JS: axios.defaults.headers.common['Authorization'] = 'Bearer ' + token
  ↓
매 API 호출마다 자동 첨부
  ↓
만료 시: SHARED_AUTH_JS → handleAuthExpired() → /login 리다이렉트
```

## 빌드 & 배포 흐름

```
npm run build
  ↓
Vite: src/index.tsx 진입점
  ├─ pages/*.ts → HTML 반환 함수 번들링
  ├─ scripts/*.js?raw → 문자열로 인라인
  ├─ routes/*.ts → API 핸들러 번들링
  └─ layout.ts → SHARED_CSS/JS 포함
  ↓
dist/_worker.js (Cloudflare Workers 단일 번들)
  ↓
npm run dev:d1     → wrangler pages dev dist (로컬 D1 포함)
npm run deploy     → wrangler pages deploy dist (스테이징)
npm run deploy:prod → 프로덕션 배포
```

## API 라우트 도메인 분류 (58개 top-level, 주요 도메인만 표시)

| 도메인 | 라우터 | 용도 |
|--------|--------|------|
| **주문/생산** | orders, cards, production, postProcessing, shipments, rip, printEvents | 주문~출고 전체 |
| **거래처/기준** | clients, items, priceLists, prices | 기준정보 관리 |
| **재무/경리** | ledger, taxInvoices, cashReceipts, hometaxInvoices, bank, cashFlow, costs | 정산/세금/은행 |
| **구매** | purchaseOrders, purchaseRequests | 발주/구매요청 |
| **재고** | inventory, inventoryCount, bom | 자재/재고/BOM |
| **IA 자동화** | aiAnalysis, aiLayout, iaAuto, autoProcess | Illustrator 자동화 |
| **분석/리포트** | dashboard, reports, productionReports, forecast | 대시보드/분석 |
| **관리** | auth, users, hr, settings, notifications, activityLogs, emails, search, approvals | 인증/사용자/설정 |
| **외부** | webhooks, portal, facility | 팝빌/포털/설비 |
