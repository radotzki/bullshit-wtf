import { Subscription } from 'rxjs/Subscription';
import { SessionService } from './../../services/session.service';
import { Howl } from 'howler';
import { GameService } from './../../services/game.service';
import { ApiService } from './../../services/api.service';
import { ActivatedRoute } from '@angular/router';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CrewService } from './../../services/crew.service';
import { reportError } from './../../sentry/sentry.module';
import { Highlight, Highlights, finalPlaces } from './../../game-model';
import { finalStrings, FinalStrings } from './final-strings';

export interface FinalPlayer {
    nickname: string;
    score: number;
    picture: string;
    place: number;
    me: boolean;
    best?: Highlight;
    biggest?: boolean;
}

@Component({
    selector: 'app-score-board-final',
    templateUrl: './score-board-final.component.html',
    styleUrls: ['./score-board-final.component.scss']
})
export class ScoreBoardFinalComponent implements OnInit, OnDestroy {
    pin: string;
    loading: boolean;
    forkGameSubscription: Subscription;
    displayPlayers: FinalPlayer[];
    winners: FinalPlayer[] = [];
    mine: FinalPlayer;
    locale = 'en';
    t: FinalStrings = finalStrings.en;
    wholeGame: boolean;
    confetti = Array.from({ length: 28 }, (_, i) => i);
    sound: Howl;
    presenter: boolean;
    // Saved crews: this game's crew, or the form to save one.
    crewId: string;
    crewName: string;
    naming: boolean;
    newCrewName = '';
    savingCrew: boolean;
    crewError: string;
    crewSubscription: Subscription;
    myNickname: string;

    constructor(
        private activatedRoute: ActivatedRoute,
        private gameService: GameService,
        private apiService: ApiService,
        private sessionService: SessionService,
        private crewService: CrewService,
    ) { }

    ngOnInit() {
        this.pin = this.activatedRoute.snapshot.params['pin'];
        this.presenter = !!this.sessionService.presenter;
        this.gameService.register(this.pin);
        this.playMusic();
        Promise.all([
            this.apiService.getPlayers(this.pin),
            // The final screen still works for games that ended before highlights were kept.
            this.apiService.getHighlights(this.pin).catch(() => null),
            this.apiService.getHighlightsFrom(this.pin).catch(() => null),
            this.apiService.getGameLocale(this.pin).catch(() => 'en'),
        ]).then(([resp, highlights, from, locale]) => {
            // The words are in the game's language from the first paint.
            this.locale = locale === 'he' ? 'he' : 'en';
            this.t = finalStrings[this.locale];
            // "Nobody fell for their lies" only when every round was counted.
            this.wholeGame = from === 0;
            resp = resp || {};
            const user = !this.presenter && this.sessionService.user;
            const mine = user && resp[user.pid];
            // The nickname as typed (the session keeps it lower-cased), for the crew's "this is me".
            this.myNickname = mine ? mine.nickname : (user ? user.nickname : undefined);
            if (this.crewId) {
                this.crewService.remember(this.crewId, this.crewName, this.myNickname);
            }
            this.setPlayers(resp, highlights || {}, user ? user.pid : undefined);
        });

        this.crewSubscription = this.apiService.getGameCrewObservable(this.pin).subscribe(id => this.onCrew(id));

        this.forkGameSubscription = this.apiService.getForkGame(this.pin).subscribe(async fork => {
            if (fork) {
                if (!this.presenter) {
                    await this.apiService.signInAnonymously(fork, this.sessionService.user.nickname, 'replay');
                }

                this.gameService.unregister();
                this.gameService.register(fork);
            }
        });
    }

    ngOnDestroy() {
        this.forkGameSubscription.unsubscribe();
        this.crewSubscription.unsubscribe();

        if (this.sound) {
            this.sound.fade(1, 0, 1000);
            setTimeout(this.sound.stop, 1000);
        }
    }

    private setPlayers(resp, highlights: Highlights, myPid: string) {
        const players = Object.keys(resp)
            .map((pid, i) => ({
                pid,
                nickname: resp[pid].nickname,
                score: resp[pid].score || 0,
                picture: `avatar${i}.png`,
                best: highlights[pid] && highlights[pid].text ? highlights[pid] : undefined,
            }))
            .sort((a, b) => b.score - a.score);
        const places = finalPlaces(players.map(p => p.score));
        const mostFooled = Math.max(0, ...players.map(p => p.best ? p.best.total || 0 : 0));
        const biggest = players.filter(p => p.best && (p.best.total || 0) === mostFooled);

        this.displayPlayers = players.map((p, i) => ({
            nickname: p.nickname,
            score: p.score,
            picture: p.picture,
            place: places[i],
            me: !!myPid && p.pid === myPid,
            best: p.best,
            // One clear "biggest bullshitter": nobody gets it on a tie.
            biggest: mostFooled > 0 && biggest.length === 1 && biggest[0].pid === p.pid,
        }));
        this.winners = this.displayPlayers.filter(p => p.place === 1);
        this.mine = this.displayPlayers.find(p => p.me);
    }

    get rtl() {
        return this.locale === 'he';
    }

    get headline() {
        if (this.winners.length === 1) {
            return this.t.wins(this.winners[0].nickname);
        }
        return this.winners.length ? this.t.tie : this.t.gameOver;
    }

    get tiedNames() {
        const names = this.winners.map(p => p.nickname);
        if (names.length < 2) {
            return '';
        }
        const last = names[names.length - 1];
        // Hebrew joins "and" to the name: "דני ויוסי", but "דני ו-Joe" before a name in Latin letters.
        const and = this.rtl ? (/^[\u0590-\u05FF]/.test(last) ? ' ו' : ' ו-') : ` ${this.t.and} `;
        return names.slice(0, -1).join(', ') + and + last;
    }

    get myLine() {
        if (!this.mine || this.displayPlayers.length < 2) {
            return '';
        }
        if (this.mine.place === 1) {
            return this.winners.length > 1 ? this.t.youTied : this.t.youWon;
        }
        return this.t.yourPlace(this.mine.place, this.displayPlayers.length);
    }

    replay() {
        this.loading = true;
        this.apiService.fork(this.pin).catch(err => {
            this.loading = false;
            reportError(err, 'fork', { pin: this.pin });
        });
    }

    private async onCrew(id: string) {
        this.crewId = id || undefined;
        if (!id) {
            return;
        }
        this.naming = false;
        const crew = await this.apiService.getCrew(id);
        this.crewName = crew ? crew.name : '';
        this.crewService.remember(id, this.crewName, this.myNickname);
    }

    startNaming() {
        this.naming = true;
        this.crewError = '';
    }

    async saveCrew() {
        const name = (this.newCrewName || '').trim();
        if (!name || this.savingCrew) {
            return;
        }
        this.savingCrew = true;
        this.crewError = '';
        try {
            const crew = await this.apiService.createCrew(this.pin, name);
            // The game's crew field updates too; this just makes it show at once.
            await this.onCrew(crew.id);
        } catch (err) {
            this.crewError = (err && err.message) || this.t.crewError;
            reportError(err, 'createCrew', { pin: this.pin });
        }
        this.savingCrew = false;
    }

    playMusic() {
        if (this.presenter) {
            this.sound = new Howl({
                src: ['/assets/sounds/final.mp3'],
                autoplay: true,
                loop: true,
            });
        }
    }
}
