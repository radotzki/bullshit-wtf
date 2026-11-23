// One seat per AirConsole device. The game's server gives one seat per Firebase uid (one phone, one
// seat: functions/test/one-seat.test.js), and the uid is kept per website. A real phone is its own
// browser, so its uid is its own; but AirConsole's simulator (where AirConsole's reviewers test) runs
// every simulated phone in one browser, so they all share one uid and one storage, and every phone
// after the first took the first one's seat (report of 23 Nov: "every simulated phone gets the same
// seat"). So a controller seats by its AirConsole device id:
//   - the seat it remembers is kept per game PIN and device id, not per PIN alone;
//   - it sends its uid to `join` only while no other connected device of this AirConsole session holds
//     that uid; a second device with the same uid joins with none, so the server gives it a seat of its
//     own. The uid still goes to `onJoinGame`, which counts weekly players by it.
// Pure functions over a storage object (localStorage, or a stand-in in the tests).

/** Where a device remembers its seat in one game. */
export function seatKey(pin, deviceId) {
    return `bs-airconsole-${pin}-d${deviceId}`;
}

/** Where a browser notes which device of a game seated with its uid. */
export function uidKey(pin, uid) {
    return `bs-airconsole-uid-${pin}-${uid}`;
}

function read(store, key) {
    try {
        return store ? store.getItem(key) : null;
    } catch (e) {
        return null;
    }
}

function keep(store, key, value) {
    try {
        if (store) {
            store.setItem(key, String(value));
        }
    } catch (e) { /* private mode: nothing is kept for a reload */ }
}

/** The seat this device took in game `pin` before (a reload), or null. */
export function rememberedSeat(store, pin, deviceId) {
    return read(store, seatKey(pin, deviceId));
}

export function rememberSeat(store, pin, deviceId, pid) {
    keep(store, seatKey(pin, deviceId), pid);
}

/**
 * The uid this device sends to `join`: its own uid, unless another device that is still connected
 * (`connected`, AirConsole's controller device ids) seated with the same uid in this game; then null,
 * so the server seats this device by itself. Claims the uid for this device when it sends it.
 * Runs synchronously: simulated phones share one page thread, so two of them never claim at once.
 * A device that left frees the uid: on a real phone that is the same phone back under a new device id.
 */
export function seatUid(store, pin, uid, deviceId, connected) {
    if (!uid) {
        return null;
    }
    const held = read(store, uidKey(pin, uid));
    const holder = held === null || held === '' ? null : Number(held);
    if (holder !== null && holder !== deviceId && (connected || []).indexOf(holder) >= 0) {
        return null;
    }
    keep(store, uidKey(pin, uid), deviceId);
    return uid;
}

/**
 * How this device's seat shows in the screen's list of players: 'listed' (its seat, under its name),
 * 'taken' (its seat now shows another name: another phone took it over), or 'missing' (not in the list
 * yet, or no seat).
 */
export function seatStatus(players, pid, nickname) {
    const row = pid ? (players || []).filter(p => p && p.pid === pid)[0] : null;
    if (!row) {
        return 'missing';
    }
    return row.nickname === nickname ? 'listed' : 'taken';
}
