/**
 * Cloudflare Workers 네이티브 FTP 업로드 (cloudflare:sockets raw TCP)
 *
 * 바로빌 팩스는 FTP 업로드 후 SendFaxFromFTP로 발송 → Workers에서 직접 FTP STOR.
 * 패시브 모드만 사용(Workers는 listen 불가). 평문 FTP(바로빌은 FTPS 아님).
 * 운영: ftp.barobill.co.kr:9030 / 테스트: testftp.barobill.co.kr:9031
 * 계정 = 바로빌 회원 아이디/비밀번호. root 경로에 업로드.
 */
import { connect } from 'cloudflare:sockets'

export interface FtpConfig {
  host: string
  port: number
  user: string
  pass: string
}

const RESP_TIMEOUT_MS = 20000

function parseResponse(buf: string): { code: number; text: string; rest: string } | null {
  // FTP 응답: 여러 줄 가능. 마지막 줄이 "NNN <text>"(코드 뒤 공백)면 완료.
  // 중간 줄은 "NNN-..." 또는 임의 텍스트. CRLF 기준 분리. 잔여(rest)는 보존(파이프라인 안전).
  const lines = buf.split('\r\n')
  for (let i = 0; i < lines.length - 1; i++) {
    const m = lines[i].match(/^(\d{3}) /)
    if (m) {
      return {
        code: parseInt(m[1], 10),
        text: lines.slice(0, i + 1).join('\r\n'),
        rest: lines.slice(i + 1).join('\r\n'),
      }
    }
  }
  return null
}

/**
 * 단일 파일을 FTP root 경로에 STOR(바이너리).
 * 실패 시 throw — 호출부에서 발송 실패로 처리.
 */
// 바로빌 FTP는 동시 1세션 → 직전 발송 세션이 잠깐 남아있으면 다음 로그인이 530날 수 있음.
// 530/데이터채널 일시오류는 5초 백오프로 1회만 재시도(과한 재시도는 보안잠금을 키우므로 금지).
export async function ftpStor(cfg: FtpConfig, remoteName: string, data: Uint8Array): Promise<void> {
  const MAX_ATTEMPTS = 2
  let lastErr: any
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await ftpStorOnce(cfg, remoteName, data)
      return
    } catch (e: any) {
      lastErr = e
      const msg = String((e && e.message) || e)
      const retryable = /(^|[^0-9])(530|421|425|426)([^0-9]|$)/.test(msg) || /타임아웃|timeout/i.test(msg)
      if (!retryable || attempt === MAX_ATTEMPTS) throw e
      await new Promise((r) => setTimeout(r, 5000))
    }
  }
  throw lastErr
}

