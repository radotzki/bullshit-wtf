# Deploying bullshit.wtf

## Tests and deploys from GitHub (the normal way to release)

Two workflows in `.github/workflows` do the work. A release is: open a pull request, wait for its
tests, merge it to `master`.

**Tests** (`ci.yml`) run on every pull request, with no secrets and no Firebase project:

- Deploy scripts: `node --test .github/scripts/*.test.js` (the checks the deploy runs before a
  release, and the order of its steps).

- Functions: `npm ci`, then `npm test` (builds, then runs every function test).
- Game client: `npm ci`, `npm run build` (lint, production build, Hebrew shell, search pages), `npm test`,
  a check that the main files landed in `game/dist`, and a browser smoke test
  (`.github/smoke/smoke.js`): every public page of the built game is loaded in headless Chromium,
  with every request to the outside refused, and any page error, console error or blank page fails
  the run. Run it locally after a build: `cd .github/smoke && npm ci && npx playwright install
  chromium && node smoke.js`.

**Deploy to production** (`deploy.yml`) runs on every push to `master`, so on every merged pull
request, and by hand (Actions tab, "Deploy to production", "Run workflow", branch `master`). A push
that changes only `*.md`, `docs/` or `graphics/` deploys nothing. It releases to `bullshit-wtf-prod`:

1. Runs the same tests again, on the merged code. If they fail, nothing is deployed.
2. Checks that the run's commit is still the head of `master` (see "Old runs" below). If `master`
   holds newer code, the run stops and nothing is built or deployed.
3. Checks the Firebase key (below). No key, or a wrong one: the run fails with a plain message
   before anything is built or deployed. The check writes nothing to disk.
4. Builds the functions and the site. A broken build deploys nothing. Then it checks the head of
   `master` once more, and only then is the key written to a temporary file, so no package's
   install or build script can read it.
5. Checks, without releasing anything, that the account holds the permissions the three deploys
   need, and that it can reach the database and the site (see "The permission check" and "The
   access check" below). If either fails, the run stops before the functions are released. The
   access check tries both the database and the site before it fails, so one run names
   everything that is off.
6. Deploys **all functions**, then the **database rules**, then the **site**, in that order. Each
   step runs only if the one before it succeeded, so a failure never leaves a new site calling old
   functions. It can leave new functions with the old rules and site; functions are written to
   keep old clients working, so that state is safe, and a new run finishes the release.

Things to know:

- One release runs at a time and is never cancelled halfway. If several merges queue up behind a
  running release, GitHub keeps only the newest waiting one, which holds all the others' code.
- To retry, and after adding or changing the key, **start a new run by hand**: Actions tab,
  "Deploy to production", "Run workflow", branch `master`. A manual run always deploys the tip of
  `master`. Every step is safe to repeat.
- **Old runs.** "Re-run" on a run does not take today's `master`: it checks out the commit of
  that run. So the run compares its commit with the head of `master`
  (`.github/scripts/check-master-head.js`), before the builds and again right before the first
  deploy, and stops with "Deploy stopped, nothing released" when `master` has moved on. It still
  goes ahead when the newer commits changed only files that are never deployed (`*.md`, `docs/`,
  `graphics/`): a push of those starts no run of its own, and the code is the same. A deployed
  file that was moved into `docs/` or renamed to `.md` counts as changed, so that stops the run. The list in
  the script must stay equal to `paths-ignore` in `deploy.yml`; a test compares them.
  Runs that started before this check existed (2026-11-11) do not have it: never re-run those.
- **Rolling back** is therefore not "re-run an old run". Revert the change in a pull request and
  merge it (it is tested and released like any other), or deploy the older commit by hand from a
  computer (below).
- **The permission check.** Before the first deploy the run asks Google which permissions the
  deploy account holds on the project (`.github/scripts/check-deploy-permissions.js`). It is
  Google's "test permissions" question, `projects.testIamPermissions` of the Cloud Resource
  Manager API, and it only reads. The Firebase tool asks the same before every deploy, but it only
  notes a missing permission in its debug file and goes on; this step stops the run instead. The
  list is the tool's own for the three deploys (firebase-tools 15.35.0, `TARGET_PERMISSIONS` in
  `src/deploy/index.ts` and `BASE_PERMISSIONS` in `src/requirePermissions.ts`):
  - every step: `firebase.projects.get`;
  - functions: `cloudfunctions.functions.list`, `.create`, `.get`, `.update`, `.delete` and
    `cloudfunctions.operations.get`;
  - database rules: `firebasedatabase.instances.update`;
  - site: `firebasehosting.sites.update`.

  If the installed tool lists more for these three, those are asked too. The run goes on only
  when Google answers that all are held. If one is missing, the step fails, names it and the
  deploy that needs it, and nothing is released. If Google does not answer the question (an API
  is off, the sign-in fails, no network), the step fails too and prints the answer: not knowing
  counts as no. Only an answer from the address that was asked counts: a redirect is not followed
  and stops the run with its 3xx status. The sign-in and the question together get 60 seconds
  (the question alone 30); after that the step fails and says "timed out", so a sign-in that
  never answers cannot hold the release queue until the job's 30-minute limit. The question needs
  two things in the Google project, which the step cannot
  switch on or grant by itself: the **Cloud Resource Manager API**
  (`cloudresourcemanager.googleapis.com`) switched on, and for the account the permission
  `serviceusage.services.use` (role Service Usage Consumer, or any wider role that holds it).
  The script never opens the key file: Google's own library (`google-auth-library`, installed
  with the Firebase tool) reads it and signs the request, and the step prints permission names
  and Google's error fields only. The sign-in asks for the scope `cloud-platform`, one of the
  five the Firebase tool signs in with for the deploys (`email`, `openid`,
  `cloudplatformprojects.readonly`, `firebase`, `cloud-platform`; read at version 15.35.0,
  `src/api.ts` and `src/requireAuth.ts`). A read-only scope was considered and left out: whether
  Google accepts it for this question can only be seen on a run from `master`, where a wrong
  guess stops a release.
  What it does not prove: a permission given for one resource only (not on the project), or
  under a condition, can read as missing here; the functions deploy also needs the right to act
  as the functions' service account (`iam.serviceAccounts.actAs`), which the tool checks itself
  at the start of the functions step, before it releases anything; and Google can still refuse
  a deploy for a reason that is not a permission.
