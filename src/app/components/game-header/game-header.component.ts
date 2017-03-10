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
    gameSubscription: Subscription;
    @Input() button: string;
    @Input() buttonLoading: boolean;
    @Output() onClick: EventEmitter<any> = new EventEmitter();

    constructor(
        private activatedRoute: ActivatedRoute,
        private gameService: GameService,
    ) { }

    ngOnInit() {
        this.pin = this.activatedRoute.snapshot.params['pin'];
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
        }
    }

    roundInProgress(state: GameState) {
        return state === GameState.RoundOneProgress ||
            state === GameState.RoundTwoProgress ||
            state === GameState.RoundThreeProgress;
    }

}
