# 세션 핸드오프 — 2026-08-25 메시지 발송 대상 3단계 (조건 세그먼트 · 수신자 가드 · 정합성)

> ⚠️ 아래에 **다른 세션(직원 참여 3종·재고실사)의 핸드오프가 이어집니다.** 덮어쓰지 않았습니다.

## 상태 — 전부 prod 배포 + 커밋·push 완료

| 단계 | 내용 | 커밋 |
|---|---|---|
| 1 | 조건 세그먼트 (마이그 `0542`) | `78829f63` |
| 2 | 수신자 가드 (마이그 `0543`) | `78829f63` |
| 3 | 발송 대상 정합성 (코드만) | `e3e7c858` |

정본 = `src/services/clientSegment.ts` · `src/services/messageAudience.ts`
prod 실측: 최근 1년 발송 대상 **797곳** / PRINT 391 · TRANSFER 495 · MATERIAL 144 · GOODS 355

## 결정 + 이유 (코드만 봐선 안 보이는 것)

1. **품목 묶음은 4+1개** — 수성·솔벤·UV·**간판**을 한 묶음(PRINT). 용준님 확정. 근거 = 간판 거래처 79곳 중 **76곳이 출력도 거래**(간판만 하는 곳은 3곳). 쪼개면 따로 보낼 때 이중 과금만 는다.
2. **정적 스냅샷 + [갱신] 버튼** — 발송 시점 자동 평가가 아니다. 대상 수·비용이 눈에 보인 뒤 사람이 확정해야 오조작이 없다.
3. **번호 중복은 무조건 통합** — 용준님 결정. ⚠️본문에 `#{미수금}` 같은 수신자별 변수가 있으면 통합된 쪽 정보는 안 나간다(경고만 띄우고 차단 안 함).
4. **피로도 가드는 광고 + 일반 대량에만** — 출고 안내(`/send-shipment-bulk`)는 **의도적 제외**. 업무 필수 통지이고 이미 shipment_id 자체 dedup 이 있다. 새 업무 통지 경로도 같은 판단을 할 것.
5. **품목 오분류 정리는 하지 않기로** — `PRODUCT + category='원자재'` 118개는 깃대파이프·엡손잉크·포맥스로 **자재가 맞고 `item_type` 이 틀렸다**. 고치면 재고·원가·`/pnl` 부문귀속까지 연쇄되고 같은 품목을 타 세션이 정리 중. 세그먼트는 `item_type` 폴백으로 이미 흡수한다.

## ★판단기준·주의 (다음 세션이 몰라서 틀릴 지점)

- **★prod remote D1 은 한글 부분문자열 매칭이 조용히 실패한다.** `instr(item_name,'기초채권이월')` 이 로컬 D1 에서는 정상인데 prod 에서 0건이라, 배포 전 검증을 전부 통과하고 **prod 에서만 이월 거래처 48곳이 섞였다**. 업무 규칙은 ASCII 구조 마커로 걸 것 → 정본 [[feedback-d1-remote-korean-substring]]
- **"유효한 거래"의 정의는 `clientSegment.validOrderClause(alias)` 한 곳** (취소 + `-OPEN-` 제외). 세그먼트와 광고 6개월 판정이 갈라지면 "대상에는 있는데 광고는 못 나가는" 불일치가 난다.
- **★내부 법인 3사(53·1271·3757)를 빼는 건 `constants/intercompany.ts` SSOT 로.** 원장·미수금·AP·발주는 이미 쓰는데 **메시지만 빠져 있어 자기 회사에 판촉 문자가 나갈 상태였다.** 새 대상 산출 경로를 만들면 여기부터 확인.
- **대량 발송 이력은 `message_send_recipients` 에만 있다.** `kakao_send_logs` 는 `BULK(N)` 대표 1건뿐이라 "누가 받았는지"가 없다. 피로도 판정·수신자 추적은 새 테이블을 볼 것.
- **발송 엔드포인트를 테스트로 호출하면 실발송이 나간다.** 검증은 `/api/messages/ad/preview` 와 `/api/contact-groups/preview` 로만(둘 다 과금 0).
- 그룹 갱신은 **AUTO 멤버만 교체**한다. `source` 컬럼 없이 손대면 수동으로 담은 멤버가 사라진다.

