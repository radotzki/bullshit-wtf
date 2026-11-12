import { Howl } from 'howler';
import { SessionService } from './../../services/session.service';
import { ApiService } from './../../services/api.service';
import { SoundService } from './../../services/sound.service';
import { Subscription } from 'rxjs/Subscription';
import { GameService } from './../../services/game.service';
import { ActivatedRoute } from '@angular/router';
import { Component, OnInit, OnDestroy, ElementRef } from '@angular/core';
import {
    GamePlayer, GameState, RevealAnswer, RevealSchedule, Standing,
    revealSchedule, revealMoment, revealRowStart, revealScoreChanges, revealStandings, canLaugh, isLie, isPlayerLie,
} from '../../game-model';
import { gameStrings, GameStrings } from './../game-strings';
import { resultLines, stingFor } from './reveal-strings';
import { followScrollTop } from './reveal-follow';
import { laughView } from './reveal-laughs';

// How long "You fooled Chen!" covers the writer's phone, and how long after the last row the scores
// stand in their old order before they move to the new one (staged reveal only).
const FLASH_MS = 1200;
const SCORES_MOVE_AFTER_MS = 900;

/**
 * The reveal: the question stays on top, and the answers somebody picked appear one row at a time,
 * the truth last. Each row shows who picked it, then who wrote it. Players' lies nobody picked are no
 * timed rows: once all is shown they appear together, each in a row of its own. Then each player sees
 * their own result and can tap NEXT; once everyone has, the server moves on without waiting for the deadline.
 *
 * Laughs on lies: every lie, picked or not, a house lie too, has a laugh button on the phones of the
 * players who did not write it, so no row shows that the house wrote it before its writer beat. Tap as
 * many lies as you like, each once. The counts show beside each lie, on the big screen too, and arrive
 * live. Laughs give no points (see laughCount in the game model).
 *
 * Every phone works out what to show from the server's phase start time, so all screens stay in step
 * even if one loads late.
 *
 * Two versions, by the game's own flag (a 50/50 test, see bigReveal in game-model):
 *   - today's reveal;
 *   - the staged reveal: each row in three beats (the answer, who picked it, who wrote it), earlier rows
 *     fold down to one line, "And the truth is…" before the truth, a "You fooled …" flash on the writer's
 *     phone, sounds on phones, and at the end the scores with each player's change. Such a game has no
 *     separate scoreboard: this page stays up until the next question.
 * On a big screen both keep the newest row in view: earlier rows fold down, and the page follows it.
 */
@Component({
    selector: 'app-reveal-the-truth',
    templateUrl: './reveal-the-truth.component.html',
    styleUrls: ['./reveal-the-truth.component.scss']
})
export class RevealTheTruthComponent implements OnInit, OnDestroy {
    pin: string;
    presenter: boolean;
    rtl: boolean;
    t: GameStrings = gameStrings('en');
    question: string;
    staged = false;
    me: string = null;

    rows: Row[];
    unpicked: Row[] = [];
    myResult: string[] = [];

    visibleRows = 0;
    pickersShown = 0;
    writersShown = 0;
    truthIntro = false;
    allShown = false;

    // Staged reveal only.
    standings: Standing[] = [];
    scoresMoved = false;
    flash: string = null;
    flashOn = false;
    flashPoints: number = null;

    playersCount = 0;
    doneCount = 0;
    tapped = false;

    private schedule: RevealSchedule;
    private startedAt: number;       // server time the reveal began
    private clockOffset = 0;         // server time minus this phone's time
    private ticker;
    private soundsPlayed = 0;
    private myRow = -1;
    private buzzed = false;
    private phoneSound = false;
    private shownKey = '';
    private destroyed = false;
    private doneSub: Subscription;
    private laughSub: Subscription;
    // Laughs on lies: the server's laughs on each lie, and the lies this phone tapped (by the lie's text).
    private serverLaughs: { [text: string]: { [pid: string]: boolean } } = {};
    private myLaughs: { [text: string]: boolean } = {};
    private sound: Howl;

