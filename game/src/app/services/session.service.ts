import * as Raven from 'raven-js';
import { StorageService } from './storage.service';
import { Injectable } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';

const playerKey = 'BS_PLAYER';
const presenterKey = 'BS_PRESENTER';

@Injectable()
export class SessionService implements CanActivate {
    private _presenter: boolean;
    private _user: User;

    constructor(
        private router: Router,
        private storageService: StorageService,
    ) { }

    set user(user: User) {
        this._user = user;
        this.storageService.setItem(playerKey, JSON.stringify(user));
        Raven.setUserContext({ id: user.uid });
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

    get presenter() {
        return this._presenter ? this._presenter : JSON.parse(sessionStorage.getItem(presenterKey));
    }

    set presenter(isPresenter: boolean) {
        this._presenter = isPresenter;

        if (isPresenter) {
            sessionStorage.setItem(presenterKey, JSON.stringify(isPresenter));
            Raven.setUserContext({ username: 'presenter' });
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
