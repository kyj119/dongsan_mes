# 연차 사용촉진 · 소멸 · 26일 병존 구현 설계서

> 대상: D1~D4 연차관리 P2 미해결 3항목 — ① 사용촉진(제61조) ② 미사용분 소멸/만료 ③ 만1년 26일 병존
> 기준: 입사일 기준 부여 / 미사용분 소멸 + 사용촉진 운영(이월 없음) / 통상임금=기본급+직책수당
> 작성일: 2026-06-24 · **확정 대기** (에이전트 팀 3축 리서치 → 종합)
> 정본 메모리: [[project-leave-management]]

---

## 1. 요약 (핵심 설계 결정 5줄)

1. **데이터 모델 = grant 원장 (옵션A) 채택.** 현 `leave_balances`(employee×year×type 단일 집계행)는 월차11+연차15 병존과 grant별 만료일을 표현 불가 → 발생건 단위 `leave_grants` 신설, `leave_balances`는 **파생 캐시로 동결**(D1 제약상 DROP 불가).
2. **소멸 = 자동 cron 없음 → ADMIN POST batch + 버튼**(기존 `/accrual/*`와 동일 패턴). 이 워커에 Cloudflare `scheduled` 핸들러·`[triggers] crons` 전무(검증: `src/index.tsx:499 export default app`). 자동화는 CAPS Windows 스케줄러 호출 추가가 현실적.
3. **사용촉진 통지 = 이력 테이블이 정본, 알림톡은 보조 채널.** 법상 '서면' 요건을 알림톡 단독으로 충족 못 함 → `leave_promotion_notices`에 단계·도달·회신 로그 적재(3년 보존·수당면제 입증), 카톡은 기존 `kakao.ts` 인프라 재사용.
4. **26일 병존 = grant source 분리로 자연 표현.** 월차=`source='MONTHLY'` grant N건(각 만료일 상이), 1년차=`source='YEARLY'` grant 1건. 잔여=`Σ(days-used_days) WHERE ACTIVE AND 미만료`. FIFO 차감(만료 임박분 우선).
5. **미사용수당 = 촉진 미이행분만 산정.** 적법 촉진 이행분은 소멸(수당 면제), 미이행 잔존분만 `unused-allowance`에 포함 → `payroll.annual_leave_pay` 자동주입은 **P3**.

---

## 2. 법정 규칙 (입사일 기준 · IF/날짜식)

> 모든 날짜 비교 KST(`kstNow()`/`utils/kstDate.ts`). **도달주의**: 통지 도달일(알림톡 수신·이메일 회신)이 기간 내여야 유효, 발송일 아님.

### 2-A. 1년 이상 연차 (제61조 1항)
- 대상: 입사일+1년 이후 발생 연차(15+가산). 만료기준 `EXP = 입사일+N년`.
- 1차: `today ∈ [EXP-6M, EXP-6M+10일]` → 미사용일수 고지+시기지정 요청(서면).
- 근로자 응답: 도달+10일 내 시기 통보.
- 2차: 미통보 시 `EXP-2M` 전까지 사용자 지정 서면통보.
- 예(4/1 입사, EXP 익년 3/31): 1차 10/1~10/10, 2차 익년 1/31.

### 2-B. 1년 미만 월차 (제61조 2항 · 2분할 독립)
- 대상: 월차 최대 11일. `ANNIV = 입사일+1년`.
- [A] 1~9개월분(≤9일): `today ∈ [ANNIV-3M, ANNIV-3M+10일]` → 1차 → 미응답 시 `ANNIV-1M`까지 지정.
- [B] 10·11개월분(2일): `today ∈ [ANNIV-1M, ANNIV-1M+5일]` → 1차 → 미응답 시 `ANNIV-10일`까지 지정.
- A·B 독립. 회계연도 사업장도 1년미만자는 입사일 기준 필수.

### 2-C. 소멸 (제60조 7항, 2020.3.31 개정)
| 권리 | 발생 | 소멸 |
|------|------|------|
| 월차(≤11) | 매월 개근 1일 | **각 발생월+1년** 개별 *(또는 입사+1년 일괄 — §6-1 결정)* |
| 1년차(15+가산) | 입사+1년 | 입사+2년(발생+1년) |
- 26일 병존: 만1년 시점 [월차 소멸]+[15일 발생] 동시, 만료일 다른 두 권리의 사용기간 겹침. 퇴직 1년+1일 = 26일.
- 예외: 사용자 귀책(촉진 미이행) 미사용분 소멸 안 됨 → 수당.

### 2-D. 미사용수당 면제 요건
적법 촉진 = ① 1·2차 법정기간 내 **근로자별 개별 서면**(전체공지·일수오류·1일위반=무효) + ② **노무수령거부**(지정일 출근 시 거부 의사표시) 모두 충족.
⚠️ 서면 갈음: 이메일은 수신·인지 시 유효(대법 2015두41401), **단순 카톡/단체공지 불충분** → 알림톡 단독 갈음 불가, 개별발송+열람/회신 로그+3년 보존 시 보조.

