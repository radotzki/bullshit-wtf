import { ApiService } from './../../services/api.service';
import { SessionService } from './../../services/session.service';
import { ShareService } from './../../services/share.service';
import { CardPlayer, ResultsCardService } from './../../services/results-card.service';
import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

/**
 * After the final scoreboard: turn the results into a picture people want to post,
 * with the site address on it, and share it.
 */
@Component({
    selector: 'app-share-results',
    templateUrl: './share-results.component.html',
    styleUrls: ['./share-results.component.scss'],
})
export class ShareResultsComponent implements OnInit, OnDestroy {
    @Input() pin: string;
    @Input() players: CardPlayer[];
    locale = 'en';
    open: boolean;
    loading: boolean;
    copied: boolean;
    blob: Blob;
    file: File;
    previewUrl: SafeUrl;
    private objectUrl: string;

    constructor(
        private apiService: ApiService,
        private sessionService: SessionService,
        private shareService: ShareService,
        private resultsCardService: ResultsCardService,
        private sanitizer: DomSanitizer,
    ) { }

    ngOnInit() {
        this.apiService.getGameLocale(this.pin).then(locale => this.locale = locale || 'en');
    }

    ngOnDestroy() {
        if (this.objectUrl) {
            URL.revokeObjectURL(this.objectUrl);
        }
    }

    get me(): string {
        const user = !this.sessionService.presenter && this.sessionService.user;
        return user ? user.nickname : undefined;
    }

    get text() {
        const t = this.shareService.strings(this.locale);
        const players = this.players || [];
        const me = this.me;
        const idx = me ? players.findIndex(p => (p.nickname || '').toLowerCase() === me.toLowerCase()) : -1;

        if (idx >= 0) {
            return t.resultsText(idx + 1, players.length, players[idx].score || 0);
        }

        const winner = players[0];
        return t.groupResultsText(winner ? winner.nickname : '', winner ? winner.score || 0 : 0);
    }

    get siteUrl() {
        return this.shareService.siteUrl(this.locale, 'results');
    }

    get whatsappUrl() {
        return this.shareService.whatsappUrl(this.text, this.siteUrl);
    }

    get canShare() {
        return this.shareService.canShare;
    }

    async openSheet() {
        this.open = true;
        this.copied = false;
        this.shareService.track('open', 'results');

        if (!this.blob) {
            this.loading = true;
            try {
                this.blob = await this.resultsCardService.render(this.players || [], this.me, this.locale);
                this.file = new File([this.blob], 'bullshit-results.png', { type: 'image/png' });
                this.objectUrl = URL.createObjectURL(this.blob);
                this.previewUrl = this.sanitizer.bypassSecurityTrustUrl(this.objectUrl);
            } catch (e) {
                console.log(e);
            }
            this.loading = false;
        }
    }

    close() {
        this.open = false;
    }

    async share() {
        const t = this.shareService.strings(this.locale);
        const result = await this.shareService.share({
            title: t.resultsTitle,
            text: this.text,
            url: this.siteUrl,
            files: this.file ? [this.file] : undefined,
        }, 'results');
        this.copied = result === 'copied';
    }

    save() {
        if (this.blob) {
            this.shareService.download(this.blob, 'bullshit-results.png');
        }
    }

    whatsapp() {
        this.shareService.track('whatsapp', 'results');
    }
}
