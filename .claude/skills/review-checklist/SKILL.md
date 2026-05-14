---
name: review-checklist
description: 동산기획 프로젝트 특화 코드 리뷰 체크리스트. 변경된 파일을 대상으로 JSX 패턴 오용, authMiddleware 누락, 마이그레이션 오류, IP 하드코딩, 안티패턴 등을 체계적으로 탐지한다. 코드 작성 후 커밋 전에 사용.
---

# 프로젝트 특화 코드 리뷰

변경된 파일을 대상으로 아래 체크리스트를 순서대로 실행한다.

## 범위 결정

`git diff --name-only` (또는 `$ARGUMENTS`로 지정된 파일)을 기준으로 검사 대상 결정.

## 체크리스트

### 1. JSX 패턴 오용 (변경 파일에 *.jsx 포함 시)

검사 대상: `IllustratorAutomat/*.jsx`, `IllustratorAutomat/publish/*.jsx`

| Grep 패턴 | 문제 | 올바른 패턴 |
|-----------|------|------------|
| `EPSSaveOptions` | PDF 저장 실패 | `PDFSaveOptions` |
| `parent === doc` 또는 `parent===doc` | 루트 그룹 탐색 실패 | `parent.typename === "Layer"` |
| `parent === layer` | 동일 | `parent.typename === "Layer"` |
| `$.writeln(` | COM 환경에서 출력 안 됨 | `_diagLog(...)` 파일 로그 |

추가: `getFullBounds` 함수의 Case 0~4 구조 확인.

### 2. Source/Publish JSX 동기화 (JSX 변경 시)

3개 쌍 비교:
- `IllustratorAutomat/ExtractGroups.jsx` vs `publish/ExtractGroups.jsx`
- `IllustratorAutomat/ProcessOrderItem.jsx` vs `publish/ProcessOrderItem.jsx`
- `IllustratorAutomat/PackGroups.jsx` vs `publish/PackGroups.jsx`

불일치 시 어느 쪽이 최신인지 명시.

### 3. Program.cs 패턴 (C# 변경 시)

- `bundleParentIds` 집합 + `groupIdx=-1` 스킵 패턴 존재 확인
- `post_processing` / `category_name` 부모 상속 로직 존재 확인
- `ERP_API_URL = "http://192.168.0.94:3000"` — 다른 IP 없는지 확인

### 4. 라우트 파일 검사 (src/routes/*.ts 변경 시)

- `authMiddleware` 적용 여부: `router.use('/*', authMiddleware)` 존재 확인
- 응답 형식 통일: `{ success: boolean, data/error }`
- 금액 처리: `parseInt` 대신 `parseFloat` 사용 여부 (AP-004)
- try/catch 래핑 여부
- **🔴 NEW (2026-04-15): 타입/import 정합성 필수 검증**
  - `bash .claude/scripts/verify-routes.sh` — requireRole/authMiddleware 등 import 누락 빠른 검증 (1초)
  - `npm run typecheck` — 전체 tsc --noEmit (1~2초, 모든 타입 에러)
  - `npm run verify` — typecheck + build 통합
  - **중요**: `npm run build` 만으로는 "requireRole is not defined" 런타임 크래시 못 잡음 (esbuild는 타입 stripping만)

### 5. 마이그레이션 검사 (migrations/*.sql 변경 시)

- `DROP TABLE ... CASCADE` 사용 금지 (AP-007)
- 번호 순차성 보장 (건너뛰기/중복 없음)
- `IF NOT EXISTS` 사용 여부
- 한 ALTER 문에 하나의 컬럼만 추가

### 6. IP 하드코딩 스캔

정상: `192.168.0.94:3000`
탐지: 변경 파일에서 다른 IP 주소 패턴 (`\d+\.\d+\.\d+\.\d+`) 검색

### 7. 상태 enum 정합성

변경 파일에서 주문/카드 상태 문자열 검색 → `src/types/models.ts`의 `OrderStatus`/`CardStatus` enum을 읽어서 대조.
- 값을 여기에 나열하지 않음 — 반드시 코드에서 현재 값을 확인할 것
- 제거된 상태 참조 금지 (AP-006)

### 8. C# 빌드 필요 여부

`*.cs` 또는 `*.csproj` 변경 감지 시:
```
⚠️ C# 변경 감지 — dotnet publish 필요:
cd C:\Users\user\dongsan_mes\IllustratorAutomat
dotnet publish -c Release -r win-x64 --self-contained true -o publish
```

### 9. 브라우저 검증 (프론트엔드 변경 시 필수)

`src/pages/*.ts` 또는 `src/scripts/*.js` 변경 시 Playwright로 실제 브라우저 확인.

**⚠️ 중요: snapshot ref 기반 클릭 금지 — `browser_evaluate`로 JS 직접 실행**

```
// ❌ snapshot ref 기반 (사이드바 요소 270개에 묻혀 엉뚱한 곳 클릭됨)
browser_snapshot → ref 찾기 → browser_click(ref)

// ✅ evaluate로 직접 실행
browser_evaluate: () => document.querySelector('#tabSettings').click()
browser_evaluate: () => document.querySelector('[onclick*="togglePrintMediaGroup"]').click()
browser_take_screenshot → 눈으로 확인
```

