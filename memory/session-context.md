# 세션 핸드오프 — 선명 매입원장 품목 노출 + 거래처 원장 공급가액·부가세·합계 3열 (2026-07-21)

> 세션별 덮어쓰기 파일. 이전 핸드오프(IA JSX 세션루프)의 durable 내용은 [[project-ia-designer-loop]]·[[project-ia-web-sunset]]에 보존됨.
> 이번 세션 durable = 아래 + [[feedback-shared-checkout-git]](강화)·[[design-ledger-line-vat-columns]].

## 이번 세션 요약
거래처 원장(매출·매입) 상세 모달 2건 개선. **전부 prod 배포·검증 완료**.
1. **선명 매입원장 품목 라인 노출** — "매입내역 정리 안 됨"의 실체 = 데이터(purchase_order_items 1,006라인)는 처음부터 존재, **원장 화면이 발주 총액 행만** 그리고 품목 라인을 안 펼침(매출 원장엔 있던 기능이 매입엔 없었음). 매출(ar-ledger) 패턴 미러링으로 해결.
2. **원장 금액열 공급가액·부가세·합계 3열 분할** — 품목=공급가(net)·헤더=총액(VAT포함)이 같은 열에 섞여 "라인 합≠헤더" 가독성 저하. 세금계산서 표준(=우리 거래명세서·견적서 관례) 벤치마크로 3열 분할.

## 산출/배포
| 커밋 | 내용 | prod deploy |
|---|---|---|
| `0f2d7454` | 매입원장 발주 품목 라인 노출(accounts-payable.ts items[] 부착 + ledger.js 렌더) | `42992db2` |
| `601392b6` | 원장 공급가액·부가세·합계 3열(ledger.ts thead 9열 + ledger.js ledgerAllocVat 배분/양쪽 렌더/CSV) | `01afbb7d` (superset) |
- **origin/feat/dept-pnl = `601392b6`** (내 VAT 커밋이 최신). 원격 백업 브랜치 `session/ledgervat` 존재(삭제 가능).
- 검증: `npm run verify` green·`node --check`·**prod 스모크 102/102**·prod `/ledger` HTML thead 마커(부가세·합계 각 2=AR/AP)·apex 302. VAT 배분 함수 node 단위검증(10%·9품목·면세·반올림 전부 라인합=소계=총액 정확 일치).

## 핵심 결정 + 이유
- **원장 상세 = 발주/전표 단위 행**(품목 미표시가 원래 설계, 매출과 동일). 요청은 품목 노출 → 매출 방식 미러링.
- **3열 분할 벤치마크 = 내부 세금계산서/거래명세서/견적서 관례**(`invoice.js`·`taxInvoices.ts`·`quotationForm.ts` 전부 공급가액|세액|합계) = 국세청 세금계산서 표준. 원장 상세만 안 따르고 있었음.
- **`ledgerAllocVat`(ledger.js)**: 부가세=총액−공급가합(신뢰식, 면세·할인 자동처리), 품목별 **비례배분+마지막 잔차 흡수** → Σ부가세=총부가세·Σ합계=총액 **정확 일치**. 무품목/면세 안전(hasBreakdown 가드로 공급가·부가세 공란).
- **주문/발주 헤더 = 소계 행**(공급가액계·부가세·합계, bold). 별도 소계행 불요.
- **`vat_included` 플래그 신뢰 불가**: 매출품목 vat_included=0·선명매입 vat_included=1인데 **양쪽 다 amount=공급가(net)**. 오해 유발 `✓ 부가세포함` 표시 제거.
- **격리 배포(worktree)** = 사용자 지시 + 사고 복구 수단. 아래 주의사항 참조.

## 판단 기준 (다음 세션용)
- 원장 거래처 조회는 **로그인 법인 컨텍스트로 entityFilter**(admin 기본=법인1). 법인2(선명) 데이터는 `POST /api/auth/switch-entity {entity_id:2}` 후 조회. entity_id=0=전체모드(필터 생략).
- 원장 상세 모달 컬럼 정합: 모든 행 **9칸**(일자·구분·내용·공급가액·부가세·합계·입금/지급·잔액·action). 전기이월/헤더/품목/입금/감액/빈행 각각 9칸 맞춰야 정렬 안 깨짐.
- 매출=`ar-ledger.ts`+`loadClientDetail`, 매입=`accounts-payable.ts`+`loadPurchaseClientLedger`. 한쪽 고치면 대칭 반영.

## 검증 명령
```powershell
npm run verify                                        # typecheck + build
node --check src/scripts/ledger.js                    # ?raw JS 문법
$env:SMOKE_URL='https://webapp-9i0.pages.dev'; npm run smoke   # prod 102/102
# prod 원장 thead 마커: /ledger HTML에 부가세</th>·합계</th> 각 2 (AR+AP)
# VAT 배분 검증: ledgerAllocVat 추출해 node로 (라인합=소계=총액 확인)
```

## 다음 세션 TODO
1. **메인 체크아웃 sync**: 로컬 `feat/dept-pnl`이 origin(`601392b6`)보다 뒤질 수 있음 → 배포 전 `git pull --ff-only` 필수(안 하면 VAT 회귀).
2. (선택) **인쇄/팩스 명세서도 3열 정합**: 현재 화면 모달만 3열. `_ledgerStatementData` 기반 print/fax는 별도 작업.
3. (사소) `ledger.js:401` 주석 "매출(+)/입금(-) 2컬럼" stale → 다음 배포 때 정정.

## 주의사항 (함정)
- ⚠️ **공유 메인 체크아웃 = 미커밋 변경 실제 유실**(이번 세션 실증): VAT 변경을 메인에서 편집·빌드 중 타 세션 커밋/체크아웃이 내 **미커밋 파일을 완전히 덮어씀**(git status clean·변경 소실). "허상 원복"이 아니라 진짜 유실. → **처음부터 worktree 격리가 정답**. [[feedback-shared-checkout-git]]
- ⚠️ **동시 세션 6개 가동**(worktree: bank-ap-link·cardtl·ia-designer-loop·ia-web-sunset·issuefix + 메인). 배포=`new-session.ps1 <이름> feat/dept-pnl`(회귀방지 base) → 워크트리 빌드 → **rebase origin/feat/dept-pnl(superset)** → `deploy:prod` → `git push session/X:feat/dept-pnl`(FF) → `end-session.ps1 X -DeleteBranch`.
- ⚠️ **end-session은 port 3000 dev 서버도 종료**(재기동 안내). 배포≠push(deploy:prod 후 push 필수).
- ⚠️ prod 로그인=admin/password 유효(스모크/검증용).
