#!/usr/bin/env node
/**
 * 마이그레이션 번호 중복 감사 — 같은 4자리 번호가 같은 테이블에 겹치는 DDL 을 만드는지 본다
 * (npm run audit:migration-number)
 *
 * 왜 있나 (#639): 병렬 worktree 세션이 각자 "현재 폴더의 다음 번호"를 눈으로 채번해서
 *   같은 4자리 번호가 자주 겹친다(2026-09-11 기준 23쌍). wrangler 는 번호가 아니라 **전체 파일명**으로
 *   추적하므로 중복 자체는 무해할 때가 많다 — 두 파일이 서로 다른 테이블/컬럼을 건드리면 그냥 둘 다 적용된다.
 *   위험한 건 **같은 번호 두 파일이 같은 테이블에 같은 컬럼을 ADD** 하거나 **같은 테이블을 CREATE** 할 때다:
 *   `wrangler d1 migrations apply` 가 둘째 파일에서 "duplicate column name" / "table already exists" 로 죽어
 *   **배포가 막히거나**, 컬럼명만 다르고 의미가 같으면 스키마가 조용히 갈라진다.
 *
 * 판정
 *   ERROR(exit 1) = 같은 번호 그룹에서 두 파일이 (테이블, 추가컬럼) 또는 (CREATE 테이블) 을 공유.
 *   WARN(exit 0)  = 그 외 단순 번호 중복. 정보로만 출력한다(23쌍은 이미 무해).
 *
 * 한계: 정규식 파싱이라 문자열 리터럴 속 DDL 은 구분 못 한다. 재빌드용 임시/백업 테이블
 *   (`_bak_*`·`_tmp_*`·`*_new`)은 실제 스키마가 아니라 제외한다(안 하면 0596 의 `_tmp_0596_fix` 가 오탐).
 *
 * 사용: npm run audit:migration-number   ·   신규 마이그 생성 후 반드시 1회.
 */
const fs = require('fs')
const path = require('path')

const MIG_DIR = path.resolve(__dirname, '..', 'migrations')
const isTempTable = (t) => /^_bak_|^_tmp_|_new$|^_/.test(t)

function ddlTargets(sql) {
  // 주석 제거(단순) 후 CREATE TABLE / ALTER TABLE ADD COLUMN 만 뽑는다.
  const noComments = sql.replace(/--[^\n]*/g, '')
  const creates = new Set()
  const addCols = new Set()   // "table.column"
  let m
  const reCreate = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`]?([A-Za-z0-9_]+)["'`]?(\s+AS\b)?/gi
  while ((m = reCreate.exec(noComments))) {
    if (m[2]) continue            // CTAS(CREATE TABLE ... AS SELECT) = 파생 임시, 스킵
    const t = m[1]
    if (!isTempTable(t)) creates.add(t)
  }
  const reAdd = /ALTER\s+TABLE\s+["'`]?([A-Za-z0-9_]+)["'`]?\s+ADD\s+(?:COLUMN\s+)?["'`]?([A-Za-z0-9_]+)["'`]?/gi
  while ((m = reAdd.exec(noComments))) {
    const t = m[1], col = m[2]
    if (!isTempTable(t)) addCols.add(t + '.' + col)
  }
  return { creates, addCols }
}

function main() {
  const files = fs.readdirSync(MIG_DIR).filter((f) => /^\d{4}.*\.sql$/i.test(f))
  const byNum = new Map()
  for (const f of files) {
    const num = f.slice(0, 4)
    if (!byNum.has(num)) byNum.set(num, [])
    byNum.get(num).push(f)
  }

  const dupGroups = [...byNum.entries()].filter(([, fs2]) => fs2.length > 1).sort()
  const errors = []

  for (const [num, groupFiles] of dupGroups) {
    const parsed = groupFiles.map((f) => ({
      file: f,
      ...ddlTargets(fs.readFileSync(path.join(MIG_DIR, f), 'utf8')),
    }))
    // 그룹 안의 모든 쌍을 비교
    for (let i = 0; i < parsed.length; i++) {
      for (let j = i + 1; j < parsed.length; j++) {
        const a = parsed[i], b = parsed[j]
        const sharedCreate = [...a.creates].filter((t) => b.creates.has(t))
        const sharedAdd = [...a.addCols].filter((c) => b.addCols.has(c))
        if (sharedCreate.length || sharedAdd.length) {
          errors.push({ num, a: a.file, b: b.file, sharedCreate, sharedAdd })
        }
      }
    }
  }

  console.log(`마이그레이션 번호 중복 감사 — 파일 ${files.length}개 · 중복 번호 ${dupGroups.length}쌍(군)`)
  if (dupGroups.length) {
    console.log('\n[정보] 중복 번호(무해 — 서로 다른 테이블/컬럼):')
    for (const [num, gf] of dupGroups) console.log(`  ${num}  ${gf.join('  ·  ')}`)
  }

  if (errors.length) {
    console.error('\n❌ 같은 번호 · 같은 테이블 DDL 충돌 — 배포 시 apply 가 죽는다:')
    for (const e of errors) {
      const bits = []
      if (e.sharedCreate.length) bits.push('CREATE ' + e.sharedCreate.join(','))
      if (e.sharedAdd.length) bits.push('ADD ' + e.sharedAdd.join(','))
      console.error(`  ${e.num}  ${e.a}  ↔  ${e.b}   [${bits.join(' · ')}]`)
    }
    console.error('\n→ 한쪽 마이그레이션의 번호를 다시 딴다(prod 미적용본만). 파일명 채번 = ls migrations/ | cut -c1-4 | sort | uniq -d')
    process.exit(1)
  }

  console.log('\n✅ 같은 테이블 DDL 충돌 없음')
}

main()
