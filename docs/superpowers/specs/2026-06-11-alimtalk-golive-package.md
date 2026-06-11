# 알림톡 Go-Live 패키지 — 일괄발송 오보고 수정(#378) + 출고 자동발송(option C)

- **작성일**: 2026-06-11
- **상태**: ✅ **설계 확정 (2026-06-11 용준님 결정)** — D1=가 · D2=다 · D3=가. 구현 착수 가능
- **관련**: GitHub #378(MED), PROJECT_STATUS TODO ⑨, `kakao-alimtalk-templates.md`
- **목표**: `barobill_test_mode=0` 전환(go-live) 전에 발송 신뢰성 2건을 한 세션으로 완결

---

## 1. 배경 / 현황

### 완료된 기반 (2026-06-10 기준)
- 알림톡 실발송 성공 확인 (SendKey 수신·실착신, 커밋 `9bf1cb2e`)
- 승인 템플릿 4종: 대신화물 출고 / 대신택배 출고 / 방문 수령 준비 완료 / 미수금
- 수동발송 정합 완료 (autoCodeMap 실제 템플릿명, 커밋 `0a329a02`)
- 자동발송 트리거 이미 배선됨: `src/routes/shipments.ts` 출고 등록 시 `kakao_enabled=1`이면 내부 API `/api/kakao/send-shipment` 위임 (fire-and-forget, 실패해도 출고는 성공 처리)

### 문제 A — #378: 일괄발송 부분/전체 실패를 "N건 발송 완료"로 오보고
- `src/routes/kakao.ts:923` `POST /send-shipment-bulk` 응답에 `status`/실패건수 누락, `sent_count = targets.length`(성공 수 아님)
- `interpretBulkResult`(`src/services/barobillSms.ts:401`)는 ok/fail을 알지만 라우트가 내려보내지 않음
- 프론트 `src/scripts/shipments.js:981`이 무조건 success 토스트 → 부분 실패(10중 5)·전량 실패 모두 "10건 발송 완료" 녹색 표시
- 대조: 단건 `/send`(`kakao.ts:355`)·`/send-sms-bulk`(`:909`)는 `status` 포함 = shipment-bulk만 회귀

### 문제 B — 자동발송 미완성 (option C)
- 트리거는 살아있으나 `delivery_method` → 템플릿 코드 매핑(`template_code` + `resolveMsg`)이 비어 있어 실제 발송으로 이어지지 않음
- delivery_method 7종(마이그 0290) vs 승인 템플릿 4종 → 매핑 갭 존재 (한진택배 템플릿 미등록)

---

## 2. 결정 포인트 — ✅ 확정 (2026-06-11)

> **D1 = 가** (결과 모달 + 실패 건 목록 + 재발송 버튼) — 근거: `interpretBulkResult`의 `<string>` 배열이 입력 순서 보장 → 건별 식별 가능, `kakao_send_logs`로 재발송 멱등 가드.
> **D2 = 다** (단건 출고 포함 전부 bulk API 경로로 묶음 발송 — 발송 경로 단일화) — 일괄출고 서브요청 한도 회피 + 코드 경로 1개. 단건 출고는 1건짜리 bulk 콜.
> **D3 = 가** (한진택배 = 자동발송 skip + 로그 기록, 템플릿 등록 후 매핑 1줄 추가) — autoCodeMap 기존 방침과 일치.
> 구현 시 interpretBulkResult를 건별 결과 배열 반환으로 확장(현행 개수 집계 → `results[]`).

### D1. 부분 실패 시 UX (#378)
| 안 | 내용 | 트레이드오프 |
|---|---|---|
| **가 (권고)** | 결과 모달: 성공 N / 실패 M + 실패 건 목록(주문번호·수신번호·사유) + "실패 건만 재발송" 버튼 | 구현 +0.5세션, 운영자가 즉시 조치 가능 |
| 나 | 토스트만 분기(성공=녹색 / 부분실패=주황 "N성공 M실패" / 전량실패=빨강) | 최소 구현, 실패 건 식별은 로그 확인 필요 |
| 다 | 나 + 실패 건 자동 재시도 1회(backoff) 후 결과 보고 | transient 흡수, 단 바로빌 중복발송 위험 검토 필요 |

