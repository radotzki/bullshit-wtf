-- The "About us" questions, a 50/50 test (functions/src/controllers/about.ts).
-- Run the three ALTER statements once in bullshit-wtf-prod BEFORE the merge that releases the
-- functions. Additive only: NULLABLE columns, old rows NULL. Until they run, inserts still succeed
-- (ignoreUnknownValues) and the new fields are dropped silently.
--
-- What the columns hold (no answer anybody typed is ever written here):
--   opened_games.about_us, closed_games.about_us
--     TRUE   the game's half plays About questions (when it starts with 3 or more players)
--     FALSE  the other half: the game plays as before
--     NULL   not in the test (made by a phone on an older site, or before the release)
--   question_results.about
--     'played'   an About question was played: the named player's truth was in on time
--     'fallback' the named player sent nothing in time: the bank question was played in its place
--     'skipped'  fewer than 3 players were playing, so the bank question was played
--     NULL       a bank question, as always
--   question_results.about_prompt  the prompt's id (about-prompts.ts), with any of the three above

ALTER TABLE `bullshit-wtf-prod.analytics.opened_games`
  ADD COLUMN IF NOT EXISTS about_us BOOL OPTIONS (description = 'About us questions test: TRUE plays them, FALSE the other half, NULL not in the test');

ALTER TABLE `bullshit-wtf-prod.analytics.closed_games`
  ADD COLUMN IF NOT EXISTS about_us BOOL OPTIONS (description = 'About us questions test: TRUE plays them, FALSE the other half, NULL not in the test');

ALTER TABLE `bullshit-wtf-prod.analytics.question_results`
  ADD COLUMN IF NOT EXISTS about STRING OPTIONS (description = 'About us question: played, fallback, skipped; NULL for a bank question'),
  ADD COLUMN IF NOT EXISTS about_prompt STRING OPTIONS (description = 'About us question: the prompt id (about-prompts.ts)');

-- ---------------------------------------------------------------------------
-- Read-only queries. Replace <site release time> with the time the SITE of this change went live.
-- A game's half also follows from its crew (or its PIN) alone, the same rule as the code's aboutHalf:
--   MOD(TO_CODE_POINTS(SHA256(CONCAT('about-us:', IFNULL(o.crew_id, UPPER(o.id)))))[OFFSET(0)], 2) = 1
-- Prefer the about_us column; the rule is the fallback if the ALTERs ran late. Only games that started
-- with 3 or more players can play the questions, so every measure keeps to those.
-- Test games are left out by their mark (see 2026-11-test-mark.sql).

-- Main measure 1: rematches per finished game. A rematch is a started game whose parent is this
-- game (Replay); it is counted for the half of the game it came from.
-- SELECT o.about_us, COUNT(*) AS games, COUNT(r.id) AS rematches,
--   SAFE_DIVIDE(COUNT(r.id), COUNT(*)) AS rematches_per_game
-- FROM `bullshit-wtf-prod.analytics.opened_games` o
-- JOIN `bullshit-wtf-prod.analytics.closed_games` c ON c.id = o.id
-- LEFT JOIN `bullshit-wtf-prod.analytics.opened_games` r
--   ON r.parent_pin = o.id AND r.time >= TIMESTAMP('<site release time>')
-- WHERE o.players >= 3 AND o.about_us IS NOT NULL AND o.time >= TIMESTAMP('<site release time>')
--   AND NOT REGEXP_CONTAINS(IFNULL(o.campaign, ''), r'^test(-|$)')
-- GROUP BY o.about_us;

-- Main measure 2: games per crew per week. A crew's games all fall in one half (the half follows
-- the crew's id), so crews compare with crews.
-- SELECT o.about_us, DATE_TRUNC(DATE(o.time), WEEK) AS week,
--   COUNT(DISTINCT o.crew_id) AS crews, COUNT(*) AS games,
--   SAFE_DIVIDE(COUNT(*), COUNT(DISTINCT o.crew_id)) AS games_per_crew
-- FROM `bullshit-wtf-prod.analytics.opened_games` o
-- WHERE o.crew_id IS NOT NULL AND o.players >= 3 AND o.about_us IS NOT NULL
--   AND o.time >= TIMESTAMP('<site release time>')
--   AND NOT REGEXP_CONTAINS(IFNULL(o.campaign, ''), r'^test(-|$)')
-- GROUP BY o.about_us, week ORDER BY week, o.about_us;

-- Health: how often the named player answers in time, by prompt and language.
-- SELECT about_prompt, locale, COUNTIF(about = 'played') AS played, COUNTIF(about = 'fallback') AS fallback,
--   SAFE_DIVIDE(COUNTIF(about = 'fallback'), COUNTIF(about IN ('played', 'fallback'))) AS fallback_share
-- FROM `bullshit-wtf-prod.analytics.question_results`
-- WHERE about IS NOT NULL AND time >= TIMESTAMP('<site release time>')
-- GROUP BY about_prompt, locale ORDER BY fallback_share DESC;

-- Do About questions fool people? Picks of a friend's lie per pick, About against bank questions,
-- inside the About half.
-- SELECT q.about IS NOT NULL AND q.about = 'played' AS about_question,
--   SUM(q.friend_fooled) AS fooled, SUM(q.picks) AS picks, SAFE_DIVIDE(SUM(q.friend_fooled), SUM(q.picks)) AS fooled_per_pick
-- FROM `bullshit-wtf-prod.analytics.question_results` q
-- JOIN `bullshit-wtf-prod.analytics.opened_games` o ON o.id = q.id
-- WHERE o.about_us = TRUE AND o.players >= 3 AND q.time >= TIMESTAMP('<site release time>')
-- GROUP BY about_question;

-- The two halves of the two tests: about a quarter of the games in each cell.
-- SELECT o.about_us, MOD(TO_CODE_POINTS(SHA256(CONCAT('big-reveal:', UPPER(o.id))))[OFFSET(0)], 2) = 1 AS staged_half,
--   COUNT(*) AS games
-- FROM `bullshit-wtf-prod.analytics.opened_games` o
-- WHERE o.time >= TIMESTAMP('<site release time>') AND o.about_us IS NOT NULL
-- GROUP BY o.about_us, staged_half ORDER BY o.about_us, staged_half;
