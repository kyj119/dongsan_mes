-- 0500: 동산기획 이관 — `특호기` 현장 호칭 별칭 (0499 적용 후 매칭 실측에서 남은 건)
-- 0499로 `태극기 특호 540×360`을 만들었으나 이카운트 호칭이 `특호기`라 매칭되지 않았다.
-- 해당 4라인(2,759,000)의 규격이 전건 540*360 으로 확인돼 대표 품목에 직결한다.
UPDATE items SET search_keywords = COALESCE(NULLIF(search_keywords,'')||',','')||'특호기', updated_at = CURRENT_TIMESTAMP
 WHERE item_code = 'TGK-SPECIAL-S540X360' AND (search_keywords IS NULL OR search_keywords NOT LIKE '%특호기%');
