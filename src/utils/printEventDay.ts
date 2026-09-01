// 출력 이벤트의 「업무일」 단일 소스(SSOT) — 2026-09-01
//
// ⚠️ print_events 를 날짜로 묶는 곳은 **전부 여기를 쓴다.** 리터럴 금지.
//
// 왜 만들었나 (2026-09-01 생산현황 점검에서 결함 2건):
//   ① 실적 집계가 `created_at`(서버 수신 시각) 기준이었다. 그건 출력한 날이 아니라 **적재한 날**이다.
//      전 기간 8,982건 중 **1,792건(20%)** 이 출력일과 적재일이 다르고 최대 지연이 **894시간(37일)** 이다.
//      2026-08-10 하루에만 1,750건이 몰렸는데 그건 에이전트 최초 롤아웃 백필이었다 —
//      그날 「오늘 실적」은 통째로 남의 날 숫자였다. 에이전트가 며칠 멈췄다 재개하면 같은 일이 또 난다.
//   ② 같은 응답 안에서 축이 갈렸다. 오늘 요약은 KST(`kstDateOf`), 일별 차트는 `date(created_at)` = **UTC**.
//      실측 그날 KST 249건 중 9건이 차트에서 전날로 빠졌다 — 00~09시 KST 출력이 통째로 어제로 간다.
//
// 축 선택 근거(실측 9,421건):
//   · `print_completed_at` 결측 **0건** — 가장 완전하다. 그래서 이걸 1순위로 둔다.
//   · `print_started_at` 결측 429건 → 2순위.
//   · 둘 다 없는 행 **0건**. `created_at` 은 마지막 안전망일 뿐 정상 경로가 아니다.
//   · 자정을 넘긴 출력은 8,992건 중 **6건** — 시작/종료 어느 쪽을 잡든 차이가 미미하므로
//     결측이 없는 종료 시각을 택했다(파일 목록·필터가 이미 쓰던 축과도 같다).

import { kstDateOf } from './kstDate'

/** 업무일 기준 시각(원시 컬럼). 정렬·범위 비교용. alias 예: 'pe' */
export function printEventAt(alias = ''): string {
  const p = alias ? `${alias}.` : ''
  return `COALESCE(${p}print_completed_at, ${p}print_started_at, ${p}created_at)`
}

/** 업무일(KST 'YYYY-MM-DD'). GROUP BY·WHERE 날짜 비교용. */
export function printEventKstDay(alias = ''): string {
  return kstDateOf(printEventAt(alias))
}
