# 세션 핸드오프 — HR B3/B5·pension_base·부문손익 원가·매출단가 (2026-07-19)

> 세션별 덮어쓰기 파일. 상세 정본 = [[design-payroll-self-service]]·[[project-item-pricing]]·[[design-departmental-pnl]] (auto-memory).

## [추가 세션 2026-07-19] 거래처원장 모달 2버그 근본수정 — prod 배포·검증 완료 (커밋 `64947498`, deploy `d201af98`)
- **스크롤 멈춤(ESC 닫기 한정)**: layout.ts 전역 ESC closer가 `[id$=Modal]`에 hidden만 추가→body 스크롤락 미복원, ledger 자체 ESC 리스너는 "이미 hidden"이라 skip. 프로덕션 Playwright 스택트레이스로 확정(X/배경 클릭은 정상이라 이전 finally 보강으로 안 잡혔던 것).
- **해결(패턴)**: 전역 closer에 `data-esc-close="함수명"` 위임 훅 신설(layout.ts)+`#clientDetailModal`에 선언. ledger.js 자체 ESC 리스너 제거(스택 모달 이중닫힘 방지). 부수효과(스크롤락 등) 있는 신규 모달=data-esc-close 필수 → [[design-esc-close-delegation]]
- **일자 잘림 = 매입 모달 테이블**: 이전 수정이 매출(112px)만, 매입 발주/지급 90px 잔존(셀 66px<텍스트 72.7px 실측). 90→112px + accounting.ts 형제 2곳 스윕.
- 검증: prod에서 ESC/X/배경 3경로 스크롤 복원·스택 ESC 1회 1개·매입일자 112px·wheel 실스크롤 500px. `npm run verify` green.

