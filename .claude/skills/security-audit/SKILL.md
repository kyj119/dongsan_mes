---
name: security-audit
description: "동산기획 ERP+MES 보안 취약점 점검 (OWASP Top 10). TRIGGERS: 보안 점검, security audit, 취약점 분석, SQL injection, XSS, 인증 누락, 권한 검사."
---

# 보안 취약점 점검

> 상세 점검 항목·grep 명령·발견 패턴 → `references/security-checks.md`

review-checklist과의 차이: review-checklist은 **변경 파일** 코드 리뷰, 이 스킬은 **프로젝트 전체** 보안 감사.

## 실행 모드

- `/security-audit` → 전체 (8개 카테고리)
- `/security-audit api` → API (1~4)
- `/security-audit frontend` → 프론트엔드 (5~6)
- `/security-audit auth` → 인증/인가 (3)
- `/security-audit [파일경로]` → 특정 파일

## 심각도 분류

| 등급 | 기준 |
|------|------|
| CRITICAL | 즉시 악용 가능 (SQLi, 인증 우회, 시크릿 노출) |
| HIGH | 조건부 악용 (XSS, IDOR, 권한 상승) |
| MEDIUM | 정보 노출, 설정 미비 |
| LOW | 모범 사례 미준수 |

## 8개 카테고리 요약

| # | 카테고리 | 핵심 체크 | 대상 |
|---|---------|----------|------|
| 1 | SQL Injection | prepare 내 변수 직접 삽입, ORDER BY 동적, IN 절 | `src/routes/*.ts` |
| 2 | XSS | innerHTML+사용자 데이터, 서버 템플릿 미이스케이프 | `src/pages/*.ts`, `src/scripts/*.js` |
| 3 | 인증/인가 | authMiddleware 미적용, requireRole 누락, JWT 시크릿 | `src/routes/*.ts`, `src/middleware/` |
| 4 | IDOR | 소유권 미확인, 포털 client_id 변조, 경로 조작 | 주요 라우터 |
| 5 | 민감정보 노출 | error.message 직접 반환, password_hash 응답, 소스맵 | 전체 |
| 6 | CORS/CSRF | origin 와일드카드, 쿠키 기반 인증 여부 | `src/index.tsx` |
| 7 | 비즈니스 로직 | 금액 조작, balance 이중 처리, 동시성 | 원장/주문 |
| 8 | 인프라/설정 | wrangler 시크릿, IP 하드코딩, rate limiting, 보안 헤더, **시크릿 폴백** | 설정 파일, `src/routes/*.ts` |

> **🔑 시크릿 폴백 탐지 규칙 (Area 5 #338 net-new)**: `c.env.SECRET || '리터럴'` 패턴 전수 스캔.
> `grep -rnE "c\.env\.[A-Z_]+ *\|\| *'"` — 암호화 키/JWT/비밀번호 폴백이 소스에 박히면 git 접근자 복호화/우회 가능.
> 또한 `body.password || 'literal'` 등 **기본 비밀번호 폴백**(reset-password)도 대상. CI yml의 `secrets.X || 'admin'` 폴백도 포함.
> ⚠️ 이전 점검(#314)이 "하드코딩 시크릿 없음"으로 단언했으나 이 패턴을 놓침 → **매 Area 5 필수 grep**.

> **🧯 XSS 오탐 차단 — "escapeHtml 헬퍼 전무"는 취약 증거 아님 (Area 6 #335)**: `layout.ts:1185`가 `window.escapeHtml`를 **전역 정의**(+`portalLayout.ts` 포털용) → 모든 `src/scripts/*.js`가 로컬 정의 없이 전역 헬퍼 호출 가능.
> - `grep -c escapeHtml` = 0 이라고 XSS로 보고 금지. **올바른 판정**: 실제 `innerHTML`(또는 `c.html()` 서버 템플릿) 싱크의 **보간값이 (a)사용자 제어 free-text 이고 (b)미escape**인지 직접 확인.
> - 싱크 아님: `Number(x).toLocaleString()` 강제 숫자, 시스템 채번코드(order_number/card_number 등), 서버 하드코딩/서버제어 문자열. (#335 portalBalance.js 미수금표가 이 사유로 잔여 오탐)
> - 진짜 대상: 거래처명·품목명·메모·직무기술서 등 **관리자/사용자 자유입력 마스터**가 escape 없이 innerHTML/`<option>`/`c.html()`에 들어가는 곳.

> **🔓 IDOR 비대칭 탐지 규칙 (Area 5 #349/#356, HIGH 클러스터 6모듈)**: 같은 라우터에서 **목록(list)은 `entityFilter` 적용**하면서 **단건 조회/변경 핸들러(`GET/PUT/PATCH/DELETE /:id`, submit/approve/cancel)는 `WHERE id = ?`만** 쓰는 비대칭 = 의도적 전역공유가 아니라 **격리 누락 버그**.
> - 판별: list가 `entityFilter`를 쓰면 격리 의도가 명확 → 같은 파일의 `/:id` 핸들러에 `entityFilter` 없으면 비-ADMIN이 임의 id로 타법인 도달(PII/재무 열람·변경).
> - 추가 위험: approve/차감 로직이 **대상 행의 entity가 아니라 호출자 `getEntityId(c)`** 를 쓰면 엉뚱한 법인 재고/연차 차감 = 데이터 정합성 훼손(#356 inventoryCount/leaves).
> - **선행 도달성 검증 필수**(#334): `grep "api/<path>" src/scripts src/pages` 호출처 0건이면 보안 아닌 dead-code.
> - grep 출발점: 라우터에서 `entityFilter(c,` 쓰는 파일을 찾고 → 같은 파일 `/:id` 핸들러의 `WHERE id = ?` 가 `ef.clause`/`ef.params` 없이 단독인지 대조.

## 실행 워크플로우

### 전체 점검

1. **병렬 에이전트** (haiku 모델):
   - Agent 1: SQL Injection (카테고리 1)
   - Agent 2: XSS (카테고리 2)
   - Agent 3: 인증/인가 (카테고리 3)
   - Agent 4: IDOR + 비즈니스 로직 (4+7)
   - Agent 5: 민감정보 + CORS + 인프라 (5+6+8)

2. **결과 취합** → 심각도별 정리

3. **보고서**:
   ```
   ## 보안 점검 결과 요약
   | 심각도 | 건수 |
   | CRITICAL | N건 |
   ...
   ### CRITICAL 발견 사항
   [ID] 설명 → 파일:라인 → 수정 방법
   ```

4. **수정 제안** (사용자 확인 후 적용)

### 부분 점검
지정된 카테고리/파일만 해당 항목 실행.

## 오탐(False Positive) 제외 패턴

| 패턴 | 이유 |
|------|------|
| `webhooks.ts allowedPrefixes` Popbill IP 목록 | 의도적 보안 화이트리스트 — 하드코딩이 아님 |
| vite/esbuild dev server SSRF (GHSA-67mh 등) | 로컬 dev server 전용, 프로덕션 영향 없음 |
| CORS `!origin → '*'` (`index.tsx:213`) | Bearer 토큰 인증(쿠키 미사용) — 브라우저는 항상 Origin 전송, 실질 무해 |
| rate limiter in-memory `Map` (`rateLimit.ts:6`) | isolate 분산 한계는 기존 인지 사항(아키텍처 제약), 신규 이슈 아님 |

## 정기 점검 권장
- 매 배포 전: `/security-audit api`
- 월 1회: `/security-audit` (전체)
- 새 라우터/페이지 추가 시: 해당 파일 점검