- **The access check.** Before the first deploy the run reads the database and the site, releases
  nothing, and switches nothing on in the Google project (`.github/scripts/check-access.js`):
  - the database, with the Firebase tool: `firebase deploy --only database --dry-run` makes the
    first calls of the rules deploy. It reads the database instance and sends the rules with
    `dryRun=true` (checked, not stored). The tool's database path has no call that switches an
    API on (read at version 15.35.0);
  - the site, with one plain `GET` of the project's list of hosting sites
    (`firebasehosting.googleapis.com/v1beta1/projects/<id>/sites`), sent through Google's
    library like the permission check: redirects refused, the same time-outs, the same cleaning
    of what is printed. It passes when Google lists one site or more.

  The site is not read with the Firebase tool. Each of its hosting commands, also the read-only
  ones (`hosting:channel:list`, `hosting:sites:list`), first asks whether the Hosting API
  (`firebasehosting.googleapis.com`) is on, and if it is off, tries to switch it on. Until
  2026-11-11 this check ran `hosting:channel:list`, so it could have switched the API on if the
  deploy account was allowed to. Switching an API on is the owner's step, never a side effect
  of a check: with the API off, the `GET` is refused and the step names the API and fails. The
  release step "3. Deploy the site" still uses the tool and would try the same, but it only runs
  after this check has seen the API on.
  Both reads always run, also when the first fails, and the step fails afterwards if either
  did: on 2026-11-11 the database read failed first, the site read never ran, and the run could
  not say whether the Hosting API was off too. The database read gets five minutes. This is there
  because on 2026-11-11 a run released the functions, then failed at the rules ("Failed to get
  instance details"), and the site never went out. By itself it does not prove that the account
  may *write* to hosting: the tool's hosting dry run creates a new empty version on the live site,
  so it is not used. The permission check above asks that instead
  (`firebasehosting.sites.update`).
- **A release while the database API is off.** The rules step, and the database read above,
  first ask the Firebase Realtime Database Management API for the database's details. While that
  API is off in the Google project, Google refuses the question, and only the project's owner
  can switch the API on. A rules deploy of rules that are already live changes nothing, though.
  So when the database read fails, the access check asks one more thing, with four `GET`s and
  nothing else (`.github/scripts/live-rules.js`):
  1. the Firebase project, which names the default database instance;
  2. that instance at the database API, which must be refused again with `403`, reason
     `SERVICE_DISABLED`, service `firebasedatabase.googleapis.com`. Any other answer means the
     database read failed for another reason, and the run stops;
  3. the project's configuration (`adminSdkConfig`), which holds the database's address. It must
     be the default instance's own address;
  4. the rules that are live, at `<the database's address>/.settings/rules.json`. This is the
     address the rules deploy writes to; here it is only read.

  If the live rules are the same as the commit's rules file, value for value, and the site was
  reached, the check passes and the run releases the functions and the site and **skips "2.
  Deploy the database rules"**. Production then holds what a whole release would have left: this
  commit's functions, rules and site. The run's summary page says so under "What this run
  released": which parts were released, and that the rules were left alone and why.
  In every other case the run stops before it releases anything, as before: the live rules
  differ, they could not be read, they or the commit's file are not plain JSON (rules with
  comments cannot be compared, and not knowing counts as different), the address is not the
  default database's, or the site was not reached. A commit that changes the rules cannot be
  released while the API is off.
  The four requests cannot write: the script sends nothing but a `GET` without a body to
  `firebase.googleapis.com`, `firebasedatabase.googleapis.com` or a database's
  `/.settings/rules.json`, and refuses any other request itself before it is sent. It prints
  neither the rules nor the database's address. Once the owner switches the API on, the database
  read passes, none of this runs, and the rules step runs as always.
  The fourth request has a sign-in of its own. Every other request of the run signs in with the
  scope `cloud-platform`. The database's own address does not take a token with that scope alone:
  on 2026-11-12 the first run of this on `master` got `401`, "Unauthorized request.", for the
  rules, right after the three requests before it were answered as expected with the same token.
  Google's guide for that address ("Authenticate REST requests", Realtime Database) asks for two
  other scopes, `https://www.googleapis.com/auth/userinfo.email` and
  `https://www.googleapis.com/auth/firebase.database`, and the Firebase tool and Google's admin
  library both sign in with more than `cloud-platform` before they ask that address. So the rules
  read signs in a second time, with those two scopes and no other. That token is sent to a
  database's `/.settings/rules.json` and nowhere else, and the run's own token is never sent
  there: the script refuses either itself (`allowedApi` and `allowedRules` in `live-rules.js`).
  A scope says what a token may be used for. It gives the deploy account no role and no
  permission, and it changes nothing in the Google project.
  What it does not prove: that Google lets the deploy account read the live rules (if not, the
  run stops and says so), and that nobody changes the live rules by hand between this check and
  the end of the run. The two scopes are taken from Google's guide and from the source of
  Google's tools, and were tried with a made-up key and no network (the library asks for exactly
  them); that Google then answers the read can only be seen on a run from `master`. A `401`
  with them would mean the scopes were not the reason, and a `403` or "Permission denied" that
  the account may not read the rules there; either stops the run before anything is released.
  For the rest it has been tried with made-up answers (`live-rules.test.js`) and, for the shape
  of the rules answer, a local database emulator.
- The workflow never passes `--force`. So if a change **removes or renames a function**, the
  functions step stops and lists the functions that are live but gone from the code; nothing is
  deleted by a machine. A person deletes them with the `firebase functions:delete` commands the log
  prints, then starts a new run. The same goes for a function that gains a retry policy or minimum instances.
