# 메시지 시스템 전면 개편 설계

> 승인일: 2026-04-17
> 범위: `/kakao` → `/messages` 통합, 4채널 지원, 대량 발송, 템플릿 관리, 설정 이전

---

## 1. 목표

현재 카카오톡+SMS 전용인 `/kakao` 페이지를 4채널(카카오톡/SMS/이메일/팩스) 통합 메시지 관리 시스템으로 개편한다. 설정은 `/settings`로 이동하고, 발송 UI를 현대적으로 개선한다.

## 2. 페이지 구조 변경

### Before
- `/kakao` — 3탭(발송 이력, 템플릿 관리, 설정)
- `/settings` — 4탭(회사, 원가, 창고, CAPS)

### After
- `/messages` — 3탭(발송 이력, 대량 발송, 템플릿 관리) + 상단 개별 발송 버튼
- `/settings` — 5탭(회사, 원가, 창고, CAPS, **메시지**)

사이드바에서 "메시지 관리" 메뉴의 URL을 `/kakao` → `/messages`로 변경한다.

## 3. /messages 페이지 상세

### 3.1 상단 영역

- 요약 카드 4개 유지 (카카오톡 상태, 오늘 발송, 발송 단가, 잔여 포인트)
- **"새 발송" 버튼** — 클릭 시 개별 발송 모달 열림

### 3.2 탭 1: 발송 이력

- 전체 채널(kakao, sms, email, fax) 통합 로그 표시
- 필터: 채널 필터(전체/카카오톡/문자/이메일/팩스), 상태 필터, 유형 필터
- 검색: 수신자명/전화번호
- 페이지네이션 (30건/페이지)
- 각 행에 상세 보기 버튼 (기존 viewLogDetail 유지)
- 데이터 소스: `kakao_send_logs` 테이블 (channel 컬럼으로 구분)

### 3.3 탭 2: 대량 발송

한 화면에 세로 섹션 나열 방식:

**섹션 1 — 발송 채널**
- pill 버튼: 카카오톡 / SMS / 이메일 / 팩스
- 팩스는 "준비 중" 표시, 선택 불가
- 채널 선택에 따라 하위 섹션 UI 변경 (카카오톡 → 템플릿 필수, SMS → byte 카운터, 이메일 → 제목 필드)

**섹션 2 — 수신자**
- pill 버튼: 직원 전체 / 거래처 전체 / 직접 입력
- 직원 전체 선택 시: `users` 테이블에서 phone/email 있는 직원 자동 선택, "N명 선택됨" 표시
- 거래처 전체 선택 시: `clients` 테이블에서 연락처 있는 거래처 자동 선택
- 직접 입력 시: textarea에 "번호,이름" 또는 "이메일,이름" 줄바꿈 구분
- 채널에 따라 필요한 연락처 필드가 다름 (SMS→phone, email→email, fax→fax)
- 연락처 없는 수신자는 자동 제외, 제외 건수 표시

**섹션 3 — 내용 작성**
- 카카오톡: 템플릿 드롭다운(승인된 것만) + 본문 textarea (템플릿 선택 시 자동 채움)
- SMS/LMS: 본문 textarea + byte 카운터 (90byte 초과 시 LMS 자동 전환 안내)
- 이메일: 제목 input + 본문 textarea
- 팩스: 제목 input + 본문 textarea (비활성)

**발송 버튼**
- "N명에게 카카오톡 발송" 형태로 채널명+수신자수 표시
- 클릭 시 확인 다이얼로그 (showConfirm)
- 발송 후 결과 토스트 + 발송 이력 탭으로 자동 전환

### 3.4 탭 3: 템플릿 관리

채널별 서브탭 방식:

**카카오톡 서브탭 (읽기전용)**
- 팝빌 API에서 가져온 템플릿 카드 리스트
- 각 카드: 템플릿명, 코드, 상태 뱃지(승인/검수중/반려), 본문 미리보기, 버튼 정보
- "새로고침" 버튼으로 팝빌에서 재조회
- 하단 안내: "카카오톡 템플릿은 팝빌 사이트에서 등록/수정합니다"

**문자 서브탭**
- 자체 템플릿 카드 리스트 + "새 템플릿" 버튼
- 각 카드: 템플릿명, 내용 미리보기, 편집/삭제 버튼
- 편집 모달: 이름, 내용 textarea + byte 카운터

**이메일 서브탭**
- 자체 템플릿 카드 리스트 + "새 템플릿" 버튼
- 각 카드: 템플릿명, 제목, 내용 미리보기, 편집/삭제 버튼
- 편집 모달: 이름, 제목, 내용 textarea

**팩스 서브탭**
- "팩스 기능 준비 중" 안내 표시

### 3.5 개별 발송 모달 (미리보기형)

기존 `window.openSendMessage()` (layout.ts) 모달을 대체:

