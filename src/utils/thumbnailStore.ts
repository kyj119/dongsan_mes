// D1 base64 blob → R2 이관 (확장성 감사 P3). 썸네일 바이트는 R2에 저장하고 D1엔 참조(key)만 남긴다.
//
// 설계(Approach A — 프론트 무수정):
//  - 저장: 에이전트가 보낸 base64 썸네일을 externalize* 로 R2에 옮기고 group.thumbnail_r2_key 로 치환.
//    (groups_json / cards.thumbnail_url 에서 base64 문자열이 사라져 D1 누적이 끊긴다.)
//  - 읽기: 클라이언트로 내보내는 emit 시점에 hydrate* 로 R2에서 읽어 기존과 동일한 base64/data URI
//    형태로 복원한다. 인증=헤더 전용이라 <img src>가 R2를 직접 못 부르므로(→401) 백엔드가 대신 서빙.
//    (memory: feedback-auth-header-only-download)
//
// R2 키 규칙: thumbnails/analysis/{analysisId}/{groupIndex}.png
// D1 마커 규칙: cards.thumbnail_url 등 단일 URL 필드는 'r2:thumb:<key>' 마커로 저장.

export interface R2Env {
  R2_BUCKET: R2Bucket
}

const REF_PREFIX = 'r2:thumb:'
const KEY_ROOT = 'thumbnails'

/** 단일 URL 필드용 마커('r2:thumb:...') 판별 */
export function isThumbRef(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith(REF_PREFIX)
}
/** bare key → 'r2:thumb:<key>' 마커 */
export function thumbRef(key: string): string {
  return REF_PREFIX + key
}
/** 'r2:thumb:<key>' 또는 bare key → bare key */
export function refKey(refOrKey: string): string {
  return refOrKey.startsWith(REF_PREFIX) ? refOrKey.slice(REF_PREFIX.length) : refOrKey
}

/** 'data:image/png;base64,XXXX' | 'XXXX' → raw base64 'XXXX' */
export function stripDataUri(s: string): string {
  const i = s.indexOf('base64,')
  return i >= 0 ? s.slice(i + 7) : s
}

/** base64(data URI 허용) → Uint8Array */
export function base64ToBytes(base64OrDataUri: string): Uint8Array {
  const bin = atob(stripDataUri(base64OrDataUri))
  const len = bin.length
  const out = new Uint8Array(len)
  for (let i = 0; i < len; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** ArrayBuffer → base64 (스택 초과 방지 위해 청크 처리) */
function bytesToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)))
  }
  return btoa(bin)
}

/** 썸네일 키 생성 */
export function analysisThumbKey(analysisId: number | string, groupIndex: number | string): string {
  return `${KEY_ROOT}/analysis/${analysisId}/${groupIndex}.png`
}

/**
 * 인쇄용 고해상도(@lg) 키. 목록용 썸네일과 **다른 객체**로 나란히 둔다.
 *   목록(칸반 배치 20장)은 base64 로 응답에 실리므로 1200px 를 그리로 보내면 응답이 20MB 가 된다.
 *   그래서 hydrate 는 sm 만 복원하고, lg 는 작업지시서 인쇄가 필요할 때만 R2 에서 직접 읽는다.
 */
export function analysisThumbKeyLg(analysisId: number | string, groupIndex: number | string): string {
  return `${KEY_ROOT}/analysis/${analysisId}/${groupIndex}@lg.png`
}

/** base64/data URI → R2.put → bare key 반환 (범용: 썸네일·첨부 공용) */
export async function putBase64ToR2(env: R2Env, key: string, base64OrDataUri: string, contentType: string): Promise<string> {
  await env.R2_BUCKET.put(key, base64ToBytes(base64OrDataUri), { httpMetadata: { contentType } })
  return key
}

/** base64/data URI 썸네일 → R2.put → bare key 반환 */
export async function putThumbnail(env: R2Env, key: string, base64OrDataUri: string, contentType = 'image/png'): Promise<string> {
  return putBase64ToR2(env, key, base64OrDataUri, contentType)
}

