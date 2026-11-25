import { Injectable } from '@angular/core';
import { warmInviteLink } from './invite-warm';
import { PORTAL_SHARE_STRINGS, inPortal, portalGameLink, portalInviteUrl } from '../portal/portal';

export type Locale = 'en' | 'he';

export interface SharePayload {
    title: string;
    text: string;
    url?: string;
    files?: File[];
}

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

const SITE = 'https://bullshit.wtf';

const strings = {
    en: {
        inviteTitle: 'Join my Bullshit game',
        scanHint: 'or let them scan this',
        inviteText: (pin: string, pack?: string) => (pack === 'hanukkah'
            ? `Come play a Hanukkah game of Bullshit with me! Tap the link to join, or enter PIN ${pin} at bullshit.wtf`
            : `Come play Bullshit with me! Tap the link to join, or enter PIN ${pin} at bullshit.wtf`),
        resultsTitle: 'Bullshit results',
        resultsText: (place: number, total: number, score: number, pack?: string) => (pack === 'hanukkah'
            ? (place === 1
                ? `I won our Hanukkah game night of Bullshit with ${score} points! Think you can fool me? Play free at bullshit.wtf`
                : `I came ${ordinal(place)} of ${total} at our Hanukkah game night of Bullshit with ${score} points. `
                    + 'Can you beat that? Play free at bullshit.wtf')
            : place === 1
                ? `I won at Bullshit with ${score} points! Think you can fool me? Play free at bullshit.wtf`
                : `I came ${ordinal(place)} of ${total} at Bullshit with ${score} points. Can you beat that? Play free at bullshit.wtf`),
        groupResultsText: (winner: string, score: number, pack?: string) => (pack === 'hanukkah'
            ? `${winner} won our Hanukkah game night of Bullshit with ${score} points. Can you fool your friends? Play free at bullshit.wtf`
            : `${winner} won our game of Bullshit with ${score} points. Can you fool your friends? Play free at bullshit.wtf`),
        bestLieText: (lie: string, fooled: number) =>
            `My lie "${lie}" fooled ${fooled === 1 ? '1 friend' : `${fooled} friends`}.`,
    },
    he: {
        inviteTitle: 'בואו לשחק בולשיט',
        scanHint: 'או שיסרקו את זה',
        // A Hanukkah game says so: the family chat's text is the first thing a grandparent reads.
        inviteText: (pin: string, pack?: string) => (pack === 'hanukkah'
            ? `בואו לשחק איתי בולשיט, משחק חנוכה! לחצו על הקישור כדי להצטרף, או הקלידו את הקוד ${pin} ב-bullshit.wtf`
            : `בואו לשחק איתי בולשיט! לחצו על הקישור כדי להצטרף, או הקלידו את הקוד ${pin} ב-bullshit.wtf`),
        resultsTitle: 'תוצאות בולשיט',
        // A Hanukkah game's results say it was the family's Hanukkah night (no question or truth in them).
        resultsText: (place: number, total: number, score: number, pack?: string) => (pack === 'hanukkah'
            ? (place === 1
                ? `ניצחתי בערב הבולשיט של חנוכה עם ${score} נקודות! חושבים שתצליחו לעבוד עליי? שחקו בחינם ב-bullshit.wtf`
                : `הגעתי למקום ${place} מתוך ${total} בערב הבולשיט של חנוכה, עם ${score} נקודות. תצליחו יותר? שחקו בחינם ב-bullshit.wtf`)
            : place === 1
                ? `ניצחתי בבולשיט עם ${score} נקודות! חושבים שתצליחו לעבוד עליי? שחקו בחינם ב-bullshit.wtf`
                : `הגעתי למקום ${place} מתוך ${total} בבולשיט עם ${score} נקודות. תצליחו יותר? שחקו בחינם ב-bullshit.wtf`),
        groupResultsText: (winner: string, score: number, pack?: string) => (pack === 'hanukkah'
            ? `הניצחון בערב הבולשיט של חנוכה הלך ל-${winner} עם ${score} נקודות. תצליחו לעבוד על החברים? שחקו בחינם ב-bullshit.wtf`
            : `הניצחון במשחק הבולשיט שלנו הלך ל-${winner} עם ${score} נקודות. תצליחו לעבוד על החברים? שחקו בחינם ב-bullshit.wtf`),
        bestLieText: (lie: string, fooled: number) =>
            `השקר שלי "${lie}" עבד על ${fooled === 1 ? 'חבר אחד' : `${fooled} חברים`}.`,
    },
};

