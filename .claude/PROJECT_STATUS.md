# PROJECT_STATUS.md — 프로젝트 현황판

> **최종 업데이트**: 2026-05-15

---

## 🔒 편집 중 (충돌 방지)

- (없음)

---

## 🔴 현재 진행 중

- (없음)

---

## 🟡 대기 중

### [Open Issues 10건] — #47~#56
- #47 XSS 8건, #48 카드 상태 불일치, #49 N+1 caps + 인덱스, #50 로딩 상태 30페이지
- #51~#56 자율점검 발견 (출고취소 복구, 비원자 전환, HR 삭제, 세금계산서 FK 등)
### [배송 관리 최적화] — 출고 대기 보드
- 배송방법별 그룹화 + 마감시간 카운트다운 + 일괄 출고 + 카카오톡 자동 발송
- 용준님 방향 결정 대기
### [결재 시스템 업무 연계] — 유형 세팅 완료, 자동 생성 미연결
- 휴가/발주 등에서 결재 자동 생성 연결 필요
### [기존 계약 일괄 등록] — 엑셀 import 스크립트 제공 대기
### [UI/UX 롤아웃 잔여] — Input Group 실적용
### [라벨 프린터 인쇄] — 프린터 모델 확인 필요 (외부 의존)
### [RIP 전송] — 코드 완료, 현장 테스트 대기 (외부 의존)
### [LogWatcher PrintExp] — 구현 완료, 현장 배포 대기 (외부 의존)
### [한진택배 자동화] — 솔루션 선정 대기 (사용자 결정 필요)
### [범용 LogWatcher] — Phase 1+2 완료, Phase 3~5 대기

---

## 🟢 최근 완료 (2026-05-14~15, 13커밋)

### GitHub Issues #37~#46 전량 처리 (10건 closed)
- **#37~#39**: N+1 쿼리 제거 + SELECT * 명시 컬럼 전환
- **#41**: 대시보드 KPI 미수금·수금률 → /receivables 클릭 연결
- **#42**: 근로계약 부서 필터 + 만료 임박 30일
- **#44**: 작업 큐 사이드바 등록 + limit 500 + 권한
- **#45**: 납기분석·재무보고서 CSV 내보내기
- **#40**: hrDetail 근로계약 섹션 (목록 + 신규 작성)
- **#43**: 결재 5유형 연결 + 검색/필터/페이지네이션
- **#46**: 장비 가동시간 KPI (print_duration_sec 기반)

### E2E 전면 수정 → 31개 전체 통과
- clients bank_info/entity_id 미존재 컬럼 → 500 에러 근본 수정 (6개 라우트)
- SHIPPED 전이 requires_confirmation 핸들링

### 대시보드 법인별 분리
- 카드(requesting_entity_id), 수금(payments), 발주(purchase_orders) 필터 추가
- 미수금: clients.balance → 주문 청구액-수금액 기반 변경
- 브라우저 캐시: Vary: Authorization 헤더로 법인 전환 즉시 반영

### 유통 주문서 레이아웃 통일
- 배송정보 별도 섹션 제거 → 기본정보 통합 (납품시간 추가)

### 종합 감사 + 보안 수정
- **entity 필터 33건 누락 수정** (10개 라우트 파일)
- **프론트 권한 3건 수정** (/price-list 키, /tasks 스키마, 포탈 링크)
- **보안 HIGH 5건**: 인증 우회 차단, XSS 차단, requireRole 추가, PII 노출 제거, 인덱스 4건

---

## 🟢 이전 완료 (2026-05-14, 14커밋)

### CAPS 멀티사이트 지원 (대전 DJ + 선명 SM)
- **caps_sites 테이블**: 사이트별 릴레이 DB/API키/동기화 설정 독립 관리
- **caps_employee_map UNIQUE 변경**: `(caps_e_idno)` → `(site_id, caps_e_idno)` — fpid 충돌 해소
- **employees 테이블**: `caps_site_id` 컬럼 추가, UNIQUE 인덱스 `(caps_site_id, caps_id)` 복합으로 변경
- **attendance 테이블**: `caps_site_id` 추가 (출처 추적)
- **caps.ts 전면 재작성**: 사이트별 인증(`verifyAgentKey`), ingest, 매핑, 무시, 로그
- **capsSettings.js**: 사이트 카드 선택 UI, 사이트별 설정/로그 (사원 매핑 섹션 제거 → 직원 상세에서 관리)
- **caps-worker**: `SITE_ID` 환경변수 추가, ingest/pending에 site_id 전달
- **선명 PC 워커 설치 완료**: 수동 실행 테스트 통과

### GitHub Issues #35/#36 해결
- **#36**: 라우트 4개 try-catch 래핑 (permissions/finishing/messageTemplates/iaAuto)
- **#35**: 대시보드 E2E 테스트 3개 추가 (stats 응답, 서브엔드포인트 6개, 페이지 로드+KPI)

### CI/CD 수정
- **GitHub Actions Node 20→22**: wrangler/miniflare >= 22 요구에 대응
- **package-lock.json 재생성**: npm ci 호환성 복구, CI 전체 통과 확인

### 명칭 변경
- **동산현수막 → 동산기획**: 소스 43파일 + 메모리 + DB settings 일괄 치환 (migrations 제외)

### HR 상세 페이지 수정
- **고정연장 시급 연동**: OT ON=÷225.5, OT OFF=÷209 — 시급 필드도 토글 시 즉시 갱신
- **caps_site_id 드롭다운**: 사원 등록/상세 양쪽에 CAPS 사이트(DJ/SM) 선택 추가
- **caps_id UNIQUE 충돌 해결**: 단일 컬럼 → `(caps_site_id, caps_id)` 복합 인덱스

## 🟢 이전 완료 (2026-05-14, 이전 세션)

- **근로계약서 관리 시스템 전체 구축**:
  - DB(0195~0198), API 7개, 관리 페이지, 캔버스 서명, 검색 드롭다운
  - 근로계약서 HTML 템플릿 (법인별 자동, 명조체 공문서 스타일)
  - 재직증명서 + 간이 인증 (사번+생년월일) + 만료 알림
  - 급여 연동: 기본급 ÷ 225.5/209 자동 역산, 고정연장 체크박스
  - 부서 8개 + 직위 8단계 체계 정비
- **보안 수정** (#32~#34): 보안 헤더 3종, rate limit, XSS escapeHtml 39개소
- **rip.ts 프로덕션 스키마 수정**: equipment_presets 컬럼 불일치 해결

## 🟢 이전 완료 (2026-05-13, 30커밋)

- **GitHub Issues 17건 전량 closed (#15~#31, open 0건)**:
  - N+1 쿼리 10파일 batch/IN절, as any 902→45 (95%), SELECT * 151→6 (96%)
  - entity_id 10테이블 마이그레이션, 스모크 55→88 엔드포인트
  - UX: 출고→계산서 링크, 주문→카드 버튼, 원단 필터
  - 대시보드 재설계: KPI 클릭 연결 7개, 납기 준수율 KPI, 생산 파이프라인, 위젯 축소
  - shipment_items UNIQUE 제약 추가 (중복 출고 방지)
  - 프로덕션 배포 7회

> 전체 아카이브: `.claude/PROJECT_STATUS_ARCHIVE.md`
