import * as Raven from 'raven-js';
import { ApiService } from './../../services/api.service';
import { SessionService } from './../../services/session.service';
import { GameService } from './../../services/game.service';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs/Subscription';
import { Game, QuestionState, Question, Answer } from './../../models';
import { Component, OnInit, OnDestroy } from '@angular/core';

@Component({
    selector: 'app-show-answers',
    templateUrl: './show-answers.component.html',
    styleUrls: ['./show-answers.component.scss']
})
export class ShowAnswersComponent implements OnInit, OnDestroy {
    gameSubscription: Subscription;
    pin: string;
    presenter: boolean;
    loading: boolean;
    errorMsg: string;
    game: Game;
    elapsedTime: number;
    elapsedTimeInterval;
    answerSelected: boolean;
    displayAnswers: Answer[];
    showQuestion: boolean;

    constructor(
        private activatedRoute: ActivatedRoute,
        private gameService: GameService,
        private sessionService: SessionService,
        private apiService: ApiService,
    ) { }

    ngOnInit() {
        this.pin = this.activatedRoute.snapshot.params['pin'];
        this.gameSubscription = this.gameService.feed(this.pin).subscribe(this.onGameChanged.bind(this));
        this.gameService.register(this.pin);
        this.presenter = !!this.sessionService.presenter;
    }

    ngOnDestroy() {
        this.gameService.unregister(this.pin);
        this.gameSubscription.unsubscribe();

        if (this.elapsedTimeInterval) {
            clearInterval(this.elapsedTimeInterval);
        }
    }

    onGameChanged(resp: Game) {
        this.game = resp;

        if (!this.elapsedTime) {
            this.initElapsedTime();
        }

        if (!this.displayAnswers) {
            this.displayAnswers = this.getDisplayAnswers(this.game.currentQuestion, this.game.players.length);
        }

        this.answerSelected = !this.presenter && this.checkAnswerSelected(this.game, this.sessionService.user.id);
    }

    submit(answer: string) {
        this.loading = true;
        this.errorMsg = '';

        this.apiService.chooseAnswer(this.pin, answer)
            .then(() => {
                this.answerSelected = true;
                this.loading = false;
            })
            .catch(err => {
                this.loading = false;
                Raven.captureException(new Error(JSON.stringify(err)));
                this.errorMsg = 'oops, something went wrong. Please try again';
            });
    }

    checkAnswerSelected(game: Game, uid: string) {
        const allAnswers = [...game.currentQuestion.fakeAnswers, game.currentQuestion.realAnswer];
        return !!allAnswers.find(answer => answer.selectedBy.indexOf(uid) > -1);
    }

    tick() {
        this.apiService.tick(this.pin, QuestionState.ShowAnswers);
    }

    initElapsedTime() {
        this.elapsedTime = this.calcElapsedTime(this.game);
        this.elapsedTimeInterval = setInterval(() => {
            if (this.elapsedTime >= this.game.selectAnswerTime) {
                this.tick();
            } else {
                this.elapsedTime += 1;
            }
        }, 1000);
    }

    calcElapsedTime(game: Game) {
        const currentTime = game.currentTime;
        const startedAt = game.currentQuestion.startedAt;
        return Math.round(this.timeDiff(currentTime, startedAt) / 1000);
    }

    timeDiff(from, to): number {
        const toTime = new Date(to);
        const fromTime = new Date(from);
        return Math.abs(fromTime.getTime() - toTime.getTime());
    }

    getDisplayAnswers(question: Question, numOfPlayers: number) {
        const answersCount = this.presenter ? numOfPlayers + 1 : numOfPlayers;
        const houseAnswers = question.fakeAnswers.filter(this.isHouseAnswer.bind(this));
        let displayAnswers = question.fakeAnswers.filter(answer => {
            const myAnswer = !this.sessionService.presenter && answer.createdBy.indexOf(this.sessionService.user.id) > -1;
            const houseAnswer = this.isHouseAnswer(answer);
            return !myAnswer && !houseAnswer;
        });
        const missingAnswersCount = answersCount - 1 - displayAnswers.length;
        const houseAnswersToAdd = houseAnswers.splice(0, missingAnswersCount);

        displayAnswers = [...displayAnswers, ...houseAnswersToAdd];
        displayAnswers.push(question.realAnswer);

        displayAnswers = [...displayAnswers].sort((a, b) => a.text < b.text ? -1 : 1);
        return displayAnswers;
    }

    isHouseAnswer(answer: Answer) {
        return answer.createdBy.length === 1 && answer.createdBy[0] === 'house';
    }

}
