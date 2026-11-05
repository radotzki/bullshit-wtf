import { ApiService } from './../../services/api.service';
import { ShareService } from './../../services/share.service';
import { Component, Input, OnInit } from '@angular/core';

/**
 * Lobby invite: a QR code and a shareable join link for the game PIN.
 * On a presenter screen it is always shown, big, so people in the room can scan it.
 * On a phone it is a button that opens a sheet with the QR, share, WhatsApp and copy.
 */
@Component({
    selector: 'app-invite',
    templateUrl: './invite.component.html',
    styleUrls: ['./invite.component.scss'],
})
export class InviteComponent implements OnInit {
    @Input() pin: string;
    @Input() presenter: boolean;
    locale = 'en';
    open: boolean;
    copied: boolean;
    t: any;

    constructor(
        private apiService: ApiService,
        private shareService: ShareService,
    ) { }

    ngOnInit() {
        this.t = this.shareService.strings(this.locale);
        this.apiService.getGameLocale(this.pin).then(locale => {
            this.locale = locale || 'en';
            this.t = this.shareService.strings(this.locale);
        });
    }

    get pinUpper() {
        return (this.pin || '').toUpperCase();
    }

    get qrUrl() {
        return this.shareService.inviteUrl(this.pin, this.locale, 'qr');
    }

    get linkUrl() {
        return this.shareService.inviteUrl(this.pin, this.locale, 'link');
    }

    get displayUrl() {
        return this.linkUrl.replace('https://', '').replace(/\?.*$/, '');
    }

    get whatsappUrl() {
        return this.shareService.whatsappUrl(this.t.inviteText(this.pinUpper), this.linkUrl);
    }

    get canShare() {
        return this.shareService.canShare;
    }

    toggle() {
        this.open = !this.open;
        this.copied = false;
        if (this.open) {
            this.shareService.track('open', 'invite');
        }
    }

    async share() {
        const result = await this.shareService.share({
            title: this.t.inviteTitle,
            text: this.t.inviteText(this.pinUpper),
            url: this.linkUrl,
        }, 'invite');
        this.copied = result === 'copied';
    }

    async copy() {
        this.copied = await this.shareService.copy(this.linkUrl);
        if (this.copied) {
            this.shareService.track('copy', 'invite');
        }
    }

    whatsapp() {
        this.shareService.track('whatsapp', 'invite');
    }
}
