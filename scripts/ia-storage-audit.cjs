#!/usr/bin/env node
/**
 * IA 산출물 용량 감사 — Z:\DESIGNS\IA-등록 (npm run audit:ia-storage)
 *
 * 왜 있나: work.ai 가 107MB 로 커진 걸 5건 524MB 쌓인 뒤에야 발견했다(2026-07-30).
 *   용량이 어디에도 보이지 않는 게 원인이라, 눈에 보이게 만들고 회귀를 자동 판정한다.
 *
 * 판정 신호 = .ai 파일의 첫 바이트.
 *   %PDF-1.x  → pdfCompatible=true (AI 편집부 + PDF 복사본 2벌 = 용량 약 2배)
 *   그 외      → pdfCompatible=false (편집부만)
 *
 * ❌ 실패(exit 1) 조건 = "수정이 들어간 로직이 배포된 뒤 만들어진 .ai 인데 아직 %PDF"
 *   기준시각을 날짜 상수로 박지 않는다. Z: 로직 파일의 ①본문에 pdfCompatible=false 가 있는지
 *   ②그 파일의 수정시각을 함께 보고 자기 교정한다 — 미반영 상태에서 새 파일이 %PDF 인 건
 *   정상이므로 실패시키지 않고 '미반영'으로만 알린다(그 판정은 audit:ia-jsx 의 일).
 *
 * NAS(Z:) 미연결은 '확인불가'로 표시만 하고 실패시키지 않는다(사무실 밖 작업 허용) —
 * ia-jsx-audit.cjs 와 같은 규칙.
 */
const fs = require('fs')
const path = require('path')

const ROOT = 'Z:\\DESIGNS\\IA-등록'
const SCRIPTS = path.join(ROOT, '_scripts')
// 산출물 종류별 '이 파일이 만들었다' 매핑 — 회귀 판정 기준시각의 출처
const LOGIC = {
  work: path.join(SCRIPTS, 'mes-a0-host.jsx'), // work*.ai (패널). 은퇴한 mes-core.jsx 도 같은 산출물명
  sheet: path.join(SCRIPTS, 'mes-sheet.jsx'), // MES판_*.ai
}
const MB = 1024 * 1024

if (!fs.existsSync(ROOT)) {
  console.log(`⚠️  Z: 미연결 — 확인불가 (${ROOT})`)
  process.exit(0)
}

function mtime(p) {
  try { return fs.statSync(p).mtimeMs } catch { return 0 }
}
function headIsPdf(p) {
  let fd
  try {
    fd = fs.openSync(p, 'r')
    const b = Buffer.alloc(5)
    fs.readSync(fd, b, 0, 5, 0)
    return b.toString('latin1') === '%PDF-'
  } catch { return null } finally { if (fd !== undefined) try { fs.closeSync(fd) } catch {} }
}

const files = []
;(function walk(dir) {
  let ents
  try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of ents) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (full.toLowerCase() === SCRIPTS.toLowerCase()) continue // 스크립트 정본은 산출물이 아니다
      walk(full)
    } else {
      let st
      try { st = fs.statSync(full) } catch { continue }
      files.push({ full, name: e.name, size: st.size, mtimeMs: st.mtimeMs })
    }
  }
})(ROOT)

const kindOf = (f) => {
  if (/^work.*\.ai$/i.test(f.name)) return 'work'
  if (/^MES판_.*\.ai$/i.test(f.name)) return 'sheet'
  if (/\.eps$/i.test(f.name)) return 'eps'
  if (/\.png$/i.test(f.name)) return 'thumb'
  if (/\.json$/i.test(f.name)) return 'meta'
  return 'etc'
}
for (const f of files) f.kind = kindOf(f)

const sum = (arr) => arr.reduce((a, b) => a + b.size, 0)
const ai = files.filter((f) => f.kind === 'work' || f.kind === 'sheet')
for (const f of ai) f.pdf = headIsPdf(f.full)

console.log('='.repeat(60))
console.log(`\n▸ 총량  ${ROOT}`)
for (const k of ['work', 'sheet', 'eps', 'thumb', 'meta', 'etc']) {
  const g = files.filter((f) => f.kind === k)
  if (!g.length) continue
  console.log(`  ${k.padEnd(6)} ${String(g.length).padStart(4)}개  ${(sum(g) / MB).toFixed(1).padStart(9)} MB`)
}
console.log(`  ${'합계'.padEnd(5)} ${String(files.length).padStart(4)}개  ${(sum(files) / MB).toFixed(1).padStart(9)} MB`)

// _출력 = RIP·재단 픽업용 EPS 사본(spec D8: C단계 도입 시 제거 예정). 중복량을 눈에 보이게만 한다.
const mirror = files.filter((f) => f.kind === 'eps' && /\\_출력\\/.test(f.full))
if (mirror.length) {
  console.log(`\n▸ _출력 EPS 사본 ${mirror.length}개 ${(sum(mirror) / MB).toFixed(1)} MB`)
  console.log('  = RIP·재단 픽업 지점(의도된 중복). 제거는 spec D8 "C단계(카드 경로 노출)" 예약 — 지금 지우면 픽업이 끊긴다.')
}

