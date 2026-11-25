import { Component, ChangeDetectionStrategy, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { homeStrings, HomeStrings } from '../pages/landing/home-strings';
import { preferredLocale, setPreferredLocale } from '../services/join-source';
import { cleanCode } from '../services/game-code';
import { gameStrings } from '../pages/game-strings';
import { PortalHomeStrings, onPortalLocale, portalHomeStrings } from './portal';
import { PortalService } from './portal.service';

/**
 * The CrazyGames version's home (portal.ts). Most players arrive alone from the game's tile, so it
 * says at once that this is a party game for friends and how a round goes, and offers two starts of
 * the same size: with friends (one tap to the lobby and its invite link) or the 5-question taste
 * alone. A PIN joins a friend's game; the create page's options are one small link away. It takes the
 * playable site's home's place in the portal, so none of that home's links out (search pages, the
 * daily puzzle, crews, the big screen) are there. A friend's invite link skips it (PortalService).
 */
@Component({
    standalone: false,
    changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-portal-home',
    template: `
<section class="portal-home" [attr.dir]="t.dir" [attr.lang]="t.lang">
    <a class="lang-switch" [attr.lang]="t.switchTo" role="button" tabindex="0" (click)="switchLanguage()"
        (keydown.enter)="switchLanguage()">{{ t.switchLabel }}</a>
    <h1 class="portal-title">{{ t.title }}</h1>
    <p class="portal-pitch">{{ p.pitch }}</p>
    <ol class="portal-how">
        <li *ngFor="let step of p.how; let i = index"><span class="portal-step">{{ i + 1 }}</span><span>{{ step }}</span></li>
    </ol>
    <p class="portal-needs">{{ p.needs }}</p>
    <div class="notification is-danger portal-error" *ngIf="failed">{{ g.oops }}</div>
    <div class="portal-starts">
        <button class="button is-primary portal-start portal-friends" type="button" [class.is-loading]="busy === 'friends'"
            [disabled]="!!busy" (click)="start(false)">
            <span class="portal-start-main">{{ p.friends }}</span>
            <span class="portal-start-sub">{{ p.friendsSub }}</span>
        </button>
        <button class="button is-info portal-start portal-solo" type="button" [class.is-loading]="busy === 'solo'"
            [disabled]="!!busy" (click)="start(true)">
            <span class="portal-start-main">{{ p.solo }}</span>
            <span class="portal-start-sub">{{ p.soloSub }}</span>
        </button>
    </div>
    <form class="portal-code" (ngSubmit)="join()" novalidate>
        <label class="portal-code-ask" for="portal-code">{{ t.codeAsk }}</label>
        <div class="portal-code-row">
            <input id="portal-code" class="input" type="text" name="code" [(ngModel)]="code" [placeholder]="t.codePlaceholder"
                autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" maxlength="12" dir="ltr">
            <button class="button is-info portal-join" type="submit">{{ t.codeJoin }}</button>
        </div>
    </form>
    <a class="portal-create" role="button" tabindex="0" (click)="create()" (keydown.enter)="create()">{{ p.options }}</a>
</section>`,
    styles: [`
/* In px: the page's rem grows with the window, and the two starts must be on the first screen of a
   1280x720 frame and of CrazyGames' small 800x450 one. */
:host { display: block; min-height: 100vh; background-color: #502440; color: #f4fcca; }
.portal-home { max-width: 600px; margin: 0 auto; padding: 32px 16px 18px; text-align: center; position: relative; font-size: 16px; }
.lang-switch { position: absolute; top: 8px; inset-inline-end: 16px; color: #f4fcca; text-decoration: underline; cursor: pointer; }
.portal-title { font-family: 'Luckiest Guy', 'Suez One', cursive; font-size: 42px; line-height: 1.1; color: #f3d467;
    letter-spacing: .05em; margin-bottom: 6px; }
.portal-pitch { font-size: 18px; line-height: 1.35; margin-bottom: 12px; }
.portal-how { list-style: none; margin: 0 auto 12px; padding: 0; max-width: 440px; text-align: start; }
.portal-how li { display: flex; align-items: center; gap: 10px; margin: 5px 0; font-size: 15px; line-height: 1.3; }
.portal-step { flex: none; width: 24px; height: 24px; border-radius: 50%; background: #f3d467; color: #502440;
    font-weight: bold; font-size: 14px; display: inline-flex; align-items: center; justify-content: center; }
.portal-needs { font-weight: bold; font-size: 16px; line-height: 1.35; margin-bottom: 14px; }
.portal-starts { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.portal-start { flex: 1 1 0; height: auto; min-height: 58px; flex-direction: column; white-space: normal; padding: 8px 14px; }
.portal-start-main { font-size: 20px; font-weight: bold; line-height: 1.2; }
.portal-start-sub { font-size: 13px; opacity: .9; line-height: 1.2; }
.portal-code-ask { display: block; margin-bottom: 6px; font-size: 15px; }
.portal-code-row { display: flex; gap: 8px; max-width: 360px; margin: 0 auto; }
.portal-code-row .input, .portal-code-row .button { font-size: 16px; height: 40px; }
.portal-code-row .input { text-transform: uppercase; text-align: center; letter-spacing: .15em; }
.portal-create { display: inline-block; margin-top: 14px; color: #f4fcca; opacity: .8; font-size: 14px; text-decoration: underline;
    cursor: pointer; }
@media (min-width: 600px) {
    .portal-starts { flex-direction: row; }
}
@media (max-height: 560px) and (orientation: landscape) {
    .portal-home { padding-top: 14px; }
    .portal-title { font-size: 32px; margin-bottom: 2px; }
    .portal-pitch { font-size: 16px; margin-bottom: 6px; }
    .portal-how { margin-bottom: 6px; }
    .portal-how li { margin: 2px 0; font-size: 14px; }
    .portal-needs { font-size: 15px; margin-bottom: 10px; }
    .portal-starts { margin-bottom: 10px; }
    .portal-create { margin-top: 8px; }
}
`],
})
export class PortalHomeComponent implements OnInit, OnDestroy {
    t: HomeStrings = homeStrings('en');
    p: PortalHomeStrings = portalHomeStrings('en');
    g = gameStrings('en');
    code = '';
    /** Which start is making its game. */
    busy: '' | 'friends' | 'solo' = '';
    failed = false;
    private stopListening: () => void = () => { };
    private picked = false;

    constructor(private router: Router, private portal: PortalService) { }

    ngOnInit() {
        this.setLocale(preferredLocale());
        // CrazyGames' language, once the SDK says it; a language the player picked here stays.
        this.stopListening = onPortalLocale(locale => {
            if (!this.picked) {
                this.setLocale(locale);
            }
        });
    }

    ngOnDestroy() {
        this.stopListening();
    }

    switchLanguage() {
        this.picked = true;
        setPreferredLocale(this.t.switchTo);
        this.setLocale(this.t.switchTo);
    }

    private setLocale(locale: string) {
        this.t = homeStrings(locale);
        this.p = portalHomeStrings(this.t.lang);
        this.g = gameStrings(this.t.lang);
    }

    /** One tap to a game: with friends (its lobby and invite link), or the 5-question taste alone. */
    async start(solo: boolean) {
        if (this.busy) {
            return;
        }
        this.busy = solo ? 'solo' : 'friends';
        this.failed = false;
        const made = await this.portal.quickGame(this.t.lang, solo);
        this.busy = '';
        this.failed = !made;
    }

    create() {
        this.router.navigate(['/create-game'], { queryParams: { lang: this.t.lang } });
    }

    join() {
        const pin = cleanCode(this.code);
        this.router.navigate(pin ? ['/join-game', pin] : ['/join-game'], { queryParams: { via: 'pin' } });
    }
}
