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

# 세션 핸드오프 — 2026-08-25 직원 참여 + 재고실사 실행 (prod 배포 완료)

## 상태 — 배포 `d64a15c3` · smoke 111/111 · 마커 실측

- 계획 정본(**승인됨**) = `C:\Users\user\.claude\plans\greedy-exploring-stroustrup.md`
- 프로토콜 정본 = `docs/superpowers/specs/2026-08-25-employee-requirements-protocol.md` (1부 요구 발굴 · 2부 마스터 데이터 합의)
- 아티팩트(읽기용) = https://claude.ai/code/artifact/82cc7c5d-98ca-41cb-94c9-97174b383ba9
- 신설 도구 = `npm run propose:count-scope` (읽기 전용) → `docs/analysis/2026-08-25-count-scope-proposal.csv`
- 배포된 코드 = **실사 화면↔담당자 배선 4파일**(`routes/inventory.ts`·`routes/inventoryCount.ts`·`scripts/inventoryCount.js`·`pages/inventory.ts`)
- prod 데이터 작업 SQL = `docs/analysis/2026-08-25-*.sql` 7개(각 파일 머리에 롤백 절차·백업 테이블명)

## 결정 + 이유

1. **「6월 2,348건 급락」은 오독** — 2,275가 `e2e_tester` 로봇. 사람 활동은 전부 `admin`. **급락이 아니라 시작된 적이 없다.** `activity_logs` 를 채택 지표로 쓸 땐 반드시 `user_id` 로 로봇·admin 을 걷어낼 것.
2. **실사 병목 = 용준님의 옮겨적기** — 현장은 이미 이미지·메모장으로 보내고 있었고 MES 입력만 8/07에 멈췄다. 목표는 "실사를 시작"이 아니라 "오는 걸 끊기지 않게".
3. **초반은 코드 0으로 간다** — 첫 보상 = 세는 대상을 **빼주는 것**(출력실 73→65) + 이미 도는 부족경고를 **값만 채워 켜는 것**.
4. **법인별 취급 정본축 = `inventory` 행** — `items` 에 `entity_id` 가 없어 플래그로 처리하면 타 법인이 같이 죽는다.
5. **엡손 80610 ≠ 9140/8140** — 08-18 통합이 오류였고 되돌렸다. 발주서로 확정(80610=700mm·9140=1600mm).
6. **야드 측정 = 주간은 롤 개수만, 월말만 야드** — 부족경고는 롤 수 정밀도면 충분하고, 옮겨적기도 월 1회로 준다.

## ★판단기준·주의 (다음 세션이 몰라서 틀릴 지점)

- ⛔**권한은 아직 안 열렸다.** `routes/inventoryCount.ts:10` 은 여전히 `requireRole('ADMIN','MANAGER')` 이고 신규 계정 5개는 전부 `OPERATOR` → **담당자들은 로그인해도 실사 화면을 못 본다.** 이번에 배포한 배선은 **관리자 화면에 담당자를 보여줄 뿐**이다. 개방은 계획 3단계(2단계가 4주 이상 끊기지 않았을 때).
- **부족경고는 없는 게 아니라 값이 비어 있다** — `stock_alerts`+API+모달+대시보드가 다 있고 **매일 06:00 cron 판정 중**(`cron.ts:132-137`→`notifications.ts:287-306`). `inventory.safe_stock` 387행 0이라 안 걸릴 뿐.
- ⚠️`inventory` 는 **창고별 다중 행**이고 판정이 `MAX(safe_stock)` 으로 접는다 → 제안값은 **해당 구역 행에** 넣는다.
- ⚠️`items.category_id` 는 **NOT NULL** — 신규 품목 INSERT 에서 빠뜨리면 **파일 전체가 롤백**된다(상품 4·원자재 5). 실제로 한 번 당했다.
- ⚠️`users.role` 은 레거시 4역할 고정, **실제 역할은 `job_role`**(`COALESCE(job_role,role)` 이 JWT role).
- ⚠️**HR ALLOWED 화이트리스트에 `user_id` 가 없다** → 직원↔계정 연결을 **화면에서 못 한다**. SQL 이 유일(이번 5건도 SQL).
- ⚠️**생산 14명 다수가 외국인** → 한국어 텍스트 의존 UI·안내문은 실패. 숫자·사진 위주.
- ⚠️**알림톡은 승인 템플릿 4종 외 자유 문구 불가** → 자유 문구는 SMS/LMS. **인바운드(직원→회사)는 코드 0줄**(카톡이 유일). 이식 대상 = `pr_comments` + `utils/notify.ts`. 새 뱃지·폴링 전 `notifications.ts:12-15` 필독(월 $99 과금 전례·`POST /generate` 는 TTL 캐시 없음).
- ⚠️**`rememberMe` 가 죽은 코드**(`pages/login.ts:59,116`). 토큰 8h+30분 갱신이라 근무 중 무기한이나 **주말 넘기면 재로그인**.
- ⚠️`resolveStockUnit`(`utils/rollConsumption.ts:75-80`)이 m/cm 외 전부 `'yd'` 반환 → **잉크가 「27 yd」로 표시**된다. 현장에 실사 입력을 넘기기 전 수정 필요.
- ⚠️**전사출력실은 12주치가 전부 미승인이었다.** 이번에 **8/24 회차만** 승인했다(이전 회차는 그대로 SUBMITTED — 날짜 역순 승인 금지).
- **실사 범위 판정 함정 2개**: ①「전부 0」만 보면 엡손 잉크를 놓친다(과반 0으로 잡을 것) ②**구역 미입력률 50% 초과면 「제거후보」 판정을 신뢰하지 말 것**(현장 미실사 vs 옮겨적기 누락 구분 불가 — 전사출력실 80%).
- **엡손 잉크 계열 정본** = memory `feedback-item-duplicate-before-create` §원천 확보 후 완결.

