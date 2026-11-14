/**
 * Help for a host who waits in the lobby alone, or with one guest: a 50/50 test.
 *
 * Why: in 6 to 13 November 2026, 21 of 69 browsers that opened a lobby stayed alone and left, 13 of
 * them on a computer. A computer host got a table 36% of the time, a phone host 74%, and none of the
 * lone computer hosts pressed an invite button. Each lobby that fills is a new group.
 *
 * The new half, while the lobby holds one or two players:
 * - on a phone the invite stays on the page with one guest in (today it folds into a button), with
 *   COPY LINK beside WhatsApp and the share sheet;
 * - on a computer the invite is a card for the room and the call: a big QR code, "Friends join on
 *   their phones", the short link to read out, COPY LINK first;
 * - one light line says the game is best with 4 or more. START is never held back by it.
 * From the third player on, both halves show today's lobby.
 *
 * Which lobbies: the host's own page (phone or computer), with no big screen. Which half: one bit
 * of a hash of the PIN, the way the staged reveal's half follows the PIN (functions: big-reveal.ts),
 * so BigQuery can work it out wherever the PIN is. The page counts what it showed and what was
 * pressed in `shares` as content_type "lobby-help" (see SHARE_METHODS in functions: analytics.ts).
 *
 * Kept free of Angular so it can be tested in Node.
 */

/** The lobby shows the help while it holds this many players or fewer. */
export const HELP_MAX_PLAYERS = 2;
/** "Best with 4 or more." */
export const BEST_WITH = 4;
/** A tester's switch: localStorage.BS_LONE_HOST = 'new' or 'classic' puts this browser's lobbies in that half. */
export const HALF_OVERRIDE_KEY = 'BS_LONE_HOST';

export type HelpHalf = 'new' | 'classic';
export type HostDevice = 'phone' | 'computer';

const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/**
 * SHA-256 of a text of plain letters, digits and punctuation (code points under 128), as 32 bytes.
 * The browser's own SHA-256 answers later and only on a secure page; the lobby needs the half at once.
 */
/* eslint-disable no-bitwise -- SHA-256 is bit arithmetic */
export function sha256Ascii(text: string): number[] {
    const bytes: number[] = [];
    for (let i = 0; i < text.length; i++) {
        bytes.push(text.charCodeAt(i) & 0x7f);
    }
    const bits = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) {
        bytes.push(0);
    }
    bytes.push(0, 0, 0, 0, (bits >>> 24) & 0xff, (bits >>> 16) & 0xff, (bits >>> 8) & 0xff, bits & 0xff);

    const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
    const w = new Array<number>(64);

    for (let at = 0; at < bytes.length; at += 64) {
        for (let i = 0; i < 16; i++) {
            const j = at + i * 4;
            w[i] = ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) >>> 0;
        }
        for (let i = 16; i < 64; i++) {
            const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
            const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
        }
        let [a, b, c, d, e, f, g, hh] = h;
        for (let i = 0; i < 64; i++) {
            const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            const ch = (e & f) ^ (~e & g);
            const t1 = (hh + s1 + ch + K[i] + w[i]) >>> 0;
            const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const t2 = (s0 + maj) >>> 0;
            hh = g;
            g = f;
            f = e;
            e = (d + t1) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (t1 + t2) >>> 0;
        }
        [a, b, c, d, e, f, g, hh].forEach((v, i) => h[i] = (h[i] + v) >>> 0);
    }

    const out: number[] = [];
    h.forEach(v => out.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff));
    return out;
}
/* eslint-enable no-bitwise */

/**
 * Which half a lobby falls in: true for the new help. The lowest bit of the first byte of
 * SHA-256('lone-host:' + PIN, in capitals). In BigQuery, with the PIN in column pin:
 *   MOD(TO_CODE_POINTS(SHA256(CONCAT('lone-host:', UPPER(pin))))[OFFSET(0)], 2) = 1
 * A prefix of its own, so a lobby's half says nothing about its half in any other test.
 */
export function loneHostHalf(pin: string): boolean {
    return sha256Ascii('lone-host:' + String(pin || '').toUpperCase())[0] % 2 === 1;
}

/**
 * A phone or a computer, as the lobby lays itself out. A phone or a tablet has WhatsApp and a share
 * sheet in the hand. A computer is a screen friends can see or a call they are on. A narrow window
 * on a computer keeps the phone's layout: the card needs the width.
 */
export function hostDevice(userAgent: string, width: number): HostDevice {
    if (/android|iphone|ipad|ipod|mobile/i.test(String(userAgent || ''))) {
        return 'phone';
    }
    return typeof width === 'number' && width >= 700 ? 'computer' : 'phone';
}

export interface LoneHostInput {
    pin: string;
    /** This page is the game's known host (see LobbyHostView.isHost). */
    isHost: boolean;
    isPresenter: boolean;
    hasPresenter: boolean;
    playerCount: number;
    userAgent: string;
    width: number;
    /** The tester's switch (HALF_OVERRIDE_KEY), as read from the phone's storage. */
    override?: string | null;
}

export interface LoneHostHelp {
    /** This lobby is in the test: the host's own page, no big screen. Presses are counted while it is. */
    inTest: boolean;
    half: HelpHalf;
    device: HostDevice;
    /** One or two players in: the help is due (the new half shows it, the other half is counted as its match). */
    due: boolean;
    /** Show the new help now. */
    show: boolean;
    /** The value counted once per lobby when the help is first due: "seen-new-computer" and the like. */
    seen: string;
}

export function loneHostHelp(input: LoneHostInput): LoneHostHelp {
    const inTest = !!input.isHost && !input.isPresenter && !input.hasPresenter && !!input.pin;
    const half: HelpHalf = input.override === 'new' || input.override === 'classic'
        ? input.override
        : (loneHostHalf(input.pin) ? 'new' : 'classic');
    const device = hostDevice(input.userAgent, input.width);
    const due = inTest && input.playerCount >= 1 && input.playerCount <= HELP_MAX_PLAYERS;
    return { inTest, half, device, due, show: due && half === 'new', seen: `seen-${half}-${device}` };
}

const strings = {
    en: {
        title: 'Friends join on their phones',
        scanOrOpen: 'They scan the code, or open',
        call: 'On a call? Paste the link in the chat.',
        room: 'In one room? Turn this screen so everyone can scan it.',
        best: 'Best with 4 or more players.',
        bestWithOne: 'Two can play, but it\'s best with 4 or more. Invite one or two more.',
    },
    he: {
        title: 'החברים מצטרפים מהטלפון',
        scanOrOpen: 'סורקים את הקוד, או פותחים בטלפון את',
        call: 'בשיחת וידאו? הדביקו את הקישור בצ\'אט.',
        room: 'כולם באותו חדר? סובבו את המסך כדי שכולם יוכלו לסרוק.',
        best: 'הכי כיף עם 4 שחקנים ומעלה.',
        bestWithOne: 'אפשר לשחק בשניים, אבל הכי כיף עם 4 ומעלה. הזמינו עוד אחד או שניים.',
    },
};

export type LoneHostStrings = typeof strings.en;

export function loneHostStrings(locale: string): LoneHostStrings {
    return locale === 'he' ? strings.he : strings.en;
}

/** The light line under the invite: alone, or with one guest in. */
export function bestLine(playerCount: number, locale: string): string {
    const t = loneHostStrings(locale);
    return playerCount >= 2 ? t.bestWithOne : t.best;
}
