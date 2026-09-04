# -*- coding: utf-8 -*-
"""출력 이벤트 → 주문 라인 소급 매칭 (print_events.order_number / card_id 채우기)

왜 필요한가
  LogWatcher 는 RIP 에 들어간 **파일명**만 본다. 디자이너는 주문이 생기기 전에 파일을 만들어서
  파일명에 주문번호(E{n}-YYYYMMDD-NNN-FFF)를 심을 수가 없다 → resolveCard 1차 패스가 통째로
  비어 있고, 2차(print_file_map 직접 일치)도 등록 행이 있어야 동작한다.
  prod 실측(2026-09-04): print_events 10,095건 중 order_number 보유 **1건**.

무엇을 근거로 붙이나 — 파일명이 이미 4축을 담고 있다
    "12-삼성간판-삼성면주민자치회 02 (518X180-1장)양옆웰빙끈40mm-1일 화물"
      └ 출력순번  └ 거래처   └ 내용(현장명)   └ 규격 └ 수량 └ 후가공·납품

  ★앵커는 규격이다(숫자라 표기가 안 흔들린다). 거래처·내용은 오타·약칭이 흔해서 앵커가 못 된다.
    → 규격으로 후보를 좁히고, 거래처/내용으로 고른다. 반대로 하면 후보가 폭발한다.
    (같은 결론이 [[project-order-file-matching]] EPS 백테스트에서도 나왔다)

정확도 근거 = 수량 자기정합성
  수량은 점수에 **가산점으로만** 넣는다(하드 조건 아님). 그래서 「이 주문라인에 붙은 파일들의
  수량 합 == 주문 수량」이 맞아떨어지면 그건 독립적인 검증이다. 실측 87.6%
  (예: 로운시스템 150x150 **54장** ← `오토캠핑01`~`54` 파일 54개가 정확히 붙었다)

사용법
  python scripts/print-order-backfill.py               # dry-run · 통계만
  python scripts/print-order-backfill.py --csv out.csv # 점검용 표 뽑기
  python scripts/print-order-backfill.py --commit      # prod 적재(SQL 생성 후 wrangler 실행)
  python scripts/print-order-backfill.py --revert      # 소급분 전량 철회

  --local 로 로컬 D1 대상. --tiers AB 로 반영 등급 조정(기본 AB).

⚠️ print_file_map 에는 쓰지 않는다 — 미래 매칭 인덱스라 과거 추정이 들어가면
   같은 파일명이 다른 주문으로 다시 들어올 때 옛 주문에 조용히 붙는다. 상세 = migrations/0564.
"""
import argparse, collections, json, os, re, subprocess, sys, tempfile, unicodedata
from datetime import date

DB = "webapp-production"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# ── D1 ────────────────────────────────────────────────────────────────────────
def d1(sql, local=False, is_file=False):
    cmd = ["npx", "wrangler", "d1", "execute", DB, "--json",
           "--local" if local else "--remote", "--file" if is_file else "--command", sql]
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True,
                       encoding="utf-8", errors="replace", shell=(os.name == "nt"))
    out = r.stdout or ""
    i = out.find("[")
    if i < 0:
        raise SystemExit(f"D1 실패: {(r.stderr or out)[:600]}")
    data = json.loads(out[i:])
    if isinstance(data, dict) and data.get("error"):
        raise SystemExit(f"D1 오류: {data['error']}")
    return data[0].get("results", [])


# ── 정규화·유사도 ─────────────────────────────────────────────────────────────
_ST = re.compile(r'\(주\)|㈜|주식회사|\(유\)|유한회사|[\s.,·\-_/]')
def norm(s):
    return _ST.sub('', unicodedata.normalize('NFC', str(s or ''))).lower()

def _bg(s):
    return {s[i:i + 2] for i in range(len(s) - 1)}

