# -*- coding: utf-8 -*-
"""확정 적용분과 잔여 판단분만 뽑아 보여준다 (매핑표 검토용)."""
import csv, io, os, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
S = os.path.dirname(os.path.abspath(__file__))
rows = list(csv.DictReader(open(os.path.join(S, 'item_map_draft.csv'), encoding='utf-8-sig')))

print('══ 확정 적용분 ' + '═' * 60)
print(f'{"확신도":<9}{"건수":>5}  {"파일 표기":<26}{"품목코드":<14}{"품목명":<20}후가공')
for r in rows:
    if r['확신도'] in ('확정', '신규필요'):
        print(f'  {r["확신도"]:<8}{int(r["건수"]):>5,}  {r["파일표기"][:24]:<26}'
              f'{r["제안_품목코드"][:12]:<14}{r["제안_품목명"][:18]:<20}{r["후가공"][:24]}')

rest = [r for r in rows if r['확신도'] == '확인필요']
print(f'\n══ 잔여 판단분 {len(rest)}종 {sum(int(r["건수"]) for r in rest):,}건 ' + '═' * 40)
for r in sorted(rest, key=lambda x: -int(x['건수'])):
    print(f'  {int(r["건수"]):>4,}  {r["파일표기"][:28]:<30} 예: {r["예시파일"][:40]}')
