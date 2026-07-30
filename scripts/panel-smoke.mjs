// A0 패널 리모델 헤드리스 스모크 — Chromium + CSInterface/cep.fs 스텁으로 실제 DOM 동작 검증.
// 일러 없이 잡을 수 있는 것: 초기화 예외 · 탭=용도 파생 · 후가공 초기화 · 분리→목록→등록 게이트 · 1덩어리 경고.
import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'

const PANEL = 'C:/Users/user/dongsan_mes/IllustratorAutomat/designer/poc-a0-cep/com.mes.a0.panel/index.html'
const results = []
const ok = (n, c, extra = '') => results.push({ n, c, extra })

// 실제 config.json 스키마: methods[].method_group 로 가공자 도메인 필터가 걸린다(기본 'output').
//   ⚠️ clients 의 이름 필드는 `client_name` 이다(Z: 실물 config 실측 2026-07-30). 스텁이 `name` 이던
//      동안은 clientIdOf() 가 절대 일치하지 않아 거래처 id 해소 경로가 검증 사각이었다.
//   workers 에 매핑 없는 계정을 하나 섞어 둔다 — 가공자 목록이 도메인 매핑으로 걸러지는지 본다
//      (실제 prod config 에도 '123'·'디자이너' 같은 DESIGNER 롤 계정이 섞여 있다).
const CONFIG = JSON.stringify({
  methods: [
    { name: '접어미싱', margin_cm: 4, method_group: 'output' },
    { name: '열재단', margin_cm: 0, method_group: 'output' },
    { name: '쌍침', margin_cm: 0, method_group: 'transfer' },
  ],
  presets: [{ name: '양옆 접어미싱', method_group: 'output', config: JSON.stringify({ left: '접어미싱', right: '접어미싱' }) }],
  clients: [{ id: 1946, client_name: '테스트거래처' }],
  workers: [{ id: 14, name: '인호동' }, { id: 13, name: '123' }],
  worker_domains: [{ worker_name: '인호동', domain: 'output' }],
})
// 매핑이 0건인 상태(= 현재 prod) — 명단은 전량 폴백 + '도메인 미지정' 경고가 떠야 한다.
const CONFIG_NOMAP = JSON.stringify({
  methods: [{ name: '접어미싱', margin_cm: 4, method_group: 'output' }, { name: '쌍침', margin_cm: 0, method_group: 'transfer' }],
  presets: [], clients: [], workers: [{ id: 14, name: '인호동' }, { id: 13, name: '123' }], worker_domains: [],
})

// 호스트 응답 스텁. splitCount 를 바꿔 1덩어리/다조각을 모두 재현한다.
//   ⚠️ CSInterface 를 갈아끼우면 안 된다 — 패널이 자체 shim(js/CSInterface.js)을 나중에 로드해
//   덮어쓴다. shim 이 실제로 보는 `window.__adobe_cep__` 를 심어야 실제 경로가 그대로 검증된다.
const mkStub = (cfg) => `
window.__calls = [];
window.__splitCount = 3;
window.__failProcess = false;
window.__processDelay = 0;   // 느린 호스트 재현 — 진행 중 잠금·취소를 관찰하려면 필요
window.cep = { fs: { readFile: () => ({ err: 1 }), writeFile: () => ({ err: 0 }) } };
window.__adobe_cep__ = {
  getExtensionID: function () { return 'com.mes.a0.panel'; },
  getSystemPath: function () { return 'C:/tmp'; },
  getHostEnvironment: function () { return JSON.stringify({ appName: 'ILST', appVersion: '29.0' }); },
  evalScript: function (script, cb) {
    window.__calls.push(script);
    var res = '';
    if (/^mesA0_ping/.test(script)) res = 'A0-CEP-TEST';
    else if (/^mesA0_config/.test(script)) res = ${JSON.stringify(cfg)};
    else if (/^mesA0_measure/.test(script)) res = JSON.stringify({ ok: true, w: 8.7, h: 19.7 });
    else if (/^mesA0_queueAddBatch|^mesA0_autoDetect/.test(script)) {
      var sizes = [];
      for (var i = 0; i < window.__splitCount; i++) sizes.push({ w: 87 + i, h: 197, items: 1 });
      res = JSON.stringify({ ok: true, added: sizes.length, total: sizes.length, sizes: sizes });
    }
    else if (/^mesA0_queueSelect/.test(script)) res = JSON.stringify({ ok: true, n: 2 });
    else if (/^mesA0_paramsPath/.test(script)) res = 'C:/tmp/ia_params.json';
    else if (/^mesA0_batchBegin/.test(script)) res = JSON.stringify({ ok: true, folder: 'Z:/test/batch1' });
    // bytes·oversize·warn'E' = 용량 근본원인 계측(host 0.1.4). 51.2MB + 여분 래스터 2개 상태를 재현한다.
    else if (/^mesA0_process/.test(script)) res = window.__failProcess
      ? JSON.stringify({ ok: false, err: 'noart', items: 0, sel: 1 })
      : JSON.stringify({ ok: true, w: 87, h: 197, folder: 'Z:/test', items: 1, normed: 0, bytes: 53687091, oversize: 2, warn: 'E', eps: 'a.eps', dxf: 'a.dxf' });
    else res = JSON.stringify({ ok: true });
    var delay = /^mesA0_process/.test(script) ? (window.__processDelay || 0) : 0;
    if (cb) setTimeout(function () { cb(res); }, delay);
  }
};
`

