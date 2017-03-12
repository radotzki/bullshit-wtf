import { ActivatedRoute } from '@angular/router';
import { SessionService } from './../../services/session.service';
import { GameService } from './../../services/game.service';
import * as Raven from 'raven-js';
import { ApiService } from './../../services/api.service';
import { Component, OnInit, OnDestroy } from '@angular/core';

@Component({
    selector: 'app-join-game',
    templateUrl: './join-game.component.html',
    styleUrls: ['./join-game.component.scss']
})
export class JoinGameComponent implements OnDestroy, OnInit {
    pin: string;
    nickname: string;
    loading: boolean;
    errorMsg: string;

    constructor(
        private activatedRoute: ActivatedRoute,
        private apiService: ApiService,
        private gameService: GameService,
        private sessionService: SessionService,
    ) { }

    ngOnInit() {
        this.pin = this.activatedRoute.snapshot.queryParams['pin'];
    }

    ngOnDestroy() {
        this.gameService.unregister(this.pin);
    }

    submit() {
        this.loading = true;
        this.errorMsg = '';

        this.apiService.join(this.pin, this.nickname)
            .then(resp => {
                this.sessionService.user = { name: this.nickname };
                this.sessionService.token = resp.token;
                this.gameService.register(resp.pin);
                this.loading = false;
            })
            .catch(err => {
                this.loading = false;

                if (err.code === 'GAME_NOT_FOUND') {
                    this.errorMsg = 'This game does not exist';
                } else if (err.code === 'NAME_OCCUPIED') {
                    this.errorMsg = 'Sorry, that nickname is taken.';
                } else {
                    Raven.captureException(new Error(JSON.stringify(err)));
                    this.errorMsg = 'oops, something went wrong. Please try again';
                }
            });
    }

}
