import { reportError } from './../../sentry/sentry.module';
import { ApiService } from './../../services/api.service';
import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { markHosted, arrivalCampaign, preferredLocale, readCampaign } from '../../services/join-source';
import { questionPacks, seasonalPack, packFits, packIcon } from '../../game-model';
import { CreateStrings, createStrings } from './create-strings';

@Component({
    standalone: false,
    changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-create-game',
    templateUrl: './create-game.component.html',
    styleUrls: ['./create-game.component.scss']
})
export class CreateGameComponent implements OnInit {
    // The game's language, picked on the form.
    locale = 'en';
    // The page's own words: the visitor's language as they arrived. The form's pick does not change it.
    t: CreateStrings = createStrings('en');
    length = 7;
    loading: boolean;
    errorMsg: string;
    // The pack asked for with ?pack=, if any, and whether a pack on offer is switched on.
    private askedPack: string = null;
    usePack = false;
    // A tag on this page's own address (the after-game ask links here with ?via=after-game).
    private campaign: string = null;

    constructor(
        private apiService: ApiService,
        private router: Router,
        private route: ActivatedRoute,
    ) { }

    ngOnInit() {
        // Sign in now, so a tap on Create does not wait for it.
        this.apiService.warmUpSignIn();
        const params = this.route.snapshot.queryParams || {};
        this.locale = params.lang === 'he' || params.lang === 'en' ? params.lang : preferredLocale();
        this.t = createStrings(this.locale);

        this.campaign = typeof params.via === 'string' ? readCampaign(`?via=${encodeURIComponent(params.via)}`) : null;

        this.askedPack = typeof params.pack === 'string' ? params.pack : null;
        this.usePack = params.pack !== 'none';
    }

    /**
     * The seasonal pack on offer for the language picked on the form: the one asked for with ?pack=,
     * else the one in season. A pack with questions in one language only (Thanksgiving: English)
     * leaves the form when the other language is picked.
     */
    get pack(): string {
        return packFits(this.askedPack, this.locale) ? this.askedPack : seasonalPack(Date.now(), this.locale) || null;
    }

    get packIcon(): string {
        return packIcon(this.pack);
    }

    get packLabel(): string {
        // A Hebrew page names the pack in Hebrew; the English page names it in the game's language, as before.
        const lang = this.t.lang === 'he' || this.locale === 'he' ? 'he' : 'en';
        return this.pack ? questionPacks[this.pack].label[lang] : '';
    }

    submit() {
        this.loading = true;
        this.errorMsg = '';
        const pack = this.usePack && this.pack ? this.pack : undefined;

        this.apiService.createGame(this.locale, this.length, pack, this.campaign || arrivalCampaign())
            .then((resp) => {
                this.loading = false;
                markHosted(resp.pin);
                // The nickname page follows this page's language. It decides by the same rule, so the
                // language is sent along only when it came from this page's own address.
                const lang = this.t.lang !== preferredLocale() ? { lang: this.t.lang } : {};
                this.router.navigate(['/join-game', resp.pin], { queryParams: lang });
            })
            .catch(err => {
                this.loading = false;
                reportError(err, 'createGame', { locale: this.locale, count: this.length, pack });
                this.errorMsg = this.t.error;
            });
    }

}