const hostStub = mkStub(CONFIG)

const browser = await chromium.launch()
// 격리 케이스용 — 상태가 얽히면 뒤 어서션이 앞 케이스에 오염된다(탭 전환·연동·실패분은 새 페이지로).
// 신규 패널은 **가공자 미선택** 상태로 뜬다(첫 사용 오등록 차단 가드) → 등록을 보는 케이스는
//   먼저 가공자를 골라야 한다. 미선택 상태 자체를 검증하는 17c 만 pickWorker:false 로 연다.
async function openPanel(cfg, opts) {
  const p = await browser.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(String(e)))
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()) })
  await p.addInitScript(mkStub(cfg))
  await p.goto(pathToFileURL(PANEL).href)
  await p.waitForTimeout(300)
  if (!opts || opts.pickWorker !== false) await pickWorker(p)
  p.__errs = errs
  return p
}
async function pickWorker(p) {
  const names = await p.evaluate(() => Array.from(document.getElementById('worker').options)
    .map((o) => o.value).filter(Boolean))
  if (names.length) await p.selectOption('#worker', names[0])
}

const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

await page.addInitScript(hostStub)
await page.goto(pathToFileURL(PANEL).href)
await page.waitForTimeout(300)

// 1) 초기화 무예외 + 기본 탭 = 단건
ok('초기화 콘솔/페이지 에러 0', errors.length === 0, errors.join(' | '))
// 첫 사용은 가공자 미선택이 정상 → 이후 등록 케이스를 위해 골라 둔다(가드 자체는 17c 에서 검증)
ok('신규 패널은 가공자 미선택', (await page.locator('#worker').inputValue()) === '')
await pickWorker(page)
ok('기본 탭 = 단건', await page.locator('.tab.active').innerText() === '단건')
ok('후가공은 접이식(기본 접힘)', await page.locator('#finBody').isHidden())
// 액션 동사 통일(P3) — 세 탭이 모두 '등록' 어간을 쓰고 범위만 다르다
ok('실행 버튼 = 1건 등록', await page.locator('#btnProcess').innerText() === '1건 등록')

// 2) 후가공 펼치기 → 값 입력
await page.click('#finToggle')
ok('후가공 펼침', await page.locator('#finBody').isVisible())
await page.selectOption('select.finM[data-side="left"]', '접어미싱')
await page.fill('#pTop', '3')
ok('후가공 값 입력됨', await page.inputValue('#pTop') === '3')

// 출력 경계선 토글 — 기본 ON, 끄면 params 로 false 가 나가야 한다
ok('출력 경계선 기본 ON', await page.isChecked('#borderLine'))
await page.uncheck('#borderLine')
ok('출력 경계선 끔', !(await page.isChecked('#borderLine')))

// 3) 모아찍기 탭 → 후가공 자동 초기화(P1의 핵심)
await page.click('.tab[data-tab="impose"]')
ok('탭 전환됨', await page.locator('.tab.active').innerText() === '모아찍기')
ok('마감 초기화됨', await page.inputValue('#pTop') === '0')
ok('마감 방식 초기화됨', await page.locator('select.finM[data-side="left"]').inputValue() === '')
ok('출력 경계선도 기본값(ON)으로 복귀', await page.isChecked('#borderLine'))

// 4) 분리 → 목록 3건 → 등록 버튼 활성
await page.click('#btnImposeSplit')
await page.waitForTimeout(200)
const rows = await page.locator('#imposeBox .qrow').count()
ok('분리 결과 3행', rows === 3, 'rows=' + rows)
ok('등록 버튼 라벨', await page.locator('#btnImposeRegister').innerText() === '조각 3건 등록')
ok('등록 버튼 활성', !(await page.locator('#btnImposeRegister').isDisabled()))

