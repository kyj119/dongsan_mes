#!/usr/bin/env node
/**
 * PROJECT_STATUS 자동 트림
 *
 * 배포마다 쌓이는 "배포 배너"와, 완료됐는데 '현재 진행 중' 섹션에 남은 ✅ 항목을
 * PROJECT_STATUS_ARCHIVE.md 앞으로 이관한다.
 * CLAUDE.md가 "세션 시작 시 PROJECT_STATUS 읽기"를 지시하므로, 이 파일이 읽기 상한을
 * 넘으면 매 세션 현황 파악이 잘린다(2026-07-27 실제 발생: 302줄 중 33줄만 로드됨).
 *
 *   node scripts/status-trim.cjs            트림 (필요할 때만 동작)
 *   node scripts/status-trim.cjs --check    현황만 출력, 파일 무변경
 *   node scripts/status-trim.cjs --force    임계 미만이어도 트림
 *
 * 안전장치: 무손실 지문 대조 + 형식 계약 11항목 + BOM 보존. 실패 시 원본 복구 후 exit 1.
 */
const fs = require('fs')
const path = require('path')

// --root <dir> 로 대상 디렉터리 교체 가능 (테스트 픽스처 검증용, 미지정 시 프로젝트 루트)
const rootArg = process.argv.indexOf('--root')
const ROOT = rootArg > -1 ? path.resolve(process.argv[rootArg + 1]) : path.resolve(__dirname, '..')
const ACTIVE = path.join(ROOT, '.claude', 'PROJECT_STATUS.md')
const ARCHIVE = path.join(ROOT, '.claude', 'PROJECT_STATUS_ARCHIVE.md')

const BANNER_THRESHOLD = 12 // 배포 배너가 이 수 이상이면 트림
const BANNER_KEEP = 6 // 남길 최근 배포 배너 수
const DONE_THRESHOLD = 5 // '진행 중' 섹션의 ✅ 완료 항목이 이 수 이상이면 전량 이관

const argv = process.argv.slice(2)
const CHECK_ONLY = argv.includes('--check')
const FORCE = argv.includes('--force')

/** 배포 배너만 대상. 나머지 `> **` 상시 정보(현재 초점·블로커·다음 액션 등)는 절대 건드리지 않는다 */
const BANNER_RE = /^> \*\*✅ prod/
/** '현재 진행 중' 섹션에서 완료 처리된 항목 */
const DONE_ITEM_RE = /^- \*\*✅/