    constructor(
        private activatedRoute: ActivatedRoute,
        private gameService: GameService,
        private apiService: ApiService,
        private sessionService: SessionService,
        private soundService: SoundService,
        private element: ElementRef,
    ) { }

    ngOnInit() {
        this.pin = this.activatedRoute.snapshot.params['pin'];
        this.presenter = !!this.sessionService.presenter;
        this.gameService.register(this.pin);
        this.useLocale(this.apiService.knownGameLocale(this.pin));
        this.apiService.getQuestion(this.pin).then(q => this.question = q);
        // This player's result lines are written once, so the game's language is read first.
        this.apiService.getGameLocale(this.pin).then(locale => this.useLocale(locale), () => null).then(() => this.load());
    }

    private useLocale(locale: string) {
        this.rtl = locale === 'he';
        this.t = gameStrings(locale);
    }

    ngOnDestroy() {
        this.destroyed = true;
        this.stopMusic();
        clearInterval(this.ticker);

        if (this.doneSub) {
            this.doneSub.unsubscribe();
        }
        if (this.laughSub) {
            this.laughSub.unsubscribe();
        }
    }

    /** A laugh at a lie: counted here at once; if the server does not take it, it is taken back. */
    laugh(row: Row) {
        if (!row || !row.laughable || row.laughed) {
            return;
        }
        const text = row.text;
        this.myLaughs[text] = true;
        this.showLaughs();

        const undo = () => {
            delete this.myLaughs[text];
            this.showLaughs();
        };
        this.apiService.laugh(this.pin, text).then((r: { taken?: boolean }) => {
            if (!r || r.taken === false) {
                undo();
            }
        }, undo);
    }

    trackRow(index: number, row: Row) {
        return row.text;
    }

    next() {
        this.tapped = true;
        // If this fails (old database rules, network), the reveal still ends at its deadline.
        this.apiService.revealDone(this.pin).catch(() => undefined);
    }

    get waitingFor() {
        return Math.max(this.playersCount - this.doneCount, 0);
    }

    /** Many rows: the folded ones get smaller, so that nine still fit a big screen. */
    get manyRows() {
        return !!this.rows && this.rows.length > 5;
    }

    trackStanding(index: number, standing: Standing) {
        return standing.pid;
    }