> 출처: 근로기준법 제60·61조(casenote.kr·law.go.kr·lbox.kr), shoplworks·kimchang·impactflow, 노무수령거부 근로개선정책과-4271. (에이전트 web 리서치)

---

## 3. 데이터 모델 — 옵션A(grant 원장) 채택, 옵션B 탈락

| 항목 | A grant 원장 | B 컬럼확장 |
|------|---|---|
| 26일 병존 | ✅ source 분리 | ❌ 단일행 충돌 |
| grant별 만료 | ✅ | ❌ 월차 발생월마다 상이 |
| 부분만료 | ✅ | ❌ |
| FIFO 차감 | ✅ | ❌ |
| 마이그 비용 | 중(4곳 재작성) | 경(표현력 부족) |

검증: `leave_balances` UNIQUE(employee_id,year,leave_type)(0110:20), 월차/연차 둘 다 `leave_type='ANNUAL'` 동일행 `accrued=set` 덮어씀(leaves.ts:229,281) → 병존 불가 확인.

### 3-2. CREATE TABLE (마이그 0383·0384 — 0382는 이미 존재)

```sql
-- 0383_leave_grants.sql
CREATE TABLE IF NOT EXISTS leave_grants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  entity_id INTEGER NOT NULL DEFAULT 1,
  leave_type TEXT NOT NULL DEFAULT 'ANNUAL',  -- ANNUAL / SICK
  source TEXT NOT NULL,                       -- MONTHLY / YEARLY / TENURE_BONUS / EXTRA / CARRY / SICK
  grant_date TEXT NOT NULL,                   -- 발생일 KST(월차=개근월 익월1일, 연차=입사기념일)
  expire_date TEXT,                           -- 월차=grant_date+1년, 연차=발생+1년. NULL=무기한(병가)
  days REAL NOT NULL DEFAULT 0,
  used_days REAL NOT NULL DEFAULT 0,          -- FIFO 소진
  expired_days REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE',      -- ACTIVE / EXPIRED / VOID
  ref_year INTEGER, notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_leave_grants_unique ON leave_grants(employee_id, leave_type, source, grant_date);
-- + idx (emp,type,status) / (expire_date,status) / (entity_id)

-- (권장) FIFO 복원 정확성용
CREATE TABLE IF NOT EXISTS leave_request_consumptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, request_id INTEGER NOT NULL, grant_id INTEGER NOT NULL,
  days REAL NOT NULL DEFAULT 0, entity_id INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (request_id) REFERENCES leave_requests(id), FOREIGN KEY (grant_id) REFERENCES leave_grants(id)
);

-- 0384_leave_promotion_notices.sql (제61조 통지 이력 = 수당면제 입증 정본)
CREATE TABLE IF NOT EXISTS leave_promotion_notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL, entity_id INTEGER NOT NULL DEFAULT 1, grant_id INTEGER,
  fiscal_year INTEGER NOT NULL,
  source TEXT NOT NULL,        -- ANNUAL / MONTHLY_A / MONTHLY_B
  stage TEXT NOT NULL,         -- FIRST / RESPONSE / SECOND
  remaining_days REAL NOT NULL DEFAULT 0,
  notice_date TEXT NOT NULL, delivered_at TEXT, read_at TEXT, designated_use_date TEXT,
  channel TEXT, message_ref TEXT, status TEXT NOT NULL DEFAULT 'SENT',
  notes TEXT, created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_unique ON leave_promotion_notices(employee_id, fiscal_year, source, stage, COALESCE(grant_id,0));
```
> `leave_accrual_logs.accrual_type`은 TEXT라 스키마 변경 없이 `'EXPIRE'`(days 음수)·`'PROMOTION_NOTICE'` 추가 가능.

### 3-3. 백필 (0385) — 집계 48건 → grant 분해
INSERT OR IGNORE, `ref_year` 보수 추정(1/1~익년12/31), `notes='migrated, verify expiry'` 운영자 검토 플래그. 정밀화는 `leave_accrual_logs.run_at` 2차 백필 옵션. **`leave_balances` DROP 금지**(D1 비가역 — [[feedback-d1-fk-column-removal]]) → 파생 동결.

---

## 4. 워크플로

- **적립**(leaves.ts:197/253): monthly→`source='MONTHLY'` grant(days=1, expire=grant_date+1년) 개별, yearly→`YEARLY` 15 + `TENURE_BONUS` 가산. UNIQUE로 멱등.
- **차감/복원/잔여 4곳**(:138/166/442/454/cancel): 잔여=`Σ(days-used_days) WHERE ACTIVE AND (expire_date IS NULL OR >=KST today)`. 차감=`expire_date ASC` FIFO `used_days` 가산(+consumptions). 복원=consumptions 역. **프론트 응답 필드(accrued/used/remaining) 형태 유지 필수**(leaves.js:82-93).
- **소멸 sweep**(신규 `POST /api/leaves/expire`, ADMIN): 만료+촉진 적법 grant만 `status='EXPIRED'`+`expired_days`. 멱등=ACTIVE 가드. 순서=적립→소멸. 촉진 미이행분은 소멸 제외(수당 산정 유지).
- **사용촉진 통지**(신규 `POST /api/leaves/promotion/run?source=&stage=`, ADMIN): kakao.ts `getKakaoProvider`·`getKakaoSettings`·`sendATS`·`kakao_send_logs`·`/template-defaults/resolve` 재사용. 대상=윈도우+잔여>0. `leave_promotion_notices` 적재. 템플릿=`kakao_template_defaults` `context='leaves'` `PROMOTION_1ST/2ND` 시드(0386). 멱등 dup 가드.
- **미사용수당→payroll**(P3): unused-allowance 산식 `payroll/shared.ts` 추출 후 `inject-annual-leave-pay`.

