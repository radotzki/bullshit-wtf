/**
 * The solo run on this device (SoloRun in game-model): the best score kept per language, and the
 * lobby's word that a solo game did not start by itself. Kept free of Angular so it can be tested in Node.
 * Storage may be missing or refused (a private window, CrazyGames' frame): then nothing is kept, and
 * every run's score is shown without a best.
 */

const bestKey = 'BS_SOLO_BEST';

export interface BestRecord {
    [locale: string]: { best: number; pin: string };
}

export interface BestResult {
    /** The best on this device, this run included. */
    best: number;
    /** This run set it (also when its final screen is opened again). */
    isNew: boolean;
}

/** The best after a run of `found` truths (game `pin`), and the record to keep. Pure. */
export function withRun(record: BestRecord | null, locale: string, pin: string, found: number): { result: BestResult; record: BestRecord } {
    const lang = locale === 'he' ? 'he' : 'en';
    const rec: BestRecord = Object.assign({}, record && typeof record === 'object' ? record : {});
    const old = rec[lang] && typeof rec[lang].best === 'number' ? rec[lang] : null;
    if (old && old.pin === pin) {
        return { result: { best: old.best, isNew: found > 0 && old.best === found }, record: rec };
    }
    if (!old || found > old.best) {
        rec[lang] = { best: found, pin };
        return { result: { best: found, isNew: found > 0 }, record: rec };
    }
    return { result: { best: old.best, isNew: false }, record: rec };
}

function store(): Storage | null {
    try {
        return window.localStorage;
    } catch (e) {
        return null;
    }
}

/** Keeps a finished run's score; returns the best on this device and whether this run set it. */
export function keepRunScore(locale: string, pin: string, found: number): BestResult {
    const s = store();
    let record: BestRecord | null = null;
    try {
        record = s ? JSON.parse(s.getItem(bestKey) || 'null') : null;
    } catch (e) { }
    const { result, record: next } = withRun(record, locale, String(pin).toUpperCase(), found);
    try {
        if (s) {
            s.setItem(bestKey, JSON.stringify(next));
        }
    } catch (e) { }
    return result;
}

// ---------- a solo game that did not start by itself ----------
// The portal's "Try it alone" and a final screen's PLAY AGAIN start the game as soon as its lobby
// opens. If that START fails, the lobby says so and shows a button that starts it.

let failedPin = '';
const listeners: Array<(pin: string) => void> = [];

export function soloStartFailed(pin: string) {
    failedPin = String(pin || '').toUpperCase();
    listeners.slice().forEach(f => f(failedPin));
}

export function soloStartFailedFor(pin: string): boolean {
    return !!failedPin && failedPin === String(pin || '').toUpperCase();
}

export function clearSoloStartFailure() {
    failedPin = '';
}

export function onSoloStartFailed(f: (pin: string) => void): () => void {
    listeners.push(f);
    return () => {
        const i = listeners.indexOf(f);
        if (i >= 0) {
            listeners.splice(i, 1);
        }
    };
}