async function ftpStorOnce(cfg: FtpConfig, remoteName: string, data: Uint8Array): Promise<void> {
  const enc = new TextEncoder()
  const dec = new TextDecoder()

  const control = connect({ hostname: cfg.host, port: cfg.port }, { allowHalfOpen: false })
  const writer = control.writable.getWriter()
  const reader = control.readable.getReader()
  let buf = ''

  async function readResponse(): Promise<{ code: number; text: string }> {
    while (true) {
      const parsed = parseResponse(buf)
      if (parsed) {
        buf = parsed.rest
        return { code: parsed.code, text: parsed.text }
      }
      const readPromise = reader.read()
      const timer = new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error('FTP 응답 타임아웃')), RESP_TIMEOUT_MS))
      const { value, done } = await Promise.race([readPromise, timer]) as ReadableStreamReadResult<Uint8Array>
      if (done) throw new Error('FTP 제어 연결이 응답 없이 종료됨')
      buf += dec.decode(value, { stream: true })
    }
  }

  async function cmd(command: string, expect: number[]): Promise<{ code: number; text: string }> {
    await writer.write(enc.encode(command + '\r\n'))
    const r = await readResponse()
    if (!expect.includes(r.code)) {
      const verb = command.split(' ')[0]
      throw new Error(`FTP ${verb} 실패(${r.code}): ${r.text.trim()}`)
    }
    return r
  }

  try {
    const greet = await readResponse()
    if (greet.code !== 220) throw new Error(`FTP 접속 실패: ${greet.text.trim()}`)

    await cmd(`USER ${cfg.user}`, [331, 230])
    await cmd(`PASS ${cfg.pass}`, [230, 202])
    await cmd('TYPE I', [200])

    const pasv = await cmd('PASV', [227])
    const m = pasv.text.match(/\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/)
    if (!m) throw new Error(`PASV 파싱 실패: ${pasv.text.trim()}`)
    const dataPort = parseInt(m[5], 10) * 256 + parseInt(m[6], 10)

    // 데이터 채널: PASV가 사설/NAT IP를 줄 수 있어 제어 호스트명 + PASV 포트 사용(단일 호스트 안전).
    const dataSocket = connect({ hostname: cfg.host, port: dataPort }, { allowHalfOpen: false })
    const dataWriter = dataSocket.writable.getWriter()

    try {
      await cmd(`STOR ${remoteName}`, [150, 125])
      await dataWriter.write(data)
      await dataWriter.close()
    } finally {
      try { dataWriter.releaseLock() } catch { /* already released */ }
      try { await dataSocket.close() } catch { /* ignore */ }
    }

    const done = await readResponse()
    if (done.code !== 226 && done.code !== 250) {
      throw new Error(`STOR 완료 응답 이상(${done.code}): ${done.text.trim()}`)
    }

  } finally {
    // 세션 깔끔히 해제(QUIT) — 성공·실패 모든 경로. 미QUIT 시 바로빌이 세션을 잠깐 물고 있어 다음 발송이 530.
    try { await writer.write(enc.encode('QUIT\r\n')) } catch { /* ignore */ }
    try { reader.releaseLock() } catch { /* ignore */ }
    try { await writer.close() } catch { /* ignore */ }
    try { await control.close() } catch { /* ignore */ }
  }
}

/**
 * FTP 로그인만 점검(진단용) — connect → USER → PASS → QUIT. 파일 업로드/발송 없음.
 * 자격증명·대소문자·접속 가능 여부 확인에 사용. throw 없이 결과 객체 반환.
 */
export async function ftpLoginCheck(cfg: FtpConfig): Promise<{ ok: boolean; stage: string; code: number; message: string }> {
  const enc = new TextEncoder()
  const dec = new TextDecoder()
  let control: any
  try {
    control = connect({ hostname: cfg.host, port: cfg.port }, { allowHalfOpen: false })
  } catch (e: any) {
    return { ok: false, stage: 'connect', code: 0, message: e?.message || 'connect 실패' }
  }
  const writer = control.writable.getWriter()
  const reader = control.readable.getReader()
  let buf = ''
  async function readResponse(): Promise<{ code: number; text: string }> {
    while (true) {
      const p = parseResponse(buf)
      if (p) { buf = p.rest; return { code: p.code, text: p.text } }
      const rd = reader.read()
      const timer = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('FTP 응답 타임아웃')), RESP_TIMEOUT_MS))
      const { value, done } = await Promise.race([rd, timer]) as ReadableStreamReadResult<Uint8Array>
      if (done) throw new Error('FTP 제어 연결 종료')
      buf += dec.decode(value, { stream: true })
    }
  }
  async function send(command: string): Promise<{ code: number; text: string }> {
    await writer.write(enc.encode(command + '\r\n'))
    return readResponse()
  }
  try {
    const g = await readResponse()
    if (g.code !== 220) return { ok: false, stage: 'greeting', code: g.code, message: g.text.trim() }
    const u = await send(`USER ${cfg.user}`)
    if (![331, 230].includes(u.code)) return { ok: false, stage: 'USER', code: u.code, message: u.text.trim() }
    const p = await send(`PASS ${cfg.pass}`)
    if (![230, 202].includes(p.code)) return { ok: false, stage: 'PASS', code: p.code, message: p.text.trim() }
    try { await send('QUIT') } catch { /* ignore */ }
    return { ok: true, stage: 'login', code: p.code, message: '로그인 성공' }
  } catch (e: any) {
    return { ok: false, stage: 'error', code: 0, message: e?.message || 'FTP 점검 실패' }
  } finally {
    try { reader.releaseLock() } catch { /* ignore */ }
    try { await writer.close() } catch { /* ignore */ }
    try { await control.close() } catch { /* ignore */ }
  }
}
