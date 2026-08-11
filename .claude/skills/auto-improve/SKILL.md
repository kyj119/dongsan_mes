---
name: auto-improve
description: 자율 점검·개선 에이전트. 6개 영역을 순환하며 실질적 문제 발견 + 안전한 수정 자동 적용 + 기능 제안. 범위 지정 없는 "점검"의 기본 스킬. "자동 개선", "점검", "patrol", "backlog" 요청 시 사용. /loop과 결합하여 주기적 실행 가능. 보안만은 security-audit · prod 비작동 탐지만은 auto-scan.
---

# 자율 점검·개선 에이전트 (Auto-Improve)

프로젝트를 6개 영역으로 나누어 순환 점검. 각 실행마다 **하나의 영역**에 집중하여 깊이 있는 분석 수행.

## 핵심 원칙

1. **발견만 하지 말고 고쳐라** — 안전한 수정은 직접 적용 + build/E2E 검증
2. **현실적 가치만** — "코드 스타일" 같은 사소한 것 무시, 비즈니스 영향 있는 것만
3. **ultrathink** — 표면적 lint가 아니라 "이 기능이 실제로 쓸모 있는가?" 수준의 분석
4. **자기 진화** — 매 실행마다 자신의 탐지 패턴도 개선

## 6개 점검 영역 (4시간 간격 순환)

> **이번 사이클에 도는 영역의 파일 1개만 읽는다.** 6개를 한꺼번에 읽으면 컨텍스트가 넘치고,
> 자동압축이 걸리면 이 SKILL.md 조차 앞부분만 남아 지시가 조용히 사라진다(분해 전 실제로 그 상태였다).
> 아래 파일에 각 영역의 점검 항목·누적 교훈 **전문**이 있다 — 요약이 아니라 정본이다.

| 영역 | 목적 | 정본 (`references/`) |
|------|------|------|
| 🔴 1 프로덕션 헬스 | 지금 이 순간 시스템이 정상인가 (prod API·하트비트·배포 상태) | [area-1-production-health.md](references/area-1-production-health.md) |
| 🟡 2 코드 품질 심층 분석 | 숨겨진 버그와 기술 부채 (entity_id 누락·스키마 드리프트·인증 누락) | [area-2-code-quality.md](references/area-2-code-quality.md) |
| 🟢 3 UX/기능 감사 **(가장 중요)** | 실제 사용자 관점의 결함과 개선 여지 (Playwright 실탐색) | [area-3-ux-audit.md](references/area-3-ux-audit.md) |
| 🔵 4 데이터 정합성 | DB 데이터가 논리적으로 맞는가 (고아 레코드·상태 불일치·중복) | [area-4-data-integrity.md](references/area-4-data-integrity.md) |
| 🟣 5 보안 + 인프라 | 취약점과 인프라 (SQL 바인딩·XSS·인증·시크릿 노출) | [area-5-security-infra.md](references/area-5-security-infra.md) |
| ⚙️ 6 자기 진화 | 이 에이전트 자체의 탐지 능력 향상 (오탐 패턴 codify·백로그 동기화) | [area-6-self-evolution.md](references/area-6-self-evolution.md) |

> **누적 교훈은 이 파일 본문에 쓰지 않는다.** 새로 배운 것은 해당 Area 파일에 추가한다(Area 6 자기진화 포함).
> 본문에 덧붙이면 8KB→197KB(24배) 비대화가 재발하고, 압축 때 뒷부분이 경고 없이 사라진다. 게이트=`npm run audit:skills`.
> ⚠️ Area 파일 안의 `line N` 참조는 분할 전부터 **번호가 밀려 깨져 있다**(29건, 대상 23개 중 5개는 빈 줄).
> 각 파일 머리 주의 참조. **정리는 사이클이 나눠 진다** — 아래 워크플로우 2-b. 잔여 건수 = `npm run audit:skills`.

## 실행 워크플로우

### 수동 실행 (`/auto-improve` 또는 "점검해줘")

```
1. IMPROVEMENT_BACKLOG.md 읽기 (이전 실행 결과 + 승인 상태)
2. 다음 순번 영역 결정 (backlog의 last_run_area 참조)
   → **그 영역의 `references/area-N-*.md` 를 읽는다. 이 파일에만 점검 항목·누적 교훈이 있다.**
     (읽지 않으면 항목을 모른 채 겉핥기로 돈다. 다른 영역 파일은 읽지 않는다 — 컨텍스트 낭비)
2-b. **읽는 김에 그 파일의 `line N` 참조를 서술 참조로 바꾼다 (이번 사이클 영역 파일 1개만).**
     번호는 파일이 자라며 밀려 이미 깨져 있다 — **숫자를 재계산하지 말 것**(틀린 포인터를 정본으로 굳힌다).
     거의 모든 참조는 숫자 옆에 가리키는 대상의 이름이 붙어 있다(`line 208 컬럼-diff bridge`) → 그 이름만
     남긴다: `line 208 컬럼-diff bridge` → `「컬럼-diff bridge」`. 이름이 없으면 인용문을 grep 해 대상을 찾고
     한 마디로 명명한다. 대상을 못 찾으면 **지우지 말고** `(참조 대상 불명)`을 덧붙여 원문을 보존한다.
     다른 Area 파일은 손대지 않는다 — 6개를 한꺼번에 읽는 순간 이 스킬이 다시 컨텍스트를 넘긴다.
3. 해당 영역 deep dive (위임 여부는 §과다 위임 억제 기준 — grep 수준 스캔은 인라인이 빠름)
4. 발견 사항 분류:
   - 🔧 자동 수정 가능 → 즉시 수정 + build + E2E 검증
   - 💡 제안 → IMPROVEMENT_BACKLOG.md에 추가
5. 백로그 갱신(사이클 로그 추가 + 메타/카운터) → **6. 자동 트림 체크(아래 필수)**
7. 결과 요약 출력
```

