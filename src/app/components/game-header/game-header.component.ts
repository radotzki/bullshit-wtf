import { ApiService } from './../../services/api.service';
import { SessionService } from './../../services/session.service';
import { ActivatedRoute } from '@angular/router';
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
    ) { }

    ngOnInit() {
        this.loading = true;
        this.pin = this.activatedRoute.snapshot.params['pin'];
        this.presenter = !!this.sessionService.presenter;
        this.gameSubscription = this.apiService.game(this.pin).subscribe(this.onGameChange.bind(this));
    }

    ngOnDestroy() {
        this.gameSubscription.unsubscribe();
    }

    onGameChange(game) {
        if (game.state === GameState.RoundIntro) {
            if (game.currentQ === 0) {
                this.text = 'ROUND 1';
            } else if (game.currentQ !== game.totalQ) {
                this.text = 'ROUND 2';
            } else {
                this.text = 'ROUND 3';
            }
        } else if (game.state === GameState.GameStaging && this.presenter) {
            this.registration = true;
        } else if (game.state === GameState.ScoreBoardFinal) {
            this.gameOver = true;
        } else if ([GameState.ShowQuestion, GameState.ShowAnswers, GameState.RevealTheTruth].includes(game.state)) {
            this.text = `${game.currentQ + 1} OF ${game.totalQ}`;
        }

        this.loading = false;
    }
}