    private async load() {
        const [revealAnswers, players, info, hasPresenter, staged] = await Promise.all([
            this.apiService.getRevealAnswers(this.pin),
            this.apiService.getPlayers(this.pin),
            this.apiService.getGameStateInfo(this.pin),
            this.apiService.gameHasPresenter(this.pin),
            this.apiService.isStagedReveal(this.pin),
        ]);

        if (this.destroyed) {
            return;
        }

        this.staged = staged;

        const playersArray = Object.keys(players || {}).map(k => Object.assign({ pid: k }, players[k]));
        const all = (revealAnswers || []).map(a => this.toRow(a, playersArray));

        // Picked lies first, the ones that fooled fewest people first, so the big ones come last; the truth always last.
        const picked = all.filter(r => r.pickers.length && !r.realAnswer)
            .sort((a, b) => a.pickers.length - b.pickers.length || (a.text > b.text ? 1 : -1));
        const truth = all.filter(r => r.realAnswer);
        this.rows = picked.concat(truth);
        this.unpicked = all.filter(r => !r.pickers.length && r.playerLie);
        this.playersCount = playersArray.length;

        const me = !this.presenter && this.sessionService.user ? this.sessionService.user.pid : null;
        this.me = me;

        // Laughs: this phone's player may laugh at every lie but their own, house lies included.
        (revealAnswers || []).forEach((a, i) => all[i].laughable = !!me && canLaugh(a, me));
        this.serverLaughs = {};
        (revealAnswers || []).forEach(a => {
            if (a && a.laughs) {
                this.serverLaughs[a.text] = a.laughs;
            }
        });
        this.showLaughs();
        this.laughSub = this.apiService.revealAnswersLive(this.pin).subscribe(live => this.onLaughs(live, revealAnswers));

        if (me) {
            this.myResult = resultLines(me, all, this.t);
        }

        this.schedule = revealSchedule(revealAnswers, !!hasPresenter, staged);
        this.clockOffset = info.now - Date.now();
        this.startedAt = info.state && info.state.timestamp || info.now;

        if (staged) {
            // The players' scores do not hold this question yet while the reveal is on; a phone that
            // loads this page a moment late may read them after the server has added it.
            const added = !info.state || info.state.id !== GameState.RevealTheTruth;
            this.standings = revealStandings(players, revealScoreChanges(revealAnswers), added);

            // The player's own lie, if it fooled somebody: its writer gets the flash.
            this.myRow = me ? this.rows.findIndex(r => !r.realAnswer && !r.houseLie && r.creatorIds.indexOf(me) !== -1) : -1;
            if (this.myRow !== -1) {
                this.flash = this.t.youFooled(this.t.names(this.rows[this.myRow].pickerNames));
                this.flashPoints = this.rows[this.myRow].points;
            }

            // A row whose sound moment has passed before this page loaded stays silent.
            const now = revealMoment(this.schedule, Date.now() + this.clockOffset - this.startedAt);
            this.soundsPlayed = Math.max(0, Math.min(this.rows.length, now.writersShown) - 1);
            // Phones play the stings and buzz only when no big screen does it for the room.
            this.phoneSound = !this.presenter && !hasPresenter;
            if (this.phoneSound) {
                this.soundService.arm();
            }
        }

        this.doneSub = this.apiService.revealDoneCount(this.pin).subscribe(count => this.doneCount = count);
        this.update();
        this.ticker = setInterval(() => this.update(), 100);
    }

    private update() {
        const elapsed = Date.now() + this.clockOffset - this.startedAt;
        const moment = revealMoment(this.schedule, elapsed);
        const count = this.rows.length;

        this.visibleRows = Math.min(count, moment.visibleRows);
        this.pickersShown = Math.min(count, moment.pickersShown);
        this.writersShown = Math.min(count, moment.writersShown);
        this.truthIntro = this.staged && moment.truthIntro;
        this.allShown = moment.allShown;

        // A sound for each writer as it is revealed: on the big screen always, on phones in the staged reveal.
        if (this.writersShown > this.soundsPlayed) {
            this.soundsPlayed = this.writersShown;
            const index = this.writersShown - 1;
            if (this.presenter) {
                this.playMusic([`/assets/sounds/${this.staged ? stingFor(this.rows[index], index) : this.getSound(this.rows[index])}.mp3`]);
            } else if (this.phoneSound) {
                this.soundService.play(stingFor(this.rows[index], index));
            }
        }

        if (this.staged) {
            this.scoresMoved = elapsed >= this.schedule.allShown + SCORES_MOVE_AFTER_MS;
            this.updateFlash(elapsed);
        }

        this.follow();

        // Today's reveal has nothing left to time once all is shown; the staged one still moves the scores.
        if (this.allShown && (!this.staged || this.scoresMoved)) {
            clearInterval(this.ticker);
        }
    }

    /** "You fooled Chen!" across the phone of the lie's writer, from the moment the room learns who wrote it. */
    private updateFlash(elapsed: number) {
        if (this.myRow === -1) {
            return;
        }
        const from = revealRowStart(this.schedule, this.myRow) + this.schedule.writerAt;
        const on = elapsed >= from && elapsed < from + FLASH_MS;
        this.flashOn = on;

        if (on && !this.buzzed && this.phoneSound) {
            this.buzzed = true;
            this.soundService.vibrate([60, 40, 120]);
        }
    }

