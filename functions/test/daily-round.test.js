// Unit tests for a chat group's round (controllers/daily-round.ts): the screen, the deal, the acts
// with their caps and refusals, what a browser is shown, and the rows. Run with: npm test.
const test = require('node:test');
const assert = require('node:assert');
const daily = require('../dist/controllers/daily');
const round = require('../dist/controllers/daily-round');

const q = (lang, n, day) => [`daily-26-${lang}-${String(n).padStart(3, '0')}`, {
    day, lang, questionText: `Fact ${n} is $blank$`, realAnswer: `dancing`,
    fakeAnswers: ['laughing', 'sneezing', 'hiccuping', 'yawning'], citation: 'https://example.org/' + n,
}];
const bank = daily.loadDaily(Object.fromEntries([q('en', 1, '2026-11-27'), q('en', 2, '2026-11-28'), q('he', 1, '2026-11-27'), q('he', 2, '2026-11-28')]));
const Q = bank.en[1];
const noon = day => Date.parse(day + 'T10:00:00Z');
const NOW = noon('2026-11-28');
const U = c => c.repeat(16).slice(0, 16);
const A = U('a'), B = U('b'), C = U('c'), D = U('d');
const G = 'k3x9q2ab7m';
// A steady "random": the tests read results, not luck.
const steady = () => { let i = 0; return () => ((i++ * 0.37) % 1); };
const act = (r, a, uid, more) => round.applyAct(r, Object.assign({ a, lang: 'en', day: '2026-11-28', g: G, uid, src: '', test: false, n: '', l: '' }, more), Q, NOW, steady());

function started() {
    return act(null, 'start', A, { n: 'Dana', l: 'singing', k: 'house', m: 'round-start' }).round;
}

test('a lie passes the same screen as on the page', () => {
    assert.strictEqual(round.screenLie('', 'dancing', []), 'empty');
    assert.strictEqual(round.screenLie('Dancing!', 'dancing', []), 'truth');
    assert.strictEqual(round.screenLie('the dancing', 'dancing', []), 'truth');
    assert.strictEqual(round.screenLie('Laughing', 'dancing', ['laughing']), 'taken');
    assert.strictEqual(round.screenLie('see bit.ly/abc', 'dancing', []), 'refused');
    assert.strictEqual(round.screenLie('call 0541234567', 'dancing', []), 'refused');
    assert.strictEqual(round.screenLie('me@x', 'dancing', []), 'refused');
    assert.strictEqual(round.screenLie('tel 052-123-4567', 'dancing', []), 'refused', 'a phone number with dashes');
    assert.strictEqual(round.screenLie('0 5 2 1 2 3 4 5 6 7', 'dancing', []), 'refused', 'or with spaces');
    assert.strictEqual(round.screenLie('in 1518', 'dancing', []), null, 'a year is no phone number');
    assert.strictEqual(round.screenLie('x'.repeat(41), 'dancing', []), 'refused');
    assert.strictEqual(round.screenLie('singing hymns', 'dancing', ['laughing']), null);
    assert.strictEqual(round.screenName('Dana'), null);
    assert.strictEqual(round.screenName('Danadanadana'), 'refused');
    assert.strictEqual(round.tidy('  sing​  ing  '), 'sing ing', 'hidden marks and runs of spaces go');
});

test('the day of a round: from the puzzle number; open today and tomorrow, then over, then gone', () => {
    assert.strictEqual(round.dayOfNumber(bank.en, 2), '2026-11-28');
    assert.strictEqual(round.dayOfNumber(bank.en, 0), '2026-11-26');
    assert.strictEqual(round.dayOfNumber(bank.en, 1.5), null);
    assert.strictEqual(round.roundPhase('2026-11-28', noon('2026-11-27')), 'early');
    assert.strictEqual(round.roundPhase('2026-11-28', NOW), 'open');
    assert.strictEqual(round.roundPhase('2026-11-28', noon('2026-11-29')), 'open', 'until the end of the next day in Israel');
    assert.strictEqual(round.roundPhase('2026-11-28', Date.parse('2026-11-29T21:59:00Z')), 'open');
    assert.strictEqual(round.roundPhase('2026-11-28', Date.parse('2026-11-29T22:00:00Z')), 'over', 'midnight in Israel');
    assert.strictEqual(round.roundPhase('2026-11-28', noon('2026-12-06')), 'over', 'eight days on: the final board');
    assert.strictEqual(round.roundPhase('2026-11-28', noon('2026-12-07')), 'gone', 'nine days on: erased');
    const erase = round.daysToErase(NOW);
    assert.strictEqual(erase[0], '2026-11-19');
    assert.ok(!erase.includes('2026-11-20'));
    assert.strictEqual(erase.length, 392, 'nine to four hundred days back: a long quiet spell leaves nothing');
    assert.strictEqual(erase[erase.length - 1], '2025-10-24');
});

