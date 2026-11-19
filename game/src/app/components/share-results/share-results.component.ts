import { ApiService } from './../../services/api.service';
import { SessionService } from './../../services/session.service';
import { ShareService } from './../../services/share.service';
import { CardPlayer, ResultsCardService } from './../../services/results-card.service';
import { Component, EventEmitter, Input, Output, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { STORY_VIA, StoryLie, storyLie, storyWords } from './story-card';

const sheetStrings = {
    en: { shareResults: 'SHARE RESULTS', share: 'SHARE', whatsapp: 'WHATSAPP', saveImage: 'SAVE IMAGE', done: 'DONE',
        copied: 'Copied! Paste it anywhere.', cardAlt: 'Final scores card' },
    he: { shareResults: 'שיתוף התוצאות', share: 'שיתוף', whatsapp: 'וואטסאפ', saveImage: 'שמירת התמונה', done: 'סיום',
        copied: 'הועתק! אפשר להדביק בכל מקום.', cardAlt: 'כרטיס התוצאות' },
};

/**
 * After the final scoreboard: turn the results into a picture people want to post,
 * with the site address on it, and share it.
 * Each send is counted in BigQuery's shares table as content_type "results".
 *
 * Under it, POST TO YOUR STORY: a tall card of this player's own best lie (story-card.ts) through the
 * phone's share sheet as an image, or saved where a phone cannot share files. Its link carries
 * ?via=story; each press is a shares row, results / story.
 */
@Component({
    standalone: false,
    changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-share-results',
    templateUrl: './share-results.component.html',
    styleUrls: ['./share-results.component.scss'],
})
export class ShareResultsComponent implements OnInit, OnDestroy {
    @Input() pin: string;
    @Input() players: CardPlayer[];
    @Input() label: string;
    /** The sheet opened (true) or closed (false): the final screen keeps the player here while it is open. */
    @Output() sheet = new EventEmitter<boolean>();
    locale = 'en';
    pack: string = null;
    open: boolean;
    loading: boolean;
    copied: boolean;
    blob: Blob;
    file: File;
    previewUrl: SafeUrl;
    private objectUrl: string;
    /** The story card: drawn once the game's language is known, so a press can share at once. */
    storyBlob: Blob;
    storyFile: File;
    storyBusy: boolean;
    storySaved: boolean;
    private storyDrawing: Promise<void>;
    private destroyed: boolean;

    constructor(
        private apiService: ApiService,
        private sessionService: SessionService,
        private shareService: ShareService,
        private resultsCardService: ResultsCardService,
        private sanitizer: DomSanitizer,
    ) { }

    ngOnInit() {
        this.apiService.getGameLocale(this.pin).then(locale => {
            this.locale = locale || 'en';
            // Drawn a moment after the screen settles: the share sheet must open within the press.
            setTimeout(() => this.drawStory(), 800);
        });
        this.apiService.getGamePack(this.pin).then(pack => this.pack = pack || null);
    }

    ngOnDestroy() {
        this.destroyed = true;
        if (this.objectUrl) {
            URL.revokeObjectURL(this.objectUrl);
        }
    }

    get ui() {
        return sheetStrings[this.locale === 'he' ? 'he' : 'en'];
    }

    /** This phone's row: by player id when the final screen marked it, else by nickname. */
    private myIndex(players: CardPlayer[], me: string) {
        const marked = players.findIndex(p => !!p.me);
        if (marked >= 0 || players.some(p => p.me === false)) {
            return marked;
        }
        return me ? players.findIndex(p => (p.nickname || '').toLowerCase() === me.toLowerCase()) : -1;
    }

    get me(): string {
        const user = !this.sessionService.presenter && this.sessionService.user;
        return user ? user.nickname : undefined;
    }

    get text() {
        const t = this.shareService.strings(this.locale);
        const players = this.players || [];
        const me = this.me;
        const idx = this.myIndex(players, me);

        if (idx >= 0) {
            const best = players[idx].best;
            const lie = best && best.text && best.fooled ? t.bestLieText(best.text.toUpperCase(), best.fooled) + ' ' : '';
            // Ties share a place: the final screen gives each player their place.
            const place = players[idx].place || idx + 1;
            return lie + t.resultsText(place, players.length, players[idx].score || 0);
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
        this.sheet.emit(true);
        this.copied = false;
        this.shareService.track('open', 'results');

        if (!this.blob) {
            this.loading = true;
            try {
                this.blob = await this.resultsCardService.render(this.players || [], this.me, this.locale, this.pack,
                    this.myIndex(this.players || [], this.me));
                this.file = new File([this.blob], 'bullshit-results.png', { type: 'image/png' });
                this.objectUrl = URL.createObjectURL(this.blob);
                this.previewUrl = this.sanitizer.bypassSecurityTrustUrl(this.objectUrl);
            } catch (e) {
                console.log(e);
            }
            this.loading = false;
        }
    }

    /** This player's lie for the story card, or null: then there is no story button. */
    get story(): StoryLie | null {
        return storyLie(this.players || []);
    }

    get storyUi() {
        return storyWords(this.locale);
    }

    get storyUrl() {
        return this.shareService.siteUrl(this.locale, STORY_VIA);
    }

    private drawStory(): Promise<void> {
        const lie = this.story;
        if (!lie || this.destroyed) {
            return Promise.resolve();
        }
        if (!this.storyDrawing) {
            this.storyDrawing = this.resultsCardService.renderStory(lie, this.locale)
                .then(blob => {
                    this.storyBlob = blob;
                    this.storyFile = new File([blob], this.locale === 'he' ? 'bullshit-story-he.png' : 'bullshit-story.png',
                        { type: 'image/png' });
                })
                .catch(e => {
                    console.log(e);
                    this.storyDrawing = null;
                });
        }
        return this.storyDrawing;
    }

    /**
     * POST TO YOUR STORY: the card goes to the share sheet as an image (Instagram, WhatsApp Status...),
     * with the tagged link as its text. A phone that cannot share files saves the picture instead.
     */
    async postStory() {
        if (this.storyBusy) {
            return;
        }
        this.storySaved = false;
        this.apiService.logShare('results', 'story', { locale: this.locale === 'he' ? 'he' : 'en' });
        if (!this.storyBlob) {
            this.storyBusy = true;
            await this.drawStory();
            this.storyBusy = false;
        }
        if (!this.storyBlob) {
            return;
        }
        const files = [this.storyFile];
        if (this.shareService.canShareFiles(files)) {
            try {
                await (navigator as any).share({ files, text: `${this.storyUi.shareText} ${this.storyUrl}` });
                return;
            } catch (e) {
                if (e && e.name === 'AbortError') {
                    return;
                }
            }
        }
        this.shareService.download(this.storyBlob, this.storyFile.name);
        this.storySaved = true;
    }

    close() {
        this.open = false;
        this.sheet.emit(false);
    }

    private count(method: 'whatsapp' | 'native' | 'copy' | 'download') {
        this.apiService.logShare('results', method, { locale: this.locale === 'he' ? 'he' : 'en' });
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
        if (result === 'shared') {
            this.count('native');
        } else if (result === 'copied') {
            this.count('copy');
        }
    }

    save() {
        if (this.blob) {
            this.shareService.download(this.blob, 'bullshit-results.png');
            this.count('download');
        }
    }

    whatsapp() {
        this.shareService.track('whatsapp', 'results');
        this.count('whatsapp');
    }
}
