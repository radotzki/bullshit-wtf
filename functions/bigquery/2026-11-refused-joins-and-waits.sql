-- Refused joins, and how long a table waits for its slowest player.
--
-- LEFT TO THE OWNER: run the statements below once in bullshit-wtf-prod, BEFORE the merge that
-- releases the functions (a merge to master is a release). Nothing else runs them.
--   bq query --use_legacy_sql=false --project_id=bullshit-wtf-prod < functions/bigquery/2026-11-refused-joins-and-waits.sql
-- Both are safe to run twice, and both only add: no row and no column that exists is changed.
--
-- Until they are run, nothing breaks and no game is affected, but:
--   * without the table, each refused join logs "Bigquery Insert failed" and is not counted;
--   * without the columns, question_results rows land as before, and the three new numbers are
--     dropped silently (ignoreUnknownValues). They cannot be recovered later for those questions.

-- 1. One row each time the server answers "game is full" to a join (the ninth player).
--    It describes the game only. Nothing about the player who was turned away: no uid, no
--    nickname, no IP address, no user agent.
CREATE TABLE IF NOT EXISTS `bullshit-wtf-prod.analytics.refused_joins` (
  time TIMESTAMP NOT NULL OPTIONS (description = 'When the server refused the join'),
  pin STRING NOT NULL OPTIONS (description = 'Game PIN (opened_games.id, users.pin)'),
  players INT64 OPTIONS (description = 'Players in the game at that moment (8: the table is full)'),
  started BOOL OPTIONS (description = 'The game had left the lobby; FALSE means the ninth player came while friends were still gathering'),
  locale STRING OPTIONS (description = 'Game language, en or he'),
  campaign STRING OPTIONS (description = "The game's campaign tag (as on opened_games); test or test-... marks a play-test")
)
PARTITION BY DATE(time)
OPTIONS (description = 'Joins refused because the game was full, one row per refusal (functions/src/controllers/join.ts). No personal data.');

-- 2. Three numbers on each question row. NULLABLE, old rows stay NULL.
ALTER TABLE `bullshit-wtf-prod.analytics.question_results`
  ADD COLUMN IF NOT EXISTS lie_span_s FLOAT64 OPTIONS (description = 'Seconds from the first lie to the last, to a tenth. NULL with fewer than two lies, or when a lie has no time'),
  ADD COLUMN IF NOT EXISTS pick_span_s FLOAT64 OPTIONS (description = 'Seconds from the first pick to the last, to a tenth. NULL with fewer than two picks, or when a pick has no time'),
  ADD COLUMN IF NOT EXISTS unpicked_lies INT64 OPTIONS (description = "Players' lies that nobody picked (of lies). NULL before the column was written");

-- ---------------------------------------------------------------------------
-- How to read them.
--
-- refused_joins counts refusals, not people: the row has nothing to tell two people apart, and a
--   person who taps JOIN again writes another row. Count games with a refusal, or group refusals
--   that are close in time. The join log (users) may hold the ninth player's name as before: the
--   phone logs a join before the server answers.
-- lie_span_s / pick_span_s are the time between the first and the last answer that DID arrive.
--   A player who never answers is not in the span: that question ran its timer out instead, which
--   shows as lies < players (or picks < players). So the wait a "who are we waiting for" line can
--   win is: the span on questions where everyone answered, and the timer on the others.
--   Lies are timed when the server stores them, picks when the phone's write reaches the database.
-- unpicked_lies counts lies, and two players who wrote the same lie count as two. A lie's writer
--   cannot pick it, so at a table of two each lie has one possible victim.
-- A game that was running during the release has NULL spans on the question it was on.

-- ---------------------------------------------------------------------------
-- Read-only queries. Each has a date range: replace <from> and <to> (UTC dates, <to> not included).
-- Tests are left out by the campaign tag on refused_joins itself, and by PIN on question_results.
-- For a window that includes 5 to 11 November 2026 (tests played before any mark), also leave out
-- the PINs of the baseline's test-lobby rule.

