import { Howl } from 'howler';
import { SessionService } from './../../services/session.service';
import { ApiService } from './../../services/api.service';
import { Subscription } from 'rxjs/Subscription';
import { GameService } from './../../services/game.service';
import { ActivatedRoute } from '@angular/router';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { GameState, GamePlayer } from '../../game-model';

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
    showCreators: boolean;
    sound: Howl;

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
            this.displayAnswers = displayArray;
            this.show();
        });
    }

    ngOnDestroy() {
        this.stopMusic();
        if (this.displayInterval) {
            clearInterval(this.displayInterval);
        }
    }

    show() {
        this.displayIndex = 0;
        this.showCreators = false;
        setTimeout(this.revealCreators.bind(this), 3000);

        this.displayInterval = setInterval(() => {
            if (this.displayIndex < this.displayAnswers.length - 1) {
                this.showCreators = false;
                setTimeout(this.revealCreators.bind(this), 3000);
                this.displayIndex += 1;
            } else {
                this.apiService.tick(this.pin, GameState.ScoreBoard);
            }
        }, 7000);
    }

    async createDisplayAnswers() {
        const { players, answers, answerSelections } = await this.apiService.getAggregatedAnswers(this.pin);
        const playersArray = Object.keys(players || {}).map(k => Object.assign({}, { pid: k }, players[k]));
        const answersArray = Object.keys(answers || {}).map(k => Object.assign({}, { pid: k }, answers[k]));
        const answerSelectionsArray = Object.keys(answerSelections || {}).map(k => Object.assign({}, { pid: k }, answerSelections[k]));
        const displayItems: DisplayItem[] = [];

        answersArray.forEach(answer => {
            const answerSelection = answerSelectionsArray.filter(a => a.text === answer.text);
            const selectors = answerSelection.map(a => this.playerObject(playersArray, a.pid));
            const text = answer.text;
            const realAnswer = answer.realAnswer;
            const houseLie = answer.houseLie;
            const creators = answersArray
                .filter(a => a.text === answer.text)
                .map(a => a.houseLie || a.realAnswer ? {} : this.playerObject(playersArray, a.pid));
            let points = 0;

            if (displayItems.find(w => w.text === answer.text) ||
                (!selectors.length && !answer.realAnswer)) {
                return;
            }

            if ((answer.realAnswer || answer.houseLie) && answerSelection[0]) {
                points = answerSelection[0].score;
            } else {
                points = answer.score;
            }

            displayItems.push({ creators, selectors, points, text, realAnswer, houseLie });
        });

        return displayItems.sort((a, b) => a.text > b.text ? 1 : -1).sort(a => a.realAnswer ? 1 : -1);
    }

    private playerObject(playersArray: (GamePlayer & { pid: string })[], pid: string) {
        return {
            nickname: playersArray.find(p => p.pid === pid).nickname,
            picture: `avatar${playersArray.findIndex(p => p.pid === pid)}.png`,
        };
    }

    private revealCreators() {
        const sound = this.getSound(this.displayAnswers[this.displayIndex]);
        this.showCreators = true;
        this.playMusic([`/assets/sounds/${sound}.mp3`]);
    }

    private getSound(item: DisplayItem) {
        if (item.realAnswer) {
            return 'the-truth';
        } else if (item.houseLie) {
            return `house-lie-${Math.round(Math.random())}`;
        } else {
            return `player-lie-${Math.round(Math.random())}`;
        }
    }

    private playMusic(src: string[]) {
        if (this.presenter) {
            this.stopMusic();
            this.sound = new Howl({ src, autoplay: true });
        }
    }

    private stopMusic() {
        if (this.sound) {
            this.sound.stop();
        }
    }

}


interface DisplayItem {
    text: string;
    selectors: { nickname: string, picture: string }[];
    creators: { nickname?: string, picture?: string }[];
    realAnswer: boolean;
    houseLie: boolean;
    points: number;
}