function ordinal(n: number) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Everything to do with getting the game in front of new players:
 * invite links, native share sheets, clipboard and WhatsApp fallbacks.
 */
@Injectable()
export class ShareService {

    strings(locale: string) {
        const lang = locale === 'he' ? 'he' : 'en';
        // The CrazyGames version: its texts send no one to bullshit.wtf (portal/portal.ts).
        return inPortal() ? Object.assign({}, strings[lang], PORTAL_SHARE_STRINGS[lang]) : strings[lang];
    }

    /**
     * Link that drops a friend straight onto the nickname step of a game.
     * Hebrew games get the /he/ prefix so link previews show in Hebrew.
     * `via` tags where the link came from (qr, link) so joins can be counted later.
     */
    inviteUrl(pin: string, locale: string, via: 'link' | 'qr') {
        if (inPortal()) {
            // CrazyGames' own invite link for this game ('' until CrazyGames has made it).
            return portalInviteUrl(pin);
        }
        const prefix = locale === 'he' ? '/he' : '';
        return `${SITE}${prefix}/join-game/${pin.toUpperCase()}?via=${via}`;
    }

    /**
     * Fetch this game's invite link (the exact address the host shares) once in the background, so its
     * named preview is ready in the CDN before the host presses share. Counts as no visit or join
     * (see invite-warm.ts).
     */
    warmInvite(pin: string, locale: string) {
        if (!pin || inPortal()) {
            return;
        }
        let fetcher: any = null;
        try {
            fetcher = typeof window !== 'undefined' && typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
        } catch (e) { }
        warmInviteLink(this.inviteUrl(pin, locale, 'link'), fetcher);
    }

    /** Home page link, in the game's language, tagged with where it was shared from. */
    siteUrl(locale: string, via: string) {
        if (inPortal()) {
            // The game's page on CrazyGames, never the playable site ('' when unknown: text only).
            return portalGameLink();
        }
        return `${SITE}${locale === 'he' ? '/he' : '/'}?via=${via}`;
    }

    whatsappUrl(text: string, url?: string) {
        const message = url ? `${text}\n${url}` : text;
        return `https://wa.me/?text=${encodeURIComponent(message)}`;
    }

    canShareFiles(files: File[]) {
        const nav = navigator as any;
        try {
            return !!(nav.share && nav.canShare && nav.canShare({ files }));
        } catch (e) {
            return false;
        }
    }

    get canShare() {
        return !!(navigator as any).share;
    }

    /**
     * Opens the native share sheet when there is one, otherwise copies the text and link.
     * Pass a null contentType when the caller logs the share itself, so it is not counted twice.
     */
    async share(payload: SharePayload, contentType: string | null): Promise<ShareResult> {
        const nav = navigator as any;
        const data: any = { title: payload.title, text: payload.text };

        if (payload.url) {
            data.url = payload.url;
        }

        if (payload.files && this.canShareFiles(payload.files)) {
            data.files = payload.files;
        }

        if (nav.share) {
            try {
                await nav.share(data);
                this.track('native', contentType);
                return 'shared';
            } catch (e) {
                if (e && e.name === 'AbortError') {
                    return 'cancelled';
                }
            }
        }

        const copied = await this.copy(payload.url ? `${payload.text}\n${payload.url}` : payload.text);
        if (copied) {
            this.track('clipboard', contentType);
        }
        return copied ? 'copied' : 'failed';
    }

    async copy(text: string): Promise<boolean> {
        const nav = navigator as any;

        if (nav.clipboard && nav.clipboard.writeText) {
            try {
                await nav.clipboard.writeText(text);
                return true;
            } catch (e) { }
        }

        // Older browsers and non-secure contexts
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        let ok = false;
        try {
            ok = document.execCommand('copy');
        } catch (e) { }
        document.body.removeChild(textarea);
        return ok;
    }

    download(blob: Blob, filename: string) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.track('download', 'results');
    }

    /**
     * Used to send a Google Analytics event. That tag recorded nothing and is gone; counted shares
     * go to BigQuery through ApiService.logShare. Kept as a no-op so its callers need no change.
     */
    track(method: string, contentType: string | null) { }
}
