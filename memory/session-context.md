# 세션 핸드오프 — 2026-08-27 매입 원가 정합성 (뭉친 전표 → 원가 backfill 축 오류)

> ⚠️ 아래에 **이전 세션들의 핸드오프가 이어집니다.** 덮어쓰지 않았습니다.

## 상태

**prod 데이터는 이미 바뀌었다.** 코드(스크립트·문서)는 커밋 4건 중 **2건이 미push**.

| 커밋 | 내용 | 원격 |
|---|---|---|
| `5d707c4c` | 영광엔터 적요 분해 7행 | ✅ 나감(다른 세션 push 에 실려서) |
| `77782cfe` | 뭉침 보고서 `JOIN items` 사각지대 | ✅ 나감 |
| `4c6e5ab3` | backfill 축 수정 + `audit:avgcost` 신설 + 미연결 분류 | ⬜ **미push** |
| `8019ba62` | 원가 정합화 24품목 | ⬜ **미push** |

src 변경 **0** 이라 push 해도 기능 변화는 없다(자동배포는 돌지만 산출물 동일).
⚠️워킹트리에 **다른 세션의 IA 패널 파일 2개**가 dirty 다 → `deploy:prod` 직접 실행 금지.

prod 적용 SQL 4개(전부 백업 테이블 + 롤백 주석 포함):
`docs/analysis/2026-08-27-{yeonggwang-lump-split, nonitem-purchase-classify, unlinked-qty-lines-link, avgcost-align}.sql`

## 이번 세션에서 확정한 것 (결정 + 이유)

1. **세무장부 적요는 「대표 품명 1줄」만 싣는다** → `적요분 < 공급가` 가 **정상**이다.
   이걸 불일치로 읽어 영광엔터 해소 가능 라인을 2건이라 보고했는데 실제 **7건**이었다.
   분해 규약 = **「적요 수량줄 + (미상) 잔액줄」** (합계 보존 → 매입총액·AP·손익 영향 0).
2. **backfill 공식 = `SUM(amount) / SUM(quantity × packFactor)`, 수량 라인만.**
   ⛔전량 `quantity > 1` 은 안 된다(1롤씩 사면 수량 1 이 정상). 대상 선정에도 걸어
   「뭉침만」 112품목은 **아예 손대지 않는다**(현재 값 보존, NULL 방지).
3. **하드코딩 제외명단 폐기.** 양방향으로 낡아 있었다 — 오늘 채운 4품목을 0 으로 만들 참이었고,
   같은 성격인 `ACC-055`·`MAG-060`·`FLEXN-200` 은 명단에 없었다.
4. **품목 축이 아닌 매입은 `notes` 의 `[분류:...]` 태그로 뺀다**(장비·리스·수선·용역·할인).
   키워드 손목록을 스크립트에 박지 않는다 — 태그는 근거가 데이터에 남고 **없으면 목록에 남는다(fail-open)**.
5. **오늘 `updated_at` 이 찍힌 품목은 건드리지 않는다** — 다른 세션의 진행 중 작업일 수 있다.

## ★판단기준·주의 (다음 세션이 몰라서 틀릴 지점)

- **★`backfill_avg_cost.sql` 을 확인 없이 재실행하지 말 것.** 반드시 `npm run audit:avgcost` 먼저.
  08-19/20 base 리베이스 이후 **한 번도 안 돌았다** — 「지금 값이 맞다」는 공식이 맞아서가 아니라
  **최근 안 돌았기 때문**이었다. 옛 공식이면 원단 43품목이 정확히 `pack_size` 배(50배),
  재고 평가액 e1 6,147만 → 약 30억.
- **★`recalculate-avg`(`src/routes/inventoryValuation.ts:150`)에 같은 base 환산이 **아직 없다**.**
  `inventory_transactions` 가 사실상 비어 있어 드러나지 않을 뿐이다 — 입고를 실제로 쓰기 시작하면 터진다.
- **★미연결 매입 라인의 수량이 「관리단위」라는 보장이 없다.** 스타플렉스 「SBO20 M137 100ea @5,480」
  의 5,480 이 `FLEXD-137` 의 **M 당 단가와 정확히 같았다** → 그 100 은 롤이 아니라 **M**.
  그대로 연결하면 `100 × packFactor(50)` 으로 나눠 **50배 저평가**. 검산 = 「후렉스 137폭 100롤을
  54.8만 원에 살 수 있나」. **연결 전 단위축 확인이 선결조건**이다.
