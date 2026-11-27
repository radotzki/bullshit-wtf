import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';
import { ApiService } from './../../services/api.service';
import { ShareService } from './../../services/share.service';
import { SCORES_CONTENT, ScoresStrings, ScoresWinner, scoresMessage, scoresUrl, scoresWords } from './send-scores';

/**
 * SEND THE SCORES TO THE GROUP, on the host's final screen (see send-scores.ts). The button is a plain
 * WhatsApp link, so the phone opens WhatsApp at once; "Share another way" opens the phone's share sheet,
 * or copies the text and link where there is none. Every send is counted in BigQuery's shares table
 * (content_type scores, the game's PIN in crew_id).
 */
@Component({
    standalone: false,
    changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-send-scores',
    templateUrl: './send-scores.component.html',
    styleUrls: ['./send-scores.component.scss'],
})
export class SendScoresComponent {
    @Input() pin: string;
    @Input() locale = 'en';
    @Input() winners: ScoresWinner[] = [];
    /** The share sheet opened (true) or closed (false): a started rematch waits for a host who is mid-send. */
    @Output() sheet = new EventEmitter<boolean>();

    sent: boolean;
    copied: boolean;

    constructor(
        private apiService: ApiService,
        private shareService: ShareService,
    ) { }

    get t(): ScoresStrings {
        return scoresWords(this.locale);
    }

    get rtl() {
        return this.locale === 'he';
    }

    get message() {
        return scoresMessage(this.winners, this.locale);
    }

    get url() {
        return scoresUrl(this.pin, this.locale);
    }

    get whatsappUrl() {
        return this.shareService.whatsappUrl(this.message, this.url);
    }

    private count(method: 'whatsapp' | 'native' | 'copy') {
        this.apiService.logShare(SCORES_CONTENT, method, { crew: String(this.pin || '').toUpperCase(), locale: this.rtl ? 'he' : 'en' });
    }

    /** The button is a plain link (phones block a window opened after a wait); this only counts it. */
    whatsapp() {
        this.count('whatsapp');
        this.sent = true;
    }

    async other() {
        this.sheet.emit(true);
        try {
            const result = await this.shareService.share({ title: this.t.title, text: this.message, url: this.url }, null);
            if (result === 'shared') {
                this.count('native');
                this.sent = true;
            } else if (result === 'copied') {
                this.count('copy');
                this.copied = true;
            }
        } finally {
            this.sheet.emit(false);
        }
    }
}
