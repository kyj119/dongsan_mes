#!/usr/bin/env node
/**
 * 마감·후가공 표기 자체검증 — `src/utils/finishingLabel.ts`
 *
 * 왜 있는가: 이 표기는 **카드 생성 시 DB에 문자열로 박히는 스냅샷**(card_checklist_items.label)이라
 * 규칙이 틀어져도 화면에서 즉시 안 드러나고, 이미 발행된 카드는 소급되지 않는다.
 * 게다가 규칙 사본이 클라(src/scripts/shared/finishingLabel.js)에도 있어 갈리면
 * "카드 화면 표기 ≠ 체크리스트 라벨"이 된다.
 *
 * 실행: node scripts/finishing-label-selftest.cjs   (실패 시 exit 1)
 *
 * ⚠️ 클라 사본은 여기서 못 잡는다 — 규칙을 고치면 두 파일을 함께 고치고 브라우저에서 눈으로 확인할 것.
 */
'use strict'

const { compileTs } = require('./lib/compile-ts.cjs')
const path = require('path')

const SRC = path.join(__dirname, '..', 'src', 'utils', 'finishingLabel.ts')

// esbuild JS API 사용 — CLI spawn 은 CI(Linux)에서 죽는다(2026-08-25). 상세=scripts/lib/compile-ts.cjs
const { mod: _m, cleanup: _cleanup } = compileTs(SRC)
const { formatFinishing, formatPunching, formatPP, formatPPList } = _m

let pass = 0
const fails = []
function eq(name, got, want) {
  if (got === want) { pass++; return }
  fails.push(`${name}\n    기대 「${want}」\n    실제 「${got}」`)
}

// ── 마감 4변 ──
eq('4변 동일 = 4방',
  formatFinishing({ top: '열재단', bottom: '열재단', left: '열재단', right: '열재단' }), '4방열재단')
eq('3변 = 방향 나열(상하좌우 순)',
  formatFinishing({ top: '열재단', bottom: '열재단', left: '열재단' }), '상하좌 열재단')
// 서비스 플래그(`charged:false`)는 **표기에 영향이 없어야** 한다 — 청구만 0이고 현장은 그대로 박는다.
// 이 키가 라벨을 바꾸면 카드에 「좌우 줄미싱」이 안 찍혀 현장이 재봉을 빠뜨린다(0573 Phase 0).
eq('서비스 플래그는 표기를 바꾸지 않는다',
  formatFinishing({ top: '열재단', bottom: '열재단', left: '열재단', right: '열재단', charged: false }), '4방열재단')
eq('서비스 플래그 + 혼재',
  formatFinishing({ top: '봉미싱', bottom: '봉미싱', left: '줄미싱', right: '줄미싱', charged: false }), '좌우 줄미싱+상하 봉미싱')

eq('혼재 = 좌우 축 먼저',
  formatFinishing({ top: '봉미싱', bottom: '봉미싱', left: '줄미싱', right: '줄미싱' }), '좌우 줄미싱+상하 봉미싱')
eq('상하만',
  formatFinishing({ top: '접어미싱', bottom: '접어미싱' }), '상하 접어미싱')
eq('한 변만',
  formatFinishing({ top: '접어미싱' }), '상 접어미싱')
eq('3종 혼재',
  formatFinishing({ top: '접어미싱', bottom: '열재단', left: '줄미싱', right: '줄미싱' }),
  '좌우 줄미싱+상 접어미싱+하 열재단')
eq('JSON 문자열 입력', formatFinishing('{"top":"쌍침","bottom":"쌍침","left":"쌍침","right":"쌍침"}'), '4방쌍침')
eq('빈 값', formatFinishing({ top: '', bottom: null }), '')
eq('null', formatFinishing(null), '')
eq('깨진 JSON', formatFinishing('{oops'), '')

// ── 펀칭 ──
// 실제 저장 데이터(로컬 D1) — 좌상1·우상1·상변2. 예전 라벨은 `펀칭 1cm 1cm 2cm 0cm 0cm 0cm 0cm 0cm`
eq('모서리 일부 + 변',
  formatPunching({ corner_tl: 1, corner_tr: 1, side_top: 2, side_bottom: 0, side_left: 0, side_right: 0, corner_bl: 0, corner_br: 0 }),
  '4개(상 2, 모서리 좌상·우상)')
eq('4모서리 + 상하',
  formatPunching({ corner_tl: 1, corner_tr: 1, corner_bl: 1, corner_br: 1, side_top: 2, side_bottom: 2 }),
  '8개(4모서리, 상 2, 하 2)')
eq('좌우만', formatPunching({ side_left: 3, side_right: 3 }), '6개(좌 3, 우 3)')
eq('전부 0 = 빈 문자열', formatPunching({ corner_tl: 0, side_top: 0 }), '')
eq('margin_* 는 개수에 안 섞인다',
  formatPunching({ side_top: 2, margin_top: 3, margin_left: 1.5 }), '2개(상 2)')

// ── 후가공 라벨 ──
eq('펀칭 PP',
  formatPP({ code: 'PUNCHING', name: '펀칭', params: { corner_tl: 1, corner_tr: 1, side_top: 2 } }),
  '펀칭 4개(상 2, 모서리 좌상·우상)')
eq('펀칭인데 개수 0 = 이름만',
  formatPP({ code: 'PUNCHING', name: '펀칭', params: { corner_tl: 0 } }), '펀칭')
eq('부직포(이름 겹침 제거 + cm)',
  formatPP({ code: 'PP-NONWOVEN', name: '부직포', params: { type: '부직포', size: 7 } }), '부직포 7cm')
eq('하도매', formatPP({ code: 'PP-GROMMET', name: '하도매', params: { size: '5호', holes: '2구' } }), '하도매 5호 2구')
eq('수술 없음 = 이름만', formatPP({ code: 'PP-TASSEL', name: '수술', params: { color: '없음' } }), '수술')
// 마감 후가공 params.directions — 예전엔 String(객체)라 `열재단 [object Object]` 가 찍혔다
eq('directions 4방', formatPP({ code: 'CUT', name: '열재단', params: { directions: { top: 0, bottom: 0, left: 0, right: 0 } } }), '열재단 4방')
eq('directions 일부(0cm도 방향은 유효)',
  formatPP({ code: 'CUT', name: '열재단', params: { directions: { top: 0, left: 3 } } }), '열재단 상좌')
eq('annotation positions 배열',
  formatPP({ code: 'ANNO', name: '주석', params: { positions: ['top', 'bottom'], customText: '취급주의' } }), '주석 상하 취급주의')
eq('params 없음', formatPP({ code: 'X', name: '코팅' }), '코팅')
eq('문자열 PP', formatPP('아일렛'), '아일렛')
eq('PP 목록',
  formatPPList('[{"code":"PUNCHING","name":"펀칭","params":{"side_left":3,"side_right":3}},{"code":"PP-NONWOVEN","name":"부직포","params":{"type":"부직포","size":7}}]'),
  '펀칭 6개(좌 3, 우 3), 부직포 7cm')
eq('PP 목록 빈값', formatPPList('[]'), '')
eq('PP 목록 깨진 JSON', formatPPList('nope'), '')

if (fails.length > 0) {
  console.error(`\n✗ 마감·후가공 표기 자체검증 실패 ${fails.length}건 (통과 ${pass})\n`)
  for (const f of fails) console.error('  ✗ ' + f)
  process.exit(1)
}
console.log(`✓ 마감·후가공 표기 자체검증 ${pass}건 통과`)