- **★값의 「모양」이 출처를 말한다.** 잉크 14품목이 전부 `12,000`·`11,000`·`200,000` 이었다 —
  가중평균이 우연히 그럴 수 없으므로 손입력. 어느 쪽이 정본인지 가릴 때 이걸 먼저 본다.
- **★미연결 뭉침은 청구서를 받아도 원가로 못 간다** — 품목이 없으면 `avg_unit_cost` 가 갈 데가 없다.
  순서는 **품목 연결 → 청구서**가 아니라 **둘 다 필요**하고, 연결만 먼저 하면 수량이 1 이라 위험하다.
- ⚠️`.claude/PROJECT_STATUS.md` 가 25,000자 한도에 **거의 붙어 있다**. 한 줄 쓰려면 오래된 항목을
  `PROJECT_STATUS_ARCHIVE.md` 로 옮겨야 한다(방금 쓴 항목을 깎지 말 것). `MEMORY.md` 도 마찬가지.

## 다음 세션 TODO

1. **미push 2건 push** (`4c6e5ab3`·`8019ba62`) — 용준님 명시 요청 시에만. src 무변경.
2. **청구서 8곳 요청** — NTIC 3,035만 · 에코컴퍼니 1,452만 · 유진프라스틱 1,284만
   + 우진아크릴 1,166만 · 에스에스K 1,043만 · 신광에스티 634만 · 화성프로세스 559만 · 텍스젯 1,435만.
   추가로 하우사인 706만(「N월 거래건」)·엘이디포유 1,825만(「원장 밖 매입」)은 **원장**이 필요하다.
3. **미연결 25행 단위축 확인 후 연결** — 목록·사유 = `2026-08-27-unlinked-qty-lines-link.sql` 주석.
4. **보류 4품목**(`ACC-015`·`FMX-PMT-2T/8T/10T-48`) — 다른 세션 작업이 끝나면 `audit:avgcost` 재판정.
5. **바로 07-22 잔액 462만** — 바로 7월 거래처원장 필요.
6. 착수 대기(이전 세션 이월): **채택 계기판**(하루 규모) · 카톡방 개설 · 동산 매입 계산서 축 (가)/(나).

## 검증 명령 (PowerShell)

```powershell
npm run build ; npm run audit:items ; npm run test:calc ; npm run test:stock-valuation
node scripts/doc-diet-audit.cjs
npm run audit:avgcost      # ★backfill 재실행 전 필수. 현재 어긋남 12(뭉침만 8 + 보류 4)
npm run report:lump        # 뭉침 9,204만 · 미연결 1.64억 · 이월 11.4억 · 품목축아님 1,895만
```

이번 세션 마지막 실행 결과: build 0 · audit:items 0 · test:calc 0 · test:stock-valuation 22/22 · doc-diet 0.
재고 평가액 e1 **61,647,343** · e2 46,951,763.

---

# 세션 핸드오프 — 2026-08-25 md·스킬 문서 전수 점검 (코드 0 · 문서만)

> ⚠️ 아래에 **다른 세션(메시지 발송 대상 · 직원 참여/재고실사 · 08-24 이월)의 핸드오프가 이어집니다.** 덮어쓰지 않았습니다.

## 상태 — 문서 8파일 수정 + auto-memory 2파일. 코드·마이그레이션 변경 0

게이트 3개 통과: `doc-diet-audit` · `skill-audit` · `sort-audit`. 빌드·배포 불필요(코드 무변경).