test('a start: the starter is in, with their lie and name; the same tap again changes nothing', () => {
    const res = act(null, 'start', A, { n: 'Dana', l: 'singing', k: 'house', m: 'round-start' });
    assert.strictEqual(res.error, undefined);
    assert.strictEqual(res.method, 'round-start');
    const r = res.round;
    assert.strictEqual(r.by, A);
    assert.strictEqual(r.names[A], 'Dana');
    assert.strictEqual(r.lies[A].l, 'singing');
    assert.ok(/^[a-z0-9]{6}$/.test(r.lies[A].id));
    assert.strictEqual(r.picks[A].k, 'h', 'the starter fell for a house lie on the plain question');
    const again = act(r, 'start', A, { n: 'Dana', l: 'singing', k: 'house', m: 'round-start' });
    assert.strictEqual(again.error, undefined);
    assert.strictEqual(again.method, undefined, 'a second save of the same round leaves no second row');
    assert.deepStrictEqual(again.round.lies, r.lies);
    assert.strictEqual(act(r, 'start', B, { m: 'round-start' }).error, 'exists', 'nobody takes over a round id');
    assert.strictEqual(act(null, 'start', A, { n: '', l: 'singing' }).error, 'name', 'a lie needs a name');
    assert.strictEqual(act(null, 'start', A, { n: 'Dana', l: 'DANCING' }).error, 'truth');
    assert.strictEqual(act(null, 'start', A, { n: 'Dana', l: 'sneezing' }).error, 'taken');
    const quiet = act(null, 'start', A, { k: '' });
    assert.ok(quiet.round && !quiet.round.lies && quiet.round.picks[A].k === 's', 'with no lie the button still opens a round');
    assert.ok(act(null, 'start', A, { test: true }).round.test, 'a play-test starts a test round');
});

test('the deal: the truth, the group\'s lies that fewest have met, house lies to make four; never your own', () => {
    let r = started();
    r = round.dealFor(r, B, 4, steady());
    const d = r.deal[B];
    assert.strictEqual(d.length, 4);
    assert.ok(d.includes('t') && d.includes(r.lies[A].id) && d.filter(k => /^h\d$/.test(k)).length === 2, JSON.stringify(d));
    assert.strictEqual(r.lies[A].seen, 1);
    assert.strictEqual(round.dealFor(r, B, 4, steady()), null, 'a deal that holds is kept');
    assert.strictEqual(round.dealFor(r, A, 4, steady()), null, 'the starter is in, and is dealt nothing');
    // Five lies in: the truth and four of theirs, the least seen first.
    let big = started();
    [B, C, D, U('e')].forEach((u, i) => { big = act(big, 'lie', u, { n: 'P' + i, l: 'lie number ' + i }).round; });
    big.lies[A].seen = 9;
    const five = round.deal(big, U('f'), 4, steady());
    assert.strictEqual(five.length, 5);
    assert.ok(!five.includes(big.lies[A].id), 'the most seen lie waits');
    assert.ok(!round.deal(big, B, 4, steady()).includes(big.lies[B].id), 'never one\'s own lie');
    // A dealt lie taken down: the deal no longer holds, and the next visit gets another.
    const rd = round.dealFor(started(), B, 4, steady());
    rd.lies[A].hidden = true;
    assert.strictEqual(round.dealHolds(rd, rd.deal[B], 4), false);
});

