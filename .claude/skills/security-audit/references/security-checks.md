# 보안 점검 상세 항목

## 카테고리 1: SQL Injection

```bash
grep -rn "prepare(\`" src/routes/ --include="*.ts"    # 위험: 템플릿 리터럴
grep -rn "\.bind(" src/routes/ --include="*.ts"        # 안전: bind 사용
```

| ID | 점검 | 위험 패턴 | 안전 패턴 |
|----|------|----------|----------|
| SQL-001 | prepare 내 변수 직접 삽입 | `` prepare(`SELECT * FROM ${table}`) `` | `prepare('...?').bind(id)` |
| SQL-002 | ORDER BY 동적 구성 | `` `ORDER BY ${sortColumn}` `` | 화이트리스트 검증 후 삽입 |
| SQL-003 | LIKE 절 와일드카드 | `WHERE name LIKE '%${search}%'` | `.bind('%' + search + '%')` |
| SQL-004 | IN 절 동적 구성 | `` `WHERE id IN (${ids.join(',')})` `` | `WHERE id IN (?,?,?)` + `.bind(...ids)` |

주의 라우터: orders, cards, clients, ledger, search, items. D1은 다중문 불가, UNION 공격은 가능.

---

## 카테고리 2: XSS

```bash
grep -rn "innerHTML" src/scripts/ --include="*.js"
grep -rn "innerHTML" src/pages/ --include="*.ts"
```

| ID | 점검 | 위험 | 안전 |
|----|------|------|------|
| XSS-001 | innerHTML+사용자 데이터 | `el.innerHTML = data.client_name` | `el.textContent` 또는 이스케이프 |
| XSS-002 | 서버 템플릿 미이스케이프 | `` `<span>${order.notes}</span>` `` | HTML 엔티티 이스케이프 |
| XSS-003 | URL 파라미터→DOM | `el.innerHTML = param` | 검증 후 textContent |
| XSS-004 | onclick 사용자 데이터 | `` onclick="fn('${userInput}')" `` | data 속성 + addEventListener |

위험 필드: client_name, notes, internal_notes, hold_reason, content

---

## 카테고리 3: 인증/인가

```bash
grep -rn "router.use" src/routes/ --include="*.ts" | grep -v "authMiddleware"
grep -rn "\.delete\|\.put\|\.patch" src/routes/ --include="*.ts"
grep -rn "JWT_SECRET\|jwt_secret\|secret" src/ --include="*.ts"
```

| ID | 점검 | 설명 |
|----|------|------|
| AUTH-001 | authMiddleware 미적용 | 모든 라우터 확인 |
| AUTH-002 | 위험 작업 requireRole 미적용 | DELETE/PUT/PATCH |
| AUTH-003 | JWT 시크릿 하드코딩 | env에서 읽어야 함 |
| AUTH-004 | JWT 만료 시간 | 현재 8h TTL |
| AUTH-005 | 포털 인증 분리 | 내부 API 접근 불가 확인 |
| AUTH-006 | agentKeyMiddleware 키 관리 | env 관리 확인 |
| AUTH-007~009 | 비밀번호 해싱 | bcrypt 사용, 평문 저장/비교 금지 |
| AUTH-010 | 포털 비밀번호 | SHA-256+salt 확인 |
| AUTH-011 | Webhook 인증 | 팝빌 서명 검증 |

발견 패턴: users.ts 평문 저장 가능성, portal.ts SHA-256 단순 해시, webhooks.ts 서명 미검증

---

## 카테고리 4: IDOR

| ID | 점검 | 설명 |
|----|------|------|
| IDOR-001 | 주문 소유권 확인 | 타 디자이너 주문 수정 가능 여부 |
| IDOR-002 | 원장 접근 제한 | 경리 외 접근 |
| IDOR-003 | 포털 타 거래처 접근 | client_id 변경으로 타사 조회 |
| IDOR-004 | 파일 경로 조작 | `../` 경로 삽입 |

---

## 카테고리 5: 민감 정보 노출

```bash
grep -rn "error.message\|error.stack" src/routes/ --include="*.ts"
grep -rn "password\|password_hash" src/routes/ --include="*.ts"
grep -rn "API_KEY\|SECRET\|TOKEN\|PASSWORD" wrangler.jsonc wrangler.toml 2>/dev/null
```

| ID | 점검 |
|----|------|
| INFO-001 | 에러 메시지에 DB 구조 노출 |
| INFO-002 | API 응답에 password_hash 포함 |
| INFO-003 | .env/.gitignore 확인 |
| INFO-004 | 스택 트레이스 노출 |
| INFO-005 | 소스맵 노출 (vite 설정) |
| INFO-006 | wrangler.jsonc 평문 시크릿 |

발견 패턴: wrangler.jsonc에 JWT_SECRET/RESEND_API_KEY 평문, .gitignore에 wrangler.jsonc 미포함, catch에서 error.message 직접 반환

---

## 카테고리 6: CORS/CSRF

```bash
grep -rn "Access-Control\|cors\|CORS" src/index.tsx src/middleware/ --include="*.ts"
```

| ID | 점검 |
|----|------|
| CORS-001 | `Access-Control-Allow-Origin: *` |
| CORS-002 | credentials + 와일드카드 origin |
| CSRF-001 | JWT Bearer 사용 시 CSRF 방어됨 (쿠키 미사용 확인) |

발견 패턴: CORS `*` 사용 (내부 시스템이므로 도메인 제한 권장), localStorage JWT+Authorization 헤더→CSRF 방어됨, XSS가 실질적 방어선

---

## 카테고리 7: 비즈니스 로직

| ID | 점검 |
|----|------|
| BIZ-001 | 금액 조작 (서버 재검증 여부) |
| BIZ-002 | balance 이중 처리 (경리 확인/취소 반복) |
| BIZ-003 | 결제 상태 역전 (PAID→NULL) |
| BIZ-004 | 음수 금액 입력 |
| BIZ-005 | 동시성 (D1 batch() 트랜잭션) |
| BIZ-006 | 권한 없는 경리 작업 |
| BIZ-007 | billed_amount 클라이언트 제공 |
| BIZ-008 | discount_amount 무제한 |

---

## 카테고리 8: 인프라/설정

```bash
grep -rn "SECRET\|API_KEY\|TOKEN\|PASSWORD" wrangler.jsonc 2>/dev/null
grep -rn "\d\+\.\d\+\.\d\+\.\d\+" src/ --include="*.ts" --include="*.js"
npm audit 2>/dev/null
grep -rn "rate\|limit\|throttle" src/middleware/ src/index.tsx --include="*.ts"
```

| ID | 점검 |
|----|------|
| INFRA-001 | wrangler 시크릿 평문 |
| INFRA-002 | 내부 IP 하드코딩 (192.168.0.94는 예외) |
| INFRA-003 | npm audit 취약점 |
| INFRA-004 | HTTP vs HTTPS |
| INFRA-005 | Rate Limiting (로그인 브루트포스) |
| INFRA-006 | 로그에 민감정보 |
| INFRA-007 | .gitignore 누락 |

발견 패턴: wrangler.jsonc 평문 시크릿 (CRITICAL), 로그인 rate limit 없음, HTTP 사용 (내부망)
