import { SessionService } from './../../services/session.service';
import { ApiService } from './../../services/api.service';
import { Subscription } from 'rxjs/Subscription';
import { GameService } from './../../services/game.service';
import { ActivatedRoute } from '@angular/router';
import { Component, OnInit, OnDestroy } from '@angular/core';
import 'rxjs/add/operator/first';
import { GameState } from "../../game-model";

const housePicture = 'homegrown-bullshit.png';

@Component({
    selector: 'app-reveal-the-truth',
    templateUrl: './reveal-the-truth.component.html',
    styleUrls: ['./reveal-the-truth.component.scss']
})
export class RevealTheTruthComponent implements OnInit, OnDestroy {
    pin: string;
    presenter: boolean;
    displayAnswers: DisplayItem[];
    displayIndex: number;
    displayInterval;
    rtl: boolean;

    constructor(
        private activatedRoute: ActivatedRoute,
        private gameService: GameService,
        private apiService: ApiService,
        private sessionService: SessionService,
    ) { }

    ngOnInit() {
        this.pin = this.activatedRoute.snapshot.params['pin'];
        this.presenter = !!this.sessionService.presenter;
        this.gameService.register(this.pin);
        this.apiService.getGameLocale(this.pin).then(locale => this.rtl = locale === 'he');
        this.createDisplayAnswers().then(displayArray => {
            console.log('displayArray', displayArray);
            this.displayAnswers = displayArray;
            this.show();
        });
    }

    ngOnDestroy() {
        this.gameService.unregister(this.pin);

        if (this.displayInterval) {
            clearInterval(this.displayInterval);
        }
    }

    show() {
        this.displayIndex = 0;
        this.displayInterval = setInterval(() => {
            if (this.displayIndex < this.displayAnswers.length - 1) {
                this.displayIndex += 1;
            } else {
                this.apiService.tick(this.pin, GameState.ScoreBoard);
            }
        }, 7000);
    }

    async createDisplayAnswers() {
        const { players, answers, answerSelections } = await this.apiService.getAggregatedAnswers(this.pin);
        const answersArray = Object.keys(answers).map(k => Object.assign({}, { pid: k }, answers[k]));
        const answerSelectionsArray = Object.keys(answerSelections).map(k => Object.assign({}, { pid: k }, answerSelections[k]));
        const res: DisplayItem[] = [];

        answersArray.forEach(answer => {
            if (res.find(w => w.text === answer.text)) {
                return;
            }

            const answerSelection = answerSelectionsArray.filter(a => a.text === answer.text);
            const selectors = answerSelection.map(a => players[a.pid].nickname);

            if (!selectors.length) {
                return;
            }

            const creators = answersArray
                .filter(a => a.text === answer.text)
                .map(a => a.houseLie || a.realAnswer ? '' : players[a.pid].nickname);
            const points = (answer.realAnswer || answer.houseLie) ? answerSelection[0].score : answer.score;
            const text = answer.text;
            const realAnswer = answer.realAnswer;
            const houseLie = answer.houseLie;

            res.push({ creators, selectors, points, text, realAnswer, houseLie });
        });

        const realAnswer = res.find(i => i.realAnswer);
        const fakeAnswers = res.filter(i => !i.realAnswer);

        return [...fakeAnswers, realAnswer];
    }
}

interface DisplayItem {
    text: string;
    selectors: string[];
    creators: string[];
    realAnswer: boolean;
    houseLie: boolean;
    points: number;
}