- If the functions step ends with "Functions successfully deployed but could not set up cleanup
  policy", the functions are live but the rules and site were not deployed. Run
  `npx firebase functions:artifacts:setpolicy -P bullshit-wtf-prod` once with the owner's sign-in,
  then start a new run by hand on `master`.

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

1. Settings, Environments. If `production` is already listed (GitHub makes it by itself the
   first time the deploy runs), open it and do not make a new one. Otherwise: New environment,
   name `production`.
2. Deployment branches and tags: "Selected branches and tags", then add the branch `master` and
   nothing else.
3. Environment secrets: add `FIREBASE_SERVICE_ACCOUNT`.
4. If a repository secret of that name exists (Settings, Secrets and variables, Actions), delete
   it: it would still be readable from any branch.
5. Start a new run by hand: Actions, "Deploy to production", "Run workflow", branch `master`. Do
   not re-run an old failed run.

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
simply and more widely, Firebase Admin plus Service Account User). To revoke access, delete the
key in the console.

### When a deploy step fails

The step "Check the deploy account's permissions" prints its own reason, in the log and on the
run's summary page under "The deploy account's permissions": the permissions that are missing,
or Google's answer when the question was refused. Nothing was released then. The step after it,
"Show why the step failed", has no debug file to read in that case and says so.

The step "Check access to the database and the site" prints its own reasons too, in the log and
on the summary page under "Access to the database and the site": one line for the database and
one for the site, "reached" or "NOT reached", and under them the reason for each that was not
reached: for the database the same filtered reading of the tool's debug file as described
below, for the site the status and the error fields of Google's answer. When the Hosting API is
off it says so by name; the owner switches it on in the Google Cloud console, the step never
does. Fix everything it names before the next run. It then removes the debug file, so "Show why
the step failed" has none to read here either.

When the database was not reached, the same step also says what it found about the live rules
(see "A release while the database API is off" above), in one line: the API is off and the live
rules are the same as the commit's (the run then goes on without the rules step, with a warning
and not an error), the live rules differ, they could not be read or compared, or the database
read failed for another reason than the API being off. Under it are the requests it sent and
Google's answers.

Every run's summary page has "What this run released": one line for the functions, the database
rules and the site each, "Released", "Left alone", "Not released" or "NOT released whole", and
above them whether the release was whole.

For the other steps: the Firebase tool's own error is one general line, such as "Failed to get instance details", and
it does not name a missing permission. Google's answer is in the tool's debug file, which the run
never prints or uploads whole: after the functions step it holds config values and signed upload
addresses. So when a step fails, the next step, "Show why the step failed", prints a filtered
reading of that file (`.github/scripts/firebase-refusal.js`), also on the run's summary page:

- each request Google refused: the status (403, 404...), the address without its query string,
  and from the error only its status word (`PERMISSION_DENIED`), message, reason, service and
  permission;
- the tool's own permission check, with the permissions it found missing;
- a request that got no answer at all.

Read it from the bottom: the last refusal is usually the cause, and an early 404 can be an
ordinary lookup. A 403 with a permission names what the account lacks; give the account a role
from the list above that holds it. A 403 that says an API is disabled or has not been used names
the API to switch on in the Google Cloud console. Google does not always send the permission's
name; then go by the address that was refused and compare the account's roles with the list. If
the step prints that the debug file holds no refused request, the failed step's own error is all
there is (a build error, a function that would be deleted, the cleanup policy).

One limit, to know before the functions are ever given secret values (`functions.config()`,
secret parameters, a `.env` file; they have none today): the step prints Google's error message,
and it can only remove a secret from that text by its shape. A key, a token, a signed address or
a long random string is removed. A secret without such a shape, like a short password or a
phrase of words, is not: if a deploy sends one and Google quotes it back in an error message, it
is printed in the run's log, which anyone can read. The Firebase tool's own error line prints the
same message. So give a secret value a long random form, or check this step again first.

The job's last step removes the key file and both copies of the debug file, whether the job
passed or failed.

This was added after the run of 2026-11-11 and has not yet read a real failed run: its format is
taken from the source of firebase-tools 15.35 and checked with a made-up file
(`firebase-refusal.test.js`). A new version of the tool may change the format; the step then
prints less, never more.

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

The client is Angular 22 on the Angular CLI's esbuild builder (`game/angular.json`), with
Firebase JS SDK 13 through its compat API, RxJS 7 and TypeScript 6; it builds on Node 22 with
no workarounds. It stays on its NgModule: every component, pipe and directive says
`standalone: false`, and every component says `changeDetection: ChangeDetectionStrategy.Eager`
(Angular 22 makes components OnPush by default, and the game's screens change from Firebase
callbacks). `game/src/main.ts` asks for zone.js change detection, which Angular 21+ no longer
gives an NgModule app by default. Lint is angular-eslint with typescript-eslint (`game/eslint.config.js`):
`npm run lint` in game/, and CI runs it before the build.
To play a whole game of the built client on the Firebase emulators, see
`.github/smoke/emulator-game.js`.

## Deploy by hand (production)

The workflow above runs these same three deploys, in the order functions, rules, site. By hand they
need the owner's Firebase sign-in (`npx firebase login`); use them only when GitHub Actions is down.
Mind the order: the `prod:deploy` script runs the site before the rules, so run the three one by one.

