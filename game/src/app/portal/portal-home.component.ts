import { Component, ChangeDetectionStrategy, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { homeStrings, HomeStrings } from '../pages/landing/home-strings';
import { preferredLocale, setPreferredLocale } from '../services/join-source';
import { cleanCode } from '../services/game-code';
import { onPortalLocale } from './portal';

/**
 * The CrazyGames version's home (portal.ts): start a game, or join one with its PIN. It takes the
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
    <p class="portal-pitch">{{ t.pitch }}</p>
    <button class="button is-primary is-medium is-fullwidth portal-create" type="button" (click)="create()">{{ t.create }}</button>
    <form class="portal-code" (ngSubmit)="join()" novalidate>
        <label class="portal-code-ask" for="portal-code">{{ t.codeAsk }}</label>
        <div class="portal-code-row">
            <input id="portal-code" class="input" type="text" name="code" [(ngModel)]="code" [placeholder]="t.codePlaceholder"
                autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" maxlength="12" dir="ltr">
            <button class="button is-info portal-join" type="submit">{{ t.codeJoin }}</button>
        </div>
    </form>
    <p class="portal-facts">{{ t.facts }}</p>
</section>`,
    styles: [`
:host { display: block; min-height: 100vh; background-color: #502440; color: #f4fcca; }
.portal-home { max-width: 26rem; margin: 0 auto; padding: 3rem 1rem 1.5rem; text-align: center; position: relative; }
.lang-switch { position: absolute; top: .75rem; inset-inline-end: 1rem; color: #f4fcca; text-decoration: underline; cursor: pointer; }
.portal-title { font-family: 'Luckiest Guy', 'Suez One', cursive; font-size: 3rem; color: #f3d467; letter-spacing: .05em; margin-bottom: .5rem; }
.portal-pitch { font-size: 1.15rem; margin-bottom: 1.75rem; }
.portal-create { margin-bottom: 1.75rem; }
.portal-code-ask { display: block; margin-bottom: .4rem; }
.portal-code-row { display: flex; gap: .5rem; }
.portal-code-row .input { text-transform: uppercase; text-align: center; letter-spacing: .15em; }
.portal-facts { opacity: .75; font-size: .9rem; margin-top: 1.75rem; }
`],
})
export class PortalHomeComponent implements OnInit, OnDestroy {
    t: HomeStrings = homeStrings('en');
    code = '';
    private stopListening: () => void = () => { };
    private picked = false;

    constructor(private router: Router) { }

    ngOnInit() {
        this.t = homeStrings(preferredLocale());
        // CrazyGames' language, once the SDK says it; a language the player picked here stays.
        this.stopListening = onPortalLocale(locale => {
            if (!this.picked) {
                this.t = homeStrings(locale);
            }
        });
    }

    ngOnDestroy() {
        this.stopListening();
    }

    switchLanguage() {
        this.picked = true;
        setPreferredLocale(this.t.switchTo);
        this.t = homeStrings(this.t.switchTo);
    }

    create() {
        this.router.navigate(['/create-game'], { queryParams: { lang: this.t.lang } });
    }

    join() {
        const pin = cleanCode(this.code);
        this.router.navigate(pin ? ['/join-game', pin] : ['/join-game'], { queryParams: { via: 'pin' } });
    }
}
