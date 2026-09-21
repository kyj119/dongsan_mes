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
  const rec = P.computePlate(base({ fabric: '폰지', nonwovenCm: 7, hardware: { size: 5, holes: 4 } }))
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
