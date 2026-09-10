import { test as base, expect, Page, APIRequestContext, ConsoleMessage, Response } from '@playwright/test'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

/**
 * 여정(journey) 공통 픽스처 — 「사람처럼 쓰되, 판정은 재현 가능한 신호로만」
 *
 * 신호 6종(자동 판정):
 *   1 console.error · 2 pageerror · 3 HTTP 4xx/5xx · 4 화면 텍스트의 undefined/NaN/[object Object]
 *   5 단계 타임아웃(Playwright 자체) · 6 응답의 격하 마커(fallback/degraded/warning…) — **실패가 아니라 별도 집계**
 * 스크린샷을 보고 「어색하다」는 판정 축이 아니라 **제안 축**이다(사람이 본다).
 *
 * 쓰기 안전: 여정이 만드는 이름에는 전부 MARK(JRN…) 를 박는다 — 잔재가 남아도 즉시 판별된다.
 */

export const MARK = 'JRN' + Date.now().toString(36).toUpperCase().slice(-6)
// package.json 이 type:module 이라 __dirname 이 없다 — Playwright 는 설정 파일 위치(repo 루트)에서 돈다
const ROOT = process.cwd()

export type HttpError = { method: string; url: string; status: number; body?: string }
export type Degraded = { url: string; keys: string[] }
export type Signals = {
  consoleErrors: string[]
  pageErrors: string[]
  httpErrors: HttpError[]
  degraded: Degraded[]
  /** 이 패턴에 맞는 URL 의 4xx 는 기대된 것(예: 잘못된 입력 거부 검증) */
  allow: (re: RegExp) => void
}

const DEGRADE_KEYS = ['fallback', 'degraded', 'warning', 'warnings', 'hardenwhy', 'placefail', 'partial']
const NOISE = [/favicon\.ico/, /\/api\/auth\/me\b.*401/]

export type Api = {
  request: APIRequestContext
  token: string
  get: (p: string) => Promise<any>
  post: (p: string, data?: any) => Promise<any>
  put: (p: string, data?: any) => Promise<any>
  patch: (p: string, data?: any) => Promise<any>
  del: (p: string) => Promise<any>
}

type Fixtures = {
  signals: Signals
  /** 로그인 완료 + 신호 수집이 붙은 페이지 */
  journey: Page
  /** 같은 계정의 API 컨텍스트 — 사전 준비·기대값 검산용 */
  api: Api
}
type WorkerFixtures = {
  /** 워커당 1회 로그인한 토큰·사용자 — 로그인 API 는 IP 당 10회/분 제한(rateLimit.ts)이라 테스트마다 로그인하면 429 */
  auth: { token: string; user: any }
}

/** API 로그인 — 429(요청이 너무 많습니다) 면 안내한 초만큼 기다렸다가 다시 한다 */
async function apiLogin(request: APIRequestContext, user: string, pass: string) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const r = await request.post('/api/auth/login', { data: { username: user, password: pass } })
    const j = await r.json().catch(() => ({}))
    if (j?.success) return j.data as { token: string; user: any }
    const m = /(\d+)초/.exec(String(j?.error || j?.message || ''))
    if (r.status() === 429 && attempt < 4) { await new Promise((res) => setTimeout(res, (m ? Number(m[1]) : 5) * 1000 + 500)); continue }
    throw new Error(`[journey] API 로그인 실패(${r.status()}): ${j?.error || j?.message || ''}`)
  }
  throw new Error('[journey] API 로그인 실패')
}

function attachSignals(page: Page, s: Signals, allowed: RegExp[]) {
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (NOISE.some((n) => n.test(text))) return
    s.consoleErrors.push(text)
  })
  page.on('pageerror', (err) => s.pageErrors.push(err.message))
  page.on('response', async (res: Response) => {
    const url = res.url()
    const status = res.status()
    const method = res.request().method()
    if (status >= 400) {
      if (NOISE.some((n) => n.test(`${url} ${status}`))) return
      if (allowed.some((re) => re.test(url))) return
      let body = ''
      try { body = (await res.text()).slice(0, 300) } catch {}
      s.httpErrors.push({ method, url, status, body })
      return
    }
    if (!/\/api\//.test(url)) return
    if (!/json/.test(res.headers()['content-type'] || '')) return
    try {
      const j = await res.json()
      const keys = Object.keys(j && typeof j === 'object' ? j : {}).filter((k) => DEGRADE_KEYS.includes(k) && j[k])
      if (keys.length) s.degraded.push({ url, keys })
    } catch {}
  })
}

export async function login(page: Page, user = process.env.JOURNEY_USER || 'admin', pass = process.env.JOURNEY_PASS || 'password') {
  // 로그인 후 이동이 가끔 30초를 넘겼다(로컬 wrangler 첫 요청 지연) — 한 번은 다시 시도한다.
  for (let attempt = 1; attempt <= 2; attempt++) {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')
    await page.locator('input[type="text"], input[name="username"]').first().fill(user)
    await page.locator('input[type="password"]').first().fill(pass)
    await page.locator('button[type="submit"]').click()
    try {
      await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 20_000 })
      await page.waitForLoadState('domcontentloaded')
      return
    } catch (e) {
      if (attempt === 2) throw new Error(`[journey] 로그인 후 이동 실패(2회): ${user} @ ${page.url()}`)
    }
  }
}

