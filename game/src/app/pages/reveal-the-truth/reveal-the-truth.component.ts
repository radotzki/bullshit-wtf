import { Howl } from 'howler';
import { SessionService } from './../../services/session.service';
import { ApiService } from './../../services/api.service';
import { Subscription } from 'rxjs/Subscription';
import { GameService } from './../../services/game.service';
import { ActivatedRoute } from '@angular/router';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { GameState, GamePlayer, RevealAnswer } from '../../game-model';

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
        const revealAnswers = await this.apiService.getRevealAnswers(this.pin);
        const players = await this.apiService.getPlayers(this.pin);
        const playersArray = Object.keys(players || {}).map(k => Object.assign({ pid: k }, players[k]));
        const displayItems: DisplayItem[] = [];

        revealAnswers
            .filter(a => a.selectors || a.realAnswer)
            .forEach(answer => {
                const displaySelectors = answer.selectors.map(s => this.playerObject(playersArray, s));
                const displayCreators = answer.creators.filter(c => c).map(c => this.playerObject(playersArray, c));
                displayItems.push(Object.assign(answer, { displaySelectors, displayCreators }));
            });

        return displayItems;
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

interface DisplayItem extends RevealAnswer {
    displaySelectors: { nickname: string, picture: string }[];
    displayCreators: { nickname?: string, picture?: string }[];
}
