// R0 로직 재현 테스트 — 오늘 되돌린 중복 3건과 정상 변종 4건을 넣어 판정을 본다.
const nameKey = (s) => String(s||'').replace(/[\s()\[\]\-_/·,.]/g,'').toUpperCase()
const spKey   = (v) => String(v||'').replace(/[\s()\[\]\-_/·,.]/g,'').toUpperCase()
function R0(a, b) {
  if ((a.cat||'') !== (b.cat||'')) return false
  const nk = nameKey(a.name); if (!nk || nk !== nameKey(b.name)) return false
  const x = spKey(a.sp), y = spKey(b.sp)
  return x === y || !x || !y || x.startsWith(y) || y.startsWith(x)
}
const CASES = [
  ['중복', {code:'BJP-127',      name:'부직포',        sp:'127cm',       cat:'원자재'}, {code:'BUJIK-127', name:'부직포',        sp:'127cm 50m',   cat:'원자재'}],
  ['중복', {code:'AQT-090',      name:'수성 텐트천',   sp:'90cm',        cat:'원자재'}, {code:'TENT-090',  name:'수성 텐트천',   sp:'90cm',        cat:'원자재'}],
  ['중복', {code:'SGM-TRBW-WH',  name:'트러스바 날개 백색', sp:'백색',   cat:'원자재'}, {code:'SGM-TRW-WH',name:'트러스바 날개 백색', sp:'',       cat:'원자재'}],
  ['정상', {code:'PC-5T-M-48',   name:'광확산PC',      sp:'5T 백색 4x8', cat:'원자재'}, {code:'PC-2T-M-48',name:'광확산PC',      sp:'2T 백색 4x8', cat:'원자재'}],
  ['정상', {code:'FMX-1T-W-48',  name:'포맥스',        sp:'1T 백색 4x8', cat:'원자재'}, {code:'FMX-2T-W-48',name:'포맥스',       sp:'2T 백색 4x8', cat:'원자재'}],
  ['정상', {code:'SKS-50T-W-36', name:'스카시',        sp:'50T 백색 3x6',cat:'원자재'}, {code:'SKS-10T-W-36',name:'스카시',      sp:'10T 백색 3x6',cat:'원자재'}],
  ['정상', {code:'SVB-070',      name:'솔벤 현수막',   sp:'70cm',        cat:'원자재'}, {code:'SV-BANNER', name:'솔벤 현수막',   sp:'',            cat:'솔벤'}],
]
let bad = 0
for (const [want, a, b] of CASES) {
  const got = R0(a, b) ? '중복' : '정상'
  const ok = got === want
  if (!ok) bad++
  console.log(`  ${ok?'✅':'❌'} [${want}] ${a.code} ↔ ${b.code}  → ${got}`)
}
console.log(bad ? `\n★ ${bad}건 실패` : '\n전부 기대대로')
process.exit(bad ? 1 : 0)