/** ref/key → raw base64 (data: 접두어 없음). 없으면 null */
export async function getThumbnailBase64(env: R2Env, refOrKey: string): Promise<string | null> {
  const obj = await env.R2_BUCKET.get(refKey(refOrKey))
  if (!obj) return null
  return bytesToB64(await obj.arrayBuffer())
}

/** ref/key → 'data:image/png;base64,...' . 없으면 null */
export async function getThumbnailDataUri(env: R2Env, refOrKey: string, mime = 'image/png'): Promise<string | null> {
  const b64 = await getThumbnailBase64(env, refOrKey)
  return b64 ? `data:${mime};base64,${b64}` : null
}

export interface AnalysisGroup {
  index?: number
  thumbnail_base64?: string | null
  thumbnail_r2_key?: string | null
  /** 인쇄용 고해상도 — 저장 시에만 base64 로 들어오고, emit 에는 **절대 실리지 않는다**(위 keyLg 주석). */
  thumbnail_hi_base64?: string | null
  thumbnail_hi_r2_key?: string | null
  [k: string]: unknown
}

/**
 * order_items.ai_group_index → 대응 그룹.
 * **음수 = "파일 전체" 약속값**이므로 첫 그룹을 쓴다.
 *   -1 = 전체문서(가공)        — orderForm/itemRow.js onDirectModeToggle
 *   -3 = 완성본(복사) passthrough — workbench.ts 대기물 흡수(UPDATE ... ai_group_index = -3)
 * 0 이상은 group.index 일치로 찾는다.
 * ⚠️ -1만 특별처리하면 -3 라인의 썸네일이 통째로 누락된다(현장 카드 상세 썸네일 실종).
 */
export function resolveGroupByAiIndex(
  groups: AnalysisGroup[] | null | undefined,
  aiGroupIndex: number | null | undefined
): AnalysisGroup | undefined {
  if (!Array.isArray(groups) || groups.length === 0) return undefined
  if (aiGroupIndex === null || aiGroupIndex === undefined) return undefined
  if (aiGroupIndex < 0) return groups[0]
  return groups.find((g) => g.index === aiGroupIndex)
}

/**
 * 저장 직전: 각 group의 base64 썸네일을 R2로 옮기고 thumbnail_r2_key로 치환(thumbnail_base64 제거).
 * R2 실패 시 해당 group은 base64 원본을 유지해 무손실. 이미 r2_key만 있는 group은 그대로 통과.
 * 반환 = 저장용 lean groups (in-place 변형).
 */
export async function externalizeGroups(env: R2Env, analysisId: number | string, groups: AnalysisGroup[]): Promise<AnalysisGroup[]> {
  if (!Array.isArray(groups)) return groups
  for (const g of groups) {
    if (g && typeof g.thumbnail_base64 === 'string' && g.thumbnail_base64.length > 0) {
      const key = analysisThumbKey(analysisId, g.index ?? 0)
      try {
        await putThumbnail(env, key, g.thumbnail_base64)
        g.thumbnail_r2_key = key
        delete g.thumbnail_base64
      } catch (_e) {
        // R2 저장 실패 → base64 원본 유지(썸네일 유실 방지). 다음 externalize 시 재시도.
      }
    }
    // 인쇄용 고해상도 — 실패해도 조용히 넘어간다(sm 이 이미 있으므로 인쇄는 그것으로 나간다).
    //   ⚠️ base64 는 **반드시** 지운다. D1 groups_json 에 1200px 가 남으면 목록 응답이 통째로 무거워진다.
    if (g && typeof g.thumbnail_hi_base64 === 'string' && g.thumbnail_hi_base64.length > 0) {
      const keyLg = analysisThumbKeyLg(analysisId, g.index ?? 0)
      try {
        await putThumbnail(env, keyLg, g.thumbnail_hi_base64)
        g.thumbnail_hi_r2_key = keyLg
      } catch (_e) { /* sm 폴백으로 충분 */ }
      delete g.thumbnail_hi_base64
    }
  }
  return groups
}