// 트림 후에도 반드시 살아 있어야 하는 것들 — 하나라도 없으면 세션 온보딩이 깨진다
const CONTRACT = [
  ['제목', /^# PROJECT_STATUS\.md/m],
  ['미해결 잠복 절', /^## ⚠️ 미해결 잠복/m],
  ['편집 중 절', /^## 🔒 편집 중/m],
  ['현재 진행 중 절', /^## 🔴 현재 진행 중/m],
  ['대기 중 절', /^## 🟡 대기 중/m],
  ['기존 에러 절', /^## 📌 기존 에러/m],
  ['현재 초점 배너', /^> \*\*현재 초점\*\*/m],
  ['블로커 배너', /^> \*\*블로커\*\*/m],
  ['다음 액션 배너', /^> \*\*다음 액션\*\*/m],
  ['핸드오프 정본 배너', /^> \*\*핸드오프 정본\*\*/m],
  ['멀티세션 배너', /^> \*\*🔧 멀티세션\*\*/m],
]

function analyze(lines) {
  const banners = []
  lines.forEach((l, i) => {
    if (BANNER_RE.test(l)) banners.push({ i, head: l.slice(0, 55) })
  })

  // '현재 진행 중' 섹션 경계
  let secStart = -1
  let secEnd = -1
  lines.forEach((l, i) => {
    if (/^## 🔴 현재 진행 중/.test(l)) secStart = i
    if (secStart >= 0 && secEnd < 0 && i > secStart && /^## /.test(l)) secEnd = i
  })
  if (secEnd < 0) secEnd = lines.length

  const doneItems = []
  if (secStart >= 0) {
    for (let i = secStart + 1; i < secEnd; i++) {
      if (/^- \*\*/.test(lines[i])) {
        let j = i + 1
        while (j < secEnd && !/^- \*\*/.test(lines[j]) && !/^> \*\*/.test(lines[j]) && !/^---/.test(lines[j])) j++
        if (DONE_ITEM_RE.test(lines[i])) doneItems.push({ s: i, e: j - 1, head: lines[i].slice(0, 55) })
        i = j - 1
      }
    }
  }
  return { banners, doneItems }
}

function main() {
  const rawActive = fs.readFileSync(ACTIVE, 'utf8')
  const rawArchive = fs.readFileSync(ARCHIVE, 'utf8')
  const bom = rawActive.charCodeAt(0) === 0xfeff // 원본 BOM 유지
  const lines = rawActive.split(/\r?\n/)
  const { banners, doneItems } = analyze(lines)

  const kb = (s) => Math.round(Buffer.byteLength(s) / 1024)
  console.log(
    `배포 배너 ${banners.length}건(임계 ${BANNER_THRESHOLD}) / 진행중 ✅ ${doneItems.length}건(임계 ${DONE_THRESHOLD}) / 활성 ${kb(rawActive)}KB`
  )

  const trimBanner = FORCE || banners.length >= BANNER_THRESHOLD
  const trimDone = FORCE || doneItems.length >= DONE_THRESHOLD

  if (CHECK_ONLY) {
    banners.forEach((b, i) => console.log(`  ${i < BANNER_KEEP ? '유지' : '이관'} ${b.head}`))
    doneItems.forEach((d) => console.log(`  이관(완료항목) ${d.head}`))
    return
  }
  if (!trimBanner && !trimDone) {
    console.log('→ 트림 불필요 (--force로 강제 가능)')
    return
  }

  const moveLines = new Set()
  const movedBanners = trimBanner ? banners.slice(BANNER_KEEP) : []
  const movedDone = trimDone ? doneItems : []
  movedBanners.forEach((b) => moveLines.add(b.i))
  movedDone.forEach((d) => {
    for (let i = d.s; i <= d.e; i++) moveLines.add(i)
  })

  if (moveLines.size === 0) {
    console.log('→ 이관 대상 없음')
    return
  }

  const movedText = [
    movedBanners.length ? '### 배포 배너 (시간 역순)\n\n' + movedBanners.map((b) => lines[b.i]).join('\n') : '',
    movedDone.length
      ? '\n\n### 완료 항목 (구 "현재 진행 중")\n\n' + movedDone.map((d) => lines.slice(d.s, d.e + 1).join('\n')).join('\n')
      : '',
  ].join('')

  let kept = lines.filter((_, i) => !moveLines.has(i))
  let body = kept.join('\n').replace(/\n{4,}/g, '\n\n\n')

  // 배너를 줄였으면 ARCHIVE 안내가 있는지 확인 후 없으면 삽입
  if (movedBanners.length && !/이전 배포 이력/.test(body)) {
    const lastKeep = lines[banners[BANNER_KEEP - 1].i]
    body = body.replace(lastKeep, lastKeep + '\n>\n> 이전 배포 이력 전량 → `.claude/PROJECT_STATUS_ARCHIVE.md` (매 세션 읽을 필요 없음)')
  }
  if (bom && body.charCodeAt(0) !== 0xfeff) body = '﻿' + body

  const stamp = new Date().toISOString().slice(0, 10)
  const header = [
    `## 📦 ${stamp} 이관분 (자동 트림 — scripts/status-trim.cjs)`,
    '',
    `> 배포 배너 ${movedBanners.length}건 + 완료 항목 ${movedDone.length}건. 원본 순서(시간 역순) 보존.`,
    '',
    movedText,
    '',
    '---',
    '',
  ].join('\n')

  fs.writeFileSync(ACTIVE, body, 'utf8')
  fs.writeFileSync(ARCHIVE, header + rawArchive, 'utf8')

  // ── 검증: 무손실 + 형식 계약 + BOM ──
  const after = fs.readFileSync(ACTIVE, 'utf8')
  const arch = fs.readFileSync(ARCHIVE, 'utf8')
  const pool = after + '\n' + arch
  const lost = [...banners, ...doneItems].filter((x) => !pool.includes(x.head))
  // BOM이 있으면 첫 줄이 '﻿# ...'가 되어 ^# 앵커가 불일치 → 검사 전 제거
  const broken = CONTRACT.filter(([, re]) => !re.test(after.replace(/^﻿/, ''))).map(([n]) => n)
  const bomLost = bom && after.charCodeAt(0) !== 0xfeff

  if (lost.length || broken.length || bomLost) {
    fs.writeFileSync(ACTIVE, rawActive, 'utf8')
    fs.writeFileSync(ARCHIVE, rawArchive, 'utf8')
    console.error('✘ 검증 실패 — 원본 복구함')
    lost.forEach((x) => console.error(`   유실: ${x.head}`))
    broken.forEach((n) => console.error(`   계약 손상: ${n}`))
    if (bomLost) console.error('   BOM 유실')
    process.exit(1)
  }

  console.log(`✔ 배너 ${movedBanners.length}건 + 완료항목 ${movedDone.length}건 이관 · ${kb(rawActive)}KB → ${kb(after)}KB`)
  console.log(`  무손실 ${banners.length + doneItems.length}건 전수 대조 OK · 형식 계약 ${CONTRACT.length}항목 OK`)
}

main()
