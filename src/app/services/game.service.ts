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
            this.registeredGames[pin] = this.apiService.game(pin).subscribe(this.handleGameState.bind(this));
        }
    }

    unregister(pin: string) {
        if (pin && this.registeredGames[pin]) {
            this.registeredGames[pin].unsubscribe();
            this.registeredGames[pin] = undefined;
        }
    }

    private handleGameState(game: Game) {
        if (game.state === GameState.GameStaging) {
            this.router.navigate(['game-staging', game.pin]);
        } else if (game.state === GameState.RoundIntro) {
            let round;

            if (game.currentQ === 0) {
                round = 'one';
            } else if (game.currentQ !== game.totalQ) {
                round = 'two';
            } else {
                round = 'three';
            }

            this.router.navigate(['round-intro', game.pin, round]);
        } else if (game.state === GameState.ShowQuestion) {
            this.router.navigate(['show-question', game.pin]);
        } else if (game.state === GameState.ShowAnswers) {
            this.router.navigate(['show-answers', game.pin]);
        } else if (game.state === GameState.RevealTheTruth) {
            this.router.navigate(['reveal-the-truth', game.pin]);
        } else if (game.state === GameState.ScoreBoard) {
            this.router.navigate(['score-board', game.pin]);
        } else if (game.state === GameState.ScoreBoardFinal) {
            this.router.navigate(['score-board-final', game.pin]);
        }
    }
}