test('a pick: one per browser, with the tally it adds; the board says who fooled whom', () => {
    let r = round.dealFor(started(), B, 4, steady());
    const at = r.deal[B].indexOf(r.lies[A].id);
    const res = act(r, 'pick', B, { i: at });
    assert.strictEqual(res.method, 'friend');
    assert.strictEqual(res.tally, 'f');
    r = res.round;
    assert.strictEqual(r.picks[B].k, r.lies[A].id);
    assert.ok(!r.deal[B]);
    assert.strictEqual(act(r, 'pick', B, { i: 0 }).error, 'played', 'one pick per browser');
    r = act(r, 'lie', B, { n: 'Yossi', l: 'sneezing hard' }).round;
    const view = round.roundView(r, G, '2026-11-28', Q, 2, B, NOW);
    assert.strictEqual(view.state, 'open');
    assert.deepStrictEqual(view.me, { kind: 'friend', by: 'Dana', name: 'Yossi', lie: 'sneezing hard', lieHidden: false, started: false });
    const b = view.board;
    assert.strictEqual(b.played, 2);
    assert.strictEqual(b.picked, 2, 'the starter\'s pick on the plain page counts: it is on the board');
    assert.deepStrictEqual(b.lies.map(l => [l.name, l.lie, l.names, l.more, l.mine]), [['Dana', 'singing', ['Yossi'], 0, false], ['Yossi', 'sneezing hard', [], 0, true]]);
    assert.deepStrictEqual([b.truth.text, b.truth.names], ['dancing', []]);
    assert.deepStrictEqual(b.house.names, ['Dana']);
    assert.ok(!JSON.stringify(view).includes(A) && !JSON.stringify(view).includes(B), 'no browser id is ever shown');
    // A house pick and a truth pick, each with its tally.
    r = round.dealFor(r, C, 4, steady());
    const house = r.deal[C].findIndex(k => /^h\d$/.test(k));
    const h = act(r, 'pick', C, { i: house });
    assert.deepStrictEqual([h.method, h.tally], ['house', r.deal[C][house].slice(1)]);
    r = round.dealFor(h.round, D, 4, steady());
    const t = act(r, 'pick', D, { i: r.deal[D].indexOf('t') });
    assert.deepStrictEqual([t.method, t.tally], ['truth', '0']);
    assert.strictEqual(act(t.round, 'pick', U('z'), { i: 0 }).error, 'no', 'no pick without a deal');
});

test('a newcomer sees the liars and its answers, unmarked; never the board', () => {
    let r = started();
    r = act(r, 'lie', B, { n: 'Yossi', l: 'sneezing hard' }).round;
    r = round.dealFor(r, C, 4, steady());
    const v = round.roundView(r, G, '2026-11-28', Q, 2, C, NOW);
    assert.deepStrictEqual(v.liars, ['Dana', 'Yossi']);
    assert.strictEqual(v.lieCount, 2);
    assert.strictEqual(v.answers.length, 4);
    assert.ok(v.answers.includes('dancing') && v.answers.includes('singing') && v.answers.includes('sneezing hard'));
    assert.ok(!v.board && !v.me, 'the board waits for the pick');
    assert.ok(!JSON.stringify(v).includes(r.lies[A].id), 'which answer is whose is not sent before the pick');
    const later = round.roundView(r, G, '2026-11-28', Q, 2, C, noon('2026-12-01'));
    assert.strictEqual(later.state, 'over');
    assert.ok(later.board && !later.answers, 'an over round shows its final board to anyone');
    assert.strictEqual(round.roundView(r, G, '2026-11-28', Q, 2, C, noon('2026-12-07')).state, 'gone');
    assert.strictEqual(round.roundView(null, G, '2026-11-28', Q, 2, C, NOW).state, 'missing');
});

test('names: one per round, refused words refused, a name with no lie is on the board', () => {
    let r = started();
    assert.strictEqual(act(r, 'lie', B, { n: 'dana', l: 'x lie' }).error, 'name-taken');
    assert.strictEqual(act(r, 'lie', B, { n: 'Yossi', l: 'Singing' }).error, 'taken', 'a lie already in the round');
    r = act(r, 'lie', B, { n: 'Yossi' }).round;
    assert.strictEqual(r.names[B], 'Yossi');
    assert.ok(!r.lies[B]);
    const quiet = act(started(), 'lie', C, {}).round;
    assert.strictEqual(quiet.picks[C].k, 's', 'neither: counted as one more');
    assert.strictEqual(round.board(quiet, C, 'dancing').played, 2);
    assert.strictEqual(act(r, 'pick', B, { i: 0 }).error, 'played', 'a browser that wrote first picks nothing here');
    r = act(r, 'lie', B, { n: 'Yossi', l: 'sneezing hard' }).round;
    assert.strictEqual(act(r, 'lie', B, { n: 'Yossi', l: 'another one' }).error, 'played', 'one lie per browser');
    assert.strictEqual(act(r, 'lie', B, { n: 'Yossi', l: 'sneezing hard' }).error, undefined, 'the same lie again is no error');
});

