import { Observable } from 'rxjs';
import { ApiService } from './../../services/api.service';
import { SessionService } from './../../services/session.service';
import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

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
            this.name = this.sessionService.user.nickname;
            this.score = this.apiService.playerScore(pin, this.sessionService.user.pid);
        }
    }
}
