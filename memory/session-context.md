# 세션 핸드오프 — IA 세션루프 B단계(연동 강화) 구현·로컬검증 완료, 배포 대기 (2026-07-27 #9)

> durable=[[project-ia-designer-loop]]·spec `2026-07-23-ia-palette-session-loop.md` §3-B·D6·§4.2. **branch `session/ia-b-link`(worktree) 커밋 완료·로컬 e2e 전 구간 통과·prod 미배포(사용자 확인 대기)**. 직전 #8(A0 CEP A1 후반+배치 ingest 수정, deploy `af2dcd54`)은 PROJECT_STATUS·durable로 이관.
> ⚠️ 아래 #4(MMS)·#3(자금관리)는 같은 날 병렬 세션 기록 — 보존.

## 이번 세션 완료 (B단계 범위 5건 전부)
1. **마이그 0477** `designer_intakes.batch_key TEXT`+`idx_designer_intakes_batch_key`+backfill(`memo` `'%#\_%' ESCAPE '\'` → `substr(memo,1,instr(memo,'#_')-1)`). 로컬 적용·backfill 실증(배치행 복원·단건행 NULL 유지). **prod 미적용**.
2. **POST /intakes**: manifest `batch_folder`→`batch_key` 저장(공백/누락=NULL=단독 작업). source_folder 멱등 dedup 보존 확인.
3. **GET /intakes `lite=1`**: eager 썸네일 hydrate 생략, `has_thumbnail`(groups_json LIKE) 플래그만 — [[feedback-r2-thumbnail-marker-leak]] 패턴. **비파라미터 기존 응답은 무변경**(iaEditor.js:360 소비자 비파괴). + **GET /intakes/:id/thumb**(lazy hydrate, entityFilter) 신설.
4. **대기함 트레이 전면 개편**(`src/scripts/orderForm/intake.js` 재작성): 거래처(client_id, free-text는 이름 키)→작업(batch_key, 없으면 memo=단독) 2단 그룹핑 · **"내 작업"**=localStorage user.id↔worker_id(기본=내 waiting 존재 시 ON, 토글은 `ofTrayMyWork` localStorage 기억) · 식별 메타(썸네일 lazy IntersectionObserver·EPS 파일명·순번=memo `#_N` 파싱·크기×수량·가공자·시각·마감/post_desc/돔보/배율) · 체크박스(행/그룹) 선택→[선택 N건 라인으로 불러오기](거래처 미선택+단일 client_id면 상속) · 그룹 [이 작업으로 주문 생성]=selectClient(client_id) 상속+전체 프리필(파일선행 §4.2) · 주문선행=폼 거래처 선택 시 "이 거래처만" 자동 ON(client_id 정확일치, '미지정' 항상 노출=전멸 방지 계승).
5. **absorb**: 기존 라인별 경로(ai_analysis_id→-3 통과 라인 역추적→order_item_id 링크) 유지 + **calc.js:700이 저장된 주문 id를 `ofIntakeAbsorbAll(id)`로 전달**(역추적 범위 축소).

## 로컬 e2e (worktree dev:d1, 시드 6건: batch901×3 worker1/batch902×2 worker8/단건1)
배지(6건·내 작업 4)→트레이(내작업 자동 ON→인투3+미지정1만)→OFF(전체)→[이 작업으로 주문 생성]=거래처 9101 자동선택+3라인(크기·수량·content=키워드·ai_analysis_id·-3·intake 마커·fin_cm)→저장→**absorb 3/3 라인별 order_item_id 정확 매핑**(intake1→oi1·2→2·3→3, order 1)→주문선행(selectClient 9102→"이 거래처만" 자동 ON·혜윰 2+미지정만)→그룹 체크→[선택 2건](scale_pct 50→scale_factor 2 환산)→POST /intakes batch_folder 저장+재등록 dup 멱등→lite/non-lite 응답 계약 확인. 콘솔 에러 0. **테스트 데이터 전부 삭제**(intakes·ai_analysis·order 1·cards, 카운트 0 확인).

