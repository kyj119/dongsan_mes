# 단가표 세트 + 거래처 전달/인쇄 문서 (Price Sheet Delivery)

작성: 2026-07-07 · 브랜치: `feat/price-sheet-delivery` · 검증까지(배포 별도)

## 배경 / 목적
모든 원자재 매출단가를 개별 관리하기 어려움. 배관(단가·거래처정책·로고·팩스)은 이미 `/price-list`(priceManagement) 페이지에 구축됨. **빠진 조각 = (1) 전달용으로 특정 품목만 골라 담기, (2) 전달 문서 서식.** 이를 채운다.

## 확정 요구사항 (사용자 합의)
- **단가표 세트**: 품목을 골라 이름 붙여 저장 → 재사용·수정. 단가는 값을 굳히지 않고 **참조**(인쇄 시점 최신가).
- **단가 기준**: 세트에 거래처 지정 → 그 거래처 **정책 적용가**로 표시. (client_id NULL이면 표준 sales_price)
- **전달 문서 요소**: 유효기간·발행일·문서번호 / 비고·조건 문구 / 직인·담당자 / **부서별 연락처** / **웹하드 주소**.
- **단가 표기**: 단가 한 값(부가세 구분/합계 없음). *향후 토글 여지만 남김.*
- **소급 없음**: 인쇄 시점 최신가로 렌더, 기존 주문/견적 불변.
- **발행 법인별 분리**: 로고·직인·부서연락처·웹하드는 entity별.

## 기존 자산 (재사용)
- 페이지: `src/pages/priceManagement.ts`(3탭: 매입/매출단가표/가격정책), 클라 `src/scripts/priceManagement.js`.
- 라우트: `/api/price-list`=`priceList.ts`(GET `/`=매출표 데이터, GET `/calculate`=적용가, GET/PUT `/logo/:entityId`). `/price-list` 페이지 권한 등록됨.
- 매출 적용가 우선순위: **품목고정가 > 품목할인율 > 카테고리율 > 전체기본** (priceList.ts:213 `/calculate`, 클라 priceManagement.js:291 `calcSalesPrice`).
- 인쇄: `renderPrintHTML`(priceManagement.js:390) + `#printArea` + `@media print`(priceManagement.ts:17-23). **문제: 품목 선별 불가 → 전 품목 쏟아짐.**
- 팩스 실연동: `sendFax`(priceManagement.js:448) → `window.faxSend`(shell.js:1552) → `POST /api/fax/send`(바로빌 FTP). **재사용.**
- `entities`(0145): name, short_name, business_reg_no, representative, business_type, business_item, address, phone, email, tax_email, popbill_corp_num, bank_info, **fax**(0185), **logo_base64**(0187), **stamp_base64**(0152), email_from_*. 시드 3법인(동산기획1·선명2·청주3).
- 로고 업로드 UI: `settings.js:527-573`(파일→base64→PUT). 직인 배선 미러링 대상.

## 프로젝트 규약 (필수 준수)
- **entity_id INSERT 의무화** (price_sheets.entity_id). SELECT은 entity 필터. DEFAULT 1 함정 주의.
- **D1**: `.bind(...binds)` 스프레드(체이닝 금지). 쿼리당 바인드 ~100 한도, IN절 80개 청크.
- **FK 컬럼 영구제거 불가** → 신규 테이블은 hard FK 대신 plain INTEGER + 앱단 검증(제거 유연성).
- **KST**: 저장 UTC, 표시 KST(백엔드 `utils/kstDate.ts`, 프론트 `formatKST`). `date('now')`/`new Date(ts)` 직접 금지.
- **인증=Bearer 헤더 전용**: `<img src>`/`<a href>`/새창 401. 이미지·파일은 axios `responseType:blob`. (로고/직인 base64는 JSON 반환이라 무관.)
- 프론트 JS는 `?raw` → getElementById 대상 null 가드 필수(`if(!el){console.warn(...);return;}`). 페이지-prefix 격리(전역 var 충돌 방지).
- 표 스타일: 기존 `ds-table` 컨벤션 유지. thead th는 layout 전역 override 존재(페이지별 패치 금지).
- 커밋 타입체크: `npm run verify`(typecheck+build) 통과 후 커밋. 한글 커밋은 wrangler 배포 시만 문제(로컬 git 커밋은 무관하나 PS5.1 `git commit -m "..."` 큰따옴표 인자쪼개짐 주의 → heredoc 사용).

