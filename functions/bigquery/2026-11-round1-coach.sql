-- Round-1 lie helper ("coach"), a 50/50 test. Run once in bullshit-wtf-prod BEFORE deploying the
-- functions: question_results must exist, or every scoreboard logs "Bigquery Insert failed" and the
-- question is not counted (the game itself is unaffected). The coach columns are additive (NULLABLE,
-- old rows NULL); until they exist, inserts still succeed (ignoreUnknownValues) without them.

CREATE TABLE IF NOT EXISTS `bullshit-wtf-prod.analytics.question_results` (
  time TIMESTAMP NOT NULL OPTIONS (description = "When the question's scoreboard ended"),
  id STRING NOT NULL OPTIONS (description = 'Game PIN'),
  q_index INT64 NOT NULL OPTIONS (description = 'Question number in the game, from 0'),
  round INT64 NOT NULL OPTIONS (description = 'Round, 1 to 3'),
  total_q INT64 OPTIONS (description = 'Questions in the game'),
  players INT64 OPTIONS (description = 'Players in the game'),
  lies INT64 OPTIONS (description = 'Players who wrote a lie'),
  idea_lies INT64 OPTIONS (description = 'Of those, lies the round-1 helper offered them'),
  picks INT64 OPTIONS (description = 'Players who picked an answer'),
  friend_fooled INT64 OPTIONS (description = 'Picks of a lie another player wrote'),
  coach BOOL OPTIONS (description = 'The game had the round-1 lie helper'),
  locale STRING OPTIONS (description = 'Game language, en or he')
)
PARTITION BY DATE(time)
OPTIONS (description = 'One row per question played (functions/src/controllers/lie-helper.ts questionResult)');

ALTER TABLE `bullshit-wtf-prod.analytics.opened_games`
  ADD COLUMN IF NOT EXISTS coach BOOL OPTIONS (description = 'The game had the round-1 lie helper (50/50 test)');

ALTER TABLE `bullshit-wtf-prod.analytics.closed_games`
  ADD COLUMN IF NOT EXISTS coach BOOL OPTIONS (description = 'The game had the round-1 lie helper (50/50 test)');

-- ---------------------------------------------------------------------------
-- Read-only queries (growth/round1-spec/round1-lie-helper-spec.md). Replace <deploy time>.
-- Test games are left out by their own mark (2026-11-test-mark.sql): campaign 'test' or 'test-...'
-- on the game tables, via 'test' on users. The tests of 5 to 11 November 2026 carry no mark:
-- for a window that includes those days, add that file's "before the mark" PINs to test_pins.

-- Main measure: still playing in round 2. Of games opened with 2+ players, the share where half or
-- more of the players picked an answer on a round-2 question.
-- (The first measure, "reached round 2", died on 5 November 2026: since "Keep games going when
-- every phone sleeps" the server moves every game on, so every started game has round-2 rows and
-- the rate is 100% in both arms. Picks are made by players only, so they still show who is there.)
-- WITH test_pins AS (
--   SELECT DISTINCT pin FROM `bullshit-wtf-prod.analytics.users`
--   WHERE time >= TIMESTAMP('<deploy time>') AND via = 'test' AND pin IS NOT NULL
--   UNION DISTINCT
--   SELECT id FROM `bullshit-wtf-prod.analytics.opened_games`
--   WHERE time >= TIMESTAMP('<deploy time>') AND REGEXP_CONTAINS(IFNULL(campaign, ''), r'^test(-|$)')
-- )
-- SELECT o.coach, COUNT(*) AS started,
--   COUNTIF(q.r2_half) AS active_in_round2,
--   COUNTIF(q.r2_half) / COUNT(*) AS round2_active_rate,
--   COUNTIF(q.end_half) / COUNT(*) AS played_to_the_end_rate
-- FROM `bullshit-wtf-prod.analytics.opened_games` o
-- LEFT JOIN (
--   SELECT id,
--     LOGICAL_OR(round >= 2 AND picks * 2 >= players) AS r2_half,
--     LOGICAL_OR(q_index = total_q - 1 AND picks * 2 >= players) AS end_half
--   FROM `bullshit-wtf-prod.analytics.question_results`
--   WHERE time >= TIMESTAMP('<deploy time>') GROUP BY id) q USING (id)
-- WHERE o.players >= 2 AND o.time >= TIMESTAMP('<deploy time>')
--   AND o.id NOT IN (SELECT pin FROM test_pins)
-- GROUP BY o.coach;

-- Early measure: question-1 lie rate, share of lies from the helper, question-1s with a friend fooled.
-- WITH test_pins AS (... as above ...)
-- SELECT coach, SUM(lies) / SUM(players) AS q1_lie_rate,
--   SAFE_DIVIDE(SUM(idea_lies), SUM(lies)) AS idea_share,
--   COUNTIF(friend_fooled > 0) / COUNT(*) AS q1_games_with_a_friend_fooled
-- FROM `bullshit-wtf-prod.analytics.question_results`
-- WHERE q_index = 0 AND players >= 2 AND time >= TIMESTAMP('<deploy time>')
--   AND id NOT IN (SELECT pin FROM test_pins)
-- GROUP BY coach;