// 5) 수량 3분화 — 모아찍기는 수량을 받지 않는다(행 수량칸 자체가 없어야 한다)
ok('모아찍기 행에 수량칸 없음', (await page.locator('#imposeBox .qqty').count()) === 0)
ok('모아찍기 탭에 수량 입력 없음', (await page.locator('[data-page="impose"] #qty, [data-page="impose"] #seedQty').count()) === 0)
ok('수량은 단건 탭 소속', (await page.locator('[data-page="single"] #qty').count()) === 1)
ok('기본수량은 묶음 탭 소속', (await page.locator('[data-page="bundle"] #seedQty').count()) === 1)

// 6) 큐 잔여 상태에서 재분리 거부
await page.click('#btnImposeSplit')
await page.waitForTimeout(150)
ok('잔여 목록 있으면 재분리 거부', (await page.locator('#out').innerText()).includes('남아 있습니다'))

// 7) 비우기 → 1덩어리 경고
await page.click('#btnImposeClear')
await page.waitForTimeout(100)
await page.evaluate(() => { window.__splitCount = 1 })
await page.click('#btnImposeSplit')
await page.waitForTimeout(200)
const warn = await page.locator('#out').innerText()
ok('1덩어리 경고 표시', warn.includes('1개로만 인식'), warn.slice(0, 60))
ok('1건이어도 자동등록 안 함(목록에 남음)', (await page.locator('#imposeBox .qrow').count()) === 1)

// 8) 묶음 탭에서 행 클릭 → 단건 탭으로 튕기지 않음
await page.click('#btnImposeClear')
await page.click('.tab[data-tab="bundle"]')
await page.evaluate(() => { window.__splitCount = 3 }) // 7)에서 1로 낮췄던 것 복구
await page.fill('#seedQty', '4')
await page.click('#btnQueueBatch')
await page.waitForTimeout(200)

// 묶음: seedQty 가 새 행에 채워지고, 행에서 고친 값이 정본으로 남는다
ok('새 행에 기본수량 채워짐', (await page.inputValue('#queueBox .qqty[data-i="0"]')) === '4')
await page.fill('#queueBox .qqty[data-i="1"]', '7')
await page.dispatchEvent('#queueBox .qqty[data-i="1"]', 'change')
ok('행 수량 편집 유지', (await page.inputValue('#queueBox .qqty[data-i="1"]')) === '7')
ok('단건 수량은 행 편집에 안 끌려감', (await page.inputValue('#qty')) === '1')
await page.click('#queueBox .qrow[data-i="0"] .qmeta')
await page.waitForTimeout(150)
ok('묶음 탭 유지(행 클릭이 탭을 안 바꿈)', await page.locator('.tab.active').innerText() === '묶음')
ok('행 클릭 시 일러 선택 호출(P3)', await page.evaluate(() => window.__calls.some((c) => /mesA0_queueSelect/.test(c))))

// 9) 후가공 = 단건·묶음 공용 1벌(탭 전환 시 이동) — 묶음도 후가공이 필요하다(2026-07-30 지시).
//    복제가 아니라 이동이므로 어느 시점에도 폼이 2벌이 되면 안 된다(값 갈림 = 등록된 쪽 특정 불가).
ok('묶음 탭에 후가공 폼 이동', await page.evaluate(() => !!document.querySelector('[data-page="bundle"] #finToggleRow')))
// 주석 키워드 칸 = 묶음에선 행 키워드가 정본이라 숨긴다(2026-07-30 지적)
ok('묶음에서 주석 키워드칸 숨김', await page.locator('#annotKwRow').isHidden())
ok('후가공 폼은 항상 1벌', await page.evaluate(() => document.querySelectorAll('#finToggleRow').length === 1 && document.querySelectorAll('#finBody').length === 1))

// 9-2) 적용 버튼은 폼 옆(편집 도구) · 하단은 확정 액션만 (2026-07-30 ③)
ok('적용 버튼 2개가 폼 헤더에', await page.evaluate(() => !!document.querySelector('#finToggleRow #btnApplySel') && !!document.querySelector('#finToggleRow #btnApplyAll')))
ok('하단 확정줄에 적용 버튼 없음', await page.evaluate(() => {
  const r = document.querySelector('#btnConfirm').parentNode
  return !r.querySelector('#btnApplyAll') && !r.querySelector('#btnApplySel')
}))

// 9-3) 행 다중선택 → 선택 적용 (2026-07-30 ①) — 5+5 를 2회로 줄이는 경로
ok('묶음 행에 체크박스', (await page.locator('#queueBox .qsel').count()) === 3)
ok('모아찍기 행엔 체크박스 없음', await page.evaluate(() => document.querySelectorAll('#imposeBox .qsel').length === 0))
ok('체크 0개면 선택 적용 비활성', await page.locator('#btnApplySel').isDisabled())
await page.check('#queueBox .qsel[data-i="0"]')
await page.check('#queueBox .qsel[data-i="2"]')
ok('체크한 행 적용 라벨에 개수', (await page.locator('#btnApplySel').innerText()) === '체크한 행 적용 (2)')
await page.click('#btnApplySel')
await page.waitForTimeout(150)
ok('선택 행만 적용 메시지', (await page.locator('#out').innerText()).includes('#1 #3'), (await page.locator('#out').innerText()).slice(0, 90))

