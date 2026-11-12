import { reportError } from './../../sentry/sentry.module';
import { ActivatedRoute, Router } from '@angular/router';
import { SessionService } from './../../services/session.service';
import { GameService } from './../../services/game.service';
import { ApiService } from './../../services/api.service';
import { Component, OnInit } from '@angular/core';
import { takeJoinSource, preferredLocale } from '../../services/join-source';
import { CrewService } from '../../services/crew.service';
import { crewStandings } from '../../game-model';
import { JoinStrings, joinStrings, joinLocale } from './join-strings';

@Component({
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

    constructor(
        private activatedRoute: ActivatedRoute,
        private apiService: ApiService,
        private sessionService: SessionService,
        private router: Router,
        private crewService: CrewService,
    ) { }

    ngOnInit() {
        // Sign in now, so a tap on Join does not wait for it.
        this.apiService.warmUpSignIn();
        const lang = (this.activatedRoute.snapshot.queryParams || {})['lang'];
        this.lang = lang === 'he' || lang === 'en' ? lang : undefined;
        this.t = joinStrings(joinLocale(this.router.url, this.lang, preferredLocale()));
        this.pin = this.activatedRoute.snapshot.params['pin'];

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
        this.apiService.validateGameName(pin).catch(err => {
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
        this.gameOver = { pin: (this.pin || '').toUpperCase(), rematch: err.rematch, justEnded: !!err.justEnded };
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
        this.gameOver = null;
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
        if (!rematch) {
            return;
        }
        this.gameOver = null;
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
        this.loading = true;
        this.errorMsg = '';
        this.gameOver = null;

        this.apiService.validateGameName(this.pin)
            .then(() => {
                this.nicknameState = true;
                this.loading = false;
            })
            .catch(err => {
                if (err && err.code === 'GAME_OVER') {
                    return this.showGameOver(err);
                }
                this.loading = false;
                this.errorMsg = this.t.error(err && err.code, err && err.message);
                if (!this.isExpected(err)) {
                    reportError(err, 'validateGameName', { pin: this.pin });
                }
            });
    }

    async join() {
        this.loading = true;
        this.errorMsg = '';
        let uid;

        // signInAnonymously waits at most about 1.5 s and resolves to undefined if sign-in is slower or fails.
        const via = takeJoinSource(this.pin, this.activatedRoute.snapshot.queryParams['via'], this.pinInUrl);
        const user = await this.apiService.signInAnonymously(this.pin, this.nickname, via);
        uid = user ? user.uid : 0;

        this.apiService.join(this.pin, this.nickname, uid)
            .then(({ pid, nickname, swapped }) => {
                // Keep the name the server stored, so Replay and the crew never send the typed one back.
                this.sessionService.user = { nickname: nickname.toLowerCase(), pid, uid };
                this.sessionService.nameSwap = swapped ? { pin: this.pin.toUpperCase(), nickname } : null;
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
                this.errorMsg = this.t.error(err && err.code, err && err.message);
                // Wrong PIN, full game and finished game are expected; report anything else.
                if (!this.isExpected(err)) {
                    reportError(err, 'join', { pin: this.pin });
                }
            });
    }

}
