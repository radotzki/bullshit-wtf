/**
 * The CrazyGames version's look (portal.ts): added to the page by PortalService on the portal path
 * only. It hides what leads out of the game to the playable site, or to pages the portal doesn't
 * have: the text about the game and its search links, crews, next week's game night, the after-game
 * asks to host a game on the site, the daily puzzle link, the big screen, and "join at bullshit.wtf".
 * Text is not selectable, as CrazyGames asks, except in the boxes a player types in.
 */
export const PORTAL_CSS = `
html.bs-portal #bs-about,
html.bs-portal app-host-ask,
html.bs-portal app-invite-group,
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
`;
