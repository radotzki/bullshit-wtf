import { environment } from './../../environments/environment';
import { ApiService } from './api.service';
import { Router } from '@angular/router';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/operator/do';
import 'rxjs/add/observable/fromEvent';
import 'rxjs/add/observable/merge';
import * as io from 'socket.io-client';
import { GameState, Game, Question, QuestionState } from '../models';

@Injectable()
export class GameService {
    private registeredGames = {};
    private cache = {};
    private socket;

    constructor(
        private router: Router,
        private apiService: ApiService,
    ) { }

    feed(pin: string): Observable<Game> {
        if (!this.socket) {
            this.socket = io(environment.server);
        }

        const gameStrim = Observable
            .fromEvent(this.socket, 'game:' + pin.toLowerCase() + ':feed')
            .map((res: string) => JSON.parse(res))
            .map(res => res.new_val as Game)
            .do(game => this.cache[game.name] = Promise.resolve(game));

        const game = Observable.fromPromise(this.getGameFromCache(pin));

        return Observable.merge(game, gameStrim)
            .map(resp => {
                resp.currentQuestion = this.findCurrentQuestion(resp);
                return resp;
            });
    }

    register(pin: string) {
        if (!this.registeredGames[pin]) {
            this.registeredGames[pin] = this.feed(pin).subscribe(this.handleGameState.bind(this));
        }
    }

    unregister(pin: string) {
        if (pin) {
            this.registeredGames[pin].unsubscribe();
            this.registeredGames[pin] = undefined;
        }
    }

    private handleQuestionState(game: Game) {
        if (game.currentQuestion) {
            if (game.currentQuestion.state === QuestionState.ShowQuestion) {
                this.router.navigate(['show-question', game.name]);
            } else if (game.currentQuestion.state === QuestionState.ShowAnswers) {
                this.router.navigate(['show-answers', game.name]);
            } else if (game.currentQuestion.state === QuestionState.RevealTheTruth) {
                this.router.navigate(['RevealTheTruth', game.name]);
            } else if (game.currentQuestion.state === QuestionState.ScoreBoard) {
                this.router.navigate(['ScoreBoard', game.name]);
            }
        }
    }

    private findCurrentQuestion(game: Game): Question {
        const questionsArray: Question[] = Object.keys(game.questions).map(key =>
            Object.assign({}, game.questions[key], { questionNumber: Number(key) })
        );
        return questionsArray.find(question => question.state !== QuestionState.Pending && question.state !== QuestionState.End);
    }

    private handleGameState(game) {
        if (game.childGame) {
            this.router.navigate(['game-staging', game.childGame]);
        } else if (game.state === GameState.Registration) {
            this.router.navigate(['game-staging', game.name]);
        } else if (game.state === GameState.RoundOneProgress ||
            game.state === GameState.RoundTwoProgress ||
            game.state === GameState.RoundThreeProgress) {
            this.handleQuestionState(game);
        } else if (game.state === GameState.RoundOneIntro) {
            this.router.navigate(['round-intro', game.name, 'one']);
        } else if (game.state === GameState.RoundTwoIntro) {
            this.router.navigate(['round-intro', game.name, 'two']);
        } else if (game.state === GameState.RoundThreeIntro) {
            this.router.navigate(['round-intro', game.name, 'three']);
        } else if (game.state === GameState.GameOver) {
            this.router.navigate(['ScoreBoardFinal', game.name]);
        }
    }

    private getGameFromCache(pin: string): Promise<Game> {
        if (!this.cache[pin]) {
            this.cache[pin] = this.apiService.getGame(pin);
        }

        return this.cache[pin];
    }
}
