import { Component, ChangeDetectionStrategy, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { GameState, MAX_PLAYERS } from '../game-model';
import { ApiService } from '../services/api.service';
import { SessionService } from '../services/session.service';
import { markHosted, markVisit, preferredLocale } from '../services/join-source';
import { reportError } from '../sentry/sentry.module';
import { DiscordService } from './discord.service';
import { launchSearch } from './portal';
import { DiscordStrings, HOW_TO_PLAY, discordCampaign, discordStrings, openOutside, shellStep } from './discord';

const campaignKey = 'BS_CAMPAIGN';

/**
 * The Discord Activity's home (portal/discord.ts). Nobody stays here long: it waits for Discord's SDK,
 * asks for the call's game (functions' discordTable) and sends the player to that game's join step
 * and lobby. It stays only when the call's game can't take the player yet:
 * - the game just ended and nobody pressed REMATCH: a waiting screen with its own REMATCH button,
 *   which moves when someone in the call presses REMATCH on their final scores;
 * - the game has its 12 players (the 13th person in a call): "this game is full", until the game
 *   ends or is rematched, then the player follows the call into the next game.
 */
@Component({
    standalone: false,
    changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-discord-home',
    template: `
<section class="discord-home" [attr.dir]="t.dir" [attr.lang]="t.lang">
    <h1 class="discord-title">{{ t.title }}</h1>

    <div *ngIf="state === 'finding'" class="discord-finding">
        <div class="loader"></div>
        <p>{{ t.finding }}</p>
    </div>

    <div *ngIf="state === 'ended'" class="discord-ended">
        <h2 class="discord-headline">{{ t.endedTitle }}</h2>
        <p class="discord-line">{{ t.endedLine }}</p>
        <button class="button is-primary is-medium is-fullwidth discord-rematch" type="button" [class.is-loading]="busy"
            (click)="rematch()">{{ t.rematch }}</button>
        <p class="discord-hint">{{ t.rematchHint }}</p>
    </div>

    <div *ngIf="state === 'full'" class="discord-full">
        <h2 class="discord-headline">{{ t.fullTitle }}</h2>
        <p class="discord-line">{{ t.fullLine(max) }}</p>
        <div class="loader discord-wait"></div>
    </div>

    <div *ngIf="state === 'error'" class="discord-error">
        <p class="discord-line">{{ t.errorLine }}</p>
        <button class="button is-primary is-medium is-fullwidth discord-retry" type="button" (click)="go()">{{ t.tryAgain }}</button>
    </div>

    <a class="discord-how" role="button" tabindex="0" (click)="howToPlay()" (keydown.enter)="howToPlay()">{{ t.howToPlay }}</a>
</section>`,
    styles: [`
:host { display: block; min-height: 100vh; background-color: #502440; color: #f4fcca; }
.discord-home { max-width: 26rem; margin: 0 auto; padding: 3rem 1rem 1.5rem; text-align: center; }
.discord-title { font-family: 'Luckiest Guy', 'Suez One', cursive; font-size: 3rem; color: #f3d467;
    letter-spacing: .05em; margin-bottom: 1.5rem; }
.discord-headline { font-size: 1.5rem; font-weight: bold; margin-bottom: .75rem; }
.discord-line { font-size: 1.1rem; margin-bottom: 1.5rem; }
.discord-hint { opacity: .75; font-size: .9rem; margin-top: .5rem; }
.loader { margin: 1rem auto; width: 2.5rem; height: 2.5rem; }
.discord-how { display: inline-block; margin-top: 2.5rem; color: #f4fcca; text-decoration: underline; cursor: pointer; }
`],
})
export class DiscordHomeComponent implements OnInit, OnDestroy {
    t: DiscordStrings = discordStrings('en');
    state: 'finding' | 'ended' | 'full' | 'error' = 'finding';
    max = MAX_PLAYERS;
    busy = false;
    private pin = '';
    private watching: Subscription[] = [];
    private gone = false;

    constructor(
        private router: Router,
        private api: ApiService,
        private session: SessionService,
        private discord: DiscordService,
    ) { }

    ngOnInit() {
        this.t = discordStrings(preferredLocale());
        this.api.warmUpSignIn();
        this.go();
    }

    ngOnDestroy() {
        this.gone = true;
        this.unwatch();
    }

    /** Asks for the call's game and goes there, or shows why the player waits. */
    async go() {
        this.unwatch();
        this.state = 'finding';
        await this.discord.ready;
        const instanceId = this.discord.instanceId();
        try {
            const table = await this.api.discordTable(instanceId, this.t.lang, this.campaign());
            if (this.gone) {
                return;
            }
            const players = table.ended ? null : await this.api.getPlayers(table.pin).catch(() => null);
            const user = this.session.user;
            const step = shellStep(table, players, user && user.pid, MAX_PLAYERS);
            if (step === 'join') {
                if (table.created) {
                    markHosted(table.pin);
                    markVisit('create');
                }
                this.router.navigate(['/join-game', table.pin], { replaceUrl: true });
                return;
            }
            this.pin = table.pin;
            this.state = step;
            this.watch(table.pin, step);
        } catch (e) {
            if (this.gone) {
                return;
            }
            this.state = 'error';
            // A bad instance id is the caller's (an address without Discord's parameters): not reported.
            if (!(e && e.code === 'BAD_REQUEST')) {
                reportError(e, 'discordTable', {});
            }
        }
    }

    /** REMATCH on the waiting screen: the next game of the finished one, for the whole call. */
    async rematch() {
        if (this.busy || !this.pin) {
            return;
        }
        this.busy = true;
        try {
            await this.api.fork(this.pin);
        } catch (e) {
            reportError(e, 'discordRematch', { pin: this.pin });
        }
        this.busy = false;
        // discordTable follows the finished game to its rematch and moves the call there.
        this.go();
    }

    howToPlay() {
        openOutside(HOW_TO_PLAY[this.t.lang === 'he' ? 'he' : 'en']);
    }

    /**
     * Waiting: someone pressed REMATCH (the game's fork), or, for a full game, the game reached its
     * final scores: ask again, and follow the call.
     */
    private watch(pin: string, step: 'ended' | 'full') {
        const again = () => {
            if (!this.gone && this.state === step) {
                this.go();
            }
        };
        this.watching.push(this.api.getForkGame(pin).subscribe(fork => fork && again(), () => { }));
        if (step === 'full') {
            this.watching.push(this.api.gameState(pin).subscribe(id => id === GameState.ScoreBoardFinal && again(), () => { }));
        }
    }

    private unwatch() {
        this.watching.forEach(s => s.unsubscribe());
        this.watching = [];
    }

    private campaign(): string {
        try {
            const s = window.sessionStorage;
            const tag = discordCampaign(s.getItem(campaignKey), launchSearch());
            if (tag) {
                s.setItem(campaignKey, tag);
            }
            return tag;
        } catch (e) {
            return discordCampaign(null, launchSearch());
        }
    }
}
