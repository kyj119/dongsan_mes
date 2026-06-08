export function generateCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const BOM = '\uFEFF'  // UTF-8 BOM for Excel compatibility
  const headerLine = headers.map(escapeCsvField).join(',')
  const dataLines = rows.map(row => row.map(escapeCsvField).join(','))
  return BOM + [headerLine, ...dataLines].join('\r\n')
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