## 이번 세션 요약 — 전부 prod 배포완료, 워킹트리 clean, main=origin/main=`cc5c36a7`
지난 세션 TODO(B5·B3·단가·pension필드)를 대부분 소화. 배포 순서(main):
1. **B5 요율**(데이터 UPDATE): 국민연금 7월 기준소득월액 상하한 prod → 하한 **410,000**·상한 **6,590,000**(insurance_rates 2026 NATIONAL_PENSION). 반영 시 7월 급여 10건 전원 상한 미만 → 재sync 불필요.
2. **B3 직원셀프**(`2128fda2`, 마이그 0468, deploy 001cce1d): 급여명세서 셀프교부(payroll.published_at 게이트+payslip_issuance_logs 증빙, admin `POST /api/payroll/publish·unpublish` 교부드롭다운) + 근로계약서 본인서명(`GET /self/contracts/:id/preview`·`PATCH .../sign`·서명캔버스). 셀프 4엔드포인트 employee_id 소유게이트. `src/templates/payslipHtml.ts` 신규.
3. **pension_base 필드**(`1a1d8187`, 마이그 0469, deploy 69c90016): `employees.pension_base`(국민연금 기준소득월액). 설정 시 국민연금 base=기준소득월액(상하한 클램프), 미설정=당월급여(하위호환). 국민연금만.
4. **코드리뷰 후속 fix 5건**(`741ee022`, deploy 793f1a6d): ★leaves.ts(미사용연차수당 반영)가 **5번째 calcDeductions 호출부**인데 pensionBaseOverride 누락(pension_base 직원 국민연금 덮어쓰기)·hr.ts SALARY_FIELDS에 pension_base·records.ts publish batch 80청크·employeeSelf.js entity_name esc(XSS)·0468 헤더주석.
5. **XSS 배포**(deploy c147b200, main `832021ac`): 봇 근로계약서 서명 img-src escape(#544) — 내 셀프서명 preview도 쓰는 템플릿이라 배포.
6. **원가 backfill**(데이터): `items.avg_unit_cost` 0→**315개**(purchase_order_items 가중평균 SUM(amount)/SUM(qty), VAT 입력값그대로). `docs/price/backfill_avg_cost.sql`.
7. **부문 P&L 유통 COGS**(`c10d2b7d`, deploy 06d914e9): MATERIAL/GOODS 판매수량×avg_unit_cost→유통 부문, material 버킷.
8. **부문 매출귀속 근본수정**(`3fb46cf2`, deploy bd1331cd): `oi.category_name`(전유형 NULL)→`items.category`. 출력59.5M·전사6.0M·유통421.5M(원가362.7M·공헌58.8M) 정상화.
9. **매출 base_price 시드**(데이터): FIXED 안정품목 **73개** 중앙값(`docs/price/seed_base_price_fixed.sql`). has_price 137→210.

## 핵심 결정 + 이유
- **B3 셀프**: 교부는 status와 독립 **publish 토글 게이트**(대부분 PENDING이라 status 게이트=빈화면)·인증 **현행 유지**(사원번호+생년월일)·서명 대상=**근로계약서 본인서명**(spec F-5, 급여수령확인 아님).
- **pension_base**: 국민연금만(건강/장기요양/고용은 보수월액=당월급여 유지)·미설정 0=당월급여 하위호환. EmployeeDefaults 캐리어로 4호출부(+leaves 5번째) 주입.
- **원가 소스**: **입금내역 부적합**(payments·cash_receipts에 item_id 없음=거래처/계산서 단위). 매입 원장(purchase_order_items)이 소스. VAT=입력값그대로(데이터 vat_amount=0·선명 미지급 정합).
- **매출 87%가 유통(원단/상품)**: 자재비(제조 소진)가 아니라 매출원가=판매×매입가. 그래서 유통 COGS가 핵심(자재비 iad 아님).
- **매출귀속=items.category**: oi.category_name이 전유형 NULL(커스텀 포함)이라 원래 미분류로 샜음. items.category로 전환. MATERIAL/GOODS는 item_type기준 유통(공정 category 없음).
- **base_price FIXED만**: AREA는 이력 unit_price가 **개당가(431/432)**인데 폼(calc.js)은 ㎡단가로 곱함→그대로 시드하면 **5x 과청구**. AREA는 ㎡단가표 별도 필요.

## 판단 기준 (다음 세션용)
- **배포**: 커밋 후 사용자 "배포 진행" 명시([[feedback-deploy-needs-explicit-request]])→origin 분기 fetch(이 세션 봇이 수시 앞섬)→superset 병합→verify→`npm run deploy:prod`(--branch main)→apex 검증→docs push.
- **★신규 calc/공유함수 파라미터 추가=전 호출부 grep 필수**(이 세션 leaves.ts 5번째 calcDeductions 누락을 코드리뷰가 잡음). [[feedback-sibling-incomplete-sweep]].
- **prod P&L 검증=전체모드 토큰**: admin은 entity1(동산기획, 주문데이터 거의 0)이라 매출 0으로 보임. `POST /api/auth/switch-entity {entity_id:0}`로 전체모드 토큰 재발급해야 선명(entity2) 데이터 보임. 로컬 D1은 order/purchase/insurance_rates 데이터 없음(검증 시 시드 필요·dev 재시작 후 반영).
- **데이터 backfill**: dry-run(SELECT)로 대상수·이상치·단위혼재 먼저 → 사용자 확인 → 멱등 SQL 적용 → 채움수/spot-check 검증. repo `docs/price/*.sql` 재현 보관.

## 검증 명령 (PowerShell)
```powershell
npm run verify                 # typecheck + build (backend)
npm run build; npm run smoke   # 전체 (smoke는 로컬 activity-logs 500=0456 로컬미적용 기존이슈, 무관)
# prod D1 조회: npx wrangler d1 execute webapp-production --remote --json --command "..."
# prod 검증 토큰(전체모드): login→POST /api/auth/switch-entity {entity_id:0}
# 로컬: npm run dev:d1 (127.0.0.1:3000, admin/password). 종료: Get-Process workerd | Stop-Process -Force
```

## 다음 세션 TODO
1. **매출 base_price 잔여**: FIXED 변동·단발·무이력 품목 수동(showGroupPriceModal) / **AREA=㎡단가표(규격·수량 구간) 설계** — 단 **개당견적↔㎡단가 업무관례 결정 선행**(선명 실거래는 개당). 무이력 514개.
2. **간판 BOM**: brainstorming 후 보류(spec 2026-06-13). 커스텀 라인(부문 미분류 198.2M) 상당수가 간판 추정.
3. **자재비 제조(iad)=0**: print_events 1664/1665 card_id NULL(조판↔RIP 단절·과투자보류). 필요 시 computeMaterialRequirements(추정) 경로로 PRODUCT(13%) 자재비 반영 가능.
4. **HR 잔여**: 건강보험 보수월액 필드(선택, pension_base와 유사)·B3 급여명세서 기존월 "근태 불러오기" 재실행 안내.
5. (선택) 커스텀 라인 부문 귀속 수단(품목연결 유도 or 수동 태그).

## 주의사항 (함정)
- ⚠️**AREA base_price 함정**: 이력 unit_price=개당가, 폼은 ㎡단가로 곱함. AREA 시드는 반드시 `amount/(면적×수량)`로 ㎡단가 재도출(그대로 쓰면 5x). 이번엔 AREA 제외함.
- ⚠️**부문 P&L 미분류 198.2M=item_id NULL 커스텀 라인**(자유입력). 간판 부문 매출 0(커스텀에 있어 인건비만 잡혀 적자표시)=데이터 특성.
- ⚠️**pension_base 반영**: 기존 급여월은 "근태 불러오기"(sync-attendance) 재실행해야 새 국민연금 base 적용.
- **dev 서버(workerd) 이 세션 여러번 재시작**(요율/dist 반영 위해). 세션종료 시 정리 — 재사용은 `npm run dev:d1` 재시작.
- 커밋 한글 OK(git), wrangler `--commit-message`만 ASCII. PS 큰따옴표 heredoc은 Bash 도구로.
- 미추적 `docs/superpowers/specs/2026-07-10-role-expansion-rw-permissions.local-copy.md`=로컬 참조 사본(커밋 대상 아님).