def sim(a, b):
    """containment — a 의 bigram 중 몇 %가 b 안에 있나.
    Dice 를 쓰면 짧은 이름을 긴 파일명에 댈 때 분모가 커져 무조건 떨어진다
    ('셀프인테리어' vs '솔벤시트센프인테리어출력만' = 0.33) → 오타를 못 잡는다."""
    A = _bg(a)
    return 0.0 if not A else len(A & _bg(b)) / len(A)


# ── 파일명 파싱 ───────────────────────────────────────────────────────────────
NOISE = re.compile(r'(예약용|공백파일|UNMATCHED-|MESPROBE|^네스팅|^테스트|컬러차트|컬러\s*샘플)', re.I)
# 닫는 괄호는 선택 — 파일명이 잘려 들어온 사례가 실재한다("…쿠션 테스트(111X67")
SPEC = re.compile(r'[\(\[]\s*(\d{1,4}(?:\.\d+)?)\s*[xX*\-×]\s*(\d{1,4}(?:\.\d+)?)'
                  r'(?:\s*[-,]\s*(\d{1,5})\s*(장|조|개|벌|매|셋)?)?')
LEAD = re.compile(r'^\s*(?:\d{1,3}\s*[-.]\s*)+')        # "12-" = 그날 출력 순번(주문번호 아님)
PARENS = re.compile(r'^\s*\([^)]{0,30}\)\s*')           # "(자작12T양출)", "(패트배너)" = 재질 메모

def parse(fn):
    base = re.sub(r'\.[^.]+$', '', str(fn or '').strip())
    if not base or NOISE.search(base):
        return None
    m = SPEC.search(base)
    if not m:
        return None
    head = base[:m.start()]
    for _ in range(3):                                   # 순번·재질메모가 겹쳐 붙는다
        h2 = PARENS.sub('', LEAD.sub('', head))
        if h2 == head:
            break
        head = h2
    return dict(w=float(m.group(1)), h=float(m.group(2)),
                qty=int(m.group(3)) if m.group(3) else None,
                head=head.strip(), tail=base[m.end():].strip())


# ── 장비 축 ↔ 품목 축 (판단이 아니라 눈금 — 불일치는 감점만) ──────────────────
AXIS = [(re.compile(r'^FLEXI'), re.compile(r'솔벤|시트|후렉스|배너|현수막')),
        (re.compile(r'^HSM'), re.compile(r'현수막|수성|합성지|천|족자')),
        (re.compile(r'^TRANS'), re.compile(r'전사|태극기|깃발|기|천')),
        (re.compile(r'^(FLAT|UV)'), re.compile(r'UV|평판|아크릴|폼|포맥스|자석'))]


