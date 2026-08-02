/**
 * 재단 패널 기하 엔진 — **Node 래퍼**
 *
 * ★기하 정본은 패널 파일이다:
 *     IllustratorAutomat/designer/cut-panel/com.mes.cut.panel/js/geometry.js
 *   여기서는 그것을 그대로 재수출하고, Node 에만 필요한 PNG 디코더를 더한다.
 *   이렇게 해야 **하네스가 검증하는 코드 = 패널이 실행하는 코드** 가 된다
 *   (복제하면 하네스는 통과하는데 패널은 다른 코드를 도는 상태가 만들어진다).
 */
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { inflateSync } from 'node:zlib'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const GEOM_PATH = path.join(REPO, 'IllustratorAutomat', 'designer', 'cut-panel', 'com.mes.cut.panel', 'js', 'geometry.js')

// ⚠️ 이 리포는 package.json "type":"module" 이라 `.js` 도 **ESM 으로 해석**된다 → `require()` 도,
//    UMD 의 `module.exports` 분기도 잡히지 않는다(빈 객체가 나온다). 대신 UMD 가 전역에 붙이는
//    `globalThis.MesCutGeom` 을 쓴다 — 패널(CEP)에서도 같은 전역으로 접근하므로 경로가 일치한다.
await import(pathToFileURL(GEOM_PATH).href)
const G = globalThis.MesCutGeom
if (!G) throw new Error('기하 엔진 로드 실패: ' + GEOM_PATH)

export const {
  rasterizePolygon, inkMask, components, traceAll, traceOuter, findHoles, assignHoles, simplify, polyArea, polyBBox,
  distanceOutside, distanceInside, offsetMask, insetMask, sampleEvenly, pickResolution, toMm,
  fitCurves, bezToMm, snapResolution, downsampleMask, flattenCubic, flattenSubpath, fillPolygonsInto,
} = G
export const GEOMETRY_SOURCE = GEOM_PATH
export default G

// ── PNG 디코더 (colorType 0/2/6, 8bit) — Node 전용 ────────────────
// CEP 는 canvas 로 픽셀을 얻으므로 이 코드가 필요 없다. 하네스·파일 조사에서만 쓴다.
export function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('PNG 아님')
  let off = 8, W = 0, H = 0, bitDepth = 0, colorType = 0
  const idat = []
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') {
      W = data.readUInt32BE(0); H = data.readUInt32BE(4)
      bitDepth = data[8]; colorType = data[9]
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    off += 12 + len
  }
  if (bitDepth !== 8) throw new Error('bitDepth ' + bitDepth + ' 미지원')
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : -1
  if (ch < 0) throw new Error('colorType ' + colorType + ' 미지원')
  const raw = inflateSync(Buffer.concat(idat))
  const stride = W * ch
  const out = Buffer.alloc(H * stride)
  let p = 0
  for (let y = 0; y < H; y++) {
    const ft = raw[p++]
    const line = raw.subarray(p, p + stride); p += stride
    const cur = out.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0
      const b = prev ? prev[x] : 0
      const c = prev && x >= ch ? prev[x - ch] : 0
      let v = line[x]
      if (ft === 1) v += a
      else if (ft === 2) v += b
      else if (ft === 3) v += (a + b) >> 1
      else if (ft === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c)
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c)
      }
      cur[x] = v & 0xff
    }
  }
  return { W, H, ch, colorType, data: out }
}
