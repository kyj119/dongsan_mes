#!/usr/bin/env node
/**
 * 여정 루프 한 사이클을 **한 명령**으로 — `npm run journey:cycle [--only=j3] [--no-build] [--snapshot]`
 *
 * 왜 있나 (2026-09-11): 루프를 손으로 돌리면 세션이 무겁다 — 서버 확인·빌드·실행·리포트를 따로 부르고
 *   출력을 다 읽게 된다. 이 스크립트는 그걸 한 번에 하고 **실패·격하만** 짧게 찍는다.
 *   통과하면 3줄, 실패하면 여정별 실패 단계 + 첫 오류 줄 + trace 경로. 세션은 그것만 읽고 판단한다.
 *
 * 순서: (--snapshot 이면 로컬 D1 재적재) → dist 가 src 보다 오래됐으면 build → 서버 없으면 기동(백그라운드)
 *       → test:journey → 요약. exit 0 = 전부 통과 · 1 = 실패 있음 · 2 = 환경(서버 기동 실패 등).
 *
 * 로컬 전용. prod 주소를 넣으면 playwright.journey.config.ts 가 throw 한다.
 */
const { execSync, spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const http = require('http')

const ROOT = path.resolve(__dirname, '..', '..')
const args = process.argv.slice(2)
const opt = (k) => { const a = args.find((x) => x === `--${k}` || x.startsWith(`--${k}=`)); return a ? (a.includes('=') ? a.split('=')[1] : true) : null }
const BASE = process.env.JOURNEY_BASE_URL || 'http://localhost:3000'
const PORT = Number(new URL(BASE).port || 3000)

const sh = (cmd, extra = {}) => execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...extra })
const quiet = (cmd) => { try { return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) } catch (e) { return String(e.stdout || '') } }

function health() {
  return new Promise((res) => {
    const req = http.get(`${BASE}/api/health`, { timeout: 3000 }, (r) => { r.resume(); res(r.statusCode === 200) })
    req.on('error', () => res(false)); req.on('timeout', () => { req.destroy(); res(false) })
  })
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function newestMtime(dir, exts) {
  let m = 0
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (exts.some((x) => e.name.endsWith(x))) m = Math.max(m, fs.statSync(p).mtimeMs) } }
  walk(dir); return m
}

;(async () => {
  const t0 = Date.now()
  // --gate: ship:gate 에서 부른다. 명시적으로 SKIP_JOURNEY=1 을 줬을 때만 건너뛰고, 그 사실을 찍는다.
  //   (조용한 격하 금지 — 「서버가 없어서 안 돌았다」가 성공으로 세이면 이 게이트는 없는 것이다)
  if (opt('gate') && process.env.SKIP_JOURNEY === '1') { console.log('[cycle] SKIPPED — SKIP_JOURNEY=1 (명시적 건너뜀, 핫픽스용)'); process.exit(0) }
  if (opt('snapshot')) { console.log('[cycle] 로컬 D1 재적재(캐시)'); sh('node scripts/journey/snapshot-local.cjs --skip-export') }

  // 1) build — dist/_worker.js 가 src 보다 오래됐을 때만
  const worker = path.join(ROOT, 'dist', '_worker.js')
  const stale = !fs.existsSync(worker) || newestMtime(path.join(ROOT, 'src'), ['.ts', '.tsx', '.js', '.css']) > fs.statSync(worker).mtimeMs
  if (opt('no-build')) console.log('[cycle] build 생략(--no-build)')
  else if (stale) { console.log('[cycle] src 가 dist 보다 새롭다 → npm run build'); sh('npm run build', { stdio: 'ignore' }) }
  else console.log('[cycle] dist 최신 — build 생략')

  // 2) server — 없으면 이 프로세스가 백그라운드로 띄운다(사이클이 끝나도 남긴다: 다음 사이클이 재사용)
  if (!(await health())) {
    console.log(`[cycle] ${BASE} 응답 없음 → wrangler pages dev 기동`)
    const log = fs.openSync(path.join(ROOT, '.journey', 'dev-server.log'), 'a')
    // 한 문자열로 넘긴다 — args 배열 + shell:true 는 DEP0190 경고(인자 미이스케이프)
    const child = spawn(`npx wrangler pages dev dist --local --ip 0.0.0.0 --port ${PORT}`, { cwd: ROOT, detached: true, stdio: ['ignore', log, log], shell: true })
    child.unref()
    let up = false
    for (let i = 0; i < 40 && !up; i++) { await sleep(1500); up = await health() }
    if (!up) { console.error('[cycle] 서버가 60초 안에 안 떴다 — .journey/dev-server.log 확인'); process.exit(2) }
    console.log('[cycle] 서버 기동 완료')
  } else console.log('[cycle] 서버 응답 OK')

  // 3) run — 설정의 리포터(list+json+html)를 그대로 쓰고 stdout 은 로그 파일로. ⚠️`--reporter=json` 을 주면
  //    설정 리포터가 전부 대체돼 .journey/reports/last.json 이 갱신되지 않는다(첫 실행 때 옛 결과를 읽었다).
  const only = opt('only')
  console.log(`[cycle] test:journey${only ? ' ' + only : ''} …`)
  // 필터는 정규식이라 `j5|j6` 처럼 | 가 들어온다 → 따옴표 없이 넘기면 셸 파이프가 된다(첫 실행 때 0초 만에 「통과」로 보였다)
  const filterArg = only && only !== true ? ` "${String(only).replace(/"/g, '')}"` : ''
  const reportFile = path.join(ROOT, '.journey', 'reports', 'last.json')
  const runLog = quiet(`npx playwright test --config=playwright.journey.config.ts${filterArg}`)
  fs.writeFileSync(path.join(ROOT, '.journey', 'last-run.log'), runLog)
  // 리포트가 이번 실행에서 새로 쓰였는지 확인 — 옛 결과를 읽고 「통과」라고 하면 그게 조용한 격하다
  if (!fs.existsSync(reportFile) || fs.statSync(reportFile).mtimeMs < t0) {
    console.error('[cycle] 리포트가 갱신되지 않았다 — 테스트가 안 돌았다. 실행 로그 끝:\n' + runLog.split('\n').slice(-12).join('\n'))
    process.exit(2)
  }

  // 4) report — journey:report 의 요약을 그대로(실패·격하만 길게)
  const rep = quiet('node scripts/journey/report.cjs')
  const lines = rep.split('\n')
  const head = lines[0] || ''
  const bad = lines.filter((l) => /^\s*(✗|→|△|  [^✓·■\s])/.test(l) || /^■/.test(l) && false)
  console.log(head)
  const fails = lines.filter((l) => /^\s*✗/.test(l)).length
  if (fails) {
    // 실패한 여정 블록만 출력(■ 제목 + ✗ + → 줄)
    let cur = ''; const out = []
    for (const l of lines.slice(1)) { if (/^■/.test(l)) { cur = l; continue } if (/^\s*(✗|→)/.test(l)) { if (cur) { out.push(cur); cur = '' } out.push(l) } }
    console.log(out.join('\n'))
    console.log(`trace: npx playwright show-trace .journey/test-results/<실패 폴더>/trace.zip`)
  }
  const degraded = lines.filter((l) => /^\s*△|^  .*\[(fallback|degraded|warning)/.test(l))
  if (degraded.length) console.log(degraded.join('\n'))
  console.log(`[cycle] ${((Date.now() - t0) / 1000).toFixed(0)}s`)
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.error('[cycle] ' + (e.message || e)); process.exit(2) })
