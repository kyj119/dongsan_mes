# PROJECT_STATUS_ARCHIVE.md — 완료 이력

> 이 파일은 PROJECT_STATUS.md에서 분리된 완료 항목 아카이브입니다.
> AI 에이전트가 매 세션 읽을 필요 없음. 필요 시 수동 참조.

---

## [2026-06-24 이관] 완료 항목

> 2026-06-24 PROJECT_STATUS.md 다이어트 시 이관된 완료·배포 블록 (verbatim, 순서 보존).

- **✅ [2026-06-24] GitHub 이슈 6건 처리 — IDOR·감사·차감UI·write카나리** (커밋 `f9587c5c`, prod dep `541183ab` `--branch main`, smoke 101/101, 5건 close + #439 코멘트):
  - **#440** leaves `/balance/:employeeId` entityFilter 2건(타법인 직원 연차이력 cross-tenant 열람 IDOR 차단) · **#437** bank `PUT /accounts/:id`+`transactions/import` entityFilter(타법인 계좌 master 덮어쓰기 IDOR) · **#436** inventoryCount 제출/승인 감사기록 `X-User-Id`(미전송 헤더, 항상 'system')→`c.get('user').username`.
  - **#435** 차감방식 UI/API — items PUT/PATCH allowedFields+값검증(ROLL/BOARD/NONE·sheet_spec 4x8/3x6·waste≤5)·GET /:id 필드추가·MATERIAL 모달 select+보드규격/로스율(`onDeductionMethodChange`, BOARD만 노출). **검증게이트(용준님)**: BOARD 면적→장 차감·3x6(915×1830)/4x8(1220×2440) 규격관리 건전 확인 후 옵션A 적용. 라이브 라운드트립(BOARD/3x6/1.1 저장·잘못된값 400) 통과.
  - **#430** 로컬 write 카나리(`scripts/write-canary.cjs`+`canary/items-write-canary.sql`+verify.yml job) — read-only smoke가 못잡는 0335류 FK-drop write회귀를 로컬 D1 INSERT→assert→DELETE로 빌드/CI 탐지(prod 무오염, owner 권장해법). 음성테스트(없는 테이블 write→non-zero) 통과.
  - **#439**(infra) git push 403 코어 이미 해소(코멘트 기록) → 코멘트만. backlog 트림=스케줄 auto-improve 루틴 소유 `IMPROVEMENT_BACKLOG.md`라 **멀티세션 충돌 회피 위해 미수정**.
  - **★멀티세션 무충돌 처리**: 다른 세션(회계허브 Playwright검증·clients.balance 동시작업·브라우저 점유) 위에 격리브랜치 작업→**main ff push FIRST**(origin/main=superset)→`--branch main` 배포→apex 신규필드 마커 검증(공유 브라우저 미점유). 내 픽스 전부 origin/main·prod 잔존 확인(다른 세션이 위에 빌드+재배포 aeccc624 후에도). 메모리 [[feedback-multi-session-deploy]].

- **✅ [2026-06-24] /bank 미수금현황 stale 미수금 수정 — 데이터 정리 + 파생 전환** (커밋 `36bec2cd`, dep `aeccc624`, smoke 101/101):
  - 증상: `/accounting` 미수금=0인데 `/bank` 미수금현황에 **90,580원 잔존**. 원인=`/bank/receivables`(`bank.ts:1830`)가 폐기된 **`clients.balance` 캐시 직접 읽음**(`WHERE c.balance>0`), /accounting은 라이브 파생. **공장초기화(0620)가 orders/payments는 지웠지만 clients.balance 캐시 미클리어**→stale(양수 3건 90,580 + 음수 4건 −9,255,290 선수금잔재. orders·payments 전역 0 = 전부 orphan).
  - 조치: ①**stale balance 7건 전부 prod `balance=0`**(양수 3건 id 3·2590·2159 + 음수 4건 id 850·1587·400·1000, 용준님 2회 승인). **clients.balance 전체 0 검증**(nonzero_remaining=0). ②`/receivables`를 **deriveClientBalance 정의 파생**으로 전환(LEFT JOIN billed[obg BILLED]/paid/adj − downstream `r.balance` 무변경, 폐기 캐시 더는 안 읽음).
  - 검증: tsc/build green · 신규SQL prod 0행 · API total_receivable=0 · smoke 101/101 · **Playwright /bank 미수금 0원·빈상태·콘솔0**. 정본=[[project-clients-balance-deprecated]].
  - **✅ 거래처 상세도 파생 통일**(커밋 `a846ed0a`·dep `95d75ae7`·smoke 101/101): `/:id/detail`·`/:id/intelligence`가 `clients.balance` 캐시→`deriveClientBalance` 파생. detail은 응답 `client.balance`(여신배너)·`receivables.balance` 둘 다 파생 덮어씀. Playwright 검증(디자인이룰 미수금 0원·여신배너 정상). credit-check는 exposure 기반=다른 개념이라 유지.
  - **✅ 별건 수정**: `GET /api/clients/billing-groups`가 `/:id`에 셰도잉돼 404였음(id='billing-groups'로 가로채임) → **GET 핸들러를 `/:id` 앞으로 이동**(커밋 `d3dda374`·dep `53889211`). 검증: billing-groups 200·/:id 200·거래처 상세 **콘솔에러 0**·smoke 101/101. (Hono=정적 라우트를 `/:id`보다 먼저 등록 필요.)
  - **▶ 남은(보류·후속)**: `clients.balance` 잔존 reader(목록 `c.balance>0` 필터·`/:id` getter·portal)도 파생 통일 = 캐시 컬럼 전면 폐기(큰 작업, 캐시 전체 0이라 즉시 문제 없음).

- **✅ [2026-06-23~24] 회계 통합 관리 허브 `/accounting` — Phase 1~4 전부 구현·prod 배포·검증 완료** (커밋 `02dfe2d4`+`13fb4e2d`, 마이그 0374 remote, web dep `018bae20` `--branch main`, smoke 101/101, **6탭 전부 활성**):
  - spec=`docs/superpowers/specs/2026-06-23-accounting-hub.md`, 메모리=[[design-accounting-hub]]. 7개 페이지 분산 회계기록을 한 화면에서 **통합 조회·정정**.
  - **신규 파일 4**: `pages/accounting.ts`·`scripts/accounting.js`(전부 `acc*` prefix)·`routes/accounting.ts` + 마이그 **0374**(권한, INSERT OR IGNORE). index.tsx(import+mount `/api/accounting`+page route)·menu.ts(재무 섹션 '회계 허브' 최상단, fa-coins).
  - **Phase 1 (입금)**: `GET /api/accounting/summary`(KPI=수입[기간 매출 obg BILLED/PAID, billed_at KST]·지출[기간 카드≠CANCEL + 매입 total]·미수금[전체 파생 billed−paid−adj, deriveClientBalance 정의]) + `GET /api/accounting/payments`(전체목록, 필터 기간·거래처·금액·검색·entity + 페이지네이션 + 합계). **수정/삭제는 기존 `/api/ledger/payment/:id`(ar-payments) 재사용**. 결정(용준님): KPI=매출/지출합산/미수금 · 입금 API=신규 accounting 라우트(/ledger 무영향).
  - **Phase 2 (세금계산서·현금영수증 탭)**: 탭 기능화(입금·세금계산서·현금영수증 활성, 카드·매입 비활성 placeholder). 각 탭=**조회 통합**(상태·검색·기간[상단 KPI 기간 공유] 필터) — `GET /api/tax-invoices`·`GET /api/cash-receipts` **기존 GET 재사용**+페이지네이션. **발행/취소 등 정정은 기존 페이지(`/tax-invoices`, `?tab=cash`) 링크아웃**(바로빌 라이프사이클 안전). 상태배지=taxInvoices.js 미러(acc-prefix 격리). 탭 lazy-load + 기간변경 시 활성탭만 재로드.
  - **Phase 3 (카드·매입 탭)** [커밋 `13fb4e2d`]: 카드=기존 `GET /api/card-expenses/transactions` 직접 재사용(날짜·검색·entity). 매입=**신규 `GET /api/accounting/purchases`**(기존 `/api/purchase-invoices` 목록에 기간필터 없어 상단 기간 공유용 — 기간·검색·결제상태). 정정은 `/card-expenses`·`/purchase-invoices` 링크아웃. 카드 compact일자 정규화·취소(−) 표시.
  - **Phase 4 (통합 타임라인 탭)** [커밋 `13fb4e2d`]: **신규 `GET /api/accounting/timeline`** — 입금(+)·카드/매입(−) UNION 일자역순 + 기간 집계(수입/지출/순현금), kind=income|expense 필터. 카드 compact일자 substr 정규화, 취소=환불(+), 전 소스 entity 필터. **마이그 없음**(추가 GET + 프론트만, 권한/스키마 무변경).
  - **검증**: tsc/build/`node --check` green. **신규 SQL prod 스키마 직접 검증**(timeline UNION 실데이터). [**prod 라이브** dep `018bae20`] `/summary`·`/payments`·`/purchases`·`/timeline` 200·집계 net=수입−지출·지출=카드+매입 정합 → **smoke 101/101**. **Playwright 시각검증 통과**(admin 로그인→6탭 전환: 카드 44행 합계 2,471,090=KPI일치·매입 빈상태·타임라인 44행 순현금 −2,471,090·서명금액/배지 정확, 콘솔에러 0[로그인전 /auth/me 401만=정상]). origin/main push 완료. *(검증 중 일부 임시 프로브의 401은 토큰 필드경로 오독 `lj.token` vs `lj.data.token` — 레이트리밋 아님, [[feedback-login-token-field-path]])*
  - **▶ 다음(선택)**: 어음(받을/지급) 탭 신설 · 복식부기 journal_entries 조회 탭 · 통합 타임라인 CSV 내보내기 (전부 백로그, 핵심 6탭 완료).

- **✅ [2026-06-23] GitHub 이슈 13건 검토·처리 — 11건 수정·prod 배포·close + 2건 보류**:
  - **수정 9 (커밋 `9e0c13c4` → prod dep `0b685d2f` `--branch main` → smoke 101/101 → origin/main `8604af0e`)**: IDOR 2(**#432** cards/lifecycle `cardEntityScope` 개별 카드 10경로·**#427** tasks 조회/통계/변경, `/claim` 공용 에이전트 유지) + 존재X컬럼 4(**#412** scan→`inventory`·**#425** equipment 실컬럼·**#424** users→`phone`·**#428** caps→`inserted+updated`/`error_count`) + dead기능 2(**#426** 단가제안 3중dead 완성·**#431** 카드원단 `product_materials`(is_default)→`print_media_name` 복원) + N+1 1(**#423** 청크 batch). 검증=typecheck+build+JS문법+재작성SQL 로컬D1+entity감사 42/42.
  - **보류 2 (이슈 코멘트만)**: **#429**(제거범위가 #426으로 살린 `onUnitPriceManualChange`+진행중 `product_materials`와 충돌→개편 안정화 후) · **#430**(prod write카나리=e2e-prod오염 차단과 충돌+D1 dry-run 불가→로컬 카나리 권장).
  - **후속 수정 2 (세션 중 봇 신규 등록, 동일클래스 → 즉시 처리·배포·close)**: **#433** balance-snapshot 존재X컬럼 3(재고 `items.current_stock`→`inventory.quantity × items.avg_unit_cost` · 은행 `bank_accounts.current_balance`(부재)→계좌별 최신 `bank_transactions.balance_after` 합산 · 대출 `remaining_principal`/`status`→`current_balance`/`is_active`, `.catch`로 은폐된 "항상 0" 수정) · **#434** 은행 `match-rules` PUT/DELETE `entity_id` 격리(list/INSERT 대칭, ADMIN-gated IDOR).

- **✅ [2026-06-20] 프로덕션 공장초기화 — 출시 전 클린 슬레이트 (용준님 결정·실행 완료)**:
  - **목적**: 테스트 트랜잭션+품목 전멸 후 품목 처음부터 재등록(축 마이그 선행 예정). prod=출시 전(주문 804 대부분 E99 테스트·CANCELLED, 세금계산서 0, 거래처 3649만 실데이터).
  - **백업 이중**: D1 export 17.6MB `backups/prod-pre-reset-20260620.sql`(gitignore) + Time Travel 북마크 `0000010c-0000052a-0000508f-761c3ad86550df7d0f02ea14c1dfaaa0`(30일 복원).
  - **실행**: **76테이블 삭제**(확정72+FK무결성4: cash_receipts·credit_overrides·item_post_processing_defaults·portal_access_tokens). FK ON이라 **괄호균형 파서로 FK 위상정렬 + 보존측 참조 3 NULL 선처리**(clients.billing_group_id→billing_groups·hometax_invoices.matched_invoice_id→tax_invoices·price_policy_rules.item_id→items) + 시퀀스 리셋. 생성기=`scripts/_gen_wipe.py`(삭제), SQL=`backups/_wipe.sql`.
  - **검증**: orders/items/quotations/cards/order_items/inventory/payments/cash_receipts=**0**, 보존=clients **3649**·users 4·employees 111·item_categories 13·print_media 9·settings 61·finishing 7·holidays 21. DB 14.9→7.4MB. **prod 스모크 103/103**.
  - **방향 전환**: 병행등록+매핑/P1c dedup(`2026-06-20-p1c-mapping-draft`)·staged 231 로드 = **전부 폐기**(구 품목 없음). 스키마는 유지(0322 카테고리13·0323 items.pricing_profile·0324 size_grade_prices).
  - **▶ 다음**: ①**축(option-axis) 시스템 마이그**(`option-axis-system-design` 구현 — 소재/인쇄방식/호수/두께 등 축 테이블) → ②**표준품목+축 클린 업로드**(`표준품목_등록구조_수정본.xlsx` 298행, `/api/items/bulk` 또는 로드 SQL). 파일정리=`품목마스터/{설계·업로드양식·원천주문데이터}` 완료.

- **✅ [2026-06-19 PM3] 이형(true-shape) 수동 인터록 네스팅 + append 실사용 검증 + 정리 — 구현·검증·prod 배포·정리 완료** (커밋 `e2eb1598` 로컬·미푸시, web dep `8953d23e`, 에이전트 PID **20832**):
  - **이형 인터록(신규)**: 자동 bbox 네스팅이 시작점 → 조각 드래그·회전(겹침 허용=이형 절감) → **주문 시 라이브 위치에서 placements 재계산**(시트상대 bbox+`rotation`), 롤 길이 자동단축. 멤버십=조각 bbox중심 시트 포함관계(드래그 인/아웃·복제·앵커 fid 정합). web=`iaeCanRotBBox`/`iaeCanReassignSheets`/`iaeCanSyncSheet`/buildOrderLines. 에이전트=`SheetLayout.jsx`(`pl.rotation` 우선)+`Program.cs` 3빌더 rotation 통과(**backward-compatible**, 없으면 rotated bool=90). **검증**: Playwright 실번들 직접호출 bbox 4회전·라이브재계산·롤44→22cm·겹침효율0.199→0.398·중복출력방지·콘솔0. verify+dotnet build 0err.
  - **배포**: web `wrangler --branch main`→dep `8953d23e`·smoke 103/103. 에이전트 `dotnet publish`(단일파일81MB)→robocopy Z:(appsettings 보존)→재시작 PID 20832(안정, 180/270 충실 활성). 롤백=`Z:\…\publish-backup-20260619-thumbfix`. **push 완료**: 봇 `da4babb9`(append 정합성 감사=docs-only) merge→`origin/main=6dbeed13`→**CF 자동빌드 `76e24be6` 라이브·smoke 103/103**.
  - **append 실사용 검증(완전성공)**: 대지 객체(분석#1 실 FK)→'기존 주문에 추가' 실 picker→**order_items 1→2·카드 -02 연속·AI_PROCESS task 트리거**(`append_item_ids`). 부수발견=`enqueueAutoProcessJobsForItems`가 `order_items.finishing2/3` 스키마 드리프트로 throw→catch(휴면 큐라 무영향, 기지 문제).
  - **정리(#3)**: 로컬 publish/publish-new(~325MB)·Z: 구 백업3+`_auto_output`+네스팅 테스트출력(~588MB)·**로컬 D1 전체 테스트주문(orders 4~15=10건+cascade)** 삭제. 거래처·품목·설정 보존.
  - **180° 라이브 EPS e2e ✅**: 에이전트 중지→PowerShell COM `DoJavaScript`(에이전트 RunJsxScript 동일)로 **배포된 SheetLayout.jsx** 직접 실행→실 디자인(Aces High) group 0°/180° 렌더→JPG 하단 완전 뒤집힘=`rotate(-pl.rotation)` 정확(270° 동반). ⚠️Illustrator MCP 끊김→PS COM 우회가 신뢰 검증경로. 배포 후 스테일 경고(180/270 "최신빌드 후") 제거. **사용법=`docs/IA_EDITOR_USAGE.md`**.
  - **finishing2/3 스키마 드리프트 — 점검·수정·배포 완료 (Option B, 커밋 `ad8c0af3`→merge `dd06d830`→자동빌드 `1fd1d94a`·smoke 103/103)**: prod·로컬 모두 `order_items`에 **finishing2/3 컬럼 없음**(어떤 마이그도 생성 안 함, 코드만 SELECT). 매 주문 생성 try/catch 내 throw→catch = 로그 노이즈 + 휴면 `auto_process_jobs` 큐 영구 미작동(주문 생성·AI_PROCESS task는 블록 밖이라 무영향). 현 마감=per-side JSON `finishing` 단일이라 finishing2/3은 잔재 → **3파일(autoProcess·orders/helpers·orders/create) SELECT·타입·`.join('+')` 제거→`finishing`**. 마이그 불요, prod 스키마 무변경. 검증=verify+로컬 쿼리 throw 제거 확인.
  - **▶ 남은(선택)**: 없음 (이전 백로그=PROJECT_STATUS 하단 TODO·split-billing P5-continued 등).

- **✅ [2026-06-19 PM] 주문 라인 append + ia-editor #3·#4 + 직접연결 썸네일 공백버그 — 전부 prod 배포·E2E 검증 완료**:
  - **append(신규기능) — prod 배포(웹 dep `b90d3635`)**: `POST /api/orders/:id/items`(create.ts) — 기존 주문에 ia-editor 산출 라인만 추가(기존 품목/카드 무변경). `generateCardsForOrder` **itemIdsFilter**(신규 라인만 카드생성·카드번호 기존 최대 뒤 연속) + **enqueueAutoProcessJobsForItems**(helpers.ts, 라인별 ai_analysis_id·에이전트 폴링 큐) + **ia-editor 주문모달 신규/기존 토글 + 주문 검색 picker**(iaEditor.js, orderVisibilityFilter 법인격리·출력완료까지만 선택). **가드: 상태 PRINT_DONE까지**(CONFIRMED·PRINTING·PRINT_DONE·HOLD 허용 / SHIPPED·COMPLETED·CANCELLED·QUOTATION·DRAFT 차단)·entity 소유검증·recalcOrderBillingGroups(동결보존, BILLED면 경고)·**PRINT_DONE→PRINTING 되돌림**. E2E(로컬): 품목+2·합계증가·카드번호연속·중복0·동일그룹 1카드·가드 400/404/409·되돌림. **prod smoke 103/103 + append 라이브(400/404 가드)·ia-editor 정상**. 회귀테스트 `scripts/e2e-append-items.cjs`.
  - **#3 /files 500 근본원인 정정**: stale id 아님 — `canvas_json`(마이그 0317) 미적용 환경서 "no such column" 500. **prod=정상(200)**, 로컬 드리프트는 db:migrate:local로 해소. 코드 버그 아님.
  - **#4 다중시트 UX**: 주 카드생성 정상. SHEET/RESIZE/TRIM 내부코드 후가공 뱃지 누수 → `isPPHidden`(cards/core.js) IAE_INTERNAL_PP로 숨김. (배포 동반)
  - **🆕 직접연결 완성본(-3) 썸네일 공백버그 — 에이전트 수정·재배포·e2e 완결**: 거래처명 공백 시 EPS(File.Copy=공백 보존)/PNG(Illustrator exportFile=하이픈화) 파일명 미스매치 → `ReportDirectThumbnailAsync` File.Exists 실패→콜백 미발송→썸네일 NULL. **B안**(Program.cs: File.Exists 실패 시 공백→하이픈 후보 + `{주문번호}-{seq}-*.png` glob 폴백) 적용. **에이전트 재빌드·Z:\publish 재배포(백업 보존)·재시작 PID 21000**(webapp 무변경). **e2e**: 공백 거래처 신규주문 `E1-20260619-009` → 미스매치 재현→폴백→로그 `썸네일 보고(분석#42) OK`→카드 SET·디코딩. **007 백필**(콜백 엔드포인트) done/SET. 무공백 회귀0(008). 정본→[[bug-history]].
  - **✅ 커밋 `74272977` → push `origin feat/ia-editor-canvas-n1:main`**(HEAD=origin/main 동기화). 변경=`orders/create.ts`·`orders/helpers.ts`·`scripts/iaEditor.js`·`scripts/cards/core.js`·`IllustratorAutomat/Program.cs`. 핸드오프=session-context.md.
  - **▶ 다음(선택)**: ~~이형 true-shape 네스팅 · append 실사용 검증 · Z/테스트주문 정리~~ → **전부 [2026-06-19 PM3]에서 완료**(위 항목 참조).

- **✅ [2026-06-18~19] EPS suffix 버그 해결 + ia-editor 캔버스 워크벤치 N1~N5 + N4 출력 fidelity — 전부 prod 배포·e2e 검증** (브랜치 `feat/ia-editor-canvas-n1` = main = `0783c75e`, web dep `640dad03`, 에이전트 PID 13652):
  - **EPS suffix 버그**(`Program.cs NormalizeArtboardEpsName`, 커밋 `3e2be20a`): `saveMultipleArtboards`가 EPS명에 `_design_N`/`-01` suffix 강제 → `File.Exists` 오탐 → file-map/썸네일/원본보존 스킵(2026-05-09~). 영향조사=실운영 RIP은 agent file-map 미사용(prod print_events 100건 card=NULL)→기존 회귀0. 정규명 rename으로 수정. agent 배포·e2e 성공.
  - **ia-editor 캔버스 N1~N5**(자유 대지 객체 편집기, spec §14): N1 캔버스(객체·드래그/리사이즈/회전·핫키·Konva·localStorage) → N2 마감/여백/돔보 벡터근사 인스펙터 → N3 시트 네스팅(shelfBinPack) → N4 주문 연결(품목/거래처 picker·면적단가→`POST /api/orders`→AI_PROCESS) → N5 단일그룹 돔보(ProcessOrderItem.jsx). 검출보정 캔버스(구) 폐기.
  - **N4 출력 fidelity**(캔버스 편집이 실제 EPS에 반영): ①**per-side 마감**(no-op 버그 수정: finishing 단일문자열→per-side JSON 객체, 에이전트가 4면 마진) ②**target-size**(RESIZE pp→ProcessOrderItem 아트워크 그룹 스케일, opt-in) ③**네스팅 실제배치**(per-item SHEET pp→`RenderItemSheetAsync` SheetLayout 렌더, **다중 시트** 지원) ④**네스팅 스케일·파일 배율(scale_factor)** ⑤r2 다운로드 순서 버그 수정. 검증: EPS bbox(마감4cm→644×563·target 60×40·시트배치 N조각 EPS·다중시트 2판) 정확.
  - **코드 점검·정리**: 독립 리뷰(실버그 1건=주문모달 검색 디바운스 레이스 수정) + 검출보정 폐기(−165줄) + **네스팅 뷰 통합**(구 '네스팅' 탭 −228줄 폐기→대지 편집 2탭). 순 −400여 줄.
  - **▶ 다음(선택)**: 이형(비정사각형) true-shape 네스팅(현재 바운딩박스만; 권장=수동 인터록), 기존주문 라인 append API, `/api/workbench/files?ids=<stale>` 500(저영향). 정본 → [[project-ia-editor]], 핸드오프 = `memory/session-context.md`, spec `docs/superpowers/specs/2026-06-16-ia-editor-nesting-intake.md` §14.
  - ⚠️ **webapp=Direct Upload**(wrangler 배포=유일 prod, git push≠빌드, 봇 push 머지 선행) · **에이전트 교체=dotnet publish+robocopy+재시작** · **finishing=per-side JSON·post_processing=배열·scale_factor=÷N** 규약(session-context 참조).

- **✅ [2026-06-12 PM3] 급여 후속 — 요율 검증·수정 + 법인3·4 급여 + Phase 1b + 산재 0.9% + 신고서 점검 — 전부 prod 반영·배포·Playwright 검증·이슈등록 완료**:
  - **4대보험 2026 요율 수정**(`insurance_rates` prod UPDATE): 국민연금 9→**9.5%**(2026.1 연금개혁)·상한 617→**637만**·하한 39→**40만**, 건강 7.09→**7.19%**, 장기요양 12.95→**13.14%**. 고용 1.8 유지. **산재 0.7→0.9% 확정 입력**(2026-06-12, 출판·인쇄·제본업 표준, 전 46명 sync 회사부담 반영·net 불변). **▶ 2026.7 국민연금 상한 659만/하한 41만 재조정**(year 단위 1행 구조라 수동 UPDATE 필요). 정본 → [[payroll-insurance-rates-2026]].
  - **법인3·4 급여 미생성 해결**: 오다플래그(4) 8명 + 청주(3) 1명 2026-06 batch 생성(switch-entity별 호출 → entity_id 정상, 전체모드 0 오염 방지) + 전체 46명 sync(새 요율·휴일근무 반영, 법인4 휴일수당 183,020). 안혜옥(emp11 base_salary 0→400만 설정·재계산, 음수 net 해소).
  - **Phase 1b 단건 급여 고정연장 분해**(`core.ts` preview/save): batch/sync와 일관, **이중분해 방지**(emp.base_salary 원본 기준 + body.overtime_hours=총연장 해석 → 추가분만). build OK. → [[design-payroll-inclusive-overtime]].
  - **공휴일 2026 검증**: DB 21건 정상(요일·음력·대체 전수 대조). `load-defaults` 코드에 지방선거(06-03) 보완.
  - **✅ 배포 완료**: load-defaults·Phase1b·`#prCompactCard` 목록표 고정형 = 커밋 `3704abf8` push→CF 자동빌드→Playwright 검증(김기섭 포괄 2,700,000→base 2,502,357+연장 197,643, 시급 11,973 분해 정상).
  - **산재 0.9% 전수 검증 + 4대보험 신고서 점검**: 급여대장 회사부담금 탭(법인별 산재=동산711,410·선명335,150·청주28,800·오다187,540, 계 **1,262,900**) + 4대보험 신고서 생성→상세(`소계회사−소계근로자=산재`)→삭제로 0.9% 정상 확인. **신고서 구조 이슈 2건 등록** — **#392**(산재 컬럼 미표시: 회사부담 소계/전체합계에만 합산), **#393**(신고서 생성 entity 필터 누락 `insuranceReports.ts:109` → 전 법인 합산·entity_id=1 저장).

- **✅ [2026-06-12 PM2] 급여/인사 시스템 대규모 개선 — 전부 prod 배포·Playwright 검증·push 완료**:
  - **CAPS 사이트**(DB만): 대전본사→동산기획 rename, 선명2(S2) 삭제. `caps_sites`는 코드 아닌 데이터.
  - **월 인건비**(`hr.ts` /stats): payroll 미생성 시 `net_pay` 빈값→'-' 버그 → **재직 base_salary + 이번달 근태(연장/야간/휴일) 추정** 하이브리드, '예상' 부제. KST 월 보정.
  - **부서/직급/고용형태 SSOT**: `src/constants/hr.ts` 신규(DEPARTMENTS/POSITIONS/EMPLOYMENT_TYPES + deptOptions() 헬퍼 + HR_ENUMS_JS) + `layout.ts` 전역주입(`window.DEPT_NAMES/POSITION_NAMES/EMPLOYMENT_NAMES`). **8파일 하드코딩 제거**(드롭다운 6 + JS맵 3). **`attendance.ts` 필터 OFFICE≠ADMIN_DEPT 버그 수정**. 등록모달 생산직·고정연장 추가(상세모달 일치). 커밋 `9f2f8797`.
  - **고정연장(포괄임금) 급여계산**(`payroll/shared.ts` `calcInclusivePay` + `core.ts` batch/sync): 입력 기본급=포괄총액 → 통상시급=base÷(209+고정OT×1.5=**225.5**), 기본급=시급×209, 고정연장수당=총액−기본급. 기존 `base×225.5/209` 부풀림(~8%) 제거. sync=전체 재계산(공제·실지급). 프론트(÷225.5)와 일치.
  - **급여대장**(`payroll.ts/js`, 커밋 `b79f61c6`): /payroll 확장토글, **table-layout:fixed 고정형** + **급여대장/회사부담금 2탭**, 수당·공제 항목 전개, 부서·전체 합계, 인쇄(가로A4)·CSV. 디자인MD §6에 표 고정형 규칙 추가.
  - **4대보험 2026 요율**(앱 API 적재) + **야간·휴일 배율 1.5**(settings). ✅ **PM3에서 검증·수정 완료**(국민연금 9.5%·637만, 건강 7.19%, 장기요양 13.14% — 위 PM3 항목 참조). 산재 0.9% 확정·7월 상한 재조정 TODO.
  - **야간/휴일 근태연동**(`core.ts` sync, 커밋 `3f5c799d`): attendance 야간(caps_night_min)·휴일근로 → 수당 계산·지급.
  - **공휴일 달력**(마이그 `0311_holidays.sql`, `payroll/settings.ts` CRUD/load-defaults, payrollRates '공휴일' 탭): `holidays` 테이블 단일소스. 커밋 `447d9ca6`·`1c137ae0`.
  - **휴일 derive-at-read 리팩토링**(커밋 `503573c8`): 근태·급여가 **날짜에서 휴일 파생**(토·일+공휴일 달력). attendance mutate(재분류 엔드포인트)·'공휴일 반영' 버튼 **제거** → 드리프트·이중로직 해소. 근태 그리드 공휴일=휴일/휴일근무 표시(결근 아님).
  - 교훈→[[design-payroll-inclusive-overtime]]·[[design-holiday-derive]]·[[design-hr-enum-ssot]]·[[design-payroll-ledger]].

- **✅ [2026-06-12 PM] HR 인사/급여 다수 개선 — 전부 prod 배포·검증(Playwright)·push 완료**:
  - ① **소속법인 변경 "저장+무반영" 버그**(`57185811`): PUT `entity_id` 가드 ADMIN 전체모드(0)→**ADMIN 역할**로 완화(#349 비ADMIN 차단 보존), 거부 시 `warnings` 토스트.
  - ② **개인사업자 '오다플래그'(entity 4)**(마이그 0309) + **법인 select 전면 동적화**(shell.js 공용헬퍼 `loadEntities/entityName/fillEntitySelect`, 하드코딩 제거 → 향후 사업자 추가 = `entities` INSERT만) + **급여명세서 entity화**(payroll GET entities JOIN, payslip.ts 회사명 동적) (`827402a4`). 오다플래그=급여/인사 전용(주문·재고 미사용).
  - ③ **소속변경 후 '직원 못 찾음' 404 해결**: ADMIN은 GET 단건/detail·PUT 게이트서 `entityFilter` 면제(타 법인 직원 조회/수정 허용) + 직원상세 전화번호(유선) 제거·휴대폰만·**특이사항 메모(notes) 칸 추가** (`b241c46e`).
  - ④ **생년월일 입력 텍스트 자동하이픈** + **flatpickr 달력**(년도 빠른 선택, layout CDN+shell.js `hrInitDatePickers`, 생년월일·입사·퇴사일, `.js-fp`) (`5a43689c`·`99159a99`).
  - ⑤ **퇴사 ≠ 삭제**: 퇴사 시 `is_deleted` 미설정(status만 `RESIGNED`), 마이그 0310로 잘못 소프트삭제된 신은주 복구(목록 '퇴사' 필터로 조회 가능). 명시적 삭제는 DELETE 핸들러 전용 (`bdf132d8`).
  - ⑥ **입고검수 전량취소 #373 PO 롤백** + 합격분만 재고 역분개(`4adc9b11`, 함께 배포). 큐 03(issue-373) 완료.
  - 마이그 0309·0310 prod 적용(`execute --remote -y`). 교훈→[[multi-entity-progress]]·[[bug-history]].

- **🏁 [2026-06-12] 대형파일 분할 — 전체 완료 (라우트 5대 + cards.js)**: 이번 대화에서 5개 대형파일 전부 해체·prod 배포·E2E 통과. orders/core(2661→597) · taxInvoices(2195→30배럴) · ledger/AR(2228→28배럴) · purchaseOrders/core(2194→771) · **cards.js(2642→cards/ 5청크 ≤696)**. 총 19 분할커밋 + 큐러너BOM + merge 3회. 2차 후속(shell.js·ledger.js·bank.js·rip.js)은 우선순위 낮아 보류. spec=`docs/superpowers/specs/2026-06-11-large-file-split-plan.md`(완료 표기).

- **✅ [2026-06-12] cards.js 대형파일 분할 (1커밋 `5d476b07`, prod 배포·E2E 통과)**: `src/scripts/cards.js` **2642줄 → src/scripts/cards/ 5청크**(core 696·actions 453·rip 453·detail 668·misc 372). **클라 JS = 라우트와 다름**: pages/cards.ts에서 5개 `?raw` import → **원순서 join('\n')**(shell.js 선례). IIFE 없는 단일 전역스코프라 **연속 슬라이스+원순서 결합 = 원본과 내용 동일**(동작 보존). **★검증=byte-identity**(cat 5청크 == 원본, CRLF→LF만 차이) + node --check 5/5 + build(391모듈) + check:dom(cards 신규0) + smoke 103/103 + Playwright /cards(16/16 전역함수·loadKanban 정상 빈상태·콘솔에러0). BOM=core.js 보존, 초기화/DnD=misc(마지막). 배포 커밋 `74c5aa2a`(merge `b0c6a8ee`), Deploy+E2E Playwright success.

- **🟢 [2026-06-12] 큐러너 크레딧부족 stall — 정리 완료**: `.\run-queue.ps1`이 작업 02~05를 처리하려 했으나 headless `claude -p`가 **"Credit balance is too low"(API 크레딧 부족)로 전부 실패**. 01-alimtalk만 done/, 02·03 running/ 고아, stale 락 잔존. **정리**: stale 락 제거 + running/(02·03) → pending/ 복귀(작업오류 아닌 외부원인). **▶ 크레딧 충전 후 `.\run-queue.ps1` 재실행 시 02~05 순차 재처리**. (큐 02=doc-sync, 03=issue-373 PO롤백, 04=issue-372 CSV, 05=issue-374~379)

- **✅ [2026-06-12] purchaseOrders/core.ts 대형파일 분할 (4커밋)**: `src/routes/purchaseOrders/core.ts` **2194→771줄**. **헬퍼 0**(순수 라우트 그룹핑). po-queries.ts(295=stats·csv·:id/invoice·my-lines) / po-receipts.ts(463=입고이력·:id/inspections·receiving-queue) / po-receive.ts(409=POST /:id/receive 입고처리) / po-special.ts(329=copy·reorder·quick) / core.ts(771=CRUD 목록·:id·생성·수정·status·삭제). 배럴(purchaseOrders.ts) **구체경로 서브라우터→core(/:id 마지막)** 마운트. **★순서**: GET `/:id`가 specific GET들(stats·receipts·my-lines) 뒤 등록 → core 앞 마운트로 **비섀도잉**(stats·receipts 200 라이브검증). 경로 같은 depth 무변경. self-auth+무토큰401. **커밋**: `f428617f`·`4611edf9`·`9eb833fc`·`6c89232a`. 검증 커밋마다 verify(387모듈)+smoke 103/103+도달성. **▶ ~~잔여=cards.js~~ ✅ 완료(위 cards.js 항목) — 대형파일 분할 전체 종료**.

- **✅ [2026-06-12] ledger/accounts-receivable.ts 대형파일 분할 (5커밋, prod 배포완료)**: `src/routes/ledger/accounts-receivable.ts` **2228→28줄(순수 sub-barrel)**. ar-helpers.ts(189=deriveClientBalance·buildIntegrityQuery·getAgingCategory+16 Row타입) / ar-payments.ts(389=payment·adjustment CRUD) / ar-receivables.ts(512=overdue·receivables·check-overdue·integrity·recalculate·collection-period) / ar-dunning.ts(449=collection-logs·send-email) / ar-ledger.ts(762=client·csv·settlement·monthly/closing/profit-summary). **ledger.ts(배럴) 무변경**(arRouter+apRouter 마운트 유지), accounts-receivable.ts가 sub-aggregator. **경로 무변경**(서브파일 ledger/ 동일 depth). **★순서함정**: `/collection-logs/:clientId`↔`/:id` 동일패턴쌍 → ar-dunning 원순서 보존(GET /collection-logs/1→200 검증). **커밋**: `55f55e16`·`3461f4f2`·`cbcec138`·`03ed71b6`·`e6e3d1da`. **검증**: 커밋마다 verify(tsc+build 383모듈)+smoke 103/103+도달성 5그룹 200+**무토큰 401**(self-auth). 교훈=추출파일 심볼 grep 사전검증(PaymentRow 1회 보정). **차순=~~purchaseOrders/core~~✅→cards.js(2642)**.

- **✅ [2026-06-11] taxInvoices.ts 대형파일 분할 (5커밋, prod 배포완료)**: `src/routes/taxInvoices.ts` **2195→30줄(순수 배럴)**. helpers.ts(460=getTaxProvider·번호·설정·issueTaxInvoice·createSplitInvoices+6타입) / queries.ts(458=GET 7) / issue.ts(744=direct·생성·issue·modify·cancel) / batch.ts(271=batch-create·monthly-create) / manage.ts(334=PATCH·DELETE·refresh-status·retry·send-email). **신규=flat파일→디렉토리+배럴 변환**(orders.ts 패턴), 각 서브라우터 **self-auth(.use)** + getTaxProvider re-export(portal.ts #344 무변경). **안전성**: GET 상세 `/:id{[0-9]+}` 숫자제약 + 전 라우트 method+path 명확구분 → **마운트순서 무관**. 바로빌 SOAP=services/(taxProvider·barobillTax)라 무영향. **커밋**: `1f2afb17`·`2137b9e7`·`93c61ac7`·`38a62578`·`bc0915ef`. **검증**: 커밋마다 verify(tsc+build 378모듈)+smoke 103/103+라이브 도달성(queries 200·issue/batch 400·manage 404)+**무토큰 401**(self-auth 정상). **차순=~~ledger/AR~~✅→purchaseOrders/core(2194)→cards.js(2642)**.

- **✅ [2026-06-11] orders/core.ts 대형파일 분할 (4커밋, prod 배포완료)**: `src/routes/orders/core.ts` **2661→597줄**. helpers.ts(367 공유헬퍼=카드그룹·담당법인추천·청구그룹재계산·청구상태·카드생성) / lifecycle.ts(606=bill·billing-status·output-folder·status·cancel·restore·sync-statuses) / create.ts(739=POST /) / update.ts(430=PUT /:id) / core.ts(597=GET 목록·상세·timeline·invoice·in-transit + DELETE). 배럴(orders.ts) 마운트 순서 queries→operations→lifecycle→create→update→core(전부 `/:id/<sub>`·메서드 분리라 `/:id` 충돌 없음). **이동만·로직 수정 0**. 패턴=awk 라인슬라이스+sed `ordersCoreRouter`→그룹명 리네임(전사오류 0). approvals.ts 동적 import→`./orders/helpers`. **커밋**: `518f9c3d`(helpers)·`036e266e`(lifecycle)·`4dc6be77`(create)·`e180a23f`(update). **검증**: 커밋마다 `npm run verify`(tsc+build 373모듈) PASS + smoke 103/103 + 라이브 도달성 6라우터 그룹(POST `/`→400검증·PUT `/:id`→json404핸들러·PATCH output-folder→200·POST sync-statuses→200·PATCH bill→404·GET `/:id`→404, 전부 라우팅404 아닌 핸들러응답). **✅ push+CI배포 완료**(merge `1f8e47db`, origin workbench fix 충돌0, Deploy+E2E Playwright success). 차순 taxInvoices도 완료(위 항목).

- **✅ [2026-06-11] Claude 작업 큐 러너 — BOM 수정·커밋 (`54648ac4`)**: Cowork 산출 `run-queue.ps1`이 UTF-8(BOM없음)→PowerShell 5.1 CP949 오독→한글 파서에러. UTF-8 BOM 추가로 해결, `-DryRun`+전체 AST 파싱 통과(spec 잔여 해소). 큐러너 인프라(queue/·docs정리)와 함께 커밋. **사용 가능 상태**.

- **✅ [2026-06-11 PM 멀티세션] #377·#378·알림톡P2·#380·카드예측·⑱·세션3재설계 — 전부 prod 배포·검증·push 완료**:
  - **#377**(`eadba44f`): autoProcess `items.name→item_name` 미존재컬럼 버그(/start·/approve 500) + `ia_auto_enabled` 게이트(마이그 `0308` prod적용, 기본 OFF). `/pending` OFF시 빈목록+gated. prod 게이트 실검증.
  - **#378+알림톡 P2**(`9be309d5`·`1de61d1d`): 일괄발송 건별 `results[]`(interpretBulkResult/Receipt 확장)→status(SUCCESS/PARTIAL/FAILED)·sent_count(실성공)·failures[], 프론트 결과모달+실패건 재발송. 출고 자동발송=`/send-shipment`가 delivery_method→승인템플릿명 해석(한진/미매핑 skip+로그)+멱등가드+본문 listATSTemplate 변수치환. **test_mode 유지=실발송 0**. **▶ go-live(`barobill_test_mode=0`) 대기**(⚖️ⓔ: 한진 외 출고1건→실착신→24h 모니터링).
  - **#380**(`6b065127`): 납기준수율 KPI 재정의 — `updated_at`프록시→`COALESCE(shipments→cards.shipped_at→updated_at폴백)`·분모 `SHIPPED+COMPLETED`·월귀속 `delivery_date`. ⚠️**실납기 데이터 희소**(SHIPPED/COMPLETED 중 실납기 6건, 2099 sentinel 72·NULL 다수)→delivery_date 위생 후속 권장.
  - **카드예측**(`f449797f`): cashflowEngine ⑤ `CARD_EXPECTED` — cutoff/payment_day cycle 합산→payment_day OUT, 미마감 cycle=실적+AVG_3M(90일 일평균) 혼합, 일시불(D1, installments 2차). 이중계산가드=cash_schedule `source_type='CARD'` 월 skip. prod검증=하나카드 5월 302,750→6/15결제, monthly OUT 반영. 마이그 불요(payment_day prod 존재). **stale 주석 정정**(line 9: 카드 범위외→구현됨).
  - **⑱**(`2856f750`): entity-verify.mjs는 시드(`INSERT INTO entities` 없음)·하드코딩 BASE/admin 의존이라 verify.yml 직접추가 **불가** → **정적 entity-filter 감사** `scripts/entity-audit.mjs`(`npm run audit:entity`) verify.yml PR게이트로 채택(결정 C). 현코드 42/42 통과, 예외=ef.clause/`${where}`합성/단건PK/allowlist(bank import 중복체크).
  - **세션3**(`622354d0`): 정적에셋 **근본원인 경험적 확정** — `/static` 워커제외(`_routes.json` exclude)는 hono vite 플러그인 네이티브=`exclude:[]`, build-assets가 vite build 전 써둔 파일을 플러그인이 **우연히 보존**할 때만 생존(CF 자동빌드서 소실→MIME 장애). 강건 재설계 `docs/superpowers/specs/2026-06-11-static-assets-rootcause-redesign.md`(옵션A=env.ASSETS+명시Content-Type·`_routes.json` 비의존, P1~P5 해제조건). ⚖️ⓘ 승인됨, 구현 보류(우선순위 낮음).
  - 배포: manual(`89bb8e79` 1차 #377/#378/P2 + 마이그0308, `2a13ab2b` 2차 #380/카드) + git push 자동빌드 동반. **prod smoke 103/103**.
  - **▶ ~~다음 세션 = orders/core 분할~~ ✅ 완료(2026-06-11, 위 항목 참조)** — 2661→597줄 5파일. 차순=taxInvoices. (커밋 분리: docs `679b07c2`·workbench `b0df71c4` — workbench 0307 미적용=비노출 유지.)

- **🔴→✅ [구조 P0 폐기] 정적 에셋 전환 파일럿 — shell.js — 롤백 완료(2026-06-11)**: `/static/shell.<hash>.js` 외부화(커밋 `9dd09cde`)가 **CF Pages git push 자동빌드 환경에서 `_routes.json` `/static/*` 제외 미적용** → 워커가 Content-Type 없이 서빙 → MIME 실행거부 → shell.js 미실행 → **전 페이지 401·무한로딩·법인 미표시**로 **prod 2회 다운**. _headers Content-Type 수동수정(144addfc)도 다음 push 자동빌드가 덮어써 재발. **최종해결 = `layout.ts` `?raw` 워커 인라인 복귀**(커밋 `24bb493c`, dep `88412dc1`=자동빌드도 정상 확인). 인라인은 `/static`·`_routes.json`·`_headers`·빌드순서 의존 전무 → 자동/수동 배포 모두 무조건 동작. 워커 +75KB 수용. **검증**: tsc·build OK, dist worker `switchEntity` 인라인·`/static/shell` 참조 0, Playwright dashboard 0 console err·entityName=동산기획·axios auth=set·static script태그 0·데이터 렌더. `build-assets.mjs`/`asset-manifest.ts`/_routes.json/_headers는 미참조 dead(무해, 추후 정리 가능). 교훈→[[feedback-static-asset-mime]]. **★정적에셋 외부화 재시도 금지**(또는 자동빌드 _routes.json 적용 선검증 필수). **★git push=CF 자동빌드 트리거**(수동배포 덮어씀)→소스가 자동빌드 환경서 동작 보장돼야.

- **🟢 세션5 N+1 감사→제거 + 청구 NULL버그 (2026-06-10) — 커밋(`bb7bec6f`·`be4bb3af`)·prod 배포 완료(shell.js 파일럿 배포 `3d0533f9`에 동반)·push 완료. ▶ 일괄청구·매입확정 write경로 prod 실사용 모니터링 권장**: **[B] N+1 8파일 25사이트** 루프내 `await c.env.DB` → `db.batch()`/`IN(...)` 1쿼리화: templates(2)·quotations(4, parent batch+last_row_id 인덱스매핑)·purchaseRequests(2)·taxInvoices(5, +cancel)·purchaseInvoices(2, poi·base_price IN선조회)·rip(3, send-bulk 3종 IN선조회)·orders/queries(2, bulk-bill IN+batch / bulk-ship dead쿼리제거+orderInfo선조회)·orders/core(5, thumbnail·auto_process_jobs·PUT items 2pass·card_ids IN·auto-ship/bill). **위험보존**: 청크80=짝수라 주문쌍 분할없음(원자성)·prefetch맵 in-loop갱신으로 동일품목 다중라인 SELECT-after-UPDATE 체인 정확보존(purchaseInvoices base_price·rip dedup·bulk-bill 중복). **제외(본질적 순차)**: weeklyPurchase:241·purchaseRequests:804(`getNextEntitySeqNumber`)·tax batch-create/monthly outer(invoice번호+외부 issueTaxInvoice)·orders/core:1366(notifyRoles). **[D] 상태코드**: 수정 0건(검증가드 이미 400/404/409/403, 500은 전부 catch). 검증: 라우트별 `npm run verify` 전부 OK·smoke 103/103. **verify-changes E2E**: 매입확정(confirm) 부수효과 7종(poi CONFIRMED·PO총액·인보이스·인보이스품목·매입처단가·base_price 0→7777·단가이력) 전부 정확·console 0err. **🔴 일괄청구 검증 중 선재 이중청구 버그 발견·수정**: orders UPDATE 가드 `billing_status != 'BILLED'`가 NULL(청구 전 정상상태) 미매칭(SQLite `NULL!=x`=NULL) → 상태 미반영 + balance 가드부재로 매 호출 증액(2회→이중청구). `!= 'BILLED'` → **`IS NOT 'BILLED'`**(orders/queries bulk-bill + taxInvoices:297 발행경로). 재검증 멱등(3회→1/0/0, balance 1회만). N+1 리팩토링이 동작 보존한 덕에 검증서 노출. 상세→`session-context`, `bug-history`. **▶ 다음: 커밋·배포(deploy-verify)**

- **바로빌 멀티계정 — 계좌·카드 법인별화**: **prod 배포 완료(0be34406)**. 글로벌 corpNum 하드코딩 4곳 법인별화(`barobill.ts`·`cardExpenses.ts`·`bank.ts×2` → `getEntityCorpNum`), CERTKEY 전역 유지, 각 법인 자체 corpNum(청주 회원사 등록 완료). 마이그 없음·HTTP 스모크 통과. **▶ 실사용 검증=선명/청주 회원사·서비스·계좌/카드/발신번호 바로빌 등록 후**(용준님). 상세 → `docs/superpowers/specs/2026-06-03-receivables-purchase-barobill-brainstorm.md`

- **미수금 회수예측 (4-3 확장)**: **4-3a 시점 + 4-3b 회수율 둘 다 prod 배포 완료**. 4-3a(9d40b745) 거래처별 결제주기(NET/MONTHLY, 마이그 `0288`) → cashSchedule·cashflowEngine 입금예정 날짜 현실화. 4-3b(6a613633) IFRS9 provision matrix(마이그 `0289` `ar_provision_rates`·`ar_grade_multipliers`) → `/bank` 미수금 탭 예상회수액 KPI. **▶ 용준님 실사용 테스트**. 후속: 4-3a-2 median lag, 충당률 편집 UI, 4-3c 조기경보. 설계 → `docs/superpowers/specs/2026-06-03-receivables-purchase-barobill-brainstorm.md`

- **매입 관리 — 입고·매입확정 분리**: **P1~P3 전체 prod 배포 완료**. P1(6c72eb4b) 발주 단가미정(`price_status`)·입고 거래명세서 첨부(`statement_file_key`,R2,마이그 `0287`). P2(9949a74c) 매입확정 페이지 `/purchase-invoices`. P3(d2f76f4c) 매입확정 시 `cash_schedule` OUT(지급예정) UPSERT. **▶ 용준님 실사용 테스트 대기**. 잔여: 그룹연쇄(price_linked)·부분확정 후순위.

- **자금 예측/계획 일원화**: **Phase 1~4 + 4-3 미수금↔입금예정 + prod 배포·검증 완료**(5탭 허브·하이브리드 엔진·시작잔액 prefill·은행매칭→DONE). **✅ 4-3(커밋 `607b3e4`)**: cashflowEngine ④에 BILLED-미물질화 주문을 ORDER_EXPECTED로 합성(거래처 balance cap·이중계산 방지) + `/bank` 미수금 탭 '예상 입금일'. **▶ 백로그: 카드 예측**(corporate_cards에 cutoff_day/payment_day 추가 후)·월별요약 KPI수입 일관성·apply→DONE 운영검증. 설계 → `memory/project-cashflow-unification.md`

---

### 2026-06-05 (상태모델 단일화 + 정기변동비 + 후가공 + 자금 4-3)
- [상태모델 단일화] 카드/주문 이중 상태모델(PRINT_PENDING vs PRINTING+rip_status) 충돌 4 Phase 해소: 보드 status기준·PRINTING=LogWatcher 단일화·유통 즉시 SHIPPED·마이그 0298. 상태 라벨 단일소스화(`statusLabels.ts`→`window.MES_STATUS`, 16스크립트). 커밋 210585e·b9b03ea, spec `2026-06-05-status-model-unification.md`
- [정기변동비 Phase1~3] fixed_expenses ESTIMATED 확장(마이그 0299)+`expenseEstimator.ts`(AVG_3M/SAME_MONTH_LAST_YEAR)+cashflowEngine 분기. 커밋 8a786c4. Phase4(정산)·5(UI) 대기
- [후가공 연결 복구] `printSystem.ts` items-for-order에 `LEFT JOIN pp_applicable_subcategories`. 커밋 55e097e. 소재별 소분류 매핑(운영) 남음
- [자금 4-3] BILLED-미물질화 주문을 ORDER_EXPECTED 합성(거래처 balance cap·이중계산 방지)+미수금 예상입금일. 커밋 607b3e4
- [바로빌 멀티계정] corpNum 법인별화(`getEntityCorpNum` 4곳), CERTKEY 전역. dep 0be34406. 실사용 검증 대기
- [미수금 회수예측] 4-3a 결제주기(마이그 0288)+4-3b IFRS9 provision matrix(마이그 0289, `provisionMatrix.ts`). 커밋 9d40b745·6a613633

### 2026-06-04 (주문접수 멀티법인 협업 MVP + 채번/재고 버그)
- [멀티법인 협업] 방향전환: 강제분리 폐기→유연한 그릇(`order_items.assigned_entity_id` 품목별 담당). P1 담당태그+추천(마이그 0292)→P2 카드 담당법인별 생성·알림→재고차감 담당법인 우선(마이그 0293)→유통/견적 담당 셀렉트(마이그 0294)→코디네이터 교차가시성(마이그 0295). spec `2026-06-04-order-intake-entity-split.md`
- [버그] orders POST 채번 billingEntityId 불일치 수정(커밋 e487a45), 채번 E{eid} 통일(PR/클레임/반품), inventory_transactions 부분 UNIQUE에 entity_id 추가

### 2026-06-03 (자금 일원화 Phase1~4 + 매입관리 + 규격 + 한진/카카오)
- [자금 일원화] 캐시플로 탭→`/cash-schedule` 흡수(5탭 허브), `cashflowEngine.ts` 하이브리드 엔진(물질화+온더플라이), monthly/forecast, 시작잔액 prefill, 은행매칭→DONE
- [매입관리] 입고·매입확정 분리 P1~P3: 단가미정 발주·거래명세서 첨부(마이그 0287)·`/purchase-invoices`·지급예정 UPSERT
- [규격] `order_items.specification`(폭) 전면(마이그 0291)+주문 일괄 상태변경
- [한진/카카오] 한진 export(엑셀 일괄), 알림톡 템플릿 6종, 거래처 배송방식 7종(마이그 0290)

### 2026-06-02 (상태CHECK 버그 + GitHub 이슈 11건 + 견적 개편)
- [버그] cards.status CHECK에 PRINT_PENDING 누락→PRODUCTION 주문 500(마이그 0284), card_number 충돌 수정
- [이슈] #323~333 전수 수정·close(보안격리·cascade·채번·홈택스 dedup 마이그 0282/0283)
- [기성품/유통 즉시출고] `items.production_required`(마이그 0285·0286), 카드 미생성·즉시 SHIPPED·출고 재고차감
- [견적] 관리 개편(표·품목·전환 prefill)+생산주문서 유통품목 행 단순화+채번 경계 버그 근본수정(E{eid} 내장)

### 2026-06-01 (거래처원장 + GitHub 이슈 29건)
- [원장] 전기이월·기간컨트롤·실계산 미수, 표헤더 정렬 전역 수정(layout.ts `.ds-table thead th`)
- [이슈] 29건 전수 종료(런타임500·멀티법인격리·UNIQUE·보안, 마이그 0278~0281)

### 2026-05-29~31 (근태 개편 + 법인카드)
- [근태] 레이아웃 전면 개편(11→5 집계열·31일 고정)+유형별 지각/조퇴 스마트 처리(기준시간 맵)
- [법인카드] 마감일 cutoff_day(마이그 0273)+캐시플로 결제예정 배지, 영수증 바로 첨부(R2)

### 2026-05-28 (단가 관리 시스템)
- 매입/매출 2탭, item_group 통합(price_groups 폐기), 입고 자동갱신 연쇄(마이그 0267·0268)

### 2026-05-27 (법인 분리 전체 감사)
- 174테이블 전수 감사(`docs/entity-separation-map.md`), Issues #217~234 Phase1~3 18건 close(마이그 0264~0266)

---

### 2026-04-29 (CAPS on-prem 완료 처리)
- [CAPS] 경리 PC에서 CAPS DB 연동 완료, 자동 시작 + 수동 트리거 모두 작동 확인
- 동기화 하루 3회 (09:00/13:00/19:00) + 근태 페이지 수동 버튼, VBS 래퍼 백그라운드 실행

### 2026-04-25 (재고차감 구조 설계 + 품목 체계 리뷰)
- [설계] 재고차감 통합 설계서 작성: ROLL(yd, 0.1올림) + SHEET(㎡, 면적 기반) 2트랙
- [설계] 품목 체계 전체 리뷰: 코드 범위 현행 유지, category_id TEXT 통일, GOODS 자동설정
- [설계] product_materials 자동 생성 (소재 일괄 등록 시 parent_media_id 매칭)
- [설계] 역할별 기본 품목 필터 (계정 관리 페이지, is_sales/is_purchase 대체)
- [문서] `docs/superpowers/specs/2026-04-25-inventory-deduction-redesign.md` 신규

### 2026-04-24~25 (품목 체계 개편)
- [DB] migration 0154~0158: print_methods/media 테이블, items/order_items 확장, price_change_history
- [API] printSystem.ts 신규: 출력방식/소재/연결 CRUD 12개 엔드포인트
- [UI] items.ts/js: 6탭, 소재 일괄 추가, 단가 이력 모달
- smoke: 60/60 PASS

### 2026-04-23 (이카운트 → MES 거래처 이관)
- [이관] 이카운트 ERP 거래처 2,660건 MES 임포트 완료
- [DB] 마이그레이션 0153, [도구] 변환/검증/보정 스크립트 3개

### 2026-04-22 (코드 리뷰 + 정리 + 멀티사업자 + 리팩토링)
- escapeHtml/금액 포맷 전역 통합, 멀티사업자 인감도장, 고아 정리

### 2026-04-20~21 (메시징 + CAPS + 카드 + PrintExp)
- SMS/카카오톡/이메일 발송 성공, CAPS 동기화, PrintExp 파서

### 2026-04-17 (통합 메시지 + 포털 + UI + 보안 + 검증)
- 4채널 메시지 시스템, 포털 고도화, 보안 감사, smoke 55/55 PASS
- CLAUDE.md 575→121줄 감축

### 2026-04-15 (검수 UI + 타입체크 + 라우트 분할)
- 검수 UI 전체 구현, tsc 타입체크 게이트 구축
- payroll/purchaseOrders/ledger/orders 라우트 분할
- 마이그레이션 0131까지 적용

### 2026-04-10 (심층 검증)
- Track 1 Phase 2 디자인 일관성, 보안 감사, alert→showToast 325건
- Phase B3/B4/B5 완료

### 2026-04-08 (급여/인사 확장 + 개발 환경)
- B1 추가근무/요율, B2 급여명세서, B4 연말정산
- smoke.cjs 신규, templates/ 신규

### 2026-04-05
- 카카오 알림톡 연동, 빌드 에러 수정

### 2026-04-04
- UI/UX 개선 v2 (13항목)

### 2026-03-31
- 주문 무결성 감사, security-audit 스킬

### 2026-03-30
- IA 자동화: ExtractGroups v5, ProcessOrderItem v2, OpenCV, TestRunner

### 2026-03-28
- 설정 페이지 통합

### 2026-03-27
- 문서 정리

### 2026-03-25
- Items 원단폭, 재고실사, 원가 분석

### 2026-03-24
- IA 학습 파이프라인 (이후 폐기)

---

### 2026-06-09~10 완료 세션 (2026-06-10 컨텍스트 최적화로 PROJECT_STATUS에서 이관)

- **🟢 세션4 UI 일관성 감사→수정 (2026-06-10) — prod 배포·push 완료**: ①**P1 오프팔레트→시맨틱5색**(30파일 UI크롬): purple/indigo/cyan/teal/emerald→blue/green/amber/red/gray. 버튼·탭·포커스링·토글·상태패널·헤딩→blue, 이력헤딩→gray, emerald 확정·성공버튼→green(유지), KPI숫자→기본색(#212529), "대기"pill→gray. **KEEP(준차트 예외=색이 분류정보)**: 승인/근태/품목/미디어(롤=cyan)/인보이스/결제수단/정비/법인/스캔 뱃지 + 채널색(email=purple) + 차트 series. **제외**: 차트페이지(reports·productionReports·dashboard·cashFlow·forecast 등). ②**P2 이모지→FontAwesome**(12파일): messages 채널/대상버튼·cardDetail ☑☐·settings ✅❌⏳·iaBatchTest·forecast🔥·dashboard/iaScan⚠·production✔·portalBalance🔗 등. **유지**: alert/toast 텍스트 ⚠️(심각도=type 전달)·uiGuide 금지예시 인용·추세글리프▲▼●. ③**P3 hex→Tailwind 매핑표**=`.claude/references/hex-to-tailwind-map.md`(일괄치환 보류, 신규/수정 코드부터). ④**P4** bank CTA bg-blue-600·fa-search 버튼 라벨 "검색" 통일(4곳). 커밋 `b2becedc`·`58761bb3`(⏳ 보완)→merge·push `274793fe`, dep `d211d46a`. 검증: build·tsc·smoke 103/103, prod 14/14페이지·이모지0·회귀0. **교훈: 이모지 grep에 U+2300-23FF(시계/모래시계) 포함**(첫 스캔 누락→settings ⏳ 배포후 발견). 상세→`session-context`.
- **🟢 세션3 알림톡 실발송·UI·성능 (2026-06-10) — prod 배포·검증 완료**: ①**카카오 알림톡 실발송 성공**(커밋 `9bf1cb2e`): 3 root-cause 버그를 바로빌 공식 오류코드로 확정(dev.barobill.co.kr SPA를 Playwright로 렌더해 읽음). SenderID 빈값→**-24005**(사업자·아이디 불일치)=연동아이디 `DONGSAN` 채움 / SmsReply='Y' 무효→**-31325**(대체문자 유형오류)=유효값 E/A/N(기본 N, `smsReplyOf`) / 성공판정=알림톡 접수번호는 비숫자 SendKey라 음수만 실패로 수정(`interpretReceipt`). **SendKey `BB_3148184311_AT_3901210_260609` 수신·실착신 확인(용준님)**. 부수: listATSTemplate(ChannelId 필수·필드명) 4템플릿 정상, 대량발송 ArrayOfString 해석, 중복호출 제거, 로그 음수 SUCCESS 오기록 3건 정정. ②**주문관리 테이블 잘림**(`67a5248d`): 상태 아이콘 제거('...')+납기일 ord-due overflow(지연 뱃지). ③**카드 로딩**(마이그 `0304` prod 적용): 복합 인덱스+date sargable, API 45–72ms. ④**출고 수동발송 정합**(`0a329a02`): autoCodeMap 실제 템플릿명. 상세→`session-context`, 메모리 `project-alimtalk-status`.
- **🟢 세션2 코드품질·멀티테넌시·배송버그 (2026-06-09) — prod 배포·검증 완료**: ①**저장소 위생**: PII 8건 git filter-repo 제거+force-push(협업자 re-clone 필수), layout.ts 3259→228 분할, getElementById lint(`npm run check:dom`)·hooks(settings.json)/docs(archive)/seed(seed/) 정리. ②**equipment/cards 멀티테넌시 격리**(#342 0302): facility·equipmentQueue·cards/queries·dashboard·aiInsights에 entityFilter('e')/cardEntityFilter('c'=requesting_entity_id) 배선(커밋 `5c1e11f0`·`d40dc096`·`3796ef84`). zero-filter(caps/hrSelf/payroll-shared)=정상 스코핑. ③**리포트 6스크립트 getElementById 가드**(`aea1de3e`). ④**마이그 추적 동기화**: 로컬 0299~0302·prod 0282~0303 마커검증→기록(양쪽 미적용 0). ⑤**회계/리포트 smoke+11·e2e+6**(`dea5fc31`, smoke 103/103). ⑥**delivery_method 'SAME' 버그**(`c4042d35`): 생성/임포트 INSERT가 필드 누락→DEFAULT 'SAME' 저장. INSERT 명시화(`|| '방문수령'`)+클라 폴백 한글화+마이그`0303`(prod 227→0). DEFAULT 변경은 FK CASCADE 위험으로 미수행. **prod 실검증: e2e_tester 미전송 생성→'방문수령'**. 상세→`session-context`.
- **🟢 GitHub 이슈 8건 배치 처리 (2026-06-09) — prod 배포·전건 closed**: #369(입고취소 멱등 가드+balance_after 메모리산출 단일 batch 원자화)·#342(설비 entity_id 격리(나)+마이그 `0302`+rip.ts 전경로 배선)·#370(독촉 이력 테이블 배선+zoneSummary+레거시/dead code 정리)·#340(crud-order E2E DELETE 2회로 잔여0)·#350(sync-attendance GROUP BY·PO IN절·priority3 batch)·#341(p1 recentPO window prefetch, p2/p3는 부분성공 유지로 미전환)·#336(CI 폴백 기제거+위험수용)·#366(표시층 `formatKST`+백엔드 `utils/kstDate.ts`, **대시보드 '오늘'KPI created_at UTC비교 9h누락버그 prod실측·수정** old2→new12). 배포 e159f95e·b7be5241·01b7b7ae·2639f76e. **신규 date 코드는 kstDate/formatKST 사용**(`reference-kst-helpers`). 상세→`session-context`.
- **🟢 카드/주문 상태모델 단일화 (#1·2·3·4) — prod 배포·검증 완료**: 이중 상태모델(PRINT_PENDING vs PRINTING+rip_status) 충돌이 공통원인. 4 Phase 배포(P1 보드버킷 status기준→#2 / P2 PRINTING=LogWatcher단일화→#3 / P3 유통 즉시SHIPPED→#1 / P4 레거시 마이그0298). **prod 검증: 보드 출력대기에 PRINT_PENDING 카드 노출**, #1 유통 bulk-ship→즉시 SHIPPED, #3 baseline 주문 CONFIRMED 정상. **✅ 실사용 UI 확인 완료(2026-06-05, prod Playwright)**. **✅ 상태 라벨 단일소스화 완료(커밋 `b9b03ea`)**: `src/utils/statusLabels.ts`→`window.MES_STATUS`(layout+portalLayout 주입)→16스크립트 전역참조. **✅ origin/main 동기화 완료**(현 `e598392`). 설계 → `docs/superpowers/specs/2026-06-05-status-model-unification.md`, 메모리 `session-context`.

#### GitHub 이슈 백로그 완료분
- **✅ 처리완료·배포·close(2026-06-05)**: #355·356·335·351·352·357·349 + **#343·#345·#353·#354·#346**(커밋 `0c04fad`) + **#344**(커밋 `0ce9c42`) — dead-filter(생산보드/원가/메시지/활동로그/매입)·CSV(cashSchedule·검수)·검수 공급업체 드롭다운·연차 부서필터·휴가 날짜·불량률→검수 드릴다운·**미사용수당 정합버그 수정** + **포털 셀프서비스**(세금계산서 다운로드/연도필터/페이지네이션·미수금 aging·재주문 모달). prod 배포(`webapp-9i0.pages.dev`), 사내 9페이지 스모크 통과·포털 신규 라우트 401 확인. **▶ 포털 실동작은 포털 계정 실사용 검증 권장**
- **N+1 검증세션(2026-06-06)**: **#341 cashFlow projection 집계(72→6쿼리)·#350 payroll hoist+exists/empRow prefetch 검증·배포 완료**(커밋 `1737ebc`·`fa4d196`, dep `fdf92b4c`). 검증법=cashFlow는 프로덕션 baseline 비교(months 1/3/6/12 완전일치), payroll은 로컬 48명 더미월 실행→DELETE 롤백→재실행 비교(48행 완전일치). **잔여=write batch**(purchaseRequests PR→PO·import루프·sync-attendance·PO품목·child INSERT): baseline 비교 구조적 불가(실행=상태변경) → 스테이징/실데이터 스냅샷 준비 후 별도 세션. **로컬 D1에 cashFlow/orders/payments 데이터 0건**이라 read 검증은 프로덕션 의존
- **✅ 이슈 일괄 처리·배포·코멘트(2026-06-08, 2026-06-09 close 완료)**: 11건. **IDOR 보안**(#349/#356 entityFilter 패턴): #358(approvals 10핸들러)·#360(quotations GET/PUT/DELETE/:id+convert·cardExpenses cards)·#361(autoProcess 4, /pending 동일필터라 폴링안전)·#365(files.ts GET→requireRole ADMIN)·#368(storage-zones all_entities ADMIN/MANAGER 게이트+/:id 격리)+(정합)PO `/receipts` 목록 entityFilter. **개선**: #359(지출결의서 page/limit+COUNT 페이지네이션)·#362(dashboard·지출결의서 로드실패 스켈레톤 에러UI)·#363(발주요청·입고이력·자금계획 /export/csv, 전부 entityFilter)·#364(inventory_items DROP 마이그0301 **prod 적용완료**, 0행 확인). **#367** CSV formula injection 공용가드(escapeCsvField 단일화, bank.ts 포함 5개 escaper 위임, 숫자 보존). **#366** 업무일자 UTC→KST(+9h): ①회계일 저장(disposed_at·복사 order_date) ②비교필터 카테고리A 11곳(delivery/expected/연체/오늘납기). 커밋 `f9c7ee4`·`1a1247e`·`f216721`·`a6bd8cd`. 단일법인 동작무변(다법인 전환 시 격리 발화). 메모리 [feedback-deploy-push-divergence] 추가
- **✅ 발주(purchase_orders) IDOR 전수 수정·배포(#371, 2026-06-09)**: 목록(GET /)만 격리돼 있고 **export+/:id 9핸들러 미격리**였음 → GET /:id·/invoice·/inspections·PUT·PATCH status·DELETE·receive·copy(원본)·reorder(원본) 조회부 + /export/csv에 entityFilter 추가(커밋 `5c77a67`·`58b37a9`, dep `33065000`). 자식테이블(po_id)·최종 DELETE는 부모 격리로 게이트. prod 발주 0건이라 /:id positive 실측 불가(존재X→404·빌드로 갈음). 잔여=`templates/:id`·`stock-alerts/:id`(별도 테이블) 점검
- **✅ close 완료(2026-06-09)**: #358·359·360·361·362·363·364·365·367·368·371 (11건, 수정·배포·검증 후 owner close).

### 2026-06-10 Claude Code 설정 최적화 (Cowork 세션)
- .mcp.json 토큰 env 참조화 + illustrator/excel → `.claude/mcp-optional.json` 분리, 스킬 5개 frontmatter 추가(auto-scan·deploy-verify·entity-audit·migration-check·qa-audit), commit hook tsc incremental화, UserPromptSubmit/Stop hook 메시지 축약, PROJECT_STATUS 완료세션 아카이브 이관, 루트 노이즈 정리

## 2026-07-04 이관분 (완결·무후속 항목, 세션 정리 시 이동)

- **✅ [2026-06-29~30] 품목 마스터 배너류 등록 완료 (worktree `session/master-banner`)**:
  - **✅ 출력 배너 6종(9품목) 등록+자동차감+형옵션 prod 라이브** (마이그 **0398~0407**): 윈드/워킹=전사 폰지·매쉬(**0405 정정** — 니트 아님) / 실내·미니=수성·패트 / 자이언트=전사 폰지·매쉬(2제품) / 솔벤패트=솔벤·나투라(0406). 전부 AREA·is_active=1·매입X.
  - **✅ 원단 자동차감(폭매칭 ROLL)**: 9제품 전부 product_materials 링크(0404/0405/0406) — 폰지5·매쉬2·패트4·나투라2.
  - **✅ 형(S/F/H) = 범용 선택옵션 메커니즘**(0407 + finishing/calc/parent.js): pp_category 비하드코딩→일반 select 자동렌더·수집·복원. 윈드 S/F·워킹 S/F/H 게이팅. **향후 선택형 옵션은 마이그(데이터)만으로 추가=코드불요**(코팅·WAY 이은 3번째 패턴 일반화). prod API 검증(윈드 2·워킹 3 반환·자이언트 0). dep `fb45ea0f`.
  - 결정: 배너=출력 PRODUCT + 거치대=부속 GOODS 라인 / 형=주문옵션(범용) / 규격=AREA / 가로등=규격확대 / 실외·철제=물통SET GOODS.
  - **✅ 태극기배너(TRTB)·외국기배너(TRFB)** 등록 완료(0408, 전사·AREA·폰지·자동차감). 배너 출력물 8종 전부 등록.
  - **✅ 가로등 규격확대**(0409, 60×160 폰지/매쉬·변종4→6) + **✅ 부속품 GOODS 18종**(0410·0411, ACC-011~028, 상품·매입+판매·item_group='배너 부속품'). 철제배너=판매내역 기반 3 SKU(실외거치대/실외물통SET/실내거치대). 걸이부속(족자봉/삼각접착고리)=현수막 도메인 제외.
  - **배너 전체 완료** — 출력 8종+자동차감+형옵션·가로등확대·부속품18. **남은=단가(전역 보류, 별도 과제)만.**

- **✅ [2026-06-26→06-29] 현장 잉크 재고관리 + 단위 SSOT/multi-UOM — prod 라이브 (정본 `memory/design-ink-inventory.md`)**:
  - 잉크 **74품목** 등록(마이그 `0394` **prod 적용**·동산72/선명6·수성잉크테크 LcLm=선명 매출 2). `item_type=MATERIAL`·`unit=L`·`deduction_method=NONE`(수동, 차감X)·코드 `RM-I0001~0074`(자동채번 규칙, 의미코드 금지=채번 깨짐). **장비별 분리**(같은 KM테크라도 솔벤1800/3200 별도·UV평판≠3200).
  - **단위 SSOT 신설**(`constants/units.ts`, hr.ts 패턴)+폼 input→select. ⚠️yd(ROLL)·장(BOARD)=autoDeduct 리터럴, 변경금지.
  - **✅ [2026-06-29] multi-UOM 단위 드롭다운 = prod 라이브 (이전 "미배포 보류" 해소)**: 타 세션이 MU1~MU5(items.base_unit/pack_size/stock_mode SELECT)를 main 커밋 → cashflow 세션 superset 배포로 prod 반영(한때 0395 미적용 500 장애 → `0395 --remote` 복구). factory P3(0391/0392/0396)도 그간 prod 적용(smoke facility/zones 200) → **얽힘 무관**. prod `#itemUnit` 9단위 라이브 확인·**smoke101**.
    - **orphan `UNITS_JS`(window.UNIT_DEFS) 주입 = 폐기**: SSR `unitOptions` 방식 채택으로 클라 주입 소비처 0건(死코드). `wip/multi-uom-unit-ui` 브랜치 삭제(2026-06-29). 복구 필요 시 commit `19868226`(`git branch <name> 19868226`).

- **✅ [2026-06-24] 전 페이지 표 열폭 규격 일괄 정비 (에이전트 팀, 정본 `memory/project-table-spec-sweep.md`)**:
  - 전역 `col-*` 폭 유틸 신설(shared-styles.ts) + 12클러스터 fan-out으로 **~101개 표 정비**(ds-table 보장+콘텐츠 유형별 고정폭+가변 주열만 흡수+긴 td `title` 호버). 인쇄양식·편집그리드·동적matrix·밀집표 의도적 제외.
  - 검증: tsc/build green · **node --check 55/55**(?raw JS 문법) · **Playwright 시각검증 6페이지**(clients/reports/shipments/hr/inventory/purchase-orders: fixed·오버플로0·콘솔에러0·title동작, 측정스크립트 정밀). 
  - **유일 결함=col-date 104px 14px폰트 날짜 3px클립 → 112px 전역수정**. **prod 배포**(`3a64af56`+`8d3fc9da`, dep `01ce3db0`, 롤백 `47fbec9e`). bank 리뷰처럼 백로그 완결.

- **✅ [2026-06-24] Claude Code 셋업 정비 + bank 보안/버그 수정 (별도 세션 — 정본 `memory/project-ship-pipeline.md`)**:
  - **CC 셋업**: 죽은 jq훅→node 전환(`.claude/hooks/*.cjs` + SessionStart 자가진단) · `/ship` full-auto-prod 파이프라인(skill+ship:gate) · MCP(context7 + cloudflare-observability, 옛 cloudflare 제거) · 권한정리(통짜Bash 제거) · STATUS 다이어트 · **claude update 2.1.158→2.1.187**(agent teams 활성, **재시작 필요**) · env `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`. 훅 경로버그(.js 오탐) 수정.
  - **bank 버그(3에이전트 병렬리뷰)**: ✅**#1 IDOR**(card_fee_rates PUT/DELETE entity격리, #437/#434 클래스) · ✅#2 dead `/card-fee-calculate` 삭제 · ✅**#3 auto-match 파생잔액 복원**(폐기 clients.balance→deriveClientBalance; 가드=입금만·유일잔액만·suggest전용) · ✅#5 D1 IN 80청크 · ✅#8 KST 월경계. **전부 prod 배포·검증**(커밋 f29a266b·06c4b653·5f8793c2 → dep e9c1155d). ✅**#4 client-search 파생잔액 복원**(폐기 c.balance=0→order_billing_groups[BILLED]−payments−adjustments, /receivables 동일정의; FE 미수금 힌트 부활·FE 무변경) · ✅**#7 /transactions bt.\* → FE 소비 컬럼 명시SELECT**(리네임 시 silent null→SQL에러 노출). **prod 배포·검증**(커밋 4d2f3fdb → dep `5c1fa54c`; apex /transactions·/client-search 200, 파생잔액 /receivables와 일치=현재 미수금 0건). #6 변경불요. **bank 리뷰 백로그 완결.** + `/ship` 가드 정식 추가(배포 전 git status, SKILL.md).
  - ⚠️**교훈**: `deploy:prod`는 워킹트리 전체 빌드 → **배포 전 `git status`로 타세션 미커밋 확인 필수**(IDOR 배포 시 cardExpenses WIP 동반배포됨). agent teams=**v2.1.178+** 필요(2.1.158 미작동). observability wrangler config=**Pages 미지원**(347e438e 되돌림, 대시보드 토글 경로). bank 잔여 리뷰=`docs/archive/bank-review-2026-06-24.md`(완결·아카이브).

- **🟢 [2026-06-24] LogWatcher TPM-01 현장 배포(TopazRip)**: prod·`E:\TNSRip-X1\Print.log`·Legacy(TNS)·`TPM-01`. 추출 정상(사용자 확인). ⚠️검증=**`/equipment`·`/production`** (/rip 페이지 폐기·404). 함정=repo `install-service.bat`·`install.bat` **LF 줄바꿈**→cmd 명령 토막 → `publish\install-service.bat`만 CRLF+ASCII 수정, **소스 LF 정리 보류**(나중에). RIP-03 `/equipment` 비활성화(soft delete=status INACTIVE)→동일 PC RIP-02 전환 깨끗(부활X). 정본=`memory/project-logwatcher-rollout.md`.

