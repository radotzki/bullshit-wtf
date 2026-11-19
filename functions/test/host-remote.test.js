// Unit tests for the host's controls on a second device (the "on a second device" part of
// controllers/host-controls.ts): a big-screen host pairs their phone, and nobody who only reads the big
// screen (a stream viewer, a class) can take the controls. Run with: npm test.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const hc = require('../dist/controllers/host-controls');

const S = { GameStaging: 0, ShowQuestion: 2, ShowAnswers: 3, ScoreBoardFinal: 6 };
const KEY = 'K'.repeat(24);
const NOW = 1000000;
const bytes = n => crypto.randomBytes(n);

function screenGame(extra) {
    return Object.assign({
        hostKey: KEY, hasHost: 'screen',
        state: { id: S.ShowQuestion, timestamp: 1000 }, questionIndex: 0,
        players: { ben: { nickname: 'Ben', uid: 'u-ben' }, cleo: { nickname: 'Cleo', uid: 'u-cleo' } },
        answers: { ben: { text: 'ben lie' }, cleo: { text: 'cleo lie' } },
    }, extra);
}

test('only a big screen with no host seat, in a game that is not over, can pair', () => {
    assert.strictEqual(hc.canPair(screenGame()), true);
    assert.strictEqual(hc.canPair(screenGame({ state: { id: S.GameStaging } })), true);
    assert.strictEqual(hc.canPair(screenGame({ state: { id: S.ScoreBoardFinal } })), false);
    const phoneHost = screenGame({ players: { me: { nickname: 'Dana', host: true }, ben: { nickname: 'Ben' } } });
    assert.strictEqual(hc.canPair(phoneHost), false);
    assert.strictEqual(hc.canPair(null), false);
});

test('a pairing has an 8-letter code, lasts 3 minutes, and has no claim yet', () => {
    const p = hc.openPairing(NOW, bytes);
    assert.match(p.code, /^[A-Z2-9]{8}$/);
    assert.strictEqual(p.exp, NOW + hc.PAIR_MS);
    assert.strictEqual(hc.PAIR_MS, 180000);
    assert.strictEqual(p.tries, 0);
    assert.notStrictEqual(hc.openPairing(NOW, bytes).code, p.code);
});

test('the phone with the code gets its own secret key and a 4-digit number', () => {
    const p = hc.openPairing(NOW, bytes);
    const r = hc.claimPairing(p, p.code.toLowerCase(), NOW + 1000, bytes);
    assert.ok(!r.error);
    assert.match(r.claim.key, /^[A-Za-z0-9]{24}$/);
    assert.match(r.claim.digits, /^\d{4}$/);
    assert.deepStrictEqual(r.pairing.claims[r.id], r.claim);
    // The key is not the host key, and nothing of it is in the code shown on the big screen.
    assert.notStrictEqual(r.claim.key, KEY);
});

test('a wrong, expired or full code gives nothing, with the same answer', () => {
    const p = hc.openPairing(NOW, bytes);
    assert.strictEqual(hc.claimPairing(p, 'AAAAAAAA', NOW, bytes).error.code, 'NO_OFFER');
    assert.strictEqual(hc.claimPairing(p, p.code, NOW + hc.PAIR_MS, bytes).error.code, 'NO_OFFER');
    assert.strictEqual(hc.claimPairing(null, p.code, NOW, bytes).error.code, 'NO_OFFER');
    assert.strictEqual(hc.claimPairing(p, undefined, NOW, bytes).error.code, 'NO_OFFER');
    let cur = p;
    const seen = new Set();
    for (let i = 0; i < hc.PAIR_MAX_CLAIMS; i++) {
        const r = hc.claimPairing(cur, p.code, NOW, bytes);
        assert.ok(!r.error, `claim ${i}`);
        assert.ok(!seen.has(r.claim.digits), 'every phone shows a different number');
        seen.add(r.claim.digits);
        cur = r.pairing;
    }
    assert.strictEqual(hc.claimPairing(cur, p.code, NOW, bytes).error.code, 'NO_OFFER');
});

test('numbers never repeat between claims, even with a poor random source', () => {
    let i = 0;
    const poor = n => Array.from({ length: n }, () => (i++ % 3));
    let cur = hc.openPairing(NOW, bytes);
    const r1 = hc.claimPairing(cur, cur.code, NOW, poor);
    const r2 = hc.claimPairing(r1.pairing, cur.code, NOW, poor);
    if (!r2.error) {
        assert.notStrictEqual(r1.claim.digits, r2.claim.digits);
    } else {
        assert.strictEqual(r2.error.code, 'NO_OFFER');
    }
});

test('a viewer who opened the link first is not paired: only the number the host types pairs', () => {
    const p = hc.openPairing(NOW, bytes);
    const viewer = hc.claimPairing(p, p.code, NOW, bytes);
    const hostPhone = hc.claimPairing(viewer.pairing, p.code, NOW + 500, bytes);
    const done = hc.confirmPairing(hostPhone.pairing, hostPhone.claim.digits, NOW + 2000);
    assert.ok(!done.error);
    assert.strictEqual(done.pairing, null, 'the pairing closes: the code and every other claim are gone');
    assert.strictEqual(done.remote.key, hostPhone.claim.key);
    const game = screenGame({ remote: done.remote, pairing: done.pairing });
    assert.strictEqual(hc.isRemoteKey(game, hostPhone.claim.key), true);
    assert.strictEqual(hc.isRemoteKey(game, viewer.claim.key), false);
    assert.deepStrictEqual(hc.remoteStatus(game, viewer.claim.key, NOW + 3000), { paired: false, waiting: false });
    assert.deepStrictEqual(hc.remoteStatus(game, hostPhone.claim.key, NOW + 3000), { paired: true, waiting: false });
    // The used number, read off the stream, is worth nothing now.
    assert.strictEqual(hc.confirmPairing(done.pairing, hostPhone.claim.digits, NOW + 4000).error.code, 'NO_OFFER');
    assert.strictEqual(hc.claimPairing(done.pairing, p.code, NOW + 4000, bytes).error.code, 'NO_OFFER');
});

