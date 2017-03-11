import { Game, QuestionState, Player } from './../../models';
import { Subscription } from 'rxjs/Subscription';
import { GameService } from './../../services/game.service';
import { ApiService } from './../../services/api.service';
import { ActivatedRoute } from '@angular/router';
import { Component, OnInit, OnDestroy } from '@angular/core';

@Component({
    selector: 'app-score-board',
    templateUrl: './score-board.component.html',
    styleUrls: ['./score-board.component.scss']
})
export class ScoreBoardComponent implements OnInit, OnDestroy {
    gameSubscription: Subscription;
    pin: string;
    game: Game;
    displayPlayers: Player[];

    constructor(
        private activatedRoute: ActivatedRoute,
        private gameService: GameService,
        private apiService: ApiService,
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
        this.displayPlayers = this.game.players.sort((a, b) => a.score < b.score ? 1 : -1);

        setTimeout(this.tick.bind(this), 5000);
    }

    tick() {
        this.apiService.tick(this.pin, QuestionState.ScoreBoard);
    }

}
