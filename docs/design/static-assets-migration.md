# 설계: 클라이언트 JS 정적 에셋 전환

> 목적: `?raw`로 워커에 인라인되는 클라 JS(2.6MB)를 정적 에셋으로 빼서 **브라우저/엣지 캐싱·콜드스타트 개선·대역폭 절감**.
> 작성: 2026-06-10 · 상태: 🟡 설계(검토 대기)

## 1. 현재 상태 (실측)

| 항목 | 값 |
|---|---|
| 워커 번들 | raw 5.1MB / gzip 1.02MB |
| 그중 클라 JS(`src/scripts`) | 2.6MB (103 `?raw` import) |
| 그중 HTML 템플릿(`src/pages`) | 1.2MB |
| 주입 방식 | 페이지가 `<script>${pageScript}</script>`로 본문 인라인 |
| 전역 `shell.js` | `layout.ts`가 **모든 페이지**에 인라인 |
| 서드파티 | 이미 CDN `<script src>` (번들 영향 없음) |

**문제**: 같은 사용자가 페이지를 옮길 때마다 동일한 JS가 HTML에 다시 실려 재다운로드됨(캐시 불가). 워커도 비대 → 콜드스타트 파싱 시간↑.

## 2. 목표 / 비목표

**목표**
- 클라 JS를 `/static/*.js` 정적 파일로 서빙, `<script src>` 참조
- 해시 파일명으로 불변 캐싱(`cards.a1b2c3.js`, `Cache-Control: immutable`)
- 워커 번들에서 클라 JS 제거(→ raw ~2.5MB, 콜드스타트↓)

**비목표**
- 클라 JS를 ES 모듈로 리팩토링(현 전역 IIFE 스타일 유지)
- 서드파티 CDN 의존 변경
- 기능 동작 변경(순수 전달 방식 전환)

## 3. 핵심 난점: 서버값 주입 스크립트

일부 페이지는 서버 데이터를 스크립트 앞에 붙임:
```js
// clientDetail.ts (현재)
pageScript: `var CLIENT_ID = ${clientId};\n${pageScript}`
```
→ 통째로 외부화 불가. **부트스트랩 분리 패턴**으로 해결:
```html
<!-- 서버값만 작은 인라인 (페이지마다 다름, 캐시 불필요) -->
<script>window.__PAGE__ = { CLIENT_ID: 123 };</script>
<!-- 로직은 외부 정적 파일 (캐시됨) -->
<script src="/static/clientDetail.a1b2c3.js"></script>
```
스크립트 내부 `CLIENT_ID` → `window.__PAGE__.CLIENT_ID`로 치환.

## 4. 타깃 아키텍처

```
빌드 2-pass:
 (1) 클라 에셋 빌드: src/scripts/*.js → dist/static/<name>.<hash>.js (minify)
     + manifest.json { "cards": "cards.a1b2c3.js", ... }
 (2) 워커 빌드: ?raw import 제거. 페이지는 manifest 읽어 <script src> 생성.
런타임:
 - /static/* → CF Pages 정적 서빙(엣지 캐시), 워커 안 거침
 - _routes.json에 "exclude": ["/static/*"] 추가
```

## 5. 변경 지점

| 파일 | 변경 |
|---|---|
| `vite.config.ts` | 클라 에셋용 2차 rollup input 또는 별도 빌드 스크립트 추가, manifest 생성 |
| `dist/_routes.json` | `"exclude": ["/static/*"]` |
| `src/layout.ts` | `SHARED_AUTH_JS` 인라인 → `<script src="/static/shell.<hash>.js">` |
| `src/pages/*.ts` (103곳) | `${pageScript}` → manifest 기반 `<script src>` + 서버값 부트스트랩 |
| 헬퍼 | `assetUrl(name)` 유틸 추가(manifest 조회) — 페이지마다 반복 제거 |

## 6. 단계적 마이그레이션 (리스크 격리)

| 단계 | 범위 | 검증 |
|---|---|---|
| **P0 파일럿** | `shell.js`(전역) 1개만 외부화 | 전 페이지 로드·로그인·네비 정상? 워커 size 감소 확인 |
| **P1 무인자 페이지** | 서버값 주입 없는 스크립트들 일괄(가장 단순) | 페이지별 스모크 |
| **P2 서버값 페이지** | 부트스트랩 패턴 적용(clientDetail 등) | `window.__PAGE__` 치환 정확성 |
| **P3 정리** | `?raw` import 전량 제거, 데드코드 정리 | `npm run build && npm run smoke` + 번들 size 재측정 |

> P0(shell.js)만으로도 **모든 페이지에서 가장 큰 캐싱 이득** — 여기서 효과/리스크부터 확인.

## 7. 캐시 전략
- 파일명 해시 → 내용 변경 시만 URL 변경(자동 캐시 무효화)
- `Cache-Control: public, max-age=31536000, immutable` (CF Pages `_headers` 파일)
- HTML은 항상 워커 동적 생성 → 항상 최신 manifest 참조 → stale 위험 없음

## 8. 측정 (전후 비교)
- 워커 번들 raw/gzip size (`wrangler deploy` 출력 또는 `ls dist`)
- 페이지 재방문 시 전송 바이트(브라우저 DevTools Network, JS가 304/캐시인지)
- 콜드스타트(첫 요청 TTFB) 표본 비교

## 9. 리스크 & 롤백
| 리스크 | 완화 |
|---|---|
| 서버값 치환 누락 → 런타임 ReferenceError | P2에서 페이지별 스모크, `grep`으로 잔여 직접참조 확인 |
| 정적 파일 404(경로/manifest 불일치) | P0 파일럿에서 검증, `assetUrl` 단일 경로 |
| 추가 요청으로 LAN 첫 로드 약간↑ | HTTP/2 멀티플렉싱 + 캐시로 2회차부터 상쇄. 인쇄소=재방문 多라 순이득 |
| 빌드 복잡도↑ | 2-pass를 npm script 1개로 캡슐화, 문서화 |

**롤백**: 단계별 커밋 분리. 문제 시 해당 단계만 revert(인라인 방식 복귀).

## 10. 권장 시작점
**P0(shell.js) 파일럿** — 범위 최소, 이득 최대, 전체 패턴 검증. 성공 시 P1~P3 확장.
