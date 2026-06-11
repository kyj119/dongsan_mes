# 정적 에셋 전환 — 근본원인 분석 + 강건 재설계

- **작성일**: 2026-06-11
- **상태**: 🟡 설계(검토 대기) — ⚖️ⓑ "외부화 재시도 금지"의 **해제 조건**을 정의하는 문서
- **대체**: `docs/design/static-assets-migration.md`(2026-06-10, P0 파일럿 → prod 2회 다운 → 롤백). 그 문서의 P0~P3 접근은 **무효**.
- **목표**: "왜 깨졌나"를 정확히 규명하고, 그 결함에 **구조적으로 면역인** 설계만 채택 가능하도록 조건화.

---

## 1. 무엇이 깨졌나 (확정된 장애 메커니즘)

`shell.js`(전역 클라 JS — axios 인증헤더 주입·법인 스위처 초기화)를 `/static/shell.<hash>.js`로 외부화하고 `<script src>`로 참조 → **워커가 그 파일을 `Content-Type` 없이 서빙** → 브라우저 strict MIME 검사가 `MIME type ('') is not executable`로 **실행 거부** → shell.js 미실행 → **전 페이지 API 401 + 무한 로딩 + 법인 미표시**. prod 2회 다운(커밋 `9dd09cde` 잠복 → 롤백 `24bb493c`).

핵심: 장애는 "파일이 없어서"가 아니라 **"워커가 정적 JS를 잘못된(빈) Content-Type으로 서빙"**해서 발생. 즉 `/static/*`가 **워커로 라우팅된 것** 자체가 1차 원인.

---

## 2. 근본 원인 (경험적으로 확정, 2026-06-11)

정적 서빙이 성립하려면 `dist/_routes.json`이 `/static/*`를 워커에서 **제외**(`exclude`)해야 CF Pages가 그 경로를 정적으로(=`_headers`의 Content-Type 적용) 서빙한다. 그런데:

| 검증 | 명령 | 결과 |
|---|---|---|
| 플러그인 **네이티브** 출력 | `rm -rf dist && npx vite build` | `_routes.json` = `{"include":["/*"],"exclude":[]}` · `dist/static` **없음** · `_headers` **없음** |
| build-assets 후 풀빌드 | `npm run build` (`build:assets && vite build`) | `_routes.json`에 `exclude:["/static/*"]` **존재** |

**→ `/static/*` 제외는 `@hono/vite-cloudflare-pages` 플러그인이 생성하지 않는다.** build-assets.mjs가 `vite build` **이전에** 써둔 `_routes.json`을, 플러그인이 (emptyOutDir:false 덕에) **우연히 보존**할 때만 살아남는다.

이 "보존"은 **문서화되지 않은 부수효과**이며 다음 중 하나만 달라져도 `exclude`가 `[]`로 덮여 `/static/*`가 워커로 라우팅된다(=장애 재발):
1. CF Pages 대시보드 **빌드 명령**이 `npm run build`가 아니라 `vite build`/기타 → build-assets 미실행 → 제외 없음 + static 파일 없음.
2. **빌드 순서**(build:assets ↔ vite build) 역전.
3. `emptyOutDir` 동작 차이(로컬 vs CF 컨테이너) → build-assets 산출물 선삭제.
4. **플러그인 버전** 보존 로직 변경.
5. **CF Pages 자체의 `_routes.json` 후처리**(출력 스캔 기반 재생성).

로컬 `npm run build`는 (1)build:assets가 먼저 _routes.json을 쓰고 (2)플러그인이 보존 → 정상. **CF git-push 자동빌드 환경에서 위 변수 중 하나가 달라져 제외가 소실** → 워커가 `/static/shell.js`를 Content-Type 없이 서빙.

> **한 줄 요약**: 치명적 정상성 불변식(`/static`=워커 제외)이 **빌드 파이프라인의 우연한 부수효과**에 의존했고, 그 부수효과가 로컬과 CF 자동빌드에서 달랐다.

### 2차 원인 (장애를 증폭/지연시킨 요소)
- **`_headers` Content-Type는 워커-서빙 경로엔 적용 안 됨** — CF Pages 정적-서빙 경로에서만 적용. `/static`이 워커로 가면 `_headers` 수정도 무의미(2026-06-11 수동수정 `4eaf32c5`가 다음 push 자동빌드 `1a186bde`에 덮여 재발).
- **검증 갭**: curl은 MIME 실행성을 강제하지 않아 통과 → 브라우저 전용 장애를 놓침.
- **배포 모델 갭**: 수동 `wrangler pages deploy`와 git-push 자동빌드가 교차하며 **최신(=push 자동빌드)이 이김**. 수동으로 고쳐도 push 한 번에 원복. → 설계는 **자동빌드 환경에서 동작 보장**돼야 함.

---

## 3. 재시도 해제 조건 (설계 원칙)

어떤 정적-에셋 설계든 아래를 **전부** 만족해야 ⚖️ⓑ 금지를 해제한다:

- **P1. `_routes.json` 제외에 의존 금지.** 정상성이 `exclude:["/static/*"]` 생존에 좌우되면 안 됨(근본원인).
- **P2. Content-Type을 코드가 명시적으로 보장.** edge/blob/빌드 상태와 무관하게 항상 올바른 MIME.
- **P3. 자동빌드(git push)만으로 동작.** 수동 deploy·빌드순서·플러그인 부수효과 비의존.
- **P4. 실패 시 graceful degradation.** 정적 로드 실패가 전역 인증/렌더 붕괴로 번지지 않도록(shell.js 같은 임계 JS는 특히).
- **P5. Playwright 검증 필수.** curl 금지. 콘솔 0 에러 + `window.axios.defaults.headers.common.Authorization` set + `entityName` 텍스트 + 데이터 렌더.