**검증 패턴:**
1. `browser_navigate` → 변경된 페이지 URL
2. `browser_evaluate` → 탭 전환, 버튼 클릭 등 인터랙션
3. `browser_take_screenshot` → 시각 확인
4. `browser_console_messages(level: 'error')` → 에러 0건 확인
5. `browser_evaluate` → DOM 상태 검증 (요소 존재, 개수, 텍스트)

**콘솔 에러 판정 기준:**
- `Error: No auth token` — 정상 (로그인 전 리다이렉트 시 발생)
- `cdn.tailwindcss.com` 경고 — 무시 (CDN 사용 환경)
- 그 외 `Error:` — 🔴 즉시 수정 필요
- `undefined`, `null`, `NaN` 포함 에러 — 🟡 확인 권장
- `warn` 레벨에서 `[pageName] #id not found` 패턴 — 🔴 HTML↔JS ID 불일치 (설계결정 T 참조)

### 10. 멀티사업자 entity 필터 검증 (트랜잭션 라우트 변경 시)

트랜잭션 테이블(orders, payments, purchase_orders, tax_invoices, payroll, cash_receipts, adjustments, payment_requests)을 조회하는 라우트 변경 시 entity_id 필터 누락 검사.

**탐지 (AP-009):**
```bash
# 트랜잭션 테이블 쿼리 중 entityFilter가 없는 곳 찾기
grep -rn "FROM orders\|FROM payments\|FROM purchase_orders\|FROM tax_invoices\|FROM payroll\|FROM cash_receipts" src/routes/ --include="*.ts" | grep -v entityFilter | grep -v "// shared" | grep -v "node_modules"
```

**체크 항목:**
- 목록(GET /) 쿼리 + **stats/count/summary/badge 엔드포인트 모두** entity 필터 있는지 (AP-009)
- INSERT 시 `entity_id: getEntityId(c)` 포함 여부
- `|| default` 패턴에서 0이 유효값인 필드가 아닌지 (AP-008)

## 출력 형식

```
## 코드 리뷰 결과

### 🔴 즉시 수정 필요
- [파일명:줄번호] 문제 설명

### 🟡 확인 권장
- [파일명] 사항 설명

### ✅ 정상
- 확인 완료 항목 목록
```

### 11. 품목/재고 체계 검증 (품목·재고 관련 변경 시)

- **품목 조회 시 print_methods/print_media JOIN 여부**: items 조회 쿼리에 출력방식·소재 정보가 필요한 경우 LEFT JOIN 누락 확인
- **품목 필터 패턴**: `is_sales_item` / `is_purchase_item` 직접 사용 금지 → `item_type` (PRODUCT/GOODS/MATERIAL) 기반 필터 사용
- **GOODS 타입 자동 설정**: item_type='GOODS' 등록 시 `is_sales_item=1, is_purchase_item=1` 동시 설정 여부
- **재고 변동 기록**: inventory.quantity 변경 시 `inventory_transactions` INSERT 동반 여부
- **SHEET 품목**: `order_items.selected_material_id` 사용 시 NULL 체크 (ROLL은 NULL, SHEET는 값 있음)
- **차감 올림**: ROLL `Math.ceil(yd * 10) / 10`, SHEET `Math.ceil(sqm * 100) / 100` 적용 여부
- **category_id 의존 금지**: 새 코드에서 `category_id` FK 사용 금지, `i.category` TEXT 직접 사용

### 12. HTML↔JS 연동 검사 (프론트엔드 변경 시 필수)

`src/pages/*.ts`와 `src/scripts/*.js`가 쌍으로 동작하므로, 한쪽을 변경하면 반드시 상대 파일도 확인.

**탐지 방법:**
```bash
# 1. 변경된 스크립트에서 참조하는 모든 ID 추출
grep -oP "getElementById\(['\"]([^'\"]+)['\"]\)" src/scripts/CHANGED.js | sort -u > /tmp/js_ids.txt

# 2. 대응하는 페이지에서 정의된 ID 추출
grep -oP 'id="([^"]+)"' src/pages/CHANGED.ts | sort -u > /tmp/html_ids.txt

# 3. JS에서 참조하지만 HTML에 없는 ID 찾기
comm -23 /tmp/js_ids.txt /tmp/html_ids.txt
```

**체크 항목:**
- JS에서 `getElementById('xxx')`로 참조하는 ID가 HTML에 존재하는지
- HTML에서 ID를 변경/삭제했다면 JS에서도 동기 반영했는지
- `null` 가드(`if (el)`)로 숨겨진 silent fail이 없는지 (경고 로그 권장)
- `onclick="funcName(...)"` 핸들러가 해당 스크립트에 정의되어 있는지

**주의**: `?raw` import 특성상 TypeScript가 JS 내부를 검증하지 못함. 이 검사는 반드시 수동 또는 grep으로 수행.

## 참조

상세 안티패턴 목록: [anti-patterns.md](references/anti-patterns.md)