| 축 | 정정 |
|---|---|
| 수치 | smoke 엔드포인트 **~102 → 111** (`CLAUDE.md:18` · `skills/deploy-verify/SKILL.md:46`) |
| 수치 | `docs/INDEX.md` 활성 spec **40 → 46건** · analysis **8 → 9건** · **「8월 트랙」 신설**(미등재 6건 등재) |
| 경로 | `.claude/plans/…` → **`~/.claude/plans/…`(repo 밖)** — repo 상대로 읽으면 못 찾는다 |
| 경로 | `scripts/layout/shell.js:520~598` → **`src/scripts/layout/shell.js:793`** · `architecture-flow.md` `src/` 접두 4곳 |
| 모순 | `PROJECT_STATUS.md:99` 한 줄 안에서 「safe_stock 0이라 미작동」↔「48행 채움」 → **판정축=`reorder_point`** 로 통일 |
| 모순 | `decisions-business.md` C 카카오톡 **「미구현」 → 2026-06-10 구현·운영 중**(`routes/kakao.ts`·`services/barobillSms.ts`) |
| 유령 | `design-decisions.md` **본문이 없는 인덱스 전용 ID 14개**(U·V·W·X·Z·AI·AJ·AK·AM·AN·AO·AP·AQ·AR) 명시 |
| 누락 | 핸드오프 TODO 3건을 현황판에 등재(채택 계기판 · `resolveStockUnit` yd · `base_unit` 감사망) |
| 메모리 | `MEMORY.md` 재고실사 훅에 `reorder_point` 판정축 추가 · 고아 메모리 3건 ARCHIVE 등재 |

## ★판단기준·주의 (다음 세션이 몰라서 틀릴 지점)

- **★`MEMORY.md` 여유가 61자뿐이다.** 다음에 한 줄이라도 더 쓰면 `doc-diet-audit` 이 막는다.
  그때 **방금 쓴 항목을 깎지 말 것** — 규칙대로 **오래된 덩어리를 `MEMORY-ARCHIVE.md` 로 이관**한다(총량만 보던 구 게이트가 이 실수를 유발했던 전례).
- **★인덱스가 코드보다 오래 틀린 채로 산다.** 이번 12건 중 게이트가 잡은 건 **0건** — 한도·frontmatter 는 보지만 **내용이 코드와 맞는지는 안 본다**.
  숫자·경로가 박힌 문서는 **주기적으로 실측 대조**해야 한다(`scripts/smoke.cjs` 항목 수 · spec 파일 수 · 심볼 위치).
- **★`MEMORY.md` 가 잘못된 IA 경로를 싣고 있었다** — `IA publish Z:Designs...publish`. 축1 런타임은 **실행 중 exe 폴더**(`publish` 아님).
  6일간 구버전이 돌았던 그 함정이라 인덱스 쪽을 정정했다. 원문은 `MEMORY-ARCHIVE.md` 보존.
- **`design-decisions.md` 의 14개 ID 는 찾아도 없다** — git 히스토리에도 본문이 없다. 키워드 칸이 전부다.
- **이 파일은 덮어쓰지 않고 앞에 쌓는다** — 아래 3개 세션 핸드오프가 아직 유효하다.

## 다음 세션 TODO (이번 점검에서 드러난 것)

1. **`resolveStockUnit` yd 폴백 수정** — `src/utils/rollConsumption.ts:75-80`. m·cm 외 전부 `yd` → **잉크가 「27 yd」**. 실사 입력을 현장에 넘기기 전.
2. **`base_unit` 축 감사 추가** — `scripts/item-master-audit.cjs` 참조 **0회**. 50배 사고를 낸 축이 `npm run audit:items` 밖에 있다.
3. **채택 계기판(요구 발굴 1부)** — ★`activity_logs` 지표는 `user_id` 로 `e2e_tester`·`admin` 을 걷어낸 뒤 볼 것.
4. (선택) **문서 실측 대조를 게이트화** — smoke 항목 수·spec 파일 수처럼 기계로 세지는 숫자는 `doc-diet-audit` 에 붙일 수 있다.

## 검증 명령 (PowerShell)

```powershell
node scripts/doc-diet-audit.cjs      # 현황판·MEMORY.md 한도 (여유 61자 주의)
npm run audit:skills                 # 스킬 정의 게이트
node scripts/sort-audit.cjs          # 목록 정렬 tie-break
# 코드 무변경이라 build/verify/smoke 는 이번 건에 불필요
```

---

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
   ✅**알림 가시성 수정 `6c14234b`** — 일일 알림 4종이 `target_role='MANAGER'` 인데 **MANAGER 계정이 0명**이라 생성만 되고 아무에게도 안 보였다(07-26~08-18 미읽음 15건). `VISIBLE_SQL` 상수로 뽑고 **ADMIN 예외** 추가, 5경로 전부 적용. 정본=memory `design-nav-badge-cost-guard`. ⚠️**admin 미읽음 1,734건 = 벨 포화** — 보존기간 정책 필요(`DELETE /cleanup` 존재).
   ★내일 아침 실제 알림 = **재고 부족 1건뿐**(납기·발주·장비는 전부 0건).
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
