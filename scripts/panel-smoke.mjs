// A0 패널 리모델 헤드리스 스모크 — Chromium + CSInterface/cep.fs 스텁으로 실제 DOM 동작 검증.
// 일러 없이 잡을 수 있는 것: 초기화 예외 · 탭=용도 파생 · 후가공 초기화 · 분리→목록→등록 게이트 · 1덩어리 경고.
import { chromium } from 'playwright'
import path from 'path'
import { pathToFileURL } from 'url'

const PANEL = 'C:/Users/user/dongsan_mes/IllustratorAutomat/designer/poc-a0-cep/com.mes.a0.panel/index.html'
const results = []
const ok = (n, c, extra = '') => results.push({ n, c, extra })

// 실제 config.json 스키마: methods[].method_group 로 가공자 도메인 필터가 걸린다(기본 'output').
const CONFIG = JSON.stringify({
  methods: [
    { name: '접어미싱', margin_cm: 4, method_group: 'output' },
    { name: '열재단', margin_cm: 0, method_group: 'output' },
  ],
  presets: [{ name: '양옆 접어미싱', method_group: 'output', config: JSON.stringify({ left: '접어미싱', right: '접어미싱' }) }],
  clients: [{ id: 1946, name: '테스트거래처' }],
  workers: [{ id: 14, name: '인호동' }],
  worker_domains: [{ worker_name: '인호동', domain: 'output' }],
})

// 호스트 응답 스텁. splitCount 를 바꿔 1덩어리/다조각을 모두 재현한다.
//   ⚠️ CSInterface 를 갈아끼우면 안 된다 — 패널이 자체 shim(js/CSInterface.js)을 나중에 로드해
//   덮어쓴다. shim 이 실제로 보는 `window.__adobe_cep__` 를 심어야 실제 경로가 그대로 검증된다.
const hostStub = `
window.__calls = [];
window.__splitCount = 3;
window.cep = { fs: { readFile: () => ({ err: 1 }), writeFile: () => ({ err: 0 }) } };
window.__adobe_cep__ = {
  getExtensionID: function () { return 'com.mes.a0.panel'; },
  getSystemPath: function () { return 'C:/tmp'; },
  getHostEnvironment: function () { return JSON.stringify({ appName: 'ILST', appVersion: '29.0' }); },
  evalScript: function (script, cb) {
    window.__calls.push(script);
    var res = '';
    if (/^mesA0_ping/.test(script)) res = 'A0-CEP-TEST';
    else if (/^mesA0_config/.test(script)) res = ${JSON.stringify(CONFIG)};
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
    else if (/^mesA0_process/.test(script)) res = JSON.stringify({ ok: true, w: 87, h: 197, folder: 'Z:/test', items: 1, normed: 0, bytes: 53687091, oversize: 2, warn: 'E', eps: 'a.eps', dxf: 'a.dxf' });
    else res = JSON.stringify({ ok: true });
    if (cb) setTimeout(function () { cb(res); }, 0);
  }
};
`

const browser = await chromium.launch()
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

await page.addInitScript(hostStub)
await page.goto(pathToFileURL(PANEL).href)
await page.waitForTimeout(300)

// 1) 초기화 무예외 + 기본 탭 = 단건
ok('초기화 콘솔/페이지 에러 0', errors.length === 0, errors.join(' | '))
ok('기본 탭 = 단건', await page.locator('.tab.active').innerText() === '단건')
ok('후가공은 접이식(기본 접힘)', await page.locator('#finBody').isHidden())
ok('실행 버튼 = 단건 가공', await page.locator('#btnProcess').innerText() === '단건 가공')

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
ok('등록 버튼 라벨', await page.locator('#btnImposeRegister').innerText() === '등록 (3)')
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
ok('선택 적용 라벨에 개수', (await page.locator('#btnApplySel').innerText()) === '선택 적용 (2)')
await page.click('#btnApplySel')
await page.waitForTimeout(150)
ok('선택 행만 적용 메시지', (await page.locator('#out').innerText()).includes('#1 #3'), (await page.locator('#out').innerText()).slice(0, 90))
ok('재렌더 후에도 체크 유지', await page.evaluate(() => document.querySelector('#queueBox .qsel[data-i="0"]').checked && document.querySelector('#queueBox .qsel[data-i="2"]').checked))

// 9-4) 검토는 선택 사항 (2026-07-30 ②) — 검토 없이도 확정 가능해야 하고, 미검토가 눈에 보여야 한다
ok('검토 없이 확정 가능', !(await page.locator('#btnConfirm').isDisabled()))
ok('미검토 표시', (await page.locator('#btnConfirm').innerText()).indexOf('미검토') > 0, await page.locator('#btnConfirm').innerText())

// 10) 등록 결과에 용량·임베드 여분 경고 노출 — 100MB work.ai 재발을 알아채는 유일한 지점.
//    (사고 당시엔 용량이 어디에도 안 보여 5건 524MB가 쌓인 뒤에야 발견됐다)
await page.click('.tab[data-tab="single"]')
await page.click('#btnProcess')
await page.waitForTimeout(300)
const doneMsg = await page.locator('#out').innerText()
ok('단건 복귀 시 후가공 폼도 단건으로', await page.evaluate(() => !!document.querySelector('[data-page="single"] #finToggleRow')))
ok('등록 결과에 work.ai 용량 표시', doneMsg.includes('work.ai 51.2MB'), doneMsg.slice(0, 140))
ok('임베드 여분 경고 표시', doneMsg.includes('임베드 이미지가 디자인 밖까지 큼'), doneMsg.slice(0, 200))
ok('돔보 등록분 DXF 표시', doneMsg.includes('DXF: a.dxf'), doneMsg.slice(0, 220))

ok('전체 콘솔/페이지 에러 0', errors.length === 0, errors.join(' | '))

await browser.close()
let pass = 0
for (const r of results) {
  console.log((r.c ? '  PASS  ' : '  FAIL  ') + r.n + (r.c ? '' : '   ← ' + r.extra))
  if (r.c) pass++
}
console.log(`\n요약: ${pass} / ${results.length}`)
process.exit(pass === results.length ? 0 : 1)
