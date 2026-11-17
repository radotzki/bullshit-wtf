-- Which question each question_results row is for, and how its picks split.
--
-- Run the statement below once in bullshit-wtf-prod, BEFORE the merge that releases the functions
-- (a merge to master is a release). The mission runs it itself, right before that merge.
--   bq query --use_legacy_sql=false --project_id=bullshit-wtf-prod < functions/bigquery/2026-11-question-id.sql
-- It is safe to run twice, and it only adds: no row and no column that exists is changed.
--
-- Until it is run, nothing breaks and no game is affected, but the rows land without the three
-- numbers (ignoreUnknownValues drops them silently), and they cannot be recovered later.

-- Three numbers on each question row. NULLABLE: rows written before the release stay NULL.
ALTER TABLE `bullshit-wtf-prod.analytics.question_results`
  ADD COLUMN IF NOT EXISTS qid STRING OPTIONS (description = 'The question''s id in the question bank (games/$pin/qids at q_index). NULL before the column was written'),
  ADD COLUMN IF NOT EXISTS truth_picks INT64 OPTIONS (description = 'Picks of the real answer (of picks). NULL before the column was written'),
  ADD COLUMN IF NOT EXISTS house_picks INT64 OPTIONS (description = 'Picks of a house lie (of picks). NULL before the column was written');

-- ---------------------------------------------------------------------------
-- How to read them.
--
-- Nearly always picks = truth_picks + house_picks + friend_fooled. A player's lie with the same words as the
--   truth or a house lie: scoring then gives the pick to the players' lie, and so does this count.
-- A question's id is the same in every game that plays it, so rows group by qid across games.
--   Group by locale too (as below), so the two languages' banks never mix.
-- Test games are left out by PIN, as for every question_results query (see 2026-11-test-mark.sql).

-- ---------------------------------------------------------------------------
-- Read-only query: how each question plays, at tables of three or more. Replace <from>.
-- WITH test_pins AS (... as in 2026-11-test-mark.sql ...)
-- SELECT qid, locale, COUNT(*) AS plays, SUM(picks) AS picks,
--   SAFE_DIVIDE(SUM(friend_fooled), SUM(picks)) AS fooled_by_friends,
--   SAFE_DIVIDE(SUM(house_picks), SUM(picks)) AS fooled_by_the_house,
--   SAFE_DIVIDE(SUM(truth_picks), SUM(picks)) AS found_the_truth
-- FROM `bullshit-wtf-prod.analytics.question_results`
-- WHERE time >= TIMESTAMP('<from>') AND qid IS NOT NULL AND players >= 3
--   AND id NOT IN (SELECT pin FROM test_pins)
-- GROUP BY qid, locale HAVING plays >= 5
-- ORDER BY fooled_by_friends + fooled_by_the_house;