// 9-3b) ★숨은 주석 키워드 칸은 행에 쓰지 못한다(2026-07-30 P2 — 이전 동작을 의도적으로 뒤집었다).
//   전엔 묶음 탭에서 #annot 이 숨겨져 있는데도 그 값을 시드·폴백으로 써서, **지난번에 단건 탭에서
//   넣었던 키워드(localStorage 복원값)가 새 행에 조용히 주입**됐다. 사용자는 칸이 안 보이니 이유를
//   알 수 없다. 묶음에선 행별 키워드가 정본이므로 숨은 칸의 값은 무시한다.
await page.evaluate(() => { document.getElementById('annot').value = '숨은키워드' })
await page.click('#btnApplyAll')
await page.waitForTimeout(200)
ok('묶음: 숨은 키워드가 행에 주입되지 않음', await page.evaluate(() => {
  const v = Array.from(document.querySelectorAll('#queueBox .qkw')).map((e) => e.value)
  return v.length === 3 && v.every((x) => x !== '숨은키워드')
}), await page.evaluate(() => Array.from(document.querySelectorAll('#queueBox .qkw')).map((e) => e.value).join('|')))
ok('묶음: 주석 키워드칸 여전히 숨김', await page.locator('#annotKwRow').isHidden())
ok('재렌더 후에도 체크 유지', await page.evaluate(() => document.querySelector('#queueBox .qsel[data-i="0"]').checked && document.querySelector('#queueBox .qsel[data-i="2"]').checked))

// 9-4) 검토는 선택 사항 (2026-07-30 ②) — 검토 없이도 확정 가능해야 하고, 미검토가 눈에 보여야 한다
ok('검토 없이 확정 버튼 활성', !(await page.locator('#btnConfirm').isDisabled()))
ok('미검토 표시', (await page.locator('#btnConfirm').innerText()).indexOf('미검토') > 0, await page.locator('#btnConfirm').innerText())
// ★ disabled 만 보면 안 된다 — 게이트가 클릭 핸들러에도 있어서 버튼은 활성인데 확정이 막혔다
//   (2026-07-30 실사용 지적). 반드시 눌러서 실제로 진행되는지 본다.
await page.click('#btnConfirm')
await page.waitForTimeout(400)
const confMsg = await page.locator('#out').innerText()
ok('검토 없이 실제 확정 진행', !confMsg.includes('검토문서로 확인한 뒤') && confMsg.includes('일괄 확정 완료'), confMsg.slice(0, 120))
ok('미검토 확정이 결과에 기록', confMsg.includes('(미검토 확정)'), confMsg.slice(0, 120))

// 10) 등록 결과에 용량·임베드 여분 경고 노출 — 100MB work.ai 재발을 알아채는 유일한 지점.
//    (사고 당시엔 용량이 어디에도 안 보여 5건 524MB가 쌓인 뒤에야 발견됐다)
await page.click('.tab[data-tab="single"]')
await page.click('#btnProcess')
await page.waitForTimeout(300)
const doneMsg = await page.locator('#out').innerText()
ok('단건 복귀 시 후가공 폼도 단건으로', await page.evaluate(() => !!document.querySelector('[data-page="single"] #finToggleRow')))
ok('단건에선 주석 키워드칸 표시', await page.locator('#annotKwRow').isVisible())
ok('등록 결과에 work.ai 용량 표시', doneMsg.includes('work.ai 51.2MB'), doneMsg.slice(0, 140))
ok('임베드 여분 경고 표시', doneMsg.includes('임베드 이미지가 디자인 밖까지 큼'), doneMsg.slice(0, 200))
ok('돔보 등록분 DXF 표시', doneMsg.includes('DXF: a.dxf'), doneMsg.slice(0, 220))

ok('전체 콘솔/페이지 에러 0', errors.length === 0, errors.join(' | '))

// ── 11) 버전 = 로직(축2) + 화면(축3/축4) 두 축 (2026-07-30 점검 ⑤) ──
//    화면 버전이 없으면 껍데기 재설치를 안 한 PC 도 최신 번호로 보인다 = 배포 확인 수단 0.
{
  const ver = await page.locator('#ver').innerText()
  ok('버전에 host 축 표시', ver.includes('A0-CEP-TEST'), ver)
  ok('버전에 화면(껍데기) 축 표시', /화면 \d+\.\d+\.\d+/.test(ver), ver)
}

