import { SessionService } from './../../services/session.service';
import { ApiService } from './../../services/api.service';
import { GameService } from './../../services/game.service';
import { ActivatedRoute } from '@angular/router';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Howl } from 'howler';
import { gameStrings, GameStrings } from './../game-strings';
import { isFinalQuestion, standing, gapLine, Standing } from './final-question';

const roundPoints = [
    { truth: 1000, bullshit: 500 },
    { truth: 1500, bullshit: 750 },
    { truth: 2000, bullshit: 1000 },
];

@Component({
    selector: 'app-round-intro',
    templateUrl: './round-intro.component.html',
    styleUrls: ['./round-intro.component.scss']
})
export class RoundIntroComponent implements OnInit, OnDestroy {
    pin: string;
    presenter: boolean;
    points: { truth?: number, bullshit?: number } = {};
    t: GameStrings = gameStrings('en');
    /** Everything this card shows has been read: until then its middle stays empty. */
    ready = false;
    /** The question that follows is the game's last. */
    final = false;
    private standing: Standing = null;
    private sound: Howl;

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
        this.t = gameStrings(this.apiService.knownGameLocale(this.pin));
        this.apiService.getGameLocale(this.pin).then(locale => this.t = gameStrings(locale), () => null);

        // A number that cannot be read is null: the card then shows less, never a wrong or missing number.
        const orNull = <T>(reading: Promise<T>): Promise<T> => Promise.resolve(reading).then(v => v, () => null);
        // Asked for at once, and waited for only before the last question.
        const players = orNull(this.apiService.getPlayers(this.pin));

        Promise.all([
            orNull(this.apiService.getRoundIndex(this.pin)),
            orNull(this.apiService.getQuestionIndex(this.pin)),
            orNull(this.apiService.getTotalQuestions(this.pin)),
        ]).then(([roundIndex, questionIndex, totalQ]) => {
            this.points = roundPoints[roundIndex] || {};

            if (!isFinalQuestion(questionIndex, totalQ)) {
                this.ready = true;
                return;
            }

            return players.then(read => {
                const user = this.presenter ? null : this.sessionService.user;
                this.standing = standing(read, user ? user.pid : undefined);
                this.final = true;
                this.ready = true;
                this.playSting();
            });
        });
    }

    ngOnDestroy() {
        if (this.sound) {
            this.sound.stop();
        }
    }

    /** The two points lines show only once the round's points are read, never with a missing number. */
    get pointsKnown(): boolean {
        return this.points.truth > 0 && this.points.bullshit > 0;
    }

    /** How far first place is ahead, in the game's language. Empty with one player. */
    get gap(): string {
        return gapLine(this.standing, this.t);
    }

    /** The room's screen marks the last question with the sound of the truth; phones stay silent. */
    private playSting() {
        if (this.presenter) {
            this.sound = new Howl({ src: ['/assets/sounds/the-truth.mp3'], autoplay: true });
        }
    }

}
