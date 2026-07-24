# 디자이너 대기함 연동 — 필드 캐리·거래처/담당자 필터 설계 (검토용)

**상태**: 검토·설계 (구현 착수 전 승인 대기). 2026-07-24
**연관**: `2026-07-16-ia-designer-session-loop.md`(§4.4 대기함), `2026-07-23-ia-palette-session-loop.md`(CEP 승격), [[project-ia-designer-loop]]
**트리거**: 디자이너·오퍼레이터 협의 — (1) 거래처+담당자로 **한정 조회**, (2) 가져올 때 **후가공·내용(키워드) 매칭 확인**.

## 0. 현재 상태 감사 (3계층 + 에이전트)

흐름은 정상: 일러 가공 → `Z:\IA-등록\<폴더>\manifest.json` → 에이전트 `POST /api/workbench/intakes`(waiting) → 주문서 대기물 피커 → 라인 흡수(`order_item_id` 연결).

| 계층 | 파일 | 사실 |
|---|---|---|
| 에이전트 | `IllustratorAutomat/Program.cs:1037` | manifest **전체**를 POST(keyword·post_desc 포함). `Abs`가 `files.*` 중첩 읽어 경로 해석 → **단건 CEP manifest 정상**. ⚠️ 스캐너는 `manifest.json`만 봄 → **배치(manifest_N.json) 미처리** |
| 서버 ingest | `workbench.ts:1167` | client_name·qty·measured_cm·scale·mode·finishing·trim·paths·thumb·registered_by·pc_name만 **독취**. keyword·post_desc·punch·worker **미독취 → 유실** |
| 스키마 | `migrations/0463` | `finishing_json`만. keyword·post_processing·punch·worker 컬럼 **없음** |
| 피커 | `intake.js` | 크기·수량·배율·마감·썸네일·파일경로 **매핑✓**. content·후가공 **미설정**. 거래처 필터 **2026-07-17 제거**(전체 waiting·썸네일 식별) |

### 유실 근본원인
`designer_intakes`(0463)·ingest는 **구 mes-core.jsx manifest 기준**. CEP 패널이 추가한 필드(keyword·post_desc·펀칭·마감마크·worker)가 스키마에 없어 **ingest에서 폐기**.

## 1. 필드 캐리 매핑 (CEP manifest → intake → 주문 라인)

| CEP manifest | intake 컬럼 | 주문 라인 | 상태 |
|---|---|---|---|
| client_name | client_name | 거래처(상속) | ✓ |
| **worker_name / worker_id** | **worker_name / worker_id (신규)** | 담당자 필터 | ✗→추가 |
| qty | qty | quantity | ✓ |
| measured_cm.w/h | width_cm/height_cm | width/height | ✓ |
| scale_pct | scale_pct | scale_factor | ✓ |
| mode | mode | 라인 성격 | ✓ |
| finishing{side,_cm,_mark} | finishing_json | fin_*/fin_cm_* | ✓ (마크 미반영) |
| trim | trim | 돔보 | ✓ |
| **keyword** | **keyword (신규)** | **content_(내용)** | ✗→추가(직결 쉬움) |
| **post_desc** | **post_desc (신규)** | 내용 보조 / 힌트 | ✗→추가 |
| **punch** | **punch_json (신규)** | 후가공 힌트 | ✗→추가 |
| files.* | work_ai_path/eps_path | direct_file_path | ✓ |
| thumb.png | thumb_base64→R2 | 썸네일 | ✓ |
| source_folder | memo(멱등키) | — | ✓ |

## 2. 핵심 설계 결정 (검토 필요)

### D1. 후가공 매핑 방식 ★
주문서 후가공 = `loadItemPP(id, subcat)`로 **품목 선택 시 로드되는 구조화 PP 체크박스**(품목 소분류 의존). CEP `post_desc`는 자유문자열("양옆접어미싱+사방펀칭"). **1:1 자동 체크 불가.**
- **(가) 힌트만(권장·안전)**: post_desc·punch를 **내용 보조 텍스트/피커 표기**로 노출 → 오퍼레이터가 품목 선택 후 구조 PP 확정. 오매핑 0.
- (나) 토큰 자동매칭: 품목 로드 후 post_desc 토큰↔PP명 fuzzy 체크. 불안정·품목 선행 필요.
- (다) content에 합치기: 내용 = `키워드 · post_desc`.

