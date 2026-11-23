# Bullshit on AirConsole

The game as an [AirConsole](https://www.airconsole.com) game: the TV or computer is the shared screen,
and every player's phone is their controller. Every AirConsole session is a group in one room.

This folder is the whole AirConsole version. It changes nothing in the site: it reads the site's shared
code (the game's rules in `game-model.ts`, the site's game words in `game/src/app/pages/game-strings.ts`
and `score-board-final/final-strings.ts`, and the production Firebase settings) and bundles its own copy.

## How it works

- **The screen** (`src/screen.js`) makes a game on the game's own server (the `newGame` function,
  5 questions in three rounds, in the screen's AirConsole language), holds its host key and turns itself
  into the big screen (`hostToBigScreen`), as the site's Present Game mode does. It takes no seat. It
  shows each step the way the big screen does, and nudges the server if a step outlives its deadline.
- **The controllers** (`src/controller.js`) take a seat in that game under the player's AirConsole
  nickname (`join`, then `onJoinGame`, which is what counts a weekly player), and write lies, pick
  answers and press NEXT straight on the game's server, as the site's phones do.
- **One seat per phone:** the server gives one seat per Firebase sign-in, and a sign-in is kept per
  browser. In AirConsole's simulator every phone runs in one browser, so `src/seat.js` seats by
  AirConsole's device id: each device remembers its own seat (per PIN and device id), and only the first
  connected device of a browser sends the shared sign-in to `join`; the others join with none and get a
  seat of their own. Every phone still sends its sign-in to `onJoinGame`, which counts weekly players.
  A phone says "You're in!" only once the screen lists its seat under its name; if another phone took
  that seat over, it takes a new one.
- **Between them**, the screen shares the step through its AirConsole custom device state: the PIN,
  the step and its time left, the question, the answers' texts and the reveal's rows. Never which answer
  is the truth before the reveal, and never the host key. Controllers send the screen three messages:
  START, switch language, PLAY AGAIN. Only AirConsole's master controller's count.
- **Counting:** every game carries the campaign tag `portal-airconsole` (the scorecard counts groups by
  `?via=`/campaign tags). It is not a test tag, so these games count as weekly players like any other.
  Its first page is kept as `/portal/airconsole`.
- **Languages:** English, or Hebrew when the screen's AirConsole language is Hebrew. The master can
  switch in the lobby (that opens a new lobby in the other language). Hebrew reads right to left on the
  screen and on every controller.

### What AirConsole's checklist asks, and where it is

| Checklist | Here |
| --- | --- |
| Latest API, pinned | `airconsole-1.11.0.js` in both pages |
| Shows how many players are missing | the lobby line (2 needed to start) |
| Players past the maximum are told | a 13th phone is refused a seat and told the game is full |
| Works when devices connect and leave mid-game | a late phone joins at 0 points; when a phone leaves, the game goes on without it (each step then runs to its deadline) |
| Nicknames, not "Player 1" | `getNickname` for every seat |
| Only the master controls menus | START, language and PLAY AGAIN on the master only |
| AirConsole keyboard for text | the game's own on-screen keyboard (English and Hebrew); the phone's keyboard never opens. AirConsole's sample keyboard has no licence and no Hebrew |
| No `<img>` on the controller | pictures are `<div>` backgrounds |
| Ad breaks | `showAd` after each game, before PLAY AGAIN starts the next |
| Don't hide AirConsole's top bar | `showDefaultUI` is never called |
| Under 50 MB | about 1 MB |

## Build

```
cd airconsole
npm ci
node build.js          # airconsole/dist: screen.html and controller.html at its root
node build.js --zip    # also airconsole/bullshit-airconsole.zip, the file AirConsole takes
npm test               # unit tests of the rules, the keyboard, the words and the build
```

## Play a whole game locally

`test/simulated-game.js` plays a full game (three rounds, four controllers, one that leaves and one that
joins mid-game, then PLAY AGAIN; three controllers and the late one share one origin, as the simulator's
phones share one browser) against the Firebase emulators, in headless Chromium, under
`harness/`: a local stand-in for AirConsole's platform that speaks the messages of AirConsole's API to
the screen and the controllers. It is a test double, not AirConsole's simulator. It needs Java, the
root's `npm ci` (firebase-tools), `functions/` built, `.github/smoke`'s `npm ci` (Playwright), and a copy
of AirConsole's API file from [github.com/AirConsole/airconsole-api](https://github.com/AirConsole/airconsole-api):

```
AIRCONSOLE_API=/path/to/airconsole-api/airconsole-1.11.0.js node airconsole/test/simulated-game.js --locale en --shots /tmp/shots
```

The `AirConsole` workflow runs it in English and Hebrew on each pull request that touches this folder.

In AirConsole's own simulator (needs an https address for the build, for example from `npx serve dist`
behind a tunnel): `https://www.airconsole.com/simulator/#debug:https://<address>/`.

## Not in this first version

- The staged reveal and the About questions (the site's 50/50 tests): this build asks for neither.
- Laughs on lies, sounds, the round-1 lie helper, "Pick a decoy" screens (a 2-player game still gets
  its decoys from the server), crews and the share card.
- The site's two fonts (they come from Google Fonts on the site; here the system font).
- Error reports to Sentry.
- A phone that leaves keeps its seat: from then on each step waits for its deadline. A server call to
  free a seat when AirConsole says the phone left would make that faster.

## Submitting (the owner's steps)

The AirConsole developer account, its terms and the submission are the owner's. The texts and images are
in the project's files (`outreach/portals/airconsole.md`).
