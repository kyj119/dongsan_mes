import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { validateUpload } from '../utils/uploadValidation'

const filesRouter = new Hono<HonoEnv>()
filesRouter.use('/*', authMiddleware)

// ============================================================================
// GET /api/files/* — R2 파일 서빙 (#365: ADMIN 전용 — 범용 프록시가 전용 엔드포인트의
//   entity/역할 격리를 우회하던 IDOR 완화. frontend 미사용, 외부 폴링은 ADMIN 토큰)
// ============================================================================
filesRouter.get('/*', requireRole('ADMIN'), async (c) => {
  try {
    const key = c.req.path.replace('/api/files/', '')
    if (!key) return c.json({ success: false, error: 'File key required' }, 400)
    if (key.includes('..') || key.includes('\\')) return c.json({ success: false, error: 'Invalid file path' }, 400)

    const object = await c.env.R2_BUCKET.get(key)
    if (!object) return c.json({ success: false, error: 'File not found' }, 404)

    const headers = new Headers()
    headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream')
    headers.set('Cache-Control', 'private, max-age=3600')
    if (object.httpMetadata?.contentDisposition) {
      headers.set('Content-Disposition', object.httpMetadata.contentDisposition)
    }

    return new Response(object.body, { headers })
  } catch (error) {
    console.error('File serve error:', error)
    return c.json({ success: false, error: 'File serve error' }, 500)
  }
})

// ============================================================================
// POST /api/files/upload — R2 파일 업로드 (소스 파일용)
// ============================================================================
filesRouter.post('/upload', requireRole('ADMIN', 'MANAGER', 'DESIGNER'), async (c) => {
  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File | null
    const folder = formData.get('folder') as string || 'sources'
    const analysisId = formData.get('analysis_id') as string

    if (!file) return c.json({ success: false, error: 'No file provided' }, 400)

    // #357: 크기·확장자 검증 (소스/디자인 파일 — 50MB, 이미지/PDF/디자인 포맷)
    const v = validateUpload(file, {
      maxBytes: 50 * 1024 * 1024,
      allowedMimePrefixes: ['image/', 'application/pdf', 'application/postscript', 'application/octet-stream'],
      allowedExts: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'pdf', 'ai', 'eps', 'psd', 'tif', 'tiff'],
    })
    if (!v.ok) return c.json({ success: false, error: v.error }, 400)

    // R2 키 구성요소 sanitize (path traversal / 키 인젝션 방어, A-013 패턴)
    const safeName = (file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200)
    const safeFolder = (folder || 'sources').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
    const safeAnalysisId = analysisId ? analysisId.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) : ''

    // R2 키 생성: sources/{analysis_id}/{filename}
    const key = safeAnalysisId
      ? `${safeFolder}/${safeAnalysisId}/${safeName}`
      : `${safeFolder}/${Date.now()}_${safeName}`

    // R2에 업로드
    await c.env.R2_BUCKET.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type || 'application/octet-stream',
        contentDisposition: `inline; filename="${encodeURIComponent(file.name)}"`,
      },
      customMetadata: {
        uploadedBy: String((c.get('user'))?.id || 0),
        uploadedAt: new Date().toISOString(),
      },
    })

    return c.json({
      success: true,
      data: {
        key,
        url: `/api/files/${key}`,
        size: file.size,
        name: file.name,
      }
    })
  } catch (error) {
    console.error('File upload error:', error)
    return c.json({ success: false, error: 'Upload failed' }, 500)
  }
})

// ============================================================================
// DELETE /api/files/* — R2 파일 삭제
// ============================================================================
filesRouter.delete('/*', requireRole('ADMIN'), async (c) => {
  try {
    const key = c.req.path.replace('/api/files/', '')
    if (!key) return c.json({ success: false, error: 'File key required' }, 400)

    await c.env.R2_BUCKET.delete(key)
    return c.json({ success: true, message: 'File deleted' })
  } catch (error) {
    return c.json({ success: false, error: 'Delete failed' }, 500)
  }
})

export default filesRouter
