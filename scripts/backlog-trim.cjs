#!/usr/bin/env node
/**
 * IMPROVEMENT_BACKLOG 자동 트림
 *
 * 사이클 로그(`> **Area N ... (날짜):**`)가 THRESHOLD 초과로 쌓이면 최근 KEEP건만 남기고
 * IMPROVEMENT_BACKLOG_ARCHIVE.md 앞에 이관한다. auto-improve 스킬이 매 사이클 끝에 호출.
 *
 *   node scripts/backlog-trim.cjs            트림 (필요할 때만 동작)
 *   node scripts/backlog-trim.cjs --check    현황만 출력, 파일 무변경
 *   node scripts/backlog-trim.cjs --force    임계 미만이어도 KEEP건으로 트림
 *
 * 안전장치: 무손실 지문 대조 + 형식 계약 13항목 검증. 하나라도 실패하면 원본 복구 후 exit 1.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const ACTIVE = path.join(ROOT, 'IMPROVEMENT_BACKLOG.md')
const ARCHIVE = path.join(ROOT, 'IMPROVEMENT_BACKLOG_ARCHIVE.md')

const THRESHOLD = 13 // 이 수 이상이면 트림
const KEEP = 8 // 남길 최근 로그 수 (6 Area 1바퀴 + 여유 2)
const AREAS = ['1', '2', '3', '4', '5', '6']

const argv = process.argv.slice(2)
const CHECK_ONLY = argv.includes('--check')
const FORCE = argv.includes('--force')

// auto-improve가 매 사이클 읽고 쓰는 형식 계약 — 하나라도 없으면 스킬이 깨진다
const CONTRACT = [
  ['제목', /^# Improvement Backlog/m],
  ['last_run_area 메타', /<!--\s*last_run_area:/],
  ['last_run_at 메타', /<!--\s*last_run_at:/],
  ['## 통계', /^## 통계/m],
  ['카운터 done', /✔️ done \|/],
  ['카운터 rejected', /❌ rejected \|/],
  ['Approved/Reviewed 절', /^## ✅ Approved/m],
  ['New 절', /^## 🆕 New/m],
  ['Auto-fixed 절', /^## 🔧 Auto-fixed/m],
  ['Done 절', /^## ✔️ Done/m],
  ['Rejected 절', /^## ❌ Rejected/m],
  ['오탐 패턴 표', /^## 오탐\(False Positive\) 패턴/m],
  ['상태 변경 가이드', /^## 상태 변경 가이드/m],
]

function parseLogs(lines) {
  // 통계 섹션(= 사이클 로그가 쌓이는 구간) 경계
  let start = -1
  let end = -1
  lines.forEach((l, i) => {
    if (/^## 통계/.test(l)) start = i
    if (start >= 0 && end < 0 && i > start && /^## /.test(l)) end = i
  })
  if (start < 0) throw new Error('## 통계 섹션을 찾지 못했습니다 (형식 손상 의심)')
  if (end < 0) end = lines.length

  const logs = []
  for (let i = start + 1; i < end; i++) {
    if (/^> \*\*Area \d/.test(lines[i])) {
      let j = i + 1
      while (j < end && !/^> \*\*Area \d/.test(lines[j])) j++
      const m = lines[i].match(/Area (\d).*?\((\d{4}-\d{2}-\d{2})/)
      logs.push({ s: i, e: j - 1, area: m ? m[1] : '?', date: m ? m[2] : '?', head: lines[i].slice(0, 55) })
      i = j - 1
    }
  }
  return logs
}

/** 최근 KEEP건 + 그것으로 커버 안 되는 Area의 최신 1건 */
function pickKeep(logs) {
  const keep = new Set(logs.slice(0, KEEP).map((x) => x.s))
  const covered = new Set(logs.slice(0, KEEP).map((x) => x.area))
  for (const a of AREAS) {
    if (covered.has(a)) continue
    const latest = logs.find((x) => x.area === a)
    if (latest) keep.add(latest.s) // Area별 직전 기록이 없으면 그 Area가 diff 판단 불가
  }
  return keep
}

