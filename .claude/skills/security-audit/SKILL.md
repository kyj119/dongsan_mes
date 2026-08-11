---
name: security-audit
description: "동산기획 ERP+MES 보안 취약점 점검 (OWASP Top 10) — 프로젝트 전체 대상. TRIGGERS: 보안 점검, security audit, 취약점 분석, SQL injection, XSS, 인증 누락, 권한 검사. 범위 없는 일반 점검은 auto-improve · 변경분만은 review-checklist."
---

# 보안 취약점 점검

> 상세 점검 항목·grep 명령·발견 패턴 → `references/security-checks.md`

review-checklist과의 차이: review-checklist은 **변경 파일** 코드 리뷰, 이 스킬은 **프로젝트 전체** 보안 감사.

> **`context: fork` 는 의도적으로 쓰지 않는다**(2026-08-11 검토 결론). 이 스킬의 산출물은 prod 런타임 사실이
> 아니라 **코드에 대한 주장**이고, 이 프로젝트엔 서브에이전트 오탐 이력(배열 인덱스 오독 HIGH 2건)이 있어
> **메인 루프가 발견을 전수 직접 검증**하는 게 아래 워크플로우의 핵심 안전장치다. 통째로 포크하면 그 검증이
> 메인 시야 밖으로 빠지고, 어차피 수정하려면 메인이 같은 코드를 다시 읽는다. 무거운 읽기는 이미 Explore
> 팬아웃으로 격리돼 있어 추가 이득도 작다. (fork 채택 = `auto-scan`·`qa-audit` — 산출물이 런타임 사실인 쪽)

## ⚡ 병렬 실행 규칙 (필수)

전체 모드(8개 카테고리)는 메인 루프 순차 스캔 금지 — 카테고리를 3묶음(①1·2·2b ②3·4 ③5~8)으로 나눠 `Agent(subagent_type:"Explore")` **병렬** dispatch:
- 각 프롬프트에 해당 카테고리의 grep 패턴(`references/security-checks.md`)과 오탐 차단 규칙(아래 🧯·시크릿 폴백 등)을 포함
- 보고 형식: `file:line — 심각도 — 패턴 — 근거 1줄` (파일 덤프 금지)
- 메인 루프 = 발견 전수 직접 코드 검증(서브에이전트 오탐 이력: 배열 인덱스 오독 HIGH 2건) → 심각도 분류 → 보고. 수정은 메인 단독

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
| 2b | CSV Formula Injection | CSV 셀 선행 `=+-@`(탭/CR) 미가드 → Excel 수식 실행 | CSV export 헬퍼/라우트 |
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

