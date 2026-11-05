-- Hanukkah pack and campaign tags. Run once in bullshit-wtf-prod before (or soon after) deploying.
-- Additive only: NULLABLE columns, old rows NULL. Until it runs, inserts still succeed
-- (ignoreUnknownValues) and the two fields are dropped.

ALTER TABLE `bullshit-wtf-prod.analytics.opened_games`
  ADD COLUMN IF NOT EXISTS pack STRING OPTIONS (description = 'Seasonal question pack mixed into the game, e.g. hanukkah');
ALTER TABLE `bullshit-wtf-prod.analytics.opened_games`
  ADD COLUMN IF NOT EXISTS campaign STRING OPTIONS (description = 'Campaign tag (?via=...) the host arrived with, e.g. fb-he-hanukkah');

ALTER TABLE `bullshit-wtf-prod.analytics.closed_games`
  ADD COLUMN IF NOT EXISTS pack STRING OPTIONS (description = 'Seasonal question pack mixed into the game, e.g. hanukkah');
ALTER TABLE `bullshit-wtf-prod.analytics.closed_games`
  ADD COLUMN IF NOT EXISTS campaign STRING OPTIONS (description = 'Campaign tag (?via=...) the host arrived with, e.g. fb-he-hanukkah');

-- ---------------------------------------------------------------------------
-- Read-only queries for the Hanukkah test (growth/hanukkah-2026/ in the project files).

-- Games and players per campaign tag (a post's ?via=), by day. Replays of a tagged game count
-- through parent_pin: see the second query.
-- SELECT DATE(time, 'Asia/Jerusalem') AS day, campaign, COUNT(*) AS games, SUM(players) AS players
-- FROM `bullshit-wtf-prod.analytics.opened_games`
-- WHERE campaign IS NOT NULL GROUP BY day, campaign ORDER BY day, games DESC;

-- Hanukkah pack games against all games, by day.
-- SELECT DATE(time, 'Asia/Jerusalem') AS day, COUNTIF(pack = 'hanukkah') AS hanukkah_games, COUNT(*) AS games
-- FROM `bullshit-wtf-prod.analytics.closed_games`
-- WHERE time >= '2026-11-26' GROUP BY day ORDER BY day;
