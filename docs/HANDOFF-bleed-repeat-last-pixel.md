# 인계 — 도련(Repeat Last Pixel) 배선

> 2026-08-05. **배선 완료 · 코드 게이트 통과 · 실기 검증과 배포만 남았다.**
> spec = `docs/superpowers/specs/2026-07-31-cut-file-panel.md` · 사용법 = `docs/CUT_PANEL_USAGE.md`

## 1. 지금 상태

| 축 | 값 |
|---|---|
| 호스트 | `CUT-CEP-0.11.0` — **repo 만 · Z: 미배포** |
| 껍데기 | shell `0.15.0` — **repo 만 · 축3/축4 미배포** |
| 엔진 | `js/bleed.js` — 검증 통과(`npm run cut:bleed`), **네스팅 경로가 호출한다** |
| 실제 동작 | 클립 확장(무손실) → **Repeat Last Pixel PNG** → 단색(최후) |
| 미완 | ①실기 검증 0회 ②P1(`mesCut_vecCut`) 단일 경로는 아직 옛 방식 ③레거시 6함수 미삭제 |

> ⚠️ **일러에서 한 번도 안 돌려 봤다.** 배선 당시 일러가 실행 중이 아니었다(CDP 8888 무응답).
> 아래 §8 의 실기 확인 항목을 통과하기 전에는 "된다"고 말할 수 없다.

## 2. 왜 이 방식인가 (2026-08-05 1차 출처 조사로 확정)

업계는 도련을 **두 가지로만** 만든다 — 가장자리 픽셀 복제(래스터) / 라인아트 패스 연장(벡터). 제3의 방법은 없다.

| 도구 | 방식 | 불규칙 윤곽 |
|---|---|---|
| callas pdfToolbox | `Repeat Last Pixel` = 얇은 띠를 **렌더**해 색을 바깥으로 문지름 | 생성은 TrimBox(직사각) 기준 |
| Esko i-cut `Create Bleed` | contone=**Clone**(가장자리 색 복제) · lineart=확대 | Mirror 는 **직사각 컷패스 전용** |
| Enfocus PitStop 2021+ | `Add bleed along a contour` — *"We no longer mirror content, we now extend the actual line-art"* | ✔ 유일. 단 **모든 패스가 닫혀 있어야** |
| Illustrator 네이티브 | 없음(Offset Path 뿐) · `Generate print bleed` 는 Firefly 생성형·**직사각 전용** | ✘ |
| Mars Premedia `Cut and Bleed` | bbox 접촉 프루닝 = **우리가 실패한 그 알고리즘** | 저자 명시: 구멍 있는 디자인·트림 경계 색 인접 시 실패 |

**두 가지 결정적 사실:**
1. callas 가 *"rendering a thin strip"* 이라고 명시한다 — 업계도 이 지점에서 **벡터를 포기하고 래스터로 간다.**
   우리 `edge` 모드가 Live Pathfinder 에서 3분 넘게 멎은 것은 구현 실수가 아니라 **방식 선택 오류**였다.
2. PitStop 만 벡터 연장에 성공하는데 **아트가 컷 윤곽으로 클립돼 있다**는 전제가 붙는다. 클립이 있으면
   우리 ①(클립 확장)이 이미 그 역할을 한다. 클립이 없으면 "윤곽 도형 vs 내부 선"이 **원리상** 안 갈린다
   — 우리가 세 번 실패한 이유가 정확히 이것이고, 유일한 공개 일러 스크립트도 같은 지점에서 실패한다.

> 스티커 실무의 기본은 **컷 패스를 인쇄 영역 안쪽에 넣는 것**(여백 음수) — 도련을 합성하지 않는다.

## 3. 실패한 시도 4가지 — 되풀이하지 말 것

| 시도 | 결과 | 왜 |
|---|---|---|
| 단색(흰색) 링 | ✘ | 흰 도련은 도련이 아니다. 재단 밀리면 흰 줄이 그대로 = 도련이 막아야 할 현상 |
| 도형별 오프셋 + bbox 프루닝 | ✘ | 오목부에서 윤곽 도형까지 지워 **링에 구멍**, 동시에 내부 선은 못 막음 |
| 도형별 오프셋 + 윤곽거리/접촉 프루닝 | ✘ | 도형들이 서로 안 겹치면 **각자가 제 윤곽**을 가져 원리상 구분 불가(링에 30/35/14개 잔존) |
| 사본 확대(scale) | ✘ | bbox 는 사방 6.00mm 로 정확하지만 아트를 **1.14×/1.09× 늘려** 안쪽 그림이 전부 밀린다 |
| 가장자리 띠 추출(edge) | ⏸ | 원리상 정답이나 `Live Pathfinder Crop` 이 실사용 아트에서 **3분+ 멎음**. `bleedMode='edge'` 로만 호출됨 |

