import { ChangeDetectionStrategy, Component, Input, OnInit } from '@angular/core';
import { ApiService } from '../../services/api.service';
import { SOLO_RUN_LIVES, SoloRun, Taste } from '../../game-model';
import { runStrings, RunStrings } from '../../pages/run-strings';

/**
 * The solo run's bar above each question, its reveal and its scoreboard: lives as hearts, the truths
 * found so far, the streak, and "+1 LIFE!" when five in a row gave one back. Nothing in any other game.
 */
@Component({
    standalone: false,
    changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-run-bar',
    template: `
<div *ngIf="run" class="run-bar" [attr.dir]="rtl ? 'rtl' : 'ltr'" [attr.lang]="rtl ? 'he' : 'en'">
    <span class="run-lives" role="img" [attr.aria-label]="w.lives(run.lives, max)">
        <span *ngFor="let h of hearts" class="run-heart" [class.lost]="!h">{{ h ? '♥' : '♡' }}</span>
    </span>
    <span class="run-found">{{ w.found(found) }}</span>
    <span *ngIf="run.gained" class="run-gained">{{ w.gained }}</span>
    <span *ngIf="!run.gained && run.streak >= 2" class="run-streak">{{ w.streak(run.streak) }}</span>
</div>`,
    styles: [`
.run-bar { display: flex; align-items: center; justify-content: center; gap: 14px; flex-wrap: wrap; padding: 6px 12px;
    font-size: 18px; font-weight: bold; color: #363636; }
.run-lives { letter-spacing: 2px; font-size: 22px; line-height: 1; }
.run-heart { color: #e0374f; }
.run-heart.lost { color: #b5b5b5; }
.run-streak { color: #c45d40; }
.run-gained { color: #2e9e4f; animation: run-pop .6s ease-out; }
@keyframes run-pop { 0% { transform: scale(.6); opacity: 0; } 60% { transform: scale(1.2); opacity: 1; } 100% { transform: scale(1); } }
@media (prefers-reduced-motion: reduce) { .run-gained { animation: none; } }
`],
})
export class RunBarComponent implements OnInit {
    @Input() pin: string;
    run: SoloRun | null = null;
    found = 0;
    max = SOLO_RUN_LIVES;
    hearts: boolean[] = [];
    rtl = false;
    w: RunStrings = runStrings('en');

    constructor(private api: ApiService) { }

    ngOnInit() {
        if (!this.pin) {
            return;
        }
        this.useLocale(this.api.knownGameLocale(this.pin));
        this.api.getGameLocale(this.pin).then(locale => this.useLocale(locale), () => null);
        this.api.getTaste(this.pin).then((taste: Taste) => {
            if (taste && taste.run) {
                this.found = taste.found;
                this.hearts = Array.from({ length: SOLO_RUN_LIVES }, (_, i) => i < taste.run.lives);
                this.run = taste.run;
            }
        });
    }

    private useLocale(locale: string) {
        this.rtl = locale === 'he';
        this.w = runStrings(locale);
    }
}
