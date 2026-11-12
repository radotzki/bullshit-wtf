-- Saved crews: which crew a game counted for. Run once in bullshit-wtf-prod before (or
-- soon after) deploying the crew functions. Additive only: a NULLABLE column, old rows NULL.
-- Until it runs, inserts still succeed (ignoreUnknownValues) and crew_id is dropped.
-- Also new values, no schema change: origin = 'crew' (a crew rematch), users.via = 'crew'.

ALTER TABLE `bullshit-wtf-prod.analytics.opened_games`
  ADD COLUMN IF NOT EXISTS crew_id STRING OPTIONS (description = 'Saved crew this game counted for (crew rematch, or Replay of a crew game)');

ALTER TABLE `bullshit-wtf-prod.analytics.closed_games`
  ADD COLUMN IF NOT EXISTS crew_id STRING OPTIONS (description = 'Saved crew this game counted for (crew rematch, or Replay of a crew game)');

-- ---------------------------------------------------------------------------
-- Read-only queries for judging crews (see growth/return-visit-features.md).

-- Adoption: share of finished games that belong to a crew, per week.
-- SELECT DATE_TRUNC(DATE(time), WEEK) AS week, COUNTIF(crew_id IS NOT NULL) / COUNT(*) AS crew_share
-- FROM `bullshit-wtf-prod.analytics.closed_games`
-- WHERE NOT REGEXP_CONTAINS(IFNULL(campaign, ''), r'^test(-|$)')   -- test games out (2026-11-test-mark.sql)
-- GROUP BY week ORDER BY week;

-- Crew rematches on a later day than the crew's first game.
-- WITH first_day AS (
--   SELECT crew_id, MIN(DATE(time)) AS d FROM `bullshit-wtf-prod.analytics.opened_games`
--   WHERE crew_id IS NOT NULL AND NOT REGEXP_CONTAINS(IFNULL(campaign, ''), r'^test(-|$)') GROUP BY crew_id)
-- SELECT DATE(g.time) AS day, COUNT(*) AS later_day_crew_games
-- FROM `bullshit-wtf-prod.analytics.opened_games` g JOIN first_day f USING (crew_id)
-- WHERE DATE(g.time) > f.d AND NOT REGEXP_CONTAINS(IFNULL(g.campaign, ''), r'^test(-|$)')
-- GROUP BY day ORDER BY day;
