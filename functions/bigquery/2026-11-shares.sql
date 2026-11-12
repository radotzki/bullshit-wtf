-- Game night sends: one row per send from a crew page's NEXT GAME NIGHT section, written by the
-- onShare function. Run once in bullshit-wtf-prod before (or soon after) deploying the functions.
-- Until the table exists the function logs "Bigquery Insert failed" and the send is not counted;
-- the page itself is unaffected.

CREATE TABLE IF NOT EXISTS `bullshit-wtf-prod.analytics.shares` (
  time TIMESTAMP NOT NULL OPTIONS (description = 'When the server got the send'),
  content_type STRING NOT NULL OPTIONS (description = 'What was shared: crew-night'),
  method STRING NOT NULL OPTIONS (description = 'How: whatsapp, calendar-share, calendar-download, google-calendar'),
  crew_id STRING OPTIONS (description = 'Crew whose page it was sent from'),
  locale STRING OPTIONS (description = 'Crew language, en or he'),
  uid STRING OPTIONS (description = 'Anonymous uid of the sending browser')
)
PARTITION BY DATE(time)
OPTIONS (description = 'Counted shares, one row per send (see functions/src/controllers/analytics.ts SHARE_METHODS)');

-- Since the lonely-lobby change, content_type 'invite' also lands here: lobby invite sends
-- (method whatsapp, native, copy) and lone hosts' "Start alone anyway" taps (method solo-start).
-- Same columns; crew_id is null for these. No schema change.

-- ---------------------------------------------------------------------------
-- Read-only queries. A share row has no PIN, so test sends are left out by browser: any browser
-- that joined a test game (users.via = 'test', see 2026-11-test-mark.sql).

-- Game night sends per method per day (UTC), with how many crews and browsers sent them.
-- SELECT DATE(time) AS day, method, COUNT(*) AS sends,
--   COUNT(DISTINCT crew_id) AS crews, COUNT(DISTINCT uid) AS senders
-- FROM `bullshit-wtf-prod.analytics.shares`
-- WHERE content_type = 'crew-night'
--   AND IFNULL(uid, '') NOT IN (SELECT uid FROM `bullshit-wtf-prod.analytics.users` WHERE via = 'test' AND uid IS NOT NULL)
-- GROUP BY day, method
-- ORDER BY day DESC, sends DESC;

-- Share of each method over the last 28 days.
-- SELECT method, COUNT(*) AS sends, ROUND(COUNT(*) / SUM(COUNT(*)) OVER (), 3) AS share
-- FROM `bullshit-wtf-prod.analytics.shares`
-- WHERE content_type = 'crew-night' AND time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 28 DAY)
--   AND IFNULL(uid, '') NOT IN (SELECT uid FROM `bullshit-wtf-prod.analytics.users` WHERE via = 'test' AND uid IS NOT NULL)
-- GROUP BY method ORDER BY sends DESC;

-- Lobby invites per method per day, and "Start alone anyway" taps (method solo-start).
-- SELECT DATE(time) AS day, method, COUNT(*) AS sends, COUNT(DISTINCT uid) AS senders
-- FROM `bullshit-wtf-prod.analytics.shares`
-- WHERE content_type = 'invite'
--   AND IFNULL(uid, '') NOT IN (SELECT uid FROM `bullshit-wtf-prod.analytics.users` WHERE via = 'test' AND uid IS NOT NULL)
-- GROUP BY day, method
-- ORDER BY day DESC, sends DESC;