## ⚠️ 주의사항
- **로컬 마감 select가 비는 건 로컬 `finishing_methods` 0건 artifact** — 주입 코드는 기존과 동일(fin_cm은 주입됨). prod엔 데이터 있음. 회귀 아님.
- **prod 마이그 0477은 `execute --remote --file` 직접**(d1_migrations 트래킹 불일치 — 파일 헤더에도 명시). backfill은 `WHERE batch_key IS NULL`이라 재실행 멱등.
- 마이그 적용→코드 배포 사이에 들어오는 신규 배치 intake는 batch_key NULL → backfill UPDATE 1회 재실행으로 회수 가능(memo 접미 기반).
- 트레이는 lite 목록만 쓰므로 **iaEditor(비-lite)와 응답 계약 분리** — GET /intakes 기본 동작 바꾸지 말 것.
- 로컬 dev 서버(3000)는 이 세션이 **worktree dist로 재기동**(PID는 dev:d1 표준 경로). 메인 체크아웃 dist 서빙으로 되돌리려면 메인에서 `npm run build && npm run dev:d1`.
- prod 대기함 waiting 19건 중 batch501·613 회수분 4건은 실데이터 — 배포 후 트레이에서 batch_key 그룹으로 묶여 보임(backfill 덕).

## 다음 TODO
1. **[사용자 확인 후 배포]** ⓐ prod 마이그: `npx wrangler d1 execute webapp-production --remote --file migrations/0477_intake_batch_key.sql` ⓑ `session/ia-b-link` push→main 병합→`/deploy-verify`(격리 빌드). 배포 후 실가공 1건으로 batch_key·트레이·absorb 자연 확인.
2. worktree 종료: `.\scripts\end-session.ps1 ia-b-link -DeleteBranch` (병합 후).
3. (이월) 판짜기 E2E·하네스 ship:gate 편입·0.5mm 밀림(별건)·D8 확정 시 조직폴더 이동.

## 검증 명령 (PowerShell)
```powershell
npm run verify
node --check src/scripts/orderForm/intake.js
# 배포 후 prod 확인:
npx wrangler d1 execute webapp-production --remote --command "SELECT id, batch_key, worker_id, status FROM designer_intakes ORDER BY id DESC LIMIT 10"
curl.exe -s -o NUL -w "%{http_code}" -A "Mozilla/5.0" https://webapp-9i0.pages.dev/api/workbench/intakes   # 401=정상
```

---

# 세션 핸드오프 — MMS 발송 + 거래처 그룹 + 대량발송 변수 (2026-07-27 #4)

> durable=[[design-mms-send]]·[[design-contact-groups]]. **전부 prod 배포·검증 완료(배포 8회).**
> ⚠️ 아래 #3(자금관리) 핸드오프는 **같은 날 병렬 세션 기록이라 지우지 않고 남겨둠**.

## 배포 상태 (전부 push·배포 완료, `main == origin/main`)
| # | 내용 | main | deploy |
|---|---|---|---|
| 1 | MMS 채널(단건)+카드 시안 발송 | `c34b309b` | `a502727a` |
| 2 | SenderID 빈값 수정(SMS/LMS/MMS 4곳) | `2b3ff474` | `c6433319` |
| 3 | 문자 진단 API `/api/kakao/sms-diag` | `387879cc` | `4ad3a112` |
| 4 | 발신번호 조회 파서 수정 | `a7c1ddec` | `45192267` |
| 5 | 문자 발송결과 조회(GetSMSSendMessage) | `a4c7a4cf` | `b714dfbd` |
| 6 | MMS 대량발송 + 거래처 그룹(마이그 **0476**) | `722657d8` | `a8b6f2b9` |
| 7 | 거래처 팝업 페이징·전체선택 | `d80c3f9f` | `bbef33f1` |
| 8 | 전건실패 오표시 수정 | `fd98d1c1` | `64e3be19` |
| 9 | 수신자별 변수 치환 + 엑셀/CSV 입력 | `4c4dc61e` | `87f5225f` |

**prod 직접 변경**: 마이그 0476(`execute --remote --file`, contact_groups 2테이블) / `settings.mms_bulk_limit=300`(사용자 지시).

## 처리 내용
1. **MMS 발송** — 바로빌 `SendMMSMessage`(ImageFile=base64 직접). 카드 상세 "시안 발송"(R2 썸네일 자동첨부). **실발송 성공**(접수 `BB_3148184311_M_80321201_1`, 110원 차감).
2. **거래처 그룹**(정적) — 그룹 관리 탭 + 대량발송 그룹 선택. 멤버는 참조만 저장.
3. **대량발송 변수** — 기본 9종 자동 + 엑셀 헤더=변수. 미치환 시 발송 차단. `/preview-bulk`.
4. **엑셀 입력** — 붙여넣기(탭/쉼표)·CSV 업로드·헤더 자동 인식.