/**
 * emit 직전: thumbnail_r2_key만 있는 group에 thumbnail_base64(raw)를 R2에서 복원.
 * 이미 base64가 있으면(레거시 미이관 행) 그대로 둔다. 프론트 계약(=thumbnail_base64) 무변.
 */
export async function hydrateGroups(env: R2Env, groups: AnalysisGroup[]): Promise<AnalysisGroup[]> {
  if (!Array.isArray(groups)) return groups
  for (const g of groups) {
    if (g && !g.thumbnail_base64 && typeof g.thumbnail_r2_key === 'string' && g.thumbnail_r2_key) {
      const b64 = await getThumbnailBase64(env, g.thumbnail_r2_key)
      if (b64) g.thumbnail_base64 = b64
    }
  }
  return groups
}

/**
 * groups_json 문자열 → hydrate된 문자열. r2_key가 없으면 원본을 그대로 반환(불필요한 파싱/직렬화 회피).
 * emit helper: aiAnalysis GET·배치·workbench 보드·orders 상세(ai_groups_json)에서 사용.
 */
export async function hydrateGroupsJson(env: R2Env, groupsJson: string | null | undefined): Promise<string | null | undefined> {
  if (!groupsJson || typeof groupsJson !== 'string') return groupsJson
  if (groupsJson.indexOf('thumbnail_r2_key') < 0) return groupsJson // 이관 전이거나 썸네일 없음 → no-op
  let groups: AnalysisGroup[]
  try { groups = JSON.parse(groupsJson) } catch { return groupsJson }
  if (!Array.isArray(groups) || groups.length === 0) return groupsJson
  await hydrateGroups(env, groups)
  return JSON.stringify(groups)
}

// ── canvas_json.render_base64 (IA 웹 캔버스 렌더 미리보기) — groups_json과 동일 정책 ──
interface CanvasObj { render_base64?: string | null; render_r2_key?: string | null; [k: string]: unknown }

/** 저장 직전: canvas_json.render_base64 → R2, render_r2_key로 치환. r2 실패/미포함 시 원본 반환. */
export async function externalizeCanvasJson(env: R2Env, analysisId: number | string, canvasJson: string | null | undefined): Promise<string | null | undefined> {
  if (!canvasJson || typeof canvasJson !== 'string') return canvasJson
  if (canvasJson.indexOf('render_base64') < 0) return canvasJson
  let cj: CanvasObj
  try { cj = JSON.parse(canvasJson) } catch { return canvasJson }
  if (cj && typeof cj.render_base64 === 'string' && cj.render_base64.length > 0) {
    const key = `${KEY_ROOT}/analysis/${analysisId}/canvas.png`
    try {
      await putThumbnail(env, key, cj.render_base64)
      cj.render_r2_key = key
      delete cj.render_base64
      return JSON.stringify(cj)
    } catch (_e) { /* R2 실패 → 원본(base64) 유지, 무손실 */ }
  }
  return canvasJson
}

/** emit 직전: canvas_json.render_r2_key → render_base64(raw) 복원. */
export async function hydrateCanvasJson(env: R2Env, canvasJson: string | null | undefined): Promise<string | null | undefined> {
  if (!canvasJson || typeof canvasJson !== 'string') return canvasJson
  if (canvasJson.indexOf('render_r2_key') < 0) return canvasJson
  let cj: CanvasObj
  try { cj = JSON.parse(canvasJson) } catch { return canvasJson }
  if (cj && !cj.render_base64 && typeof cj.render_r2_key === 'string' && cj.render_r2_key) {
    const b64 = await getThumbnailBase64(env, cj.render_r2_key)
    if (b64) { cj.render_base64 = b64; return JSON.stringify(cj) }
  }
  return canvasJson
}
