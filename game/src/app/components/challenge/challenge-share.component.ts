import { Component, EventEmitter, Input, Output, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { ApiService } from './../../services/api.service';
import { ShareService } from './../../services/share.service';
import { reportError } from './../../sentry/sentry.module';
import {
    CHALLENGE_CONTENT, ChallengeCard, ChallengeMethod, ChallengeStrings, challengeUrl, challengeWords, readCard,
} from './challenge';

/**
 * CHALLENGE ANOTHER GROUP, on the final screen of a game of 2 or more players (see challenge.ts). The
 * button opens a sheet and, at the same moment, asks the server to open this game's challenge, so the
 * WhatsApp button is a plain link by the time it is pressed (phones block a window opened after a wait).
 * Every press is counted in BigQuery's shares table (content_type challenge, the game's PIN in crew_id).
 */
@Component({
    standalone: false,
    changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-challenge-share',
    templateUrl: './challenge-share.component.html',
    styleUrls: ['./challenge-share.component.scss'],
})
export class ChallengeShareComponent implements OnInit {
    @Input() pin: string;
    @Input() locale = 'en';
    /** The sheet opened (true) or closed (false): a started rematch waits for a player who is mid-send. */
    @Output() sheet = new EventEmitter<boolean>();

    open: boolean;
    making: boolean;
    failed: boolean;
    copied: boolean;
    /** The challenge, once the server has opened it. */
    card: ChallengeCard;
    /** The game's seasonal pack: a Hanukkah game's challenge message says so. */
    pack: string = null;

    constructor(private apiService: ApiService, private shareService: ShareService) { }

    ngOnInit() {
        if (this.pin) {
            this.apiService.getGamePack(this.pin).then(pack => this.pack = typeof pack === 'string' ? pack : null, () => { });
        }
    }

    get t(): ChallengeStrings {
        return challengeWords(this.locale);
    }

    get rtl() {
        return this.locale === 'he';
    }

    private count(method: string) {
        if (this.card && this.card.test) {
            return;
        }
        this.apiService.logShare(CHALLENGE_CONTENT, method, { crew: (this.pin || '').toUpperCase(), locale: this.rtl ? 'he' : 'en' });
    }

    openSheet() {
        this.open = true;
        this.copied = false;
        this.sheet.emit(true);
        this.makeChallenge().then(() => this.count('open'));
    }

    close() {
        this.open = false;
        this.sheet.emit(false);
    }

    /** Opens the challenge once: opening the sheet again is the same challenge and link. */
    async makeChallenge() {
        if (this.card || this.making) {
            return;
        }
        this.making = true;
        this.failed = false;
        try {
            const resp = await this.apiService.openChallenge(this.pin);
            this.card = readCard(resp && resp.challenge);
            if (!this.card) {
                throw new Error('no challenge');
            }
        } catch (err) {
            this.failed = true;
            if (!(err && (err.code === 'CHALLENGE_OVER' || err.code === 'NOT_A_PLAYER'))) {
                reportError(err, 'openChallenge', { pin: this.pin });
            }
        }
        this.making = false;
    }

    get ready() {
        return !!this.card;
    }

    get sheetText() {
        return this.card ? this.t.sheetText(this.card.top, this.card.questions) : '';
    }

    private message() {
        return this.card ? this.t.message(this.card.top, this.card.questions, this.pack) : '';
    }

    private url(method: ChallengeMethod) {
        return challengeUrl(this.pin, this.locale, method);
    }

    get whatsappUrl() {
        return this.ready ? this.shareService.whatsappUrl(this.message(), this.url('whatsapp')) : '';
    }

    get canShare() {
        return this.shareService.canShare;
    }

    /** WHATSAPP is a plain link; this only counts it. */
    whatsapp(event: Event) {
        if (!this.ready) {
            event.preventDefault();
            return;
        }
        this.count('whatsapp');
    }

    /** SHARE: the phone's share sheet (or, with none, the message and link copied). */
    async share() {
        if (!this.ready) {
            return;
        }
        const native = this.canShare;
        const result = await this.shareService.share({
            title: this.t.shareTitle(this.pack),
            text: this.message(),
            url: this.url(native ? 'native' : 'copy'),
        }, null);
        if (result === 'shared') {
            this.count('native');
        } else if (result === 'copied') {
            this.copied = true;
            this.count('copy');
        }
    }

    /** COPY LINK: the message and its link, to paste in the other group's chat. */
    async copy() {
        if (!this.ready) {
            return;
        }
        if (await this.shareService.copy(`${this.message()}\n${this.url('copy')}`)) {
            this.copied = true;
            this.count('copy');
        }
    }
}