## ★기존 결함 6건 발견·수정 (전부 이번 세션에서 드러남)
| 결함 | 실제 영향 |
|---|---|
| SMS/LMS SenderID 빈값 | 문자 계열 **실발송이 애초에 불가**(-24005). 알림톡만 2026-06-09에 고쳐져 가려짐 |
| 대량발송 페이로드 계약 불일치 | `receivers[].num`/`content` 문자열 → **대량발송 전건 400 실패**. payroll.js만 정상이라 은폐 |
| 대량발송 변수 미치환 | 승인 템플릿 4종이 전부 변수 사용 → **알림톡 대량발송 사실상 불가** |
| 예약(sndDT) 미전달 | 예약 걸어도 **즉시 발송** |
| 전건 실패가 "완료"로 표시 | 서버 200+status FAILED를 프론트가 성공으로 읽음 |
| 거래처 팝업 100건 잘림 | 3,424곳 중 100곳만 → 그룹 담기 불가 |

## 핵심 판단·이유
- **MMS는 base64 직접(FTP 기각)** — 바로빌 FTP는 동시 1세션이라 팩스와 경합.
- **MMS 상한은 서버 강제** — 프론트 확인창은 API 직접호출을 못 막는다. 100원/건.
- **총액은 '연락처 있는' 인원 기준** — 선택 인원으로 곱하면 과대표시.
- **그룹=정적·자동 스케줄 미도입**(사용자 결정) — 잘못된 내용이 자동으로 나가는 위험 회피.
- **미수금 일괄 파생 신설** — 단건 헬퍼는 거래처당 3쿼리. prod에서 단건과 값 일치 확인.

## ⚠️ 주의사항 (다음 세션이 반드시 알아야 할 것)
- **send-bulk 경계 테스트 금지 조합**: 상한 미만 건수로 테스트하면 **검증을 통과해 실제 발송 경로로 들어간다**(이번에 60건 실행됨 — 가짜 번호·가짜 이미지라 바로빌이 전건 거절해 과금 0원). 테스트는 **상한 초과** 또는 **미치환 변수** 등 400에서 끊기는 경로로만.
- **미수금 0원은 정상일 수 있다** — 파생은 청구 법인(entityFilter) 기준. 내부법인 3사가 대표적. DB 원본과 다르다고 버그로 오인 말 것.
- **발신번호 = `01043001972`**(2026-07-27 사용자가 바로빌 등록). 미등록 번호면 `-10192`. 알림톡은 채널 발송이라 이 제도와 무관.
- **알림톡은 승인 본문과 글자 단위 일치** — 템플릿 본문을 임의 수정하면 거부. `#{}` 자리만 치환 가능.
- **prod에 사용자 생성 그룹 "간판"(멤버 0) 존재** — 지우지 말 것.
- 로컬 D1에 테스트용 `settings`(kakao_sender_num·kakao_enabled·company_business_registration_number) 잔존. 로컬 전용.
- 로컬 dev 서버(3000)는 이 세션에서 재기동함(원래 내려가 있었음).

## 다음 세션 TODO
1. **수신거부(opt-out) 관리** — 광고성 발송 시 `(광고)` 표기·무료 수신거부·야간 제한. 현재 필드 없음. 판촉 본격 사용 전 필수.
2. **알림톡 대량발송 실검증** — 변수 치환은 됐지만 승인 템플릿 선택 → 실제 1건 발송은 미검증(7원).
3. **MMS 이미지 규격 경계 실측** — 현 상한(300KB·1000px·JPG)은 추정치. 성공 발송은 32KB 1건뿐.
4. `SendState` 값 의미 미확정(성공 건이 4분 후에도 `1`). 과금 확인은 파트너 잔액 차감이 확실.
5. "간판" 그룹 멤버 채우기(운영 작업).
6. (보류) 자동 스케줄 발송 — 몇 번 써본 뒤 반복 확실한 것만.

---

# 세션 핸드오프 — 자금관리 UX 개선 + 자동매칭 재설계 (2026-07-27 #3)

> 세션별 덮어쓰기 파일. durable=[[project-bank-fund-expansion]]·[[reference-shift-range-select]]·[[feedback-client-role-gate]].
> **전부 prod 배포·검증 완료. 배포 4회 + 사고수습 2회.**

