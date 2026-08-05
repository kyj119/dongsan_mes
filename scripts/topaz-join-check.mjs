#!/usr/bin/env node
/**
 * Topaz ↔ neoStampa 조인 키 판정
 *
 * 전사 8색은 리핑(neoStampa)과 출력(Topaz)이 다른 PC에 로그를 남긴다.
 * 합판 구성은 neoStampa 에만, 실제 출력/취소는 Topaz 에만 있다 → 둘을 이어야 실적이 완성된다.
 * 이 스크립트는 **잡 이름이 같은 문자열인지**를 실측으로 판정한다. 아니면 시각 근접 폴백을 봐야 한다.
 *
 * Topaz 로그는 바이너리라 파싱을 재구현하지 않는다 — 실제 LogWatcher TNS 파서를 --test 로 돌려 그 출력을 쓴다.
 *
 * 사용법:
 *   node scripts/topaz-join-check.mjs --topaz "Z:\\Designs\\Log-Topaz\\Print-XXX.log" \
 *                                     [--neostampa "Z:\\Designs\\Log"] [--exe "<LogWatcher.exe 경로>"]
 *   node scripts/topaz-join-check.mjs --topaz-names topaz_names.txt   # --test 출력을 직접 넘길 때
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'

const argv = process.argv.slice(2)
const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d }

const topazLog = arg('--topaz')
const topazNamesFile = arg('--topaz-names')
const nsRoot = arg('--neostampa', 'Z:\\Designs\\Log')
const exePath = arg('--exe', path.resolve('LogWatcher/bin/Release/net8.0/win-x64/LogWatcher.exe'))

if (!topazLog && !topazNamesFile) {
  console.error('--topaz <Print.log 경로> 또는 --topaz-names <텍스트파일> 이 필요합니다.')
  process.exit(2)
}

// ── 1. neoStampa Document 수집 ──────────────────────────────────────────
function readNeoStampa(root) {
  if (!fs.existsSync(root)) {
    console.error(`neoStampa 로그 경로 없음: ${root}`)
    process.exit(2)
  }
  const out = []
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.toLowerCase().endsWith('.txt')) {
        let t
        try { t = fs.readFileSync(p, 'utf8') } catch { continue }
        const doc = /^Document\s*=\s*(.+?)\r?$/m.exec(t)
        const end = /^EndTime\s*=\s*(.+?)\r?$/m.exec(t)
        // 멤버 정본은 [N] 섹션의 Name (Document 의 " + " 를 파싱하지 않는다)
        const names = [...t.matchAll(/^Name\s*=\s*(.+?)\r?$/gm)].map(m => m[1].trim())
        if (doc) out.push({
          document: doc[1].trim(),
          members: [...new Set(names)],
          endTime: end ? end[1].trim() : null,
          file: p
        })
      }
    }
  }
  walk(root)
  return out
}

// ── 2. Topaz 잡 이름 수집 (실제 TNS 파서 사용) ──────────────────────────
function readTopazNames() {
  if (topazNamesFile) {
    return fs.readFileSync(topazNamesFile, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  }
  if (!fs.existsSync(topazLog)) { console.error(`Topaz 로그 없음: ${topazLog}`); process.exit(2) }
  if (!fs.existsSync(exePath)) {
    console.error(`LogWatcher.exe 없음: ${exePath}`)
    console.error('먼저 빌드하세요:  dotnet build LogWatcher/LogWatcher.csproj -c Release')
    process.exit(2)
  }

  // --test 는 실행 폴더의 equipment.json 을 읽는다 → 임시 설정을 넣고 원본은 보존
  const dir = path.dirname(exePath)
  const cfgPath = path.join(dir, 'equipment.json')
  const backup = fs.existsSync(cfgPath) ? fs.readFileSync(cfgPath) : null
  const cfg = {
    poll_interval_seconds: 5, heartbeat_interval_seconds: 60,
    watchers: [{
      equipment_id: 'TOPAZ-JOINCHECK', name: 'Topaz 조인검사', enabled: true,
      parser_type: 'tns', config: { log_path: topazLog }
    }]
  }
  let stdout = ''
  try {
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2))
    stdout = execFileSync(exePath, ['--test', 'TOPAZ-JOINCHECK'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  } catch (e) {
    stdout = (e.stdout || '') + (e.stderr || '')
  } finally {
    if (backup) fs.writeFileSync(cfgPath, backup)
    else { try { fs.unlinkSync(cfgPath) } catch { /* 원래 없었음 */ } }
    try { fs.unlinkSync(path.join(dir, 'positions', 'TOPAZ-JOINCHECK.pos')) } catch { /* 없으면 무시 */ }
  }
  // "  [OK] 파일명" / "  [CANCEL] 파일명"
  return [...stdout.matchAll(/^\s*\[(OK|CANCEL|ERROR)\]\s*(.+?)\s*$/gm)].map(m => m[2])
}

// ── 3. 대조 ────────────────────────────────────────────────────────────
const norm = (s) => String(s || '').replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '').trim().toLowerCase()

const ns = readNeoStampa(nsRoot)
const topaz = readTopazNames()

console.log(`neoStampa 잡 ${ns.length}건 · Topaz 잡 ${topaz.length}건\n`)
if (topaz.length === 0) {
  console.log('⚠ Topaz 잡을 하나도 못 읽었습니다. 로그 경로 또는 파서 타입을 확인하세요.')
  process.exit(1)
}

const tSet = new Set(topaz.map(norm))
const tArr = topaz.map(norm)

let exact = 0, prefix = 0, member = 0, none = 0
const misses = []
for (const j of ns) {
  const d = norm(j.document)
  if (tSet.has(d)) { exact++; continue }
  // 합판이면 Topaz 가 첫 도안 이름만 갖고 있을 수도 있다
  if (j.members.some(m => tSet.has(norm(m)))) { member++; continue }
  // 접두 일치 (RIP 가 접미사를 붙이는 경우)
  if (tArr.some(t => t.startsWith(d.slice(0, Math.min(20, d.length))) || d.startsWith(t.slice(0, Math.min(20, t.length))))) { prefix++; continue }
  none++
  if (misses.length < 10) misses.push(j.document)
}

const pct = (n) => `${n} (${(n / ns.length * 100).toFixed(1)}%)`
console.log('── 조인 결과 ──────────────────────────')
console.log(`  Document 완전일치 : ${pct(exact)}`)
console.log(`  멤버명 일치       : ${pct(member)}`)
console.log(`  접두 일치         : ${pct(prefix)}`)
console.log(`  불일치            : ${pct(none)}`)
console.log()

const joinable = exact + member + prefix
if (joinable / ns.length >= 0.9) {
  console.log('✅ 파일명으로 조인 가능합니다. 시각 근접 폴백 불필요.')
  if (member > exact) console.log('   ※ Topaz 는 합판 전체 이름이 아니라 대표 도안명만 갖고 있습니다 — 멤버명 기준으로 이으세요.')
} else if (joinable / ns.length >= 0.5) {
  console.log('⚠ 부분적으로만 조인됩니다. 시각 근접(neoStampa EndTime < Topaz 시작) 폴백을 함께 써야 합니다.')
} else {
  console.log('❌ 파일명으로 조인되지 않습니다. 시각 근접 폴백이 정본이어야 합니다.')
}

if (misses.length) {
  console.log('\n불일치 예시:')
  for (const m of misses) console.log('  - ' + m)
  console.log('\nTopaz 쪽 이름 예시:')
  for (const t of topaz.slice(0, 10)) console.log('  - ' + t)
}
