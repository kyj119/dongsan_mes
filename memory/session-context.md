# 세션 컨텍스트 (2026-07-14) — 부문별 손익 관리회계 (P1~P5) 신규 구축·prod 배포

> 세션별 덮어쓰기 파일. **이 세션 정본 = auto-memory [[design-departmental-pnl]] + 이 파일.**

## 요청·결론
- **요청**: "품목별 어느 부서 입고/재고처리 → 부서별 영업이익·인건비 비율 등 세무회계 계산"
- **결론**: 부문(cost center)별 손익 = **관리회계**(내부 "어느 팀이 돈 버는지"). 세무신고=법인단위 그대로(부서분할 무관).

## 확정 설계 (사용자 합의)
- **부서 정의 = 계층 부문 마스터 + 공정(items.category) 귀속엔진**. 순수 공정6종만 쓰면 관리부서·봉제·유통(card_group=null) 구멍 → 얇은 부문 마스터로 포섭. 리포팅 묶음 변경=매핑만 수정.
- **부문 트리**(prod 시드): 출력/전사/간판/유통(PRODUCTION) + 디자인(부모)>디자인-출력·디자인-전사·디자인-간판·봉제/후가공 + 관리/본사(SUPPORT). 사용자: "디자인도 전사·출력·간판 3부서로 나뉜다" → `serves_department_id`로 디자인 하위팀이 대응 생산부문 지원(P5 직접귀속). 봉제=디자인 산하·공통.
- **매출귀속=품목라인**(order_items.category_name→부문) 자동. **공통비=공헌이익 먼저→P5 배부**.
- **관리 UI**: 별도 /departments 페이지 폐기(사용자 요청) → **/hr에 3탭 통합**[직원 관리·부문 관리·부문 손익]. 레거시 `employees.department`(enum) 유지(하위호환), 신규 `department_id`(FK) 병행.

## 배포 결과 (main `73b86ee0`, 마이그 0459~0462 remote **execute --file 직접**[db:migrate:prod 금지=추적 0325 불일치])
- **P1**(0459/0460): `departments`(계층 parent_id·dept_type·serves_department_id·legacy_codes) + `department_category_map` + `employees.department_id` FK+백필(**미매핑 0** prod 실측).
- **P1.5**(0461): `routes/departments.ts` CRUD + `/hr` 부문 관리 탭(`pages/hr.ts`+`scripts/departments.js` concat, dept- 접두 전역격리).
- **P2**(0462): `GET /api/departments/pnl?from&to&basis` 매출·자재비·인건비 집계 + `/hr` 부문 손익 탭. 0462=cards.category_name(card_group 라벨)→부문 보강.
- **P5**(마이그 없음=순수 리포트): serves 재배분 + 공통풀(잔여 지원인건비+고정비) 안분(basis=revenue/headcount/labor) → 부문 영업이익. **원장 불변·계산단계만**.
- **#521**(봇 발견): `/employees`·트리 인원수·pnl 인원기준에 `entityFilter` 추가(전 법인 노출 차단).

## 프로덕션 실측(2026-07)
- 인건비: 간판 30,255,310 · 관리/본사 10,563,940 (그 달 급여 2부문만 입력). 고정비 15,800,550. 공통풀 26,364,490.
- 자재비=0(iad 0행). 매출=주문라인 기준(billed_orders=0).

## 알려진 한계·후속 (선택, 미착수)
1. **자재비 0** — `inventory_auto_deductions` prod 미가동([[project-rip-send-pipeline]]). 붙으면 자동 반영(매핑 0462 준비됨).
2. **매출=주문라인**(비취소·주문일). 청구 기준 원하면 `order_billing_groups` 전환.
3. **PATCH /employees/:id** entity 가드 미추가(읽기만 #521 차단). 필요시 추가.
4. **fixed_expenses** entity 미필터(financialReports 관행).
5. serves 재배분은 디자인 하위팀 급여 입력돼야 동작(2026-07 미발생).

## 명령·검증
- 프로덕션 https://webapp-9i0.pages.dev/hr → 3탭. 로컬 admin/password.
- `npm run verify`(typecheck+build) / `npm run deploy:prod`(--branch main) / 신규 마이그=`wrangler d1 execute webapp-production --remote --file=./migrations/XXXX.sql`.
- ⚠️로컬 D1 마이그 추적=0325 불일치(데이터는 최신) → `db:migrate:local` 금지, 신규만 execute --file.
- ⚠️브랜치 `feat/dept-pnl`에 타 세션 bank 커밋 흡수(공유 체크아웃)·origin/main과 수시 병합하며 FF push `feat/dept-pnl:main`.

## 정본
- auto-memory [[design-departmental-pnl]] / spec `docs/superpowers/specs/2026-07-13-departmental-pnl.md`
