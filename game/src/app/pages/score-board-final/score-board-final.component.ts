import { Subscription } from 'rxjs';
import { SessionService } from './../../services/session.service';
import { Howl } from 'howler';
import { fadeOutAndUnload } from './../fade-out';
import { GameService } from './../../services/game.service';
import { ApiService } from './../../services/api.service';
import { ActivatedRoute } from '@angular/router';
import { Component, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { CrewService } from './../../services/crew.service';
import { reportError } from './../../sentry/sentry.module';
import { Highlight, Highlights, finalPlaces, funniestLies, Taste, TASTE_QUESTIONS } from './../../game-model';
import { tasteStrings, TasteStrings } from './../taste-strings';
import { finalStrings, FinalStrings } from './final-strings';
import { rematchMove, rematchStrings, showHostAsk } from './../../components/host-ask/host-ask';
import { GameState, seatPicture } from './../../game-model';
import { StorageService } from './../../services/storage.service';
import { GAMES_KEY, addGame, isRepeatGroup, parseGames } from './repeat-group';

export interface FinalPlayer {
    nickname: string;
    score: number;
    picture: string;
    place: number;
    me: boolean;
    best?: Highlight;
    biggest?: boolean;
    // Laughs on lies: this player wrote the game's funniest lie (the most laughed-at), with its count.
    funniest?: { text: string; laughs: number };
}

@Component({
    standalone: false,
    changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-score-board-final',
    templateUrl: './score-board-final.component.html',
    styleUrls: ['./score-board-final.component.scss']
})
export class ScoreBoardFinalComponent implements OnInit, OnDestroy {
    pin: string;
    loading: boolean;
    forkGameSubscription: Subscription;
    /** This phone's Replay call, while it runs. */
    private forkCall: Promise<any> = null;
    displayPlayers: FinalPlayer[];
    winners: FinalPlayer[] = [];
    mine: FinalPlayer;
    locale = 'en';
    t: FinalStrings = finalStrings.en;
    wholeGame: boolean;
    /** The game was a taste (five pick-only questions for a host who started alone), or null. */
    taste: Taste = null;
    tasteWords: TasteStrings = tasteStrings('en');
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
    /**
     * This phone saw the same group finish an earlier game (see repeat-group.ts): "Save this crew"
     * moves up, above SHARE RESULTS, with a line that says why.
     */
    repeatGroup: boolean;
    myNickname: string;
    /** This player did not host the game: show the "start your own game" ask. */
    hostAsk: boolean;
    /**
     * Someone else pressed REMATCH: the new game's pin. This phone stays on the final screen and its
     * REMATCH button becomes JOIN THE REMATCH (see rematchMove).
     */
    rematchPin: string;
    rematchHost: string;
    rematchStarted: boolean;
    private rematchSubscription: Subscription;
    private sheetOpen: boolean;
    /** This phone is on its way to the rematch. */
    private leaving: boolean;

    constructor(
        private activatedRoute: ActivatedRoute,
        private gameService: GameService,
        private apiService: ApiService,
        private sessionService: SessionService,
        private crewService: CrewService,
        private storageService: StorageService,
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
            this.apiService.getTaste(this.pin),
        ]).then(([resp, highlights, from, locale, taste]: any[]) => {
            // The words are in the game's language from the first paint.
            this.locale = locale === 'he' ? 'he' : 'en';
            this.t = finalStrings[this.locale];
            this.tasteWords = tasteStrings(this.locale);
            this.taste = taste || null;
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
            this.setHostAsk(resp, user);
            this.setRepeatGroup(resp);
        });

        this.crewSubscription = this.apiService.getGameCrewObservable(this.pin).subscribe(id => this.onCrew(id));

        this.forkGameSubscription = this.apiService.getForkGame(this.pin).subscribe(fork => this.onFork(fork));
    }

    /** A rematch of this game exists: go to it, or stay here with a button that goes. */
    private async onFork(fork: string) {
        if (!fork || this.rematchPin === fork) {
            return;
        }
        // The phone that pressed Replay goes once its host key for the new game is saved, so its
        // lobby knows it is the host from the start (START works at once, and it reports in).
        const pressed = !!this.forkCall;
        if (pressed) {
            await this.forkCall.catch(() => null);
        }
        this.rematchPin = fork;
        if (this.followRematch(pressed)) {
            return;
        }
        this.loading = false;
        this.apiService.getPlayers(fork).then(players => {
            const host = Object.keys(players || {}).map(k => players[k]).filter(p => p && p.host)[0];
            this.rematchHost = host ? host.nickname : '';
        }).catch(() => null);
        // When the host starts the rematch, a phone that is still here follows.
        if (this.rematchSubscription) {
            this.rematchSubscription.unsubscribe();
        }
        this.rematchSubscription = this.apiService.gameState(fork).subscribe(state => {
            this.rematchStarted = typeof state === 'number' && state !== GameState.GameStaging;
            this.followRematch();
        });
    }

    /** Sharing or saving: a started rematch waits for this player until the sheet or form closes. */
    private get busy() {
        return !!this.sheetOpen || !!this.naming || !!this.savingCrew;
    }

    /** Goes to the rematch when rematchMove says so. Resolves to whether it went. */
    private followRematch(pressed = false): boolean {
        if (!this.rematchPin || this.leaving) {
            return !!this.leaving;
        }
        const move = rematchMove({ presenter: this.presenter, pressed, started: !!this.rematchStarted, busy: this.busy });
        if (move === 'go') {
            this.goToRematch();
            return true;
        }
        return false;
    }

    private async goToRematch() {
        const fork = this.rematchPin;
        this.leaving = true;
        this.loading = true;
        if (!this.presenter) {
            await this.apiService.signInAnonymously(fork, this.sessionService.user.nickname, 'replay');
        }
        this.gameService.unregister();
        this.gameService.register(fork);
    }

    /** JOIN THE REMATCH: this player is done here. */
    joinRematch() {
        if (this.rematchPin && !this.leaving) {
            this.goToRematch();
        }
    }

    /** The share sheet opened or closed. */
    onSheet(open: boolean) {
        this.sheetOpen = open;
        if (!open) {
            this.followRematch();
        }
    }

    get rematchLine() {
        const t = rematchStrings[this.locale === 'he' ? 'he' : 'en'];
        return this.rematchStarted ? t.started : t.waiting(this.rematchHost);
    }

    get rematchJoin() {
        return rematchStrings[this.locale === 'he' ? 'he' : 'en'].join;
    }

    ngOnDestroy() {
        this.forkGameSubscription.unsubscribe();
        this.crewSubscription.unsubscribe();
        if (this.rematchSubscription) {
            this.rematchSubscription.unsubscribe();
        }

        if (this.sound) {
            fadeOutAndUnload(this.sound);
        }
    }

    /** The ask is for a player of this game who did not host it. */
    private async setHostAsk(resp, user) {
        const players = Object.keys(resp).map(pid => ({ pid, uid: resp[pid].uid, host: !!resp[pid].host }));
        this.hostAsk = showHostAsk({
            presenter: this.presenter,
            myPid: user ? user.pid : null,
            myUid: user ? user.uid : null,
            // For a game from before host marks: the browser that created it.
            creator: await this.apiService.getGameCreator(this.pin).catch(() => null),
            holdsHostKey: this.apiService.holdsHostKey(this.pin),
            players,
        });
    }

    /** Compares this game with the ones this phone saw end, then adds it to them. */
    private setRepeatGroup(resp) {
        const names = Object.keys(resp || {}).map(pid => resp[pid] && resp[pid].nickname).filter(n => !!n);
        if (names.length < 2 || this.taste) {
            return;
        }
        try {
            const now = Date.now();
            const games = parseGames(this.storageService.getItem(GAMES_KEY));
            this.repeatGroup = !this.presenter && isRepeatGroup(games, this.pin, names, now);
            this.storageService.setItem(GAMES_KEY, JSON.stringify(addGame(games, this.pin, names, now)));
        } catch (e) { }
    }

    /** The save-crew offer sits above SHARE RESULTS on a group's second game, at the bottom otherwise. */
    get crewFirst() {
        return !!this.repeatGroup && !this.presenter && !this.soloTaste;
    }

    private setPlayers(resp, highlights: Highlights, myPid: string) {
        const players = Object.keys(resp)
            .map((pid, i) => ({
                pid,
                nickname: resp[pid].nickname,
                score: resp[pid].score || 0,
                picture: seatPicture(i),
                best: highlights[pid] && highlights[pid].text ? highlights[pid] : undefined,
            }))
            .sort((a, b) => b.score - a.score);
        const places = finalPlaces(players.map(p => p.score));
        const mostFooled = Math.max(0, ...players.map(p => p.best ? p.best.total || 0 : 0));
        const biggest = players.filter(p => p.best && (p.best.total || 0) === mostFooled);
        // The funniest lie: its writers (two, when they wrote the same lie; more, when lies tie on laughs).
        const funny: { [pid: string]: { text: string; laughs: number } } = {};
        funniestLies(highlights).forEach(lie => lie.pids.forEach(pid => funny[pid] = { text: lie.text, laughs: lie.laughs }));

        this.displayPlayers = players.map((p, i) => ({
            nickname: p.nickname,
            score: p.score,
            picture: p.picture,
            place: places[i],
            me: !!myPid && p.pid === myPid,
            best: p.best,
            // One clear "biggest bullshitter": nobody gets it on a tie.
            biggest: mostFooled > 0 && biggest.length === 1 && biggest[0].pid === p.pid,
            funniest: funny[p.pid],
        }));
        this.winners = this.displayPlayers.filter(p => p.place === 1);
        this.mine = this.displayPlayers.find(p => p.me);
    }

    get rtl() {
        return this.locale === 'he';
    }

    /**
     * A player who played the taste alone: the screen counts the truths they found and asks them to
     * bring friends, in place of a winner, REMATCH and a list of one.
     */
    get soloTaste(): boolean {
        return !!this.taste && !this.presenter && !!this.displayPlayers && this.displayPlayers.length === 1;
    }

    get headline() {
        if (this.soloTaste) {
            return this.tasteWords.found(this.taste.found, TASTE_QUESTIONS);
        }
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
        if (this.forkCall) {
            return;
        }
        this.loading = true;
        this.forkCall = this.apiService.fork(this.pin).catch(err => {
            this.forkCall = null;
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
            this.apiService.logShare('crew-save', this.crewFirst ? 'repeat-offer' : 'bottom', { crew: crew.id, locale: this.locale });
            // The game's crew field updates too; this just makes it show at once.
            await this.onCrew(crew.id);
        } catch (err) {
            this.crewError = (err && err.message) || this.t.crewError;
            // A refused name (empty, or a slur or sex word) is expected; report anything else.
            if (!err || err.code !== 'BAD_NAME') {
                reportError(err, 'createCrew', { pin: this.pin });
            }
        }
        this.savingCrew = false;
        this.followRematch();
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
