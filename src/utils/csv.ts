// #372: CSV export silent truncation \uBC29\uC9C0 \u2014 \uCEA1 + \uC798\uB9BC \uC548\uB0B4 \uB2E8\uC77C \uC18C\uC2A4.
//   \uAC01 export\uB294 LIMIT (CSV_EXPORT_CAP+1)\uB85C \uC870\uD68C \uD6C4 \uCD08\uACFC \uC2DC generateCsv\uC758 footerNote\uB85C \uC548\uB0B4\uD589 \uCD94\uAC00.
export const CSV_EXPORT_CAP = 5000
export const CSV_TRUNCATION_NOTE = `\u203B \uACB0\uACFC\uAC00 ${CSV_EXPORT_CAP}\uAC74\uC744 \uCD08\uACFC\uD558\uC5EC \uC77C\uBD80(${CSV_EXPORT_CAP}\uAC74)\uB9CC \uB0B4\uBCF4\uB0C8\uC2B5\uB2C8\uB2E4. \uAE30\uAC04/\uD544\uD130\uB97C \uC881\uD600 \uB2E4\uC2DC \uBC1B\uC73C\uC138\uC694.`

export function generateCsv(
  headers: string[],
  rows: (string | number | null | undefined)[][],
  opts?: { footerNote?: string }
): string {
  const BOM = '\uFEFF'  // UTF-8 BOM for Excel compatibility
  const headerLine = headers.map(escapeCsvField).join(',')
  const dataLines = rows.map(row => row.map(escapeCsvField).join(','))
  const lines = [headerLine, ...dataLines]
  if (opts?.footerNote) lines.push(escapeCsvField(opts.footerNote))
  return BOM + lines.join('\r\n')
}

export function csvResponse(c: any, filename: string, csvContent: string) {
  return new Response(csvContent, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    }
  })
}

/**
 * 스트리밍 CSV 응답 — 대량 데이터 시 메모리 2배 사용 방지
 * rows를 100건씩 청크로 인코딩하여 ReadableStream으로 전송
 */
export function csvStreamResponse(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const encoder = new TextEncoder()
  const CHUNK_SIZE = 100

  const stream = new ReadableStream({
    start(controller) {
      // BOM + 헤더
      controller.enqueue(encoder.encode('\uFEFF' + headers.map(escapeCsvField).join(',') + '\r\n'))

      // 100건씩 청크 인코딩
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const end = Math.min(i + CHUNK_SIZE, rows.length)
        let chunk = ''
        for (let j = i; j < end; j++) {
          chunk += rows[j].map(escapeCsvField).join(',') + '\r\n'
        }
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Transfer-Encoding': 'chunked',
    }
  })
}

/**
 * CSV 한 필드 이스케이프 + #367 formula(수식) injection 가드 — 전 CSV 내보내기의 단일 소스.
 * - 선행 =,+,-,@,탭,CR 인 '비숫자' 문자열 앞에 ' 프리픽스 → Excel/스프레드시트의 수식 실행
 *   (=HYPERLINK/WEBSERVICE 데이터유출·DDE) 차단.
 * - 음수/콤마 포함 숫자(-1000, -1,234)는 Number로 파싱되어 보존 → 금융 CSV 텍스트화 회귀 방지.
 */
export function escapeCsvField(val: any): string {
  if (val == null) return ''
  let str = String(val)
  if (typeof val !== 'number' && /^[=+\-@\t\r]/.test(str) && isNaN(Number(str.replace(/,/g, '')))) {
    str = "'" + str
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

/**
 * #504: 클라이언트 CSV 셀 이스케이프 SSOT. layout.ts가 window.dsCsvCell로 1회 주입.
 * escapeCsvField(서버)와 동일 규칙 — #367 수식(=+-@) 인젝션 가드 + 콤마/따옴표/개행 이스케이프.
 * 기존 pmCsvCell/tiCsvCell/prCsvCell가 각자 콤마·따옴표만 처리하고 수식 가드를 누락하던 것을 통합.
 */
export const CSV_UTIL_JS = `
window.dsCsvCell = function(val) {
  if (val == null) return '';
  var str = String(val);
  if (typeof val !== 'number' && /^[=+\\-@\\t\\r]/.test(str) && isNaN(Number(str.replace(/,/g, '')))) { str = "'" + str; }
  if (str.indexOf(',') >= 0 || str.indexOf('"') >= 0 || str.indexOf('\\n') >= 0) { return '"' + str.replace(/"/g, '""') + '"'; }
  return str;
};
`
