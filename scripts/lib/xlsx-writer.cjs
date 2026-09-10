/**
 * 다중 시트 XLSX writer — 외부 패키지 없이 OOXML 을 직접 만든다.
 *
 * 이 저장소엔 xlsx/exceljs 계열 의존성이 없다(`tsv2xlsx.cjs` 가 2026-08-07 에 같은 이유로
 * 단일 시트 변환기를 직접 썼다). 여기서 그 ZIP·OOXML 골격을 **한 벌로 합쳐** 시트 여러 장과
 * 셀 수식·숫자 서식을 지원하게 넓혔다 — `tsv2xlsx.cjs` 도 이 모듈을 쓴다.
 * 사본을 두면 「한쪽만 고친 엑셀 생성기」가 둘이 된다.
 *
 * ⚠️ ZIP 은 zlib 로 직접 쓴다. PowerShell `Compress-Archive` 는 Windows 에서 엔트리 경로를
 *    역슬래시로 적어(`xl\workbook.xml`) 엑셀이 파일을 못 연다.
 *
 * 셀 표기:
 *   'text'              문자열
 *   123 / 12.5          숫자
 *   { f: 'B2*C2' }      수식 (값 캐시 없이 넣고 workbook 에 fullCalcOnLoad 를 켠다)
 *   { v, s }            값 + 스타일 id
 *   null / undefined    빈 칸
 *
 * 스타일 id (S 로 내보낸다):
 *   0 기본 · 1 헤더 · 2 정수(#,##0) · 3 소수1(#,##0.0) · 4 퍼센트(0.0%)
 *   5 입력칸(노랑, #,##0) · 6 굵게 · 7 소수2(#,##0.00) · 8 설명(회색 글자)
 *   9 제목 · 10 부제(회색 작게) · 11 합계(정수) · 12 합계(퍼센트) · 13 구역머리
 *   14 헤더(우측정렬) · 15 경고(주황) · 16 설명(줄바꿈) · 17 밴드(연회색) · 18 가운데 · 19 입력칸(%)
 *   ★0~8 은 번호를 고정한다 — `tsv2xlsx.cjs` 등 기존 호출부가 숫자로 참조한다.
 *
 * 시트 옵션:
 *   widths[]      열 너비(문자수). 없으면 내용에서 추정
 *   freeze        고정할 머리글 행 수(1-based). 0 = 고정 없음
 *   freezeCol     고정할 왼쪽 열 수. 넓은 표에서 품목명을 붙잡아 둔다
 *   autoFilter    필터를 걸 머리글 행 번호
 *   rowHeights{}  {행번호: 높이} — 머리글을 두 줄로 쓸 때
 *   tabColor      시트 탭 색(RGB, '#' 없이 8자리 ARGB 또는 6자리)
 *   merges[]      ['A1:F1', ...] 제목 줄 병합
 *   condFormat[]  [{ ref:'H5:H120', kind:'scale'|'bar', reverse:true }]
 *                 scale = 3색(작을수록 초록). reverse 면 작을수록 빨강
 */
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

/** 스타일 id — 호출부가 숫자를 외우지 않게. */
const S = {
  DEFAULT: 0, HEADER: 1, INT: 2, DEC1: 3, PCT: 4, INPUT: 5, BOLD: 6, DEC2: 7, NOTE: 8,
  TITLE: 9, CAPTION: 10, TOTAL: 11, TOTALPCT: 12, SECTION: 13,
  HEADERR: 14, WARN: 15, NOTEW: 16, BAND: 17, CENTER: 18, INPUTPCT: 19,
}

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** 0-based 열 번호 → A, B, ... AA */
function colRef(i) {
  let s = ''
  for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s
  return s
}

// 순수 정수/소수만 숫자 셀. 선행 0·하이픈·지수 표기는 문자열 유지(품목코드·사업자번호 보호).
const isNumericText = (v) => /^-?(0|[1-9]\d*)(\.\d+)?$/.test(v)

