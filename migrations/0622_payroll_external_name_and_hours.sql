-- 0622: 외부 시스템 이름(별칭) + 근태 시간 왕복 저장
--
-- [1] employees.external_name — 이카운트 등 외부 시스템에서 쓰는 이름
--   왜: 엑셀 입력이 성명으로 매칭하는데 두 시스템의 표기가 다르면 그 직원만 조용히 빠진다.
--   2026-09-17 실측: 이카운트 「꾸웅」 ↔ MES 「NGUYEN THUY CUONG」 이 매칭되지 않아
--   45명을 넣고 그 1명만 따로 넣어야 했다. 사번도 서로 다른 체계라(00105 ↔ DS-043) 대안이 못 된다.
--   한 번 넣어 두면 매달 반복되는 문제가 사라진다.
--
-- [2] payroll.night_hours / holiday_hours — 야간·휴일 **시간** 저장
--   왜: 지금은 금액(night_pay·holiday_pay)만 저장한다. 그래서 근태 수정 화면이 현재 시간을
--   표시할 수 없어 야간·휴일을 UI 에서 편집할 방법이 없었다(2026-09-17 이카운트 휴일근로
--   반영을 API 로 우회한 이유 — 니나잉 8월 52.5h·MAUNG MAUNG 42.5h).
--   금액은 시간에서 파생되므로 시간이 원본이다. 저장해 두면 라운드트립이 된다.
--   ※ 기존 행은 0 이다. 근태 동기화가 한 번 돌면 실제 값이 채워진다.

ALTER TABLE employees ADD COLUMN external_name TEXT;
ALTER TABLE payroll ADD COLUMN night_hours REAL DEFAULT 0;
ALTER TABLE payroll ADD COLUMN holiday_hours REAL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_employees_external_name ON employees(external_name);
