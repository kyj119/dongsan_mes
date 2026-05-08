import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'

const filesRouter = new Hono<HonoEnv>()
filesRouter.use('/*', authMiddleware)

// ============================================================================
// GET /api/files/* — R2 파일 서빙 (인증 필수, Workers 프록시)
// ============================================================================
filesRouter.get('/*', async (c) => {
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

    // R2 키 생성: sources/{analysis_id}/{filename}
    const key = analysisId
      ? `${folder}/${analysisId}/${file.name}`
      : `${folder}/${Date.now()}_${file.name}`

    // R2에 업로드
    await c.env.R2_BUCKET.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type || 'application/octet-stream',
        contentDisposition: `inline; filename="${encodeURIComponent(file.name)}"`,
      },
      customMetadata: {
        uploadedBy: String((c.get('user') as any)?.id || 0),
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
