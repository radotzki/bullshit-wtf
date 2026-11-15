-- Visits: the rows of the visit beacon (game/src/index.html; the plain search pages carry the same
-- script), written by the `visit` function. Run once in bullshit-wtf-prod before (or soon after)
-- deploying the functions. Until the table exists the function logs "Bigquery Insert failed" and
-- visits are not counted; the site itself is unaffected.
--
-- One page view is one `view` id (random, made new on every page load, stored nowhere) and has:
--   one row of kind 'view'    as the page opens
--   rows of kind 'create' / 'join'  when that page view creates or joins a game
--   up to 3 rows of kind 'end'      when the page is hidden or closed (they carry created, joined,
--                                   last_page, booted and ms as they stood then)
--   one row of kind 'stuck'   if the app had not drawn after 12 s
-- So: page views = COUNT(DISTINCT view); a view made a game when any of its rows has created.
-- A row holds no IP address, no user agent, no uid, no nickname, no PIN and no crew id, and the
-- beacon sets no cookie and stores nothing on the device.

CREATE TABLE IF NOT EXISTS `bullshit-wtf-prod.analytics.visits` (
  time TIMESTAMP NOT NULL OPTIONS (description = 'When the server got the row'),
  kind STRING NOT NULL OPTIONS (description = 'view (page opened), create, join, end (page hidden or closed), stuck (app not drawn after 12 s)'),
  view STRING OPTIONS (description = 'Random id of one page load, stored nowhere; groups the rows of one page view'),
  page STRING OPTIONS (description = 'The address the page view opened on, without /he and with PINs and crew ids replaced: /, /join-game/:pin, /c/:id, /create-game, /how-to-play, /he/hanukkah'),
  last_page STRING OPTIONS (description = 'The page shown when this row was sent, same form as page'),
  locale STRING OPTIONS (description = 'Site language of the address: he under /he, else en'),
  lang STRING OPTIONS (description = 'Browser language, lower case: he-il, en-us'),
  ref STRING OPTIONS (description = 'Host of the referring site (no path): m.facebook.com, www.google.com; bullshit.wtf for a move inside the site; NULL when the browser sent none'),
  tag STRING OPTIONS (description = 'The ?via= tag of the link: a post tag (fb-he-hanukkah-parents), a join source (link, qr, results, crew) or a test tag; else the post tag the tab arrived with earlier'),
  test BOOL OPTIONS (description = 'The tag is test or test-<name>: a play-test, to leave out'),
  first_visit BOOL OPTIONS (description = 'The browser held nothing of the game when the page opened (never played, created, saved a crew or signed in here); NULL when storage could not be read'),
  created BOOL OPTIONS (description = 'This page view had created a game by the time of this row'),
  joined BOOL OPTIONS (description = 'This page view had joined a game by the time of this row (a host joins their own game too)'),
  device STRING OPTIONS (description = 'iphone, ipad, android, android-tablet, mac, windows, chromebook, linux, other'),
  device_kind STRING OPTIONS (description = 'phone, tablet, desktop, other'),
  browser STRING OPTIONS (description = 'Browser family and major version (safari 18.1, chrome 156), or the app whose built-in browser it is (facebook, instagram, whatsapp, tiktok)'),
  bot BOOL OPTIONS (description = 'A crawler or a scripted browser (user agent, or navigator.webdriver)'),
  booted BOOL OPTIONS (description = 'The app had drawn; NULL on view rows (not known yet) and on plain pages'),
  ms INT64 OPTIONS (description = 'Milliseconds since the page opened'),
  err STRING OPTIONS (description = 'First script error or failed load of a file of the site, if any')
)
PARTITION BY DATE(time)
OPTIONS (description = 'Page views from the visit beacon, several rows per view (see functions/src/controllers/visit.ts). No personal data.');

-- ---------------------------------------------------------------------------
-- Read-only queries. Each has a date range: replace <from> and <to> (UTC dates, <to> not included).
-- Tests and bots are left out by `NOT IFNULL(test, FALSE) AND NOT IFNULL(bot, FALSE)`.
-- `ref` is the visitor's own site for a move inside the site (bullshit.wtf), shown as '(inside the site)'.

