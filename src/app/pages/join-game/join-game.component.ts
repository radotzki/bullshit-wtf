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

    constructor(
        private activatedRoute: ActivatedRoute,
        private apiService: ApiService,
        private sessionService: SessionService,
        private router: Router,
    ) { }

    ngOnInit() {
        this.pin = this.activatedRoute.snapshot.queryParams['pin'];
    }

    submit() {
        this.loading = true;
        this.errorMsg = '';

        this.apiService.join(this.pin, this.nickname)
            .then(() => {
                this.sessionService.user = { name: this.nickname.toLowerCase() };
                this.router.navigate(['game-staging', this.pin]);
                this.loading = false;
            })
            .catch(err => {
                this.loading = false;
                this.errorMsg = err.message;
            });
    }

}
