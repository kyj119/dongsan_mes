# -*- coding: utf-8 -*-
"""Z: 작업파일명 파서 v1 — 파싱률 측정용.

입력: zfiles.csv (axis, rel, name, mtime, size)
출력: parsed.csv + 콘솔 요약

파일명 문법(관찰된 것):
  27-(수정)(솔벤현수막)연안애드마트-농협공판장(506X92-1장)사방접어미싱_13일 오전직배.eps
  |  |     |            |          |        |            |          납기·배송
  |  |     |            |          |        |            후가공
  |  |     |            |          |        규격(cm)+수량
  |  |     |            |          건명
  |  |     |            거래처
  |  |     제품유형
  |  상태플래그
  그날 접수순번

폴더 컨텍스트도 정보원이다:
  2026년\08월\11일\방문,직배\15-모든광고-노랑통닭…\(포맥스3T)…(102x21-1장)뒷면.eps
  → 날짜·배송구분·순번·거래처는 폴더에, 제품·규격은 파일에.
"""
import csv, re, sys, io, os
from collections import Counter

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

SCRATCH = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(SCRATCH, 'zfiles.csv')
OUT = os.path.join(SCRATCH, 'parsed.csv')

# ── 정규식 ──────────────────────────────────────────────
# 경로의 연·월·일 (2026년 / 2026년도, 08월, 11일)
RX_Y = re.compile(r'(20\d\d)\s*년도?')
RX_M = re.compile(r'(\d{1,2})\s*월')
RX_D = re.compile(r'(\d{1,2})\s*일')
# 선두 접수순번
RX_SEQ = re.compile(r'^\s*(\d{1,3})\s*-')
# 규격: WxH. 괄호는 있을 수도(오타로 한쪽이 빠지기도) 없을 수도 있다.
#   (506X92-1장) (120-91) (2000x122) (59.2x84-4장) 타일마감243x81-1번)
#   (330x474-고주파접합 1장)  (110-192.5-1장)  (80-300-2장)
RX_SPEC_X = re.compile(r'(\d{1,4}(?:\.\d+)?)\s*[xX*×]\s*(\d{1,4}(?:\.\d+)?)')
# dash 형은 괄호 안으로 한정한다(날짜·전화번호 오검출 차단)
RX_SPEC_DASH = re.compile(r'\(\s*(\d{2,4}(?:\.\d+)?)\s*-\s*(\d{2,4}(?:\.\d+)?)\s*(?=[-)])')
# 수량 — 규격 뒤 꼬리에서 찾는다. 사이에 후가공 텍스트가 낄 수 있다("고주파접합 1장")
RX_QTY = re.compile(r'(\d+)\s*(?:장|번|개|EA|ea)')
# 상태 플래그
RX_FLAG = re.compile(r'\((수정|재출력|재|샘플|추가)\)')
# 괄호 토큰 전부
RX_PAREN = re.compile(r'\(([^()]*)\)')


def is_spec_token(t: str) -> bool:
    """괄호 내용이 규격인가 — WxH 를 품고 있거나 숫자·수량어만으로 이뤄졌으면 규격."""
    t = t.strip()
    if RX_SPEC_X.search(t):
        return True
    return bool(re.fullmatch(r'[\d.\s\-]+(?:장|번|개)?', t))


def parse_date(path: str):
    """경로에서 연/월/일 추출. 폴더 계층 어디에 있든 순서대로 찾는다."""
    parts = path.split('\\')
    y = m = d = None
    for p in parts:
        if y is None:
            mo = RX_Y.search(p)
            if mo:
                y = int(mo.group(1)); continue
        if y is not None and m is None:
            mo = RX_M.search(p)
            if mo:
                m = int(mo.group(1)); continue
        if m is not None and d is None:
            mo = RX_D.search(p)
            if mo:
                d = int(mo.group(1)); continue
    return y, m, d


def parse_spec(text: str):
    """규격+수량. 'x' 형이 우선, 없으면 괄호 안 '-' 형.

    수량은 규격 바로 뒤 ~ 닫는 괄호 사이에서 찾는다. 그 사이에 후가공 텍스트가
    끼어드는 경우가 실재한다: `(330x474-고주파접합 1장)`.
    """
    mo = RX_SPEC_X.search(text)
    if not mo:
        mo = RX_SPEC_DASH.search(text)
    if not mo:
        return None, None, None
    w, h = float(mo.group(1)), float(mo.group(2))
    tail = text[mo.end():]
    cut = tail.find(')')
    seg = tail[:cut] if cut >= 0 else tail[:30]
    q = RX_QTY.search(seg)
    return w, h, int(q.group(1)) if q else None


