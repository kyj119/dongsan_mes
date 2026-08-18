# 세션 핸드오프 — 2026-08-18

> 이 파일은 **덮어쓰기**다. 지난 세션 내용은 남기지 않는다.
> 예외로 아래 「⚠️ 미배포 코드」는 이전(08-13) 핸드오프에서 **이월** — 이번 세션에 prod 실측으로 재확인했다.

## 이번 세션에 한 것 — 원장·미수금 3건 (prod 배포 완료 `a6beebe7`)

용준님 요청 3건. 경위 전문 = `.claude/PROJECT_STATUS_ARCHIVE.md` §2026-08-18 원장.

| # | 내용 | prod 실측 |
|---|---|---|
| ① | **매입 원장이 잔액만 남은 업체를 숨겼다** — `!po && !pp` 제외가 잔액을 안 봤다. 셋(발주·지급·잔액) 다 0일 때만 제외로 수정 | 거래 0건 기간 **0곳·0원 → 28곳·10.5억**. 「미지급금」 KPI 과소집계도 같이 해소 |
| ② | **매출 원장 기간 기준일 = 업무일자(`order_date`)** — 매입(`po.order_date`)과 통일. SSOT=`ar-helpers.arOrderDateExpr()` | 상세 「일자」 열에서 UTC 시각 사라짐. 값 차이는 미미(`date(created_at)<>order_date` = 10,075건 중 1건) |
| ③ | **미수금 현황 사업자별 분리** — 집계 키를 (거래처×청구법인)으로. 전체모드=사업자 열+법인별 소계 | **634,315,478원 232행 → 636,796,110원 260행**(+0.39%). 동산 5.51억/선명 8,021만/청주 512만 |

**결정과 이유**
- ②의 기준일을 **주문일**로 잡았다(청구일 아님) — 용준님 「매입 탭 기준으로 통일」. 매입의 기준이 발주일이라 대응축이 주문일이다. 청구일(`accounting_date`) 기준을 원하면 재논의 필요.
- ③에서 **법인 간 상계를 푸는 쪽**을 택했다 — A법인 미수(+)와 B법인 선수(−)가 상계되면 어느 법인도 자기 채권을 못 본다. 그래서 총액이 248만 늘어난 게 정상이다.
- 감액(`adjustments`)만 `created_at` 기준으로 남겼다 — `adjustment_date` 컬럼이 없다(매입 `purchase_adjustments`엔 있다). 통일하려면 마이그레이션이 필요해 이번 범위 밖.

## ⚠️ 미배포 코드 — 08-13 핸드오프에서 이월 + **이번 세션에 prod 실측으로 재확인**

현황판은 이 묶음을 「✅ prod 배포 2026-08-13 · `acb0431c`」로 적어뒀지만 **prod 에 없다**.
마커 5종을 서로 다른 5파일에서 프로브해 전부 부재 확인:

| 프로브 | 결과 |
|---|---|
| `GET /api/clients/name-index` | **404** |
| `GET /api/settings/data-completeness` | **404** |
| `/orders` 번들에 `이카운트 대사` · `대사 불일치` | **없음** |
| `/order-form` 번들에 `material_gap_message` | **없음** |

즉 워킹트리 직배포분이 **그 뒤 main push CI 배포에 덮여 사라졌다**(또는 애초에 안 나갔다).
해당 코드는 지금도 공유 체크아웃에 **미커밋 상태로만** 존재한다(`git status` 50건 중 src 20여개).

대상: `orders/core·create·update·lifecycle·operations.ts` · `clients.ts` · `settings.ts` · `workbench.ts` ·
`utils/materialRequirement·materialShortageCheck.ts` · `scripts/orders.js` · `orderForm/{calc,intake,itemRow}.js` ·
`layout/shell.js` · `dashboard.{ts,js}` · `reports.{ts,js}` · `scripts/smoke.cjs`(nameIndex 항목).

**⚠️ 이게 로컬 스모크를 111/111 로 못 만드는 이유이기도 하다** — `clients.nameIndex` 는 라우트가 prod 에 없어 항상 FAIL.
커밋된 목록 기준 prod smoke 는 **110/110 통과**다.

## 다음 세션 TODO

1. **미배포 묶음 처리 (최우선)** — 위 표의 코드를 살릴지 버릴지 결정.
   살린다면: 격리 워크트리에서 파일 단위로 커밋 → `git push origin session/<이름>:main` → CI 배포 → 마커 재프로브.
   ⚠️ 이 묶음은 **여러 세션의 변경이 뒤섞여** 있다. 통째 커밋 전에 파일별로 의도를 확인할 것.
2. **`postfix` 미실행** (08-13 이월) — 권한 분류기가 막아 용준님 직접 실행:
   `python scripts/ecount-order-postfix.py --from 2026-08-01 --to 2026-08-12 --apply`
3. **MES 에만 있는 8/12 전표 3건 판정** (08-13 이월) — `E1-20260812-035`·`-039`·`-044`
4. 감액 기간 기준 통일 여부 — `adjustments.adjustment_date` 마이그레이션할지 결정(안 하면 매출 원장에서 감액만 등록시각 기준)
5. 트랙 2(LogWatcher)·기타 잔여는 현황판 인덱스 참조 — 이 파일에 중복 기재하지 않음

## 판단 기준 · 주의사항

- **★배포 전 prod 실상태를 직접 프로브한다.** 현황판 「✅ 배포」도, 워킹트리에 코드가 있다는 사실도 증거가 아니다.
  변경에 GET 라우트가 있으면 그게 가장 싸다 — **토큰 필수**(무인증은 라우터 앞 authMiddleware 때문에 미존재 라우트도 401이라 판별 불가).
  라우트가 없으면 `?raw` 인라인 JS 마커를 페이지 HTML 에서 grep. 정본 = memory `feedback-deploy-push-divergence`.
- **공유 체크아웃이 dirty 면 워킹트리 빌드로 배포하지 않는다** — `npm run deploy:prod` 는 트리 전체를 휩쓴다.
  `.\scripts\new-session.ps1 <이름>`(base=origin/main) → 변경 파일만 복사·커밋 → `git push origin session/<이름>:main` → CI(deploy.yml) → `.\scripts\end-session.ps1 <이름> -DeleteBranch`.
- **git 경로(main push)가 정본 배포 경로다** — `.github/workflows/deploy.yml` 이 verify+deploy 하므로 git=prod 가 유지된다.
- `created_at` 은 TZ 미표기 UTC 라 **날짜 필터·표시에 쓰면 KST 00~09시가 전날로 밀린다.** 업무일자 컬럼(`order_date`·`payment_date`·`adjustment_date`)을 쓸 것.
- 미수금·AR 집계는 `excludeArExcludedClientsSql`(내부법인 3사 + 현금소매 더미)을 **반드시** 통과시킨다 —
  안 걸면 총액이 6.37억이 아니라 8.89억으로 나온다(내부법인 채권이 섞임). 원시 SQL 로 대조할 때 특히 주의.

## 검증 명령

```powershell
npx tsc --noEmit
npm run build
npm run audit:entity
node scripts/sort-audit.cjs
npm run audit:migration-drift
npm run smoke                                        # 로컬(dev:d1 기동 후)
$env:SMOKE_URL="https://webapp-9i0.pages.dev"; npm run smoke   # prod
node scripts/doc-diet-audit.cjs
```