### 자동 실행 (`/loop` 또는 `/schedule`)

```
1~6 동일
7. 자동 수정 성공 시 → 커밋 (사용자 확인 필요)
8. 다음 실행 스케줄
```

## 🗜️ 백로그 자동 트림 (매 사이클 필수)

**왜 필수인가**: 사이클 로그는 1건당 약 4~5KB다. 방치하면 백로그가 계속 커져 **매 사이클 전체를 읽는 이 스킬 자신의 비용**이 올라가고, 결국 Read 상한에 걸린다. 실제로 2026-06-10부터 **7차까지 전부 사람이 수동 트림**했다(1차 343KB→ … →7차 196KB→63KB). 자동화 없이는 이틀에 한 번 같은 일이 반복된다.

### 트리거

5단계에서 사이클 로그를 추가한 **직후**, 백로그의 `> **Area N ... (날짜):**` 로그 건수를 센다.

| 조건 | 조치 |
|---|---|
| **12건 이하** | 아무것도 안 함 (트림은 4사이클에 1회꼴로 충분) |
| **13건 이상** | **최근 8건만 남기고 나머지를 ARCHIVE로 이관** |

> 8건 = 6개 Area 1바퀴 + 여유 2. 직전 사이클과의 diff 판단(done-sync·churn 비교)에 필요한 최소분이다.
> ⚠️ 단순 "최근 8건"이 **모든 Area를 커버하지 못하면**(같은 Area가 연속 실행된 경우) 빠진 Area의 최신 로그 1건을 추가로 보존할 것 — Area별 직전 기록이 없으면 그 Area의 다음 사이클이 diff를 못 한다.

### 절차 — 명령 한 줄

```bash
npm run backlog:trim          # = node scripts/backlog-trim.cjs
```

**직접 트림 스크립트를 작성하지 말 것.** 위 스크립트가 판정·이관·검증을 전부 수행한다:

| 스크립트가 하는 일 | 비고 |
|---|---|
| 로그 건수 판정 | 12건 이하면 **아무것도 안 하고 종료**(매 사이클 그냥 호출하면 됨) |
| 최근 8건 선별 + Area 커버리지 보강 | 빠진 Area가 있으면 그 Area 최신 1건 자동 추가 보존 |
| ARCHIVE 맨 앞에 prepend | 기존 내용 무변경 |
| 트림 이력 문구 `N차 트림` 자동 삽입 | 차수는 기존 문구에서 자동 산출 |
| **무손실 지문 대조 + 형식 계약 13항목 검증** | 하나라도 실패하면 **양쪽 파일 원본 복구 후 exit 1** |

```bash
npm run backlog:trim -- --check    # 현황만 출력(유지/이관 목록), 파일 무변경
npm run backlog:trim -- --force    # 임계 미만이어도 8건으로 강제 정렬
```

> 과거에 트림 스크립트를 bash 인라인으로 돌렸다가 **백틱이 명령 치환으로 해석돼 표 내용이 조용히 유실된 사고**가 있었다. 그래서 검증까지 포함해 파일로 고정했다 — 재작성이 아니라 호출만 할 것.

### 절대 건드리지 말 것

- `<!-- last_run_area -->` / `<!-- last_run_at -->` 메타 주석
- `## 통계` 카운터 값 (done/rejected는 GitHub 실측 절대값이라 트림과 무관)
- `Approved / New / Auto-fixed / Done / Rejected` 5개 절, **오탐 패턴 표**, 상태 변경 가이드
- `IMPROVEMENT_BACKLOG_ARCHIVE.md`의 기존 내용

> 이 절들은 스킬 자신이 매 사이클 읽고 쓰는 계약이다. 하나라도 없어지면 다음 사이클이 오탐을 재보고하거나 카운터를 잃는다.
> 트림 후 계약 보존을 **자동 체크**하려면: 제목 / 메타 2종 / `## 통계` / done·rejected 카운터 / 5개 절 / 오탐표 / 가이드 = **13항목** 정규식 대조.

## 자동 수정 안전 규칙

