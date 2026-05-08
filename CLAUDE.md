# CLAUDE.md

## 사용자 선호사항 (용준님)

### 작업 원칙
- **추론 먼저, 실행 나중**: 요청→추론("왜?"→"진짜 목적?"→"연쇄 영향?")→"제가 이해한 바" 요약→확인. 신규 기능·구조 변경 시 brainstorming 스킬 먼저.
- **작업 전 확인 필수**: 되돌리기 어려운 작업은 사용자 확인. 임의 진행 금지.
- **100% 이해 후 진행**: 추측 진행 금지. 질문으로 확인.
- **모호→즉시 질문**: 범위 불분명/2가지 해석/영향 불확실 → "제가 이해한 게 맞는지" + bullet 3~5개 + 가/나/다 선택지.
- **feature→verify→next**: 기능 완료→검증(`npm run build && npm run smoke`)→다음 착수.
- **타입 체크 필수**: 백엔드→`npm run verify`, 전체→`npm run build && npm run smoke`.
- **subagent dispatch**: typecheck 포함 의무화. 라우트 수정 시 stats/count/badge 포함.
- **신규 페이지→권한 등록**: `permission_pages` INSERT + `requirePagePermission`.

### 세션 종료 시 필수
PowerShell 빌드/검증 명령 + 다음 세션 TODO + `memory/session-context.md` 덮어쓰기 (결정+이유, 판단기준, 주의사항)

### 대화 스타일 & 환경
- 한국어 대화, 코드/명령어 영어. 존댓말 + 간결. 반복 금지.
- OS: Windows, PowerShell | IDE: VS Code + Claude Code | 경로: `C:\Users\user\dongsan_mes`
- 세션 시작 시 `.claude/PROJECT_STATUS.md` 읽기 (MEMORY.md는 auto-memory 자동 로드)
- 작업 시작/완료/차단 시 PROJECT_STATUS.md 업데이트

# 동산현수막 ERP+MES 프로젝트

## 기술 스택
- **Runtime**: Cloudflare Workers (Hono 4.x) | **DB**: D1 (SQLite) `c.env.DB` | **Build**: Vite 5.x
- **Frontend**: Vanilla JS + Tailwind CSS (CDN) + Axios | **Auth**: JWT | **TS**: 5.7

## 개발 명령어
```bash
npm run dev:d1            # 로컬 서버 (D1, 192.168.0.94:3000)
npm run build             # Vite 빌드 → dist/
npm run verify            # typecheck + build
npm run deploy            # 스테이징 배포
npm run deploy:prod       # 프로덕션 배포
npm run db:migrate:local  # 로컬 D1 마이그레이션
npm run db:reset          # DB 초기화
```
> ⚠️ `dev:d1`은 `dist/`를 서빙. 코드 수정 시 반드시 `npm run build` 먼저.

## 알려진 함정 (Critical)
### Template Literal 이스케이프 (`src/layout.ts`)
`layout.ts`는 백틱 템플릿. onclick에서 `\'` → 그냥 `'` 출력됨. 반드시 `\\'` 사용.
```js
// ❌ onclick="func(\'' + val + '\')"
// ✅ onclick="func(\\'' + val + '\\')"
```
`src/scripts/*.js`는 `?raw` import이므로 이 문제 없음.

### HTML↔JS Silent Fail 방지
`?raw` import된 JS의 `getElementById` 대상 ID가 변경되면 silent fail.
```js
var el = document.getElementById('someId');
if (!el) { console.warn('[pageName] #someId not found'); return; }
```
**pages/*.ts 변경 시 scripts/*.js getElementById 참조 대조** (review-checklist §12).

> 사업 도메인·역할·아키텍처·에이전트 팀·참조 문서 → `.claude/references/project-context.md`
> **단일 소스 원칙**: 참조 파일에 코드 값 복사 금지. 구조 변경 시 참조 파일도 동기 업데이트.
