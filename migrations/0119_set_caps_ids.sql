-- ACServer 사용자ID → MES 직원 caps_id 매핑
-- ACServer 스크린샷 기반 이름 매칭 (2026-04-11)
-- caps_id 형식: 4자리 zero-padded (e_idno 그대로)

-- 재직자 (ACTIVE)
UPDATE employees SET caps_id = '0035', caps_sync_enabled = 1 WHERE employee_code = 'DS-001'; -- 김용준
UPDATE employees SET caps_id = '0013', caps_sync_enabled = 1 WHERE employee_code = 'DS-002'; -- 김기섭
-- DS-003 정송엽: ACServer에 없음
-- DS-004 김진수: ACServer 0075는 "김진수 과장"으로 DS-030과 매칭. DS-004는 별도 확인 필요
UPDATE employees SET caps_id = '0005', caps_sync_enabled = 1 WHERE employee_code = 'DS-005'; -- 인호동
UPDATE employees SET caps_id = '0014', caps_sync_enabled = 1 WHERE employee_code = 'DS-006'; -- 윤진
UPDATE employees SET caps_id = '0007', caps_sync_enabled = 1 WHERE employee_code = 'DS-007'; -- 이명순
UPDATE employees SET caps_id = '0010', caps_sync_enabled = 1 WHERE employee_code = 'DS-008'; -- 송은정
UPDATE employees SET caps_id = '0020', caps_sync_enabled = 1 WHERE employee_code = 'DS-009'; -- 유정희
UPDATE employees SET caps_id = '0019', caps_sync_enabled = 1 WHERE employee_code = 'DS-010'; -- 장영석
-- DS-011 안혜옥: ACServer에 없음
UPDATE employees SET caps_id = '0001', caps_sync_enabled = 1 WHERE employee_code = 'DS-012'; -- 강지영
UPDATE employees SET caps_id = '0030', caps_sync_enabled = 1 WHERE employee_code = 'DS-013'; -- 모니르
UPDATE employees SET caps_id = '0021', caps_sync_enabled = 1 WHERE employee_code = 'DS-014'; -- 윤준엽
UPDATE employees SET caps_id = '0033', caps_sync_enabled = 1 WHERE employee_code = 'DS-015'; -- 장상복
UPDATE employees SET caps_id = '0002', caps_sync_enabled = 1 WHERE employee_code = 'DS-016'; -- 정해선
UPDATE employees SET caps_id = '0016', caps_sync_enabled = 1 WHERE employee_code = 'DS-017'; -- 신현서
UPDATE employees SET caps_id = '0040', caps_sync_enabled = 1 WHERE employee_code = 'DS-018'; -- 니나잉
UPDATE employees SET caps_id = '0076', caps_sync_enabled = 1 WHERE employee_code = 'DS-019'; -- 김보연
UPDATE employees SET caps_id = '0058', caps_sync_enabled = 1 WHERE employee_code = 'DS-020'; -- 김용덕
UPDATE employees SET caps_id = '0045', caps_sync_enabled = 1 WHERE employee_code = 'DS-021'; -- MUSTAF (ACServer: RAHMAN)
UPDATE employees SET caps_id = '0051', caps_sync_enabled = 1 WHERE employee_code = 'DS-022'; -- MOE KO CHIT
UPDATE employees SET caps_id = '0059', caps_sync_enabled = 1 WHERE employee_code = 'DS-023'; -- 정보람
UPDATE employees SET caps_id = '0063', caps_sync_enabled = 1 WHERE employee_code = 'DS-024'; -- MAUNG MAUNG
UPDATE employees SET caps_id = '0065', caps_sync_enabled = 1 WHERE employee_code = 'DS-025'; -- 신은주
-- DS-026 최상호: ACServer에 없음
UPDATE employees SET caps_id = '0070', caps_sync_enabled = 1 WHERE employee_code = 'DS-027'; -- 이득용
UPDATE employees SET caps_id = '0071', caps_sync_enabled = 1 WHERE employee_code = 'DS-028'; -- 이성용
UPDATE employees SET caps_id = '0074', caps_sync_enabled = 1 WHERE employee_code = 'DS-029'; -- 이희섭
UPDATE employees SET caps_id = '0075', caps_sync_enabled = 1 WHERE employee_code = 'DS-030'; -- 김진수과장
UPDATE employees SET caps_id = '0077', caps_sync_enabled = 1 WHERE employee_code = 'DS-031'; -- 김영주
UPDATE employees SET caps_id = '0078', caps_sync_enabled = 1 WHERE employee_code = 'DS-032'; -- 정소은
UPDATE employees SET caps_id = '0080', caps_sync_enabled = 1 WHERE employee_code = 'DS-033'; -- 최재영
UPDATE employees SET caps_id = '0082', caps_sync_enabled = 1 WHERE employee_code = 'DS-034'; -- 조영심
UPDATE employees SET caps_id = '0083', caps_sync_enabled = 1 WHERE employee_code = 'DS-035'; -- 예민
UPDATE employees SET caps_id = '0086', caps_sync_enabled = 1 WHERE employee_code = 'DS-036'; -- 최승인
UPDATE employees SET caps_id = '0085', caps_sync_enabled = 1 WHERE employee_code = 'DS-037'; -- 박운옥
UPDATE employees SET caps_id = '0087', caps_sync_enabled = 1 WHERE employee_code = 'DS-038'; -- 김성배
UPDATE employees SET caps_id = '0089', caps_sync_enabled = 1 WHERE employee_code = 'DS-039'; -- 임선미
UPDATE employees SET caps_id = '0091', caps_sync_enabled = 1 WHERE employee_code = 'DS-040'; -- 황찬별 (ACServer: 활잔벌)
UPDATE employees SET caps_id = '0094', caps_sync_enabled = 1 WHERE employee_code = 'DS-041'; -- 킨뚜자소
UPDATE employees SET caps_id = '0095', caps_sync_enabled = 1 WHERE employee_code = 'DS-042'; -- 서민쎌 (ACServer: 서민쌀)
UPDATE employees SET caps_id = '0097', caps_sync_enabled = 1 WHERE employee_code = 'DS-043'; -- NGUYEN THUY CUONG
UPDATE employees SET caps_id = '0098', caps_sync_enabled = 1 WHERE employee_code = 'DS-044'; -- 한두선
UPDATE employees SET caps_id = '0099', caps_sync_enabled = 1 WHERE employee_code = 'DS-045'; -- 김영수
UPDATE employees SET caps_id = '0100', caps_sync_enabled = 1 WHERE employee_code = 'DS-046'; -- NABIZADA (ACServer: AMIN)
UPDATE employees SET caps_id = '0101', caps_sync_enabled = 1 WHERE employee_code = 'DS-047'; -- 이민규
UPDATE employees SET caps_id = '0102', caps_sync_enabled = 1 WHERE employee_code = 'DS-048'; -- 박종욱

