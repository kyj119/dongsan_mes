# 거래처 셀프 주문 포털 — Phase 5 요구사항 골격

- **작성일**: 2026-06-11
- **상태**: 🟡 **방향 확정 (2026-06-11 용준님 결정) · 착수 전 brainstorming 세션 필수**
- **확정 내용**:
  - **D1 = 제작품 포함이 최종 목표** (용준님: "IA 기능을 확실하게 고치고, 이후에 주문제작 품목도 같이 주문할 수 있도록") → **선행 의존 = IA 파이프라인 안정화**: ① #377 수정(`items.name` 컬럼 버그로 `auto_process_jobs` 침묵 실패 — 자동가공 자체가 죽어있음) ② IA 오프셋 버그(SheetLayout 3mm, 구 ROADMAP Phase 4 디버깅 세션) ③ 시안 업로드 보안(uploadValidation 재사용 + R2 키 sanitize). 기성품 선개방 여부는 brainstorming에서 확정
  - **D2 = 가**: PENDING 생성 → 내부 수동 확인 (상태머신 무변경)
  - **D3 = 가**: 거래처 가격정책 적용가 노출 + 서버 재계산 필수
  - **D4 = 미수금 한도 가드**: balance 초과 거래처 주문 차단/경고 (aging 데이터 기존재)
- **관련**: PROJECT_STATUS TODO ⑫(b), `2026-06-04-order-intake-entity-split.md`(archive) Phase 5, split-billing spec(2026-06-10)
- **목표**: 거래처가 포털에서 직접 주문 생성 → 내부 접수 플로우로 합류

---

## 1. 기존 인프라 (재사용 가능)

- 포털 인증: verify-document/verify-token + `rateLimitMiddleware`(10·30/분) prod 활성
- `/portal/orders` 조회·재주문 모달·세금계산서 다운로드·미수금 aging (#344, 2026-06-05)
- 품목 체계: items 6탭·단가 그룹·거래처별 가격정책(price policy) — 거래처별 노출가 산출 기반 존재
- split-billing 모델: `order_items.assigned_entity_id` 품목별 청구법인 — 셀프 주문도 동일 모델로 합류 가능

## 2. 핵심 결정 포인트 (brainstorming 의제)

### D1. 주문 가능 범위
- 가: 기성품(production_required=0)만 — 재고·즉시출고 모델과 정합, 리스크 최소 **(1차 권고)**
- 나: 제작품 포함 — 시안·규격 입력 UX 필요(파일 업로드 = 보안 표면), 2차로
- 다: 거래처별 허용 품목 화이트리스트 (역할별 품목 필터 설계 재사용)

### D2. 승인 플로우
- 가: 셀프 주문 = `PENDING` 생성 → 내부 확인 후 CONFIRMED **(권고 — 기존 상태머신 무변)**
- 나: 신뢰 거래처 자동 CONFIRMED (여신한도 가드 필요)

### D3. 가격 노출
- 가: 거래처 가격정책 적용가 노출 **(권고)**
- 나: 가격 비노출, 접수 후 견적 회신

### D4. 한도·남용 가드
- 미수금 balance 초과 거래처 주문 차단/경고 여부, 일일 주문 건수 제한, 포털 계정-거래처 1:1 검증 (IDOR 표면 — entityFilter 패턴 필수)

## 3. 구현 골격 (brainstorming 후 확정)

```
Phase A: 포털 주문 폼 (기성품 카탈로그 + 수량 + 배송방식) → POST /api/portal/orders (PENDING)
Phase B: 내부 주문관리에 "포털 접수" 뱃지 + 확인 큐 → 알림(코디네이터)
Phase C: 주문 진행 상태 포털 노출 확장 (기존 /portal/orders 위에)
```

보안 체크리스트(설계 시 필수): rate-limit 재사용 · 포털 토큰→client_id 강결합(파라미터 client_id 신뢰 금지) · 신규 라우트 entityFilter · 가격 위변조 방지(서버 재계산) · `permission_pages` 등록.

## 4. 선행 의존 / 공수
- 선행: split-billing 구현(청구 주체 확정) 후 권장 — 셀프 주문의 품목 담당법인 배정 로직이 그 위에 얹힘
- 공수: brainstorming 1회 + Phase A~C 2~3세션