-- Refused joins per day: refusals, games that refused anyone, and how many came during the lobby.
-- SELECT DATE(time) AS day, COUNT(*) AS refusals, COUNT(DISTINCT pin) AS games,
--   COUNT(DISTINCT IF(NOT started, pin, NULL)) AS games_refusing_in_the_lobby,
--   COUNTIF(locale = 'he') AS hebrew_refusals
-- FROM `bullshit-wtf-prod.analytics.refused_joins`
-- WHERE time >= TIMESTAMP('<from>') AND time < TIMESTAMP('<to>')
--   AND NOT REGEXP_CONTAINS(IFNULL(campaign, ''), r'^test(-|$)')
-- GROUP BY day ORDER BY day;

-- Of the games that started with 8 players, the share that turned somebody away.
-- WITH o AS (SELECT id, MIN(time) AS t FROM `bullshit-wtf-prod.analytics.opened_games`
--   WHERE time >= TIMESTAMP('<from>') AND time < TIMESTAMP('<to>') AND players = 8
--     AND NOT REGEXP_CONTAINS(IFNULL(campaign, ''), r'^test(-|$)') GROUP BY id),
-- r AS (SELECT pin, COUNT(*) AS refusals FROM `bullshit-wtf-prod.analytics.refused_joins`
--   WHERE time >= TIMESTAMP('<from>') AND time < TIMESTAMP_ADD(TIMESTAMP('<to>'), INTERVAL 1 DAY) GROUP BY pin)
-- SELECT COUNT(*) AS full_games, COUNTIF(r.pin IS NOT NULL) AS refused_someone,
--   ROUND(SAFE_DIVIDE(COUNTIF(r.pin IS NOT NULL), COUNT(*)), 3) AS share, SUM(IFNULL(r.refusals, 0)) AS refusals
-- FROM o LEFT JOIN r ON r.pin = o.id;

-- The wait, on questions where the table is still playing (half or more pick), by table size:
-- the median and the slowest tenth of the lie span and the pick span, and how many ran a timer out.
-- WITH test_pins AS (
--   SELECT id AS pin FROM `bullshit-wtf-prod.analytics.opened_games`
--   WHERE time >= TIMESTAMP_SUB(TIMESTAMP('<from>'), INTERVAL 1 DAY) AND time < TIMESTAMP('<to>')
--     AND REGEXP_CONTAINS(IFNULL(campaign, ''), r'^test(-|$)')
-- )
-- SELECT players, COUNT(*) AS questions,
--   COUNTIF(lies = players) AS all_lied, COUNTIF(picks = players) AS all_picked,
--   APPROX_QUANTILES(IF(lies = players, lie_span_s, NULL), 10)[OFFSET(5)] AS lie_span_median,
--   APPROX_QUANTILES(IF(lies = players, lie_span_s, NULL), 10)[OFFSET(9)] AS lie_span_p90,
--   APPROX_QUANTILES(IF(picks = players, pick_span_s, NULL), 10)[OFFSET(5)] AS pick_span_median,
--   APPROX_QUANTILES(IF(picks = players, pick_span_s, NULL), 10)[OFFSET(9)] AS pick_span_p90
-- FROM `bullshit-wtf-prod.analytics.question_results`
-- WHERE time >= TIMESTAMP('<from>') AND time < TIMESTAMP('<to>')
--   AND players >= 2 AND picks * 2 >= players AND unpicked_lies IS NOT NULL
--   AND id NOT IN (SELECT pin FROM test_pins)
-- GROUP BY players ORDER BY players;

-- Lies that fool nobody, exactly, by table size.
-- WITH test_pins AS (... as above ...)
-- SELECT players, SUM(lies) AS lies, SUM(unpicked_lies) AS fooled_nobody,
--   ROUND(SAFE_DIVIDE(SUM(unpicked_lies), SUM(lies)), 3) AS share
-- FROM `bullshit-wtf-prod.analytics.question_results`
-- WHERE time >= TIMESTAMP('<from>') AND time < TIMESTAMP('<to>')
--   AND players >= 2 AND unpicked_lies IS NOT NULL
--   AND id NOT IN (SELECT pin FROM test_pins)
-- GROUP BY players ORDER BY players;
