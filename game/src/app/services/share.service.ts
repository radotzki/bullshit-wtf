import { Injectable } from '@angular/core';

declare var gtag;

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
        inviteText: (pin: string) => `Come play Bullshit with me! Tap the link to join, or enter PIN ${pin} at bullshit.wtf`,
        resultsTitle: 'Bullshit results',
        resultsText: (place: number, total: number, score: number) =>
            place === 1
                ? `I won at Bullshit with ${score} points! Think you can fool me? Play free at bullshit.wtf`
                : `I came ${ordinal(place)} of ${total} at Bullshit with ${score} points. Can you beat that? Play free at bullshit.wtf`,
        groupResultsText: (winner: string, score: number) =>
            `${winner} won our game of Bullshit with ${score} points. Can you fool your friends? Play free at bullshit.wtf`,
    },
    he: {
        inviteTitle: 'בואו לשחק בולשיט',
        inviteText: (pin: string) => `בואו לשחק איתי בולשיט! לחצו על הקישור כדי להצטרף, או הקלידו את הקוד ${pin} ב-bullshit.wtf`,
        resultsTitle: 'תוצאות בולשיט',
        resultsText: (place: number, total: number, score: number) =>
            place === 1
                ? `ניצחתי בבולשיט עם ${score} נקודות! חושבים שתצליחו לעבוד עליי? שחקו בחינם ב-bullshit.wtf`
                : `הגעתי למקום ${place} מתוך ${total} בבולשיט עם ${score} נקודות. תצליחו יותר? שחקו בחינם ב-bullshit.wtf`,
        groupResultsText: (winner: string, score: number) =>
            `הניצחון במשחק הבולשיט שלנו הלך ל-${winner} עם ${score} נקודות. תצליחו לעבוד על החברים? שחקו בחינם ב-bullshit.wtf`,
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
        return strings[locale === 'he' ? 'he' : 'en'];
    }

    /**
     * Link that drops a friend straight onto the nickname step of a game.
     * Hebrew games get the /he/ prefix so link previews show in Hebrew.
     * `via` tags where the link came from (qr, link) so joins can be counted later.
     */
    inviteUrl(pin: string, locale: string, via: 'link' | 'qr') {
        const prefix = locale === 'he' ? '/he' : '';
        return `${SITE}${prefix}/join-game/${pin.toUpperCase()}?via=${via}`;
    }

    /** Home page link, in the game's language, tagged with where it was shared from. */
    siteUrl(locale: string, via: string) {
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

    /** Opens the native share sheet when there is one, otherwise copies the text and link. */
    async share(payload: SharePayload, contentType: string): Promise<ShareResult> {
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

    track(method: string, contentType: string) {
        try {
            gtag('event', 'share', { method, content_type: contentType });
        } catch (e) { }
    }
}
