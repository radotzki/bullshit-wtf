import { GameScheme, GameState } from './../game-model';
import { environment } from './../../environments/environment';
import { ApiService } from './api.service';
import { Router } from '@angular/router';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/operator/do';
import 'rxjs/add/observable/fromEvent';
import 'rxjs/add/observable/merge';
import 'rxjs/add/observable/of';
import 'rxjs/add/observable/fromPromise';

const durations = {
    [GameState.RoundIntro]: 5000,
    [GameState.ShowQuestion]: 30000,
    [GameState.ShowAnswers]: 30000,
    [GameState.ScoreBoard]: 5000,
};

@Injectable()
export class GameService {
    private registeredGames = {};
    private registeredTimeout = {};

    constructor(
        private router: Router,
        private apiService: ApiService,
    ) { }

    register(pin: string) {
        if (!this.registeredGames[pin]) {
            this.registeredGames[pin] =
                this.apiService.gameState(pin).subscribe(state => this.handleGameState(pin, state));
        }
    }

    unregister(pin: string) {
        if (pin && this.registeredGames[pin]) {
            this.registeredGames[pin].unsubscribe();
            this.registeredGames[pin] = undefined;
            clearTimeout(this.registeredTimeout[pin]);
            this.registeredTimeout[pin] = undefined;
        }
    }

    private handleGameState(pin: string, state: GameState) {
        switch (state) {
            case GameState.GameStaging:
                this.router.navigate(['game-staging', pin]);
                break;

            case GameState.RoundIntro:
                this.router.navigate(['round-intro', pin]);
                this.tick(pin, GameState.ShowQuestion, durations[GameState.RoundIntro]);
                break;

            case GameState.ShowQuestion:
                this.router.navigate(['show-question', pin]);
                this.tick(pin, GameState.ShowAnswers, durations[GameState.ShowQuestion]);
                break;

            case GameState.ShowAnswers:
                this.router.navigate(['show-answers', pin]);
                this.tick(pin, GameState.RevealTheTruth, durations[GameState.ShowAnswers]);
                break;

            case GameState.RevealTheTruth:
                this.router.navigate(['reveal-the-truth', pin]);
                break;

            case GameState.ScoreBoard:
                this.router.navigate(['score-board', pin]);
                this.tick(pin, GameState.ShowQuestion, durations[GameState.ScoreBoard]);
                break;

            case GameState.ScoreBoardFinal:
                this.router.navigate(['score-board-final', pin]);
                break;
        }
    }

    private tick(pin: string, nextState: GameState, duration: number) {
        this.apiService.getGameTimestamp(pin).then(({ timestamp, now }) => {
            const timeRemain = duration - (now - timestamp);
            this.registeredTimeout[pin] = setTimeout(() => this.apiService.tick(pin, nextState), timeRemain);
        });
    }
}