function main() {
  const rawActive = fs.readFileSync(ACTIVE, 'utf8')
  const rawArchive = fs.readFileSync(ARCHIVE, 'utf8')
  const lines = rawActive.split(/\r?\n/)
  const logs = parseLogs(lines)

  const sizeKB = (s) => Math.round(Buffer.byteLength(s) / 1024)
  console.log(`사이클 로그 ${logs.length}건 / 활성 ${sizeKB(rawActive)}KB / 임계 ${THRESHOLD}건`)

  if (CHECK_ONLY) {
    logs.slice(0, KEEP + 2).forEach((x, i) => console.log(`  ${i < KEEP ? '유지' : '이관'} Area${x.area} ${x.date}`))
    return
  }
  if (logs.length < THRESHOLD && !FORCE) {
    console.log(`→ 트림 불필요 (${THRESHOLD}건 이상일 때 동작, --force로 강제 가능)`)
    return
  }

  const keepSet = pickKeep(logs)
  const move = logs.filter((x) => !keepSet.has(x.s))
  if (move.length === 0) {
    console.log('→ 이관 대상 없음')
    return
  }

  const moveLineSet = new Set()
  move.forEach((x) => {
    for (let i = x.s; i <= x.e; i++) moveLineSet.add(i)
  })
  const movedText = move.map((x) => lines.slice(x.s, x.e + 1).join('\n')).join('\n')
  const kept = lines.filter((_, i) => !moveLineSet.has(i))

  // 트림 이력 문구에 차수 추가
  let body = kept.join('\n').replace(/\n{4,}/g, '\n\n\n')
  const nth = (rawActive.match(/(\d+)차 트림/g) || []).map((s) => parseInt(s)).reduce((a, b) => Math.max(a, b), 0) + 1
  const stamp = new Date().toISOString().slice(0, 10)
  body = body.replace(
    /(\n> 📦 \*\*과거 사이클 로그\*\*[^\n]*)/,
    `$1\n> ↳ **${nth}차 트림 (${stamp}, 자동)**: 사이클 로그 ${logs.length}건 → ${logs.length - move.length}건 유지, ${move.length}건 이관 (${sizeKB(rawActive)}KB → 트림 후 아래 참조).`
  )

  const header = [
    `## 📦 ${stamp} 이관분 (${nth}차 자동 트림 — scripts/backlog-trim.cjs)`,
    '',
    `> 사이클 로그 ${move.length}건. 원본 순서(시간 역순) 보존. 활성 파일은 최근 ${logs.length - move.length}건 유지.`,
    '',
    movedText,
    '',
    '---',
    '',
  ].join('\n')

  fs.writeFileSync(ACTIVE, body, 'utf8')
  fs.writeFileSync(ARCHIVE, header + rawArchive, 'utf8')

  // ── 검증: 무손실 + 형식 계약 ──
  const after = fs.readFileSync(ACTIVE, 'utf8')
  const arch = fs.readFileSync(ARCHIVE, 'utf8')
  const pool = after + '\n' + arch
  const lost = logs.filter((x) => !pool.includes(x.head))
  // BOM이 있으면 첫 줄이 '﻿# ...'가 되어 ^# 앵커가 불일치 → 검사 전 제거
  const broken = CONTRACT.filter(([, re]) => !re.test(after.replace(/^﻿/, ''))).map(([n]) => n)

  if (lost.length || broken.length) {
    fs.writeFileSync(ACTIVE, rawActive, 'utf8')
    fs.writeFileSync(ARCHIVE, rawArchive, 'utf8')
    console.error('✘ 검증 실패 — 원본 복구함')
    lost.forEach((x) => console.error(`   유실: ${x.head}`))
    broken.forEach((n) => console.error(`   계약 손상: ${n}`))
    process.exit(1)
  }

  console.log(`✔ ${move.length}건 이관 · 활성 ${sizeKB(rawActive)}KB → ${sizeKB(after)}KB`)
  console.log(`  무손실 ${logs.length}건 전수 대조 OK · 형식 계약 ${CONTRACT.length}항목 OK`)
}

main()
