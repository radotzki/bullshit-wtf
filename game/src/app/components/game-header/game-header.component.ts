import { GameService } from './../../services/game.service';
import { ApiService } from './../../services/api.service';
import { SessionService } from './../../services/session.service';
import { ActivatedRoute, Router } from '@angular/router';
import { Component, OnInit, OnDestroy, Input, Output, EventEmitter } from '@angular/core';
import { Subscription } from 'rxjs/Subscription';
import { GameState } from './../../game-model';

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
        private sessionService: SessionService,
        private apiService: ApiService,
        private router: Router,
        private gameService: GameService,
    ) { }

    ngOnInit() {
        this.loading = true;
        this.pin = this.activatedRoute.snapshot.params['pin'];
        this.presenter = !!this.sessionService.presenter;
        this.gameSubscription = this.apiService.gameState(this.pin).subscribe(this.onGameChange.bind(this));
    }

    ngOnDestroy() {
        this.gameSubscription.unsubscribe();
    }

    onGameChange(state: GameState) {
        switch (state) {
            case GameState.GameStaging:
                this.registration = true;
                break;

            case GameState.RoundIntro:
                this.getCurrentRoundIndex();
                break;

            case GameState.ShowQuestion:
                this.getCurrentQuestionIndex();
                break;

            case GameState.ShowAnswers:
                this.getCurrentQuestionIndex();
                break;

            case GameState.RevealTheTruth:
                this.getCurrentQuestionIndex();
                break;

            case GameState.ScoreBoardFinal:
                this.gameOver = true;
                break;
        }

        this.loading = false;
    }

    getCurrentQuestionIndex() {
        const qidxPromise = this.apiService.getQuestionIndex(this.pin);
        const totalQPromise = this.apiService.getTotalQuestions(this.pin);

        Promise
            .all([qidxPromise, totalQPromise])
            .then(([qidx, totalQ]) => this.text = `${qidx + 1} OF ${totalQ}`);
    }

    getCurrentRoundIndex() {
        this.apiService.getRoundIndex(this.pin).then(ridx => this.text = `ROUND ${ridx + 1}`);
    }

    home() {
        this.gameService.unregister();
        this.router.navigate(['/']);
    }
}
