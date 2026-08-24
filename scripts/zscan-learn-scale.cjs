#!/usr/bin/env node
/**
 * zscan-learn-scale.cjs — 제품유형별 작업 배율 학습 (scale_table.csv 확장)
 *
 * 왜: zscan-intake 의 규격 헤더판독 폴백(P4)은 배율표에 있는 유형만 채운다.
 *     기존 표(learn_scale.py)는 UV솔벤·수성축만 학습해 **전사축(메인1)이 통째로 미커버**다
 *     (2026-08 미파싱 66건 중 전사 계열 25건). 여기서 전사축을 포함해 재학습한다.
 *
 * 방법: 파일명에 규격이 **있는** 파일로 「파일명 규격 ÷ 헤더 실측 = 배율」을 학습한다.
 *   - 파싱 = zscan-intake.cjs --json (★파서 정본 재사용 — 두 벌 금지, 그 파일 §--json 주석)
 *   - 헤더 실측 = src/utils/fileDimensions.ts (esbuild 트랜스파일 — 사본 금지)
 *   - 스냅 = learn_scale.py 와 동일: 후보 [1,2,2.5,4,5,10] · 5% 이내 · 가로세로 동일값(회전 허용)
 *   - 신뢰 게이트 = support/read ≥ 0.85 (specless.py·zscan-intake 런타임 게이트와 동일)
 *
 * 사용법:
 *   node scripts/zscan-learn-scale.cjs --from 2026-04-01 --to 2026-08-24            # 리포트만
 *   node scripts/zscan-learn-scale.cjs --from ... --to ... --commit                 # 표에 없는 유형만 append
 *   옵션: --json <경로>   zscan-intake --json 산출물 재사용(미지정 시 직접 실행)
 *         --table <경로>  scale_table.csv 위치(기본 docs/order-file-matching/scale_table.csv)
 *         --per-type N    유형당 표본 상한(기본 80 — IO 바운드)
 *         --min-read N    채택 최소 판독 수(기본 10 — 표본 부족 유형 차단)
 *
 * ★append 전용: 기존 표의 유형은 절대 덮어쓰지 않는다(리포트에 「기존」으로 비교만).
 *   기존 행을 갈아끼우면 검증된 폴백 동작이 조용히 바뀐다. 재학습 갱신은 사람이 표를 지우고 결정.
 * ★scale_table.csv 는 gitignore(학습 산출물) — 스캐너가 도는 메인 체크아웃에서 --commit 할 것.
 */
'use strict'

const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')

const argv = process.argv.slice(2)
const arg = (k, d) => {
  const i = argv.indexOf(k)
  return i > -1 && argv[i + 1] != null ? argv[i + 1] : d
}
const COMMIT = argv.includes('--commit')
const FROM = arg('--from', null)
const TO = arg('--to', null)
const TABLE = path.resolve(arg('--table', path.join(__dirname, '..', 'docs', 'order-file-matching', 'scale_table.csv')))
const PER_TYPE = Math.max(5, parseInt(arg('--per-type', '80'), 10) || 80)
const MIN_READ = Math.max(1, parseInt(arg('--min-read', '10'), 10) || 10)
const GATE = 0.85

// learn_scale.py SNAP 과 동일 — 실무에서 쓸 법한 배율 후보, 5% 이내 스냅
const SNAP = [1, 2, 2.5, 4, 5, 10]
const snapOne = (r) => {
  for (const s of SNAP) if (r >= s * 0.95 && r <= s * 1.05) return s
  return null
}

// zscan-intake.cjs:357 RX_NORM 과 **동일 원문**이어야 표 키가 맞는다 (1줄 상수 사본 —
// 값이 갈리면 학습한 행을 런타임이 못 찾으니, 바꿀 땐 두 곳을 같이 바꾼다)
const RX_NORM = /(주식회사|\(주\)|㈜|유한회사|주\)|\s|\.|,|-|\(|\)|_)/g
const norm = (s) => String(s || '').replace(RX_NORM, '').toLowerCase()

