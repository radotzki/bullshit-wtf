# Deploying bullshit.wtf

## Tests and deploys from GitHub (the normal way to release)

Two workflows in `.github/workflows` do the work. A release is: open a pull request, wait for its
tests, merge it to `master`.

**Tests** (`ci.yml`) run on every pull request, with no secrets and no Firebase project:

- Functions: `npm ci`, then `npm test` (builds, then runs every function test).
- Game client: `npm ci`, `npm run build` (lint, production build, Hebrew shell, search pages), `npm test`,
  and a check that the main files landed in `game/dist`.

**Deploy to production** (`deploy.yml`) runs on every push to `master`, so on every merged pull
request, and by hand (Actions tab, "Deploy to production", "Run workflow", branch `master`). A push
that changes only `*.md`, `docs/` or `graphics/` deploys nothing. It releases to `bullshit-wtf-prod`:

1. Runs the same tests again, on the merged code. If they fail, nothing is deployed.
2. Checks the Firebase key (below). No key, or a wrong one: the run fails with a plain message
   before anything is built or deployed. The check writes nothing to disk.
3. Builds the functions and the site. A broken build deploys nothing. Only after the last build
   is the key written to a temporary file, so no package's install or build script can read it.
4. Deploys **all functions**, then the **database rules**, then the **site**, in that order. Each
   step runs only if the one before it succeeded, so a failure never leaves a new site calling old
   functions. It can leave new functions with the old rules and site; functions are written to
   keep old clients working, so that state is safe, and a re-run finishes the release.

Things to know:

- One release runs at a time and is never cancelled halfway. If several merges queue up behind a
  running release, GitHub keeps only the newest waiting one, which holds all the others' code.
- To retry, re-run the failed run or start a manual run. Every step is safe to repeat.
- "Re-run" on an **old** run deploys that old commit again. That is the rollback; do not use it by
  accident. A manual run always deploys the tip of `master`.
- The workflow never passes `--force`. So if a change **removes or renames a function**, the
  functions step stops and lists the functions that are live but gone from the code; nothing is
  deleted by a machine. A person deletes them with the `firebase functions:delete` commands the log
  prints, then re-runs. The same goes for a function that gains a retry policy or minimum instances.
- If the functions step ends with "Functions successfully deployed but could not set up cleanup
  policy", the functions are live but the rules and site were not deployed. Run
  `npx firebase functions:artifacts:setpolicy -P bullshit-wtf-prod` once with the owner's sign-in,
  then re-run the workflow.

### The Firebase key

The deploy signs in as a Google service account. Its JSON key is the secret
`FIREBASE_SERVICE_ACCOUNT` of the GitHub **environment `production`** (GitHub: Settings,
Environments, production, Environment secrets). It is **not** a repository secret, and must not
be one.

Why an environment: a repository secret is handed to any workflow that runs from any branch of
this repository. A branch could then add or edit a workflow file and use the key with no merge
and no review; the `if: github.ref == 'refs/heads/master'` lines in `deploy.yml` do not stop
that, because the branch runs its own copy of the file. An environment secret is given only to a
job that names the environment, and GitHub refuses that job unless its branch is allowed by the
environment's rule. So the rule "nothing ships unless it was merged" is held by GitHub itself.

The environment's settings (owner, once, and before the secret is added):

1. Settings, Environments, New environment, name `production`.
2. Deployment branches and tags: "Selected branches and tags", then add the branch `master` and
   nothing else.
3. Environment secrets: add `FIREBASE_SERVICE_ACCOUNT`.
4. If a repository secret of that name exists (Settings, Secrets and variables, Actions), delete
   it: it would still be readable from any branch.

Set the branch rule before the secret. GitHub creates a missing environment by itself, with no
rule, the first time a job names it; an environment without the rule protects nothing. Do not
loosen the rule or add other branches to it. Pull requests from forks never get secrets.

In the job, the key is checked first, written to a temporary file on the runner only after all
installs and builds, right before the first deploy step, and removed at the end. It must never
be in the code, a workflow file, a log or a chat. The log prints only the account's email.

