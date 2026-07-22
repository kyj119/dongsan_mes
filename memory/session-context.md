# 세션 핸드오프 — UI/UX 후속: 감사잔여 8건 + 장비 SSOT + 다크모드 hex 전수 (2026-07-22)

> 세션별 덮어쓰기 파일. 이전 핸드오프(UI/UX 전수감사→P0~P2→공유화→백로그) durable 내용은 SKILL §9·design-token.md·MEMORY.md에 보존됨.

## 상태: ✅ **prod 배포완료** — main `03f2f979`(superset: `b009c598`+봇 `7b93234e`) · deploy `4c50bcbd` (2026-07-22)
- 검증: verify green + smoke **102/102 PASS** + apex 페이지 15/15·API 13/13(401)·필드마커 전건(ds-z-stack 4·equipLabels/dotBgClass 주입·print 라이트가드·equipment '정비중'2/'점검중'0·범례 gray·approvals 밑줄탭·settings FA·payroll 3xl+토큰·bank 토큰·iaScan 로컬토스트 0)
- ⚠️ apex 마커 검증 직후엔 엣지 전파 지연으로 요청별 신/구 번들 혼재 가능 — 20초 대기 후 단일 다운로드로 재검증하는 게 정확
- worktree `ui-audit2`=end-session 제거 완료(로컬 브랜치 삭제, 원격 `session/ui-audit2` 백업 잔존). dev 서버 정지됨

## 완료 내용
1. **감사 잔여 8건**: approvals 탭 pill→밑줄 / Lucide SVG→FA 30곳(settings·purchaseOrderForm·purchaseOrderForm.js SVG맵·storageZones. cards/iaEditor는 데이터시각화 SVG=유지) / 요약카드 text-3xl+tabular-nums 7곳 / orders 액션버튼 호버화(group+opacity, focus-within 포함) / 빈상태 CTA(quotations "+새 견적서"·clients "+거래처 등록", ds-empty 내 아이콘 버튼 금지—`.ds-empty i` 48px 전역룰) / clientDetail 성공 토스트 warning→success 2곳 / **iaScan 로컬 showToast 제거**(?raw 전역 동명충돌로 iaScan 페이지에서 전역 토스트를 덮어쓰던 실버그. invoice·quotation은 독립렌더 확인→로컬 유지가 정답) / **z-[60]×5·z-[70]×3 → `.ds-z-stack`(60)** 단일층(shared-styles 정의·design-token.md z표 갱신)
2. **장비상태 SSOT**: statusLabels.ts에 `EQUIP_STATUS_LABELS/TONES/ICONS` + MES_STATUS `'equip'` kind + `dotClass`/`dotBgClass`(도트색 톤맵) 신설 → equipment.js(STATUS_MAP reduce 위임)·production.js·schedule.js·dashboard.js·equipment.ts 범례·**rip.ts(서버측 import)** 위임. **IDLE=gray 확정**(사용자 결정, equipment amber 드리프트 교정)·**MAINTENANCE='정비중' 통일**(점검중 혼용 3:1 정리). SKILL §9 카탈로그 반영
3. **다크모드 인라인 hex**(사용자 확인: 다크모드 실사용→진행): shell 렌더 페이지 27파일 ~300곳 → `var(--c-*)` + `background:white` 팝업 12곳 → surface + **전역 `@media print` 라이트 팔레트 고정**(shared-styles — 다크모드 중 작업지시서·급여대장 인쇄 흰 종이 보장, 근본수정)

## 판단기준 (이 세션 결정 — 번복 금지)
- **장비 IDLE=gray**·MAINTENANCE='정비중' (정본=statusLabels.ts EQUIP_*)
- **스택 모달 z=`.ds-z-stack`(60) 단일 클래스** — 임의 z-[60]/z-[70] 신설 금지
- **다크모드 보류 원칙(의도적 유지)**: ①인쇄 전용 CSS(shipments.ts 15곳 등)=라이트 고정 ②채움(fill) 버튼 배경 hex(#2563eb·#dc2626·#0d9488 등)=유지(--c-primary 다크값과 흰 텍스트 대비 붕괴 방지) ③`input type=color` value ④캔버스 짝 색(orderForm 재단선 #ef4444=sheet.js strokeStyle과 동기) ⑤독립렌더 페이지(invoice·quotation·payslip·employeeSelf·portal·yearEnd 등)=다크모드 자체가 없음 ⑥ledger .client-row.active #fed7aa(hover와 구분 유지)
- 뱃지 텍스트 800계 hex→600계 시맨틱 토큰 통일(bank·users 등) = 의도적 드리프트 교정
- 에이전트 병렬 시 세션 한도 공유 주의: 5팀 중 4팀 한도로 중단(D조만 완주)→본체가 직접 마무리함

## 다음 세션 TODO
1. (선택) 다크모드 실기기 눈검증: html.dark 토글 후 bank·cards·ledger·payroll(급여대장 그룹색)·equipment 확인 — 특히 다크 중 작업지시서/급여대장 인쇄 미리보기(신설 print 가드 실효 확인)
2. (점진) scripts/*.js 쪽 인라인 hex는 이번 범위 외(감사 기준=pages). 페이지 손댈 때 자연 이관
3. 잔여 백로그(전 세션): 수제 뱃지 44파일→ds-badge·dsPaginate 실전환·printHtml/collectFilters/initTabs 공용화

## 주의사항
- 로컬 D1 `db:migrate:local`은 여전히 중복컬럼(0395 spec_group_id)에서 멈춤 — 신규 마이그는 `wrangler d1 execute --file` 직접 적용(기존 방침)
- 검증: `npm run verify` / 스모크=`npm run dev:d1` 백그라운드 후 `npm run smoke`
