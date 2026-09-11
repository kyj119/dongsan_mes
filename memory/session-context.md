# 세션 인계 — 2026-09-12 새벽 (일러 패널 세션 종료 · 전부 배포·실측 완료)

## 이번 세션이 한 일 (2026-09-11)
| 결정(용준님) | 내용 | 배포·실측 |
|---|---|---|
| 한글 IME·주석 소실 | manifest `--disable-features=TSFImeSupport`(CEP-3029) · 주석 좌표가 경계선 OFF 면 NaN → 빈 catch 가 한 달 삼킴 → 호스트 0.12.0 `annotation_error`·warn A | `ia:deploy` + 재시작 실키 검증 ✓ |
| 펀칭 규칙 **「나」** | 호스트 양끝포함 규칙을 정본으로(상하좌우3=**8**) 에이전트·라벨 쌍·주문서 정렬. 표기=실물 `8개(모서리 4, 4변 1)`(패널·카드·주문서 한 문장) · 파일명=위치어+총개수(`사방펀칭8`) · 용어 「모서리」 | IA ✓ · 웹 `7a23c954` ✓ |
| 구조 점검 3건 | ①`mes-core`·`mes-sheet` 본체 은퇴(repo 삭제·Z: `_retired/20260911-legacy-jsx/`) ②빈 catch 390곳 전수 분류(363 사유 주석·27 실패 기록) + 게이트 `audit:empty-catch`(편집 훅 차단·커밋 훅·`ia:deploy`) ③모아찍기 S4 잔재 정리(패널 0.21.0) | IA ✓ 드리프트 0 · 실측 호스트 0.13.0/패널 0.21.0/재단 0.86.0·0.43.0/잠금 1.1.1 · 검토모드 구멍 8·재단선 1 |
| 웹 배포 | `/deploy-verify`: tsc·build·test:calc 26·entity 0·journey:gate 25/25·smoke:prod 129/129·마커 `pageScript`·콘솔 0 | CI 34613076832 success |

정본 메모리 = `design-punching-count-rule` · `design-empty-catch-gate` · `design-a0-panel-structure` §2026-09-11 · `feedback-cep12-korean-ime-tsf`. 경위 = ARCHIVE §2026-09-11 (일러 패널 · 펀칭 · 패널 구조).

## 다음 세션 TODO
1. **첫 실등록 1건 확인** — 패널 결과줄에 C/D/N 코드가 안 뜨고 EPS 옆 `warn.log` 가 안 생기면 정상. 생기면 그게 여태 삼켜지던 실패다(에이전트 경로는 `_iaWarn` → `warn.log`).
2. 디자이너 PC 마다 **일러 완전 재시작** 후 한글 타이핑 1회(IME 플래그는 manifest 라 재시작해야 읽힌다).
3. 미구현·미착수: 에이전트가 `warn.log` 를 UI 에 띄우기 · P3 백업 잔재(Z: `.bak` 14·설치본 `.bak`·`_panel_backups` 보존 상한 없음, `copyTree` 가 `.bak` 도 나름) · 용어 「펀칭」(가공) vs 「타공」(재단).
4. 옛 뜻(`side_top=2` = 안쪽 2개)으로 저장된 주문 라인 건수 미확인(`--remote` 7403) — 필요 시 prod 조회 후 판단.
5. journey-loop 세션 이월(정본 `/journey-loop` · 메모리 `project-journey-loop`): **P8** 견적 품목검색 자재 포함 여부(영업 확인 후 `excludeType=MATERIAL` 통일?) · 병행테스트 기간 `npm run journey:cycle` 을 `/loop` 로 반복, 직원 결함은 여정 단계로 승격 · 다음 여정 후보 J1 예외 경로·J2 출고 취소(환원)·J4 「발주 없이 입고」 · P6(prod 로그인 한도가 isolate 메모리라 간헐) = 보안 묶음 때.
6. 발주→입고→검수 원단 2주 테스트(용준님/강지영) 진행 중 — 2주 뒤 숫자로 규정 확정.

## 판단 기준·주의
- **빈 catch 를 새로 쓰면 편집 훅이 막는다** — `catch (e) { /* ignore: 사유 */ }`(블록 주석만) 또는 실패 기록. 사유는 거짓이면 안 된다(호출자가 정말 개수를 보는지 확인).
- **사유 주석만 바꿔도 셸·호스트 번호를 올린다** — `ia:deploy` 는 「같은 번호 = 같은 코드」 전제라 거부한다(09-11 1차 배포가 그래서 축1만 나갔다). `npm run ia:deploy -- --dry-run` 으로 먼저.
- **펀칭 문장을 만드는 곳은 둘**(웹 라벨 쌍 · 패널 `punchLabel`) — CEP 는 src 를 못 싣는다. 형식을 바꾸면 둘 다 + `panel:smoke` 7f 픽스처. 호스트 분배식을 바꾸면 패널 `punchLayout`·에이전트 `spread`·라벨 쌍 전부. 파일명 위치어는 **모서리 사이 구멍이 있는 변** 기준. 기하(이격·지름)는 통일 안 함(호스트 2cm/1cm · 에이전트 1cm/5mm).
- **공유 체크아웃에 남의 미커밋 문서 편집이 있으면** rebase 전에 `git stash push -- <그 파일들>` 로 경로 지정 stash → 배포 → pop. 커밋 훅 doc-diet 는 남의 편집분까지 센다.
- **`journey:gate` 첫 실패가 SQLITE_BUSY 면** 다른 세션 서버(포트 3000·같은 로컬 D1)와의 경합 — 재시도로 판정.
- **prod 마커는 `pageScript` 필드** — `pageContent` 만 보면 전부 NG 로 오판(메모리 `reference-spa-auth-page-fetch` 정정).
- **소스 텍스트 스모크는 주석·버전 문구에도 걸린다**(7g·3t 두 번). 새 검사는 DOM/동작 기준.
- 에이전트 `$.writeln` 은 아무 데도 안 잡힌다(`DoJavaScript` 반환값 `_lastJsxStatus` 만) → `warn.log` 파일.
- 일러 검증은 검토모드(`mesA0_reviewPlace` 가로채기)로 Z: 부작용 없이 산출 문서를 직접 센다. 응답은 축약형이라 `norm_fail`·warn 은 실등록에서만.

## 검증 명령 (PowerShell, `C:\Users\user\dongsan_mes`)
```powershell
npm run audit:empty-catch ; npm run test:finishing-label ; npm run panel:smoke ; npm run cut:smoke
npm run verify ; npm run test:calc ; node scripts/entity-audit.mjs
node scripts/ia-jsx-audit.cjs        # 드리프트 0 이 정상(09-11 밤 실측)
npm run smoke:prod ; npm run journey:cycle
```