To make one (owner, once): Google Cloud console, project `bullshit-wtf-prod`, IAM, Service
accounts, create an account for deploys, add a JSON key, paste the whole file as the environment
secret's value. The account needs to deploy 1st gen functions, database rules and hosting. These roles should
cover it (not yet tried on this project): Cloud Functions Admin, Service Account User, Firebase Rules Admin, Firebase Realtime
Database Admin, Firebase Hosting Admin, Artifact Registry Reader, Service Usage Consumer (or, more
simply and more widely, Firebase Admin plus Service Account User). If a role is missing, the
failing step's log names the permission. To revoke access, delete the key in the console.

### What the pipeline does not do (still a person's step)

- **BigQuery schema SQL** (`functions/bigquery/*.sql`). Nothing runs it. A pull request that adds a
  column or table must say so in its description, and the SQL must be run **before** the merge.
  If it is skipped, rows still land, but the new fields are dropped silently.
- **Loading questions** into the database (`firebase database:update /questions ...`), which goes
  **after** the functions that understand them are live, so after the deploy run is green.
- **Deleting a function**, as above.
- **Google Search Console** (submitting the sitemap) and anything in the Firebase or Google Cloud
  consoles.
- The dev project (`bullshit-wtf-dev`) is not deployed by any workflow.

## Build

Needs Node 20 or newer (tested on Node 22; the workflows use 22).

```sh
npm install                       # Firebase CLI 15
(cd functions && npm ci && npm run build)
(cd game && npm ci && npm run build)   # output in game/dist
```

`game-model.ts`, `name-flag.ts` and `name-lists.json` are shared by both apps. Each build copies
them into place with `copy-shared.js` (the JSON becomes `name-lists.ts`), so the old `symlink.sh`
step is no longer needed.

## Nickname filter

The `join` function swaps a nickname that is a slur or a sex word for a sweet name ("Grandma",
"סבתא") and tells only that phone, with a toast in the lobby. The word lists, the allow list and
the swap names are in `name-lists.json`. To add a missed word, put it in the right list; to stop a
false hit, add the whole squashed name to `allow`. Then run `functions/test/name-flag.test.js` and
the BigQuery check in the growth notes before shipping. Crew names on the list are refused.

Release: run `functions/bigquery/2026-11-name-flag.sql` (adds `users.name_flag`), then all
functions, then the game. Until the SQL runs, joins still log, without `name_flag`.

The client is still Angular 4 with Angular CLI 1.7. To build it on a current Node:
`node-sass` is replaced by Dart Sass through an npm `overrides` entry, the build runs
with `--openssl-legacy-provider` (webpack 3 uses MD4), TypeScript is pinned to 2.3
(the newest Angular 4 accepts), and `game/.npmrc` sets `legacy-peer-deps`.

## Deploy by hand (production)

The workflow above runs these same three deploys, in the order functions, rules, site. By hand they
need the owner's Firebase sign-in (`npx firebase login`); use them only when GitHub Actions is down.
Mind the order: the `prod:deploy` script runs the site before the rules, so run the three one by one.

```sh
npm run prod:deploy-functions   # 19 functions (11 + phaseTimer + onRevealDone + createCrew + crewRematch + onShare + startGame + hostHere + visit), 1st gen, Node 22, us-central1
npm run prod:deploy-rules       # needed: games/$pin/creator and games/$pin/hostSeen readable (host-only START, host gone), games/$pin/revealDone writable (reveal NEXT), crews/$id and games/$pin/crew readable (saved crews), games/$pin/coach and games/$pin/ideas/$pid readable (round-1 lie helper)
npm run prod:deploy-game        # hosting
```

Round-1 lie helper: run `functions/bigquery/2026-11-round1-coach.sql` in BigQuery before deploying
the functions (it creates `analytics.question_results`, which every scoreboard writes to). Then
functions, rules, game. Without the new rules the game simply shows no helper.

Always deploy all functions after a change to game logic (`--only functions`, not one function by name).
Every function carries its own copy of the shared code, and `phaseTimer`, `answer`, `onRevealDone` and
`onAnswerSelection` move the game on as well as `tick`. Deploying `tick` alone left the old house lies live.

Host-only START on the server: the lobby's START calls the `startGame` function, which starts a game
made with a host key only for the phone that brings that key, big screen or not (the big screen only
shows the lobby; it starts only games with no host key). Games made by this
client carry `serverStart`, and for them the server ignores START ticks and the rules refuse writing
`tick` in the lobby. Games made by an older client keep starting by tick.

