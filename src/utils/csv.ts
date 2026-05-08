export function generateCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const BOM = '\uFEFF'  // UTF-8 BOM for Excel compatibility
  const escape = (val: any) => {
    if (val == null) return ''
    const str = String(val)
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"'
    }
    return str
  }
  const headerLine = headers.map(escape).join(',')
  const dataLines = rows.map(row => row.map(escape).join(','))
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

function escapeCsvField(val: any): string {
  if (val == null) return ''
  const str = String(val)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}
