# 세션 컨텍스트 핸드오프 (2026-08-10 #74 — Cloudflare $125 과금 근본수정)

## 이번 세션이 한 것 (전부 prod 배포완료, push `ef22ad60` · 배포 `d940d5ae`)
1. **청구 원인 규명**: 8/7 청구 $125.70 = D1 읽기 124.2B($99.20) + Workers 요청 75.3M($19.80) + CPU($1.70) + Workers Paid($5). 이번 사이클(8/7~)도 4일 만에 $24.76·예상 $191.91이었다.
2. **D1 읽기 98% = nav-badges 미수금 카운트** (`src/routes/notifications.ts`)
   - 구 쿼리 실행당 6.9M행 → 거래처 사전집계 CTE 재작성 88.6k행(prod 실측, 78×↓)
   - entity:user 키 5분 TTL 인메모리 캐시 (`navBadgeCache`)
   - `shell.js` 폴링 3종(nav-badges 60s·unread-count 5m·generate 10m) `document.hidden`이면 스킵 + visibilitychange 복귀 갱신
3. **★HAVING 별칭 함정 (판정 뒤집힘)**: `HAVING balance > 0`이 SELECT 별칭이 아니라 **폐기 캐시 컬럼 `clients.balance`(전부 0)** 에 바인딩(SQLite는 HAVING에서 실컬럼 우선). 연체 배지·`/api/ledger/overdue`·check-overdue 알림이 전부 무음 0. 3곳 식 전개로 수정 → prod 실측 배지 201 = 연체목록 201행(e2는 50). 별칭 전수 스캔 잔여 충돌 0.
4. **LogWatcher 소스 수정 (⚠️PC 미배포 — 수동 축)**: `SendEventAsync` bool→`SendResult`(4xx 즉시폐기 / 5xx `RetryCount` 300회 독성상한 / 네트워크 무상한) + 재시도 스윕 지수백오프(5s→10min). print-events 홍수(일 270만 요청)의 재발 방지 축 — 서버측 500 원인(D1 LIKE 50바이트)은 #67 세션이 이미 수정·배포해 홍수 자체는 16:15경 소멸.

## 판단 기준 (다음 세션이 알아야 할 것)
- **nav-badges 쿼리를 구 형태(연체그룹 행별 서브쿼리 LEFT JOIN)로 되돌리지 말 것** — D1은 자동 인덱스를 안 만들어 O(행×거래처)로 폭발한다. 사전집계 CTE + 캐시 형태 유지.
- **HAVING에 별칭 금지(특히 `balance`)** — 실컬럼과 이름이 겹치면 조용히 그 컬럼으로 붙는다. 식을 풀어 쓸 것. ar-receivables.ts:207 주석 참조.
- $5는 상한이 아니라 기본료. 지출 차단 기능은 Cloudflare에 없음(예산 알림 1건만 존재). 월말 청구 재확인 필요.
- 동반 배포: `0798a373`(#73 주문서 4건) · `ee16ae6a`(주문서 DXF, 타 세션 — **IA 에이전트 exe는 빌드+재시작해야 활성화**, 웹 배포로 안 나감).

## 다음 세션 TODO
- [ ] LogWatcher PC 롤아웃 (다음 현장 배포 때 — dotnet build 통과 확인됨, 23대 순차)
- [ ] 월 청구 사이클 중간 점검 (D1 읽기가 실제로 꺾였는지 — 대시보드 D1 메트릭 '읽은 행' 일 200M 이하면 정상)
- [ ] Cloudflare 예산 알림 임계 하향 검토 ($10 수준)
- [ ] 연체 배지 201 점등에 대한 운영 확인 (그동안 0으로 보이던 것이 정상 점등 — 용준님께 화면 안내됨)

## 검증 명령 (PowerShell)
```powershell
npm run verify          # tsc + build
npm run smoke           # 로컬 110/110
$env:SMOKE_URL = "https://webapp-9i0.pages.dev"; npm run smoke   # prod 110/110
dotnet build LogWatcher\LogWatcher.csproj   # 에이전트 빌드 (경고 0·오류 0)
```