## 다음 세션 TODO

1. **실발송 후 피로도 기준일 조정** — 기본 30일은 임의값. 명절 공지와 단가표 안내가 한 달 안에 겹치면 두 번째 발송에서 상당수가 빠진다. `settings.message_fatigue_days`(0=끔).
2. **뭉친 전표** — 「현수막조립외」 8,037만·「태극기8회외14건」 3,427만이 한 줄. 세그먼트엔 영향 없고 원가·마진 축의 문제(타 세션 영역).
3. (선택) 휴면 재유치·거래액 등급 세그먼트 — 조건 축 추가만 하면 된다. ⚠️휴면 12개월 초과는 **광고 발송 시 6개월 필터에 전량 제외**된다(정보성만 가능).

## 검증 명령 (PowerShell)

```powershell
npm run build ; if ($?) { npm run verify }
npm run audit:migration-drift
$env:SMOKE_URL="https://webapp-9i0.pages.dev" ; npm run smoke   # PASS 111/111 기준
```

---

# 세션 핸드오프 — 2026-08-25 직원 참여 3종 (요구 발굴 · 공동 결정 · 실사 실행)

## 상태

코드 변경은 **읽기 전용 스크립트 1개 + npm 등록**뿐. prod 데이터·스키마 변경 **0건**. 나머지는 계획·문서·메모리.

- 계획 정본(**승인됨**) = `C:\Users\user\.claude\plans\greedy-exploring-stroustrup.md`
- 프로토콜 정본 = `docs/superpowers/specs/2026-08-25-employee-requirements-protocol.md` (1부 요구 발굴 · 2부 마스터 데이터 합의)
- 아티팩트(읽기용) = https://claude.ai/code/artifact/82cc7c5d-98ca-41cb-94c9-97174b383ba9
- 신설 = `scripts/propose-count-scope.cjs` (`npm run propose:count-scope`, 읽기 전용) → `docs/analysis/2026-08-25-count-scope-proposal.csv`

## 결정 + 이유

1. **「6월 2,348건에서 급락」은 오독이다.** 2,348 중 2,275가 `e2e_tester` 로봇. 사람 활동은 6월 73·5월 37건이고 전부 `admin`. **급락이 아니라 시작된 적이 없다.** `activity_logs` 를 채택 지표로 쓸 때는 반드시 `user_id` 로 로봇·admin 을 걷어낼 것. 현황판 문구 정정 완료.
2. **실사는 이미 돈다 — 병목은 현장이 아니라 옮겨적기.** 이미지·메모장으로 계속 받아 왔고 출력실은 매주 센다. MES 입력만 8/07에 멈췄다. 그래서 계획은 "실사를 시작하자"가 아니라 **"이미 오는 걸 끊기지 않게 흘려보내자"**로 짰다.
3. **초반 2~3주는 코드를 쓰지 않는다.** 첫 보상 = 매주 세는 대상 73→18로 **빼주는 것** + 안전재고 값을 채워 **이미 도는 경고를 켜는 것**. 둘 다 코드 0.
4. **현장 계정 개방은 3단계로 미룬다** — 2단계가 4주 이상 끊기지 않았을 때만. 생산현장 계정 2개·로그인 0회가 근거.

## ★판단기준·주의 (다음 세션이 몰라서 틀릴 지점)

