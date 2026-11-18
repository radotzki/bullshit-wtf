# The daily puzzle on other sites (`/embed/daily`, `/he/embed/daily`)

Any site can show the daily puzzle (see `docs/daily-puzzle.md`) with one line of code: an iframe of a
small page. A visitor there sees today's question, picks an answer, sees the reveal and today's
numbers, and gets one button back to the game, PLAY THIS WITH FRIENDS, which opens bullshit.wtf in a
new tab on the create page, tagged with the site the embed sits on.

The page that hands out the line is `/daily-on-your-site` (`/he/daily-on-your-site` in Hebrew), with a
live preview. The daily puzzle links to it at the bottom, and so does every search page's footer.

## Where things are

| What | Where |
|---|---|
| The two pages of each language | `game/seo/embed-page.js` (`renderEmbed`, `renderCopy`, the line itself in `snippet`), written into `dist/` by `game/seo/build-embed.js`, which `npm run build` runs after `build-daily.js` |
| Words | `game/seo/embed-strings.js`; the question, reveal and numbers use the puzzle's own `daily-strings.js` |
| Rules (which site, which tag, the links out) | `game/seo/embed-core.js`, with the puzzle's `daily-core.js` |
| The embed's script | `game/seo/embed-client.js` |
| Who may frame it | `firebase.json`, the header rule for `^/(he/)?embed/daily…`: `Content-Security-Policy: frame-ancestors *`, `no-cache`, `X-Robots-Tag: noindex` |
| Tests | `game/test/embed.test.js` |
| Emulator run | `node .github/smoke/emulator-embed.js` (the embed inside a page of "school.example.org", 320 and 390 px, both languages; `SHOTS=<dir>` saves screenshots) |

## The line

```html
<iframe src="https://bullshit.wtf/embed/daily" title="Today's Bullshit: one truth, three lies" width="100%" height="600" style="max-width:420px;border:0;border-radius:12px" loading="lazy" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe>
```

- **Nothing runs in the host page.** It is one iframe. The sandbox lets the embed run its own script
  and open the game in a new tab, and never lets it move the host page (no `allow-top-navigation`).
- **No cookies on the host site.** The embed keeps today's pick and a random browser id in its own
  storage, which browsers keep apart per site; with storage blocked it still plays.
- **Light.** One HTML file, about 38 KB with the visit beacon, no fonts, images or outside scripts; then one `GET /_daily`.
- **The answer is not in the page.** As on the puzzle's own page, the question and its answers come
  from `/_daily` after the page loads.

## The tag

Everything the embed sends and links to carries one `?via=` tag (`embed-core.js`, `embedTag`):

- `embed-<site>`: the site the embed sits on, from the parent page's origin (`location.ancestorOrigins`,
  Chrome and Safari) or else the referrer (Firefox). Small letters, `www.` dropped, dots to dashes,
  34 letters at most: `www.school.org.il` gives `embed-school-org-il`.
- `embed-preview`: the copy page's own live preview (bullshit.wtf, or the host the embed is served from).
- `embed`: the site could not be told (no referrer and no parent origin).
- The iframe's own `?via=` wins when it is a clean tag: `?via=test` makes the embed a play-test (no
  row, no tally, a test game), and a partner can be given a tag of its own (`?via=embed-tnua-x`).

## Counting

No new table, column, function or database rule. The embed is counted with rows that already exist.

**Loads, by site: `analytics.visits`.** The embed carries the site's visit beacon, so each load is a
`view` row with `page` `/embed/daily` (or `/he/embed/daily`) and `ref` the host page's host name.

```sql
-- Embed loads a week, by the site that shows it
SELECT DATE_TRUNC(DATE(time, 'Asia/Jerusalem'), ISOWEEK) AS week, ref AS site, COUNT(*) AS loads
FROM `bullshit-wtf-prod.analytics.visits`
WHERE kind = 'view' AND page IN ('/embed/daily', '/he/embed/daily') AND NOT test AND NOT bot
GROUP BY week, site ORDER BY week, loads DESC;
```

**Plays, by site: `analytics.shares`.** The embed posts to `/_daily` like the puzzle's page, with its
tag as the source. A tag that is not one of the puzzle's own arrivals is a post's: every row is
`content_type` `daily-post` (`open`, `truth`, `house`, `create`), and the open adds one more row,
`content_type` `post-via`, with the tag in `method` and the browser's `uid` (see
`docs/daily-puzzle.md`, "A post's own tag"). Join on `uid` and the day:

```sql
-- Embed players, picks and presses on PLAY THIS WITH FRIENDS, by site
WITH via AS (
  SELECT DISTINCT method AS tag, uid, DATE(time, 'Asia/Jerusalem') AS day
  FROM `bullshit-wtf-prod.analytics.shares`
  WHERE content_type = 'post-via' AND STARTS_WITH(method, 'embed') AND method != 'embed-preview' AND uid IS NOT NULL)
SELECT via.tag, COUNT(DISTINCT via.uid) AS opened,
       COUNT(DISTINCT IF(s.method IN ('truth', 'house'), s.uid, NULL)) AS picked,
       COUNT(DISTINCT IF(s.method = 'create', s.uid, NULL)) AS pressed_play
FROM via LEFT JOIN `bullshit-wtf-prod.analytics.shares` s
  ON s.uid = via.uid AND DATE(s.time, 'Asia/Jerusalem') = via.day
  AND s.content_type = 'daily-post' AND s.crew_id IS NULL
GROUP BY via.tag ORDER BY opened DESC;
```

**Games, by site: `analytics.opened_games`.** A game made from the button carries the tag as its
`campaign`.

```sql
-- Games of 2+ players that started from an embed, by site
SELECT campaign AS tag, COUNT(*) AS games, SUM(players) AS seats
FROM `bullshit-wtf-prod.analytics.opened_games`
WHERE players >= 2 AND STARTS_WITH(campaign, 'embed')
GROUP BY tag ORDER BY games DESC;
```

The puzzle's own queries that read `daily-post` rows (posts) now also see embed plays; tell them apart
by the `post-via` row's tag (`STARTS_WITH(method, 'embed')`).

## Not done here

- **Only the embed's path names who may frame it.** The rest of the site sends no `X-Frame-Options` or
  `frame-ancestors` today, so any page of it can be framed, as before this change. Closing that is a
  change of its own.
- The iframe has a fixed height: a page in an iframe cannot grow its frame without a script in the host
  page, which this line never adds. At 600 px the reveal of a long question fits at 320 px wide; the
  page scrolls inside the frame if it ever does not.