**왼쪽 패널 (입력)**
- 채널 pill 선택 (카카오톡/SMS/이메일/팩스)
- 수신자: 이름 + 연락처 (채널에 따라 전화번호/이메일/팩스번호)
- 템플릿 드롭다운 (해당 채널의 DB/팝빌 템플릿)
- 내용 textarea
- 발신 정보 표시
- 취소/발송 버튼

**오른쪽 패널 (미리보기)**
- 채널별 미리보기 렌더링:
  - 카카오톡: 노란 말풍선 안에 메시지 + 버튼
  - SMS: 휴대폰 메시지 스타일
  - 이메일: 이메일 레이아웃 (제목 + 본문)
  - 팩스: 팩스 용지 스타일
- 입력 내용 변경 시 실시간 반영

**호출 방식**
- `/messages` 페이지의 "새 발송" 버튼
- 다른 페이지(출고, 원장, 급여 등)의 📨 버튼 → `window.openSendMessage(opts)` 유지
- opts 인터페이스 변경 없음 (receiver, context, defaultChannel, defaultContent, autoTemplate)

## 4. /settings 메시지 탭

기존 `/kakao` 설정 탭 내용을 이동:

**팝빌 연동 상태**
- 연결 상태 확인 (✅/❌ + 잔여 포인트 + 등록 템플릿 수)
- "연결 확인" 버튼

**카카오톡/SMS 설정**
- 발송 활성화 토글
- 발신번호
- 카카오 채널 ID
- 대체문자 설정 (미발송/카카오톡 동일/별도 내용)

**이메일 설정**
- 발송 활성화 토글
- 발신자명 (email_from_name)
- 발신 이메일 (email_from_address)

**팩스 설정**
- "준비 중" 안내

## 5. DB 변경

### 새 테이블: `message_templates`

```sql
CREATE TABLE message_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT NOT NULL,          -- 'sms', 'email', 'fax'
  name TEXT NOT NULL,             -- 템플릿 이름
  subject TEXT,                   -- 제목 (이메일/팩스용)
  content TEXT NOT NULL,          -- 본문
  created_by INTEGER,             -- users.id
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

카카오톡 템플릿은 팝빌 API에서 가져오므로 DB에 저장하지 않는다.

### 기존 테이블 변경 없음
- `kakao_send_logs`는 이미 `channel` 컬럼이 있음 (0140 마이그레이션)
- `email_logs` 테이블은 기존 유지하되, 통합 로그는 `kakao_send_logs`에서 조회

## 6. API 변경

### 새 API
- `GET /api/message-templates` — 채널별 템플릿 목록 조회 (query: channel)
- `POST /api/message-templates` — 템플릿 생성
- `PATCH /api/message-templates/:id` — 템플릿 수정
- `DELETE /api/message-templates/:id` — 템플릿 삭제

### 기존 API 유지
- `POST /api/messages/send` — 통합 발송 (개별) — 기존 유지
- `POST /api/messages/send-bulk` — 통합 대량 발송 — 기존 유지, 이메일 채널 추가
- `GET /api/kakao/templates` — 팝빌 템플릿 조회 — 기존 유지
- `GET /api/kakao/balance` — 잔액 조회 — 기존 유지
- `GET /api/kakao/settings` / `PATCH /api/kakao/settings` — 기존 유지
- `GET /api/kakao/logs` — 기존 유지 (채널 필터 파라미터 추가)

### 수정 API
- `GET /api/kakao/logs` — `channel` 쿼리 파라미터 추가
- `POST /api/messages/send-bulk` — 이메일 대량 발송 지원 추가

## 7. 파일 변경 계획

### 삭제
- `src/pages/kakao.ts` — `/messages` 페이지로 대체
- `src/scripts/kakao.js` — `/messages` 스크립트로 대체

### 신규
- `src/pages/messages.ts` — 통합 메시지 페이지
- `src/scripts/messages.js` — 통합 메시지 스크립트
- `src/routes/messageTemplates.ts` — 템플릿 CRUD API
- `migrations/0150_message_templates.sql` — 템플릿 테이블

### 수정
- `src/index.tsx` — 라우트 등록 변경 (/kakao → /messages, 템플릿 API 추가)
- `src/pages/settings.ts` — 메시지 탭 HTML 추가
- `src/scripts/settings.js` — 메시지 탭 로직 추가
- `src/layout.ts` — 사이드바 메뉴 URL 변경, openSendMessage 모달 UI 개편 (미리보기형)
- `src/routes/kakao.ts` — logs 엔드포인트에 channel 필터 추가
- `src/routes/messages.ts` — send-bulk에 이메일 지원 추가

## 8. 팩스 기능

UI에는 팩스 채널이 포함되지만, 실제 발송은 "준비 중" 상태를 유지한다. 팩스 서비스 구현은 별도 작업으로 분리한다.

## 9. 범위 외

- 팩스 발송 구현 (팝빌 팩스 API 연동)
- 이메일 HTML 에디터 (텍스트 기반 유지)
- 발송 예약 기능
- 수신자 그룹 관리 (직원 전체/거래처 전체/직접 입력만)
