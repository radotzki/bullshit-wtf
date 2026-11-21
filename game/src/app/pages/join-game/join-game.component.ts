import { reportError } from './../../sentry/sentry.module';
import { inDiscordActivity } from '../../portal/portal';
import { ActivatedRoute, Router } from '@angular/router';
import { SessionService } from './../../services/session.service';
import { ApiService } from './../../services/api.service';
import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { takeJoinSource, markVisit, preferredLocale } from '../../services/join-source';
import { CrewService } from '../../services/crew.service';
import { crewStandings } from '../../game-model';
import { JoinStrings, joinStrings, joinLocale, pinError } from './join-strings';
import { cleanCode } from '../../services/game-code';
import { StorageService } from '../../services/storage.service';
import { GameService } from '../../services/game.service';
import {
    NIGHT_AFTER_CONTENT, NIGHT_AFTER_KEY, NIGHT_AFTER_TAGS, NightAfterRecap, NightAfterStrings, namesOf, nightAfterWords,
    readRecap, recapAsk, seenMethod, shownHalf, whenWas,
} from './night-after';

@Component({
    standalone: false,
    changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-join-game',
    templateUrl: './join-game.component.html',
    styleUrls: ['./join-game.component.scss']
})
export class JoinGameComponent implements OnInit {
    // The page's own words: the visitor's language, decided as the Create page decides it.
    t: JoinStrings = joinStrings('en');
    // `lang` on this page's address (the Create page sends it when its language is not the browser's).
    private lang: string;
    pin: string;
    nickname: string;
    loading: boolean;
    errorMsg: string;
    nicknameState: boolean;
    pinInUrl: boolean;
    // A crew game: the crew's nicknames not yet taken in this game, one tap to pick yours.
    crewId: string;
    crewName: string;
    crewNicknames: string[] = [];
    // The PIN belongs to a game that is over: say so, and offer another PIN (or its rematch).
    gameOver: { pin: string; rematch?: string; justEnded?: boolean };
    // In the week after a finished game, its recap (night-after.ts); shown in the test's new half only.
    recap: NightAfterRecap;
    recapShown: boolean;
    // PLAY AGAIN, SAME TABLE is on its way, or failed (its words).
    againBusy: boolean;
    againError: string;
    // The PIN whose seen- row this page load sent, so a second GAME_OVER answer sends no second one.
    private recapCounted: string;
    // This phone's seat in the game went to another phone with the same name (?taken=1, GameService.seatTaken).
    seatTaken: boolean;

    constructor(
        private activatedRoute: ActivatedRoute,
        private apiService: ApiService,
        private sessionService: SessionService,
        private router: Router,
        private crewService: CrewService,
        private storageService: StorageService,
        private gameService: GameService,
    ) { }

    ngOnInit() {
        // Sign in now, so a tap on Join does not wait for it.
        this.apiService.warmUpSignIn();
        const lang = (this.activatedRoute.snapshot.queryParams || {})['lang'];
        this.lang = lang === 'he' || lang === 'en' ? lang : undefined;
        this.t = joinStrings(joinLocale(this.router.url, this.lang, preferredLocale()));
        this.pin = this.activatedRoute.snapshot.params['pin'];
        this.seatTaken = !!this.pin && (this.activatedRoute.snapshot.queryParams || {})['taken'] === '1';

        if (this.pin) {
            this.pinInUrl = true;
            this.nicknameState = true;
            this.loadCrew();
            this.checkLinkedGame();
        }
    }

    /** An old invite link: say the game is over before anyone types a nickname. */
    private checkLinkedGame() {
        const pin = this.pin;
        this.apiService.validateGameName(pin, true).catch(err => {
            if (this.pin === pin && err && err.code === 'GAME_OVER') {
                this.showGameOver(err);
            }
        });
    }

    private isExpected(err) {
        return err && (err.code === 'GAME_NOT_EXIST' || err.code === 'GAME_IS_FULL' || err.code === 'GAME_OVER');
    }

    private showGameOver(err) {
        this.loading = false;
        this.errorMsg = '';
        const pin = (this.pin || '').toUpperCase();
        this.gameOver = { pin, rematch: err.rematch, justEnded: !!err.justEnded };
        // A later answer for the same PIN (a tap on JOIN) carries no recap: keep the one the page has.
        // Beside an open rematch the server sends one in the new half only ("They're playing again").
        const recap = readRecap(err) || (this.recap && this.recapPin === pin ? this.recap : null);
        this.setRecap(recap, pin);
    }

    private recapPin: string;

