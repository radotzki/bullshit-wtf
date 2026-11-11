-- The staged reveal ("big reveal"), a 50/50 test (functions/src/controllers/big-reveal.ts).
-- Run the three ALTER statements once in bullshit-wtf-prod, best BEFORE the functions are released.
-- They are additive (NULLABLE, old rows NULL). Until they are run nothing breaks: inserts still succeed
-- (ignoreUnknownValues) but without the arm, so games played before then cannot be told apart.
--
-- big_reveal: TRUE  the game had the staged reveal
--             FALSE the game was drawn into the test and kept the old reveal (the control)
--             NULL  not in the test: made by a phone on an older build, or before the release

ALTER TABLE `bullshit-wtf-prod.analytics.opened_games`
  ADD COLUMN IF NOT EXISTS big_reveal BOOL OPTIONS (description = 'Staged reveal 50/50 test: TRUE staged, FALSE control, NULL not in the test');

ALTER TABLE `bullshit-wtf-prod.analytics.closed_games`
  ADD COLUMN IF NOT EXISTS big_reveal BOOL OPTIONS (description = 'Staged reveal 50/50 test: TRUE staged, FALSE control, NULL not in the test');

ALTER TABLE `bullshit-wtf-prod.analytics.question_results`
  ADD COLUMN IF NOT EXISTS big_reveal BOOL OPTIONS (description = 'Staged reveal 50/50 test: TRUE staged, FALSE control, NULL not in the test');

-- ---------------------------------------------------------------------------
-- Read-only queries. Replace <site release time> with the time the SITE went live (later than the
-- functions): only from then on do phones ask for the test. Rows with big_reveal NULL are left out.
-- Test games to leave out: players Alice, Ben and Chen (users table), campaign test-hanukkah.
-- Since 5 Nov every game is logged as closed, so "finished" is not read from closed_games here.

-- Main measure 1: players still picking on the last question.
-- Of the players a game started with, the share who picked an answer on its last question.
-- SELECT o.big_reveal, COUNT(*) AS games, SUM(o.players) AS players_at_start,
--   SAFE_DIVIDE(SUM(IFNULL(q.picks, 0)), SUM(o.players)) AS still_picking_on_last_question
-- FROM `bullshit-wtf-prod.analytics.opened_games` o
-- LEFT JOIN `bullshit-wtf-prod.analytics.question_results` q
--   ON q.id = o.id AND q.q_index = o.questions - 1 AND q.time >= TIMESTAMP('<site release time>')
-- WHERE o.players >= 2 AND o.big_reveal IS NOT NULL AND o.time >= TIMESTAMP('<site release time>')
--   AND IFNULL(o.campaign, '') != 'test-hanukkah'
--   AND o.id NOT IN (SELECT pin FROM `bullshit-wtf-prod.analytics.users`
--                    WHERE nickname IN ('Alice', 'Ben', 'Chen') AND time >= TIMESTAMP('<site release time>'))
-- GROUP BY o.big_reveal;

-- Main measure 2: rematches per game. A rematch is a started game whose parent is this game
-- (Replay) — its own arm is a new draw, so it is counted for the arm of the game it came from.
-- SELECT o.big_reveal, COUNT(*) AS games, COUNT(r.id) AS rematches,
--   SAFE_DIVIDE(COUNT(r.id), COUNT(*)) AS rematches_per_game
-- FROM `bullshit-wtf-prod.analytics.opened_games` o
-- LEFT JOIN `bullshit-wtf-prod.analytics.opened_games` r
--   ON r.parent_pin = o.id AND r.time >= TIMESTAMP('<site release time>')
-- WHERE o.players >= 2 AND o.big_reveal IS NOT NULL AND o.time >= TIMESTAMP('<site release time>')
--   AND IFNULL(o.campaign, '') != 'test-hanukkah'
--   AND o.id NOT IN (SELECT pin FROM `bullshit-wtf-prod.analytics.users`
--                    WHERE nickname IN ('Alice', 'Ben', 'Chen') AND time >= TIMESTAMP('<site release time>'))
-- GROUP BY o.big_reveal;

-- Check that the two tests are independent: about a quarter of the games in each cell.
-- SELECT coach, big_reveal, COUNT(*) AS games
-- FROM `bullshit-wtf-prod.analytics.opened_games`
-- WHERE big_reveal IS NOT NULL AND time >= TIMESTAMP('<site release time>')
-- GROUP BY coach, big_reveal ORDER BY coach, big_reveal;

-- Mute taps (shares table, content_type 'sound'; not a share: leave these rows out of share counts).
-- SELECT method, COUNT(*) AS taps, COUNT(DISTINCT uid) AS browsers
-- FROM `bullshit-wtf-prod.analytics.shares`
-- WHERE content_type = 'sound' AND time >= TIMESTAMP('<site release time>')
-- GROUP BY method;
