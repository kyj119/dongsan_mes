// 파일 업로드 검증 헬퍼 (#357)
// R2 업로드 엔드포인트에서 크기 상한·MIME 화이트리스트·확장자 화이트리스트를 일괄 적용.

export interface UploadValidationOptions {
  /** 최대 바이트 (기본 10MB) */
  maxBytes?: number
  /** 허용 MIME 접두 또는 정확값 목록 (예: 'image/', 'application/pdf') */
  allowedMimePrefixes?: string[]
  /** 허용 확장자(소문자, 점 없음) */
  allowedExts?: string[]
}

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024 // 10MB
const DEFAULT_MIME_PREFIXES = ['image/', 'application/pdf']
const DEFAULT_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf']

export interface UploadValidationResult {
  ok: boolean
  error?: string
  /** 검증·정규화된 안전한 확장자 (점 없음, 소문자) */
  ext: string
}

/**
 * 업로드 파일을 검증한다. 실패 시 ok=false + 한국어 error 메시지.
 * 성공 시 화이트리스트를 통과한 정규화된 ext 반환.
 */
export function validateUpload(
  file: File,
  opts: UploadValidationOptions = {}
): UploadValidationResult {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES
  const mimePrefixes = opts.allowedMimePrefixes ?? DEFAULT_MIME_PREFIXES
  const allowedExts = opts.allowedExts ?? DEFAULT_EXTS

  // 1. 크기 상한
  if (file.size != null && file.size > maxBytes) {
    return { ok: false, error: `파일이 너무 큽니다 (최대 ${Math.round(maxBytes / 1024 / 1024)}MB)`, ext: 'bin' }
  }
  if (file.size === 0) {
    return { ok: false, error: '빈 파일은 업로드할 수 없습니다.', ext: 'bin' }
  }

  // 2. MIME 화이트리스트
  const mime = (file.type || '').toLowerCase()
  const mimeOk = mimePrefixes.some((p) => (p.endsWith('/') ? mime.startsWith(p) : mime === p))

  // 3. 확장자 화이트리스트 (sanitize 후)
  const rawExt = (file.name || '').split('.').pop() || ''
  const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '')
  const extOk = allowedExts.includes(ext)

  // MIME가 비어 있는 클라이언트도 있으므로 ext가 통과하면 허용, 둘 다 실패면 거부
  if (!extOk) {
    return { ok: false, error: `허용되지 않는 파일 형식입니다 (.${ext || '?'}). 허용: ${allowedExts.join(', ')}`, ext: 'bin' }
  }
  if (mime && !mimeOk) {
    return { ok: false, error: `허용되지 않는 콘텐츠 유형입니다 (${mime}).`, ext }
  }

  return { ok: true, ext }
}
