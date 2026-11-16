-- Where a host came from (functions/src/controllers/arrival.ts; DEPLOYING.md, "Where a host came from").
-- RUN THE THREE ALTER STATEMENTS ONCE IN bullshit-wtf-prod BEFORE THE MERGE that releases the
-- functions. Additive only: NULLABLE columns, old rows NULL, safe to run twice (IF NOT EXISTS).
-- Until they run, inserts still succeed (ignoreUnknownValues) and the new fields are dropped
-- silently: nothing breaks, the data is just lost for those days.
--
-- What the columns hold. The same five on three tables:
--   opened_games, closed_games   every game made on the Create page (origin = 'create')
--   users                        only the host's own join of that game (via = 'host', or 'test' in a
--                                test game), so a lobby that never starts still says where its host
--                                came from. NULL on every guest's join.
-- NULL on all five: a Replay or a crew rematch (the arrival counts the first game only, like a post
-- tag), or a game made by a phone still on the older site.
--
--   first_page     the first page of the host's visit: the path alone, never a query string, with
--                  every PIN and crew id replaced and /he folded into the app's own pages:
--                    /                  the home page (also /he)
--                    /how-to-play, /he/hanukkah, /party-games-on-your-phone ...   a search page
--                    /join-game/:pin    an invite link or a lobby code (the host first came as a guest)
--                    /c/:id             a crew link
--                    /create-game       a link straight to the Create page
--                    /daily             the daily puzzle, once it is live
--                    /score-board-final/:pin ...   a game screen: a tab left open from an earlier game
--                  The same form as visits.page (pull request 46).
--   referrer       the host name of the site that visit came from, lower case, nothing after it:
--                  www.google.com, m.facebook.com, com.google.android.googlequicksearchbox (an
--                  Android app). NULL when the browser sent none: a typed address, a bookmark, and
--                  most links opened from WhatsApp and other chat apps.
--   played_before  the browser had sat in a game before it created this one (as a guest or a host;
--                  read from what the game keeps on the phone, so it holds when the browser id changed)
--   hosted_before  the browser had created a game before this one
--   visit_minutes  whole minutes from that first page to creating the game; capped at 43200 (30 days).
--                  A large number means a tab that stayed open: first_page is then an old page.
-- No full address, no query string, no PIN, no crew id and no new id of any kind is written.
-- A post's tag stays where it was: opened_games.campaign.

ALTER TABLE `bullshit-wtf-prod.analytics.opened_games`
  ADD COLUMN IF NOT EXISTS first_page STRING OPTIONS (description = 'First page of the host visit: path only, PINs and crew ids replaced (/, /how-to-play, /join-game/:pin). NULL for a Replay, a crew rematch or an older site'),
  ADD COLUMN IF NOT EXISTS referrer STRING OPTIONS (description = 'Host name of the site the host visit came from (www.google.com); NULL when the browser sent none'),
  ADD COLUMN IF NOT EXISTS played_before BOOL OPTIONS (description = 'The creating browser had sat in a game before this one (from the phone storage)'),
  ADD COLUMN IF NOT EXISTS hosted_before BOOL OPTIONS (description = 'The creating browser had created a game before this one (from the phone storage)'),
  ADD COLUMN IF NOT EXISTS visit_minutes INT64 OPTIONS (description = 'Whole minutes from the first page of the visit to creating the game, capped at 43200');

ALTER TABLE `bullshit-wtf-prod.analytics.closed_games`
  ADD COLUMN IF NOT EXISTS first_page STRING OPTIONS (description = 'First page of the host visit: path only, PINs and crew ids replaced (/, /how-to-play, /join-game/:pin). NULL for a Replay, a crew rematch or an older site'),
  ADD COLUMN IF NOT EXISTS referrer STRING OPTIONS (description = 'Host name of the site the host visit came from (www.google.com); NULL when the browser sent none'),
  ADD COLUMN IF NOT EXISTS played_before BOOL OPTIONS (description = 'The creating browser had sat in a game before this one (from the phone storage)'),
  ADD COLUMN IF NOT EXISTS hosted_before BOOL OPTIONS (description = 'The creating browser had created a game before this one (from the phone storage)'),
  ADD COLUMN IF NOT EXISTS visit_minutes INT64 OPTIONS (description = 'Whole minutes from the first page of the visit to creating the game, capped at 43200');

ALTER TABLE `bullshit-wtf-prod.analytics.users`
  ADD COLUMN IF NOT EXISTS first_page STRING OPTIONS (description = 'On the host own join only (via = host): first page of the host visit, as on opened_games. NULL on a guest join'),
  ADD COLUMN IF NOT EXISTS referrer STRING OPTIONS (description = 'On the host own join only: host name of the site the visit came from'),
  ADD COLUMN IF NOT EXISTS played_before BOOL OPTIONS (description = 'On the host own join only: the browser had sat in a game before creating this one'),
  ADD COLUMN IF NOT EXISTS hosted_before BOOL OPTIONS (description = 'On the host own join only: the browser had created a game before this one'),
  ADD COLUMN IF NOT EXISTS visit_minutes INT64 OPTIONS (description = 'On the host own join only: whole minutes from the first page of the visit to creating the game');

