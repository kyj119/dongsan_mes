# 설계 결정 인덱스

> 상세 내용은 토픽별 파일 참조. 여기서 관련 결정을 찾은 뒤 해당 파일만 읽을 것.

> ⚠️ **본문이 없는 「인덱스 전용」 ID 14개** (2026-08-25 실측 — `references/decisions-*.md` 어디에도 없고 git 히스토리에도 없다. **찾으러 가지 말 것**):
> `U`·`V`·`W`·`X`·`Z`·`AI`·`AJ`·`AK`·`AM`·`AN`·`AO`·`AP`·`AQ`·`AR`.
> 이 행들은 **키워드 칸이 전부**다. 상세가 필요하면 auto-memory(`MEMORY.md` 인덱스) 또는 코드가 정본.
> (같은 성격: `BI` 역할확장 = 인덱스 전용, 상세는 auto-memory)

## 비즈니스·인프라 → `references/decisions-business.md`
| ID | 제목 | 키워드 |
|----|------|--------|
| A | Print.log 모니터링 — LogWatcher | 5초 폴링, EUC-KR, 바이너리 파싱, 하트비트 |
| B | 묶음 주문 확정 워크플로우 | ai_layout_requests, Z드라이브 복사, 롤백 |
| C | 카카오톡 알림톡 발송 (구현·동작 2026-06-10) | 바로빌 KakaoTalk.asmx; SenderID=연동ID·SmsReply E/A/N·성공판정=음수아님 → memory [project-alimtalk-status] |
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
| BF | 휴일/공휴일 derive-at-read 단일소스 | holidays 달력(마이그0311) + 토·일 = 유일소스. 근태·급여가 날짜에서 휴일 파생, attendance mutate(재분류)·반영버튼 금지 → memory [design-holiday-derive] |
| BG | 배송/출고 정합화·합배송·합포장 | ensureShipmentForOrder 일원화(dtMap 정본), orders.shipped_at(0436), 합배송 후보=명시적 cross-entity, 우편번호=delivery_info 쿼리파생, 합포장=merged_into_id 포인터(0437)+대표 쓰기 리다이렉트 → memory [project-delivery-system] |
| BH | 출고 검수·전량출고 하드게이트·/pack 권한 | 부분출고 전면불가(미완성 카드=주문 차단, silent 부분출고 제거), 검수정본=shipment_checks 별도테이블(0439, 승격안 기각), 검수=소프트/출고=하드 분리, /pack=requireAnyPagePermission 확장, merge 납품일 완화+0438 예약동기 → memory [project-delivery-system] |

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
| AX | 봉제실 작업지시서 통합 | PP/finishing 확장, method_group output/transfer, 부속품=품목라인 GOODS |
| AY | 품목 코드 PM-5xxx/6xxx | 전사=5xxx, 태극기=6xxx, METHOD_RANGES TRANSFER 추가 |
| AZ | 후가공 사이드바 이동 | 생산→기준정보 (거래처/품목/단가/후가공·마감) |
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
| AS | orders/cards UNIQUE entity 분리 | 인라인 UNIQUE 제거 불가→테이블 재생성 (0262), 복합 UNIQUE(entity_id, order_number) |
| AT | 직원 소프트 삭제 | is_deleted+deleted_at+deleted_by, 자식 테이블 유지, 조회 WHERE is_deleted=0 |
| AU | createPayment 읽기/쓰기 분리 | validatePayment(읽기) + preparePaymentStatements(쓰기) → 외부 batch 포함 가능 |
| AV | 견적→수주 낙관적 잠금 | updated_at 스냅샷 비교, 변환 중 수정 시 409 Conflict 반환 |
| AW | cash_receipt 취소 시 역산 불필요 | 현재 발행 시 balance/journal 미사용, 향후 회계 연동 시 재검토 |
| BA | entity 분리 전체 감사 (174 테이블) | docs/entity-separation-map.md, 86완료/0버그/28간접/42공유/18시스템. migration 0264로 14건 해소 |
| BB | 카드 페이지 역할 분리 | 오퍼레이터=뷰어(board→detail), 관리자=칸반+KPI, 자동화 우선. 인쇄 유지 |
| BC | 부서/직급/고용형태 SSOT | src/constants/hr.ts(DEPARTMENTS/POSITIONS/EMPLOYMENT_TYPES), deptOptions()헬퍼, layout HR_ENUMS_JS→window.DEPT_NAMES. 사무직=ADMIN_DEPT → memory [design-hr-enum-ssot] |
| BD | 고정연장 포괄임금 분해 | calcInclusivePay, 시급=base÷225.5(209+고정OT×1.5), 기본급=시급×209, 고정연장수당=총액−기본급, batch/sync → memory [design-payroll-inclusive-overtime] |
| BE | 급여대장 고정형+회사부담탭 | /payroll 확장토글, table-layout:fixed 고정형, 급여대장/회사부담금 2탭, 수당·공제 전개+합계+인쇄·CSV → memory [design-payroll-ledger] |
| BI | 역할 4→8 확장 + 읽기/쓰기 권한 (상세=memory 정본, decisions-code.md 섹션 없음) | ACCOUNTANT/SALES/FINISHING/SHIPPING 추가. users.role CHECK 재빌드 불가(FK RESTRICT)→job_role 컬럼 우회(로그인 COALESCE). role_page_permissions.can_edit 2단(열람/편집). enforcement=가산형 requireEditOrRole/requireAccessOrRole(라우터 read 게이트/write 엔드포인트 2계층, ADMIN·레거시 회귀0). 신규 seed는 page_key FK 존재필터 필수 → memory [design-role-expansion] |
