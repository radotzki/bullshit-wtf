# The daily puzzle (`/daily`, `/he/daily`)

One question a day per language, the same for everyone. A visitor picks the true answer among the
house's lies, sees how today's players did, sends the result, and can hide a lie of their own in a
link for friends. One button starts a real game, tagged so it can be counted.

## Where things are

| What | Where |
|---|---|
| The questions | `functions/data/daily-questions.json` (ids `daily-26-(en\|he)-NNN`, a `day` each). Never loaded into the game's bank. |
| The function | `daily` in `functions/src/index.ts`; its rules, pure and tested, in `functions/src/controllers/daily.ts` |
| The page | `game/seo/daily-page.js` (built by `build-pages.js`), words in `daily-strings.js`, rules in `daily-core.js`, page script in `daily-client.js` |
| Link previews | `graphics/daily.html`, rendered with `node graphics/render-daily.js` into `game/src/assets/og-daily-(en\|he).png` |
| Tests | `functions/test/daily.test.js`, `game/test/daily-*.test.js` |
| Emulator run | `node .github/smoke/emulator-daily.js` (both languages; `SHOTS=<dir>` saves screenshots) |

## How it works

- **The day is the date in Israel** (`Asia/Jerusalem`, summer time included) for both languages.
  The number is the count of days since the file's first day. Before that day the page still shows
  a question, with no number.
- **A day with no question of its own** (before the first, after the last, a gap) gets a repeat:
  the file is walked round from its first question. From ten days before the last question the
  function logs an error once a day, which reaches Sentry: time to add questions.
- **`GET /_daily?lang=he`** (a Hosting rewrite to the function) answers the question, its answers
  and today's tallies. Hosting's cache keeps it up to five minutes and never past midnight in Israel.
  With `&d=<day>&f=<link id>` it adds how many friends a sender's lie fooled (cached a minute).
- **`POST /_daily`** (a beacon) is one pick or one press. A pick adds one under
  `qHistory/daily/<lang>/<day>/picks/<k>` (`0` the truth, `1`… the lies in file order, `f` a friend's
  lie), and on a lie link under `links/<id>/seen` and `fooled`. Only today or yesterday is taken.
- **No database rule and no BigQuery column were added.** The tallies sit under `qHistory`, which
  only the server can read or write and the game only ever pushes to. Rows go to the existing
  `shares` table: `content_type` is how the visitor arrived (`daily`, `daily-home`, `daily-seo`,
  `daily-game`, `daily-share`, `daily-fool`, `daily-post`), `method` what they did (`open`, `truth`,
  `house`, `friend`, `whatsapp`, `native`, `copy`, `fool-whatsapp`, `fool-native`, `fool-copy`,
  `create`), `uid` a random id kept in the browser.
- **A friend's lie never reaches the server.** It travels in the link (`l=`, base64url of
  `[name, lie]`) and is screened in the browser before it is sent and again before it is shown:
  not the truth or an answer already there, no slur or sex word (the game's nickname lists), 40
  letters at most (9 for the name), no link, `@`, run of five digits or hidden direction marks.
  It is put on the page as text, never as HTML.
- **Starting a game** goes to `/create-game?via=<tag>`: the tag the visitor arrived with, or
  `daily`. On a Hanukkah day (`"pack": "hanukkah"`, `"candle": 1`–`8` on the question) the kicker
  names the candle and the button adds `pack=hanukkah`.

## Play-testing

Open `/daily?via=test` (or `/he/daily?via=test`). The page works as usual, but the server drops
every post tagged `test` or `test-…`: no tally changes and no row is written, and a game started
from it is a test game. The tag stays with the browser for the day.

## Reading the numbers

```sql
-- Games of 2+ players that started from the puzzle, and the hosts behind them
SELECT DATE_TRUNC(DATE(time, 'Asia/Jerusalem'), ISOWEEK) AS week,
       COUNT(*) AS games, COUNT(DISTINCT creator_uid) AS hosts, SUM(players) AS seats
FROM `bullshit-wtf-prod.analytics.opened_games`
WHERE players >= 2 AND STARTS_WITH(campaign, 'daily')
GROUP BY week ORDER BY week;
```

A visitor who arrived by a post's own tag starts a game under that tag, not under `daily…`.
Queries on `shares` should filter by `content_type`: the puzzle writes far more rows than the rest.