// ── 12) 가공자 명단 = config 정본 (하드코딩 제거, 점검 ④) ──
{
  // 빈 안내 항목('(가공자 선택)')은 명단이 아니므로 제외하고 센다
  const opts = await page.evaluate(() => Array.from(document.querySelectorAll('#worker option')).map((o) => o.value).filter(Boolean))
  ok('명단이 도메인 매핑으로 걸러짐', opts.length === 1 && opts[0] === '인호동', JSON.stringify(opts))
  ok('매핑 없는 계정(123) 제외', !opts.includes('123'), JSON.stringify(opts))
}

// ── 12b) 매핑 0건(= 현재 prod) → 전량 폴백 + 도메인 미지정 경고 ──
{
  const p2 = await openPanel(CONFIG_NOMAP)
  const opts = await p2.evaluate(() => Array.from(document.querySelectorAll('#worker option')).map((o) => o.value).filter(Boolean))
  ok('매핑 0건이면 전량 폴백', opts.length === 2, JSON.stringify(opts))
  const saved = await p2.locator('#saved').innerText()
  ok('도메인 미지정 경고 표시', saved.includes('도메인 미지정'), saved)
  ok('미지정 경고 색 클래스', (await p2.getAttribute('#saved', 'class')).includes('warn'))
  // 미지정이면 전사(봉제) 방식은 드롭다운에 없다 — 이 사실이 화면에 드러나는지가 요점
  const finOpts = await p2.evaluate(() => Array.from(document.querySelectorAll('select.finM[data-side="top"] option')).map((o) => o.value))
  ok('미지정 상태에선 전사 방식 미노출(폴백=현수막)', !finOpts.includes('쌍침'), JSON.stringify(finOpts))
  ok('12b 콘솔 에러 0', p2.__errs.length === 0, p2.__errs.join(' | '))
  await p2.close()
}

// ── 13) 탭 전환 시 행 연동 자동 해제 (점검 ②-가) ──
{
  const p3 = await openPanel(CONFIG)
  await p3.click('.tab[data-tab="bundle"]')
  await p3.click('#btnQueueBatch')
  await p3.waitForTimeout(200)
  await p3.click('#queueBox .qrow[data-i="0"] .qmeta')
  await p3.waitForTimeout(150)
  ok('행 연동 표시(sel)', (await p3.locator('#queueBox .qrow.sel').count()) === 1)
  await p3.click('.tab[data-tab="single"]')
  await p3.waitForTimeout(120)
  await p3.click('.tab[data-tab="bundle"]')
  ok('탭 전환으로 연동 해제됨', (await p3.locator('#queueBox .qrow.sel').count()) === 0)
  ok('13 콘솔 에러 0', p3.__errs.length === 0, p3.__errs.join(' | '))
  await p3.close()
}

// ── 14) 모아찍기 행이 단건 탭 왕복 후에도 impose 를 유지 (H1 회귀 방지, 점검 ②-나) ──
//    전엔 행 연동 상태로 단건 탭에 가서 입력 하나만 해도 그 행이 single 로 변질돼
//    [등록]이 잠기고 "단건 용도 행이 섞여 있습니다"가 떴다(복구 = 비우고 재분리뿐).
{
  const p4 = await openPanel(CONFIG)
  await p4.click('.tab[data-tab="impose"]')
  await p4.click('#btnImposeSplit')
  await p4.waitForTimeout(200)
  await p4.click('#imposeBox .qrow[data-i="0"] .qmeta')
  await p4.waitForTimeout(150)
  await p4.click('.tab[data-tab="single"]')
  await p4.fill('#qty', '5')
  await p4.dispatchEvent('#qty', 'change')
  await p4.waitForTimeout(120)
  await p4.click('.tab[data-tab="impose"]')
  await p4.waitForTimeout(120)
  ok('단건 탭 왕복 후에도 등록 활성', !(await p4.locator('#btnImposeRegister').isDisabled()),
    'title=' + (await p4.getAttribute('#btnImposeRegister', 'title')))
  ok('용도 혼합 경고 없음', !(await p4.getAttribute('#btnImposeRegister', 'title') || '').includes('섞여'))
  ok('14 콘솔 에러 0', p4.__errs.length === 0, p4.__errs.join(' | '))
  await p4.close()
}

