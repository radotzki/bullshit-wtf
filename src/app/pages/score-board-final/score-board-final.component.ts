import { SessionService } from './../../services/session.service';
import * as Raven from 'raven-js';
import { Game, QuestionState, Player } from './../../models';
import { Subscription } from 'rxjs/Subscription';
import { GameService } from './../../services/game.service';
import { ApiService } from './../../services/api.service';
import { ActivatedRoute } from '@angular/router';
import { Component, OnInit, OnDestroy } from '@angular/core';

@Component({
    selector: 'app-score-board-final',
    templateUrl: './score-board-final.component.html',
    styleUrls: ['./score-board-final.component.scss']
})
export class ScoreBoardFinalComponent implements OnInit, OnDestroy {
    gameSubscription: Subscription;
    pin: string;
    game: Game;
    displayPlayers: Player[];
    loading: boolean;
    errorMsg: string;
    leader: boolean;

    constructor(
        private activatedRoute: ActivatedRoute,
        private gameService: GameService,
        private apiService: ApiService,
        private sessionService: SessionService,
    ) { }

    ngOnInit() {
        this.pin = this.activatedRoute.snapshot.params['pin'];
        this.gameSubscription = this.gameService.feed(this.pin).first().subscribe(this.onGameChanged.bind(this));
        this.gameService.register(this.pin);
    }

    ngOnDestroy() {
        this.gameService.unregister(this.pin);
        this.gameSubscription.unsubscribe();
    }

    onGameChanged(resp: Game) {
        this.game = resp;
        this.displayPlayers = [...this.game.players].sort((a, b) => a.score < b.score ? 1 : -1);
        this.leader = !this.sessionService.presenter && this.game.players[0].name === this.sessionService.user.name;
    }

    replay() {
        this.loading = true;
        this.errorMsg = '';

        this.apiService.replay(this.pin)
            .catch(err => {
                this.loading = false;
                Raven.captureException(new Error(JSON.stringify(err)));
                this.errorMsg = 'oops, something went wrong. Please try again';
            });
    }

}
