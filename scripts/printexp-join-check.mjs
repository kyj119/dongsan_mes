#!/usr/bin/env node
/**
 * 전사 8색 2축 조인 검사 — neoStampa(리핑) ↔ PrintExp_X64(출력)
 *
 * PrintExp 는 **도안명을 아예 모른다.** neoStampa 가 넘긴 `~sectionN.prn` 을
 * `C:\PrintExp_X64\temp\<yyyyMMddHHmmss>\` 폴더로 받을 뿐이다.
 * → 조인 키는 파일명이 아니라 **그 폴더 타임스탬프**이고, 값은 neoStampa 잡의 `StartTime` 과 같다.
 *
 * (2026-08-05 실측: 133/133 이 ±2초, 1:N 중복 0 → 정확히 1:1)
 *
 * 사용법:
 *   node scripts/printexp-join-check.mjs [--neostampa "Z:\\Designs\\Log"] [--printexp "Z:\\Designs\\Log\\main"]
 *   node scripts/printexp-join-check.mjs --tolerance 5
 */
import fs from 'node:fs'
import path from 'node:path'

const argv = process.argv.slice(2)
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d }

const nsRoot = arg('--neostampa', 'Z:\\Designs\\Log')
const peRoot = arg('--printexp', path.join('Z:\\Designs\\Log', 'main'))
const TOL = Number(arg('--tolerance', '2'))

const gbk = new TextDecoder('gbk')   // PrintExp 는 중국어 SW — GBK 다 (cp949 아님, UTF-16LE 아님)

// ── neoStampa: 날짜 폴더 안의 잡 파일 ──────────────────────────────────
function readNeoStampa(root) {
  const out = []
  const scan = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) { scan(p); continue }
      if (!e.name.toLowerCase().endsWith('.txt')) continue
      let t
      try { t = fs.readFileSync(p, 'utf8') } catch { continue }
      const doc = /^Document\s*=\s*(.+?)\r?$/m.exec(t)
      const st = /^StartTime\s*=\s*(\d{2})\/(\d{2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2})/m.exec(t)
      const et = /^EndTime\s*=\s*(\d{2})\/(\d{2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2})/m.exec(t)
      if (!doc || !st) continue
      const mk = (m) => new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6])
      // 멤버 정본은 [N] 섹션의 Name (Document 의 " + " 를 파싱하지 않는다)
      const members = [...new Set([...t.matchAll(/^Name\s*=\s*(.+?)\r?$/gm)].map(m => m[1].trim()))]
      out.push({ doc: doc[1].trim(), members, start: mk(st), end: et ? mk(et) : null, file: p })
    }
  }
  if (!fs.existsSync(root)) { console.error(`neoStampa 경로 없음: ${root}`); process.exit(2) }
  scan(root)
  return out
}

// ── PrintExp: 잡 블록 (启动任务 → 완료/취소 → temp 경로) ───────────────
function readPrintExp(root) {
  if (!fs.existsSync(root)) { console.error(`PrintExp 경로 없음: ${root}`); process.exit(2) }
  const jobs = []
  const files = fs.readdirSync(root).filter(f => /^Log\[.+\]\.txt$/i.test(f)).sort()
  for (const f of files) {
    const dm = /Log\[(\d{4})[_-](\d{2})[_-](\d{2})\]/.exec(f)
    if (!dm) continue
    const lines = gbk.decode(fs.readFileSync(path.join(root, f))).split(/\r?\n/)
    const at = (l) => {
      const m = /\[(\d{2}):(\d{2}):(\d{2})\]/.exec(l)
      return m ? new Date(+dm[1], +dm[2] - 1, +dm[3], +m[1], +m[2], +m[3]) : null
    }
    let cur = null
    for (const l of lines) {
      if (/启动任务/.test(l)) { cur = { start: at(l), status: null, endAt: null, temp: null, jobId: null, spec: null }; jobs.push(cur); continue }
      if (!cur) continue
      const sp = /任务精度:(\d+)\s*X\s*(\d+),图像大小:([\d.]+)mm\s*X\s*([\d.]+)mm,颜色数量:(\d+),打印模式:(.+)/.exec(l)
      if (sp && !cur.spec) cur.spec = { dpi: `${sp[1]}x${sp[2]}`, w: +sp[3], h: +sp[4], mode: sp[6].trim() }
      if (!cur.status && /_PrintWait---打印完成/.test(l)) { cur.status = 'OK'; cur.endAt = at(l) }
      if (!cur.status && /打印控制线程---被取消/.test(l)) { cur.status = 'CANCEL'; cur.endAt = at(l) }
      const tp = /作业ID:(-?\d+),\s*删除TCP文件:.*?temp\\(\d{14})\\/.exec(l)
      if (tp && !cur.temp) { cur.jobId = tp[1]; cur.temp = tp[2] }
    }
  }
  return jobs
}

