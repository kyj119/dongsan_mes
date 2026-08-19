# 세션 핸드오프 — 2026-08-19 (작업지시서 슬라이드 #26 + 카드 상세 구조 확정 #27)

> 이 파일은 **덮어쓰기**다. 지난 세션 내용은 남기지 않는다(미완 TODO만 「이월」 표시로 옮긴다).

## 이번 세션에 한 것 — 용준님 항목 26·27번에서 출발, 리뷰 후속까지 prod 배포

배포 = `ddf0108a`(기능) → `3b4827a8`(리뷰 후속 4종) + docs `b0901a29`·`a07a5b24` · 배포 ID `7fe9b134`→`c3d5b42e` · 정본 = memory `design-work-order-system`.

**① #26 작업지시서 슬라이드** (용준님 확인 = 「카드 간 넘기기」)
| 한 것 | 위치 |
|---|---|
| 신설 `GET /api/cards/:id/neighbors` — prev/next/position/total | `routes/cards/queries.ts:1176` |
| 헤더 ‹ 상태라벨 n/m › + 스와이프 + 키보드 ←→ + pushState | `scripts/cardDetail.js` |
| 내비 버튼 CSS(터치 44px·인쇄 숨김) | `pages/cardDetail.ts:23` |
| smoke `cards.neighbors`(allow404 — 행 부재 허용·SQL 500만 FAIL) | `scripts/smoke.cjs:73` |

**② #27 카드 상세 보기 방법** (용준님 = 「판단 후 권장방안 제안」 위임)
- **이원화 유지 확정**: 칸반 모달=사무 조작 · `/cards/:id`=현장 정본. 모달에 지시서 표현 늘리지 않고 「상세 ↗」 위임.
- 일원화 기각 근거 = `cards/actions.js` 관리 액션 이식 비용 대비 이득 없음. 2026-05-26 역할분리 방침 재확인.

**③ 리뷰 후속 4종** (`3b4827a8`, 셀프 리뷰에서 발견 → 용준님 1·2·3 승인)
- 연타 레이스 = `loadSeq` 토큰으로 구식 응답 폐기 · 핀치줌 = 두 번째 손가락 닿으면 제스처 무효
- 카운터에 상태 라벨 병기(「보류 3/10」) · **next 프리페치**(렌더 직후 다음 카드 번들 5종 선요청, 60초 창·1회 소비)

## 결정과 이유

- **★슬라이드 순회 큐 = 칸반 컬럼과 동일 범위·동일 정렬** — 같은 상태 × `category_name`, `delivery_date ASC, priority DESC, id DESC`(core.js delivery_asc).
  임의의 새 순서를 정의하면 칸반 화면과 어긋난다. PRINT_DONE 은 칸반과 동일하게 출고 주문 제외. 큐 밖(출고·취소)=화살표 숨김.
- **프리페치는 next 방향만** — prev 까지 하면 카드당 API 15회. 전진이 주 사용 방향. 실패는 삼키지 않고 사용 시점 404 안내로 자연 노출.
- **`GET /api/cards/board` = 프론트 소비자 0 고아 엔드포인트** 발견 — 이번 작업 무관이라 보존만. 언젠가 정리 판단 필요.
- 보류 확정(제안했으나 미채택): 뒤로가기 의미 변경(replaceState — 현행 back=직전 카드 유지 권장) · 칸반 사용자 정렬 연동(`?sort=` 확장 여지) · 스와이프 드래그 팔로우 애니메이션.

## 판단 기준 · 주의사항

- **★document keydown 리스너는 spaCleanup 이 안 지운다**(interval 만 정리). 카드 상세 재진입 시 cdRoot 가 다시 존재해 「없으면 자가 제거」 가드가 안 통한다
  → `window._cdKeyHandler` 싱글턴 교체 패턴. 다른 페이지에 document 리스너를 달 때도 같은 함정.
