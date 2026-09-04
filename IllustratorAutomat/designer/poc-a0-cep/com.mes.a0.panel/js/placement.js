/**
 * 배치 방식 결정 — **어느 엔진으로 짤 것인가, 그리고 왜 그렇게 정했는가**
 *
 * 왜 별도 모듈인가 (2026-09-04):
 *   이 패널의 배치 엔진은 전부 순수 모듈이고 각자 하네스가 있다(`butt.js`·`nesting.js`·
 *   `geometry.js`·`bleed.js` — "검증한 코드 = 배포된 코드"). **딱 하나, 「어느 엔진을 쓸까」라는
 *   판정만 2,800줄 UI 파일 안에 묻혀 있었다.** 그래서 아무도 그 판정을 자동으로 확인하지 못했다.
 *
 *   실제로 그 틈으로 회귀가 지나갔다 — 판 길이 관문(0.75.0)을 배치 엔진 **밖**에 두었는데,
 *   그 지점을 지나는 경로가 **둘**이고 그중 `butt.js` 는 길이 상한을 지킬 **능력이 없었다**.
 *   결과: 큰 잡에서 맞붙임이 조용히 래스터로 격하돼 칼선이 두 줄로 나갔다. 게이트는 전부 통과했다 —
 *     · `cut:butt`  = butt.js **단독** 검증 → 엔진은 멀쩡했다. 패널이 안 고른 것이 문제였다
 *     · `cut:smoke` = 소스 **텍스트** 검증 → 코드 모양은 그대로였다. 바뀐 건 런타임 판정이었다
 *     · `cut:e2e`   = 판이 나오나 → 판은 정상적으로 나왔다. 칼선만 두 줄이었다
 *   셋 다 "기능이 **켜진 채로** 끝났는가"를 보지 않았다. 이 모듈이 그 자리다(`cut:placement`).
 *
 * ★조용한 격하(silent downgrade)를 성공으로 세지 않는다 — 격하는 `why` 로 반드시 나온다.
 * ★배치 자체는 하지 않는다. 엔진은 `placeButt`/`placeRaster` 로 **주입**받는다
 *   (그래야 일러 없이 Node 에서 판정만 떼어 검증할 수 있다).
 * ⚠️ 정본은 이 파일이다. Node 하네스(`npm run cut:placement`)가 **이 파일을 직접 검증**한다.
 */
