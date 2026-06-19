-- 0323: 단가 프로파일 컬럼 (pricing_method 확장 — GRADE/COMPONENT 수용, 비파괴)
-- 근거: item-master-review B-6(명시적 태그드 유니온) / spec 2026-06-19-item-master-load-phase1
-- pricing_method는 CHECK(FIXED,AREA)라 직접 확장 불가 → 신규 정본 컬럼 pricing_profile.
--   FIXED=개수, AREA=면적, GRADE=호수 룩업(깃발/태극기), COMPONENT=구성요소합(간판).
-- pricing_method는 레거시(읽기 점진 전환 후 Phase 3 제거 후보).
ALTER TABLE items ADD COLUMN pricing_profile TEXT
  CHECK(pricing_profile IN ('FIXED', 'AREA', 'GRADE', 'COMPONENT'));

-- 기존값 백필 (FIXED/AREA 둘 다 신규 CHECK 집합에 포함)
UPDATE items SET pricing_profile = pricing_method
WHERE pricing_profile IS NULL AND pricing_method IN ('FIXED', 'AREA');
UPDATE items SET pricing_profile = 'FIXED'
WHERE pricing_profile IS NULL;

CREATE INDEX IF NOT EXISTS idx_items_pricing_profile ON items(pricing_profile);
