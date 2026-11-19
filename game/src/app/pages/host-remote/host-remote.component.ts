import { Component, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiService } from './../../services/api.service';
import { GameState, GamePlayers } from './../../game-model';
import { gameStrings, GameStrings } from './../game-strings';
import { hostStrings, HostStrings, HostSeatRow, hostSeatRows, HostLieRow, hostLieRows, spacedNumber } from './../host-strings';
import { reportError } from './../../sentry/sentry.module';

/**
 * The host's controls on a second device: a big-screen host's phone, paired to the big screen (see "on a
 * second device" in functions/src/controllers/host-controls.ts). It opens from the big screen's QR or link,
 * /host/<PIN>?c=<one-time code>, shows a number to type on the big screen, and once paired shows the lies
 * being written (no names) with HIDE, and the players with REMOVE.
 *
 * It is not a player: it never joins, takes no seat, and sends no join or play counts.
 */
@Component({
    standalone: false,
    changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-host-remote',
    templateUrl: './host-remote.component.html',
    styleUrls: ['./host-remote.component.scss'],
})
export class HostRemoteComponent implements OnInit, OnDestroy {
    pin: string;
    t: GameStrings = gameStrings('en');
    h: HostStrings = hostStrings('en');
    rtl = false;
    /** loading; number: shows its number, waits for the big screen; paired: the controls; nolink; lost. */
    view: 'loading' | 'number' | 'paired' | 'nolink' | 'lost' = 'loading';
    digits = '';
    state: number = null;
    question: number = null;
    seats: HostSeatRow[] = [];
    removing: HostSeatRow = null;
    lies: HostLieRow[] = [];
    /** The lies are open on this question. */
    checking = false;
    busy = false;
    error: string = null;
    private hidden: { [id: string]: boolean } = {};
    private poll: any = null;
    private subs: Subscription[] = [];
    private answersSub: Subscription = null;

    constructor(
        private activatedRoute: ActivatedRoute,
        private router: Router,
        private apiService: ApiService,
    ) { }

    ngOnInit() {
        this.pin = String(this.activatedRoute.snapshot.params['pin'] || '').toUpperCase();
        const code = this.activatedRoute.snapshot.queryParams['c'];
        this.apiService.getGameLocale(this.pin).then(locale => this.setLocale(locale), () => this.setLocale('en'));
        this.start(typeof code === 'string' ? code : null);
    }

    get numberText() {
        return spacedNumber(this.digits);
    }

    get gameOver() {
        return this.state === GameState.ScoreBoardFinal;
    }

    get writing() {
        return this.state === GameState.ShowQuestion;
    }

    private setLocale(locale: string) {
        this.t = gameStrings(locale);
        this.h = hostStrings(locale);
        this.rtl = locale === 'he';
    }

    /** Paired already (a reload), or ask with the link's code, or say the link is no good. */
    private async start(code: string | null) {
        const held = this.apiService.remoteKey(this.pin);
        if (held) {
            try {
                const s = await this.apiService.remoteStatus(this.pin);
                if (s.paired) {
                    return this.paired();
                }
                if (s.waiting) {
                    this.digits = held.digits;
                    this.view = 'number';
                    return this.waitForBigScreen();
                }
            } catch (e) { /* ask again below */ }
            this.apiService.forgetRemote(this.pin);
        }
        if (!code) {
            this.view = 'nolink';
            return;
        }
        try {
            const r = await this.apiService.claimRemote(this.pin, code);
            this.digits = r.digits;
            this.view = 'number';
            // The code has done its work: keep it out of the address bar (and any screenshot of it).
            this.router.navigate([], { queryParams: {}, replaceUrl: true });
            this.waitForBigScreen();
        } catch (e) {
            this.view = 'nolink';
        }
    }

