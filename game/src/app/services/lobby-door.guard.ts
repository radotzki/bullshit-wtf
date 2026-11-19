import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { ApiService } from './api.service';
import { SessionService } from './session.service';
import { LOBBY_DOOR_WAIT_MS, LobbyRead, lobbyCheck, lobbyDoorRoute, seatKey } from './lobby-door';

/**
 * The lobby's guard in place of SessionService's (lobby-door.ts): a browser with no seat in an open
 * lobby goes to that lobby's join form, the PIN filled in. Everyone else goes on exactly as before:
 * through at once with a saved player or as the big screen, else to the home page.
 */
export const lobbyDoor: CanActivateFn = (route: ActivatedRouteSnapshot) => {
    const router = inject(Router);
    const session = inject(SessionService);
    const api = inject(ApiService);
    const pin: string = route.params.pin;
    const user = session.user;
    let host = false;
    try {
        host = !!pin && api.holdsHostKey(pin);
    } catch (e) { }

    const check = lobbyCheck({
        pin,
        hasPlayer: !!user,
        presenter: !!session.presenter,
        host,
        // The first navigation of this tab has not ended yet while its guards run.
        firstPage: !router.navigated,
    });
    // Today's way: a browser with a player (or a big screen) opens the lobby; anyone else goes home.
    const asBefore = () => session.canActivate();
    if (check === 'pass') {
        return asBefore();
    }

    const pid = check === 'seat' ? seatKey(user && user.pid) : null;
    if (check === 'seat' && !pid) {
        return asBefore();
    }

    let timer: any;
    const late = new Promise<undefined>(resolve => timer = setTimeout(() => resolve(undefined), LOBBY_DOOR_WAIT_MS));
    const read: Promise<LobbyRead | undefined> = api.lobbyDoorRead(pin, pid).catch(() => undefined);
    return Promise.race([read, late]).then(found => {
        clearTimeout(timer);
        // A seat that could not be read: as before.
        const door = found && (check === 'door' || typeof found.seated === 'boolean') ? lobbyDoorRoute(pin, found) : null;
        if (!door) {
            return asBefore();
        }
        return router.createUrlTree(door.commands, { queryParams: door.queryParams });
    });
};
