/**
 * 판짜기 작업지시서 — 한 번의 재단 판짜기(원본 1장 → 판 N개)를 **한 부**로 묶는다 (2026-09-26 용준님).
 *
 * 판마다 따로 있던 쪽(판 k/N 그림)은 파일마다 흩어져 실제로 보기 어렵다 → 원본 전체 그림 위에
 * 판별 색으로 조각을 표시하고, 판별로 묶은 목록표(번호·규격·확인)를 한 장에 싣는다.
 *
 * 묶는 열쇠 = `designer_intakes.batch_key`(= 판 1 등록 폴더, 호스트 CUT-CEP-0.58.0+).
 * 판 정보·조각 상세는 각 판 분석의 groups_json 첫 그룹(`plateInfo.ts`), 전체 그림은 **판 1** 그룹의
 * `thumbnail_ov_r2_key`(에이전트가 판 1 에만 싣는다).
 *
 * ★조각 번호를 끄고 짠 판짜기는 묶지 않는다(용준님 결정 — 번호 없이는 전체 문서가 쓸모없다).
 *   판단 = 어느 판에도 조각 상세(`pieces`)가 없으면 제외 → 종전처럼 판별 쪽만 나간다.
 */
import type { PieceInfo } from './plateInfo'

export interface BatchLineInput {
  line_id: number
  analysis_id: number
}

export interface BatchIntakeInput {
  batch_key: string
  analysis_id: number | null
  order_id: number | null
  order_number: string | null
}

export interface BatchGroupInput {
  plate_index?: unknown
  plate_total?: unknown
  pieces?: PieceInfo[]
  thumbnail_ov_r2_key?: unknown
}

export interface CutBatchPlate {
  index: number
  /** 이 주문의 라인이면 그 라인 id(후가공 요약·판별 줄과 잇는다), 아니면 null */
  line_id: number | null
  /** 다른 주문에 들어갔으면 그 주문번호 · 아직 대기함이면 null */
  other_order_number: string | null
  waiting: boolean
  pieces: PieceInfo[]
}

export interface CutBatch {
  key: string
  plate_total: number
  overview_ref: string | null
  plates: CutBatchPlate[]
  piece_count: number
}

/**
 * @param orderId 지금 인쇄하는 주문
 * @param lines   이 주문의 라인 중 판 정보가 있는 것(line → 분석)
 * @param batchOfAnalysis 분석 id → batch_key (이 주문 라인의 분석만)
 * @param intakes 그 batch_key 들에 속한 **모든** 등록(다른 주문·대기함 포함)
 * @param groupOf 분석 id → groups_json 첫 그룹
 */
export function assembleCutBatches(
  orderId: number,
  lines: BatchLineInput[],
  batchOfAnalysis: Map<number, string>,
  intakes: BatchIntakeInput[],
  groupOf: Map<number, BatchGroupInput>,
): CutBatch[] {
  const keys: string[] = []
  const lineOfAnalysis = new Map<number, number>()
  for (const l of lines) {
    const k = batchOfAnalysis.get(l.analysis_id)
    if (!k) continue
    lineOfAnalysis.set(l.analysis_id, l.line_id)
    if (!keys.includes(k)) keys.push(k)
  }
  const out: CutBatch[] = []
  for (const key of keys) {
    const byIndex = new Map<number, CutBatchPlate>()
    let total = 0
    let overview: string | null = null
    for (const it of intakes) {
      if (it.batch_key !== key || !it.analysis_id) continue
      const g = groupOf.get(it.analysis_id)
      if (!g) continue
      const k = Number(g.plate_index), n = Number(g.plate_total)
      if (!(Number.isInteger(k) && Number.isInteger(n) && n >= 2 && k >= 1 && k <= n)) continue
      total = Math.max(total, n)
      if (k === 1 && typeof g.thumbnail_ov_r2_key === 'string' && g.thumbnail_ov_r2_key) overview = g.thumbnail_ov_r2_key
      const mine = lineOfAnalysis.get(it.analysis_id) ?? null
      const plate: CutBatchPlate = {
        index: k,
        line_id: mine,
        other_order_number: mine == null && it.order_id != null && it.order_id !== orderId ? (it.order_number || null) : null,
        waiting: mine == null && it.order_id == null,
        pieces: Array.isArray(g.pieces) ? g.pieces : [],
      }
      // 같은 판이 두 번 등록됐으면(재등록) 이 주문에 들어간 쪽이 이긴다
      const prev = byIndex.get(k)
      if (!prev || (prev.line_id == null && plate.line_id != null)) byIndex.set(k, plate)
    }
    const plates = Array.from(byIndex.values()).sort((a, b) => a.index - b.index)
    const pieceCount = plates.reduce((s, p) => s + p.pieces.length, 0)
    if (!total || pieceCount === 0) continue   // 번호 꺼짐 → 전체 문서 없음(종전 판별 쪽)
    out.push({ key, plate_total: total, overview_ref: overview, plates, piece_count: pieceCount })
  }
  return out
}
