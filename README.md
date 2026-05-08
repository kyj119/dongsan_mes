# ERP+MES 시스템 - 동산현수막

---

## 시스템 현황 (2026-03-18)

| 컴포넌트 | 상태 | 실행 방식 |
|---------|------|---------|
| MES 웹 서버 (Hono + D1) | 운영 중 | `npm run dev:d1` (192.168.0.94:3000) |
| IllustratorAutomat | 운영 중 | `IllustratorAutomat\publish\IllustratorAutomat.exe` 더블클릭 |
| LogWatcher | 운영 중 | `LogWatcher\publish\LogWatcher.exe` (각 PC 배포) |
| AI 파일 분석 (ExtractGroups) | 구현 완료 | IllustratorAutomat 내장 |
| AI 레이아웃 (PackGroups) | 구현 완료 | IllustratorAutomat 내장 |
| CMYK 자동변환 + 텍스트 아웃라인 | 구현 완료 | JSX 3종 내장 |
| 카드/칸반 (긴급도, 필터) | 구현 완료 | 웹 UI |
| 발주/구매 시스템 | 구현 완료 | 웹 UI |
| 전자세금계산서 (팝빌) | 구현 완료 | 웹 UI |
| 은행 거래내역 (Codef) | 구현 완료 | 웹 UI |
| 카카오톡 알림 | 미구현 | — |

---

## 네트워크/환경 구성

> **3-PC 구성**: 서버 PC, Automat PC, 현장/디자인 PC

```
[서버 PC]
  └── npm run dev:d1  →  http://192.168.0.94:3000  (MES 웹서버)

[Automat PC - Illustrator 설치 PC]
  ├── IllustratorAutomat.exe  (5초마다 API 폴링, COM 자동화)
  └── Z:\  →  \\192.168.0.122\...  (NAS 매핑)

[디자인 PC ×~8대 / 현장 PC ×~20대]
  └── LogWatcher.exe  (Print.log 감시, 5초 폴링)

[NAS (공유)]
  └── \\192.168.0.122\...  →  Z:\  (PDF/PNG 출력 저장, 모든 PC 접근)
```

---

## IllustratorAutomat 상세

### 빌드 & 실행

```bash
cd C:\Users\user\dongsan_mes\IllustratorAutomat
dotnet publish -c Release -r win-x64 --self-contained true -o publish
# 실행: publish\IllustratorAutomat.exe 더블클릭
```

> **JSX만 수정할 경우**: 재빌드 불필요 — `publish\` 폴더의 JSX 직접 수정 후 Automat 재시작

### JSX 스크립트 3종

| 파일 | 호출 시점 | 출력 |
|------|---------|------|
| `ExtractGroups.jsx` | AI 분석 요청 | PNG 썸네일 + groups.json |
| `ProcessOrderItem.jsx` | 주문 CONFIRMED | PDF + PNG |
| `PackGroups.jsx` | AI 레이아웃 요청 | PDF x 2 + 썸네일 PNG |

### 폴링 흐름 (5초 주기)

```
PollOrdersAsync()     → CONFIRMED 주문 → ProcessOrderItem.jsx → PDF 저장
PollAIAnalysisAsync() → pending 분석   → ExtractGroups.jsx    → groups_json DB 저장
PollAILayoutAsync()   → pending 레이아웃 → PackGroups.jsx      → result_json DB 저장
```

### 로그 파일

| 파일 | 내용 |
|------|------|
| `publish\ia_debug.log` | ProcessOrderItem 파라미터/바운드 |
| `publish\ia_error.log` | ExtractGroups/ProcessOrderItem 예외 |
| `publish\ia_diag.log` | ExtractGroups 클리핑 마스크 진단 |
| `publish\error.log` | PackGroups 예외 |

---

## 자동화 워크플로우

### A. 개별 주문 PDF 출력

```
1. 웹에서 주문 등록 (품목에 ai_group_index, post_processing 지정)
2. 주문 CONFIRMED
3. IllustratorAutomat 감지 (5초마다)
4. ProcessOrderItem.jsx 실행
   - CMYK 변환, 텍스트 아웃라인 자동 처리
   - 클리핑 마스크 그룹: clip path geometricBounds 기준
