import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from './../../services/api.service';
import { SessionService } from './../../services/session.service';
import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { cleanCode, typedHebrew } from '../../services/game-code';
import { preferredLocale } from '../../services/join-source';
import { joinLocale } from '../join-game/join-strings';
import { presentStrings, PresentStrings } from './present-strings';

@Component({
    standalone: false,
    changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-present-game',
    templateUrl: './present-game.component.html',
    styleUrls: ['./present-game.component.scss']
})
export class PresentGameComponent implements OnInit {
    pin: string;
    loading: boolean;
    hide: boolean;
    errorMsg = '';
    t: PresentStrings;

    constructor(
        private activatedRoute: ActivatedRoute,
        private sessionService: SessionService,
        private apiService: ApiService,
        private router: Router,
    ) { }

    ngOnInit() {
        const lang = (this.activatedRoute.snapshot.queryParams || {})['lang'];
        this.t = presentStrings(joinLocale(this.router.url, lang, preferredLocale()));
        this.pin = this.activatedRoute.snapshot.params['pin'];

        if (this.pin) {
            this.hide = true;
            this.submit();
        }
    }

    /**
     * Shows the game on this screen. The code is read as the join boxes read it (a code typed on a
     * Hebrew keyboard, lower case or with spaces still works), and only a game that exists is shown:
     * a mistyped code used to open an empty lobby that waited forever ("Waiting for players..").
     */
    async submit() {
        if (this.loading) {
            return;
        }
        const typed = this.pin;
        const pin = cleanCode(typed);
        this.errorMsg = '';
        if (!pin) {
            this.hide = false;
            this.errorMsg = this.t.notFound(String(typed || '').trim());
            return;
        }
        this.loading = true;
        try {
            // The game's language is readable by anyone, and null for a code no game has. Reading it
            // here also lets the lobby paint in the game's language from its first frame.
            const locale = await this.apiService.getGameLocale(pin);
            if (!locale) {
                this.hide = false;
                this.loading = false;
                const stop = typedHebrew(typed) ? ` ${this.t.englishLetters}` : '';
                this.errorMsg = `${this.t.notFound(pin)}${stop}`;
                return;
            }
            await this.apiService.joinAsPresenter(pin);
            this.sessionService.presenter = true;
            this.loading = false;
            this.router.navigate(['game-staging', pin]);
        } catch (e) {
            this.hide = false;
            this.loading = false;
            this.errorMsg = this.t.error;
        }
    }

}
