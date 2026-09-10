#!/usr/bin/env node
/**
 * 여정 결과 요약 — `npm run journey:report`  (입력 = .journey/reports/last.json, Playwright json reporter)
 *
 * 한 사이클의 결론을 **한 화면**으로: 여정별 통과/실패 · 실패 단계 · 신호(console/http/garbage) · 격하(degraded) 집계.
 * 격하는 실패로 세지 않는다 — 「기능이 켜진 채로 끝났는가」를 사람이 보게 별도 줄로 찍는다.
 */
const fs = require('fs')
const path = require('path')

const file = path.resolve(__dirname, '..', '..', '.journey', 'reports', 'last.json')
if (!fs.existsSync(file)) { console.error('결과 없음: 먼저 npm run test:journey'); process.exit(2) }
const j = JSON.parse(fs.readFileSync(file, 'utf8'))

const rows = []
const degraded = []
function walk(suite, trail) {
  for (const s of suite.suites || []) walk(s, [...trail, s.title])
  for (const spec of suite.specs || []) {
    for (const t of spec.tests || []) {
      const r = t.results[t.results.length - 1] || {}
      const err = (r.errors || [])[0]
      rows.push({
        journey: trail.filter(Boolean).join(' › '),
        step: spec.title,
        status: r.status || t.status,
        ms: r.duration || 0,
        error: err ? String(err.message || '').split('\n').find((l) => l.trim()) || '' : '',
      })
      for (const a of r.attachments || []) {
        if (a.name === 'degraded' && a.body) {
          try { degraded.push({ step: spec.title, items: JSON.parse(Buffer.from(a.body, 'base64').toString('utf8')) }) } catch {}
        }
      }
    }
  }
}
walk(j, [])

const pass = rows.filter((r) => r.status === 'passed' || r.status === 'expected').length
const fail = rows.filter((r) => r.status === 'failed' || r.status === 'unexpected' || r.status === 'timedOut').length
const skip = rows.length - pass - fail

console.log(`여정 결과: ${pass} 통과 · ${fail} 실패 · ${skip} 건너뜀  (${new Date(j.stats?.startTime || Date.now()).toLocaleString('ko-KR')})`)
let cur = ''
for (const r of rows) {
  if (r.journey !== cur) { cur = r.journey; console.log(`\n■ ${cur}`) }
  const mark = r.status === 'passed' || r.status === 'expected' ? '✓' : r.status === 'skipped' ? '·' : '✗'
  console.log(`  ${mark} ${r.step}  (${(r.ms / 1000).toFixed(1)}s)${r.error ? '\n      → ' + r.error.replace(/\x1b\[[0-9;]*m/g, '').slice(0, 220) : ''}`)
}
if (degraded.length) {
  console.log('\n△ 격하 마커(실패 아님 — 사람이 본다):')
  for (const d of degraded) for (const it of d.items) console.log(`  ${d.step}: ${it.url} [${it.keys.join(',')}]`)
}
process.exit(fail ? 1 : 0)