-- 퇴사자 중 ACServer에 있는 사람 (동기화 비활성)
UPDATE employees SET caps_id = '0003', caps_sync_enabled = 0 WHERE employee_code = 'DS-049'; -- 김예은
UPDATE employees SET caps_id = '0034', caps_sync_enabled = 0 WHERE employee_code = 'DS-050'; -- 김정민
UPDATE employees SET caps_id = '0011', caps_sync_enabled = 0 WHERE employee_code = 'DS-053'; -- 이해숙
UPDATE employees SET caps_id = '0026', caps_sync_enabled = 0 WHERE employee_code = 'DS-054'; -- 이승석
UPDATE employees SET caps_id = '0028', caps_sync_enabled = 0 WHERE employee_code = 'DS-055'; -- 김수헌
UPDATE employees SET caps_id = '0032', caps_sync_enabled = 0 WHERE employee_code = 'DS-056'; -- 오창협 (ACServer: 오창렬)
UPDATE employees SET caps_id = '0017', caps_sync_enabled = 0 WHERE employee_code = 'DS-057'; -- 신동구
UPDATE employees SET caps_id = '0031', caps_sync_enabled = 0 WHERE employee_code = 'DS-058'; -- 심달래
UPDATE employees SET caps_id = '0004', caps_sync_enabled = 0 WHERE employee_code = 'DS-059'; -- 윤재성
UPDATE employees SET caps_id = '0018', caps_sync_enabled = 0 WHERE employee_code = 'DS-060'; -- 이영진
UPDATE employees SET caps_id = '0015', caps_sync_enabled = 0 WHERE employee_code = 'DS-061'; -- 백경렬
UPDATE employees SET caps_id = '0012', caps_sync_enabled = 0 WHERE employee_code = 'DS-067'; -- 김영순
UPDATE employees SET caps_id = '0025', caps_sync_enabled = 0 WHERE employee_code = 'DS-069'; -- 박광우
UPDATE employees SET caps_id = '0006', caps_sync_enabled = 0 WHERE employee_code = 'DS-070'; -- 이선아
UPDATE employees SET caps_id = '0024', caps_sync_enabled = 0 WHERE employee_code = 'DS-071'; -- 김금화
UPDATE employees SET caps_id = '0029', caps_sync_enabled = 0 WHERE employee_code = 'DS-072'; -- 하빕 (ACServer: 하빈)
UPDATE employees SET caps_id = '0039', caps_sync_enabled = 0 WHERE employee_code = 'DS-073'; -- 아웅저투
UPDATE employees SET caps_id = '0038', caps_sync_enabled = 0 WHERE employee_code = 'DS-074'; -- 최현자
UPDATE employees SET caps_id = '0042', caps_sync_enabled = 0 WHERE employee_code = 'DS-075'; -- 구자영
UPDATE employees SET caps_id = '0041', caps_sync_enabled = 0 WHERE employee_code = 'DS-076'; -- SAW EH YOUR (ACServer: SAM EH Y...)
UPDATE employees SET caps_id = '0043', caps_sync_enabled = 0 WHERE employee_code = 'DS-077'; -- 송경훈
UPDATE employees SET caps_id = '0044', caps_sync_enabled = 0 WHERE employee_code = 'DS-078'; -- 이지현
UPDATE employees SET caps_id = '0046', caps_sync_enabled = 0 WHERE employee_code = 'DS-079'; -- AKTER SIMU
UPDATE employees SET caps_id = '0047', caps_sync_enabled = 0 WHERE employee_code = 'DS-080'; -- 유재현
UPDATE employees SET caps_id = '0048', caps_sync_enabled = 0 WHERE employee_code = 'DS-081'; -- 김효석 (ACServer: 김호석)
UPDATE employees SET caps_id = '0050', caps_sync_enabled = 0 WHERE employee_code = 'DS-082'; -- 이형주
UPDATE employees SET caps_id = '0049', caps_sync_enabled = 0 WHERE employee_code = 'DS-083'; -- HOSSAIN
UPDATE employees SET caps_id = '0052', caps_sync_enabled = 0 WHERE employee_code = 'DS-084'; -- AKTER TAHMINA
UPDATE employees SET caps_id = '0053', caps_sync_enabled = 0 WHERE employee_code = 'DS-085'; -- 김영춘
UPDATE employees SET caps_id = '0054', caps_sync_enabled = 0 WHERE employee_code = 'DS-086'; -- 박주영
UPDATE employees SET caps_id = '0055', caps_sync_enabled = 0 WHERE employee_code = 'DS-087'; -- 최인령 (ACServer: 최인형)
UPDATE employees SET caps_id = '0056', caps_sync_enabled = 0 WHERE employee_code = 'DS-088'; -- 김유미
UPDATE employees SET caps_id = '0057', caps_sync_enabled = 0 WHERE employee_code = 'DS-089'; -- 김유경
UPDATE employees SET caps_id = '0060', caps_sync_enabled = 0 WHERE employee_code = 'DS-090'; -- 류동우 (ACServer: 류등우)
UPDATE employees SET caps_id = '0061', caps_sync_enabled = 0 WHERE employee_code = 'DS-091'; -- 김세현 (ACServer: 김세연)
UPDATE employees SET caps_id = '0062', caps_sync_enabled = 0 WHERE employee_code = 'DS-092'; -- 정현아
UPDATE employees SET caps_id = '0064', caps_sync_enabled = 0 WHERE employee_code = 'DS-093'; -- 왕준걸
UPDATE employees SET caps_id = '0066', caps_sync_enabled = 0 WHERE employee_code = 'DS-094'; -- 신주희
UPDATE employees SET caps_id = '0067', caps_sync_enabled = 0 WHERE employee_code = 'DS-095'; -- 김인수
UPDATE employees SET caps_id = '0068', caps_sync_enabled = 0 WHERE employee_code = 'DS-096'; -- 전순철 (ACServer: 전순절)
UPDATE employees SET caps_id = '0069', caps_sync_enabled = 0 WHERE employee_code = 'DS-097'; -- 왕수연
UPDATE employees SET caps_id = '0073', caps_sync_enabled = 0 WHERE employee_code = 'DS-099'; -- TOE THANT (ACServer: 토테토)
UPDATE employees SET caps_id = '0079', caps_sync_enabled = 0 WHERE employee_code = 'DS-100'; -- 양지윤
UPDATE employees SET caps_id = '0081', caps_sync_enabled = 0 WHERE employee_code = 'DS-101'; -- 석영
UPDATE employees SET caps_id = '0084', caps_sync_enabled = 0 WHERE employee_code = 'DS-102'; -- 최유라
UPDATE employees SET caps_id = '0088', caps_sync_enabled = 0 WHERE employee_code = 'DS-103'; -- 왕창휘 (ACServer: 왕장취)
UPDATE employees SET caps_id = '0090', caps_sync_enabled = 0 WHERE employee_code = 'DS-105'; -- 왕리
UPDATE employees SET caps_id = '0092', caps_sync_enabled = 0 WHERE employee_code = 'DS-106'; -- 박유리
UPDATE employees SET caps_id = '0093', caps_sync_enabled = 0 WHERE employee_code = 'DS-107'; -- 아웅아웅
UPDATE employees SET caps_id = '0096', caps_sync_enabled = 0 WHERE employee_code = 'DS-109'; -- 문찬미
UPDATE employees SET caps_id = '0022', caps_sync_enabled = 0 WHERE employee_code = 'DS-065'; -- 썸닝
UPDATE employees SET caps_id = '0023', caps_sync_enabled = 0 WHERE employee_code = 'DS-066'; -- 씨우

-- 매칭 불가 (ACServer에 없는 MES 직원):
-- DS-003 정송엽, DS-011 안혜옥, DS-026 최상호, DS-051 임재양
-- DS-052 이상현, DS-062 정종필, DS-063 이일자, DS-068 최춘옥
-- DS-098 TUN, DS-104 정환수, DS-108 지은주, DS-110 (데이터 오류)

-- ACServer에만 있는 사용자 (MES에 없음):
-- 0008 이월자, 0009 최준욱, 0036 hassani, 0037 zamani
