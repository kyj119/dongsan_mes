# 세션 핸드오프 — 2026-08-24 오후 3건 (AP 부호·base_price 자료·매입 미연결)

## 상태
1. **AP 부호 분리 = prod 배포 완결** (`03aac905`, CI 배포·smoke 116/116). balance-snapshot AP 를 공급처별 부호 분리 — 매입채무=양수합, `assets.prepaid_expenses`=음수 절대값(선급/과지급). prod 실측 선급금 5,382,565. UI 스냅샷 카드에 선수금·선급금 보조줄(`snapshotArAdvance`·`snapshotApPrepaid`, 0=숨김). ⚠️매입 원장 목록(`accounts-payable.ts` settlement summary.total_balance)도 음수를 상계하지만 행 단위로 부호가 보여 별건 관찰로 남김.
2. **base_price 판단자료 = 생성·전달, 적용은 용준님 결정 대기**. `scripts/propose-costbase-prices.cjs`(신설·커밋 `7817182b`, 읽기전용) — 공백 586품목 중 원가 보유 FIXED 218건에 원가×카테고리 마진(상품 ×1.67·원자재 ×1.08·태극기 ×2.54, 참조 141건 중앙값) 제안 → `docs/pricing/costbase-proposals.csv`. 원가없음 315(GOODS 111·PRODUCT 127·MATERIAL 77)=매입이력 자체가 없어 3번 작업과 연동 · AREA 53=㎡단가표 설계 대상. ⚠️items 판매 플래그는 `is_sales_item`(is_sales 아님 — PRAGMA 실확인).
3. **매입 미연결 = 실측 정정 + 15건 연결 + 잔여 작업목록**. 실측: 이월(OPEN·2025-12-31) 17라인 10.4억 제외 시 **343라인 2.64억**(현황판의 「112라인 1.24억」은 구 집계 — 스코프 차). 확실 15건(갈바→SGM-GALVA·각목→WDS-01·SMPS→SGM-SMPS·고무자석→MAG-060) 연결, 백업 `_bak_0824_unlink15`(롤백=poi_id 의 item_id 를 NULL 로). **아크릴 5건 보류** — ACR 계열 9종(2/3/5T×백/검/투명)이 **전부 품명 「아크릴」**이라 월합계 줄을 특정 규격에 물리면 오염. 잔여 328라인 2.5억 = 뭉친줄 37(4,455만, 원장 PDF 분해 대상 — Z:\DesignsS 방법론=ARCHIVE §2026-08-24 전사잉크) + 미매칭 286(2.05억, **시트지·각관·LED·로프·외주가공·운임 = 간판 자재 주류 → 품목화는 간판 BOM 트랙과 묶임**). 목록=`docs/analysis/2026-08-24-unlinked-purchase-lines.csv`.

## 판단기준·주의
- ⚠️연결된 1식 라인(qty 1·뭉친 금액)은 **원가 backfill 재실행 시 avg_unit_cost 를 오염**시킬 수 있다(440,000/EA 각목 등) — `backfill_avg_cost.sql` 재실행 전 1식 라인 제외 조건 검토.
- 준석(AD) 태극기 끈 4,765,184(품목 없음)·에코컴퍼니 회전고리 18 88,280개×66원(ACC-014 가로등배너 회전고리와 동일물인지 불확실) — 용준님 질문 제출함.
- 다른 세션이 메인 체크아웃에서 활동 중(reports·LogWatcher 키트) — docs 커밋은 파일 지정 add.

## 용준님 결정 반영 (같은 날 오후)
- base_price **「일부만 적용」** → 상품·태극기 82건 적용 후 **GDS-EQ 장비 4건 원복**(소부속 마진 ×1.67을 장비 재판매에 이전 불가 판단) = **최종 78건**(백업 `_bak_0824_costbase_price`, old 전부 0이라 롤백=0). 원자재 134건 보류. 공백 586→508.
- 회전고리 18(에코, 88,280개×66원) → **ACC-014 연결** + search_keywords '회전고리 18' 보강.
- 태극기 끈(준석, 476만) → **ACC-056 신설**(볼로프 관례 상속: MATERIAL/원자재/EA·is_sales_item=0) 후 연결. ⚠️수량 없는 1식이라 원가 이력 부적합(backfill 재실행 시 제외 대상).
- 잔여 미연결 실작업 = **326라인 2.507억**.

## 다음 세션 TODO
1. 원자재 base_price 134건 — 보류(용준님 재검토 대기, CSV 전달됨).
2. 뭉친줄 37건 원장 분해(거래처별 Z:\DesignsS PDF — 케이엠테크·서울경금속 방법론 재사용).

## 검증 명령
```powershell
node scripts/propose-costbase-prices.cjs        # 제안가 재생성 (읽기전용)
$env:SMOKE_URL='https://webapp-9i0.pages.dev'; npm run smoke
```
