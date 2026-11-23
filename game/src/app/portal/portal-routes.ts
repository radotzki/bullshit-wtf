import { Routes } from '@angular/router';
import { PortalHomeComponent } from './portal-home.component';

/** The game's own screens, kept as they are in the portal (with or without /:pin). */
const KEEP = new RegExp('^(he/)?(create-game|join-game|game-staging|round-intro|show-question|show-answers|reveal-the-truth'
    + '|score-board|score-board-final|step)(/:pin)?$');

/**
 * The app's routes in the CrazyGames version (portal.ts): the game's own screens as they are; the
 * home, and every page that leads out of the game (the menus, the big screen, how to play, crews),
 * go to the portal's home.
 */
export function portalRoutes(routes: Routes): Routes {
    const home: Routes = [{ path: '', component: PortalHomeComponent }];
    return home
        .concat(routes.filter(r => KEEP.test(r.path || '')))
        .concat([{ path: '**', component: PortalHomeComponent }]);
}