// ── 15) 일괄 확정 실패분은 큐에 남는다 (H5 회귀 방지, 점검 ③) ──
{
  const p5 = await openPanel(CONFIG)
  await p5.click('.tab[data-tab="bundle"]')
  await p5.click('#btnQueueBatch')
  await p5.waitForTimeout(200)
  await p5.evaluate(() => { window.__failProcess = true })
  await p5.click('#btnConfirm')
  await p5.waitForTimeout(700)
  const msg = await p5.locator('#out').innerText()
  ok('실패 3건 보고', /실패 3/.test(msg), msg.slice(0, 60))
  ok('실패 행이 큐에 남음', (await p5.locator('#queueBox .qrow').count()) === 3)
  ok('재시도 안내 표시', msg.includes('재시도'), msg.slice(-90))
  // 부분 실패: 성공분만 빠지고 실패분만 남아야 한다
  await p5.evaluate(() => { window.__failProcess = false })
  await p5.click('#btnConfirm')
  await p5.waitForTimeout(700)
  ok('재시도 성공 시 큐 비움', (await p5.locator('#queueBox .qrow').count()) === 0,
    (await p5.locator('#out').innerText()).slice(0, 60))
  ok('15 콘솔 에러 0', p5.__errs.length === 0, p5.__errs.join(' | '))
  await p5.close()
}

// ── 17) P2: 호스트 작업 잠금 단일화 + 취소 (params 파일 경쟁 차단) ──
//    전엔 잠금이 버튼별 임시 disable 이라 새 진입점이 계속 새어 나갔다: 배치 중 [＋묶음분리]·
//    [비우기]·[◎자동감지]·[선택분 분리] 가 안 잠기고, 단건 가공 중 [일괄 확정]도 눌렸다.
//    두 파이프라인은 mesA0_paramsPath() 파일 1개를 공유하므로 설정이 섞일 수 있다.
{
  const p7 = await openPanel(CONFIG)
  await p7.click('.tab[data-tab="bundle"]')
  await p7.click('#btnQueueBatch')
  await p7.waitForTimeout(200)
  await p7.evaluate(() => { window.__processDelay = 500 }) // 느린 호스트 재현
  await p7.click('#btnConfirm')
  await p7.waitForTimeout(250)
  const mid = await p7.evaluate(() => ({
    process: document.getElementById('btnProcess').disabled,
    queueBatch: document.getElementById('btnQueueBatch').disabled,
    queueClear: document.getElementById('btnQueueClear').disabled,
    autoDetect: document.getElementById('btnAutoDetect').disabled,
    imposeSplit: document.getElementById('btnImposeSplit').disabled,
    imposeRegister: document.getElementById('btnImposeRegister').disabled,
    measure: document.getElementById('btnMeasure').disabled,
    review: document.getElementById('btnReview').disabled,
    cancelShown: document.getElementById('btnCancel').style.display !== 'none',
  }))
  const allLocked = mid.process && mid.queueBatch && mid.queueClear && mid.autoDetect &&
    mid.imposeSplit && mid.imposeRegister && mid.measure && mid.review
  ok('배치 중 모든 호스트 진입점 잠김', allLocked, JSON.stringify(mid))
  ok('배치 중 취소 버튼 노출', mid.cancelShown)
  // 취소 → 남은 건은 큐에 남고 잠금이 풀려야 한다
  await p7.click('#btnCancel')
  await p7.waitForTimeout(2500)
  const after = await p7.evaluate(() => ({
    out: document.getElementById('out').textContent,
    rows: document.querySelectorAll('#queueBox .qrow').length,
    cancelShown: document.getElementById('btnCancel').style.display !== 'none',
    processEnabled: !document.getElementById('btnProcess').disabled,
  }))
  ok('취소 메시지 표시', /취소/.test(after.out), after.out.slice(0, 70))
  ok('취소 후 잠금 해제', after.processEnabled && !after.cancelShown, JSON.stringify(after))
  ok('취소 시 미처리분은 큐에 남음', after.rows > 0, 'rows=' + after.rows)
  ok('17 콘솔 에러 0', p7.__errs.length === 0, p7.__errs.join(' | '))
  await p7.close()
}