---

## Phase 1 — 단가표 세트 (백엔드 + 세트 관리 UI)
**마이그레이션 `migrations/0450_price_sheets.sql`**
```sql
CREATE TABLE IF NOT EXISTS price_sheets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  client_id INTEGER,                 -- 대상 거래처(적용가). NULL=표준 sales_price
  valid_until TEXT,                  -- YYYY-MM-DD
  notes TEXT,                        -- 비고·조건 문구
  contact_person TEXT,               -- 담당자명
  contact_phone TEXT,                -- 담당자 연락처
  show_stamp INTEGER DEFAULT 1,      -- 직인 표시
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS price_sheet_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sheet_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  sort_order INTEGER DEFAULT 0,
  UNIQUE(sheet_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_price_sheet_items_sheet ON price_sheet_items(sheet_id);
CREATE INDEX IF NOT EXISTS idx_price_sheets_entity ON price_sheets(entity_id);
```
**라우트 `src/routes/priceSheets.ts` → `/api/price-sheets`** (authMiddleware, entity 필터)
- `GET /` — 세트 목록(entity별): id, name, client_id, client명, valid_until, 품목수, updated_at.
- `GET /:id` — 세트 상세: 메타 + items(item_id, code, name, specification, unit, **적용가**). 적용가 = client_id 있으면 priceList `/calculate` 로직 재사용(품목고정가>품목율>카테고리>기본), 없으면 sales_price||base_price. **계산 로직은 priceList.ts에서 공유 헬퍼로 추출해 재사용**(이중구현 방지).
- `POST /` — 생성: {name, client_id?, valid_until?, notes?, contact_person?, contact_phone?, show_stamp?, item_ids:[]}. price_sheets INSERT(entity_id 주입) + price_sheet_items 벌크 INSERT(sort_order=배열순).
- `PUT /:id` — 메타 수정 + item_ids 전량 교체(delete+insert). updated_at 갱신.
- `DELETE /:id` — 세트+items 삭제.
- 마운트: `src/index.tsx`에 `import { priceSheetsRouter } from './routes/priceSheets'` + `app.route('/api/price-sheets', priceSheetsRouter)` (다른 `/api/price-*` 라우트 근처).

**UI (priceManagement.ts / .js — 매출단가표 탭 `pmPanel_sales` 확장)**
- 상단에 **세트 선택 드롭다운 + [새 세트][수정][삭제]** 추가.
- **세트 편집 모달**: 이름, 거래처(기존 거래처검색 재사용), 유효기간, 담당자·연락처, 비고, 직인표시 체크 + **품목 담기**(품목 검색/필터 → 체크박스 다중선택 → 담은 목록 정렬). 저장 시 POST/PUT.
- 세트 선택 시 화면 표를 **담긴 품목만** + 적용가로 렌더(기존 전품목 표시 대체). 세트 미선택 시 기존 동작 유지.
- getElementById null 가드, 전역 var는 `pm` prefix.

## Phase 2 — 회사정보 확장 (부서연락처·웹하드·직인)
**마이그레이션 `migrations/0452_entity_contacts_webhard.sql`** *(0451은 타 세션 WIP `0451_bank_transactions_content_key.sql`가 점유 → 0452 사용)*
```sql
ALTER TABLE entities ADD COLUMN webhard_url TEXT;
CREATE TABLE IF NOT EXISTS entity_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id INTEGER NOT NULL,
  department TEXT NOT NULL,   -- 부서명(제작부/영업부 등)
  person_name TEXT,
  phone TEXT,
  fax TEXT,
  sort_order INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_entity_contacts_entity ON entity_contacts(entity_id);
```
*stamp_base64는 0152에 이미 존재 → 스키마 변경 없음.*