    /** Shows the recap in the new half, and counts what this page load showed (once a PIN). */
    private setRecap(recap: NightAfterRecap, pin: string) {
        this.recap = recap;
        this.recapPin = recap ? pin : undefined;
        if (!recap) {
            this.recapShown = false;
            return;
        }
        let forced: string = null;
        try {
            forced = this.storageService.getItem(NIGHT_AFTER_KEY);
        } catch (e) { }
        const half = shownHalf(recap, forced);
        this.recapShown = half === 'new';
        if (this.recapCounted !== pin) {
            this.recapCounted = pin;
            // None beside an open rematch, in either half (seenMethod).
            const seen = seenMethod(half, recap.player, this.gameOver && this.gameOver.rematch);
            if (seen) {
                this.countRecap(seen);
            }
        }
    }

    /** A night-after row; a test game's link sends none. */
    private countRecap(method: string) {
        if (!this.recap || this.recap.test) {
            return;
        }
        this.apiService.logShare(NIGHT_AFTER_CONTENT, method, { crew: this.recapPin, locale: this.t.lang });
    }

    get n(): NightAfterStrings {
        return nightAfterWords(this.t.lang);
    }

    get recapHeading() {
        return this.recap ? this.n.heading(whenWas(this.recap.endedAt, Date.now()), this.recap.host) : '';
    }

    get recapWinners() {
        return this.recap ? namesOf(this.recap.rows, r => r.place === 1, this.n.and) : '';
    }

    get recapWinnerCount() {
        return this.recap ? this.recap.rows.filter(r => r.place === 1).length : 0;
    }

    get recapBiggest() {
        return this.recap ? namesOf(this.recap.rows, r => !!r.biggest, this.n.and) : '';
    }

    /** START YOUR OWN GAME (didn't play) or HOST THE NEXT ONE (played): the Create page, tagged. */
    recapCreate() {
        const player = !!(this.recap && this.recap.player);
        this.countRecap(player ? 'create-player' : 'create');
        // A finished game must not move this browser any more.
        try {
            this.gameService.unregister();
        } catch (e) { }
        this.router.navigate(['/create-game'], {
            queryParams: { via: player ? NIGHT_AFTER_TAGS.player : NIGHT_AFTER_TAGS.other, lang: this.t.lang },
        });
    }

    /** Which ask the recap shows (see recapAsk). */
    get ask() {
        return recapAsk(!!(this.recap && this.recap.player), this.gameOver && this.gameOver.rematch,
            !!(this.recap && this.recap.tablePlaying));
    }

    /**
     * PLAY AGAIN, SAME TABLE: the game's open lobby, or a new one this phone hosts; then into it, under
     * this browser's last nickname when it has one (its seat comes along), else at the nickname box.
     * `wait`: CATCH THE NEXT ROUND under "They started without you": while the table still plays, the
     * server says TABLE_PLAYING and the page says so; START A NEW TABLE NOW presses without it.
     */
    async playAgain(wait = false) {
        const pin = this.recapPin;
        if (!pin || this.againBusy) {
            return;
        }
        this.againBusy = true;
        this.againError = '';
        const late = this.ask === 'late-player';
        this.countRecap(late ? (wait ? 'catch-next' : 'new-table')
            : this.gameOver && this.gameOver.rematch ? 'same-table-open' : 'same-table');
        try {
            const r = await this.apiService.sameTable(pin, late && wait);
            if (!r || !r.pin) {
                throw new Error('no table');
            }
            try {
                this.gameService.unregister();
            } catch (e) { }
            this.goToLobby(r.pin);
            const me = this.sessionService.user;
            if (me && me.nickname) {
                this.nickname = me.nickname;
                this.join();
            }
        } catch (err) {
            const playing = !!(err && err.code === 'TABLE_PLAYING');
            this.againError = playing ? this.n.lateStill : this.n.againError;
            if (!(err && (err.code === 'NOT_A_PLAYER' || playing))) {
                reportError(err, 'sameTable', { pin });
            }
        }
        this.againBusy = false;
    }

    /** JOIN THEM, under "They're playing again". */
    joinThem() {
        this.countRecap('join-them');
        this.joinRematch();
    }

    recapCrew() {
        this.countRecap('crew');
    }

    /** The join page under the same entry point (the Hebrew one keeps its /he). */
    private joinPath() {
        return /^\/he\//.test(this.router.url) ? '/he/join-game' : '/join-game';
    }

    /** Keeps the page's language across a move to another PIN. */
    private keepLang() {
        return this.lang ? { lang: this.lang } : {};
    }

    /** Back to an empty PIN box. */
    tryAnotherPin() {
        this.seatTaken = false;
        this.gameOver = null;
        this.recap = null;
        this.recapShown = false;
        this.errorMsg = '';
        this.pin = '';
        this.pinInUrl = false;
        this.nicknameState = false;
        this.crewId = this.crewName = undefined;
        this.crewNicknames = [];
        this.router.navigate([this.joinPath()], { replaceUrl: true, queryParams: this.keepLang() });
    }