## prod 데이터 변경 (전부 백업 있음)

| 작업 | 결과 | 백업 |
|---|---|---|
| 투명시트 105·152 하드삭제 | ⛔127 은 주문11/매입6/재고50 이라 제외 · 137 보류 | `_bak_0825_spc_*` |
| 상품전용 6품목 e1 구역 해제 | 출력실 실사표 **73→65** | `_bak_0825_goods_zone` |
| 전사출력실 8/24 실사 적재+**승인** | 재고 첫 반영 = 원단 **21,652yd**(87롤) + KM잉크 100통 · tx 9건 | `_bak_0825_approve_inv` |
| 엡손 잉크 재분리 | 80610 10품목 재활성(유통 dual)·매입라인 6건 환원 | `_bak_0825_epson_resplit`·`_epson_poi` |
| 한국엡손 뭉침 4전표 분해 | 1→**11·16·2·12줄**, 총액 불변(04월 차액 71,200 = [미상] 라인) | `_bak_0825_epson_split` |
| 엡손 원가 재산출 | 9140 97,000~100,500(W 333,467) · 80610 72,100 · 껍데기 2종 비활성 | `_bak_0825_epson_cost` |
| 구역 담당자 배정 | 계정 5개(비번 1234·`users` 17~21)+`employees.user_id` 7→12 | `_bak_0825_zone_mgr` |

**구역 담당**: 출력실=한두선 · 전사출력실=최재영 · 현수막실=정보람 · UV실=모니르 · 선명2=강지영(e2). **5구역 전부.**

## 다음 세션 TODO

1. **용준님(코드 0)**: 카톡방 개설 · 8/13 80610 벌크 3건(621,000)은 **보류 확정**(8월 매입 미반영).
   ✅`safe_stock`·`reorder_point` **48행 적용 완료**(출력실 44·전사 4 · 리드타임 1주 · 백업 `_bak_0825_safestock`). ★**경고 판정은 `reorder_point` 기준**이고 `safe_stock` 은 안 쓰인다(`notifications.ts:292-299`) · 창고 `SUM(quantity)` vs `MAX(reorder_point)` · `<=` 비교 · 알림은 「재고 부족 N개 품목」 **한 건**. 현재 발동 **21건**. ⚠️UV실·현수막실은 실사 이력 0이라 값 없음.
2. **개발 3종**: ①채택 계기판(1부·하루) ②`base_unit` 축 감사를 `audit:items` 에 추가(참조 0회 — 50배 사고를 낸 축만 감사망 밖) ③`resolveStockUnit` yd 폴백 수정.
3. **계획 3단계(권한 개방)**: 2단계가 4주 이상 끊기지 않으면 착수. `permission_pages` 에 `/inventory-count` INSERT + `requireRole` → `requireAccessOrRole` + 승인·삭제는 잠금 유지 + 탭 게이팅(`pages/shipments.ts:32-36` 선례) + 모바일 CSS 3건.
4. **관찰**: 다음 주 실사가 실제로 들어오는지(구역별 미입력률 추이). 안 들어오면 **품목을 더 줄인다**(사람을 채근하지 않는다).

## 검증 명령

```powershell
npm run propose:count-scope                     # 실사 범위·안전재고 제안 재생성 (읽기전용)
npm run propose:count-scope -- --lead 3         # 리드타임 바꿔 재산출
npm run verify                                  # 타입체크 + 빌드
node scripts/check-dom-refs.cjs                 # HTML↔JS silent fail 게이트
node scripts/doc-diet-audit.cjs                 # 현황판·메모리 한도 게이트
$env:SMOKE_URL='https://webapp-9i0.pages.dev'; npm run smoke
```

---

# 이월 — 2026-08-24 미완 (아직 유효)

1. **뭉친줄 37건 분해**: 원장 PDF 위치 확인되면(용준님) 허밍 1,240만·우드케이 397만·대양 380만부터. ★아카이브의 `Z:\DesignsS\` 경로가 **현재 미존재** — 위치 확인 전 불가. 방법론 = ARCHIVE §2026-08-24 전사잉크.
2. **AREA 53 ㎡단가표(나-v2)·간판 BOM 2차** = 설계 세션 필요(brainstorming 선행).
3. 매입 미연결 잔여 **326라인 2.507억** — `docs/analysis/2026-08-24-unlinked-purchase-lines.csv`. 대부분 간판 자재라 간판 BOM 트랙과 묶임.
4. ⚠️`docs/price/backfill_avg_cost.sql` 재실행 전 **1식 라인 제외 조건** 확인(SGM-GALVA·WDS-01·ACC-056 추가 완료).
5. ⚠️`financialReports.ts` 를 다음에 만질 때 **AP 부호 분리(08-24)와 손익 재설계 두 축을 모두 유지**할 것.
6. (선택) 손익 재고증감 앵커 — `inventory_counts` 연동으로 web caveat 해소 · 미분류 출금·카드 1~7월 5,219만 분류.
