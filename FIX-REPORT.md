# FIX-REPORT — 묶음 ① 인증 경계 (2026-09-03 전체 리뷰 C1)

브랜치 `session/fix-auth` · 커밋 4개 (`3fd2484e` → `e72c22a1` → `93857767` → `fe5b7c86`) · push·배포 안 함

## 항목별 결과 (수정 6 · 스킵 2)

| # | 위치 | 변경 |
|---|---|---|
| 1 | `src/middleware/auth.ts:12` `toAuthUser()` | `portal`/`scope` 클레임 있거나 `id`·`role` 없으면 null → `authMiddleware`(:51)·`pageAuthMiddleware`(:99)·`agentKeyOrAuthMiddleware`(:147) 셋 다 401. 프런트 대조: `employeeSelf.js` 는 `/api/hr/self*` 만, 포털 페이지는 `/api/portal/*` 만 호출 → 정당한 클라이언트 영향 없음 |
| 1 | `src/middleware/permissions.ts:65,67` `requirePagePermission` · `:139` `requireAdminPage` | `!user → next()`(비SPA 초기 로드) 유지, **user 있는데 role 없으면 403**. 나머지 가드 4개(`requirePageEdit`·`requireEditOrRole`·`requireAccessOrRole`·`requireAnyPagePermission`)는 이미 401 이라 변경 없음 |
| 2 | `src/routes/auth.ts:135,149` `/refresh` | `toAuthUser` 로 포털·셀프 토큰 401 → `users` 재조회(`is_active=1`, `COALESCE(job_role,role)`, `is_coordinator`, `default_entity_id`) 없으면 401 → **role·is_coordinator 는 DB 값**으로 재발급 |
| 2 | `src/routes/auth.ts:157` entityId | `\|\| 1` 제거. ADMIN=제시값 그대로(0 유지) · MANAGER=제시값(0 만 소속 법인으로) · 그 외=소속 법인(`default_entity_id \|\| 1`, 로그인 :44 와 동일) |
| 3 | `src/routes/auth.ts:204,229-233` `/switch-entity` | `entity_id` 를 `Number()` 정수 검증(아니면 400). 비 ADMIN/MANAGER 는 **본인 `default_entity_id` 만**, NULL/0 이면 403 「소속 법인이 지정되지 않은 계정은 법인을 전환할 수 없습니다」 |
| 4 | `src/middleware/auth.ts:23` `secretEquals()` · `:120` · `:133` | SHA-256 양쪽 접기 + XOR 누적 비교(caps.ts 패턴). `agentKeyMiddleware` 와 `agentKeyOrAuthMiddleware` 둘 다 교체 |
| 5 | `src/routes/auth.ts:11` `/login` | 라우트 인라인 `rateLimitMiddleware(10)` 제거, `index.tsx:253` 앱 레벨 5/분 하나만 유지. 두 개가 같은 `ip:pathname` 카운터를 요청당 2번 올려 실효 한도가 **3회/분**이었음 |
| 6 | `src/middleware/permissions.ts:14-22` | `CACHE_TTL_MS=60_000` + `cachedPerms()`. `invalidatePermissionCache()` 유지(즉시 무효화) |
| 7 | `src/utils/crypto.ts:70` 평문 비밀번호 폴백 | **SKIPPED** — #336 수용 이슈 |
| 7 | JWT_SECRET 을 AES 키로 겸용 | **SKIPPED** — 지시대로 미조치 |

부수 조치: `/me`(`auth.ts:98`)도 `toAuthUser` 경유 — 포털·셀프 토큰이 `bind(undefined)` 오류 대신 명시적 401.

## 게이트 신설
- `scripts/auth-boundary-selftest.cjs` · `npm run test:auth-boundary` · `test:all` 에 추가(`test:calc` 아님 — 서버 필요).
- `.dev.vars`(junction) 또는 env 의 `JWT_SECRET` 으로 직접 서명 → 포털·셀프·role 없는 토큰 3종 + 로그인 토큰. `SMOKE_URL` 기본 `http://127.0.0.1:3101`, prod 대상 차단.
- 34항목: ① hr/bank/items 3×(401×3+200) ② refresh 모양 거부 3·없는 계정 401·DB role 승·entityId 0 보존(switch-entity(0)→refresh 불변 + 근만료 민팅 토큰→새 토큰 entityId 0) ③ STAFF 타법인/0 → 403·`"abc"` → 400·포털 → 401 ④ SPA+포털/셀프 → `/hr` 401·SPA+로그인 200·비SPA 무토큰 HTML ⑤ X-Agent-Key 틀림 401·맞음 통과·없음 401

## 게이트 실행 결과 (port 3101, `dist` 재빌드본)

| 게이트 | 결과 |
|---|---|
| `npm run typecheck` | 통과 |
| `npm run build` | 통과 |
| `npm run audit:entity` | 67/67 누락 0 |
| `node scripts/sort-audit.cjs` | P1 0 |
| `npm run test:calc` | 전부 통과 (orderline 30 · finishing 28 · slot 67 · dims 19 · credit 11 · stock-unit 30 · valuation 22 · items selftest) |
| `SMOKE_URL=…3101 npm run smoke` | 114/114 |
| `SMOKE_URL=…3101 npm run test:auth-boundary` | 34/34 |

## 통합 시 알아둘 것 (동작 변화)
1. **포털 고객·직원 셀프 토큰은 내부 API 전부 401** — 이전엔 서명만 맞으면 통과. 두 프런트 모두 자기 라우터(`/api/portal/*`·`/api/hr/self*`)만 쓰므로 회귀 없음(위 grep 근거).
2. **refresh 가 DB 를 본다** — 비활성·삭제 계정은 갱신 시점(만료 2h 이내)에 401 → 클라이언트 `shell.js:1050` 는 실패를 warn 만 하고 만료까지 기존 토큰을 쓴다(기존 동작). 역할 강등은 다음 갱신부터 반영.
3. **`default_entity_id` 가 NULL 인 비관리자 계정은 법인 전환 403** — 로그인 자체는 되고(entity 1), 전환만 막힌다. prod 에 해당 계정이 있는지 확인 권장: `SELECT id, username, role FROM users WHERE default_entity_id IS NULL AND COALESCE(job_role, role) NOT IN ('ADMIN','MANAGER') AND is_active=1`. 있으면 사용자 관리에서 소속 법인을 지정하면 된다.
4. **로그인 한도 실효 3회/분 → 5회/분**(index.tsx 값). 제거한 인라인 쪽 주석이 「현장 PC 공유 NAT 고려 10회」였으니 현장에서 429 가 잦으면 `index.tsx:253` 숫자를 올린다(두 곳에 두지 말 것).
5. 권한 매트릭스 변경은 저장한 isolate 는 즉시, 다른 isolate 는 **최대 60초** 뒤 반영.
6. `test:all` 이 이제 서버(기본 3101)를 요구한다 — 지시대로 넣었으나 서버 없이 `test:all` 만 돌리던 습관이 있으면 마지막 단계에서 실패한다.