class Matcher:
    BACK, FWD = 21, 14      # 주문일이 출력일보다 최대 21일 앞 / 14일 뒤(판매전표는 출고 후에 끊긴다)

    def __init__(self, local=False):
        self.clients = {c["id"]: c for c in d1(
            "SELECT id, client_name, search_keywords FROM clients", local)}
        self.cname = {i: norm(c["client_name"]) for i, c in self.clients.items()}
        self.alias = collections.defaultdict(set)
        for i, c in self.clients.items():
            for k in re.split(r'[,\n;|]', c.get("search_keywords") or ''):
                if len(norm(k)) >= 2:
                    self.alias[i].add(norm(k))
        self.lines = d1(
            "SELECT oi.id AS oi_id, oi.order_id, o.order_number, o.order_date, o.client_id,"
            " c.client_name, oi.item_name, oi.content, oi.width, oi.height, oi.quantity, oi.amount"
            " FROM order_items oi JOIN orders o ON o.id = oi.order_id"
            " LEFT JOIN clients c ON c.id = o.client_id"
            " WHERE o.order_date >= '2026-06-01' AND COALESCE(o.is_voucher, 0) = 0", local)
        self.cards = collections.defaultdict(list)
        for cd in d1("SELECT id AS card_id, card_number, order_id, width, height FROM cards", local):
            if cd.get("order_id"):
                self.cards[cd["order_id"]].append(cd)
        self.spec = collections.defaultdict(list)
        for L in self.lines:
            L["_nc"] = norm(L.get("content") or '')
            w, h = self._n(L.get("width")), self._n(L.get("height"))
            if w > 0 and h > 0:
                a, b = sorted((w, h))
                self.spec[(round(a * 2) / 2, round(b * 2) / 2)].append(L)

    @staticmethod
    def _n(v):
        try:
            return float(v or 0)
        except Exception:
            return 0.0

    def _cands(self, w, h):
        a, b = sorted((w, h))
        out, seen = [], set()
        for da in (0, .5, -.5, 1, -1):
            for db in (0, .5, -.5, 1, -1):
                k = (round((a + da) * 2) / 2, round((b + db) * 2) / 2)
                if k in seen:
                    continue
                seen.add(k)
                for L in self.spec.get(k, []):
                    out.append((L, 2 if (da == 0 and db == 0) else 1))
        return out

    @staticmethod
    def _dd(od, pdt):
        try:
            y1, m1, d1_ = map(int, od[:10].split('-'))
            y2, m2, d2_ = map(int, pdt[:10].split('-'))
            return (date(y2, m2, d2_) - date(y1, m1, d1_)).days
        except Exception:
            return 999

    def _client(self, hn, L):
        cid = L.get("client_id")
        if not cid:
            return 0
        for k in [self.cname.get(cid, '')] + sorted(self.alias.get(cid, ()), key=len, reverse=True):
            if len(k) >= 2 and k in hn:
                return 3                                  # 마스터명·별칭이 통째로 들어 있다
        base = self.cname.get(cid, '')
        for n in range(len(base), 2, -1):
            if base[:n] in hn:
                return 2                                  # 파일명이 줄여 썼다(전망대365 ⊂ 전망대365광고)
        return 1 if len(base) >= 3 and sim(base, hn) >= 0.6 else 0

    _TOK = re.compile(r'[\s,\-_/()\[\]+]+')

    def _content(self, hay, L):
        ct = L.get("_nc") or ''
        if len(ct) < 2:
            return 0
        if ct in hay:
            return 3
        toks = [t for t in (norm(x) for x in self._TOK.split(L.get("content") or '')) if len(t) >= 2]
        if any(t in hay for t in toks):
            return 2
        best = max([sim(ct, hay)] + [sim(t, hay) for t in toks] or [0])
        return 1 if best >= 0.6 else 0                    # 오타 흡수(센프 ↔ 셀프)

    @staticmethod
    def _axis(equip, L):
        for pat, ipat in AXIS:
            if pat.match(str(equip or '')):
                return 1 if ipat.search(L.get("item_name") or '') else -1
        return 0

    def _card(self, L):
        cs = self.cards.get(L["order_id"]) or []
        if not cs:
            return None
        lw, lh = self._n(L.get("width")), self._n(L.get("height"))
        for cd in cs:
            if abs(self._n(cd.get("width")) - lw) < 0.6 and abs(self._n(cd.get("height")) - lh) < 0.6:
                return cd
        return cs[0] if len(cs) == 1 else None

    def run(self, events):
        groups = collections.defaultdict(list)
        for e in events:
            fn = (e.get("file_name") or "").strip()
            if fn:
                groups[(e.get("entity_id") or 1, fn)].append(e)
        st, res = collections.Counter(), []
        for (ent, fn), evs in groups.items():
            p = parse(fn)
            if not p:
                st["파싱실패"] += 1
                st["ev_파싱실패"] += len(evs)
                continue
            st["파싱성공"] += 1
            pdt = min((e.get("print_completed_at") or "9999") for e in evs)
            equip = collections.Counter(e.get("equipment_id") or '' for e in evs).most_common(1)[0][0]
            hn = norm(p["head"] + ' ' + p["tail"])
            cands = []
            for L, sh in self._cands(p["w"], p["h"]):
                d = self._dd(L.get("order_date") or '', pdt)
                if d > self.BACK or d < -self.FWD:
                    continue
                cs, ct = self._client(hn, L), self._content(hn, L)
                if cs == 0 and ct == 0:
                    continue                              # 규격만으로는 절대 붙이지 않는다
                sc = sh * 3 + cs * 2 + ct * 1.5 - abs(d) * 0.15 + self._axis(equip, L) * 0.5
                if p["qty"] and self._n(L.get("quantity")) in (p["qty"], p["qty"] * 2):
                    sc += 1                               # 가산점만 — 하드조건이면 검증축이 사라진다
                cands.append((sc, sh, cs, ct, d, L))
            if not cands:
                st["후보없음"] += 1
                st["ev_후보없음"] += len(evs)
                continue
            cands.sort(key=lambda x: (-x[0], abs(x[4])))
            t = cands[0]
            tier = ("A" if (t[1] == 2 and t[2] >= 2 and t[3] >= 2) else
                    "B" if (t[1] == 2 and (t[2] >= 2 or t[3] >= 2)) else
                    "C" if (t[2] >= 1 and t[3] >= 1) else "D")
            cd = self._card(t[5])
            st["매칭"] += 1
            st["ev_매칭"] += len(evs)
            st["tier_" + tier] += 1
            st["ev_tier_" + tier] += len(evs)
            res.append(dict(fn=fn, ent=ent, n_ev=len(evs), tier=tier, score=round(t[0], 2),
                            gap=round(t[0] - cands[1][0], 2) if len(cands) > 1 else 99.0,
                            n_cand=len(cands), equip=equip, dd=t[4],
                            oi_id=t[5]["oi_id"], order_number=t[5]["order_number"],
                            order_date=t[5]["order_date"], client=t[5]["client_name"],
                            item=t[5]["item_name"], content=t[5]["content"],
                            lw=t[5]["width"], lh=t[5]["height"], lq=t[5]["quantity"],
                            card_id=(cd or {}).get("card_id"), card_number=(cd or {}).get("card_number")))
        return st, res, sum(len(v) for v in groups.values())


