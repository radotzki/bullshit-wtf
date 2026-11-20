# The CrazyGames version

The game, as CrazyGames shows it: the same app, framed by CrazyGames from
`https://bullshit.wtf/portal/crazygames?via=portal-crazygames` (Hebrew: `/he/portal/crazygames`).
Nothing is uploaded to CrazyGames; the game keeps running on our own site and Firebase.

## What is different there

All of it is in `game/src/app/portal/` and `functions/src/controllers/portal.ts`. Off the portal path
the site is unchanged.

- **Framing.** `firebase.json` sends `frame-ancestors 'self' https://crazygames.com https://*.crazygames.com
  capacitor://*.crazygames.com` on the portal path only (CrazyGames' own value for framed games). A
  frame-blocking header for the rest of the site must leave this path out, as it leaves out the daily
  puzzle's embed: two `frame-ancestors` policies are both enforced. `game/test/portal.test.js` fails
  if a second one reaches the path.
- **Routes.** The app routes by the hash (`/portal/crazygames#/game-staging/ABCD`), so a reload in the
  frame stays on the framed path. The portal has its own home (start a game, or join with a PIN);
  the site's menus, the big screen, how to play and crew pages are not there.
- **A player who arrives alone.** Most CrazyGames players come alone from the game's tile. The
  portal's home says at once that this is a party game for 2 to 12 players, each on their own phone
  or computer, and how a round goes (three short lines), then two starts of the same size: **Play with
  friends** (a 5-question game in the season's pack; a signed-in player's CrazyGames username joins it
  at once, so one tap lands in the lobby with the invite link; a guest types a nickname first) and
  **Try it alone** (the 5-question taste, started as soon as the player is in, ending on "Now try it
  with friends" and INVITE FRIENDS). The create page's options are a small link below. The home is
  sized in px so both starts are on the first screen from 360x640 to 1280x720 and in CrazyGames'
  800x450 frame. In the lobby, "Try 5 quick questions alone" is a button, not a faint link.
- **SDK.** CrazyGames' HTML5 SDK v3 loads on the portal path only, and the game never waits for it
  (8 s at most, then it plays on without it). Once ready: `loadingStart`/`loadingStop`,
  `gameplayStart` while a question is on and `gameplayStop` elsewhere, `updateRoom` with the PIN
  (joinable until the final scoreboard, since latecomers join at 0 points), `leftRoom` on leaving,
  `settings.muteAudio` mutes the game.
- **Invites.** The lobby's WhatsApp, share, copy and QR use `inviteLink({ roomId: PIN })`. A friend
  who opens that link lands on the game's nickname step (`inviteParams.roomId`, and the join-room
  listener). Instant Multiplayer opens a new 5-question game's lobby at once (with a username, the
  player is already in it; a guest types a nickname first).
- **Usernames and language.** The nickname box starts with the CrazyGames username. It shows the
  first 9 characters, as every nickname box does, but the join sends the whole username, and the
  server checks all of it for slurs and sex words before it cuts it to 9: a rude word past the 9th
  character is swapped for a harmless name, not cut off (`game/src/app/pages/join-game/whole-name.ts`,
  the same for a long name pasted on the main site). Hebrew when CrazyGames' locale is Hebrew, else
  English.
- **No links out.** Links to the playable site are hidden (the text about the game, crews, next
  week's night, the after-game asks, the daily puzzle, the big screen, "join at bullshit.wtf"), and a
  tap on any link to a page that is not CrazyGames' or WhatsApp's does nothing. Share texts and the
  results picture name CrazyGames, not bullshit.wtf.
- **Players' lies.** CrazyGames asks for at least a profanity filter on what players write. In a
  portal game a lie with swearing, a slur or a sex word, in English or Hebrew, is refused, and the
  player writes another (`functions/src/controllers/lie-filter.ts`: whole words, with an allowed list
  for fair names like "Dick Van Dyke", "Homo sapiens" and "cum laude"; "כוס" alone is a cup). On the
  main site only kids' games ("Kids are playing") filter lies; every other game takes any lie.
- **The lobby on a computer.** In a wide frame the host's lobby shows the buttons and the QR code side by
  side, so the code is on the first screen at 1280x720. Phones keep one column. The smoke run checks it:
  `node .github/smoke/portal-crazygames.js --size 1280x720 --lone-host classic`.
- **Counting.** Every game made in the portal carries campaign `portal-crazygames` (a `?via=test`
  play-test stays a test), Replay and PLAY AGAIN keep it, so portal groups count as weekly players and
  can be told apart: `opened_games.campaign = 'portal-crazygames'`.

## Checking it

- `npm test` in `game/` and `functions/` (`test/portal.test.js` in each).
- `.github/smoke/smoke.js` loads both portal paths with CrazyGames' SDK refused: the portal plays on.
- `node .github/smoke/portal-crazygames.js --shots <dir>` (local: Java, the emulators, both builds): a
  whole game inside a test page standing in for CrazyGames, with a stand-in SDK. See its header.
  Every pull request runs it at 390x844 and 1280x720 (`.github/workflows/portal.yml`, "CrazyGames
  portal"), about 3 minutes each, side by side.
- `functions/test/whole-name-join.test.js`: long and rude names through the join page's box and the
  server's join, a rude word before, at and after the 9th character, in English and Hebrew.

## Submitting (the owner's steps)

A CrazyGames developer account, its terms, and the upload form. The texts and images are in the
project's outreach folder. The frame address to give: the one at the top of this page.
