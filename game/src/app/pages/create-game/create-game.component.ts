import { reportError } from './../../sentry/sentry.module';
import { ApiService } from './../../services/api.service';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { markHosted, arrivalCampaign, preferredLocale } from '../../services/join-source';
import { questionPacks, isPack, seasonalPack } from '../../game-model';

@Component({
    selector: 'app-create-game',
    templateUrl: './create-game.component.html',
    styleUrls: ['./create-game.component.scss']
})
export class CreateGameComponent implements OnInit {
    locale = 'en';
    length = 7;
    loading: boolean;
    errorMsg: string;
    // The seasonal pack on offer (in season, or asked for with ?pack=), and whether it is switched on.
    pack: string = null;
    usePack = false;

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

        const asked = isPack(params.pack) ? params.pack : null;
        this.pack = asked || seasonalPack() || null;
        this.usePack = !!this.pack && params.pack !== 'none';
    }

    get packLabel(): string {
        return this.pack ? questionPacks[this.pack].label[this.locale === 'he' ? 'he' : 'en'] : '';
    }

    submit() {
        this.loading = true;
        this.errorMsg = '';
        const pack = this.usePack && this.pack ? this.pack : undefined;

        this.apiService.createGame(this.locale, this.length, pack, arrivalCampaign())
            .then((resp) => {
                this.loading = false;
                markHosted(resp.pin);
                this.router.navigate(['/join-game', resp.pin]);
            })
            .catch(err => {
                this.loading = false;
                reportError(err, 'createGame', { locale: this.locale, count: this.length, pack });
                this.errorMsg = 'oops, something went wrong. Please try again';
            });
    }

}