// ── 17c) 배포 전 점검: 가공자 미선택 방지 (첫 실사용 데이터 오염 차단) ──
//    prod 실측 — worker_domains 0건이라 전량 폴백이고 정렬상 맨 위가 테스트 계정 `123`(id 13).
//    드롭다운 첫 항목이 곧 기본값이므로 안 고르고 등록하면 남의 worker_id 로 기록돼
//    "내 작업" 에서 사라진다. → 빈 항목을 앞에 두고 등록 시점에 선택을 요구한다.
{
  const p11 = await openPanel(CONFIG_NOMAP, { pickWorker: false })   // 매핑 0건 = 현재 prod 상태
  const first = await p11.evaluate(() => {
    const s = document.getElementById('worker')
    return { value: s.value, firstOpt: s.options[0] ? s.options[0].textContent : '(없음)', count: s.options.length }
  })
  ok('매핑 0건이면 가공자 미선택 상태', first.value === '', JSON.stringify(first))
  ok('빈 안내 항목이 맨 위', first.firstOpt.includes('가공자 선택'), first.firstOpt)
  // 미선택으로 단건 등록 시도 → 차단되어야 하고 호스트를 부르지 않아야 한다
  await p11.click('#btnProcess')
  await p11.waitForTimeout(300)
  const blocked = await p11.evaluate(() => ({
    out: document.getElementById('out').textContent,
    processCalls: window.__calls.filter((c) => /mesA0_process/.test(c)).length,
  }))
  ok('가공자 미선택 시 등록 차단', /가공자를 먼저 고르세요/.test(blocked.out), blocked.out.slice(0, 60))
  ok('차단 시 호스트 호출 0', blocked.processCalls === 0, 'process 호출 ' + blocked.processCalls)
  // 고르면 통과
  await p11.selectOption('#worker', '인호동')
  await p11.click('#btnProcess')
  await p11.waitForTimeout(400)
  ok('가공자 선택 후에는 등록 진행', await p11.evaluate(() => window.__calls.some((c) => /mesA0_process/.test(c))))
  ok('17c 콘솔 에러 0', p11.__errs.length === 0, p11.__errs.join(' | '))
  await p11.close()
}

// ── 17b) 배포 전 점검: 잠금이 새는 두 경로 ──
//    ⓐ #scale·#trimInk 는 select/checkbox 라 setHostBusy 가 못 잠근다 → 배치 중 배율을 바꾸면
//       mesA0_measure 호출이 끼어들었다. 가드는 refreshMeasure 진입점 한 곳에서 한다.
//    ⓑ 호스트 콜백이 끝내 안 돌아오면(JSX 모달·COM wedge 전례) 잠금이 영영 안 풀려 패널이 굳는다
//       → 취소 2번째 클릭 = 강제 해제(탈출구).
{
  const p10 = await openPanel(CONFIG)
  await p10.click('.tab[data-tab="bundle"]')
  await p10.click('#btnQueueBatch')
  await p10.waitForTimeout(200)
  await p10.evaluate(() => { window.__processDelay = 600 })
  await p10.click('#btnConfirm')
  await p10.waitForTimeout(250)
  const callsBefore = await p10.evaluate(() => window.__calls.filter((c) => /mesA0_measure/.test(c)).length)
  await p10.selectOption('#scale', '10')                 // 배치 중 배율 변경
  await p10.evaluate(() => document.getElementById('trimInk').click())
  await p10.waitForTimeout(400)
  const callsAfter = await p10.evaluate(() => window.__calls.filter((c) => /mesA0_measure/.test(c)).length)
  ok('배치 중 배율·잉크 변경이 호스트 실측을 부르지 않음', callsAfter === callsBefore,
    'measure 호출 ' + callsBefore + ' → ' + callsAfter)
  // 취소 2단: 1번째=정상 취소 요청, 2번째=강제 해제
  await p10.click('#btnCancel')
  ok('취소 1회 → 강제 해제 안내로 바뀜', (await p10.locator('#btnCancel').innerText()).includes('강제 해제'),
    await p10.locator('#btnCancel').innerText())
  await p10.click('#btnCancel')
  await p10.waitForTimeout(150)
  const forced = await p10.evaluate(() => ({
    processEnabled: !document.getElementById('btnProcess').disabled,
    out: document.getElementById('out').textContent,
  }))
  ok('취소 2회 → 잠금 강제 해제', forced.processEnabled, JSON.stringify(forced).slice(0, 120))
  ok('강제 해제 시 경고 표시', /강제로 풀었습니다/.test(forced.out), forced.out.slice(0, 80))
  await p10.waitForTimeout(1500)
  ok('17b 콘솔 에러 0', p10.__errs.length === 0, p10.__errs.join(' | '))
  await p10.close()
}

// ── 18) P2: 적용 버튼은 묶음 탭에서만 (탭=용도 원칙) ──
{
  const p8 = await openPanel(CONFIG)
  await p8.click('.tab[data-tab="bundle"]')
  await p8.click('#btnQueueBatch')
  await p8.waitForTimeout(200)
  await p8.check('#queueBox .qsel[data-i="0"]')
  ok('묶음 탭에선 전체 적용 활성', !(await p8.locator('#btnApplyAll').isDisabled()))
  await p8.click('.tab[data-tab="single"]')
  await p8.waitForTimeout(150)
  ok('단건 탭에선 전체 적용 잠김', await p8.locator('#btnApplyAll').isDisabled())
  ok('단건 탭에선 선택 적용 잠김', await p8.locator('#btnApplySel').isDisabled())
  ok('잠근 이유가 title 에 있음', (await p8.getAttribute('#btnApplyAll', 'title') || '').includes('묶음'))
  ok('18 콘솔 에러 0', p8.__errs.length === 0, p8.__errs.join(' | '))
  await p8.close()
}

