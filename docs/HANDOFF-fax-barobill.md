# HANDOFF — 바로빌 팩스 (서버 직접 FTP, 에이전트 없음)

## 구조
바로빌 FAX는 `SendFaxFromFTP`만 지원(FTP 업로드 후 발송). MES 서버(Cloudflare Workers)가 **`cloudflare:sockets` raw TCP로 바로빌 FTP에 직접 업로드**한 뒤 발송. **온프렘 에이전트·큐·폴링 전부 없음.**
```
브라우저 PDF(html2pdf) → POST /api/fax/send
  → 서버: base64 디코드 → 바로빌 FTP STOR(root) → SendFaxFromFTP → kakao_send_logs → 결과 동기 반환
브라우저: 발송완료/실패 토스트 (폴링 없음)
```
(팝빌 폐기. 일러 PC 에이전트 미사용 — 팩스 코드 전부 서버/프론트.)

## 구현 (코드 — 완료)
- `src/services/ftpUpload.ts` — FTP 클라이언트(connect() raw TCP): USER/PASS/TYPE I/PASV/STOR/QUIT, 패시브 데이터채널(제어호스트+PASV포트), 응답파서, 20s 타임아웃.
- `src/routes/fax.ts` — POST /send: FTP STOR → BarobillFaxProvider.sendFax(SendFaxFromFTP) → 로그 → 결과. (큐/에이전트 엔드포인트 없음)
- `src/services/barobillFax.ts` — SenderID 배선.
- 프론트: 명세서(`invoice.js`)·원장(`ledger.js`)·단가표(`priceManagement.js`) html2pdf PDF → POST → 동기 결과. 공통 `window.faxSend`/`loadHtml2Pdf`/`blobToBase64`(`shell.js`). invoice는 독립 페이지라 인라인+페이지 CDN.
- `vite.config.ts` — `cloudflare:sockets` external(번들 금지) 필수.
- `src/types/env.ts` — `BAROBILL_FTP_PASSWORD`.
- DB 변경 **없음**(kakao_send_logs 재사용, channel='fax').

## FTP 접속 규격 (바로빌 공식 확정)
- 운영: 호스트 `ftp.barobill.co.kr` · 포트 `9030` (테스트 `testftp.barobill.co.kr` · `9031` — barobill_test_mode로 자동 선택)
- 계정 = **바로빌 회원 아이디**(= barobill_sender_id, 동산 `DONGSAN`) / 비번 = **바로빌 회원 비밀번호** / 평문(FTPS 아님) / **root** 경로 업로드.
- 출처: dev.barobill.co.kr/docs/guides/바로빌-API-개발준비#FTP

## 남은 작업 (운영, 사용자/배포)
1. **FTP 비밀번호 secret 등록**: `wrangler pages secret put BAROBILL_FTP_PASSWORD` → 바로빌 회원 비밀번호 입력. (로컬 테스트는 `.dev.vars`에 `BAROBILL_FTP_PASSWORD=...`)
   - FTP 계정(=barobill_sender_id)·호스트·포트는 코드가 자동 처리. 발신 팩스번호도 법인별 설정값 자동 재사용(추가 작업 없음).
2. **MES 배포**: `npm run build` → `wrangler pages deploy dist --branch main --commit-message "..."`(ASCII). ⚠️ 워킹트리 전체 빌드 — 배포 전 `git status` 확인(동시 세션 변경 섞임 주의).
3. **E2E 테스트**: 거래명세서 열기 → 팩스 → 번호 입력 → "팩스가 전송되었습니다(접수번호)" 확인. 실패 시 워커 로그(`fax FTP upload error` / `fax /send error`) 확인.

## 미검증 리스크 & 폴백
- **cloudflare:sockets FTP는 바로빌 상대로 실전 미검증**. 가능 이슈: PASV 데이터포트로의 2차 connect() 차단, 바로빌 FTP 응답 형식 차이.
  - 디버깅: 워커 로그의 FTP 단계별 에러 메시지(`FTP USER/PASS/PASV/STOR 실패`).
  - **폴백**: 만약 Workers FTP가 막히면, 온프렘 에이전트 방식(IllustratorAutomat가 FTP 대행)이 git 히스토리에 있음(이 커밋 직전). 복원 가능.
- **멀티법인**: `BAROBILL_FTP_PASSWORD`는 단일(동산). 선명 등 다른 법인은 회원 아이디/비번이 달라 `entity_settings('barobill_ftp_password')` 행 추가로 분기(코드 이미 지원).
