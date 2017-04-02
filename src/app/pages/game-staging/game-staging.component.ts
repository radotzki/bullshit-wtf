import { Subscription } from 'rxjs/Subscription';
import * as Raven from 'raven-js';
import { ApiService } from './../../services/api.service';
import { SessionService } from './../../services/session.service';
import { Game } from './../../models';
import { Observable } from 'rxjs/Observable';
import { GameService } from './../../services/game.service';
import { ActivatedRoute } from '@angular/router';
import { Component, OnInit, OnDestroy } from '@angular/core';

@Component({
    selector: 'app-game-staging',
    templateUrl: './game-staging.component.html',
    styleUrls: ['./game-staging.component.scss']
})
export class GameStagingComponent implements OnInit, OnDestroy {
    playersSubscription: Subscription;
    players: { name: string }[];
    pin: string;
    presenter: boolean;
    loading: boolean;
    errorMsg: string;
    leader: boolean;

    constructor(
        private activatedRoute: ActivatedRoute,
        private gameService: GameService,
        private sessionService: SessionService,
        private apiService: ApiService,
    ) { }

    ngOnInit() {
        this.pin = this.activatedRoute.snapshot.params['pin'];
        this.presenter = !!this.sessionService.presenter;
        this.playersSubscription = this.apiService.getPlayers(this.pin).subscribe(this.onPlayersChanged.bind(this));
        this.gameService.register(this.pin);
    }

    ngOnDestroy() {
        this.gameService.unregister(this.pin);
        this.playersSubscription.unsubscribe();
    }

    onPlayersChanged(resp) {
        this.players = resp;
        this.leader = !this.sessionService.presenter && this.players[0].name === this.sessionService.user.name;
    }

    startGame() {
        this.loading = true;
        this.errorMsg = '';

        this.apiService.startGame(this.pin)
            .catch(err => {
                this.loading = false;
                Raven.captureException(new Error(JSON.stringify(err)));
                this.errorMsg = 'oops, something went wrong. Please try again';
            });
    }
}
