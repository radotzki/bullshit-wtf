import { Howl } from 'howler';
import { StorageService } from './storage.service';
import { Injectable } from '@angular/core';

const mutedKey = 'BS_MUTED';

// The short sounds a phone plays in a staged-reveal game. Music stays on the big screen.
const names = ['player-lie-0', 'player-lie-1', 'house-lie-0', 'house-lie-1', 'the-truth', 'time-warning'];

/**
 * Sound and vibration on phones, for staged-reveal games played without a big screen. A big screen
 * keeps its own sounds, and with one in the room the phones stay quiet (see ApiService.phoneSound).
 *
 * A phone browser plays no sound until the player has tapped the page. arm() makes the players (which
 * downloads the files) while the player is still in the lobby or on the first question; the sound
 * library then unlocks itself on the player's next tap (START, typing a lie, picking an answer).
 * An iPhone in silent mode stays silent, and iPhone browsers do not vibrate: the screen carries the moment.
 */
@Injectable()
export class SoundService {
    private howls: { [name: string]: Howl } = {};
    private _muted: boolean;

    constructor(private storageService: StorageService) { }

    /** The player's choice, remembered on this phone across games. */
    get muted(): boolean {
        if (this._muted === undefined) {
            let saved: string = null;
            try {
                saved = this.storageService.getItem(mutedKey);
            } catch (e) { }
            this._muted = saved === '1';
        }
        return this._muted;
    }

    setMuted(muted: boolean) {
        this._muted = muted;
        try {
            if (muted) {
                this.storageService.setItem(mutedKey, '1');
            } else {
                this.storageService.removeItem(mutedKey);
            }
        } catch (e) { }

        if (muted) {
            Object.keys(this.howls).forEach(name => this.howls[name].stop());
        } else {
            this.arm();
        }
    }

    /** Get ready to play: safe to call again and again. A muted phone downloads nothing. */
    arm() {
        if (this.muted) {
            return;
        }
        try {
            names.filter(name => !this.howls[name]).forEach(name => {
                this.howls[name] = new Howl({ src: [`/assets/sounds/${name}.mp3`], preload: true });
            });
        } catch (e) { }
    }

    play(name: string) {
        if (this.muted) {
            return;
        }
        try {
            this.arm();
            // One sound at a time: a new one cuts the last one short.
            Object.keys(this.howls).forEach(other => this.howls[other].stop());
            if (this.howls[name]) {
                this.howls[name].play();
            }
        } catch (e) { }
    }

    stop(name: string) {
        try {
            if (this.howls[name]) {
                this.howls[name].stop();
            }
        } catch (e) { }
    }

    /** A short buzz, where the phone allows it (not on iPhones). Muted phones stay still. */
    vibrate(pattern: number | number[]) {
        if (this.muted) {
            return;
        }
        try {
            const nav: any = navigator;
            if (nav && typeof nav.vibrate === 'function') {
                nav.vibrate(pattern);
            }
        } catch (e) { }
    }
}
