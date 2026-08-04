========================================================
 CAPS 근태 워커 배포본  (Z:\Designs\caps-worker)
========================================================

■ 설치/갱신 방법 — 대상 PC에서 이 한 줄만

    Z:\Designs\caps-worker\install-caps-worker.ps1

  관리자 권한 필요 없음. 스크립트가 알아서 합니다:
    1) 워커 정지  2) 기존 src 백업  3) src 교체
    4) 자체검사 30건 (실패하면 자동 롤백)  5) 재시작 + 로그 확인

  워커 폴더가 C:\caps-worker 가 아니면:
    Z:\Designs\caps-worker\install-caps-worker.ps1 -WorkerDir D:\caps-worker


■ ★ 이 폴더를 통째로 복사하지 마세요 ★

  여기 있는 .env 는 동산기획(SITE_ID=DJ) 설정입니다.
  이걸 선명 PC에 복사하면 선명 근태가 동산 소속으로 올라가
  직원 매칭이 전부 실패합니다(미매핑).

  → 반드시 위 install 스크립트를 쓰세요.
     스크립트는 src 만 교체하고 .env 는 절대 건드리지 않으므로
     각 PC의 사이트 설정(SITE_ID, API 키, LOOKBACK_DAYS)이 그대로 유지됩니다.


■ 새 PC에 처음 설치하는 경우에만

    1) 이 폴더를 복사한 뒤 .env 를 그 사이트 값으로 새로 작성
       (.env.example 참고 / SITE_ID 와 MES_API_KEY 는 MES 설정 화면에서 발급)
    2) npm install
    3) npm run install-service    ← 로그온 시 자동 시작 등록


■ 버전 확인

  MES → 설정 → CAPS 근태 연동 → 동기화 이력 행 클릭 → "워커 버전"
    1.1.0      = 최신 (기간 지정 + 자동 갭 복구 지원)
    미보고     = 구버전. 위 install 스크립트를 돌리세요.


■ 백업

  src.bak-<날짜시각>          이전 버전 (자동 생성)
  package.json.bak-<날짜시각>

  롤백이 필요하면 해당 백업을 src 로 되돌리고 워커를 재시작하면 됩니다.


  상세 문서: 리포 docs/CAPS-WORKER-DEPLOY.md
  2026-08-04
