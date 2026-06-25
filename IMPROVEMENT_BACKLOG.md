# Improvement Backlog
<!-- last_run_area: 1 -->
<!-- last_run_at: 2026-06-26T02:00:00+09:00 -->

> 자율 점검·개선 에이전트(auto-improve)가 6개 영역을 순환하며 발견한 항목.
> 용준님이 주기적으로 리뷰하여 상태를 변경 (new → approved → done, 또는 rejected).

## 통계
| 상태 | 건수 |
|------|------|
| 🆕 new | 5 (**GitHub open auto-improve 실측 5건** — **#439** 스케줄 루틴 git push/backlog 트림 회복탄력성 improvement small [Area 1] + **#441** 폐기 clients.balance 캐시 stale read bug medium [Area 4] + **#442** 영수증 GET /receipt-image/* 클라이언트키 직접서빙 IDOR(#365 일반프록시 완화 회귀) bug small [Area 5] + **#443** 세금계산서 발행취소/삭제 시 payments.tax_invoice_id 미정리 → dangling 링크+입금 자동제안 영구제외 bug small [Area 4] + **#444** IA 워크벤치 렌더 콜백 PATCH 2종(sheets/:id/render·process/:id) entityFilter 없이 bare WHERE id=? → 동일파일 형제 전부 격리인데 콜백만 누락 cross-tenant write(#437 형제-비대칭) bug small [Area 5, 본 사이클 신규]) |
| ✅ approved | 0 |
| 👀 reviewed | 0 (#372 CSV도 owner close-completed → done 이관) |
| ✔️ done | 139 (135 + **owner close-completed 4건**[#430 smoke write-카나리·#435 차감방식 UI·#436 재고실사 audit·#437 bank PUT IDOR — 커밋 `f9587c5` "fix(security/audit): IDOR·감사기록·차감방식UI·write카나리 일괄 수정"으로 전부 수정 close, main 트리 실재 검증·#422 디버전스 clean]) |
| ❌ rejected | 3 |

> 📦 **과거 사이클 로그**는 `IMPROVEMENT_BACKLOG_ARCHIVE.md`/git 히스토리로 이관됨 (2026-06-10 1차 분리, 2026-06-25 2차 트림 343KB→192KB, **2026-06-25T10:00 3차 트림 — 06-17~06-23 사이클 로그를 git 히스토리로 이관: node_modules 부재 세션에서 commit-gate(typecheck) 차단으로 API 푸시 필요 → 파일 축소로 비용 절감 + 256KB 한도 회복**). 신규 로그는 계속 이 파일 상단에 추가. 본 파일은 직전 2일치(06-24~) 사이클 로그 + 영구 참조 섹션(Approved/New/Auto-fixed/Done/Rejected/FP 카탈로그)만 유지. 이관분은 `git log -p -- IMPROVEMENT_BACKLOG.md`로 복원 가능.

> **Area 1 프로덕션 헬스 (2026-06-26T02:00):**
> - **방법**: git fetch-before-compare(origin force-update `4993fa7→beaa47b`, fetch 후 **HEAD=origin/main `beaa47b` 0/0 동기**, 워킹트리 clean, 디버전스 0). egress 차단(prod 직접 fetch·Playwright·verify[node_modules 부재] 도달 불가)이라 CI/E2E는 GitHub Actions API로, 회귀 위험은 정적 standing scan으로 검증. **사이클 churn = 1 커밋(`beaa47b` = 직전 Area6 자기진화 커밋 본인)** — 직전 사이클(`2743ad1`) 이후 owner 신규 코드 churn 0.
> - **🟢 CI/E2E = 전부 GREEN**: 최근 15런(`actions_list` main) 전부 `completed/success` — HEAD `beaa47b`(Area6 자기진화) Deploy + Daily D1 Backup 모두 success, 직전 IA editor P1/P2/P3(`79207b7`~`adb4ab4`)·KST 정규화(`818cbd7`)·Area5(`0500731`) Deploy 전부 success. Deploy 워크플로(post-deploy smoke 포함) fail 0. **신규 prod-breaking 회귀 0**.
> - **🟢 DROP/RENAME 마이그 write-path standing scan(SKILL line 40) = 위험 0**: `2743ad1..beaa47b` 마이그 변경 **0건**(최신 마이그 `0388_normalize_print_event_kst_to_utc` = 직전 Area6 사이클 검증분, 신규 유입 0). `DROP TABLE`/`DROP COLUMN` 신규 0(grep 매치 전부 기존 0048/0070/0208 등 ≤0337). items inline-FK 깨짐류(#430 smoke 맹점) 트리거 없음.
> - **🟢 마이그 번호 중복 standing scan(#438) = net-new 0**: `uniq -d`(4자리 prefix) = `0080`·`0193`·`0327` — **0080b/0193b는 의도적 suffix 컨벤션**(순서보장용 = FP), `0327`만 진짜 동일번호(기존 prod-적용 추정, #438 규칙상 정리대상 아님). 신규 중복 유입 0.
> - **🟢 prod↔main 디버전스(#422) = clean**: HEAD=origin/main `beaa47b` 0/0 동기 → 미push 픽스 0. owner close 코멘트 "배포 완료" 주장 신규 0(done=139 유지, 최근 closure 전무).
> - **🟢 backlog↔GitHub sync**: open auto-improve **실측 5건**(#439·#441·#442·#443·#444, list_issues 전수) = 직전 Area6 stats `new=5` **정합**. owner 신규 close/머지 0(done=139·rejected=3 유지). 본 사이클 신규 이슈 0(헬스 GREEN·회귀 0).
> - **🧬 SKILL 강화 0건**: 기존 standing scan(DROP write-path line 40·마이그중복 #438·디버전스 #422·smoke 맹점 #430)이 본 사이클 전수 커버. churn 0(owner 신규 코드 없음)이라 신규 탐지 패턴 불필요.
> - **이상 없음(CI·DROP마이그·중복·디버전스·sync)**, 신규 발견 0. git 동기 0/0·워킹트리 clean, sync 5=5.
> - 자동 수정 0건(헬스 GREEN·owner churn 0), 신규 이슈 0건, SKILL 강화 0건, done-sync(변동 0, new 5 유지), **신선 각도 — Area 1 프로덕션 헬스: CI 15런 전수 GREEN·직전 IA editor/KST정규화 배포 정상·신규 마이그 0(DROP 0)·디버전스 0, 프로덕션 무중단. 사이클 churn=1(자기 커밋뿐)이라 owner 신규 코드 검증 대상 자체가 없는 clean cycle.**
>
> **Area 6 자기 진화 (2026-06-25T22:00):**
> - **방법**: git fetch-before-compare(origin force-update `4993fa7→2743ad1`, fetch 후 **HEAD=origin/main `2743ad1` 0/0 동기**, 워킹트리 clean, 디버전스 0). egress 차단(prod/Playwright/verify[node_modules 부재] 도달 불가)이라 정적 bridge 검증. Area 6 **신선 각도 = 직전 Area5(`84be66e`, 06-25T18:00)/Area4(`0500731`, 06-25T14:00) 이후 최대 churn = IA editor P1/P2/P3 실사용 개선**(`79207b7`P1+`7c1e02a`R1+`093ff13`R2+`e41555d`R3a+`adb4ab4`R3b = `iaEditor.js +1321`·`workbench.ts +125`) + 출력이력 KST 정규화(`818cbd7` `production.js +288`·`printEvents.ts +89`·마이그 0388). **컬럼-diff bridge(post-Area4) + XSS bridge(post-Area5) + 마이그중복 + showConfirm오용 + axios도달성 + 0388 멱등성 6종 standing meta-check 전수.**
> - **🟢 XSS bridge(post-Area5, `iaEditor.js +1321`·`production.js +288`) = net-new 0**: 신규 innerHTML/insertAdjacentHTML/`html+=` sink 전수 `iaeEscape`(iaEditor)·`escapeHtml`(production) 일관 — error_message/filename/preset label/adv 옵션(localStorage)·equipment name/`g.key`(location_zone) 전부 text+attr(title/value/data-*) 양쪽 이스케이프. base64 이미지 src(jpg_base64)·iaeStatusBadge(enum+escaped fallback)는 free-text 아님(FP 제외). production.js의 file_name/nest_members JSON.parse().map() 이벤트행 렌더는 **이번 churn 미포함**(diff=loadAgents/장비그룹화/필터만, 이벤트 카드 렌더 무변경 = Area5 기존 커버) → A-024/A-025 부분-escape 클래스 net-new 0.
> - **🟢 컬럼-diff bridge(post-Area4, `workbench.ts +125`·`printEvents.ts +89`) = net-new 0**: 신규 SELECT/INSERT/UPDATE 참조 컬럼 전수 ground-truth 대조 통과 — print_events 검색(file_name/printer_name/print_completed_at/equipment_id[0020/0021]·INSERT 22열=22placeholder=22bind print_duration_sec[0076]/entity_id[0264]/nest_members[0334])·ia_process_jobs(status/result_json/error_message[0386])·settings UPSERT(setting_key UNIQUE[0001]). NOT NULL no-default(agent_id/file_path/print_status) 400 가드+bind, entity_id INSERT 포함(eventEntityId derive·process getEntityId). settings=글로벌 config(entity_id 컬럼 부재) 정당 제외.
> - **🟢 신규 IDOR(#444 제외) = 0**: 신규 단일행 write `POST /process/:id/retry`(`workbench.ts:957`)는 **선행 소유 SELECT `WHERE id=?${ef.clause}`(:963) 404 게이트 후 bare UPDATE(:970)** = 동파일 안전 siblings(PUT/DELETE /sheets/:id read-gate) 동형 = #444(선행 SELECT 자체 부재) 클래스 아님. #444(PATCH 콜백 2종)는 기존 OPEN 유지(재보고 안 함).
> - **🟢 마이그 0388(print_event KST→UTC 정규화) = idempotent-safe·DROP 0**: 단일 UPDATE만(DROP TABLE/COLUMN/ALTER 0). 비멱등 위험(매 실행 -9h 누적) 가드됨 — `WHERE (julianday(completed)-julianday(created))*24 BETWEEN 8 AND 10`로 1회 보정 후 diff≈0이면 범위 밖 → 재적용 미해당. `print_completed_at IS NOT NULL`로 NULL 보호, print_started_at은 CASE NULL 보존. D1 1회 실행이라 실질 위험 0.
> - **🟢 axios→백엔드 라우트 존재성(#411) = net-new 0(죽은버튼 0)**: 신규 호출 전부 백엔드 실재 — `/agent-status`(`workbench.ts:553`)·`/process/:id/retry`(`:957`)·`/process/:id` GET/PATCH(`:914`/`:931`)·print-events 신규 필터 q/equipment_ids/from/to(`printEvents.ts:652` c.req.query destructure 수신). showConfirm 신규 2건(iaEditor `:377`/`:1725`) 전부 Promise `.then()`+options-객체 형태(#426 콜백오용 0).
> - **🟢 마이그 번호 중복 standing scan(#438) = net-new 0**: `uniq -d` = `0327`만(기존 prod-적용 추정, #438 규칙상 정리대상 아님). 신규 0388 단일·중복 유입 0.
> - **🟢 backlog↔GitHub sync**: open auto-improve **실측 5건**(#439·#441·#442·#443·#444, list_issues 전수) = 직전 Area5 stats `new=5` **정합**. owner 신규 close/머지 0(done=139·rejected=3 유지). #422 디버전스: HEAD=origin/main 동기(`2743ad1`)라 미push 픽스 0.
> - **🧬 SKILL 강화 0건**: 기존 standing scan(컬럼 bridge line 232·XSS bridge line 234·마이그중복 #438·showConfirm #426·axios-route #411·IDOR read-gate vs bare #437/#444)이 IA editor 신규 feature를 전수 커버. 신규 feature가 처음부터 컨벤션(iaeEscape 일관·entity_id INSERT·read-gate 소유검증·route 배선) 준수 = Area 6 "신규 feature가 컨벤션 따르면 clean" 클래스. 신규 탐지 패턴 불필요.
> - **이상 없음(XSS/컬럼/IDOR/마이그0388/axios/showConfirm/중복)**: IA editor P1/P2/P3(`iaEditor.js +1321`·`workbench.ts +125`) + 출력이력 KST 정규화(`production.js +288`·`printEvents.ts +89`·0388) 6종 bridge 전수 clean, net-new 0. git 동기 0/0·워킹트리 clean. sync 5=5.
> - 자동 수정 0건(clean cycle — 발견 없음), 신규 이슈 0건, SKILL 강화 0건, done-sync(변동 0, new 5 유지), **신선 각도 — IA editor P1/P2/P3 신규 feature(드래그스냅·MaxRects·평판분할·retry·agent-status) + 출력이력 KST 정규화 첫 Area6 bridge 감사(컬럼존재성·XSS·신규IDOR·0388 멱등성·axios도달성·showConfirm), 프로덕션 영향 0 확인.**
>
> **Area 5 보안 + 인프라 (2026-06-25T18:00):**
> - **방법**: git fetch-before-compare(origin force-update `4993fa7→0500731`, fetch 후 **HEAD=origin/main `0500731` 0/0 동기**, 워킹트리 clean, 디버전스 0). egress 차단(prod/Playwright/verify[node_modules 부재] 도달 불가)이라 정적 보안 분석. Area 5 **22회차** — **신선 각도 = 직전 Area5(`00190f9`, #442 영수증 IDOR, 06-24T18:00) 이후 최대 신규 write-path = IA editor Export-first(`workbench.ts` +251·0386 ia_process_jobs) + 세금계산서↔입금 매칭(Phase3 `paymentMatch.ts` +256·0387) + 프론트 churn(`taxInvoices.js` +268·`iaEditor.js` +220).** Area4가 데이터정합성, Area3가 UX를 봤으나 **IDOR 비대칭·XSS sink는 Area5 첫 감사.**
> - **🔴 신규 이슈 #444 (bug, small) — IA 워크벤치 렌더 콜백 PATCH 2종 entityFilter 누락(#437 형제-비대칭 cross-tenant write)**: `workbench.ts`의 **PATCH `/sheets/:id/render`(`:580`)·PATCH `/process/:id`(`:831`)** = 에이전트 결과 콜백이 `UPDATE ... WHERE id = ?` **bare**(entityFilter 없음)로 `render_result_json`/`result_json`(다운로드 R2 키 담김) + status를 cross-tenant 변조 가능. **결정적 격리-의도 증거 = 동일 파일 다른 모든 핸들러가 entityFilter**(sheets POST/GET/PUT/DELETE·sheets/:id/render POST `:507`·render-queue·process POST/GET/download 전부) → 콜백 2개만 누락 = #437(bank GET/DELETE/refresh 적용·PUT만 bare) byte-동형 부분픽스. 도달성 LIVE(라우터-와이드 `requireRole('ADMIN','MANAGER','DESIGNER')`). 공격: entity A MANAGER/DESIGNER가 타법인 잡 상태 오염 + `POST /render-asset`(`:639`, job_id 소유검증 0)로 `render-outputs/{type}/{B_id}/`에 임의 업로드 후 콜백으로 B의 result_json 포인터 주입 → **entity B 다운로드 시 공격자 콘텐츠 수신**(콘텐츠 인젝션). **issue-only**(IDOR=owner 픽스 워크플로 #349/#356/#360/#437, egress 차단 런타임 검증 불가). 수정=PATCH 2곳 `${ef.clause}`+bind(super-admin 에이전트는 빈절=무영향, #437 안전논리) + render-asset 선행 소유 SELECT.
> - **🟢 자동수정 1건 (A-031, XSS) — `taxInvoices.js` partial-escape 4 sink escapeHtml 추가**: `c02deb1`(2026-06-24 회계/세금 churn) 도입한 미escape free-text sink — **buyer_name**(목록 `:199`·상세모달 `:580`)·**client_name**(미발행 아코디언 `:296`·회계반영 대기 `:951`)이 raw innerHTML 보간. **동일 파일 형제는 escape됨**(`:183` onclick attr·`:920`·`:1142`·`:1348`·`:1529`) = A-024/A-025 "같은 파일 부분 escape 형제 데이터소스" 누적 클래스. buyer_name=tax_invoices(거래처명 파생 free-text)·client_name=clients(free-text 마스터, ADMIN/MANAGER 편집) = stored XSS sink. **안전 자동수정**(`escapeHtml(...)` 래핑=동작 무변, `window.escapeHtml` shell.js:62 전역). node_modules 부재로 `npm run verify` 불가하나 `?raw` JS는 tsc 미컴파일 + `node --check` 문법 OK + 활성 hook JS문법 게이트 + 기존 escape 형제와 일관 → 적용·커밋.
> - **🟢 paymentMatch.ts(Phase3 신규) IDOR = clean**: 라우터-와이드 `requireRole('ADMIN','MANAGER')` + **전 read entityFilter**(GET `/:id/payment-match` ti+payments efP `:53/:63`·후보쿼리 efP.clause `:89`·suggestions efP+efT `:127/:128`). PUT `/payments/:pid/tax-invoice`(`:214`)는 **선행 entity-scoped SELECT 404 게이트**(payment efP `:223`·대상 계산서 efT `:231`+발행완료+동일거래처 3중검증 `:234~239`) 후 bare UPDATE = #437 클래스 아님(읽기검증 후 쓰기, entity_id 불변). INSERT 0(payments UPDATE만). XSS=Area3가 모달(buyer_name/payment_method/reference_number escape) 확인분 + 본 사이클 list/detail 추가 격리(A-031).
> - **🟢 iaEditor.js(+220 신규 churn) XSS = clean**: 신규 innerHTML sink 전수 `iaeEscape` 일관(filename/error_message/group.name/preset.name/option label/dims). `iaeRenderResultHTML`의 `namePrefix`는 innerHTML 미보간(다운로드 파일명만, `iaeDownloadBlob :90`). 나머지 신규 sink는 정적 스피너 마크업·숫자. = Area6 "신규 feature가 escape 컨벤션 따르면 clean" 클래스.
> - **🟢 workbench R2 다운로드 = #365/#442 일반프록시 클래스 아님**: `/sheets/:id/download`(`:680`)·`/process/:id/download`(`:707`)는 **entity-scoped SELECT(`:689`/`:716`)로 행 확보 후 `pickR2Key`로 DB(`render_result_json`/`result_json`)에서 키 파생** = po-receipts.ts 안전 형제 패턴(클라 키 직접서빙 아님). 다운로드 자체는 entity 격리(콜백 IDOR #444와 별개로 read는 안전).
> - **🟢 시크릿 폴백/기본비번 grep(#338) = net-new 0**: 신규 churn에 `c.env.X || '리터럴'` 0건. 업로드 검증(`validateUpload` 50MB·확장자·MIME — files/analyze `:191`·render-asset `:657`) + R2 키 sanitize(`replace(/[^a-zA-Z0-9._-]/g,'_')` path traversal 방어 `:207`/`:665`) 정상.
> - **🟢 backlog↔GitHub sync**: open auto-improve **실측 4건**(#439·#441·#442·#443, list_issues 전수) = 직전 Area4 stats `new=4` **정합**. 본 사이클 #444 추가 → new 4→5. owner 신규 close/머지 0(done=139·rejected=3 유지). #422 디버전스: HEAD=origin/main 동기(`0500731`)라 미push 픽스 0.
> - **🧬 SKILL 강화 0건**: #444는 기존 standing scan(IDOR 비대칭 #349/#356·외부연동 단건-write IDOR 형제완전성 #437·sub-resource write-isolation #418)이 정확히 커버 — 콜백 PATCH를 그 규칙으로 즉시 격리. A-031은 SPA innerHTML free-text XSS standing scan(line 205·A-024/A-025) 정확 적용. 신규 탐지 패턴 불필요.
> - **이상 없음(paymentMatch IDOR·iaEditor XSS·R2 다운로드 격리·시크릿·업로드검증)**, **발견 2건** — #444(워크벤치 콜백 IDOR, issue-only) + A-031(taxInvoices XSS 4 sink, 자동수정). git 동기 0/0, sync 4=4(+#444).
> - 자동 수정 1건(A-031 XSS escapeHtml 4 sink), 신규 이슈 1건(#444 IDOR), SKILL 강화 0건, done-sync(변동 0, new 4→5), **신선 각도 — IA editor Export-first(workbench.ts)·세금계산서↔입금 매칭(paymentMatch.ts) 신규 write-path 첫 보안 감사(IDOR 비대칭·XSS sink·R2 서빙 격리·업로드검증), 콜백 PATCH 형제-비대칭 IDOR 1건 발견 + taxInvoices 부분-escape XSS 4 sink 자동수정, 프로덕션 영향: #444는 privileged role(ADMIN/MANAGER/DESIGNER) 필요 cross-tenant write·A-031은 ADMIN/MANAGER 마스터 free-text stored XSS(이번 커밋으로 차단)**
>
> **Area 4 데이터 정합성 (2026-06-25T14:00):**
> - **방법**: git fetch-before-compare(origin force-update `4993fa7→784607b`, fetch 후 **HEAD=origin/main `784607b` 0/0 동기**, 워킹트리 clean, 디버전스 0). egress 차단(prod D1/wrangler/node_modules 부재)이라 migrations ground-truth 정적 대조. Area 4 **23회차** — **신선 각도 = 직전 Area4(`4c91a6d`, 06-24T14:00) 이후 최대 신규 write-path = 세금계산서↔입금 매칭(Phase3 `paymentMatch.ts` +256·0387) + IA editor Export-first(`workbench.ts` +251·0386 ia_process_jobs) + leaves P2-W2(촉진/소멸).** 신규 링크/잡 테이블의 status 전이·dangling 참조·멱등성을 첫 Area4 감사.
> - **🔴 신규 이슈 #443 (bug, small) — 세금계산서 발행취소/삭제 시 신규 `payments.tax_invoice_id` 미정리(dangling+자동제안 영구제외)**: Phase3(`0387`) 입금매칭이 도입한 `payments.tax_invoice_id`를 **cancel 핸들러(`issue.ts:662~728`)가 정리 안 함** — 취소 가능 상태(ISSUED/SENT/NTS_SUCCESS=입금 링크 가능 상태와 동일집합)를 CANCELLED로 전환하면서 **형제 `order_billing_groups.tax_invoice_id=NULL`(`:707`)은 정리하나 payments 링크만 누락**. ① 무효 계산서에 입금 잔존(회계 귀속 오류) ② 전체 제안 쿼리 `WHERE p.tax_invoice_id IS NULL`(`paymentMatch.ts:136`)이라 dangling 입금은 **재발행 계산서에 자동제안 영구 제외**(수동해제 전까지). **결정적 = 0387이 cancel/삭제 핸들러보다 나중 추가**라 정리경로 미반영 = #441/#431/#395 "참조 정리 완전성" 동축. 형제 정리는 의식적 하드닝됨(`manage.ts:143` `// #386 cancel 경로와 대칭 dangling 방지`). **issue-only**(cancel=금융 워크플로 batch 변경·link-null vs 감사보존 비즈니스 판단·egress 차단 런타임 검증 불가, #441/#395 동일).
> - **🟢 IA process jobs(`workbench.ts` +251, 0386) = 데이터정합성 clean**: ① INSERT(`:768`) `entity_id=getEntityId(c)`·`created_by=user?.id`·`status='queued'`(leave_type류 CHECK 무제약 TEXT) 정합 ② **atomic claim guard** — 폴링 claim이 `UPDATE ... SET status='rendering' WHERE id IN (...) AND status='queued'`(`:803`)로 재폴링/동시 에이전트 이중처리 방지(#420 TOCTOU 정답 패턴) ③ 전 read entityFilter(`ef`) ④ status 전이 queued→rendering→done|error 단방향, `status='queued'` 필터가 claimed 잡 자연 제외. sheet_layouts render_status도 동형 claim guard(`:570`).
> - **🟢 payment-match PUT 멱등/정합 = clean**: 연결 시 ① 입금 entity 스코프(`efP` IDOR 방지 `:221`) ② 대상 계산서 entity+발행완료+동일거래처 3중 검증(`:228~239`) ③ `UPDATE payments SET tax_invoice_id=?`는 멱등(재클릭 무해). 단일/전체 제안의 issue_date NULL 처리 분기(단건 `||'1970-01-01'` vs 전체 `null→무필터`)는 issue_date NOT NULL(0387 전 컬럼 실재)이라 실무상 동일 = FP 미보고. 다중입금→1계산서(부분입금 합산 `linkedTotal`)는 의도된 설계.
> - **🟢 leaves P2-W2(촉진/소멸 `0530112`) status/날짜 정합 = clean**: 소멸 sweep는 `expire_date`/`expired`(0384 ADD COLUMN) additive, 촉진통지(0383)는 INSERT-only. `a4081ba`가 연차소멸 적법게이트+근태재계산 follow-up 픽스. CHECK-literal write 위반 0(leave_type 무CHECK).
> - **🟢 마이그 0381-0387 = additive/멱등**: 전부 ADD COLUMN/CREATE TABLE IF NOT EXISTS/INSERT, `DROP TABLE/COLUMN` 0건. 0382(production_board 권한 DELETE만)·0386(ia_process_jobs CREATE IF NOT EXISTS)·0387(payments ADD COLUMN+INDEX). 마이그 번호 중복 standing scan(#438) = `0327`만(기존 prod-적용 추정, 신규 0381-0387 중복 유입 0).
> - **🟢 backlog↔GitHub sync**: open auto-improve **실측 3건**(#439·#441·#442, list_issues 전수) = 직전 Area3 stats `new=3` **정합**. 본 사이클 #443 추가 → new 3→4. owner 신규 close/머지 0(done=139·rejected=3 유지). #422 디버전스: HEAD=origin/main 동기(`784607b`)라 미push 픽스 0.
> - **🧬 SKILL 강화 0건**: #443은 기존 standing scan(참조 정리 완전성 #395/#431·status-consistency 제외 sweep line 159·신규 write-path denormalized link)이 정확히 커버 — Phase3 신규 링크 테이블을 그 규칙으로 즉시 격리. 신규 탐지 패턴 불필요.
> - **이상 없음(ia_process_jobs·payment-match 멱등·leaves·마이그·중복)**, **유일 발견 #443**(payments dangling 링크, issue-only). git 동기 0/0, sync 3=3(+#443).
> - 자동 수정 0건(Area 4 #443=issue-only, cancel 금융 워크플로 batch 변경), 신규 이슈 1건(#443), SKILL 강화 0건, done-sync(변동 0, new 3→4), **신선 각도 — 세금계산서↔입금 매칭/IA Export-first 신규 write-path 첫 데이터정합성 감사(status 전이·dangling 참조·atomic claim·멱등), 프로덕션 영향 0(#443은 stale 포인터, 데이터 손상 아님·수동해제 복구 가능)**
>
> **Area 3 UX/기능 감사 (2026-06-25T10:00):**
> - **방법**: git fetch-before-compare(origin force-update `4993fa7→4445e0d`, fetch 후 **HEAD=origin/main `4445e0d` 0/0 동기**, 워킹트리 clean, 디버전스 0). egress 차단(prod/Playwright/verify[node_modules 부재] 도달 불가)이라 정적 분석. Area 3 **18회차** — **신선 각도 = 직전 Area3(`c02deb1`, 06-24T10:00) 이후 최대 신규 프론트 feature = 세금계산서 Phase1/2/3(`taxInvoices.js +239`, `020fa24`+`7615ab9`)** — 법정 발행기한 경고(Phase1) + 월합산 기한·재발행(Phase2) + 입금 매칭 모달(Phase3) = Area3 미감사 최대 user-facing churn.
> - **🟢 세금계산서 Phase3 입금매칭 신규 모달(`openPayMatchModal`) = UX/기능 전수 clean**: ① **DOM 존재성**(CLAUDE.md silent-fail 함정) — `payMatchModal`/`payMatchContent`가 `pages/taxInvoices.ts:417/423`에 실재 + `if(!modal||!content){console.warn('[taxInvoices] #payMatchModal not found');return}` 가드 ② **axios→라우트 존재성**(죽은 버튼 0) — `GET /api/tax-invoices/:id/payment-match`↔`paymentMatch.ts:50` + `PUT /api/tax-invoices/payments/:pid/tax-invoice`↔`:198` 실재, 배럴 `taxInvoicesRouter.route('/', PaymentMatchRouter)`(`taxInvoices.ts:30`) 마운트 ③ **로딩 표시**(`<i class="fa-spinner fa-spin">로딩 중...`) ④ **빈상태**("제안할 미매칭 입금이 없습니다." colspan 정합) ⑤ **confirm 가드**(`await showConfirm('...연결...')`/`'...해제...'` — #426 콜백오용 0, Promise 정상형) ⑥ **escape**(buyer_name/payment_method/reference_number 전부 `escapeHtml`, free-text sink 0).
> - **🟢 Phase1 발행기한 경고 = 배선 완전**: `taxLegalDueDate`(출고월 익월10일)·`taxDueDday`·`taxDueBadge`(초과=red/D-7=amber/else gray) 순수함수 + `billingWaitingInfo`/`billingAlertBanner`/`monthlyContent` 전부 `pages`에 실재. `taxSupplyDate`(shipped_at→shipment_date→order_date 폴백)로 데이터소스 누락 시 graceful degrade. 회계반영 탭·월합산 탭 동일 패턴 재사용(중복로직 0).
> - **🟢 더블클릭/멱등성**: linkPayment/unlinkPayment는 `PUT tax_invoice_id 설정/해제`(멱등) → 중복제출 무해(#420 TOCTOU 클래스 아님).
> - **🟢 `/production-board` 완전 폐기(`productionBoard.js -503` 파일삭제, `0b221b5`) = purge 완전(#429)**: dropped-table/axios/menu/page-route 잔존 참조 전수 0(`grep -rn production-board src` = 0건) → 죽은 링크/버튼 0. 백엔드·프론트·메뉴 3축 완전.
> - **🟢 연차 P2-W2 신규 버튼(촉진/소멸) 라우트 존재성**: `axios.post('/api/leaves/promotion/run')`↔`leaves.ts:713`·`axios.post('/api/leaves/expire')`↔`:814` 실재(`requireRole('ADMIN')`), `f74fbc8`이 promotion/run alias 500 선픽스. `leavesCancelApproved` onclick 배선 정상.
> - **🟢 backlog↔GitHub sync**: open auto-improve **실측 3건**(#439·#441·#442, list_issues 전수) = 직전 Area2 stats `new=3` **정합**. 신규 closure 0(done=139·rejected=3 유지). #422 디버전스: HEAD=origin/main 동기(`4445e0d`)라 미push 픽스 0.
> - **🧬 SKILL 강화 0건**: 기존 standing scan(axios-route line 117·DOM silent-fail line 115·showConfirm #426·로딩/빈상태·purge완전성 #429)이 세금계산서 신규 feature를 전수 커버. 신규 feature가 처음부터 컨벤션(getElementById 가드·로딩/빈상태·await showConfirm·escape·라우트 배선) 준수 = Area 6 "신규 feature가 컨벤션 따르면 clean" 클래스.
> - **이상 없음(DOM/axios-route/로딩/빈상태/confirm/escape/purge)**: 세금계산서 Phase1/2/3 신규 feature(+239L, 입금매칭 모달) UX/기능 전수 clean. productionBoard purge 완전. git 동기 0/0·워킹트리 clean. sync 3=3.
> - 자동 수정 0건(clean cycle — 발견 없음), 신규 이슈 0건, SKILL 강화 0건, done-sync(변동 0, new 3 유지), **신선 각도 — 세금계산서 Phase1/2/3 신규 프론트(발행기한 경고·입금매칭 모달) 첫 Area3 UX/기능 감사(DOM 실재성·axios-route·로딩/빈상태·confirm·purge완전성), 프로덕션 영향 0 확인. 부수 자기정비: backlog 3차 트림(node_modules 부재 세션의 commit-gate 차단 우회 — API 푸시 비용 절감 + 256KB 한도 회복).**
>
> **Area 2 코드 품질 심층 분석 (2026-06-25T06:00):**
> - **방법**: git fetch-before-compare(origin force-update `4993fa7→b9b4430`, fetch 후 **HEAD=origin/main `b9b4430` 0/0 동기**, 워킹트리 clean, 디버전스 0). egress 차단(prod/Playwright/verify[node_modules 부재] 도달 불가)이라 정적 스캔. Area 2 **22회차** — **신선 각도 = 직전 Area2(`405c72f`, 06-24T06:00) 이후 최대 churn = 연차(leaves) P1/P2 신규 feature**(`291cb39`+`d69cd7a`+`1a9b0c6`+**`800c212` P2-W1 26일 병존/만료 — Area6 bridge(`b8cc56b`) 이후 신규**) = leaves.ts 351L churn(897L). Area6는 컬럼/XSS/showConfirm/axios bridge를 봤으나 **Area2 고유 스캔(entity_id INSERT·컬럼존재성·authMiddleware·N+1·dead code·CHECK literal)을 leaves 신규코드에 첫 적용.**
> - **🟢 entity_id INSERT 전수 자동스캔(113 entity-bearing 테이블 ground-truth) = net-new 0**: 전 routes INSERT 멀티라인 풀-collist 파싱 → 미포함 후보 3건 전부 **FP**(동적 컬럼배열: `hr.ts:474 ${cols.join}` ← `:469 cols.push('entity_id')` #322 서버강제 · `attendance.ts:336/344 ${baseCols.join}` ← `:320 baseCols.push('entity_id')` #401 prefetch맵). leaves.ts 11 INSERT 중 entity-scoped(leave_balances/leave_accrual_logs/leave_requests) 전부 entity_id 명시(buildDeductStmts UPSERT 포함), **글로벌 config 테이블(family_event_rules·leave_types = entity_id 컬럼 부재, 0123 CREATE 확인)은 정당하게 미포함**(FP 아님 = 스키마상 entity_id 없음).
> - **🟢 leaves P2-W1(800c212) 신규코드 컬럼존재성 = net-new 0**: 신규 참조 컬럼 전수 ground-truth — leave_balances `accrued/granted_extra/used/carried_over`(0110 CREATE)·`entity_id`(0264)·`expired/expire_date`(0384 ADD COLUMN) 실재. 신규 함수(addYears·annualRemaining·buildDeductStmts FIFO·buildRestoreStmts 역FIFO·loadAnnualAccruedMap[leaveType 파라미터화]) 참조 컬럼 0 미존재.
> - **🟢 CHECK-literal write(leave_type='MONTHLY') = 위반 0**: 신규 병존 코드가 `leave_type='MONTHLY'` 신규 리터럴 write(buildDeductStmts·monthly accrual). leave_type에 **CHECK IN 제약 0**(0110 CREATE = `TEXT NOT NULL DEFAULT 'ANNUAL'` 무CHECK, grep `leave_type.*check` 0건) → 'MONTHLY' 허용 = prepare throw 위험 0. 0385 relabel(ANNUAL→MONTHLY)도 UNIQUE(employee_id,year,leave_type) 충돌 무(배포前 MONTHLY 행 부재) + prod 미적용 휴면.
> - **🟢 atomicity/N+1/dead-code = clean**: ① approve(buildDeductStmts FIFO)·cancel-approved(buildRestoreStmts 역FIFO) 전부 **`stmts[]` 누적→DB.batch 원자화**(B7 주석, 차감+상태변경 동시) ② N+1 = loadAnnualAccruedMap이 `WHERE employee_id IN (placeholders)` 단일쿼리(#321), 신규 leaveType 파라미터로 ANNUAL/MONTHLY 버킷 재사용(bind 2+N, 엔티티당 직원<<98이라 D1 100바인드 한도 무위험) ③ 신규 5함수 전부 호출처 실재(dead code 0).
> - **🟢 authMiddleware 커버리지 = clean**: leaves 라우터 `leavesRouter.use('/*', authMiddleware, requirePagePermission('/leaves'))`(:39) 라우터-와이드 + mutate 핸들러 전부 `requireRole('ADMIN'[,'MANAGER'])`. 신규 라우터 유입 0(churn = 기존 bank/cardExpenses/clients/lifecycle/leaves, 전부 auth 보유 라우터).
> - **🟢 backlog↔GitHub sync**: open auto-improve **실측 3건**(#439·#441·#442, list_issues 전수) = 직전 Area1 stats `new=3` **정합**. 신규 closure 0(done=139·rejected=3 유지). #422 디버전스: HEAD=origin/main 동기(`b9b4430`)라 미push 픽스 0.
> - **🧬 SKILL 강화 0건**: 기존 standing scan(entity_id INSERT line 53·컬럼존재성 #394/A-027·CHECK literal·authMiddleware·N+1)이 leaves 신규 feature를 전수 커버. leaves가 처음부터 컨벤션(entity_id INSERT·atomic batch·N+1맵·router-wide auth·글로벌config 분리) 준수 = Area 6 "신규 feature가 컨벤션 따르면 clean" 클래스. 신규 탐지 패턴 불필요.
> - **이상 없음(entity_id·컬럼·CHECK·atomicity·N+1·auth·dead-code)**: leaves P1/P2 신규 feature(351L, 병존 FIFO 차감/복원) Area2 6종 스캔 전수 clean, net-new 0. git 동기 0/0·워킹트리 clean. sync 3=3.
> - 자동 수정 0건(clean cycle — 발견 없음), 신규 이슈 0건, SKILL 강화 0건, done-sync(변동 0, new 3 유지), **신선 각도 — 연차 P1/P2 신규 feature(병존/만료 P2-W1 포함) 첫 Area2 코드품질 감사(entity_id INSERT·컬럼존재성·CHECK·atomicity·N+1·auth·dead-code), 프로덕션 영향 0 확인.**
>
> **Area 1 프로덕션 헬스 (2026-06-25T02:00):**
> - **방법**: git fetch-before-compare(origin force-update `4993fa7→b8cc56b`, fetch 후 **HEAD=origin/main `b8cc56b` 0/0 동기**, 워킹트리 clean, 디버전스 0). egress 차단(prod 직접 fetch=`CONNECT 403`·Playwright·verify[node_modules 부재] 도달 불가)이라 CI/E2E는 GitHub Actions API로, 회귀 위험은 정적 standing scan으로 검증.
> - **🟢 CI/E2E = 전부 GREEN**: 최근 15런(`actions_list` main 브랜치) 전부 `completed/success` — HEAD `b8cc56b`(Area 6 자기진화) Deploy + Daily D1 Backup 모두 success, 직전 연차 P1/P2(`291cb39`·`d69cd7a`·`1a9b0c6`) Deploy 전부 success. Deploy 워크플로(post-deploy smoke 101 포함) fail 0. **신규 prod-breaking 회귀 0**.
> - **🟢 DROP/RENAME 마이그 write-path standing scan(SKILL line 40) = 위험 0**: 신규 마이그 0375-0384에 `DROP TABLE`/`DROP COLUMN` 0건(grep 0375+ = 매치 전부 ≤0337 기존분). `0382_remove_production_board`는 **권한 row DELETE만**(`permission_pages`/`role_page_permissions` 2 DELETE, 테이블/컬럼 DROP 없음 = write-path 무영향). 0383/0384(leaves P2)는 additive·prod 미적용(휴면, Area 6 검증). FK 참조 자식 write 차단 위험 없음.
> - **🟢 마이그 번호 중복 standing scan(#438) = net-new 0**: `uniq -d`(4자리 prefix) = `0080`·`0193`·`0327` 매치이나 **0080b/0193b는 의도적 suffix 컨벤션**(0080_offset_pp ↔ 0080b_pp_status, 순서보장용 = FP). **진짜 동일번호 충돌은 `0327`만**(item_register_active ↔ po_receiving_lock, 기존 prod-적용 추정 = #438 규칙상 정리대상 아님). 신규 0375-0384 중복 유입 0.
> - **🟢 prod↔main 디버전스(#422) = clean**: HEAD=origin/main `b8cc56b` 0/0 동기 → 미push 픽스 0. 직전 owner 대량 close(#430/#435/#436/#437 커밋 `f9587c5`) main 트리 실재 검증분 유지(done=139).
> - **🟢 #439 plumbing 재확인 = git push 정상·backlog 트림 완료**: 증상1(git push 403)은 owner 코멘트대로 해소(직전 사이클 commit들 origin 반영 = b8cc56b 실재). **증상2(backlog>256KB)는 본 사이클이 owner-위임받아 처리** — 343KB→192KB(06-09~06-16 사이클 로그 아카이브 이관, Read 한도 회복·push_files API 우회 가능성 복원). #439 close 가능(증상1·2 모두 해소) — owner 판단 대기로 OPEN 유지.
> - **🟢 backlog↔GitHub sync**: open auto-improve **실측 3건**(#439·#441·#442, list_issues 전수) = 직전 Area6 stats `new=3` **정합**. 신규 closure 0(done=139·rejected=3 유지). 본 사이클 신규 이슈 0(헬스 GREEN·회귀 0).
> - **🧬 SKILL 강화 0건**: 기존 standing scan(DROP write-path line 40·마이그중복 #438·디버전스 #422)이 본 사이클 전수 커버. 신규 탐지 패턴 불필요.
> - **이상 없음(CI·DROP마이그·중복·디버전스)**, 신규 발견 0. **자기정비 1건 = backlog 2차 트림(#439 옵션B, 343→192KB)** — 루틴 회복탄력성 회복. git 동기 0/0·워킹트리 clean, sync 3=3.
> - 자동 수정 0건(헬스 GREEN·코드결함 churn 0), 신규 이슈 0건, SKILL 강화 0건, done-sync(변동 0, new 3 유지), **신선 각도 — Area 1 프로덕션 헬스: CI 15런 전수 GREEN·연차 P1/P2 배포 정상·신규 마이그 DROP 0·디버전스 0, 프로덕션 무중단. 부수 자기정비: #439 옵션B backlog 트림 실행(256KB 한도 회복).**

> **Area 6 자기 진화 (2026-06-24T22:00):**
> - **방법**: git fetch-before-compare(origin force-update `4993fa7→1a9b0c6`, fetch 후 **HEAD=origin/main `1a9b0c6` 0/0 동기**, 워킹트리 clean, 디버전스 0). egress 차단(prod/Playwright/verify[node_modules 부재] 도달 불가)이라 정적 bridge 검증. Area 6 **신선 각도 = 직전 Area4(4c91a6d)/Area5(00190f9) 이후 최대 churn = 연차(leaves) P1/P2 신규 feature**(`291cb39` P1 보안·통제 6건 + `d69cd7a` P2-1~3 법정정확도 + `1a9b0c6` P2 촉진/소멸/병존 설계+마이그) = leaves.ts +202L·leaves.js +37·shell.js +40·마이그 0383/0384. **컬럼-diff bridge + XSS bridge + 마이그중복 + showConfirm오용 + axios도달성 5종 standing meta-check 전수.**
> - **🟢 컬럼-diff bridge(post-Area4) = net-new 0**: leaves.ts 10 INSERT + 명시 SELECT 전 컬럼 ground-truth 대조 통과 — `leave_balances`(employee_id/year/leave_type/accrued/used/granted_extra/notes/carried_over[0110]+entity_id[0264]), `leave_accrual_logs`(accrual_type/days/reason/run_by[0110]), `leave_requests`(0004 base + **created_by[0123 ALTER]·entity_id[0264 ALTER]** = INSERT 사용 2컬럼 실재 확인), `leave_types`(category/deduction_days/time_from/time_to/is_paid[0123]), `family_event_rules`(event_name/paid_days/sort_order[0123]), 통상임금 SELECT employees 컬럼(base_salary[0004]·position_allowance[0112]·overtime_daily_hours/overtime_work_days[0198]) 전수 실재. **신규 0383/0384 컬럼(expire_date·expired·leave_promotion_notices)은 코드 미참조**(P2=설계+마이그만, leaves.ts grep 0건 = 휴면 스키마, 컬럼존재성 위험 0).
> - **🟢 XSS bridge(post-Area5) = net-new 0**: ① **shell.js 신규 `window.showPrompt`(전역 모달, A-024 ③ 노출최대)** = innerHTML 스캐폴드는 정적 마크업뿐(빈 `<h3>`/`<p>`/버튼), **모든 텍스트는 `.textContent` 주입**("XSS 방지" 주석 명시), 동적값은 `danger` boolean→class뿐 = sink 0. ② **leaves.js churn 렌더** = status 배지 정적 문자열·`leavesCancelApproved(r.id)` onclick은 숫자 id·날짜루프 숫자·showToast는 서버반환 숫자(actualDays) = free-text sink 0.
> - **🟢 showConfirm/showPrompt 콜백오용(#426) = 0**: 신규 `showConfirm(msg,{title,confirmText,danger})`·`showPrompt(msg,{...})` 전부 **options 객체 2번째 인자 + await/Promise 형태**(콜백-2번째-인자 오용 0). showPrompt는 `resolve(input.value)` Promise 정상.
> - **🟢 axios→백엔드 라우트 존재성(#411) = net-new 0(죽은버튼 0)**: leaves.js 신규 `axios.patch('/api/leaves/requests/'+id+'/cancel-approved')` ↔ leaves.ts:537 `patch('/requests/:id/cancel-approved')` 실재 + reject(:484)·delete(:514) 형제 전수 실재, `leavesRouter` `/api/leaves` 마운트(index.tsx:327). 승인취소 신규 feature 완전 배선(route+entityFilter+근태마킹 해제).
> - **🟢 마이그 번호 중복 standing scan(#438) = net-new 0**: `uniq -d` = `0327`만(기존 prod-적용 추정, #438 규칙상 정리 대상 아님). 신규 0383/0384 중복 유입 0. **minor 관찰(이슈 미생성)**: `0383_leave_promotion_notices.sql` 내부 주석 헤더가 "Migration 0384" 오기(파일명은 0383 정상 → wrangler 파일명키 정렬 무영향, 순수 cosmetic doc 불일치, 비즈니스 영향 0이라 #438 minor 기준 미달).
> - **🟢 backlog↔GitHub sync**: open auto-improve **실측 3건**(#439·#441·#442, list_issues 전수) = 직전 Area5 stats `new=3` **정합**. 최근 closure(#430·#435·#436·#437 updated 06-23T23:43 + #438 06-23T16:05)는 전부 Area5(06-24T18:00) 이전 = 이미 done=139 반영분, **신규 closure 0**. done=139·rejected=3 유지. #422 디버전스: HEAD=origin/main 동기(`1a9b0c6`)라 미push 픽스 0.
> - **🟢 A-026 자기-픽스 완전성 = N/A**: 직전 auto-fix는 2사이클 전 Area2 `c6c6f00`(lifecycle.ts entity_id), Area3/4/5 전부 issue-only(auto-fix 0). 본 churn은 owner 코드(leaves feature)라 자기-픽스 재검 대상 없음.
> - **🧬 SKILL 강화 0건**: 기존 standing scan(컬럼 bridge line 232·XSS bridge line 234·마이그중복 line 237·showConfirm #426·axios-route #411)이 leaves 신규 feature를 전수 커버. 신규 feature가 처음부터 컨벤션(entity_id INSERT·textContent escape·options-객체 confirm·sibling 컬럼 parity·route 배선) 준수 = Area 6 line 234/238 "신규 feature가 컨벤션 따르면 clean" 클래스. 신규 탐지 패턴 불필요.
> - **이상 없음(컬럼/XSS/마이그/showConfirm/axios)**: leaves P1/P2 신규 feature(leaves.ts +202L·shell.js showPrompt·승인취소 워크플로) 5종 bridge 전수 clean, net-new 0. git 동기 0/0·워킹트리 clean. sync 3=3.
> - 자동 수정 0건(clean cycle — 발견 없음), 신규 이슈 0건, SKILL 강화 0건, done-sync(변동 0, new 3 유지), **신선 각도 — 연차 P1/P2 신규 feature 첫 Area6 bridge 감사(컬럼존재성·XSS·마이그중복·showConfirm·도달성), 프로덕션 영향 0 확인. 단 0383/0384 마이그 prod 미적용(commit "마이그(미적용)") = leaves P2 휴면 스키마, owner 적용 시 expire/promotion 코드 배선 예정.**
>
> **Area 5 보안 + 인프라 (2026-06-24T18:00):**
> - **방법**: git fetch-before-compare(origin force-update `4993fa7→00190f9`, fetch 후 **HEAD=origin/main `00190f9` 0/0 동기**, 디버전스 0). egress 차단(prod/Playwright/verify[node_modules 부재] 도달 불가)이라 정적 보안 분석. Area 5 **21회차** — **신선 각도 = 직전 Area5(#437 bank PUT IDOR, 06-23) 이후 최대 churn = 카드영수증 신규 기능(`d15b1a9`/`4ba0833` JPG압축+R2 서빙+ZIP 세무전달) — 파일 업로드/다운로드/R2 서빙 = 최대 신규 공격표면.**
> - **🔴 신규 이슈 #442 (bug/security, small) — 영수증 R2 서빙 일반프록시 IDOR(#365 완화 회귀)**: `cardExpenses.ts:569 GET /receipt-image/*`가 **클라이언트가 준 R2 키를 entity/DB 검증 없이 공유 버킷에서 직접 서빙**(role 게이트만). ① **MANAGER 허용**(entity-scoped) → entity A MANAGER가 entity B 영수증(금융 PII) 교차법인 read(키 `receipts/YYYY-MM/{txId}_{Date.now()}.jpg`, txId=전역시퀀스 열거가능·timestamp만 인가장벽) ② **R2_BUCKET 전기능 공유**(files/po-receipts 거래명세서/aiAnalysis/workbench) → 영수증 외 임의 객체 read primitive ③ `Cache-Control: public`. **결정적 = #365 회귀**: `files.ts:13`이 같은 클래스를 *"#365: ADMIN 전용 — 범용 프록시가 entity/역할 격리 우회 IDOR 완화"*로 이미 ADMIN+private 하드닝했는데 신규 엔드포인트가 MANAGER+public+클라이언트키로 후퇴. **안전 형제 = `po-receipts.ts:119`**(*"key는 DB에서 조회, URL 미노출"* — `SELECT statement_file_key WHERE id=?${ef.clause}`로 entityFilter 통과 행에서 키 파생). 도달성 LIVE(`cardExpenses.js:222 viewReceipt`→`:726 axios blob`). **issue-only**(IDOR=owner 픽스 워크플로 #349/#356/#360/#437, egress 차단 런타임 검증 불가). 수정=po-receipts DB-lookup 패턴 복제 or ADMIN강등+private+`receipts/` prefix.
> - **🟢 영수증 업로드(`:543 POST /:id/receipt`) = 안전 측면 다수**: `validateUpload`(#357 크기/MIME/확장자 10MB) + path traversal 가드(`..`/`\\` 차단 `:573`) + UPDATE는 `entityFilter`(`:560`) 적용. 업로드 키는 서버생성(txId+Date.now), `?` 바인드 SQLi 0. **단 서빙 경로(read)만 entity 격리 누락**(#442).
> - **🟢 시크릿 폴백/기본 비번 grep(#338 필수) = net-new 0**: `c.env.X || '리터럴'` 0건. `bank.ts:95 account_password || ''` = 빈문자열 폴백(바로빌 API "비번 없음" 의미, 하드코딩 시크릿 아님=FP). CI yml 기본 admin 0.
> - **🟢 XSS bridge(직전 Area5 이후 cardExpenses.js +churn) = net-new 0**: 신규 영수증/blob 렌더 sink 전수 — merchant_name/category name 등 free-text는 `escapeHtml`(`:216/:591/:1045`), `:604 preview.innerHTML`의 `rUrl`은 **시스템생성 URL**(receipt-image 키=txId/ts 숫자, free-text 아님)·`blobUrl`은 object URL = sink 아님(FP). 부분-escape 누락 0.
> - **🟢 IDOR 비대칭(#437/#360 클래스) 잔여 = bank/card_fee_rates 픽스 확인**: `f29a266`(card_fee_rates PUT/DELETE entity 격리)·#437(bank PUT) owner 픽스 머지 확인. cardExpenses cards PUT/DELETE/refresh 전부 `entityFilter`(`:192/:217/:255` #360). 단건-write IDOR 신규 유입 0(단 #442는 IDOR이나 "단건write"가 아닌 "범용서빙프록시" 변종 = SKILL line 73 클래스).
> - **🟢 backlog↔GitHub sync**: open auto-improve **실측 2건**(#439·#441, list_issues 전수) = 직전 Area4 stats `new=2` **정합**. 본 사이클 #442 추가 → new 2→3. owner 신규 close/머지 0(done=139·rejected=3 유지). #422 디버전스: HEAD=origin/main 동기(`00190f9`)라 미push 픽스 0.
> - **🧬 SKILL 강화 0건**: #442는 기존 standing scan(SKILL line 73 "범용 서빙 프록시 = 도달성 무관 공격표면" #365 + IDOR 비대칭 #437)이 정확히 커버 — R2 서빙 신규 엔드포인트를 그 규칙으로 즉시 격리. 신규 탐지 패턴 불필요.
> - **이상 없음(시크릿/XSS/업로드검증/SQLi)**, **유일 발견 #442**(영수증 서빙 IDOR, issue-only). git 동기 0/0, sync 2=2(+#442).
> - 자동 수정 0건(Area 5 #442=issue-only, IDOR owner 워크플로), 신규 이슈 1건(#442), SKILL 강화 0건, done-sync(변동 0, new 2→3), **신선 각도 — 카드영수증 신규 기능(R2 업로드/서빙/ZIP) 첫 보안 감사 + 시크릿/XSS/IDOR 표준 스캔, #365 일반프록시 완화 회귀 1건 발견, 프로덕션 영향: 인증 ADMIN/MANAGER 필요·키 추측 의존이라 즉시위험 낮으나 교차법인 PII 인가장벽 부재**
>
> **Area 4 데이터 정합성 (2026-06-24T14:00):**
> - **방법**: git fetch-before-compare(origin force-update `4993fa7→4c91a6d`, fetch 후 **HEAD=origin/main `4c91a6d` 0/0 동기**, 디버전스 0). git push 동작(직전 Area2 `9b7be22`·Area3 `431ca68` origin 반영). egress 차단(prod D1/wrangler/node_modules 부재)이라 migrations ground-truth 정적 대조. Area 4 **22회차** — **신선 각도 = 직전 Area4(c51f484, 06-23T14:00, origin force-update로 SHA 소멸) 이후 최대 churn = 법인카드 승인↔취소 자동상계(0379 `card_tx_offset`+`reconcileCardOffsets`)·바로빌 은행 auto-match(5f8793c 파생잔액 복원)·`clients.balance` 캐시 폐기(P3) 전환 churn.**
> - **🔴 신규 이슈 #441 (bug, medium) — 폐기된 `clients.balance` 캐시 stale read 부분픽스 잔재**: `clients.balance`는 split billing P3에서 폐기(정상 입금/청구/감액 흐름 incremental 유지 0 — `lib/payments.ts:77`·`ar-payments` 전부 "캐시 미사용·미수금 파생" 주석/파생반환, 쓰는 곳은 수동 recalc `ar-receivables.ts:87/142`+임포트 `migration.ts`뿐)인데 4개 읽기가 잔존: **(HIGH)** `reports.ts:465-509 /receivables-analysis` 미수금 연령분석 Aging Buckets+TOP15가 `c.balance`로 버킷/`WHERE c.balance>0`(프론트 reports.js:393 LIVE) · **(MED)** `clients.ts:101-103 ?has_balance=1` 거래처필터 `c.balance>0` · **(LOW)** `bank.ts:1994 /client-search` `ORDER BY c.balance` · **(LOW)** `reports.ts:91` clientSummary. 거래처 상세(파생)와 AR aging(캐시) 미수금 불일치 → 연체관리 stale. owner가 "stale 7건 정리"(`3c1eddc`)·"상세 파생통일"(`a846ed0`)로 고가시성만 전환, 형제 읽기 누락(#431/#377 부분픽스). **issue-only**(캐시→파생 쿼리 전환은 보고서출력·entityFilter·성능 영향 #431 클래스, egress 차단으로 출력검증 불가).
> - **🟢 자동상계 `reconcileCardOffsets`(cardExpenses.ts:46) = clean**: ① **멱등**(`is_offset=0`만 대상, 마킹 후 다음 런 제외) ② **1:1 매칭 정합**(`used` Set으로 승인 재사용 차단·카드/반올림금액/가맹점 동일+±30일 최근일 best) ③ **NaN-safe**(`parseTxDate` <8자 NaN + `!(diffDays<=WINDOW)` 가드) ④ **entity 격리**(SELECT `entityFilter(c,'card_transactions')`) ⑤ 80개 청크 batch. status CHECK(`UNCLASSIFIED/CLASSIFIED/REQUESTED/APPROVED`) — 전 literal write 준수(`'CANCEL'/'APPROVED'` 리터럴은 전부 비-CHECK `approval_type` 대상).
> - **🟢 바로빌 auto-match 파생잔액 복원(bank.ts:780~ 5f8793c) = clean**: rule3 금액매칭이 폐기 `clients.balance`(=0) 의존 dead였던 걸 `deriveClientBalance` 동일정의 파생(`order_billing_groups[BILLED]−payments−adjustments`)으로 복원 + **안전가드 3종**(DEPOSIT 입금만·해당잔액 거래처 유일시(`balanceCount===1`)만·여전히 SUGGEST/CONFIRM, 자동적용 X). 모호 매칭 방지 sound.
> - **🟢 card_transactions INSERT 컬럼존재성 = net-new 0**: 3 INSERT(:386 codef sync·:877 수동·:931 CSV) 전 컬럼 ground-truth(0054 CREATE+ALTERs receipt_image_url/approval_number/supply_amount/tax_amount/approval_type/matched_bank_tx_id/is_offset/offset_pair_id) 실재. 0379 신규 컬럼(is_offset NOT NULL DEFAULT 0·offset_pair_id) additive 정합.
> - **🟢 마이그 0379(card_tx_offset)·0380(expense_category_cleanup) = additive/멱등**: 0379 ADD COLUMN×2+INDEX(DROP 0) · 0380 `UPDATE is_active=0`(드롭다운만 차단·기존 category_id 유지)+`원재료비` INSERT(`entity_id NOT IN (SELECT … name='원재료비')` 멱등가드). 마이그 번호 중복 standing scan = `0327`만(기존 prod-적용 추정, #438 규칙상 정리대상 아님), 본 churn 신규 중복 유입 0.
> - **🟢 backlog↔GitHub sync**: open auto-improve **실측 1건**(#439, list_issues 전수) = 직전 Area3 stats `new=1` **정합**. 본 사이클 #441 추가 → new 1→2. owner 신규 close/머지 0(done=139·rejected=3 유지). #422 디버전스: HEAD=origin/main 동기(`4c91a6d`)라 미push 픽스 0.
> - **🧬 SKILL 강화 0건**: 기존 standing scan(denormalized 캐시 일관성 #431 line 70·부분픽스 #377 line 62·CHECK literal line 150·컬럼존재성 line 154)이 본 churn 전수 커버. #441은 #431 "백엔드 컬럼/JOIN 제거→stale read"의 **캐시-컬럼 폐기 변종**으로 기존 패턴 적용.
> - **이상 없음(자동상계·auto-match·INSERT·마이그)**, **유일 발견 #441**(폐기 캐시 stale read, issue-only). git 동기 0/0, sync 1=1(+#441).
> - 자동 수정 0건(Area 4 #441=issue-only, 캐시→파생 전환=보고서 출력 영향), 신규 이슈 1건(#441), SKILL 강화 0건, done-sync(변동 0, new 1→2), **신선 각도 — 카드 자동상계/바로빌 auto-match 신규 feature 데이터정합성 + 폐기 clients.balance 캐시 stale-read 부분픽스 추적, 프로덕션 영향 0(#441은 보고서 stale, prod 무중단)**
>
> **Area 3 UX/기능 감사 (2026-06-24T10:00):**
> - **방법**: git fetch-before-compare(origin force-update `4993fa7→c02deb1`, fetch 후 **HEAD=origin/main `c02deb1` 0/0 동기**, 디버전스 0). git push 동작(직전 Area2 `9b7be22` 정상 push·origin 반영 확인). egress 차단(prod/Playwright/verify[node_modules 부재] 도달 불가)이라 정적 분석. Area 3 **17회차** — **신선 각도 = 직전 Area3(c3ccd2e, 06-23T10:00) 이후 최대 churn = 회계 통합 허브 신규 프론트 `accounting.js`(527L, 02dfe2d+13fb4e2) — 6탭(요약/입금/세금계산서/현금영수증/카드/매입+타임라인) 미감사 최대 신규 feature의 UX/기능 완전성.**
> - **🟢 회계 허브 프론트(`accounting.js` 527L) = UX/기능 clean**: ① **로딩 표시 전수**(전 탭 `window.dsSkeleton.loadingRow(N)` 적용, #421 패턴 일관) ② **빈상태 전수**(탭별 아이콘+"입금/세금계산서/현금영수증/카드/매입/타임라인 내역이 없습니다" colspan 정합) ③ **삭제 confirm 가드**(입금삭제 `:505` native confirm "연결 은행거래 매칭 해제" 경고문 포함) ④ **showConfirm 콜백 오용 0**(#426 패턴 미발견) ⑤ **getElementById 전부 가드**(`if(!body){console.warn('[accounting]...');return}`, HTML↔JS silent-fail 방지 CLAUDE.md 함정 준수).
> - **🟢 axios→백엔드 라우트 존재성 = net-new 0(10 경로 전수 실재)**: `/api/accounting/{summary,payments,purchases,timeline}`(accounting.ts:43/117/176/232 실재) · `/api/tax-invoices`(taxInvoices/queries.ts:59 GET /) · `/api/cash-receipts`(cashReceipts.ts:62) · `/api/card-expenses/transactions`(cardExpenses.ts:382) · `/api/ledger/payment/:id` GET/PUT/DELETE(ar-payments.ts:90/118/180, ar배럴→ledger배럴 `/` 마운트 체인 검증). 죽은 버튼 0.
> - **🟢 필터 UI 라운드트립 = clean(죽은 필터 0)**: accounting.js 탭별 전송 파라미터 ↔ 백엔드 수신 전수 대조 — tax/cash 탭 `date_from/date_to/status/search/page/limit` ↔ queries.ts:61/cashReceipts.ts:64 동일 destructure 수신·issue_date/receipt_date 범위필터 적용 / card 탭 `start_date/end_date/search` ↔ cardExpenses.ts:384 `start_date||date_start` 별칭 호환 수신. 모든 필터가 실제 WHERE절에 반영, pagination round-trip 정합.
> - **🟢 권한 게이트 정상**: `/accounting` 페이지 `pageAuthMiddleware+requirePagePermission('/accounting')`(index.tsx:472) + 권한 마이그 `0374`(ADMIN/MANAGER INSERT) 실재 → 무권한 도달 차단.
> - **🟢 churn 신규 axios 경로(바로빌/카드)= 전수 실재**: bank.js/cardExpenses.js 추가 POST/PUT(`/api/bank/{accounts,sync-barobill}`·`/api/card-expenses/{cards,cards/:id,sync}`) 전부 백엔드 라우트 실재(bank.ts:55/137/223/413·cardExpenses.ts:59/130/195/256, requireRole('ADMIN')). 죽은 버튼 0.
> - **🟢 showConfirm 콜백 오용 전역 스캔 = 0건**: 143 호출 중 142 await/then 정상형, 콜백-2번째-인자 오용 0(#426 회귀 0).
> - **🟢 backlog↔GitHub sync**: open auto-improve **실측 1건**(#439, list_issues 전수) = 직전 Area2 stats `new=1` **정합**. owner 신규 close/머지 0(done=139·rejected=3 유지). #439는 owner 영역(git 권한/backlog 트림 B옵션) — 본 사이클 push는 정상 동작(영속화 가능). **단 backlog 316KB 여전히 Read 한도 초과 = #439 옵션B(아카이브 트림) 유효성 재확인**.
> - **🧬 SKILL 강화 0건**: 신규 탐지 패턴 미발견 — 기존 standing scan(axios-route line 117·showConfirm line 122·로딩표시 line 120·빈상태 line 96)이 신규 feature를 전수 커버. 회계 허브가 처음부터 컨벤션(dsSkeleton·빈상태·getElementById 가드·필터 라운드트립)을 일관 준수 = Area 6 line 234 "신규 feature가 컨벤션 따르면 clean" 클래스.
> - **이상 없음**: git 동기 0/0·push 동작. 회계 허브 신규 feature(527L 프론트) UX/기능 전수 clean(로딩/빈상태/confirm/필터/권한). axios-route·showConfirm·필터 라운드트립 net-new 0. sync 1=1. 억지 findings 회피.
> - 자동 수정 0건(Area 3 issue-only), 신규 이슈 0건(회계 허브 clean), SKILL 강화 0건, done-sync(변동 0, 1=1 정합), **신선 각도 — 회계 통합 허브 6탭 신규 프론트(accounting.js 527L) 첫 UX/기능 감사 + axios-route/필터-라운드트립/showConfirm 표준 스캔, 프로덕션 영향 0 확인**
>
> **Area 1 프로덕션 헬스 (2026-06-24T02:00):**
> - **방법**: git fetch-before-compare(origin force-update `4993fa7→0e7b886`, fetch 후 **HEAD=origin/main `0e7b886` 0/0 동기**, 디버전스 0). egress 차단(prod/Playwright/verify[node_modules 부재] 도달 불가)이라 CI 결과 + 정적 배선 감사. Area 1 **22회차** — **신선 각도 = 직전 사이클(d614564) 이후 최대 churn = 회계 통합 허브 `/accounting` Phase1~4(`02dfe2d`+`13fb4e2`, 6탭) + 품목 신모델 마이그 0374~0378.**
> - **🟢 CI/배포 = 전량 green**: 최근 워크플로 run 전수 `completed/success` — 회계 허브 Phase1~4(`02dfe2d`·`13fb4e2`) 포함 모든 Deploy success, 커밋 메시지 `smoke 101/101` 명시. Daily D1 Backup도 success. **신규 prod-breaking 회귀 0.**
> - **🟢 회계 허브 신규 feature 배선 검증**: `/api/accounting` 라우터 마운트(index.tsx:326) + 페이지 `pageAuthMiddleware`+`requirePagePermission('/accounting')`(:472) + 권한 마이그 `0374_accounting_hub_permission` + accounting.ts(15.8KB) 실재. **인증/권한 게이트 정상**(무인증·무권한 도달 차단).
> - **🟢 DROP/RENAME 마이그 churn = 0**: 0374~0378 전부 additive(권한 INSERT + 품목/자재 데이터 마이그) — `DROP TABLE/COLUMN/RENAME` 0건 → smoke 맹점 2종(line 40 write-path)이 노출될 스키마 churn 없음. #438 마이그 0373 중복은 owner `19610de`로 0375/0376 리넘버 해소(close-completed).
> - **🔴 루틴 plumbing 장애 = #439 재확인(본 사이클이 2연속 Area-1 = 무한루프 입증)**: 직전 Area 1 런이 backlog 갱신(last_run_area 6→1)을 **git push 못 해**(프록시 401→403, fetch는 OK) origin `last_run_area`가 6 고정 → 본 스케줄 런이 **다시 Area 1 실행**(예측된 무한 Area-1 루프 실현). push_files API 우회도 backlog 318KB(>256KB Read 한도)라 막힘. **프로덕션 무영향**(헬스 정상), 단 6영역 순환·영속화 불능. owner 조치 필요(git write 권한 복구 또는 backlog 아카이브 트림). 신규 이슈 안 만들고 #439 재사용(중복 회피).
> - **🟢 backlog↔GitHub sync**: open auto-improve **실측 5건**(#430·#435·#436·#437·#439, list_issues 전수). 직전 stats `new=5`(#430·#435·#436·#437·#438)에서 **#438 owner close-completed**(`19610de`) → done 134→135, #439(직전 Area1 생성) new 편입 → net 5 유지. rejected=3. #422 디버전스: HEAD=origin/main 동기(`0e7b886`)라 미push 픽스 0.
> - **이상 없음(프로덕션)**: CI 전량 green, 회계 허브 완전 배선, DROP 마이그 0, sync 5=5. **루틴 자체 blocker(#439)만 미해소** — 이는 owner 영역(git 권한/backlog 트림).
> - 자동 수정 0건, 신규 이슈 0건(#439 재사용), done-sync(#438 close-completed 이관 134→135), **신선 각도 — 회계 허브 신규 feature 배선 + 신모델 마이그 churn 헬스, 프로덕션 영향 0 확인. 단 본 사이클도 push 실패 시 backlog 영속화 불가(아래 commit/push 시도 결과 참조).**
>
> **Area 2 코드 품질 심층 분석 (2026-06-24T06:00):**
> - **방법**: git fetch-before-compare(origin force-update `4993fa7→405c72f`, fetch 후 **HEAD=origin/main `405c72f` 0/0 동기**, 디버전스 0). **git push 동작 확인됨**(#439 owner 코멘트: 02:00 Area1 런 push 성공, transient였음 → 본 사이클 정상 push 가능). egress 차단(prod/Playwright/verify[node_modules·tsc 부재] 도달 불가)이라 정적 스캔. Area 2 **21회차** — **신선 각도 = 직전 사이클 이후 최대 churn = 회계 통합 허브 신규파일 `accounting.ts`(02dfe2d+13fb4e2, 328L 4엔드포인트) + 바로빌 `barobill.ts`(159L) — 둘 다 Area2 미감사 신규 feature 파일.**
> - **🟢 신규 feature 파일 2종 = clean**: `accounting.ts`(summary/payments/purchases/timeline) — read-only, `authMiddleware+requireRole('ADMIN','MANAGER')`(:23), **전 쿼리 entityFilter 적용**(efG/efCt/efPi/efP/efA 등), 참조 컬럼 전수 ground-truth 대조 통과(card_transactions.approval_type/merchant_name·order_billing_groups.billed_amount·purchase_invoices.total_amount/supplier_id·payments.*·adjustments.amount·corporate_cards.is_active/card_name 모두 실재). `barobill.ts` — 외부 금융 API read-only 프록시, auth+role, 법인별 corpNum 스코프(getEntityCorpNum), DB write·컬럼위험 0.
> - **🔧 자동수정 1건 (entity_id INSERT 누락) — `c6c6f00`**: `cards/lifecycle.ts:176` `PATCH /bulk/status`의 HOLD+불량 자동 `quality_issues` 생성 INSERT가 **entity_id 미지정** → `NOT NULL DEFAULT 1`(0222)로 고정 → 타 법인(청주 등) 카드 불량이 **entity_id=1로 오귀속**, 해당 법인 품질통계(`cards/queries.ts:695` entityFilter)에서 누락/오집계. **같은 파일 sibling INSERT(:506 `/defects`·:601)는 이미 `getEntityId(c) || 1` 적용** = 본 건만 빠진 부분픽스 잔재(#384 entity_id 클래스). `getEntityId` 기존 import·사용 중이라 컴파일 안전(sibling과 동일 패턴), bulk SELECT가 entity-scope(efBulk)라 모든 카드=호출자 법인. 자동수정 직접 적용.
> - **🟢 entity_id INSERT 전수 스캔 = net-new 0(위 1건 외)**: 322+ 마이그 ground-truth(entity_id 보유 테이블) ↔ 전 routes `INSERT INTO <ent_table>(collist)` 멀티라인 파싱 → entity_id 미포함은 lifecycle.ts:176 단 1건(=자동수정). 나머지 전부 명시 또는 트리거/디폴트 처리.
> - **🟢 단일테이블 명시-SELECT 컬럼존재성 = net-new 0(2 FP)**: `bank_match_rules.matched_category_id`×3 = **FP**(0270 table-rebuild `bank_match_rules_new`→RENAME로 실재, 파서가 rebuild RENAME 미추적한 한계) · `insurance_rates` `NULL` 리터럴 = FP(파서가 NULL을 컬럼으로 오파싱). 실제 미존재 컬럼 0.
> - **🟢 authMiddleware 커버리지 = clean**: NO-AUTH 그렙 8건 전부 **배럴 aggregator**(orders/ledger/payroll/taxInvoices/purchaseOrders/accounts-receivable = 서브라우터 mount, 서브가 auth 보유) 또는 **의도적 public**(hrSelf self-auth 토큰·webhooks 외부콜). 실제 인증 누락 0.
> - **이상 없음**: git 동기 0/0·push 동작. 신규 feature(accounting/barobill) clean. column/auth 스캔 net-new 0. **유일 발견 entity_id 누락 1건은 안전 자동수정(`c6c6f00`).**
> - 자동 수정 1건(lifecycle.ts:176 entity_id, `c6c6f00`), 신규 이슈 0건, done-sync(owner #430·#435·#436·#437 close-completed `f9587c5` → done 135→139, new 5→1), **신선 각도 — 회계 허브+바로빌 신규 feature 파일 첫 Area2 감사 + entity_id/컬럼/auth 표준 스캔, 프로덕션 영향 0(자동수정은 데이터 귀속 정합 개선) 확인**
>
> 📦 *(06-17~06-23 사이클 로그 9건은 3차 트림으로 git 히스토리 이관 — 위 아카이브 노트 참조)*

>
## ✅ Approved / 👀 Reviewed (owner 피드백 수신)

> **👀 Reviewed 1건 (owner 피드백 수신, 미구현)**:
> | ID | 제목 | 영역 | Issue | owner 피드백 |
> |----|------|------|-------|------|
> | I-060 | [improvement] CSV export 5곳 `LIMIT 5000` 무경고 silent truncation — 정산/감사 다운로드 불완전 가능 | Area 3 | #372 | "3번으로 진행해줘 최대 페이지 표시수량을 5000으로 제한하고 사실상 5000을 넘는 경우는 많이 없을것 같은대"(06-11T00:25). ⚠️**모호**: #372 옵션3=페이지네이션 스트리밍(전량 다운로드)인데 "5000 제한 유지"와 모순 → 구현 전 owner에게 의도 확인 필요(옵션1 잘림경고 + 5000 유지를 뜻하는 듯). 승인처리 워크플로우에서 처리. |
>
> (이전 approved 2건 #340 I-030·#342 I-032은 06-09 구현·close 완료 → Done 표 이관, Area 6 06-09T22:00.)

## 🆕 New (미검토)

> 전부 GitHub open + 👍 미수신. 용준님 리뷰 대기. (open **실측 11건** — 2026-06-12T12:00 Area 6. #377·#378 done-sync close로 13→11, #372는 reviewed 별도)

| ID | 제목 | 영역 | Issue | 공수 |
|----|------|------|-------|------|
| I-074 | [MED bug] split billing 출고/재고 stored 업무일자 raw date('now') UTC off-by-one — billable_after(shipments.ts:814·queries.ts:251)·auto_complete_date(:815/:252)·fifo receipt_date(inventoryValuation.ts:105). KST 00~09시 작업분 전일 영구기록(stored), #366(b8d2f0d)이 처분일/order_date는 보정했으나 이 3종 미처리. 회계/COGS 귀속 1일 밀림 | Area 4 | #388 | ~1h |
| I-073 | [MED bug] split billing 청구그룹 동결 order-wide — recalcOrderBillingGroups freeze(helpers.ts:60-64)가 BILLED/PAID 1개라도 있으면 전 그룹 동결. 혼합주문 부분청구 후 미청구 entity 품목 편집 시 그룹 미갱신 → createSplitInvoices가 stale 금액 청구. 정책 결정 필요(NULL그룹만 recalc/편집차단/경고) | Area 4 | #387 | ~2h |
| I-072 | [MED bug] split billing DRAFT 계산서 삭제가 obg.tax_invoice_id 미정리 — createSplitInvoices(helpers.ts:422)는 링크하나 manage.ts:140 DELETE는 미정리 → dangling. 취소 경로(issue.ts:707)는 정리=비대칭. issue.ts:261 재링크 차단 + 주문상세 phantom 노출 | Area 4 | #386 | ~20m |
| I-071 | [HIGH bug] printEvents.ts `SELECT entity_id FROM cards` 5곳 — cards엔 `requesting_entity_id`만(존재X 컬럼). node:sqlite empirical=`no such column` **throw**(NULL 아님). cardId 매칭 성공 시 print_events/print_file_map 기록 500 + quality_issues 침묵 미생성 + 미throw경로 entity 1 고정(법인 오귀속). #377/workbench와 동일 컬럼오타 클래스 | Area 2 | #384 | ~1h |
| I-070 | [LOW-MED bug] 출고 알림톡 품목요약 card_id 경유 단일조인 — `kakao.ts:459` shipment_items를 card_id→cards→order_item_id로만 조인 → 주문단위 출고(card_id NULL) 품목명 누락 "제품" 폴백. 수정=COALESCE 양 경로 | Area 2 | #385 | ~30m |
| I-069 | [improvement] shell.js 정적에셋 외부화 **불완전 revert** — 런타임은 `layout.ts:181` `?raw` 인라인 복귀(prod green)인데 `build-assets.mjs`가 매 빌드마다 dead `/static/shell.<hash>.js`(소비처 0)·미사용 `ASSET_MANIFEST`(import 0) 생성 = 재외부화 오배선 시 MIME 2회다운 재현 트랩. #382(게이트 방어)의 보완(트랩 제거) | Area 1 | #383 | ~30m |
| I-068 | [improvement] 배포 게이트 `smoke.cjs`는 `/api/*` 전용 — 프론트 부트스트랩/MIME 장애를 못 잡아 shell.js 2회 prod 다운이 "Deploy 성공"으로 통과(E2E만 ~5분 후 적발). smoke에 경량 프론트 단언(`/` HTML 200+text/html+셸 마커) 추가 | Area 1 | #382 | ~1h |
| I-067 | [HIGH bug] orders 쓰기 엔드포인트 entity 격리 비대칭(IDOR) — read/delete는 격리, billing-status/cancel/PUT/bill/status/output-folder는 무필터 `WHERE id=?` → 멀티법인 MANAGER가 타법인 주문 청구/취소/balance 조작. 청구분할(72bd97e) PUT이 쓰기 증폭 | Area 5 | #381 | ~2h |
| I-065 | [improvement] printSystem N+1 2곳 — /media/bulk(2중루프 건별 SELECT, media id 메모리 보유라 재조회 불요)·/repair-links(3중 N+1 ~3000쿼리). setup/repair 저빈도 LOW | Area 2 | #379 | ~1.5h |
| I-062 | [improvement] 배포 스모크 로그인 단일시도(재시도 부재) → cold-start 일시 500이 deploy 게이트 파손 + E2E skip. bounded 재시도 or health warm-up ping | Area 1 | #374 | ~30m |
| I-061 | [MED bug] 입고검수 CANCELLED 시 재고만 역분개·PO status/received_quantity 미롤백 → PO 영구 RECEIVED 잔류 + 취소수량 재입고 불가(400 차단). #369(재고측)와 별개 PO측 롤백 | Area 4 | #373 | ~1.5h |

> ✅ 직전 New 8건(#336·#341·#350·#358·#359·#360·#362·#363) + Approved 2건(#340·#342) + 무ID close 7건(#361·#364·#365·#366·#367·#368·#369)은 Area 6(06-09T22:00) 전수 검증 후 **17건 전부 done 확정** → Done 표 이관.

---

## 🔧 Auto-fixed (자동 수정 완료)

| ID | 제목 | 커밋 | 날짜 |
|----|------|------|------|
| A-019 | #377 잔여분 — 주문생성 자동가공 `orders/create.ts:643` `SELECT id, name FROM items`(존재X 컬럼)→`item_name`. #377 원 위치(core.ts:1489)가 파일분할로 create.ts D.자동가공 블록으로 이동했고 owner 픽스 eadba44는 autoProcess.ts만 정정·이 경로 누락 → best-effort catch(:695)에 삼켜져 `auto_process_jobs` 미생성 지속. autoProcess.ts:96·eadba44와 동일 정정. 휴면 write 활성화 우려는 eadba44의 `ia_auto_enabled` 게이트(0308 기본 OFF)로 이미 해소(서빙 게이트라 job 생성돼도 미노출). 안전 자동수정(컬럼 사실-정정 A-017 클래스 + owner 승인 정정의 누락분 완성). verify PASS(tsc clean+build 391) | 96e98d2 | 2026-06-12 |
| A-018 | 대시보드 납기준수율 KPI 라벨 오기 정정 — `scripts/dashboard.js:47`이 skeleton 교체 시 KPI 그리드 재구성하며 "이번 달 **출고 기준**" 노출, 권위 서버템플릿 `pages/dashboard.ts:85`/title은 "**납기 기준**". #380 수정(6b06512) 후 메트릭이 `delivery_date` 기준 월버킷이므로 "납기 기준"이 정답 → JS 라벨을 권위본에 정합. 사실-정정+기존 사본 정렬(A-014 클래스), 동작/데이터 무변 텍스트만. verify PASS(tsc clean+build 383) | (이번 커밋) | 2026-06-11 |
| A-017 | workbench.ts 존재하지 않는 컬럼 `cl.name` 3곳(`:22/28/56`) → `cl.client_name`. clients 테이블은 `client_name`만(0001:45, `ADD name` 0건 ground-truth) → 매 호출 `no such column: cl.name` throw로 신규 workbench 시안검수 페이지(b0df71c) 주문목록/검색 전체 500. read-only SELECT + 응답 alias 이미 `as client_name`(형식 불변) + 외부효과·entity 귀속 무관 = 안전 자동수정(↔#384는 쓰기/멀티테넌시라 이슈). verify PASS(tsc clean + build 369 modules) | (이번 커밋) | 2026-06-11 |
| A-016 | shell.js 정적에셋 prod 2회 장애 복구 — `9dd09cd` 파일럿이 shell.js를 `/static`으로 외부화했으나 CF Pages **Git 자동빌드**에서 `_routes.json`의 `/static/* 제외`가 미적용 → 워커가 `/static/shell.js`를 Content-Type 빈값('')으로 서빙 → 브라우저 strict MIME 실행거부 → `shell.js` 사망(전 페이지 axios 인증헤더/법인스위처 초기화 실패, 401+무한로딩). `144addf`의 `_headers` Content-Type 명시 시도는 자동빌드 환경서 불충분 → **최종 해결 = 인라인 `?raw` 복귀**(`/static`·`_routes.json`·빌드순서 의존 전무, 워커 +75KB 안정성 우선). (직전 세션 픽스, Area 6 기록 보충) | 24bb493 (144addf 경유) | 2026-06-11 |
| A-015 | files.ts 업로드 R2 키 sanitize — `${folder}/${analysisId}/${file.name}` raw 조합(3요소 클라 제어, 키 인젝션) → A-013 패턴 정규화 (orphan, 동작 무변) | (이번 커밋) | 2026-06-05 |
| A-014 | silent-fail JS 버그 3건 — HR 직원검색 `q`→`search`(핵심검색 무력) + 홈택스 페이지네이션 총건수 0(`data.total`→`pagination.total`) + 홈택스 날짜 파라미터 `start_date`→`date_from` | (이번 커밋) | 2026-06-04 |
| A-013 | aiAnalysis 업로드 R2 키 `file.name` sanitize — path traversal/헤더 인젝션 방어(LOW, ADMIN전용) | (이번 커밋) | 2026-06-03 |
| A-012 | CAPS `GET /settings` 시크릿 노출 차단 — `relay_db_password`+`worker_api_key` 응답 제거(GET /sites 패턴 정렬) | (이번 커밋) | 2026-06-03 |
| A-011 | 재고 목록 "총 N개 품목" 집계 버그 — 페이지 slice 건수(최대 20) 대신 `pagination.total` 전체 COUNT 표시 | 44bd3ed | 2026-06-03 |
| A-010 | Deploy 차단 복구 — wrangler `--commit-message=<sha>` 고정 (한글 커밋메시지 100B 절단→UTF-8 깨짐 차단) | e396f2e | 2026-06-03 |
| A-009 | PO 번호 생성 entity 필터 누락 3곳 → 정규 시퀀스 경로 정렬 (reorder/quick/templates) | e8c8992 | 2026-06-02 |
| A-008 | try-catch 누락 17핸들러 (permissions/finishing/messageTemplates/iaAuto) | 60ee8b8 | 2026-05-14 |
| A-006 | XSS escapeHtml 5건 (approvals/invoice/purchaseInvoice/quotation/clients) | e099b20 | 2026-05-13 |
| A-005 | tax_invoice_items/orders tax_invoice_id 인덱스 추가 (0193 migration) | 1b3a698 | 2026-05-13 |
| A-004 | models.ts 미사용 타입 8개 제거 (UserSession 등) | 2f94080 | 2026-05-13 |
| A-003 | hono 4.12.18 + postcss 8.5.14 보안 패치 (JWT CVE 등 7건) | 16b1482 | 2026-05-12 |

---

## ✔️ Done (처리 완료)

| ID | 제목 | 커밋/Issue | 날짜 |
|----|------|-----------|------|
| I-064 | 출고 알림톡 일괄발송 부분/전체 실패 "N건 발송 완료" 오보고 — send-shipment-bulk 응답에 status(SUCCESS/PARTIAL/FAILED)·sent_count(실성공)·fail_count·failures[] 추가 + interpretBulkResult 건별 results[] + 프론트 결과모달(실패건 재발송). Area 6(06-12) 코드 직접 대조 후 close | #378 / 9be309d | 2026-06-12 |
| I-063 | AI 주문 자동가공 `auto_process_jobs` 침묵 실패(items.name 존재X 컬럼 throw) — 수동경로(autoProcess.ts /start·/approve)는 eadba44에서 item_name 정정+ia_auto_enabled 게이트, 주문생성경로(create.ts:643 잔여분)는 Area 6 A-019(96e98d2)에서 정정. 두 경로 완료 후 close | #377 / eadba44+96e98d2 | 2026-06-12 |
| I-066 | 대시보드 납기 준수율 KPI 2중 결함 — 결함1(updated_at 출고일 프록시)→`COALESCE(MAX(shipments.shipped_at),MAX(cards.shipped_at),updated_at)` 권위 출고일 + 결함2(SHIPPED 분모만)→`IN('SHIPPED','COMPLETED')` + 월귀속 created_at→delivery_date. Area 3(06-11) git 직접 검증 후 close. 라벨 정정(A-018) 동반 | #380 / 6b06512 | 2026-06-11 |
| I-061b | 입고검수 전량취소(inspection-decision CANCELLED) 멱등 가드 부재 + 비원자 재고 이중차감 — `inventory.ts:414-421` 멱등 가드 + 단일 batch 원자화. (#373=PO측 롤백은 별개 open) | #369 / d1c8b89 | 2026-06-09 |
| I-059 | 업무일자 UTC `date('now')` KST 미보정 — 표시층 formatKST 일괄 + 대시보드 created_at KPI + 회계 DATE컬럼 day-boundary KST 보정. 백엔드 자기일관 churn은 owner 디프리오 | #366 / b8d2f0d·7b64d04 | 2026-06-09 |
| I-058 | storage-zones 목록 `all_entities=1` 쿼리파라미터로 entity 격리 우회(IDOR 11번째, 역할검증 없이 필터 무력화) | #368 / b6d845d | 2026-06-09 |
| I-057 | CSV Formula Injection — 모든 CSV 내보내기 `=+-@` 선행 미가드 → 공용 `escapeCsvField` 단일화 가드(음수금액 숫자-안전) | #367 / 06ff136 | 2026-06-09 |
| I-056 | /api/files/* 범용 R2 프록시 격리 우회(HIGH) — 인증만 통과하면 임의 역할·타법인 전 파일 다운로드 | #365 / b2b170a | 2026-06-09 |
| I-055 | 죽은 레거시 테이블 inventory_items 잔존(LOW cleanup) — `0301_drop_inventory_items.sql` prod 0행 확인 후 DROP | #364 / f9c7ee4 | 2026-06-09 |
| I-054 | autoProcess 멀티테넌시 IDOR 비대칭(클러스터 10번째) — /pending만 entityFilter, 변경 핸들러 무가드 | #361 / b2b170a | 2026-06-09 |
| I-052 | 주요 데이터 로드 실패 시 스켈레톤 영구 잔류 + 에러피드백 전무 — 대시보드/지출결의서 catch-UX 보강 | #362 / b2b170a | 2026-06-09 |
| I-051 | CSV 내보내기 일관성 갭 — 발주요청·입고이력·자금계획 export 추가(peer 정합) | #363 / b2b170a | 2026-06-09 |
| I-050 | 멀티테넌시 IDOR 비대칭(HIGH) — quotations + 법인카드 corporate_cards /:id 격리 보강 (#356 8~9번째) | #360 / b2b170a | 2026-06-09 |
| I-049 | 지출결의서 목록 LIMIT 200 하드캡 → 페이지네이션·총건수 추가(silent truncation 해소) | #359 / b2b170a | 2026-06-09 |
| I-048 | 전자결재(approvals) 멀티테넌시 격리 갭(HIGH, #356 7번째) — list만 entityFilter였던 GET/:id·approve/reject 전 계열 entity 격리 (발주 9핸들러 포함) | #358 / 16915ed | 2026-06-09 |
| I-040 | N+1 신규 클러스터 — 급여 일괄/근태동기화 핫패스(전직원×5~7쿼리) + 발주 품목 루프 batch 전환 | #350 / 108b738 | 2026-06-09 |
| I-031 | N+1 batch 미전환 — PR→PO 변환 recentPO N+1 제거 + child INSERT batch (cashFlow 핫패스) | #341 / ba53c76 | 2026-06-09 |
| I-032 | rip.ts 설비 자식 테이블 entity_id 배선 — 설비 법인 격리 적용(스키마+로직+데이터보정). 직전 approved | #342 / 5e97f82 | 2026-06-09 |
| I-030 | E2E 프로덕션 crud-order 운영데이터 오염 격리 — afterAll cleanup(소프트취소+하드삭제 2회)로 prod 누적 0. cold-start 픽스처는 owner 별도 분리. 직전 approved | #340 / e8429cb | 2026-06-09 |
| I-028 | CI 폴백 자격증명 admin/password — 코드측 평문폴백 제거(a7a15cc). owner **위험수용 close**(pbkdf2 해시저장 확인, admin/password 테스트전용 간주) | #336 / a7a15cc | 2026-06-09 |
| I-046 | 멀티테넌시 격리 갭 6모듈 — /:id 상세·변경 entityFilter 보강 + inventoryCount/leaves 차감을 row entity_id 기준화(호출자 아님)로 교차훼손 차단. 코드검증: insuranceReports entityFilter 6회 | #356 / 6a8cb35 | 2026-06-05 |
| I-047 | 파일 업로드 검증 부재 — `utils/uploadValidation.ts` 신설(size/MIME/ext 화이트리스트) cardExpenses/po/files 적용 + receipt-image path-traversal 가드. 코드검증: 파일 존재 | #357 / 3baa38a | 2026-06-05 |
| I-027 | 저장형 XSS — escapeHtml 클라 7스크립트 + 서버템플릿 2종 + portalLayout 전역주입. portalBalance.js 잔여는 free-text 싱크 부재로 비대상(Area 6 검증) | #335 / da5f0ca | 2026-06-05 |
| I-041 | hr.ts 레거시 급여 endpoint 2개 제거(POST가 미존재 payrolls 테이블 INSERT→크래시, 호출처 0). 코드검증: `INTO payrolls` grep 0 | #351 / 9fdfdf4 | 2026-06-05 |
| I-042 | 현금영수증 탭 필터 무력 — 중복 element ID를 cr* prefix로 셰도잉 해소 + 날짜 파라미터 date_from/date_to 정렬. 코드검증: cashReceipts.js cr* 4개 | #352 / a742d27 | 2026-06-05 |
| I-033 | Dead-filter 3건 — 지출결의 날짜·포털주문 상태(869fcf9) + 생산 출력이력 장비/상태/날짜(printEvents 연결) | #343 / 0c04fad | 2026-06-05 |
| I-034 | 포털 셀프서비스 3건 — 세금계산서 PDF다운로드+페이지네이션 / 미수금 aging / 재주문 모달 | #344 / 0ce9c42 | 2026-06-05 |
| I-035 | 회계 내보내기·검색 — 세금계산서 CSV+지출결의 지급처/사유 검색(29e9fbc). ⚠️**정정(Area6 06-07)**: cashSchedule CSV는 29e9fbc에서 "LOW 미처리" 명시로 **미구현** → #363으로 신규 추적 중 (기존 "월별 CSV done" 기록은 부정확) | #345 / 29e9fbc | 2026-06-05 |
| I-036 | 필터·드릴다운 — 연차 부서필터 + 불량률→검수 드릴다운 + 미사용수당 응답정합 버그(48명 정상렌더) | #346 / 0c04fad | 2026-06-05 |
| I-043 | Dead-filter 클러스터 2탄 — 생산보드/원가/메시지/활동로그/매입/휴가 6건 백엔드 필터 UI 활성화+페이지네이션 | #353 / 0c04fad | 2026-06-05 |
| I-044 | 검수결과 목록 — 공급업체 드롭다운·결과상태·검수일범위·페이지네이션·CSV export(원시 ID 입력 해소) | #354 / 0c04fad | 2026-06-05 |
| I-045 | 여신초과 주문 전면실패 — owner가 (가)안 0300 마이그(approval_requests/templates 재빌드, CHECK에 CREDIT_OVERRIDE 추가)로 해소. ground-truth 재적용+INSERT 컬럼 정합 실측 검증 | #355 / 0300 | 2026-06-05 |
| I-025 | order_templates orphan 라우터 — 도달성 규칙으로 dead-code 재분류→owner (가)승인→삭제(templates.ts+drop마이그 0297, prod 404 확인) | #334 / a7a15cc | 2026-06-04 |
| I-026 | 하드코딩/약한 자격증명 — `fallback-dev-key` 제거(requirePiiKey 4곳) + reset-password 기본값 'password' 제거→필수화(400) | #338 / a7a15cc | 2026-06-04 |
| I-029 | 프로덕션 debug 엔드포인트 — `/api/debug/cards` 제거 + db-test/stats error.message 제네릭화 | #337 / a7a15cc | 2026-06-04 |
| I-039 | hr.ts 멀티테넌시 격리 갭 — 단건GET/detail/증명서 entityFilter 보강 + PUT entity_id mass-assignment 차단(item3 GET/payrolls는 #351 dead-code) | #349 / a7a15cc | 2026-06-04 |
| I-037 | cards.status CHECK 분기 — 0284/0296(7값 superset)+0298(레거시 상태 이관)로 해소, lifecycle.ts PRINT_ERROR→rip_status 처리 | #347 | 2026-06-04 |
| I-013 | 보안 헤더 추가 (X-Frame-Options/X-Content-Type/Referrer-Policy, HSTS/CSP 보류) | #32 | 2026-05-13 |
| I-014 | /api/portal/auth/change-password rate limit 적용 | #33 | 2026-05-13 |
| I-015 | XSS 잔여 escapeHtml 39개소 (approvals.js 24 + cards.js 15) | #34 | 2026-05-13 |
| I-016 | 대시보드 E2E 추가 (e2e/dashboard.spec.ts, 0e67ac6) | #35 | 2026-05-14 |
| I-018 | N+1 printSystem.ts batch 적용 (채번 필요부는 순차 유지) | #37 | 2026-05-14 |
| I-019 | N+1 settings.ts + priceLists.ts assign-clients | #38 | 2026-05-14 |
| I-020 | SELECT * 잔여 정리 (157→8건) | #39 | 2026-05-14 |
| I-021 | approvals 결재 페이지 — 기존 업무흐름 결재 연계로 확장 (owner 논의) | #43 | 2026-05-14 |
| I-022 | tasks.js 작업큐 — 사이드바 통합 검토 (owner 논의) | #44 | 2026-05-14 |
| I-023 | deliveryAnalytics + financialReports CSV 내보내기 | #45 | 2026-05-14 |
| I-024 | 장비 가동률 KPI — 근무시간 기반 가동시간 측정으로 확장 (owner 👍) | #46 | 2026-05-14 |
| I-017 | try-catch 누락 17핸들러 자동 수정 (permissions/finishing/messageTemplates/iaAuto) | A-008 / 60ee8b8 | 2026-05-14 |
| D-001 | shipment_items UNIQUE(shipment_id, card_id) 제약 추가 (0194 migration) | #31 | 2026-05-13 |
| I-015partial | 스모크 커버리지 55→88 엔드포인트 확대 | #15 | 2026-05-13 |
| I-012 | 원단 소모 예측 페이지 검색+상태 필터 추가 | #30 | 2026-05-13 |
| I-011 | 대시보드 전면 재설계: 납기 준수율 KPI + 생산 파이프라인 + KPI 클릭 연결 7개 | #29 | 2026-05-13 |
| F-006 | 주문 상세 모달 "카드 현황" 버튼 추가 | #28 | 2026-05-13 |
| F-005 | 출고 목록 거래처 헤더에 "계산서 발행" 링크 추가 | #27 | 2026-05-13 |
| I-010 | SELECT * 145건 제거 (178→6건, 96%) | #26 | 2026-05-13 |
| A-008 | priceList.ts + inspections.ts N+1 → db.batch() 전환 | #25 | 2026-05-13 |
| A-007 | inventory.ts 입고/출고/취소 N+1 3패턴 → batch 전환 | #24 | 2026-05-13 |
| B-010 | inventoryCount.ts 재고 실사 N+1 → db.batch() 전환 | #22 | 2026-05-13 |
| B-009 | taxInvoices.ts O(N×M×K) 중첩 N+1 → batch 전환 | #21 | 2026-05-13 |
| B-008 | shipments.ts N+1 → db.batch() 전환 | #20 | 2026-05-13 |
| B-007 | prices.ts + rip.ts Promise.all N+1 → IN절 일괄 조회 | #19 | 2026-05-13 |
| B-006 | entity_id 누락 10테이블 (0193 migration + INSERT 16건) | #18 | 2026-05-13 |
| I-007 | as any 902→45 (95% 제거, 9 커밋) | #17 | 2026-05-13 |
| B-005 | printEvents.ts N+1 → 이벤트당 5~7→3~4 쿼리 축소 | #16 | 2026-05-13 |
| I-008 | 스모크 커버리지 확대 (3개 자동 추가) | #15 | 2026-05-12 |
| A-002 | smoke.cjs 3개 엔드포인트 추가 (quotations/hometax/search) | 256e37c | 2026-05-12 |
| A-001 | entity_id INSERT 14건 누락 | c7c20d3 | — |
| B-001 | cards entity_id 격리 | 0960a5a | #1 |
| B-002 | LogWatcher URL + 서비스 실행 | (설정 수정) | #2 |
| B-003 | SHIPPED 카드 확인 모달 | 3dd4274 | #11 |
| B-004 | cards entity_id NULL 32건 보정 | (prod SQL) | #12 |
| I-001 | bank.ts N+1 제거 | 0960a5a | #3 |
| I-002 | autoProcess.ts N+1 제거 | 0960a5a | #4 |
| I-003 | approvals.ts N+1 제거 | 0960a5a | #5 |
| I-004 | clients API 응답 통일 | 0960a5a | #6 |
| I-005 | 로그인 rate limit 적용 | 44c1f04 | #13 |
| I-006 | hr.ts 에러 메시지 제네릭화 | 44c1f04 | #14 |
| F-001 | 거래처 필터 5개 | 575312d | #7 |
| F-002 | 주문 필터 CANCELLED 해소 | 575312d | #8 |
| F-003 | 대시보드 KPI 5개 | 575312d | #9 |

## ❌ Rejected

| ID | 제목 | 사유 | Issue |
|----|------|------|-------|
| I-009 | vite/esbuild dev server SSRF (GHSA-67mh) | "로컬 서버 전용이라 크게 문제 없음" — 프로덕션 영향 없음 | #23 |
| F-004 | 납품시간 disabled 이유 표시 | 용준님: "필요 없음" | #10 |
| I-038 | 전역 UNIQUE가 entity 복합 UNIQUE 무력화 (다법인 번호충돌 잠복) | owner not_planned — 운영 entity 1 수렴, 의도적 보류 | #348 |

---

## 오탐(False Positive) 패턴 — 탐지 제외 목록

> auto-improve 및 security-audit 실행 시 이하 패턴은 이슈 등록 금지.

| 패턴 | 이유 | 첫 발견 |
|------|------|----------|
| `webhooks.ts` `allowedPrefixes` Popbill IP 목록 | 의도적 보안 화이트리스트, 하드코딩 아님 | Area 5 (#20) |
| dev server 전용 취약점 (vite/esbuild SSRF 등) | 프로덕션 영향 없음, 개발자 PC 전용 | Area 1 (#23 거절) |
| disabled 필드에 이유 힌트 없음 | 용준님: 불필요 (F-004 거절 패턴) | Area 3 (#10 거절) |
| CORS `!origin → '*'` (`index.tsx:213`) | Bearer 토큰 인증(쿠키 미사용) — 브라우저는 항상 Origin 전송, 실질 무해 | Area 5 (2026-06-02) |
| rate limiter in-memory `Map` (`rateLimit.ts:6`) | isolate 분산 한계는 기존 인지 아키텍처 제약, 신규 이슈 아님 | Area 5 (2026-06-02) |
| 인덱스/UNIQUE 누락 후보 (ground-truth 미확인) | 로컬 D1 실제 스키마로 반증 필수 — 대부분 이미 존재하거나 hot path 아님 | Area 4 (2026-06-02) |
| orphan 라우터의 entity_id 격리 갭 (프론트 호출처 0건) | UI 도달 불가 = dead code 사안이지 보안 아님. 격리 갭 보고 전 `grep "api/<path>" src/scripts src/pages` 도달성 선검증 필수. **⚠️ 예외(#365)**: 클라 제공 키로 raw 리소스 서빙하는 범용 프록시(R2 파일 `files.ts` GET `/*` 등)는 0-refs여도 인증된 직접 HTTP 호출이 공격표면 → dead-code 강등 금지, 보안 이슈 | Area 6 (#334, 2026-06-04 / 예외 #365 2026-06-07) |
| 비원자적 다중 INSERT "고아 가능" (확정 실패 트리거 부재) | 부모→자식 별도 `.run()`이라도 자식 테이블에 CHECK/NOT-NULL 위반 등 **확정적 실패 트리거가 없으면** 거의 모든 다중문 코드에 해당하는 일반적 비원자성일 뿐 = 노이즈. #355류로 보고하려면 100% 실패하는 구체 트리거(CHECK 누락 리터럴 등) 실증 필요. order_items는 CHECK 0·전컬럼 nullable이라 견적전환/복사 비원자성은 오탐 | Area 4 (2026-06-06) |
| rate-limit "누락" 보고 (라우트 파일에 inline 미들웨어 없음) | rate limit은 라우트 파일이 아니라 `index.tsx`에서 `app.use('/api/...', rateLimitMiddleware(...))`로 **앱 레벨 전역 등록**(240-246: auth/portal login·users/portal change-pw·refresh·self-auth·verify-document·verify-token). 라우트 핸들러만 보면 항상 inline 부재로 오탐 — 보고 전 index.tsx 등록처 grep 필수 | Area 5 (2026-06-06) |
| "escapeHtml 헬퍼 전무(`grep -c escapeHtml`=0) → XSS" | `layout.ts:1185`가 `window.escapeHtml`를 **전역 정의**(+`portalLayout.ts` 포털용) → 모든 스크립트가 로컬 정의 없이 전역 헬퍼 호출 가능. 파일에 escapeHtml 미정의/미참조 ≠ 취약. 올바른 판정: 실제 `innerHTML` 싱크의 보간값이 (a)사용자 제어 free-text **이고** (b)미escape인지 확인. `Number()` 강제 숫자·시스템 채번코드(order_number 등)·서버 하드코딩 문자열은 싱크 아님. **⚠️ 예외(Area 5 06-10)**: `c.html()`로 자체 `<head>/<script>`를 통째 반환하는 **독립 출력페이지**(`pages/payslip.ts`·`pages/yearEnd.ts` = `/payslip/:id`·`/year-end/:id` 인쇄경로)는 layout 셸 미경유라 `window.escapeHtml` **부재** → "전역헬퍼 있으니 오탐" 논리 적용 금지. 직원 마스터 free-text를 innerHTML raw 연결하면 **진짜 stored XSS**(로컬 `esc()` 추가가 정답·안전 자동수정). 판별: 파일이 layout/shell import 없이 c.html 안에 자체 script + free-text 렌더 | Area 6 (2026-06-06 / 예외 06-10) |
| batch 결과 배열 인덱스 "정렬 불일치" 오독 | 부모-자식 2-pass batch에서 stmt배열(`parentStmts[]`)과 메타배열(`parentClientGroupIds[]`)을 같은 루프에서 push 후 `results[i]`로 매핑할 때 "한쪽은 `continue`로 건너뛰는데 다른 쪽은 무조건 실행→길이 불일치→매핑 깨짐 HIGH"로 보고하기 전, **두 push가 같은 `continue` 가드 뒤에 있는지** 확인. `if(parent_client_id) continue`가 **루프 최상단**이면 자식 행은 두 push를 **모두** 건너뛰어 길이 동일=정합(orders/core.ts:2207-2280·quotations.ts:273-320이 이 형태, 정상). 서브에이전트가 continue 위치를 오독해 HIGH 과대보고 2건 차단. 회피=(a)continue 줄 위치가 첫 push보다 위인지 (b)두 push 사이 별도 조건 push 있는지 직접 Read | Area 4 (2026-06-10) |
| VAT/금액 "부동소수점 누적 → 신고 오차" | 금액이 누적 **직전에 원/100원 단위 정수로 반올림**되면(예: quotations.ts:223 `Math.round(itemAmount/100)*100`) `×세율(0.1)`은 항상 10의 배수=정수라 IEEE754 drift 불가. node `Number.isInteger(누적값)` 실증으로 반증 필수. 견적(추정)↔세금계산서(`Math.round`+정합보정 `total≠supply+tax면 강제정렬`) 반올림 "불일치"도 발행단계가 권위계산이라 버그 아님. number↔REAL/INTEGER 타입표기 차이도 정상 TS | Area 2 (2026-06-08) |
| catch가 success 숨김 "데이터손실" (best-effort 물질화/보상) | try 안이 **부차 denormalized 물질화**(가격이력·cash_schedule 등 언제든 재계산 가능한 파생 데이터)이고 **주석에 best-effort 명시**(예: purchaseInvoices.ts:131/164 "receive Phase4와 동일 정책")면 의도적 설계. 핵심 비즈니스 write(주문/인보이스/잔액)가 try **밖**이면 오탐. batch 실패 후 보상(rollback) DELETE의 `.catch(()=>{})`도 보상 자체 실패는 더 할 게 없으므로 정상. 보고하려면 **핵심 mutation**이 삼켜지고 사용자에게 success로 보이는 구체 경로 실증 필요 | Area 2 (2026-06-08) |
| 트랜잭션 원자성 "분리 write 부분실패 → 고아/불일치" | `DB.batch()` 없이 분리 await 실행이라도 **분리가 구조적으로 강제**되면 노이즈: ① 부모 INSERT가 `result.meta.last_row_id`를 자식에 써야 함(bank apply·shipments 헤더·orders 헤더) ② 중간 READ(`balance_after` 잔량조회)가 끼어 batch 분할 불가피. 단순 "2번째 write 실패하면?"은 확정 트리거 없는 일반 비원자성. **보고 가능 = ①확정 재현 트리거**(멱등 가드 부재로 재시도/중복제출이 destructive write 반복 — 부분실패→500→목록잔류→재클릭, 버튼 재진입 가드 없는 더블클릭) **+ ②회피 가능성**(read를 메모리 산출로 대체해 단일 batch화 가능). #369가 둘 다 충족(보고됨). 보고 전 (a)재고/금액/잔액 변경인지 (b)선행상태 가드(`WHERE status!=...`)·프론트 버튼 재진입 가드 확인 | Area 2 (#369, 2026-06-09) |
| 무인증 self-service auth "브루트포스/열거 HIGH" 과대평가 | `/api/hr/self-auth`(사원번호+생년월일6자리)·portal `/verify-document`(토큰+BRN)처럼 **계정 없는 사용자용 간이 2팩터**는 authMiddleware 부재가 **설계 의도**(공개 진입점). 보고 전 ① `index.tsx:240-246` rate limit 전역 등록 확인(self-auth 5/분·verify-document 10/분 이미 적용) ② 두 팩터 결합(열거가능 식별자+추측가능 비밀)이 동일 코드베이스의 이미 "설계 정상" 판정 패턴과 동형인지 확인. IP-rate-limit 로테이션 한계·timing-attack(단일쿼리+문자열비교)은 모든 로그인 공통. **진짜 보고 대상**: rate limit 미등록 / 단일 팩터 인증 / scope·만료 없는 영구 토큰 발급 | Area 5 (2026-06-09) |

---

## 상태 변경 가이드

| 상태 | 의미 | 누가 변경 |
|------|------|----------|
| 🆕 new | 에이전트가 발견, 미검토 | auto-improve |
| 👀 reviewed | 용준님이 봄, 판단 보류 | 용준님 |
| ✅ approved | 진행 허가 | 용준님 |
| 🔨 in-progress | 구현 중 | Claude |
| ✔️ done | 완료, 배포됨 | Claude |
| ❌ rejected | 불필요 / 부적절 | 용준님 |
