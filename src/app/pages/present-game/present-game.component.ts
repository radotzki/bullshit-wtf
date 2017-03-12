import { ActivatedRoute } from '@angular/router';
import { GameService } from './../../services/game.service';
import * as Raven from 'raven-js';
import { ApiService } from './../../services/api.service';
import { SessionService } from './../../services/session.service';
import { Component, OnInit, OnDestroy } from '@angular/core';

@Component({
    selector: 'app-present-game',
    templateUrl: './present-game.component.html',
    styleUrls: ['./present-game.component.scss']
})
export class PresentGameComponent implements OnDestroy, OnInit {
    pin: string;
    loading: boolean;
    errorMsg: string;

    constructor(
        private activatedRoute: ActivatedRoute,
        private sessionService: SessionService,
        private apiService: ApiService,
        private gameService: GameService,
    ) { }

    ngOnInit() {
        this.pin = this.activatedRoute.snapshot.queryParams['pin'];

        if (this.pin) {
            this.submit();
        }
    }

    ngOnDestroy() {
        this.gameService.unregister(this.pin);
    }

    submit() {
        this.loading = true;
        this.errorMsg = '';

        this.apiService.presenterSignin()
            .then((resp) => {
                this.sessionService.presenter = true;
                this.sessionService.token = resp.token;
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