```sh
npm run prod:deploy-functions   # 20 functions (11 + phaseTimer + onRevealDone + createCrew + crewRematch + onShare + startGame + hostHere + visit + laugh), 1st gen, Node 22, us-central1
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

## After a game: the ask to host, counted results shares, and a gentler REMATCH

- **The ask.** On the final screen, a player who did not host the game sees a card under SHARE
  RESULTS: "Playing with other people this week? Start your own game", with START MY OWN GAME and
  REMIND ME. The host (the phone with the host key, the marked host row, or the creator of an older
  game), a big screen and a solo player do not see it. START MY OWN GAME opens Create in the game's
  language; the game it makes carries the campaign tag `after-game`. REMIND ME downloads a calendar
  entry for the coming game night (Friday 21:00, the crew page's default; it was Thursday for
  Hebrew until the Friday crews change), with a link to Create tagged `after-game-remind`, and then offers Google
  Calendar. The join page of a game that is over shows the same ask, shorter (tags
  `after-game-late` and `after-game-late-remind`). Create now reads `?via=` on its own address.
- **Counting.** `onShare` accepts three more content types in BigQuery `shares`: `results`
  (whatsapp, native, copy, download: shares of the results card, counted nowhere before),
  `after-game` and `game-over` (create, remind, remind-google: presses on the ask). No schema
  change, nothing to run. The saved queries, with the measure (guests who later host: 8% today,
  target 12%, read on Android) are in `functions/bigquery/2026-11-after-game.sql`.
- **REMATCH.** It used to move every phone to the new lobby at once, so the fastest finger decided
  whether anyone else could share, save the crew or read the screen. Now only the phone that
  pressed REMATCH (and a big screen) goes at once. On the other phones REMATCH becomes JOIN THE
  REMATCH, with "Alice started a rematch" under it. Every player already has a seat in the new
  game, so the host can start whenever; when it starts, a phone still on the final screen follows,
  unless its player has the share sheet or the crew form open, and then it follows when that closes.
  Client only: the server's Replay is unchanged.
- **Deploy order:** functions first (all of them, as always), then hosting. With the new client on
  the old functions the game works and the new presses and results shares are just not counted.
  No rules change.
- The share service no longer calls Google Analytics (`gtag`); the tag recorded nothing.
- Not checked on real phones: how an iPhone and an Android phone open the downloaded calendar file.

## Front door: the phone home page says what the game is

Client only. No new function, rule, table or column; nothing to run before the merge.

- Above the menu, one line: "Everyone writes a lie. One answer is true. Fool your friends." and its
  Hebrew (`pitch` in `home-strings.ts`).
- A browser that holds nothing of the game (no seat, host key or crew) also gets a small picture of
  one round in three frames: write a lie, find the truth, see who fell for it. It is text and CSS
  drawn like the game's own screens, with one real opening question, so it adds no image and no
  request (about 2.7 KB to the compressed app). A phone that asks for reduced motion gets the reveal
  frame, still.
- Create leads the menu for a stranger, for anyone who came from a post, and for a browser that has
  hosted. Join stays on top only for a browser that has played and never hosted. Both are always on
  the first screen, one tap each; crews stay above everything. The rules are in
  `game/src/app/pages/landing/front-door.ts`, tested by `game/test/front-door.test.js`.
- The Create button carries the post's tag on its own address (`/create-game?via=<tag>`), and the tag
  of the page load is also kept in memory, so a game is counted for its post even where the tab's
  storage is blocked or the Create page is reloaded.
- The desktop home page and the plain search pages are unchanged.

How to read it (compare the two weeks before the release with the two after, test games out):

- New hosts a day: browsers in `opened_games` not seen in the year before.
- The share of new lobbies that reach 2 players, and "start alone" presses in `shares`.
- Games by `campaign` in `opened_games`, once posts go out.
- Once the visits table exists: created games per first home page view.

## Friday crews: Friday by default, every Friday in the calendar, and the save-crew offer

Friday has 2.4 times the games of any other day, in Hebrew too, and a group that plays every week
is the cheapest active player there is.

- **Friday by default.** The crew page's NEXT GAME NIGHT is the coming Friday at 21:00 in every
  language (Hebrew crews got Thursday before). The guest's REMIND ME on the final screen uses the
  same default, so it is Friday too.
- **Every Friday in the calendar.** Under the one-night invite, the crew page offers EVERY FRIDAY IN
  MY CALENDAR (the weekday follows the picked night): a calendar file that repeats weekly
  (`RRULE:FREQ=WEEKLY`), at local time, with the crew link in its text and URL, and one UID per
  crew so adding it again updates it. Shared into the chat on phones that share files, downloaded
  elsewhere, and offered as a weekly Google Calendar link in the phone's time zone.
- **Save this crew, before SHARE.** On the final screen of a group's second game (a REMATCH, or the
  same friends another night), SAVE THIS CREW moves above SHARE RESULTS with one line on why. Other
  games keep it at the bottom. How "second game" is known: the server marks a rematch
  (`games/<pin>/parent`), but the rules hide it from the client and changing them is the owner's
  step, so each phone keeps its last 12 finished games (PIN, time, players' names) in local storage
  and compares: at least half of this game's players, and two at least, were in a game it saw end in
  the last 60 days. A phone that only joined this game, or lost its storage, does not know; another
  phone at the table usually does.
- **Counting.** `onShare` takes `crew-night` methods `weekly-share`, `weekly-download`,
  `weekly-google`, and a new content type `crew-save` (`repeat-offer`, `bottom`). No schema change.
  Queries: `functions/bigquery/2026-11-friday-crews.sql` (crews on two or more days, players back on
  a second day, the presses).
- Deploy order: functions, then hosting. No rules change. With the new site on old functions the
  game works; the new presses are just not counted until the functions are live.

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

## Staged reveal (a 50/50 test)

Half of new games get a staged reveal; the other half keep the reveal as it was. Which half a game is
in follows from its PIN (`stagedHalf` in `functions/src/controllers/big-reveal.ts`), and it is
independent of the round-1 lie helper's draw. Timing in `game-model.ts` (`revealSchedule`,
`stagedRevealTiming`), the page in `game/src/app/pages/reveal-the-truth`, its words in
`game/src/app/pages/game-strings.ts`.

- What a staged game shows: each row in three beats (the answer, who picked it, who wrote it, 2.4 s a
  row on phones), earlier rows folded to one line, "And the truth is…", a "You fooled …" flash on
  the writer's phone, then each player's result and the scores with every player's change. In the
  game's language, like every game screen. There is no separate scoreboard: its phase lasts 0 ms and
  the server leaves it in the same run.
- Sound on phones, staged games only, and only when the game has no big screen: the stings and
  the clock tick that a big screen plays. A mute button in the header, remembered on the phone
  (`BS_MUTED`). An iPhone in silent mode stays silent and iPhone browsers do not vibrate.
- Only a game made by a client that asks for it (`stagedReveal: true` on `newGame`, `fork`,
  `crewRematch`) is in the test. So the usual order, functions first and the site after, is safe: until
  the site is live no phone asks, no game is flagged, and every game plays as before. A game already
  in play at the release has no flag and keeps its timing. A phone still on the old site inside a
  staged game shows today's faster rows, waits for the longer phase to end, and passes through the
  scoreboard page in a blink; its game is never held up.
- How phones learn it: the server keeps `games/$pin/bigReveal` (`true` staged, `false` the other half,
  absent for a game outside the test), which phones cannot read, and writes `staged: true` on every
  `games/$pin/state` of a staged game, from the lobby on. Phones already read the state.
- Deploy: functions, then hosting. **No rules change and no BigQuery change.**
- Reading the test: no column. The half is worked out from the PIN in any table that has it:
  `MOD(TO_CODE_POINTS(SHA256(CONCAT('big-reveal:', UPPER(id))))[OFFSET(0)], 2) = 1` is the staged
  half. `functions/bigquery/2026-11-big-reveal.sql` holds the read queries: players still picking on
  the last question, and rematches per game, by half. Read from the time the site went live. The PIN
  cannot say whether a game was in the test: a game made from a tab left open since before the
  release plays the reveal as it was whatever its PIN.
- Mute taps are counted in the `shares` table as `content_type = 'sound'`, `method` `mute` or
  `unmute`. They are not shares: leave them out of share counts.
- Big screen, both halves: sizes on the reveal follow the screen's height, earlier rows fold to one
  line and the page follows the newest row, so the truth is on screen at 1280x720 and 1920x1080.
- To end the test: make `drawBigReveal` return `true` (everyone staged) or `undefined` (nobody), and
  deploy the functions. No client change is needed either way.

## Laughs on lies

During the reveal, in both the staged reveal and the plain one, every lie, house lies included, has a
laugh button on the phones of the players who did not write it: tap as many lies as you like, each once.
House lies take laughs so that no button tells the room that the house wrote a lie before its
writer beat; their laughs show on the reveal and are credited to nobody, so the funniest lie is always a
player's. Counts show beside each lie only from its row's writer beat, on every phone and the big
screen: a house lie can take a laugh from every player and a player's lie from all but its writer, so a
count alone could tell (in a 3-player game, 2 laughs on a lie you did not laugh at). A tap before the
beat still counts; the button looks pressed, with no number. Players' lies nobody picked are no longer a
grey footnote: once every row is shown they get rows of their own (the lie, who wrote it, its laughs).
The final screen marks the writer of the most laughed-at lie FUNNIEST LIE and shows the lie with its
count. Laughs give no points. Code: `laughCount`, `canLaugh`, `addLaughs`, `funniestLies` and
`LAUGH_HOLD_MS` in `game-model.ts`, `functions/src/controllers/laugh.ts`, the reveal page and the final
screen; the words in `game-strings.ts` and `final-strings.ts`.

- How a laugh is written, with no rules change: phones may not write the reveal rows, so a laugh goes
  through the new HTTP function `laugh` ({ pin, pid, text }), like a lie goes through `answer`. The
  server takes it only from a player of the game, only while the reveal (or its scoreboard) is on, only
  on a lie (a player's or a house lie, never the truth) and never the player's own, and writes `games/$pin/revealAnswers/<row>/laughs/<pid>`
  in a transaction on that row. Phones already read `revealAnswers`, so the counts reach them live.
- Who wrote a lie is never shown earlier than before: a count says how many laughed, not who wrote it,
  and the rows of lies nobody picked appear when the old footnote did (once every row is shown).
- The hold: when a player's lie went unpicked, the reveal lasts `LAUGH_HOLD_MS` (1 s) longer, both
  reveals, phones and big screen, since those rows appear only at the end. NEXT from everyone still ends
  it early. A game with every lie picked keeps its timing.
- The funniest lie: as each question ends (leaving its scoreboard), the server keeps each writer's most
  laughed-at lie in `games/$pin/highlights/<pid>/funny` ({ text, laughs, q, n }). The final screen
  shows one lie: the most laughs, then the later question; co-writers share it.
- Old pages: a phone on an older site shows the reveal as before (its footnote, no buttons, no counts)
  and the longer phase passes unnoticed. A new page against older functions gets 404 from `laugh`; the
  tap is taken back on the phone and nothing else changes.
- Deploy: functions, then hosting. **No rules change and no BigQuery change.**
- Measuring, for later: each question's rows with their laughs are already kept in the database's
  question history (`qHistory`, field `a`, written as the question ends). For BigQuery, the owner would
  add two columns to `question_results`, `laughs` (laughs on the question) and `laughers` (players who
  laughed at least once); then "share of reveals with at least one laugh" is
  `COUNTIF(laughs > 0) / COUNT(*)` and "laughs per player per game" is `SUM(laughs) / SUM(players)` per
  game, read alongside rematches and shares per finished game.

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

## Final question card

The card before a game's last question is its own: FINAL QUESTION, one line on how far first place is
ahead, then the round's points as before. Everything else about the round intro is unchanged.

- Site only (`game/src/app/pages/round-intro`, words in `game-strings.ts`). No function, rule,
  points or phase length changes: the card shows inside the 3 seconds the round intro already has.
  A merge releases the site alone.
- What it reads: `questionIndex`, `totalQ` and `players` of the game, which every phone could
  already read. The last question is the one at `totalQ - 1`; in a game of 5, 7 or 9 questions that
  is always the single question of round 3.
- The line. On a phone it is about that player: "You lead by 500 points", "500 points behind Dana",
  "You are tied for first with Ben". On a big screen it is about the room: "Dana leads by 500
  points", "Dana and Ben are tied for first". More than two names are counted, not listed. One
  player alone gets no line. The words follow the game's language.
- Nothing is drawn before it is read: the card's middle stays empty until the round, the question's
  number and, before the last question, the scores have arrived, then shows whole. A number that
  cannot be read leaves its line out.
- Big screen: the sound of the truth plays once with the card. Phones stay silent.
- No BigQuery change.

How to read it (read-only; replace `<release time>`, and put `test_pins` from
`functions/bigquery/2026-11-test-mark.sql` first):

```sql
-- Rematches per game that was still played on its last question (half or more of the players
-- picked an answer there). Compare the weeks before and after the release.
SELECT COUNT(*) AS played_last_question, COUNTIF(f.replays > 0) AS with_a_rematch,
  COUNTIF(f.replays > 0) / COUNT(*) AS rematch_rate
