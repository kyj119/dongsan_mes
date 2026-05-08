# 설계 결정 인덱스

> 상세 내용은 토픽별 파일 참조. 여기서 관련 결정을 찾은 뒤 해당 파일만 읽을 것.

## 비즈니스·인프라 → `references/decisions-business.md`
| ID | 제목 | 키워드 |
|----|------|--------|
| A | Print.log 모니터링 — LogWatcher | 5초 폴링, EUC-KR, 바이너리 파싱, 하트비트 |
| B | 묶음 주문 확정 워크플로우 | ai_layout_requests, Z드라이브 복사, 롤백 |
| C | 카카오톡 알림 (미구현) | notifications 테이블 |
| D | 현장 카드 인쇄 | QR, 썸네일, 긴급도 알고리즘 |
| E | 묶음 주문 두 가지 유형 | parent_item_id, PackGroups |
| F | 납품 방법 7종 | HANJIN, DAESHIN, QUICK, DIRECT, PICKUP, TRUCK |
| G | 묶음 편집 + 카드 생성 규칙 | card_group별 1카드, 부모행/자식행 |
| H | JSX getFullBounds 케이스 계층 | Case 0-4, clipping, geometricBounds |
| I | UI/UX 디자인 시스템 | mes-ui-consistency 스킬 참조 |
| - | 시스템 구성 + 작업 공간 + 공통 상수 | 서버PC, AutomatPC, NAS |

## 금액 포맷 → `references/decisions-money.md`
| ID | 제목 | 키워드 |
|----|------|--------|
| - | 금액 포맷 규칙 (2026-04-14 확정) | fmtMoney, parseMoney, data-money, type="text" inputmode="numeric" |

## 코드·도메인 → `references/decisions-code.md`
| ID | 제목 | 키워드 |
|----|------|--------|
| J | ledger.ts 도메인 분리 (AR/AP) | aggregator, accounts-receivable, accounts-payable |
| K | orders.ts 관심사 분리 | core/queries/operations, 마운트 순서 |
| L | Claude hooks 설정 | Stop hook, edit_counter, sync-docs |
| M | 배포 스냅샷 및 롤백 | deploy-snapshot.sh, Cloudflare Pages, D1 Time Travel |
| N | 서브 라우터 자급자족 원칙 | authMiddleware 각자 적용, aggregator는 얇게 |
| O | 검수 워크플로우 상태 정의 | inspection_status 5값, PENDING_REVIEW |
| P | 수량 중심 검수 전환 | quantity_only, 품질 템플릿 격하 |
| Q | 권한 모델 | permission_pages, role_page_permissions, 캐시 |
| R | 재고차감 ROLL/SHEET 이원 구조 | yd 올림, ㎡ 올림, 합배치 |
| S | category_id TEXT 통일 | FK 의존 제거, is_sales_item, default_item_filter |
| T | DOM 참조 가드 패턴 | console.warn, silent fail 방지 |
| U | 가격 정책(Price Policy) 시스템 | price_policies, price_policy_rules, 우선순위: 품목고정>품목할인>카테고리>전체기본 |
| V | Linkhub 공통 인증 모듈 | linkhubAuth.ts, forwardIP=*, x-lh-forwarded, HMAC 서명 |
