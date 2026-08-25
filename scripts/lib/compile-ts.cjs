/**
 * selftest 공용 — TS 모듈 하나를 CJS 로 컴파일해 require 가능한 형태로 돌려준다.
 *
 * ★왜 esbuild **JS API** 인가 (2026-08-25):
 *   종전 selftest 들은 `execFileSync(node, ['node_modules/esbuild/bin/esbuild', ...])` 로 CLI 를 spawn 했다.
 *   로컬(Windows)에선 됐지만 **CI(Linux)에서 exit 1** 로 죽었다 — 그 파일은 `#!/usr/bin/env node` 셰방을 가진
 *   런처라 실행 환경에 따라 동작이 갈린다. 게다가 `stdio: 'ignore'` 라 **원인이 안 남았다**.
 *   `require('esbuild').buildSync` 는 플랫폼 무관하게 같은 결과를 내고, 실패하면 에러가 그대로 올라온다.
 *
 * @param {string} absTsPath  컴파일할 .ts 절대경로
 * @param {{bundle?: boolean}} [opts]  bundle=true 면 import 까지 묶는다(의존 모듈이 있을 때 필요)
 * @returns {{ mod: any, cleanup: () => void }}
 */
'use strict'

const esbuild = require('esbuild')
const path = require('path')
const os = require('os')
const fs = require('fs')

function compileTs(absTsPath, opts = {}) {
  const outFile = path.join(
    os.tmpdir(),
    `${path.basename(absTsPath, '.ts')}.selftest.${process.pid}.${Math.abs(hash(absTsPath))}.cjs`
  )
  esbuild.buildSync({
    entryPoints: [absTsPath],
    outfile: outFile,
    format: 'cjs',
    platform: 'node',
    bundle: !!opts.bundle,
  })
  const mod = require(outFile)
  return {
    mod,
    cleanup() { try { fs.unlinkSync(outFile) } catch (_) { /* 임시파일 정리 실패는 무시 */ } },
  }
}

// 같은 프로세스에서 여러 모듈을 컴파일할 때 파일명 충돌 방지(Date/random 없이 결정론적으로)
function hash(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0 }
  return h
}

module.exports = { compileTs }
