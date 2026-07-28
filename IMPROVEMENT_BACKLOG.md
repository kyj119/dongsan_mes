# Improvement Backlog
<!-- last_run_area: 6 -->
<!-- last_run_at: 2026-07-28T09:20:00+09:00 -->

> 자율 점검·개선 에이전트(auto-improve)가 6개 영역을 순환하며 발견한 항목.
> 용준님이 주기적으로 리뷰하여 상태를 변경 (new → approved → done, 또는 rejected).

## 통계
| 상태 | 건수 |
|------|------|
| 🆕 new | **11** (GitHub OPEN 실측, 07-28T09:20 — 실질 미해결 10건 + close-pending 1건[#580, fixed-in-tree]) |
| ✅ approved | 0 |
| 👀 reviewed | 0 |
| ✔️ done | **499** (`reason:completed` 절대값, +1 — #582 별도세션 자동픽스 확인) |
| ❌ rejected | **6** (`reason:not_planned`=4 + `reason:duplicate`=2, 변동 없음) |

> 📦 **과거 사이클 로그**는 `IMPROVEMENT_BACKLOG_ARCHIVE.md`/git 히스토리로 이관됨 (2026-06-10 1차 분리, 2026-06-25 2차 트림 343KB→192KB, 2026-06-25T10:00 3차 트림, 2026-07-03T06:00 4차 트림 288KB→86KB, 2026-07-07T13:00 5차 트림 238KB→78KB, 2026-07-20T19:20 6차 트림 — 07-06~07-17 사이클 로그 이관: 306KB→80KB, **2026-07-27T23:00 7차 트림 — 사이클 로그 39건 중 31건 이관(최근 8건=전 Area 1바퀴+2만 유지): 196KB→63KB**). 신규 로그는 계속 이 파일 상단에 추가. 본 파일은 **최근 8사이클 로그**(전 Area 1바퀴 커버 = 직전 사이클 diff 판단에 필요한 최소분) + 영구 참조 섹션(Approved/New/Auto-fixed/Done/Rejected/FP 카탈로그)만 유지. 이관분은 `IMPROVEMENT_BACKLOG_ARCHIVE.md` 또는 `git log -p -- IMPROVEMENT_BACKLOG.md`로 복원 가능.
> ↳ **8차 트림 (2026-07-27, 자동)**: 사이클 로그 9건 → 8건 유지, 1건 이관 (66KB → 트림 후 아래 참조).

> **Area 6 자기 진화 (2026-07-28T09:20):**
> - **방법**: `git fetch origin main`(forced-update, HEAD `6685a36` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81). Area 6 **51회차** — 직전 Area6(`fe11c1c`, 07-26T23:50, 50회차)이 아니라 직전 Area5(`8604557`, 07-28T03:35, 45회차) 기준으로 재점검(6영역 순환상 직전 사이클이 Area5) — `git log 8604557..HEAD -- src/routes src/scripts migrations` = **4커밋뿐**(`040d882` XSS 자동수정·`59330b5` #583 자동수정·`f57abc9` #580 픽스·`adc13be` #582 픽스, 전부 Area5 자기 사이클 산출물 또는 owner/타세션 후속 픽스) — 컬럼-diff/XSS bridge 대상 신선 churn 없음. 같은 구간의 `4b8c250`/`adfc077`/`38cc411`(판짜기 shelf bin-pack)은 `IllustratorAutomat/**`·`nesting-harness.mjs` CEP 패널 코드로 웹앱 라우트/스크립트/마이그 범위 밖 — 스킵.
> - **🔴 open≠unfixed 재확인 — #580 close-pending 신규 합류**: `f57abc9`(owner/별도세션, 00:31)가 `contactGroups.ts GET /:id/members`에 `AND is_active = 1` 추가해 #580(비활성 거래처 대량발송 포함) 픽스를 완결했으나 **GitHub 이슈는 OPEN 유지**(commit 메시지에 `(#580)` 인용 O, close 실행 X) — SKILL "open≠unfixed"(line 281) 표준 재현. 코드 직접 확인(diff Read, 커밋 메시지 신뢰 안 함): 유일 소스(`clients` 조회 1곳)에 필터 추가 완료, 형제(employees `is_deleted=0`)와 대칭 확보 — **형제완전성 clean**(파일 내 거래처 조회 사이트 1곳뿐이라 재검토 대상 자체가 단순).
> - **✅ #582도 검증 확인(이미 정상 close)**: `adc13be`(owner/별도세션, 08:42)가 `workbench.ts POST /intakes` 본경로 + `/intakes/:id/absorb` 변종(이슈 본문이 "부수" 항목으로 명시했던 낮은심각도 변종)까지 **양쪽 다** `orderVisibilityFilter(c,'o')` JOIN 가드로 픽스 — 이슈에 GitHub이 이미 `state_reason:completed`로 정상 close돼 있어 close-pending 아님(정상 사이클). 코드 diff 직접 확인해 이슈 본문의 "부수 변종"까지 누락 없이 커버됐음을 재검증(형제완전성 clean, `absorb` 경로도 동일 필터 적용).
> - **backlog↔GitHub 절대값 재동기화**: `list_issues(state:OPEN,label:auto-improve)` 실측 **11건**(#572~#579, #580[close-pending], #581, #584 — #582·#583은 이미 completed close로 제외). `search_issues(reason:completed)` 실측 **499**(+1, #582가 이전 캐시 498에 반영 안 돼 있던 것 보정). rejected(`not_planned` 4 + `duplicate` 2) **6** 변동 없음.
> - **도구 상태 확인**: `npx tsc --noEmit` clean, `node scripts/entity-audit.mjs`(125파일·SELECT60·통과60·누락0), 마이그 번호 중복 스캔(기존 5쌍 `0327/0412/0416/0420/0453`만, 신규 0).
> - **🧬 SKILL 강화 없음(기존 패턴 재현)** — #580 close-pending은 "open≠unfixed"(line 281)의 정상 재현(신규 클래스 아님), 규모도 1건뿐이라 "close-pending 적체" 집계 경고(line 291) 임계치 아님(현재 적체 = #580 1건, owner 배치클로즈 유도 불필요할 만큼 소규모). #582는 형제완전성까지 커버된 완결 픽스라 별도 재오픈 불요.
> - 신규 이슈 0건, 자동수정 0건(전부 타 세션 기픽스 확인 작업), done-sync: new 12→11(#582 completed 이관 -1, #583 이미 반영, #580 close-pending 유지)·done 498→499(+1)·rejected 6. 다음 순번 **Area 1**.

> **Area 5 보안 (2026-07-28T03:35):**
> - **방법**: `git fetch origin main`(forced-update 감지, HEAD `8604557` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81, #439 표준절차). Area 5 **45회차** — 직전 Area5(`b798aed`, 07-26T21:40, 44회차) 이후 `git log b798aed..HEAD -- src/routes src/scripts migrations`는 **35커밋/98파일(+3672/-649)** 대량 churn(MMS/SMS 대량발송+거래처그룹·은행 일괄매칭 통합+Shift범위선택·직원 휴가 셀프신청·클레임반품 AR 자동조정+포털계정 게이트(#557)+IDOR 6핸들러(#571) 수정·후가공 도메인 프로파일 A1·발주 법인간거래 토글·정렬 tie-break 전역 스윕). 필수 표준 스캔 전부 clean: secret fallback grep(`fax.ts` 기존 FP만)·기본비밀번호 리터럴 0·마이그 번호 중복(기존 5쌍만, 신규 0)·`entity-audit.mjs`(125파일·SELECT60·통과60·누락0)·`tsc --noEmit` clean·GitHub Actions 워크플로 변경 0(`pull_request_target` 없음, 기존 안전).
> - **general-purpose 에이전트 5개 병렬**로 churn을 기능 클러스터 단위 분할 심층 감사(①메시징/카카오/거래처그룹 ②은행 일괄매칭 ③직원셀프서비스+AR자동조정 ④IA워크벤치/생산 ⑤발주/구매/세금계산서) + 오케스트레이터 직접 재검증:
>   - **🔴 신규 이슈 4건**:
>     - **#581 (M, bug, issue-only)**: `taxInvoices/batch.ts` `POST /batch-create`·`POST /monthly-create` 양쪽 모두 entity_id 필터 전무(형제 `queries.ts GET /eligible-orders`는 `entityFilter` 적용 — 부분픽스 패턴). MANAGER(법인 스코프)가 타법인 order_id 지정 또는 월합산 대상 조회만으로 **타법인 명의 실제 전자세금계산서(바로빌)를 발행**할 수 있음 — cross-entity 금융/법적효력 write. 오케스트레이터가 에이전트 보고("LOW, pre-existing")를 직접 재검증해 HIGH로 상향(`createSplitInvoices`→`issueTaxInvoice` 외부발행 확인).
>     - **#582 (S, bug, issue-only)**: `workbench.ts POST /intakes`(대기함 등록)가 body의 `order_item_id`를 entity 검증 없이 `order_items` UPDATE — 같은 파일 형제(`/intakes/:id/absorb`)는 `entityFilter(c,'o')` JOIN으로 올바르게 격리(byte-명확한 형제 정답 패턴 존재). 타법인 주문라인에 잘못된 시안이 연결되는 실제 데이터 오염(읽기 유출 아님).
>     - **#583 (S, improvement) → 자동수정 완료(done)**: `bank.ts` `batch-apply`/`batch-match`가 서버측 건수 상한 없음(오늘 도입된 Shift 범위선택 UI 1000건 캡은 클라이언트 전용). 기존 `/transactions` limit 클램프와 동일 패턴으로 서버측 1000건 상한 추가 — `npm run verify` 통과 후 커밋(`59330b5`), 이슈는 커밋 직후 close.
>     - **#584 (S, improvement, issue-only)**: SMS/LMS/카카오 대량발송에 건수 상한 없음(MMS만 방어) — 실수/오남용 시 실비용 발생 리스크.
>   - **🔧 오케스트레이터 직접 자동수정 2건(경미 XSS, 승인 불요 — escapeHtml 추가는 표시 불변)**: `messages.js` 발송이력/통계 상위수신자 패널의 `receiver_num` 2곳(형제 `receiver_name`은 escape인데 누락 — A-025급 형제필드 비대칭) + `receiving.js` 검수템플릿 드롭다운의 `template_name`/`category_name`(관리화면 `inspections.js`는 escape인데 소비 화면만 raw). 커밋 `040d882`.
>   - **확인 후 드롭(기존 이슈로 이미 문서화, 재보고 불요)**: `clients.ts POST /:id/portal-account` 형제 entityFilter 자체는 #557(closed-completed)로 셀프발급 벡터는 이미 차단됨 — 에이전트가 재발견한 "portal.ts 전체가 client_id만 스코프"라는 **근본 갭은 #557 본문에 이미 명시적으로 인지·후속과제로 남겨진 것**(owner가 (a)/(b)/(c) 수정옵션 중 미결정) → 중복 이슈화 안 함.
> - **오탐 배제**: bank.ts `client_id` cross-entity 의심(에이전트가 초기 의심 후 스스로 반증) — `clients` 테이블 자체가 entity_id 없는 전역 마스터(기존 컨벤션)라 FP. purchaseOrders 법인간거래 토글은 entityFilter가 4개 쿼리사이트 모두 독립 적용돼 있어 #368 패턴(클라 플래그로 필터 무력화) 아님 — 자기 엔티티 범위 내에서만 토글 작동.
> - **backlog↔GitHub 절대값 재동기화**: `search_issues(label:auto-improve,state:open)` 실측 **12건**(#572~#580 9건 이월 + #581·#582·#584 신규 3건, #583은 생성 직후 자동수정으로 같은 사이클에 close). done(`reason:completed`) 실측 **498**(+1, #583) · rejected(`not_planned` 4 + `duplicate` 2) **6**(변동 없음).
> - **🧬 SKILL 강화 없음(기존 패턴 재현)** — #581/#582 모두 기존 "형제-비대칭 IDOR"(#437/#452급) 클래스의 신규 도메인(세금계산서 월합산·IA워크벤치) 재현. #583/#584는 "UI 클라이언트 캡이 서버측 미반영" 신규 하위패턴이나 기존 "N+1 3번째 축"(#478)·"MMS 전용 방어" 관찰과 인접해 별도 codify 불요. 5개 병렬 에이전트 + 오케스트레이터 재검증(에이전트가 LOW로 축소평가한 #581을 실제 코드 추적으로 HIGH 재상향) 체계가 이번 대량churn(98파일)에서 유효했음.
> - 신규 이슈 3건(#581·#582·#584, issue-only) + 자동수정 2종(XSS escapeHtml 3곳·bank 배치캡 2곳, #583 done 처리), done-sync: new 9→12·done 497→498·rejected 6. 다음 순번 **Area 6**.

> **Area 4 데이터 정합성 (2026-07-27T23:54):**
> - **방법**: 로컬 체크아웃(HEAD `1921e7ef` = origin/main 일치, 워킹트리 clean, node_modules 64). Area 4 **46회차** — 직전 Area4(`ac6fe38`, 07-26T15:15, 45회차) 이후 `git log ac6fe38..HEAD -- src/routes migrations` = **20+커밋/75파일(+1798/-432)** 대량 churn(정렬 tie-break 전역 스윕 92곳·발주 법인간거래 제외·IA B단계 batch_key·MMS/SMS 대량발송+거래처그룹·은행 자동매칭 3종·IDOR 6핸들러). **에이전트 위임 없이 인라인 수행**(과다 위임 억제 정책 신설분 적용 — 스캔 대상이 grep 수준이라 위임 오버헤드가 더 큼).
> - **🔴 신규 이슈 — #580 (M, bug, issue-only)**: 연락처 그룹 멤버 조회(`contactGroups.ts` GET `/:id/members` = 대량발송 대상 미리보기 동일 소스)가 **거래처에 `is_active` 필터 미적용** — 같은 함수의 형제 직원 조회는 `AND is_deleted = 0` 적용(**형제 비대칭**). 거래처 삭제는 soft delete(`clients.ts:1112` `SET is_active = 0`)라 비활성 거래처가 정상 멤버로 반환 → 발송 대상 포함. **설계 의도와 모순**: 같은 응답의 `orphan_count` 주석이 "조회되지 않는 건수(하드삭제·**비활성** 등)"로 비활성을 명시 전제하고 프론트도 "발송 대상 아님" 경고를 띄우는데, 실제로는 걸러지지 않아 **경고조차 안 뜨고 발송됨**. MMS 건당 100원 과금 + 외부 발송은 되돌릴 수 없음. FP 배제 = is_active 실재·같은 파일이 그룹 자체엔 `g.is_active = 1` 사용·도달성 LIVE(`messages.js`)·의도적 포함 근거 없음. 자동수정 금지 판정 = 발송 대상 집합 축소는 운영 케이스 확인 필요 + egress로 검증 불가.
> - **🟢 churn 정합성 = clean(3종 전수)**: ① **신규 비-FK 참조 `adjustments.source_id`(0475, `customer_claims.id|returns.id` polymorphic이라 FK 미선언)** → #477 churn-트리거 재스캔 적용: `orders/core.ts:675-676`이 `DELETE FROM adjustments WHERE source_type='CLAIM'/'RETURN' AND source_id IN (...)`를 **소스(customer_claims/returns) 삭제 前**에 실행(`#567` 주석 명시, 팬텀 AR 감액 방지) + 클레임/반품 단건 하드삭제 경로 부재(`DELETE FROM customer_claims` 전수 1건=주문삭제 batch만, `returns.ts:84`는 생성실패 보상 rollback=FP클래스(d)) → dangling 0. ② **`contact_group_members.member_id`(0476, CLIENT/EMPLOYEE polymorphic 비-FK)** → clients·employees 양쪽 **soft delete**라 부모 행 물리 소멸 없음 = 구조적 dangling 불가(단 stale membership이 위 #580). ③ **신규 컬럼 detail SELECT(#484 (b)-risk)** = `source_type`/`source_id`는 DELETE WHERE절에만 사용(명시 SELECT 아님), `batch_key`는 SELECT 미등장 → 마이그 미적용 시 500 나는 경로 없음. `cashSchedule.ts:104`·`purchaseInvoices.ts:247`의 동명 `source_type`은 **다른 테이블(cash_schedule) 기존 컬럼** = FP.
> - **backlog↔GitHub 절대값 재동기화**: `gh issue list(OPEN,auto-improve)` 실측 **8건**(#572~#579, 백로그 기재값과 일치) + 이번 신규 #580 = **9**. `search/issues` 실측 done(`reason:completed`) **497**·rejected(`not_planned` 4 + `duplicate` 2) **6** — 둘 다 백로그 기재값과 **정확히 일치**(이번 사이클 close 0건).
> - **🧬 SKILL 강화 없음(기존 패턴 재현)** — #580은 기존 "형제-비대칭"(#437/#452 IDOR의 **soft-delete 필터 버전**) + "설계 의도(주석·UI)와 구현 불일치" 조합. 새 탐지 클래스가 아니라 이미 코드화된 렌즈를 신규 기능(0476 연락처 그룹)에 적용해 발견. 다만 **soft-delete 필터 비대칭**은 기존 카탈로그가 IDOR/컬럼존재성 축으로만 다뤄 명시 항목이 없었으므로, 향후 Area 4에서 "polymorphic 멤버십 테이블의 부모 조회 시 각 부모 타입별 활성/삭제 필터 대칭성"을 함께 볼 것.
> - **📌 부수 — 백로그 7차 트림 직후 첫 사이클**: 이 사이클이 다이어트(196KB→63KB) 후 auto-improve 정상 동작 검증을 겸함. 형식 계약 13항목·메타 주석·카운터 전부 보존 확인, 직전 Area4(45회차) 로그 참조 성공(최근 8건 유지분에 포함), done-sync 절대값 3종 일치.
> - 신규 이슈 1건(#580, issue-only), 자동수정 0건, done-sync new 8→9·done 497·rejected 6. 다음 순번 **Area 5**.

> **Area 3 UX/기능 감사 (2026-07-27T21:35):**
> - **방법**: `git fetch --deepen=200 origin main`(shallow clone이라 이전 사이클 SHA 확보 위해 확장, HEAD `295b029` = origin/main 일치, 워킹트리 clean, detached). Area 3 **45회차** — 직전 Area3(`1e3a122`/`7dd2105`, 07-26T09:22, 44회차) 이후 `git log 7dd2105..HEAD`는 **78커밋**(대량 churn — MMS/SMS 대량발송+거래처그룹 신기능, 은행 자동매칭/일괄매칭 통합+체크박스 Shift 범위선택 전역 도입, 디자이너 대기함 필드캐리+후가공 도메인 프로파일 A1(가공자↔도메인 매핑)+B단계 배치그룹핑, 발주 목록 법인간거래 토글, 목록 정렬 tie-break 전역 스윕, 카드 썸네일/실적탭 버그수정 다수). general-purpose 에이전트 3개 병렬 파견(①MMS 대량발송+거래처그룹 ②은행 일괄적용+Shift범위선택 전역도입 일관성 ③디자이너 대기함+후가공 도메인 프로파일)로 신규 기능 표면 심층 감사.
> - **🔴 신규 이슈 7건(#573~#579, 전부 issue-only — Area3 정책상 UI/UX 변경은 자동수정 금지)**:
>   - **#573 (S, bug)**: 대량발송(SMS/MMS) 버튼에 기존 `safeSubmit` 헬퍼 미적용 — 중복클릭 시 confirm 다이얼로그 중복 노출 후 실제 중복 POST 발생, MMS는 건당 100원 과금이라 이중과금 위험. 동일 수정으로 로딩표시 부재도 해소.
>   - **#574 (M, improvement)**: 대량발송 부분실패 시 실패 대상자 미노출 + `bulkSelectedRecipients` 초기화로 재발송 경로 자체가 소실(형제 패턴 `bank.js:1312` 카카오 일괄발송 결과모달 존재).
>   - **#575 (M, bug)**: 디자이너 대기함 일괄 프리필(`ofTrayPrefillRows`) try/catch 없음 — 부분실패 시 무응답 중단 + 캐시 미정리로 중복 프리필 위험(형제 함수 `absorb`는 이미 올바른 패턴 보유).
>   - **#576 (M, improvement)**: 디자이너 대기함 200건 하드캡 + 키워드/날짜 검색 전무 — 초과분 존재 자체가 무통보.
>   - **#577 (M, bug)**: 가공자↔도메인 매핑이 자유텍스트 이름 입력 — 오타 시 CEP 측이 조용히 기본 도메인(현수막)으로 폴백, 오늘 도입된 핵심기능 목적 무력화 가능.
>   - **#578 (M, improvement)**: 은행 일괄적용 3종 묶음 보고 — 커밋 전 미리보기 없음·건별결과 없이 집계토스트뿐(형제 패턴 `orders.js` bulkResultModal 존재)·버튼 로딩표시 없음(형제 `confirmAllTransfers()` 이미 보유).
>   - **#579 (S, bug)**: `messages.js` 수신자 피커 체크박스가 `tbody`/`data-check-group` 경계 없이 `<label>` 목록이라 신규 shift-select 헬퍼가 document 전체로 폴백 — 현재 무해하나 중첩 피커 시나리오에서 스코프 오염 위험.
> - **오탐 배제 확인**: 각 에이전트에게 기존 FP 카탈로그(필드명 불일치·explicit-search 패턴·상세모달 링크) 사전 제공, 이미 보고된 #572(N+1 서브요청 한도)와 중복되는 은행 배치 성능 이슈는 재보고 배제(순수 UX 피드백만 분리 보고). "간판(sign) 도메인 관리화면 부재"는 커밋 메시지 자체가 "남은 A1=간판 도메인 탭"으로 이미 인지된 진행중 항목이라 신규 이슈화 보류. "법인간거래 숨김건수 배지"·"그룹멤버 목록 검색"은 저가치 코스메틱 판단해 이슈화 생략.
> - **backlog↔GitHub 절대값 재동기화**: `list_issues(state:OPEN,label:auto-improve)` 실측 **8건**(#572 이월 + #573~#579 신규). done(`reason:completed`) **497**·rejected **6** 변동 없음(이번 사이클 close 0건).
> - **🧬 SKILL 강화 없음(기존 패턴 재현)** — 7건 모두 기존 클래스(safeSubmit 미적용·부분실패 재시도경로 소실·helper-loop 부분실패 무응답·검색/필터 부재·자유텍스트 마스터 매핑 오타·로딩표시 패턴 확립vs부분적용·shift-select 스코프 경계)의 신규 화면 재현. 다만 이번 사이클처럼 **하나의 순환 주기(24h) 안에 78커밋급 대형 churn**이 몰릴 때 general-purpose 에이전트를 기능 단위(메시징/은행/워크벤치)로 쪼개 병렬 파견하는 접근이 유효했음 — Area1/5/6이 이미 채택한 "churn 과다 시 기능 단위 병렬 분할" 패턴의 Area3 버전으로 참고.
> - 신규 이슈 7건(#573~#579, issue-only), 자동수정 0건, done-sync: new 1→8·done 497·rejected 6. 다음 순번 Area 4.
>

> **Area 2 코드 품질 심층 분석 (2026-07-27T15:33):**
> - **방법**: `git fetch origin main`(HEAD `0e0e2d0` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81), `npx tsc --noEmit` clean. Area 2 **52회차** — 직전 Area2(`7dd2105`, 07-25T18:18, 51회차) 이후 `git log 7dd2105..HEAD -- src/routes migrations src/scripts`는 **24커밋**(후가공 도메인 프로파일 A1 P1~P4·인테이크 대기함 필드캐리·자금관리 자동매칭/일괄매칭 통합·MMS/SMS 발송·거래처 그룹(신규 contactGroups.ts)·직원 휴가 셀프신청·git 이슈 정책분 다수). 표준 스캔 전부 clean: `entity-audit.mjs`(125파일·SELECT 60·통과60·누락0), 마이그 번호 중복(기존 5쌍만, 신규 0), secret fallback grep(`fax.ts` 기존 FP만).
> - **general-purpose 에이전트 3개 병렬**로 이번 churn 구간(24커밋) 심층 점검(N+1·dead code / authMiddleware·IDOR 형제완전성·마이그 컬럼존재성 / XSS·CHECK제약):
>   - **🔴 net-new 확정 — #572 bank.ts batch-apply N+1 심화**: 오늘 커밋 `fb02d25`("일괄매칭+일괄적용 통합")가 `POST /transactions/batch-apply` 루프(`bank.ts:1771`)에 `learnMatchRule` 호출을 신규 추가(+1 서브요청/건). `applyBankTransaction`(:1476) 자체가 이미 경로별 4~6회 순차 D1 호출(claim UPDATE·db.batch·후속 UPDATE·cash_schedule 보조 UPDATE 등)이라 건당 6~9회. 같은 사이클의 `7f6afdf`("체크박스 Shift 범위선택 전역 도입")가 목록(cap 1000)에서 두 클릭으로 전체선택을 가능케 해 "1000건 일괄적용 시 6,000~9,000 서브요청"이라는 새 경로가 열림(Worker 서브요청 한도 1000/req 초과 위험). Area 2 SKILL의 "N+1 3번째 축"(#478) 표준 패턴과 동일 클래스 — write-path 배치 세만틱 정책 판단 필요해 **issue-only**로 #572 등록.
>   - authMiddleware 커버리지(recursive) 후보 5건 전부 FP(순수헬퍼 `.get(` 오탐 3·`cron.ts` agentKeyMiddleware·`hrSelf.ts` scoped-token) — net-new 0.
>   - entity_id/IDOR 형제-비대칭: 신규 `contactGroups.ts`(거래처 그룹, `migrations/0476`에 entity_id 컬럼 자체 없음=법인공유 자산 정책 명시, `clients.ts` 동일 정책과 일치)·`claims.ts`/`returns.ts`(#567 AR 자동조정, mutate 직전 entityFilter 선행 확인) 전부 정상. (참고: `messages.ts:606-611` send-bulk의 employees 타깃 조회가 entity 필터 없음을 확인했으나 이번 churn 이전부터 존재하는 코드라 범위 밖, 다음 사이클 참고용 메모만.)
>   - 신규 마이그 0472~0476(intake_field_carry·worker_domains·fixed_expenses backfill·adjustments source_type·contact_groups) 컬럼 존재성 전수 대조 — INSERT/SELECT 컬럼 전부 일치, net-new 0.
>   - 명시 컬럼 SELECT 존재성(~20건)·CHECK 제약 literal write·SPA innerHTML XSS(messages.js/employeeSelf.js/myLeave.js/hrDetail.js/postProcessing.js/orderForm intake.js) 전부 clean — net-new 0(dashboard.js po_number/supplier_name escapeHtml은 오늘 별도 커밋 `a7ff772`로 이미 수정됨 확인).
> - **자동수정 0건**(발견 1건이 write-path 배치정책 판단 필요해 issue-only). **신규 이슈 1건(#572)**.
> - **backlog↔GitHub 절대값 재동기화**: `list_issues(state:OPEN,label:auto-improve)` 실측 **1건**(#572, 직전 사이클 open 18건 전부 owner가 completed close 확인) → new **1**. `search_issues(reason:completed)` **497**(직전 479+18) → done **497**. rejected(not_planned 4 + duplicate 2) **6** 변동 없음.
> - **🧬 SKILL 강화 없음** — 이번 사이클 발견은 기존 "N+1 3번째 축"(#478) 클래스의 재현(신규 클래스 아님).
> - done-sync: new 1·done 497·rejected 6. 다음 순번 Area 3.
>

> **Area 1 프로덕션 헬스 (2026-07-27T09:17):**
> - **방법**: `git fetch origin main`(HEAD `e8acc62` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81). 프록시가 이번 세션도 prod 호스트 직접 curl 차단(exit 56, CONNECT tunnel 403 — `webapp-9i0.pages.dev`·`observability.mcp.cloudflare.com` 둘 다 `__agentproxy/status` `recentRelayFailures`에 재확인, `cloudflare-observability` MCP 미인증 상태 지속) — 직접 prod API/Playwright 헬스체크 불가, GitHub Actions CI 기록으로 대체(기존 사이클과 동일 제약). Area 1 **51회차** — 직전 Area1(`93d2c57`, 07-25T21:30, 50회차) 이후 전체 사이클 1바퀴(Area2~Area6) + 별도 세션(co-author \"Claude Opus 4.8\") 커밋 다수가 이미 각 Area에서 렌즈별 커버 완료.
> - **deploy.yml 전수 확인**: 직전 사이클 이후 실행분(`#955`~`#963`대, `93d2c57`→`e8acc62` 구간) **전부 `success`** — Typecheck→Build→Deploy→Wait→Smoke 전 단계 green(최신 run `30225695930`, `e8acc62` merge, 2026-07-26T23:38:59Z 완료 확인). CF-internal transient·cold-start 재발 0. `backup.yml`(Daily D1 Backup)도 최근 10회 전부 success(마지막 07-26T17:55:31Z, 24h 이내 신선). `e2e.yml`은 계속 disabled(기존 인지 상태, 변동 없음). `verify.yml`은 PR 트리거 전용이라 이번 사이클도 실행 0건(정상).
> - **🔴 신규 발견 — #555도 open≠unfixed 대열에 합류(별도 세션이 이번 churn 구간에 직접 픽스)**: 직전 Area6(50회차)가 "실질 미해결 3건 — #555·#570·#571"로 분류했으나, 그 로그 시점(23:50) **직후**에 같은 세션이 커밋 2건을 더 만들어 #555를 실질 해소함을 코드 직접 확인:
>   - `50b5433`(fix#555): `migrations/0342`(product_materials가 삭제대상 legacy 품목 참조 → 먼저 정리 후 DELETE 추가)·`0343`(폐지분류 잔존 활성품목을 상품(4)으로 재배정 후 분류 삭제) — 신규 D1 풀리플레이가 막히던 FK 위반 2지점 해소, prod는 추적완료라 재실행 안 돼 무영향.
>   - `6bf25f8`(fix#555): 남은 블로커(0344+ 카테고리 id 환경분기)를 정면 수정하는 대신 **접근 자체를 전환** — `schema/baseline_schema.sql`(prod 스키마 스냅샷, 191테이블)+`schema/baseline_reference.sql`(설정 참조데이터, PII/거래데이터 제외)+`schema/baseline_applied_migrations.sql`(0001~0474 applied 마킹)로 신규/로컬 D1을 부트스트랩하는 `npm run db:bootstrap`(PowerShell) 신설, 472개 풀리플레이 경로는 `db:reset:replay`로 보존만. 커밋 메시지가 "신규 D1 부트스트랩 완주 검증(9카테고리·admin·job_role·수성=15)"을 주장.
>   - 검증(직접 확인, 커밋 메시지 신뢰 안 함): `git show` 2커밋 diff 직접 Read로 SQL/구성 내용 확인, `npx tsc --noEmit` clean(baseline 파일 추가가 타입 영향 없음 확인). **단 `db:bootstrap`은 PowerShell 스크립트라 이 Linux 세션에서 실행 검증은 불가**(Windows 전용 프로젝트 제약, 기존 인지 사항) — owner가 다음 Windows 세션에서 `npm run db:reset` 1회 실행해 실제 완주를 재확인 권장.
> - **backlog↔GitHub 절대값 재동기화**: `list_issues(state:OPEN,label:auto-improve)` 실측 **18건**(#554~#571, 변동 없음 — owner 활동 없음). `search_issues` 재조회 생략(close 0건, done **479**·rejected **6** 캐시 유지). 마이그 번호 중복 재확인 = 기존 5쌍(`0327`·`0412`·`0416`·`0420`·`0453`)만, 신규 0(0472~0476 정상).
> - **🧬 SKILL 강화 없음** — #555 fixed-in-tree는 기존 "open≠unfixed"(line 281) 규칙의 재현(신규 클래스 아님). 다만 인프라 접근 자체를 바꾼(풀리플레이 폐기→베이스라인 스쿼시) 근본 픽스라 다음 Area 6에서 owner의 실제 `npm run db:reset` 검증 결과를 close-pending 노트에 반영할 가치 있음.
> - 신규 이슈 0건, 자동수정 0건(순수 CI/인프라 헬스 확인 + 타 세션 픽스 재검증), done-sync: new 18(실질 2, #555 이번 사이클로 실질미해결에서 제외)·done 479·rejected 6. 다음 순번 Area 2.
>

> **Area 6 자기 진화 (2026-07-26T23:50):**
> - **방법**: `git fetch origin main`(HEAD `fe11c1c` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81). Area 6 **50회차** — 직전 Area6(`8b30b6a`, 07-26T02:1x경, 49회차) 이후 `git log 8b30b6a..HEAD`는 15커밋. 후가공 도메인 A1 feature churn(`83d952c`/`f823852`/`2744e54`/`e254922` 등)은 오늘 이미 Area1(50)·Area2(51)·Area3(44)·Area4(45)·Area5(44)가 각자 렌즈로 커버 완료 — 컬럼-diff/XSS bridge 대상 신선 churn 잔여 0.
> - **🔴 최우선 발견 — open≠unfixed, 사상 최대 규모(15/18건 fixed-in-tree)**: 이번 churn 구간에 별도 세션("Claude Opus 4.8" co-author)이 커밋 4건(`97101ac`·`359dd9e`·`8efd59c`·`423be94`, 커밋 메시지에 "git 이슈 N건 수정"으로 명시)으로 **OPEN 상태인 auto-improve 이슈 15건을 실제로 픽스**했으나 GitHub 이슈는 전부 OPEN 유지(close 미실행) — SKILL "open≠unfixed"(close-pending) 규칙 사상 최대 재현. **전 15건을 코드 직접 grep으로 개별 재검증(커밋 메시지 신뢰 안 함)**:
>   - `#554` departments.ts fixedRow: `is_active` → 기간중첩(`start_date<=? AND (end_date IS NULL OR end_date>=?)`) 전환 확인(`:257-259`, `#554` 주석)
>   - `#556` invoice.ts/quotation.ts hover: 구 teal(`#0f766e`/`#ccfbf1`) 3곳 전부 블루 계열(`#2563eb`/`#4f46e5`)로 교체 확인
>   - `#557` clients.ts POST /:id/portal-account: `getEntityId(c)!==0` 시 403(SUPER-ADMIN 전용 상향) 확인, `#557` 주석
>   - `#558` payroll/core.ts POST /preview: `entityFilter(c)` 추가 확인(`#558/#IDOR` 주석), 형제 /save와 동형
>   - `#559` cards/queries.ts GET /thumbnails: `cardEntityFilter(c)` 추가 확인(`#559` 주석)
>   - `#560` users.ts DELETE /:id/hard: 비-FK 감사컬럼 14종 잔존 경고(`AUDIT_COLUMNS` 배열 + `orphanAudit` 응답) 추가 확인(`#560` 주석)
>   - `#561` rip.ts equipment 4핸들러: heads PUT·presets POST/DELETE·maintenance POST 전부 `entityFilter`+역할게이트 추가 확인(`#561` 주석 4곳)
>   - `#562` taxInvoices/batch.ts POST /monthly-create: `MONTHLY_MAX_GROUPS` 상한 + `remaining_client_ids` 응답 확인
>   - `#563` clients.ts POST /import: `CHUNK=40` 청크 벌크조회+batch 확인(`:690-691`)
>   - `#564` dashboard.ts KPI: 6곳 전부 `status NOT IN ('CANCELLED','QUOTATION')`로 통일 확인
>   - `#565` dashboard.ts 총 미수금: 별도 쿼리 폐기 + aging(SSOT) 파생 재사용 확인(`#565` 주석)
>   - `#566` 반품 등록 UI: `quality.js` `POST /api/returns` 호출 신설 확인(`#566` 주석, quality.ts 모달)
>   - `#567` AR 넛지: `quality.js:52` "조정확인" 원장 딥링크(`/ledger?client_id=`) 확인
>   - `#568` 휴가 셀프신청: `leaveShared.ts`/`mySelf.ts` 신설 + `employeeSelf.ts` leave-section 확인
>   - `#569` hrDetail 연차 섹션: `hrDetail.ts`/`hrDetail.js`에 `#569` 주석과 함께 `/api/hr/employees/:id/leave-balance` 연동 확인
>   
>   **실질 미해결로 남은 건 3건뿐** — `#555`(마이그레이션 0342~0344 풀리플레이 실패, 관련 SQL 그대로), `#570`(designer_intakes.order_item_id 미정리, `orders/core.ts`·`update.ts`에 `designer_intakes` 참조 0건 = 그대로), `#571`(5모듈 IDOR 클러스터, 5곳 전부 안티패턴 잔존 — 오늘 Area5가 막 보고한 신규건이라 당연히 미반영). 이 3건만 정상 open으로 재확인.
> - **도구 상태 확인**: `npx tsc --noEmit` clean(15커밋 반영 후에도 타입 정합), `node scripts/entity-audit.mjs`(124파일·통과59·누락0), 마이그 번호 중복 스캔(기존 5쌍 `0327/0412/0416/0420/0453`만, 신규 0).
> - **backlog↔GitHub 절대값 재동기화**: `search_issues(is:closed,reason:completed)` **479**(재확인, 변동 없음) — done 유지. rejected는 이번 사이클 close 0건이라 재조회 생략, 6 유지(close-pending 캐시). `list_issues(state:OPEN,label:auto-improve)` **18**(GitHub 실측, close 0건이라 불변) — 단 통계란에 "15건 fixed-in-tree" 명시해 실질 미해결 3건임을 문서화.
> - **🧬 SKILL 강화 없음(기존 패턴의 최대 규모 재현)** — "open≠unfixed"(line 281)·"close-pending 캐시"(line 291) 규칙 그대로 적용, 신규 클래스 없음. 다만 규모(15건 동시)가 이례적이라 owner에게 **일괄 close 대상 15건**임을 명확히 통지할 가치가 큼(PushNotification으로 전달).
> - 신규 이슈 0건, 자동수정 0건(전부 타 세션 기픽스 확인 작업), done-sync: new 18(실질 3)·done 479·rejected 6. 다음 순번 Area 1.
>

> **Area 5 보안 (2026-07-26T21:40):**
> - **방법**: `git fetch origin main`(HEAD `31b6c1c` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81). Area 5 **44회차** — 직전 Area5(`b798aed`, 07-25T06:20, 43회차) 이후 `git log ee726b7..HEAD -- src/routes src/scripts migrations`는 4파일뿐(`migrations/0472`·`0473`, `src/routes/finishing.ts`(+36)·`src/routes/workbench.ts`(+25) — 후가공 도메인 프로파일 A1)이며 Area4 45회차가 데이터정합성 렌즈로 이미 검증 완료. Area5 고유 렌즈(SQLi/XSS/인증·인가)로 직접 재확인: `finishing.ts` GET/PUT `/worker-domains`(라우터 전역 `authMiddleware`+PUT만 `requireRole('ADMIN','MANAGER')`, `designer_worker_domains`는 0473이 entity_id 없이 도입 = finishing_methods/presets와 동일 "법인 공용 마스터" 정책과 일관), `workbench.ts` `POST /intakes`(신규 free-text 5필드 keyword/post_desc/worker_name 등은 프론트에서 `escapeHtml` 일관 적용, `entity_id`는 `getWriteEntityId` 게이트로 #487 0-sentinel 클래스 해당없음 기확인) 전부 clean — SQLi 없음(전 바인딩), XSS 없음(showToast가 sink에서 전체 메시지 escape). 필수 표준 스캔 전부 clean: secret fallback grep(`fax.ts` 기존 FP만)·마이그 번호 중복(기존 5쌍만)·`entity-audit.mjs`(122파일·통과59·누락0)·`tsc --noEmit`(clean).
> - **open≠unfixed 재확인(Area5 소관 3건)**: `#557`(clients.ts portal-account POST)·`#558`(payroll/core.ts preview)·`#561`(rip.ts equipment 4핸들러) 전부 코드 직접 재grep — 안티패턴 그대로 잔존(fixed-in-tree 0건), 정상 open.
> - **churn 커버리지가 좁아 코드베이스 전체 형제-비대칭 IDOR 표준스캔(레시피 A, node 정적분석) 병행 실행** — entity_id 보유 테이블(119개) 대상 `UPDATE/DELETE ... WHERE id=?` 패턴 중 entityFilter류 격리 부재 블록을 기계적으로 추출 → 20개 원시후보를 전부 직접 Read로 triage.
> - **🔴 신규 이슈 — #571 (S, bug, IDOR, 5모듈 클러스터)**: `cards/lifecycle.ts:262 PATCH /defects/:defectId`(quality_issues, 형제 `#375` 주석 격리)·`printEvents.ts:652 PATCH /:id/actual-printed`(print_events, 형제 `entityFilter(c,'pe')`)·`purchaseOrders/stock-alerts.ts:101 PATCH /:id/acknowledge`(stock_alerts, 형제 `#446` 주석 격리)·`cardExpenses.ts:891 DELETE /auto-rules/:id`(expense_auto_rules, 형제 `entityFilter(c,'r')`)·`hometaxInvoices.ts:156 GET /jobs/:id/status`(hometax_jobs, 형제 `entityFilter(c,'hj')`) — 5곳 전부 같은 파일의 list 조회가 `entityFilter`로 명시 격리(대부분 `#375`/`#446`류 주석으로 격리의도 명문화)하는데 단건 조회/변경만 누락된 #414/#437/#452/#473/#559/#561과 동일 클래스. severity는 quality_issues(MEDIUM, 상태/원가 변조)~hometax_jobs(LOW, read-only 정보노출) 분포. issue-only(IDOR=owner 워크플로, 5곳 모두 형제 패턴이 byte 단위로 명확해 구현은 기계적).
> - **🟢 20개 원시후보 중 15건 FP 확인**: `aiAnalysis.ts` thumbnail/PATCH(문서화된 에이전트 콜백 예외, #455 계열)·`storageZones.ts` PUT/PUT bounds/DELETE(`#368 대칭 완화` 주석의 ADMIN 신뢰 정책)·`shipments.ts` merge/unmerge(형제 `/merge`도 동일 미격리=비대칭 미성립+문서화된 intra-client cross-entity 기능)·`hr.ts DELETE /employees/:id`(파일 전역 확립된 "ADMIN role=신뢰" 패턴)·`caps.ts` ingest/employee-map(전사 공용 설정, 형제 GET도 미격리=비대칭 미성립+agent-key 인증)·`leaves.ts` promotion/run·expire(대상 후보가 내부 헬퍼에서 이미 entityFilter로 사전 필터링, 정적스캔 블록단위 한계로 인한 오탐)·`hrSelf.ts` contracts sign(`WHERE...AND employee_id=?` 본인스코프 정상).
> - **backlog↔GitHub 절대값 재동기화**: `list_issues(state:OPEN,label:auto-improve)` 실측 **17건**(#554~#570 이월, Area4 45회차 기재값과 일치) + 이번 사이클 신규 #571 = **18**. done/rejected는 close 0건이라 재조회 생략, 직전 다수 사이클 연속 확인된 done **479**·rejected **6** 유지(close-pending 캐시 정책).
> - **🧬 SKILL 강화 없음(기존 패턴 재현)** — #571은 기존 "형제-비대칭 IDOR" 표준스캔(레시피 A)의 정상 재현이며, FP 15건 중 신규 클래스는 없음(전부 기존 FP 카탈로그 항목의 재확인: ADMIN신뢰 주석·에이전트콜백·intra-client cross-entity·employee-self-scope·헬퍼-사전필터링). 다만 "헬퍼 함수 내부에서 이미 entityFilter가 적용된 뒤 그 결과를 순회하는 batch 루프"는 블록-단위 정적스캔이 놓치기 쉬운 FP축이라는 점을 재확인(별도 codify 불요 — 기존 레시피A의 자연스러운 한계).
> - 신규 이슈 1건(#571, issue-only, 5모듈 클러스터), 자동수정 0건(IDOR=owner 워크플로), done-sync 변동 없음(new 17→18[신규 1건 반영]·done 479·rejected 6). 다음 순번 Area 6.
>

> **Area 4 데이터 정합성 (2026-07-26T15:15):**
> - **방법**: `git fetch origin main`(HEAD `ac6fe38` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81). Area 4 **45회차** — 직전 Area4(`216178f`, 07-25T03:17, 44회차) 이후 `git log 216178f..HEAD -- src/routes migrations`는 5파일뿐(`migrations/0472_intake_field_carry.sql`·`0473_worker_domains.sql`·`src/routes/finishing.ts`(+36)·`src/routes/workbench.ts`(+20)·`src/routes/payroll/shared.ts`(-5, Area2 51회차 dead-code 제거)) — 후가공 도메인 프로파일 A1(가공자↔도메인 매핑) 기능. 신규 마이그 2건 직접 검증: 0472(designer_intakes 5컬럼 ADD, 전부 nullable additive)·0473(designer_worker_domains 신규 테이블, PK만). `workbench.ts` INSERT INTO designer_intakes(23컬럼 positional 대조, entityId는 `getWriteEntityId` 게이트 이미 적용돼 #487 0-sentinel 클래스 해당 없음 확인) + `finishing.ts` PUT /worker-domains(ON CONFLICT upsert, 컬럼 3개 일치) 전부 clean. 표준 스캔 병행: `node scripts/entity-audit.mjs`(122파일·통과59·누락0)·`npx tsc --noEmit`(clean)·마이그 번호 중복(기존 5쌍만, 신규 0).
> - **🔴 신규 이슈 — #570 (S, bug)**: 이번 churn 범위 밖이지만 그 참조 컬럼이 기존 주문 삭제/교체 배치의 사각으로 남아있던 건 — `designer_intakes.order_item_id`(0463 도입, `REFERENCES order_items(id)` ON DELETE 절 없음=NO ACTION)가 `workbench.ts:1280`/`:1389`(흡수 시)에서 실제 order_item id로 채워지는 LIVE 참조인데, `orders/core.ts:685`(하드삭제 batch)·`orders/update.ts:219`(라인 재생성 batch)·`:242`(카드보존 standalone) 3곳 모두 이를 정리하지 않음 — designer_intakes 흡수를 거친 주문은 하드삭제도 라인교체 수정도 FK 위반 500으로 전체 실패. `update.ts`의 같은 함수가 `#480`(shipment_checks, 0439)에 대해 이미 이 정확한 클래스를 고친 이력이 있는데 0463(더 나중 도입)은 그 정리 목록에 없던 사각지대(#477/#480 계열 재현, churn-트리거 재스캔 레시피가 실제로 새 후보를 찾아낸 사례). issue-only(파괴적 삭제 batch mutation 추가 + SET NULL/DELETE 보존정책 판단 + egress 검증불가).
> - **🟢 나머지 churn = clean**: `payroll/shared.ts` -5(Area2 51회차가 이미 dead-code 제거로 커밋, 재확인만) — 영향 없음.
> - **backlog↔GitHub 절대값 재동기화**: `list_issues(state:OPEN,label:auto-improve)` 실측 **16건**(#554~#569, Area3 44회차 기재값과 일치) + 이번 사이클 신규 #570 = **17**. done/rejected는 close 0건이라 재조회 생략, 직전 다수 사이클 연속 확인된 done **479**·rejected **6** 유지(close-pending 캐시 정책).
> - **🧬 SKILL 강화 없음(기존 패턴 재현)** — #570은 기존 "churn-트리거 재스캔"(#477) + "order_items 통째-교체 replace-path"(#480) 규칙의 자연스러운 적용 사례(신규 참조 컬럼을 도입 시점 아닌 그 컬럼이 실제 채워지기 시작한 뒤 처음 맞는 Area4 사이클이 잡음) — SKILL이 이미 코드화한 레시피 그대로 실행해 발견됐으므로 별도 codify 불요.
> - 신규 이슈 1건(#570, issue-only), 자동수정 0건(파괴적 삭제 batch mutation = owner 판단), done-sync 변동 없음(new 16→17[신규 1건 반영]·done 479·rejected 6). 다음 순번 Area 5.
>

> **Area 3 UX/기능 감사 (2026-07-26T09:22):**
> - **방법**: `git fetch origin main`(HEAD `7dd2105` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81). Area 3 **44회차** — 직전 Area3(`216178f`, 07-24T12:30, 43회차) 이후 `git log 216178f..HEAD -- src/routes src/scripts migrations`는 dead-code 삭제 1파일(`payroll/shared.ts`, Area2 51회차)뿐이라 churn 기반 감사가 무의미 — Playwright는 prod egress 차단으로 여전히 불가해 정적 코드 리딩으로 **아직 깊게 감사되지 않은 3개 영역**(대시보드 KPI·인사/근태 셀프서비스·품질관리 클레임↔반품 흐름)을 general-purpose 에이전트 3개 병렬 파견으로 심층 정독.
> - **🔧 자동수정 1건(즉시 커밋+푸시, `a7ff772`)**: `src/scripts/dashboard.js` `loadOverduePos()`(발주지연 위젯)만 같은 파일의 다른 8곳 이상(client_name/item_name 등)과 달리 `po.supplier_name`/`po.po_number`에 `escapeHtml` 미적용 — 자유텍스트 거래처명이 전사 대시보드에 저장형 XSS로 노출 가능했음(SKILL "SPA innerHTML free-text XSS" standing scan 클래스). `node -c` 문법확인 + `npm run verify`(typecheck+build) 통과 후 커밋.
> - **🔴 신규 이슈 6건(#564~#569, 전부 issue-only — Area3 정책상 UI/UX·신기능·회계로직 변경은 자동수정 금지)**:
>   - **#564 (S, bug)**: 대시보드 매출/주문 KPI 6개 서브쿼리가 `status != 'CANCELLED'`만 필터링해 견적(QUOTATION) 상태 주문까지 실적에 합산 — 앱 전역 관례(`orders.js` TRANSIENT_STATUSES가 QUOTATION 명시 제외)와 불일치, 히어로 카드 매출/주문 수치 부풀림.
>   - **#565 (M, bug)**: 대시보드 "총 미수금" KPI가 `adjustments` 차감 없이 계산 — 같은 파일 주석이 명시한 SSOT(`billed-payments-adjustments`, 앱 전역 통일 공식)와 어긋나 같은 화면의 TOP10/연체현황 합계와 숫자 불일치.
>   - **#566 (M, feature)**: 반품(RMA) 등록 UI가 전무 — 백엔드 `POST /api/returns`는 완비(품목batch+롤백)되어 있으나 프론트 호출처 0건, 안내 문구가 가리키는 "주문 상세"에도 UI 없음 — 클레임→반품→재고반영 체인이 진입점부터 끊김.
>   - **#567 (M, improvement)**: 클레임/반품 해결금액이 AR(매출채권) 조정과 미연동 — `adjustments` INSERT 경로가 회계 원장 수동입력 1곳뿐이라, REFUND 확정해도 미수금이 자동 반영 안 됨(회계 이중입력 위험).
>   - **#568 (M~L, improvement)**: 휴가 신청이 `requireRole('ADMIN','MANAGER')`로 원천 제한 — 직원 셀프신청 경로 전무(직원포털 `employeeSelf.ts`엔 메뉴 자체가 없음), 전 직원이 구두/메신저로 HR 대리입력 필요한 병목.
>   - **#569 (S, improvement)**: 직원 상세 페이지에 연차현황 섹션 부재 — 백엔드 `GET /api/leaves/balance/:employeeId`는 완비돼 있으나 호출처 0건(dead API), 프론트 섹션 추가만 하면 되는 저비용 개선.
> - **오탐 배제 확인**: 각 에이전트에게 기존 오탐 카탈로그(explicit-search 패턴·필드명 불일치·상세모달 링크 등)와 열린 이슈 #554~#563 목록을 사전 제공해 중복/기지식 재보고 0건 — 인벤토리/출고 대시보드(`inventoryDashboard.js`/`shipmentsDashboard.js`)는 escape·링크·빈상태 전부 정상 확인(clean). 낮은 확신도 항목(생산파이프라인 위젯 단위혼용, 클레임 quality_issue_id/rework_order_id 미기록, leaves 탭2 부서필터 부재)은 별도 이슈화 보류.
> - **backlog↔GitHub 절대값 재동기화**: `list_issues(state:OPEN,label:auto-improve)` 실측 **16건**(#554~#563 이월 + #564~#569 신규). done/rejected는 이번 사이클 close 0건이라 재조회 생략, 직전 사이클 연속 확인된 done **479**·rejected **6** 유지(close-pending 캐시 정책).
> - **🧬 SKILL 강화 없음(기존 패턴 재현)** — XSS 자동수정은 기존 "SPA innerHTML free-text XSS standing scan" 클래스 재현, 6건 신규 이슈도 각각 기존 클래스(형제-비대칭 escape·SSOT 공식 불일치·dead API·백엔드완성/프론트미구현·권한모델 병목)의 신규 화면 재현이라 별도 codify 불요. 다만 "churn이 거의 없을 때는 아직 안 다룬 화면 3곳을 병렬 파견해 정독"하는 이번 접근이 유효했음 — Area1/5/6이 이미 채택한 "churn 부족 시 전체 코드베이스 표준스캔 병행" 패턴의 Area3 버전으로 참고.
> - 신규 이슈 6건(#564~#569, issue-only), 자동수정 1건(escapeHtml, 커밋 `a7ff772` 푸시 완료), done-sync 변동 없음(new 10→16·done 479·rejected 6). 다음 순번 Area 4.
>

## ✅ Approved / 👀 Reviewed (owner 피드백 수신)

> 없음 — 이전 유일 reviewed 건(I-060/#372 CSV 잘림경고)은 06-12 owner 옵션1로 구현·close 완료 → Done 이관 (Area 6 43회차, 2026-07-16 재확인).

## 🆕 New (미검토)

> 전부 GitHub open + 👍 미수신. 용준님 리뷰 대기. (open **실측 6건** — 2026-07-24T16:10 Area 3 43회차, `list_issues(state:OPEN,label:auto-improve)` 직접 재확인. `#559` 반영해 표 갱신.)

| Issue | 제목 | 영역 | 라벨 | 상태 메모 |
|-------|------|------|------|-----------|
| #559 | cards/queries.ts GET /thumbnails 멀티법인 격리 누락 IDOR — R2 썸네일 이관 신규 엔드포인트 | Area 2 | bug,small | issue-only, 신규(#559) |
| #558 | payroll/core.ts POST /preview entityFilter 누락 — 타법인 직원 급여 미리보기 cross-tenant 열람 | Area 5 | bug,S | issue-only, 미픽스(재확인) |
| #557 | clients.ts POST /:id/portal-account 형제 entityFilter 누락 — 타법인 ADMIN 포털계정 셀프발급→cross-entity 거래이력 열람 | Area 4/5 | bug,M | issue-only, 미픽스(재확인) |
| #556 | 인쇄뷰(invoice/quotation) 버튼 hover 색상 — 팔레트 스윕이 base만 이관, hover는 구 teal 잔존 | Area 3 | improvement,S | issue-only, 미픽스(재확인) |
| #555 | 마이그레이션 0342~0344 풀리플레이 결정적 실패 — DR/신규환경 부트스트랩 시 전체 체인 중단 | Area1/4 | bug,M | issue-only, 원인규명 완료·owner 정책판단 대기 |
| #554 | 부문손익 자재비 — 이동평균단가 비재현성(거래시점 원가 스냅샷 부재) + fixedRow is_active 과거조회 누락 | Area 4 | — | 미픽스(재확인), M공수 정책판단 대기 |

> 이전에 표에 있던 #553·#552·#551·#550·#549·#540·#536·#535·#528·#526·#525·#520·#509·#504는 42회차 실측 open 목록에서 전부 확인되지 않아(=closed) 표에서 제거함 — Area2 49회차가 확인한 대로 owner가 12건을 코드 픽스+close(#528 close-pending 포함), 나머지도 completed/not_planned로 정리됨.

---

## 🔧 Auto-fixed (자동 수정 완료)

| ID | 제목 | 커밋 | 날짜 |
|----|------|------|------|
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