    private waitForBigScreen() {
        this.stopPoll();
        this.poll = setInterval(() => {
            this.apiService.remoteStatus(this.pin).then(s => {
                if (s.paired) {
                    this.stopPoll();
                    this.paired();
                } else if (!s.waiting) {
                    this.stopPoll();
                    this.apiService.forgetRemote(this.pin);
                    this.view = 'nolink';
                }
            }, () => { /* try again on the next beat */ });
        }, 2000);
    }

    private stopPoll() {
        if (this.poll) {
            clearInterval(this.poll);
            this.poll = null;
        }
    }

    private paired() {
        this.view = 'paired';
        this.subs.push(this.apiService.getPlayersObservable(this.pin).subscribe((players: GamePlayers) => {
            this.seats = hostSeatRows(players, null);
            if (this.removing && !this.seats.some(s => s.pid === this.removing.pid)) {
                this.removing = null;
            }
        }));
        this.subs.push(this.apiService.gameState(this.pin).subscribe(state => this.onState(state)));
    }

    private onState(state: number) {
        this.state = state;
        this.error = null;
        if (state === GameState.ShowQuestion) {
            this.apiService.getQuestionIndex(this.pin).then(q => {
                if (q !== this.question) {
                    this.question = q;
                    this.closeLies();
                }
            });
        } else {
            this.closeLies();
        }
    }

    private closeLies() {
        this.checking = false;
        this.lies = [];
        this.hidden = {};
        if (this.answersSub) {
            this.answersSub.unsubscribe();
            this.answersSub = null;
        }
    }

    /** Open the lies: the writing now waits for the host until its clock runs out (host-controls.ts). */
    openLies() {
        if (this.busy) {
            return;
        }
        this.busy = true;
        this.error = null;
        this.apiService.hostLies(this.pin).then(r => {
            this.busy = false;
            this.checking = true;
            (r.lies || []).forEach(l => this.hidden[l.id] = !!l.hidden);
            this.lies = r.lies || [];
            if (!this.answersSub) {
                this.answersSub = this.apiService.answersLive(this.pin)
                    .subscribe(answers => this.lies = hostLieRows(answers, null, this.hidden));
            }
        }, err => this.failed(err));
    }

    toggleLie(lie: HostLieRow) {
        if (this.busy) {
            return;
        }
        this.busy = true;
        this.error = null;
        this.apiService.hideLie(this.pin, lie.id, !lie.hidden).then(() => {
            this.busy = false;
            this.hidden[lie.id] = !lie.hidden;
            this.lies = this.lies.map(l => l.id === lie.id ? Object.assign({}, l, { hidden: !lie.hidden }) : l);
        }, err => this.failed(err));
    }

    showAnswersNow() {
        if (this.busy) {
            return;
        }
        this.busy = true;
        this.apiService.showAnswersNow(this.pin).then(() => this.busy = false, err => this.failed(err));
    }

    askRemove(seat: HostSeatRow) {
        this.error = null;
        this.removing = seat;
    }

    confirmRemove() {
        const seat = this.removing;
        if (!seat || this.busy) {
            return;
        }
        this.busy = true;
        this.apiService.removePlayer(this.pin, seat.pid).then(() => {
            this.busy = false;
            this.removing = null;
        }, err => this.failed(err));
    }

    private failed(err: any) {
        this.busy = false;
        const code = err && err.code;
        if (code === 'NOT_HOST') {
            // The big screen disconnected this phone, or paired another one.
            this.apiService.forgetRemote(this.pin);
            this.subs.forEach(s => s.unsubscribe());
            this.subs = [];
            this.closeLies();
            this.view = 'lost';
            return;
        }
        if (code === 'TOO_LATE') {
            this.error = this.h.tooLate;
            return;
        }
        reportError(err, 'hostRemote', { pin: this.pin });
        this.error = this.t.oops;
    }

    ngOnDestroy() {
        this.stopPoll();
        this.subs.forEach(s => s.unsubscribe());
        this.closeLies();
    }
}
