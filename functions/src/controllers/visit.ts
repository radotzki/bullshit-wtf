// One page view, from the visit beacon in game/src/index.html. Logged only (no IP, no player
// data), so the function log can tell "nobody came" from "phones came and the app never started".
export interface VisitRow {
    kind: 'stuck' | 'end';
    first: string;
    last: string;
    booted: boolean;
    ms: number;
    err: string;
    lang: string;
    ref: string;
    device: string;
    browser: string;
}

function text(v: any, max: number): string {
    return typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').slice(0, max) : '';
}

// A path of the game: letters, digits and / - _ only, so no query strings or tokens are logged.
function path(v: any): string {
    const p = text(v, 80);
    return /^\/[A-Za-z0-9\/_-]*$/.test(p) ? p : '';
}

export function deviceOf(ua: string): string {
    if (/iPad/.test(ua)) { return 'ipad'; }
    if (/iPhone|iPod/.test(ua)) { return 'iphone'; }
    if (/Android/.test(ua)) { return /Mobile/.test(ua) ? 'android' : 'android-tablet'; }
    if (/Macintosh/.test(ua)) { return 'mac'; }
    if (/Windows/.test(ua)) { return 'windows'; }
    if (/CrOS/.test(ua)) { return 'chromebook'; }
    if (/Linux/.test(ua)) { return 'linux'; }
    return 'other';
}

export function browserOf(ua: string): string {
    const inApp = /FBAN|FBAV|FB_IAB/.test(ua) ? 'facebook' : /Instagram/.test(ua) ? 'instagram'
        : /WhatsApp/.test(ua) ? 'whatsapp' : /TikTok|musical_ly|BytedanceWebview/.test(ua) ? 'tiktok' : '';
    if (inApp) { return inApp; }
    let m = ua.match(/CriOS\/(\d+)/);
    if (m) { return 'chrome-ios ' + m[1]; }
    m = ua.match(/FxiOS\/(\d+)/);
    if (m) { return 'firefox-ios ' + m[1]; }
    m = ua.match(/SamsungBrowser\/(\d+)/);
    if (m) { return 'samsung ' + m[1]; }
    m = ua.match(/Edg\w*\/(\d+)/);
    if (m) { return 'edge ' + m[1]; }
    m = ua.match(/Firefox\/(\d+)/);
    if (m) { return 'firefox ' + m[1]; }
    m = ua.match(/Chrome\/(\d+)/);
    if (m) { return (/; wv\)/.test(ua) ? 'webview ' : 'chrome ') + m[1]; }
    m = ua.match(/Version\/(\d+(\.\d+)?).*Safari/);
    if (m) { return 'safari ' + m[1]; }
    if (/AppleWebKit/.test(ua) && /Mobile\//.test(ua)) { return 'ios-webview'; }
    return 'other';
}

export function cleanVisit(body: any, userAgent: any): VisitRow | null {
    if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) { return null; }
    }
    if (!body || typeof body !== 'object' || (body.k !== 'stuck' && body.k !== 'end')) {
        return null;
    }
    const ua = text(userAgent, 400);
    const ms = Number(body.ms);
    return {
        kind: body.k,
        first: path(body.first),
        last: path(body.last),
        booted: body.booted === true,
        ms: isFinite(ms) && ms >= 0 ? Math.min(Math.round(ms), 864e5) : -1,
        err: text(body.err, 200),
        lang: /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(text(body.lang, 10)) ? text(body.lang, 10) : '',
        ref: /^[A-Za-z0-9.-]{1,60}$/.test(text(body.ref, 60)) ? text(body.ref, 60).toLowerCase() : '',
        device: deviceOf(ua),
        browser: browserOf(ua),
    };
}
