# -*- coding: utf-8 -*-
"""zscan-thumb.py — EPS 내장 프리뷰에서 썸네일 추출 → thumbs.jsonl

왜 일러스트레이터를 안 쓰나:
  기존 썸네일 경로(CEP 패널 mes-core.jsx)는 일러를 띄워 만든다. 새 작업엔 맞지만
  이미 Z: 에 쌓인 수천 건을 소급 생성하기엔 파일당 앱 왕복이 너무 비싸다.
  실측 결과 3축의 EPS 는 **100% DOS EPS 헤더에 TIFF 프리뷰를 품고 있다**(표본 359).
  그러면 바이트를 잘라 디코드만 하면 된다 — 일러가 필요 없다.

DOS EPS 헤더(30바이트):
  0  C5 D0 D3 C6   매직
  4  PS  오프셋/길이
  12 WMF 오프셋/길이
  20 TIFF 오프셋/길이   ← 이걸 쓴다
  28 체크섬

사용법:
  python scripts/zscan-thumb.py --from 2026-08-01 --to 2026-08-11
  python scripts/zscan-thumb.py --from … --to … --out thumbs.jsonl --max-px 480

출력 thumbs.jsonl: {"path": "<원본 절대경로>", "b64": "<jpeg base64>", "w":…, "h":…}
  → `node scripts/zscan-intake.cjs --thumbs thumbs.jsonl --commit` 가 읽어 intake 에 실어 보낸다.
"""
import argparse, base64, io, json, os, re, struct, sys
from datetime import date

try:
    from PIL import Image
except ImportError:
    sys.exit('Pillow 가 필요합니다: pip install Pillow')

ROOT = os.environ.get('ZSCAN_ROOT', 'Z:\\')
# ⚠️ 축 경로에 연도를 넣지 않는다(zscan-intake.cjs 와 같은 함정).
#    넣으면 그 폴더가 루트에 흡수돼 상대경로에서 사라지고, 날짜 파싱이 실패해
#    **축 전체가 조용히 탈락한다**(실측: 전사 썸네일 0건).
# 적재 스크립트(zscan-intake.cjs)와 **같은 원장**을 읽는다 — 둘이 갈리면
# 썸네일 없는 파일이 올라가거나 매번 전량 재추출이 된다.
LEDGER = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                      '.zscan-ledger.json')

AXES = [('★UV솔벤★', '★UV솔벤★'),
        ('★현수막-수성출력★', '★현수막-수성출력★'),
        ('메인1', os.path.join('메인1', '메인1'))]
EXT_OK = {'.eps', '.ai'}
# 연도 폴더 표기가 축마다 다르다: `2026년도`(수성) · `2026년`(UV솔벤) · `2026`(전사).
RX_Y = re.compile(r'^\s*(20\d\d)\s*(?:년도?)?\s*$')
RX_M = re.compile(r'(\d{1,2})\s*월')
RX_D = re.compile(r'(\d{1,2})\s*일')


def folder_date(rel):
    y = m = d = None
    for p in rel.split(os.sep):
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
    try:
        return date(y, m, d)
    except Exception:
        return None



def _day_roots(root, d0, d1):
    """축 루트에서 연/월/일 세 단계만 열거해 대상 날짜 폴더 목록을 만든다.
    폴더 표기는 축마다 다르다: `2026년도`(수성) · `2026년`(UV솔벤) · `2026`(전사)."""
    out = []

    def ls(d):
        try:
            return [e for e in os.scandir(d) if e.is_dir()]
        except OSError:
            return []

    for y in ls(root):
        my = RX_Y.match(y.name)
        if not my or not (d0.year <= int(my.group(1)) <= d1.year):
            continue
        for m in ls(y.path):
            mm = RX_M.search(m.name)
            if not mm:
                continue
            for dd in ls(m.path):
                md = RX_D.search(dd.name)
                if not md:
                    continue
                try:
                    dt = date(int(my.group(1)), int(mm.group(1)), int(md.group(1)))
                except ValueError:
                    continue
                if d0 <= dt <= d1:
                    out.append(dd.path)
    return out