FROM `bullshit-wtf-prod.analytics.opened_games` o
JOIN (SELECT id FROM `bullshit-wtf-prod.analytics.question_results`
  WHERE time >= TIMESTAMP('<release time>') AND q_index = total_q - 1 AND picks * 2 >= players
  GROUP BY id) q USING (id)
LEFT JOIN (SELECT origin, COUNT(*) AS replays FROM `bullshit-wtf-prod.analytics.forks`
  WHERE time >= TIMESTAMP('<release time>') GROUP BY origin) f ON f.origin = o.id
WHERE o.time >= TIMESTAMP('<release time>') AND o.players >= 2
  AND o.id NOT IN (SELECT pin FROM test_pins);
```

Before the release (5 November to 12 November 2026, 08:00 UTC, tests out): 38 games with two or more
players were still played on the last question, and 28 of them had a rematch.

Not readable yet: the share of games where first place changes on the last question. No table
holds the scores before the last question, so that needs two numbers written by the server with
the last question's row (who led before it, who won); it is not part of this change.

## Server errors in Sentry

The functions report their unexpected errors to the same Sentry project as the site (`bullshit`;
the dev Google project reports to `bullshit-dev`). The code is `functions/src/report.ts`: a small
sender of our own, not the Sentry library, so nothing is added to a function's start.

**How to find them.** In Sentry, search `side:server`. Every report carries these tags:

- `side`: always `server` (the site's reports have no such tag).
- `function`: the function's name, e.g. `tick`, `join`, `phaseTimer`.
- `test`: `yes` for a test game (see "Test games"), `no`, or `unknown` when there is no game to
  ask or its mark could not be read in 0.3 s. Leave tests out with `side:server !test:yes`.
- `pin`: the game's PIN, when the function works on one.
- `code`: the error's own code, when it has one (a database refusal, for instance).

After a release, look for `side:server firstSeen:-1h`.

**The release name.** A report's release is the name of the functions' build, like
`functions-5a3dea69b5bb`: `functions/write-release.js` writes it to `functions/dist/release.json`
at the end of `npm run build`, and the build prints it. It is a fingerprint of the server's code
(every built file in `dist`, `package.json` and `package-lock.json`), not the commit. So:

- It changes when the server's code changes, and only then. Two releases with different server
  code have different names; `side:server release:<name>` shows what one build broke.
- A merge that changes only the site, a test or this guide builds the same name and the same
  `release.json`. This is on purpose, and must stay so: the Firebase tool sends a function only
  when the `functions` folder differs from what is live. A name that held the commit would
  differ at every commit, and every release would replace all the functions under the games that
  are running. Never write the commit, a date or anything else that changes from build to build
  into the `functions` folder.
- To find the commit behind a name: the "Install and build the functions" step of each deploy
  run prints `write-release: this build of the functions is <name>`. The first run that prints
  the name is the merge that brought that server code. Or build a commit yourself
  (`npm ci && npm run build` in `functions`) and read the name.
- The name follows the built files. A file under `functions` that is not built (a test, an SQL
  file) does not change it, although the Firebase tool does send the functions again for it.

**What is reported.**

- An error that reaches a function's edge: the `catch` of an HTTP function, or a trigger that
  fails. A trigger that fails is one report.
- An error a step logs with `console.error` and swallows, so the game plays on (a score that could
  not be counted, a usage row BigQuery refused). With an Error in the line, that error; without one,
  the line's first words alone. So a new `console.error` in the functions is a report in Sentry:
  use `console.log` or `console.warn` for anything that is no fault.
- Only the functions' own lines count: a `console.error` written from a file of the build
  (`functions/dist`). A line that Node writes (a deprecation warning), that the functions
  framework writes (it prints a failed trigger's crash, and a request body it could not read) or
  that a library under `node_modules` writes is no report.
- Not reported: an answer a function gives on purpose. The controllers reject with a plain
  `{ message, code }` for those ("Sorry, game is full"); keep to that form for a new one.
- Not reported: the answer to a request the site never sends. That is anything but a POST; a
  call to a function that works on a game without a PIN, or with a PIN that is not 2 to 12
  letters and digits (a number, a PIN with a dot); a call to `crewRematch` without a crew id; a
  `newGame` without a language; and a call about a PIN that no game has (a Replay of an unknown PIN, say). Such a request gets
  exactly the answer it got before. For the last kind the reporter reads the game's `timestamp`
  once, on the error path only; when that read fails or takes over 0.3 s, the fault is reported.
  A trigger never asks this. `http()` in `report.ts` is told what each function works on
  (`'game'`, `'crew'`, `'new'`): say so for a new function in `index.ts`.

**What a report holds, and what it can hold.** A report holds the tags above, the release name,
the error's type, its message and the stack's function names, file names and line numbers (of
the compiled files in `dist`). The reporter never puts in the request's body or headers, a
nickname, an answer's text, a browser or host id, or an address.

The message is an error's own text, and it is cleaned before it is sent: what the request
carried is cut out of it as it was typed, in lower and in upper case; so are two or more words in
quotes, every letter outside ASCII (Hebrew), and email and IPv4 addresses. This is a filter, not
a guarantee. What can pass it:

- A player's database id (a push key like `-Nx1...`), inside a database path in an error's text.
  An HTTP function cuts the id when the request carried it; a trigger's request carries nothing,
  so there it stays. The id is a random key of one game, not a name.
- One plain English word in an error's text, bare or in quotes.
- A value the server holds in another form than it was typed (a nickname with its spaces
  collapsed or cut short), or one nested inside the request's body.
- A short IPv6 address; the server's own file paths in a logged stack.

Today none of this carries a player's words, because the functions never build an error's text
from one: the texts come from Node and Firebase, which name fields, keys and paths. Keep it so:
**never put a nickname, an answer or anything else a player typed into an error's message**
(no `new Error('... ' + nickname)`), and never into the first argument of a `console.error`.
Put such things in a later argument of the log line, which is never sent.

**It cannot fail or hold a game.** A report is sent once and given up after 1 second; a failed send
is dropped. A function waits for a report that is on its way before it ends, so the report is not
lost; with no fault there is nothing to wait for. After two failed sends in a row, or when Sentry
says to slow down, sending rests (10 minutes, or as long as Sentry says, an hour at most).

**The cap.** Each running copy of a function sends one fault at most twice an hour, 10 reports an
hour in all and 50 in its life; the next report says how many were held back. A request the site
never sends does not count towards the cap. The cap is per copy:
there is no count across copies, since that would need a shared counter in the database. Sentry's
own quota is the last stop: past it, Sentry drops events and does not bill, unless a pay-as-you-go
budget has been set in Sentry.

**Locally and in tests.** An emulator sends nothing: it writes each report to the functions log as
one line starting `server error report (local, not sent)`. `npm test` sends nothing either
(`functions/test/report.test.js`; `PRINT_REPORTS=1 node --test test/report.test.js` prints them).
Only the two Google projects named in `report.ts` send at all.

**Known gaps.** A crash outside any request (while a function loads) is not reported. A report that
was logged first says `handled: true` even if the error then failed the function. An error line
is told to be the functions' own by the file that wrote it, read from the call stack: a line
written through a helper outside `dist` would not be a report.

## A taste for a host who starts alone

A stranger who creates a game and has nobody to send the link to could press "Start alone anyway"
and got a whole game: 25 seconds to write a lie that nobody reads, on every question. From 6 to 12
November, tests out, 10 games were started alone; 2 were played to the end.

**What a lone host gets now.** The lobby's link reads "Try 5 quick questions alone" ("לנסות לבד 5
שאלות מהירות"). The game it starts is a taste:

- Five questions, whatever length the host chose. Nothing to write: each question goes straight
  to the answers, the truth among three house lies, with the question shown above them.
- The first card says "5 QUICK QUESTIONS. No lies to write. Find the truth among ours."
- Picking, the reveal and the points are the game's own: the truth scores, a house lie costs.
- The last screen says "YOU FOUND 3 OF 5 TRUTHS", the points, then "Now try it with friends" and
  one button, INVITE FRIENDS. The button is the Replay: it opens a new lobby, with the invite
  on it and the length the host first chose. SHARE RESULTS stays.

**What decides it.** The server, when the game leaves the lobby: exactly one player and no big
screen (`functions/src/controllers/taste.ts`). A game of two or more, and a game with a big screen,
take no new path. If a friend joins before the host presses the link, the whole game starts. A
Replay of a taste that is again started alone is a taste again; with a friend in it is a whole
game.

**How phones know.** Every state of a taste carries `taste: { found, length }` (the truths found
so far, the length the host chose). Phones may read the state and only the server writes it, so the
database rules do not change. A game without the mark plays as before.

**Old and new together.** An old site on the new functions plays the taste: it shows the question
only behind "WHAT WAS THE QUESTION AGAIN?" and ends on the old final screen with REMATCH. A new
site on the old functions (the seconds of a release) runs a whole game under the new link.
A game that was started alone before the release stays a whole game.

**With the staged reveal.** A taste can fall in either half of that test. In the staged half the
reveal shows the truth, the lone player's row and NEXT on one screen and there is no scoreboard
screen; in the other half the reveal is followed by the 3-second scoreboard. Both were played.

**Known limits.** A friend who joins a taste that is running picks too; the game stays pick-only.
Picking keeps its 20 seconds (a lone player's pick ends it at once).

**In the usage rows.** No new column. A taste is `players = 1`, `presenter = false`,
`questions = 5` in `opened_games` and `closed_games`, and `players = 1`, `lies = 0`, `total_q = 5`
in `question_results`. The table a taste leads to is an `opened_games` row with `players >= 2` and
the same `creator_uid`, and `parent_pin` the taste when it came from INVITE FRIENDS.

**How it is measured** (`functions/bigquery/2026-11-taste.sql`, tests out): tastes played to the
end per day (a pick on the fifth question), against 2 of 10 games alone in the week before; and
the browsers that created a game of two or more within 7 days of their taste, against 1 of 8.

## Who the room is waiting for

After a player sends a lie or picks an answer, the phone no longer shows one line and nothing else.
It shows every player's picture: a green tick on those who are in, orange dots (and a wobble) on
those the room still waits for, and "Waiting for Chen" when one is left. The big screen shows the
same row: under the question while lies are written, and in the bar on top while answers are picked
(the answers fill that screen), where the last player stands alone beside "Waiting for Chen".

- Functions and site. No rule change, no BigQuery change, no new function, none removed or renamed.
  A merge sends all functions and the site.
- What the server writes: when a seat's lie is stored (`answer`) or its pick is seen
  (`onAnswerSelection`), the name of the phase on that seat, `games/<pin>/players/<pid>/sent`
  ("<state id>:<state timestamp>", see `sentMark` in `game-model.ts` and
  `functions/src/controllers/sent.ts`). It says that the seat has sent, never what. Phones could
  already read `players`, `state`, `questionIndex` and `timestamp` of a game, which is all the row
  reads; the lies and the picks are not read for it. Only the server can write under `players`.
- A mark is for showing only. Who the game waits for, when a phase ends and every point are worked
  out from the lies and the picks themselves, as before. The mark is written alongside the step
  that may end the phase, not before it, so no phase is longer. A mark that cannot be written is
  logged and costs a tick on a screen; the game goes on.
- Nothing is cleared between phases: a seat is done with the phase the game is on when its mark
  names that phase. Replay starts with no marks.
- The empty seats rule: from the second question on, a seat that has no mark from this game is one
  nobody plays. It is shown faded, with no dots, and is never named; it counts again from the
  moment it sends something. This follows `seatsToWaitFor` in `seats.ts`, and a test plays whole
  games in small to hold the two together (`functions/test/sent.test.js`).
- The row never tells who wrote which lie: it holds names, pictures and marks, in the order the
  players joined, and while answers are picked the marks of the lies show nothing.
- Old and new together. A phone with the old site ignores the marks and shows its old line. The new
  site shows the row only while the server is seen to mark the phase the game is on: a phone when
  its own seat is marked, the big screen from the first tick. So on functions from before this
  change, or rolled back to them in the middle of a game, it shows the old line and no row.
  A game that is being played while the new functions come in gets marks from that moment: until
  a seat sends again, the new site can show it faded on that one question.
- A player alone gets no row. The words follow the game's language (`game-strings.ts`).

How to read it (read-only; replace `<release time>`, and put `test_pins` from
`functions/bigquery/2026-11-test-mark.sql` first):

```sql
-- Seats that sent no lie, and seats that picked nothing, on questions that were still played
-- (half or more of the seats picked an answer), in games of two or more. Both should fall.
SELECT COUNT(DISTINCT id) AS games, COUNT(*) AS questions,
  1 - SUM(lies) / SUM(players) AS no_lie_share, 1 - SUM(picks) / SUM(players) AS no_pick_share