(function (root, factory) {
  var api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  if (root) root.MesCutPlacement = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict'

  /**
   * 맞붙임을 쓸 수 있는가 — **쓸 수 없으면 왜인지 문장으로 돌려준다.**
   *
   * 조건이 다섯이라 조용히 떨어지면 사용자는 기능이 고장난 줄 안다(2026-08-07 실사용).
   * 특히 호스트 구버전은 **패널이 아니라 Z: 배포** 문제라 화면에 안 쓰면 알 길이 없다.
   *
   * @param o {offsetMm, gapMm, hasButt, hostOk, hostVersion, minHost, rectish:[bool], ids:[id]}
   * @returns {on:bool, why:string}
   */
  function buttReady(o) {
    // 맞붙임 = 「붙여서 한 번만 자르겠다」는 뜻이다. 여백·간격이 그 선언이다.
    //   · 여백 > 0  → 칼선이 조각 바깥으로 나가 이웃 칼선과 겹친다(공유가 성립 안 함)
    //   · 여백 < 0  → 칼선이 안쪽으로 들어와 이웃과 떨어진다(공유할 변이 없다)
    //   · 간격 > 0  → 애초에 붙이지 않겠다는 뜻이다
    if (!(o.offsetMm <= 0 && o.gapMm <= 0)) return { on: false, why: '' }   // 요청 자체가 아님 = 침묵
    if (!o.hasButt) return { on: false, why: 'butt.js 미설치 — 패널 설치본을 갱신하세요' }
    if (!o.hostOk) {
      return {
        on: false,
        why: '호스트 구버전(' + (o.hostVersion || '?') + ' < ' + (o.minHost || '?')
          + ') — Z: 의 mes-cut-host.jsx 를 배포하세요',
      }
    }
    if (o.offsetMm !== 0 || o.gapMm !== 0) {
      return { on: false, why: '여백/간격이 0이 아님(' + o.offsetMm + '/' + o.gapMm + ')' }
    }
    var rectish = o.rectish || []
    if (!rectish.length) return { on: false, why: '조각 크기를 못 받았습니다' }
    for (var i = 0; i < rectish.length; i++) {
      // 이형끼리는 붙여도 칼선이 애초에 안 맞는다 — 하나라도 아니면 쓰지 않는다.
      if (!rectish[i]) {
        return {
          on: false,
          why: '조각 #' + ((o.ids && o.ids[i] !== undefined) ? o.ids[i] : i)
            + ' 의 본체가 직사각이 아님(라운드·이형) — 맞붙임은 직각 사각만',
        }
      }
    }
    return { on: true, why: '' }
  }

  /**
   * 판 길이 관문 — **어느 배치 알고리즘이 만들었든 여기를 통과해야 판이 된다.**
   *
   * 판 = 생산 단위 = 등록 1건이므로(호스트가 판마다 등록 폴더를 만든다) 상한을 넘는 판은
   * 업무적으로도 존재할 수 없다. 평판은 높이가 규격으로 고정이고 배치가 이미 검사했다.
   */
  function fitsLength(res, o) {
    if (!res || !res.sheets || !res.sheets.length) return false
    if (o.sheetHmm) return true
    return o.plateMm(res) <= o.rollMaxMm
  }

  /**
   * 배치 방식을 고르고 실제로 배치한다.
   *
   * @param o buttReady 의 입력 + {
   *   wantVec: bool,                  // 벡터 칼선 요청
   *   sheetHmm: number,               // 0 = 롤
   *   rollMaxMm: number,              // 판 길이 상한(판 전체 = 돔보 포함)
   *   placeButt: fn() -> res|null,    // 맞붙임 배치 (여러 판을 낼 수 있어야 한다)
   *   placeRaster: fn() -> res,       // 래스터 네스팅
   *   plateMm: fn(res) -> number,     // 가장 긴 판의 높이(mm, 돔보 포함)
   * }
   * @returns {engine:'butt'|'raster', res, why, overVec, fatal}
   */
  function choose(o) {
    var rd = buttReady(o)
    var on = rd.on, why = rd.why

    // ★★맞붙임이 벡터보다 **우선한다** (2026-08-07 실사용 — 이것 때문에 계속 두 줄이 나왔다).
    //   벡터 칼선은 조각마다 실루엣을 따로 그린다 → 맞닿은 변은 **원리상 반드시 두 줄**이다.
    //   여백 0·간격 0 은 "붙여서 한 번만 자르겠다"는 뜻이므로 벡터로는 그 요청을 만족시킬 수 없다.
    var overVec = !!(on && o.wantVec)

    var res = on ? o.placeButt() : o.placeRaster()

    // ★맞붙임이 판을 못 냈거나 상한을 넘으면 래스터로 되돌린다 — **그리고 사유를 남긴다.**
    //   판 분할이 생긴 뒤로 롤에서 이 길이 폴백은 사실상 안 걸린다. 그래도 남겨 둔다:
    //   새 배치 방식이 또 상한을 모른 채 들어올 수 있고, 그때 조용히 나가는 것보다 낫다.
    var lenOver = !!res && !!(res.sheets && res.sheets.length) && !fitsLength(res, o)
    if (on && (!res || !res.sheets || !res.sheets.length || lenOver)) {
      on = false
      overVec = false
      why = lenOver
        ? ('맞붙임 판이 길이 한계 ' + o.rollMaxMm + 'mm 를 넘어(' + o.plateMm(res)
           + 'mm) 래스터로 되돌렸습니다 — 판이 나뉩니다')
        : '맞붙임 배치가 시트 폭/높이에 안 들어가 래스터로 되돌렸습니다'
      res = o.placeRaster()
    }

    // ★여기서 끝내는 실패 — 호스트로 보내면 `PARM`(1346458189) 으로 죽는다.
    //   그 오류 코드는 어느 인자가 왜 틀렸는지 말해 주지 않으므로 여기서 이유를 말하는 편이 낫다.
    var fatal = ''
    if (!res || !res.sheets || !res.sheets.length) fatal = '배치 실패 — 조각이 시트보다 큽니다.'
    else if (!fitsLength(res, o)) {
      fatal = '판 길이 ' + o.plateMm(res) + 'mm 가 한계 ' + o.rollMaxMm
        + 'mm 를 넘습니다 — 조각을 나누거나 저장 배율을 낮추세요.'
    }

    return { engine: on ? 'butt' : 'raster', res: res, why: why, overVec: overVec, fatal: fatal }
  }

  return { buttReady: buttReady, fitsLength: fitsLength, choose: choose }
})
