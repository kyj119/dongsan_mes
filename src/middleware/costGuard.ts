/**
 * 비용 차단기 미들웨어 — 한도 초과 시 **반복되는 읽기만** 끊는다.
 *
 * 정본·설계 근거 = `src/services/costGuard.ts` 머리말. 여기서는 「무엇을 끊나」만 정의한다.
 *
 * 대상 판정은 두 갈래다.
 *   ① `X-Poll: 1` 헤더 — 클라이언트가 **자동 반복 호출**에만 붙인다(shell.js MES_POLL).
 *      같은 URL 이라도 사람이 화면을 열어 처음 부르는 요청에는 헤더가 없어 **통과**한다.
 *      ★이 구분이 핵심이다. 경로로만 막으면 화면 진입까지 같이 죽는다.
 *   ② 무거운 읽기 전용 집계 경로 — 리포트·자금계획. 한 번 호출에 수십만~수천만 행을 읽는 축이라
 *      차단 중에는 사람이 눌러도 막는다(대신 사유를 화면에 띄운다).
 *
 * 절대 막지 않는 것: 로그인·화면 진입·쓰기(POST/PUT/PATCH/DELETE)·에이전트(X-Agent-Key).
 *   차단기가 업무를 멈추면 그건 비용 사고를 업무 사고로 바꾼 것뿐이다.
 */

import { createMiddleware } from 'hono/factory'
import type { HonoEnv } from '../types/env'
import { getGuardState } from '../services/costGuard'

/** 차단 중 사람이 눌러도 막는 무거운 읽기 경로(prefix). 여기 추가는 신중히 — 업무가 멈춘다. */
const HEAVY_READ_PREFIXES = [
  '/api/reports/',
  '/api/cash-flow/schedule/',
  '/api/ai-analysis/',
  '/api/ai-insights/',
]

/**
 * 「이 요청이 차단 대상인가」 — **순수 함수**. 미들웨어 안에 두면 게이트가 못 잡는다
 * (CLAUDE.md §조용한 격하: 판정을 순수 모듈로 빼고 게이트가 그걸 센다).
 * 게이트 = `npm run test:cost-guard`.
 */
export function guardTarget(req: { method: string; path: string; poll: boolean; agent: boolean }):
  { target: boolean; kind: 'poll' | 'heavy' | null } {
  // 에이전트(무인 연동)는 대상 아님 — 끊으면 수집·출력 이벤트가 조용히 유실된다.
  if (req.agent) return { target: false, kind: null }
  // 쓰기는 대상 아님. 단 폴링이 POST 인 경우(알림 생성)는 자동 반복이라 대상이다.
  if (req.method !== 'GET' && !(req.method === 'POST' && req.poll)) return { target: false, kind: null }
  if (req.poll) return { target: true, kind: 'poll' }
  if (HEAVY_READ_PREFIXES.some((p) => req.path.startsWith(p))) return { target: true, kind: 'heavy' }
  return { target: false, kind: null }
}

export const costGuardMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  const { target, kind } = guardTarget({
    method: c.req.method,
    path: new URL(c.req.url).pathname,
    poll: c.req.header('X-Poll') === '1',
    agent: Boolean(c.req.header('X-Agent-Key')),
  })
  if (!target) return next()

  const state = await getGuardState(c.env.DB)
  if (!state.active) return next()
  const isPoll = kind === 'poll'

  return c.json(
    {
      success: false,
      cost_guard: true,
      until: state.until,
      reason: state.reason,
      error: `비용 보호가 작동 중입니다 — ${state.reason || 'Cloudflare 사용량 한도 초과'}. ${
        isPoll ? '자동 갱신을 잠시 멈춥니다.' : '무거운 집계 조회가 일시 제한됩니다.'
      }`,
    },
    503
  )
})
