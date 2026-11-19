import { Component, Input, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { ApiService } from './../../services/api.service';
import { SessionService } from './../../services/session.service';
import {
    CHALLENGE_CONTENT, ChallengeCard, ChallengeRow, ChallengeStrings, cardAverage, challengeWords, houseCounted, ourAverage, readCard,
    sizesLine, topRows, verdict, verdictLine,
} from './challenge';

/**
 * The side-by-side scores at the end of a game played against a challenge (see challenge.ts): the other
 * table's final scores beside this one's, and who won by each table's average a player (fair across sizes). The other table comes
 * from the server (validateGameName's `versus`, copied from that game when this one was made); a game
 * that was no challenge shows nothing. Names are shown as text.
 */
@Component({
    standalone: false,
    changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-challenge-versus',
    templateUrl: './challenge-versus.component.html',
    styleUrls: ['./challenge-versus.component.scss'],
})
export class ChallengeVersusComponent implements OnInit {
    @Input() pin: string;
    @Input() locale = 'en';
    /** This table's final scores, best first (the final screen's players). */
    @Input() players: { nickname: string; score: number; place: number; me?: boolean }[] = [];

    card: ChallengeCard;

    constructor(private apiService: ApiService, private sessionService: SessionService) { }

    ngOnInit() {
        if (!this.pin) {
            return;
        }
        this.apiService.challengeOf(this.pin).then(r => {
            this.card = readCard(r && r.versus);
            // Counted once a page, from a player's phone (not the big screen); a test challenge sends none.
            if (this.card && !this.card.test && !this.sessionService.presenter) {
                this.apiService.logShare(CHALLENGE_CONTENT, 'seen-versus', { crew: this.card.from, locale: this.rtl ? 'he' : 'en' });
            }
        }).catch(() => null);
    }

    get t(): ChallengeStrings {
        return challengeWords(this.locale);
    }

    get rtl() {
        return this.locale === 'he';
    }

    private get ourScores(): number[] {
        return (this.players || []).map(p => Number(p.score) || 0);
    }

    /** This table's points a player, the number the verdict compares (the server's when it sent one). */
    get ourAverage(): number {
        return ourAverage(this.ourScores, this.card);
    }

    /** The server counted house lies like a friend's lie: say so, since the big numbers aren't the rows' mean. */
    get houseNote(): string {
        return houseCounted(this.card, true) ? this.t.houseNote : '';
    }

    get theirAverage(): number {
        return this.card ? cardAverage(this.card) : 0;
    }

    get line(): string {
        return this.card ? verdictLine(this.ourScores, this.card, this.locale) : '';
    }

    /** How it was judged, and both tables' sizes. */
    get sizes(): string {
        return this.card ? sizesLine((this.players || []).length, this.card, this.locale) : '';
    }

    get outcome(): string {
        return this.card ? verdict(this.ourAverage, this.theirAverage).verdict : '';
    }

    get ours(): { rows: ChallengeRow[]; more: number } {
        return topRows((this.players || []).map(p => ({ name: p.nickname, score: Number(p.score) || 0, place: p.place })));
    }

    get theirs(): { rows: ChallengeRow[]; more: number } {
        return this.card ? topRows(this.card.rows) : { rows: [], more: 0 };
    }

    /** Players of the other table not in its rows here. */
    get theirMore(): number {
        return this.card ? Math.max(0, this.card.played - this.theirs.rows.length) : 0;
    }
}