---

## 4. 설계안

### 옵션 A — 워커가 `/static/*`를 직접 서빙 (env.ASSETS + 명시 헤더) · **권장**
`/static`을 워커에서 **제외하려 싸우는 대신, 워커가 의도적으로 소유**한다.
```
build-assets.mjs: src/scripts/*.js → dist/static/<name>.<hash>.js (워커 번들엔 미포함)
worker(hono): app.get('/static/*', c => {
  const res = await c.env.ASSETS.fetch(c.req.raw)   // CF Pages advanced mode 정적 바인딩
  // 명시 헤더로 재서빙 (P2)
  return new Response(res.body, { ...res, headers: { 'Content-Type':'text/javascript; charset=utf-8', 'Cache-Control':'public, max-age=31536000, immutable' }})
})
페이지: <script src="/static/<name>.<hash>.js"> (manifest 기반)
```
- **P1 충족**: `_routes.json` 제외 불요(워커가 처리). 제외가 `[]`여도 정상.
- **P2 충족**: 워커가 Content-Type을 매 응답 명시.
- **P3 충족**: 자동빌드든 수동이든 워커 코드는 동일 동작.
- **번들 크기 이득 유지**: JS가 워커 **번들(?raw)에 미포함** → 콜드스타트 파싱↓. 에셋은 ASSETS에서 fetch.
- **캐싱 이득 유지**: 해시 파일명 + immutable → 브라우저/edge 캐시. 워커 호출은 첫 로드만(드묾).
- **리스크/PoC 필요**: ① `env.ASSETS`가 이 스택(hono `_worker.js` advanced mode)에서 런타임 가용한지 — `Bindings`에 `ASSETS: Fetcher` 추가 후 **자동빌드 prod에서 실측**. ② 임계 JS(shell)는 옵션 A로 빼더라도 **P4 폴백** 고려(로드 실패 시 인라인 폴백 또는 명시 에러). ③ ASSETS.fetch가 advanced mode에서 정적 파일을 반환하는지(일부 구성은 워커가 정적 미접근).

### 옵션 B — `?raw` 워커 인라인 유지 (현행 + ⚖️ⓑ) · 안전·이득 없음
현재 상태. shell.js·페이지 JS를 워커에 인라인. 외부화 안 함 → 캐싱/번들 이득 **없음**, 대신 **무위험**. 대형 파일은 유지보수/컨텍스트 목적의 **분할만**(`layout.ts` 다중 import 방식, 동작 무변경). ⓑ가 cards.js·shell.js에 대해 이미 채택.

### 옵션 C — 별도 에셋 호스트(R2/외부 도메인) · 과설계
R2 버킷(이미 바인딩 존재)에 에셋 업로드 후 공개 URL 참조. CF Pages 빌드 무관 → P1~P3 충족하나 배포 파이프라인 복잡·CORS·캐시무효화 부담. 현 규모(2.6MB 클라 JS)엔 과함.

---

## 5. 권장 & 결정 포인트

- **권장 경로**: 먼저 **옵션 A의 PoC**(env.ASSETS 가용성)를 **자동빌드 prod에서** 검증. 성공 시 옵션 A로 단계적 외부화(임계도 낮은 페이지 JS부터, shell.js는 P4 폴백 확보 후 마지막). 실패 시 **옵션 B 유지**(외부화 영구 보류).
- **임계 JS 우선순위 역전**: 기존 P0가 "shell.js부터"였던 게 화근. shell은 **가장 마지막**(전역 장애 표면적 최대). 비임계 페이지 JS부터.
- **결정 필요**:
  - (a) 옵션 A PoC에 착수할지 / 옵션 B로 외부화 영구 보류할지
  - (b) PoC 범위(비임계 페이지 1개로 env.ASSETS 실측만)

## 6. PoC 계획 (옵션 A 채택 시, prod 무중단)
1. `Bindings`에 `ASSETS: Fetcher` 추가. 비임계 페이지 JS 1개(예: `/about` 류 또는 신규 `/static/_probe.js`)만 외부화.
2. `app.get('/static/*')` 핸들러 + manifest 1개.
3. **로컬 검증 → git push → CF 자동빌드 prod에서 Playwright 검증**(P5). `_routes.json`을 일부러 `exclude:[]`로 두고도 정상인지 확인(P1 증명).
4. 자동빌드 deploy 2~3회 반복(blob 재사용·캐시 변동 하에서도 Content-Type 안정 확인).
5. 통과 시에만 확대. shell.js는 P4 폴백 설계 후 최종.

## 7. 검증 프로토콜 (모든 단계 필수)
- ❌ curl 단독 금지(MIME 미강제).
- ✅ Playwright: 콘솔 error 0 · `window.axios.defaults.headers.common.Authorization` 존재 · `#entityName` 텍스트(법인명) · 실제 데이터 렌더 · `/static/*` 응답 헤더 Content-Type 직접 assert.
- ✅ **git push 자동빌드 결과**로 검증(수동 deploy 결과로 판정 금지 — push가 덮어씀).

---

## 부록 — 현재 상태(정리 대상)
- `scripts/build-assets.mjs`·`src/generated/asset-manifest.ts`·`dist/_routes.json`(제외)·`dist/_headers`는 **현재 dead**(shell.js는 `src/layout.ts:10` `?raw` 인라인). 옵션 B 확정 시 정리 가능, 옵션 A 채택 시 재활용.
- 관련 교훈: `memory/feedback-static-asset-mime.md`, PROJECT_STATUS ⚖️ⓑ.
