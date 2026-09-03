#!/usr/bin/env node
/**
 * auth-boundary-selftest.cjs — 인증 경계 게이트 (2026-09-03, 전체 리뷰 C1)
 *
 * 같은 JWT_SECRET 으로 서명되는 토큰이 세 종류다 — 로그인(id·role) · 포털 고객(portal:true) · 직원 셀프(scope).
 * 서명만 검증하던 authMiddleware 가 셋 다 통과시켜 포털 고객 토큰으로 /api/hr·/api/bank 에 닿았다.
 * 이 게이트는 그 경계를 값으로 못 박는다:
 *   ① 포털·셀프·role 없는 토큰 → 내부 API 401 (hr·bank·items) · 정상 로그인 토큰 → 200
 *   ② /api/auth/refresh — 포털·셀프·role 없는 토큰 401 · 비활성/없는 계정 401 · role 은 DB 값으로 · entityId 0 유지
 *   ③ /api/auth/switch-entity — 비관리자는 타법인·전체(0) 403
 *   ④ 페이지 게이트 — SPA 요청에 포털 토큰 401 · 비SPA 초기 로드는 그대로 HTML
 *   ⑤ X-Agent-Key — 틀린 키 401 · 맞는 키 통과
 *
 * 토큰은 JWT_SECRET(.dev.vars 또는 env) 으로 직접 서명한다 — 서명은 맞고 클레임 모양만 다른 토큰이 검증 대상이다.
 * 사용: 서버 가동 상태에서  SMOKE_URL=http://127.0.0.1:3101 node scripts/auth-boundary-selftest.cjs
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const BASE = (process.env.SMOKE_URL || 'http://127.0.0.1:3101').replace(/\/$/, '')
if (/pages\.dev|dongsanplan\.com/i.test(BASE) && process.env.ALLOW_PROD !== '1') {
  console.error('\x1b[31m[guard] 프로덕션 대상 selftest 차단:\x1b[0m ' + BASE + '\n  → JWT_SECRET 이 로컬 것이라 prod 에서는 의미가 없습니다. 로컬에서 실행하세요.')
  process.exit(1)
}
const USER = process.env.SMOKE_USER || 'admin'
const PASS = process.env.SMOKE_PASS || 'password'

const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' }
let failed = 0, passed = 0
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ${C.g}PASS${C.x}  ${name}`) }
  else { failed++; console.log(`  ${C.r}FAIL${C.x}  ${name}  ${C.d}${detail || ''}${C.x}`) }
}
function skip(name, why) { console.log(`  ${C.y}SKIP${C.x}  ${name}  ${C.d}${why}${C.x}`) }
function section(t) { console.log(`\n${C.b}${t}${C.x}`) }

// ---- secrets from .dev.vars (junction to main) or env ----
function readDevVars() {
  const out = {}
  const f = path.join(__dirname, '..', '.dev.vars')
  if (!fs.existsSync(f)) return out
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[m[1]] = v
  }
  return out
}
const vars = readDevVars()
const JWT_SECRET = process.env.JWT_SECRET || vars.JWT_SECRET
const AGENT_API_KEY = process.env.AGENT_API_KEY || vars.AGENT_API_KEY
if (!JWT_SECRET) {
  console.error('JWT_SECRET 을 찾지 못했습니다 (.dev.vars 또는 env).')
  process.exit(1)
}

// ---- minimal HS256 signer/decoder (hono/jwt 호환) ----
const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
function mint(payload) {
  const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const p = b64u(JSON.stringify(payload))
  const sig = b64u(crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest())
  return `${h}.${p}.${sig}`
}
function decode(token) {
  try { return JSON.parse(Buffer.from(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) } catch { return null }
}

async function req(method, p, { token, body, headers } = {}) {
  const h = { Accept: 'application/json', ...(headers || {}) }
  if (token) h.Authorization = `Bearer ${token}`
  if (body) h['Content-Type'] = 'application/json'
  const res = await fetch(`${BASE}${p}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  let data = null
  try { data = JSON.parse(text) } catch { /* html */ }
  return { status: res.status, data, text }
}

