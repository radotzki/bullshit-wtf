-- Hanukkah night: tables that play two or more Hanukkah nights (game/: components/hanukkah-night).
-- Read-only: no column to add. Hanukkah 2026: night 1 is the evening of Friday 4 December, night 8
-- the evening of Friday 11 December. An evening runs on until 05:00 (as on the final screen); the
-- evening is read in Israel's time, where most Hanukkah games are played.
--
-- What is tagged:
--   * SAME TABLE TOMORROW on a Hanukkah night's final screen saves a calendar entry whose link is the
--     finished game's join page with ?via=hanukkah-night-<N>, N the night it is for (2 to 8).
--   * Its PLAY AGAIN, SAME TABLE opens the table's lobby with campaign hanukkah-night-<N>
--     (opened_games.campaign, closed_games.campaign), origin 'table', parent_pin the night before's game.
--   * shares rows: content_type 'hanukkah-night' (save, save-google: presses, crew_id = the game's PIN)
--     and 'night-after' / 'seen-hanukkah' (the link opened its join page).
-- Test games (campaign test or test-*) are left out everywhere.

-- 1. The bet's numbers: families that played two or more Hanukkah nights, tag or none, counted two ways.
--    Only games of 2+ players count (as in the weekly-active-user rule); solo games are left out.
--    A night counts when one of the games reached its final scores that evening.
--    a) Tables: a chain of games joined by parent_pin (Replay, crew rematch, PLAY AGAIN, SAME TABLE),
--       named by its first game. `by_button`: tables of which a game came through the tagged link.
--    b) Hosts: the browser that created the game (creator_uid). This catches a family that comes back
--       by opening the site and pressing CREATE again, which starts a new chain and so is missed by a).
--       Checked on 23 Nov 2026 with the nights moved to 14-21 Nov: 77 tables, none on two nights;
--       76 hosts, 8 on two or more nights, all by a new game. Over 26 Oct-22 Nov (28 nights): 284
--       tables, none on two nights; 188 hosts, 15 on two or more. A few of those are 2-player games in
--       both languages on most evenings, which may be untagged play-tests: look at them before quoting.
--       `back_by_a_new_game`: hosts whose games on those nights came from two or more chains.
WITH RECURSIVE
  params AS (SELECT DATE '2026-12-04' AS first_night, 8 AS nights),
  games AS (
    SELECT o.id, o.parent_pin, o.campaign
    FROM `bullshit-wtf-prod.analytics.opened_games` o, params
    WHERE o.time >= TIMESTAMP(DATE_SUB(params.first_night, INTERVAL 14 DAY))
      AND o.time < TIMESTAMP(DATE_ADD(params.first_night, INTERVAL params.nights + 1 DAY))
      AND NOT REGEXP_CONTAINS(IFNULL(o.campaign, ''), r'^test(-|$)')
  ),
  tables AS (
    SELECT id, id AS table_id FROM games
    WHERE parent_pin IS NULL OR parent_pin NOT IN (SELECT id FROM games)
    UNION ALL
    SELECT g.id, t.table_id FROM games g JOIN tables t ON g.parent_pin = t.id
  ),
  played AS (
    SELECT c.id, c.creator_uid,
      DATE_DIFF(DATE(TIMESTAMP_SUB(c.time, INTERVAL 5 HOUR), 'Asia/Jerusalem'), params.first_night, DAY) + 1 AS night
    FROM `bullshit-wtf-prod.analytics.closed_games` c, params
    WHERE c.players >= 2
      AND c.time >= TIMESTAMP(DATE_SUB(params.first_night, INTERVAL 1 DAY))
      AND c.time < TIMESTAMP(DATE_ADD(params.first_night, INTERVAL params.nights + 1 DAY))
      AND NOT REGEXP_CONTAINS(IFNULL(c.campaign, ''), r'^test(-|$)')
  ),
  night_games AS (
    SELECT p.id, p.creator_uid, p.night, t.table_id, g.campaign
    FROM played p
    JOIN tables t ON t.id = p.id
    JOIN games g ON g.id = p.id, params
    WHERE p.night BETWEEN 1 AND params.nights
  ),
  table_nights AS (
    SELECT table_id, COUNT(DISTINCT night) AS nights,
      LOGICAL_OR(STARTS_WITH(IFNULL(campaign, ''), 'hanukkah-night-')) AS by_button
    FROM night_games
    GROUP BY table_id
  ),
  host_nights AS (
    SELECT creator_uid, COUNT(DISTINCT night) AS nights, COUNT(DISTINCT table_id) AS chains
    FROM night_games
    WHERE creator_uid IS NOT NULL
    GROUP BY creator_uid
  )
