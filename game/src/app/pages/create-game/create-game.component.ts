import { reportError } from './../../sentry/sentry.module';
import { GameService } from './../../services/game.service';
import { ApiService } from './../../services/api.service';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { markHosted } from '../../services/join-source';

@Component({
    selector: 'app-create-game',
    templateUrl: './create-game.component.html',
    styleUrls: ['./create-game.component.scss']
})
export class CreateGameComponent {
    locale = 'en';
    length = 7;
    loading: boolean;
    errorMsg: string;

    constructor(
        private apiService: ApiService,
        private router: Router,
    ) { }

    submit() {
        this.loading = true;
        this.errorMsg = '';

        this.apiService.createGame(this.locale, this.length)
            .then((resp) => {
                this.loading = false;
                markHosted(resp.pin);
                this.router.navigate(['/join-game', resp.pin]);
            })
            .catch(err => {
                this.loading = false;
                reportError(err, 'createGame', { locale: this.locale, count: this.length });
                this.errorMsg = 'oops, something went wrong. Please try again';
            });
    }

}
