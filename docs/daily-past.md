# Past daily puzzles: a page for each day

Each past day of the daily puzzle has a page of its own, for search and for links:

- `/daily/2026-11-18` and `/he/daily/2026-11-18`: that day's question, playable (pick, then the truth and the lies), with the answer, the lies and the source in a "The answer" block that is in the HTML from the start, so search reads it; it opens after a pick.
- `/daily/past` and `/he/daily/past`: every past day, newest first.
- `/sitemap-daily.xml`: both lists and every past day, each with its twin in the other language. robots.txt names it (written by `game/seo/build-daily.js`); `sitemap.xml` lists the two list pages.

## When a day shows

A day gets a page once it has ended in Israel (the puzzle's clock) and in every US time zone (Honolulu, UTC-10 all year, ends last). So the day before yesterday always shows, yesterday from 10:00 UTC, today and later never: their addresses answer 404 with noindex, and the lists, the sitemap and the day links leave them out. A day with no question of its own (a repeat) has no page.

## How it is served

The `dailyPast` function (`functions/src/controllers/daily-past.ts`) writes the HTML from `functions/data/daily-questions.json` at each request, through Hosting rewrites in `firebase.json`. Files written at build time would either stop at the deploy's day or put future answers on the site; a function asks the clock. Hosting's cache keeps an answer at most an hour, and never past the moment the next day turns public. It reads and writes no database. The page carries the site's arrival note and visit beacon (copied in by `copy-shared.js` as `functions/src/plain-scripts.ts`).

Deploy: functions and hosting together (the rewrites name the new function).

## Counting

- A game started from a day page carries `?via=daily-past`; from the list page, `?via=daily-past-list` (games.campaign).
- "Try today's question" opens `/daily?via=daily-past`, counted as `content_type = 'daily-past'` in `shares`.
- Views: the visit beacon's rows with `first` like `/daily/20%`, `/he/daily/20%` or `%/daily/past`.

On the emulators only, `DAILY_PAST_NOW` (any date `Date.parse` reads) sets the function's clock, to see that tomorrow stays hidden.
