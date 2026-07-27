# 관계사(선명) 채권·채무 미러 등록

선명(entity 2) 장부에만 있던 내부 관계사 채권·채무를 반대편 법인 장부에 미러 등록.
상대법인 client/supplier = **선명커뮤니케이션(id 1271)**. 모든 레코드 prefix `ICM-`.

| 파일 | 대상 | 내용 | 기대 파생잔액 |
|------|------|------|------|
| `01_e1_ap_mirror.sql` | 동산기획(entity 1) | 선명 매입채무(AP): 월별 PO 스냅샷 + 지급 1건 | 115,366,037 |
| `02_e1_ar_mirror.sql` | 동산기획(entity 1) | 선명 매출채권(AR): 월별 orders+billing_groups (지급/감액 없음) | 119,156,552 |
| `03_e3_ap_mirror.sql` | 동산기획청주(entity 3) | 선명 매입채무(AP): 월별 PO 스냅샷 (입금 0) | 44,907,566 |

## 적용 (프로덕션 — 메인 세션이 수행)
```
npx wrangler d1 execute webapp-production --remote --file=docs/receivables/intercompany-mirror/01_e1_ap_mirror.sql
npx wrangler d1 execute webapp-production --remote --file=docs/receivables/intercompany-mirror/02_e1_ar_mirror.sql
npx wrangler d1 execute webapp-production --remote --file=docs/receivables/intercompany-mirror/03_e3_ap_mirror.sql
```
## 검증 / 롤백
```
npx wrangler d1 execute webapp-production --remote --file=docs/receivables/intercompany-mirror/verify.sql   # PASS 3개 확인
npx wrangler d1 execute webapp-production --remote --file=docs/receivables/intercompany-mirror/99_rollback.sql # 전체 취소
```
> 로컬 검증만 `--local` + `00_local_seed_only.sql` 선적용(00은 prod 적용 금지). 재적용 전 99_rollback 선실행(멱등).

## 주의점
- `clients.purchase_balance`는 **법인 비분리 전역 캐시**. 선명(1271)은 entity1+entity3 양쪽에 채무가 쌓여
  전역합(160,273,603)으로 세팅됨 → 법인별 매입정산 화면의 캐시 표시는 교차법인 합계라 entity별 파생값과
  불일치(교차법인 supplier의 기존 구조적 한계). **법인별 잔액 SSOT는 verify.sql의 entity-scoped 파생값.**
- 금액은 2026-07-20 `--remote` 실측 기준. 임의 반올림/보정 없음.