test('caps: 30 browsers in a round', () => {
    let r = started();
    for (let i = 1; i < round.ROUND_MAX; i++) {
        r = act(r, 'lie', String(i).padStart(16, 'x'), { n: 'P' + i }).round;
    }
    assert.strictEqual(round.participants(r).length, 30);
    assert.strictEqual(round.roundView(r, G, '2026-11-28', Q, 2, B, NOW).state, 'full');
    assert.strictEqual(act(r, 'lie', B, { n: 'Late' }).error, 'full');
    assert.strictEqual(round.dealFor(r, B, 4, steady()), null);
    assert.strictEqual(round.roundView(r, G, '2026-11-28', Q, 2, A, NOW).state, 'open', 'those in it still see it');
});

test('"Not OK" twice from two browsers hides a lie; its writer can remove it', () => {
    let r = act(started(), 'lie', B, { n: 'Yossi', l: 'rude thing' }).round;
    r = act(r, 'lie', C, { n: 'Noa' }).round;
    const id = r.lies[B].id;
    assert.strictEqual(act(r, 'flag', B, { id }).error, 'no', 'not one\'s own');
    assert.strictEqual(act(r, 'flag', D, { id }).error, 'no', 'only those in the round');
    const one = act(r, 'flag', A, { id });
    assert.strictEqual(one.method, 'round-flag');
    assert.ok(!one.round.lies[B].hidden);
    assert.strictEqual(round.roundView(one.round, G, '2026-11-28', Q, 2, A, NOW).board.lies.find(l => l.id === id).flagged, true);
    const twice = act(one.round, 'flag', A, { id });
    assert.ok(!twice.round.lies[B].hidden && twice.method === undefined, 'the same browser twice is one tap');
    const two = act(one.round, 'flag', C, { id }).round;
    assert.ok(two.lies[B].hidden);
    assert.ok(!round.roundView(two, G, '2026-11-28', Q, 2, A, NOW).board.lies.some(l => l.id === id), 'gone from the board');
    assert.ok(!round.deal(two, D, 4, steady()).includes(id), 'and from every deal');
    assert.strictEqual(round.roundView(two, G, '2026-11-28', Q, 2, B, NOW).me.lieHidden, true);
    const removed = act(r, 'remove', B, {}).round;
    assert.ok(!removed.lies[B] && removed.names[B] === 'Yossi');
    assert.strictEqual(act(r, 'remove', C, {}).error, 'no');
});

test('what a page posts: well formed, today or yesterday, a test kept apart', () => {
    const body = (more) => Object.assign({ a: 'pick', lang: 'en', no: 2, g: G, uid: B, src: 'daily-round', i: 1 }, more);
    const p = round.cleanRoundPost(body(), bank, NOW);
    assert.deepStrictEqual([p.a, p.day, p.g, p.uid, p.i, p.test], ['pick', '2026-11-28', G, B, 1, false]);
    assert.strictEqual(round.cleanRoundPost(body({ a: 'drop' }), bank, NOW), null);
    assert.strictEqual(round.cleanRoundPost(body({ g: 'short' }), bank, NOW), null);
    assert.strictEqual(round.cleanRoundPost(body({ uid: 'Not-An-Id' }), bank, NOW), null);
    assert.strictEqual(round.cleanRoundPost(body({ i: 7 }), bank, NOW), null);
    assert.ok(round.cleanRoundPost(body(), bank, noon('2026-11-29')), 'yesterday\'s round still plays');
    assert.strictEqual(round.cleanRoundPost(body(), bank, noon('2026-11-30')), null, 'two days on it is over');
    assert.ok(round.cleanRoundPost(body({ a: 'remove' }), bank, noon('2026-11-30')), 'a writer may still remove their lie');
    assert.strictEqual(round.cleanRoundPost(body({ a: 'flag', id: 'bad' }), bank, NOW), null);
    const s = round.cleanRoundPost(body({ a: 'start', n: ' Dana ', l: ' sing‮ing ', m: 'other', k: 'nope' }), bank, NOW);
    assert.deepStrictEqual([s.n, s.l, s.m, s.k], ['Dana', 'singing', 'round-start', '']);
    assert.strictEqual(round.cleanRoundPost(body({ a: 'start', n: 5 }), bank, NOW), null);
    assert.strictEqual(round.cleanRoundPost(body({ src: 'test' }), bank, NOW).test, true);
});

