#!/usr/bin/env node
/**
 * 화면 들여다보기 — `node scripts/journey/peek.cjs <path> [--shot=파일.png] [--eval="js"] [--click=selector] [--user=admin]`
 *
 * Playwright MCP 브라우저가 다른 세션에 잡혀 있어도(「Browser is already in use」) 화면을 볼 수 있게
 * 로그인 → 페이지 → **상호작용 요소 목록**(id·name·onclick·텍스트)을 찍는다. 여정 spec 을 쓰기 전 선택자 확인용.
 *   --eval  페이지에서 실행할 JS 표현식(결과 JSON 출력)
 *   --click 클릭 후 목록을 다시 찍는다(모달 열어 보기)
 */
const { chromium } = require('playwright')
const path = require('path')

const args = process.argv.slice(2)
const route = args.find((a) => !a.startsWith('--')) || '/'
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d }
const BASE = process.env.JOURNEY_BASE_URL || 'http://localhost:3000'
const USER = opt('user', 'admin'), PASS = opt('pass', 'password')

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' })
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push('[console] ' + m.text()))
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message))
  page.on('response', (r) => r.status() >= 400 && errors.push(`[http ${r.status()}] ${r.request().method()} ${r.url()}`))

  await page.goto(BASE + '/login')
  await page.locator('input[type="text"], input[name="username"]').first().fill(USER)
  await page.locator('input[type="password"]').first().fill(PASS)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/(cards|dashboard|orders)/, { timeout: 30000 })

  await page.goto(BASE + route)
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {})
  const click = opt('click')
  if (click) { await page.locator(click).first().click(); await page.waitForTimeout(800) }

  const dump = await page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' }
    const out = []
    for (const el of document.querySelectorAll('input,select,textarea,button,a[href],[onclick],[role=button]')) {
      if (!vis(el)) continue
      const t = el.tagName.toLowerCase()
      const bits = [t + (el.type ? `[${el.type}]` : '')]
      if (el.id) bits.push('#' + el.id)
      if (el.name) bits.push(`name=${el.name}`)
      const oc = el.getAttribute('onclick'); if (oc) bits.push(`onclick=${oc.slice(0, 60)}`)
      const href = el.getAttribute('href'); if (href && t === 'a') bits.push(`href=${href}`)
      const ph = el.getAttribute('placeholder'); if (ph) bits.push(`ph=${ph}`)
      const txt = (el.innerText || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 30); if (txt) bits.push(`"${txt}"`)
      out.push(bits.join(' '))
    }
    return { title: document.title, url: location.href, count: out.length, els: out }
  })
  console.log(`# ${dump.title}  ${dump.url}  (${dump.count} elements)`)
  for (const l of dump.els) console.log('  ' + l)
  const ev = opt('eval')
  if (ev) { const r = await page.evaluate(ev); console.log('# eval →', JSON.stringify(r, null, 1).slice(0, 4000)) }
  const shot = opt('shot')
  if (shot) { await page.screenshot({ path: path.resolve(shot), fullPage: true }); console.log('# screenshot →', shot) }
  if (errors.length) { console.log('# signals:'); errors.forEach((e) => console.log('  ' + e)) }
  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