## 배포 상태
| # | 내용 | main | deploy |
|---|---|---|---|
| 1 | 자금현황 탭 내부 스크롤 | `32326494` | (2와 동승) |
| 2 | Shift 범위선택 전역 · 사이드바/실적 기본탭 | `7f6afdf2` | `bc70e2e7` |
| 3 | 일괄적용 통합 · 자동매칭 대표자명/표기차이 | `fb02d256` | `bc70e2e7` |
| 4 | 자동매칭 오매칭 차단(괄호 상호) | `b0236293` | `510be05a` |
| 5 | 비용분류 적용경로 흡수 · 운임 규칙 4건 | `7de887c7` | `fb49ad94` |
| 6 | 실적 탭 실종 사고 수정(role 게이트) | `afbfc2f8` | 타 세션 배포에 동승 |

- git: `main == origin/main` (문서 `6f928768`까지 push, 미푸시 0).
- **prod D1 직접 변경 3건** (마이그레이션 파일 아님, `execute --remote --command`):
  - 오탐 제안 197건 되돌리기(UNMATCHED) — 백업=scratchpad `backup-revert-suggestions.json`
  - `bank_match_rules` CONTAINS 규칙 4건 INSERT (용달·운임·택배·화물 → 운반비 id 74/entity 1)

## 처리 내용
1. **자금현황 탭 스크롤** — 타 탭만 스크롤 컨테이너가 있던 비대칭 해소(38vh/42vh, thead sticky 자동).
2. **Shift 범위선택 전역** — `shell.js` document 위임 1곳. 같은 class + 같은 tbody 그룹, 숨김/disabled 제외, 변경분마다 `change` 재발행. 체크박스 목록 전 페이지 자동 적용. → [[reference-shift-range-select]]
3. **사이드바/기본탭** — 자금 관리를 회계 허브 바로 아래로, `/cash-schedule` [실적] 왼쪽·기본 랜딩.
4. **일괄매칭+일괄적용 통합** — 버튼 1개. `learnMatchRule()` 헬퍼를 batch-apply·단건 apply 양쪽 연결.
5. **자동매칭 재설계** — 대표자명·표기차이 대응 → **오탐 발생 → 규칙 정밀화**(아래 판단 참조).
6. **비용분류 적용경로** — `applyExpenseCategory()`로 `/match`·apply·batch-apply 3경로 단일화.
7. **실적 탭 실종 사고** — role 미상을 권한없음으로 처리한 게 원인. fail-open UI + `/auth/me` 복구.

## 핵심 판단·이유
- **매칭/적용 통합**: 두 버튼의 실질 차이는 "규칙 학습 유무"뿐이었고, 적용만 쓰면 학습이 안 되는 갭이 있었음 → 적용 = 사람의 거래처 승인으로 보고 학습까지 수행.
- **자동매칭은 재현율보다 정밀도**: 첫 배포에서 "포함되면 후보" 규칙이 오탐 대량 발생(`대진`⊂`대진국기사박대혁`). 유일성 가드는 단일 오탐을 못 막음 → ①괄호 안 상호가 실제 주체 ②`거래처명 ⊃ 입금자명` 방향만 채택(반대는 폐기) ③대표자명은 괄호 없는 단독 입금 완전일치만. **잃은 정탐은 수동 1회 → 규칙 학습으로 흡수**되므로 손실이 회복되지만, 오탐은 원장을 오염시킨다.
- **적요에 거래처명이 있어도 그 거래처 건이 아닐 수 있다** (사용자 지적: 우드케이용달운임 = 운반비). 방향 폐기 판단의 근거가 됨.
- **role 게이트는 fail-open**: 권한 최종 판정은 서버(401). 판정 실패로 기능이 사라지면 사용자는 원인을 알 수 없고, 서버가 어차피 막으므로 숨겨서 얻는 이득이 없음. → [[feedback-client-role-gate]]
- **중복 배포 안 함**: `afbfc2f8`이 타 세션 `deploy:prod`(워킹트리 전체 빌드)에 동승 반영됨 → 재배포 대신 prod 마커 + 사용자 브라우저 실측으로 검증 책임만 이행.