export const test = base.extend<Fixtures, WorkerFixtures>({
  auth: [async ({ playwright }, use) => {
    // 워커 픽스처는 테스트 픽스처(baseURL)를 못 쓴다 → 설정과 같은 env 를 직접 읽는다
    const request = await playwright.request.newContext({ baseURL: process.env.JOURNEY_BASE_URL || 'http://localhost:3000' })
    const data = await apiLogin(request, process.env.JOURNEY_USER || 'admin', process.env.JOURNEY_PASS || 'password')
    await request.dispose()
    await use({ token: data.token, user: data.user })
  }, { scope: 'worker' }],
  signals: async ({}, use) => {
    const allowed: RegExp[] = []
    const s: Signals = { consoleErrors: [], pageErrors: [], httpErrors: [], degraded: [], allow: (re) => allowed.push(re) }
    ;(s as any).__allowed = allowed
    await use(s)
  },
  journey: async ({ page, signals, auth }, use, testInfo) => {
    attachSignals(page, signals, (signals as any).__allowed)
    // 로그인 화면(login.ts)이 하는 일 = localStorage.token/user 저장 → 그대로 심고 들어간다(워커당 로그인 1회)
    await page.addInitScript(({ token, user }) => {
      if (!localStorage.getItem('token')) { localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(user)) }
    }, auth)
    await use(page)
    // 격하는 실패가 아니다 — 리포트에 남겨 사람이 본다
    if (signals.degraded.length) {
      await testInfo.attach('degraded', { body: JSON.stringify(signals.degraded, null, 2), contentType: 'application/json' })
    }
  },
  api: async ({ playwright, baseURL, auth }, use) => {
    const request = await playwright.request.newContext({ baseURL: baseURL! })
    const token = auth.token
    const headers = { Authorization: `Bearer ${token}` }
    const wrap = async (res: Promise<any>) => {
      const x = await res
      let data: any = null
      try { data = await x.json() } catch { data = await x.text() }
      return { status: x.status(), ok: x.ok(), data }
    }
    const api: Api = {
      request,
      token,
      get: (p) => wrap(request.get(p, { headers })),
      post: (p, data) => wrap(request.post(p, { headers, data })),
      put: (p, data) => wrap(request.put(p, { headers, data })),
      patch: (p, data) => wrap(request.patch(p, { headers, data })),
      del: (p) => wrap(request.delete(p, { headers })),
    }
    await use(api)
    await request.dispose()
  },
})

export { expect }

/** 신호 1~3 = 0 이어야 통과. 격하(6)는 여기서 안 본다. */
export function expectClean(s: Signals, label = '') {
  const tag = label ? `[${label}] ` : ''
  expect(s.pageErrors, `${tag}pageerror`).toEqual([])
  expect(s.consoleErrors, `${tag}console.error`).toEqual([])
  expect(
    s.httpErrors.map((e) => `${e.method} ${e.url} → ${e.status} ${e.body}`),
    `${tag}HTTP 4xx/5xx`,
  ).toEqual([])
}

/** 신호 4 — 화면에 새어 나온 코드 값. 「정상처럼 보이는 결함」의 가장 흔한 형태다. */
export async function expectNoGarbage(page: Page, label = '') {
  const text = await page.locator('body').innerText()
  const hits = text.match(/\bundefined\b|\bNaN\b|\[object Object\]|\bnull\b/g) || []
  if (hits.length) {
    const idx = text.search(/\bundefined\b|\bNaN\b|\[object Object\]|\bnull\b/)
    const around = text.slice(Math.max(0, idx - 80), idx + 80).replace(/\s+/g, ' ')
    expect(hits, `[${label}] 화면 텍스트에 코드 값이 새었다: …${around}…`).toEqual([])
  }
}

/** 로컬 D1 직접 조회 — 기대값 검산용(재고 수량·상태 등). 화면이 아니라 DB 가 정본이다. */
export function db<T = any>(sql: string): T[] {
  // ⚠️ SQL 을 --command 인자로 주면 Windows 셸 코드페이지가 한글 리터럴을 깨뜨려 **조용히 0건**이 된다
  //    ('게릴라현수막' 등가 비교가 실패해 폴백 쿼리로 넘어갔다, 2026-09-11) → UTF-8 파일로 넘긴다.
  const dir = path.join(ROOT, '.journey', 'tmp')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `q-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.sql`)
  fs.writeFileSync(file, sql + '\n', 'utf8')
  let raw = ''
  try {
    raw = execSync(
      `npx wrangler d1 execute webapp-production --local --json --file="${file}"`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT, maxBuffer: 16 * 1024 * 1024 },
    )
  } catch (e: any) {
    const err = String(e.stderr || e.stdout || e.message).replace(/\x1b\[[0-9;]*m/g, '').split('\n').filter((l) => /ERROR|error|SQLITE/.test(l)).join(' ').slice(0, 300)
    throw new Error(`[db] ${err || e.message}\n  SQL: ${sql}`)
  } finally {
    try { fs.unlinkSync(file) } catch {}
  }
  return JSON.parse(raw.slice(raw.indexOf('[')))[0].results
}

/** 앱 공용 확인 모달(showConfirm) 을 사람처럼 「확인」으로 닫는다. window.confirm 도 같이 받는다. */
export async function acceptConfirm(page: Page) {
  // shell.js `window.showConfirm` = #__confirmOk / #__confirmCancel
  const btn = page.locator('#__confirmOk')
  await btn.waitFor({ state: 'visible', timeout: 5_000 })
  await btn.click()
}
