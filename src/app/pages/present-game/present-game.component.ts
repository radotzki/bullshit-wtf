import { GameService } from './../../services/game.service';
import * as Raven from 'raven-js';
import { ApiService } from './../../services/api.service';
import { SessionService } from './../../services/session.service';
import { Component } from '@angular/core';

@Component({
    selector: 'app-present-game',
    templateUrl: './present-game.component.html',
    styleUrls: ['./present-game.component.scss']
})
export class PresentGameComponent {
    pin: string;
    loading: boolean;
    errorMsg: string;

    constructor(
        private sessionService: SessionService,
        private apiService: ApiService,
        private gameService: GameService,
    ) { }

    submit() {
        this.loading = true;
        this.errorMsg = '';

        this.apiService.presenterSignin()
            .then((resp) => {
                this.sessionService.presenter = resp.token;
                this.gameService.register(this.pin);
                this.loading = false;
            })
            .catch((err) => {
                this.loading = false;
                Raven.captureException(new Error(JSON.stringify(err)));
                this.errorMsg = 'oops, something went wrong. Please try again';
            });
    }

}