;(async () => {
  console.log(`${C.b}인증 경계 selftest${C.x}  (${BASE}, ${USER})`)
  const now = Math.floor(Date.now() / 1000)
  const soon = now + 3600           // 만료 1시간 전 = refresh 가 실제로 갱신을 시도하는 구간
  const later = now + 4 * 3600

  // ---- 토큰 준비 ----
  const tPortal = mint({ portal: true, portal_client_id: 1, client_account_id: 1, client_name: 'x', contact_name: 'y', exp: later })
  const tSelf = mint({ sub: 1, employee_code: 'E001', name: 'x', scope: 'employee-self', exp: later })
  const tNoRole = mint({ id: 1, username: 'x', entityId: 1, exp: later })

  const lr = await req('POST', '/api/auth/login', { body: { username: USER, password: PASS } })
  if (!lr.data?.data?.token) {
    console.error('로그인 실패: ' + lr.status + ' ' + lr.text.slice(0, 200))
    process.exit(1)
  }
  const tLogin = lr.data.data.token
  const me = lr.data.data.user
  const loginClaims = decode(tLogin)

  // ---- ① 내부 API 경계 ----
  section('① 내부 API — 포털·셀프·role 없는 토큰은 401, 로그인 토큰은 200')
  const endpoints = ['/api/hr/employees', '/api/bank/accounts', '/api/items?limit=1']
  for (const ep of endpoints) {
    for (const [label, tok] of [['portal', tPortal], ['employee-self', tSelf], ['role-less', tNoRole]]) {
      const r = await req('GET', ep, { token: tok })
      check(`${label} → GET ${ep} = 401`, r.status === 401, `got ${r.status}`)
    }
    const ok = await req('GET', ep, { token: tLogin })
    check(`login → GET ${ep} = 200`, ok.status === 200, `got ${ok.status}`)
  }

  // ---- ② refresh ----
  section('② /api/auth/refresh — 클레임 모양·DB 상태·entityId 보존')
  for (const [label, tok] of [['portal', tPortal], ['employee-self', tSelf], ['role-less', tNoRole]]) {
    const r = await req('POST', '/api/auth/refresh', { token: tok })
    check(`${label} → refresh = 401`, r.status === 401, `got ${r.status}`)
  }
  {
    const ghost = mint({ id: 999999999, username: 'ghost', role: 'ADMIN', entityId: 1, exp: soon })
    const r = await req('POST', '/api/auth/refresh', { token: ghost })
    check('없는 계정(id 999999999) 근만료 토큰 → refresh = 401', r.status === 401, `got ${r.status}`)
  }
  {
    // 제시된 role 이 강등·승격돼 있어도 DB role 로 재발급
    const forged = mint({ id: me.id, username: me.username, role: 'STAFF', entityId: loginClaims.entityId, exp: soon })
    const r = await req('POST', '/api/auth/refresh', { token: forged })
    const claims = r.data?.data?.token ? decode(r.data.data.token) : null
    check('근만료 토큰 refresh = refreshed:true', r.status === 200 && r.data?.refreshed === true, `got ${r.status} ${r.text.slice(0, 120)}`)
    check(`refresh 후 role 은 DB 값(${me.role}) — 제시된 STAFF 아님`, claims && claims.role === me.role, `got ${claims && claims.role}`)
    check('refresh 후 토큰에 portal/scope 없음', claims && claims.portal === undefined && claims.scope === undefined)
  }
  if (me.role === 'ADMIN') {
    // 전체 모드(entityId 0) 가 갱신 뒤에도 0 으로 남는가 — `|| 1` 회귀 방지
    const sw = await req('POST', '/api/auth/switch-entity', { token: tLogin, body: { entity_id: 0 } })
    const t0 = sw.data?.data?.token
    check('ADMIN switch-entity {entity_id:0} = 200', sw.status === 200 && !!t0, `got ${sw.status} ${sw.text.slice(0, 120)}`)
    if (t0) {
      check('switch-entity(0) 토큰 entityId === 0', decode(t0).entityId === 0)
      const r = await req('POST', '/api/auth/refresh', { token: t0 })
      if (r.data?.refreshed === false) {
        check('아직 유효(8h) → refreshed:false, 토큰 불변', r.status === 200 && !r.data?.data?.token)
      } else {
        check('refresh 응답 200', r.status === 200, `got ${r.status}`)
      }
    }
    const near0 = mint({ id: me.id, username: me.username, role: 'ADMIN', entityId: 0, exp: soon })
    const r = await req('POST', '/api/auth/refresh', { token: near0 })
    const claims = r.data?.data?.token ? decode(r.data.data.token) : null
    check('ADMIN entityId 0 근만료 토큰 refresh → 새 토큰 entityId === 0 (1 로 안 바뀜)', claims && claims.entityId === 0, `got ${claims && JSON.stringify(claims.entityId)}`)
  } else {
    skip('entityId 0 보존 검증', `${USER} 는 ADMIN 이 아님`)
  }

  // ---- ③ switch-entity 비관리자 가드 ----
  section('③ /api/auth/switch-entity — 비관리자는 타법인·전체 모드 불가')
  {
    const ents = await req('GET', '/api/auth/entities', { token: tLogin })
    const ids = (ents.data?.data || []).map((e) => Number(e.id)).filter((n) => n > 0)
    const foreign = ids.find((id) => id !== Number(loginClaims.entityId))
    // 서명은 정당하되 role 만 STAFF 인 토큰 — DB default_entity_id 가 NULL 이든 다른 법인이든 403 이어야 한다
    const staffTok = mint({ id: me.id, username: me.username, role: 'STAFF', entityId: loginClaims.entityId, exp: later })
    if (foreign) {
      const r = await req('POST', '/api/auth/switch-entity', { token: staffTok, body: { entity_id: foreign } })
      check(`STAFF → switch-entity {entity_id:${foreign}} (타법인) = 403`, r.status === 403, `got ${r.status} ${r.text.slice(0, 120)}`)
    } else {
      skip('STAFF 타법인 전환 403', '활성 법인이 1개뿐')
    }
    const r0 = await req('POST', '/api/auth/switch-entity', { token: staffTok, body: { entity_id: 0 } })
    check('STAFF → switch-entity {entity_id:0} = 403', r0.status === 403, `got ${r0.status}`)
    const rBad = await req('POST', '/api/auth/switch-entity', { token: tLogin, body: { entity_id: 'abc' } })
    check('switch-entity {entity_id:"abc"} = 400', rBad.status === 400, `got ${rBad.status}`)
    const rPortal = await req('POST', '/api/auth/switch-entity', { token: tPortal, body: { entity_id: 1 } })
    check('portal → switch-entity = 401', rPortal.status === 401, `got ${rPortal.status}`)
  }

  // ---- ④ 페이지 게이트 ----
  section('④ 페이지 게이트 — SPA 요청은 토큰 모양 검사, 비SPA 초기 로드는 그대로')
  {
    const spaPortal = await req('GET', '/hr', { token: tPortal, headers: { 'X-SPA-Request': '1' } })
    check('SPA + portal 토큰 → GET /hr = 401', spaPortal.status === 401, `got ${spaPortal.status}`)
    const spaSelf = await req('GET', '/hr', { token: tSelf, headers: { 'X-SPA-Request': '1' } })
    check('SPA + employee-self 토큰 → GET /hr = 401', spaSelf.status === 401, `got ${spaSelf.status}`)
    const spaLogin = await req('GET', '/hr', { token: tLogin, headers: { 'X-SPA-Request': '1' } })
    check('SPA + login 토큰 → GET /hr = 200', spaLogin.status === 200, `got ${spaLogin.status}`)
    const plain = await req('GET', '/hr')
    check('비SPA 무토큰 → GET /hr = 200 HTML (클라이언트 JS 가 처리)', plain.status === 200 && /<html|<!doctype/i.test(plain.text), `got ${plain.status}`)
  }

  // ---- ⑤ X-Agent-Key ----
  section('⑤ X-Agent-Key — 상수시간 비교로 바뀌어도 판정은 그대로')
  if (AGENT_API_KEY) {
    const wrong = await req('GET', '/api/rip/pending', { headers: { 'X-Agent-Key': AGENT_API_KEY.slice(0, -1) + 'x' } })
    check('틀린 키 → GET /api/rip/pending = 401', wrong.status === 401, `got ${wrong.status}`)
    const right = await req('GET', '/api/rip/pending', { headers: { 'X-Agent-Key': AGENT_API_KEY } })
    check('맞는 키 → GET /api/rip/pending ≠ 401', right.status !== 401 && right.status < 500, `got ${right.status}`)
    const none = await req('GET', '/api/rip/pending')
    check('키 없음 → GET /api/rip/pending = 401', none.status === 401, `got ${none.status}`)
  } else {
    skip('X-Agent-Key 판정', 'AGENT_API_KEY 없음 (.dev.vars/env)')
  }

  console.log(`\n${failed ? C.r : C.g}${C.b}결과: PASS ${passed} · FAIL ${failed}${C.x}`)
  process.exit(failed ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
