# 세션 컨텍스트 (2026-07-13 #2) — 바로빌 신한은행 계좌 등록 점검·매핑 수정

> 세션별 덮어쓰기 파일. 직전(07-13 #1 IA 잡 crash·temp 하드닝) 내용은 auto-memory [[project-ia-editor]]·PROJECT_STATUS 참조.
> **이 세션 정본 = auto-memory [[project-barobill-account-card-registration]] (2026-07-13 엔트리) + 이 파일.**

## 이 세션에서 한 것
"신한은행 바로빌 등록 안 됨" 점검 → **원인=은행코드 매핑 누락**, 1줄 수정·prod 배포. 이후 −50217/−50218 후속 점검(코드 무결 확인).

### 수정·배포 (main `c7b76a05`, 마이그 없음)
- **`src/constants/barobillCodes.ts:32`** `MES_TO_BAROBILL_BANK`에 `'0088': 'SHINHAN'` 1줄 추가.
- **원인**: 프론트 드롭다운(`pages/bank.ts:378`)엔 신한(0088)이 선택지로 있으나 백엔드 매핑엔 없어 `toBarobillBank('0088')=null` → 라우트(`routes/bank.ts:187-189`)가 "바로빌 미지원" 400 반환. 카드사 맵엔 `'신한':'SHINHAN'`이 이미 있었음(은행 맵만 초기 커밋 `704f9070`부터 누락 — 의도적 제외 아님).
- **배포**: verify green → 커밋 → `git push origin main`(push-first) → `npm run deploy:prod`(`--branch main`, dep `c6b3d396`) → apex `/api/bank/stats` 401 확인. ⚠️배포 시점 워킹트리 clean 확인함(타 세션 WIP 없음).

### 실등록 후속 점검 (사용자 실측 −50217/−50218)
- 신한 실등록 → **−50217**(빠른조회 아이디 잘못). 국민 실등록 → **−50217**, ID 입력 시 **−50218**("입력하지 않아야"). 사용자 "어느 장단" + "코드 자체 문제" 제기.
- **4계층 전수 점검 결과 = 구조적 코드 버그 없음**(증거 확보):
  1. 은행코드 매핑: KB=`0004→KB`·신한=`0088→SHINHAN` 정상.
  2. 프론트 body 키 ↔ 라우트 destructuring: `web_id/web_pwd/account_password/identity_num` **양측 동일**(키 불일치 없음 → 빈값 오전송 아님). `scripts/bank.js:1113-1126` ↔ `routes/bank.ts:165-169`.
  3. 라우트 → service 파라미터 전달 정상.
  4. **SOAP 봉투 파라미터 순서/구성 = WSDL(`ws.baroservice.com/BANKACCOUNT.asmx?WSDL`) 실측과 1:1 일치**. RegistBankAccountEx=CERTKEY,CorpNum,CollectCycle,Bank,BankAccountType,BankAccountNum,BankAccountPwd,WebId,WebPwd,IdentityNum,ForeignCurrencyCodes,Alias,(Usage). `ID`(담당자)는 RegistBankAccountEx엔 **없음**(누락 아님, RefreshBankAccount만 ID 필요).
  - 실제 코드가 만드는 SOAP 봉투를 재현(scratchpad/envgen.mjs) → 빈 필드 `<WebId></WebId>` 정상 직렬화 확인.
- **결론**: −50217/−50218은 바로빌이 값을 받아 **은행에 실조회한 결과**(파싱도 정상). 은행별 인증방식 차이 문제이지 송신 코드 결함 아님.

## 은행별 인증방식 (핵심 지식)
| 방식 | 채움 | 비움 | 해당 |
|------|------|------|------|
| 계좌비밀번호형 | 계좌비밀번호 + 예금주식별번호(사업자번호) | 빠른조회 ID/PW | **국민**(−50218 증거) |
| 빠른조회(간편조회)형 | 빠른조회 전용 ID/PW | 계좌비밀번호 | **신한**(−50217) |
- 전제: 각 은행 인터넷뱅킹에서 **빠른조회/간편조회 서비스에 해당 계좌 사전등록** 필요. 미등록이면 어떤 값도 실패(−50217/−50226).
- 국민 올바른 입력 = 빠른조회 ID/PW **비움** + 계좌비밀번호 + 예금주식별번호=사업자번호.

## 판단기준 / 주의사항
- 코드 무결은 정적으로 확정. **100% 종결하려면 프로덕션 실요청/실응답 물증 필요**(현재 미확보). 제안=안전 진단 로그(비번·ID 값 미로그, **은행코드 + 필드존재 boolean + 원시 응답코드만**) 추가·배포 → 사용자 KB 1회 재시도 → Cloudflare observability 로그 판독. **사용자 승인 대기 중**(미착수).
- 다음에 이 로그 넣으면: `routes/bank.ts` registBankAccount 호출 전후 `console.log('[barobill-regist] bank=%s type=%s hasPwd=%s hasWebId=%s hasWebPwd=%s identityLen=%d → raw=%d', ...)`. **값(비번/ID) 절대 로그 금지**(인증정보 비저장 원칙).

## 다음 세션 TODO
- (사용자 결정 대기) 진단 로그 추가·배포 여부 — "코드 문제 아님"을 물증으로 종결하거나, 예상 밖 값이면 잡아냄.
- (운영) 신한=빠른조회 서비스 신청+전용 ID / 국민=계좌 빠른조회 사전등록 후 정확 입력으로 재시도.
- (선택 개선, 사용자 보류) 은행 선택 시 계좌비밀번호형/빠른조회형 자동 안내 + 안 쓰는 칸 비활성화 — 바로빌 은행별 필수항목표 확보 시.

## 배포 검증 명령 (PowerShell)
```powershell
npm run verify                    # tsc + vite (green)
npm run deploy:prod               # build + wrangler --branch main (적용 완료, dep c6b3d396)
# prod: https://webapp-9i0.pages.dev  (apex /api/bank/stats 401 = 정상)
```
