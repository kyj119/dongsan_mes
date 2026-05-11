# 한진택배 통합 자동화 로드맵

> 작성: 2026-05-11
> 목적: 출고/배송 페이지에서 **송장 자동 발급 + 운송장 번호 자동 업데이트** 통합.

## 1. 현재 상태

### 기존 인프라
- **`shipments` 테이블** (마이그레이션 0052): `tracking_number`, `courier_name` 컬럼 존재 → 수동 입력 가능
- **`/shipments` 페이지**: 대신택배/한진택배 섹션 분리, 출고 리스트 A4 인쇄 기능 있음
- **`/api/shipments`** 라우터: courier_name 필터, tracking_number 검색

### 누락
- 한진택배 API 연동 코드 0
- 송장 발급/조회 자동화 0
- 운송장 PDF/이미지 출력 자동화 0
- 배송 상태 polling 0

---

## 2. 통합 옵션 — 어떤 채널을 쓸 것인가

한진택배 자동화 방식은 3가지:

### (A) 한진택배 직접 API (B2B 계약)
- 한진택배 본사와 B2B 계약 후 API 키 발급
- 장점: 가장 정확, 비용 효율 (운임 외 추가 비용 X)
- 단점: 계약 절차, 일정 물량 이상 필요
- 적용: 월 발송량 500건 이상 시 유리

### (B) 통합 배송 솔루션 (스마트택배, 굿스플로, 위빅스 등)
- 여러 택배사 통합 API 제공 (한진 + 대신 + CJ 등 한 번에)
- 장점: 한 번 연동으로 여러 택배사 가능, 계약 단순
- 단점: 건당 수수료 추가 (보통 100~300원/건)
- 적용: **소규모 ~ 중간 물량 + 멀티 택배사 운영 시 추천** ← 현재 상황 적합

### (C) 한진택배 웹 자동화 (RPA/Playwright)
- 한진 운송장 웹사이트를 헤드리스 브라우저로 자동 입력
- 장점: 계약/API 없이 즉시 가능
- 단점: 한진 사이트 변경 시 깨짐, 약관 위반 가능성
- 적용: **권장 안 함** — 회귀 위험 큼

**추천: (B) 통합 배송 솔루션**

---

## 3. 데이터 모델 변경

### 3.1 마이그레이션 안

`shipments` 테이블에 다음 컬럼 추가:

```sql
ALTER TABLE shipments ADD COLUMN tracking_provider TEXT;        -- 'hanjin' | 'daesin' | 'cj' 등
ALTER TABLE shipments ADD COLUMN tracking_status TEXT;          -- 'PENDING' | 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED'
ALTER TABLE shipments ADD COLUMN tracking_last_updated TEXT;    -- 마지막 추적 시점
ALTER TABLE shipments ADD COLUMN tracking_label_url TEXT;       -- 운송장 라벨 PDF/이미지 URL
ALTER TABLE shipments ADD COLUMN tracking_history TEXT;         -- JSON: 배송 이력 (각 시점/상태/위치)
ALTER TABLE shipments ADD COLUMN tracking_external_id TEXT;     -- 솔루션 측 발급 ID (재조회용)

CREATE INDEX idx_shipments_tracking_status ON shipments(tracking_status);
CREATE INDEX idx_shipments_tracking_provider ON shipments(tracking_provider);
```

### 3.2 settings 테이블 — API 키

```sql
INSERT INTO settings (setting_key, setting_value) VALUES
  ('shipping_provider', 'smarttaekbae'),
  ('shipping_api_key', ''),
  ('shipping_api_secret', '');
```

---

## 4. 단계별 구현 계획

### Phase A — 인프라 (1세션)

1. **솔루션 선정 + 계약** — 사용자 결정 (스마트택배 / 굿스플로 / 위빅스 비교)
2. **API 키 발급** — 사용자가 솔루션 콘솔에서 발급
3. **마이그레이션 0192** 작성 + 적용
4. **settings 페이지에 입력 폼 추가** — `shipping_provider` 선택 + API 키/시크릿

### Phase B — 송장 발급 API (1세션)

5. **`src/routes/shipping.ts` 신규** (또는 shipments.ts에 추가):
   - `POST /api/shipments/:id/issue-label` — 운송장 발급 호출
   - 솔루션 API에 발신자/수신자/품목 정보 전송 → 운송장 번호 + 라벨 URL 받음
   - shipments 테이블 업데이트 (tracking_number, tracking_label_url, tracking_provider)