test('rows: the round id in crew_id, the arrival as content type, nothing from a test round', () => {
    const p = round.cleanRoundPost({ a: 'lie', lang: 'he', no: 2, g: G, uid: B, src: 'daily-round', n: 'יוסי', l: 'לשיר' }, bank, NOW);
    assert.deepStrictEqual(round.roundRow(p, 'round-lie', false), { content_type: 'daily-round', method: 'round-lie', crew_id: G, locale: 'he', uid: B });
    assert.strictEqual(round.roundRow(p, 'round-lie', true), null, 'a test round writes nothing');
    assert.strictEqual(round.roundRow(Object.assign({}, p, { test: true }), 'round-lie', false), null);
    assert.strictEqual(round.roundRow(p, undefined, false), null);
    const start = round.cleanRoundPost({ a: 'start', lang: 'en', no: 2, g: G, uid: A, src: 'daily-home', m: 'round-other' }, bank, NOW);
    assert.strictEqual(round.roundRow(start, 'round-other', false).content_type, 'daily-home');
    assert.strictEqual(act(started(), 'lie', B, { n: 'Yossi', l: 'sneezing hard' }).method, 'round-lie');
    assert.strictEqual(act(started(), 'lie', B, { n: 'Yossi' }).method, undefined, 'a name alone leaves no row');
});

test('a post\'s round: one round-via row with the tag, beside its start; every other row as before', () => {
    const TAG = 'daily-round-wa-he-family';
    const start = (src, m) => round.cleanRoundPost({ a: 'start', lang: 'he', no: 2, g: G, uid: A, src, n: 'דנה', l: 'לשיר', m: m || 'round-start' }, bank, NOW);
    const p = start(TAG);
    assert.deepStrictEqual(round.roundViaRow(p, 'round-start', false), { content_type: 'round-via', method: TAG, crew_id: G, locale: 'he', uid: A });
    assert.strictEqual(round.roundViaRow(start('wa-he-hanukkah', 'round-other'), 'round-other', false).method, 'wa-he-hanukkah', 'any post tag, also on a round in another group');
    assert.strictEqual(round.roundRow(p, 'round-start', false).content_type, 'daily-post', 'the start row keeps the content type queries read today');
    assert.strictEqual(round.roundViaRow(p, undefined, false), null, 'the same round started again: no second row');
    assert.strictEqual(round.roundViaRow(p, 'round-start', true), null, 'nothing from a test round');
    ['', 'daily', 'daily-home', 'daily-share', 'daily-round', 'test', 'test-he', '<b>'].forEach(src =>
        assert.strictEqual(round.roundViaRow(start(src), 'round-start', false), null, `no row for "${src}"`));
    const lie = round.cleanRoundPost({ a: 'lie', lang: 'he', no: 2, g: G, uid: B, src: TAG, n: 'יוסי', l: 'לשרוק' }, bank, NOW);
    assert.strictEqual(round.roundViaRow(lie, 'round-lie', false), null, 'only a start says the tag');
    assert.strictEqual(round.roundRow(lie, 'round-lie', false).content_type, 'daily-post');
});

test('round-forced: a browser the switch moved out of its half, once a day, with no round id', () => {
    const post = (more) => daily.cleanPost(Object.assign({ lang: 'he', day: '2026-11-28', m: 'round-forced', src: 'daily-round-wa-he-family', uid: 's' + B.slice(1) }, more), bank, NOW);
    assert.deepStrictEqual(post().row, { content_type: 'daily-post', method: 'round-forced', crew_id: null, locale: 'he', uid: 's' + B.slice(1) });
    assert.strictEqual(post({ src: '' }).row.content_type, 'daily');
    assert.strictEqual(post({ src: 'test' }), null, 'a play-test is not counted');
    assert.deepStrictEqual(post().add, [], 'it changes no tally');
});

test('the round\'s beacons: tell, score and back need a round id, and pass it as crew_id', () => {
    const post = (more) => daily.cleanPost(Object.assign({ lang: 'en', day: '2026-11-28', m: 'round-tell-whatsapp', src: 'daily-round', uid: B, g: G }, more), bank, NOW);
    assert.deepStrictEqual(post().row, { content_type: 'daily-round', method: 'round-tell-whatsapp', crew_id: G, locale: 'en', uid: B });
    assert.strictEqual(post({ g: undefined }), null);
    assert.strictEqual(post({ m: 'round-score' }).row.method, 'round-score');
    assert.strictEqual(post({ m: 'round-back' }).row.method, 'round-back');
    assert.strictEqual(post({ m: 'truth', k: 0 }), null, 'a pick in a round is an act, never a beacon');
    assert.strictEqual(post({ m: 'open' }).row.crew_id, G);
    assert.strictEqual(post({ src: 'test' }), null, 'a play-test link carries its tag, and nothing is kept');
    assert.strictEqual(daily.cleanPost({ lang: 'en', day: '2026-11-28', m: 'open', uid: B }, bank, NOW).row.crew_id, null, 'plain puzzle rows: no crew id');
});