**자동 수정 허용 (build + E2E 28개 통과 필수)**:
- entity_id INSERT 누락 추가
- models.ts 타입 갱신
- dead code 제거
- 문서 동기화 (sync-docs)
- 인덱스 추가 마이그레이션
- escapeHtml 누락 추가

**자동 수정 금지 (반드시 제안으로)**:
- 새 기능 추가
- UI/UX 변경
- DB 스키마 변경 (인덱스 제외)
- 라우트 추가/삭제
- 비즈니스 로직 변경
- 기존 API 응답 형식 변경

## 승인된 Issue 처리 워크플로우

사용자가 "승인된 이슈 처리해줘" 또는 "backlog 진행해줘"라고 하면 아래 워크플로우 실행.

### Step 1: 승인된 Issue 수집
```bash
# 👍 리액션이 있는 open Issue 조회
gh api repos/{owner}/{repo}/issues?labels=auto-improve&state=open --jq '.[] | select(.reactions["+1"] > 0) | {number, title}'
```

### Step 2: 코멘트 읽기 (핵심!)
```bash
# 각 승인 Issue의 코멘트 전부 읽기
gh issue view {number} --comments
```

코멘트에 담길 수 있는 내용:
- **방향 수정**: "이 방향 말고 이렇게 해줘"
- **범위 조정**: "1번만 하고 2번은 나중에"  
- **추가 맥락**: "실제로는 이렇게 동작해야 해"
- **디자인 힌트**: "기존 XX 페이지 스타일로"
- **거부 사유**: "이건 안 해도 돼, 이유는..."

### Step 3: 구현
- Issue 본문 = 기본 요구사항
- 코멘트 = **수정/보완된 요구사항** (코멘트가 본문과 충돌하면 코멘트 우선)
- 코멘트에 모호한 부분이 있으면 → Issue에 질문 코멘트 남기고 다음 Issue로
- 구현 후 `npm run build && npm run e2e` 검증

### Step 4: 완료 처리
```bash
# 커밋 메시지에 Issue 번호 포함 → 자동 연결
git commit -m "fix: cards entity_id isolation (closes #1)"

# Issue에 결과 코멘트
gh issue comment {number} --body "✅ 완료. 커밋: {hash}\n\n변경 내용:\n- ..."

# Issue close
gh issue close {number}
```

### Step 5: 코멘트로 질문/논의
구현 중 판단이 필요한 경우, Issue에 코멘트로 질문:
```bash
gh issue comment {number} --body "🤔 구현 중 질문:\n\n{질문 내용}\n\n선택지:\n1. ...\n2. ...\n\n코멘트로 답변 부탁드립니다."
```

---

## IMPROVEMENT_BACKLOG.md 형식

```markdown
# Improvement Backlog
<!-- last_run_area: 3 -->
<!-- last_run_at: 2026-05-11T14:00:00+09:00 -->

## 통계
| 상태 | 건수 |
|------|------|
| 🆕 new | 5 |
| 👀 reviewed | 3 |
| ✅ approved | 2 |
| 🔨 in-progress | 1 |
| ✔️ done | 8 |
| ❌ rejected | 2 |

## 🔴 Bugs
### [B-001] LogWatcher 프로덕션 미수신 (Area 1, 2026-05-11)
- **증상**: heartbeat 3일 미갱신
- **원인 추정**: ERP_API_URL 로컬 주소 잔존
- **영향**: 인쇄 완료 상태 자동 반영 안 됨
- **수정**: LogWatcher .env 확인 + heartbeat 모니터링 엔드포인트 추가
- **공수**: 30분
- **상태**: 🆕

## 🟡 Improvements
### [I-001] 대시보드 KPI 현대화 (Area 3, 2026-05-11)
- **현재**: 오늘 출고 예정 N건만 표시
- **제안**: 일일 매출 추이, 납기 준수율, 미수금 연체 현황, 생산 진행률 추가
- **가치**: 관리자가 한눈에 운영 현황 파악
- **공수**: 2세션
- **상태**: 🆕

## 🟢 Features
### [F-001] 거래처 전화번호 검색 (Area 3, 2026-05-11)
- **현재**: 이름/코드로만 검색 가능
- **제안**: phone, mobile 컬럼도 LIKE 검색에 포함
- **가치**: 전화 문의 시 즉시 거래처 찾기
- **공수**: 15분
- **상태**: 🆕

## 🔧 Auto-fixed
### [A-001] entity_id INSERT 14건 누락 (Area 2, 2026-05-09)
- **수정**: inventory/purchaseOrders/taxInvoices INSERT에 entity_id 추가
- **검증**: build + E2E 28/28 통과
- **커밋**: 5af0fed
- **상태**: ✔️ done
```

## 에이전트 배정

각 영역은 빌트인 **Explore**(읽기·탐색) 또는 general-purpose로 병렬 위임. 모델은 **세션 모델 상속** — 오버라이드 기본 생략.
> 구 고정 티어 배정은 **폐기**(2026-06-05). 과다 위임 억제 기준 포함 상세 → `.claude/references/agent-team-guide.md`