function loadFileDimsUtil() {
  const SRC = path.join(__dirname, '..', 'src', 'utils', 'fileDimensions.ts')
  const ESBUILD = path.join(__dirname, '..', 'node_modules', 'esbuild', 'bin', 'esbuild')
  const out = path.join(os.tmpdir(), `fileDimensions.learn.${process.pid}.cjs`)
  execFileSync(process.execPath, [ESBUILD, SRC, '--format=cjs', '--platform=node', `--outfile=${out}`], {
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  return require(out)
}

function probe(dims, full) {
  try {
    const st = fs.statSync(full)
    const fd = fs.openSync(full, 'r')
    const headBuf = Buffer.alloc(Math.min(dims.PROBE_BYTES, st.size))
    fs.readSync(fd, headBuf, 0, headBuf.length, 0)
    const head = headBuf.toString('utf8')
    let tail
    if (dims.needsTailScan(head) && st.size > dims.PROBE_BYTES) {
      const tailBuf = Buffer.alloc(dims.PROBE_BYTES)
      fs.readSync(fd, tailBuf, 0, dims.PROBE_BYTES, st.size - dims.PROBE_BYTES)
      tail = tailBuf.toString('utf8')
    }
    fs.closeSync(fd)
    const r = dims.parseFileDimensions(head, tail)
    return (r.source !== 'none' && r.w_cm > 0 && r.h_cm > 0) ? r : null
  } catch { return null }
}

function main() {
  // 1) 파싱 행 확보 — 정본 파서(zscan-intake --json) 산출물
  let jsonPath = arg('--json', null)
  if (!jsonPath) {
    if (!FROM || !TO) {
      console.error('사용법: --from YYYY-MM-DD --to YYYY-MM-DD [--commit] (또는 --json <기존 export>)')
      process.exit(1)
    }
    jsonPath = path.join(os.tmpdir(), `zscan-learn.${process.pid}.json`)
    console.log(`▶ zscan-intake --json 실행 (${FROM} ~ ${TO})`)
    execFileSync(process.execPath, [
      path.join(__dirname, 'zscan-intake.cjs'),
      '--from', FROM, '--to', TO, '--no-probe', '--json', jsonPath,
    ], { stdio: ['ignore', 'ignore', 'inherit'] })
  }
  const rows = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))

  // 2) 기존 표 로드 (게이트 무관 전체 행 — append 충돌 판정용)
  const existing = new Map()
  try {
    for (const line of fs.readFileSync(TABLE, 'utf8').split('\n').slice(1)) {
      const [ptype, scale] = line.trim().split(',')
      if (ptype && scale) existing.set(norm(ptype), parseFloat(scale))
    }
  } catch { /* 표가 없으면 전부 신규 */ }

  // 3) 유형별 표본 수집 — 파일명 규격이 있는 행만이 훈련 데이터다
  const byType = new Map()
  for (const r of rows) {
    if (!(r.w && r.h) || !r.ptype) continue
    const k = norm(r.ptype)
    if (!byType.has(k)) byType.set(k, { label: r.ptype, files: [] })
    const g = byType.get(k)
    if (g.files.length < PER_TYPE) g.files.push(r)
  }
  console.log(`파싱 ${rows.length.toLocaleString()}행 · 훈련 가능 유형 ${byType.size}종 (유형당 ≤${PER_TYPE})`)

  // 4) 판독 + 배율 스냅 투표
  const dims = loadFileDimsUtil()
  const results = []
  for (const [key, g] of byType) {
    let read = 0
    const votes = new Map()
    for (const r of g.files) {
      const d = probe(dims, r.full)
      if (!d) continue
      read++
      // 가로세로 각각 스냅, 같은 값이어야 1표. 회전(가로↔세로) 허용 — 주문서 UI·P4 와 같은 축.
      let s = null
      const a = snapOne(r.w / d.w_cm), b = snapOne(r.h / d.h_cm)
      if (a && b && a === b) s = a
      else {
        const ar = snapOne(r.w / d.h_cm), br = snapOne(r.h / d.w_cm)
        if (ar && br && ar === br) s = ar
      }
      if (s != null) votes.set(s, (votes.get(s) || 0) + 1)
    }
    let best = null, support = 0
    for (const [s, n] of votes) if (n > support) { best = s; support = n }
    results.push({ key, label: g.label, n: g.files.length, read, scale: best, support })
  }

  // 5) 리포트 + 채택 판정
  results.sort((a, b) => b.read - a.read)
  const adopt = []
  console.log('\n  유형                       표본   판독  배율   support   판정')
  for (const t of results) {
    const pct = t.read ? t.support / t.read : 0
    let verdict
    if (existing.has(t.key)) verdict = `기존(표 ${existing.get(t.key)})`
    else if (t.read < MIN_READ) verdict = `기각(판독<${MIN_READ})`
    else if (t.label.includes(',')) verdict = '기각(콤마 포함 — CSV 안전)'
    else if (!t.scale || pct < GATE) verdict = `기각(합의 ${(pct * 100).toFixed(0)}%)`
    else { verdict = '채택'; adopt.push(t) }
    console.log(`  ${t.label.padEnd(24)} ${String(t.n).padStart(5)} ${String(t.read).padStart(6)}`
      + `  ${String(t.scale ?? '-').padStart(4)} ${t.read ? ((t.support / t.read) * 100).toFixed(0).padStart(7) + '%' : '      - '}   ${verdict}`)
  }

  if (!adopt.length) {
    console.log('\n→ 신규 채택 유형 없음')
    return
  }
  console.log(`\n신규 채택 ${adopt.length}종: ${adopt.map((t) => `${t.label}×${t.scale}`).join(' · ')}`)
  if (!COMMIT) {
    console.log('[dry-run] 표에 쓰지 않습니다. 반영은 --commit.')
    return
  }

  // 6) append (백업 선행 · 기존 행 불변)
  const bak = `${TABLE}.bak-${new Date().toISOString().slice(0, 10)}`
  fs.copyFileSync(TABLE, bak)
  const add = adopt.map((t) => `${t.label},${t.scale},${t.support},${t.read}`).join('\n') + '\n'
  const cur = fs.readFileSync(TABLE, 'utf8')
  fs.writeFileSync(TABLE, cur.endsWith('\n') ? cur + add : cur + '\n' + add, 'utf8')
  console.log(`✔ ${adopt.length}종 append → ${TABLE} (백업 ${path.basename(bak)})`)
}

main()
