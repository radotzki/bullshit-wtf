import { Injectable } from '@angular/core';

@Injectable()
export class StorageService {
    private isLocalStorageSupported: boolean;

    constructor() {
        this.isLocalStorageSupported = this.checkLocalStorage();
    }

    getItem(key) {
        if (this.isLocalStorageSupported) {
            return localStorage.getItem(key);
        } else {
            return sessionStorage.getItem(key);
        }
    }

    setItem(key, val) {
        if (this.isLocalStorageSupported) {
            localStorage.setItem(key, val);
        } else {
            sessionStorage.setItem(key, val);
        }
    }

    removeItem(key) {
        if (this.isLocalStorageSupported) {
            localStorage.removeItem(key);
        } else {
            sessionStorage.removeItem(key);
        }
    }

    private checkLocalStorage() {
        const mod = 'modernizr';
        try {
            localStorage.setItem(mod, mod);
            localStorage.removeItem(mod);
            return true;
        } catch (e) {
            return false;
        }
    }
}
