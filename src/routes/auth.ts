import { Hono } from 'hono'
import { sign, verify } from 'hono/jwt'
import type { HonoEnv } from '../types/env'
import { verifyPassword, hashPassword } from '../utils/crypto'
import { authMiddleware, toAuthUser } from '../middleware/auth'

const auth = new Hono<HonoEnv>()

// 로그인 API — 브루트포스 방지 레이트리밋은 index.tsx(`/api/auth/login`, 분당 5회) 한 곳에서만 건다.
//   여기에 하나 더 두면 같은 카운터(ip:pathname)를 요청당 두 번 올려 실효 한도가 3회로 줄었다 (2026-09-03).
auth.post('/login', async (c) => {
  try {
    const { username, password } = await c.req.json()

    if (!username || !password) {
      return c.json({ success: false, message: 'Username and password are required' }, 400)
    }

    // 사용자 조회 (users 테이블에서)
    const user = await c.env.DB.prepare(
      // job_role(확장 역할, 0453) 우선 → JWT.role 로 발급. 하위 권한/메뉴는 role 그대로 사용.
      'SELECT id, username, password_hash, name, email, COALESCE(job_role, role) AS role, default_entity_id, is_coordinator FROM users WHERE username = ? AND is_active = 1'
    ).bind(username).first()

    if (!user) {
      return c.json({ success: false, message: '아이디 또는 비밀번호가 올바르지 않습니다' }, 401)
    }

    // 비밀번호 검증 (평문 레거시 + PBKDF2 해시 모두 지원)
    const passwordValid = await verifyPassword(password, user.password_hash as string)
    if (!passwordValid) {
      return c.json({ success: false, message: '아이디 또는 비밀번호가 올바르지 않습니다' }, 401)
    }

    // 레거시 평문 비밀번호 → PBKDF2 해시로 자동 마이그레이션
    if (!(user.password_hash as string).startsWith('pbkdf2:')) {
      const hashedPassword = await hashPassword(password)
      await c.env.DB.prepare(
        'UPDATE users SET password_hash = ? WHERE id = ?'
      ).bind(hashedPassword, user.id).run()
    }

    // 기본 법인 ID (default_entity_id 컬럼이 있으면 사용, 없으면 1)
    const defaultEntityId = (user as Record<string, unknown>).default_entity_id as number || 1

    // JWT 토큰 생성
    const jwtSecret = c.env.JWT_SECRET
    const payload = {
      id: user.id,
      username: user.username,
      role: user.role,
      entityId: defaultEntityId,
      is_coordinator: Number((user as Record<string, unknown>).is_coordinator) ? 1 : 0,
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
    return c.json({ success: false, message: '로그인 처리 중 오류가 발생했습니다. 잠시 후 다시 시도하세요.' }, 500)
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
    const claims = toAuthUser(await verify(token, jwtSecret, 'HS256'))
    if (!claims) {
      return c.json({ success: false, message: 'Invalid token' }, 401)
    }

    // 사용자 정보 조회
    const user = await c.env.DB.prepare(
      'SELECT id, username, name, COALESCE(job_role, role) AS role, email, created_at, last_login_at FROM users WHERE id = ? AND is_active = 1'
    ).bind(claims.id).first()

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
//   제시된 클레임을 그대로 재서명하지 않는다 (2026-09-03): users 를 다시 읽어 비활성·삭제 계정은 거부하고,
//   role·is_coordinator 는 현재 DB 값으로 갱신한다. 포털·셀프 토큰은 toAuthUser 에서 걸러진다.
auth.post('/refresh', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ success: false, message: 'No token' }, 401)
    }

    const token = authHeader.substring(7)
    const jwtSecret = c.env.JWT_SECRET
    const payload = await verify(token, jwtSecret, 'HS256')
    const claims = toAuthUser(payload)
    if (!claims) {
      return c.json({ success: false, message: 'Invalid token' }, 401)
    }

    const now = Math.floor(Date.now() / 1000)
    const timeLeft = (payload.exp as number) - now

    // 아직 2시간 이상 남았으면 갱신 불필요
    if (timeLeft > 7200) {
      return c.json({ success: true, refreshed: false, message: 'Token still valid' })
    }

    const row = await c.env.DB.prepare(
      'SELECT id, username, COALESCE(job_role, role) AS role, default_entity_id, is_coordinator FROM users WHERE id = ? AND is_active = 1'
    ).bind(claims.id).first<{ id: number; username: string; role: string; default_entity_id: number | null; is_coordinator: number | null }>()
    if (!row) {
      return c.json({ success: false, message: '계정이 비활성화되었거나 존재하지 않습니다' }, 401)
    }

    // 법인 컨텍스트: 제시된 entityId 를 유지하되(0 = ADMIN 전체 모드, 예전 `|| 1` 은 0 을 1 로 바꿔 버렸다)
    //   switch-entity 와 같은 정책으로 — ADMIN 은 그대로, MANAGER 는 0 만 불가, 그 외는 소속 법인으로 되돌린다.
    const homeEntity = row.default_entity_id || 1
    const presented = claims.entityId != null ? claims.entityId : homeEntity
    let entityId: number
    if (row.role === 'ADMIN') entityId = presented
    else if (row.role === 'MANAGER') entityId = presented === 0 ? homeEntity : presented
    else entityId = homeEntity

    // 새 토큰 발급 (8시간)
    const newPayload = {
      id: row.id,
      username: row.username,
      role: row.role,
      entityId,
      is_coordinator: Number(row.is_coordinator) ? 1 : 0,
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
    const body = await c.req.json().catch(() => ({})) as { entity_id?: unknown }
    const raw = body.entity_id

    if (raw === undefined || raw === null || raw === '') {
      return c.json({ success: false, error: 'entity_id 필수' }, 400)
    }
    const entity_id = Number(raw)
    if (!Number.isInteger(entity_id) || entity_id < 0) {
      return c.json({ success: false, error: '유효하지 않은 법인' }, 400)
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

      // 일반 직원은 본인 소속 법인만. 소속이 비어 있으면(NULL/0) 전환 자체를 막는다 —
      //   예전 `default_entity_id &&` 가드는 NULL 이면 검사를 건너뛰어 임의 법인 토큰을 내줬다 (2026-09-03).
      if (!['ADMIN', 'MANAGER'].includes(user.role)) {
        const userRow = await c.env.DB.prepare(
          'SELECT default_entity_id FROM users WHERE id = ? AND is_active = 1'
        ).bind(user.id).first<{ default_entity_id: number | null }>()
        const home = Number(userRow?.default_entity_id) || 0
        if (!home) {
          return c.json({ success: false, error: '소속 법인이 지정되지 않은 계정은 법인을 전환할 수 없습니다. 관리자에게 문의하세요.' }, 403)
        }
        if (home !== entity_id) {
          return c.json({ success: false, error: '본인 소속 법인으로만 전환할 수 있습니다' }, 403)
        }
      }
    }

    // 새 JWT 발급
    const newPayload = {
      id: user.id,
      username: user.username,
      role: user.role,
      entityId: entity_id,
      is_coordinator: user.is_coordinator ? 1 : 0,
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
