import { reportError } from './../../sentry/sentry.module';
import { ApiService } from './../../services/api.service';
import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { markHosted, markVisit, arrivalCampaign, preferredLocale, readCampaign } from '../../services/join-source';
import { inPortal } from '../../portal/portal';
import { questionPacks, seasonalPack, packFits, packIcon, KIDS_PACK, chosenPack, kidsSeasonPack } from '../../game-model';
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
    // "Kids are playing": the game plays the kids pack in place of the seasonal one (see questionPacks.kids).
    kids = false;
    // The CrazyGames version offers no kids' questions (CrazyGames takes no games for children): no box, and ?pack=kids is ignored.
    readonly portal = inPortal();
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

        // ?pack=kids switches "Kids are playing" on; it is never offered as the Special pack.
        this.kids = !this.portal && params.pack === KIDS_PACK;
        this.askedPack = typeof params.pack === 'string' && params.pack !== KIDS_PACK ? params.pack : null;
        this.usePack = params.pack !== 'none';
    }

    /**
     * The seasonal pack on offer for the language picked on the form: the one asked for with ?pack=,
     * else the one in season. A pack with questions in one language only (Thanksgiving: English)
     * leaves the form when the other language is picked. Hidden while "Kids are playing" is on.
     */
    get pack(): string {
        return packFits(this.askedPack, this.locale) ? this.askedPack : seasonalPack(Date.now(), this.locale) || null;
    }

    /**
     * With kids playing: the holiday whose kid-friendly questions the kids game still gets today: the one
     * asked for with ?pack= (an English game from the Hanukkah page), else the language's own, or none.
     */
    get kidsHoliday(): string | undefined {
        return kidsSeasonPack(Date.now(), this.locale, this.askedPack || undefined);
    }

    /** The line under the kids switch that names that holiday, or ''. */
    get kidsSeasonLine(): string {
        const id = this.kidsHoliday;
        return id ? `${this.t.kidsSeason} ${packIcon(id)} ${questionPacks[id].label[this.locale === 'he' ? 'he' : 'en']}.` : '';
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
        // One pack a game: with kids playing, the kid questions take the seasonal pack's place.
        const pack = chosenPack(this.kids, this.usePack, this.pack);

        // A kids game keeps the holiday's kid-friendly questions (the server checks the season again).
        const kidsHoliday = this.kids ? this.kidsHoliday : undefined;
        const campaign = this.campaign || arrivalCampaign();

        (kidsHoliday
            ? this.apiService.createKidsGame(this.locale, this.length, pack, campaign, kidsHoliday)
            : this.apiService.createGame(this.locale, this.length, pack, campaign))
            .then((resp) => {
                this.loading = false;
                markHosted(resp.pin);
                markVisit('create');
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
