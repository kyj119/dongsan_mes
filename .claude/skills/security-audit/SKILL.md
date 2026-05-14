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
| 8 | 인프라/설정 | wrangler 시크릿, IP 하드코딩, rate limiting, 보안 헤더 | 설정 파일 |

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

## 정기 점검 권장
- 매 배포 전: `/security-audit api`
- 월 1회: `/security-audit` (전체)
- 새 라우터/페이지 추가 시: 해당 파일 점검
