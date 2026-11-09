-- Nickname filter: each join records whether the typed name was a slur ('hate') or a sex word ('sex').
-- Run once in the bullshit-wtf-prod project BEFORE deploying the functions that write it.
-- Additive only: a new NULLABLE column, existing rows read as NULL. (Until it runs, inserts still
-- succeed: the functions set ignoreUnknownValues, so the field is silently dropped.)
-- users.nickname keeps the raw typed name, as before; players only ever see the swap name.

ALTER TABLE `bullshit-wtf-prod.analytics.users`
  ADD COLUMN IF NOT EXISTS name_flag STRING OPTIONS (description = 'hate or sex when the typed nickname was swapped for a sweet name; NULL otherwise or before 2026-11');

-- ---------------------------------------------------------------------------
-- Read-only queries this makes possible.

-- Share of joins with a flagged name, per week (expect about 1.6% at first, falling as the joke stops paying).
-- SELECT DATE_TRUNC(DATE(time), WEEK) AS week, COUNT(*) AS joins,
--   COUNTIF(name_flag IS NOT NULL) AS flagged, ROUND(100 * COUNTIF(name_flag IS NOT NULL) / COUNT(*), 2) AS pct
-- FROM `bullshit-wtf-prod.analytics.users`
-- WHERE ip != '0.0.0.0' AND time >= '2026-11-09'
-- GROUP BY week ORDER BY week;

-- Games per player for swapped players against everyone else (did the swap drive them away?).
-- SELECT name_flag IS NOT NULL AS swapped, COUNT(DISTINCT uid) AS players,
--   ROUND(COUNT(DISTINCT pin) / COUNT(DISTINCT uid), 2) AS games_per_player
-- FROM `bullshit-wtf-prod.analytics.users`
-- WHERE ip != '0.0.0.0' AND time >= '2026-11-09'
-- GROUP BY swapped;
