# Deploying bullshit.wtf

## Build

Needs Node 20 or newer (tested on Node 22).

```sh
npm install                       # Firebase CLI 15
(cd functions && npm ci && npm run build)
(cd game && npm ci && npm run build)   # output in game/dist
```

`game-model.ts` is shared by both apps. Each build copies it into place, so the old
`symlink.sh` step is no longer needed.

The client is still Angular 4 with Angular CLI 1.7. To build it on a current Node:
`node-sass` is replaced by Dart Sass through an npm `overrides` entry, the build runs
with `--openssl-legacy-provider` (webpack 3 uses MD4), TypeScript is pinned to 2.3
(the newest Angular 4 accepts), and `game/.npmrc` sets `legacy-peer-deps`.

## Deploy (production)

```sh
npm run prod:deploy-functions   # 12 functions (11 + phaseTimer), 1st gen, Node 22, us-central1
npm run prod:deploy-game        # hosting
npm run prod:deploy-rules       # unchanged rules, can be skipped
```

Deploy functions first, then the game: the new client reads the error `message` and
`code` that the new functions send.

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

### Unchanged

Database rules, question data, game rules, phase lengths, scoring, Google Analytics tag
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

## Known leftovers

- npm audit reports moderate issues in transitive Google libraries (functions) and many
  in the 2017-era client toolchain (build-time only).
- raven-js is retired; moving to the current Sentry SDK needs a newer Angular.
