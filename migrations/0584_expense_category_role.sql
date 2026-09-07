-- 0584: 계정의 「역할」을 **이름 문자열**이 아니라 데이터로
--
-- 손익에서 무엇이 빠지는지를 지금은 계정 **이름**이 정한다(`CAT_ROLE`, routes/financialReports.ts +
-- scripts/finance-diagnose.cjs 사본 쌍). 이름으로만 손익 밖에 있는 금액이 prod 실측 12.3억이다:
--   차입금상환 4.3억 · 가수금 2.06억 · 리스료 1.73억 · 차입금 1.2억 · 보증금 1.0억 ·
--   부가세 0.94억 · 유형자산취득 0.44억 · 법인세 0.14억 · 공제부금 0.04억
--
-- 이 구조가 실제로 부러졌다 — 2026-09-07 하루에 계정 이름을 세 번 바꿨고(0578 통합 · 0579 표준화 ·
-- 0583 차입/상환 분리), 매번 **두 파일의 배열**을 손으로 따라 고쳐야 했다. 한 번만 빠뜨렸으면
-- 4.3억이 조용히 판관비가 됐을 것이다. 타입체크도 smoke 도 이걸 못 잡는다 — 숫자만 틀린다.
--
-- 역할: SGA(판관비, 기본) · COGS(매출원가) · NONOP(영업외) · TAX(법인세) · NOT_EXPENSE(비용 아님)
--
-- ★기본값이 SGA 인 이유 — 새 계정을 만들고 역할을 안 고르면 **비용으로 잡힌다**. 반대로 두면
--   비용 누락(영업이익 과대)이 되는데, 그건 화면에서 아무 티가 안 난다. 과대계상은 숫자가 움직여
--   눈에 띈다. 「틀리더라도 보이는 쪽」으로 떨어뜨린다.
--
-- 백필 근거는 추측이 아니라 배포 중인 CAT_ROLE 목록 그대로다(이름 완전일치 = roleOf 와 동일 판정).
-- 검증 = 배포 전/후 손익 총액이 같아야 한다.

ALTER TABLE expense_categories ADD COLUMN role TEXT NOT NULL DEFAULT 'SGA';

UPDATE expense_categories SET role = 'COGS'
 WHERE name IN ('원재료비', '외주가공비');

UPDATE expense_categories SET role = 'NONOP'
 WHERE name IN ('이자비용', '기부금');

UPDATE expense_categories SET role = 'TAX'
 WHERE name IN ('법인세');

-- 돈은 나가지만 비용이 아닌 현금흐름 — 부채 상환·차입 실행·예수금·자산 취득·리스료(차입 원금)
UPDATE expense_categories SET role = 'NOT_EXPENSE'
 WHERE name IN ('차입금상환', '차입금', '대출상환', '대출금', '부가세', '가수금', '가지급금',
                '보증금', '유형자산취득', '리스료', '공제부금');