FROM `bullshit-wtf-prod.analytics.question_results`
WHERE time >= TIMESTAMP('<release time>') AND players >= 2 AND picks * 2 >= players
  AND id NOT IN (SELECT pin FROM test_pins);
```

Before the release (5 November to 12 November 2026, 10:00 UTC, tests out): 52 games of two or more
players with a question still played, 375 such questions; 8.8% of the seats sent no lie and 5.6%
picked nothing.

To get these numbers again, run the query above with
`time >= TIMESTAMP('2026-11-05') AND time < TIMESTAMP('2026-11-12 10:00:00')` in place of the
release time, and with the PINs of the tests from before the mark added to `test_pins` (the query
under "Tests from before the mark" in `2026-11-test-mark.sql`, joined on with `UNION DISTINCT`).
Those days' tests carry no mark, so `test_pins` alone takes nothing out of that week: the same
query then gives 78 games, 509 questions, 7.6% and 4.7%, which is tests and people together and not
the number to compare with.

Not readable yet: the seconds between the first and the last answer of a phase, the measure this
change is really about. No table holds when an answer came in. It needs the two wait columns of
pull request 47 (`lie_span_s` and `pick_span_s` on `question_results`), which is not merged and
whose columns wait for the owner; until then the only sign of a shorter wait is the two shares
above.

## Room for the ninth player: 12 seats a game

A game takes 12 players; it took 8. The thirteenth is told "Sorry, game is full", as the ninth was.

- Functions and site. No rule change, no BigQuery change, no new function, none removed or renamed.
  A merge sends all functions and the site.
- One number: `MAX_PLAYERS` in `game-model.ts`. `join` and `validateGameName` refuse a seat at it
  (`>=`, where it was `=== 8`), and a late friend is offered a rematch lobby only below it
  (`game-over.ts`). The server timer's longest phase (`maxPhaseDuration`, `phase.ts`) is worked out
  from it: a big-screen reveal of 13 rows, about 70 seconds, under the 120-second limit of
  `phaseTimer`.
- House lies: a table of 9 to 12 sees every lie its players wrote and the truth, but house lies
  fill the list only up to 9 answers (`MAX_HOUSE_FILL`), as many as an 8-seat game ever had.
  Tables of 2 to 8 get exactly what they got.
- Pictures: four new seat pictures, `assets/avatar8.png` to `avatar11.png` (sources in
  `graphics/avatars/`). Every screen that shows players asks for the seat's picture by its place,
  wrapped at 12, so a thirteenth seat made by two joins in the same instant reuses one.
- Screens with nine or more: the lobby shows three pictures a line on a phone; the waiting row is
  three lines of four; the answer buttons sit closer together, and four a line on the big screen;
  the scoreboard rows are shorter so twelve fit; the big screen's final scores go in three columns.
- Words: "up to 12 players" on the how-to-play page, the home page's description, the search pages
  and the Hebrew occasion pages. The pictures made from `graphics/` say 12 too: the search pages'
  link previews (`og-phone-en.png`, `og-phone-he.png`) are drawn again, and the Hanukkah square
  posts (not in the repository) say 12 when `render-hanukkah.js` is run again.
- Big screen's final at 9 to 12: in three columns the best-lie line keeps "fooled N players" (and
  the laughs) whole, and only the lie itself gives way with "…". Tables of 2 to 8 are unchanged.
- Old and new together. The functions go first, so for a minute or two a game can take a ninth
  player while the site is the old one: an old phone's waiting row reuses the first pictures for
  seats 9 to 12, and its lobby and scoreboards show no picture for them until the site's release
  brings the new files (after it, an old phone that has not reloaded gets them too). Nothing stored
  changes shape.

How to read it: `functions/bigquery/2026-11-ninth-player.sql` (share of games above 8, seats per
game on Fridays and by language, whether big tables still play to the last question, and refusals
once pull request 47's table exists).
