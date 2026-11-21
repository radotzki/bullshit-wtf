# The Discord Activity's shell

Plan and reasons: the team's spec ("Bullshit as a Discord Activity", 21 Nov 2026), rows 2 and 4. Step 1
(the game behind Discord's proxy) is in `docs/discord-activity.md`; the call's game (`discordTable`) is
in `functions/src/controllers/discord-table.ts`. This page is the shell around them: what the game does
once it knows it runs in Discord.

## Off until the build has the Discord app's id

`discordClientId` in `game/src/environments/environment.prod.ts` (and `environment.ts`) is the Discord
app's Application ID (Developer Portal > the app > General Information). It is public, not a secret.
While it is `DISCORD_APP_ID_PLACEHOLDER`, the game inside Discord is the site behind Discord's proxy,
exactly as step 1 left it, and nothing below runs. To turn the shell on, put the id there. In the same
change, move the "Discord" pull request check (`.github/smoke/emulator-discord.js`) to the shell's way
(everyone in a call lands in the call's game; no Create, no PIN), as
`game/scripts/discord-shell-run.js` plays it, or that check fails.

## Where am I running

`game/src/app/portal/portal.ts`, `runningIn()`: `site`, `crazygames` (the `/portal/crazygames` path) or
`discord` (the page's host ends in `.discordsays.com`, or Discord's launch parameters `frame_id` and
`instance_id` are on the address, and the build has the app's id). `inPortal()` is true for both
portals: hash routing and the portal route list (`portal-routes.ts`), with Discord's own home
(`discord-home.component.ts`). `inCrazyGames()` starts the CrazyGames runtime, `inDiscordActivity()`
Discord's (`discord.service.ts`).

The launch parameters are kept from the page's first look (`launchSearch()`): the hash router takes the
query string off the address on its first navigation, before the SDK starts.

## What happens in a call

1. `DiscordService` loads `@discord/embedded-app-sdk` (pinned 2.5.0, its own file of the build, so the
   site's visitors never download it), starts it with the app id and waits for `ready()`, at most 5 s.
   Without it the game goes on, with fewer buttons.
2. The home asks `discordTable` for the call's game (instance id, the player's language, a play-test
   tag if any) and sends the player to that game's join step (nickname), then its lobby. The first
   player in the call makes the game and hosts it.
3. Unless:
   - the call's game just ended and nobody pressed REMATCH (`ended: true`): a waiting screen with its
     own REMATCH. It moves on by itself when anyone in the call presses REMATCH;
   - the game has its 12 players and this phone has no seat (the 13th person): "This game is full",
     until that game ends (then the waiting screen) or is rematched.
4. Lies go through the word filter, and REMATCH keeps the `discord-activity` tag (both from
   `functions/src/controllers/portal.ts`).

## Buttons

- Lobby: INVITE TO THIS CALL (`openInviteDialog`), only in a server's voice channel (Discord refuses it
  in a DM call) and with the SDK ready; a line that everyone in the call can tap Join Activity. The QR
  code, WhatsApp, share and copy-link are hidden.
- Results card: the share-moment dialog (`openShareMomentDialog`), after uploading the picture to the
  app's attachments with the player's Discord token. Stage 1 has no sign-in with Discord, so the
  button is hidden until stage 2 sets the token (`setDiscordAccessToken`).
- Any link that would leave the game (how to play, a page of the site) opens in the player's browser
  with `openExternalLink`; a page of the site opens at bullshit.wtf.
- Hidden, as on CrazyGames: crews, the big screen, REMIND ME (next week), the after-game asks.

Both new share methods are counted as `discord` (content types `invite` and `results`).

## Checks

- `game/test/discord-shell.test.js`: the switch, the launch parameters, the steps, the links, the
  buttons with a stand-in SDK, and the real SDK package started with faked launch parameters.
- `functions/test/discord-portal.test.js`: the word filter and the tag on a Discord call's games.
- `game/scripts/discord-shell-run.js`: a local run against the Firebase emulators, in the step-1 proxy
  stand-in and with a fake Discord client; see its header.

What only a real Discord call shows: Discord's handshake and `ready()` with the real app, the invite
and share dialogs and the external-link prompt as Discord draws them, Discord's phone apps, and the
proxy and content policy themselves (step 1's open points).
