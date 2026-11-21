import { ApiService } from './../../services/api.service';
import { ShareService } from './../../services/share.service';
import { Component, Input, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { gameStrings, GameStrings } from './../../pages/game-strings';
import { loneHostStrings, LoneHostStrings } from './../../pages/game-staging/lone-host';
import { inDiscordActivity } from './../../portal/portal';
import { canInviteToCall, discordStrings, inviteToCall } from './../../portal/discord';

/**
 * Lobby invite: a QR code and a shareable join link for the game PIN.
 * On a presenter screen it is always shown, big, so people in the room can scan it.
 * On a phone it is a button that opens a sheet with the QR, share, WhatsApp and copy.
 * With `inline` (the host is alone in the lobby) the sheet's content is shown on the page instead.
 * Each send is counted in BigQuery's shares table as content_type "invite".
 *
 * The lone-host help, a 50/50 test (pages/game-staging/lone-host.ts): with `help` the inline invite is
 * the new half's, for a phone (COPY LINK beside the others) or a computer (a card with a big QR code
 * and the short link). With `counted` (the host's lobby is in the test, either half) each send is
 * also counted as content_type "lobby-help", with the PIN.
 */
@Component({
    standalone: false,
    changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-invite',
    templateUrl: './invite.component.html',
    styleUrls: ['./invite.component.scss'],
})
export class InviteComponent implements OnInit {
    @Input() pin: string;
    @Input() presenter: boolean;
    @Input() inline: boolean;
    /** The lone-host help's layout, or null for today's invite. */
    @Input() help: 'phone' | 'computer' | null = null;
    /** With `help`: a guest is in, so the players need the room. The phone's QR code is left out. */
    @Input() compact: boolean;
    /** This lobby is in the lone-host test: count each send as "lobby-help" too. */
    @Input() counted: boolean;
    h: LoneHostStrings = loneHostStrings('en');
    locale = 'en';
    open: boolean;
    copied: boolean;
    t: any;
    /** The invite's own buttons and labels, in the game's language. */
    g: GameStrings = gameStrings('en');
    /** Shown once the game's language is known, so a Hebrew game never flashes English. */
    ready = false;
    /** The Discord Activity (portal/discord.ts): the invite is Discord's own dialog, nothing else. */
    discord = inDiscordActivity();

    constructor(
        private apiService: ApiService,
        private shareService: ShareService,
    ) { }

    ngOnInit() {
        this.t = this.shareService.strings(this.locale);
        this.apiService.getGameLocale(this.pin).then(locale => {
            this.locale = locale || 'en';
            this.t = this.shareService.strings(this.locale);
            this.g = gameStrings(this.locale);
            this.h = loneHostStrings(this.locale);
            this.ready = true;
            // The host's phone, as its lobby opens: wake the invite link's preview before it is shared.
            // Only the host's (it has joined, so the preview names it); a guest's phone could cache the
            // nameless invite for a minute before the host is in.
            if (!this.presenter && this.apiService.holdsHostKey(this.pin)) {
                this.shareService.warmInvite(this.pin, this.locale);
            }
        }, () => this.ready = true);
    }

    /** The Discord invite's words, in the game's language. */
    get d() {
        return discordStrings(this.locale);
    }

    /** Discord's invite dialog can open here (the SDK is ready, in a server's voice channel). */
    get canInviteToCall() {
        return canInviteToCall();
    }

    /** INVITE TO THIS CALL: Discord's own invite dialog. Counted as an invite share, by "discord". */
    async inviteToCall() {
        if (await inviteToCall()) {
            this.apiService.logShare('invite', 'discord', { locale: this.locale === 'he' ? 'he' : 'en' });
        }
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
            // Whoever opens the sheet is about to share: make the preview ready (once every few minutes).
            this.shareService.warmInvite(this.pin, this.locale);
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
        if (result === 'shared') {
            this.count('native');
        } else if (result === 'copied') {
            this.count('copy');
        }
    }

    async copy() {
        this.copied = await this.shareService.copy(this.linkUrl);
        if (this.copied) {
            this.shareService.track('copy', 'invite');
            this.count('copy');
        }
    }

    whatsapp() {
        this.shareService.track('whatsapp', 'invite');
        this.count('whatsapp');
    }

    private count(method: 'whatsapp' | 'native' | 'copy') {
        this.apiService.logShare('invite', method, { locale: this.locale });
        if (this.counted) {
            this.apiService.logShare('lobby-help', method, { crew: this.pinUpper, locale: this.locale });
        }
    }
}