---

## 5. 단계 구현 계획

| 단계 | 내용 | 규모 | 마이그 |
|------|------|------|--------|
| P2-1 | 0383(grants+consumptions)·0384(promotion_notices) | S | 0383,0384 |
| P2-2 | 0385 백필(48건→grant)+동결 표시 | M | 0385 |
| P2-3 | 적립 grant INSERT 전환(멱등 UNIQUE) | M | — |
| P2-4 | 차감/복원/잔여 4곳 grant FIFO·SUM(프론트 필드 유지) | **L** | — |
| P2-5 | 소멸 sweep `POST /expire`+버튼 | M | — |
| P2-6 | 촉진 통지 API+kakao 배선+템플릿 시드 | **L** | 0386 |
| P2-7(선택) | 노무수령거부 기록+CAPS 연동 | M | — |
| P3 | 수당→payroll 자동주입 | M | — |

> 각 단계 후 verify+smoke. KST 일관 적용(calcAnnualEntitlement도 new Date()→kstNow 동반 수정).

---

## 6. 용준님 결정 필요사항

1. **월차 소멸 시점**: (가)각 발생월+1년(법 원칙·정확) vs (나)입사일+1년 일괄(단순).
2. **촉진 통지 채널/서면**: (가)알림톡 단독(리스크) vs (나)알림톡+이메일/전자결재 병행(안전).
3. **통지 발송**: 수동 버튼 vs CAPS 스케줄러 자동.
4. **소멸 batch 실행**: 수동 vs CAPS 자동.
5. **병존 차감 우선순위**: 만료임박(월차) 우선 FIFO 확정 여부.
6. **통지 수신자**: 직원 본인(`employees.phone`) vs 관리자.
7. **백필 정밀도**: year 추정+검토 플래그 vs run_at 2차 정밀백필.
8. **알림톡 템플릿 2종(1·2차)**: 바로빌 사전 승인 필요(미승인 시 발송 불가).
9. **`leave_request_consumptions` 보조표 채택 여부**.
10. **carried_over 백필**: CARRY 보존 vs VOID(이월 안 함 확정).
11. **시행일 가드**: 제61조2항 시행일 노무 확인.

---

## 6-A. ✅ 결정 확정 (2026-06-24, 용준님)

| # | 결정 |
|---|------|
| 범위/순서 | **전체(P2-1~6)** — 단, 안전 위해 **2웨이브 배포**(W1 토대 grant/병존/소멸 → W2 촉진통지). W2 발송은 바로빌 템플릿 승인 후 실동작 |
| 월차 소멸 | **입사일+1년 일괄**(현행법 2020.3.31 개정) — 전 월차 grant expire_date=입사+1년 |
| 촉진 채널 | **알림톡 + 이메일 병행**(이메일 인프라 emailProvider.ts 재사용, 도달/회신 로그 적재) |
| 기본값(제권장 확정) | FIFO 만료임박 우선차감 · `leave_request_consumptions` 채택 · carried_over=VOID(이월 안 함) · 백필=보수추정+검토플래그 · 통지수신자=직원 본인(employees.phone/email) |
| 외부 확인 항목 | 바로빌 알림톡 템플릿 2종(1·2차) 사전 승인 · 제61조2항 시행일 노무 확인 |

## 7. 리스크

| 리스크 | 완화 |
|--------|------|
| **D1 마이그 비가역**(FK 컬럼/테이블 영구제거 불가) | 신규표 IF NOT EXISTS·nullable·entity_id DEFAULT 1. leave_balances DROP 금지(동결) |
| **백필 만료일 오류**(grant_date 추정) | verify 플래그·검토 후 첫 소멸. 2차 정밀백필 선행 |
| **수당면제 법적 오류**(미이행분 소멸) | 소멸 WHERE에 촉진 적법판정 연동, 미충족 소멸 제외. 카톡 단독 갈음 금지 |
| **잔여식 4곳 불일치** | P2-4 일괄 교체+approve 검증 동반, 프론트 필드 유지 |
| **소멸 멱등 실패** | ACTIVE WHERE+EXPIRE 로그 dedup, 적립→소멸 순서 고정 |
| **cron 부재 수동누락**(윈도우 ±10일 1일 위반=무효) | CAPS 스케줄러 자동화 권장, 수동 시 윈도우 도래 알림 |
| **알림톡 도달주의**(발송≠도달) | delivered_at 기록, 면제판정=도달 기준 |
