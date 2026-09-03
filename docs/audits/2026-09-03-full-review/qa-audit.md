## QA 감사 결과 — 2026-09-02 (local)

대상: http://localhost:3000 (dist 서빙 dev 서버) · 계정 admin(ADMIN, entity 1) · Playwright(Chromium) + curl(Bearer)

### Level 1: 페이지 로드 (89/90 통과)
사이드바 46 + index.tsx 라우트 44(리다이렉트 별칭·상세 페이지 포함) = 90 페이지 순회. 실패:
- `/material-forecast — GET /api/forecast/material-consumption 404 → 콘솔 '원단 소모 예측 로딩 실패', 본문 '데이터 로딩 중...' 정지` (#318 기지, 네비 숨김 상태·직접 URL은 여전히 라우팅)

환경 제약으로 콘솔 error 만 찍히고 화면은 정상 안내한 페이지(통과로 집계):
- `/cash-schedule` · `/bank` · `/cash-flow` — GET /api/barobill/status 500 (로컬 BAROBILL_CERT_KEY 미설정)
- `/messages` · `/kakao` — GET /api/kakao/balance 400 「바로빌 연동이 설정되지 않았습니다」
- `/my-leave` — GET /api/my/leaves 404 (admin 계정에 직원 미연결, 안내문 정상 표시)

### Level 2: API 헬스체크 (57/59 통과, 60 호출 중 1건 프로브 제외)
페이지 순회에서 관측된 /api GET 151개 중 공통(nav-badges·entities·user-prefs)·smoke 중복 제외 60개 curl. 실패:
- `GET /api/barobill/status — 500 — 바로빌 요청 처리 중 오류가 발생했습니다 — 223ms` (로컬 env 미설정; `barobill.ts:51` getConfig throw → 500)
- `GET /api/forecast/material-consumption — 404 — Not Found — 215ms` (백엔드 미구현 #318)
- (제외) `GET /api/bank/auto-sync — 404` — POST 전용 라우트(`bank.ts:2569`)를 GET 으로 찌른 프로브 오류, 결함 아님

최대 응답 243ms(`/api/cash-flow/schedule/calendar`), 2초 초과 0건. 별도로 `scripts/smoke.cjs` 정본 89개도 호출: 87 통과, 404 2건은 로컬에 없는 고정 id(`/api/cards/1/neighbors`, `/api/insurance-reports/1`).

### Level 3: 기능 시나리오 (3/5 통과 + 2 부분통과·결함 없음)
- ✅ 주문서 작성(`/order-form`) — 거래처 '파인' Enter → 자동선택·휴대전화/주소 자동채움·credit-check 호출, 품목 '현수막' → 수성 가로등현수막(AREA) 선택, 100×70cm×2 → 단가 1,000/금액 2,000/VAT 200/합계 2,200 자동계산. 저장 안 함.
- ✅ 유통 주문서(`/order-form?type=dist`) — 거래처 자동채움, 품목 '깃대' Enter → 검색 모달 15행 → 선택 시 품목명·규격·단위·item_id 채움(단가 0 = 품목 base_price 0). 저장 안 함.
- ⚠️ 단가표(`/price-list`) — 탭 3종·API 4종 정상. 인쇄는 `pmRequireSheet` 가드에서 중단: 로컬 price_sheets 0건·policies 0건이라 세트 선택 불가(데이터 제약). 거래처 선택→정책 적용→인쇄 미리보기 미검증.
- ⚠️ 메시지 관리(`/messages`) — 페이지·탭 정상, '템플릿 관리' → GET /api/kakao/templates 400 「바로빌 연동 미설정」, UI는 실패 안내 정상 표시(환경 제약). 발송 없음.
- ✅ 출고/배송(`/shipments`, `/shipments-dashboard`) — 데이터 로드 정상, 필터(택배·미완료)가 API 파라미터에 반영, 날짜 2026-09-09 → 주문 카드 1건 표시. 단 상단 카운터 불일치(아래 #2).

### 발견된 문제
| # | 심각도 | 위치 | 설명 | 재현 |
|---|--------|------|------|------|
| 1 | MEDIUM | `/material-forecast` · `src/scripts/materialForecast.js:7` · `src/layout/menu.ts:92` | GET /api/forecast/material-consumption 백엔드 미구현(404) → 화면 '데이터 로딩 중...' 정지. #318 기지, 네비만 숨김이라 직접 URL·북마크로는 여전히 도달 | `/material-forecast` 접속 |
| 2 | MEDIUM | `src/routes/shipments.ts:663-665` ↔ `src/scripts/shipmentsDashboard.js:26` | 출고 대시보드 카운터(전체/출고 가능/미완료)가 `?date=` 를 무시하고 `kstYmd()`(오늘) 고정 → 다른 날짜 조회 시 목록 1건·카운터 0 불일치 | `/shipments-dashboard` 날짜 2026-09-09 검색 → 목록 1건, 카운터 0 (curl `/api/shipments/dashboard/counts?date=2026-09-09` = total 0) |
| 3 | LOW | `src/routes/barobill.ts:51-62` | CERT_KEY/corpNum 미설정을 `getConfig` throw → 500 으로 응답. 미설정은 400/200(configured:false)이 적절. 로컬·미설정 법인에서 `/bank`·`/cash-schedule` 콘솔 error 유발 | 로컬 `/api/barobill/status` |
| 4 | LOW | `/cards/:id`, `/hr/:id` (`cardDetail`, `hrDetail`) | 존재하지 않는 id 접속 시 안내문 없이 빈 레이아웃/빈 편집 폼 + 콘솔 404 error 5~6건 | `/cards/135`, `/hr/39` |
| 5 | LOW | `/messages` 템플릿·잔액, `/my-leave` | 미설정/미연결 상태를 4xx 로 받아 콘솔 error 로 남김(화면 안내는 정상). 정상 상태 판별용 응답이면 200+flag 가 조용함 | `/messages` 템플릿 관리 탭, `/my-leave` |
| 6 | INFO | `/invoice/:id`, `/quotation/:id` | '회사 정보가 미설정입니다' 배너 — 로컬 설정 데이터 없음(prod 무관) | `/invoice/134` |

### 검증 메모
- 미방문: `/hr/:id`·`/payslip/:id`·`/year-end/:id` 실 id — 로컬 employees 0건(존재하지 않는 id 39 로만 프로브). `/workflow` 는 폐기 라우트(`index.tsx:494`, 빈 페이지)라 집계 제외. `/portal/*` 는 `/portal/login` 만 로드 확인.
- 브라우저는 기존 admin 세션을 재사용해 로그인 폼은 거치지 않음(rate-limit 없음). 프로덕션·삭제·저장·발송·인쇄(window.print 스텁) 일체 미실행.
- Level 2 한글 검색 파라미터는 percent-encoding 필수 — curl `--data-urlencode` 로 찌르면 0건 오탐(서버는 정상: 깃=17건·현수막=1건).
- 시나리오 3·4 는 로컬 데이터/외부연동 부재로 끝까지 못 갔을 뿐 코드 결함은 관측되지 않음. prod 에서 `smoke:prod` + 단가표 인쇄·카카오 템플릿 조회 1회 실측 권장.
- 원본 로그: 같은 폴더 `l1.jsonl`(페이지 90+2 프로브), `l2-smoke.tsv`(89), `l2-pages.tsv`(60), `l3.txt`.
