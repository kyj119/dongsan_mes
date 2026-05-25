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
| AD | 출고번호 포맷 | SHP-E{entity}-YYYYMMDD-NNN, entity별 독립 시퀀스 |
| AE | CODEF API 전면 제거 | 월 80만원, codef.ts 삭제, 이메일 파싱 대안 |
| AF | BOM 법인 간 공유 | entity_id 미추가, 전 법인 공통 |
| AL | 자금관리 바로빌통장 탭 통합 | 은행연동으로 합침, barobillView.js 삭제 |

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
| W | 견적서 분리 (1:N 주문) | quotations 테이블, quotation_items, orders.quotation_id FK, immutable snapshot |
| X | 대형 파일 분할 패턴 | cards→queries/scheduling/lifecycle, items→5파일, orderForm→6파일, ?raw concat |
| Y | entity_id INSERT 의무화 | 14건 누락 수정, DEFAULT 1 함정, entityFilter SELECT + INSERT 양쪽 적용 |
| Z | SHIPPED 출고 카드 확인 | 미완료 카드 있으면 확인 모달, 확정→PRINT_DONE+shipped_at, 취소→HOLD |
| AA | 봉제실 작업지시서 통합 | PP/finishing 확장, method_group output/transfer, 부속품=품목라인 GOODS |
| AB | 품목 코드 PM-5xxx/6xxx | 전사=5xxx, 태극기=6xxx, METHOD_RANGES TRANSFER 추가 |
| AC | 후가공 사이드바 이동 | 생산→기준정보 (거래처/품목/단가/후가공·마감) |
| AA | vat_reports UNIQUE 재생성 | UNIQUE(year,quarter,entity_id), 테이블 재생성, ON CONFLICT 수정 |
| AB | db.batch() 원자성 강화 | paymentRequests approve/pay, approvals approve/reject → 단일 왕복 |
| AC | 백업 토큰 분리 | CLOUDFLARE_BACKUP_TOKEN (D1+R2), 배포 토큰과 분리 |
| AG | QR 스캔 코드 체계 | html5-qrcode CDN 동적 로드. 코드 접두사: CARD:/ITEM:/EQ:/ORDER: |
| AH | 견적 추천 단가 | 3개월 전체 거래처 평균 판매가, 원가(cost) 노출 금지 |
| AI | 법인카드 5 Phase 아키텍처 | corporate_cards + card_transactions + expense_categories, 바로빌 카드→DB 적재, 자동분류 규칙 학습, R2 영수증 |
| AJ | 자동매칭 신뢰도 임계값 | confidence >= 0.8 → CONFIRMED 자동확인, 0.5~0.8 → SUGGESTED 제안, < 0.5 무시 |
| AK | bank↔card-expenses 기능 분리 | /bank=통장+입금매칭+미수금+캐시플로, /card-expenses=카드사용+분류+수수료+결제예정+보고서. 중복 금지 |
| AM | atomic UPDATE WHERE 패턴 | SELECT→UPDATE race condition 방지. UPDATE WHERE current_stock >= ?, UPDATE WHERE billing_status IS NULL 등 |
| AN | 세금계산서 발행 batch 원자화 | junction+items 분리 batch → 단일 batch. 벌크/단건 양쪽 적용 |
| AO | 견적서 중복 전환 방지 | converted_count > 0 → 409, force=true로 강제 전환 허용 (분할 주문 지원) |
| AP | 재고평가 entity 분리 + 단가 경고 | Option C: entity 필터 + /price-alerts (법인 간 20%+ 단가 차이 경고) |
| AQ | HOLD 해제 work_records 복구 | HOLD→PRINTING/PRINT_DONE 전환 시 PAUSED→IN_PROGRESS 자동 복구 |
| AR | N+1 집계 쿼리 통합 | aiInsights 거래처별 루프→단일 GROUP BY, cardExpenses 자동분류→batch |
