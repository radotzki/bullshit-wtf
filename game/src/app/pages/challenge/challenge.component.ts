import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from './../../services/api.service';
import { reportError } from './../../sentry/sentry.module';
import { markHosted, markVisit } from './../../services/join-source';
import {
    CHALLENGE_CONTENT, CHALLENGE_OVER_TAG, ChallengeCard, ChallengeStrings, cardAverage, challengeCampaign, challengeWords, readCard,
} from './../../components/challenge/challenge';

/**
 * A challenge link, /challenge/<PIN> (/he/challenge/<PIN> for a Hebrew game): the table to beat, and START
 * THE CHALLENGE, which makes a game on the same questions with this browser as its host (see
 * components/challenge/challenge.ts). A challenge that is over, or was never opened, says so and offers a
 * fresh game. Everything shown comes from the server; the link's PIN only says which game to ask about.
 */
@Component({
    standalone: false,
    changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-challenge',
    templateUrl: './challenge.component.html',
    styleUrls: ['./challenge.component.scss'],
})
export class ChallengeComponent implements OnInit {
    pin: string;
    /** The page's language: the link's (/he/... is Hebrew), then the game's once it is known. */
    locale = 'en';
    card: ChallengeCard;
    loading = true;
    over: boolean;
    starting: boolean;
    errorMsg: string;
    private via: string;

    constructor(private activatedRoute: ActivatedRoute, private router: Router, private apiService: ApiService) { }

    ngOnInit() {
        this.apiService.warmUpSignIn();
        this.pin = String(this.activatedRoute.snapshot.params['pin'] || '').toUpperCase();
        this.locale = /^\/he\//.test(this.router.url) ? 'he' : 'en';
        const via = (this.activatedRoute.snapshot.queryParams || {})['via'];
        this.via = typeof via === 'string' ? via : null;
        this.load();
    }

    private async load() {
        let card: ChallengeCard = null;
        try {
            card = /^[A-Z]{1,12}$/.test(this.pin) ? readCard((await this.apiService.challengeOf(this.pin)).challenge) : null;
        } catch (e) {
            reportError(e, 'challengeOf', { pin: this.pin });
        }
        this.card = card;
        this.over = !card;
        this.loading = false;
        if (card) {
            this.locale = card.locale;
        }
        this.count(card ? 'seen' : 'seen-over');
    }

    get t(): ChallengeStrings {
        return challengeWords(this.locale);
    }

    get rtl() {
        return this.locale === 'he';
    }

    /** The score to beat: the table's average a player (challenge.ts, tableAverage). */
    get toBeat(): number {
        return this.card ? cardAverage(this.card) : 0;
    }

    get table() {
        return this.card ? this.t.table(this.card.host, this.card.played) : '';
    }

    private count(method: string) {
        if (this.card && this.card.test) {
            return;
        }
        if (!/^[A-Z]{1,12}$/.test(this.pin)) {
            return;
        }
        this.apiService.logShare(CHALLENGE_CONTENT, method, { crew: this.pin, locale: this.locale });
    }

    /** START THE CHALLENGE: a game on the same questions, hosted from this browser, then its nickname page. */
    async start() {
        if (!this.card || this.starting) {
            return;
        }
        this.starting = true;
        this.errorMsg = '';
        this.count('start');
        try {
            const resp = await this.apiService.createGame(this.card.locale, this.card.questions, undefined,
                challengeCampaign(this.via), this.card.from);
            markHosted(resp.pin);
            markVisit('create');
            this.router.navigate([this.rtl ? '/he/join-game' : '/join-game', resp.pin]);
        } catch (err) {
            this.starting = false;
            if (err && err.code === 'CHALLENGE_OVER') {
                this.card = null;
                this.over = true;
                return;
            }
            reportError(err, 'createGame', { challenge: this.pin });
            this.errorMsg = this.t.error;
        }
    }

    /** A challenge that is over: the Create page, tagged. */
    newGame() {
        this.router.navigate(['/create-game'], { queryParams: { via: CHALLENGE_OVER_TAG, lang: this.locale } });
    }
}
