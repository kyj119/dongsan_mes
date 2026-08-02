/**
 * 표준 벤치마크 대조 — ESICUP 2D irregular strip packing 인스턴스로 우리 엔진의 실력을 잰다.
 *
 *   node scripts/cut/nest-benchmark.mjs                 (npm run cut:benchmark)
 *   node scripts/cut/nest-benchmark.mjs shapes0 fu      (일부만)
 *   node scripts/cut/nest-benchmark.mjs --scale=12 --step=3
 *
 * ★왜 필요한가: 자체 케이스로는 "bbox 보다 낫다"까지만 알 수 있다. 이 업계에는 수십 년 누적된
 *   공개 인스턴스와 **best-known 활용률**이 있으므로, 그 숫자와 나란히 놓아야 우리 위치를 안다.
 *
 * 인스턴스 = sparrow(JeroenGar) / ESICUP 공개본. `data/` 에 JSON 으로 두고 커밋한다
 *   (원격 의존을 만들면 하네스가 네트워크 때문에 깨진다).
 *   형식: {name, strip_height, items:[{id, demand, allowed_orientations, shape:{data:[[x,y],..]}}]}
 *
 * ⚠️ 우리 엔진은 **래스터**라 해상도가 곧 정밀도다. 활용률은 scale 을 올리면 좋아지고 느려진다 —
 *    표에 scale 을 함께 적는 이유다. 문헌 수치(연속 기하 + 수 분~수십 분 탐색)와 직접 비교하지 말고
 *    **격차와 추세**를 볼 것.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import G from './geometry.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..')
const DATA = path.join(HERE, 'data')
await import(pathToFileURL(path.join(REPO, 'IllustratorAutomat', 'designer', 'cut-panel', 'com.mes.cut.panel', 'js', 'nesting.js')).href)
const N = globalThis.MesCutNest

// 문헌 best-known 활용률(%) — arxiv 2509.13329 (sparrow) Table 3
const BEST = {
  shapes0: 69.98, shapes1: 76.73, shapes2: 86.23,
  jakobs1: 89.26, jakobs2: 87.73, fu: 92.41,
  albano: 89.82, dagli: 90.17, mao: 86.87, marques: 92.02,
  shirts: 90.92, swim: 79.83, trousers: 92.62,
}

const args = process.argv.slice(2)
const opt = (k, d) => {
  const a = args.find((s) => s.startsWith('--' + k + '='))
  return a ? +a.split('=')[1] : d
}
const SCALE = opt('scale', 8)    // 단위당 픽셀
const STEP = opt("step", 0)      // 0 = 엔진 자동(조각 수에 맞춰 선택)
const only = args.filter((a) => !a.startsWith('--'))

const files = fs.existsSync(DATA)
  ? fs.readdirSync(DATA).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''))
  : []
if (!files.length) {
  console.log(`인스턴스가 없습니다: ${DATA}`)
  console.log('내려받기:')
  console.log('  for f in shapes0 shapes1 jakobs1 jakobs2 fu; do')
  console.log('    curl -sL "https://raw.githubusercontent.com/JeroenGar/sparrow/main/data/input/$f.json" -o scripts/cut/data/$f.json')
  console.log('  done')
  process.exit(0)
}
const targets = only.length ? files.filter((f) => only.includes(f)) : files

const polyArea = (p) => {
  let s = 0
  for (let i = 0, n = p.length; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n]
    s += a[0] * b[1] - b[0] * a[1]
  }
  return Math.abs(s) / 2
}

const rows = []
for (const name of targets) {
  const inst = JSON.parse(fs.readFileSync(path.join(DATA, name + '.json'), 'utf8'))
  const stripH = inst.strip_height
  const SW = Math.round(stripH * SCALE)

  // demand 만큼 복제. 회전은 인스턴스가 허용한 각도만(90° 배수로 제한 — 우리 엔진은 직교 회전이다).
  const pieces = []
  let totalArea = 0
  let uid = 0
  let rotSet = new Set([0])
  for (const it of inst.items) {
    const poly = it.shape.data
    const a = polyArea(poly)
    const allowed = (it.allowed_orientations || [0]).filter((r) => r % 90 === 0)
    for (const r of allowed) rotSet.add(((r % 360) + 360) % 360)
    const m = G.rasterizePolygon(poly, SCALE, 1)
    for (let d = 0; d < (it.demand || 1); d++) {
      pieces.push({ id: uid++, W: m.W, H: m.H, m: m.m })
      totalArea += a
    }
  }
  const rotations = [...rotSet].sort((x, y) => x - y)

  const common = { sheetW: SW, sheetH: 0, rollMaxH: Math.round(stripH * SCALE * 8), rotations, maxSheets: 1 }
  if (STEP) common.step = STEP

  const t0 = process.hrtime.bigint()
  const res = N.nest(pieces, common)
  const t1 = process.hrtime.bigint()

  // 같은 조건에서 **bbox 패킹**(조각을 꽉 찬 사각형으로 취급)과 비교 —
  // 실무에서 의미 있는 것은 "학술 최고와의 거리"보다 **기존 방식 대비 얼마나 아끼는가**다.
  const boxes = pieces.map((p) => {
    const m = new Uint8Array(p.W * p.H).fill(1)
    return { id: p.id, W: p.W, H: p.H, m }
  })
  const resB = N.nest(boxes, common)

  const usedPx = res.sheets.length ? res.sheets[0].usedH : 0
  const usedLen = usedPx / SCALE
  const usedB = resB.sheets.length ? resB.sheets[0].usedH / SCALE : 0
  const util = usedLen > 0 ? (totalArea / (stripH * usedLen)) * 100 : 0
  const best = BEST[name]
  rows.push({
    인스턴스: name,
    조각: pieces.length,
    회전: rotations.join('/'),
    '사용길이': +usedLen.toFixed(2),
    '활용률%': +util.toFixed(1),
    'best-known%': best ?? '-',
    '격차%p': best ? +(best - util).toFixed(1) : '-',
    'bbox대비절감%': usedB > 0 ? +(100 * (1 - usedLen / usedB)).toFixed(1) : '-',
    '미배치': res.unplaced.length,
    초: +(Number(t1 - t0) / 1e9).toFixed(1),
  })
}

console.log(`\n── ESICUP 표준 벤치마크 (scale=${SCALE}px/unit · step=${STEP || '자동'}) ──`)
console.table(rows)
const withBest = rows.filter((r) => typeof r['best-known%'] === 'number')
if (withBest.length) {
  const avg = withBest.reduce((s, r) => s + r['격차%p'], 0) / withBest.length
  console.log(`  평균 격차 ${avg.toFixed(1)}%p (낮을수록 좋음) · 미배치 총 ${rows.reduce((s, r) => s + r.미배치, 0)}개`)
}
console.log('  ※ 문헌 수치는 연속 기하 + 장시간 탐색 결과다. 직접 비교보다 **격차의 추세**를 볼 것.')
