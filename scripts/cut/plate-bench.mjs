/**
 * 전사 판 산식 하네스 — `npm run cut:plate`
 *
 * 검증 대상 = 패널의 `js/plate.js` **그 파일**(검증한 코드 = 배포된 코드).
 *
 * ★이 하네스가 있는 이유 = 판짜기는 **틀려도 판이 나온다.** 치수가 몇 mm 어긋나도 일러는 아무 말을
 *   안 하고, 사람 눈에도 정상으로 보이고, 출력까지 나간다(§조용한 격하). 그래서 「판이 나왔는가」가
 *   아니라 **「어떤 판이 나왔는가」**를 손으로 셀 수 있는 값으로 확인한다.
 *
 * ★특히 두 가지를 못박는다.
 *   ① 전체가로폭 축소가 **원본이 아니라 시접을 먹는다** — 실측 가로배율 1.00000, 시접만 25→23.25.
 *   ② 세로 수축보정은 **가공을 끝낸 뒤 세로에만** 곱한다 — 밴드까지 같이 곱해져야 실측과 맞는다.
 *   둘 다 산식 안에서 조용히 뒤집힐 수 있는 자리라 여기서 고정한다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..')
const PANEL = path.join(REPO, 'IllustratorAutomat', 'designer', 'poc-a0-cep', 'com.mes.a0.panel', 'js')
const load = (f) => import('file://' + path.join(PANEL, f).replace(/\\/g, '/'))

await load('plate-rules.js')
await load('plate.js')
const P = globalThis.MesPlate
const R = globalThis.MesPlateRules

let pass = 0, fail = 0
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name) }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '   ← ' + extra : '')) }
}
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol

console.log('\n전사 판 산식 (js/plate.js)\n' + '='.repeat(56))

const base = (over = {}) => Object.assign(
  { specW: 600, specH: 1800, vup: 2, seam: '쌍침', sewCm: 5, band: 'top', media: '60폭' }, over)

// ── ① 가로 — 축소와 시접
{
  const r = P.computePlate(base())
  ok('① 판 폭이 1294 다', r.ok && r.plate.w === 1294, JSON.stringify(r.plate))
  ok('② 벌 폭이 646.5 다', near(r.panels[0].w, 646.5), r.panels[0].w)
  ok('③ 미축소 폭(rawW)은 1301 이다', near(r.trace.rawW, 1301), r.trace.rawW)
  ok('④ ★축소는 시접을 먹는다 — 공칭 25 · 실제 23.25', r.trace.seamNominal === 25 && near(r.trace.seamActual, 23.25),
    r.trace.seamNominal + ' / ' + r.trace.seamActual)
  ok('⑤ 줄어든 몫은 7mm 다', near(r.trace.shrunkByW, 7), r.trace.shrunkByW)
  ok('⑥ ★원본 폭은 줄지 않는다(가로배율 1.00000)', r.design[0].w === 600, r.design[0].w)
  ok('⑦ 벌 사이 간격이 1mm 다', near(r.panels[1].x - (r.panels[0].x + r.panels[0].w), 1),
    r.panels[1].x - (r.panels[0].x + r.panels[0].w))
  ok('⑧ 원본이 벌 안에서 좌우 23.25 안쪽이다', near(r.design[0].x - r.panels[0].x, 23.25), r.design[0].x - r.panels[0].x)
}

// ── ② 1벌은 축소하지 않는다 (실측: 애니룩스 650 폭 · 시접 25)
{
  const r = P.computePlate(base({ vup: 1 }))
  ok('⑨ 1벌이면 판 폭 650 · 시접 25 (축소 없음)', r.plate.w === 650 && r.trace.seamActual === 25 && r.trace.shrunkByW === 0,
    r.plate.w + ' / ' + r.trace.seamActual)
}

// ── ③ 세로 — 두 단계
{
  const r = P.computePlate(base({ sewCm: 5 }))
  ok('⑩ 1단계 벌 높이 = 원본 + 여유 30 = 1830', near(r.trace.panelH0, 1830), r.trace.panelH0)
  ok('⑪ 1단계 밴드 = 봉미싱 + 1cm = 60', near(r.trace.bandH0, 60), r.trace.bandH0)
  ok('⑫ 1단계 판 = 1890', near(r.trace.plateH0, 1890), r.trace.plateH0)
  ok('⑬ ★2단계 — 벌에 보정이 걸려 1859.28', near(r.panels[0].h, 1830 * 1.016), r.panels[0].h)
  ok('⑭ ★2단계 — 밴드에도 같이 걸려 60.96', near(r.bands[0].h, 60 * 1.016), r.bands[0].h)
  ok('⑮ 판 높이 = 밴드 + 벌', near(r.plate.h, r.bands[0].h + r.panels[0].h, 0.02),
    r.plate.h + ' vs ' + (r.bands[0].h + r.panels[0].h))
  ok('⑯ 원본 세로에도 보정이 걸린다 (1800 → 1828.8)', near(r.design[0].h, 1828.8), r.design[0].h)
  ok('⑰ 원본이 밴드에 붙는다 (여유는 반대쪽)', near(r.design[0].y, r.bands[0].h), r.design[0].y + ' / ' + r.bands[0].h)
}

// ── ④ 상하봉미싱 — 여유 0 · 밴드 2개
{
  const r = P.computePlate(base({ band: 'topbottom', sewCm: 5 }))
  ok('⑱ 상하봉미싱은 여유가 0 (벌 = 원본)', near(r.trace.panelH0, 1800), r.trace.panelH0)
  ok('⑲ 밴드가 벌당 2개다', r.bands.length === 4, r.bands.length)                    // 2벌 × 2밴드
  ok('⑳ 1단계 판 = 1800 + 60×2 = 1920', near(r.trace.plateH0, 1920), r.trace.plateH0)
  const b2 = r.bands.filter((b) => b.y > 0)[0]
  ok('㉑ 아래 밴드가 벌 뒤에 온다', b2 && near(b2.y, r.bands[0].h + r.panels[0].h, 0.02), b2 && b2.y)
}

// ── ⑤ 봉미싱 cm 가 밴드에 선형으로 반영된다 (실측 3·4·5·7·10·12cm)
{
  let allOk = true, detail = []
  for (const cm of [3, 4, 5, 7, 10, 12]) {
    const r = P.computePlate(base({ sewCm: cm }))
    const want = (cm * 10 + 10) * 1.016
    if (!near(r.bands[0].h, want, 0.02)) { allOk = false; detail.push(cm + 'cm:' + r.bands[0].h + '≠' + want.toFixed(2)) }
  }
  ok('㉒ 봉미싱 3·4·5·7·10·12cm 이 전부 (cm×10+10)×1.016', allOk, detail.join(' '))
}

// ── ⑥ 거절 — 모르는 축은 만들지 않는다
{
  const cases = [
    ['㉓ 미등록 원단은 거절', base({ media: '45폭' }), 'media'],
    ['㉔ 미지원 마감은 거절(보급형)', base({ band: '보급형' }), 'band'],
    ['㉕ 미등록 봉재방법은 거절', base({ seam: '지그재그' }), 'seam'],
    ['㉖ 규격이 없으면 거절', base({ specH: 0 }), 'spec'],
    ['㉗ 봉미싱 cm 이 없으면 거절', base({ sewCm: undefined }), 'sew'],
  ]
  for (const [name, input, code] of cases) {
    const r = P.computePlate(input)
    ok(name, r.ok === false && r.code === code, JSON.stringify(r))
  }
}

// ── ⑦ 자가시험 — 규칙을 건드리면 결과가 따라 바뀐다(게이트가 살아 있는가)
{
  const keep = R.RULES.shrink
  R.RULES.shrink = 1
  const flat = P.computePlate(base({ sewCm: 5 }))
  R.RULES.shrink = keep
  const back = P.computePlate(base({ sewCm: 5 }))
  ok('㉘ 자가시험 — 보정을 1 로 두면 정수 판(1890)이 나온다', near(flat.plate.h, 1890), flat.plate.h)
  ok('㉙ 자가시험 — 되돌리면 원래 값으로 복귀', near(back.plate.h, 1890 * 1.016), back.plate.h)
}

// ── ⑧ ★규칙 값이 UI 로 새지 않았는가 (소스 검사)
// 값이 두 곳에 있으면 갈리고, 갈린 걸 아무도 못 본다. UI(`tr-main.js`)는 드롭다운도
// 규칙 파일에서 만들어야 한다 — 숫자를 하나라도 적는 순간 그 규칙은 정본이 둘이 된다.
{
  const src = fs.readFileSync(path.join(PANEL, 'tr-main.js'), 'utf8')
  const forbidden = ['1294', '1.016', '646.5', '23.25', '2.5cm', "'쌍침'"]
  // '쌍침' 은 기본 선택값으로 한 번만 허용한다(el.seam.value = '쌍침')
  const hits = forbidden.filter((tok) => {
    const n = src.split(tok).length - 1
    return tok === "'쌍침'" ? n > 1 : n > 0
  })
  ok('㉚ ★규칙 값이 tr-main.js 에 복사돼 있지 않다', hits.length === 0, hits.join(' '))

  const rulesSrc = fs.readFileSync(path.join(PANEL, 'plate-rules.js'), 'utf8')
  ok('㉛ 규칙 파일이 1294·1.016 을 갖고 있다', /1294/.test(rulesSrc) && /1\.016/.test(rulesSrc))

  // ★「조사해서 파일 축이 아님을 확정한 것」은 UNSUPPORTED 와 **따로** 둔다.
  //   둘을 섞으면 「아직 모른다」와 「우리 일이 아니다」가 구분되지 않아 다음 사람이 또 판다.
  ok('㉜ 막음이 NOT_FILE_AXIS 에 기록돼 있다', !!(R.NOT_FILE_AXIS && R.NOT_FILE_AXIS['막음']),
    Object.keys(R.NOT_FILE_AXIS || {}).join(','))
  ok('㉝ 막음은 UNSUPPORTED 가 아니다 (뜻이 다르다)', !R.UNSUPPORTED['막음'])
  ok('㉞ ★막음 입력칸을 만들지 않았다', src.indexOf('막음') < 0 &&
    fs.readFileSync(path.join(PANEL, '..', 'index.html'), 'utf8').indexOf('막음') < 0)
}

// ── ⑨ 봉재 면 수 — 작업지시서 축 (2026-09-18)
// 「3면쌍침」의 3면 = **좌·우·상단(밴드)** 이다(용준님 확인). 그래서 3면과 2면은 좌우 시접이 같고,
// 1면은 **어느 변인지 모른다** — 가로등 실물 사례가 하나도 없어 만들지 않는다.
{
  const a = P.computePlate(base())                       // 기본 = 3면
  const b3 = P.computePlate(base({ sewSides: 3 }))
  const b2 = P.computePlate(base({ sewSides: 2 }))
  ok('㉜ 기본이 3면이다', a.trace.sewSides === 3, a.trace.sewSides)
  ok('㉝ 3면과 2면은 좌우 시접이 같다 (3면의 3번째는 상단 밴드)',
    b3.plate.w === b2.plate.w && b3.trace.seamActual === b2.trace.seamActual,
    b3.trace.seamActual + ' / ' + b2.trace.seamActual)
  const b1 = P.computePlate(base({ sewSides: 1 }))
  ok('㉞ ★1면쌍침은 거절한다 (어느 변인지 모른다)', b1.ok === false && b1.code === 'sides', JSON.stringify(b1))
  const b4 = P.computePlate(base({ sewSides: 4 }))
  ok('㉟ 모르는 면 수도 거절', b4.ok === false && b4.code === 'sides', JSON.stringify(b4))

  const tb = P.computePlate(base({ sewSides: 3, band: 'topbottom' }))
  ok('㊱ 3면인데 밴드가 둘이면 막지 않고 알린다', tb.ok && !!tb.trace.sidesNote, String(tb.trace.sidesNote))

  // 작업지시서 축이 trace 에 기록되는가 — 산식을 안 바꿔도 「왜 이 판인가」의 근거다
  const rec = P.computePlate(base({ fabric: '폰지', band: 'nonwoven7', hardware: { size: 5, holes: 4 } }))
  ok('㊲ 원단·부직포·하도매가 trace 에 남는다',
    rec.trace.fabric === '폰지' && rec.trace.nonwovenCm === 7 && rec.trace.hardware.holes === 4,
    JSON.stringify({ f: rec.trace.fabric, n: rec.trace.nonwovenCm, h: rec.trace.hardware }))
}

// ── ⑩ ★패널 ↔ 호스트 계약 (축3 ↔ 축2)
// 둘은 **배포 시점이 다르다**. 패널만 올리거나 호스트만 올리는 조합이 실제로 생기고,
// 그때 안 맞는 레코드는 예외도 경고도 없이 **조용히 무시**된다 — 판은 나오고 도련만 없다.
// 그래서 보내는 키와 읽는 키가 같은지, 최소 호스트 버전이 실제 호스트 이하인지 여기서 고정한다.
{
  const panel = fs.readFileSync(path.join(PANEL, 'tr-main.js'), 'utf8')
  const host = fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'designer', 'mes-tr-host.jsx'), 'utf8')

  const sent = ['P:', 'N:', 'D:', 'B:', 'M:'].filter((k) => panel.indexOf("'" + k) >= 0 || panel.indexOf('"' + k) >= 0)
  ok('㉜ 패널이 5종 레코드를 보낸다', sent.length === 5, sent.join(' '))
  const read = ['P', 'N', 'D', 'B', 'M'].filter((k) => new RegExp("k === '" + k + "'").test(host))
  ok('㉝ ★호스트가 그 5종을 전부 읽는다', read.length === 5, read.join(' '))

  // ★글자를 세지 말고 **돌려 본다.** `mesTr_parse` 는 일러 API 를 안 쓰는 순수 함수라
  //   여기서 그대로 실행할 수 있다. 종전엔 `/mp\.length >= 5/` 같은 **구현을 못박는 정규식**이라,
  //   도련을 벌마다 나누는 개선(0.3.0)이 성질을 더 잘 지키는데도 FAIL 로 막혔다
  //   (CLAUDE.md §게이트가 구현을 못박으면 개선을 막는다 — 2026-09-21 실제로 걸렸다).
  // ⚠️호스트는 CRLF 다 — 정규화하지 않으면 `\n}\n` 이 안 맞아 함수가 잘린 채 eval 된다.
  const hostLF = host.replace(/\r\n/g, '\n')
  const parseSrc = hostLF.slice(hostLF.indexOf('function mesTr_parse('))
  const parseEnd = parseSrc.indexOf('\n}\n')
  if (parseEnd < 0) throw new Error('mesTr_parse 의 끝을 못 찾았다 — 들여쓰기가 바뀌었는지 보라')
  const mesTr_parse = new Function(parseSrc.slice(0, parseEnd + 2) + '; return mesTr_parse;')()

  const legacy = mesTr_parse('P:100,200;N:0,0,50,200;M:solid,0,0,100,0')
  ok('㉞ 옛 형식 `M:solid,c,m,y,k` 가 판 전체 색으로 읽힌다',
    legacy.mode === 'solid' && legacy.color && legacy.color.y === 100 && legacy.color.k === 0,
    JSON.stringify(legacy.color))

  const perPanel = mesTr_parse('P:100,200;N:0,0,50,200;N:50,0,50,200;M:0,solid,90,70,0,0;M:1,repeat')
  ok('㉞ ★벌마다 다른 도련을 읽는다 (두 벌의 바탕색이 다른 판이 흔하다)',
    perPanel.modes[0].mode === 'solid' && perPanel.modes[0].color.c === 90
    && perPanel.modes[0].color.m === 70 && perPanel.modes[1].mode === 'repeat'
    && perPanel.modes[1].color === null,
    JSON.stringify(perPanel.modes))

  ok('㉟ 호스트가 도련 색으로 벌을 채운다', /filled\(lyArt, pan, bgCol\)/.test(host))
  ok('㉟ ★그 색을 벌마다 따로 정한다', host.indexOf('panelCol[i]') > 0,
    '판 하나로 뭉치면 두 벌 중 한쪽이 남의 색이 된다')
  ok('㊱ ★단색이 아니면 채우지 않고 센다', /bleedskip=/.test(host))

  // ★클립을 존중하는 「보이는 잉크」 경계 — 글자를 세지 말고 **돌려 본다**.
  //   `mesTr_inkBounds` 는 일러 객체의 속성만 읽으므로 가짜 객체로 그대로 실행된다.
  //   실기 실측(2026-09-21 · 일러 30.7 · 고양 소노 20조)의 **그 숫자**를 그대로 넣는다 —
  //   `visibleBounds` 는 클립 60x180 짜리 그룹을 **214.74x242.83** 으로 답했고,
  //   그 하나가 「자동 분석이 안 된다」와 「보이지 않는 공백」 **둘 다**였다.
  const inkAt = hostLF.indexOf('function mesTr_rectIntersect(')
  const inkFn = hostLF.indexOf('function mesTr_inkBounds(')
  const inkEnd = inkFn < 0 ? -1 : hostLF.slice(inkFn).indexOf('\n}\n')
  if (inkAt < 0 || inkFn < 0 || inkEnd < 0) throw new Error('mesTr_inkBounds 묶음을 못 잘랐다 — 함수 순서가 바뀌었는지 보라')
  const mesTr_inkBounds = new Function(hostLF.slice(inkAt, inkFn + inkEnd + 2) + '; return mesTr_inkBounds;')()

  const clipPath = { typename: 'PathItem', clipping: true, filled: false, stroked: false,
    geometricBounds: [487, 0, 547, -180], visibleBounds: [487, 0, 547, -180] }
  const raster = { typename: 'RasterItem', visibleBounds: [418.55, -78.9, 633.29, -242.83] }
  const clippedGrp = { typename: 'GroupItem', clipped: true, pageItems: [clipPath, raster],
    geometricBounds: [418.55, 0, 633.29, -242.83], visibleBounds: [418.55, 0, 633.29, -242.83] }
  const ink = mesTr_inkBounds(clippedGrp)
  ok('㊴ ★클립된 그룹은 **클립 ∩ 콘텐츠**로 잰다',
    !!ink && ink[0] === 487 && ink[2] === 547 && ink[1] === -78.9 && ink[3] === -180,
    '겉보기 214.74x242.83 이 그대로 나오면 판에 보이지 않는 여백이 깔린다 — 받은 값 ' + JSON.stringify(ink))

  const stray = { typename: 'PathItem', filled: false, stroked: false,
    visibleBounds: [-2859.62, -173.52, 2919.94, -173.52] }
  ok('㊴ ★아무것도 안 그리는 패스는 세지 않는다', mesTr_inkBounds(stray) === null,
    '실기 문서에 5,779mm 짜리 빈 패스가 있어 혼자서 모든 군집을 붙여 놓았다')
  ok('㊴ 안내선도 세지 않는다',
    mesTr_inkBounds({ typename: 'PathItem', guides: true, stroked: true, visibleBounds: [0, 9, 9, 0] }) === null)
  ok('㊴ 그리는 자식이 하나도 없는 그룹은 null',
    mesTr_inkBounds({ typename: 'GroupItem', clipped: false, pageItems: [stray],
      visibleBounds: [-2859.62, 0, 2919.94, -1] }) === null,
    '여기서 visibleBounds 로 떨어지면 방금 걷어낸 상자가 되살아난다')

  // ★클립도 안 그리는 개체도 없는 보통 아트는 **종전과 똑같아야 한다**(회귀 0).
  const plain = { typename: 'PathItem', filled: true, stroked: false, visibleBounds: [0, 180, 60, 0] }
  const pb = mesTr_inkBounds(plain)
  ok('㊵ 보통 아트는 겉보기 그대로다 (회귀 0)',
    !!pb && pb[0] === 0 && pb[1] === 180 && pb[2] === 60 && pb[3] === 0, JSON.stringify(pb))
  const nest = { typename: 'GroupItem', clipped: false, visibleBounds: [0, 0, 0, 0],
    pageItems: [plain, { typename: 'TextFrame', visibleBounds: [70, 200, 90, 150] }] }
  const nb = mesTr_inkBounds(nest)
  ok('㊵ 글자는 남긴다 (판정이 안 서면 버리지 않는다)',
    !!nb && nb[2] === 90 && nb[1] === 200,
    '잘못 버리면 그림이 잘린다 — 잘못 남기는 쪽보다 나쁘다. 받은 값 ' + JSON.stringify(nb))

  // ★바탕 판정 — 글자를 세지 말고 **돌려 본다**. 2026-09-22 실기 결함을 그대로 재현한다:
  //   벌 전체를 덮는 개체가 위에서부터 [클립패스(칠 없음)] → [그라디언트] → [단색] 인데
  //   옛 판정이 「단색 CMYK 인 패스」만 후보로 봐 **가려진 맨 아래 단색**을 골랐고, 그 색으로 깐 도련이
  //   실제 그림(K66)보다 연해(K41) 띠가 보였다. 판정은 **맨 위에서 전체를 덮는 불투명한 칠**이어야 한다.
  const fbAt = hostLF.indexOf('function mesTr_findBackdrop(')
  const fbEnd = fbAt < 0 ? -1 : hostLF.slice(fbAt).indexOf('\n}\n')
  if (fbAt < 0 || fbEnd < 0) throw new Error('mesTr_findBackdrop 을 못 잘랐다')
  const mesTr_findBackdrop = new Function('MESTR_MM', hostLF.slice(fbAt, fbAt + fbEnd + 2) + '; return mesTr_findBackdrop;')(72 / 25.4)
  const BOX = [0, 180, 60, 0]                       // [l,t,r,b] 디자인 상자
  const fbClip = { typename: 'PathItem', clipping: true, filled: false, geometricBounds: BOX }
  const fbGrad = { typename: 'PathItem', filled: true, opacity: 100, geometricBounds: BOX, fillColor: { typename: 'GradientColor' } }
  const fbSolid = { typename: 'PathItem', filled: true, opacity: 100, geometricBounds: BOX, fillColor: { typename: 'CMYKColor', cyan: 99, magenta: 94, yellow: 59, black: 41 } }
  const fbText = { typename: 'CompoundPathItem', filled: true, opacity: 100, geometricBounds: [10, 100, 30, 90], fillColor: { typename: 'CMYKColor' } }
  // 페인트 순서 = pageItems[0] 이 맨 위
  const fbReal = { typename: 'GroupItem', pageItems: [fbText, { typename: 'GroupItem', clipped: true, pageItems: [fbClip, fbGrad] }, fbSolid] }
  const r1 = mesTr_findBackdrop([fbReal], BOX[0], BOX[1], BOX[2], BOX[3])
  ok('㊶ ★그라디언트가 단색을 덮고 있으면 바탕은 그라디언트다 (2026-09-22 실기)',
    !!r1 && r1.kind === 'grad' && r1.it === fbGrad,
    '가려진 단색을 고르면 그 색으로 깐 도련이 실제 그림과 어긋난다 — 받은 값 ' + (r1 ? r1.kind : 'null'))
  const r2 = mesTr_findBackdrop([{ typename: 'GroupItem', pageItems: [fbText, fbSolid] }], BOX[0], BOX[1], BOX[2], BOX[3])
  ok('㊶ 단색만 있으면 solid + 그 색', !!r2 && r2.kind === 'solid' && r2.it.fillColor.black === 41, r2 ? r2.kind : 'null')
  const half = { typename: 'PathItem', filled: true, opacity: 50, geometricBounds: BOX, fillColor: { typename: 'CMYKColor' } }
  const r3 = mesTr_findBackdrop([{ typename: 'GroupItem', pageItems: [half, fbSolid] }], BOX[0], BOX[1], BOX[2], BOX[3])
  ok('㊶ 반투명이 덮고 있으면 단색이라고 말하지 않는다', !!r3 && r3.kind === 'other', r3 ? r3.kind : 'null')
  const photo = { typename: 'RasterItem', opacity: 100, geometricBounds: [-100, 200, 200, -50] }
  const r4 = mesTr_findBackdrop([{ typename: 'GroupItem', pageItems: [photo, fbSolid] }], BOX[0], BOX[1], BOX[2], BOX[3])
  ok('㊶ 사진이 덮고 있으면 img — 늘리지 않고 픽셀로 보낸다', !!r4 && r4.kind === 'img', r4 ? r4.kind : 'null')
  const r5 = mesTr_findBackdrop([{ typename: 'GroupItem', pageItems: [fbText, fbClip] }], BOX[0], BOX[1], BOX[2], BOX[3])
  ok('㊶ 칠 없는 클립 패스는 바탕이 아니다', r5 === null, r5 ? r5.kind : 'null')

  // ★패널의 planBleed 도 같은 축을 탄다 — 가장자리 종류가 모드로 이어지는가
  const RVsrc = fs.readFileSync(path.join(PANEL, 'review.js'), 'utf8')
  new Function(RVsrc)()                             // review-bench 와 같은 방식 — 파일이 globalThis.MesReview 를 단다
  const RV = globalThis.MesReview
  const D = { x: 23, y: 15, w: 600, h: 1829 }, P = { x: 0, y: 0, w: 646, h: 1859 }
  // ★기본은 픽셀 반복 — 가장자리에 보이는 것은 벡터로 알 수 없다(2026-09-22 실기: 사진+줄무늬 가장자리에 그라디언트 도련이 깔렸다)
  ok('㊷ ★그라디언트 바탕도 픽셀 반복이 기본', RV.planBleed({ design: D, panel: P, edge: { extend: true } }).mode === 'repeat')
  ok('㊷ ★단색 바탕도 픽셀 반복이 기본 (폴백=solid)', (function () { var r = RV.planBleed({ design: D, panel: P, edge: { solid: true, color: [0, 0, 0, 100] } }); return r.mode === 'repeat' && r.fallback === 'solid' })())
  ok('㊷ 모르면도 픽셀 반복', RV.planBleed({ design: D, panel: P, edge: {} }).mode === 'repeat')
  ok('㊷ 픽셀을 못 쓰면 단색 폴백', RV.planBleed({ design: D, panel: P, edge: { solid: true, color: [0, 0, 0, 100] }, allowRepeat: false }).mode === 'solid')
  ok('㊷ 픽셀을 못 쓰면 늘리기 폴백', RV.planBleed({ design: D, panel: P, edge: { extend: true }, allowRepeat: false }).mode === 'extend')

  // ★접는선·끈고리·하도매 — 정본 plate-rules.marks, 산식 plate.js (용준님 2026-09-22 확정 → 2026-09-23 정정을 숫자로 못박는다)
  //   60×180 · 상단봉미싱 5cm · 2벌 기준. 세로는 수축보정(k)을 먹은 판 좌표다.
  //   ★선은 원본 안이 아니라 **시접 띠** — 벌 바깥 끝선에서 안쪽으로 시접 폭(23.25). 맨 위 줄은 끈고리가 아니라 **접는선**.
  {
    const r = globalThis.MesPlate.computePlate(base({ sewCm: 5, vup: 2, holesTop: 2, holesSide: 3 }))
    const d0 = r.design[0], p0 = r.panels[0], k = r.trace.shrink, band = r.trace.bandH0 * k, seam = r.trace.seamActual
    const near = (a, b) => Math.abs(a - b) < 0.05
    const F0 = r.folds.filter((l) => l.panel === 0), L0 = r.loops.filter((l) => l.panel === 0)
    ok('㊸ 상단 봉미싱 = 벌마다 접는선 2 + 끈고리 2', r.ok && r.folds.length === 4 && r.loops.length === 4,
      r.ok ? 'folds=' + r.folds.length + ' loops=' + r.loops.length : r.reason)
    ok('㊸ ★접는선 = 원본 위 끝선(밴드 경계)에 좌·우', F0.every((l) => near(l.y, d0.y)) && F0.map((l) => l.side).sort().join(',') === 'left,right')
    ok('㊸ 끈고리① = 접는선에서 봉미싱 길이(6cm·보정)만큼 아래, 안쪽만', L0.filter((l) => near(l.y, d0.y + band)).map((l) => l.side).join('') === 'right',
      '벌①의 안쪽은 오른쪽(마주 보는 쪽) — ' + JSON.stringify(L0))
    ok('㊸ 끈고리② = 원본 중간(90·보정), 안쪽만', L0.filter((l) => near(l.y, d0.y + d0.h / 2)).map((l) => l.side).join('') === 'right')
    ok('㊸ 벌②의 안쪽은 왼쪽', r.loops.filter((l) => l.panel === 1 && near(l.y, r.design[1].y + band))[0].side === 'left')
    const fl = F0.filter((l) => l.side === 'left')[0], fr = F0.filter((l) => l.side === 'right')[0]
    ok('㊸ ★선은 시접 띠 위 — 길이 = 시접 폭(23.25) · 4pt', F0.concat(L0).every((l) => near(l.len, seam) && l.weightPt === 4), JSON.stringify(F0[0]))
    ok('㊸ ★왼쪽 선 = [벌 왼 끝, 원본 왼 끝]', near(fl.x, p0.x) && near(fl.x + fl.len, d0.x), JSON.stringify(fl))
    ok('㊸ ★오른쪽 선 = [원본 오른 끝, 벌 오른 끝] — 원본 안으로 안 들어간다', near(fr.x, d0.x + d0.w) && near(fr.x + fr.len, p0.x + p0.w), JSON.stringify(fr))
    const off = globalThis.MesPlate.computePlate(base({ sewCm: 5, vup: 2, loops: false }))
    ok('㊸ 끈고리를 끄면 끈고리만 0 — 접는선은 남는다', off.loops.length === 0 && off.folds.length === 4)
    ok('㊸ 시접 0(칼재단)이면 선을 그리지 않고 trace 에 남긴다', (function () {
      const c = globalThis.MesPlate.computePlate(base({ seam: '칼재단', vup: 1 }))
      return c.ok && c.folds.length === 0 && c.loops.length === 0 && c.trace.marks.noSeam === true
    })())

    // 상하단 봉미싱 — 아래에도 접는선 2 + 끈고리 1 (용준님 2026-09-23 「동일한 형식으로 하단에도」)
    const tb = globalThis.MesPlate.computePlate(base({ band: 'topbottom', sewCm: 5, vup: 2 }))
    const dT = tb.design[0], bT = tb.trace.bandH0 * k
    ok('㊸ 상하단 봉미싱 = 벌마다 접는선 4 + 끈고리 3 = 7', tb.ok && tb.folds.length === 8 && tb.loops.length === 6,
      'folds=' + tb.folds.length + ' loops=' + tb.loops.length)
    ok('㊸ 아래 접는선 = 원본 아래 끝선 좌·우', tb.folds.filter((l) => l.panel === 0 && near(l.y, dT.y + dT.h)).map((l) => l.side).sort().join(',') === 'left,right')
    ok('㊸ 아래 끈고리 = 아래 접는선에서 봉미싱 길이만큼 위, 안쪽만', tb.loops.filter((l) => l.panel === 0 && near(l.y, dT.y + dT.h - bT)).map((l) => l.side).join('') === 'right')
    ok('㊸ 중간 끈고리는 상하단에도 하나', tb.loops.filter((l) => l.panel === 0 && near(l.y, dT.y + dT.h / 2)).length === 1)

    // 부직포 — 밴드·접는선 없음 · 끈고리 = 위 끝선 + 폭 + 1cm, 중간 (용준님 2026-09-23 「7cm 라면 8cm 위치」)
    const nw = globalThis.MesPlate.computePlate(base({ band: 'nonwoven7', vup: 2 }))
    ok('㊻ 부직포 7cm = 밴드 0 · 접는선 0 · 끈고리 2', nw.ok && nw.bands.length === 0 && nw.folds.length === 0 && nw.loops.length === 4,
      nw.ok ? JSON.stringify({ b: nw.bands.length, f: nw.folds.length, l: nw.loops.length }) : nw.reason)
    ok('㊻ 위 여백이 없다 — 원본이 판 위 끝에 붙고 판 높이 = 벌', near(nw.design[0].y, 0) && near(nw.plate.h, nw.panels[0].h) && near(nw.outer[0].h, nw.panels[0].h))
    ok('㊻ 하단 3cm 쌍침 여유는 유지(1830)', near(nw.trace.panelH0, 1830), nw.trace.panelH0)
    ok('㊻ ★끈고리① = 위 끝선에서 8cm(보정) 아래, 안쪽', nw.loops.filter((l) => l.panel === 0 && near(l.y, 80 * k)).map((l) => l.side).join('') === 'right', JSON.stringify(nw.loops))
    ok('㊻ 부직포 10cm → 11cm 자리', globalThis.MesPlate.computePlate(base({ band: 'nonwoven10', vup: 2 })).loops.filter((l) => l.panel === 0 && near(l.y, 110 * k)).length === 1)
    ok('㊻ 봉미싱 cm 이 없어도 만든다(칸을 숨기므로)', globalThis.MesPlate.computePlate(base({ band: 'nonwoven7', vup: 2, sewCm: NaN })).ok === true)
    ok('㊻ trace 에 부직포 폭·밴드 0 이 남는다', nw.trace.nonwovenCm === 7 && nw.trace.bandCount === 0 && nw.trace.finish === 'nonwoven7')
    ok('㊻ 마감 목록은 넷뿐 — 5cm·레자는 없다', Object.keys(R.FINISH).join(',') === 'top,topbottom,nonwoven7,nonwoven10'
      && !Object.keys(R.FINISH).some((f) => /레자|5cm/.test(R.FINISH[f].label)), Object.keys(R.FINISH).join(','))
    ok('㊻ 모르는 마감은 거절', globalThis.MesPlate.computePlate(base({ band: 'nonwoven5' })).ok === false)

    const H0 = r.holes.filter((h) => h.panel === 0)
    ok('㊹ 하도매 상단 2 + 측면 3 = 겹침 빼고 4구', H0.length === 4, 'holes=' + H0.length + ' ' + JSON.stringify(H0))
    ok('㊹ 위 안쪽 모서리 = (오른쪽 1cm, 위 1cm) 하나뿐',
      H0.filter((h) => near(h.cx, d0.x + d0.w - 10) && near(h.cy, d0.y + 10)).length === 1)
    ok('㊹ 아래 안쪽 모서리 = 아래 끝선에서 1cm (90cm 원본이면 89)', H0.some((h) => near(h.cx, d0.x + d0.w - 10) && near(h.cy, d0.y + d0.h - 10)))
    ok('㊹ 측면 중간 = 원본 높이 절반', H0.some((h) => near(h.cx, d0.x + d0.w - 10) && near(h.cy, d0.y + d0.h / 2)))
    ok('㊹ Ø0.5cm', H0.every((h) => h.r === 2.5))
    ok('㊹ ★하도매는 시접이 아니라 원본 끝선 기준 — 선과 기준이 다르다', H0.every((h) => h.cx >= d0.x && h.cx <= d0.x + d0.w))
    ok('㊹ 하도매 0·0 이면 없다', globalThis.MesPlate.computePlate(base({ sewCm: 5, vup: 2 })).holes.length === 0)
    ok('㊹ trace 에 개수·안쪽 기준이 남는다', r.trace.marks.folds === 4 && r.trace.marks.loops === 4 && r.trace.marks.holes === 8 && r.trace.marks.innerSide === 'facing')
    // ★도련이 덮을 전체 = 벌 ∪ 밴드 (밴드에도 비슷한 색 — 용준님 2026-09-22). 정본은 plate.js outer 한 곳.
    ok('㊺ outer = 벌 ∪ 밴드 (y=0 부터 벌 아래까지)', r.outer && r.outer.length === 2 && near(r.outer[0].y, 0)
      && near(r.outer[0].h, r.panels[0].y + r.panels[0].h) && near(r.outer[0].x, r.panels[0].x) && near(r.outer[0].w, r.panels[0].w),
      JSON.stringify(r.outer))
    ok('㊺ 상하봉미싱이면 아래 밴드까지', (function () { var t = globalThis.MesPlate.computePlate(base({ band: 'topbottom', sewCm: 5, vup: 2 })); return t.ok && near(t.outer[0].h, t.plate.h) })())
  }

  // 최소 호스트 버전 ≤ 실제 호스트 버전
  const minM = panel.match(/TR_MIN_HOST\s*=\s*\[(\d+),\s*(\d+),\s*(\d+)\]/)
  const hostM = host.match(/MESTR_VERSION\s*=\s*'TR-CEP-(\d+)\.(\d+)\.(\d+)'/)
  ok('㊲ 두 버전 상수를 읽을 수 있다', !!minM && !!hostM, String(minM) + ' / ' + String(hostM))
  if (minM && hostM) {
    const min = [+minM[1], +minM[2], +minM[3]], hv = [+hostM[1], +hostM[2], +hostM[3]]
    const le = (hv[0] - min[0]) || (hv[1] - min[1]) || (hv[2] - min[2])
    ok('㊳ ★패널이 요구하는 최소 호스트 ≤ repo 호스트', le >= 0, min.join('.') + ' > ' + hv.join('.'))
  }
}

console.log('\n' + '='.repeat(56))
console.log(fail ? `실패 ${fail} / 전체 ${pass + fail}` : `전 항목 통과 (${pass})`)
process.exit(fail ? 1 : 0)
