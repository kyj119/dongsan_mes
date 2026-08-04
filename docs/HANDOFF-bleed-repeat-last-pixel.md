# 인계 — 도련(Repeat Last Pixel) 배선

> 2026-08-04. 엔진은 완성·검증됐고 **배선만 남았다.**
> spec = `docs/superpowers/specs/2026-07-31-cut-file-panel.md` · 사용법 = `docs/CUT_PANEL_USAGE.md`

## 1. 지금 상태

| 축 | 값 |
|---|---|
| 호스트 | `CUT-CEP-0.10.1` (Z: 배포됨) |
| 껍데기 | shell `0.14.0` · 패널 병합본 `com.mes.a0.panel` |
| 엔진 | `js/bleed.js` — **검증 통과**(`npm run cut:bleed`), **아직 아무도 호출하지 않는다** |
| 실제 동작 | 도형별 오프셋(`mesCut_vecBleedRegions`) — 위치는 맞고 **링이 지저분하다** |

## 2. 왜 이 방식인가 (벤치마크 결론)

전문 도구 어느 것도 **벡터 도형을 개별 오프셋하지 않는다.** 전부 가장자리 픽셀 밴드를 다룬다.

- **callas pdfToolbox `Repeat Last Pixel`** — 최외곽 픽셀만 바깥으로 반복. 문서에 *"트림박스에 가까운 개체가 도련에 딸려 들어가는 것을 피하려 할 때 권장"* 이라고 명시돼 있다. 우리가 겪은 결함 그대로다.
- **ONYX / Caldera** — Mirror(가장자리 반사) 또는 Stretch(마지막 2mm). 링 모양은 **컷 컨투어를 따름**(Shape 모드) = 우리가 `Sout` 로 클리핑하는 것과 같다.
- 스티커 실무의 기본은 **컷 패스를 인쇄 영역 안쪽에 넣는 것**(여백 음수) — 도련을 합성하지 않는다.

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

## 5. 남은 배선 3단계

### ① 조각별 PNG 확보
패널은 이미 굽기 결과 PNG 를 canvas 로 읽는다 — `cut-main.js` 의 `readPng()`(cep.fs Base64 경유, `file://` 는 taint 위험). `mesCut_nestBakeAll(mmPerPx, padMm, fillClosed)` 가 조각을 한 번에 굽는다.
- **주의**: 굽기 PNG 는 마스크용이라 `fillClosed` 로 검게 칠했을 수 있다. 도련은 **원색이 필요**하므로 별도 내보내기(채우기 없이·투명 배경)가 필요할 수 있다. 먼저 굽기 산출물의 색을 확인할 것.
- 굽기 때 `padMm` 이 이미 붙는다 — 도련 `grow` 와 **중복 패딩**되지 않게 좌표를 맞출 것.

### ② 도련 PNG 생성 (패널)
`repeatLastPixel(img, growPx)` → canvas 에 `putImageData` → `toDataURL('image/png')` → base64 를 `window.cep.fs.writeFile(path, b64, Base64)` 로 저장.

### ③ 호스트가 배치
새 API 필요:
```
mesCut_bleedPlace(pngPathAscii, xMm, yMm, wMm, hMm)   // 조각 뒤(SENDTOBACK)에 배치
```
- 경로는 **ASCII** 여야 한다(evalScript 브릿지). temp 경로를 쓰고, 한글이 필요하면 params 파일 경유.
- `mesCut_nestApply` 안에서 조각 복제 직후, 지금 `mesCut_vecBleed(...)` 를 부르는 자리(`mes-cut-host.jsx` 의 `if (vecBleedMm > 0)` 블록)를 이걸로 **교체**한다.
- 배치 좌표 = 조각의 잉크 경계(`mesCut_inkBounds`) 기준. 조각 배치가 잉크 기준이라 여기서만 `visibleBounds` 를 쓰면 밀린다(0.4.3 에서 겪음).

### ④ 정리
배선이 끝나면 `mesCut_vecBleedRegions` / `mesCut_vecBleedSolid` / `mesCut_vecBleedEdge` / `mesCut_pruneFarFrom` / `mesCut_pruneInterior` / `mesCut_densifyOutline` 를 **전부 삭제**한다. 남겨 두면 다음 사람이 또 그 길로 간다.

## 6. 검증 게이트

```
npm run cut:bleed      # 엔진 (P1 실패 시 exit 1)
npm run cut:smoke      # 231/231
npm run panel:smoke    # 119/119
npm run audit:ia-jsx   # 드리프트 0 — 축2 호스트 · 축3 Z: · 축4 이 PC
```

배포 순서는 **①축3 Z: → ②각 PC `install-a0-panel.ps1`**. 뒤집으면 구버전이 깔린다.

## 7. 실기 확인 방법 (MCP 없이)

MCP 는 이 작업 내내 계속 끊겼다. **패널 CDP 가 훨씬 안정적이다** — 병합 패널은 포트 **8888**.

```js
// scratchpad/dbg.mjs 패턴: /json/list 에서 page 타겟 → raw WebSocket → Runtime.evaluate
//   expression = new Promise(r => new CSInterface().evalScript(<코드>, r))
// 호스트 핫스왑: $.evalFile(new File("Z:/DESIGNS/IA-등록/_scripts/mes-cut-host.jsx"))  // 전역·IIFE 금지
```
⚠️ Playwright `connectOverCDP` 는 CEP 에서 못 쓴다(Browser context management 미지원).
⚠️ 무거운 아트에 Pathfinder 를 돌리면 일러가 수 분간 멎는다. 실험은 **작은 합성 아트**로 먼저.
