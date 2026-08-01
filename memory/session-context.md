> **파일 구조**: 최신 세션이 맨 위. 아래로 갈수록 과거 세션(각각 durable 메모리에 정본 있음).
> **다음 세션은 이 문서 상단의 "이월 TODO 통합"만 읽으면 된다** — 그 아래 상세 핸드오프는 판단 근거가 필요할 때만.

# 세션 핸드오프 — 재단 패널: 간격·곡선·여백분리·선도안 (2026-07-31~08-01 #31~#33)

> **전부 IA 수동배포 축(웹 변경 0).** 정본 = `docs/superpowers/specs/2026-07-31-cut-file-panel.md` §6.20~6.28 · 메모리 = `[[design-irregular-nesting]]`
> 배포: host `CUT-CEP-0.6.0` · cut shell `0.11.0` · A0 shell `0.2.0` · **4축 드리프트 0**
> ⚠️ **코드가 미커밋이다** — 상태판(#31~#33)만 타 세션이 이미 커밋했다. 아래 §커밋 필요 참조.

## 이번 세션 결과

| 건 | 결과 |
|---|---|
| 간격 보장(해상도 스냅) | 요청 3mm 가 **실보장 2mm** 였던 것 해소 |
| 곡선 칼선(베지어) | 각진 계단 제거 · **진짜 코너는 보존**(55° 임계) |
| 효율% 교정 + 폭 추천 | 60.0% → **35.6%**(실제 재료 기준) · 롤 5종 스캔 0.3초 |
| 재단선 "구부러짐" 근본 | 글자 배너 **6.21mm 부풂 → 0.70mm**(면적오차 6.05%→0.03%) |
| 오프셋 오차 | 배치 격자 기준 **1.50mm → 0.25mm** |
| 조각 칼선을 미세 마스크에서 | 편차 ±0.71 → **±0.28mm** |
| **여백·간격 분리** | 재단선 = 디자인 + **여백** · 간격 = **칼선↔칼선** |
| 벡터 vs 래스터 계측 | **벡터 전면 전환 근거 없음**으로 결론(0.3~0.7% 차) |
| 선 도안 판정 | 효율 **1.1% → 45.1%** · 조각 겹침 6쌍 → **0** |
| 패널 이식 2건 | 클리핑 존중(A0→재단) · 50% 피복 임계(재단→A0) |

## 결정과 이유

- **여백과 간격은 별개다**(용준님 지시). 디자인 사이 = `여백×2 + 간격`. 전엔 하나로 묶여 **칼선이 맞닿았다**(사이 재료 0).
  **여백은 음수 허용** — 도련이 이미 들어간 아트는 칼선이 잉크 안쪽이어야 한다(도련 2mm → 여백 −2).
- **안전 여유 = 격자 반 칸(mmpp/2)**. 배치는 거친 격자·칼선은 미세 격자라 그만큼 어긋난다.
  없으면 0.67mm 부족, `mmpp/2 + fine` 는 1.5mm 과다 → **mmpp/2 가 정답**. 부족은 재단 사고, 과다는 재료 낭비 → 넉넉한 쪽.
- **벡터 실루엣 미채택.** 제대로 만든 아트에서 래스터와 **0.3~0.7%** 차(물리 공차 ±0.5mm 이하)라 정확도 이득이 없고,
  polarity·투명도·효과를 **우리가 재현해야 하는 위험**만 들여온다. → 좌표는 **판정에만**, 마스크는 래스터, 채움은 **임시 문서에서만**.
- **A0 에는 임계값만 이식.** A0 는 칼선 기하가 아니라 **잉크 연결성**을 보므로 미세굽기+축소는 4~16배 비용에 이득 불명확 → 미채택.
  반면 6% 피복 임계는 안티에일리어싱 테두리를 잉크로 세어 **없는 다리**(1mm/px 에서 최대 2mm)를 만든다 → 50% 피복 + 반투명 폴백.

## 판단 기준 (다음에도 쓸 것)

- **조용히 틀리는 것이 가장 나쁘다.** 자동 판정·폴백·능력 부족은 **항상 결과에 표시**한다(배경·선도안·반투명·구 호스트 게이트가 전부 이 원칙).
- **게이트가 무는지 확인한다.** 통과만 보면 못 잡는 테스트가 남는다. 이번에 2건 적발 — 정렬 수식(baseX 를 깨서 3건 FAIL 확인) · 프린지 픽스처(다리가 안 닿아 무용지물).
- **면적오차만으로는 부족** — 부풀고 꺼진 게 상쇄되면 면적은 멀쩡해 보인다 → **점별 편차** 게이트.
- **합성 테스트 도형은 디자이너가 만드는 방식으로.** API 로 조립하면 일러가 다르게 렌더해 **엔진이 아니라 픽스처를 디버깅**하게 된다(이번에 실제로 그랬다).

## ⚠️ 주의사항 (함정)

- **`doc.pageItems` 는 중첩 자식까지 평평하게** 돌려준다 — 클립된 그룹이면 **클립 패스 자신**이 섞인다(`mesCut_topItems()`).
  예전엔 origin 도 `visibleBounds` 라 **우연히 아귀가 맞았다**.
- **`compoundPathItems.add()` + 자식 추가는 polarity 를 안 잡아 구멍이 안 뚫린다** — `Object > Compound Path > Make` 는 `-+` 로 잡는다.
- **패널 리로드로는 호스트가 안 바뀐다**(`$.evalFile` 은 확장 로드 시점). 핫스왑 = `$.evalFile(new File(MESCUT_CORE_PATH))` — 한글 경로 리터럴 금지.
- **Illustrator MCP 는 간단한 표현식 외에 연결이 끊긴다**(COM) → **패널 CDP(8889) evalScript** 가 정본. 비활성 문서 `pageItems` 순회는 타임아웃 → `app.activeDocument` 전환 후.
- **CEP extensions 안에 백업 폴더 금지** — 같은 ID 로 등록돼 CEP 가 백업을 고른다(host 만 새 버전·shell 만 옛 버전). 설치 스크립트가 `_panel_backups` 로 빼고 `audit:ia-jsx` 가 중복 ID 를 잡는다.
- **문서를 일괄로 닫지 말 것** — 이번 세션에 사용자 파일을 저장 없이 닫는 사고가 있었다. 내가 만든 문서만 이름으로 골라 닫는다.

## ★커밋 필요 (이 PC 워킹트리에만 있음)

⚠️ **경로 지정 커밋**할 것 — `git add -A` 는 타 세션 WIP 를 삼킨다([[feedback-shared-checkout-git]]).

```
신규: IllustratorAutomat/designer/{cut-panel/,mes-cut-host.jsx,mes-lock.jsx}
      IllustratorAutomat/designer/poc-a0-cep/com.mes.a0.panel/js/geometry.js
      scripts/{cut/,cut-panel-smoke.mjs,install-cut-panel.ps1}
      docs/superpowers/specs/2026-07-31-cut-file-panel.md · docs/CUT_PANEL_USAGE.md
수정: mes-a0-host.jsx · poc-a0-cep/.../{index.html,js/main.js}
      scripts/{ia-jsx-audit.cjs,install-a0-panel.ps1,panel-smoke.mjs} · CLAUDE.md
```

## 이월 TODO

1. **A0 묶음분리 실사용 확인** — 임계가 올라가 예전보다 **덜 붙는다**. 의도지만 실무 감각과 맞는지 확인 필요.
2. **재단 패널 실도안 자연검증** — 여백/간격 분리 + 선 도안 판정으로 실제 1건.
3. 위 §커밋 필요 정리.
4. 디자이너 PC 4대 `install-cut-panel.ps1` + `install-a0-panel.ps1` + 일러 재시작.
5. `seedRaster` ↔ `rasterize` 공용모듈화(`mes-lock.jsx` 전례).
6. `mesCut_rasterizeItem` 임시문서 재사용(조각마다 열고 닫는다).
7. 미해결: miter 코너(§9-3) · `MIN_HOLE_MM` 물리 근거 · 플로터/CNC 실기 투입.

## 검증 명령 (PowerShell)

```powershell
npm run cut:bench      # 기하 엔진 (컨투어·오프셋·간격보장·곡선피팅·마스크축소)
npm run cut:nest       # 배치 (전수배치·겹침0·경계·절감·다중시트)
npm run cut:smoke      # 재단 패널 125/125
npm run panel:smoke    # A0 패널 119/119
npm run audit:ia-jsx   # 4축 드리프트 + 중복 확장 ID
npm run verify         # tsc + build (웹 — 이번 세션 변경 없음)
```

마지막 실행: `cut:smoke 125/125` · `panel:smoke 119/119` · bench·nest·verify 통과 · **드리프트 0**

---

# 세션 핸드오프 — 간판 BOM P1·P2 (2026-08-01 #31)

> **P1 초안 검토 → 용준님 확정(1차=자재 BOM·원가 먼저·프레임 신규/교체 분리) → P2 prod 적용 완료.** 마이그 **0508**(product_materials 소요량 4컬럼+대표 품목 8종+표준 BOM 24행) + 소급 533라인(`gen_sign_retro.py`). **이관 매출 품목 연결 87.9%→98.4%**·매출 총액 불변·smoke 104/104. 정본=[[design-sign-bom]](가정치 보정 목록 ★7건 포함) · 검토 산출물=`품목마스터/간판BOM_초안_v1.xlsx`.
> **다음=P3**: 유형×규격→BOM 원가 계산으로 이관 매출 원가율 리포트(생성기 레벨). 착수 전 ★가정치 보정(특히 LED 밀도 35→100/㎡ 의심 — 작업지시서 2~3장 역산) 권장.
> ⚠️이 세션에서 밟은 함정: D1 다항 UNION ALL="too many terms in compound SELECT"→행별 INSERT / items.category_id FK=**item_categories**(간판=id 14 기존 — categories 테이블은 없음).

---

# 세션 핸드오프 — 간판 자재 트랙 일괄: 등록·품명 백필·이카운트 매칭·원장 일별 분할 (2026-07-31~08-01 #30)

> **전부 prod DB·문서 작업 — src 변경 0.** push 완료(2026-08-01, rebase로 해시 변경): LED4U 등록 `2c557c82` · SK 백필 `720919d4` · 매칭표 `02d64eaf` · 일별 분할 `ef065097` · 핸드오프 `cbfe0a69`. CI 배포 success·smoke 104/104. 검증 = AP 5곳 원단위 불변.

## 이번 세션 결과 (DB만 — src 무변경·배포 없음)
- **LED4U 간판자재 등록 완결(prod)**: 생성기=`docs/dongsan-import/gen_led4u_items.py`. 신규 52종 + 기존 85코드 매핑 → **327라인 179,681,990 연결**(=발생 180,708,490−의도SKIP 1,026,500 정확)·NULL 잔여 6(이월1·직송1·SKIP4)·**AP 269,075,065 불변**. items 1,234.
- **★판단 근거(반복 금지)**: SGM 카탈로그 base_price=LED4U 최신 단가 일치 → **SGM이 LED4U 단가표 기반 카탈로그**. 병행 신규(SK 방식) 아니라 기존 연결+변종 신설. OCR 이본 3쌍(현올캠바=한올캡바·현올잼비=한올입체바·SMPS 정수형=방수형)은 **날짜 완전분리+단가 단조상승**으로 동일품 확정 — 전부 3/6 이전 저화질 페이지에만 등장.
- **정운교역 4·5월 세금계산서 여전히 미발행(용준님 확인)** → clients.notes 기록·발행 수취 시 하반기 수집분 대사. AP 데이터는 청구월 기준이라 변경 없음.
- 신설 색코드: JD옥·FL형광·TG진청록·MT민트. SKIP 4건=3티캄판산CNC 420K·스탠완형등롤 2건 106.5K·보강대400@25,000(단가 47배=오독 의심) 500K.
- 다음: 간판 **완제품 매출** 307M NULL 소급 + 간판 BOM 설계(자재는 LED4U 52+SK 162 준비 완료). 아래 #29 TODO 중 3번은 완료 처리.
- **(08-01 추가) 매입 원장 일자별 분할 완결(prod)** — 용준님 "원장은 날짜별이어야" → 월 전표 29건을 **일별 169전표로 분할**(정운 20·LED 51·운산 21·KM 16·SK 61), OPEN·EXTRA·KM-EQ(실일자 이벤트)는 유지. 생성기=`gen_daily_split.py`(4개사 — prod 라인 스냅샷 재편성·라인 비고 '납품 날짜' 파싱·VAT 월잔차 보정) + `gen_sk_daily_split.py`(**SK 날짜=PDF 그래픽 병합셀** → find_tables cell geometry로 그룹 91 검출→78그룹 텍스트밴드 렌더→Read 판독 GID_DATES 내장·교차검증 일치). **검증 = 5개사 AP 원단위 불변·라인수 보존·smoke 104/104**(SMOKE_URL=prod 필요 — 기본값은 localhost). 롤백=일별 전표 notes '일별 분할 2026-08-01' 삭제 후 원 적재 SQL(멱등) 재실행.
- **(08-01 추가) 간판자재↔이카운트 품목 매칭표** = `품목마스터/간판자재_이카운트품목_매칭.xlsx`(gitignore·생성기=잡 tmp `build_match_xlsx.py`+`build_ecount_dict.py`): MES 자재 379종 ↔ 이카운트 판매현황 실사용 480코드 — 확실 53·유사 145·미등록 181(매입 전용). ⚠️이카운트 정본=판매현황 6개월 실사용분(품목등록 export 미확보 — EXPORT-SPEC "필수 아님" 결정). 핵심 확정쌍: LED3구2835=10030·SMPS W100~500=B0023~28·YESLED20W=10064·LT4071=0-0-0102·씨트용120폭=10228(규격일치)·사각경관봉PC커버=10555·볼로프5mm=B0034·포인트사각550=10210.
- **(08-01 추가) SK 품명 빈칸 26종 백필 완결(prod+JSON+xlsx)**: 이 ERP PDF는 **일부 행 품명도 그래픽 레이어**(날짜와 동일 함정) → 행 스트립 렌더→Read 판독. 정체=예스후렉스 그레이(비조명) 12폭·YESLED형광등 5종·LG시트 3종·사각경관봉 2종·고무자석롤 2종·유니온SMPS·보조시트. `extract_sk_pdf.py`에 `NAME_FIX` 26종 내장(재추출 시 재발 방지)·백필=`load/sk_name_backfill.sql`(빈이름 가드 멱등)·검산 3중 재통과. ⚠️간판자재 정본축 중복 추가 확인: YESLED형광등↔SGM-LEDF·유니온SMPS300↔SGM-SMPS-W300.

## 판단기준 (다음 세션이 이어받을 것)

1. **간판 BOM은 SGM/일반코드에 건다** — 같은 자재가 공급사 코드(SK-105 상바·SK-472 알마이트)와 일반코드(SGM-SB·ALM-*)로 2벌. 공급사 코드는 매입 전용, 원가·BOM 집계는 일반코드 축.
2. **앞으로 명세 적재 생성기는 일별 전표로 생성** — 월 전표는 이번에 전량 분할했다. 명세 수취 46곳 도착분(`품목마스터/매입명세요청_명단.xlsx`)을 새로 적재할 때 월 묶음으로 만들면 역행.
3. **이 ERP PDF 함정 3종 세트 확립**: 텍스트 레이어에 없는 것 = 날짜·일계·월계·**일부 품명**. 해법 = find_tables 병합셀 geometry(그룹 검출) + 텍스트 밴드 렌더 → Read 판독. 정석 파이프라인이 `gen_sk_daily_split.py`·`sk_dates_*.py`(잡 tmp)에 있다.
4. **매입 플래그 실측 완료** — 자재 379종 중 348 정상 매입품목·17 비활성=패밀리 대표(의도)·5 매입0=UV 판매품목. **UV-PC-1.8T-M에 선명 E2 LIVE 매입 4라인**(2.68M) — 향후 선명 발주는 PC-1.8T-M-48로(기존 라인은 실운영 데이터라 미조치).

## 주의사항 (이 세션에서 실제로 밟음)

- **wrangler --file 상대경로는 bash 현재 디렉토리 기준** — cd 후 실행하면 "Unable to read SQL text file". 절대경로 사용.
- wrangler --json 출력 앞에 ANSI 진행줄이 섞인다 — 파싱은 `re.search(r'\[\s*\{')` 위치부터.
- **smoke는 `SMOKE_URL=https://webapp-9i0.pages.dev` 필요**(기본 localhost라 힌트만 나옴).
- 롤백 마커: 일별 전표=`일별 분할 2026-08-01` / LED4U 품목=`엘이디포유 간판자재 등록 2026-07-31` / SK 품명=`load/sk_name_backfill.sql`(가드 멱등).

## 다음 세션 TODO

1. **간판 완제품 매출 307M NULL 소급 + 간판 BOM 설계** — 준비 완료 상태: 자재 379종·실단가 870라인·매출 타깃(채널 193M+프레임 102M=87%)·이카운트 매칭표. brainstorming 스킬로 BOM 구조부터.
2. **items.ecount_code 저장 여부 질문** — 매칭 확실 53건(+검토 후 유사 145건)을 DB에 박을지. 하반기 증분 이관 자동매칭 기반.
3. 명세 수취 46곳 도착분 적재(일별 전표로) · 정운교역 4·5월 계산서 발행 추적.
4. push 대기 커밋 4개(명시 요청 시) · (기존 이월) 디자이너 PC 4대 설치·재단/A0 실기 검증은 #26~28 참조.

## 검증 명령 (PowerShell)

```powershell
npm run verify    # src 무변경이지만 관례 게이트
$env:SMOKE_URL='https://webapp-9i0.pages.dev'; npm run smoke   # 104/104
# AP 5곳 원단위 재검(읽기전용): 310,636,189 / 269,075,065 / 93,717,824 / 72,075,900 / 17,208,213
npx wrangler d1 execute webapp-production --remote --json --command "SELECT c.client_name,(SELECT COALESCE(SUM(final_amount),0) FROM purchase_orders WHERE supplier_id=c.id AND entity_id=1 AND status NOT IN ('DRAFT','CANCELLED'))-(SELECT COALESCE(SUM(amount),0) FROM purchase_payments WHERE supplier_id=c.id AND entity_id=1) AS ap FROM clients c WHERE c.client_code IN ('503-81-42473','402-81-69392','134-81-34990','128-87-17213','514-32-63198')"
```

---

# 세션 핸드오프 — 동산 매입(AP) 원장 트랙 완결 (2026-07-31 #29)

## 이번 세션 결과 (전부 prod 반영·파생 AP 원단위 검증)
| 거래처 | 이월(2025말) | 6/30 확정 미지급 | 비고 |
|---|---|---|---|
| 정운교역 | 299,984,520 | **310,636,189** | 청구서 5개월 라인 55·RM-TP 반제품 19종(마이그 0507)·BOM 17링크 |
| 엘이디포유 | 269,900,215 | **269,075,065** | 저해상 스캔 → 업스케일 판독 361행·별도직송 20,075,000 규명 |
| 서울경금속 | 41,725,657 | **93,717,824** | PDF 464라인 자동추출·SK-품번 162종 등록·이체수수료 500 분리 |
| 케이엠테크 | 74,654,600 | **72,075,900** | 소모품+장비 2계정·잉크 품목매칭·캐피탈 전환 기록 |
| 운산직물 | 29,243,844 | **17,208,213** | 원장 82라인·AQ1/AQ2/PONGE 매칭 |

합계 **762.8M**. AR측: 더 에스에이치 관계거래처 이관(→18,428,530)·대한국기사 유령 −45.9M 소거(E1 AR 552.7M — `load/expected_balance.json` 정본 갱신).

## 결정 (이유)
- **T/P 인쇄분 = 기종×사이즈 반제품 등록**(원가·마진 목적 — 단가·수율이 그 단위로만 안정). 원단 인치폭은 spec 메모. 복합=LCM 모듈 면적배분(소형 551·대형 1,240원/장), 특호 360×540=2폭 이음 43,700원/장.
- **지급 정본=통장 실측**(명세 수금과 차이 = 수수료/별도건: 서울경금속 500원 이체수수료·LED4U 20,075,000 원장 외 직송 3건).
- **발생 정본=공급사 명세(발생주의·청구월)**, 계산서 발행일 아님(정운교역 3~5월 계산서 미발행 241M — 발행 요청 중).
- LED4U 간판자재 ~90종은 품목 미등록·품명 보존(간판 BOM 단계에서 일괄 등록 후 소급).

## 판단기준 (다음 명세 처리 시)
1. **추정표(계산서−통장)는 이월을 못 본다** — LED4U 추정 −0.8M→실제 269.1M. 균형처도 이월 잠복 가정.
2. 검산 게이트: 행별 잔액 체인 + 일계/월계 + 최종잔액 + 우리 계산서·통장 교차 — **assert 통과분만 SQL 생성**.
3. 스캔 PDF: 텍스트레이어 있으면 pdfplumber 표 추출, 없으면 **업스케일 파이프라인**(PyMuPDF 4배 렌더→회전 +90→autocontrast+sharpen→상/하 분할 PNG→Read). 날짜가 그래픽 레이어면 잔액 체인으로 월 경계 판정.
4. supplier AP는 **entity_id=1 필터 필수**(서울경금속·운산직물엔 선명 E2 LIVE 발주 병존 — 전사 합산 화면은 정상). AP 공식=PO final(NOT DRAFT/CANCELLED)−payments−adjustments.

## 주의사항
- ⚠️ **wrangler --file 이 파싱 실패처럼 보여도 서버 반영됐을 수 있다** — 재실행 전 실측 확인(이번에 이중적재 1회 발생·복구). 모든 적재 SQL 멱등 가드(OR IGNORE·NOT EXISTS·reference_number) 필수.
- ⚠️ **PONGE-150 → PONGE-155 개명**(실폭 정정) — `gen_sales_sql.py` match_fabric 150 참조는 하반기 재사용 시 155 로 수정.
- load/·CSV·xlsx 산출물 gitignore(PII). push = 자동 prod 배포 — 명시 요청 시에만.

## 다음 세션 TODO
1. **명세 수취 46곳**(`품목마스터/매입명세요청_명단.xlsx` — 1순위 미지급확인 35곳 214.2M) → `Z:\Designs\123\<거래처>` 도착분부터 동일 파이프라인 적재.
2. 정운교역 4·5월 계산서 발행 확인(3월분 7/20 발행은 하반기 수집 시 유입).
3. LED4U 간판자재 ~90종 등록 + 라인 소급(간판 BOM 착수 시 — SK 162종과 함께 원가 기반).
4. 매입 화면 실확인: /ledger 매입 탭·발주 목록에서 5곳 잔액·라인 표시.
5. (기존 잔여) 간판 완제품 307M NULL 소급 · 대손 3곳 247.3M 상각(세무 협의 후) · 로컬 커밋 push 대기.

## 검증 명령
```powershell
npm run verify   # tsc+build (이번 세션 src 변경 0 — DB·문서·생성기만)
npm run smoke    # prod 엔드포인트 ~104
# AP 재검증(읽기전용, 5곳 원단위 기대값: 310,636,189 / 269,075,065 / 93,717,824 / 72,075,900 / 17,208,213)
npx wrangler d1 execute webapp-production --remote --json --command "SELECT c.client_name,(SELECT COALESCE(SUM(final_amount),0) FROM purchase_orders WHERE supplier_id=c.id AND entity_id=1 AND status NOT IN ('DRAFT','CANCELLED'))-(SELECT COALESCE(SUM(amount),0) FROM purchase_payments WHERE supplier_id=c.id AND entity_id=1) AS ap FROM clients c WHERE c.client_code IN ('503-81-42473','402-81-69392','134-81-34990','128-87-17213','514-32-63198')"
```

---

# 세션 핸드오프 — A0 묶음분리 실루엣 대체 + 재단 패널 점검 5건 (2026-07-31 #26~#27)

> **Z: 3축 배포완료 · 웹 배포 0 · 마이그 0** — A0 host `0.1.10`/shell `0.1.12` · 재단 host `CUT-CEP-0.4.3`/shell `0.7.3`. `audit:ia-jsx` 4축 드리프트 0.
> **⚠️ 커밋 안 했다** — 작업 트리 dirty(재단 패널 일체가 아직 `??`). 다른 세션 파일(`docs/dongsan-import/gen_*.py`·`migrations/0507_*`)이 섞여 있으니 **경로지정 add** 필수.
> durable = [[design-silhouette-vs-bbox-split]] · spec `docs/superpowers/specs/2026-07-31-cut-file-panel.md` §6.17~6.19

## 이월 TODO 통합

1. **일러 재시작 후 실파일 검증 (최우선)** — 오늘 바꾼 **호스트 코드는 전부 실기 미검증**이다(패널 계산부만 스모크가 덮는다). 확인할 것: ⓐA0 [묶음 분리]로 비스듬한 실파일 → 눈에 보이는 수 = 행 수 ⓑ흰 글씨/흰 바탕 디자인이 안 쪼개지는가 ⓒ재단 네스팅 테두리가 **조각에 붙는가**(시트 끝 아님) ⓓ등록 폴더에 `.dxf` 생성. 실패 시 A0 는 "⚠ 사각(bbox) 방식" 폴백 경고가 뜬다(작업은 안 막힘).
2. **효율 %·추천 폭** — 착수 전 점검 완료(spec §6.19). 효율은 `nesting.js:263` 에 **이미 있고 표시만 없다**; 단 `totalInk` 가 gap 팽창분을 포함해 과대, 분모도 usable 기준이라 재료비와 안 맞는다 → 팽창 전 잉크 보관 + mm 실시트 기준으로 보정할 것. 추천 폭은 `opts.tries` 성근 스캔 5폭 → 승자만 정밀 재실행(**조각 래스터는 폭과 무관해 재사용 가능**). 지표는 효율%가 아니라 **사용 면적(폭×소요길이)**. **스캔 실소요 시간 미측정** — 하네스로 먼저 재고 UI 를 정할 것.
3. **`mesCut_rasterizeItem` 임시문서 재사용** — 조각마다 문서를 열고 닫는다. 1개 재사용이면 생성/소멸이 사라진다. 오늘 `nestApply` 와 같은 파일이라 원인 분리를 위해 미뤘다.
4. **디자이너 PC 4대 `install-a0-panel.ps1`** — 그때까지 그 PC 들은 **shim 경유 옛 사각 동작**(고장 아님). 전 PC 설치 확인 후에만 호스트의 `mesA0_queueAddBatch`/`mesA0_autoDetect` shim 제거.
5. (이월) 실가공 자연검증 체인 — 아래 #23~#25 항목 참조.

## 핵심 판단·이유 (반복하지 말 것)

- **오분리의 근본은 하나였다: "사각으로 본다".** ia-editor 모아찍기=`{id,w,h}` 숫자 2개 / A0=bbox / 재단=픽셀. A0 는 실루엣으로 **완전 대체**했고, **ia-editor 는 현 구조로 못 고친다**(패커 입력이 주문 라인 치수뿐 — 도형을 얻으려면 일러 = 패널 경유). 완화책이 이미 두 번(클립 존중 경계·음수 gap) 들어가 있었다 = 같은 뿌리에서 계속 나온다는 신호였다.
- **★잉크 판정 `alpha` vs `white`** — 재단 패널의 `'white'`(흰 픽셀=배경)를 그대로 복사했다가 용준님 지적으로 정정. 재단은 *외곽을 따는* 용도라 맞지만 **분리는 "디자인이 어디 있나"라 흰색도 그림**이다. 대가=전면 덮는 배경 판이 섞이면 전부 이어져 1건 → **실패가 시끄러운 쪽을 골랐다**(white 의 실패는 행이 조용히 늘어 그럴듯해 보인다).
- **진단은 추정이 아니라 사실로.** 처음엔 잉크 덩어리 수(`comps>1`)로 "그룹을 푸세요"를 판정했는데 **틀린 접근**이었다 — 흰 요소 때문에 한 디자인도 여러 덩어리로 보인다. 그룹인지는 **파일이 아는 사실**(`typename==='GroupItem'`)이므로 호스트가 그대로 올려보낸다.
- **배정 단위는 개체(pageItem)** — 연결성분은 *영역*을 주지 아이템 목록을 주지 않는다. 선택이 그룹 1개면 잉크가 N덩어리여도 1행. 이건 한계지 버그가 아니다(용준님도 "그룹이면 하나로 보는 게 맞다" 확인).
- **버전 스큐 = 축2(Z: 즉시 전 PC) vs 축3·4(PC별 수동)** — 옛 진입점을 지우면 설치 안 끝난 PC 가 죽는다. **호환 shim 을 남기는 게 정석.** 이번에 지웠다가 되살렸다.
- **repo 사본 드리프트는 축 감사가 못 잡는다** — 축1~4 는 repo↔런타임만 본다. `geometry.js` 가 두 벌이 되면 양쪽 다 자기 런타임과 일치해 전 축 ✅ 인데 내용은 갈린다(하네스는 재단 패널 것만 검증 → A0 는 미검증 코드가 돈다). `audit:ia-jsx` 에 **repo 사본 일치 검사**를 신설했다.
- **활성문서 전환은 조각마다 하지 말 것** — 문서 간 duplicate 가 원본 active 를 요구하는 건 사실이지만, 시트 분량을 한 번에 복제하면 된다(조각당 2회 → 시트당 2회). 전환마다 화면 갱신이 붙는다.
- **UI 그룹을 접지 말 것** — 어제 2그룹으로 나누며 모아찍기를 접어 뒀더니 거래처·수량·가공자·등록이 통째로 안 보여 "거래처 입력이 안 된다"는 보고를 받았다. **그룹은 구분이 목적이지 숨기는 게 목적이 아니다.**

## 주의사항

- **스모크는 마스크를 흉내내지 않는다** — `panel-smoke.mjs` 가 캔버스로 **진짜 PNG** 를 만들어 넘겨 `inkMask→components→배정` 을 헤드리스로 태운다. 케이스는 `window.__seedCase`(grid/diag/group/white)·`__seedMode`(mask/bbox)로 고른다. **테스트가 헛도는지 확인했다** — `alpha`→`white` 로 되돌리면 흰색 케이스가 실제로 FAIL 한다.
- **heredoc 으로 정규식 든 코드를 쓰지 말 것** — `\r\n` 이 실제 CR/LF 로 치환돼 소스가 깨졌다(`node --check` 가 잡았다). 큰 블록 교체는 Write 로 스크립트 파일을 만들어 실행하거나 Edit 도구를 쓸 것.
- `panel:smoke` **114** · `cut:smoke` **49** · `cut:nest` 통과 · `audit:ia-jsx` 4축+사본 0.
- Z: 백업 = `_backup\a0-panel-20260731-163606` · `_backup\cut-panel-20260731-165841` · `mes-a0-host.jsx.bak-20260731-163606` · `mes-cut-host.jsx.bak-20260731-165841`.

---

# 세션 핸드오프 — 가공대기함 묶음 프리필 + 트레이 관리·파일명·PNG + 취소주문 2단계 삭제 (2026-07-31 #23~#25)

> **prod 3회 배포 + 축1 에이전트 재기동 완료** — 묶음 프리필 `737ecbbc` · 트레이/파일명/PNG `1a66d922`(+Program.cs, 에이전트 PID 9760 재기동) · 2단계 삭제 `a621cdd6`. 마이그 없음. CI 스모크 전부 success·마커 실측 전부 OK.
> durable = [[design-tray-bundle-prefill]] · [[feedback-ia-jsx-runtime-path]](축1 절차 추가)

## 이월 TODO 통합

1. **실가공 자연검증 잔여 = 저장 이후 체인 (다음 실주문에서 확인만)** — ~~프리필 묶음 구성~~·~~취소주문 완전 삭제~~는 **용준님 실사용 확인 완료(07-31)**. 남은 것: ①묶음 주문 **저장** → 대기물 absorb('처리됨 보기'에 주문반영) ②카드 수량 = 자식 수량 합 ③**신 파일명**(`거래처-규격-내용-후가공-수량EA-주문번호-FFF`) 출력 + PNG `미리보기\` ④RIP 실출력 → **출력완료 카드 매칭**(신 파일명 첫 실전). prod 실측(07-31 낮): 오늘 저장 주문 0건 = 아직 미발생. 에이전트 재기동분 정상 폴링(PID 9760).
2. (이월) 디자이너 PC 4대 `install-a0-panel.ps1` 잔여분 — #18 항목 참조.

## 핵심 판단·이유 (반복하지 말 것)

- **"원래도 묶어서 했다"는 기억이 맞았다** — 묶음 품목(부모+자식 `parent_item_id`)은 주문서→카드→에이전트 출력까지 전 구간 살아 있었고, 갭은 트레이 프리필이 그걸 안 쓰는 것뿐. **기존 구조를 태우는 쪽**(자식=-3+자기 분석ID)을 택해 서버 수정이 거의 없었다.
- **`child_direct_file_path` 없으면 묶음-only 주문은 AI_PROCESS 태스크가 안 생긴다** — calc.js 직접연결 수집이 부모/일반 행만 스캔했음. 묶음 프리필 만들 때 반드시 같이 챙길 것.
- **파일명 변경은 웹 정규식(printEvents resolveCard) 먼저 배포 → 에이전트 교체 순서** — 역순이면 신형식 매칭 유실. LogWatcher C# 쪽 anchored 정규식은 **매칭에 관여 안 함**(서버가 파일명에서 재추출이 정본 — E-접두 도입 후 이미 사문).
- **축1(에이전트 exe) = repo `bin\Release\net8.0\win-x64` 가 곧 런타임** — 실행 중이면 빌드가 exe 복사에서 잠김(MSB3027, 컴파일은 성공). 절차: CPU delta로 유휴 확인→Stop-Process→dotnet build→Start-Process→`audit:ia-jsx`.
- **화석 가드 패턴** — 주문 삭제의 "이미 취소된 주문입니다" 400은 balance 캐시 시절 근거가 사라진 채 남아, 문서·구현된 ADMIN 하드삭제 경로와 UI(삭제 버튼 CANCELLED 노출)를 막고 있었다. **가드를 만나면 그 근거가 아직 유효한지부터 확인.**
- **멀티세션**: 재단 패널 세션과 동시 작업 — 커밋은 전부 경로지정 add, push는 fetch→`rebase --autostash`(superset) 후. 로컬 `deploy:prod` 금지(타 세션 dirty WIP 휩쓸림) — **push→CI 배포만 사용**했다.

## 주의사항

- 로그인 API 연타 시 rate limit(8초) — E2E는 토큰 1회 발급 후 재사용.
- prod 마커 grep은 배포 직후 엣지 전파 지연으로 MISS 가능 — 캐시버스터(`?cb=`) 붙여 재확인.
- Playwright 브라우저 인스턴스는 타 세션이 점유 중일 수 있음 — 콘솔 검증 대신 배포 HTML 인라인 스크립트 `new Function` 파싱 검증으로 대체 가능.
- 트레이 '처리됨 보기' 복구는 **주문 라인을 건드리지 않는다**(intake 링크만 해제) — absorbed 복구 후 같은 파일을 다른 주문에 다시 쓰면 분석 1개↔라인 2개가 될 수 있음(absorb 역추적은 미링크 후보만 잡아 안전하나 인지할 것).

## 빌드/검증 명령 (PowerShell)

```powershell
npm run verify                 # tsc + build
npm run check:dom              # 기준선 5건(items/*)
npm run audit:entity           # 60/60
npm run smoke                  # prod 104/104
npm run audit:ia-jsx           # 4축 드리프트 0 (에이전트/패널 건드렸으면 필수)
dotnet build IllustratorAutomat\IllustratorAutomat.csproj -c Release   # 에이전트 (실행 중이면 중지 후)
```

# 세션 핸드오프 — 후가공/대기함/주문 에누리 + A0 패널 P1·P2·P3 전량 (2026-07-30 #18)

> **prod 배포·검증 완료** — main `7a3a0086`(커밋 7개 `9ad3fd20`→`7a3a0086`)·deploy `cd59e08f`·마이그 **0501** 적용.
> durable = [[design-a0-panel-structure]] · [[design-order-line-discount]]
> 검증 = tsc 0 · build · entity 60/60 · check:dom **9→5** · prod 스모크 **104/104**(3회) ·
> 헬퍼 단위 **14/14** · **panel:smoke 50→100/100** · **재현 프로브 0/8** · **4축+`.debug` 드리프트 0**

## ⚠️ 다음 세션이 **가장 먼저** 알아야 할 것

1. **🔴 마이그 번호 충돌** — 내가 `0501_order_item_line_discount.sql` 을 **커밋 + prod 적용**했고, 동시에 돌던 이카운트 세션이 `0501_dongsan_import_set_bom.sql`(미커밋)을 만들었다. **번호가 겹친다.** 그쪽은 `0502` 도 갖고 있으니 **`0503` 이후로 재번호**가 필요하다. 내 0501 은 이미 prod 반영돼 되돌릴 수 없다.
2. **디자이너 PC 4대 배포가 유일한 잔여 작업** — 코드·데이터·Z: 배포본 전부 준비됨(4축 드리프트 0). 각 PC `Z:\DESIGNS\IA-등록\_scripts\install-a0-panel.ps1` + **일러 완전 재시작**. 확인 = 우상단 `A0-CEP-0.1.8 / 화면 0.1.10` · 가공자 4명만 · 김영주는 봉제 마감.
   **라벨이 바뀌었으니 안내 필요**: `단건 가공`→`1건 등록`, `일괄 확정`→`N건 등록`, **첫 사용 시 가공자를 골라야 등록됨**(이후 기억).
3. **`status:trim` 을 아직 못 돌렸다** — 배너가 14건(임계 12)이라 트림 대상인데, 이카운트 세션이 `PROJECT_STATUS.md` 를 계속 편집 중이라 **전체 재작성이 그쪽 미커밋 편집을 날릴 위험**이 있어 보류했다. 그 세션이 정리되면 `npm run status:trim`.

## 핵심 판단·이유 (반복하지 말 것)

### 진단 도구가 만든 오진을 먼저 걷어내야 했다
- 직전 세션의 "UNIQUE 가 안 걸린다"는 결론은 **Git Bash curl 이 한글을 CP949 로 보낸 것**이 원인이었다(기록된 함정). 한글을 서버로 보낼 때는 **node fetch** 를 쓸 것. 그 진단이 만든 mojibake 2행이 prod 드롭다운에 노출 중이라 함께 제거.
- 내 정적 검사도 오탐을 냈다: `?raw` 전역 충돌 **37건 → 실제 0건**(들여쓰기 16칸까지 잡아 함수 지역변수 포함). **이 파일군은 12칸이 최상위**다.
- 재현 프로브도 한 번 오탐했다 — 새 `requireWorker` 가드 때문에 배치가 시작조차 못 한 것을 "미잠금"으로 읽었다. **가드를 추가하면 기존 검증 도구의 전제가 바뀐다.**

### 한 곳을 고쳐 세 곳이 낫는 구조를 먼저 찾는다
- 썸네일: `has_thumbnail` 판정 1곳 → 주문서 트레이·ia-editor 대기함·주문 라인 프리필 **3곳 동시 해소**.
- 패널 잠금: 버튼별 `disabled` 를 `setHostBusy`+`BUSY_BTN_IDS` **한 곳**으로. 뿌리는 개별 결함이 아니라 **"새 진입점이 계속 새는 구조"** 였다.
- 금액: 산식이 서버 5곳 복붙 → `utils/orderLineAmount` 단일소스(`rollConsumption`·`messageBulkLimit`·`stripFinishing` 과 같은 정리).

### `order_items.amount` 의 **의미를 바꾸지 않은 것**이 에누리 설계의 핵심
소비자 전부가 '그 행의 최종 금액'으로 읽으므로(`taxInvoices/helpers.ts:453`·`departments.ts:183`·`reports.ts:126,143`) 의미를 유지하고 컬럼만 가산하면 **회계 경로가 코드 수정 0 으로 자동 정합**된다. ⚠️`auto_amount` NULL 금지(COALESCE 폴백 이중계상).

### 배포 직후 검증 실패는 롤백 근거가 아니다
**전파 지연을 이 세션에서 3번** 겪었다(`has_thumbnail`·페이지 HTML·번들 마커). 브라우저는 캐시된 페이지를 보므로 **고유 URL 로 재로드**해야 새 코드가 잡힌다.

### 사람 판단이 필요한 것은 물었고, 아닌 것은 결정했다
사용자 결정 = 에누리 의미·범위제한 없는 수용·건수 표시 방식·검색 유지·연동 모델·실패분 보존·명단 기준. 내 결정 = 사유 선택(필수 아님)·`.debug` 삭제 대신 감사 편입·**`main.js` 분할 보류**(CEP plain `<script>` 라 closure 상태를 전역으로 끌어내야 하고 이득은 탐색 편의뿐인데 직전 2회차에 막 고친 코드의 전 호출지점을 건드린다).

## 밟기 쉬운 함정 (이 세션에서 실제로 밟음)

- **SQL 템플릿 리터럴에 설명 주석 금지** — 백틱이 리터럴을 끊고 주석이 매 쿼리에 실린다.
- **`entity_id` 는 주문 생성 body 로 안 먹는다** — 세션 법인이 이긴다. E2E 는 생성 후 **주문·라인·카드·청구그룹·상태이력 5종** 정리.
- **패널 `gatherParams` 에 가시성 판정을 넣지 말 것** — 단건 전송에도 쓰는 함수라 넣으면 연동 행 키워드가 지워진다. 차단은 행 반영 지점의 책임.
- **`updateApplyBar` 만 고치면 안 된다** — `applyTabUi()` 가 호출해 주지 않아 탭 전환 시 잠금이 안 걸렸다(스모크가 잡음).
- **취소 문구를 `step()` 에서 `out()` 하면** `finishBatch` 완료 메시지가 덮는다.
- **config.json 은 에이전트가 ~5분 주기 브로드캐스트** — 마감·프리셋·매핑을 화면에서 바꿔도 패널 반영까지 최대 5분(즉시 원하면 에이전트 재시작).
- **셀렉터 한 글자** — `[id^="item-"]`=부모/일반만 / `[id^="item"]`=자녀행 포함.

## 검증 명령 (PowerShell)

```powershell
npm run verify                      # typecheck + build
node scripts/entity-audit.mjs       # 60/60
npm run check:dom                   # 5건 = 새 기준선(직전 9)
npm run panel:smoke                 # 100/100
npm run audit:ia-jsx                # 4축 + .debug 드리프트
npm run smoke                       # prod API 104
```

---

# 세션 핸드오프 — 동산 이카운트 매출 적재 준비 완료·prod 승인 대기 (2026-07-30 #17)

> **API 오류로 끊긴 이관 세션 재개분.** 품목 트랙(0499·0500)까지는 직전 세션이 완결(prod 적용됨).
> 이 세션 산출 = **매출 적재 SQL 생성기 + 리허설 전항목 PASS**. prod 미적용 — **용준님 "산출물 먼저 검토" 선택, 적재 승인 대기 상태.**

## 상태 (다음 세션이 이어받을 것)

1. **생성기** = `docs/dongsan-import/gen_sales_sql.py` (추적 대상). 입력 = prod 스냅샷 2개(스크래치패드 `clients_ids.json`·`items_full.json` — 유실 시 SELECT 재실행, 파일 헤더에 쿼리 명시).
2. **산출** = `docs/dongsan-import/load/` (gitignore됨 — 담당자명·배송처주소 PII): `sales_2601~2606.sql`(전표 7,446·라인 **16,873 = 원천 그대로**, SET 한줄 방식이라 부속 분해 0) + `rollback_sales.sql`(마커 기준) + `SUMMARY.md` + `매핑감사.csv`(--audit 산출).
2-1. **마이그 0503·0504 prod 적용완료** (items 937→**964**. ⚠️원래 0501·0502로 만들었으나 **동시 세션이 0501을 선점**(`order_item_line_discount`)해 개명 — 적용은 구번호 시절 완료라 재적용 불요): 0503=깃대조립 SET 9종+수기대조립 SET 5종(`{PFX}-GDSET-*`·`TGK-SGSET-*`)+R120 깃대+UV-PATC·UV-TENT + **BOM 28행**(`product_materials` — `bom_items`는 은퇴 테이블이라 안 씀. 수량 컬럼 없음=구성품 1EA 해석). 0504=결정 11건 반영(간판자재 SGM 활성화 3종·신설 3종, 농협시트 LB 2종, ACC-037 유리섬유깃대, ACC-035-R-D ㄷ자꽂이, UV-PC-4.5T-M, TGK-8-1(105×70), AQ-BUJIK). **⚠️D1 함정: 행값 `IN (VALUES ...)`이 에러 없이 0행 매칭 — CTE JOIN 필수**(0503 주석).
2-5. **✅기타거래처 AR·계산서 제외 (2026-07-31 — prod 배포완료 main `d41699b5`·CI success·배포 후 실측 3/3 PASS. ⚠️이관 커밋 해시 rebase 변경: `f10a8fac`/`e3dce0b3`/`ad93ac07`)**: 신설 `constants/arPolicy.ts`(`excludeArExcludedClientsSql`=내부법인+기타거래처·`isCashRetailBrn`). AR 표면 10파일 22곳 교체(AP/발주·매출원장은 의도적 미변경) + 발행 가드 3곳(**all-zero BRN이 체크섬 통과라 기존 `!brn` 검사 무력**). 계산서 후보는 `invoice_method='CARD'`로 이미 제외. 검증=tsc 0·build·entity 60/60·prod 시뮬(제외 차 2,126,880=기타 잔액 정확). **push=자동배포라 명시 요청 대기** — 배포 후 확인: 미수금 목록 기타거래처 부재·회계허브 AR −2,126,880·발행 400 문구.
2-4. **✅기초채권·차액 적재 prod 완료 = AR 완결 (2026-07-30 심야)**: `gen_opening_sql.py` — 기초 188곳 419,289,813(`E1-OPEN-{cid}`) + 회계매출 1곳(`E1-ACCT-*`) + **차액 38곳 15,863,323=adjustments**(deriveClientBalance 공식 그대로). 0506=기초 전용 미등록 6곳(오프라인광고 178.5M 최대). 선명은 기초 60.2M도 제외(ICM 정본). **★리허설+prod 양쪽 818곳 거래처별 잔액 대사 불일치 0 · 파생 AR 506,822,126 = 채권 잔액합−선명−자기 정확**. smoke 104/104. 이관 회계 트랙(매출·수금·기초·차액) **완결**.
2-3. **✅수금 적재 prod 완료 (2026-07-30 밤)**: `gen_payments_sql.py` — **수금현황엔 거래처코드 없음 → 이름 매칭 + 채권파일 거래처별 수금합계 전수 대사(불일치 0 assert)**. 마이그 0505=수금 전용 거래처 4곳(동명 사인나라 2곳은 채권 목표금액+적요 대표자명으로 분배 확증·PII gitignore). 제외=선명 7건 −4,674,452. prod 2,930=[은행연동] 3+적재 2,927·3,047,848,890 정확·smoke 104/104. **⚠️AR 중간 상태**(파생 ≈102M vs 채권 잔액 633.9M — 기초채권 479.4M 미적재라 정상). 다음=기초채권 `E1-OPEN-*`(채권파일 파서 재사용·차액 15.9M 처리 결정 필요).
2-2. **✅매출 적재 prod 완료 (2026-07-30 저녁)**: parts 19조각 전부 에러 0 적용 → prod 실측 = 주문 7,446·obg 7,446·라인 16,873·**공급가 2,885,353,724 오차 0**·부가세 264,740,802·월별 6개월 일치·고아 0·음수 60L·연결 15,842L(93.9%)·2,535M(87.9%)·**smoke 104/104**. **★동시 세션 0501이 `order_items`에 `auto_amount` 등 추가** — 적재분 16,873행이 auto_amount NULL이라 그쪽 백필 규칙대로 `auto_amount=amount` 채움(line_discount는 DEFAULT 0 자동). 검증 3항목 0.
3. **리허설 전항목 PASS** (`rehearse_sales.py`, 로컬 스키마 사본+prod 스냅샷 시드): 공급가 **2,885,353,724 오차 0**·부가세 264,740,802·음수 60L −8,858,817·전표↔라인 합 불일치 0·거래처 100%·롤백 PASS.
4. **품목 연결 94.3%L(15,911)·88.2%금액(2,544M)** (`--audit` 프로브 12축 클린·오탐 1). NULL 잔여 350M = **간판 완제품·시공 307M(보류 결정 유지)** + 일회성 43M — `item_id` NULL·원문 보존이라 소급 UPDATE 가능(⑪-C).
5. **확정 규칙(용준님, 2회차 11건 포함)**: 패트배너=수성 AQ-PAT(§⑥-1 "솔벤 확정" 기재는 R11로 덮임) · 아크릴 미표기=백색 · **깃대조립·수기대조립=SET 품목 한줄+BOM**(2라인 분해 폐기) · 폰지 140폭→PONGE-130 · 국기함 무등급=보급형 GDS-FB1 · 부직포=수성 출력 AQ-BUJIK · 간판은 **자재만** 등록(완제품·시공 NULL 유지) · 미니근조기(50×70 1L)=단발성 NULL 보존.
6. **매칭 재검토가 잡은 것**: ①`민방위 깃대조립`→TGK 오연결(기 종류 미구분)→`flag_pfx()` ②**규격 `N폭`=원단 롤 판매(R8)가 엔진에 빠져 제품으로 오연결**(열승화 폰지 63L·17.4M→PONGE/AQD/PAT/SVB/AQ1 원단 SKU) ③UV투명패트·UV텐트천=해당 UV 품목 없음→NULL ④변종규격 불일치 시 135X90 강제폴백 금지 ⑤규칙 순서(가로기깃대·차량용이 A1에 선점). **총액 검증은 item_id 오연결을 못 잡는다 — 프로브+상위 75행(금액 81.9%) 수동 검수가 정본 절차.**
6-1. **비차단 질문 1건**: `열승화 폰지 140폭` 5L·4.11M — PONGE 폭 축(85/95/130/150/180)에 140 없음 → NULL 보존 중. 신설 or 130/150 배정은 용준님 판단.
7. prod 상태: entity1 주문 = ICM 7건뿐(부분적재 오염 0). 적재 후 기대 = orders 7,446+7.

## 다음 세션 절차 (승인 시)

```powershell
# 1) prod 적용 — ★반드시 load/parts/ 조각 19개를 파일명순 순차 적용 (월별 원본 2.4MB는
#    --file 전례 상한 0.31MB의 8배라 미검증 → 0.8MB 조각으로 분할해 둠. 해시 일치 확증)
Get-ChildItem docs/dongsan-import/load/parts/*.sql | Sort-Object Name | ForEach-Object {
  npx wrangler d1 execute webapp-production --remote --file $_.FullName }
# 2) 실측 검증 = rehearse_sales.py의 불변식 쿼리를 --remote로 재실행 (총액·건수·월별·고아·거래처별)
# 3) 되돌리기 = load/rollback_sales.sql (마커 '동산 이카운트 이관 2026-07-30 판매')
# 실패 시: UNIQUE(entity_id, order_number)가 이중 적재를 에러로 차단 — 실패 조각부터 재개하면 됨
#   (조각 중간 실패 시 그 조각의 이미 들어간 전표만 rollback 마커 DELETE 후 해당 조각 재적용)
```

## 적재 전 점검 3축 (2026-07-30 — 전항목 PASS)
- **파일축**: 문장 수 7,446/7,446/16,873 정확 · 문자열 내부 세미콜론 0(wrangler 분리 함정) · 지수표기 0 · 제외 거래처(선명 id53·자기 id1271) 혼입 0 · UTF-8 무결
- **prod축**: entity1 주문 7건(ICM뿐) 유지 · `E1-%-I%` 충돌 0 · clients 2,755=스냅샷 일치 · items 964=스냅샷 일치 · **한글 --file 파이프라인 보존 확증**(0501 실측) · **UNIQUE INDEX(entity_id, order_number) 존재 = 이중적재 DB 차단**
- **심화축**: **거래처별 765곳 전수 대사(라인·공급가·부가세) 불일치 0** · 날짜 범위 0 · 수량 비정수 0 · 전표 유일 0 · obg↔orders 0 · 음수 전표 16·0원 전표 127(예상 범위)

- ⚠️ `amount` 재계산 금지·음수 그대로·0원 그대로 (INSPECTION "미결 0건" 표 8규칙이 정본).
- 남은 트랙: ①매출 적재(승인 대기) ②수금 2,934라인 ③기초채권 479.4M(선명 `SMP-OPEN-*` 전례=`E1-OPEN-*` 방식) ④`000-00-00000` 기타거래처 AR·계산서 제외 **코드 반영**(deriveClientBalance·계산서 후보 — 데이터가 아니라 코드에서 제외하는 설계, §⑧-5) ⑤미커밋 잔여물 커밋(0499·0500·docs·gen_sales_sql.py·.gitignore·PROJECT_STATUS).

---

# 세션 핸드오프 — A0 패널 리모델 + IA 배포축 근본 차단 (2026-07-29 #3)

> **웹 배포 없음**(`src/` 무변경). 산출=IA 에이전트/패널 런타임 + 감사·스모크 도구 2종.
> 커밋 9개 **전부 origin/main 반영 완료**(다른 세션이 pull --rebase 하며 함께 push — 일부 해시 변경: 탭 리모델 `fd882012`→`5fab025b`, 수량 3분화 `0f10a5c2`→`a62ee528`). 마지막 핸드오프 커밋만 미푸시.
> 검증=`audit:ia-jsx` 4축 · `panel:smoke` 28/28 · HTML id↔JS 48/48 · dotnet build 0err · **패널 0.1.3 실사용 등록 4건 정상**.

## 이월 TODO (이 세션분 — 위 #2 세션 목록보다 우선)

1. **클립 밖 아트 물리 제거 여부 결정** — `work.ai` 110MB(마스크 밖 벡터 전량 잔존). 출력은 클립이 살아 정상이라 급하지 않음. 자르면 용량·에이전트 다운로드·판 렌더가 줄지만 처리 시간↑·결과 미세 변동 가능. **사용자 판단 대기**.
2. **디자이너 PC 배포** — 축3(Z: `a0-panel`) 갱신 + 각 PC `install-a0-panel.ps1`. 현재 **어느 PC에도 미설치**, 이 PC 설치본만 최신.
3. ~~push 대기~~ → **완료**. 다른 세션이 rebase 하며 함께 push 했다(해시 변경 주의). ⚠️ 공유 체크아웃에서 동시 작업하면 내 커밋이 남의 rebase에 휩쓸린다 — worktree 격리 원칙 재확인.
4. **ia-editor 대기함 검색 UI 누락**(별건) — 주문서 트레이는 #576으로 서버검색·절단경고를 받았는데 ia-editor 만 빠졌다. `total`·`truncated` 를 응답으로 받아놓고 안 써서 "전체 N건"이 200 상한에서 **거짓**이 된다(`iaEditor.js:297`).
5. manifest `border_line` 은 ingest 가 무시(파일에만 남음). 운영 구분이 필요하면 컬럼 추가.

## 핵심 결정과 이유 (이 세션)

### IA 스크립트 배포축은 4개 — `npm run audit:ia-jsx` 를 먼저 돌린다
`git push`·`npm run deploy` 로 **절대 반영되지 않는다**. main에 있어도 런타임은 옛 파일일 수 있고 역도 성립 → **브랜치·커밋을 근거로 삼으면 양방향으로 틀린다.**

| 축 | repo | 런타임 |
|---|---|---|
| 1 에이전트 JSX | `IllustratorAutomat/*.jsx` | **실행 중 exe 폴더**(`Get-Process`). `publish\` 아님 |
| 2 디자이너 JSX | `designer/*.jsx` | `Z:\...\_scripts\` — 스텁 evalFile → **Z: 1개 교체로 전 PC** |
| 3 CEP 패널 배포본 | `com.mes.a0.panel/**` | `Z:\...\_scripts\a0-panel\` |
| 4 CEP 패널 설치본 | 같은 원본 | `%APPDATA%\Adobe\CEP\extensions\` — **PC별 복사 설치** |

- 축1은 `.csproj CopyToOutputDirectory=Always` → **빌드하면 자동 복사**. 진짜 함정은 *JSX만 고치고 빌드를 안 돌리는 것*. 급하면 `--sync-agent`.
- **축3만 갱신해도 반영 안 된다**(껍데기는 PC별 설치). 로직(축2)만 즉시 반영.
- 사고 원형: SheetLayout 폴백 수정(`5b6d345e`)이 exe 폴더에 미복사 → **모아찍기 판 렌더 6일간 실패**. 브랜치만 보면 "이미 고침"이었다.

### 패널 로직은 로드 시점에만 evalFile → 버전으로 확인
`jsx/host.jsx` 스텁이 Z: 정본을 **패널 로드 때 한 번만** `$.evalFile`. Z: 를 고쳐도 패널 재오픈 전엔 구버전이 돈다 — 실제로 클립 수정 후 추출이 여전히 겉보기로 등록됐고 **적용 여부를 알 방법이 없었다**. → 수정마다 `MESA0_VERSION` 을 올린다(패널 우상단 · manifest `script_version` 으로 역추적).

### 탭 = 작업 갈래(설정 종류 아님)
이전 `가공/후가공/큐` 는 설정 종류 기준이라 `용도` 라디오 하나가 세 곳을 원격 조작했다(버튼 의미·후가공 탭 잠금·힌트). 그 구조에서 "모아찍기인데 전체 1건 등록"이 났다.
- 지금 `단건`/`모아찍기`/`묶음`, **탭이 곧 용도**(라디오 제거, `modeValue()`=활성탭 파생).
- 후가공은 단건 탭 접이식으로 강등 → "잠긴 죽은 탭" 소멸.
- `setMode` 는 용도가 같으면 탭 미이동(묶음에서 행 클릭 시 단건 탭으로 튕김 방지).
- 큐 1개를 두 탭이 각자 렌더(`renderQueueInto`) — 쪼개면 host `$.global.mesA0Q` 까지 갈라 Z: 축을 건드린다. 대신 용도 섞이면 등록 거부.
- **1덩어리 경고** 신설. 이전 "조각 1개면 즉시 등록" 경로가 사고의 직접 원인이라 철거.

### 수량은 경로마다 실효가 달라 3분화
- 단건 → 주문서 트레이가 **라인 수량 프리필**(`orderForm/intake.js:442`). 실효 있음
- 모아찍기 → ia-editor 가 `intake.qty` 를 **안 쓴다**(`iaEditor.js:1892` `qty:1` 고정, 판짜기에서 재입력). **실효 없음**
- → `#qty`(단건=최종값) / `#seedQty`(묶음=새 행 기본값) / 모아찍기=**수량 안 받음**. 행↔폼 왕복 제거(정본 1곳).
- **배율은 공통 헤더 유지** — `realW = 파일cm × N` 이라 모아찍기 등록 크기에도 실효.

### 등록 크기 기준 = 클립 마스크 존중 (형제-불완전 스윕)
실측(`:211`)·개별추가(`:586`)·분리(`:653`)는 이미 `mesA0_clipUnion` 인데 **등록 경로 `mesA0_process` 만** `mesA0_unionBounds`(겉보기)였다. 클립으로 8.66×19.67cm 로 잘린 디자인이 겉보기 53.9×24.3 으로 잡혀 배율10에서 **539×243.3cm** 등록.
- `realW/realH` 를 거쳐 **manifest `measured_cm` · 파일명 `sizeStr` · 패널 완료 메시지**가 한꺼번에 교정.
- 임시 캔버스는 겉보기 유지(`vbAll`) — 클립 밖 아트 담을 자리를 두려던 의도. 아트보드는 `db`(클립 존중)로 재설정.
- 검토문서 타일링(`:763`)의 `unionBounds` 는 **배치 상대 오프셋**이라 겉보기가 맞다 — 그대로.

### 조기 return 은 반드시 `_ia_status` 설정
`""` 는 "미실행/모달"이라는 **특정 진단**으로 UI에 뜬다. SheetLayout 조기 return 6곳이 전부 미설정이라 파라미터 누락·소스 없음·조각 0개·**preview 정상종료**까지 같은 문구로 뭉개졌다. 전 경로 사유 부여 + 실패 메시지에 `JsxFingerprint`(파일@시각·해시8) 동봉.

### 돔보·재단선은 다른 물건 (사용자 문의 답)
- **돔보(원)**: 경계에서 바깥 **17mm**(중심) · 지름 6mm → 바깥 끝 20mm. EPS 실측 검증(128×60 → 132×64mm, 각 변 +2.0mm=파일기준).
- **재단선/CutLine**: 디자인 경계 **위**(거리 0). 도련이 걸리면 Design 클립만 확장돼 재단선이 아트 안쪽에 놓인다.
- "사각형 두 줄"의 정체는 돔보가 아니라 **백색 출력 경계선**(마감 여백 바깥 0.5pt). 마감 0이면 디자인 경계와 겹친다 → **on/off 토글 신설**(기본 ON, `P.border_line !== false` 로 구 패널 하위호환).

## 주의사항 (밟기 쉬운 함정)

- **패널 껍데기 수정 → PC별 재설치 필수.** Z: 갱신만으로 반영 안 됨.
- **패널 수정 후 `npm run panel:smoke`**(28항목). 이 스모크가 실제 버그를 잡았다 — `#finBody`(id)가 `.hidden`(클래스)을 이겨 접힘이 안 먹던 것. **CSS 특이성 사고는 눈으로 안 보인다.**
- 스모크 스텁은 **`window.__adobe_cep__`** 를 심어야 한다. `CSInterface` 를 갈아끼우면 패널이 자체 shim 을 나중에 로드해 덮어써 무의미.
- 패널 HTML 수정 시 **id ↔ JS 참조 대조**(현재 48/48). `$('id')` 대상이 사라지면 silent fail.
- `.jsx` 는 `node --check` 불가(확장자 + `#target`) → `sed 's/^#/\/\/#/'` 로 `.js` 사본 검사.
- **COM wedge = 에이전트 렌더 잡도 같이 막힘.** MCP `illustrator/run` 이 12분 무응답 → TaskStop. 무거운 문서 열린 상태에서 COM 프로브는 피한다.
- **공유 체크아웃 동시 작업**: 다른 세션이 `git add -A` 로 작업 중이던 `SheetLayout.jsx`·`Program.cs` 를 무관한 커밋 `521f047f` 에 실어 push 했다. 동시 작업은 worktree 격리 원칙.
- 마이그 추적 어긋남으로 `wrangler d1 migrations list` 는 0314부터 전부 "미적용" 보고 → **스키마·데이터로 직접 확인**.

## MES 연결 점검 (세션 종료 시 실측)

- Z: manifest **58건 = `.ingested` 58건** · `.rejected` **0** · 미처리 **0**
- prod `designer_intakes` 64건: 크기 누락 **0** · 분석 연결 누락 **0** · 단건 24건 **전부 EPS 보유**(`file_path`=EPS 규칙 성립)
- 라우팅 실측: 주문서 트레이(`mode=single,both`) 23건 **전부 single**(누출 0) / ia-editor(`mode=impose,both`) 0건 — 전량 absorbed·void 라 정상
- EPS 디스크 실존 샘플 **4/4** · 패널 `0.1.3` 등록 4건 크기 정상(199.5×49.5·42×210·48.5×98.5·115×30)·`qty=1`·전부 absorbed
- DB 64 vs Z: 58 = 구 `mes-core.jsx` 5건(접두 없는 `0.1.0`) + 폴더 정리분. **누락 방향은 없다.**

## 검증 명령 (PowerShell)

```powershell
npm run verify                  # typecheck + build
npm run audit:ia-jsx            # IA 스크립트 4축 드리프트 (드리프트 시 exit 1)
npm run panel:smoke             # A0 패널 헤드리스 28항목
npm run smoke                   # prod API 104개
Get-Process IllustratorAutomat | Select-Object Id,Path   # 에이전트 런타임 폴더 실측
```

---

# 세션 핸드오프 — 코드 구조 전수 감사 + write-path entity 가드 (2026-07-29 #2)

> **prod 배포·검증 완료** — main `5733bbc2`(커밋 2개: `331ce7d5`·`5733bbc2`)·deploy success·마이그 없음.
> 검증=tsc 0 · build · entity **60/60 누락 0** · **prod 스모크 104/104** · 변경 라우트 5종 prod 실측 200.

## 이월 TODO (다음 세션 — 사용자가 명시적으로 이월 지시)

1. **ORDER BY tie-break 누락 55건** — `docs/audits/2026-07-27-list-sort-tiebreak.md`가 "발주 계열만 적용, 나머지 잠복"이라 남긴 그 잔여분. 목록=`node scripts/structure-audit.mjs --json` → `missingTieBreak`.
2. **도메인 서비스 추출 + 단위 테스트** — 러너는 **Vitest 확정**(Vite 5 이미 사용, 설정 공유). `routes/payroll/*` 계열(계산 40·34·33줄)부터 순수 함수 분리.
3. **대형 파일 분할 52개** — `bank.ts` 2,717 / `iaEditor.js` 2,489 / `shell.js` 2,458 / `ledger.js` 2,332 / `rip.ts` 2,180. 기존 성공 패턴(cards·items·orderForm) 확장.
4. **ambiguous entity_id 잠복 50건** — 이번에 `fixedAssets`·`waste` 2건만 실측 확정·수정. 나머지는 `node C:\Users\user\.claude\jobs\ef58dd9b\tmp\find-ambiguous.mjs` 류로 재생성 후 **반드시 실제 API 호출로 확인**(정적 판정은 오탐 다수 — smoke 104개가 통과하는 걸로 봐서 대부분 문제없음).
5. write-path 후보 잔여 13건 = 전부 오탐 확정분(caps 동기화·agentKey 경로·전역 sweep). 재검토 불요.

## 한 일

- **신규 감사 도구** `scripts/structure-audit.mjs` (`npm run audit:structure` / `audit:structure:gate`)
  6축: 크기 임계·write-path entity 비대칭·ORDER BY tie-break·dead export·라우트 계산밀집·중복 블록.
  baseline=`scripts/.structure-baseline.json`, entity 테이블 정본=`scripts/.entity-tables.json`(111개).
- **entity 가드 7곳** — inspections(검수 등록) · hr(근태 체크아웃·직원삭제) · fixedAssets(처분) · scan(POST /action) · waste(card_id) · orders/create(견적 카운터)
- 🔴 **`scan.ts:44` 실장애 수정** — `cards`에 `entity_id`가 **없다**(=`requesting_entity_id`만). `entityFilter`가 `AND c.entity_id = ?`를 만들어 **법인 선택 사용자(entityId≠0)의 카드 QR 스캔이 SQLITE_ERROR로 전면 실패**했다. ADMIN 전체모드(0)만 clause가 비어 우연히 동작 → 여태 미발견. `cardEntityFilter`로 교체.
- 🔴 **`fixedAssets`·`waste` 목록 500 수정** — alias 없는 `entityFilter(c)`가 JOIN 쿼리에서 bare `entity_id` 생성 → `ambiguous column name`. `entityFilter(c,'fa')`/`(c,'w')`. **선재 버그**(이번 변경과 무관, 검증 중 발견).
- `shipments.ts` merge에 status 검증(취소·삭제·초안·견적 주문이 합포장에 편입되던 형제 비대칭)

## 핵심 판단·이유 (다음 세션이 반복하지 말 것)

- **정적 스캐너 단독 판정 불가 — 오탐률 초기 97%**. write-path 초기 215건 → 실제 조치 5건(2.3%).
  오탐 제거에 5차례 보정이 필요했고 그중 **3번은 스캐너 자체 결함**: ① `c.get('user')`를 라우트 시작으로 오인 ② `cardEntityFilter`·`cardEf.clause`가 **대문자 E**라 소문자 패턴 미매칭 ③ 동적 `await import()` 미수집.
  → `audit:structure`는 **검토 큐 생성기**로만 쓰고 반드시 코드 대조. 수치를 결론으로 보고하지 말 것.
- **`.entity-tables.json`을 `LIKE '%entity_id%'`로 만들면 안 된다** — `requesting_entity_id`·`assigned_entity_id`가 부분 매칭돼 `cards`·`order_items`·`users`·`inter_entity_transactions`가 오판됐다. 컬럼 경계 정확 매칭 + 변종은 `variantTables`로 분리(격리 의미 있는 `cards`·`order_items`만 감사 대상 유지).
- **합포장 cross-entity는 오탐 = 요구사항** — `shipments.ts:264,267,314,368` 주석이 "법인 통합 뷰"·"목적상 entityFilter 미적용"·"법인 무관"을 명시. 필터 부착 시 기능 파괴(3법인 주문을 한 박스로 묶어 배송비 절감이 존재 이유). `WRITE_ALLOWLIST`에 근거와 함께 등록.
- **aiAnalysis 콜백도 오탐 = 의도** — `:334-335` "분석 행 entity ≠ 에이전트 토큰 entity일 때 404 나는 문제 방지". 역시 allowlist.
- **prod 배포 직후 검증은 전파 지연을 감안** — `fixed-assets`가 배포 직후엔 500, 잠시 후 200. 한 번 실패했다고 롤백 판단하지 말고 재확인할 것.
- 회귀 확인은 **prod 읽기전용 실측**으로 — `attendance` 4,245건·`employees` 112건 `entity_id` NULL 0 확인 후에야 필터를 붙였다.

---

# 세션 핸드오프 — auto-improve 백로그 **전량 소진** (10건 픽스 + #580 close) (2026-07-29 #1)

> **prod 배포·검증 완료** — main `9686bf69`(커밋 3개: `6ce18317`·`98865cf9`·`9686bf69`)·deploy success·마이그 없음.
> **GitHub OPEN 이슈 0건** 달성(직전 11건). durable=[[design-message-bulk-limit]]
> 검증=tsc 0 · build · check:dom **9(기준선)** · entity **60/60** · 로컬 스모크 **104/104** ·
> **prod 스모크 104/104** · **prod 번들 마커 13/13** · 페이지 8/8 · API 게이트 4/4(401).

## 한 일 (심각도순 10건)

| # | 요지 |
|---|---|
| 🔴**581** | `taxInvoices/batch.ts` `batch-create`·`monthly-create` **entity 필터 전무** → 타법인 사업자번호로 실제 계산서 발행. 미리보기 `monthly-eligible`까지 3곳 `entityFilter(c,'o')` |
| 🔴**573** | `sendBulk`·`adSend` → `safeSubmit`. 확인창이 2개 뜨던 이중 발송·이중 과금 차단 |
| 🟠**584** | 공용 헬퍼 `services/messageBulkLimit.ts` → 대량 발송 **4경로 전부** 건수 상한 |
| 🟠**572** | bank `batch-apply` 요청당 80건 + `has_more`, 프론트 이어서-호출 |
| 🟠**574** | `/send-bulk` 응답 `failed[]` + 실패자만 재선택 |
| 🟡**578** | 일괄적용 미리보기·건별 결과 모달·로딩 |
| 🟡**575** | 프리필 건별 try/catch(성공분만 캐시 정리) |
| 🟡**576** | 대기함 `q`/기간 검색 + `total`/`truncated`/`worker_names` |
| 🟡**577** | 가공자 매핑 드롭다운 + 기존 오타 매핑 경고 |
| ⚪**579** | `data-check-group="recipient-picker"` |

## 핵심 판단·이유

- **#581 가드 필터 선택 = id의 출처와 동일하게** — `batch-create`의 order_ids는 UI가 `GET /eligible-orders`에서
  뽑는다. 그 목록이 이미 `entityFilter(c,'o')`를 쓰므로 같은 필터를 가드로 쓰면 **목록에 보이는 id는 전부
  통과 = 구조적 회귀 0**. (#582에서 확립한 원칙을 그대로 적용)
- **미리보기까지 고친 이유** — 실발행만 필터하면 "미리보기 N건인데 발행은 M건" 불일치가 생긴다(형제 완전성).
- **⚠️ "필터 시 전멸" 회귀 아님을 prod DB로 실측** — [[feedback-ap-client-type-filter]]에 2회 전례가 있어,
  필터를 **완전히 뺀** 쿼리로도 2026-07 월합산 대상이 0건임을 확인(MONTHLY 거래처 112개 중 해당 월
  미발행 주문 없음). 배포 후 0건이 보여도 놀라지 말 것.
- **#572에서 `learnMatchRule` dedup은 일부러 안 했다** — 서브요청은 더 줄지만 `match_count`가
  자동매칭 신뢰도라 한 요청에 묶으면 학습 가중치가 바뀐다([[project-bank-fund-expansion]] 정밀도 우선).
- **#578 미리보기의 한계를 UI에 정직하게 반영** — '신규 생성 vs 기존 원장 연결'은 서버 `findLinkCandidates`
  판정이라 커밋 전엔 알 수 없다. 미리보기는 클라가 확실히 아는 것(거래처/비용분류·금액·건너뜀)만 보여주고,
  생성/연결 구분은 결과 모달에서 서버가 준 `link_mode`로 표시.
- **#574 `failed_identifiable`** — 바로빌이 단일 접수번호만 주면 건별 판정이 불가능하다. 빈 `failed[]`를
  "실패자 없음"으로 오인시키지 않도록 플래그로 구분해 UI가 그렇게 안내한다.
- **#576 `worker_names`는 전체 집합 DISTINCT** — 담당자 옵션을 로드된 rows에서 뽑던 게 "200건 밖
  담당자에겐 접근 자체가 불가"의 실제 원인이었다. 반환 페이지가 아니라 필터된 전체에서 뽑아야 해결된다.

## ★ 브라우저 실클릭이 또 잡았다 (정적 검사 전부 통과 상태)

대기함에서 **'내 작업' ON + 검색** → 헤더는 "(1건)"인데 목록은 "해당 조건의 대기물이 없습니다."
서버 검색은 맞았고 **클라이언트 필터가 가린 것**인데 빈 상태 문구가 정반대로 안내하고 있었다.
tsc·check:dom 9·build 전부 통과. → 빈 상태를 *"조회된 N건이 화면 필터에 가려져 있습니다 + [필터 해제]"*
로 교체(별도 커밋 `9686bf69`). **Phase 7b-2의 `first` 가드 버그와 같은 클래스** — 목록·필터를 건드리면
반드시 실클릭할 것.

## ⚠️ 주의사항 / 남은 것

1. **발송 계열 실호출은 미검증** — `/send-bulk`·`/ad/send`는 **테스트 호출이 곧 실발송**이라 부르지 않았다
   ([[design-ad-compliance-guard]] 함정, 실측 2회 기록). 상한·실패목록은 모의 응답과 단위 로직으로만 검증.
   → **소량 1건 실발송 자연검증 필요**(알림톡 7원 / MMS 100원. 테스트 수신번호 확정이 여전히 블로커).
2. **#584 기본 상한 500은 내가 정한 값** — SMS/LMS/알림톡 500, MMS 50(기존 승계). 거래처가 ~3,700이라
   "전 거래처 발송"은 8회로 나뉜다. 운영상 과하면 settings `sms_bulk_limit` 등으로 조정(코드 수정 불요).
3. **PROJECT_STATUS의 이슈 목록이 통째로 낡아 있었다** — #336·#340·#341·#342·#350·#366·#369·#370·#392·#393이
   전부 이미 CLOSED였다. 판단 전 `gh issue list --state open` **실측**할 것.
4. 로컬 D1 픽스처(`E2E-581-*` 주문, `E2E*` designer_intakes)·dev 서버·localStorage 전부 정리 완료.

---

# 세션 핸드오프 — Phase 7b-2 '파일 처리' 뷰 제거 = IA 진입점 통합 **전 단계 종료** (2026-07-28 #16)

> durable=[[project-ia-web-sunset]] · 결과 기록=`docs/HANDOFF-phase7b2.md`
> **prod 배포·검증 완료** — main `62fba6c4`(코드=`7c1fff74`)·deploy `2bf631f5`·CI 전건 success·마이그 없음.
> 검증=스모크 **102/102** · 페이지 15/15 · entity 60/60 · prod 번들 마커 전건 일치(NEW 6종 / OLD 12종 0) ·
> prod 실클릭(콘솔 0 · 대기함 실데이터 3건 batch 그룹핑 · 검수 2건 · 소스바 토글).
> ⚠️ 직후 **타 세션이 3커밋 선점**(광고성 발송 법적 가드 + auto-improve Area 2). ff 머지로 동기화했고
> 그쪽 `f80e02f5` 가 **내가 범위 밖으로 남긴 Konva 잔재 중 2개**(`iaeCanUpdateMembership`·`iaeCanSheetByUid`)를
> 정리 → 잔재 **15→13**. 머지 후 재검증(문법·dangling 0·check:dom 9·entity 60/60) 및 prod 마커 재실측 통과.

## 한 일

ia-editor 를 `[네스팅/모아찍기][시안 검수]` **2뷰 + 뷰 밖 공통 소스바**로 축소. `−704 / +115`.

- **제거**: 업로드·NAS에서 분석·처리설정 인스펙터(목표크기·마감·돔보·회전·저장스케일)·설정
  전체적용·그룹 카드 리스트·근사 미리보기·프리플라이트·활성 파일(`iaeActiveId/Group`) 개념
- **함께 정리한 기존 dead code**: `iaeHistCardHTML`·`iaeLoadKonva`·`iaeScaleHint`·`iaeAdvBody`·
  `iaeProcElapsedStart` + 이번 퍼지가 고아로 만든 `iaeScaleToken`/`iaeScaleLabel`
- **유지·이동(소스바)**: 모아찍기 대기함 · 에이전트 배지 · 세션 파일 탭 · **신규 파일 상태줄**
  (미완료 파일 안내 + 분석 취소 + 새로고침). 검수 뷰에선 소스바 숨김

## 핵심 판단·이유

- **인스펙터 설정은 배치가 읽지 않았다** — 네스팅·모아찍기는 `fin:{top:'',…}` 하드코딩 후
  자체 입력을 쓴다(`iaeCanNestPlace`·`iaeImposePlace` 전수 확인). 그래서 폼 제거 = 배치 무영향.
- **그룹 카드는 제거하되 상태줄을 신설**(사용자 선택) — 카드가 *분석 진행/실패/지연 + 분석 취소*를
  겸하고 있었고, 팔레트는 `status='done'` 만 노출해 미완료 파일이 사라진 것처럼 보이기 때문.
  분석 취소는 **서버 큐 정리의 유일 진입점**(탭 ×는 로컬 제거만).
- **프리플라이트는 함께 제거**(사용자 선택) — 인계 문서에 적힌 "텍스트 잔존·링크 이미지 경고"는
  **코드에 없었다**. 실제 경고 3종은 전부 인스펙터 입력값 의존이라 폼과 함께 죽는다.
  비율 왜곡 QC는 주문 생성 경로(`iaeDistortRatio`)에 살아 있어 공백 없음.
- **패널 등록분은 항상 `done`** (`workbench.ts:1272` `status='done'` 즉시 INSERT) → 업로드·NAS를
  지우면 이 화면에서 pending 이 생길 경로가 0.

## ⚠️ 다음 세션이 반드시 알아야 할 것

- **★뷰 전환이 팔레트를 갱신하던 경로가 사라졌다.** '파일 처리'→'네스팅' 이동이
  `iaeRenderCanvas()` 를 불러줬는데 뷰가 하나로 줄면서 그 경로가 소멸 → `iaeAfterFilesChanged()`
  신설(대기함 담기·탭 닫기 후 직접 재렌더). **done 그룹 지문이 바뀔 때만** 재렌더한다 —
  `iaeRenderCanvas` 가 좌측 폼을 통째로 다시 그려서 3초 폴링이 입력을 날릴 수 있기 때문.
- **정적 검사 전부 통과 상태에서 브라우저 실클릭만이 버그를 잡았다.** 위 재렌더에 `first` 가드를
  넣어 초기 로드를 건너뛰게 했더니 팔레트가 영영 비어 있었다. 초기 `iaeSetView('canvas')` 는
  `iaeRefresh` 응답 **전**이라 빈 팔레트를 그린다 → 첫 로드도 반드시 재렌더.
- **경계 초과가 또 났다** — NAS 블록 삭제가 `iaeRefresh` 의 닫는 `}` 를 삼켰고 assert 가 즉시 잡음.
  라인 범위 삭제는 **시작·끝 + 바로 바깥 한 줄 assert** 없이 절대 실행하지 말 것.
- **낡은 안내 문구도 퍼지 대상** — 팔레트 빈 메시지가 없는 화면("파일 처리 탭에서 업로드·추출")을
  가리키고 있었다. 2곳 정정.
- 프론트 호출 0이 된 라우트 3개(`workbench/files/analyze`·`ai-analysis/nas-listing`·`from-nas`)는
  **삭제하지 않았다** — 에이전트의 NAS 스캔 보고 쓰기 경로가 살아 있을 수 있어 확인 후 판단.

## 다음 TODO

1. **push 여부 = 사용자 결정** (push = 자동 prod 배포). 미푸시 커밋 `7c1fff74` 1건.
2. **디자이너 흐름 1건 자연 검증** — 패널 모아찍기 추출 → ia-editor 대기함 → 판 → EPS.
   각 구간 개별 검증 완료, 전 구간 연속 통과만 남음.
3. (선택) dead route 3개 + `POST /api/workbench/process` 계열 정리(에이전트 확인 후).
4. (선택) §14.5 폐기 Konva 캔버스 잔재 15심볼 — 퍼지 이전부터 참조 0, 별건 스윕.

## 검증 명령 (PowerShell)

```powershell
npm run verify; node scripts/entity-audit.mjs; npm run check:dom   # 9건=기준선
node --check src/scripts/iaEditor.js
# 브라우저 실클릭이 필수 — 정적 통과가 동작을 보장하지 않는다(이번에 실증)
```

---

# (이전) 세션 핸드오프 — IA 진입점 통합(Phase 1~8·7a·7b-1) + JSX 전량 은퇴 (2026-07-28 #15)

> durable=[[project-ia-web-sunset]]·[[feedback-ia-jsx-runtime-path]]. **main `1577c107` push·CI 전건 success.**

## ★ 목표 달성 — 진입점 4개 → 2개

| 전 | 후 |
|---|---|
MES가공.jsx · MES판짜기.jsx · A0 패널 · ia-editor(+/workbench) | **A0 패널** · **ia-editor** |

- **JSX 스텁 2개 전량 은퇴**(`retire-legacy-jsx.ps1`). 일러 Scripts 메뉴에 MES 항목 0개.
  보관함 `Z:\…\_scripts\_retired\20260728-164533`(판짜기)·`-170424`(가공) · 복구=`-Restore`
- **`/workbench` 페이지 제거** → ia-editor '시안 검수' 뷰로 흡수. prod 마이그 0478 적용
  (`permission_pages` is_active=0 — **삭제 아님**, `role_page_permissions` 3행 보존 확인)
- ia-editor = `[파일 처리][네스팅/모아찍기][시안 검수]` 3뷰

## ★ 최대 성과 — 판 렌더 EPS 미생성 근본 원인 해결

`SheetLayout.jsx` `_slOpenPrep` 이 **최상위 `GroupItem` 만** 조각으로 수집하는데 **패널이 만든 work.ai 는
아트워크를 그룹으로 묶지 않는다** → 조각 **0개** 인식 → 판이 빈 채로 나가 EPS 미생성.

- 성공 9건 = 전부 `Temp\IllustratorAutomat\req_N\`(IA 파이프라인, 그룹 있음) / 실패 전건 = 패널 소스
- **Z: 매핑드라이브·한글경로·멀티소스 개수·갓 띄운 일러는 전부 무관**(하나씩 실측 배제)
- 수정 = 그룹 0개면 전 레이어 최상위 아이템을 하나로 묶는 폴백(그룹 있는 소스는 미진입=회귀 0)
- 검증 = sheet #19 재큐 `groups=0→1`·`error→done`·EPS 35MB·JPG·DXF 실측

## 완료 커밋 (전부 push·CI success)

| 커밋 | 내용 |
|---|---|
| `592ced20` | Phase 5 은퇴 스크립트 |
| `f7350ea9`·`5b6d345e` | Phase 8 진단 캡처 + **EPS 근본 원인 수정** |
| `571d11d7` | Phase 6 ia-editor 단건가공·배치 제거(353줄) |
| `6fd45e27` | 문서·메모리 동기화(방향 전환 반영) |
| `90724486` | Phase 6 경계 초과 회귀 수정(`iaeHistLoading`) |
| `63983da9` | Phase 7a 고립된 가공 이력 보드 제거 + 낡은 문구 정정 |
| `1577c107` | **Phase 7b-1 검수 흡수 + /workbench 제거** |
| (Z:/DB 직접) | JSX 스텁 2개 은퇴 · prod 마이그 0478 |

## ⚠️ 다음 세션이 반드시 알아야 할 것

- **경계 삭제는 시작·끝 양쪽 + 바로 바깥 한 줄을 assert**. Phase 6에서 5줄 초과로
  `ReferenceError: iaeHistLoading` 회귀를 냈고(브라우저가 잡음), 같은 assert가 Phase 7a에서
  **두 번 더** 사고를 막았다(종료 경계가 `var iaeAgentStatusTimer` 였던 건 특히 위험).
- **제거 블록이 DOM 엘리먼트를 만들고 있는지 확인** — `#iaeAgentBadge` 를 가공 이력 보드 헤더가
  생성하고 있어서 보드를 지우면 에이전트 배지가 함께 죽었다(페이지 템플릿으로 이동해 해결).
- **정적 링크검사는 함수+변수 전수여야 한다** — 함수 호출만 보면 변수 참조 회귀를 못 잡는다.
- **`check:dom` 9건이 기준선.** 늘어나면 진입점만 지우고 핸들러를 남긴 것 — 훅이 이번 세션에
  총 5회 정확히 잡아줬다.
- **브라우저 실클릭이 유일하게 잡는 회귀가 있다.** Playwright 가 타 세션에 잠기면 Chrome 확장 사용.
  `confirm()` 쓰는 버튼은 클릭 금지(브라우저 블로킹) — API 로 검증.
- **`$.fileName` 은 `DoJavaScript(문자열)` 실행에서 무의미** — JSX 로그 경로는 에이전트가 주입해야 한다.
- **모아찍기는 마감 여백 미적용이 설계**(`mes-a0-host.jsx` `if (mode !== 'impose')`). 모아찍기+접어미싱
  조합은 실무에 없다(사용자 확인) → 판 배치에 마감 여백 반영 불요.
- 에이전트는 새 빌드로 상주(로그 캡처 중). JSX 2개 런타임 수동 동기화 완료.
- **실사용 0건을 근거로 쓰지 말 것**(사용자 정정) — 전체가 테스트 단계라 당연한 수치다.
  단 "경로가 통째로 전환된 패턴"(웹 업로드→패널)은 대체 정황으로 인정됨.

## 다음 TODO

1. **Phase 7b-2 = `docs/HANDOFF-phase7b2.md`** (프롬프트·위험·검증절차 전부 정리됨)
2. **디자이너 흐름 1건 통과** — 패널 모아찍기 추출 → ia-editor 대기함 선택 → 판 → EPS.
   각 구간은 개별 검증됨, 전 구간 연속 통과만 남음
3. (선택) `POST /api/workbench/process` dead route 정리 · 옛 AI추출·합판 패널 코드 완전 제거
4. (선택) 로컬 브랜치 17개 중 REVIEW 7개(스쿼시 이전 화석) — `npm run branch:clean`

## 검증 명령 (PowerShell)

```powershell
npm run verify; node scripts/entity-audit.mjs; npm run check:dom   # 9건=기준선
node scripts/nesting-harness.mjs --cases=1000 --seed=7777          # 3패커 1005/1005
npm run branch:clean                                               # 브랜치 위생(dry-run)
.\scripts\retire-legacy-jsx.ps1 -WhatIfOnly                        # 은퇴 대상(이제 0개)
# 에이전트 진단: Start-Process -RedirectStandardOutput 로 stdout 확보 후 시트 재큐
```

---

# (이전) 세션 핸드오프 — IA 진입점 통합 Phase 1~8 + 판짜기 은퇴 prod 완료 (2026-07-28 #15 초안)

> durable=[[project-ia-web-sunset]](★방향 전환 반영)·[[feedback-ia-jsx-runtime-path]]·[[project-ia-designer-loop]].
> **push 완료 `main == origin/main`(`571d11d7`)· CI 6회 전부 success.** 아래 #14는 같은 날 앞부분(#582·판짜기 겹침) — 보존.

## ★ 이번 세션 최대 성과 — 판 렌더 EPS 미생성 근본 원인 해결

`SheetLayout.jsx` `_slOpenPrep` 이 **최상위 `GroupItem` 만** 조각으로 수집하는데, **패널이 만든 work.ai 는 아트워크를 그룹으로 묶지 않는다** → 조각 **0개** 인식 → 판이 빈 채로 나가 EPS 미생성.

- 성공 9건 = 전부 `Temp\IllustratorAutomat\req_N\`(IA 파이프라인, 그룹 있음) / 실패 전건 = 패널 소스
- **Z: 매핑드라이브·한글경로·멀티소스 개수·갓 띄운 일러는 전부 무관**(하나씩 실측 배제)
- 수정 = 그룹 0개면 전 레이어 최상위 아이템을 하나로 묶는 폴백. 그룹 있는 소스는 경로를 안 타 회귀 0
- 검증 = sheet #19 재큐 → `groups=0→1`, `error→done`, EPS 35MB·JPG·DXF 생성 실측

## 완료 (커밋순)

| 커밋 | 내용 |
|---|---|
| `592ced20` | Phase 5 은퇴 스크립트 `retire-legacy-jsx.ps1`(내리기+`-Restore`) |
| `f7350ea9` | Phase 8 진단 캡처(JSX 반환값·trace 주입) |
| `5b6d345e` | **Phase 8 근본 원인 수정** |
| `571d11d7` | Phase 6 ia-editor 단건가공·배치 제거(353줄) |
| (앞서) | Phase 1 패널 중앙화 · 2 보급 스크립트 · 3 대기물 소비 · 4a 용도분리 · 4b 대기함 관리 |
| (Z: 직접) | **판짜기 은퇴 실행** — 스텁 제거, 보관함 `_retired\20260728-164533\` |

## 핵심 판단·이유

- **진입점 통합 방향이 뒤집혔다** — 옛 기록은 "웹 폐기→JSX 중심"인데 이번엔 **JSX 은퇴, 웹+패널 2개**. 패널이 `mes-core.jsx`와 동일 산출물을 내면서 도킹·배치 큐까지 갖췄고, 사용자가 셋 다 쓸 이유가 없다고 판단. durable 메모리를 그 방향으로 **재작성**했다.
- **패널 로직을 Z: 스텁으로 중앙화한 이유** — CEP는 각 PC `%APPDATA%`에 복사본이 있어 로직 수정마다 전 PC를 돌아야 한다. JSX 스텁 모델(Z: 1곳 → 전 PC)로 그 후퇴를 막았다. 보급 전에 넣지 않으면 나중에 전 PC를 다시 돌아야 했다.
- **대기물 소비 배선이 판짜기 은퇴의 전제였다** — 판짜기는 manifest `consumed_intake_ids`로 대기물을 absorbed 처리하는데 ia-editor엔 그 경로가 없었다. 없이 은퇴하면 대기함 무한 적체 + 같은 조각 이중 출력.
- **Phase 6은 한 번 멈추고 다시 했다** — "버튼 3개"로 잡았는데 12개 함수가 얽힌 353줄 퍼지였고, `iaeProcStopElapsed`·`iaeLoadFflate`·`iaeZipSafeName` 는 **캔버스/공용이 쓰는 공유 함수**였다. 호출 그래프 전수 대조 후 배타적인 것만 제거.
- **실사용 0건을 은퇴 근거로 쓴 것은 오독이었다**(사용자 정정) — 전체가 테스트 단계라 당연한 수치. 은퇴 판단에서 제외.

## ⚠️ 주의사항

- **`$.fileName` 은 `DoJavaScript(문자열)` 실행에서 무의미** — JSX가 쓸 로그 경로는 에이전트가 preamble로 주입해야 한다(`_ia_trace_path`). `ia_error.log`가 한 번도 안 남은 이유. 정본=[[feedback-ia-jsx-runtime-path]]
- **모아찍기는 마감 여백을 적용하지 않는 게 설계**(`mes-a0-host.jsx` `if (mode !== 'impose')`). "후가공이 안 먹었다"는 오해가 여기서 나왔고, 패널에서 모아찍기 선택 시 후가공 탭을 잠가 차단했다. 모아찍기+접어미싱 조합은 **실무에 없다**(사용자 확인).
- **check:dom 훅이 3번 잡아줬다**(9→16·11·10) — 진입점만 지우고 핸들러를 남기면 항상 null인 dangling 참조가 된다. 훅 신호를 따라가면 퍼지 완전성이 확보된다.
- **PS 5.1은 BOM 없는 UTF-8을 ANSI로 읽는다** — 한글 포함 `.ps1`은 **UTF-8 BOM 필수**(없으면 파싱 자체 실패). `install-a0-panel.ps1`에서 실증 후 `retire-legacy-jsx.ps1`에도 선제 적용.
- **에이전트 stdout은 기본 유실** — 진단 시 `Start-Process -RedirectStandardOutput` 으로 받아야 렌더 진행 로그가 보인다. `agent.log`는 하트비트/ingest만 남는다.
- 에이전트는 **새 빌드로 상주**(PID 45952, 로그 캡처 중). JSX 2개는 런타임 수동 동기화 완료(해시 일치).

## 다음 TODO

1. **`/ia-editor` 네스팅 실클릭 검증** — Phase 6 퍼지 후 브라우저 실동작 미확인(Playwright가 타 세션 점유). 정적 링크검사(dangling 0)·렌더 마커로 대체했음.
2. **디자이너 흐름 1건 통과** — 패널 모아찍기 추출 → ia-editor 대기함에서 선택 → 판 → EPS. 메커니즘은 #19로 검증됨.
3. **`MES가공.jsx` 은퇴** — 패널 숙달 후 `retire-legacy-jsx.ps1 -Core`(관리자).
4. **Phase 7** 검수·대기함 ia-editor 통합(범위 큼, 별도 세션).
5. (선택) 로컬 브랜치 17개 중 REVIEW 7개 — 스쿼시 이전 화석, 필요 시 `npm run branch:clean`.

## 검증 명령 (PowerShell)

```powershell
npm run verify; node scripts/entity-audit.mjs; npm run check:dom   # 9건=기준선
node scripts/nesting-harness.mjs --cases=1000 --seed=7777          # 3패커 1005/1005
npm run branch:clean                                               # 브랜치 위생(dry-run)
.\scripts\retire-legacy-jsx.ps1 -WhatIfOnly                        # 은퇴 대상 확인
# 에이전트 진단: Start-Process -RedirectStandardOutput 로 stdout 확보 후 시트 재큐
```

---

# 세션 핸드오프 — #582 워크벤치 IDOR + 판짜기 shelf 겹침 prod 배포 완료 (2026-07-28 #14)

> durable=[[reference-nesting-harness]]·[[project-ia-designer-loop]]. **prod 배포 완료** — main `adc13bef`(#582)·`38cc411e`(판짜기), CI 2회 전부 success(Typecheck·Build·Deploy·Smoke). 마이그 없음. 직전 #13의 🛑중단표 **2건 해소**(#582·ia-web-sunset), 남은 중단 3건은 아래 표.

## 이번 세션 완료

| # | 커밋 | 내용 |
|---|---|---|
| 1 | `adc13bef` | **#582** workbench `order_item_id` 크로스엔티티 검증(경로① + absorb 변종). 이슈 close |
| 2 | `4b8c250e`·`adfc0773` | `session/ia-web-sunset` 2커밋 cherry-pick (shelf 교체 + 조각 로딩 실버그 수정) |
| 3 | `38cc411e` | 판짜기 shelf **겹침 1줄 수정** + 하네스에 `sheetShelf` 패커 등록 |
| 4 | (Z: 직접) | **`Z:\DESIGNS\IA-등록\_scripts\mes-sheet.jsx` 교체** — 백업 `mes-sheet.20260721.bak` 후 복사, 리포와 해시 일치(`C8B1A7BC…`), **배포 실물을 하네스에 직접 걸어 1005/1005 확인**. 스텁이 매 실행 Z:를 읽으므로 전 디자이너 PC 즉시 반영 |

## 핵심 판단·이유

- **#582 가드 필터로 `entityFilter`가 아니라 `orderVisibilityFilter`를 골랐다** — 이슈 본문은 형제로 absorb의 `entityFilter(c,'o')`(엄격)를 지목했지만, 이 `order_item_id`의 **출처가 `/intake-config` open_lines(`:1140`, `orderVisibilityFilter`)**이고 `mes-core.jsx:275`가 그 목록에서만 id를 뽑는다. 엄격 필터를 쓰면 분할청구 혼합주문의 협업 라인이 **조용히 `absorbed=false`로 떨어진다**(에러도 안 남). 출처와 같은 필터 = 구조적 회귀 0 + 타법인 차단.
- **"머지냐 폐기냐"는 잘못된 이분법이었다** — 브랜치 2커밋의 성격이 완전히 달랐다. `31c88d00`은 **main에 살아있던 실버그**(cross-doc `duplicate(grp,…)` PARM 실패를 catch가 삼켜 빈 판→크래시, qty 복제 stale) 수정이고 COM 실측 기록까지 있었다. 통째 폐기했으면 판짜기가 계속 깨진 채였다.
- **겹침은 "이식이 나쁘다"가 아니라 "낡은 버전을 이식했다"였다** — 원본 `iaEditor.js`는 이미 고쳐져 있었고(`:1623`), 브랜치는 그 **이전** 코드를 떠왔다. 그래서 재작성이 아니라 **1줄 동기화**가 정답.
- **하네스에 등록해야 이 실수가 반복되지 않는다** — 눈으로 "겹칠 것 같다"까지는 갔지만, 실제 규모(1,005케이스 중 584 실패·겹침 3,203건)는 하네스가 알려줬다. 수정 후 1005/1005 + 실사례 total_height가 iaEditor shelf와 완전 일치.

## ⚠️ 주의사항 (다음 세션이 반드시 알아야 할 것)

- **★git 미머지 ≠ 미배포** — `session/ia-web-sunset`이 main에 없어서 "미적용"으로 판단했는데 **Z: 정본은 이미 그 브랜치 tip과 byte 동일**이었다(07-21 수동 배포). 겹침 버그 패커가 **7일간 디자이너 PC에서 운영 중**이었던 것. 웹은 `deploy.yml` 자동배포라 "main에 있으면 이미 prod"가 성립하지만 **역은 성립하지 않는다**. JSX 판단 전엔 브랜치가 아니라 **런타임 실물(Z: / exe 폴더)을 대조**할 것. 정본=[[feedback-ia-jsx-runtime-path]]
- **판짜기는 A0 CEP 패널이 아니다** — `com.mes.a0.panel`의 `host.jsx`·`main.js`에 sheet 참조 0건(실측). Scripts 메뉴 독립 실행이고, 스텁이 `Z:\DESIGNS\IA-등록\_scripts\mes-sheet.jsx`를 매 실행 `$.evalFile` → **Z: 파일 1개 교체 = 전 PC 반영**(PC별 재설치·CEP 핫스왑 불요).
- **JSX는 웹 번들에 안 들어간다** — `38cc411e` 배포는 디자이너 PC와 무관했다(이번엔 Z: 직접 교체로 해소). 파일 크기 비교는 CRLF·BOM 때문에 오판하니 `git diff --no-index --ignore-cr-at-eol`로 볼 것.
- **`node --check`가 `.jsx`를 못 읽는다**(확장자 거부 + `#target`=private field 파싱 오류). 문법 검증은 `#directive`를 주석 처리한 사본을 `.js`로 만들어 검사할 것.
- **판짜기 shelf엔 회전 잠금(allowRotate)이 없다** — 항상 회전한다. 방향성 소재를 판짜기로 다루게 되면 추가 필요(하네스는 이 패커만 항상 회전 허용으로 판정 중).
- **패커를 다른 파일로 이식할 땐 원본의 버그 이력부터 확인**할 것. 이번 겹침의 근본 원인.
- **`window.MMS_IMAGE` 주입처 없음은 오기록** — `layout.ts:212`가 주입 중. 상한 상향은 `constants/barobillCodes.ts:160` 1줄로 서버·클라 동시 반영된다.

## 🛑 남은 중단 (직전 세션에서 승계 — 3건으로 축소)

| 건 | 왜 멈췄나 |
|---|---|
| MMS 규격 상향 · 알림톡 실검증 | **블로커 동일 = 테스트 수신번호 1개 확정**. 확정되면 2건 동시 해제(알림톡 7원 + MMS 계단 4건 ≈ 400원, 실패분 과금 0) |
| IA 실가공 자연검증 · 판짜기 E2E · #310 직접발행 폼 | 현장·실사용 작업. 판짜기 코드·배포는 완료 — 남은 건 **디자이너가 실제 판을 한 번 짜서 겹침 해소 확인** |

## 다음 TODO

1. ~~판짜기 Z: 동기화~~ **완료**(위 표 #4). 남은 것 = 디자이너가 실제 판 1건을 짜서 **겹침 해소 자연 검증**. 되돌리려면 `Z:\…\_scripts\mes-sheet.20260721.bak` → `mes-sheet.jsx`.
2. **auto-improve 다음 순번 = Area 6**(백로그 메타의 `last_run_area` 확인 후).
3. `quotations.ts`·`taxInvoices/batch.ts` N+1 별건 재감사 → Area 2.
4. (선택) 브랜치 정리 — `session/ia-web-sunset`(내용 전량 main 반영)·`claude/peaceful-ride-ia0bN`·`feat/ia-multisource-imposition`. ⚠️로컬 미머지 브랜치는 **122개**(대부분 봇 잔재)라 개별 삭제보다 일괄 스윕이 실익.
5. (별건 판단) `workbench.ts:1201`이 body `entity_id`를 세션 법인과 대조 없이 신뢰 — 타법인 대기함에 행 생성 가능(#582 동류, 낮은 심각도). 에이전트 인증 경로 영향 확인 후 처리.

## 검증 명령 (PowerShell)

```powershell
npm run verify
node scripts/entity-audit.mjs
node scripts/nesting-harness.mjs --cases=1000 --seed=7777    # 3패커 전부 1005/1005 기대
# 판짜기 JSX 문법(#directive 제외 파싱) — .jsx 직접 --check는 실패가 정상
```

---

# 세션 핸드오프 — 문서 인프라 정비 + 자동 트림 + 잠복 재검증 prod 배포 완료 (2026-07-28 #13)

> durable=[[feedback-claude-structure-opus48]]·`docs/HANDOFF-doc-diet.md`. **prod 배포 완료** — main `dc514a40`, CI 자동배포(`deploy.yml` main push 트리거), **Typecheck·Build·Deploy·Smoke 전 단계 통과**. 검증=root 302·API 3종 401(contact-groups/orders/workbench). 마이그 없음(prod DB 직접 변경 1건은 아래 ②).
> ⚠️ **rebase 주의**: push 시점에 타 세션이 3커밋 선점(Area 5 보안 45회차 + XSS 3곳 + 배치캡) → 파일 충돌 0 확인 후 rebase·재verify·push. 멀티세션 상시 가정할 것.

## 이번 세션 완료

| # | 커밋 | 내용 |
|---|---|---|
| 1 | `4e71646b` | `.claude/worktrees/` gitignore — 리포 사본 1,216파일/16MB 오커밋 차단 |
| 2 | `f8cdab29` | 법인간거래 미러 SQL 7파일 추적 등록(미커밋 방치 → 유실 위험 해소) |
| 3 | `a90c53bd` | **Opus 5 반영 + 문서/스킬 정합성 감사**(15파일) |
| 4 | `ce108051` | 다이어트 인계 문서 `docs/HANDOFF-doc-diet.md` |
| 5 | `83087cb1` | README IllustratorAutomat 섹션 현행화 |
| 6 | `8a72ee1d` | **PROJECT_STATUS 다이어트 192KB→43KB(77%↓)** |
| 7 | `1921e7ef` | **IMPROVEMENT_BACKLOG 다이어트 196KB→63KB(68%↓)** |
| 8 | `19ea9aed` | auto-improve Area 4 46회차 — #580 발견 |
| 9 | `e231d331` | **백로그 자동 트림** `scripts/backlog-trim.cjs` |
| 10 | `fcb9ec15` | **현황판 자동 트림** `scripts/status-trim.cjs` + BOM 검증 버그 수정 |
| 11 | `f57abc96` | **#580** 비활성 거래처를 대량발송 대상에서 제외 (`is_active=1` 필터) |
| 12 | `dc514a40` | 미해결 잠복 6건 **prod 실태 재검증** — 4건이 이미 배포된 상태였음 |
| ※ | prod DB | 워크벤치 `role_page_permissions` DESIGNER `can_access` 0→1 (UPDATE) |

## ★ A~F 순차 처리 결과 — "남은 작업" 대부분이 이미 끝나 있었다

**핵심 교훈**: `deploy.yml`이 **main push 자동배포**다. main에 코드가 있으면 **이미 prod**이므로, "커밋·미배포" 기록을 믿고 재배포하려던 것을 prod 실측으로 정정했다. 앞으로 잠복 처리 전 **반드시 prod 실태부터 확인**할 것.

| 그룹 | 결과 |
|---|---|
| **A** 배포 대기 5건 | 실제 조치는 **1건뿐**(워크벤치 DESIGNER 개방). 나머지 4건은 이미 배포됨 — 상세는 PROJECT_STATUS 잠복 표 |
| **B** 사용자 결정 | #580만 처리·배포 완료. 나머지(제안 189건 검토·한진 선정·바코드 구체화·#336 비번)는 **owner 액션** |
| **D** 실검증 | **전부 중단** — 알림톡(수신번호 필요)·MMS(바로빌 공식 규격 미확보)·IA 실가공/#310(현장) |
| **F** IA 트랙 | 미머지 브랜치 3개 중 **2개는 이미 main 반영된 잔재**(`claude/peaceful-ride-ia0bN`·`feat/ia-multisource-imposition` — 삭제 가능). 1개는 중단(아래) |

## 핵심 판단·이유

- **PROJECT_STATUS 다이어트는 부채 정리가 아니라 장애 복구였다** — `CLAUDE.md`가 "세션 시작 시 읽기"를 지시하는데 192KB라 **302줄 중 33줄만 로드되고 잘렸다**. 매 세션 현황 파악이 상단에서 끊기고 있었음. 원인은 "🔴 현재 진행 중" 섹션(122KB, 64%)의 57항목 중 **45개가 이미 완료된 배포 기록**이었던 것.
- **수동 트림이 7차까지 반복됐기에 자동화했다** — 사이클 로그 1건 = 4~5KB, 배포 배너도 매번 누적. 스크립트로 고정하지 않으면 이틀에 한 번 같은 일이 재발.
- **SKILL 지시가 아니라 실행 파일로 만든 이유** — "이렇게 트림해라"라고 적으면 매 사이클 LLM이 스크립트를 새로 쓰고, 그때마다 실수 여지가 생긴다. 실제로 1차 시도에서 bash 인라인 백틱이 명령 치환으로 해석돼 표 3건이 **조용히 유실**됐다(지문 대조로 검출·복구).
- **모델명 하드코딩을 1곳으로 모았다** — `references/agent-team-guide.md:3`만 고치면 되게. 나머지 문서·스킬은 "세션 모델"로만 지칭.
- **과다 위임 억제를 신설** — Opus 5는 이전 세대보다 subagent를 적극 호출하는 성향이라 이 프로젝트의 "인라인 우선" 원칙과 충돌. 검증 목적 위임 금지·소규모 작업 직접 처리를 명문화(`agent-team-guide.md` §과다 위임 억제, CLAUDE.md에 1줄 포인터).

## ⚠️ 주의사항 (다음 세션이 반드시 알아야 할 것)

- **트림 스크립트를 다시 작성하지 말 것. 호출만 하라** — `npm run status:trim` / `npm run backlog:trim`. 임계 미만이면 no-op이라 조건 없이 불러도 된다. 무손실 대조·형식 계약·BOM을 검증하고 **실패 시 양쪽 파일을 원본 복구 후 exit 1** 한다.
- **BOM 함정** — `PROJECT_STATUS.md`는 BOM 파일이라 `/^# /m` 정규식이 **매치되지 않는다**. 이걸 놓쳐 픽스처 검증에서 정상 트림이 롤백됐다(안전장치는 의도대로 작동). 이 파일을 정규식으로 다룰 땐 BOM 제거 후 검사할 것.
- **문서 편집 스크립트는 파일로 작성해 실행** — bash 인라인은 백틱이 명령 치환으로 해석돼 내용이 조용히 사라진다. 위 유실 사고의 원인.
- **건드리면 안 되는 계약 절** — 백로그: 메타 주석 2종·통계 카운터·Approved/New/Auto-fixed/Done/Rejected 5절·오탐표·상태 가이드(13항목). 현황판: 상시 배너 6종(현재 초점·⚠️·블로커·다음 액션·핸드오프·멀티세션)·4개 섹션(11항목). 스킬이 매 사이클 읽고 쓰는 계약이라 하나라도 없어지면 오탐 재보고·카운터 유실.
- **`ARCHIVE` 2종은 삭제·재작성 금지**(이관 목적지). 트림은 항상 **앞에 붙이기**만.
- **`memory/session-context.md`를 정본으로 가리키는 옛 기록이 있으면 그건 깨진 포인터다** — 이 파일은 세션마다 갱신되므로 장기 정본이 될 수 없다. 발견 시 auto-memory로 정정할 것(품목 마스터 기록에서 실제 발생).

## 🛑 중단 — 다음 세션이 판단 후 재개할 것

| 건 | 왜 멈췄나 |
|---|---|
| **#582 워크벤치 IDOR** ⚠️최우선 | 타 세션이 같은 시각 보고. `workbench.ts` POST `/intakes`가 body `order_item_id`를 **entity 검증 없이 UPDATE** → 타법인 주문 라인 오염(write). **이번 세션이 DESIGNER 페이지 권한을 열어 노출면이 넓어진 상태**. API는 `requireRole`에 원래 DESIGNER 포함이라 이전부터 호출 가능했으나, 지금은 UI 진입점까지 열렸으니 **우선 수정** 권장. 되돌리려면 `role_page_permissions` DESIGNER를 0으로 |
| `session/ia-web-sunset` 머지 | 브랜치가 `iaeShelfBinPack` 이식(주석 명시)인데 이후 세션이 **shelf 겹침 버그를 실증**하고 정본을 **maxrects로 고정**. 그대로 머지하면 알려진 버그를 JSX 판짜기에 도입 → maxrects 기준 재작성 판단 필요. [[reference-nesting-harness]] |
| MMS 이미지 규격 상향 | 바로빌 개발자센터가 SPA라 공식 규격 못 읽음. 확보한 건 통신사 표준(300KB·SKT/KT 1280×960). 현재 `MAX_BYTES=300KB`(표준 일치)·`MAX_PX=1000`(보수적, `shell.js:_mmsLimits`, `window.MMS_IMAGE`로 오버라이드 가능하나 주입처 없음). **실발송 검증 전 변경 보류** |
| 알림톡 대량발송 실검증 | 수신번호 확정 필요(7원) |
| IA 실가공 자연검증 · #310 직접발행 폼 | 현장·실사용 작업 |

## 다음 TODO (이번 세션 발생분)

1. **#582 우선 처리** (위 중단표 참조). 형제 정답 패턴이 같은 파일에 있음(`entityFilter(c,'o')`).
2. **auto-improve 다음 순번 = Area 6**. 타 세션이 Area 5(45회차)를 돌려 `last_run_area`가 갱신됐을 수 있으니 백로그 메타 확인 후 진행.
3. **브랜치 정리**: `claude/peaceful-ride-ia0bN`·`feat/ia-multisource-imposition` 삭제 가능(main 반영 확인 완료).
4. `quotations.ts`(동적 IN절 1·for 5)·`taxInvoices/batch.ts`(동적 IN절 2) N+1 별건 재감사 → Area 2.
5. (선택) `IMPROVEMENT_BACKLOG_ARCHIVE.md` 609KB — 이관 목적지라 정상이나 필요 시 연도별 분할.

## 검증 명령 (PowerShell)

```powershell
npm run status:trim -- --check     # 현황판 트림 현황(유지/이관 목록), 파일 무변경
npm run backlog:trim -- --check    # 백로그 동일
node -c scripts/status-trim.cjs; node -c scripts/backlog-trim.cjs
# 코드 무변경 세션이라 build/smoke 불요. 코드 건드렸다면:
npm run verify
```

---

# 📌 이월 TODO 통합 (직전 3개 세션에서 승계 — 아직 살아있음)

## IA 세션루프 B단계 (#11, 아래 상세 참조)
1. **실가공 1건 자연 검증** — 디자이너 일괄 확정 → 대기함 트레이(batch_key 그룹핑·내 작업) → 주문 생성 → absorb. prod 대기함의 "내 작업"은 `worker_id` 있는 신규 회수분부터 유효.
2. **worktree 종료** — `.\scripts\end-session.ps1 ia-b-link -DeleteBranch` (병합 완료라 언제든 가능. ⚠️로컬 dev 서버(3000)가 이 worktree dist를 서빙 중이면 서버가 내려감 → 메인에서 `npm run build && npm run dev:d1` 재기동).
3. (이월) 판짜기 E2E · 하네스 `ship:gate` 편입 · 0.5mm 밀림(별건) · D8 확정 시 조직폴더 이동.

## MMS/대량발송 (#4, 아래 상세 참조)
1. ~~**수신거부(opt-out) 관리**~~ ✅ **완료(2026-07-28 광고성 발송 법적 가드 prod)** — `(광고)` 강제·무료
   수신거부 링크·야간 21~08 차단·6개월 필터·금지어. 정본=[[design-ad-compliance-guard]].
2. **알림톡 대량발송 실검증** — 변수 치환은 됐으나 승인 템플릿 선택 → 실제 1건 발송은 미검증(7원).
   ⚠️ 2026-07-29에 추가된 **건수 상한(#584)·실패목록(#574)·중복클릭 차단(#573)도 실발송 미검증** —
   같은 1건으로 함께 확인하면 된다. 테스트 수신번호 확정이 공통 블로커.
3. **MMS 이미지 규격 경계 실측** — 현 상한(300KB·1000px·JPG)은 추정치. 성공 발송은 32KB 1건뿐.
   상향 자체는 `constants/barobillCodes.ts:160` 한 줄(→`layout.ts:212`가 `window.MMS_IMAGE` 주입).
4. `SendState` 값 의미 미확정. 과금 확인은 파트너 잔액 차감이 확실.
5. "간판" 그룹 멤버 채우기(운영). (보류) 자동 스케줄 발송.
6. **#584 기본 상한 500 운영 적정성 판단** — SMS/LMS/알림톡 500·MMS 50. 전 거래처(~3,700) 발송은
   8회로 분할된다. 조정은 settings `<channel>_bulk_limit`(코드 수정 불요). 정본=[[design-message-bulk-limit]].

## 자금관리 (#3, 아래 상세 참조)
- **[사용자 액션]** 제안 189건 검토 후 [일괄 적용]. 운임 15건은 비용분류라 원장 영향 없음.
- 미매칭 330건 = 수동 매칭 대상(1회 처리 시 규칙 학습 → **오적용 주의**).
- `화물`·`택배` CONTAINS 규칙 오분류 관찰. `batch-match` 라우트는 UI 진입점 없이 보존 중 — 일정 후 제거 판단.

## 전역 블로커 (계속 이월)
- 품목 단가 전역(매출 base_price · 무이력 514 · 자재비 소진연결) · 간판 BOM.

---

# 세션 핸드오프 — IA 세션루프 B단계(연동 강화) prod 배포 완료 (2026-07-27 #11)

> durable=[[project-ia-designer-loop]]·spec `2026-07-23-ia-palette-session-loop.md` §3-B·D6·§4.2. **main `fcb94129`·deploy `10f2d4de`·마이그 0477 prod 적용·배포 완료**(격리 worktree 빌드, 로컬 main `696791a6` 발주 법인간거래 커밋 흡수 superset·push FIRST, 직후 타 세션 `fca59656` 동일 커밋 재배포=내용 동일 수렴). 검증=entity 60/60·페이지 16/16·API 게이트 15/15(401)·prod 번들 마커(ofTray*·batch_key·법인간거래)·prod backfill(waiting 19 중 6건 batch_key). 직전 #8(A0 CEP A1 후반+배치 ingest 수정, deploy `af2dcd54`)은 PROJECT_STATUS·durable로 이관.
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

## 다음 TODO (⚠️ 상단 「이월 TODO 통합」으로 승계됨 — 중복 처리 주의)
1. ~~배포~~ **완료**(0477 prod 적용 + deploy `10f2d4de`). 남은 것: **실가공 1건에서 batch_key·트레이(내작업/그룹핑)·absorb 자연 검증**(디자이너 일괄 확정 → 대기함 트레이 → 주문 생성). prod 대기함의 로그인 사용자별 "내 작업"은 worker_id 있는 신규 회수분부터 유효(기존 19건 중 worker_id NULL 다수).
2. worktree 종료: `.\scripts\end-session.ps1 ia-b-link -DeleteBranch` (병합 완료 상태 — 언제든 정리 가능. ⚠️로컬 dev 서버(3000)가 이 worktree dist를 서빙 중이라 end-session이 서버를 내림 → 메인에서 `npm run build && npm run dev:d1` 재기동).
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

## 다음 세션 TODO (⚠️ 상단 「이월 TODO 통합」으로 승계됨 — 중복 처리 주의)
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

## 다음 세션 TODO / 미결 (⚠️ 상단 「이월 TODO 통합」으로 승계됨 — 중복 처리 주의)
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