- **부족 경고는 없는 게 아니라 값이 비어 있는 것이다.** `stock_alerts` 테이블·API·설정 모달·대시보드 카드가 전부 있고 **매일 06:00 KST cron 으로 판정이 돌고 있다**(`workers/barobill-cron` → `routes/cron.ts:132-137` → `POST /api/notifications/generate` → `routes/notifications.ts:287-306`). `inventory.safe_stock`·`reorder_point` 가 **387행 전부 0** 이라 안 걸릴 뿐 — **값만 넣으면 다음 날부터 작동한다.**
- ⚠️`inventory` 는 **창고별 다중 행**이다. 판정이 `GROUP BY item_id,entity_id` + `SUM(quantity)` vs `MAX(safe_stock)` 로 접으므로 제안값은 **해당 구역 행에** 넣는다. 품목 단위로 합산 금지(`notifications.ts:288`·`stock-alerts.ts:19` 감사 주석).
- **현장 개방 차단점은 딱 한 줄**: `src/routes/inventoryCount.ts:10` `requireRole('ADMIN','MANAGER')`. `requireRole` 은 DB 를 안 보고 JWT role 문자열만 비교하므로 **권한 매트릭스로는 못 뚫는다.** 교체 대상 = `requireAccessOrRole('/inventory-count',…)`(`middleware/permissions.ts:104`, 가산형이라 회귀 0). 승인·삭제는 `requireRole` 유지.
- **실사 전용 page_key 가 없다** — `/inventory-count` 는 `/inventory#tab=count` 로 redirect(`src/index.tsx:487`). `/inventory` 권한을 주면 재고현황·창고별 탭까지 열린다. 탭 게이팅 선례 = `src/pages/shipments.ts:32-36`.
- **`storage_zones.manager_id` 는 이미 있고 실사는 안 쓴다**(`inventoryCount.ts` 805줄에 0회). 「내 담당」 API(`storageZones.ts:49-64`)·입고 「내 담당만」(`receiving.js:390-395`) 선례 존재 → 새 테이블 불요.
- ⚠️**생산 14명 다수가 외국인**(MOE KO CHIT·MAUNG MAUNG·NGUYEN THUY CUONG·킨뚜자소·서민쎌·니나잉·예민). **한국어 텍스트 의존 UI·안내문은 실패**한다 → 숫자·사진 위주.
- ⚠️`users.role` 은 레거시 4역할 고정, **실제 역할은 `job_role`**(`COALESCE(job_role,role)` 이 JWT role — `routes/auth.ts:22`). DB `role` 만 보면 경리·영업이 전부 OPERATOR 로 보인다.
- **알림톡으로 자유 문구를 못 보낸다** — 승인 템플릿 4종뿐. 자유 문구는 **SMS/LMS**. 직원 대상 대량 발송은 `target_type='employees'` 로 **오늘 이미 가능**(`routes/messages.ts:718-721`).
- **인바운드(직원→회사) 접수 기능은 코드 0줄.** 카톡이 유일. MES 이전 시 이식 대상 = `pr_comments`(`purchaseRequests.ts:160-207`) + `utils/notify.ts` fan-out. ⚠️새 뱃지·폴링 전에 `notifications.ts:12-15` 주석 필독(일 28.5B행 = D1 읽기 98% → 월 $99 사고). `POST /generate` 는 **TTL 캐시가 없으니** 새 집계를 얹지 말 것.
- **`rememberMe` 가 죽은 코드**(`pages/login.ts:59,116`) — 렌더·값 읽기만 하고 안 쓴다. 토큰 8시간 + 화면 열려 있으면 30분마다 갱신이라 근무 중엔 무기한이지만 **주말 넘기면 재로그인**.
- 실사 입력 패널 `width:500px` 인라인 고정(미디어쿼리 0, `pages/inventory.ts:276`), 수량 입력 `type="number"` 가 전역 44px 터치 규칙 셀렉터에서 누락(`layout/shared-styles.ts:455-458`), 폰트 12px → **태블릿 가로 가능·폰 불가. CSS 3건.**
- **스크립트 분류 함정 2개**: ①「전부 0」만 보면 엡손 잉크를 놓친다(6주 연속 0 뒤 8/07에 3) → 과반 0(≥60%·채운 회차 3+)을 확인필요로 잡는다. ②**구역 미입력률 50% 초과면 「제거후보」 판정을 신뢰하지 말 것** — 현장 미실사인지 옮겨적기 누락인지 구분 불가(전사출력실 80% → 판정보류 16건).

## 산출물 수치 (2026-08-25 prod)

| 구역 | 실사표 | 주간 잔류 | 월간 | 확인필요 | 제거/보류 | 미입력률 |
|---|---|---|---|---|---|---|
| 출력실 | 73 | **18** | 40 | 6 (엡손솔벤잉크 6색) | 9 제거후보 | 31.7% |
| 전사출력실 | 20 | 0 | 4 | 0 | 16 **판정보류** | 80.0% |

