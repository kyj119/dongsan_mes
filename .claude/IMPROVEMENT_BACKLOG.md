# Improvement Backlog
<!-- last_run_area: 2,3,4,5,6 (전체 심층 감사) -->
<!-- last_run_at: 2026-05-15T01:00:00+09:00 -->

## 통계
| 상태 | 건수 |
|------|------|
| ✔️ done | 5 |
| 🆕 new (GitHub Issue) | 4 |

## 🔧 Auto-fixed (이번 세션)
### [A-001] Auth bypass — payslip/year-end 페이지 인증 누락 (Area 5)
- **수정**: pageAuthMiddleware 추가
- **커밋**: 82d4da3
- **상태**: ✔️ done

### [A-002] XSS — clientDetail.js 거래처 메모 innerHTML (Area 5)
- **수정**: escapeHtml 4곳 적용
- **커밋**: 82d4da3
- **상태**: ✔️ done

### [A-003] Authorization — year-end settlement requireRole 누락 (Area 5)
- **수정**: requireRole('ADMIN','MANAGER') 추가
- **커밋**: 82d4da3
- **상태**: ✔️ done

### [A-004] PII — HR 직원 목록에 주민번호/계좌 노출 (Area 5)
- **수정**: SELECT에서 민감 필드 제외
- **커밋**: 82d4da3
- **상태**: ✔️ done

### [A-005] 인덱스 — cards.requesting_entity_id 외 4건 (Area 2)
- **수정**: 마이그레이션 0204 생성
- **커밋**: 82d4da3
- **상태**: ✔️ done

## 🆕 Open Issues
### [I-047] XSS 취약점 8건 — messages/purchaseRequests/taxInvoices (Area 5)
- **GitHub**: #47
- **공수**: 30분
- **상태**: 🆕

### [I-048] 카드-주문 상태 불일치 32건 (Area 4)
- **GitHub**: #48
- **공수**: 1h
- **상태**: 🆕

### [I-049] N+1 caps.ts + entity_id 인덱스 3건 (Area 2)
- **GitHub**: #49
- **공수**: 1h
- **상태**: 🆕

### [I-050] 로딩 상태 미구현 30/79 페이지 (Area 3)
- **GitHub**: #50
- **공수**: 2-3h
- **상태**: 🆕

## 오탐 제외 패턴
| 패턴 | 이유 |
|------|------|
| `entityFilter ${ef.clause}` SQL 삽입 | 하드코딩된 SQL, 사용자 입력 아님 |
| `ORDER BY ${sortOptions[key]}` | 화이트리스트 매핑, 안전 |
| `DELETE FROM ${table}` (hr.ts) | CHILD_TABLES 하드코딩 배열 |
| `PRAGMA table_info(${table})` (attendance.ts) | ALLOWED_TABLES Set 제한 |
| dev server 취약점 (vite/esbuild) | 프로덕션 영향 없음 |
| webhooks.ts IP 화이트리스트 | 의도적 보안 제어 |