    /** Join the rematch of the game that is over: its PIN, then a nickname. */
    joinRematch() {
        const rematch = this.gameOver && this.gameOver.rematch;
        if (rematch) {
            this.goToLobby(rematch);
        }
    }

    /** To the nickname box of a lobby (the rematch, or the table PLAY AGAIN opened). */
    private goToLobby(rematch: string) {
        this.seatTaken = false;
        this.gameOver = null;
        this.recap = null;
        this.recapShown = false;
        this.errorMsg = '';
        this.pin = rematch;
        this.nicknameState = true;
        this.crewId = this.crewName = undefined;
        this.crewNicknames = [];
        this.router.navigate([this.joinPath(), rematch], { replaceUrl: true, queryParams: this.keepLang() });
        this.loadCrew();
    }

    async loadCrew() {
        try {
            const crewId = await this.apiService.getGameCrew(this.pin);
            if (!crewId) {
                return;
            }
            const [crew, players] = await Promise.all([this.apiService.getCrew(crewId), this.apiService.getPlayers(this.pin)]);
            if (!crew) {
                return;
            }
            const taken = Object.keys(players || {}).map(k => (players[k].nickname || '').trim().toLowerCase());
            this.crewId = crew.id;
            this.crewName = crew.name;
            this.crewNicknames = crewStandings(crew)
                .map(m => m.nickname)
                .filter(n => n && taken.indexOf(n.toLowerCase()) < 0)
                .sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : 1);

            const mine = this.crewService.get(crew.id);
            if (!this.nickname && mine && mine.nickname && taken.indexOf(mine.nickname.toLowerCase()) < 0) {
                this.nickname = mine.nickname;
            }
        } catch (e) {
            // The chips are a shortcut; typing a nickname still works.
        }
    }

    pickNickname(nickname: string) {
        this.nickname = nickname;
    }

    submit() {
        if (!this.nicknameState) {
            this.validateGameName();
        } else {
            this.join();
        }
    }

    validateGameName() {
        // The code as the server knows it: capitals, letters only, and a code typed on a Hebrew
        // keyboard read as the English letters on the same keys (the home's code box does the same).
        // Shown back in the box, so the guest sees the code they joined. Nothing left of it: sent
        // as typed, and the server says the PIN is wrong.
        const typed = this.pin;
        this.pin = cleanCode(typed) || typed;
        this.loading = true;
        this.errorMsg = '';
        this.gameOver = null;

        this.apiService.validateGameName(this.pin, true)
            .then(() => {
                this.nicknameState = true;
                this.loading = false;
            })
            .catch(err => {
                if (err && err.code === 'GAME_OVER') {
                    return this.showGameOver(err);
                }
                this.loading = false;
                // A wrong PIN typed in Hebrew letters also says that codes are English letters.
                this.errorMsg = pinError(this.t.lang, err && err.code, err && err.message, typed);
                if (!this.isExpected(err)) {
                    reportError(err, 'validateGameName', { pin: this.pin });
                }
            });
    }

    async join() {
        // A second tap while the first join is still on its way would ask for a second seat.
        if (this.loading) {
            return;
        }
        this.loading = true;
        this.errorMsg = '';

        // signInAnonymously waits at most about 1.5 s and resolves to undefined if sign-in is slower or fails.
        const via = takeJoinSource(this.pin, this.activatedRoute.snapshot.queryParams['via'], this.pinInUrl);
        const user = await this.apiService.signInAnonymously(this.pin, this.nickname, via);
        const uid: any = user ? user.uid : 0;

        this.apiService.join(this.pin, this.nickname, uid)
            .then(({ pid, nickname, swapped }) => {
                // Keep the name the server stored, so Replay and the crew never send the typed one back.
                this.sessionService.user = { nickname: nickname.toLowerCase(), pid, uid };
                this.sessionService.nameSwap = swapped ? { pin: this.pin.toUpperCase(), nickname } : null;
                markVisit('join');
                if (this.crewId) {
                    this.crewService.remember(this.crewId, this.crewName, nickname);
                }
                this.router.navigate(['game-staging', this.pin]);
                this.loading = false;
            })
            .catch(err => {
                if (err && err.code === 'GAME_OVER') {
                    return this.showGameOver(err);
                }
                this.loading = false;
                // The Discord Activity: the call's game filled up meanwhile. Its home says so, and waits
                // for the call's next game (portal/discord.ts, shellStep).
                if (err && err.code === 'GAME_IS_FULL' && inDiscordActivity()) {
                    this.router.navigate(['/'], { replaceUrl: true });
                    return;
                }
                this.errorMsg = this.t.error(err && err.code, err && err.message);
                // Wrong PIN, full game and finished game are expected; report anything else.
                if (!this.isExpected(err)) {
                    reportError(err, 'join', { pin: this.pin });
                }
            });
    }

}
