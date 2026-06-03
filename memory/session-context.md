# 최근 세션 컨텍스트 (2026-06-03 PM)

## 세션 성과 요약

| 지표 | 내용 |
|------|------|
| 주제 | 카카오 알림톡 연동 + 출고/주문 배송 정합 |
| 신규 문서 | `docs/kakao-alimtalk-templates.md` (알림톡 문안 6종) |
| 마이그레이션 | `0290` 거래처 배송방식 한글화 (prod 적용 3017행) |
| 버그 수정 | 거래처 배송지 저장 (조회 SELECT 누락) |
| 배포 | prod 다수 (최종 `21602715`) |
| 검증 | Playwright — 거래처 마이그·라벨전환·동기화 4시나리오 PASS |

## 주요 완료 작업

1. **카카오 알림톡 템플릿 문안 6종** — `docs/kakao-alimtalk-templates.md`. 출고4(`shipment_freight`/`hanjin`/`parcel`/`pickup_ready`)+`order_received`+`ledger_notice`. 코드 대조 점검 완료.
2. **출고 알림톡 코드 정합** (`shipments.js`) — 출고일 `#{날짜}` 변수화, 배송수단별 `autoCode` 분리, 한진 송장줄·화물 터미널줄.
3. **배송지 저장 버그** (`clients.ts`) — GET `/:id`·`/:id/detail` SELECT에 `delivery_address` 누락 추가.
4. **주문접수 품목 변수** (`orders.js`·`orders/core.ts`) — `#{품목}`=메인품목[규격][내용] 외 n건, `main_item_content` 서브쿼리, `order_received`.
5. **거래처 배송방식 세분화** (마이그 `0290`) — enum 4종→한글 7종, SAME 186→방문수령·FREIGHT 14→대신화물.
6. **주문폼 터미널 자동 동기화** (생산 `orderForm/client.js`·`calc.js` + 유통 `orderFormDist.js`) — `syncDeliveryInfo`, 배송방식 자동선택, 거래처 터미널 자동갱신.

## 설계 결정 (코드에서 파악 어려운 것)

- **카카오 알림톡 제약**: 등록 템플릿 고정텍스트 = 발송 본문 **글자단위 일치 필수**(불일치→발송거부/대체문자). `#{변수}` 위치만 임의값 허용.
- **알림톡 버튼 현재 미전송**: `barobillSms.ts` `sendATSSingle`/`sendATSBulk`가 SOAP `<KakaotalkMessage>`에 버튼 노드 없음 → 모든 링크(포털·배송조회)는 **본문 텍스트**로. 버튼 전송은 후속 과제(SOAP Button 스키마 추가 필요).
- **출고 템플릿 배송수단별 분리 필수**: 화물/한진/택배 본문이 달라 단일 코드 불가. `delivery_type`이 `FREIGHT`/`DELIVERY` 영문코드라 `#{배송방법}` 변수통합도 불가.
- **거래처 배송방식 = 한글 7종**(대신택배/대신화물/한진택배/직배/용차/퀵/방문수령). 주문폼 옵션과 1:1 → 자동선택 매핑 불필요. SAME(불명확)→방문수령 기본.
- **터미널 = 거래처 `delivery_address` 단일 소스**. 주문폼 인라인 수정→저장 시 거래처 자동갱신. 별도 주문 컬럼 없음.
- **deliveryInfo 동기화 규칙**: 대신화물=터미널(`delivery_address`), 그 외=사업장주소(`address`). 거래처/방식 변경 시 `syncDeliveryInfo` 재설정. 편집모드(거래처 미선택)는 기존값 보존.
- **주문폼 2종**: 생산(`orderForm/client.js`, `deliveryMethod`/`deliveryInfo`) + 유통(`orderFormDist.js`, `distDeliveryMethod`/`deliveryAddress`). 둘 다 동일 패턴 적용.
- **deliveryInfo는 `orders.delivery_info`에 저장** (orders에 배송지/터미널 전용 컬럼 없음).

## 주의사항

- **한진 송장번호 = 100% 수동 입력** (`shipments.js` `track-*` → PATCH `tracking_number`). 한진 연동 없음 → 자동화는 deep-research 진행중(직접API vs 통합솔루션).
- **바로빌 알림톡 미발송 상태**: 템플릿 문안만 작성. 바로빌 사이트 등록·카카오 검수(1~2일) 완료해야 실제 발송. `order_received` 등록 후 `orders.js` autoTemplate 확정 필요.
- **거래처 배송방식 186건 일괄 방문수령**: 실제 대신택배/한진 거래처는 개별 수정 필요.
- 배포는 **작업트리 전체**가 나감(이전 미커밋 작업 포함).

## 다음 세션 TODO

1. **[진행중] 한진 송장번호 자동화 조사** (deep-research workflow `wf_2af22945`) → 결과 검토
2. **[용준님] 바로빌 알림톡 템플릿 6종 등록·검수** (`docs/kakao-alimtalk-templates.md`)
3. **[용준님] 거래처 배송방식 개별 정리** (방문수령 186→실제 택배/화물)
4. `order_received` 바로빌 등록 후 `orders.js` autoTemplate 확정
5. (백로그) 자금 일원화 4-3 미수금↔입금예정, 미수금예측 후속

### 새 세션 시작
```powershell
cd C:\Users\user\dongsan_mes
git pull
```
