/**
 * The phone that creates a game makes up a one-game secret, the host key, and sends it with
 * Create (or crew Rematch). The server keeps it out of reach of other phones, and marks the join
 * that brings the same key as the host. So the lobby knows the host even when this phone's
 * sign-in failed and it has no uid.
 *
 * Kept in localStorage (sessionStorage, then memory, where that is blocked), for the last few games.
 */
const storeKey = 'BS_HOST_KEYS';
const keep = 10;
let memory: { [pin: string]: string } = {};

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

function read(): { [pin: string]: string } {
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

/** A new random key: 24 letters and digits. */
export function newHostKey(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = new Uint8Array(24);
    try {
        window.crypto.getRandomValues(bytes);
    } catch (e) {
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = Math.floor(Math.random() * 256);
        }
    }
    let key = '';
    for (let i = 0; i < bytes.length; i++) {
        key += chars[bytes[i] % chars.length];
    }
    return key;
}

/** This phone created `pin` with `key`. */
export function rememberHostKey(pin: string, key: string) {
    if (!pin || !key) {
        return;
    }
    const all = read();
    delete all[pin.toUpperCase()];
    all[pin.toUpperCase()] = key;
    const pins = Object.keys(all);
    pins.slice(0, Math.max(0, pins.length - keep)).forEach(p => delete all[p]);
    memory = all;
    const s = store();
    if (s) {
        try {
            s.setItem(storeKey, JSON.stringify(all));
        } catch (e) { }
    }
}

/** The host key this phone created `pin` with, or undefined. */
export function hostKeyFor(pin: string): string | undefined {
    if (!pin) {
        return undefined;
    }
    const key = read()[pin.toUpperCase()];
    return typeof key === 'string' && key ? key : undefined;
}
