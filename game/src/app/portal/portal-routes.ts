import { Type } from '@angular/core';
import { Routes } from '@angular/router';
import { PortalHomeComponent } from './portal-home.component';

/** The game's own screens, kept as they are in the portal (with or without /:pin). */
const KEEP = new RegExp('^(he/)?(create-game|join-game|game-staging|round-intro|show-question|show-answers|reveal-the-truth'
    + '|score-board|score-board-final|step)(/:pin)?$');

/**
 * The app's routes in a portal version (portal.ts): the game's own screens as they are; the home, and
 * every page that leads out of the game (the menus, the big screen, how to play, crews), go to the
 * portal's home: CrazyGames' (PortalHomeComponent), or Discord's (DiscordHomeComponent).
 */
export function portalRoutes(routes: Routes, home: Type<any> = PortalHomeComponent): Routes {
    const first: Routes = [{ path: '', component: home }];
    return first
        .concat(routes.filter(r => KEEP.test(r.path || '')))
        .concat([{ path: '**', component: home }]);
}
