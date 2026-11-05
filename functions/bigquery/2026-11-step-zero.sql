-- Step zero: who hosted each game, how it started, and where each join came from.
-- Run once in the bullshit-wtf-prod project BEFORE deploying the functions that write
-- these columns. Additive only: new NULLABLE columns, existing rows read as NULL.
-- (Until it runs, inserts still succeed: the functions set ignoreUnknownValues,
-- so the new fields are silently dropped.)

ALTER TABLE `bullshit-wtf-prod.analytics.opened_games`
  ADD COLUMN IF NOT EXISTS creator_uid STRING OPTIONS (description = 'Anonymous uid of the browser that created the game, or pressed Replay'),
  ADD COLUMN IF NOT EXISTS origin STRING OPTIONS (description = 'How the game started: create or replay'),
  ADD COLUMN IF NOT EXISTS parent_pin STRING OPTIONS (description = 'For a replay, the PIN of the finished game it came from');

ALTER TABLE `bullshit-wtf-prod.analytics.closed_games`
  ADD COLUMN IF NOT EXISTS creator_uid STRING OPTIONS (description = 'Anonymous uid of the browser that created the game, or pressed Replay'),
  ADD COLUMN IF NOT EXISTS origin STRING OPTIONS (description = 'How the game started: create or replay'),
  ADD COLUMN IF NOT EXISTS parent_pin STRING OPTIONS (description = 'For a replay, the PIN of the finished game it came from');

ALTER TABLE `bullshit-wtf-prod.analytics.users`
  ADD COLUMN IF NOT EXISTS via STRING OPTIONS (description = 'Join source: pin, link, qr, results, host, replay, other; NULL from old clients');

-- ---------------------------------------------------------------------------
-- Read-only queries this makes possible (run after a few weeks of data).

-- Host return rate: of browsers that first created a game in a week, the share
-- that created another game on a later day within 30 days.
-- WITH firsts AS (
--   SELECT creator_uid, MIN(DATE(time)) AS first_day
--   FROM `bullshit-wtf-prod.analytics.opened_games`
--   WHERE creator_uid IS NOT NULL AND origin = 'create'
--   GROUP BY creator_uid
-- )
-- SELECT DATE_TRUNC(f.first_day, WEEK) AS cohort_week,
--        COUNT(*) AS new_hosts,
--        COUNTIF(EXISTS (
--          SELECT 1 FROM `bullshit-wtf-prod.analytics.opened_games` g
--          WHERE g.creator_uid = f.creator_uid
--            AND DATE(g.time) > f.first_day
--            AND DATE(g.time) <= DATE_ADD(f.first_day, INTERVAL 30 DAY))) / COUNT(*) AS return_rate
-- FROM firsts f GROUP BY cohort_week ORDER BY cohort_week;

-- Joins by source, per day.
-- SELECT DATE(time) AS day, IFNULL(via, 'unknown') AS via, COUNT(*) AS joins
-- FROM `bullshit-wtf-prod.analytics.users`
-- WHERE time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
-- GROUP BY day, via ORDER BY day, joins DESC;

-- Started games by how they started.
-- SELECT DATE(time) AS day, origin, COUNT(*) AS games
-- FROM `bullshit-wtf-prod.analytics.opened_games`
-- WHERE origin IS NOT NULL GROUP BY day, origin ORDER BY day;
