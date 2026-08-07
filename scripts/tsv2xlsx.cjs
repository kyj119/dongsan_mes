/**
 * TSV → XLSX 최소 변환기 (외부 패키지 없이 OOXML 직접 생성, 2026-08-07)
 *
 * 이 저장소엔 xlsx/exceljs 계열 의존성이 없다. 한 번 쓰고 버릴 표를 위해 패키지를 늘리는 대신
 * OOXML 최소 골격(5개 XML)을 만들어 zip 으로 묶는다. **zip 은 zlib 로 직접 쓴다** —
 * PowerShell `Compress-Archive` 는 Windows 에서 엔트리 경로를 역슬래시로 적어 엑셀이 못 연다(아래 ⚠️).
 *
 * - 문자열은 sharedStrings 없이 inlineStr(`<is><t>`)로 넣는다 — 이관 원본(이카운트 내보내기)과 같은 형식.
 * - 숫자로만 이루어진 칸은 숫자 셀로, 나머지는 문자열로. 사업자번호·품목코드가 숫자로 뭉개지지 않게
 *   `-`·`.`·선행 0 이 있으면 문자열로 남긴다.
 * - 1행은 머리글로 고정(freeze pane) + 자동필터.
 *
 * 사용: node scripts/tsv2xlsx.cjs <in.tsv> <out.xlsx> [시트명]
 */
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const [, , inPath, outPath, sheetNameArg] = process.argv
if (!inPath || !outPath) {
  console.error('usage: tsv2xlsx.cjs <in.tsv> <out.xlsx> [sheetName]')
  process.exit(1)
}
const sheetName = (sheetNameArg || 'Sheet1').slice(0, 31)

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const rows = fs
  .readFileSync(inPath, 'utf8')
  .replace(/\r\n/g, '\n')
  .replace(/\n$/, '')
  .split('\n')
  .map((l) => l.split('\t'))

const colRef = (i) => {
  let s = ''
  for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s
  return s
}
// 순수 정수/소수만 숫자 셀. 선행 0·하이픈·지수 표기는 문자열 유지(품목코드·사업자번호 보호).
const isNum = (v) => /^-?(0|[1-9]\d*)(\.\d+)?$/.test(v)

const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 0)
const sheetRows = rows
  .map((cells, ri) => {
    const cs = []
    for (let ci = 0; ci < cells.length; ci++) {
      const v = cells[ci]
      if (v === '' || v == null) continue
      const ref = colRef(ci) + (ri + 1)
      cs.push(
        ri > 0 && isNum(v)
          ? `<c r="${ref}"><v>${v}</v></c>`
          : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`
      )
    }
    return `<row r="${ri + 1}">${cs.join('')}</row>`
  })
  .join('')

// 열 너비 = 각 열 최장 문자열 기준(한글 폭 보정 1.6배), 8~46 사이로 클램프
const widths = []
for (let ci = 0; ci < maxCols; ci++) {
  let w = 0
  for (const r of rows) {
    const v = String(r[ci] ?? '')
    const len = v.length + (v.match(/[　-鿿가-힯]/g) || []).length * 0.6
    if (len > w) w = len
  }
  widths.push(`<col min="${ci + 1}" max="${ci + 1}" width="${Math.min(46, Math.max(8, w + 2)).toFixed(1)}" customWidth="1"/>`)
}
const dim = `A1:${colRef(maxCols - 1)}${rows.length}`

const files = {
  '[Content_Types].xml':
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '</Types>',
  '_rels/.rels':
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>',
  'xl/workbook.xml':
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets><sheet name="${esc(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  'xl/_rels/workbook.xml.rels':
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '</Relationships>',
  'xl/worksheets/sheet1.xml':
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<dimension ref="${dim}"/>` +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    `<cols>${widths.join('')}</cols>` +
    `<sheetData>${sheetRows}</sheetData>` +
    `<autoFilter ref="${dim}"/>` +
    '</worksheet>',
}

// ── ZIP 직접 생성 ──
// ⚠️ PowerShell `Compress-Archive` 를 쓰면 안 된다. Windows 에서 엔트리 경로를 **역슬래시**로
//    적는데(`xl\workbook.xml`) OOXML 은 슬래시를 요구해서 엑셀이 파일을 못 연다.
//    (부수적으로 -DestinationPath 가 .zip 확장자만 받는 제약도 있다.)
//    deflate 는 zlib 로 충분하므로 ZIP 컨테이너만 직접 쓴다.
const crcTable = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()
const crc32 = (buf) => {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

const locals = []
const central = []
let offset = 0
for (const [name, body] of Object.entries(files)) {
  const nameBuf = Buffer.from(name, 'utf8')       // 항상 '/' 구분자 (files 키가 그렇게 돼 있다)
  const raw = Buffer.from(body, 'utf8')
  const deflated = zlib.deflateRawSync(raw, { level: 9 })
  const crc = crc32(raw)

  const lh = Buffer.alloc(30)
  lh.writeUInt32LE(0x04034b50, 0)
  lh.writeUInt16LE(20, 4)                          // version needed
  lh.writeUInt16LE(0x0800, 6)                      // UTF-8 파일명 플래그
  lh.writeUInt16LE(8, 8)                           // method = deflate
  lh.writeUInt32LE(0, 10)                          // mtime/mdate = 0 (재현 가능)
  lh.writeUInt32LE(crc, 14)
  lh.writeUInt32LE(deflated.length, 18)
  lh.writeUInt32LE(raw.length, 22)
  lh.writeUInt16LE(nameBuf.length, 26)
  lh.writeUInt16LE(0, 28)
  locals.push(lh, nameBuf, deflated)

  const ch = Buffer.alloc(46)
  ch.writeUInt32LE(0x02014b50, 0)
  ch.writeUInt16LE(20, 4)
  ch.writeUInt16LE(20, 6)
  ch.writeUInt16LE(0x0800, 8)
  ch.writeUInt16LE(8, 10)
  ch.writeUInt32LE(0, 12)
  ch.writeUInt32LE(crc, 16)
  ch.writeUInt32LE(deflated.length, 20)
  ch.writeUInt32LE(raw.length, 24)
  ch.writeUInt16LE(nameBuf.length, 28)
  ch.writeUInt32LE(offset, 42)
  central.push(ch, nameBuf)

  offset += lh.length + nameBuf.length + deflated.length
}
const centralBuf = Buffer.concat(central)
const eocd = Buffer.alloc(22)
eocd.writeUInt32LE(0x06054b50, 0)
eocd.writeUInt16LE(Object.keys(files).length, 8)
eocd.writeUInt16LE(Object.keys(files).length, 10)
eocd.writeUInt32LE(centralBuf.length, 12)
eocd.writeUInt32LE(offset, 16)

const abs = path.resolve(outPath)
fs.mkdirSync(path.dirname(abs), { recursive: true })
fs.writeFileSync(abs, Buffer.concat([...locals, centralBuf, eocd]))
console.log(`${outPath} — ${rows.length - 1}행 × ${maxCols}열 (${(fs.statSync(abs).size / 1024).toFixed(1)}KB)`)
