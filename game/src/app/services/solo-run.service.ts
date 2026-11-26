import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from './api.service';
import { SessionService } from './session.service';
import { arrivalCampaign, markHosted, markVisit } from './join-source';
import { reportError } from '../sentry/sentry.module';
import { soloStartFailed, clearSoloStartFailure } from './solo-run';

/**
 * A new solo run (SoloRun in game-model) from a final screen: PLAY AGAIN after a run, KEEP GOING
 * ALONE after the taste. One tap: a new game in the same language, this player in it under the same
 * nickname, its lobby, and START with run: true. Counted as a share (invite / `method`), as the
 * lobby's "Try 5 quick questions alone" is. If START fails, the lobby says so and offers the button
 * (soloStartFailed). Resolves false if no game could be made or joined.
 */
@Injectable({ providedIn: 'root' })
export class SoloRunService {
    constructor(private api: ApiService, private session: SessionService, private router: Router) { }

    async start(locale: string, nickname: string, method: 'solo-run-again' | 'solo-run-after-taste'): Promise<boolean> {
        let pin = '';
        try {
            pin = (await this.api.createGame(locale, 5, null, arrivalCampaign())).pin.toUpperCase();
            markHosted(pin);
            markVisit('create');
            const user = await this.api.signInAnonymously(pin, nickname, 'solo-run');
            const uid: any = user ? user.uid : 0;
            const joined = await this.api.join(pin, nickname, uid);
            this.session.user = { nickname: joined.nickname.toLowerCase(), pid: joined.pid, uid };
        } catch (e) {
            reportError(e, 'soloRunMake', { pin });
            return false;
        }
        clearSoloStartFailure();
        await this.router.navigate(['game-staging', pin]);
        this.api.logShare('invite', method, { locale });
        try {
            await this.api.startGame(pin, true);
        } catch (e) {
            reportError(e, 'soloRunStart', { pin });
            soloStartFailed(pin);
        }
        return true;
    }
}