- **스와이프는 가로 스크롤 컨테이너와 충돌** — `.cd-multi-wrap`(다품목 표) 안에서 시작한 터치는 무시. 새 가로 스크롤 영역 추가 시 같은 처리 필요.
- **슬라이드 URL 갱신 = `pushState({spaUrl})`** — state 에 spaUrl 이 없으면 shell.js popstate 가 무시해 뒤로가기가 죽는다.
- **★prod 는 카드 0건** — 슬라이드 실동작 검증은 로컬 D1(HOLD×출력 큐 10건)로 완결. prod 는 페이지 로드·마커 4/4·JS 예외 0 까지.
  `/cards/1` 의 콘솔 404 5줄은 존재하지 않는 카드 조회의 정상 로그다(오판 금지).
- **커밋 훅이 doc-diet 게이트로 커밋을 차단한다** — 이번에 2회 걸림: ①현황판 400자(타 세션의 TNS 항목이었지만 큰 것부터 지목됨 → ARCHIVE 이관으로 해소)
  ②MEMORY.md 총량 15,000자(36자 초과 → 헤더와 중복이던 말미 ARCHIVE 포인터 줄 제거). **MEMORY.md 는 한도 직전이라 다음 추가 시 먼저 다이어트할 것.**
- **공유 체크아웃** — 이번에도 push 사이에 타 세션 커밋(`48d8995a` LogWatcher 키트)이 끼었다(웹 번들 무관 확인함).
  미커밋 잔존 = `scripts/finance-diagnose.cjs`(M)·`docs/analysis/2026-08-19-장비-고정자산-대조표.md`(??) — **내 것이 아니라 손대지 않았다**.
- prod smoke 는 `SMOKE_URL` 지정 필수(기본 localhost) — 이제 **113/113**(cards.neighbors 편입).

## 다음 세션 TODO

1. **태블릿 실기기 스와이프·핀치 확인** (신규 — 용준님 「나중에」) — 감도·`.cd-multi-wrap` 스크롤 공존·핀치 무효 실기 확인.
2. **주문서 값 ↔ 패널 확정값 불일치 감지** (이월) — `designer_intakes.finishing_json` 과 주문 라인 마감 어긋나도 경고 없음.
3. **미등록 정기출금 2건 정체 확인** (이월) — 하나 `비씨카드` 23일 2,332,300 · 전북 `신한카드할부` 26일 745,630.
4. **선명 하나카드 이상 출금 2건** (이월) — 7/28~29 3건 9.2M · 8/18 4건 4.1M.
5. **`card_transactions` 수집 결손** (이월) — 동산 하나 −21% · 비씨 −35% · 전북 −50%.
6. **prod 첫 카드 발행 때 마감·후가공 라벨 + 슬라이드 실물 확인** (이월+확장) — 체크리스트 라벨은 생성 시 스냅샷이라 소급 안 됨.
7. **`postfix` 미실행** (이월) — ⚠️8월 주문 510건 삭제됐으니 대상 잔존부터 확인.
8. **MES 에만 있는 8/12 전표 3건 판정** (이월) — `E1-20260812-035`·`-039`·`-044`.
9. **감액 기간 기준 통일 여부** (이월) — `adjustments.adjustment_date` 컬럼 부재.
10. **08-13 묶음 관찰** (이월) — `settings.data_complete_through` 비어 병행 경고 꺼짐.
11. **#17 개인통장 IGNORED 36건 정리 여부** (이월) — 그대로 둬도 무해.

## 검증 명령 (PowerShell)

```powershell
npm run verify                       # 타입체크 + 빌드
npm run audit:entity                 # entity 필터 61/61
npm run check:dom                    # getElementById 참조 대조
node scripts/sort-audit.cjs          # 목록 정렬 tie-break (P1 0건이어야)
node scripts/doc-diet-audit.cjs      # 현황판·메모리 인덱스 한도 (★MEMORY.md 한도 직전)

npm run build; npm run smoke         # 로컬 스모크 113/113 (dev:d1 기동 상태)
$env:SMOKE_URL='https://webapp-9i0.pages.dev'; npm run smoke   # prod 스모크 113/113

# 슬라이드 이웃 API 재확인 (로컬 dev:d1 기동 + admin/password 로그인 후)
# 카드 목록에서 id 하나 골라: GET /api/cards/<id>/neighbors → prev/next/position/total
# prod 마커: curl https://webapp-9i0.pages.dev/cards/1 → cd-nav-btn·cdSlide·fetchBundle·loadSeq 존재
```
