import { setSentryUser } from './../sentry/sentry.module';
import { StorageService } from './storage.service';
import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';

const playerKey = 'BS_PLAYER';
const presenterKey = 'BS_PRESENTER';
// The nickname this browser last joined under, as the server kept it (BS_PLAYER keeps it in lower case).
const lastNameKey = 'BS_LAST_NAME';

@Injectable()
export class SessionService implements CanActivate {
    private _presenter: boolean;
    private _user: User;
    /** Set when the server swapped this phone's nickname; the lobby shows the toast once and clears it. */
    nameSwap: { pin: string; nickname: string } = null;

    constructor(
        private router: Router,
        private storageService: StorageService,
    ) { }

    set user(user: User) {
        this._user = user;
        this.storageService.setItem(playerKey, JSON.stringify(user));
        setSentryUser({ id: user.uid });
    }

    get user(): User {
        if (this._user) {
            return this._user;
        }

        try {
            this._user = JSON.parse(this.storageService.getItem(playerKey));
            return this._user;
        } catch (e) {
            return undefined;
        }
    }

    /** The nickname this browser last joined a game under, for the next game's nickname box. */
    get lastNickname(): string {
        try {
            const saved = this.storageService.getItem(lastNameKey);
            if (saved) {
                return saved;
            }
        } catch (e) { }
        const user = this.user;
        return user && typeof user.nickname === 'string' ? user.nickname : '';
    }

    set lastNickname(nickname: string) {
        try {
            if (nickname) {
                this.storageService.setItem(lastNameKey, nickname);
            }
        } catch (e) { }
    }

    get presenter() {
        return this._presenter ? this._presenter : JSON.parse(sessionStorage.getItem(presenterKey));
    }

    set presenter(isPresenter: boolean) {
        this._presenter = isPresenter;

        if (isPresenter) {
            sessionStorage.setItem(presenterKey, JSON.stringify(isPresenter));
            setSentryUser({ username: 'presenter' });
        } else {
            sessionStorage.removeItem(presenterKey);
        }
    }

    canActivate() {
        if (this.user || this.presenter) {
            return true;
        } else {
            this.router.navigate(['/']);
            return false;
        }
    }
}

interface User {
    nickname: string;
    pid: string;
    uid?: string;
}