SELECT
  (SELECT COUNT(*) FROM table_nights) AS tables_on_a_hanukkah_night,
  (SELECT COUNTIF(nights >= 2) FROM table_nights) AS tables_on_two_or_more_nights,
  (SELECT COUNTIF(nights >= 2 AND by_button) FROM table_nights) AS of_which_by_the_button,
  (SELECT COUNTIF(nights >= 3) FROM table_nights) AS tables_on_three_or_more_nights,
  (SELECT MAX(nights) FROM table_nights) AS most_nights_of_a_table,
  (SELECT COUNT(*) FROM host_nights) AS hosts_on_a_hanukkah_night,
  (SELECT COUNTIF(nights >= 2) FROM host_nights) AS hosts_on_two_or_more_nights,
  (SELECT COUNTIF(nights >= 2 AND chains >= 2) FROM host_nights) AS of_which_back_by_a_new_game,
  (SELECT COUNTIF(nights >= 3) FROM host_nights) AS hosts_on_three_or_more_nights,
  (SELECT MAX(nights) FROM host_nights) AS most_nights_of_a_host;

-- 2. The button, night by night: presses on each night's final screen and the links opened (by the
--    evening they happened), and the lobbies those links opened, by the night they were for, with how
--    many were played to the end. So night 3's saves should show up as night 4's lobbies.
--    Checked on 18 Nov 2026 (dry run) and query 1 with the nights moved to 9-15 Nov: 89 tables, none
--    on two nights, before any of this was live.
-- SELECT night,
--   SUM(saves) AS saves, SUM(google) AS google, SUM(opened_links) AS opened_links,
--   SUM(lobbies) AS lobbies, SUM(played) AS played
-- FROM (
--   SELECT DATE_DIFF(DATE(TIMESTAMP_SUB(time, INTERVAL 5 HOUR), 'Asia/Jerusalem'), DATE '2026-12-04', DAY) + 1 AS night,
--     COUNTIF(method = 'save') AS saves, COUNTIF(method = 'save-google') AS google,
--     0 AS opened_links, 0 AS lobbies, 0 AS played
--   FROM `bullshit-wtf-prod.analytics.shares` WHERE content_type = 'hanukkah-night' GROUP BY night
--   UNION ALL
--   SELECT DATE_DIFF(DATE(TIMESTAMP_SUB(time, INTERVAL 5 HOUR), 'Asia/Jerusalem'), DATE '2026-12-04', DAY) + 1,
--     0, 0, COUNT(*), 0, 0
--   FROM `bullshit-wtf-prod.analytics.shares` WHERE content_type = 'night-after' AND method = 'seen-hanukkah' GROUP BY 1
--   UNION ALL
--   SELECT CAST(REGEXP_EXTRACT(o.campaign, r'^hanukkah-night-(\d)$') AS INT64),
--     0, 0, 0, 1, IF(c.id IS NULL, 0, 1)
--   FROM `bullshit-wtf-prod.analytics.opened_games` o
--   LEFT JOIN `bullshit-wtf-prod.analytics.closed_games` c ON c.id = o.id
--   WHERE STARTS_WITH(IFNULL(o.campaign, ''), 'hanukkah-night-')
-- )
-- WHERE night BETWEEN 1 AND 8
-- GROUP BY night ORDER BY night;
