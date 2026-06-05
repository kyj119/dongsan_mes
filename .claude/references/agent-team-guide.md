# 작업 위임 전략 가이드 (2026-06-05 개정 — Opus 4.8 단일 모델 기준)

> 메인 루프 = **Opus 4.8 (1M context)**. 의사결정 레버는 "어떤 모델이냐"가 아니라
> **인라인 / Explore fan-out / Workflow 오케스트레이션** 중 무엇이냐다.
>
> ⚠️ 과거의 haiku/sonnet/opus **티어 배정은 폐기**: SKILL.md에 `model:` 필드가 하나도
> 없어 실효가 없었고(전부 메인 모델로 실행됨), 메인이 opus인 지금 "opus는 PM 전용·개별
> 작업 금지"는 자기모순이었음. 커스텀 subagent(`.claude/agents/`)도 0개 — 빌트인만 존재.

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
[실행] 인라인 처리 or 위임(Explore/Workflow)
```

대부분의 작업은 **인라인(메인 루프 직접 처리)** 으로 충분. Opus 4.8은 단일 컨텍스트에서
다중 파일 분석·디버깅·리뷰를 직접 수행할 수 있다. 위임은 아래 기준에 해당할 때만.

## 위임 모드 선택

| 모드 | 언제 | 어떻게 |
|------|------|--------|
| **인라인 (기본)** | 단일~수 파일 수정, 분석, 디버깅, 리뷰 — 대부분의 작업 | 메인 루프가 직접 |
| **Explore fan-out** | 여러 디렉토리·네이밍 컨벤션을 넓게 훑어 **결론만** 필요할 때 (코드 위치·패턴 탐색) | `Agent(subagent_type:"Explore")` 1~N개 병렬. 읽기 전용, 파일 덤프 대신 결론만 회수 |
| **Plan** | 착수 전 구현 전략·영향 범위·트레이드오프를 설계해야 할 때 | `Agent(subagent_type:"Plan")` |
| **Workflow 오케스트레이션** | 4+ 파일 교차 변경, 전수 감사/마이그레이션 스윕, 다중 관점 검증을 **결정론적**으로 돌려야 할 때 | `Workflow` — ⚠️ **사용자 opt-in 필수** ("workflow" 키워드 또는 명시 요청이 있을 때만) |

> - 모델 오버라이드는 **기본 생략**(메인 모델 상속). 대량 단순 읽기 등 비용 민감 작업에만 haiku 명시 고려.
> - 4+ 파일 동시 변경으로 충돌 위험이 있으면 worktree 격리(`isolation:"worktree"`) 고려.

### 커스텀 subagent를 두지 않는 이유 (2026-06-05 결정)

`.claude/agents/` 커스텀 subagent는 **의도적으로 두지 않는다**(0개는 누락이 아니라 결정):
- 빌트인(Explore/Plan/general-purpose) + Workflow(opt-in) + skill 18개로 위임 스펙트럼이 충분.
- 라우트 수정 등 반복 위임은 도메인 맥락(CLAUDE.md·auto-memory) 의존도가 높아, 맥락을 잃는 독립 컨텍스트 subagent보다 **인라인 처리가 유리**.
- P1의 "인라인 우선" 방향과 일관. 향후 맥락 독립적이고 반복 빈도 높은 작업이 생기면 그때 재검토.

## Workflow 패턴 (다중 에이전트, opt-in 시)

사용자가 워크플로우를 명시 요청했을 때 활용. 흔한 단일 페이즈 패턴:

- **Understand** — 서브시스템별 병렬 reader → 구조 맵 종합
- **Review** — 차원별(버그/보안/성능/entity격리) find → 발견마다 적대적 verify (pipeline)
- **Migrate/Audit** — 대상 사이트 discover → 각 변환(worktree 격리) → 검증
- **Research** — 다각도 web 검색 sweep → deep-read → 인용 종합

> 기본은 `pipeline()`(스테이지 간 배리어 없음). 전체 결과를 모아야 할 때만 `parallel()` 배리어.

## subagent/Workflow dispatch 필수 포함 사항

라우트 수정을 위임할 때 프롬프트에 반드시 포함 (도메인 불변식 — 모델 무관하게 유효):

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

- **소형** (1 파일, 버그 수정): 불필요
- **중형** (2~3 파일): 인라인 계약 (dispatch prompt에 스키마+응답포맷+필드명 포함)
- **대형** (4+ 파일): 정식 계약서 (DB 스키마 SQL + API 인터페이스 JSON + 프론트 필드명 + 파일 목록)
  → Workflow 사용 시 schema 옵션으로 구조화 출력 강제 권장

## 통합 검증

모든 위임 완료 후:
1. `npm run typecheck` — import/타입 정합성
2. 계약서 대조 — API 응답 ↔ 프론트엔드 기대
3. `bash .claude/scripts/verify-routes.sh` — 라우트 등록
4. entity 필터 grep — 트랜잭션 쿼리에 entityFilter 적용 확인
