# The game as a Discord Activity

Plan and reasons: the team's spec ("Bullshit as a Discord Activity", 21 Nov 2026). This page is what the
code does so far: step 1, the game running behind Discord's proxy.

## How the page knows it is inside Discord

Discord serves every Activity from `https://<app id>.discordsays.com`, in a frame of its client. The game
checks the page's own host name (`inDiscord()` in `game/src/discord/proxy.ts`): only a
`*.discordsays.com` host counts. bullshit.wtf, the Firebase Hosting hosts and localhost never match, so
off Discord nothing below runs; `?frame_id=` or any other query parameter changes nothing.

## What runs inside Discord

`game/src/discord/boot.ts` is the first entry of the polyfills (angular.json), so it runs before zone.js
and before the app's main bundle. Inside Discord it:

- wraps `fetch`, `WebSocket` and `XMLHttpRequest.open` so a request to an outside host goes to that host's
  URL mapping on the Activity's own host, as the Embedded App SDK's `patchUrlMappings` does (same
  addresses; `game/test/discord-proxy.test.js` checks them against SDK 2.5.0). It has to run first:
  Firebase's database code keeps its own copy of `WebSocket` the moment its module loads;
- turns the game's stylesheet on (the build does that with an inline script, which Discord's content
  policy may refuse);
- sets `window.bsDiscordProxy`, and `api.service.ts` then calls Firebase's `forceWebSockets()`: the
  database's fallback, long polling, loads `<script>` tags from firebaseio.com, which can't go through
  the proxy.

The visit beacon in `index.html` posts to `/_v` on a `*.discordsays.com` host too (through the "/" mapping).

## The URL mappings (Discord developer app > Activities > URL Mappings, in this order)

| Prefix | Target | For |
|---|---|---|
| `/fb/{sub}` | `{sub}.firebaseio.com` | the live database's WebSocket (its own host, or the shard host it moves to) |
| `/gapi/{sub}` | `{sub}.googleapis.com` | anonymous sign-in (identitytoolkit, securetoken) |
| `/cf` | `us-central1-bullshit-wtf-prod.cloudfunctions.net` | every game action |
| `/sentry` | `sentry.io` | error reports |
| `/` | `bullshit.wtf` | the game itself; last, since Discord takes the first prefix that fits |

The same list is `URL_MAPPINGS` in `game/src/discord/proxy.ts`; change both together. Paths are written
without `/.proxy/`: Discord's proxy takes both since July 2025, and SDK 2.x writes them this way.

## Testing it without Discord

`.github/smoke/emulator-discord.js` (the "Discord" pull request check) plays a whole four-player game
inside a local stand-in for Discord (`.github/smoke/discord-proxy.js`): the Activity in a frame at a
`discordsays.com` name, the mappings forwarded to the Firebase emulators, and a strict content policy.
It fails if the game stops, if a request leaves the proxy's host, or if the policy refuses anything but
the known leftovers (outside fonts and icons, inline scripts, Firebase sign-in's unused pop-up helper).

What only a real Discord test shows: Discord's exact content policy and frame, its proxy's limits
(Cloudflare Workers), the real Firebase hosts behind it (the web key's allowed referrers, the database's
shard host), and Discord's phone apps.
