# Improvement Backlog
<!-- last_run_area: 전체 심층 감사 (Area 2~6) -->
<!-- last_run_at: 2026-05-15T02:00:00+09:00 -->

## 통계
| 상태 | 건수 |
|------|------|
| ✔️ done | 15 |
| 🆕 new | 0 |

## 🔧 Auto-fixed (2026-05-15 세션)

### [A-001] Auth bypass — payslip/year-end 인증 누락 (Area 5, 커밋 82d4da3)
### [A-002] XSS — clientDetail.js 거래처 메모 innerHTML (Area 5, 커밋 82d4da3)
### [A-003] Authorization — year-end settlement requireRole 누락 (Area 5, 커밋 82d4da3)
### [A-004] PII — HR 직원 목록 주민번호/계좌 노출 (Area 5, 커밋 82d4da3)
### [A-005] 인덱스 — cards.requesting_entity_id 외 4건 (Area 2, 커밋 82d4da3)
### [A-006] XSS 8건 — messages/purchaseRequests/taxInvoices (#47, 커밋 932f236)
### [A-007] 카드-주문 상태 동기화 + 불일치 32건 수정 (#48, 커밋 932f236)
### [A-008] caps.ts N+1 batch 리팩토링 (#49, 커밋 932f236)
### [A-009] 로딩 스피너 5개 주요 페이지 (#50, 커밋 932f236)
### [A-010] 출고 취소 시 카드/주문 상태 복구 (#51, 커밋 932f236)
### [A-011] 카드→주문 상태 전환 원자적 batch (#52, 커밋 932f236)
### [A-012] HR CHILD_TABLES labor_contracts 누락 (#53, 커밋 932f236)
### [A-013] 세금계산서 삭제 시 자식 테이블 동시 삭제 (#54, 커밋 932f236)
### [A-014] 주문 취소 시 부분 출고 차단 + 카드 이력 (#55, 커밋 932f236)
### [A-015] portal_access_tokens 90일 보존 후 정리 (#56, 커밋 932f236)

상태: 전부 ✔️ done — GitHub Issues #47~#56 closed

## 잔여 개선 대상 (이슈 미등록, 낮은 우선순위)
- 로딩 스피너 나머지 25개 페이지 (5/30 완료)
- `as any` 51건 점진적 타입 개선
- 빈 상태 메시지 10개 파일

## 오탐 제외 패턴
| 패턴 | 이유 |
|------|------|
| `entityFilter ${ef.clause}` SQL 삽입 | 하드코딩된 SQL, 사용자 입력 아님 |
| `ORDER BY ${sortOptions[key]}` | 화이트리스트 매핑, 안전 |
| `DELETE FROM ${table}` (hr.ts) | CHILD_TABLES 하드코딩 배열 |
| `PRAGMA table_info(${table})` (attendance.ts) | ALLOWED_TABLES Set 제한 |
| dev server 취약점 (vite/esbuild) | 프로덕션 영향 없음 |
| webhooks.ts IP 화이트리스트 | 의도적 보안 제어 |
