-- The host's own questions (functions/src/controllers/own-questions.ts).
-- Run the two ALTER statements once in bullshit-wtf-prod BEFORE the merge that releases the functions.
-- Additive only: NULLABLE columns, old rows NULL. Until they run, inserts still succeed
-- (ignoreUnknownValues) and the new field is dropped silently: nothing breaks.
--
-- What the column holds (no text anybody typed is ever written here):
--   opened_games.own_questions, closed_games.own_questions
--     0..3  how many of the host's own questions the game placed at START (0: none, a taste included)
--     NULL  a row written before the release
-- question_results needs no new column: an own question's qid is 'own-0', 'own-1' or 'own-2'.

ALTER TABLE `bullshit-wtf-prod.analytics.opened_games`
  ADD COLUMN IF NOT EXISTS own_questions INT64 OPTIONS (description = 'How many of the host''s own questions the game placed (0 = none)');

ALTER TABLE `bullshit-wtf-prod.analytics.closed_games`
  ADD COLUMN IF NOT EXISTS own_questions INT64 OPTIONS (description = 'How many of the host''s own questions the game placed (0 = none)');

-- ---------------------------------------------------------------------------
-- Read-only queries. Replace <site release time> with the time the SITE of this change went live.
-- Test games are left out by their mark (see 2026-11-test-mark.sql).

-- The pack: games with own questions per week, against all started games.
-- SELECT DATE_TRUNC(DATE(o.time), WEEK) AS week, COUNTIF(o.own_questions > 0) AS own_games, COUNT(*) AS games,
--   SAFE_DIVIDE(COUNTIF(o.own_questions > 0), COUNT(*)) AS own_share
-- FROM `bullshit-wtf-prod.analytics.opened_games` o
-- WHERE o.time >= TIMESTAMP('<site release time>')
--   AND NOT REGEXP_CONTAINS(IFNULL(o.campaign, ''), r'^test(-|$)')
-- GROUP BY week ORDER BY week;

-- Do games with own questions finish and come back? Finished share and rematches per started game.
-- SELECT o.own_questions > 0 AS own, COUNT(*) AS started, COUNT(c.id) AS finished, COUNT(r.id) AS rematches,
--   SAFE_DIVIDE(COUNT(c.id), COUNT(*)) AS finished_share, SAFE_DIVIDE(COUNT(r.id), COUNT(*)) AS rematches_per_game
-- FROM `bullshit-wtf-prod.analytics.opened_games` o
-- LEFT JOIN `bullshit-wtf-prod.analytics.closed_games` c ON c.id = o.id
-- LEFT JOIN `bullshit-wtf-prod.analytics.opened_games` r ON r.parent_pin = o.id AND r.time >= TIMESTAMP('<site release time>')
-- WHERE o.time >= TIMESTAMP('<site release time>') AND o.own_questions IS NOT NULL
--   AND NOT REGEXP_CONTAINS(IFNULL(o.campaign, ''), r'^test(-|$)')
-- GROUP BY own;

-- Do own questions fool people? Friend-fooled picks per pick, own against bank questions, in own games.
-- SELECT STARTS_WITH(q.qid, 'own-') AS own_question, SUM(q.friend_fooled) AS fooled, SUM(q.picks) AS picks,
--   SAFE_DIVIDE(SUM(q.friend_fooled), SUM(q.picks)) AS fooled_per_pick,
--   SAFE_DIVIDE(SUM(q.truth_picks), SUM(q.picks)) AS truth_per_pick
-- FROM `bullshit-wtf-prod.analytics.question_results` q
-- JOIN `bullshit-wtf-prod.analytics.opened_games` o ON o.id = q.id
-- WHERE o.own_questions > 0 AND q.time >= TIMESTAMP('<site release time>')
-- GROUP BY own_question;

-- Without the column (the ALTERs ran late): a game had own questions if any of its question rows did.
-- SELECT COUNT(DISTINCT id) AS own_games FROM `bullshit-wtf-prod.analytics.question_results`
-- WHERE STARTS_WITH(qid, 'own-') AND time >= TIMESTAMP('<site release time>');