Host gone: in a `serverStart` game the host's lobby page calls `hostHere` every 20 s with its key, and
the server stores its own time in `games/$pin/hostSeen` (the host's join and Replay set it too). Once a
joined host has not reported in for 5 minutes, startGame lets anyone start, and the other phones show START
with "<host> seems to be gone". Without the rules deploy nobody sees START early, but the server still
allows it. Release order: functions
(startGame must exist before the site calls it), then rules, then the site.

Deploy functions first, then the game: the new client reads the error `message` and
`code` that the new functions send.

## Visit beacon

`game/src/index.html` runs a tiny script before everything else. When a page is hidden or closed
(up to 3 times), and once at 12 s if the app has still not drawn, it posts one line to `/_v` on the
game's own site, which `firebase.json` rewrites to the `visit` function (a beacon to another site is
dropped by blockers such as Samsung Internet's ad-block add-ons, and sendBeacon still reports success).
Deploy hosting for the rewrite; the `visit` function itself is unchanged. It posts: first and last path, whether the app started, the first script error, browser language,
referrer host, and a random id per page load (`view`, never stored on the phone) that groups the
rows of one page view. The function logs it as `visit {...}` with device and browser from the user agent;
no IP, no player data. Count visits (distinct `view`), stuck loads and how far people got (the last row of each view) from the function log
(filter `textPayload:"visit "`). Test phones say `HeadlessChrome` nowhere, so tell them apart by
time or by the scripted paths.

## What a deploy changes compared with what is live (checked 2026-11-05)

The live site is not built from master. Its bundles carry Angular 4.4.6, Firebase client
3.9.0, raven-js 3.22.1, howler 2.0.7 and Bulma 0.3, and its pages match the client code
as of March 2018 (commit fa86c18; commit 279ec10 changed only the functions). The live
functions were last deployed from 279ec10 (Node 10) or d295405 (Node 14); which one could
not be checked without Firebase access.

### Players will see

1. Styles: Bulma 0.3 becomes Bulma 0.9.4. Compared screen by screen (home, create, join,
   learn, present, phone and desktop), the pages look the same, with these small
   differences: the input placeholder text is lighter grey, the focused input has a soft
   orange glow, and the create-game options sit a little closer together. Two bigger
   differences (small option text, blue links and focus) are fixed in this change.
   Game screens (lobby, question, answers, reveal, scoreboards) could not be opened
   against the live backend from the build machine; check them on the dev project.
2. Join and answer forms: inputs and buttons are wrapped in Bulma `field` blocks
   (commits 7449a4c, 7b50332), which changes the spacing between them slightly.
3. Sound: howler 2.0.7 becomes 2.2.4. This may also stop Sentry issue BULLSHIT-5R
   (a sound stopped before it loaded); not verified.
4. Error text: when a cloud function call fails, the player sees the server's message
   (for example "Wrong game PIN") or "Network error calling join" instead of a blank
   error box.

### Error reporting (Sentry)

5. Client reporting is restored (master had removed it) with raven-js 3.26.4, the same
   SDK family as live, to the same Sentry project.
6. Errors now carry real messages:
   - The global handler sent `err.originalError`, which is usually undefined; that is the
     "undefined" issues (BULLSHIT-94, G4, QZ, R6). It now sends the error itself.
   - Failed function calls were sent as plain objects ("[object Object]", BULLSHIT-99,
     5N, R5) or broke on HTML error pages (BULLSHIT-WQ). They are now Errors with the
     server message, code, HTTP status and endpoint.
   - Each report is tagged `where` (createGame, startGame, join, answer, chooseAnswer,
     signInAnonymously, unhandled) and carries the PIN.
   - Wrong PIN and full game are no longer reported: they are expected.
   - A failed anonymous sign-in is reported once with its real cause (BULLSHIT-8W,
     WP), instead of a follow-on "reading 'uid' of undefined".
   - Events are tagged `environment: production`.
   Expect the old issue titles to stop and new, more specific ones to appear.

### Cloud Functions

7. Runtime Node 14 (or 10) becomes Node 22. Still 1st gen, same 11 functions, same
   names, region and URLs, same database triggers.
8. Libraries: firebase-functions 3 to 7.4 (using its `v1` API), firebase-admin 8 to
   13.10, @google-cloud/bigquery 1 to 9.6. @google-cloud/debug-agent (unused, retired)
   and the old functions emulator are removed.
9. HTTP errors always return `{ message, code }` JSON. Before, a thrown Error was sent
   as `{}`.
10. newGame now answers 500 with a message when it fails, instead of never answering.
    onJoinGame always answers, even if the BigQuery insert fails.
11. Game state writes in `tick` are now awaited before the function ends. Before, the
    function could finish before the write, which can stall a game.
12. BigQuery failures log the per-row reasons.
13. Phases end on a server deadline. A new 12th function, `phaseTimer` (on
    `games/{pin}/state`, 120s timeout, 128MB), waits for each timed phase's deadline and
    moves the game on, so a game no longer stalls when every phone (or the presenter
    screen) sleeps. Phones keep a backup timer: any awake phone ticks 2.5s after the
    deadline. Ticks from phones on the old client are still understood, so functions can
    go first. New spend: `phaseTimer` runs for the length of each timed phase, roughly
    7 minutes of 128MB function time per 7-question game.

### Lobby: only the host can start

Only the browser that created (or replayed) the game sees START; other phones see
"Waiting for <host> to start the game" and the player count. With a big screen, only the
big screen starts. This reads `games/$pin/creator`, which the new database rules make
readable. Until the rules are deployed the read is refused and every phone shows START,
as before, so the order of deploys does not matter, but deploy the rules for the change
to take effect. If the host has not joined the lobby after 90 seconds, anyone may start.

### Faster reveal

The reveal keeps the question on screen and builds up one row per picked answer
(1.6 s each on phones, 4.5 s with a big screen), then shows each player their result and
a NEXT button. When every player has tapped NEXT, the new `onRevealDone` function ends the
reveal early; it needs the new `revealDone` database rule. Without the rule the tap is
refused and the reveal ends at its deadline, so the order of deploys does not matter.
Round intro and score board now last 3 s instead of 5 s.

### Unchanged

Question data, game rules, scoring, Google Analytics tag
(Universal Analytics, which records nothing since 2023), hosting config apart from the
build output.

## How this was checked

- Functions: clean install and build on Node 22; Firebase CLI 15 loads all 11
  functions on Node 22; a full 5-question, 2-player game played against the Realtime
  Database emulator with the real rules: create, wrong PIN, join, typing the truth
  refused, answers, picks, scores (1500, 1500, 2250, 2250, 3000 per round as
  designed), final scoreboard, replay, question history.
- Client: clean install, lint and production build on Node 22; pages opened in a
  browser and compared with live; Sentry payloads captured in the browser show
  "Calling newGame failed with status 500", tag `where: createGame`, code and status.

## Saved crews

After a game, a group can save itself as a crew: bullshit.wtf/c/<id> shows its standings across
games (wins, then points) and a REMATCH button that opens one shared lobby for the crew.

- Data: `crews/<id>` in the Realtime Database (name, locale, members keyed by lowercase nickname,
  a log of games, the latest rematch lobby). World-readable by id, written only by functions.
  Games get a `crew` field; Replay carries it, so replays count for the crew.
- Functions: `createCrew` and `crewRematch` (HTTP, new), and `gameState` adds each finished crew game
  to the standings (a game counts when at least two played and at least half the crew was in it).
- Deploy order: functions (all 15), then rules (the crew page reads `crews/<id>`), then hosting.
- BigQuery: run `functions/bigquery/2026-11-crews.sql` once (adds NULLABLE `crew_id`). New values:
  `origin = 'crew'` and `users.via = 'crew'`.
- Next game night (client only, hosting deploy is enough): the crew page has a day and time picker,
  next Friday 21:00 by default. It sends the date with the crew link as a WhatsApp text, a calendar
  file (shared into the chat on phones that can share files, downloaded elsewhere) and a Google
  Calendar link. Nothing is stored on the server; the browser remembers its own last pick.
  Analytics: gtag `share` events with `content_type: crew-night` (Universal Analytics records nothing,
  so the count that matters is in BigQuery, below).

### Game night sends in BigQuery

Each game night send on a crew page calls the new `onShare` function, which adds a row to BigQuery
`analytics.shares` with its method: `whatsapp`, `calendar-share` (CALENDAR INVITE through the phone's
share sheet), `calendar-download` (the .ics downloaded) or `google-calendar`, plus the crew, its
language and the browser's anonymous uid. A calendar share now counts once (it used to log a second
`native` share event).