5. Z:\DESIGN\[카테고리]\YYYY\MM\[주문번호]\[파일명].pdf 저장
6. 주문 상태 → PRODUCTION
```

### B. AI 파일 그룹 분석

```
1. 웹에서 AI 파일 업로드 (청크 분할 전송)
2. ExtractGroups.jsx 실행 → 레이어 직속 GroupItem 탐지
3. groups_json (base64 썸네일 포함) → DB
4. 웹에서 그룹 선택 UI → 주문 품목에 ai_group_index 지정
```

### C. AI 레이아웃 (Combined / Individual)

```
1. 웹에서 레이아웃 요청 (mode: combined | individual)
2. PackGroups.jsx 실행
   - combined: 최적 배치 (Shelf FFD, 105/127/152cm 롤)
   - individual: 그룹별 개별 PDF (_g0, _g1 접미사)
3. result_json → DB → 웹에서 확정 → Z:\DESIGN\ 복사
```

---

## API 라우트 (37개)

| 라우트 | 용도 |
|--------|------|
| auth | 로그인/로그아웃, JWT 인증 |
| dashboard | 통계, 일일 KPI |
| orders | 주문 CRUD, 일괄 출고 |
| cards | 카드/칸반, 긴급도, RIP 잡, 일괄 상태변경 |
| clients | 거래처 CRUD, 유형별 필터 |
| items | 품목 CRUD, 카테고리/소분류 |
| ledger | 거래처 원장 (매출/수금/잔액) |
| inventory | 재고 관리, 저재고 필터 |
| hr | 직원/부서 관리 |
| production | 생산 일지 |
| rip | RIP 장비/프리셋/잡 관리 |
| post-processing | 후가공 옵션 (finish/punching/annotation) |
| print-events | LogWatcher 이벤트 수신, 에이전트 상태 |
| prices | 최근가, 거래처별 단가 |
| price-lists | 단가표 등급 관리 |
| purchase-orders | 발주서 CRUD, 입고 처리 |
| purchase-requests | 현장 발주 요청, 승인/반려 |
| tax-invoices | 전자세금계산서 (팝빌 연동) |
| bank | 은행 계좌/거래내역 (Codef 연동) |
| users | 사용자 관리, 역할 변경 |
| settings | 회사 설정, 연동 설정 |
| ai-analysis | AI 파일 분석 + 청크 업로드 |
| ai-layout | AI 레이아웃 요청/폴링 |
| shipments | 출하/배송 관리 |
| reports | 종합 보고서 |
| activity-logs | 활동 로그 추적 |
| notifications | 알림 시스템 |
| search | 전역 검색 |
| production-reports | 생산 보고서 |
| costs | 원가 관리 |
| forecast | 수주 예측 |
| emails | 이메일 로그 |
| cash-flow | 자금 흐름 |
| facility | 시설/구역 배치 |
| bom | BOM/MRP |
| approvals | 전자결재 |
| portal | 고객 포털 |

---

## DB 마이그레이션 (0001~0080)

### 핵심 테이블

| 테이블 | 설명 |
|--------|------|
| users | 사용자 (ADMIN/MANAGER/DESIGNER/OPERATOR) |
| clients | 거래처 (SALES/PURCHASE/BOTH) |
| items, item_categories, item_subcategories | 품목 마스터 |
| orders, order_items | 주문 + 상세 (parent_item_id 묶음 지원) |
| cards, card_items | 현장 카드 (칸반, RIP 연동) |
| equipment, equipment_presets | RIP PC 장비 + 프리셋 |
| post_processing_options | 후가공 (finish/punching/annotation) |
| print_events, agent_heartbeats | 인쇄 이벤트 (LogWatcher) |
| payments | 입금 내역 |
| purchase_orders, purchase_order_items | 발주 |
| purchase_requests, purchase_request_items | 발주 요청 |
| price_lists, client_item_prices | 단가표 + 거래처별 맞춤가 |
| tax_invoices, tax_invoice_items, tax_invoice_orders | 전자세금계산서 |
| bank_accounts, bank_transactions | 은행 거래내역 |
| inventory_items, inventory_transactions | 재고 관리 |
| ai_analysis_requests, ai_file_chunks | AI 파일 분석 |
| ai_layout_requests | AI 레이아웃 |
| employees, attendances, payrolls | HR |
| production_logs, work_records | 생산 일지 |
| settings | 시스템 설정 |

---

## 프로젝트 구조

```
dongsan_mes/
├── src/
│   ├── index.tsx              # 메인 앱 (라우트 등록 + 페이지 스크립트)
│   ├── layout.ts              # 공통 레이아웃
│   ├── routes/                # API 라우트 (37개)
│   ├── pages/                 # 프론트엔드 페이지 (51개, 포털 6개 포함)
│   ├── services/              # 외부 연동 (popbillProvider, taxProvider)
│   ├── lib/                   # 유틸리티 (codef, payments, crypto)
│   ├── utils/                 # 헬퍼 함수
│   ├── middleware/auth.ts     # JWT 인증 미들웨어
│   └── types/                 # TypeScript 타입 정의
├── migrations/                # D1 마이그레이션 (0001~0080, 81개)
├── IllustratorAutomat/        # C# .NET 8 자동화
│   ├── Program.cs             # 메인 폴링 로직
│   ├── ExtractGroups.jsx      # AI 그룹 분석 (source)
│   ├── ProcessOrderItem.jsx   # 개별 PDF 생성 (source)
│   ├── PackGroups.jsx         # 레이아웃 PDF 생성 (source, 없으면 publish에서)
│   └── publish/               # 실행 파일 + 실제 사용 JSX
├── LogWatcher/                # C# .NET 8 Print.log 감시
│   ├── Program.cs             # 메인 감시 루프
│   ├── PrintLogParser.cs      # TNSRip-X11 로그 파싱
│   ├── MesApiClient.cs        # MES API 통신
│   ├── RipJobCreator.cs       # RIP .job 파일 생성
│   └── publish/               # 배포용 실행 파일
├── 참고자료/                   # 인감도장 이미지 등
├── .claude/                   # 에이전트/스킬/설계 문서
└── package.json
```

---

## 개발/배포 가이드

### 웹 서버

```bash
npm install
npm run db:migrate:local
npm run db:seed:all
npm run dev:d1    # http://192.168.0.94:3000
```

### DB 명령어

```bash
npm run db:migrate:local   # 로컬 마이그레이션
npm run db:migrate:prod    # 프로덕션 마이그레이션
npm run db:seed:all        # 전체 시드 데이터
npm run db:reset:full      # 초기화 + 전체 시드
npm run db:console:local   # DB SQL 콘솔
```

### C# 변경 vs JSX 변경

| 변경 대상 | 재빌드 필요 | 방법 |
|---------|-----------|------|
| Program.cs, .csproj | 필요 | `dotnet publish` 후 EXE 재시작 |
| JSX 파일 3종 | 불필요 | `publish\` 폴더 JSX 직접 수정 후 재시작 |

---

## 설계 결정 사항

상세: [.claude/design-decisions.md](.claude/design-decisions.md) 참조

| 항목 | 내용 | 상태 |
|------|------|------|
| A. Print.log 모니터링 | LogWatcher 각 PC 배포, 5초 폴링 | 완료 |
| B. 묶음 주문 확정 | 웹 확인 후 확정 버튼 | 완료 |
| C. 카카오톡 알림 | 카카오 알림톡 API 연동 | 미구현 |
| D. 현장 카드 인쇄 | 긴급도 정렬, QR, 썸네일, CSS print | 완료 |
| E. 묶음 주문 유형 | parent_item + PackGroups | 완료 |
| F. 납품 방법 7종 | HANJIN~TRUCK | 완료 |
| G. 묶음 편집 + 카드 규칙 | 카테고리별 1카드 | 완료 |

---


## 알려진 이슈 & 해결 이력

| 날짜 | 문제 | 해결 |
|------|------|------|
| 2026-02-22 | EPS → PDF 전환 | PDFSaveOptions 적용 |
| 2026-02-22 | RGB 파일 색상 오류 | JSX 3종에 CMYK 자동변환 |
| 2026-02-22 | 텍스트 폰트 미포함 | JSX 3종에 createOutline() 자동 처리 |
| 2026-02-22 | 열재단 EPS 크기 오류 | getFullBounds 조건 강화 |
| 2026-02-22 | 콘솔 QuickEdit 멈춤 | DisableQuickEdit() P/Invoke |
| 2026-02-22 | 복수 파일 마지막만 사용 | order_items.ai_analysis_id 추가 (0018) |
| 2026-02-25 | ExtractGroups 형제 보정 버그 | Pass 2 완전 교체, geometricBounds 중심 |

---

**마지막 업데이트**: 2026-03-18
