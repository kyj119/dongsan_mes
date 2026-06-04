-- 0295: users.is_coordinator — 멀티법인 코디네이터 역할 플래그
-- 사유: 주문접수 법인협업 — 코디네이터(역할, 신규채용 아님)는 분배 위해 전 법인 주문을
--       교차 열람. 일반 사용자는 자기 법인 + 담당 품목 보유 주문만(stake 기반, Phase A).
--       기존 4역할(ADMIN/MANAGER/DESIGNER/OPERATOR)에 직교하는 플래그로 레이어.
ALTER TABLE users ADD COLUMN is_coordinator INTEGER NOT NULL DEFAULT 0;
