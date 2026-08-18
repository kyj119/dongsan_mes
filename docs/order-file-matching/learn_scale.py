# -*- coding: utf-8 -*-
"""배율 학습 — 파일명 규격 ÷ EPS BoundingBox = 실제 작업 배율.

발견: 큰 출력물은 1/5 등으로 축소해 아트보드를 만든다(일러스트 한계·작업 편의).
     그래서 BoundingBox 만으로는 규격을 못 정한다. 배율을 알아야 한다.

여기서 제품유형별 배율 관행을 학습해 두면, 파일명에 규격이 없는 파일도
BoundingBox × 배율 로 규격을 추정할 수 있다.
"""
import csv, re, os, sys, io, random
from collections import defaultdict, Counter

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
SCRATCH = os.path.dirname(os.path.abspath(__file__))
ROOT = {'★UV솔벤★': r'Z:\★UV솔벤★', '★현수막-수성출력★': r'Z:\★현수막-수성출력★'}
PER_TYPE = 40          # 제품유형별 표본
SNAP = [1, 2, 2.5, 4, 5, 10]   # 실무에서 쓸 법한 배율 후보

RXBB = re.compile(rb'%%(?:HiRes)?BoundingBox:\s*([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)')


def bbox_cm(path):
    """EPS 헤더에서 BoundingBox(pt) → cm. HiRes 가 있으면 그 값이 이긴다."""
    try:
        with open(path, 'rb') as f:
            head = f.read(8192)
    except Exception:
        return None
    best = None
    for m in RXBB.finditer(head):
        x0, y0, x1, y1 = [float(v) for v in m.groups()]
        w, h = (x1 - x0) * 2.54 / 72, (y1 - y0) * 2.54 / 72
        if w > 0 and h > 0:
            best = (w, h)
    return best


def snap(r):
    """배율을 실무 후보값으로 스냅. 5% 이내면 그 값으로 본다."""
    for s in SNAP:
        if abs(r - s) / s <= 0.05:
            return s
    return None


def main():
    rows = []
    with open(os.path.join(SCRATCH, 'parsed.csv'), encoding='utf-8') as f:
        for r in csv.DictReader(f):
            if r['w'] and r['h'] and r['ptype'] and float(r['w']) > 0 and float(r['h']) > 0:
                rows.append(r)

    by_type = defaultdict(list)
    for r in rows:
        by_type[r['ptype'].lower()].append(r)

    # 표본이 많은 제품유형부터
    types = sorted(by_type.items(), key=lambda kv: -len(kv[1]))[:34]
    random.seed(7)

    print(f'{"제품유형":<22} {"표본":>4} {"판독":>4}  배율 분포')
    print('─' * 78)
    table = {}
    total_read = total_snap = 0
    for t, lst in types:
        sample = random.sample(lst, min(PER_TYPE, len(lst)))
        ratios = []
        for r in sample:
            p = os.path.join(ROOT.get(r['axis'], ''), r['rel'])
            bb = bbox_cm(p)
            if not bb:
                continue
            fw, fh = float(r['w']), float(r['h'])
            bw, bh = bb
            # 가로세로 뒤바뀜 허용 — 둘 중 편차가 작은 쪽 채택
            cands = []
            for a, b in ((bw, bh), (bh, bw)):
                if a > 0 and b > 0:
                    rw, rh = fw / a, fh / b
                    cands.append((abs(rw - rh) / max(rw, rh), (rw + rh) / 2))
            if not cands:
                continue
            dev, ratio = min(cands)
            if dev > 0.08:      # 가로세로 배율이 서로 다르면 배율이 아니라 다른 그림
                continue
            ratios.append(ratio)

        total_read += len(ratios)
        snapped = [snap(x) for x in ratios]
        snapped = [s for s in snapped if s]
        total_snap += len(snapped)
        if not ratios:
            continue
        c = Counter(snapped)
        dist = '  '.join(f'×{k:g}:{v}' for k, v in c.most_common(4))
        top = c.most_common(1)[0] if c else (None, 0)
        table[t] = (top[0], top[1], len(ratios))
        print(f'{t[:22]:<22} {len(sample):>4} {len(ratios):>4}  {dist}')

    print('\n' + '─' * 78)
    print(f'배율 판독 {total_read:,} · 후보값으로 스냅 {total_snap:,} ({total_snap/max(total_read,1):.0%})')
    print('\n[학습된 제품유형별 대표 배율]')
    for t, (s, c, n) in sorted(table.items(), key=lambda kv: -kv[1][1]):
        if s:
            print(f'  ×{s:<4g} {c:>3}/{n:<3}  {t}')

    with open(os.path.join(SCRATCH, 'scale_table.csv'), 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f)
        w.writerow(['ptype', 'scale', 'support', 'read'])
        for t, (s, c, n) in table.items():
            if s:
                w.writerow([t, s, c, n])
    print('\n저장: scale_table.csv')


if __name__ == '__main__':
    main()