-- ---------------------------------------------------------------------------
-- Read-only queries (nothing below changes anything). Replace <release> with the time the
-- functions went live (UTC), for example 2026-11-14 09:00:00. Written before any row existed:
-- not yet run against real rows.

-- 1. First-time hosts by first page and referring site.
-- A first-time host is a browser's first created game (not a Replay) of 2+ players since <release>
-- whose phone says it had not hosted before. Test games are left out by the usual mark.
-- WITH test_pins AS (
--   SELECT DISTINCT UPPER(TRIM(pin)) AS pin FROM `bullshit-wtf-prod.analytics.users`
--   WHERE time >= TIMESTAMP('<release>') AND via = 'test' AND pin IS NOT NULL
--   UNION DISTINCT
--   SELECT id FROM `bullshit-wtf-prod.analytics.opened_games`
--   WHERE time >= TIMESTAMP('<release>') AND REGEXP_CONTAINS(IFNULL(campaign, ''), r'^test(-|$)')),
-- g AS (
--   SELECT *, ROW_NUMBER() OVER (PARTITION BY creator_uid ORDER BY time) AS rn
--   FROM `bullshit-wtf-prod.analytics.opened_games`
--   WHERE time >= TIMESTAMP('<release>') AND players >= 2 AND origin IN ('create', 'crew')
--     AND creator_uid IS NOT NULL AND creator_uid NOT IN ('', '0')
--     AND id NOT IN (SELECT pin FROM test_pins)),
-- h AS (SELECT * FROM g WHERE rn = 1 AND NOT IFNULL(hosted_before, FALSE))
-- SELECT
--   CASE
--     WHEN first_page IS NULL THEN '0 not recorded (older site, or a crew rematch)'
--     WHEN first_page = '/join-game/:pin' THEN '1 invite link or lobby code'
--     WHEN first_page = '/c/:id' THEN '2 crew link'
--     WHEN REGEXP_CONTAINS(first_page, r'/:pin$') THEN '3 a game screen (a tab left open)'
--     WHEN REGEXP_CONTAINS(first_page, r'^/(he/)?daily(/|$)') THEN '4 daily puzzle'
--     WHEN first_page IN ('/', '/m', '/d', '/create-game', '/join-game', '/learn') THEN '5 home or an app page'
--     ELSE '6 search page' END AS route,
--   first_page,
--   CASE
--     WHEN referrer IS NULL THEN '(none: typed, bookmark or a chat app)'
--     WHEN REGEXP_CONTAINS(referrer, r'(^|\.)google\.|googlequicksearchbox') THEN 'google'
--     WHEN REGEXP_CONTAINS(referrer, r'bing\.|duckduckgo\.|yahoo\.|yandex\.|ecosia\.|brave\.') THEN 'another search engine'
--     WHEN REGEXP_CONTAINS(referrer, r'facebook\.|instagram\.|(^|\.)fb\.') THEN 'facebook or instagram'
--     WHEN REGEXP_CONTAINS(referrer, r'whatsapp') THEN 'whatsapp'
--     WHEN REGEXP_CONTAINS(referrer, r'reddit\.') THEN 'reddit'
--     ELSE referrer END AS came_from,
--   COUNT(*) AS first_time_hosts,
--   ROUND(COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS share,
--   ROUND(AVG(players), 1) AS avg_table,
--   COUNTIF(played_before) AS played_before,
--   COUNTIF(campaign IS NOT NULL) AS with_post_tag,
--   COUNTIF(locale = 'he') AS hebrew,
--   APPROX_QUANTILES(visit_minutes, 2)[OFFSET(1)] AS median_minutes_to_create
-- FROM h
-- GROUP BY route, first_page, came_from
-- ORDER BY route, first_time_hosts DESC;

-- 2. Lobbies that never started, by where their host came from (a lobby with no opened_games row
-- has only its users rows; the host's own join carries the arrival).
-- SELECT u.first_page, u.referrer, COUNT(*) AS lobbies_opened,
--   COUNTIF(o.id IS NULL) AS never_started, COUNTIF(o.players >= 2) AS started_with_2_plus
-- FROM `bullshit-wtf-prod.analytics.users` u
-- LEFT JOIN `bullshit-wtf-prod.analytics.opened_games` o
--   ON o.id = UPPER(TRIM(u.pin)) AND o.time BETWEEN TIMESTAMP_SUB(u.time, INTERVAL 1 HOUR) AND TIMESTAMP_ADD(u.time, INTERVAL 12 HOUR)
-- WHERE u.time >= TIMESTAMP('<release>') AND u.via = 'host' AND u.first_page IS NOT NULL
-- GROUP BY u.first_page, u.referrer
-- ORDER BY lobbies_opened DESC;

-- 3. Is it arriving? Created games per day and how many carry the arrival (to check after a deploy).
-- A game with origin 'create' and no first_page was made by a phone still on the older site.
-- SELECT DATE(time) AS day, COUNT(*) AS created_games, COUNTIF(first_page IS NOT NULL) AS with_first_page,
--   COUNTIF(referrer IS NOT NULL) AS with_referrer, COUNTIF(played_before) AS played_before
-- FROM `bullshit-wtf-prod.analytics.opened_games`
-- WHERE time >= TIMESTAMP('<release>') AND origin = 'create'
-- GROUP BY day ORDER BY day DESC;