## 4. 엔진 — `js/bleed.js`

```
MesCutBleed.repeatLastPixel(src, growPx, opt) → { W, H, data, pad, filled }
  src    = { W, H, data }  RGBA · 투명 배경으로 래스터한 조각
  growPx = (여백 + 도련) / mmPerPx
  결과   = 사방 pad(=growPx) 만큼 커진 RGBA. 원본은 (pad,pad) 에 그대로.
```

8SSEDT 2-pass chamfer 로 각 픽셀의 **최근접 불투명 픽셀 (dx,dy)** 를 구하고, `grow` 안이면 그 색을 복사한다. `O(W·H)`.

**검증**(`npm run cut:bleed`): 링 색 보존 · 위치별 색(위 빨강/아래 파랑이 링에서도 갈림) · 오목 홈 구멍 없음 · **내부 선(가장자리 2px 안쪽) 링 기여 0픽셀** · 520×560 grow24 → **27ms**.

> ⚠️ 하네스 테스트가 처음 실패했을 때 **코드가 맞고 테스트가 틀렸다.** 검정 선이 몸통 위아래 끝에 닿아 있으면 거기서는 검정이 이어지는 것이 정답이다(도련 = 가장자리 색 잇기). 같은 착각을 반복하지 말 것.

## 5. 배선된 구조 (2026-08-05)

네스팅 도련은 이제 **3계층**이다. `mes-cut-host.jsx` 의 `mesCut_nestApply` → `if (vecBleedMm > 0)` 블록.

| 순 | 방식 | 언제 | 품질 |
|---|---|---|---|
| ① | `mesCut_vecGrowClips` — 클립 확장 | `bleedMode='auto'` 이고 클립 밖에 원본 데이터가 있을 때 | **무손실**(원래 있던 그림을 더 드러냄) |
| ② | `mesCut_bleedPlaceItem` — **Repeat Last Pixel PNG** | ① 이 안 될 때. **정본** | 가장자리 색을 위치별로 이음 |
| ③ | `mesCut_vecBleedSolid` — 단색 | ② 도 안 될 때 | ⚠️ 아트 색이 아님 → 반드시 알린다 |

**데이터 흐름**
```
패널 buildBleedPngs(prep, growMm)
  → host mesCut_nestBakeAll(fineMmpp, 0, false, "ink")   ★pad 0 · 원색 · 용도별 이름표
  → readPng → MesCutBleed.repeatLastPixel(img, growPx)
  → canvas → toDataURL → cep.fs.writeFile(temp/mes_cut_bleed_<idx>.png, Base64)
  → params 에 `L <idx> <wMm> <hMm>` 추가        ★실제 크기를 실어 보낸다
호스트 nestApply → bleedSz[idx] → mesCut_bleedPlaceItem(...) → SENDTOBACK → embed()
```

**설계에서 지켜야 하는 4가지** (전부 *조용히* 틀리는 실패다 — 화면엔 "완료"가 뜬다)
1. 도련용 굽기는 **`padMm=0` · `fillClosed=false`**. pad 가 남으면 grow 와 중복 패딩돼 중심이 어긋나고,
   `fillClosed` 를 켜면 도련이 통째로 검정이 된다.
2. 굽기 **용도별 이름표**(`tag`) 필수. 없으면 배치 마스크용 PNG 를 덮어써 한쪽이 틀린다.
3. 크기는 **패널이 준 `L` 값**을 쓴다. 호스트가 px→mm 을 재계산하면 반올림만큼, 조각마다 다르게 어긋난다.
4. 정렬은 **중심 맞추기 하나**다. PNG 중심 = 조각 잉크 중심이고 회전이 중심을 보존하므로,
   회전 중심이 무엇이든 결과가 같다. 경로는 브릿지를 안 탄다(호스트가 `idx` 로 재구성) → ASCII 문제 없음.