def _read_ifd(raw):
    """최소 TIFF IFD 파서 — 첫 이미지의 태그만 뽑는다(리틀엔디안 전제, 관찰된 전량이 II)."""
    if raw[:4] != b'II\x2a\x00':
        return None
    ifd = struct.unpack('<I', raw[4:8])[0]
    if ifd + 2 > len(raw):
        return None
    n = struct.unpack('<H', raw[ifd:ifd + 2])[0]
    SZ = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8}
    tags = {}
    for i in range(n):
        e = raw[ifd + 2 + i * 12: ifd + 14 + i * 12]
        if len(e) < 12:
            break
        tag, typ, cnt = struct.unpack('<HHI', e[:8])
        need = SZ.get(typ, 1) * cnt
        blob = e[8:12] if need <= 4 else None
        if blob is None:
            o = struct.unpack('<I', e[8:12])[0]
            blob = raw[o:o + need]
        fmt = {1: 'B', 3: 'H', 4: 'I'}.get(typ)
        if fmt and len(blob) >= struct.calcsize('<' + fmt) * cnt:
            tags[tag] = struct.unpack('<' + fmt * cnt, blob[:struct.calcsize('<' + fmt) * cnt])
        else:
            tags[tag] = blob
    return tags


def _decode_palette_alpha(raw):
    """팔레트+알파 TIFF 를 손으로 푼다.

    일러스트레이터가 EPS 에 심는 프리뷰는 photometric=3(팔레트) + SamplesPerPixel=2(인덱스+알파)다.
    Pillow 의 OPEN_INFO 표에 이 조합이 없어 `UnidentifiedImageError` 로 죽는다
    (KeyError (b'II', 3, (1,), 1, (8,8), (1,))). 압축이 없어서(Compression=1)
    스트립을 그대로 잘라 팔레트를 입히면 된다.
    """
    t = _read_ifd(raw)
    if not t:
        return None
    g = lambda k, d=None: (t[k][0] if isinstance(t.get(k), tuple) and t[k] else d)
    w, h = g(256), g(257)
    if not (w and h) or g(259, 1) != 1 or g(262) != 3 or g(277, 1) != 2 or g(284, 1) != 1:
        return None                                  # 이 함수가 감당하는 형태가 아니다
    offs = t.get(273) or ()
    cnts = t.get(279) or ()
    if not offs:
        return None
    data = b''.join(raw[o:o + c] for o, c in zip(offs, cnts)) if cnts else raw[offs[0]:]
    if len(data) < w * h * 2:
        return None
    cmap = t.get(320)
    if not cmap or len(cmap) < 768:
        return None
    pal = bytes(bytearray(
        [cmap[i] >> 8 for i in range(256)] +          # R
        [cmap[256 + i] >> 8 for i in range(256)] +    # G
        [cmap[512 + i] >> 8 for i in range(256)]))    # B
    pal = bytes(b for triple in zip(pal[:256], pal[256:512], pal[512:768]) for b in triple)
    view = memoryview(data)[:w * h * 2]
    idx = Image.frombytes('P', (w, h), bytes(view[0::2]))
    idx.putpalette(pal)
    alpha = Image.frombytes('L', (w, h), bytes(view[1::2]))
    bg = Image.new('RGB', (w, h), (255, 255, 255))
    bg.paste(idx.convert('RGB'), mask=alpha)
    return bg