def qty_consistency(res):
    """수량 자기정합성 — 점수에 가산점으로만 들어갔으므로 독립 검증축이다."""
    Q = re.compile(r'[\(\[]\s*\d{1,4}(?:\.\d+)?\s*[xX*\-×]\s*\d{1,4}(?:\.\d+)?\s*[-,]\s*(\d{1,5})')
    by = collections.defaultdict(list)
    for r in res:
        by[r["oi_id"]].append(r)
    ok = tot = 0
    for oi, rs in by.items():
        lq = rs[0]["lq"] or 0
        if not lq:
            continue
        tot += 1
        s = sum(int(Q.search(r["fn"]).group(1)) if Q.search(r["fn"]) else 1 for r in rs)
        if abs(s - lq) <= lq * 0.02 or abs(s - lq * 2) <= max(1, lq * 0.05):
            ok += 1
    return ok, tot


def sql_lit(s):
    return "'" + str(s).replace("'", "''") + "'"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--local", action="store_true")
    ap.add_argument("--commit", action="store_true", help="prod 적재")
    ap.add_argument("--revert", action="store_true", help="소급분 전량 철회")
    ap.add_argument("--tiers", default="AB")
    ap.add_argument("--csv")
    a = ap.parse_args()

    if a.revert:
        print(d1("UPDATE print_events SET order_number = NULL, card_id = NULL, card_number = NULL,"
                 " match_method = NULL WHERE match_method LIKE 'BACKFILL%'", a.local))
        print("소급 매칭 철회 완료")
        return

    events = d1("SELECT id, file_name, equipment_id, print_completed_at, entity_id, order_number"
                " FROM print_events", a.local)
    m = Matcher(a.local)
    st, res, tot = m.run(events)
    print(f"파일명 그룹 {st['파싱성공'] + st['파싱실패']} · 이벤트 {tot}")
    print(f"  파싱 {st['파싱성공']} / 실패 {st['파싱실패']}(ev {st['ev_파싱실패']}) · 후보없음 {st['후보없음']}")
    print(f"  매칭 {st['매칭']}건 · 파일 {st['매칭'] * 100.0 / max(1, st['파싱성공']):.1f}%"
          f" · 이벤트 {st['ev_매칭'] * 100.0 / max(1, tot):.1f}%")
    for T in "ABCD":
        print(f"    tier {T}: 파일 {st['tier_' + T]:5d} · 이벤트 {st['ev_tier_' + T]:5d}")
    sel = [r for r in res if r["tier"] in a.tiers]
    ok, qtot = qty_consistency(sel)
    print(f"  [tier {a.tiers}] 파일 {len(sel)} · 이벤트 {sum(r['n_ev'] for r in sel)}"
          f" · 주문라인 {len({r['oi_id'] for r in sel})} · 카드 {len({r['card_id'] for r in sel if r['card_id']})}")
    print(f"  수량 자기정합성 {ok}/{qtot} = {ok * 100.0 / max(1, qtot):.1f}%")

    if a.csv:
        import csv
        with open(a.csv, "w", encoding="utf-8-sig", newline="") as f:
            w = csv.writer(f)
            w.writerow(["tier", "파일명", "이벤트수", "장비", "주문번호", "주문일", "거래처", "품목",
                        "내용", "규격", "수량", "점수", "2위차", "후보수", "card_id", "order_item_id"])
            for r in sorted(sel, key=lambda x: (x["tier"], -x["n_ev"])):
                w.writerow([r["tier"], r["fn"], r["n_ev"], r["equip"], r["order_number"], r["order_date"],
                            r["client"], r["item"], r["content"], f"{r['lw']}x{r['lh']}", r["lq"],
                            r["score"], r["gap"], r["n_cand"], r["card_id"] or "", r["oi_id"]])
        print(f"  CSV → {a.csv}")

    if not a.commit:
        print("\n(dry-run — 적재하려면 --commit)")
        return

    # order_number IS NULL 조건 = 멱등. 에이전트가 심은 확정 매칭을 절대 덮지 않는다.
    stmts = []
    for r in sel:
        noext = re.sub(r'\.[^.]+$', '', r["fn"])
        card = f"card_id = {r['card_id']}, card_number = {sql_lit(r['card_number'])}, " if r["card_id"] else ""
        stmts.append(
            f"UPDATE print_events SET order_number = {sql_lit(r['order_number'])}, {card}"
            f"match_method = 'BACKFILL_{r['tier']}' WHERE order_number IS NULL"
            f" AND COALESCE(entity_id, 1) = {int(r['ent'])}"
            f" AND (file_name = {sql_lit(r['fn'])} OR file_name = {sql_lit(noext)});")
    print(f"\n{len(stmts)}개 UPDATE 를 500개씩 나눠 적재합니다…")
    for i in range(0, len(stmts), 500):
        with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False,
                                         encoding="utf-8", dir=os.path.join(ROOT, "scripts")) as f:
            f.write("\n".join(stmts[i:i + 500]))
            path = f.name
        try:
            d1(path, a.local, is_file=True)
            print(f"  {i + 1}~{min(i + 500, len(stmts))} 적재")
        finally:
            os.unlink(path)
    # ⚠️ wrangler --file 은 성공해도 오류처럼 보이는 출력을 낸다 → 종료코드가 아니라 조회로 확인한다
    chk = d1("SELECT match_method, COUNT(*) n FROM print_events"
             " WHERE match_method IS NOT NULL GROUP BY 1", a.local)
    print("적재 결과:", chk)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
