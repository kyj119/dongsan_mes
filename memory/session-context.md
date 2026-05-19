# 최근 세션 컨텍스트 (2026-05-19)

## 세션 성과 요약

| 지표 | 수치 |
|------|------|
| 커밋 | 3개 |
| GitHub Issues | #118~#120 close |
| 마이그레이션 | 0228~0230 (3개) |
| 버그 수정 | 500 에러 3건 해소 확인, 현수막 RM 정합성 |
| 멀티사업자 | 전체 점검 + entityFilter 추가 적용 |
| 인프라 | GitHub Actions Backup 토큰 분리 + 첫 성공 |

## 주요 완료 작업

1. **기존 500 에러 3건** — employees/12, stats/clients, unread-count 모두 200 정상 확인
2. **현수막 RM 정합성** (마이그레이션 0228) — print_media 재활성화, 이름 통일, null parent_media_id 수정
3. **GitHub Actions Backup** — CLOUDFLARE_BACKUP_TOKEN 분리, D1 Edit + R2 Edit 권한, 수동 실행 성공
4. **Issues #118~#120**
   - #118: vat_reports UNIQUE(year, quarter, entity_id) 재생성
   - #119: fixed_expenses/loans entity_id 추가 + cashFlow.ts 전체 entityFilter
   - #120: paymentRequests/approvals → db.batch() 원자성 강화
5. **멀티사업자 전체 점검** — production.ts GET /logs, paymentRequests stats entityFilter 추가

## 설계 결정

- **토큰 분리**: 배포 토큰에 D1 export 권한 없었음 → 최소권한 원칙으로 용도별 분리
- **db.batch()**: D1 트랜잭션 미지원 → batch 단일 왕복으로 부분 실패 최소화
- **vat_reports 재생성**: SQLite ALTER TABLE로 UNIQUE 변경 불가 → CREATE→INSERT→DROP→RENAME 패턴

## 주의사항

- inventory.ts: items(마스터) 조회라 entity_id 필터 의도적 미적용 — 확인 필요
- UNIQUE 제약(order_number, card_number 등) entity_id 미포함 — 법인 추가 시 충돌 위험

## 다음 세션 TODO

1. 백업 정상 동작 모니터링 (매일 KST 02:00 실행 확인)
2. UNIQUE 제약 + 자동채번 entity 프리픽스 설계 여부 결정
3. 대기 중 이슈: #65(후가공 추적), #75(견적 적정단가), #79(로트 추적), #80(바코드/QR)

### 새 세션 시작
```powershell
cd C:\Users\user\dongsan_mes
git pull
```