// ── 19) P2: 행과 무관한 칸은 연동 행을 덮지 않는다 (제외목록 → 허용목록) ──
{
  const p9 = await openPanel(CONFIG)
  await p9.click('.tab[data-tab="bundle"]')
  await p9.click('#btnQueueBatch')
  await p9.waitForTimeout(200)
  await p9.click('#queueBox .qrow[data-i="0"] .qmeta')   // 행0 연동
  await p9.waitForTimeout(150)
  await p9.click('#finToggle')
  await p9.selectOption('select.finM[data-side="left"]', '접어미싱')
  await p9.waitForTimeout(200)
  const withFin = await p9.evaluate(() => document.querySelector('#queueBox .qmeta').textContent)
  // 폼만 비운 뒤(행에는 남아 있다) seedQty·imposeGap 을 건드린다 → 행이 덮이면 결함
  await p9.evaluate(() => { document.querySelector('select.finM[data-side="left"]').value = '' })
  await p9.fill('#seedQty', '9')
  await p9.dispatchEvent('#seedQty', 'change')
  await p9.waitForTimeout(200)
  const afterSeed = await p9.evaluate(() => document.querySelector('#queueBox .qmeta').textContent)
  ok('seedQty 변경이 연동 행을 덮지 않음', afterSeed === withFin, 'before="' + withFin + '" after="' + afterSeed + '"')
  // 후가공 폼 변경은 여전히 반영되어야 한다(허용목록이 과하게 막지 않았는지)
  await p9.selectOption('select.finM[data-side="top"]', '열재단')
  await p9.waitForTimeout(200)
  ok('후가공 변경은 정상 반영', (await p9.evaluate(() => document.querySelector('#queueBox .qmeta').textContent)) !== afterSeed)
  ok('19 콘솔 에러 0', p9.__errs.length === 0, p9.__errs.join(' | '))
  await p9.close()
}

// ── 16) 패널 기본 크기가 콘텐츠를 담는가 (점검 ①) ──
//    manifest 기본값이 콘텐츠보다 작으면 첫 오픈에 실행 버튼·결과창이 화면 밖이다(실측 확인).
{
  const xml = fs.readFileSync(path.join(path.dirname(PANEL), 'CSXS/manifest.xml'), 'utf8')
  const size = /<Size>\s*<Height>(\d+)<\/Height>\s*<Width>(\d+)<\/Width>/.exec(xml)
  const min = /<MinSize>\s*<Height>(\d+)<\/Height>\s*<Width>(\d+)<\/Width>/.exec(xml)
  const p6 = await openPanel(CONFIG)
  await p6.setViewportSize({ width: Number(size[2]), height: Number(size[1]) })
  await p6.waitForTimeout(150)
  const fits = await p6.evaluate(() => {
    const btn = document.getElementById('btnProcess').getBoundingClientRect()
    const out = document.getElementById('out').getBoundingClientRect()
    return { btnBottom: Math.round(btn.bottom), outBottom: Math.round(out.bottom), h: document.documentElement.clientHeight }
  })
  ok('기본 크기에서 [단건 가공] 보임', fits.btnBottom <= fits.h, JSON.stringify(fits))
  ok('기본 크기에서 결과창 보임', fits.outBottom <= fits.h, JSON.stringify(fits))
  // 최소 폭에서 마감 방식 드롭다운이 읽을 수 있는 너비인가(220px 시절 36px 였다)
  await p6.setViewportSize({ width: Number(min[2]), height: Number(min[1]) })
  await p6.click('#finToggle')
  await p6.waitForTimeout(150)
  const selW = await p6.evaluate(() => Math.round(document.querySelector('select.finM[data-side="top"]').getBoundingClientRect().width))
  ok('최소 폭에서도 마감 드롭다운 ≥90px', selW >= 90, 'selW=' + selW + 'px @' + min[2] + 'px')
  ok('16 콘솔 에러 0', p6.__errs.length === 0, p6.__errs.join(' | '))
  await p6.close()
}

await browser.close()
let pass = 0
for (const r of results) {
  console.log((r.c ? '  PASS  ' : '  FAIL  ') + r.n + (r.c ? '' : '   ← ' + r.extra))
  if (r.c) pass++
}
console.log(`\n요약: ${pass} / ${results.length}`)
process.exit(pass === results.length ? 0 : 1)
