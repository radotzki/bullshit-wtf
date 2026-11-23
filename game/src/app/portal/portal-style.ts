/**
 * The CrazyGames version's look (portal.ts): added to the page by PortalService on the portal path
 * only. It hides what leads out of the game to the playable site, or to pages the portal doesn't
 * have: the text about the game and its search links, crews, next week's game night, the after-game
 * asks to host a game on the site, the daily puzzle link, the big screen, and "join at bullshit.wtf".
 * Text is not selectable, as CrazyGames asks, except in the boxes a player types in. The lobby's
 * "Try 5 quick questions alone" is a button here, not a faint link: CrazyGames asks that playing alone
 * be as easy to find as playing with friends.
 *
 * On a computer (a wide, landscape frame) the lobby's invite, while the host waits for friends, is two
 * columns: the buttons on one side, the QR code with its PIN on the other, so the code is on the first
 * screen of a 1280x720 frame for friends in the room to scan. Phones keep the one column. Sizes are in
 * px, as the invite's computer card's are (components/invite): the page's rem grows with the window.
 * !important: the invite's own rules carry Angular's extra attribute, and outrank these otherwise.
 */
export const PORTAL_CSS = `
html.bs-portal #bs-about,
html.bs-portal app-host-ask,
html.bs-portal app-next-week,
html.bs-portal .crew-link,
html.bs-portal .save-crew,
html.bs-portal .crew-form,
html.bs-portal .crew-panel,
html.bs-portal .recap-crew,
html.bs-portal .taste-daily,
html.bs-portal .big-screen-offer,
html.bs-portal .registration { display: none !important; }
html.bs-portal body { -webkit-user-select: none; user-select: none; }
html.bs-portal input, html.bs-portal textarea { -webkit-user-select: text; user-select: text; }
html.bs-portal .start-alone-link {
  display: inline-block; padding: 6px 18px; border: 2px solid #502440; border-radius: 4px; color: #502440 !important;
  font-size: 16px !important; font-weight: bold; text-decoration: none !important; cursor: pointer;
}
@media (min-width: 900px) and (orientation: landscape) {
  html.bs-portal .invite-inline {
    display: grid !important; grid-template-columns: minmax(0, 400px) auto; justify-content: center;
    align-items: center; column-gap: 48px; max-width: 900px; margin: 0 auto; padding: 12px 16px 0 !important;
  }
  html.bs-portal .invite-inline > .button {
    grid-column: 1; grid-row: 3; align-self: start; margin: 5px 0 0 !important;
    height: auto !important; padding: 10px 16px !important; font-size: 18px !important;
  }
  html.bs-portal .invite-inline > .whatsapp { grid-row: 2; align-self: end; margin: 0 0 5px !important; }
  html.bs-portal .invite-inline > .button.is-primary + .button { grid-row: 4; }
  html.bs-portal .invite-inline > .scan-hint { grid-column: 2; grid-row: 1; margin: 0 !important; font-size: 15px; }
  html.bs-portal .invite-inline > .qr {
    grid-column: 2; grid-row: 2 / span 2; display: block !important; margin: 6px auto 0 !important;
    width: clamp(150px, 26vh, 240px) !important; height: clamp(150px, 26vh, 240px) !important;
  }
  html.bs-portal .invite-inline > .pin { grid-column: 2; grid-row: 4; margin: 4px 0 0 !important; font-size: 18px !important; }
}
`;