- Deploy order: run `functions/bigquery/2026-11-shares.sql` once (creates the table; until then the
  function logs an insert failure and nothing is counted), then functions (all 16), then hosting.
  Rules are unchanged.
- The same file holds the query for sends per method per day.

## Opening questions

- Questions can carry `opener: true`. In a normal game, question 1 is an opener nobody in the room has
  seen; the rest are picked as before. Openers are kept for question 1, so a room meets every opener
  (30 per language) before any repeats; once a room has seen them all they join the normal bank.
  A pack game (Hanukkah) still opens with a pack question. The re-pick at START (`tick`) and Replay
  (`fork`) use the same picker, so deploy all functions.
- The 60 questions (30 English, 30 Hebrew, ids `opener-en-01..30`, `opener-he-01..30`) are in
  `functions/data/opening-questions.json`. Load them **after** the new functions are live (old functions
  would mix them into any question slot and use them up):
  `npx firebase database:update /questions functions/data/opening-questions.json --instance bullshit-wtf-prod -P bullshit-wtf-prod`
- To retire one, add its id to `retired-questions.ts` as with any question.

## Hanukkah pack and campaign tags

- Questions can carry `pack: "hanukkah"`. Pack questions never appear in normal games. A pack game
  (`newGame` with `pack`, Replay of a pack game, or a crew rematch in the pack's season) mixes up to 3
  pack questions nobody in the room has seen, the first one opening the game. The room re-pick at START
  (`tick`) keeps the pack, so deploy all functions.
- The pack's questions live in `questions/hanukkah-*` in the database. Load them only **after** the
  new functions are live: old functions would mix them into every game.
- The create page offers the pack from `?pack=hanukkah`, and switched on by default during the season
  in `questionPacks` (game-model.ts). The lobby shows a Hanukkah line and the results card says so.
- `?lang=he` or arriving on a `/he` address makes Hebrew the default on the create page.
- A post's `?via=<tag>` (not one of the join sources) is sent with the game the tab creates and kept as
  `campaign`. The SEO pages pass it on to their Start button. The tags `test` and `test-<anything>` are
  reserved for play-tests (see "Test games" at the end): never put them on a real post.
- Database rules: `games/$pin/pack` is readable. BigQuery: run `functions/bigquery/2026-11-hanukkah.sql`
  once (NULLABLE `pack` and `campaign` on opened_games and closed_games).
- Images: `graphics/hanukkah.html`, rendered with `node graphics/render-hanukkah.js <assets> <posts>`.

## Step zero analytics and search basics (second change)

**Before deploying the functions**, add the new BigQuery columns once:

```sh
bq query --use_legacy_sql=false --project_id=bullshit-wtf-prod < functions/bigquery/2026-11-step-zero.sql
```

It only adds NULLABLE columns: `creator_uid`, `origin`, `parent_pin` on `opened_games`
and `closed_games`, and `via` on `users`. If it is skipped, inserts still succeed (the
functions set `ignoreUnknownValues`) but the new fields are dropped, so nothing is measured.
The same file holds the read-only queries for host return rate and joins by source.

What it records:
- `creator_uid`: the anonymous uid of the browser that created the game, or pressed
  Replay. The client now signs in anonymously before creating, which reuses the uid
  the browser already has.
- `origin`: `create` or `replay`; `parent_pin`: the finished game a replay came from.
- `users.via`: `pin` (typed), `link` (join link without a tag), `qr`, `results`, `host`
  (the creator joining their own game), `replay`, `other`; NULL from old clients still
  open in a tab.

Search basics, written into `game/dist` by `game/seo/build-pages.js` after the Angular
build: eight plain HTML pages (how to play, party games on your phone, Hanukkah, Purim;
English at `/…`, Hebrew at `/he/…`, linked with hreflang), `sitemap.xml` and
`robots.txt`. `firebase.json` turns on `cleanUrls`, so `/how-to-play` serves
`how-to-play.html` (and `/how-to-play.html` redirects to it). The home page gets a real
title and description, Open Graph tags as `property` (chat apps ignore `name`), and
structured data. After deploying, submit `https://bullshit.wtf/sitemap.xml` in Google
Search Console (needs the owner's Google sign-in).

Checks: `cd functions && npm test` (all function tests, no Firebase project or
credentials needed; `PRINT_ROWS=1` prints every row the run would send to BigQuery).

## Known leftovers

- npm audit reports moderate issues in transitive Google libraries (functions) and many
  in the 2017-era client toolchain (build-time only).
- raven-js is retired; moving to the current Sentry SDK needs a newer Angular.

## Final screen (winner, best lies, rematch, share)

The final screen celebrates the winner (or the tie), shows each player's place and their best lie
("NICKELBACK" · fooled 2 players), a BIGGEST BULLSHITTER badge for whoever fooled the most players,
a big REMATCH button (the same Replay as before: same players, new questions, and a crew game stays
a crew game) and SHARE RESULTS. Everything on it, the crew panel and the share sheet follow the
game's language (English or Hebrew, right to left). The results card and the share text carry the
best lie.

- Data: `tick` adds to `games/$pin/highlights/$pid` (text, fooled, points, question, total fooled) as
  each reveal starts. Only players' own lies that somebody picked count. `games/$pin/highlightsFrom`
  is the question it started counting from: the screen says "Nobody fell for their lies" only when it
  is 0, so games running across a deploy never claim that wrongly.
- Big screen: the winner card and the list (two columns above 4 players); REMATCH and SHARE stay on
  the phones.
- Deploy order: functions (all 18: `tick`, `phaseTimer`, `answer`, `onAnswerSelection` and
  `onRevealDone` all move the game on), then rules (`highlights` and `highlightsFrom` readable), then
  hosting. Without the new functions or rules the screen still works, just without the lies.
- No BigQuery change.

## Test games (play-tests that do not count as players)

Every play-test on the live site must start from a test link, so that its rows mark themselves and
stay out of the usage numbers. Nicknames no longer matter.

**How to set the mark.** The tester who hosts opens the site with a test tag, then creates the game
in that same tab:

```
https://bullshit.wtf/?via=test
https://bullshit.wtf/?via=test-qa-lobby      (any name after "test-": lowercase letters, digits, dashes)
https://bullshit.wtf/he?via=test             (Hebrew)
```

The tag stays with the tab until it is closed, so every game created in it is a test game. The other
testers join as usual (invite link, QR code or typed PIN): the mark is on the game, not on them. To
check before playing, the create request (`newGame`) in the browser's network panel carries
`campaign: "test"`.

**What carries the mark.** No new BigQuery column: it travels in columns that already exist.

- `opened_games.campaign` and `closed_games.campaign` are `test` (or `test-...`).
- Every `users` row of a test game has `via = 'test'` in place of the join's real source. The server
  writes it from the game, so a lobby that never starts is marked too.
- Replay keeps the mark (other campaign tags are still not carried by Replay). A crew saved from a
  test game keeps it for its rematches.
- `question_results` and `forks` have no column for it: leave them out by PIN. `shares` has no PIN:
  leave them out by browser (any uid that joined a test game).

**Reading the numbers.** `functions/bigquery/2026-11-test-mark.sql` holds the filters and the
`test_pins` list to paste into a query, and the three daily numbers with tests out. The saved queries
in the other files there leave marked games out. The tests of 5 to 11 November 2026 were played
before the mark and carry none; that file keeps the old rule (nicknames, one campaign, two network
addresses) for windows that include those days.

**What the mark does not cover.**

- A game created in a tab that arrived without the tag, even when testers play it. Start again from
  a test link.
- A tester who joins a real game: that game stays a real game.
- A crew page opened on its own in a test tab: a rematch is marked only when the crew was saved from
  a test game.
- Page views in the visit beacon's log lines and errors in Sentry are not marked.

**Deploy.** Functions only (`fork`, `onJoinGame`, `createCrew`, `crewRematch`; deploy all, as always).
No BigQuery change, no rules change, no hosting change: the client already sends the tag. The lie
helper's saved measure in `functions/bigquery/2026-11-round1-coach.sql` changed at the same time:
"reached round 2" is 100% in both arms since the server moves games on, so it is now "half or more
of the players picked an answer on a round-2 question".

Checks: `functions/test/test-mark.test.js` (in `npm test`).
