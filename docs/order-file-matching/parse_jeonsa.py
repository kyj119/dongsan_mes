# -*- coding: utf-8 -*-
"""전사축(Z:\\메인1\\메인1\\2026) 파서 — 2축과 명명 규칙이 다르다.

  디자인엠투 전국당구대회(50-150-1장).eps
  삼양기획 태극기배너(60-150-5조).eps
  하우사인 엔오짐2(43-110-1장)-H.eps
  베스트광고주식회사(에이스광고) 성균관대학교-1장만.eps

  거래처 건명(W-H-N장|조)[-플래그].eps      ← 제품유형 괄호·접수순번 없음
  폴더: 7월\\31일 금요일\\               ← 연도는 루트에 있어 rel 에 없다

★수량 단위: `조` = 1쌍 = **2개**(용준님 확정). `장`은 그대로.
  전사 출력은 깃발·배너라 좌우 한 쌍이 1조다. 조를 장으로 세면 수량이 절반이 된다.

출력 스키마는 parsed.csv 와 동일하게 맞춘다(채점기가 두 축을 같이 먹도록).
"""
import csv, re, os, sys, io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
SCRATCH = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(SCRATCH, 'zfiles_jeonsa.csv')
OUT = os.path.join(SCRATCH, 'parsed_jeonsa.csv')
YEAR = 2026  # 루트가 …\2026 이라 rel 에 연도가 없다

RX_M = re.compile(r'(\d{1,2})\s*월')
RX_D = re.compile(r'(\d{1,2})\s*일')
# (50-150-1장) (60-180-40조) (110x330-8장) — 구분자 - 와 x 양쪽 허용
RX_SPEC = re.compile(
    r'\(\s*(\d{1,4}(?:\.\d+)?)\s*[-xX*]\s*(\d{1,4}(?:\.\d+)?)'
    r'(?:\s*[-\s]\s*(\d+)\s*(장|조|벌|개|매))?\s*\)')
# 괄호가 없는 변종: 성균관대학교-1장만
RX_QTY_LOOSE = re.compile(r'(\d+)\s*(장|조|벌|개|매)')
RX_FLAG = re.compile(r'-\s*(H|재출력|수정|추가)\s*$', re.I)


def qty_pieces(n, unit):
    """조 = 1쌍 = 2개(용준님 확정).

    `벌`은 아직 확정 전이다 — `양면(60-40-20벌)` 처럼 양면 표기와 같이 오는 걸 보면
    2장일 공산이 크지만, 추정하지 않고 원값을 둔다. 채점에서 ×1·×2 양쪽을 시도해
    정답지가 고르게 한다(이 프로젝트의 일관된 방식).
    """
    if n is None:
        return None
    return n * 2 if unit == '조' else n


def parse_date(rel):
    m = d = None
    for seg in rel.split('\\')[:-1]:
        if m is None:
            mo = RX_M.search(seg)
            if mo:
                m = int(mo.group(1)); continue
        if m is not None and d is None:
            mo = RX_D.search(seg)
            if mo:
                d = int(mo.group(1)); continue
    return YEAR, m, d


def parse_client_title(base):
    """거래처 = 첫 공백 앞. 단 법인 표기의 괄호는 거래처에 붙여 둔다.

    `베스트광고주식회사(에이스광고) 성균관대학교` → 거래처 `베스트광고주식회사(에이스광고)`
    """
    s = RX_SPEC.sub('', base).strip()
    s = RX_FLAG.sub('', s).strip()
    # 선두 토큰이 괄호를 열었으면 닫힐 때까지 삼킨다
    mo = re.match(r'^\s*([^\s(]+(?:\([^)]*\))?)\s+(.*)$', s)
    if mo:
        return mo.group(1).strip(), mo.group(2).strip() or None
    return (s or None), None


def parse_row(rel, name):
    base = name.rsplit('.', 1)[0]
    y, m, d = parse_date(rel)

    w = h = qty = None
    unit = None
    mo = RX_SPEC.search(base)
    if mo:
        w, h = float(mo.group(1)), float(mo.group(2))
        if mo.group(3):
            qty, unit = int(mo.group(3)), mo.group(4)
    if qty is None:
        mo2 = RX_QTY_LOOSE.search(base)
        if mo2:
            qty, unit = int(mo2.group(1)), mo2.group(2)

    client, title = parse_client_title(base)
    flag = RX_FLAG.search(base)
    return {
        'axis': '메인1', 'rel': rel, 'name': name,
        'y': y, 'm': m, 'd': d, 'seq': None,
        'ptype': '전사', 'client': client,
        'w': w, 'h': h, 'qty': qty_pieces(qty, unit),
        'flag': flag.group(1) if flag else None,
        'qty_raw': qty, 'unit': unit, 'title': title,
    }


def main():
    rows = []
    with open(SRC, encoding='utf-8-sig', newline='') as f:
        for r in csv.DictReader(f):
            rows.append(parse_row(r['rel'], r['name']))

    n = len(rows)
    have = lambda k: sum(1 for r in rows if r[k] is not None)
    date_ok = sum(1 for r in rows if r['m'] and r['d'])
    spec_ok = sum(1 for r in rows if r['w'] and r['h'])
    core = sum(1 for r in rows if r['m'] and r['d'] and r['w'] and r['h'] and r['client'])
    jo = sum(1 for r in rows if r['unit'] == '조')

    print(f'전사축 파일        {n:,}')
    print(f'  날짜(월일)      {date_ok:,}  ({date_ok/n:.1%})')
    print(f'  거래처          {have("client"):,}  ({have("client")/n:.1%})')
    print(f'  규격            {spec_ok:,}  ({spec_ok/n:.1%})')
    print(f'  수량            {have("qty"):,}  ({have("qty")/n:.1%})')
    print(f'  ─ 핵심3(날짜+규격+거래처) {core:,}  ({core/n:.1%})')
    print(f'  ※ 조 단위 {jo:,}건 → ×2 로 환산')

    from collections import Counter
    print('\n거래처 상위 12:')
    for c, k in Counter(r['client'] for r in rows if r['client']).most_common(12):
        print(f'  {k:5}  {c}')

    print('\n규격 미검출 샘플 8:')
    k = 0
    for r in rows:
        if not (r['w'] and r['h']):
            print('  ', r['name'][:78]); k += 1
            if k >= 8:
                break

    cols = ['axis', 'rel', 'name', 'y', 'm', 'd', 'seq', 'ptype', 'client', 'w', 'h', 'qty', 'flag']
    with open(OUT, 'w', encoding='utf-8', newline='') as f:
        wtr = csv.DictWriter(f, fieldnames=cols, extrasaction='ignore')
        wtr.writeheader()
        wtr.writerows(rows)
    print(f'\n저장: {OUT}')


if __name__ == '__main__':
    main()
