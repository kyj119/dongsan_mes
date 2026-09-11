#!/usr/bin/env node
// 빈 catch 감사 — IA 패널·호스트·에이전트 JSX (2026-09-11 용준님 「나」: 전수 분류 + 개발 단계부터 차단)
//
// 왜 있는가: 주석 소실(2026-09-10 실기)은 `catch (eAnn) {}` 한 줄이 한 달간 삼켰다. 기록(manifest)엔
//   「주석 있음」, 화면엔 「성공」, 실물엔 없음. 「값이 있다 ≠ 그려졌다」(CLAUDE.md §조용한 격하).
//   빈 catch 는 「실패하면 아무것도 하지 말고 계속 가라」다 — 일러 스크립트에서는 정답인 자리도 많지만
//   (개체 종류에 따라 없는 속성 읽기·임시 문서 닫기), **왜 무시해도 되는지**를 적지 않으면 다음 사람이
//   실물 경로의 빈 catch 와 구분할 수 없다.
//
// 규칙: catch 본문이 공백·주석뿐이면 「빈 catch」. 본문의 블록 주석에 `ignore: <사유 4자 이상>` 이 있어야 통과.
//   예)  } catch (e) { /★ ignore: 텍스트가 아닌 개체는 이 속성이 없다 ★/ }   (★ = * · 한 줄 주석 // 은 닫는 중괄호를 먹으니 쓰지 말 것)
//   실물에 닿는 자리(파일 쓰기·그리기·복사·잠금)는 사유를 적는 대신 **실패를 기록**한다(주석 A 코드처럼).
//
// 실행: node scripts/empty-catch-audit.cjs [파일...]   (인자 없으면 전 범위 · 위반 시 exit 1)
//   --json  기계용 출력
// 배선: 편집 훅(해당 파일 차단) · 커밋 훅(IA 파일이 dirty 인 커밋) · ia:deploy GATES · CLAUDE.md §배포를 실제로 막는 게이트
'use strict'
const fs = require('fs')
const path = require('path')

const REPO = path.resolve(__dirname, '..')
const IA = path.join(REPO, 'IllustratorAutomat')
const PANEL = path.join(IA, 'designer', 'poc-a0-cep', 'com.mes.a0.panel')

// 범위 = 배포되는 코드 전부. bin/·publish/ 는 빌드 산출물이라 제외(정본은 IllustratorAutomat/*.jsx).
function scopeFiles() {
  const out = []
  const add = (p) => { if (fs.existsSync(p)) out.push(p) }
  for (const f of fs.readdirSync(path.join(PANEL, 'js'))) if (/\.js$/.test(f)) add(path.join(PANEL, 'js', f))
  add(path.join(PANEL, 'jsx', 'host.jsx'))
  for (const f of fs.readdirSync(path.join(IA, 'designer'))) if (/\.jsx$/.test(f)) add(path.join(IA, 'designer', f))
  for (const f of fs.readdirSync(IA)) if (/\.jsx$/.test(f)) add(path.join(IA, f))
  return out
}
function inScope(abs) {
  const n = abs.replace(/\\/g, '/')
  if (!/\/IllustratorAutomat\//.test(n)) return false
  if (/\/(bin|obj|publish[^/]*)\//.test(n)) return false
  return /\.(js|jsx)$/.test(n) && !/\.bak/.test(n)
}

// catch 본문이 공백/주석뿐인 것. `catch (e) {}` · `catch {}` · 여러 줄 · 주석만 있는 본문 전부 잡는다.
const RE = /catch\s*(?:\(\s*[A-Za-z_$][\w$]*\s*\))?\s*\{((?:\s|\/\*[\s\S]*?\*\/|\/\/[^\n]*)*)\}/g
const MARK = /ignore:\s*\S.{3,}/

function audit(abs) {
  const src = fs.readFileSync(abs, 'utf8')
  const bad = []
  let n = 0, m
  RE.lastIndex = 0
  while ((m = RE.exec(src))) {
    n++
    if (MARK.test(m[1])) continue
    const line = src.slice(0, m.index).split('\n').length
    bad.push({ line, text: src.split('\n')[line - 1].trim().slice(0, 140) })
  }
  return { total: n, bad }
}

const args = process.argv.slice(2)
const JSON_OUT = args.includes('--json')
const given = args.filter((a) => !a.startsWith('--')).map((a) => path.resolve(a))
const files = given.length ? given.filter(inScope) : scopeFiles()

let total = 0
const violations = []
for (const abs of files) {
  const r = audit(abs)
  total += r.total
  for (const b of r.bad) violations.push({ file: path.relative(REPO, abs).replace(/\\/g, '/'), line: b.line, text: b.text })
}

if (JSON_OUT) {
  console.log(JSON.stringify({ files: files.length, total, violations }, null, 2))
} else if (violations.length) {
  console.error(`✗ 빈 catch 에 사유가 없습니다 ${violations.length}건 (검사 ${files.length}파일 · catch ${total}곳)`)
  for (const v of violations.slice(0, 40)) console.error(`  ${v.file}:${v.line}  ${v.text}`)
  if (violations.length > 40) console.error(`  … ${violations.length - 40}건 더`)
  console.error('  → 무시해도 되는 자리면  catch (e) { /* ignore: 왜 무시해도 되는지 */ }  · 실물에 닿는 자리면 실패를 기록할 것')
} else {
  console.log(`✓ 빈 catch 감사 통과 — ${files.length}파일 · catch ${total}곳 전부 사유 있음`)
}
process.exit(violations.length ? 1 : 0)