안전재고 제안 48품목(리드타임 2주 **가정** — 실제 발주~입고 확인 후 `--lead` 로 재산출). ★주간 품목은 전부 `AQ2-*` yd 계열이라 **base_unit 이 비어 있는 129품목과 겹친다**(2부 단위 공백과 같은 무리).

## 다음 세션 TODO

1. **완료(08-25 오후)**: 8/24 전사 적재+**승인**(`IC-20260825153000`·재고 첫 반영 원단 21,652yd+잉크 100통·백업 `_bak_0825_approve_inv`) · 구역 담당자 4명 배정(출력실=한두선·전사=최재영·현수막실=정보람·UV실=모니르·선명2=강지영 — **5구역 전부**) · 계정 5개 신설(비번 1234·`users` 17~21)+`employees.user_id` 연결 7→12 · 엡손 잉크 재분리 · 투명시트 105·152 삭제 · 상품 6품목 구역해제.
2. **용준님 대기**: 카톡방 개설 · `safe_stock` 채우기(**구역 행에**·리드타임 확정 후 `--lead` 재산출) · **한국엡손 월말 계산서**(3·4·6·7월) 주면 뭉침 4건 품목별 분해 · **배포**(아래 3-① 코드가 미배포).
3. **개발**: ①**실사↔담당자 배선 = 코드 완료·미커밋·미배포**(`routes/inventory.ts` dashboard/zones + `routes/inventoryCount.ts` GET / `scope=mine` + `scripts/inventoryCount.js` + `pages/inventory.ts` `#fMineOnly`). 검증 완료=verify·check:dom·entity 0·정렬 P1 0·로컬 D1 파싱. ⚠️**커밋 금지 주의** — 타 세션이 `messages.ts`·`kakao.ts`·`contactGroups.ts`·`messagesAd.ts` 등을 dirty 로 두고 있고 `deploy.yml` 이 main push 마다 전체 재배포한다. ②채택 계기판 ③`base_unit` 축 감사를 `audit:items` 에 추가 ④HR ALLOWED 에 `user_id` 추가(현재 화면에서 직원↔계정 연결 불가·SQL 유일).
4. ⚠️`resolveStockUnit`(`utils/rollConsumption.ts:75-80`)이 m/cm 외 전부 'yd' 반환 → **잉크가 「27 yd」로 표시**. 현장 실사 이관 전 수정 필요.

## 검증 명령

```powershell
npm run propose:count-scope                     # 실사 범위·안전재고 제안 재생성 (읽기전용)
npm run propose:count-scope -- --lead 3         # 리드타임 바꿔 재산출
node scripts/doc-diet-audit.cjs                 # 현황판·메모리 한도 게이트
```

---

# 이월 — 2026-08-24 미완 (아직 유효)

1. **뭉친줄 37건 분해**: 원장 PDF 위치 확인되면(용준님) 허밍 1,240만·우드케이 397만·대양 380만부터. ★아카이브의 `Z:\DesignsS\` 경로가 **현재 미존재** — 위치 확인 전 불가. 방법론 = ARCHIVE §2026-08-24 전사잉크.
2. **AREA 53 ㎡단가표(나-v2)·간판 BOM 2차** = 설계 세션 필요(brainstorming 선행).
3. 매입 미연결 잔여 **326라인 2.507억** — `docs/analysis/2026-08-24-unlinked-purchase-lines.csv`. 대부분 간판 자재라 간판 BOM 트랙과 묶임.
4. ⚠️`docs/price/backfill_avg_cost.sql` 재실행 전 **1식 라인 제외 조건** 확인(SGM-GALVA·WDS-01·ACC-056 추가 완료).
5. ⚠️`financialReports.ts` 를 다음에 만질 때 **AP 부호 분리(08-24)와 손익 재설계 두 축을 모두 유지**할 것.
6. (선택) 손익 재고증감 앵커 — `inventory_counts` 연동으로 web caveat 해소 · 미분류 출금·카드 1~7월 5,219만 분류.