function cellXml(cell, ref) {
  if (cell === null || cell === undefined || cell === '') return ''
  if (typeof cell === 'object') {
    const s = cell.s ? ` s="${cell.s}"` : ''
    if (cell.f !== undefined) return `<c r="${ref}"${s}><f>${esc(cell.f)}</f></c>`
    const v = cell.v
    if (v === null || v === undefined || v === '') return s ? `<c r="${ref}"${s}/>` : ''
    return typeof v === 'number'
      ? `<c r="${ref}"${s}><v>${v}</v></c>`
      : `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`
  }
  if (typeof cell === 'number') return `<c r="${ref}"><v>${cell}</v></c>`
  return isNumericText(cell)
    ? `<c r="${ref}"><v>${cell}</v></c>`
    : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(cell)}</t></is></c>`
}

/** 셀에서 폭 계산에 쓸 표시 문자열 */
function displayText(cell) {
  if (cell === null || cell === undefined) return ''
  if (typeof cell === 'object') return cell.f !== undefined ? '' : String(cell.v ?? '')
  return String(cell)
}

function sheetXml(sheet) {
  const rows = sheet.rows || []
  const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 0) || 1
  const body = rows
    .map((cells, ri) => {
      const cs = []
      for (let ci = 0; ci < cells.length; ci++) {
        const x = cellXml(cells[ci], colRef(ci) + (ri + 1))
        if (x) cs.push(x)
      }
      const ht = sheet.rowHeights?.[ri + 1]
      const htAttr = ht ? ` ht="${ht}" customHeight="1"` : ''
      return cs.length ? `<row r="${ri + 1}"${htAttr}>${cs.join('')}</row>` : ''
    })
    .join('')

  // 열 너비 = 각 열 최장 문자열(한글 폭 보정 1.6배), 8~46 으로 클램프. sheet.widths 가 있으면 그걸 쓴다.
  const cols = []
  for (let ci = 0; ci < maxCols; ci++) {
    let w = sheet.widths?.[ci]
    if (!w) {
      w = 0
      for (const r of rows) {
        // ★제목·설명·구역머리는 폭 계산에서 뺀다 — 한 줄짜리 산문이 A열을 46자로 밀어
        //   표가 오른쪽으로 밀려나던 것이 가독성이 나빴던 큰 이유다.
        const cell = r[ci]
        const st = typeof cell === 'object' && cell ? Number(cell.s ?? 0) : 0
        if (st === S.TITLE || st === S.CAPTION || st === S.NOTE || st === S.NOTEW || st === S.SECTION) continue
        const v = displayText(cell)
        const len = v.length + (v.match(/[　-鿿가-힯]/g) || []).length * 0.6
        if (len > w) w = len
      }
      w = Math.min(46, Math.max(8, w + 2))
    }
    cols.push(`<col min="${ci + 1}" max="${ci + 1}" width="${Number(w).toFixed(1)}" customWidth="1"/>`)
  }

  const dim = `A1:${colRef(maxCols - 1)}${Math.max(rows.length, 1)}`
  const freezeRow = sheet.freeze === undefined ? 1 : sheet.freeze
  const freezeCol = sheet.freezeCol || 0
  const paneCell = colRef(freezeCol) + (freezeRow + 1)
  const activePane = freezeCol ? (freezeRow ? 'bottomRight' : 'topRight') : 'bottomLeft'
  const pane =
    freezeRow || freezeCol
      ? `<pane${freezeCol ? ` xSplit="${freezeCol}"` : ''}${freezeRow ? ` ySplit="${freezeRow}"` : ''}` +
        ` topLeftCell="${paneCell}" activePane="${activePane}" state="frozen"/>`
      : ''
  const filter = sheet.autoFilter ? `<autoFilter ref="A${sheet.autoFilter}:${colRef(maxCols - 1)}${rows.length}"/>` : ''

  const merges = sheet.merges?.length
    ? `<mergeCells count="${sheet.merges.length}">` +
      sheet.merges.map((r) => `<mergeCell ref="${esc(r)}"/>`).join('') +
      '</mergeCells>'
    : ''

  // 조건부 서식 — 원가율처럼 「어디가 높은가」를 눈으로 훑게 한다. priority 는 시트 안에서 고유해야 한다.
  const cf = (sheet.condFormat || [])
    .map((c, i) => {
      const rule =
        c.kind === 'bar'
          ? `<cfRule type="dataBar" priority="${i + 1}"><dataBar><cfvo type="min"/><cfvo type="max"/>` +
            `<color rgb="FF9BC2E6"/></dataBar></cfRule>`
          : `<cfRule type="colorScale" priority="${i + 1}"><colorScale>` +
            '<cfvo type="min"/><cfvo type="percentile" val="50"/><cfvo type="max"/>' +
            (c.reverse
              ? '<color rgb="FFF8696B"/><color rgb="FFFFEB84"/><color rgb="FF63BE7B"/>'
              : '<color rgb="FF63BE7B"/><color rgb="FFFFEB84"/><color rgb="FFF8696B"/>') +
            '</colorScale></cfRule>'
      return `<conditionalFormatting sqref="${esc(c.ref)}">${rule}</conditionalFormatting>`
    })
    .join('')

  const tab = sheet.tabColor
    ? `<sheetPr><tabColor rgb="${String(sheet.tabColor).replace('#', '').padStart(8, 'F')}"/></sheetPr>`
    : ''

  // ⚠️ CT_Worksheet 는 요소 순서가 강제다: sheetPr → dimension → sheetViews → sheetFormatPr →
  //    cols → sheetData → autoFilter → mergeCells → conditionalFormatting. 어기면 엑셀이 못 연다.
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    tab +
    `<dimension ref="${dim}"/>` +
    `<sheetViews><sheetView showGridLines="${sheet.gridLines === false ? 0 : 1}" workbookViewId="0">${pane}</sheetView></sheetViews>` +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    `<cols>${cols.join('')}</cols>` +
    `<sheetData>${body}</sheetData>` +
    filter +
    merges +
    cf +
    '</worksheet>'
  )
}

const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="4">' +
  '<numFmt numFmtId="164" formatCode="#,##0"/>' +
  '<numFmt numFmtId="165" formatCode="#,##0.0"/>' +
  '<numFmt numFmtId="166" formatCode="0.0%"/>' +
  '<numFmt numFmtId="167" formatCode="#,##0.00"/>' +
  '</numFmts>' +
  '<fonts count="7">' +
  '<font><sz val="11"/><name val="맑은 고딕"/></font>' +
  '<font><b/><sz val="11"/><name val="맑은 고딕"/></font>' +
  '<font><sz val="11"/><color rgb="FF808080"/><name val="맑은 고딕"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="맑은 고딕"/></font>' +
  '<font><b/><sz val="14"/><color rgb="FF1F3864"/><name val="맑은 고딕"/></font>' +
  '<font><sz val="10"/><color rgb="FF7F7F7F"/><name val="맑은 고딕"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FF833C00"/><name val="맑은 고딕"/></font>' +
  '</fonts>' +
  '<fills count="7">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FF44546A"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFFCE4D6"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/><bgColor indexed="64"/></patternFill></fill>' +
  '</fills>' +
  '<borders count="3">' +
  '<border><left/><right/><top/><bottom/><diagonal/></border>' +
  '<border><left/><right/><top style="thin"><color rgb="FF8EA9DB"/></top><bottom/><diagonal/></border>' +
  '<border><left/><right/><top/><bottom style="medium"><color rgb="FF44546A"/></bottom><diagonal/></border>' +
  '</borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="20">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +                                        // 0 기본
  '<xf numFmtId="0" fontId="3" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
  '<alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +                                  // 1 헤더
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +                // 2 정수
  '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +                // 3 소수1
  '<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +                // 4 퍼센트
  '<xf numFmtId="164" fontId="0" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>' +  // 5 입력칸
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +                          // 6 굵게
  '<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +                // 7 소수2
  '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +                          // 8 설명
  '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1">' +
  '<alignment vertical="center"/></xf>' +                                                                   // 9 제목
  '<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1">' +
  '<alignment vertical="center"/></xf>' +                                                                   // 10 부제
  '<xf numFmtId="164" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>' + // 11 합계(정수)
  '<xf numFmtId="166" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>' + // 12 합계(%)
  '<xf numFmtId="0" fontId="1" fillId="6" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +            // 13 구역머리
  '<xf numFmtId="0" fontId="3" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
  '<alignment horizontal="right" vertical="center" wrapText="1"/></xf>' +                                   // 14 헤더(우측)
  '<xf numFmtId="164" fontId="6" fillId="5" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>' +   // 15 경고
  '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1">' +
  '<alignment vertical="top" wrapText="1"/></xf>' +                                                         // 16 설명(줄바꿈)
  '<xf numFmtId="0" fontId="0" fillId="4" borderId="0" xfId="0" applyFill="1"/>' +                          // 17 밴드
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1">' +
  '<alignment horizontal="center"/></xf>' +                                                                 // 18 가운데
  '<xf numFmtId="166" fontId="0" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>' +   // 19 입력칸(%)
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>'

// ── ZIP 직접 생성 ─────────────────────────────────────────────────────────────
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

function zip(files) {
  const locals = []
  const central = []
  let offset = 0
  for (const [name, body] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, 'utf8') // 항상 '/' 구분자 (files 키가 그렇게 돼 있다)
    const raw = Buffer.from(body, 'utf8')
    const deflated = zlib.deflateRawSync(raw, { level: 9 })
    const crc = crc32(raw)

    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0)
    lh.writeUInt16LE(20, 4)
    lh.writeUInt16LE(0x0800, 6) // UTF-8 파일명 플래그
    lh.writeUInt16LE(8, 8) // deflate
    lh.writeUInt32LE(0, 10) // mtime/mdate = 0 (재현 가능)
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
  return Buffer.concat([...locals, centralBuf, eocd])
}

/**
 * @param {string} outPath 저장 경로(.xlsx)
 * @param {Array<{name:string, rows:Array<Array<any>>, widths?:number[], freeze?:number, autoFilter?:number}>} sheets
 *        `autoFilter` 는 필터를 걸 머리글 행 번호(1-based). 없으면 안 건다.
 */
function writeWorkbook(outPath, sheets) {
  if (!sheets?.length) throw new Error('시트가 없습니다')
  const names = sheets.map((s, i) => (s.name || `Sheet${i + 1}`).slice(0, 31))

  const files = {
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
        )
        .join('') +
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
      '<sheets>' +
      names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
      '</sheets>' +
      // 수식을 값 캐시 없이 넣으므로 열 때 전체 재계산을 시킨다.
      '<calcPr calcId="0" fullCalcOnLoad="1"/>' +
      '</workbook>',
    'xl/_rels/workbook.xml.rels':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
        )
        .join('') +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      '</Relationships>',
    'xl/styles.xml': STYLES_XML,
  }
  sheets.forEach((s, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(s)
  })

  const abs = path.resolve(outPath)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, zip(files))
  return abs
}

module.exports = { writeWorkbook, S, colRef }