console.log('\n▸ PDF 호환(pdfCompatible) 분포 — 켜짐 = 같은 그림 2벌')
const on = ai.filter((f) => f.pdf === true)
const off = ai.filter((f) => f.pdf === false)
const unknown = ai.filter((f) => f.pdf === null)
console.log(`  켜짐 ${String(on.length).padStart(3)}개 ${(sum(on) / MB).toFixed(1).padStart(9)} MB   (끄면 약 ${(sum(on) * 0.52 / MB).toFixed(0)} MB 절감 여지)`)
console.log(`  꺼짐 ${String(off.length).padStart(3)}개 ${(sum(off) / MB).toFixed(1).padStart(9)} MB`)
if (unknown.length) console.log(`  읽기실패 ${unknown.length}개`)

const top = ai.slice().sort((a, b) => b.size - a.size).slice(0, 8)
if (top.length) {
  console.log('\n▸ 대형 상위 8')
  for (const f of top) {
    const flag = f.pdf === true ? 'PDF호환' : f.pdf === false ? '편집부만' : '?'
    console.log(`  ${(f.size / MB).toFixed(1).padStart(8)} MB  ${flag}  ${path.basename(path.dirname(f.full))}\\${f.name}`)
  }
}

// manifest 계측(host 0.1.4+) — 임베드 여분은 스크립트로 못 줄이므로 '원본 정리 필요' 목록으로만 쓴다
const oversize = []
for (const f of files.filter((x) => x.kind === 'meta' && /^manifest/i.test(x.name))) {
  try {
    const j = JSON.parse(fs.readFileSync(f.full, 'utf8').replace(/^\uFEFF/, ''))
    const pf = j.preflight || {}
    if (pf.oversize_rasters > 0) oversize.push({ dir: path.basename(path.dirname(f.full)), n: pf.oversize_rasters, pct: pf.oversize_max_pct, bytes: (j.files || {}).work_bytes || 0 })
  } catch {}
}
console.log('\n▸ 임베드 래스터 여분(디자이너 원본 정리 대상)')
if (!oversize.length) console.log('  계측값 없음 — host 0.1.4 이전 등록분이거나 해당 없음')
else for (const o of oversize.slice(0, 10)) console.log(`  ${o.dir}  여분 ${o.n}개(최대 ${o.pct}% 밖)  work.ai ${(o.bytes / MB).toFixed(1)}MB`)

// ── 회귀 판정 ──
// 배포된 로직에 수정이 들어있을 때만 판정한다. 미반영 상태에서 새 파일이 %PDF 인 건 정상이다.
const bad = []
const notDeployed = []
const judged = []
for (const kind of ['work', 'sheet']) {
  const since = mtime(LOGIC[kind])
  if (!since) continue
  let hasFix = false
  try { hasFix = /pdfCompatible\s*=\s*false/.test(fs.readFileSync(LOGIC[kind], 'utf8')) } catch {}
  if (!hasFix) { notDeployed.push(path.basename(LOGIC[kind])); continue }
  judged.push(kind)
  for (const f of ai) if (f.kind === kind && f.pdf === true && f.mtimeMs > since) bad.push({ f, kind, since })
}
console.log('')
if (notDeployed.length) {
  console.log(`ℹ️  미반영 — Z: 로직에 pdfCompatible=false 가 없다: ${notDeployed.join(', ')}`)
  console.log('   반영 전이므로 새 .ai 가 PDF 호환인 건 정상. 반영 여부는 npm run audit:ia-jsx 로 판정.')
}
if (bad.length) {
  console.log(`❌ 회귀 ${bad.length}건 — 로직 배포 후 만들어졌는데 아직 PDF 호환으로 저장됨`)
  for (const b of bad.slice(0, 10)) {
    console.log(`   ${path.basename(path.dirname(b.f.full))}\\${b.f.name}  ${(b.f.size / MB).toFixed(1)}MB`)
    console.log(`     파일 ${new Date(b.f.mtimeMs).toLocaleString('ko-KR')} > 로직 ${new Date(b.since).toLocaleString('ko-KR')} (${path.basename(LOGIC[b.kind])})`)
  }
  console.log('\n[조치] 축2 Z: 반영 여부를 먼저 확인 — npm run audit:ia-jsx')
  console.log('       Z: 가 최신인데도 뜨면 일러가 구 로직을 캐시 중이다(패널 리로드 또는 일러 재시작).')
  process.exit(1)
}
if (judged.length) console.log(`✅ 회귀 없음 — ${judged.join('·')} 배포 이후 생성분은 전부 편집부만 저장`)
else console.log('— 회귀 판정 대상 없음(아직 반영 전)')
if (on.length) console.log(`ℹ️  기존 ${on.length}개는 소급 축소되지 않는다 — 재저장 배치는 별건(일러 점유 필요).`)
