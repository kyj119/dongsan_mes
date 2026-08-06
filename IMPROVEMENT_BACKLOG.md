# Improvement Backlog
<!-- last_run_area: 1 -->
<!-- last_run_at: 2026-08-06T15:21:00+09:00 -->

> 자율 점검·개선 에이전트(auto-improve)가 6개 영역을 순환하며 발견한 항목.
> 용준님이 주기적으로 리뷰하여 상태를 변경 (new → approved → done, 또는 rejected).

## 통계
| 상태 | 건수 |
|------|------|
| 🆕 new | **0** (`list_issues(OPEN,label:auto-improve)` 실측 — Area1 58회차. 직전 13건[#585~#600] 전부 owner가 이번 윈도에서 close, 남은 OPEN 이슈는 auto-improve 라벨 없는 #453뿐[기존 인지된 egress 인프라 이슈, 무관]) |
| ✅ approved | 0 |
| 👀 reviewed | 0 |
| ✔️ done | **524** (+11, `reason:completed` 실측 — session #54 백로그 소진: 11건 완료 처리 + #599/#600 2건은 별도 close 상태 확인 필요, 아래 참조) |
| ❌ rejected | **6** (`reason:not_planned`=4 + `reason:duplicate`=2, 변동 없음) |

> **Area 1 프로덕션 헬스 (2026-08-06T15:21):**
> - **방법**: `git fetch origin main`(force-updated, HEAD `fbbb5a4` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81). `curl https://webapp-9i0.pages.dev/api/notifications/nav-badges` → 연결 실패(exit 56, 기존 인지된 egress 프록시 차단 재확인, #453과 동일 제약) → GitHub Actions 기록으로 대체. Area 1 **58회차** — 직전 Area1(`069a39f`, 08-04T23:20, 57회차) 이후 `git log --since 2026-08-04T23:20 -- src/routes src/scripts migrations index.tsx src/layout src/pages`는 **20커밋**(합배송 하드삭제 정리·주문폼 라인할인 복원·광고문자 실패수신자 표시 등 session #54 백로그 소진분 다수 + 카드=작업지시서 신기능`50eb5ef`+후속 IDOR 픽스 2건`3e29fe6`/`132c9f1` + neoStampa RIP 연동 + ia-editor 폐기 S1/S4/S5).
> - **deploy.yml 전수 확인(30런, `c21a63a`~최신)**: 이번 윈도에 **실패 2건** 발견 — `31017423416`(14:52, `50eb5ef` 최초 배포)·`31034273450`(18:20, 그 직후 docs 커밋). 둘 다 Typecheck→Build→Deploy 전부 success, **Smoke만 실패**(`cards.issueStatus /api/cards/issue-status` 500) — 커밋 메시지 자신이 "Prod deploy requires 0522 migration first (not deployed)"로 원인을 명시(SKILL #484급 (b)-risk: 신규 `ADD COLUMN`을 detail SELECT가 참조하는데 마이그 미적용). 이후 `31059416764`(00:21, "record work-order auto-issue prod deploy c1003" 커밋)부터 **9런 연속 success**로 자동회복 확인 — 코드 회귀 아님(회귀 불가: docs-only 커밋도 같은 실패를 보였다가 마이그 적용 후 즉시 초록) → 비보고 대상, 현재 prod 완전 정상.
> - **backup.yml 신선도**: 최신 run(`31033823439`, 2026-08-05T18:14:51Z) success — 직전(08-04T18:22) 대비 ~24h 간격 정상. 다음 예정(~08-06T18:xx UTC)은 아직 미도래(정상, 지연 아님).
> - **e2e.yml**: 최신 run 여전히 2026-06-22(`disabled_manually` 상태 지속, 변동 없음). **verify.yml**: 열린 PR 0건(`list_pull_requests(state:open)` 직접 확인) → 실행 대상 없음.
> - **🎉 GitHub 백로그 대량 소진 감지**: `list_issues(state:OPEN,label:auto-improve)` 실측 **0건**(직전 13건 전부 close) — git log에 `session #54: all 11 auto-improve issues resolved` 커밋이 실증. `reason:completed` 실측 524(+11, 513→524) — 직전 13건 중 11건은 completed로, **2건(#599·#600)은 델타 불일치**(13 open → 11 done 증가, 2건 행방 확인 필요, `not_planned`/`duplicate`는 변동 없음이라 그쪽도 아님). `issue_read`로 #600 직접 확인 = `state:closed, state_reason:completed`(정상 카운트됨) → **`reason:completed` 검색 인덱스 지연**(SKILL line 66 기존 관찰 패턴, "수 분 지연 후 재조회 시 반영")으로 판단, 다음 사이클 재확인 대상으로 남김(코드 자체는 owner가 `3e29fe6`/`132c9f1`로 #599/#600 모두 픽스 확인 — 아래 참조).
> - **#599/#600 픽스 실재 확인(open→closed 전환의 정확성 검증)**: `git log`에 `132c9f1 fix(print-events): close #600 entity gate on POST /link card lookup`·`3e3e473 fix(cards): close #599 sibling-asymmetry IDOR on card child reads + review fixes` 확인 — 두 이슈 모두 커밋 메시지에 번호 인용 + 해당 deploy run(`31059677193`·`31060820444`) success. **#473/line 281 "open≠unfixed" 원칙 적용**: 코드 자체가 이미 정합(deploy green)이므로 이슈 카운트 인덱스 지연과 무관하게 실질적으로 해소됨.
> - **📌 owner 액션 불요**: 신규 이슈 0건, 백로그가 사실상 비어있음(auto-improve OPEN 0). 다음 사이클(Area 2)부터 코드베이스 재탐색 필요.
> - **🧬 SKILL 강화**: 없음 — deploy 실패 2건은 기존 codify된 "#484급 (b)-risk detail-SELECT 마이그 지연" 패턴의 실전 재현(신규 규칙 불요), done 카운트 인덱스 지연도 기존 관찰 패턴 재확인.
> - 신규 이슈 0건, 자동수정 0건(순수 CI/인프라 헬스 확인 + 백로그 상태 동기화), done-sync: new 0(-13, 전건 close)·done 524(+11)·rejected 6(변동없음). 다음 순번 **Area 2**.
>

> **Area 6 자기 진화 (2026-08-06T04:05):**
> - **방법**: `git fetch origin main`(force-updated, HEAD `f43879d` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81), `npx tsc --noEmit` clean. Area 6 **56회차** — 직전 Area6(`283ae76`, 08-04T21:25, 55회차)는 이번 fetch에서 `git cat-file -t` 조회 불가(반복 관찰된 force-updated 히스토리) → 타임스탬프 앵커(2026-08-04T21:25)로 `git log --since -- src/routes src/scripts src/pages migrations index.tsx src/layout`를 잡으면 **18커밋**(고정자산 감가상각 마무리 3건·부문/차입금/합배송 fix 4건·재단 DXF 라인첨부·ia-editor 폐기 S1/S4/S5·CAPS/logwatcher 2건[`990afc6`·`18857d6`]·print-events IN절 청크 수정·반복지출 UI 신설[`e27cd7f`]·카드=작업지시서 승격[`50eb5ef`]) — Area1~5가 각자 사이클에서 이 윈도를 이미 커버해 net-new 여지가 좁음.
> - **🔴 net-new #600(형제-비대칭 IDOR)**: line 305 신규 SKILL 원칙("churn 목록에 나열됨 ≠ 개별 diff 검토됨")을 적용해, Area5 51회차 로그가 churn 목록엔 포함했으나 본문에서 구체 언급 없이 지나간 `18857d6`(neoStampa RIP 연동, `printEvents.ts` 472줄 변경)을 직접 Read — 신규 `POST /api/print-events/link`(:1176, `authMiddleware`만)의 카드 조회(:1183 `WHERE c.id = ?`)와 소급 UPDATE(:1218)가 entity 격리 0. 같은 파일의 형제 `GET /unmatched`(:1038 `entityFilter`)·`GET /link-candidates`(:1114 `cardEntityFilter`)는 전부 격리 — 프론트(`production.js:1237`)는 격리된 후보 목록에서만 card_id를 고르지만 API 직접 호출로 임의 card_id(순차 정수)를 넘기면 타법인 카드정보 노출 + 그 카드에 자기 법인 print_events를 소급 연결(생산실적 오염) 가능. #437/#452급 형제-비대칭, 같은 파일에 정답 패턴 2곳 있어 byte-명확 — 자동수정 대상 제외(IDOR=owner 워크플로), 이슈로 등록(#600).
> - **`990afc6`(--probe 마커) 검토**: `printEventsRouter.post('/', agentKeyMiddleware, ...)` 단일/배치 양쪽에 마커잡 스킵 로직만 추가, entity/인증 변경 없음 — clean.
> - **`826baef`(재단 DXF 라인첨부) 신규 엔드포인트 재확인**: `orders/operations.ts POST /items/:itemId/files`가 `orderVisibilityFilter(c,'o')`로 라인 소유 법인을 선검증 + 코드 주석이 "#582 workbench absorb와 같은 IDOR" 위험을 명시 인지하고 회피 — clean(Area4가 데이터정합 렌즈로 이미 커버한 파일이나 보안 렌즈로도 문제 없음 재확인).
> - **open≠unfixed — #596 fixed-in-tree 확정**: `e27cd7f`(오늘 20:28, Area3 51회차의 #596 발견 이후 착륙)가 `bank.ts:120` 옆에 정확히 이슈가 제안한 "미등록 반복 지출" 패널을 추가(`bank.js loadRecurringCandidates`/`renderRecurringCandidates`, free-text `escHtml` 적용 확인 = XSS도 clean) — 이슈 본문 요구사항(표시 화면) 충족. `POST /api/cash-flow/fixed-expenses` 연결(원 제안의 "고정비로 등록" 버튼)은 미포함이나 핵심 갭(화면 부재)은 해소됨 → **close-pending으로 표시, 백로그에서 재보고 안 함**(line 292 캐시 원칙, HEAD `e27cd7f` 기록).
> - **#594·#595 재확인**: `3d62b07`이 `getWriteEntityId` 400-게이트(제안한 `\|\|1` 폴백보다 강화) + loan/equipment 소유검증까지 반영 확인, closed/completed 유지.
> - **마이그 번호 중복 재확인**: 기존 5쌍(0327·0412·0416·0420·0453) net-new 0(신규 0516~0521 전부 고유).
> - **필수 grep 2종**: 시크릿 폴백 `fax.ts:43` 1건(기존 FP) 외 net-new 0.
> - **브랜치 위생**(읽기전용): `npm run branch:clean` → SAFE-absorbed 1건, REVIEW 0건 — 삭제대상 1건(임계 30 미달), 백로그 등록 불요.
> - **backlog↔GitHub 절대값 재동기화**: `search_issues` 실측 — open **13**(#585·#586·#587·#589·#590·#591·#592·#593·#596·#597·#598·#599·#600, #600 신규 + #596 fixed-in-tree/close-pending) · `reason:completed` **511**(검색 인덱스 지연 유지, Area3 51회차 직접확인값 513 신뢰) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: line 305에 "churn 목록 나열 ≠ 개별 diff 검토" 신규 원칙 codify — #600이 이 원칙을 적용해 발견한 첫 사례(Area5가 목록엔 포함했으나 본문 미언급했던 472줄 커밋을 Area6가 직접 Read해 형제-비대칭 IDOR 격리). "백엔드 먼저·화면 나중" 패턴(#596)은 이번에 fixed-in-tree로 빠르게 해소돼 3번째 관찰 없이 종결 — codify 보류 유지.
> - 신규 이슈 1건(#600, issue-only), 자동수정 0건, done-sync: new 13(#600 신규, #596 close-pending 표시)·done 513(변동없음)·rejected 6(변동없음). 다음 순번 **Area 1**.
>

> **Area 5 보안 (2026-08-06T03:19):**
> - **방법**: `git fetch origin main`(force-updated, HEAD `50eb5ef` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81), `npx tsc --noEmit` clean. Area 5 **51회차** — 직전 Area5(`813531d`, 08-04T15:21, 50회차)가 웹 churn 0으로 스킵한 이후, Area5 **자신의 마지막 실행 시각 기준**으로 churn을 다시 잡으면(다른 Area들은 각자 렌즈로 이 윈도를 이미 봤지만 보안 렌즈로는 전무) `git log --since 2026-08-04T15:21`이 웹 관련 파일 기준 **17커밋**(고정자산 감가상각 4건[Area2 58회차가 코드품질 렌즈로 이미 #594·#595 발견]·부문/차입금/합배송 fix 4건·재단 DXF 라인첨부(826baef)·ia-editor 폐기 S1/S4/S5 3건·반복지출 탐지(84ee297, Area3가 UX 렌즈로 #596 발견)·CAPS/logwatcher 2건·print-events IN절 청크 수정(edfd374, 이미 자체 픽스됨)·**카드=작업지시서 승격 신기능(`50eb5ef`, 직전 Area4 52회차 HEAD 이후 유일 신규 커밋)**).
> - **신규 기능(`50eb5ef`) 보안 전수 검토**: `cards/lifecycle.ts` `PATCH /:id/checklist/:itemId`·`PATCH /:id/reissue-ack`는 `cardEntityScope(c)`로 소유 카드 선검증 후 mutate = clean. `cards/queries.ts GET /issue-status`(3개 서브쿼리)도 `entityFilter`/`cardEntityFilter` 전부 적용 = clean. 프론트(`issueStatus.js`·`cardDetail.js`)는 free-text(client_name/item_name/label/checked_by_name) 전부 `escapeHtml`/`esc()` 일관 적용 = XSS clean. `orders/update.ts`의 라인교체 하드삭제 경로도 신규 FK 자식(`card_checklist_items`)을 `cards` 삭제 전에 정리 — #480 교훈(FK 자식 정리 누락) 재확인, 이번엔 clean.
> - **🔴 net-new #599(형제-비대칭 IDOR)**: 같은 파일의 `GET /:id/checklist`(오늘 신규, `:1186`)가 `card_checklist_items`를 `cardEntityFilter` 없이 `WHERE card_id=?`만으로 조회 — 형제 `GET /:id`(#414로 이미 격리 완료, 커밋 코멘트가 "cross-tenant PII 유출 차단" 명시)·오늘 신설된 `GET /issue-status`·`PATCH /:id/checklist/:itemId` 전부 격리하는데 이 엔드포인트만 누락. **직접 Read로 같은 파일의 기존 형제 2개(`GET /:id/history`·`GET /:id/defects`)도 동일하게 bare임을 확인** — pre-existing 잔존분까지 포함해 3개 엔드포인트를 한 이슈로 묶어 등록(#599). 카드 ID는 순차 정수라 열거 용이 + `/cards`·`/orders` 페이지 권한만 있으면 도달(대부분 role 포함) → 타법인 작업이력/불량이력/체크리스트 진행상황(+담당자 성명)이 cross-tenant로 열람 가능. 프론트가 `Promise.all`로 4개 엔드포인트를 동시 호출하므로 메인 `/:id`가 404여도 나머지 3개는 API 직접 호출로 100% 재현. 자동수정 대상 제외(IDOR=owner 워크플로, egress로 재현검증 불가) — 단 형제 패턴이 byte-명확해 승인 시 즉시 처리 가능하다고 이슈에 명시.
> - **필수 grep 2종(매 사이클)**: 시크릿 폴백 `fax.ts:43 BAROBILL_FTP_PASSWORD || ''`(빈 문자열, 기존 FP) 1건 외 net-new 0. 기본비밀번호/CI secrets 폴백 0건.
> - **마이그 번호 중복 재확인**: 기존 5쌍(0327·0412·0416·0420·0453) net-new 0. 신규 마이그(0516~0522) 전부 고유 번호.
> - **ia-editor 폐기 3단계(S1/S4/S5) purge 완전성**: ① `/ia-editor` 페이지 라우트 index.tsx에서 완전 제거(주석만 남김, 실제 `app.get` 삭제 확인) ② `permission_pages`/`role_page_permissions` 행 마이그 0521로 정리 ③ 프론트 axios 호출처 재확인 — 제거된 workbench 서브라우터(`/orders`·`/analyses/:orderId`·`/match`·`/archives`·`/files`·`/sheets*`·`/render-queue`) 호출처 `grep -rn "api/workbench" src/scripts` = 잔존 6건 전부 **생존 라우트만**(`/intakes`·`/intakes/:id/thumb`·`/void-bulk`·`/restore`·`/absorb`) 참조, 제거된 경로 0매치 — SKILL #429/#477 purge-완전성 3축 전부 clean. `workbenchRouter.use('/*', authMiddleware, requireRole(...))` 라우터 전역 게이트도 S5 이후 유지 확인.
> - **open≠unfixed 재확인**: 기존 8건(#585~#593·#596~#598) 대상 파일이 이번 신규 churn(`50eb5ef` cards/lifecycle·queries·orders/helpers·update)과 안 겹침(보안 라벨 대상 자체가 없었음) → verified-once 캐시 유지, 재검증 불요.
> - **backlog↔GitHub 절대값 재동기화**: `list_issues(OPEN,auto-improve)` 실측 **12**(#585·#586·#587·#589·#590·#591·#592·#593·#596·#597·#598·#599) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음) · done은 Area3 51회차 직접확인값 513 유지(`reason:completed` 텍스트 인덱스 511은 기존에 문서화된 지연 캐시, 재확인 불요).
> - **🧬 SKILL 강화**: 없음 — #599는 기존 codify된 #437/#452(형제-비대칭 IDOR) 클래스의 신선 사례(신규기능이 기존 파일의 확립된 엔티티격리 컨벤션을 부분 누락 + pre-existing 잔존분 동반 발견), 새 탐지 규칙 불요. 다만 "Area 자신의 마지막 실행 시각 기준으로 churn을 재확정"(line 92 원칙)이 이번에 실제로 순수-CI-확인 사이클 5연속 뒤 첫 실질적 net-new를 잡아낸 사례로 유효성 재확인.
> - 신규 이슈 1건(#599, issue-only), 자동수정 0건, done-sync: new 12(+1)·done 513(변동없음)·rejected 6(변동없음). 다음 순번 **Area 6**.
>

> **Area 4 데이터 정합성 (2026-08-05T21:29):**
> - **방법**: `git fetch origin main`(force-updated, HEAD `6888d70` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81), `npx tsc --noEmit` clean. Area 4 **52회차** — 직전 Area4(51회차, HEAD `ec87745`)가 이번 fetch에서 `git cat-file -t`로 조회 불가(force-updated 히스토리, Area3 51회차가 이미 관찰한 현상 재확인) → 앵커를 직전 사이클 타임스탬프(2026-08-04T09:15)로 바꿔 `git log --since -- src/routes migrations src/scripts`로 churn 범위 확정(19커밋: 전사 8색 RIP 연동·재단 칼선 라인파일·자산-부채 연결/부문귀속·차입금 만기미확인·합배송 상태 화이트리스트·반복지출 탐지 등). 5사이클 연속 churn 0이던 직전과 달리 이번엔 신선 데이터 write-path가 다수 착륙.
> - **신규 마이그레이션 0513~0521 전수 대조**: 전부 컬럼존재성·NOT NULL·인덱스 정합(`idx_fixed_assets_loan`·`idx_fixed_assets_dept`·`idx_order_ai_files_item`·`idx_print_events_kind` 전부 신설 컬럼과 동반). `0519`(전사 8색 장비 사전등록)·`0520`(이관 SHIPPED 주문 shipped_at 백필, 멱등 조건 확인)·`0521`(ia-editor 권한 제거)은 리터럴 데이터/정리라 정합 이상 없음.
> - **🔴 net-new #597(HIGH)**: `0516`이 신설한 `order_ai_files.order_item_id`(RESTRICT FK, `orders/operations.ts` 재단 칼선 DXF 첨부가 씀)를 `orders/update.ts`의 주문수정 라인교체 경로 2곳(`:213`·`:240`, `DELETE FROM order_items`)이 삭제 전에 정리 안 함 — 같은 파일이 정확히 같은 클래스인 `shipment_checks.order_item_id`(#480)·`designer_intakes.order_item_id`(#570)는 이미 형제 정리문을 갖췄는데 오늘 신설된 컬럼만 그 목록에서 누락된 **#477 "churn-트리거 재스캔" 클래스의 신선 사례**. 칼선 DXF 첨부된 라인이 있는 주문을 편집하면 FK violation → 주문수정 100% 500.
> - **🟡 net-new #598(MEDIUM)**: `0518`(event_kind 도입, neoStampa RIP vs 실제 출력 이중계상 방지)이 `oee.ts`·`productionReports.ts`·`forecast.ts`·`dashboard.ts`·`printEvents.ts`·`equipmentQueue.ts` 6개 파일 실적집계 쿼리 전부에 `event_kind='PRINT'` 필터를 추가했으나, 같은 `print_events`를 집계하는 `rip.ts` `GET /equipment/:id/stats`(장비 상세 모달 실적, `equipment.js:1431` 도달성 확인)의 4개 쿼리만 누락 — 같은 커밋이 신설한 전사 8색 장비(`0519`, RIP+PRINT 이중로그 첫 사례)에서 정확히 그 이중집계가 재현됨. **A-024/A-025급 "부분 롤아웃" 패턴**(6/7 파일 적용, 1개 형제 누락).
> - **`reports.ts:576 GET /production-analysis`도 같은 필터 누락이나 `grep -rn "production-analysis" src/scripts src/pages` = 0건(프론트 호출처 전무, #334 dead code)** → 이슈화 안 함(라이브 영향 0).
> - **`waste.ts:117` 로스율 계산이 `print_status = 'COMPLETED'`를 찾으나 코드베이스 전체에서 `print_events.print_status`는 'OK'/'ERROR'/'CANCEL'만 쓰고 'COMPLETED'는 단 한 번도 INSERT/UPDATE 안 됨(영구 0매치 → output_sqm_30d 항상 0) — 단 `/api/waste/*` 라우터 전체가 `grep -rln waste src/scripts src/pages`에 0건(#334 dead code, 04-11 시절 waste_tracking 백엔드가 UI 없이 방치)** → 별개 findings지만 둘 다 도달성 0이라 이슈 미생성, 향후 waste UI가 생기면 재검토 대상으로만 기록.
> - **fixed_assets.loan_id/department_id 고아 위험**: `DELETE FROM departments`·`DELETE FROM loans` 하드삭제 엔드포인트 자체가 코드베이스에 없어(`grep` 0건) 참조 무결성 위반 경로 자체가 없음 — clean.
> - **loans.maturity_confirmed 형제완전성**: `cashFlow.ts` 목록(`l.*`)·상세·generate-schedule 3경로 전부 반영 확인(owner가 같은 사이클에 직접 구현, 회귀 없음).
> - **open≠unfixed 재확인**: 이번 19커밋 churn이 8건 OPEN 이슈 대상 파일(`orderForm/parent.js`·`messagesAd.js`·`orders/core.ts`[일부 겹침, `826baef`가 손댐]·`migrations/0508~0512`)과 대부분 안 겹침 — 단 `orders/core.ts`는 이번 churn에 포함되므로 `#589`(합배송 정리 누락) 재confirm: `grep -n "consolidate_with_order_id" src/routes/orders/core.ts`로 하드삭제 경로 재확인, 826baef는 그 라인을 안 건드림(재단 파일첨부 로직만 추가) → 잔존 그대로, verified-once 캐시 유지.
> - **마이그 번호 중복 재확인**: `ls migrations | sed -E 's|.*/?([0-9]{4})_.*|\1|' | sort | uniq -d` → 기존 5쌍(0327·0412·0416·0420·0453) net-new 0.
> - **backlog↔GitHub 절대값 재동기화**: `list_issues(OPEN,auto-improve)` 실측 **11**(#585·#586·#587·#589·#590·#591·#592·#593·#596·#597·#598) · `search_issues reason:not_planned` **4** + `reason:duplicate` **2** = rejected **6**(변동없음) · done은 Area3 51회차 실측(513) 유지, 이번 사이클 완료전환 0건.
> - **🧬 SKILL 강화**: 없음 — #597·#598 둘 다 기존 codify 패턴(#477 churn-트리거 재스캔, A-024급 부분 롤아웃)의 신선 사례라 새 탐지 규칙 불요, 기존 레시피가 정확히 포착함을 재확인.
> - 신규 이슈 2건(#597 HIGH·#598 MEDIUM, 둘 다 issue-only — #597은 보존정책 판단, #598은 형제 패턴이나 실적 집계 쿼리 변경이라 정책상 안전자동수정 범주 밖), 자동수정 0건, done-sync: new 11(+2)·done 513(변동없음)·rejected 6(변동없음). 다음 순번 **Area 5**.
>

> **Area 3 UX/기능 감사 (2026-08-05T13:55):**
> - **방법**: `git fetch origin main`(force-updated, HEAD `fb5a882` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81), `npx tsc --noEmit` clean. ⚠️ 과거 로그가 인용한 이전 회차 커밋 SHA(`a3d8527` 등)는 이번 fetch에서 `git cat-file -t`로 조회 불가(반복적으로 관찰된 "force-updated" 히스토리 재작성 — 과거 커밋이 로컬에서 재조회 불가해질 수 있음, 신규 관찰이라 SKILL에 참고만). 대신 직전 사이클 타임스탬프(2026-08-04T03:13) 기준 `git log --since`로 프론트 churn 범위를 잡고, 실제 diff는 그 범위 내 최상위 코드 커밋(`ee0faa7^`)을 앵커로 `git diff --stat ee0faa7^..HEAD`로 확정(총 55커밋 중 프론트/라우트/마이그 한정 diff는 7파일 스크립트/페이지 + 6파일 라우트/마이그 — 나머지는 IA cut-panel CEP·회계 백엔드 전용·문서).
> - **신규 churn 전수 검토**: 고정자산(fixedAssets) 탭 신설(`ee0faa7`)·G1 부채연결/G3 부문배부/세무장부 정률법(`46693ab`·`f1c85a3`·`1fd0d2e`) — `accounting.js`(+256줄) 직접 Read: 로딩 상태("불러오는 중...")·빈 상태("등록된 고정자산이 없습니다.")·에러 상태("불러오지 못했습니다.") 3종 모두 구현, 분류/상태/상각진행중 필터 존재, `hr.ts` 부문별 손익에 `/accounting` 고정자산 탭 크로스링크 추가 — Area 3 체크리스트 전 항목 clean. 대출 상환스케줄(`cashFlow.js`) "만기 미확인" 배지+안내문구 신규, 부문 손익(`departments.js`) 감가상각 컬럼+공통풀 안내 신규 — 전부 사용자 이해를 돕는 tooltip/안내 동반, UX 결함 없음. 재단 라인 파일 첨부(`orders/operations.ts`+`orders.js` `copyLineFilePath`)도 Windows 경로 이스케이프 함정을 주석으로 명시하고 data-속성 경유로 올바르게 회피.
> - **🟢 net-new 발견: #596 반복지출 탐지 API `/api/bank/recurring-candidates`(`84ee297`, 오늘 신설)에 화면이 없음** — 커밋 메시지가 "이 방식으로 월 15,872,480원 미등록 정기지출을 찾았다"고 명시할 만큼 실증된 기능인데 `grep -rn "recurring-candidates" src/scripts src/pages` = 0건(호출처 전무). #334 도달성 규칙(프론트 호출처 0건=dead code)은 **Area 2/5의 보안 갭 재분류 전용**이라 이 건엔 적용 안 됨 — Area 3는 반대로 "가치 있는 기능에 화면이 없다"를 적극적으로 찾는 게 목적. 자연스러운 통합 지점(`bank.ts:120` "이번 달 고정비 출금 현황" 카드 옆) 명시 + 기존 `POST /api/cash-flow/fixed-expenses` 등록 플로우 재사용 제안까지 포함해 이슈화. 선례 = `routes/fixedAssets.ts`가 #77 이래 화면 없이 방치되다 오늘 `ee0faa7`로 처음 연결된 것과 동일 패턴(백엔드 먼저, 화면 나중) — 재현되는 클래스라 다음 Area 6에서 codify 검토 가치 있음(1회 추가 관찰이라 이번엔 SKILL 미수정, 보류).
> - **open≠unfixed 재확인(대표 재grep)**: `orderForm/parent.js`의 `loadOrderForEdit()`에 `line_discount|discount_reason|discount_by` 여전히 0매치(#590 잔존) · `messagesAd.js:329 adLoadOptOuts()` 여전히 파라미터 없이 정의(#587 잔존, 이번 churn이 `messagesAd.ts`/`messages.ts`/`orderForm/parent.js`를 전혀 안 건드림) — fixed-in-tree 0건. #594·#595는 Area 2 58회차가 발견한 당일 owner가 `3d62b07`로 즉시 픽스+close 확인(코드 직접 대조: `fixedAssets.ts:61` `getWriteEntityId(c)` 사용 중, `|| 1` 폴백이 아닌 400-게이트 방식으로 제안보다 강화된 수정 — done 반영, close-pending 아님).
> - **backlog↔GitHub 실측 동기화**: `list_issues(state:OPEN,label:auto-improve)` 실측 **9건**(#585·#586·#587·#589·#590·#591·#592·#593·#596, GraphQL 실시간 — #594·#595 정상 제외) · done은 `issue_read`로 #594·#595 개별 `state_reason:completed` 직접 확인해 511→**513**(`search_issues reason:completed` 텍스트 인덱스는 511로 수 분 지연 관찰, 다음 사이클 재조회 시 511 그대로면 지연 아닌 이상 신호로 재확인 필요) · rejected **6**(변동없음).
> - **🧬 SKILL 강화 없음** — #596은 기존 codify된 "백엔드 먼저·화면 나중" 패턴(fixedAssets.ts 선례)의 2번째 사례이나 1회 추가 관찰만으로는 standing scan화 근거 부족, 다음 유사 사례 시 codify 재검토.
> - 신규 이슈 1건(#596, issue-only), 자동수정 0건(신규 UI 추가는 정책상 issue-only), done-sync: new 9(#594·#595 제외+#596 신규)·done 513(+2, #594·#595 직접확인 반영)·rejected 6(변동없음). 다음 순번 **Area 4**.
>

> **Area 2 코드 품질 심층 분석 (2026-08-05T00:10):**
> - **방법**: `git fetch origin main`(HEAD `ab509fc` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81). Area 2 **58회차** — 직전 Area2(`9f59a8a`, 08-03T21:31, 57회차) 이후 `git log 9f59a8a..HEAD -- src/routes src/scripts migrations index.tsx src/layout`는 **6커밋** — `ee0faa7`/`19e8a34`(Area6 55회차가 이미 검토, 재대상 아님) + **신규 자산 감가상각 확장 4커밋**(`053069e`·`46693ab`·`f1c85a3`·`1fd0d2e`, Area1 57회차 로그가 "다음 Area 2/4/6 심층 검토 대상"으로 명시 위임)만 코드품질 렌즈로 신선.
> - **`src/routes/fixedAssets.ts` 전문 정독 + 4커밋 diff 대조**로 entity_id 오귀속 2건 발견·이슈화:
>   - **#594(HIGH)**: `POST /depreciate`(월별 감가상각 배치, requireRole ADMIN)가 ADMIN 전체모드(entityId=0)에서 실행되면 `eid = getEntityId(c) || 1`로 세션을 1(동산기획)에 고정한 채 **전 법인 자산을 처리**(`entityFilter(c)` 빈 절 → 전체 조회) → 타법인(entity_id=2 등) 자산의 신규 `depreciation_records`가 `entity_id=1`로 오기록되고, 기존 누계 조회(`WHERE entity_id=eid`)도 타법인 이력을 못 찾아 `accumulated_depreciation`이 과소계상 재시작 — 다법인 원장 오염. SKILL #487(entity 오기록 3번째 축) 클래스와 동일 패턴이나, 수정이 쿼리 3개+INSERT 1개를 `asset.entity_id` 기준으로 재구성해야 해 자동수정 대상 제외(재무 write-path).
>   - **#595(MEDIUM)**: 같은 파일 `POST /`(자산 생성)가 (a) `entity_id` 컬럼에 `getEntityId(c)`를 그대로 바인딩 — 전체모드 생성 시 `NOT NULL DEFAULT 1`을 명시값 `0`이 덮어써 0-sentinel 저장(같은 파일 `/depreciate`:131은 이미 `\|\| 1`로 회피, 생성만 형제 누락) (b) `loan_id`를 검증 없이 바로 INSERT — 형제 `PATCH /:id/loan`(:99-104)은 "대출도 같은 법인 것만" 명시 주석과 함께 교차법인 차단을 하는데, 생성 시점(`accounting.js` `faFLoan` select로 loan_id를 실어 보내는 정상 경로)에는 그 가드가 없어 자산-대출 교차연결이 그대로 가능. 둘 다 재무 데이터 write-path라 자동수정 제외, 30분~1시간 공수로 이슈 등록.
> - **`departments.ts`(1fd0d2e) 재확인**: 부문별 P&L의 `fixed_expenses` 공통비 풀에 `entityFilter(c)` 추가 — owner가 이미 sibling-omission(#521 인건비만 격리, 고정비 누락)을 직접 발견·수정한 클린 패치, 회귀 없음(clause/binds 정합 확인).
> - **`cashFlow.ts`/`accounting.ts`(46693ab) 나머지 diff**: `loans` 목록의 `linked_assets`/`linked_book_value` 역참조 서브쿼리는 `fa.loan_id = l.id`로 이미 entity-scoped된 `loans` 행에 종속되어 안전(단 #595의 loan_id 교차연결이 방치되면 이 집계에 타법인 자산이 새어듦 — #595에 이미 반영). 프론트 폼 필드 추가만, 신규 sink 없음.
> - **`migrations/0513`·`0514`**: `ALTER TABLE fixed_assets ADD COLUMN loan_id/depreciation_rate`(REFERENCES loans(id), nullable) — NOT NULL 갭·컬럼존재성 이상 없음, INSERT/SELECT 컬럼셋과 positional 일치 확인.
> - **open≠unfixed 재확인**: 기존 8건 OPEN 이슈의 대상 파일(`orderForm/parent.js`·`messagesAd.js`·`orders/core.ts`·`migrations/0508~0512`)이 이번 6커밋과 안 겹침 → 직전 사이클 verified-once 캐시 신뢰, 재검증 스킵.
> - **backlog↔GitHub 절대값 재동기화**: `search_issues` 실측 — open **10**(기존 8 + 신규 #594·#595) · `reason:completed` **511**(변동없음) · rejected **6**(변동없음). 신규 2건만 반영, 드리프트 0.
> - **🧬 SKILL 강화**: 없음 — 이번 발견은 기존 codify된 #487(entity 오기록 3번째 축) 클래스의 새 실례(신규 기능에서 재발), 새 탐지 규칙 불요.
> - 신규 이슈 2건(#594·#595, 둘 다 issue-only), 자동수정 0건(둘 다 재무 write-path 다중쿼리 변경이라 정책상 제외), done-sync: new 10(+2)·done 511(변동없음)·rejected 6(변동없음). 다음 순번 **Area 3**.
>

> **Area 1 프로덕션 헬스 (2026-08-04T23:20):**
> - **방법**: `git fetch origin main`(force-updated, HEAD `069a39f` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81), `npx tsc --noEmit` clean. `SMOKE_URL=https://webapp-9i0.pages.dev npm run smoke` → 로그인 단계에서 `403 Host not in allowlist` — 프록시가 이번 세션도 prod 호스트 직접 접근 차단(기존 인지된 egress 제약 재확인, 변동 없음), GitHub Actions 기록으로 대체. Area 1 **57회차** — 직전 Area1(`c21a63a`, 08-03T15:26, 56회차) 이후 `git log c21a63a..HEAD -- src/routes src/scripts migrations index.tsx src/layout src/pages`는 **6커밋**(회계 고정자산 감가상각 확장 4건[`053069e`·`46693ab`·`f1c85a3`·`1fd0d2e`, G1 자산-대출 연결·세무상 정률법 정합화+법인 33건 등록·부문별 손익 fixed_expenses entity 격리] + Area6 55회차가 이미 검토한 `ee0faa7`·`19e8a34`) — 나머지 30여 커밋은 IA cut-panel CEP 벡터(`IllustratorAutomat/designer/**`, bleed 엔진)·SmartA(WEHAGO) 매입원장 수동대사(`docs/dongsan-import/**`)·auto-improve 사이클 로그로 웹 SPA/DB 스키마 밖.
> - **deploy.yml 전수 확인**: `c21a63a` 이후 발생한 런(2026-08-03T18:14Z~2026-08-04T14:11Z, `id 30840386196`~`30917688085`, 총 19런) 전부 `Deploy to Cloudflare Pages`(Typecheck→Build→Deploy→Smoke) **success** — 신규 failure 0건. 최신 커밋(`069a39f`, 4건의 신규 자산 커밋을 포함한 전체 트리) 배포 런(`30917688085`)이 success라 이 사이클의 신규 웹 churn 4건도 이미 prod에서 typecheck+build+smoke green 확인됨.
> - **backup.yml 신선도**: 최신 run(`30842540907`, 2026-08-03T18:43:23Z) success — 직전(08-02T17:55) 대비 ~24h 간격 정상 유지. 08-04 런은 일일 스케줄 창(~18:00 UTC) 전이라 아직 미발생(정상, 지연 아님).
> - **e2e.yml / verify.yml**: e2e.yml 최신 run은 여전히 2026-06-22(`disabled_manually` 상태 지속, 신규 실행 0 — 변동 없음). verify.yml은 열린 PR 0건(`list_pull_requests(state:open)` 직접 확인)이라 이번 사이클도 실행 대상 없음.
> - **open≠unfixed 재확인**: 신규 웹 churn 6커밋의 변경파일(`migrations/0513~0514`·`src/pages/accounting.ts`·`src/pages/settings.ts`·`src/routes/caps.ts`·`src/routes/cashFlow.ts`·`src/routes/departments.ts`·`src/routes/fixedAssets.ts`·`src/scripts/accounting.js`·`src/scripts/capsSettings.js`)가 8개 OPEN 이슈 대상 파일(`orderForm/parent.js`·`messagesAd.js`·`messages.ts`·`orders/core.ts`·`migrations/0508~0512`)과 **전혀 안 겹침** → fixed-in-tree 전환 0건, 직전 사이클(Area3 50회차·Area4 51회차) verified-once 캐시 그대로 신뢰.
> - **backlog↔GitHub 절대값 재동기화**: `search_issues` 실측 — open **8**(변동없음) · `reason:completed` **511**(변동없음) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음). 완전 일치, 드리프트 0.
> - **🧬 SKILL 강화 없음** — 순수 CI/헬스 확인 사이클(deploy·backup·e2e·verify 전부 green/기존 인지 상태, 신규 웹 churn 6건은 이미 prod smoke green 확인됨), 신규 클래스 없음. 신규 자산 감가상각 확장 4커밋은 코드품질/데이터정합 렌즈로 다음 Area 2/4/6이 심층 검토 대상(Area1은 CI 헬스만).
> - 신규 이슈 0건, 자동수정 0건(순수 CI/인프라 헬스 확인), done-sync: new 8(변동없음)·done 511(변동없음)·rejected 6(변동없음). 다음 순번 **Area 2**.
>

> **Area 6 자기 진화 (2026-08-04T21:25):**
> - **방법**: `git fetch origin main`(force-updated, HEAD `283ae76` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81), `npx tsc --noEmit` clean. Area 6 **55회차** — 직전 Area6(`b9e7fa9`, 08-03T09:16, 54회차) 이후 `git log b9e7fa9..HEAD`는 **37커밋**(직전 4사이클과 달리 이번엔 웹 churn 0이 아님) → `git log b9e7fa9..HEAD -- src/routes src/scripts src/pages migrations index.tsx src/layout`로 좁히면 **2커밋만 웹 SPA 범위**(`ee0faa7` 회계 고정자산 탭 신설, `19e8a34` CAPS 갭복구+기간지정 동기화) — 나머지 35커밋은 IA cut-panel CEP 벡터(`IllustratorAutomat/designer/**`)·SmartA(WEHAGO) 매입원장 수동대사(`docs/dongsan-import/**`, 프로덕션 DB에 스크립트로 직접 반영되는 별도 축)·auto-improve 사이클 로그로 웹 SPA/DB 스키마 밖.
> - **컬럼-diff bridge + XSS bridge(2커밋 직접 검토)**:
>   - `ee0faa7`(회계 고정자산): `routes/fixedAssets.ts`(#77 이래 존재, 프론트 연결 0이라 지금까지 **orphan-dead-code로 미감사**)가 이번에 처음 `/accounting`에 탭으로 연결되어 **도달성이 0→라이브로 전환** — 이 프로젝트 자신의 FP 규칙("도달성 0 = dead code, 보고 금지")이 뒤집히는 시점이라 그 라우터를 신규 라우터처럼 재감사: 목록/상세/처분/감가상각/요약 5핸들러 전부 `entityFilter` 적용 + 처분(PATCH)은 소유검증 선행 조회(404 게이트) — 코드 주석에 "2026-07-29 구조감사"로 **이미 선제적으로 격리 완료**된 상태였음(이번 커밋 대상 아님, `src/routes/fixedAssets.ts` 자체는 diff에 없음). 신규 프론트(`accounting.js` faLoad/faSave/faDispose)는 free-text(asset_code/name/equipment_name/acquisition_date) 전부 `escapeHtml` 적용, 숫자/enum 필드는 무해 → XSS·IDOR 둘 다 clean.
>   - `19e8a34`(CAPS 갭복구): 커밋 설명 자체가 "D1 바인드 ~100 한도 초과(장기 백필 시 직원청크만 하고 날짜는 전량 바인드)"를 **prod 사전예방으로 40×40 청킹 수정**했다고 명시 — 이 SKILL이 여러 차례 codify한 #458/#478류 IN절 미청크 클래스와 정확히 같은 패턴을 owner가 선제 발견·수정(auto-improve가 발견하기 전에 owner 세션이 이미 처리). `capsSettings.js`의 신규 렌더(`r.notes` 워커버전)도 `escapeHtml` 적용. 커밋 자체가 typecheck+build+smoke 104/104+entity audit 0+sort audit P1 0 로컬검증 명시 → 재검증 불요, clean.
>   - 신규 마이그레이션 0건(`git log b9e7fa9..HEAD -- migrations` = 0) → 마이그 번호 중복 재확인 스킵(대상 없음, 기존 5쌍만 유지).
> - **브랜치 위생**(읽기전용): `npm run branch:clean` → SAFE-absorbed 1건, REVIEW 0건, 삭제대상 1건(임계 30 미달) — 백로그 등록 불요.
> - **open≠unfixed 재확인**: 8개 OPEN 이슈의 대상 파일(`orderForm/parent.js`·`messagesAd.js`·`orders/core.ts`·`migrations/0508~0512`)이 이번 웹 churn 2커밋(accounting.ts/js, caps.ts, capsSettings.js, settings.ts) 어디와도 안 겹침 → fixed-in-tree 전환 0건, 직전 Area3(50회차)·Area4(51회차) verified-once 캐시 그대로 신뢰.
> - **backlog↔GitHub 절대값 재동기화**: `search_issues` 실측 — open **8**(변동없음) · `reason:completed` **511**(변동없음) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음). 완전 일치, 드리프트 0.
> - **🧬 SKILL 강화 없음** — 이번 사이클의 두 웹 커밋(고정자산 탭 신설·CAPS 갭복구)이 각각 "orphan-dead-code 도달성 전환"과 "D1 바인드 한도 선제방어"라는 **이미 SKILL에 codify된 두 클래스의 실전 사례**였고 둘 다 owner/개발 세션이 이미 정석대로 처리(사전 격리·사전 청킹)해 net-new 발견 0 — 기존 규칙이 정확히 작동함을 재확인한 것으로 충분, 신규 패턴 추가 불요.
> - 신규 이슈 0건, 자동수정 0건(검토한 2커밋 모두 사전 clean), done-sync: new 8(변동없음)·done 511(변동없음)·rejected 6(변동없음). 다음 순번 **Area 1**.
>

> **Area 5 보안 (2026-08-04T15:21):**
> - **방법**: `git fetch origin main`(HEAD `813531d` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81), `npx tsc --noEmit` clean. Area 5 **50회차** — 직전 Area5(`92e97e6`, 08-03T03:11, 49회차) 이후 `git log 92e97e6..HEAD -- src/routes src/scripts migrations index.tsx src/layout src/pages`는 **0건**(17커밋 전량 IA cut-panel CEP 벡터 컷라인 플러그인 작업[`IllustratorAutomat/designer/**`+`scripts/cut-panel-smoke.mjs`+`scripts/install-cut-panel.bat`, CLAUDE.md 명시 IA 축2·독립 배포경로, 웹 SPA/DB 밖] + auto-improve 사이클 로그 4건뿐) — 보안(IDOR·XSS·인증·인젝션) 렌즈로 볼 신선 코드 경로가 **6사이클 연속** 전무.
> - **필수 grep 2종(매 사이클)**: `grep -rnE "c\.env\.[A-Z_]+ *\|\| *'" src` → `fax.ts:43 BAROBILL_FTP_PASSWORD || ''`(빈 문자열 폴백, 기존 FP) 1건 외 없음. `grep -rnE "password.*\|\| *'[^']+'" src` + CI yml `secrets\.[A-Z_]+ *\|\| *'` → 0건. net-new 하드코딩 시크릿/기본비밀번호 없음.
> - **마이그 번호 중복 재확인**: `ls migrations | sed ... | sort | uniq -d` → 기존 5쌍(0327·0412·0416·0420·0453)만, net-new 0.
> - **형제-비대칭 IDOR·XSS 스캔**: 이번 델타에 `src/routes`·`src/scripts` 변경이 0건이라 신규 mutate 핸들러·innerHTML sink 자체가 없음 — 재검토 대상 없음(스캔 스킵이 아니라 대상 부재). 현재 open 8건 중 보안(IDOR/XSS) 라벨 대상 0건(전부 UX/데이터 버그) — fixed-in-tree 재확인 대상 없음.
> - **backlog↔GitHub 절대값 재동기화**: `search_issues` 실측 — open **8**(#585·#586·#587·#589·#590·#591·#592·#593, 변동없음) · `reason:completed` **511**(변동없음) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음). 완전 일치, 드리프트 0.
> - **🧬 SKILL 강화 없음** — 순수 확인 사이클(웹 코드 churn 0, 필수 grep net-new 0), 신규 코드화 패턴 없음.
> - 신규 이슈 0건, 자동수정 0건(검토 대상 코드 churn 자체가 없음), done-sync: new 8(변동없음)·done 511(변동없음)·rejected 6(변동없음). 다음 순번 **Area 6**.
>

> **Area 4 데이터 정합성 (2026-08-04T09:15):**
> - **방법**: `git fetch origin main`(force-updated, HEAD `ec87745` = origin/main 일치) → `git checkout ec87745`(detached) → `npm ci`(node_modules 0→81). Area 4 **51회차** — 직전 Area4(`8da0c64`, 08-02T21:24, 50회차) 이후 `git log 8da0c64..HEAD -- src/routes migrations src/scripts`는 **0건**(21커밋 전량 IA cut-panel CEP 벡터 컷라인 플러그인 작업[`IllustratorAutomat/designer/**`+`docs/CUT_PANEL_USAGE.md`, CLAUDE.md 명시 IA 축2·독립 배포경로, 웹 SPA/DB 밖] + auto-improve 사이클 로그 4건뿐) — 데이터 정합성 렌즈로 diff할 신선 라우트/마이그/스크립트 churn이 **5사이클 연속** 전무.
> - **표준 게이트**: `npx tsc --noEmit` clean. `ls migrations | sed -E 's|.*/?([0-9]{4})_.*|\1|' | sort | uniq -d` → 기존 5쌍(0327·0412·0416·0420·0453)만 재확인, net-new 0.
> - **open≠unfixed 재확인**: `search_issues(is:open,label:auto-improve)` 실측 **8건**(#585·#586·#587·#589·#590·#591·#592·#593, 변동없음) — 이번 윈도(21커밋) 전부 `src/routes`/`migrations`/`src/scripts` 밖이라 Area4 관련 이슈(#589 consolidate_with_order_id·#592 간판BOM item_code 오참조·#593 order_item 7282 재분류 충돌)의 대상 파일(`orders/core.ts`·`migrations/0508~0512`) 자체가 이번 churn에 없음 → 직전 Area4 50회차가 직접 발견·재grep 완료한 verified-once 캐시 그대로 신뢰(line 296 원칙), 재검증 스킵. fixed-in-tree 0건.
> - **backlog↔GitHub 절대값 재동기화**: `search_issues` 실측 — open **8**(변동없음) · `reason:completed` **511**(변동없음) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음). 완전 일치, 드리프트 0.
> - **🧬 SKILL 강화 없음** — 순수 확인 사이클(데이터/코드 churn 0, 마이그 번호중복 재확인 net-new 0), 신규 코드화 패턴 없음.
> - 신규 이슈 0건, 자동수정 0건(검토 대상 라우트/마이그 churn 자체가 없음), done-sync: new 8(변동없음)·done 511(변동없음)·rejected 6(변동없음). 다음 순번 **Area 5**.
>

> **2026-07-29 백로그 소진 세션** (main `9686bf69`, deploy success): 11건을 심각도순으로 전건 처리.
> 사전에 **11건 전부 코드 대조**해 오탐 0건·실존 10건 + fixed-in-tree 1건(#580)임을 확인하고 착수했다
> ([[feedback-autoscan-false-positives]] 절차). 검증=tsc 0·build·check:dom 9(기준선)·entity 60/60·
> 로컬 스모크 104/104·**prod 스모크 104/104**·prod 번들 마커 13/13.
> **★브라우저 실클릭이 정적 검사가 통과시킨 실버그 1건을 추가 검출**(대기함 검색 결과를 클라 필터가
> 가리는데 빈 상태 문구는 "없습니다"라고 안내) → 별도 커밋. Phase 7b-2의 교훈이 그대로 재현됐다.
> ⚠️ **발송 계열은 실호출 미검증** — 테스트 호출이 곧 실발송이라 `/send-bulk`·`/ad/send`는 부르지 않고
> 모의 응답·단위 로직으로 대체([[design-ad-compliance-guard]] 함정). 소량 1건 자연검증 필요.

> **Area 3 UX/기능 감사 (2026-08-04T03:13):**
> - **방법**: `git fetch origin main`(HEAD `2a14e3f` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81), `npx tsc --noEmit` clean. Area 3 **50회차** — 직전 Area3(`a3d8527`, 08-02T15:22, 49회차) 이후 `git log a3d8527..HEAD -- src/scripts src/pages src/layout index.tsx src/routes`는 **0건**(35커밋 전량 IA cut-panel CEP 플러그인 신규 구축[`IllustratorAutomat/designer/**`, CLAUDE.md 명시 IA 축2·독립 배포경로]·간판 BOM 데이터 마이그[0508~0512, Area2/4/6이 이미 컬럼정합성 검증]·오프라인 매입원장 이관 스크립트뿐) — 웹 UX 렌즈로 볼 신선 churn이 **4사이클 연속** 전무.
> - **open≠unfixed 재확인(대표 2건 직접 재grep, 캐시 아닌 실측)**: `orderForm/parent.js` `loadOrderForEdit()` 여전히 존재 + `grep -n line_discount|discount_reason|discount_by src/scripts/orderForm/parent.js` = 0매치(#590 잔존, load 경로 미복원 그대로) · `messagesAd.js:329 adLoadOptOuts()` 여전히 파라미터 없이 정의·호출(:29/:357/:368, #587 잔존) — fixed-in-tree 0건, 나머지 6건(#585·#586·#589·#591·#592·#593)은 해당 파일 churn 0이라 직전 사이클 verified-once 캐시 그대로 신뢰(line 296 원칙).
> - **backlog↔GitHub 절대값 재동기화**: `search_issues` 실측 — open **8**(#585·#586·#587·#589·#590·#591·#592·#593, 변동없음) · `reason:completed` **511**(변동없음) · rejected **6**(변동없음, not_planned 4+duplicate 2). 완전 일치, 드리프트 0.
> - **🧬 SKILL 강화 없음** — 순수 확인 사이클(프론트 코드 churn 0, open 이슈 대표 재확인 2건 모두 잔존), 신규 코드화 패턴 없음.
> - 신규 이슈 0건, 자동수정 0건(검토 대상 프론트 churn 자체가 없음), done-sync: new 8(변동없음)·done 511(변동없음)·rejected 6(변동없음). 다음 순번 **Area 4**.
>

## ✅ Approved / 👀 Reviewed (owner 피드백 수신)

> 없음 — 이전 유일 reviewed 건(I-060/#372 CSV 잘림경고)은 06-12 owner 옵션1로 구현·close 완료 → Done 이관 (Area 6 43회차, 2026-07-16 재확인).

## 🆕 New (미검토)

> 전부 GitHub open + 👍 미수신. 용준님 리뷰 대기. (open **실측 12건** — #599 신규, Area 5 51회차, 2026-08-06. #594·#595는 같은 사이클 내 owner가 픽스+close 완료돼 표에서 제외.)

| Issue | 제목 | 영역 | 라벨 | 상태 메모 |
|-------|------|------|------|-----------|
| #599 | cards /:id/history, /:id/defects, /:id/checklist 형제-비대칭 IDOR — 타법인 카드 ID로 내부 이력·불량·체크리스트 열람 가능 | Area 5 | bug,S | issue-only, 신규(#599) |
| #598 | print_events event_kind 필터 부분 롤아웃 — rip.ts GET /equipment/:id/stats만 이중집계 누락 | Area 4 | bug,M | issue-only, 신규(#598) |
| #597 | orders/update.ts 라인교체 경로가 order_ai_files.order_item_id(RESTRICT FK) 정리 누락 — 칼선 DXF 첨부 주문 수정 시 100% 500 | Area 4 | bug,HIGH | issue-only, 신규(#597) |
| #596 | 반복지출 탐지 API(/bank/recurring-candidates)에 화면이 없음 — 월 15,872,480원 발견에 실제 쓰였는데 매번 API 직접 호출해야 함 | Area 3 | improvement,M | issue-only, 신규(#596) |
| #585 | messagesAd.ts POST /send 실패 수신자 식별 불가 — #574 형제 라우트(messages.ts /send-bulk) 미반영 | Area 3 | bug,M | issue-only, 신규(#585) |
| #586 | 광고문자 제목/본문 수정 시 "대상 확인" 미리보기 게이트 미무효화 | Area 3 | bug,S | issue-only, 신규(#586) |
| #587 | 광고문자 수신거부 명단 — 서버 search 파라미터 미사용, 300건 상한 초과 시 과거건 조회 불가 | Area 3 | improvement,S | issue-only, 신규(#587) |
| #589 | 취소주문 2단계 하드삭제(a621cdd)가 처음 도달 가능해진 consolidate_with_order_id 정리 누락 — 자식 주문에 죽은 링크/유령 ID 잔존 | Area 2 | bug,S | issue-only, 신규(#589) |
| #590 | 주문 수정 재진입 시 기존 행 에누리(line_discount) 미복원 → 다음 저장에서 소멸 | Area 3 | bug,M | issue-only, 신규(#590) |
| #591 | 공군사관학교(id=3763) business_registration_number에 내부코드 '00017'이 실 BRN처럼 저장 — 세금계산서 발행 시 유효성 거부 위험 | Area 4 | bug,S | issue-only, 신규(#591) |
| #592 | 간판 BOM(0508) 핵심 자재 3종 item_code 오참조 — SELECT 매치 0행으로 INSERT/UPDATE 전량 silent no-op(LED·광확산판·백판 BOM 누락) | Area 4 | bug,S | issue-only, 신규(#592) |
| #593 | order_item 7282 — 마이그 0509(단위오파싱 정정)와 0512(전수 신규승격 스윕)가 반대 방향 재분류, 0509의 실측 근거 보정이 조용히 원복 | Area 4 | bug,S | issue-only, 신규(#593) |

> 직전 사이클(45회차) 표에 있던 #559·#558·#557·#556·#555·#554는 2026-07-29 백로그 소진 세션에서 owner가 심각도순 전건 처리(코드 픽스+배포+close, 상세는 상단 "2026-07-29 백로그 소진 세션" 노트 참조) → Done 이관.

---

## 🔧 Auto-fixed (자동 수정 완료)

| ID | 제목 | 커밋 | 날짜 |
|----|------|------|------|
| A-022 | branch-cleanup.cjs 셸 인용 버그 + 저재고 알림 단위라벨 불일치 — ①`git branch --format=%(refname:short)` 미인용이 POSIX 셸(bash/dash)에서 괄호 메타문자로 파싱돼 즉시 크래시(Windows cmd.exe에서만 우연히 동작, 순수 셸 이식성 버그) → 큰따옴표 인용. ②`utils/inventoryAlert.ts` 저재고 알림이 base_unit(미터) 저장값에 입고단위(`items.unit`='롤') 라벨을 그대로 붙여 "45롤"(실제 45m)로 오표시 — 0496(롤→미터 단위체계) 형제완전성 사각, `resolveStockUnit()`로 교체(오늘자 inventoryCount.ts 수정과 동일 패턴). Area 6 52회차. verify PASS(tsc clean+build+entity 60/60) | 87b5023 | 2026-07-29 |
| A-021 | iaEditor.js dead code 2건 제거 — `iaeCanUpdateMembership`(드래그/회전/복제 후 시트 멤버십 재배정용, 문서화된 의도는 있었으나 실제 드래그 이벤트 핸들러 자체가 미구현 — 캔버스가 Konva 대신 정적 SVG 미리보기로 방향전환돼 호출부 0) + 유일 의존 헬퍼 `iaeCanSheetByUid`. 코드베이스 전수 grep으로 호출처 0건 확인(동적 dispatch 패턴 없음) 후 제거. Area 2 53회차. verify PASS(tsc clean+build), check:dom 9(회귀 0) | (이번 커밋) | 2026-07-28 |
| A-020c | XSS escapeHtml 누락 3곳 + bank.ts 배치 상한 2곳 — `messages.js` 발송이력/통계 `receiver_num`(형제 `receiver_name`은 escape인데 누락) + `receiving.js` 검수템플릿 드롭다운 `template_name`/`category_name`(관리화면 `inspections.js`는 escape인데 소비화면만 raw) + `bank.ts` batch-apply/batch-match 서버측 1000건 상한(#583, UI Shift범위선택 1000건 캡이 클라이언트 전용이던 것 보완). Area 5 45회차. verify PASS(tsc clean+build) | 040d882, 59330b5 | 2026-07-28 |
| A-020b | XSS escapeHtml 누락 6곳 — `reports.js` 4곳(designer_name/client_name×3, title속성만 escape하고 content는 raw이던 복붙누락) + `ledger.js` 2곳(item.unit, 형제 item_name/spec/content는 escape인데 unit만 누락 — 매입PO품목라인 신기능(0f2d745)이 매출측 기존 미이스케이프 패턴 그대로 복제). Area 5 41회차 프론트 XSS sweep 에이전트 격리 → 오케스트레이터 직접 Read 재확인 후 escapeHtml/esc() 래핑(표시 불변). verify PASS(tsc clean+build) | (이번 커밋) | 2026-07-22 |
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
