#!/usr/bin/env node
// 로컬 브랜치 위생 — 안전 판정 후 잔류 브랜치 정리
// 실행: node scripts/branch-cleanup.cjs [--apply] [--group=<정규식>]
//   기본 = dry-run(판정만 출력, 파일·ref 무변경). --apply 일 때만 실제 삭제.
//
// 판정 기준 (안전한 것만 삭제 대상):
//   SAFE-remote   원격에 같은 이름의 살아있는 ref 존재 → 로컬 삭제는 무손실
//                 (복구: git checkout -b <name> origin/<name>)
//   SAFE-absorbed 원격에 없지만 git cherry 기준 고유 커밋 0 = 내용이 이미 main에 있음
//   REVIEW        로컬 전용 + 고유 커밋 있음 → 자동 삭제 금지, 사람이 판단
//   SKIP          main / 현재 HEAD / 워크트리가 체크아웃 중 → 절대 손대지 않음
//
// 왜 스크립트인가: 판정을 매번 LLM이 즉석 명령으로 짜면 그때마다 실수 여지가 생긴다
// (status-trim·backlog-trim과 동일한 이유). 안전 규칙을 파일에 고정한다.
'use strict'
const { execSync } = require('child_process')

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const groupArg = (args.find((a) => a.startsWith('--group=')) || '').slice('--group='.length)
const GROUP = groupArg ? new RegExp(groupArg) : null

const git = (cmd, opts) => execSync(`git ${cmd}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim()
const gitTry = (cmd) => { try { return git(cmd) } catch { return null } }

// ── 컨텍스트 수집 ──
if (gitTry('rev-parse --git-dir') === null) { console.error('git 저장소가 아닙니다.'); process.exit(1) }

// 워크트리가 체크아웃 중인 브랜치 = 삭제 불가(다른 세션 작업 폴더)
const worktreeBranches = new Set(
  git('worktree list --porcelain').split('\n')
    .filter((l) => l.startsWith('branch '))
    .map((l) => l.replace('branch refs/heads/', '').trim())
)
const current = gitTry('rev-parse --abbrev-ref HEAD') || ''
const locals = git('branch --format="%(refname:short)"').split('\n').map((s) => s.trim()).filter(Boolean)

// 원격 추적 ref가 stale(원격에서 이미 삭제됨)이면 "원격 백업 있음" 판정이 거짓이 된다.
let staleWarn = null
try {
  const stale = execSync('git remote prune origin --dry-run', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  if (stale) staleWarn = 'stale 원격 추적 ref 감지 — `git fetch --prune` 후 다시 실행하세요:\n' + stale
} catch {
  staleWarn = '원격 확인 실패(오프라인?) — SAFE-remote 판정이 로컬 추적 ref 기준입니다.'
}

// ── 분류 ──
const buckets = { remote: [], absorbed: [], review: [], skip: [] }
for (const b of locals) {
  if (b === 'main') { buckets.skip.push([b, 'main']); continue }
  if (b === current) { buckets.skip.push([b, '현재 HEAD']); continue }
  if (worktreeBranches.has(b)) { buckets.skip.push([b, '워크트리 사용중']); continue }
  if (GROUP && !GROUP.test(b)) continue
  if (gitTry(`rev-parse --verify -q origin/${b}`)) { buckets.remote.push(b); continue }
  const unabsorbed = (gitTry(`cherry main ${b}`) || '').split('\n').filter((l) => l.startsWith('+')).length
  if (unabsorbed === 0) buckets.absorbed.push(b)
  else buckets.review.push([b, unabsorbed])
}

// ── 출력 ──
const deletable = [...buckets.remote, ...buckets.absorbed]
console.log('브랜치 위생 판정' + (GROUP ? ` (필터 /${groupArg}/)` : '') + (APPLY ? ' — APPLY' : ' — dry-run'))
console.log('━'.repeat(52))
console.log(`  SAFE-remote   ${String(buckets.remote.length).padStart(4)}  원격에 원본 존재 → 로컬 삭제 무손실`)
console.log(`  SAFE-absorbed ${String(buckets.absorbed.length).padStart(4)}  고유 커밋 0 = 내용이 main에 있음`)
console.log(`  REVIEW        ${String(buckets.review.length).padStart(4)}  로컬 전용 + 고유 커밋 → 수동 판단`)
console.log(`  SKIP          ${String(buckets.skip.length).padStart(4)}  main/현재HEAD/워크트리`)
if (staleWarn) console.log('\n⚠ ' + staleWarn)
if (buckets.review.length) {
  console.log('\n── REVIEW (자동 삭제 안 함) ──')
  for (const [b, n] of buckets.review) console.log(`  ${b}  (고유 커밋 ${n})`)
}
if (buckets.skip.length) {
  console.log('\n── SKIP ──')
  for (const [b, why] of buckets.skip) console.log(`  ${b}  (${why})`)
}

if (!APPLY) {
  console.log(`\n삭제 대상 ${deletable.length}건. 실제 삭제하려면 --apply`)
  process.exit(0)
}

if (staleWarn && staleWarn.startsWith('stale')) {
  console.error('\n중단: stale 원격 ref가 있어 SAFE-remote 판정을 신뢰할 수 없습니다. `git fetch --prune` 후 재실행.')
  process.exit(1)
}
let ok = 0, fail = 0
for (const b of deletable) {
  try { git(`branch -D ${b}`); ok++ } catch (e) { fail++; console.error(`  실패 ${b}: ${String(e.stderr || e.message).trim()}`) }
}
console.log(`\n삭제 ${ok}건 / 실패 ${fail}건 · 남은 로컬 브랜치 ${git('branch --format="%(refname:short)"').split('\n').length}개`)
process.exit(fail ? 1 : 0)
