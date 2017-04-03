import { GamePlayers, GamePlayer } from './../../game-model';
import { Subscription } from 'rxjs/Subscription';
import * as Raven from 'raven-js';
import { ApiService } from './../../services/api.service';
import { SessionService } from './../../services/session.service';
import { Observable } from 'rxjs/Observable';
import { GameService } from './../../services/game.service';
import { ActivatedRoute } from '@angular/router';
import { Component, OnInit, OnDestroy } from '@angular/core';

function toArray<T>(obj: { [k: string]: T }): T[] {
    return Object.keys(obj).map(k => obj[k]);
}

@Component({
    selector: 'app-game-staging',
    templateUrl: './game-staging.component.html',
    styleUrls: ['./game-staging.component.scss']
})
export class GameStagingComponent implements OnInit, OnDestroy {
    players: GamePlayer[];
    playersSubscriber: Subscription;
    pin: string;
    presenter: boolean;
    loading: boolean;
    errorMsg: string;
    leader: Observable<boolean>;

    constructor(
        private activatedRoute: ActivatedRoute,
        private gameService: GameService,
        private sessionService: SessionService,
        private apiService: ApiService,
    ) { }

    ngOnInit() {
        this.pin = this.activatedRoute.snapshot.params['pin'];
        this.presenter = !!this.sessionService.presenter;
        this.playersSubscriber = this.apiService.getPlayers(this.pin)
            .map(toArray)
            .subscribe(players => this.players = players);
        // this.leader = this.players.map(players => toArray(players)[0].nickname === this.sessionService.user.name);
        this.gameService.register(this.pin);
    }

    ngOnDestroy() {
        this.gameService.unregister(this.pin);
        this.playersSubscriber.unsubscribe();
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
