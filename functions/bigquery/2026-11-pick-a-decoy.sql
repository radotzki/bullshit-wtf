-- "Pick a decoy", a 50/50 test on two-player games (functions/src/controllers/pair.ts).
-- Run the ALTER statement once in bullshit-wtf-prod BEFORE the merge that releases the functions.
-- Additive only: NULLABLE columns, old rows NULL. Until it runs, inserts still succeed
-- (ignoreUnknownValues) and the two fields are dropped silently, so the test would be invisible.
--
-- What the columns hold (no answer anybody typed is ever written here):
--   question_results.pair
--     TRUE   a two-player game in the decoy half: each player picks a decoy, no neutral house lies
--     FALSE  a two-player game in the other half: plays as before
--     NULL   not in the test (three or more players at START, a taste, or before the release)
--   question_results.decoy_picks
--     picks of a decoy the other player chose. Only ever above 0 when pair is TRUE.
--     lies, friend_fooled and unpicked_lies count written lies only; house_picks counts neutral
--     house lies only, so it is 0 in the decoy half.

ALTER TABLE `bullshit-wtf-prod.analytics.question_results`
  ADD COLUMN IF NOT EXISTS pair BOOL OPTIONS (description = 'Pick a decoy test (two players): TRUE decoys, FALSE the other half, NULL not in the test'),
  ADD COLUMN IF NOT EXISTS decoy_picks INT64 OPTIONS (description = 'Pick a decoy test: picks of a decoy chosen by the other player');

-- ---------------------------------------------------------------------------
-- Read-only queries. Replace <release time> with the time the functions of this change went live.
-- The pair column is the game's half. A new two-player game's half follows from its PIN:
--   MOD(TO_CODE_POINTS(SHA256(CONCAT('pair:', UPPER(id))))[OFFSET(0)], 2) = 1
-- but a Replay that still has two players keeps its parent's half, so read the column, not the rule.
-- Test games are left out by their mark (see 2026-11-test-mark.sql).

-- Primary: share of rounds that fool someone, by half and language (rows with 2 picks).
-- Guards: truth share of picks (decoy half above 65%: too easy) and lies sent per player.
-- SELECT q.pair, q.locale, COUNT(*) AS rounds, COUNT(DISTINCT q.id) AS games,
--   SAFE_DIVIDE(COUNTIF(q.friend_fooled + IFNULL(q.decoy_picks, 0) > 0), COUNT(*)) AS fooled_share,
--   SAFE_DIVIDE(SUM(q.truth_picks), SUM(q.picks)) AS truth_share,
--   SAFE_DIVIDE(SUM(q.lies), SUM(q.players)) AS lies_per_player
-- FROM `bullshit-wtf-prod.analytics.question_results` q
-- JOIN `bullshit-wtf-prod.analytics.opened_games` o ON o.id = q.id
-- WHERE q.pair IS NOT NULL AND q.picks >= 2 AND q.time >= TIMESTAMP('<release time>')
--   AND NOT REGEXP_CONTAINS(IFNULL(o.campaign, ''), r'^test(-|$)')
-- GROUP BY q.pair, q.locale ORDER BY q.locale, q.pair;

-- Direction only: share of first games of a night (no parent) with a Replay, by half.
-- SELECT p.pair, COUNT(*) AS first_games, COUNT(r.id) AS with_replay, SAFE_DIVIDE(COUNT(r.id), COUNT(*)) AS replay_share
-- FROM (SELECT id, LOGICAL_OR(pair) AS pair FROM `bullshit-wtf-prod.analytics.question_results`
--       WHERE pair IS NOT NULL AND time >= TIMESTAMP('<release time>') GROUP BY id) p
-- JOIN `bullshit-wtf-prod.analytics.opened_games` o ON o.id = p.id
-- LEFT JOIN (SELECT DISTINCT parent_pin AS id FROM `bullshit-wtf-prod.analytics.opened_games`
--            WHERE time >= TIMESTAMP('<release time>')) r ON r.id = p.id
-- WHERE o.parent_pin IS NULL AND NOT REGEXP_CONTAINS(IFNULL(o.campaign, ''), r'^test(-|$)')
-- GROUP BY p.pair;
