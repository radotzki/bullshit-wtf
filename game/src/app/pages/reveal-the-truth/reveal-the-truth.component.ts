import { Howl } from 'howler';
import { SessionService } from './../../services/session.service';
import { ApiService } from './../../services/api.service';
import { Subscription } from 'rxjs/Subscription';
import { GameService } from './../../services/game.service';
import { ActivatedRoute } from '@angular/router';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { GamePlayer, RevealAnswer, revealSchedule } from '../../game-model';

/**
 * The reveal: the question stays on top, and the answers somebody picked appear one row at a time,
 * the truth last. Each row shows who picked it, then who wrote it. Answers nobody picked get no row of
 * their own; they are listed together at the end. Then each player sees their own result and can tap NEXT;
 * once everyone has, the server moves on without waiting for the deadline.
 *
 * Every phone works out what to show from the server's phase start time, so all screens stay in step
 * even if one loads late.
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
    question: string;

    rows: Row[];
    unpicked: Row[] = [];
    myResult: string[] = [];

    visibleRows = 0;
    writersShown = 0;
    allShown = false;

    playersCount = 0;
    doneCount = 0;
    tapped = false;

    private step: number;
    private allShownAt: number;
    private startedAt: number;       // server time the reveal began
    private clockOffset = 0;         // server time minus this phone's time
    private ticker;
    private soundsPlayed = 0;
    private doneSub: Subscription;
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
        this.apiService.getGameLocale(this.pin).then(locale => this.rtl = locale === 'he');
        this.apiService.getQuestion(this.pin).then(q => this.question = q);
        this.load();
    }

    ngOnDestroy() {
        this.stopMusic();
        clearInterval(this.ticker);

        if (this.doneSub) {
            this.doneSub.unsubscribe();
        }
    }

    next() {
        this.tapped = true;
        // If this fails (old database rules, network), the reveal still ends at its deadline.
        this.apiService.revealDone(this.pin).catch(() => undefined);
    }

    get waitingFor() {
        return Math.max(this.playersCount - this.doneCount, 0);
    }

    private async load() {
        const [revealAnswers, players, info, hasPresenter] = await Promise.all([
            this.apiService.getRevealAnswers(this.pin),
            this.apiService.getPlayers(this.pin),
            this.apiService.getGameStateInfo(this.pin),
            this.apiService.gameHasPresenter(this.pin),
        ]);

        const playersArray = Object.keys(players || {}).map(k => Object.assign({ pid: k }, players[k]));
        const all = (revealAnswers || []).map(a => this.toRow(a, playersArray));

        // Picked lies first, the ones that fooled fewest people first, so the big ones come last; the truth always last.
        const picked = all.filter(r => r.pickers.length && !r.realAnswer)
            .sort((a, b) => a.pickers.length - b.pickers.length || (a.text > b.text ? 1 : -1));
        const truth = all.filter(r => r.realAnswer);
        this.rows = picked.concat(truth);
        this.unpicked = all.filter(r => !r.pickers.length && !r.realAnswer && !r.houseLie);
        this.playersCount = playersArray.length;

        if (!this.presenter && this.sessionService.user) {
            this.myResult = this.resultFor(this.sessionService.user.pid, all);
        }

        const schedule = revealSchedule(revealAnswers, !!hasPresenter);
        this.step = schedule.step;
        this.allShownAt = schedule.allShown;
        this.clockOffset = info.now - Date.now();
        this.startedAt = info.state && info.state.timestamp || info.now;

        this.doneSub = this.apiService.revealDoneCount(this.pin).subscribe(count => this.doneCount = count);
        this.update();
        this.ticker = setInterval(() => this.update(), 100);
    }

    private update() {
        const elapsed = Date.now() + this.clockOffset - this.startedAt;
        const half = this.step / 2;

        this.visibleRows = Math.min(this.rows.length, Math.floor(elapsed / this.step) + 1);
        this.writersShown = Math.min(this.rows.length, Math.floor((elapsed + half) / this.step));
        this.allShown = elapsed >= this.allShownAt;

        // On the big screen, a sound for each writer as it is revealed.
        if (this.writersShown > this.soundsPlayed) {
            this.soundsPlayed = this.writersShown;
            this.playMusic([`/assets/sounds/${this.getSound(this.rows[this.writersShown - 1])}.mp3`]);
        }

        if (this.allShown) {
            clearInterval(this.ticker);
        }
    }

    private toRow(answer: RevealAnswer, playersArray: (GamePlayer & { pid: string })[]): Row {
        return {
            text: answer.text,
            realAnswer: !!answer.realAnswer,
            houseLie: !!answer.houseLie,
            points: answer.points || 0,
            pointsBy: answer.pointsBy,
            pickerIds: answer.selectors || [],
            creatorIds: (answer.creators || []).filter(c => c),
            pickers: (answer.selectors || []).map(pid => this.playerObject(playersArray, pid)).filter(p => p),
            creators: (answer.creators || []).filter(c => c).map(pid => this.playerObject(playersArray, pid)).filter(p => p),
        };
    }

    /** One or two short lines on how this player did this question. */
    private resultFor(pid: string, rows: Row[]): string[] {
        const lines: string[] = [];
        const pickedRow = rows.find(r => r.pickerIds.indexOf(pid) !== -1);
        const myLie = rows.find(r => r.creatorIds.indexOf(pid) !== -1);

        if (pickedRow && pickedRow.realAnswer) {
            lines.push(`You found the truth! ${this.signed(pickedRow.points)}`);
        } else if (pickedRow && pickedRow.houseLie) {
            const lost = pickedRow.pointsBy && pid in pickedRow.pointsBy ? pickedRow.pointsBy[pid] : pickedRow.points;
            lines.push(lost < 0
                ? `You fell for our bullshit. ${this.signed(lost)}`
                : `You fell for our bullshit. No points to lose yet!`);
        } else if (pickedRow) {
            lines.push(`You fell for ${this.names(pickedRow.creators)}'s bullshit.`);
        } else {
            lines.push(`You didn't pick an answer.`);
        }

        if (myLie && myLie.pickers.length) {
            lines.push(`You fooled ${this.names(myLie.pickers)}! ${this.signed(myLie.points)}`);
        } else if (myLie) {
            lines.push(`Nobody fell for your answer.`);
        }

        return lines;
    }

    private names(players: Player[]) {
        const n = players.map(p => p.nickname);
        return n.length <= 1 ? n.join('') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
    }

    private signed(points: number) {
        return points > 0 ? `+${points}` : `${points}`;
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
}
