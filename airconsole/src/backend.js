// The game's own server, as the site uses it: Firebase anonymous sign-in, the Realtime Database and
// the Cloud Functions. The AirConsole version keeps that server (code-changes.md B4), so every game
// is scored and logged as on the site and its players count as weekly players.
// The addresses are the site's production ones (game/src/environments/environment.prod.ts); the
// local test sends them to the emulators from the browser, as the repository's smoke tests do.

import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getDatabase, ref, onValue, set, goOnline } from 'firebase/database';
import { environment } from '../../game/src/environments/environment.prod';

let app = null;

function firebase() {
    if (!app) {
        app = initializeApp(environment.firebaseConfig);
    }
    return app;
}

let signingIn = null;

/** This browser's anonymous uid: the same one on every visit, as on the site. Undefined if sign-in fails. */
export function signIn() {
    if (!signingIn) {
        signingIn = (async () => {
            try {
                const auth = getAuth(firebase());
                await auth.authStateReady();
                const user = auth.currentUser || (await signInAnonymously(auth)).user;
                return user ? user.uid : undefined;
            } catch (e) {
                signingIn = null;
                console.warn('sign-in failed', e && e.message);
                return undefined;
            }
        })();
    }
    return signingIn;
}

/** The uid if sign-in finishes within `ms`, and how long that took. */
export async function uidWithin(ms) {
    const started = Date.now();
    const uid = await Promise.race([signIn(), new Promise(resolve => setTimeout(() => resolve(undefined), ms))]);
    return { uid, waitedMs: Date.now() - started };
}

/** A call that takes longer than this is given up, so a button never stays greyed out for good. */
export const CALL_TIMEOUT_MS = 15000;

/** Calls one of the game's Cloud Functions. Rejects with the server's code (GAME_IS_FULL, ...) when it sends one. */
export async function call(name, body) {
    let res;
    const abort = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = abort ? setTimeout(() => abort.abort(), CALL_TIMEOUT_MS) : null;
    try {
        res = await fetch(environment.cloudfunctions + name, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body || {}),
            signal: abort ? abort.signal : undefined,
        });
    } catch (e) {
        const error = new Error(`Network error calling ${name}`);
        error.code = 'NETWORK_ERROR';
        throw error;
    } finally {
        clearTimeout(timer);
    }
    let data = null;
    try {
        data = await res.json();
    } catch (e) {
        data = null;
    }
    if (!res.ok) {
        const error = new Error((data && data.message) || `${name} failed with status ${res.status}`);
        error.code = (data && data.code) || `HTTP_${res.status}`;
        error.status = res.status;
        throw error;
    }
    return data;
}

/** Listens to one value of a game: calls `cb` with each new value. Returns the function that stops it. */
export function watch(path, cb) {
    const r = ref(getDatabase(firebase()), path);
    return onValue(r, snap => cb(snap.val()), err => console.warn('listen failed', path, err && err.message));
}

/** Writes one value a phone may write (a pick, a NEXT on the reveal, a tick). */
export function write(path, value) {
    return set(ref(getDatabase(firebase()), path), value);
}

/** How far this browser's clock is behind the server's, live (Firebase's .info/serverTimeOffset). */
export function serverOffset(cb) {
    return watch('.info/serverTimeOffset', v => cb(typeof v === 'number' ? v : 0));
}

/** Reconnects the database after a pause (a TV that slept), as the site's reconnect nudge does. */
export function reconnect() {
    try {
        goOnline(getDatabase(firebase()));
    } catch (e) { /* not connected yet */ }
}
