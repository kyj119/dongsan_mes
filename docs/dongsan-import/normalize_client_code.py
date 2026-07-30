# -*- coding: utf-8 -*-
"""동산기획 이카운트 이관 — 거래처코드 저장 규칙 정본 구현.

용준님 지시(2026-07-30): 동일 키 유지 · 사업자코드는 3-2-5 형식 고정 · 자리수 적은 것은 5자리.

규칙
  ①3-2-5  숫자 10자리 + 국세청 체크섬 OK  → client_code = brn = 'XXX-XX-XXXXX'
  ②5자리  숫자 5자리 이하                → client_code = zfill(5), brn = None (사업자번호 아님)
  ③미분류  그 외(6~9·11자리↑·체크섬 불일치·주민번호형·all-zero) → 수동 결정

왜 체크섬 게이트가 필요한가
  `031-980-2114`(인천지방조달청)은 숫자 10자리라 기계적으로는 `031-98-02114`가 되지만,
  실제로는 전화번호를 거래처코드 칸에 넣은 것이다. 게이트가 없으면 전화번호가
  사업자번호로 위장돼 세금계산서·회계 연동까지 흘러간다.

왜 all-zero를 배제하는가
  `000-00-00000`(기타거래처)은 체크섬을 통과하지만 더미 코드다. 상반기 매출 24.1M이
  여기 뭉쳐 있어 별도 판단이 필요하다.

⚠️ 주민등록번호형(6자리-7자리)은 client_code·brn·notes 어디에도 저장하지 말 것.
   개인정보이며 이 저장소는 PII 때문에 git 히스토리를 재작성한 전례가 있다.
   이 파일의 테스트 케이스도 실제 번호가 아닌 합성값을 쓴다.

검증 = `python normalize_client_code.py` (자체 테스트 12케이스)
"""
import re

_BRN = re.compile(r'^\d{3}-\d{2}-\d{5}$')
_RRN = re.compile(r'^\d{6}-\d{7}$')

RULE_BRN = '①3-2-5'
RULE_INTERNAL = '②5자리'
RULE_UNKNOWN = '③미분류'


def brn_checksum_ok(d10: str) -> bool:
    """국세청 사업자등록번호 검증식. d10 = 숫자 10자리 문자열."""
    if len(d10) != 10 or not d10.isdigit():
        return False
    w = (1, 3, 7, 1, 3, 7, 1, 3, 5)
    s = sum(int(d10[i]) * w[i] for i in range(9))
    s += (int(d10[8]) * 5) // 10
    return (10 - s % 10) % 10 == int(d10[9])


def normalize(code):
    """이카운트 거래처코드 → (client_code, business_registration_number, 규칙, 비고)"""
    c = (code or '').strip()
    d = re.sub(r'\D', '', c)

    if _RRN.match(c) or (len(d) == 13 and c.count('-') == 1):
        return None, None, RULE_UNKNOWN, '주민등록번호형 — 개인정보, 저장 불가'

    if len(d) == 10:
        f = f'{d[0:3]}-{d[3:5]}-{d[5:10]}'
        if set(d) == {'0'}:
            return None, None, RULE_UNKNOWN, f'더미 코드({f}) — 실제 거래처 아님'
        if not brn_checksum_ok(d):
            return None, None, RULE_UNKNOWN, f'10자리이나 체크섬 불일치({f}) — 사업자번호 아님'
        note = '' if _BRN.match(c) else f'원본 "{c}" → 하이픈 정규화'
        return f, f, RULE_BRN, note

    if 0 < len(d) <= 5:
        z = d.zfill(5)
        return z, None, RULE_INTERNAL, (f'원본 "{c}" → {z} / ' if z != c else '') + '사업자번호 아님(내부코드)'

    return None, None, RULE_UNKNOWN, f'숫자 {len(d)}자리 — 사업자번호(10)도 내부코드(≤5)도 아님'


if __name__ == '__main__':
    import sys
    sys.stdout.reconfigure(encoding='utf-8')
    CASES = [
        # (입력, 기대 client_code, 기대 brn, 기대 규칙)
        ('186-57-00706', '186-57-00706', '186-57-00706', RULE_BRN),      # 이미 3-2-5
        ('3080770452', '308-07-70452', '308-07-70452', RULE_BRN),        # 무하이픈 10자리
        ('305-8212294', '305-82-12294', '305-82-12294', RULE_BRN),       # 하이픈 위치 오타
        ('308-81-3163.4', '308-81-31634', '308-81-31634', RULE_BRN),     # 마침표 혼입
        ('031-980-2114', None, None, RULE_UNKNOWN),                       # 전화번호 (체크섬 실패)
        ('000-00-00000', None, None, RULE_UNKNOWN),                       # 더미
        ('00031', '00031', None, RULE_INTERNAL),                          # 내부코드 5자리
        ('31', '00031', None, RULE_INTERNAL),                             # zero-pad
        ('900101-1234567', None, None, RULE_UNKNOWN),                     # 주민번호형(합성값)
        ('202001070001', None, None, RULE_UNKNOWN),                       # 12자리 연번
        ('601-88-01590-1', None, None, RULE_UNKNOWN),                     # BRN+지점 접미(11자리)
        ('2024-05-24', None, None, RULE_UNKNOWN),                         # 날짜 8자리
    ]
    fail = 0
    for src, ec, eb, er in CASES:
        cc, bn, rule, note = normalize(src)
        ok = (cc == ec and bn == eb and rule == er)
        fail += 0 if ok else 1
        print(f'{"PASS" if ok else "FAIL":<5}{src:<18}→ code={str(cc):<15}brn={str(bn):<15}{rule:<10}{note}')
    print(f'\n{len(CASES) - fail}/{len(CASES)} PASS')
    sys.exit(1 if fail else 0)