### D2. 거래처 필터 복원 여부 ★
2026-07-17에 **의도적으로 제거**(디자이너가 거래처 미입력 잦음→필터 시 전멸, 썸네일 식별로 전환). 다시 넣으면 같은 리스크.
- (가) 담당자 필터만(권장): 거래처는 자유입력이라 신뢰 낮음. 담당자(가공자)로 한정.
- (나) 거래처+담당자 둘 다: 단, 거래처 미입력('미지정') 건은 항상 보이게 폴백.
- (다) 서버는 이미 `client` param 지원 → UI 토글만 복원.

### D3. 담당자(worker) 정의·매핑
worker = CEP 가공자 드롭다운(인호동·김보연·정소은·김영주). 현재 `worker_id`=null(MES user 매핑 미구현). 
- 1차: `worker_name` 문자열로 저장·필터(단순, 즉효).
- 2차(후속): worker_name→MES user_id 매핑(“내 작업”=로그인 유저).

### D4. 마감 마크(fold/cut) 반영
CEP finishing에 `side_mark` 포함 → `finishing_json`에 이미 실림. 주문서 마감 UI엔 마크 개념 없음 → **intake엔 보존, 주문 라인 미반영**(정보 손실 아님, 작업지시서엔 이미 EPS에 그려짐). 유지.

## 3. 구현 계획 (계층별)

### P1. 스키마 — `migrations/0465_intake_field_carry.sql`
```sql
ALTER TABLE designer_intakes ADD COLUMN keyword TEXT;
ALTER TABLE designer_intakes ADD COLUMN post_desc TEXT;
ALTER TABLE designer_intakes ADD COLUMN punch_json TEXT;
ALTER TABLE designer_intakes ADD COLUMN worker_name TEXT;
ALTER TABLE designer_intakes ADD COLUMN worker_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_designer_intakes_worker ON designer_intakes(worker_name);
```
(ALTER 멱등 주의 — [[feedback-migration-idempotency]]. 신규는 execute --file 직접 적용)

### P2. ingest — `workbench.ts POST /intakes`
- body에서 keyword·post_desc·punch·worker_name·worker_id 독취 → INSERT 컬럼 추가.
- 하위호환: mes-core manifest(해당 필드 없음)는 NULL로 무해.

### P3. 피커 — `intake.js`
- `ofIntakePick`: `content_${id}` = keyword (D1-다면 `키워드 · post_desc`). 후가공 힌트 표기(D1-가).
- 목록: 담당자 필터(+D2에 따라 거래처). GET `/intakes`에 `worker` param 추가.
- 배지/피커 행에 담당자·키워드 표기.

### P4. 서버 목록 — `workbench.ts GET /intakes`
- `worker` param → `worker_name LIKE`. (client param은 이미 있음)

### P5. 에이전트 — `Program.cs`
- **배치 폴더 스캔**: `manifest.json` 외 `manifest_*.json`도 처리(각각 ingest). `.ingested` 마커를 파일별로.
- 단건은 무변경(이미 정상).

## 4. 리스크·주의
- **하위호환**: 구 mes-core manifest·기존 intake 행은 신규 컬럼 NULL → 무해.
- **entity_id**: ingest는 `body.entity_id || 세션` (전체모드 400). CEP manifest `entity_id:1` 고정 → 확인.
- **멱등**: `memo=source_folder` 재등록 가드 유지. 배치는 폴더 공유이므로 **source_folder에 batch_index 포함** 필요(안 그러면 첫 건만 등록되고 중복 판정). ⚠️ P5에서 `source_folder = folder + '#' + N` 형태로.
- **worker_id**: 지금 null 허용, 후속 매핑.
- **마이그 동반 push=한 단위**([[project-delivery-system]] 교훈).

## 5. 착수 순서 (승인 후)
1. D1~D3 결정 확정.
2. P1 마이그 로컬 선검증 → P2·P4 서버 → P3 피커 → P5 에이전트.
3. 로컬 E2E(가공→ingest→피커→흡수)에서 keyword·후가공 힌트·담당자 필터 확인 후 배포.
