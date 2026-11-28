// Hands an app error to the visit beacon (game/src/index.html), so the page view that hit it counts
// as bad in the visits table. Angular's error handler takes every error thrown inside the app, even
// after the page has drawn, and keeps it from the window's error event that the beacon listens to:
// without this, a blank home screen or a missing join-page ask reaches Sentry only.
// The text is short and holds no address: a URL may carry a PIN or a crew id.

export function visitErrorText(err: any): string {
    let text: string;
    try {
        const name = err && err.name ? String(err.name) : '';
        const message = err && err.message !== undefined ? String(err.message) : String(err);
        text = !message ? name : name && message.indexOf(name) !== 0 ? name + ': ' + message : message;
    } catch (e) {
        text = 'error';
    }
    text = text.replace(/https?:\/\/\S+/g, '<url>').replace(/\s+/g, ' ').trim();
    return ('app error: ' + (text || 'error')).slice(0, 120);
}

/** Mark this page view bad in the beacon. Never throws: an error handler must not fail. */
export function markVisitError(err: any, win: any = typeof window === 'undefined' ? null : window): void {
    try {
        if (win && typeof win.bsVisit === 'function') {
            win.bsVisit('err', visitErrorText(err));
        }
    } catch (e) { }
}
