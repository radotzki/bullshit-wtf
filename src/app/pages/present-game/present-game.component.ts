import * as Raven from 'raven-js';
import { ApiService } from './../../services/api.service';
import { SessionService } from './../../services/session.service';
import { Component, OnInit } from '@angular/core';

@Component({
    selector: 'app-present-game',
    templateUrl: './present-game.component.html',
    styleUrls: ['./present-game.component.scss']
})
export class PresentGameComponent implements OnInit {
    pin: string;
    loading: boolean;
    errorMsg: string;

    constructor(
        private sessionService: SessionService,
        private apiService: ApiService,
    ) { }

    ngOnInit() {
        this.sessionService.presenter = true;
    }

    submit() {
        this.loading = true;
        this.errorMsg = '';

        this.apiService.presenterSignin()
            .then((resp) => this.sessionService.presenterToken = resp.token)
            .then(() => {
                // TODO: go to game
                console.log('this.pin', this.pin);
                this.loading = false;
            })
            .catch((err) => {
                this.loading = false;
                Raven.captureException(new Error(JSON.stringify(err)));
                this.errorMsg = 'oops, something went wrong. Please try again';
            });
    }

}
