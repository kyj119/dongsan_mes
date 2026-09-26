// 판짜기 작업지시서 묶음(src/utils/cutBatch.ts) 픽스처 테스트 — 판들을 한 부로 묶는 자리다.
//   실행 = npm run test:cut-batch   (test:calc 체인 → CI·ship:gate·/deploy-verify)
//   판정: 같은 batch_key 의 판을 순서대로 모은다 · 다른 주문/대기함 판을 구분한다 · 번호 꺼진 판짜기는 묶지 않는다
const { compileTs } = require('./lib/compile-ts.cjs')
const path = require('path')
const { mod, cleanup } = compileTs(path.join(__dirname, '..', 'src', 'utils', 'cutBatch.ts'))
const { assembleCutBatches } = mod

let pass = 0
const fails = []
const eq = (name, got, want) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else fails.push(`${name}\n    기대 ${w}\n    실제 ${g}`) }

const P = (n, w = 500, h = 300) => ({ n, w, h })
const K = 'Z:/DESIGNS/IA-등록/20260926_202924_cut169'
const groups = new Map([
  [11, { plate_index: 1, plate_total: 3, pieces: [P('1-1'), P('1-2')], thumbnail_ov_r2_key: 'thumbnails/analysis/11/0@ov.png' }],
  [12, { plate_index: 2, plate_total: 3, pieces: [P('2-1')] }],
  [13, { plate_index: 3, plate_total: 3, pieces: [P('3-1'), P('3-2')] }],
])
const batchOf = new Map([[11, K], [12, K]])
const intakes = [
  { batch_key: K, analysis_id: 13, order_id: null, order_number: null },          // 대기함
  { batch_key: K, analysis_id: 12, order_id: 7, order_number: 'A-7' },
  { batch_key: K, analysis_id: 11, order_id: 7, order_number: 'A-7' },
]

// ① 이 주문(7)에 판 1·2, 판 3 은 대기함
const r1 = assembleCutBatches(7, [{ line_id: 101, analysis_id: 11 }, { line_id: 102, analysis_id: 12 }], batchOf, intakes, groups)
eq('① 묶음 1개', r1.length, 1)
eq('① 판 순서·라인 연결', r1[0].plates.map((p) => [p.index, p.line_id, p.waiting]), [[1, 101, false], [2, 102, false], [3, null, true]])
eq('① 조각 합계·전체 그림', [r1[0].piece_count, r1[0].plate_total, r1[0].overview_ref], [5, 3, 'thumbnails/analysis/11/0@ov.png'])

// ② 판 3 이 다른 주문(9)에 들어감 → 주문번호 표시
const r2 = assembleCutBatches(7, [{ line_id: 101, analysis_id: 11 }], new Map([[11, K]]),
  [intakes[2], { batch_key: K, analysis_id: 13, order_id: 9, order_number: 'B-9' }], groups)
eq('② 다른 주문 판', r2[0].plates.map((p) => [p.index, p.other_order_number, p.waiting]), [[1, null, false], [3, 'B-9', false]])
eq('② 빠진 판(2)은 목록에 없다 — 화면이 plate_total 로 「기록 없음」을 채운다', r2[0].plate_total, 3)

// ③ 번호 꺼짐(조각 상세 0) → 묶지 않는다(종전 판별 쪽)
const g3 = new Map([[21, { plate_index: 1, plate_total: 2 }], [22, { plate_index: 2, plate_total: 2 }]])
eq('③ 번호 꺼짐 → 없음', assembleCutBatches(7, [{ line_id: 1, analysis_id: 21 }], new Map([[21, 'k2']]),
  [{ batch_key: 'k2', analysis_id: 21, order_id: 7, order_number: 'A' }, { batch_key: 'k2', analysis_id: 22, order_id: 7, order_number: 'A' }], g3), [])

// ④ batch_key 없는 라인(판 묶음 이전 등록) → 없음
eq('④ batch_key 없음 → 없음', assembleCutBatches(7, [{ line_id: 1, analysis_id: 11 }], new Map(), intakes, groups), [])

// ⑤ 같은 판 재등록 — 이 주문에 들어간 쪽이 이긴다(순서 무관)
const g5 = new Map([...groups, [14, { plate_index: 2, plate_total: 3, pieces: [P('2-9')] }]])
const r5 = assembleCutBatches(7, [{ line_id: 102, analysis_id: 12 }], new Map([[12, K]]),
  [{ batch_key: K, analysis_id: 12, order_id: 7, order_number: 'A-7' }, { batch_key: K, analysis_id: 14, order_id: null, order_number: null }], g5)
eq('⑤ 재등록 — 이 주문 판 유지', r5[0].plates.map((p) => [p.index, p.line_id, p.pieces[0].n]), [[2, 102, '2-1']])

// ⑥ 판 정보가 이상한 그룹은 건너뛴다
const g6 = new Map([[11, groups.get(11)], [31, { plate_index: 5, plate_total: 3, pieces: [P('9-9')] }]])
eq('⑥ k>N 그룹 무시', assembleCutBatches(7, [{ line_id: 101, analysis_id: 11 }], new Map([[11, K]]),
  [intakes[2], { batch_key: K, analysis_id: 31, order_id: null, order_number: null }], g6)[0].plates.length, 1)

cleanup()
if (fails.length) { console.error(`test:cut-batch FAIL ${fails.length}건\n  ` + fails.join('\n  ')); process.exit(1) }
console.log(`test:cut-batch OK — ${pass}항목`)
