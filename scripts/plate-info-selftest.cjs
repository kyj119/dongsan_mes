// 재단 판 정보(src/utils/plateInfo.ts) 픽스처 테스트 — 디자이너 PC 에서 오는 manifest 값을 거르는 자리다.
//   실행 = npm run test:plate-info   (test:calc 체인 → CI·ship:gate·/deploy-verify)
//   판정: 판 2장 이상·정상 번호만 싣는다 · 이상한 값은 **통째로 안 싣는다**(종전 = 판 정보 없음) · 읽기 쪽도 같은 규칙
const { compileTs } = require('./lib/compile-ts.cjs')
const path = require('path')
const { mod, cleanup } = compileTs(path.join(__dirname, '..', 'src', 'utils', 'plateInfo.ts'))
const { parsePlateInfo, plateOfGroup } = mod

let pass = 0
const fails = []
const eq = (name, got, want) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else fails.push(`${name}\n    기대 ${w}\n    실제 ${g}`) }

// ── 싣는 쪽(parsePlateInfo) ──
eq('판 2/3 + 조각', parsePlateInfo({ batch_index: 2, batch_total: 3, pieces: [{ n: '1-1', w: 750 }, { n: '1-2' }, { n: '12' }] }),
  { plate_index: 2, plate_total: 3, piece_labels: ['1-1', '1-2', '12'] })
eq('판 1장(단독) → 없음', parsePlateInfo({ batch_index: null, batch_total: null }), {})
eq('총 1 → 없음', parsePlateInfo({ batch_index: 1, batch_total: 1 }), {})
eq('k > N → 없음', parsePlateInfo({ batch_index: 4, batch_total: 3 }), {})
eq('k = 0 → 없음', parsePlateInfo({ batch_index: 0, batch_total: 3 }), {})
eq('소수 → 없음', parsePlateInfo({ batch_index: 1.5, batch_total: 3 }), {})
eq('문자열 숫자는 받는다', parsePlateInfo({ batch_index: '1', batch_total: '2' }), { plate_index: 1, plate_total: 2 })
eq('판 100장 이상 → 없음(오입력)', parsePlateInfo({ batch_index: 1, batch_total: 100 }), {})
eq('이상한 번호는 뺀다(스크립트·한글·빈값)', parsePlateInfo({ batch_index: 1, batch_total: 2, pieces: [{ n: '<b>' }, { n: '가-1' }, { n: '' }, { n: '3-4' }, null, 'x'] }),
  { plate_index: 1, plate_total: 2, piece_labels: ['3-4'] })
eq('조각이 전부 이상하면 목록 없이 판 정보만', parsePlateInfo({ batch_index: 1, batch_total: 2, pieces: [{ n: 'abc' }] }), { plate_index: 1, plate_total: 2 })
eq('조각 500개 상한', parsePlateInfo({ batch_index: 1, batch_total: 2, pieces: Array.from({ length: 700 }, (_, i) => ({ n: String(i + 1) })) }).piece_labels.length, 500)
eq('pieces 가 배열이 아니면 무시', parsePlateInfo({ batch_index: 1, batch_total: 2, pieces: '1-1' }), { plate_index: 1, plate_total: 2 })

// ── 읽는 쪽(plateOfGroup) — groups_json 의 첫 그룹 ──
eq('읽기 정상', plateOfGroup({ index: 0, plate_index: 3, plate_total: 3, piece_labels: ['2-1', 'x', '2-2'] }), { plate_index: 3, plate_total: 3, piece_labels: ['2-1', '2-2'] })
eq('판 정보 없는 그룹 → null(종전 등록)', plateOfGroup({ index: 0, name: 'design' }), null)
eq('null → null', plateOfGroup(null), null)
eq('총 1 → null', plateOfGroup({ plate_index: 1, plate_total: 1 }), null)

cleanup()
if (fails.length) { console.error(`test:plate-info FAIL ${fails.length}건\n  ` + fails.join('\n  ')); process.exit(1) }
console.log(`test:plate-info OK — ${pass}항목 (싣기 12 · 읽기 4)`)