> **📤 CSV Formula Injection 탐지 (Area 5 #367, 2026-06-08)**: CSV export 셀 값이 자유입력(거래처명/품목명/메모/적요)이고 헬퍼가 선행 `=` `+` `-` `@`(탭/CR)를 이스케이프 안 하면 다운로드 PC Excel에서 수식 실행(`=HYPERLINK` 유출/DDE). `,"` 개행만 따옴표 처리는 부족. **이 코드베이스 CSV 헬퍼 4개 산재**(csv.ts generateCsv/escapeCsvField·payroll/tax-agent csvField·shipments 인라인 esc) — 전수 점검 필수. 가드는 **금융 음수금액 보존**(`typeof!=='number' && isNaN(Number(str))` 조건)으로.

> **🧯 XSS 오탐 차단 — "escapeHtml 헬퍼 전무"는 취약 증거 아님 (Area 6 #335)**: `layout.ts:1185`가 `window.escapeHtml`를 **전역 정의**(+`portalLayout.ts` 포털용) → 모든 `src/scripts/*.js`가 로컬 정의 없이 전역 헬퍼 호출 가능.
> - `grep -c escapeHtml` = 0 이라고 XSS로 보고 금지. **올바른 판정**: 실제 `innerHTML`(또는 `c.html()` 서버 템플릿) 싱크의 **보간값이 (a)사용자 제어 free-text 이고 (b)미escape**인지 직접 확인.
> - 싱크 아님: `Number(x).toLocaleString()` 강제 숫자, 시스템 채번코드(order_number/card_number 등), 서버 하드코딩/서버제어 문자열. (#335 portalBalance.js 미수금표가 이 사유로 잔여 오탐)
> - 진짜 대상: 거래처명·품목명·메모·직무기술서 등 **관리자/사용자 자유입력 마스터**가 escape 없이 innerHTML/`<option>`/`c.html()`에 들어가는 곳.

> **🔓 IDOR 비대칭 탐지 규칙 (Area 5 #349/#356, HIGH 클러스터 6모듈)**: 같은 라우터에서 **목록(list)은 `entityFilter` 적용**하면서 **단건 조회/변경 핸들러(`GET/PUT/PATCH/DELETE /:id`, submit/approve/cancel)는 `WHERE id = ?`만** 쓰는 비대칭 = 의도적 전역공유가 아니라 **격리 누락 버그**.
> - 판별: list가 `entityFilter`를 쓰면 격리 의도가 명확 → 같은 파일의 `/:id` 핸들러에 `entityFilter` 없으면 비-ADMIN이 임의 id로 타법인 도달(PII/재무 열람·변경).
> - 추가 위험: approve/차감 로직이 **대상 행의 entity가 아니라 호출자 `getEntityId(c)`** 를 쓰면 엉뚱한 법인 재고/연차 차감 = 데이터 정합성 훼손(#356 inventoryCount/leaves).
> - **선행 도달성 검증 필수**(#334): `grep "api/<path>" src/scripts src/pages` 호출처 0건이면 보안 아닌 dead-code.
> - **⚠️ 도달성 규칙 예외 (#365)**: "호출처 0건 = 무해"는 **UI 트리거형 격리 갭**(`/:id` 핸들러가 특정 화면에서만 호출)에 한정. **클라이언트 제공 키로 raw 리소스를 서빙하는 범용 엔드포인트**(R2 파일 프록시 `files.ts` GET `/*`, generic download-by-key 등)는 프론트 참조 0건이어도 **인증된 직접 HTTP 호출 자체가 공격표면** — 키가 구조적이거나 다른 응답에 노출되면 도달 가능. 이런 경우 0-refs로 dead-code 강등 금지, 보안 이슈로 보고.
> - grep 출발점: 라우터에서 `entityFilter(c,` 쓰는 파일을 찾고 → 같은 파일 `/:id` 핸들러의 `WHERE id = ?` 가 `ef.clause`/`ef.params` 없이 단독인지 대조.

> **🔓 클라이언트 제공 플래그로 entity 필터 무력화 (Area 5 #368, 2026-06-08)**: IDOR 비대칭의 변종 — 목록 핸들러가 entity 필터를 **갖추고 있어도**, 클라이언트가 보낸 쿼리 파라미터(`?all_entities=1` 등)를 **역할 검증 없이 신뢰**해 필터를 끄면 우회 가능. `storageZones.ts:13` `c.req.query('all_entities')==='1'` → `:21` entity 필터 생략에 role 게이트 0 → 임의 STAFF가 전 법인 데이터 열람.
> - 비대칭 규칙(list-vs-detail)은 "list가 필터를 쓴다"가 전제라 **이 변종을 놓침**(list가 필터를 쓰되 클라가 끌 수 있음).
> - 탐지: `grep -rn "c.req.query(" src/routes` 중 결과가 **entity/필터 분기를 제어**하는 것을 찾아, 그 분기 앞에 `requireRole`/ADMIN·`getEntityId(c)===0` 게이트가 있는지 확인. 관리 페이지 전용 파라미터(`all_entities`, `include_inactive`+격리 등)는 ADMIN/MANAGER로 게이팅돼야 함. 프론트가 "관리 페이지에서만 보낸다"는 건 보호가 아님(직접 HTTP 호출로 복제 가능).

## 실행 워크플로우

### 전체 점검

1. **병렬 에이전트** (모델은 세션 모델 상속 — 보안 판단은 품질 민감 구간이라 하향 오버라이드 금지):
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
