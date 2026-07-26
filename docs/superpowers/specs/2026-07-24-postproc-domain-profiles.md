# 후가공 도메인 프로파일 — MES 관리·가공자별 자동 로드 설계

**상태**: **A1 배포완료**(2026-07-26 — P1~P5·프리셋 마크). 남은=간판(sign) 탭(내용 대기)·B(전사 스마트 도련)·C(네스팅). 2026-07-24
**연관**: `2026-07-23-ia-palette-session-loop.md`(CEP 패널), `2026-07-24-designer-intake-field-carry.md`, [[project-ia-designer-loop]], [[design-item-postprocessing-link]]
**트리거**: "후가공을 MES에서 기본값·프리셋(재단선 포함/미포함) 관리 + 사용자별로 후가공이 다른데 어떻게 관리?"

## 0. 재구성 (Q&A 수렴)
"사용자별"이 아니라 **제품 도메인별**로 후가공 패러다임이 다름. **담당자마다 품목을 보고 나눠 작업 → 섞일 일 거의 없음.**

| 도메인 | 후가공 패러다임 |
|---|---|
| **현수막**(output) | 마감(접어미싱·열재단·줄미싱) + **재단선/접는선 마크** + 펀칭 |
| **전사**(transfer) | **도련(bleed)** + **봉제선 일부** (재단선 개념 약함) |
| **간판**(sign) | 추후 |

**기존 자산**: `finishing_methods.method_group`(output/transfer, 0260)이 이미 도메인 축 → 확장.

## 1. 확정 결정
| # | 결정 |
|---|------|
| 우선순위 | **A(프로파일) 먼저** → B(곡선 전사 가공)·C(네스팅)은 별도 |
| 마크 저장 | **프리셋별**(config에 변별 마크 포함) |
| 도메인 판별 | **가공자 선택 → 도메인 자동**(가공자↔도메인 1:1 매핑) |
| 관리 UI | **기존 후가공 페이지에 도메인 탭** |
| 전사 도련 | **색·윤곽 스마트**(정책만 A1 기록, 실가공은 B) |
| 도메인 범위 | 현수막·전사 우선, 간판 추후 |

## 2. A1 스키마 (지금 착수 범위)

### 도메인 = method_group (확장)
- `finishing_methods.method_group` / `finishing_presets.method_group` 를 **도메인 키**로 사용. 값: `output`(현수막)·`transfer`(전사)·`sign`(간판) 추가.

### 프리셋 config 구조화 (= CEP finishing 객체와 동일 스키마)
기존 flat `{top:"접어미싱",...}` → 확장(하위호환: 문자열이면 method만):
```jsonc
// 현수막 프리셋
{ "top":"접어미싱","top_cm":3,"top_mark":"cut",
  "bottom":"접어미싱","bottom_cm":3,"bottom_mark":"cut",
  "left":"줄미싱","left_cm":2,"left_mark":"",
  "punch":{"top":0,"corners":{}} }
// 전사 프리셋
{ "type":"bleed", "bleed":{"mode":"smart","mm":5}, "sew":{"top":true,"bottom":true} }
```
(CEP 패널 finishing 직렬화와 동일 → 프리셋 적용 = 그대로 주입)

### 가공자 ↔ 도메인 매핑 (신규)
```sql
-- 0473_worker_domains.sql
CREATE TABLE IF NOT EXISTS designer_worker_domains (
  worker_name TEXT PRIMARY KEY,
  domain      TEXT NOT NULL DEFAULT 'output'   -- output|transfer|sign
);
```
(CEP 가공자 로스터=인호동·김보연·정소은·김영주. MES user 매핑은 후속)

## 3. 계층별 구현 (A1)

### P1. 스키마 — `migrations/0473_*.sql`
- `designer_worker_domains` 신규. (method_group은 값 'sign' 추가만 — 컬럼 존재)

### P2. 서버 — `finishing.ts`
- `GET /methods`·`/presets`: 이미 `group` 필터 지원 → 그대로.
- 신규: `GET/PUT /worker-domains`(가공자↔도메인 CRUD, ADMIN/MANAGER).
- 프리셋 POST/PUT: config 구조화 값 그대로 저장(검증 완화).

### P3. 관리 페이지 — `postProcessing`(후가공 관리)
- **도메인 탭**(현수막/전사/간판) → 탭별 방식·프리셋 CRUD.
- 현수막 프리셋 편집기: 변별 방식+cm+**마크(없음/접는선/재단선)**.
- 전사 프리셋 편집기: **도련(스마트/고정 mm)** + 봉제선 변.
- **가공자↔도메인** 매핑 섹션.

### P4. 에이전트 브로드캐스트 — `Program.cs`
- `_config/config.json`에 **presets(구조화 config)** + **worker_domains** 포함(현재 methods만 추정 → 확장).

### P5. CEP 패널
- 가공자 선택 → `worker_domains`로 도메인 결정 → 그 도메인 **방식·프리셋만** 필터 노출.
- 프리셋 적용 = config 그대로 주입(마크 자동 프리필). 전사 도메인 = 마감 UI 대신 도련/봉제 UI로 전환(전사 가공 실행은 B까지 스텁).

## 4. 후속 (별도 워크스트림)
- **B. 곡선형 전사 가공**: 윤곽(클립패스) 기반 **색·윤곽 스마트 도련**(EdgeColorExtractor 계열) + 봉제선. 사각 bbox 로직과 별개 '전사 가공 모드'.
- **C. 불규칙 네스팅**: SVGnest(deepnest 알고리즘·NFP+유전) 이식. **연산 무거움 → 에이전트(서버 PC)측 실행**, mes-sheet 판짜기 축. CF Worker 요청경로 부적합.

## 5. 리스크·주의
- **프리셋 config 하위호환**: 기존 flat 프리셋(문자열 method)은 CEP applyConfig에서 계속 파싱(마크 없음=미표시). 신규만 구조화.
- **전사 A1 한계**: 프로파일·프리셋은 만들되 **전사 스마트 도련 실가공은 B 의존** → A1 전사는 스캐폴딩 수준(현수막이 즉효).
- **method_group 'sign'**: 기존 CHECK 없으면 값 추가만. (CHECK 있으면 재빌드 불가 주의 — 확인)
- 마이그+코드 동반 배포=한 단위([[project-delivery-system]]).
