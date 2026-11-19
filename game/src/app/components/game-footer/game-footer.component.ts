import { Observable, combineLatest } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { ApiService } from './../../services/api.service';
import { SessionService } from './../../services/session.service';
import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { footerScore, revealedScore, revealSettled } from './footer-score';

@Component({
    standalone: false,
    changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-game-footer',
    templateUrl: './game-footer.component.html',
    styleUrls: ['./game-footer.component.scss']
})
export class GameFooterComponent implements OnInit {
    name: string;
    score: Observable<number>;
    /** A Hebrew game: the name sits on the right, like the rest of the screen. */
    rtl = false;

    constructor(
        private activatedRoute: ActivatedRoute,
        private sessionService: SessionService,
        private apiService: ApiService,
    ) { }

    ngOnInit() {
        const pin = this.activatedRoute.snapshot.params['pin'];
        this.rtl = this.apiService.knownGameLocale(pin) === 'he';
        this.apiService.getGameLocale(pin).then(locale => this.rtl = locale === 'he', () => null);

        if (!this.sessionService.presenter) {
            const pid = this.sessionService.user.pid;
            this.name = this.sessionService.user.nickname;
            // The server's total, moved on with the reveal's board while the reveal shows it (footer-score.ts).
            this.score = combineLatest([this.apiService.playerScore(pin, pid), revealedScore]).pipe(
                // The server's total moved on: the reveal's hand-off is spent (a later question's points
                // may bring the total back to its old figure, which must not show the old reveal's).
                tap(([live, shown]) => {
                    if (revealSettled(live, shown, pin, pid)) {
                        revealedScore.next(null);
                    }
                }),
                map(([live, shown]) => footerScore(live, shown, pin, pid)),
            );
        }
    }
}