def parse_type_client(name: str):
    """제품유형(선두 괄호)과 그 뒤 거래처 문자열.

    ★선두로 앵커한다. 아무 괄호나 집으면 꼬리의 납기 표기가 제품유형으로 둔갑한다
    (v1 에서 `10일 오전직배` 194건이 제품유형 상위권에 올랐다).
    순번(`27-`)과 상태플래그(`(수정)`)는 벗겨내고 본다.
    """
    s = RX_SEQ.sub('', name, count=1).strip()
    while True:
        mo = RX_FLAG.match(s)
        if not mo:
            break
        s = s[mo.end():].strip()

    mo = RX_PAREN.match(s)
    if not mo:
        return None, None
    tok = mo.group(1).strip()
    if not tok or is_spec_token(tok):
        return None, None

    ptype = tok
    client = None
    rest = s[mo.end():]
    # 거래처 = 다음 '-' 또는 '(' 또는 '_' 전까지
    m2 = re.match(r'\s*([^-(\[_]{1,25})', rest)
    if m2:
        c = m2.group(1).strip()
        if c and not c[0].isdigit():
            client = c
    return ptype, client


def parse_row(axis: str, rel: str, name: str):
    path_dirs = rel[:rel.rfind('\\')] if '\\' in rel else ''
    base = name.rsplit('.', 1)[0]
    full_ctx = axis + '\\' + rel

    y, m, d = parse_date(full_ctx)

    # 순번: 파일명 선두 → 없으면 가장 안쪽 폴더 선두
    seq = None
    mo = RX_SEQ.match(base)
    if mo:
        seq = int(mo.group(1))
    else:
        for seg in reversed(path_dirs.split('\\')):
            mo = RX_SEQ.match(seg)
            if mo:
                seq = int(mo.group(1)); break

    w, h, qty = parse_spec(base)
    ptype, client = parse_type_client(base)

    # 파일에 제품유형·거래처가 없으면 폴더에서 승계
    if (ptype is None or client is None) and path_dirs:
        for seg in reversed(path_dirs.split('\\')):
            pt2, cl2 = parse_type_client(seg)
            if ptype is None and pt2:
                ptype = pt2
            if client is None and cl2:
                client = cl2
            if ptype and client:
                break
        # 폴더가 `15-모든광고-노랑통닭…` 처럼 괄호 없이 순번-거래처 형태인 경우
        if client is None:
            for seg in reversed(path_dirs.split('\\')):
                mo = re.match(r'^\s*\d{1,3}\s*-\s*([^-(\[_]{1,25})', seg)
                if mo:
                    c = mo.group(1).strip()
                    if c and not c[0].isdigit():
                        client = c; break

    flag = RX_FLAG.search(base)
    return {
        'axis': axis, 'rel': rel, 'name': name,
        'y': y, 'm': m, 'd': d, 'seq': seq,
        'ptype': ptype, 'client': client,
        'w': w, 'h': h, 'qty': qty,
        'flag': flag.group(1) if flag else None,
    }


def main():
    rows = []
    with open(SRC, encoding='utf-8-sig', newline='') as f:
        for r in csv.DictReader(f):
            rows.append(parse_row(r['axis'], r['rel'], r['name']))

    n = len(rows)
    have = lambda k: sum(1 for r in rows if r[k] is not None)
    date_ok = sum(1 for r in rows if r['y'] and r['m'] and r['d'])
    spec_ok = sum(1 for r in rows if r['w'] and r['h'])
    core = sum(1 for r in rows if r['y'] and r['m'] and r['d'] and r['w'] and r['h'] and r['client'])

    print(f'총 파일           {n:,}')
    print(f'  날짜(년월일)    {date_ok:,}  ({date_ok/n:.1%})')
    print(f'  접수순번        {have("seq"):,}  ({have("seq")/n:.1%})')
    print(f'  제품유형        {have("ptype"):,}  ({have("ptype")/n:.1%})')
    print(f'  거래처          {have("client"):,}  ({have("client")/n:.1%})')
    print(f'  규격            {spec_ok:,}  ({spec_ok/n:.1%})')
    print(f'  수량            {have("qty"):,}  ({have("qty")/n:.1%})')
    print(f'  ─ 핵심4(날짜+규격+거래처) {core:,}  ({core/n:.1%})')

    print('\n상위 제품유형 15:')
    for t, c in Counter(r['ptype'] for r in rows if r['ptype']).most_common(15):
        print(f'  {c:5}  {t}')

    print('\n규격 없는 샘플 10:')
    k = 0
    for r in rows:
        if not (r['w'] and r['h']):
            print('  ', r['name'][:90]); k += 1
            if k >= 10:
                break

    with open(OUT, 'w', encoding='utf-8', newline='') as f:
        wtr = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        wtr.writeheader()
        wtr.writerows(rows)
    print(f'\n저장: {OUT}')


if __name__ == '__main__':
    main()