## ⚠️ 주의사항
- **적용 = 규칙 학습**. 잘못된 거래처로 적용하면 그 적요가 규칙으로 굳어짐 → 매칭 규칙 탭에서 수정/삭제 필요.
- **`화물`·`택배` CONTAINS 규칙**은 상호에 그 단어가 든 거래처와 충돌 가능. 등록 거래처 EXACT가 항상 우선이라 대체로 안전하나, 매입처 중 `○○화물` 상호가 있으면 오분류 관찰 필요.
- **운반비 카테고리는 법인별 별도 id** (entity 1=74, 2=75, 3=76, 99=77). 규칙은 entity 1에만 등록됨.
- **로컬 D1 검증 함정**: `bank_transactions.transaction_date`는 **YYYYMMDD 8자리**. `2026-07-20` 형식으로 시드하면 auto-match lookback 문자열 비교에서 전부 탈락(`total 0`).
- **로컬 재현은 인위적일 수 있음**: 내가 `localStorage.setItem('user', …)`를 해둔 상태라 실적 탭 사고를 로컬에서 못 잡았음. 사용자 화면 이상은 Chrome 확장으로 실제 브라우저를 읽는 게 가장 빠름.
- `npm run build`가 실행 중인 `dev:d1` 서버를 죽일 수 있음(세션 중 1회 발생) → 재기동 필요.

## ✅ 자동매칭 prod 실행 결과 (사용자 실행 후 전수 점검 완료)
| 규칙 | 건수 | 상태 | 점검 |
|---|---|---|---|
| 입금자명 완전일치 | 91 | CONFIRMED | 기존 |
| 표기차이 무시(정규화) | 38 | CONFIRMED | 정확 |
| 상호 표기 일치(신규) | 48 | SUGGESTED | 샘플 12건 전건 정탐 |
| 거래처명 부분일치(정밀화) | 16 | SUGGESTED | **16건 전수 확인·오탐 0** (이전 116건→16건) |
| 대표자명 일치 | 72 | SUGGESTED | **괄호 포함 0건**(규칙대로 단독 입금만) |
| 학습된 규칙(부분일치)→운반비 | 15 | SUGGESTED | 운임 전건 |
| 미매칭 | 330 | UNMATCHED | 정밀도 우선의 정상 잔존 |

- **지적된 오탐 4종 전부 미매칭 정정 확인**: 이성현(무지개기획)·이수정(더플랜디)·한국아이비렌탈·아띠디자인디자인비용. 반면 `무지개광고사`는 완전일치로 정상 CONFIRMED(필요한 매칭은 유지).
- 정탐 예: `이도운(88광고기획`→88광고기획(구미), `성기영(기영광고)`→기영광고기획, `대전광역시옥외광`→사단법인 대전광역시옥외광고협회(은행 표기 잘림), `염진동`→드림광고기획(옥천).
- **규칙 신뢰도 확보** — 후속 세션이 재현율을 이유로 규칙을 다시 느슨하게 만들지 말 것([[project-bank-fund-expansion]] 최종 규칙 참조).

## 다음 세션 TODO / 미결
- **[사용자 액션]** 제안 189건 검토 후 [일괄 적용]. 운임 15건은 비용분류라 원장 영향 없이 운반비 확정.
- 미매칭 330건 = 수동 매칭 대상. 1회 수동 처리 시 규칙 학습되어 다음부터 자동. (적용=학습이므로 오적용 주의)
- `화물`·`택배` CONTAINS 규칙 오분류 관찰(상호에 해당 단어가 든 매입처가 생길 경우).
- `batch-match` 라우트는 UI 진입점 없이 보존 중 — 일정 기간 후 제거 판단.
- 기존 블로커 유지: 품목 단가 전역(매출 base_price·무이력 514·자재비 소진연결) · 간판 BOM.

## 빌드/검증 명령 (PowerShell)
```
npm run verify                          # typecheck + build
node --check src/scripts/bank.js        # ?raw JS 문법
node --check src/scripts/layout/shell.js

# prod 읽기 검증
npx wrangler d1 execute webapp-production --remote --command "SELECT match_reason, match_status, COUNT(*) FROM bank_transactions WHERE match_reason IS NOT NULL GROUP BY 1,2"
curl -s -o $null -w "%{http_code}" -A "Mozilla/5.0" https://webapp-9i0.pages.dev/api/bank/transactions   # 401=정상

# 자동매칭 회귀 검증(로컬): prod 케이스 15건 시드 → auto-match → 오탐 전건 미매칭 확인
#   시드 SQL 형식은 durable 메모리 [[project-bank-fund-expansion]] 참조 (transaction_date=YYYYMMDD)
```
