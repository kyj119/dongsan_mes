import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'

const webhooksRouter = new Hono<HonoEnv>()

// 바로빌은 자체 콜백 메커니즘 사용 — 별도 webhook 불필요

export default webhooksRouter
