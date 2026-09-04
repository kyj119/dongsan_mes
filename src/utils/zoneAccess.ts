// 구역 담당자 권한 — 실사(`routes/inventoryCount.ts`)와 구역 품목 배정(`routes/storageZones.ts`)이
// **같은 판정**을 써야 한다. 두 곳에 각각 쓰면 한쪽만 고쳐지는 날이 온다.
//
// 배경 = 2026-09-04. 구역 담당자 5명이 전부 `OPERATOR` 이고 `MANAGER` 는 0명인데 실사 라우터 전체가
//   `requireRole('ADMIN','MANAGER')` 였다. 담당자가 실사를 못 해 22건 중 18건이 SUBMITTED 로 묶였다.
//   권한을 엔드포인트별로 내리면서 「자기 담당 구역인가」 판정을 여기로 모았다.

import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'

/** ADMIN·MANAGER = 전 구역. (MANAGER 는 현재 0명이지만 역할 축은 유지한다) */
export function isSupervisor(c: Context<HonoEnv>): boolean {
  const r = c.get('user')?.role
  return r === 'ADMIN' || r === 'MANAGER'
}

/**
 * 이 구역을 만질 수 있나. 관리자는 전부, 그 외는 **자기 담당 활성 구역**만.
 *
 * ⚠️ `zoneId == null`(구역 미지정)은 **관리자만** 통과한다 — 전수·분류 실사에는 남의 구역 품목이
 *    통째로 섞여 있고, 미배정 재고에는 책임자가 없다.
 * ⚠️ 법인 소유 검증은 **여기서 하지 않는다**. 호출부가 `entityFilter`/`isZoneOwnedByEntity` 로
 *    따로 건다 — 축이 둘(법인·담당자)이고 하나로 합치면 어느 쪽에 걸렸는지 못 읽는다.
 */
export async function canTouchZone(
  c: Context<HonoEnv>,
  zoneId: number | null | undefined
): Promise<boolean> {
  if (isSupervisor(c)) return true
  if (zoneId == null) return false
  const uid = c.get('user')?.id
  if (!uid) return false
  const row = await c.env.DB.prepare(
    'SELECT 1 AS ok FROM storage_zones WHERE id = ? AND manager_id = ? AND is_active = 1'
  ).bind(Number(zoneId), uid).first<{ ok: number }>()
  return !!row
}