### D2. 자동발송 트리거 시점
| 안 | 내용 | 비고 |
|---|---|---|
| **가 (권고)** | 현행 유지 — 출고 등록(shipment INSERT) 시 즉시 1건씩 | 이미 배선된 경로, 일괄출고 시 건별 발송 |
| 나 | 일괄출고(bulk-ship) 묶음 완료 후 bulk API로 일괄 발송 | #378 수정 선행 필수, 발송 타이밍 일관 |

### D3. delivery_method → 템플릿 매핑 (한진 템플릿 부재 시 처리)
| delivery_method | 매핑 | 미결정 |
|---|---|---|
| 대신화물 | "대신화물 출고" | — |
| 대신택배 | "대신택배 출고" | — |
| 방문수령 | "방문 수령 준비 완료" | — |
| 한진택배 | **❓ 가: 발송 skip(템플릿 등록까지) / 나: 대신택배 템플릿 임시 유용 / 다: SMS 대체(E/A, 발신번호 승인 후)** | 가 권고 |
| 기타(화물 등) | **❓ skip 권고** | — |

> 중복발송 방지: `shipments` 단위 발송 이력 체크(이미 해당 shipment_id로 SUCCESS 로그 존재 시 skip) — 멱등 가드로 구현 (결정 불요, 기본 포함).

---

## 3. 구현 계획 (결정 후 1세션)

### Phase 1 — #378 수정 (선행)
1. `interpretBulkResult` ok/fail 명시 반환 확인 → `kakao.ts /send-shipment-bulk` 응답에 `status`·`sent_count`(실성공)·`fail_count`·`failures[]` 추가
2. `shipments.js:981` 분기 — D1 결정안 반영
3. 단건 `/send`·`/send-sms-bulk` 응답 형식과 정합 (peer 일관성)

### Phase 2 — 자동발송 완성
4. `autoCodeMap`에 D3 매핑 적용 + `resolveMsg` 본문 변수 채움(주문번호·품목요약·수령방법)
5. 멱등 가드(발송 이력 체크) + 미매핑 delivery_method는 로그만 남기고 skip
6. 발송 로그에 자동/수동 구분 컬럼(있으면 재사용)

### Phase 3 — Go-Live
7. ~~SMS 발신번호 승인~~ → **✅ 결정(2026-06-11): 대체문자 안 함(`smsReplyOf=N` 유지)** — 알림톡 실패는 D1 결과 모달로 노출해 수동 대응. SMS 발신번호 승인 액션 불필요
8. **✅ 결정: 패키지 검증 직후 같은 세션에서 `barobill_test_mode=0` 전환** → 첫 실주문 1건 실착신 확인 → 24h 발송 로그 모니터링

### Phase 4 — 후속 (별도 0.5세션, ✅ 방식 확정 2026-06-11)
9. **미수금 독촉: 추천 + 수동 승인 발송** — 연체 기준(aging) 충족 거래처를 `/bank` 미수금 탭에 발송 추천 목록으로 표시 → 용준님 선택 발송(완전 자동화 안 함, 거래처 관계 민감). 미수금 템플릿 승인 완료 상태라 발송 경로는 재사용

## 4. 검증
- 로컬: bulk 10건 중 강제 실패 주입 → 응답 fail_count·프론트 분기 확인
- prod: 출고 등록 1건 → 자동발송 실착신 + 중복 등록 시 멱등 skip 확인
- `npm run verify` + smoke 103 + 발송 로그 SUCCESS/FAIL 정합

## 5. 공수
Phase 1: ~0.5세션 / Phase 2: ~0.5세션 / Phase 3: 용준님 액션 + 모니터링
