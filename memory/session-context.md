# 세션 핸드오프 — 2026-08-24 파일 규격 자동 판독 (P1~P5 완결)

## 상태
- **P1~P5 전부 prod 배포 완료**: `b98c7044`(P1~P3) · `ab533dc0`(P4) · `018bf35a`(P5) — main push → CI deploy.yml 자동배포, 둘 다 success. prod smoke **116/116** · /order-form 마커 3종(applyProbedFileDims·probeSnapScale·dim_probe_) · 콘솔 0.
- 워크트리 `file-dims` 종료·브랜치 삭제. 정본 memory = `design-file-dimension-probe`.

## 결정 + 이유 (P4·P5)
1. **P4는 스펙과 달리 CEP 패널이 아니라 zscan 스캐너에 구현** — 패널 두 경로(A0·재단)는 측정 실패 시 `nobounds`로 등록을 중단해 NULL을 만들지 않는다. NULL 생산자는 파일명에 규격 없는 zscan 건(`measured_cm:{}`). `scripts/zscan-intake.cjs`에 헤더판독(파서 정본 esbuild 트랜스파일, 사본 없음)×배율표(`scale_table.csv`, support≥85%) 폴백. **표 밖 유형·유형없음은 안 채움**(Z: 출력파일 1/5·1/10 축소 관행 — 배율 모르면 추측 금지). 채움 건은 `post_desc: 규격:파일실측×N`. IA 배포축 무접촉(audit:ia-jsx 불요).
2. **P5 = admin 읽기전용 엔드포인트** `GET /api/ai-analysis/audit-dimensions` — R2는 Worker 바인딩으로만 접근 가능해서 로컬 스크립트 대신 엔드포인트. R2 range(머리 64KB+필요 시 꼬리) 판독 ↔ 라인 규격÷배율 ±10%·회전 허용. **`/:id`보다 먼저 등록**(리터럴 삼킴 함정). 폴링 금지(일회성 진단).
3. **prod 소급 감사 결과 = 대상 0건이 정답** — 8/13 8월 주문 전량 삭제로 직접연결(ai_group_index -1/-3) 링크·`order_ai_files` 모두 0. 판정 로직은 로컬 fixture(match 1·mismatch 1)로 실측 검증함. 8월 재적재하면 재실행.

## 주의사항
- zscan 폴백 실효 커버는 낮다(6월 미파싱 258 중 3 채움): 미파싱의 주류가 유형없음(수성축 제품유형 47%)·전사축(배율표 미학습). **커버 확장 = 전사축 learn_scale 학습이 별건 TODO**.
- `scale_table.csv`는 gitignore — 스캐너는 메인 체크아웃(CSV 보유)에서 돌므로 기본 경로 OK. 다른 위치 실행 시 `--scale-table` 지정.
- status-trim(`npm run status:trim`)이 **계약 절 손상으로 자가 복구만 함** — 현 PROJECT_STATUS.md 구조가 스크립트의 계약(현재 초점/블로커/다음 액션 배너 등 11항목)과 어긋남(이 세션 이전부터). 배너 13건>임계 12인데 트림 불가 — 스크립트 계약 갱신 필요(별건).
- 로컬 D1에 검증용 ai_analysis_requests 10359~10368 잔존(무해). `Z:\Designs\filedims-test\`는 삭제함.

## 다음 세션 TODO
1. (선택) 전사축 배율표 학습 → zscan 폴백 커버 확장.
2. (선택) status-trim 계약 절 갱신(현황판 구조와 재정렬).
3. 8월 주문 재적재가 결정되면 → `audit-dimensions` 재실행해 소급 리포트 확보.

## 검증 명령
```powershell
npm run test:file-dims                      # 파서 게이트 19케이스
$env:SMOKE_URL='https://webapp-9i0.pages.dev'; npm run smoke
node scripts/zscan-intake.cjs --from 2026-08-01 --to 2026-08-08   # dry-run(폴백 로그 포함)
```
