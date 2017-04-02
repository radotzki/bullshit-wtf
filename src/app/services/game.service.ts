import { GameScheme } from './../../../game-model';
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
import { GameState, Game } from '../models';

@Injectable()
export class GameService {
    private registeredGames = {};

    constructor(
        private router: Router,
        private apiService: ApiService,
    ) { }

    register(pin: string) {
        if (!this.registeredGames[pin]) {
            this.registeredGames[pin] = this.apiService.game(pin).subscribe((game) => this.handleGameState(pin, game));
        }
    }

    unregister(pin: string) {
        if (pin && this.registeredGames[pin]) {
            this.registeredGames[pin].unsubscribe();
            this.registeredGames[pin] = undefined;
        }
    }

    private handleGameState(pin: string, game: GameScheme) {
        if (game.state.id === GameState.GameStaging) {
            this.router.navigate(['game-staging', pin]);
        } else if (game.state.id === GameState.RoundIntro) {
            let round;

            if (game.roundIndex === 0) {
                round = 'one';
            } else if (game.roundIndex === 1) {
                round = 'two';
            } else {
                round = 'three';
            }

            this.router.navigate(['round-intro', pin, round]);
        } else if (game.state.id === GameState.ShowQuestion) {
            this.router.navigate(['show-question', pin]);
        } else if (game.state.id === GameState.ShowAnswers) {
            this.router.navigate(['show-answers', pin]);
        } else if (game.state.id === GameState.RevealTheTruth) {
            this.router.navigate(['reveal-the-truth', pin]);
        } else if (game.state.id === GameState.ScoreBoard) {
            this.router.navigate(['score-board', pin]);
        } else if (game.state.id === GameState.ScoreBoardFinal) {
            this.router.navigate(['score-board-final', pin]);
        }
    }
}
