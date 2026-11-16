# The daily puzzle (`/daily`, `/he/daily`)

One question a day per language, the same for everyone. A visitor picks the true answer among the
house's lies, sees how today's players did, sends the result, and can hide a lie of their own in a
link for friends. One button starts a real game, tagged so it can be counted.

## Where things are

| What | Where |
|---|---|
| The questions | `functions/data/daily-questions.json` (ids `daily-26-(en\|he)-NNN`, a `day` each). Never loaded into the game's bank. |
| The function | `daily` in `functions/src/index.ts`; its rules, pure and tested, in `functions/src/controllers/daily.ts` |
| The page | `game/seo/daily-page.js` (written into `dist/` by `game/seo/build-daily.js`, which `npm run build` runs after `build-pages.js`), words in `daily-strings.js`, rules in `daily-core.js`, page script in `daily-client.js` |
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

## A chat group's round (the puzzle's group mode)

A whole chat group plays one round of the question from one link, with no need to gather: each
person taps once, picks among the truth and the lies of everyone before them, sees whose lie got
them, adds a lie of their own, and their own message to the chat is the reveal ("I fell for Dana's
lie"). There are no stages and no host. Spec: Product's "a round the whole chat group plays".

| What | Where |
|---|---|
| The rules, pure and tested | `functions/src/controllers/daily-round.ts` (`functions/test/daily-round.test.js`) |
| Reads and writes | `functions/src/controllers/daily-store.ts`, routed by the same `daily` function |
| The page's rules and messages | `game/seo/daily-round-core.js` (`game/test/daily-round-core.test.js`), words in `daily-strings.js` |
| The page script | `game/seo/daily-round-client.js`, called by `daily-client.js` |
| Emulator run | `node .github/smoke/emulator-round.js` (four browsers per language; `SHOTS=<dir>` saves screenshots) |

- **The 50/50 test.** Half of browsers, by the page's random id (ids starting `a` to `r`; in SQL
  `REGEXP_CONTAINS(uid, r'^[a-r]')`), get one card on the reveal, "Now fool your group", in place of
  SEND TO YOUR GROUP and "Now fool your friends". A browser that arrives by a round link always gets
  the round. `&round=on` or `&round=off` in the address moves that visit to a half, with any tag or
  none (the owner's phone before a post: `/he/daily?via=daily-round-wa-he-family&round=on`). A
  browser it moved out of its own half sends one `round-forced` row a day (`shares`, no `crew_id`;
  not from a play-test): leave those `uid`s out of the test's comparison:
  `AND uid NOT IN (SELECT uid FROM shares WHERE method = 'round-forced')`.
- **The link** is `/daily?n=<puzzle number>&g=<round id>` (`/he/daily` in Hebrew): the number tells
  the server the round's day, the id is ten random letters and digits made in the starter's browser.
  A play-test's round link carries its `via=test` tag, so everyone who opens it is a tester too, and
  a post's round carries the post's tag (`&via=daily-round-wa-he-family`), so everyone who opens it
  keeps it. The puzzle's fixed arrivals (`daily-home`, `daily-share` and the like) stay off the link.
- **Where a round lives:** `qHistory/daily/<lang>/<day>/rounds/<id>`, beside the day's tallies, so
  no database rule changed. It keeps the browsers' names (9 letters), their lies (40), their picks,
  and the answers each browser was dealt. Browser ids never leave the server: lies go out under ids
  of their own.
- **How long:** a round takes plays on its day and the next (the puzzle's "today or yesterday"),
  shows its final board read-only for a week after that, and is erased nine days after its day: the
  first call of the `daily` function each day (per running copy; any question asked, pick or press,
  on the plain puzzle too, round or no round) erases every day's rounds from nine to four hundred
  days back. So the board's line holds while anyone plays the daily puzzle, also after the round
  test stops. If the puzzle itself is ever taken down, erase `qHistory/daily/*/*/rounds` by hand.
- **`GET /_daily?lang=&n=&g=&u=<browser id>`** answers the puzzle as usual plus `round`, never cached:
  the names on the lies, this browser's answers (the truth, up to three of the group's lies, four once
  there are four or more, fewest-seen first, and the house's lies to make four; kept for the browser),
  and, once it took part or the round is over, the board.
- **`POST /_daily` with `a`** (a fetch, answered with the round): `start`, `pick`, `lie` (a name, a
  lie, or both), `remove` (one's own lie) and `flag` ("Not OK"; two browsers take a lie down). Each
  runs in a transaction: one pick and one lie per browser, 30 browsers a round, one browser per name,
  and the same screen as the page (no truth, no lie already there, no slur or sex word, no link, `@`
  or five digits).
- **Rows.** `shares`, with the round's id in `crew_id` and `content_type` `daily-round` for those who
  came by a round link: `round-start`, `round-other` (a round in another group), `round-lie`,
  `round-flag`, `truth`/`house`/`friend` for a pick in a round, and from the page `round-tell-whatsapp`,
  `round-tell-native`, `round-tell-copy`, `round-score`, `round-back`, `open` and `create`. A pick in
  a round also adds to the day's tallies. A test round writes neither. Rows from a post's tagged round
  are `daily-post`, as every post's are; its start adds one more row, `content_type` `round-via`, with
  the post's tag in `method` and the round's id in `crew_id`, so the post's rounds are told apart:

```sql
-- A post's rounds: players and rounds by the post's tag (a round started from another round of the
-- same post carries the same tag)
WITH via AS (SELECT crew_id AS round, method AS tag FROM `bullshit-wtf-prod.analytics.shares` WHERE content_type = 'round-via')
SELECT tag, COUNT(DISTINCT s.crew_id) AS rounds, COUNT(DISTINCT s.uid) AS players
FROM `bullshit-wtf-prod.analytics.shares` s JOIN via ON s.crew_id = via.round
WHERE STARTS_WITH(s.content_type, 'daily')
  AND s.method IN ('truth', 'house', 'friend', 'round-start', 'round-other', 'round-lie')
GROUP BY tag ORDER BY players DESC;
```

- **Chat-round players are not weekly players.** They are reported as a line of their own:

```sql
-- Chat-round players a week, and rounds by size (a round of one is a puzzle play, not a round)
WITH part AS (
  SELECT crew_id AS round, uid, DATE_TRUNC(DATE(time, 'Asia/Jerusalem'), ISOWEEK) AS week
  FROM `bullshit-wtf-prod.analytics.shares`
  WHERE STARTS_WITH(content_type, 'daily') AND crew_id IS NOT NULL
    AND method IN ('truth', 'house', 'friend', 'round-start', 'round-other', 'round-lie')
), size AS (SELECT round, COUNT(DISTINCT uid) AS players FROM part GROUP BY round)
SELECT week, COUNT(DISTINCT IF(players >= 2, uid, NULL)) AS chat_round_players,
       COUNT(DISTINCT IF(players >= 2, round, NULL)) AS rounds_2plus,
       COUNT(DISTINCT IF(players >= 3, round, NULL)) AS rounds_3plus,
       COUNT(DISTINCT round) AS rounds_started
FROM part JOIN size USING (round) GROUP BY week ORDER BY week;
```

Live games that came from a round carry the tag `daily-round` (`opened_games.campaign`), or on a
post's round `daily-round-<the post's tag>` (the tag itself when it starts with `daily-round-`, cut to
40 letters): `STARTS_WITH(campaign, 'daily-round')` counts them all.

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