### 아직 안 한 것
- **P1 단일 경로**(`mesCut_vecCut` → `mesCut_vecBleed`)는 여전히 옛 방식이다. 그래서 레거시를 못 지웠다.
- 그 결과 `mesCut_vecBleedRegions` / `vecBleedEdge` / `pruneFarFrom` / `pruneInterior` / `densifyOutline` 이
  살아 있다. **P1 을 전환하면 통째로 삭제**한다(`vecBleedSolid` 만 ③ 안전망으로 남긴다).
  `mesCut_vecBleed` 머리에 폐기 주석을 달아 뒀다.

## 6. 검증 게이트

```
npm run cut:bleed      # 엔진 (P1 실패 시 exit 1)
npm run cut:smoke      # 237/237  ← 배선 회귀 어서션 6건 추가(2026-08-05)
npm run panel:smoke    # 119/119
npm run audit:ia-jsx   # 드리프트 0 — 축2 호스트 · 축3 Z: · 축4 이 PC
```

배포 순서는 **①축3 Z: → ②각 PC `install-a0-panel.ps1`**. 뒤집으면 구버전이 깔린다.
호스트(축2)도 같이 올려야 한다 — 패널 게이트가 `CUT-CEP-0.11.0` 미만이면 **조용히 옛 방식으로 떨어진다**(안내는 뜬다).

## 7. 실기 확인 방법 (MCP 없이)

MCP 는 이 작업 내내 계속 끊겼다. **패널 CDP 가 훨씬 안정적이다** — 병합 패널은 포트 **8888**.

```js
// scratchpad/dbg.mjs 패턴: /json/list 에서 page 타겟 → raw WebSocket → Runtime.evaluate
//   expression = new Promise(r => new CSInterface().evalScript(<코드>, r))
// 호스트 핫스왑: $.evalFile(new File("Z:/DESIGNS/IA-등록/_scripts/mes-cut-host.jsx"))  // 전역·IIFE 금지
```
⚠️ Playwright `connectOverCDP` 는 CEP 에서 못 쓴다(Browser context management 미지원).
⚠️ 무거운 아트에 Pathfinder 를 돌리면 일러가 수 분간 멎는다. 실험은 **작은 합성 아트**로 먼저.

## 8. 실기 확인 — 통과 전에는 "된다"고 말하지 말 것

배선은 코드 게이트만 통과했다. 일러에서 한 번도 안 돌았다. 순서대로 확인한다.

| # | 확인 | 무엇을 보나 | 왜 |
|---|---|---|---|
| 1 | 패널 결과 문구 | `도련 3mm (조각마다) — 가장자리 색 잇기 N개` | `클립 확장`만 나오면 ②가 한 번도 안 탄 것 = 검증 안 됨. 클립 없는 아트로 다시 |
| 2 | **위치** | 도련 링이 조각과 정확히 겹치는가(사방 균일) | 4차까지 실패한 지점이 전부 위치였다. 한쪽만 두꺼우면 중심 정렬이 틀렸다 |
| 3 | **회전 조각** | 90°/180°/270° 로 돌아간 조각의 도련 | 회전은 배선에서 가장 얇은 부분이다(`rotate(-rot)` + 중심 정렬) |
| 4 | **링 내용** | 내부 선이 링에 안 나오는가 · 위치별로 색이 갈리는가 | 이 방식을 택한 이유 자체 |
| 5 | `temp` PNG | `mes_cut_bleed_*.png` 가 **원색**인가 | 검정이면 `fillClosed` 가 새어 들어온 것 |
| 6 | 저장 후 재열기 | 도련이 살아 있는가 | `embed()` 실패 시 링크가 깨진다(temp 는 지워진다) |
| 7 | 색 | 원본과 도련 경계에 색 단차가 있는가 | PNG 는 RGB 라 **CMYK 변환을 거친다**. 재단선 바깥이라 실무 허용 범위지만 실측해 둘 것 |
| 8 | 큰 조각 | 12M px 초과 조각에서 `단색 N개` 안내가 뜨는가 | 상한(`BLEED_MAX_PX`)이 조용히 먹으면 안 된다 |

> 7번은 원리상 남는 한계다. PNG 는 CMYK 를 못 담으므로 도련만 RGB→CMYK 를 한 번 더 거친다.
> 도련은 잘려 나가는 자리이고 재단이 밀렸을 때만 보이므로, 약간의 색차 < 흰 줄. 다만 **모르고 있으면 안 된다.**
