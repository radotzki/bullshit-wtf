/**
 * The host's phone, paired to a big screen as its remote (see "on a second device" in
 * functions/src/controllers/host-controls.ts), keeps the key the server gave it here, per game, with the
 * number it showed while it waited. The key is never shown and never in an address.
 *
 * Kept in localStorage (sessionStorage, then memory, where that is blocked), for the last few games.
 */
const storeKey = 'BS_REMOTE_KEYS';
const keep = 10;
let memory: { [pin: string]: RemoteKey } = {};

export interface RemoteKey {
    key: string;
    digits: string;
}

function store(): Storage | null {
    try {
        return window.localStorage;
    } catch (e) {
        try {
            return window.sessionStorage;
        } catch (e2) {
            return null;
        }
    }
}

function read(): { [pin: string]: RemoteKey } {
    const s = store();
    if (!s) {
        return memory;
    }
    try {
        const saved = JSON.parse(s.getItem(storeKey));
        return saved && typeof saved === 'object' ? saved : memory;
    } catch (e) {
        return memory;
    }
}

function write(all: { [pin: string]: RemoteKey }) {
    memory = all;
    const s = store();
    if (s) {
        try {
            s.setItem(storeKey, JSON.stringify(all));
        } catch (e) { }
    }
}

/** This phone asked to pair with `pin` and got `key` (and showed `digits`). */
export function rememberRemoteKey(pin: string, key: string, digits: string) {
    if (!pin || !key) {
        return;
    }
    const all = read();
    delete all[pin.toUpperCase()];
    all[pin.toUpperCase()] = { key, digits: digits || '' };
    const pins = Object.keys(all);
    pins.slice(0, Math.max(0, pins.length - keep)).forEach(p => delete all[p]);
    write(all);
}

/** The remote key this phone holds for `pin`, or undefined. */
export function remoteKeyFor(pin: string): RemoteKey | undefined {
    if (!pin) {
        return undefined;
    }
    const k = read()[pin.toUpperCase()];
    return k && typeof k.key === 'string' && k.key ? k : undefined;
}

/** The big screen unpaired this phone, or its key was refused: forget it. */
export function forgetRemoteKey(pin: string) {
    if (!pin) {
        return;
    }
    const all = read();
    delete all[pin.toUpperCase()];
    write(all);
}
