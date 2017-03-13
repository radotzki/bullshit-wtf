import { SessionService } from './../../services/session.service';
import { Game, GameState } from './../../models';
import { GameService } from './../../services/game.service';
import { ActivatedRoute } from '@angular/router';
import { Component, OnInit, OnDestroy, Input, Output, EventEmitter } from '@angular/core';
import { Subscription } from 'rxjs/Subscription';

@Component({
    selector: 'app-game-header',
    templateUrl: './game-header.component.html',
    styleUrls: ['./game-header.component.scss']
})
export class GameHeaderComponent implements OnInit, OnDestroy {
    pin: string;
    text: string;
    gameOver: boolean;
    registration: boolean;
    gameSubscription: Subscription;
    loading: boolean;
    presenter: boolean;
    @Input() button: string;
    @Input() buttonLoading: boolean;
    @Output() onClick: EventEmitter<any> = new EventEmitter();

    constructor(
        private activatedRoute: ActivatedRoute,
        private gameService: GameService,
        private sessionService: SessionService,
    ) { }

    ngOnInit() {
        this.loading = true;
        this.pin = this.activatedRoute.snapshot.params['pin'];
        this.presenter = !!this.sessionService.presenter;
        this.gameSubscription = this.gameService.feed(this.pin).subscribe(this.onGameChange.bind(this));
    }

    ngOnDestroy() {
        this.gameSubscription.unsubscribe();
    }

    onGameChange(game: Game) {
        if (game.state === GameState.RoundOneIntro) {
            this.text = 'ROUND 1';
        } else if (game.state === GameState.RoundTwoIntro) {
            this.text = 'ROUND 2';
        } else if (game.state === GameState.RoundThreeIntro) {
            this.text = 'ROUND 3';
        } else if (this.roundInProgress(game.state)) {
            this.text = `${game.currentQuestion.questionNumber + 1} OF ${game.numberOfQuestions}`;
        } else if (game.state === GameState.GameOver) {
            this.gameOver = true;
        } else if (game.state === GameState.Registration && this.presenter) {
            this.registration = true;
        }

        this.loading = false;
    }

    roundInProgress(state: GameState) {
        return state === GameState.RoundOneProgress ||
            state === GameState.RoundTwoProgress ||
            state === GameState.RoundThreeProgress;
    }

}