def extract(path, max_px, quality):
    """내장 TIFF 프리뷰 → 축소 JPEG base64. 프리뷰가 없으면 None."""
    with open(path, 'rb') as f:
        head = f.read(30)
        if len(head) < 30 or head[:4] != b'\xc5\xd0\xd3\xc6':
            return None                      # DOS 헤더가 아니면 프리뷰 슬롯 자체가 없다
        off, ln = struct.unpack('<II', head[20:28])
        if not (off and ln):
            return None
        f.seek(off)
        raw = f.read(ln)
    try:
        im = Image.open(io.BytesIO(raw))
        im.load()
    except Exception:
        im = _decode_palette_alpha(raw)      # Pillow 가 못 여는 팔레트+알파 폴백
        if im is None:
            return None
    # 흰 배경에 합성 — 프리뷰는 알파를 가진 경우가 있고, 그대로 JPEG 로 넘기면 검게 나온다
    if im.mode in ('RGBA', 'LA', 'P'):
        im = im.convert('RGBA')
        bg = Image.new('RGB', im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[-1])
        im = bg
    elif im.mode != 'RGB':
        im = im.convert('RGB')
    w, h = im.size
    im.thumbnail((max_px, max_px), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, 'JPEG', quality=quality, optimize=True)
    return base64.b64encode(buf.getvalue()).decode('ascii'), w, h, im.size


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--from', dest='d0', required=True)
    ap.add_argument('--to', dest='d1', required=True)
    ap.add_argument('--out', default='thumbs.jsonl')
    ap.add_argument('--max-px', type=int, default=480)
    ap.add_argument('--quality', type=int, default=72)
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--force', action='store_true', help='원장 무시(전량 재추출)')
    a = ap.parse_args()
    d0 = date(*[int(x) for x in a.d0.split('-')])
    d1 = date(*[int(x) for x in a.d1.split('-')])

    todo = []
    for name, sub in AXES:
        root = os.path.join(ROOT, sub)
        if not os.path.isdir(root):
            print(f'  ! 축 없음: {root}', file=sys.stderr); continue
        # ★축 루트 전체를 walk 하지 않는다 — Z: 는 네트워크 드라이브라 하루치를 뽑는 데도
        #   수천 항목을 SMB 로 훑어 매 실행 수십 초가 나간다(적재 쪽과 같은 함정, 실측 88s→0s).
        #   연/월/일 세 단계만 열거해 대상 날짜 폴더로 바로 내려간다.
        for day in _day_roots(root, d0, d1):
            for dp, _, fns in os.walk(day):
                for fn in fns:
                    if os.path.splitext(fn)[1].lower() in EXT_OK:
                        todo.append(os.path.join(dp, fn))
    if a.limit:
        todo = todo[:a.limit]

    # ── 원장으로 이미 올린 파일은 추출을 건너뛴다 ────────────────────────
    # 왜: 10분마다 돌리려면 매 실행이 몇 초여야 한다. 원장이 없으면 그날 252건의
    #     EPS 프리뷰를 매번 다시 디코딩한다(5MB·수십 초). 적재 쪽(`zscan-intake.cjs`)이
    #     쓰는 **같은 원장**을 읽어 「새로 생기거나 바뀐 파일」만 추출한다.
    #     원장은 캐시일 뿐이라 지워도 정확도에 영향이 없다(느려질 뿐) → --force 로 무시.
    if not a.force:
        led = {}
        try:
            with io.open(LEDGER, encoding='utf-8') as f:
                led = json.load(f)
        except Exception:
            led = {}
        if led:
            def stamp(p):
                try:
                    st = os.stat(p)
                    return f'{int(st.st_mtime * 1000)}:{st.st_size}'
                except OSError:
                    return None

            def skey(p):
                for name, sub in AXES:
                    root = os.path.join(ROOT, sub)
                    if p.startswith(root):
                        segs = os.path.relpath(p, root).replace('/', '\\').split('\\')
                        return '\\'.join([name] + segs[:3] + [segs[-1]])
                return None

            before = len(todo)
            todo = [p for p in todo if led.get(skey(p) or '') != stamp(p)]
            if before != len(todo):
                print(f'  원장 스킵 {before - len(todo):,}건 → 추출 대상 {len(todo):,}건',
                      file=sys.stderr)

    ok = skip = fail = 0
    tot_b = 0
    with open(a.out, 'w', encoding='utf-8') as out:
        for i, p in enumerate(todo, 1):
            try:
                r = extract(p, a.max_px, a.quality)
            except Exception:
                r = None
                fail += 1
            if not r:
                skip += 1
                continue
            b64, ow, oh, (tw, th) = r
            tot_b += len(b64)
            out.write(json.dumps({'path': p, 'b64': b64, 'w': tw, 'h': th,
                                  'src_w': ow, 'src_h': oh}, ensure_ascii=False) + '\n')
            ok += 1
            if i % 200 == 0:
                print(f'  {i:,}/{len(todo):,} …', file=sys.stderr)
    print(f'대상 {len(todo):,} · 추출 {ok:,} · 프리뷰 없음 {skip:,} · 실패 {fail:,}')
    if ok:
        print(f'평균 {tot_b/ok/1024:.1f}KB(base64) · 합계 {tot_b/1024/1024:.1f}MB → {a.out}')


if __name__ == '__main__':
    main()
