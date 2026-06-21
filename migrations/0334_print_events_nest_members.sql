-- Flexi 자체 RIP 네스팅 추적: 한 물리 출력(인쇄 블록)에 합쳐진 멤버 파일명 목록
-- LogWatcher FlexiHtmlParser 가 립핑(RIP) 블록을 역추적해 복원한 멤버를 JSON 배열로 저장.
-- 단일 출력 1행 = 네스트 1건, nest_members = ["...\\1.해군작전사령부(135-90-1벌).eps", ...]
ALTER TABLE print_events ADD COLUMN nest_members TEXT;
