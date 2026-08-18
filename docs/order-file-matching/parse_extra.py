# -*- coding: utf-8 -*-
"""축 확대 — ☆간판(CNC·채널) · ★시트 CUT★ 파서.  → parsed_extra.csv

이 축들은 앞선 3축과 문법이 다르다:
  · 파일명에 규격이 **없다**(1%). 규격은 BoundingBox 로만 얻는다.
  · 배율은 ×1 로 고정한다 — 추측이 아니라 원리다. CNC·시트컷은 절단 경로이고
    채널간판은 조립 도안이라 **실척**으로 작업한다(축소하면 칼선이 틀어진다).
  · 순번이 없다 → 그룹 키는 (날짜, 거래처).

문법:
  간판CNC   `작업파일 07월\\0701\\모든광고_비스코프(대천점)_채널뚜껑.ai`
            날짜=폴더, 이름=거래처_건명_제품유형
  간판채널   `07월\\260706_모든광고_덕은통상_스카시.ai`     날짜=이름 앞머리
  시트CUT   `260810_세웅기업_자사간판_채널도안.ai` · `0706_프랜즈.ai`  날짜 없으면 mtime

⚠️ `시트 CUT\\선명 완료\\` 는 **선명커뮤니케이션** 작업이다. 정답지는 동산 주문서현황이므로
   여기 파일이 섞이면 있지도 않은 주문을 찾게 된다 → 제외한다.
"""
import csv, os, re, sys, io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
S = os.path.dirname(os.path.abspath(__file__))
ROOT = {'간판CNC': r'Z:\☆간판\2026년(CNC)', '간판채널': r'Z:\☆간판\2026 채널',
        '시트CUT': r'Z:\★시트 CUT★'}
RX_BB = re.compile(rb'%%(?:HiRes)?BoundingBox:\s*([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)')
RX_MON = re.compile(r'(\d{1,2})\s*월')
RX_DAY = re.compile(r'^(\d{2})(\d{2})$')            # 폴더 `0701`
RX_YMD6 = re.compile(r'^(\d{2})(\d{2})(\d{2})[_\-\s]')  # 이름 `260706_`
RX_MD4 = re.compile(r'^(\d{2})(\d{2})[_\-\s]')      # 이름 `0706_`
RX_PT = re.compile(r'(채널뚜껑|채널도안|채널|스카시|알마이트|알마가공|포가공|입체|트림|컷팅|도안|재단)')
# 규격이 이름에 있는 드문 경우
RX_SPEC = re.compile(r'(\d{2,4})\s*[xX*]\s*(\d{2,4})')
DROP_EXT = {'.cnn', '.dxf', '.tmp', '.svg', ''}     # 벡터 원본만 본다(.cnn 은 .ai 와 1:1 중복)


def bbox_cm(p):
    try:
        with open(p, 'rb') as f:
            head = f.read(65536)
    except Exception:
        return None
    best = None
    for m in RX_BB.finditer(head):
        x0, y0, x1, y1 = [float(v) for v in m.groups()]
        w, h = (x1 - x0) * 2.54 / 72, (y1 - y0) * 2.54 / 72
        if w > 0 and h > 0:
            best = (w, h)
    return best


def parse_row(r):
    axis, rel, name = r['axis'], r['rel'], r['name']
    parts = rel.split('\\')
    stem = os.path.splitext(name)[0]
    y = m = d = None

    if axis == '시트CUT' and any('선명' in p for p in parts[:-1]):
        return None                                  # 선명 사업자 — 정답지 밖

    mo = RX_YMD6.match(stem)
    if mo:
        y, m, d = 2000 + int(mo.group(1)), int(mo.group(2)), int(mo.group(3))
        stem = stem[mo.end():]
    else:
        mo = RX_MD4.match(stem)
        if mo:
            y, m, d = 2026, int(mo.group(1)), int(mo.group(2))
            stem = stem[mo.end():]

    if m is None:                                    # 폴더에서 날짜
        for p in parts[:-1]:
            mm = RX_MON.search(p)
            if mm:
                m = int(mm.group(1)); y = 2026
            dd = RX_DAY.match(p.strip())
            if dd:
                m, d = int(dd.group(1)), int(dd.group(2)); y = 2026
    if m is not None and d is None:
        return None                                  # 월만 알면 그룹을 못 만든다
    if m is None:                                    # 최후 수단 = 수정시각
        try:
            y, m, d = [int(x) for x in r['mtime'].split('-')]
        except Exception:
            return None
    if not (1 <= (m or 0) <= 12 and 1 <= (d or 0) <= 31):
        return None

    ptm = RX_PT.search(stem)
    ptype = ptm.group(1) if ptm else None
    seg = [s for s in re.split(r'[_\-]', stem) if s.strip()]
    client = seg[0].strip() if seg else None
    if client and (RX_PT.fullmatch(client) or len(client) < 2 or client.isdigit()):
        client = None

    w = h = None
    sp = RX_SPEC.search(name)
    if sp:
        w, h = float(sp.group(1)), float(sp.group(2))
    else:
        bb = bbox_cm(os.path.join(ROOT[axis], rel))
        if bb:
            w, h = bb                                # ×1 실척
    return {'axis': axis, 'rel': rel, 'name': name, 'y': y, 'm': m, 'd': d,
            'seq': '', 'ptype': ptype or '', 'client': client or '',
            'w': f'{w:.1f}' if w else '', 'h': f'{h:.1f}' if h else '',
            'qty': '', 'flag': ''}


def main():
    rows = list(csv.DictReader(open(os.path.join(S, 'zfiles_extra.csv'), encoding='utf-8-sig')))
    out, drop = [], 0
    for r in rows:
        if r['ext'].lower() in DROP_EXT:
            drop += 1; continue
        p = parse_row(r)
        if p:
            out.append(p)
        else:
            drop += 1
    cols = ['axis', 'rel', 'name', 'y', 'm', 'd', 'seq', 'ptype', 'client', 'w', 'h', 'qty', 'flag']
    with open(os.path.join(S, 'parsed_extra.csv'), 'w', newline='', encoding='utf-8') as f:
        wr = csv.DictWriter(f, fieldnames=cols); wr.writeheader(); wr.writerows(out)
    ns = sum(1 for r in out if r['w'])
    nc = sum(1 for r in out if r['client'])
    print(f'입력 {len(rows):,} · 제외 {drop:,}(.cnn 중복·선명·날짜불명) · 출력 {len(out):,}')
    print(f'  규격 확보 {ns:,} ({ns/max(len(out),1):.0%}) · 거래처 확보 {nc:,} ({nc/max(len(out),1):.0%})')
    from collections import Counter
    print('  축별:', dict(Counter(r['axis'] for r in out)))
    for r in out[:6]:
        print(f"   {r['axis']} {r['y']}-{r['m']:02d}-{r['d']:02d} 거래처={r['client']} "
              f"유형={r['ptype']} {r['w']}x{r['h']}")


if __name__ == '__main__':
    main()