    /**
     * Keep the newest thing in view: on a big screen (which nobody scrolls) whenever something appears,
     * and on a phone in the staged reveal, where the scores and NEXT arrive below the rows. On a phone
     * the truth row stays in view when the scores arrive: the page never goes down past its top.
     */
    private follow() {
        const key = [this.visibleRows, this.pickersShown, this.writersShown, this.truthIntro, this.allShown].join();
        if (key === this.shownKey) {
            return;
        }
        this.shownKey = key;

        if (!this.presenter && !this.staged) {
            return;
        }

        setTimeout(() => {
            const main: HTMLElement = this.element.nativeElement.querySelector('.game-main');
            if (!main) {
                return;
            }

            // Where the truth row starts in the scrolled content.
            const truth: Element = this.presenter ? null : main.querySelector('.srow.truth');
            let truthTop: number = null;
            if (truth) {
                truthTop = main.scrollTop + truth.getBoundingClientRect().top - main.getBoundingClientRect().top;
            }
            main.scrollTop = followScrollTop(main.scrollHeight, main.clientHeight, truthTop);
        });
    }

    /**
     * New laughs from the server. Only while the reveal this page shows is still there: when the game
     * moves on, the server clears the rows (or writes the next question's), and the counts stay as they were.
     */
    private onLaughs(live: RevealAnswer[], shown: RevealAnswer[]) {
        const list = Array.isArray(live) ? live : [];
        const same = list.length === (shown || []).length && list.every((a, i) => !!a && !!shown[i] && a.text === shown[i].text);
        if (!same) {
            return;
        }
        this.serverLaughs = {};
        list.forEach(a => {
            if (a.laughs) {
                this.serverLaughs[a.text] = a.laughs;
            }
        });
        this.showLaughs();
    }

    private showLaughs() {
        const me = this.me;
        (this.rows || []).concat(this.unpicked || []).forEach(row => {
            const view = laughView(this.serverLaughs[row.text], me, !!this.myLaughs[row.text]);
            row.laughs = row.lie ? view.count : 0;
            row.laughed = view.mine;
        });
    }

    private toRow(answer: RevealAnswer, playersArray: (GamePlayer & { pid: string })[]): Row {
        const pickers = (answer.selectors || []).map(pid => this.playerObject(playersArray, pid)).filter(p => p);
        const creators = (answer.creators || []).filter(c => c).map(pid => this.playerObject(playersArray, pid)).filter(p => p);
        return {
            text: answer.text,
            realAnswer: !!answer.realAnswer,
            houseLie: !!answer.houseLie,
            points: answer.points || 0,
            pointsBy: answer.pointsBy,
            pickerIds: answer.selectors || [],
            creatorIds: (answer.creators || []).filter(c => c),
            pickers,
            creators,
            pickerNames: pickers.map(p => p.nickname),
            creatorNames: creators.map(p => p.nickname),
            playerLie: isPlayerLie(answer),
            lie: isLie(answer),
            laughable: false,
            laughs: 0,
            laughed: false,
        };
    }

    private playerObject(playersArray: (GamePlayer & { pid: string })[], pid: string): Player {
        const index = playersArray.findIndex(p => p.pid === pid);
        return index === -1 ? undefined : {
            nickname: playersArray[index].nickname,
            picture: `avatar${index}.png`,
        };
    }

    private getSound(row: Row) {
        if (row.realAnswer) {
            return 'the-truth';
        } else if (row.houseLie) {
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

interface Player {
    nickname: string;
    picture: string;
}

interface Row {
    text: string;
    realAnswer: boolean;
    houseLie: boolean;
    points: number;
    pointsBy?: { [pid: string]: number };
    pickerIds: string[];
    creatorIds: string[];
    pickers: Player[];
    creators: Player[];
    pickerNames: string[];
    creatorNames: string[];
    // Laughs on lies.
    playerLie: boolean;
    // Any lie, a house lie too: it shows a button or a count just like a player's lie.
    lie: boolean;
    laughable: boolean;
    laughs: number;
    laughed: boolean;
}
