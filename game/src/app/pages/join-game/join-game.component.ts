import { ActivatedRoute, Router } from '@angular/router';
import { SessionService } from './../../services/session.service';
import { GameService } from './../../services/game.service';
import * as Raven from 'raven-js';
import { ApiService } from './../../services/api.service';
import { Component, OnInit } from '@angular/core';

@Component({
    selector: 'app-join-game',
    templateUrl: './join-game.component.html',
    styleUrls: ['./join-game.component.scss']
})
export class JoinGameComponent implements OnInit {
    pin: string;
    nickname: string;
    loading: boolean;
    errorMsg: string;
    nicknameState: boolean;

    constructor(
        private activatedRoute: ActivatedRoute,
        private apiService: ApiService,
        private sessionService: SessionService,
        private router: Router,
    ) { }

    ngOnInit() {
        this.pin = this.activatedRoute.snapshot.params['pin'];

        if (this.pin) {
            this.nicknameState = true;
        }
    }

    submit() {
        if (!this.nicknameState) {
            this.validateGameName();
        } else {
            this.join();
        }
    }

    validateGameName() {
        this.loading = true;
        this.errorMsg = '';

        this.apiService.validateGameName(this.pin)
            .then(() => {
                this.nicknameState = true;
                this.loading = false;
            })
            .catch(err => {
                this.loading = false;
                this.errorMsg = err.message;
            });
    }

    async join() {
        this.loading = true;
        this.errorMsg = '';
        let uid;

        try {
            uid = (await this.apiService.signInAnonymously(this.pin, this.nickname)).uid;
        } catch (e) {
            uid = 0;
            Raven.captureException(new Error('Error: can not sign-in with anonymous method. ' + JSON.stringify(e)));
        }

        this.apiService.join(this.pin, this.nickname, uid)
            .then((pid) => {
                this.sessionService.user = { nickname: this.nickname.toLowerCase(), pid, uid };
                this.router.navigate(['game-staging', this.pin]);
                this.loading = false;
            })
            .catch(err => {
                this.loading = false;
                this.errorMsg = err.message;
                Raven.captureException(new Error(JSON.stringify(err)));
            });
    }

}
