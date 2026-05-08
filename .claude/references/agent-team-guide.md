# 에이전트 팀 운영 가이드 (2026-04-25 개정)

> PM(오케스트레이터)이 에이전트를 dispatch할 때 참조하는 문서.

## 기본 원칙: 추론 → 확인 → 실행

```
사용자 요청
  ↓
[추론] 요청의 비즈니스 맥락·진짜 목적·연쇄 영향 파악
  ↓
[확인] "제가 이해한 바" 요약 → 사용자 확인
  ↓
[설계] 신규/구조변경 → brainstorming 스킬 실행
  ↓
[실행] 단독 작업 or 에이전트 dispatch
```

대부분의 작업은 **단독 작업**으로 충분. 다중 에이전트는 4+ 파일 변경, 도메인 교차 작업일 때만.

## 모델 배정

| Tier | 모델 | 용도 |
|------|------|------|
| 1 | haiku | 읽기 전용, 수집, 상태 확인 (log, sync-jsx, db-reset-seed, sync-docs/pm-report 수집 단계) |
| 2 | sonnet | 코드 생성/수정, 분석+판단 (review-checklist, deploy, security-audit, 라우트/페이지/스크립트 작업) |
| 3 | opus | 오케스트레이터/PM 전용 (다중 에이전트 분배, 아키텍처 설계, 대규모 리팩터링) |

## subagent dispatch 필수 포함 사항

라우트 수정 위임 시 프롬프트에 반드시 포함:

```
공통:
- "목록(GET /) + stats + count + summary + badge 엔드포인트 모두 수정"
- "INSERT 시 entity_id: getEntityId(c) 포함"
- "0이 유효값인 필드에 || default 금지, ?? default 사용"
- "escapeHtml/fmtMoneyInput 등 전역 함수 사용, 로컬 정의 금지"
- "회사 정보 → getEntityCompanyInfo(db, entityId), 팝빌 → getEntityCorpNum(db, entityId)"
- "완료 후 npm run typecheck 실행"

품목/재고 관련:
- "품목 조회 시 print_methods/print_media LEFT JOIN 포함 여부 확인"
- "품목 필터는 item_type (PRODUCT/GOODS/MATERIAL) 기반, is_sales_item 의존 금지"
- "GOODS 등록 시 is_sales_item=1, is_purchase_item=1 동시 설정"
- "재고 변동 시 inventory_transactions 기록 여부 확인"
- "SHEET 품목은 order_items.selected_material_id 확인"
```

## 설계 계약서 (Design Contract)

**소형** (1 파일, 버그 수정): 불필요
**중형** (2~3 파일): 인라인 계약 (dispatch prompt에 스키마+응답포맷+필드명 포함)
**대형** (4+ 파일): 정식 계약서 작성 (DB 스키마 SQL + API 인터페이스 JSON + 프론트 필드명 + 파일 목록)

## 통합 검증

모든 에이전트 완료 후:
1. `npm run typecheck` — import/타입 정합성
2. 계약서 대조 — API 응답 ↔ 프론트엔드 기대
3. `bash .claude/scripts/verify-routes.sh` — 라우트 등록
4. entity 필터 grep — 트랜잭션 쿼리에 entityFilter 적용 확인