test('wrong numbers count, and close the pairing after 5', () => {
    const p = hc.openPairing(NOW, bytes);
    const c = hc.claimPairing(p, p.code, NOW, bytes);
    const wrong = c.claim.digits === '0000' ? '1111' : '0000';
    let cur = c.pairing;
    for (let i = 1; i < hc.PAIR_MAX_TRIES; i++) {
        const r = hc.confirmPairing(cur, wrong, NOW);
        assert.strictEqual(r.error.code, 'WRONG_NUMBER');
        assert.strictEqual(r.pairing.tries, i);
        cur = r.pairing;
    }
    const last = hc.confirmPairing(cur, wrong, NOW);
    assert.strictEqual(last.error.code, 'WRONG_NUMBER');
    assert.strictEqual(last.pairing, null);
    assert.strictEqual(hc.confirmPairing(Object.assign({}, cur, { tries: hc.PAIR_MAX_TRIES }), c.claim.digits, NOW).error.code, 'NO_OFFER');
});

test('the number may be typed with spaces, but not as anything else', () => {
    const p = hc.openPairing(NOW, bytes);
    const c = hc.claimPairing(p, p.code, NOW, bytes);
    const d = c.claim.digits;
    assert.ok(!hc.confirmPairing(c.pairing, `${d.slice(0, 2)} ${d.slice(2)}`, NOW).error);
    assert.strictEqual(hc.confirmPairing(c.pairing, d.slice(0, 3), NOW).error.code, 'WRONG_NUMBER');
    assert.strictEqual(hc.confirmPairing(c.pairing, undefined, NOW).error.code, 'WRONG_NUMBER');
    assert.strictEqual(hc.confirmPairing(c.pairing, d, NOW + hc.PAIR_MS).error.code, 'NO_OFFER');
});

test('a phone that asked waits until the host types its number', () => {
    const p = hc.openPairing(NOW, bytes);
    const c = hc.claimPairing(p, p.code, NOW, bytes);
    const game = screenGame({ pairing: c.pairing });
    assert.deepStrictEqual(hc.remoteStatus(game, c.claim.key, NOW + 1), { paired: false, waiting: true });
    assert.deepStrictEqual(hc.remoteStatus(game, c.claim.key, NOW + hc.PAIR_MS), { paired: false, waiting: false });
    assert.deepStrictEqual(hc.remoteStatus(game, 'x'.repeat(24), NOW + 1), { paired: false, waiting: false });
    assert.deepStrictEqual(hc.remoteStatus(game, undefined, NOW + 1), { paired: false, waiting: false });
});

test('the remote key is not the host key, and no remote means no key works', () => {
    assert.strictEqual(hc.isRemoteKey(screenGame(), KEY), false);
    assert.strictEqual(hc.isRemoteKey(screenGame({ remote: { key: KEY + 'x', at: 1 } }), KEY), false);
    assert.strictEqual(hc.isRemoteKey(screenGame({ remote: { key: '', at: 1 } }), ''), false);
    assert.strictEqual(hc.isRemoteKey(screenGame({ remote: { key: 'short', at: 1 } }), 'short'), false);
    // The remote is not the host: it opens no host-key-only call (start, pairing, joining as the host).
    assert.strictEqual(hc.isHostKey(screenGame({ remote: { key: 'R'.repeat(24), at: 1 } }), 'R'.repeat(24)), false);
});

test('the big screen sees whether a pairing is open, how many phones asked, and never the numbers', () => {
    const p = hc.openPairing(NOW, bytes);
    const c = hc.claimPairing(p, p.code, NOW, bytes);
    const view = hc.pairingView(screenGame({ pairing: c.pairing }), NOW + 1);
    assert.deepStrictEqual(view, { open: true, code: p.code, exp: p.exp, asked: 1, paired: false });
    assert.ok(!JSON.stringify(view).includes(c.claim.key));
    assert.deepStrictEqual(hc.pairingView(screenGame({ pairing: c.pairing, remote: { key: 'R'.repeat(24), at: 1 } }), NOW + hc.PAIR_MS),
        { open: false, code: null, exp: null, asked: 0, paired: true });
});

test('the remote looks at every lie (a big-screen host has no seat and no pick to lose)', () => {
    const game = screenGame({ checking: { q: 0, pid: hc.hostSeat(screenGame()) } });
    assert.strictEqual(game.checking.pid, null);
    assert.deepStrictEqual(hc.liesForHost(game).map(l => l.text), ['ben lie', 'cleo lie']);
    assert.strictEqual(hc.hostChecking(game), true);
    const picks = { ben: 'x', cleo: 'y' };
    assert.strictEqual(hc.picksToScore(picks, game), picks, 'every player\'s pick still scores');
});
