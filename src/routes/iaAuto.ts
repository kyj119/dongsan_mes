import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'

const iaAuto = new Hono<HonoEnv>()

iaAuto.use('/*', authMiddleware, requireRole('ADMIN'))

// 규칙
const SCALE_RULES: Record<string, number> = {
  '현수막': 5, '게시대': 5, '게릴라': 5, '솔벤현수막': 5,
  '패트': 1, '솔벤시트': 1, '합성지': 1, '포맥스': 1,
  'UV': 1, '클리어필름': 1, '간판': 1,
}

const MARGIN_RULES: Record<string, { w: number; h: number }> = {
  '미싱': { w: 83, h: 0 },
  '사방접어미싱': { w: 61, h: 61 },
  '접어미싱': { w: 34, h: 0 },
  '봉미싱': { w: 0, h: 55 },
  '밴드미싱': { w: 2, h: 0 },
  '사방미싱': { w: 2, h: 0 },
  '열재단': { w: 14, h: 0 },
  '재단만': { w: 0, h: 0 },
  '사방큰펀칭': { w: 0, h: 0 },
  '양옆접어미싱+사방큰펀칭': { w: 34, h: 0 },
  '열재단+사방큰펀칭': { w: 14, h: 0 },
}

function getScale(product: string, widthCm: number): number {
  const base = SCALE_RULES[product] ?? 5
  if (['현수막', '게시대', '솔벤현수막', '게릴라'].includes(product)) {
    if (widthCm > 300) return 5
    if (widthCm > 150) return 2
    return base
  }
  return base
}

function getMargins(finishing: string): { w: number; h: number } {
  if (!finishing) return { w: 0, h: 0 }
  if (MARGIN_RULES[finishing]) return MARGIN_RULES[finishing]
  const keys = Object.keys(MARGIN_RULES).sort((a, b) => b.length - a.length)
  for (const k of keys) {
    if (finishing.includes(k)) return MARGIN_RULES[k]
  }
  return { w: 0, h: 0 }
}

// POST /api/ia-auto/process — ia_params.json 생성 (클라이언트가 결과 확인)
iaAuto.post('/process', async (c) => {
  try {
    const body = await c.req.json()
    const { source, product, width, height, finishing, clipBounds } = body

    if (!source) return c.json({ success: false, error: '원본 파일 경로 필요' }, 400)
    if (!width || !height) return c.json({ success: false, error: '규격 필요' }, 400)

    const prod = product || '현수막'
    const scale = getScale(prod, width)
    const margins = getMargins(finishing || '')

    const marginLcm = margins.w / 10.0 / scale
    const marginRcm = margins.w / 10.0 / scale
    const marginTcm = margins.h > 0 ? margins.h / 10.0 / scale : 0
    const marginBcm = margins.h > 0 ? margins.h / 10.0 / scale : 0

    const timestamp = Date.now()
    const outputDir = 'Z:\\Designs\\IllustratorAutomat\\_auto_output'
    const srcBase = source.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || 'output'
    const epsOutput = `${outputDir}\\${srcBase}_auto_${timestamp}.eps`
    const pngOutput = `${outputDir}\\${srcBase}_auto_${timestamp}.png`

    // ProcessOrderItem.jsx용 ia_params.json 구조 반환
    const iaParams: Record<string, any> = {
      mode: 'process',
      source,
      output: outputDir,
      epsOutput,
      pngOutput,
      marginL: marginLcm,
      marginR: marginRcm,
      marginT: marginTcm,
      marginB: marginBcm,
      thumbSize: 300,
      scaleFactor: scale,
    }

    if (clipBounds) {
      iaParams.clipBounds = clipBounds
    }

    // test-watch 잡 이름
    const jobName = `auto_${timestamp}`

    return c.json({
      success: true,
      jobName,
      iaParams,
      watchDir: 'Z:\\Designs\\IllustratorAutomat\\test-watch',
      rules: {
        product: prod,
        scale,
        margins,
        marginsCm: { L: marginLcm, R: marginRcm, T: marginTcm, B: marginBcm },
      },
      outputs: { eps: epsOutput, png: pngOutput },
    })
  } catch {
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

export { iaAuto }