const tsToDate = (s) => new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12), +s.slice(12, 14))

// ── 대조 ──────────────────────────────────────────────────────────────
const ns = readNeoStampa(nsRoot)
const peAll = readPrintExp(peRoot)
// temp 폴더가 없는 블록 = 캘리브레이션/노즐체크 (실제 생산 아님)
const pe = peAll.filter(j => j.temp)

console.log(`neoStampa 잡 ${ns.length}건`)
console.log(`PrintExp 블록 ${peAll.length}건 중 생산 잡 ${pe.length}건 (나머지 ${peAll.length - pe.length}건 = 캘리브레이션, temp 없음)\n`)

const used = new Map()
let matched = 0, dup = 0, miss = 0
const rows = []
for (const j of pe) {
  const at = tsToDate(j.temp)
  let best = null
  for (const n of ns) {
    const d = Math.abs((n.start - at) / 1000)
    if (!best || d < best.d) best = { d, n }
  }
  if (best && best.d <= TOL) {
    matched++
    if (used.has(best.n)) dup++
    else used.set(best.n, j)
    rows.push({ j, n: best.n, d: best.d })
  } else { miss++; rows.push({ j, n: null, d: best ? best.d : null }) }
}

const pct = (x) => `${x} (${(x / pe.length * 100).toFixed(1)}%)`
console.log('── 조인 결과 (temp 타임스탬프 ↔ neoStampa StartTime) ──')
console.log(`  매칭      : ${pct(matched)}   허용오차 ±${TOL}초`)
console.log(`  1:N 중복  : ${dup}`)
console.log(`  미매칭    : ${pct(miss)}`)
console.log(`  리핑만 하고 출력 안 함 : ${ns.length - used.size}건\n`)

if (matched / pe.length >= 0.95 && dup === 0) {
  console.log('✅ 타임스탬프 조인이 성립합니다. 파일명 기반 조인은 불필요(애초에 PrintExp 는 도안명을 모름).')
} else {
  console.log('⚠ 조인이 불완전합니다 — 허용오차를 늘리거나(--tolerance) 로그 범위를 확인하세요.')
}

const st = rows.reduce((a, r) => { const k = r.j.status || '미확정'; a[k] = (a[k] || 0) + 1; return a }, {})
console.log(`\n── 실제 출력 결과 분포 ── ${Object.entries(st).map(([k, v]) => `${k} ${v}`).join(' · ')}`)

console.log('\n── 최근 12건 ──')
for (const r of rows.slice(-12)) {
  const dur = r.j.endAt && r.j.start ? Math.round((r.j.endAt - r.j.start) / 60000) + '분' : '-'
  const tag = r.n ? '✅' : '❌'
  console.log(`  ${tag} ${r.j.temp}  ${String(r.j.status || '-').padEnd(7)} ${dur.padStart(5)}  ${r.n ? r.n.doc.slice(0, 44) : '(미매칭)'}`)
}