6. **운송장 출력 UI**:
   - shipments 페이지에서 각 행에 "운송장 발급" 버튼
   - 발급 후 라벨 URL을 새 창으로 열기 또는 자동 인쇄
   - 일괄 발급 버튼 (한진택배 섹션 전체)
7. **에러 처리**:
   - 주소 누락/잘못된 형식
   - 솔루션 API 응답 실패
   - 중복 발급 방지 (tracking_number 이미 있으면 거부)

### Phase C — 배송 상태 자동 갱신 (1세션)

8. **scheduled-task / cron** 으로 정기 폴링:
   - GitHub Actions cron 또는 Cloudflare Cron Triggers
   - 매 30분마다 `shipments WHERE tracking_status NOT IN ('DELIVERED', 'FAILED') AND tracking_number IS NOT NULL`
   - 솔루션 API로 상태 조회 → 업데이트
9. **배송 완료 시 후속 처리**:
   - shipments.shipped_at 또는 delivered_at 자동 갱신
   - 카카오톡 알림 (Phase 4와 연동) — 고객에게 "배송 완료" 메시지
   - orders.status가 SHIPPED인데 배송 추적 안 됐으면 알림

### Phase D — UX 개선 (선택)

10. **고객 포털 추적 페이지** — 거래처가 본인 주문의 배송 상태를 볼 수 있는 화면 (이미 `/portal/orders` 있음, 추적 정보 추가)
11. **배송 지연 알림** — 3일 이상 IN_TRANSIT 상태이면 관리자에게 알림
12. **반품/배송 사고 처리** — tracking_status FAILED 시 관리자 워크플로우

---

## 5. 보안 + 운영

### API 키 관리
- 솔루션 API 키/시크릿은 settings 테이블에 평문 저장 (현재 패턴)
- 또는 Cloudflare Workers secrets에 저장 (더 안전, wrangler secret put)
- **추천**: Cloudflare secrets — production만 접근 가능

### 비용 모니터링
- 솔루션마다 건당 수수료 다름 (보통 100~300원)
- 발급 횟수 추적 (`shipments_issued_count` 일별 집계)
- 월간 비용 대시보드

### 장애 대응
- 솔루션 API 장애 시 수동 입력 가능 (기존 흐름 유지)
- 송장 발급 실패 시 명확한 에러 메시지 + 재시도 버튼

---

## 6. 예상 소요 + 사용자 결정 필요

| 단계 | 작업 | 소요 |
| --- | --- | --- |
| Phase A | 인프라 (마이그레이션 + settings UI) | 1세션 |
| Phase B | 송장 발급 API + UI | 1세션 |
| Phase C | 배송 상태 폴링 | 1세션 |
| Phase D | UX 개선 (선택) | 1세션 |

**총 3~4세션** (Phase A→B→C 핵심).

### 사용자 결정 필요한 항목

1. **솔루션 선택**: 스마트택배 / 굿스플로 / 위빅스 / 한진 직접 API — 어느 것?
2. **운임 정산**: 솔루션이 운임도 처리하나, 별도 정산인가?
3. **발신자 정보**: entity별로 발신자가 다른지? (1번 entity는 본사 주소, 2번 entity는 지점 주소 등)
4. **라벨 인쇄 방식**: 자동으로 PDF 열기? 또는 라벨 프린터 (Phase 2.3) 직접 출력?
5. **고객 알림**: 배송 완료 시 카카오/SMS 자동 발송? (이미 시스템에 카카오 인프라 있음)

---

## 7. 차단 요인

- 솔루션 계약 + API 키 발급 (사용자 액션 필요)
- 발신자 사업장 주소/연락처 정확히 등록 (entities 테이블에 이미 있음, 활용)
- 라벨 프린터 (선택) — Phase 2.3과 연동 가능

---

## 8. 다음 액션

오늘 세션에서는 로드맵 작성만. 실제 구현은 **사용자가 솔루션 선정 + API 키 확보** 후 다음 세션에서 Phase A부터 시작.

먼저 결정해주실 것:
- 솔루션 선택 (1번 결정)
- 발신자 entity별 분리 여부 (3번 결정)

이 두 가지만 결정되면 즉시 Phase A 착수 가능.
