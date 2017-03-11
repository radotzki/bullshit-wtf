import * as Raven from 'raven-js';
import { ValidateTokenComponent } from './../pages/validate-token/validate-token.component';
import { StorageService } from './storage.service';
import { Injectable } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';

const storageKey = 'BS_SESSION';
const presenterKey = 'BS_P';

@Injectable()
export class SessionService implements CanActivate {
    private _presenter: string;
    private _user: User;

    constructor(
        private router: Router,
        private storageService: StorageService,
    ) { }

    set user(user: User) {
        this._user = user;
        this.storageService.setItem(storageKey, JSON.stringify(user));
        Raven.setUserContext({ email: user.email, id: user.id });
    }

    get user(): User {
        if (this._user) {
            return this._user;
        }

        try {
            this._user = JSON.parse(this.storageService.getItem(storageKey));
            return this._user;
        } catch (e) {
            return undefined;
        }
    }

    get presenter() {
        return this._presenter ? this._presenter : sessionStorage.getItem(presenterKey);
    }

    set presenter(token: string) {
        this._presenter = token;

        if (token) {
            sessionStorage.setItem(presenterKey, token);
            Raven.setUserContext({ username: 'presenter' });
        } else {
            sessionStorage.removeItem(presenterKey);
        }
    }

    get token() {
        if (this.presenter) {
            return this.presenter;
        } else if (this.user) {
            return this.user.token;
        } else {
            return undefined;
        }
    }

    canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot) {
        if (this.user || this.presenter) {
            return true;
        } else {
            this.router.navigate(['signin', state.url]);
            return false;
        }
    }
}

interface User {
    token: string;
    id: string;
    name: string;
    email: string;
}