-- Home views that become created games, by referring site and tag.
-- A home view is a page view that opened on the home page (/ or /he: page = '/').
-- WITH v AS (
--   SELECT view,
--     ANY_VALUE(ref) AS ref, ANY_VALUE(tag) AS tag, ANY_VALUE(locale) AS locale,
--     LOGICAL_OR(IFNULL(first_visit, FALSE)) AS first_visit,
--     LOGICAL_OR(IFNULL(created, FALSE)) AS created
--   FROM `bullshit-wtf-prod.analytics.visits`
--   WHERE time >= TIMESTAMP('<from>') AND time < TIMESTAMP('<to>')
--     AND page = '/' AND view IS NOT NULL
--     AND NOT IFNULL(test, FALSE) AND NOT IFNULL(bot, FALSE)
--   GROUP BY view)
-- SELECT
--   CASE WHEN ref IS NULL THEN '(none)'
--        WHEN REGEXP_CONTAINS(ref, r'(^|\.)bullshit\.wtf$') THEN '(inside the site)'
--        ELSE ref END AS referring_site,
--   IFNULL(tag, '(none)') AS tag,
--   COUNT(*) AS home_views,
--   COUNTIF(first_visit) AS first_visits,
--   COUNTIF(created) AS created_games,
--   ROUND(SAFE_DIVIDE(COUNTIF(created), COUNT(*)), 3) AS share_created,
--   COUNTIF(locale = 'he') AS hebrew_views
-- FROM v
-- GROUP BY referring_site, tag
-- ORDER BY home_views DESC;

-- Page views per day and landing page, with how many were first visits, made a game or joined one.
-- WITH v AS (
--   SELECT view, MIN(time) AS t, ANY_VALUE(page) AS page, ANY_VALUE(locale) AS locale,
--     ANY_VALUE(device_kind) AS device_kind,
--     LOGICAL_OR(IFNULL(first_visit, FALSE)) AS first_visit,
--     LOGICAL_OR(IFNULL(created, FALSE)) AS created,
--     LOGICAL_OR(IFNULL(joined, FALSE)) AS joined
--   FROM `bullshit-wtf-prod.analytics.visits`
--   WHERE time >= TIMESTAMP('<from>') AND time < TIMESTAMP('<to>') AND view IS NOT NULL
--     AND NOT IFNULL(test, FALSE) AND NOT IFNULL(bot, FALSE)
--   GROUP BY view)
-- SELECT DATE(t) AS day, page, locale, COUNT(*) AS views, COUNTIF(first_visit) AS first_visits,
--   COUNTIF(device_kind = 'phone') AS on_phones,
--   COUNTIF(created) AS created_games, COUNTIF(joined AND NOT created) AS joined_as_guest
-- FROM v
-- GROUP BY day, page, locale
-- ORDER BY day DESC, views DESC;

-- Every landing page by tag: which post or page brought views, and what they did. A view that
-- opens on a plain page (/how-to-play, /he/hanukkah) and taps Start becomes a NEW view on
-- /create-game with the same tag and ref bullshit.wtf, so read a tag's views and creates together.
-- WITH v AS (
--   SELECT view, ANY_VALUE(tag) AS tag, ANY_VALUE(page) AS page,
--     LOGICAL_OR(IFNULL(created, FALSE)) AS created, LOGICAL_OR(IFNULL(joined, FALSE)) AS joined
--   FROM `bullshit-wtf-prod.analytics.visits`
--   WHERE time >= TIMESTAMP('<from>') AND time < TIMESTAMP('<to>') AND view IS NOT NULL
--     AND tag IS NOT NULL AND NOT IFNULL(test, FALSE) AND NOT IFNULL(bot, FALSE)
--   GROUP BY view)
-- SELECT tag, page, COUNT(*) AS views, COUNTIF(created) AS created_games, COUNTIF(joined) AS joined
-- FROM v GROUP BY tag, page ORDER BY tag, views DESC;

-- Stuck loads per day: page views where the app had not drawn after 12 s, by device and browser.
-- SELECT DATE(time) AS day, device, browser, COUNT(DISTINCT view) AS stuck_views, ANY_VALUE(err) AS an_error
-- FROM `bullshit-wtf-prod.analytics.visits`
-- WHERE time >= TIMESTAMP('<from>') AND time < TIMESTAMP('<to>') AND kind = 'stuck'
--   AND NOT IFNULL(test, FALSE) AND NOT IFNULL(bot, FALSE)
-- GROUP BY day, device, browser ORDER BY day DESC, stuck_views DESC;

-- Is the beacon alive, and how much of it is tests and bots (to check after a deploy).
-- SELECT DATE(time) AS day, COUNT(DISTINCT view) AS views,
--   COUNT(DISTINCT IF(IFNULL(test, FALSE), view, NULL)) AS test_views,
--   COUNT(DISTINCT IF(IFNULL(bot, FALSE), view, NULL)) AS bot_views
-- FROM `bullshit-wtf-prod.analytics.visits`
-- WHERE time >= TIMESTAMP('<from>') AND time < TIMESTAMP('<to>')
-- GROUP BY day ORDER BY day DESC;
