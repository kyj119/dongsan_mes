import { Hono } from 'hono'
import { sign, verify } from 'hono/jwt'
import type { HonoEnv } from '../types/env'
import { verifyPassword, hashPassword } from '../utils/crypto'
import { authMiddleware, requireRole } from '../middleware/auth'

const auth = new Hono<HonoEnv>()

// 로그인 API
auth.post('/login', async (c) => {
  try {
    const { username, password } = await c.req.json()

    if (!username || !password) {
      return c.json({ success: false, message: 'Username and password are required' }, 400)
    }

    // 사용자 조회 (users 테이블에서)
    const user = await c.env.DB.prepare(
      'SELECT * FROM users WHERE username = ? AND is_active = 1'
    ).bind(username).first()

    if (!user) {
      return c.json({ success: false, message: 'Invalid username or password' }, 401)
    }

    // 비밀번호 검증 (평문 레거시 + PBKDF2 해시 모두 지원)
    const passwordValid = await verifyPassword(password, user.password_hash as string)
    if (!passwordValid) {
      return c.json({ success: false, message: 'Invalid username or password' }, 401)
    }

    // 레거시 평문 비밀번호 → PBKDF2 해시로 자동 마이그레이션
    if (!(user.password_hash as string).startsWith('pbkdf2:')) {
      const hashedPassword = await hashPassword(password)
      await c.env.DB.prepare(
        'UPDATE users SET password_hash = ? WHERE id = ?'
      ).bind(hashedPassword, user.id).run()
    }

    // 기본 법인 ID (default_entity_id 컬럼이 있으면 사용, 없으면 1)
    const defaultEntityId = (user as any).default_entity_id || 1

    // JWT 토큰 생성
    const jwtSecret = c.env.JWT_SECRET
    const payload = {
      id: user.id,
      username: user.username,
      role: user.role,
      entityId: defaultEntityId,
      exp: Math.floor(Date.now() / 1000) + (60 * 60 * 8), // 8시간 유효
    }

    const token = await sign(payload, jwtSecret, 'HS256')

    // 마지막 로그인 시간 업데이트
    await c.env.DB.prepare(
      'UPDATE users SET last_login_at = datetime("now") WHERE id = ?'
    ).bind(user.id).run()

    return c.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
          email: user.email,
          entityId: defaultEntityId
        }
      },
      message: 'Login successful'
    })
  } catch (error) {
    console.error('Login error:', error)
    return c.json({ success: false, message: 'Login failed' }, 500)
  }
})

// 현재 사용자 정보 조회 (토큰 검증)
auth.get('/me', async (c) => {
  try {
    // Authorization 헤더에서 토큰 추출
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ success: false, message: 'Unauthorized' }, 401)
    }

    const token = authHeader.substring(7)

    // JWT 토큰 검증 및 디코딩
    const jwtSecret = c.env.JWT_SECRET
    const payload = await verify(token, jwtSecret, 'HS256')

    // 사용자 정보 조회
    const user = await c.env.DB.prepare(
      'SELECT id, username, name, role, email, created_at, last_login_at FROM users WHERE id = ? AND is_active = 1'
    ).bind(payload.id).first()

    if (!user) {
      return c.json({ success: false, message: 'User not found' }, 404)
    }

    return c.json({
      success: true,
      data: user
    })
  } catch (error) {
    console.error('Token verification error:', error)
    return c.json({ success: false, message: 'Invalid token' }, 401)
  }
})

// 토큰 갱신 (만료 2시간 이내이면 새 토큰 발급)
auth.post('/refresh', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ success: false, message: 'No token' }, 401)
    }

    const token = authHeader.substring(7)
    const jwtSecret = c.env.JWT_SECRET
    const payload = await verify(token, jwtSecret, 'HS256')

    const now = Math.floor(Date.now() / 1000)
    const timeLeft = (payload.exp as number) - now

    // 아직 2시간 이상 남았으면 갱신 불필요
    if (timeLeft > 7200) {
      return c.json({ success: true, refreshed: false, message: 'Token still valid' })
    }

    // 새 토큰 발급 (8시간)
    const newPayload = {
      id: payload.id,
      username: payload.username,
      role: payload.role,
      entityId: payload.entityId || 1,
      exp: now + (60 * 60 * 8),
    }
    const newToken = await sign(newPayload, jwtSecret, 'HS256')

    return c.json({ success: true, refreshed: true, data: { token: newToken } })
  } catch (error) {
    return c.json({ success: false, message: 'Invalid token' }, 401)
  }
})

// 활성 법인 목록 조회
auth.get('/entities', authMiddleware, async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT id, name, short_name FROM entities WHERE is_active = 1 ORDER BY sort_order'
    ).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('entities list error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 법인 전환 (새 JWT 발급)
auth.post('/switch-entity', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const { entity_id } = await c.req.json()

    if (!entity_id && entity_id !== 0) {
      return c.json({ success: false, error: 'entity_id 필수' }, 400)
    }

    // entity_id=0: ADMIN 전용 "전체" 모드
    if (entity_id === 0) {
      if (user.role !== 'ADMIN') {
        return c.json({ success: false, error: '관리자만 전체 모드 사용 가능' }, 403)
      }
    } else {
      // 법인 존재 확인
      const entity = await c.env.DB.prepare(
        'SELECT id FROM entities WHERE id = ? AND is_active = 1'
      ).bind(entity_id).first()
      if (!entity) {
        return c.json({ success: false, error: '유효하지 않은 법인' }, 400)
      }

      // 일반 직원은 본인 소속 법인만
      if (!['ADMIN', 'MANAGER'].includes(user.role)) {
        const userRow = await c.env.DB.prepare(
          'SELECT default_entity_id FROM users WHERE id = ?'
        ).bind(user.id).first() as any
        if (userRow?.default_entity_id && userRow.default_entity_id !== entity_id) {
          return c.json({ success: false, error: '권한 없음' }, 403)
        }
      }
    }

    // 새 JWT 발급
    const newPayload = {
      id: user.id,
      username: user.username,
      role: user.role,
      entityId: entity_id,
      exp: Math.floor(Date.now() / 1000) + (60 * 60 * 8),
    }
    const token = await sign(newPayload, c.env.JWT_SECRET, 'HS256')

    return c.json({ success: true, data: { token, entityId: entity_id } })
  } catch (error) {
    console.error('switch-entity error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 로그아웃 (클라이언트에서 토큰 삭제)
auth.post('/logout', async (c) => {
  // 실제로는 토큰 블랙리스트에 추가하거나, 
  // 클라이언트에서 토큰을 삭제하도록 안내
  return c.json({
    success: true,
    message: 'Logged out successfully'
  })
})

export default auth