**백엔드 (priceList.ts 확장 or entities 라우트)**
- `GET /api/price-list/company/:entityId` — 인쇄 헤더 통합 블록: `{name, logo_base64, stamp_base64, address, email, phone, fax, webhard_url, contacts:[{department,person_name,phone,fax}]}`. (기존 `/logo/:entityId`는 유지, 이 신규가 상위셋.)
- `entity_contacts` CRUD: `GET/POST/PUT/DELETE /api/price-list/company/:entityId/contacts[/:cid]` (ADMIN). webhard_url 저장 PUT. 직인 저장은 기존 로고 PUT 미러링(`PUT /logo`처럼 `PUT /stamp/:entityId`).

**설정 UI (`settings.js` + 설정 페이지)** — 현재 법인 기준
- 부서별 연락처 표(추가/수정/삭제 행), 웹하드 주소 input, **직인 업로드**(로고 업로드 `settings.js:527-573` 미러링). 저장 시 위 API.

## Phase 3 — 전달 문서 서식 · 인쇄 품질 (`renderPrintHTML` 재작성)
P1 세트 + P2 회사정보를 조립. 선택된 세트 기준 인쇄.
- 데이터: `GET /api/price-sheets/:id`(items+적용가+메타) + `GET /api/price-list/company/:entityId`(회사블록).
- 레이아웃(A4 세로):
  - **머리말(매 페이지 반복)**: 로고 + 회사명/사업자정보, 우측 **부서별 연락처 그리드** + **웹하드 주소**. → 다중페이지 팩스 대응 위해 `<table><thead>` 반복 헤더 사용.
  - **제목부**: "{거래처명} 단가표", 수신처(귀하), 발행일(오늘 KST), 유효기간, 문서번호(예: PS-{id}-{YYYYMMDD}).
  - **품목표**: 코드/품목명/규격/단위/단가(적용가). zebra. 단가 단일값.
  - **비고**: sheet.notes 영역.
  - **꼬리말**: 직인(show_stamp=1 & stamp_base64 있으면 이미지) + 담당자·연락처.
- 인쇄 CSS(priceManagement.ts) 개선: `#printArea`만 노출 유지하되 thead 반복·페이지 넘침 정리.
- 팩스: 기존 `sendFax`/`window.faxSend`에 새 HTML 전달(재사용). 세트 미선택 시 인쇄/팩스 비활성 또는 경고.

## Phase 4 — 관리 가독성 (매입/매출 탭)
- **매입단가 탭**: 상단 요약(품목수·평균마진·미설정단가 건수), **미설정(0원) 단가 하이라이트**, (가능하면) base_price/sales_price **인라인 편집**→`PUT /api/items/:id`(기존 엔드포인트 확인 후) + price_change_history 기록 재사용.
- **CSV 내보내기** 버튼(현재화면 표). 인증 blob 규약 무관(클라 생성 CSV).
- 과확장 금지: 요약+하이라이트+CSV 우선, 인라인편집은 기존 items PUT 존재 시에만.

## 검증 (최종, 배포 없음)
- `npm run verify`(각 Phase) → 최종 `npm run build && npm run smoke`.
- 브라우저(Playwright/claude-in-chrome) 로컬 검증: 세트 생성→품목담기→저장→세트선택 표시→인쇄 미리보기(로고·부서연락처·웹하드·직인·유효기간·비고)→회사정보 설정 저장. 콘솔 에러 0.
- 로컬 로그인: admin/password, `http://192.168.0.94:3000`(dev:d1은 dist 서빙 → build 먼저).
