/**
 * 윈드배너 틀 카탈로그 — **실측으로 굳힌 사실만** 적는다 (2026-09-18, `Z:\메인1\★가이드\윈드배너`)
 *
 * ★왜 산식이 아니라 카탈로그인가: 틀 6종의 구조가 **제각각**이다.
 *     · 실루엣이 채움인 것(S형 70-300)과 **선**인 것(S형 70-280)이 섞여 있다
 *     · 층이 6겹인 것(F형 105-267)과 1겹뿐인 것(하우사인 51-122)이 있다
 *     · 시접 밴드가 있는 틀과 없는 틀이 있다
 *   틀에서 규칙을 역산하려 하면 그 차이가 전부 오차로 들어온다. 틀은 **읽어서 쓰는 대상**이지
 *   규칙을 뽑는 대상이 아니다. 그래서 여기 적힌 값은 전부 **잰 값**이고, 못 잰 것은 안 적었다.
 *
 * ★placement 의 뜻
 *     'auto'   — 실루엣 치수가 주문 규격과 일치한다. 원본을 그 자리에 그대로 앉힐 수 있다.
 *     'manual' — 실루엣이 규격과 다르다(F형은 「105」가 천 폭이 아니다 — 실측 815.54 = 규격의 78%).
 *                틀만 열어 주고 앉히는 것은 디자이너가 한다. 패널이 추정해서 앉히지 않는다.
 *
 * ⚠️ 틀 파일이 바뀌면 이 값도 바뀐다. 드리프트는 `npm run cut:frame -- --verify` 로 Z: 를 다시 읽어 대조한다
 *    (Z: 가 없으면 건너뛴다 — CI 에서는 카탈로그 내부 일관성만 본다).
 */
(function (root) {
  'use strict';

  var DIR = 'Z:\\메인1\\★가이드\\윈드배너\\';

  var FRAMES = [
    {
      id: 'S-70-280', type: 'S', spec: { w: 700, h: 2800 },
      plate: { w: 725, h: 2825 }, vup: 1,
      silhouette: { w: 700, h: 2800, drawn: 'stroke' },
      seamMm: 25, seamSides: ['right', 'bottom'],
      placement: 'auto',
      file: DIR + '윈드배너 S형 (70-280).eps',
      note: '실루엣이 규격과 정확히 일치. 판 = 규격 + 시접 25(우·하). 틀 6종 중 가장 단순하다.'
    },
    {
      id: 'S-70-300', type: 'S', spec: { w: 700, h: 3000 },
      plate: { w: 1632.07, h: 3088.35 }, vup: 2,
      silhouette: { w: 698.88, h: 3000, drawn: 'fill' },
      seamMm: 25, seamSides: ['right', 'bottom'],
      placement: 'auto',
      file: DIR + '윈드배너 S형 (70-300).eps',
      note: '시접 포함 벌 725×3025(=700+25 × 3000+25). 벌 x0 = 1.12 · 933.19.'
    },
    {
      id: 'S-80-380', type: 'S', spec: { w: 800, h: 3800 },
      plate: { w: 1841.67, h: 3853.1 }, vup: 2,
      silhouette: { w: 799.42, h: 3800, drawn: 'fill' },
      seamMm: 25, seamSides: ['right', 'bottom'],
      placement: 'auto',
      file: DIR + '윈드배너 S형 (80-380).eps',
      note: '시접 포함 벌 825×3825. 벌 x0 = 0.29 · 1042.25.'
    },
    {
      id: 'F-105-267', type: 'F', spec: { w: 1050, h: 2670 },
      plate: { w: 1294.35, h: 2731.49 }, vup: 2,
      silhouette: { w: 815.54, h: 2730.77, drawn: 'fill' },
      seamMm: 25, seamSides: ['straight'],
      placement: 'manual',
      file: DIR + '윈드배너 F형 (105-267).eps',
      note: '층 4겹(도련 815.54 / 시접 789.31 / 재단 763.36 / 안전 688.45) + 직선변 25×2569.2 밴드 4개. ' +
            '좌우 벌이 x 478.73~815.63 에서 겹쳐 끼워져 있다 — 이 겹침은 산식으로 재현할 수 없다. ' +
            '판 폭 1294.35 = 60폭 원단.'
    },
    {
      id: 'F-76-180', type: 'F', spec: { w: 760, h: 1800 },
      plate: { w: 998.43, h: 1823.12 }, vup: 2,
      silhouette: { w: 585.42, h: 1813.94, drawn: 'fill' },
      seamMm: null, seamSides: [],
      placement: 'manual',
      file: DIR + '윈드배너 F형 (76-180).eps',
      note: '층 4겹(585.42 / 561.47 / 559.46). 직선변 밴드가 없다 — 시접이 틀에 안 그려져 있다.'
    },
    {
      id: 'F-51-122-하우사인', type: 'F', spec: { w: 510, h: 1220 },
      plate: { w: 535, h: 1245 }, vup: 1,
      silhouette: { w: 535, h: 1245, drawn: 'fill' },
      seamMm: 25, seamSides: ['right', 'bottom'],
      placement: 'manual',
      file: DIR + '하우사인 윈드배너 F형 (51-122).eps',
      note: '경로가 1개뿐이라 실루엣과 시접이 구분되지 않는다. 판 = 규격 + 25. 하우사인 전용.',
      client: '하우사인'
    }
  ];

  /**
   * 디자이너가 **직접 확인**할 항목. 패널은 표시만 하고 손대지 않는다.
   * 출처 = 전사 인수인계(2026-09-18).
   */
  var REVIEW = {
    all: [
      { code: 'no-black-border', level: 'must', msg: '실제 출력파일에는 검정테두리를 남기지 않는다 (작업용 외곽선·보조선 삭제)' },
      { code: 'cut-mark-solid', level: 'must', msg: '윈드배너 재단선은 **점선 없이** 표시한다 — 점선이면 라운드부를 정확히 자르기 어렵다' },
      { code: 'cut-mark-color', level: 'check', msg: '바탕이 흰색·연한색이면 재단선 M50 Y100 을 넣는다' }
    ],
    round: [
      { code: 'bias-7cm', level: 'must', msg: '라운드부에 7cm 검정바이어스천을 덧대므로 **글씨를 4cm 안쪽으로** 밀어야 한다' }
    ],
    seam: [
      { code: 'seam-25', level: 'check', msg: '바이어스 덧대는 부분을 제외한 1면 또는 2면에 쌍침 시접 2.5cm' }
    ]
  };

  var api = { FRAMES: FRAMES, REVIEW: REVIEW, DIR: DIR };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MesFrameCatalog = api;
})(typeof window !== 'undefined' ? window : globalThis);
