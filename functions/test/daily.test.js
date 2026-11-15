// Unit tests for the daily puzzle's server side (controllers/daily.ts): the day in Israel, the
// day's question, what the page gets, and the cleaning of what a page posts back. Run with: npm test.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const daily = require('../dist/controllers/daily');

const utc = (y, m, d, h = 0, min = 0, s = 0) => Date.UTC(y, m - 1, d, h, min, s);
const q = (lang, n, day, more) => [`daily-26-${lang}-${String(n).padStart(3, '0')}`, Object.assign({
    day, lang, questionText: `Fact ${n} is $blank$`, realAnswer: `truth ${n}`,
    fakeAnswers: [`lie ${n}a`, `lie ${n}b`, `lie ${n}c`], citation: 'https://example.org/' + n,
}, more)];
const bankOf = (...entries) => daily.loadDaily(Object.fromEntries(entries));
const bank = bankOf(
    q('en', 1, '2026-11-27'), q('en', 2, '2026-11-28'), q('en', 3, '2026-11-29', { fakeAnswers: ['a', 'b', 'c', 'd', 'e'] }),
    q('he', 1, '2026-11-27'), q('he', 2, '2026-11-28'), q('he', 3, '2026-11-29'),
);
// Noon in Israel on a winter day.
const noon = day => Date.parse(day + 'T10:00:00Z');

test('the day is the date in Israel: 23:59 and 00:00 in winter and in summer', () => {
    // Winter, UTC+2: midnight is 22:00 UTC.
    assert.strictEqual(daily.israelDay(utc(2026, 11, 27, 21, 59, 59)), '2026-11-27');
    assert.strictEqual(daily.israelDay(utc(2026, 11, 27, 22, 0, 0)), '2026-11-28');
    // Summer, UTC+3: midnight is 21:00 UTC. A fixed +2 hours would be a day late for an hour.
    assert.strictEqual(daily.israelDay(utc(2026, 7, 1, 20, 59, 59)), '2026-07-01');
    assert.strictEqual(daily.israelDay(utc(2026, 7, 1, 21, 0, 0)), '2026-07-02');
});

test('the day on both sides of a clock change', () => {
    // Spring 2027: clocks go forward on Friday 26 March at 02:00. Thursday ends at 22:00 UTC
    // (winter), Friday is 23 hours long and ends at 21:00 UTC (summer).
    assert.strictEqual(daily.israelDay(utc(2027, 3, 25, 21, 59, 59)), '2027-03-25');
    assert.strictEqual(daily.israelDay(utc(2027, 3, 25, 22, 0, 0)), '2027-03-26');
    assert.strictEqual(daily.israelDay(utc(2027, 3, 26, 20, 59, 59)), '2027-03-26');
    assert.strictEqual(daily.israelDay(utc(2027, 3, 26, 21, 0, 0)), '2027-03-27');
    assert.strictEqual(daily.nextMidnight(utc(2027, 3, 25, 23, 0, 0)), utc(2027, 3, 26, 21, 0, 0));
    // Autumn 2026: clocks go back on Sunday 25 October at 02:00. Saturday ends at 21:00 UTC
    // (summer), Sunday is 25 hours long and ends at 22:00 UTC (winter).
    assert.strictEqual(daily.israelDay(utc(2026, 10, 24, 20, 59, 59)), '2026-10-24');
    assert.strictEqual(daily.israelDay(utc(2026, 10, 24, 21, 0, 0)), '2026-10-25');
    assert.strictEqual(daily.israelDay(utc(2026, 10, 25, 21, 59, 59)), '2026-10-25');
    assert.strictEqual(daily.israelDay(utc(2026, 10, 25, 22, 0, 0)), '2026-10-26');
    assert.strictEqual(daily.nextMidnight(utc(2026, 10, 24, 21, 30, 0)), utc(2026, 10, 25, 22, 0, 0));
});

test('the next midnight is always the first moment of the next day in Israel', () => {
    for (let t = utc(2026, 3, 20); t < utc(2026, 4, 2); t += 37 * 60 * 1000) {
        const at = daily.nextMidnight(t);
        assert.ok(at > t && at - t <= 25 * 3600 * 1000, new Date(t).toISOString());
        assert.strictEqual(daily.israelDay(at - 1), daily.israelDay(t));
        assert.strictEqual(daily.israelDay(at), daily.addDays(daily.israelDay(t), 1));
    }
});

test('day arithmetic', () => {
    assert.strictEqual(daily.addDays('2026-12-31', 1), '2027-01-01');
    assert.strictEqual(daily.addDays('2026-03-01', -1), '2026-02-28');
    assert.strictEqual(daily.daysBetween('2026-11-27', '2026-12-04'), 7);
    assert.strictEqual(daily.daysBetween('2026-11-27', '2026-11-20'), -7);
    assert.ok(daily.isDay('2026-11-27'));
    ['2026-13-01', '2026-02-30', '26-11-27', '', null, 20261127, '2026-11-27T00:00'].forEach(d => assert.ok(!daily.isDay(d), String(d)));
});

test('each day has its question, numbered from the first day', () => {
    assert.deepStrictEqual(
        ['2026-11-27', '2026-11-28', '2026-11-29'].map(d => { const f = daily.questionFor(bank.en, d); return [f.q.id, f.no, f.own]; }),
        [['daily-26-en-001', 1, true], ['daily-26-en-002', 2, true], ['daily-26-en-003', 3, true]]);
});

test('out of questions: the file is served again from its first day and the number keeps rising', () => {
    assert.deepStrictEqual(
        ['2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03'].map(d => { const f = daily.questionFor(bank.en, d); return [f.q.id, f.no, f.own]; }),
        [['daily-26-en-001', 4, false], ['daily-26-en-002', 5, false], ['daily-26-en-003', 6, false], ['daily-26-en-001', 7, false]]);
    assert.strictEqual(daily.daysLeft(bank.en, '2026-11-27'), 2);
    assert.strictEqual(daily.daysLeft(bank.en, '2026-11-29'), 0);
    assert.strictEqual(daily.daysLeft(bank.en, '2026-12-05'), -6);
});

test('before the first day the page is not blank: a repeat, with no number to show', () => {
    const f = daily.questionFor(bank.en, '2026-11-26');
    assert.deepStrictEqual([f.q.id, f.no, f.own], ['daily-26-en-003', 0, false]);
    const g = daily.questionFor(bank.en, '2026-11-14');
    assert.ok(g.q && g.no < 1 && !g.own);
    // Two days in a row never show the same question.
    for (let d = '2026-11-01'; d < '2026-12-20'; d = daily.addDays(d, 1)) {
        assert.notStrictEqual(daily.questionFor(bank.en, d).q, daily.questionFor(bank.en, daily.addDays(d, 1)).q, d);
    }
});

test('a day the file skips gets a repeat, and the days after it keep their own question and number', () => {
    const gap = bankOf(q('en', 1, '2026-11-27'), q('en', 2, '2026-11-28'), q('en', 4, '2026-11-30'));
    const skipped = daily.questionFor(gap.en, '2026-11-29');
    assert.strictEqual(skipped.own, false);
    assert.strictEqual(skipped.no, 3);
    assert.ok(skipped.q);
    const after = daily.questionFor(gap.en, '2026-11-30');
    assert.deepStrictEqual([after.q.id, after.no, after.own], ['daily-26-en-004', 4, true]);
});

test('any number of questions, and none', () => {
    const one = bankOf(q('en', 1, '2026-11-27'));
    assert.strictEqual(daily.questionFor(one.en, '2027-05-05').q.id, 'daily-26-en-001');
    assert.strictEqual(daily.questionFor(one.he, '2026-11-27'), null);
    assert.strictEqual(daily.puzzleBody(one.he, noon('2026-11-27'), null, null), null);
    assert.strictEqual(daily.puzzleBody(one.en, noon('2026-11-27'), null, null).yesterday, null, 'one question has no yesterday');
    assert.deepStrictEqual(daily.loadDaily(null), { en: [], he: [] });
    assert.deepStrictEqual(daily.loadDaily('x'), { en: [], he: [] });
});

test('a line that is not a whole question is left out, and the page still has the others', () => {
    const loaded = bankOf(
        q('en', 1, '2026-11-27'),
        q('en', 2, '2026-11-28', { fakeAnswers: ['one', 'two'] }),
        q('en', 3, '2026-11-29', { questionText: 'No blank here' }),
        q('en', 4, '2026-11-30', { day: '30 November' }),
        q('en', 5, '2026-12-01', { lang: 'fr' }),
        q('en', 6, '2026-11-27'),
        q('en', 7, '2026-12-02', { citation: 'javascript:alert(1)', fakeAnswers: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }),
    );
    assert.deepStrictEqual(loaded.en.map(x => x.id), ['daily-26-en-001', 'daily-26-en-007']);
    assert.strictEqual(loaded.en[1].citation, '', 'a source that is no web address is dropped');
    assert.strictEqual(loaded.en[1].fakeAnswers.length, 5, 'five lies at most');
});

test('what the page gets: the answers by their place in the file, the truth first', () => {
    const body = daily.puzzleBody(bank.en, noon('2026-11-29'),
        { picks: { 0: 12, 1: 5, 4: 3 }, total: 20 }, { picks: { 0: 10, 2: 30 }, total: 40 });
    assert.deepStrictEqual(Object.keys(body).sort(),
        ['candle', 'cite', 'day', 'lang', 'nextAt', 'no', 'options', 'pack', 'picks', 'q', 'total', 'truth', 'yesterday']);
    assert.strictEqual(body.no, 3);
    assert.strictEqual(body.day, '2026-11-29');
    assert.strictEqual(body.lang, 'en');
    assert.strictEqual(body.q, 'Fact 3 is $blank$');
    assert.deepStrictEqual(body.options, [{ k: 0, t: 'truth 3' }, { k: 1, t: 'a' }, { k: 2, t: 'b' }, { k: 3, t: 'c' }, { k: 4, t: 'd' }, { k: 5, t: 'e' }]);
    assert.strictEqual(body.truth, 0);
    assert.strictEqual(body.cite, 'https://example.org/3');
    assert.deepStrictEqual(body.picks, { 0: 12, 1: 5, 4: 3 });
    assert.strictEqual(body.total, 20);
    assert.strictEqual(body.nextAt, utc(2026, 11, 29, 22));
    assert.deepStrictEqual(body.yesterday, { text: 'Fact 2 is truth 2', fooledPct: 75, total: 40 });
    assert.strictEqual(body.pack, null);
    assert.strictEqual(body.friend, undefined);
    assert.deepStrictEqual(daily.puzzleBody(bank.en, noon('2026-11-29'), null, null, { seen: 5, fooled: 3 }).friend, { seen: 5, fooled: 3 });
    assert.deepStrictEqual(daily.puzzleBody(bank.en, noon('2026-11-29'), null, null).picks, {});
});

test('a Hanukkah day names its candle; the same question repeated on another day is an ordinary one', () => {
    const h = bankOf(q('he', 1, '2026-12-04', { pack: 'hanukkah', candle: 1 }), q('he', 2, '2026-12-05', { pack: 'hanukkah', candle: 2 }),
        q('he', 3, '2026-12-06', { pack: 'purim', candle: 9 }));
    const own = daily.puzzleBody(h.he, noon('2026-12-05'), null, null);
    assert.deepStrictEqual([own.pack, own.candle], ['hanukkah', 2]);
    const other = daily.puzzleBody(h.he, noon('2026-12-06'), null, null);
    assert.deepStrictEqual([other.pack, other.candle], [null, null]);
    const repeat = daily.puzzleBody(h.he, noon('2026-12-07'), null, null);
    assert.strictEqual(repeat.q, 'Fact 1 is $blank$');
    assert.deepStrictEqual([repeat.pack, repeat.candle], [null, null]);
});

test('tallies are read whether the database hands back a list or an object', () => {
    assert.deepStrictEqual(daily.cleanPicks([4, 2, null, 1], 3), { picks: { 0: 4, 1: 2, 3: 1 }, total: 7 });
    assert.deepStrictEqual(daily.cleanPicks({ 0: 4, 2: 1, f: 3 }, 3), { picks: { 0: 4, 2: 1, f: 3 }, total: 8 });
    // An answer the question does not have, a count that is no count: left out.
    assert.deepStrictEqual(daily.cleanPicks({ 0: 2, 4: 9, x: 5, 1: -3, 2: 'many', 3: 1.9 }, 3), { picks: { 0: 2, 3: 1 }, total: 3 });
    assert.deepStrictEqual(daily.cleanPicks(null, 3), { picks: {}, total: 0 });
    assert.strictEqual(daily.fooledPct({ picks: { 0: 39, 1: 61 }, total: 100 }), 61);
    assert.strictEqual(daily.fooledPct({ picks: {}, total: 0 }), null);
    assert.deepStrictEqual(daily.cleanFriend({ seen: 5, fooled: 3 }), { seen: 5, fooled: 3 });
    assert.deepStrictEqual(daily.cleanFriend({ fooled: 3 }), { seen: 0, fooled: 0 });
    assert.deepStrictEqual(daily.cleanFriend(null), { seen: 0, fooled: 0 });
});

test('the cache never holds a question past midnight in Israel', () => {
    assert.strictEqual(daily.cacheSeconds(noon('2026-11-27'), false), 300);
    assert.strictEqual(daily.cacheSeconds(noon('2026-11-27'), true), 60);
    assert.strictEqual(daily.cacheSeconds(utc(2026, 11, 27, 21, 58, 0), false), 120);
    assert.strictEqual(daily.cacheSeconds(utc(2026, 11, 27, 21, 59, 30), true), 30);
    assert.strictEqual(daily.cacheSeconds(utc(2026, 11, 27, 21, 59, 59) + 900, false), 1);
});

test('a sender\'s count is asked for today or yesterday only', () => {
    const now = noon('2026-11-28');
    assert.strictEqual(daily.cleanCountDay('2026-11-28', now), '2026-11-28');
    assert.strictEqual(daily.cleanCountDay('2026-11-27', now), '2026-11-27');
    ['2026-11-26', '2026-11-29', '', undefined, 'today'].forEach(d => assert.strictEqual(daily.cleanCountDay(d, now), null));
    assert.strictEqual(daily.cleanLinkId('k3x9q2ab'), 'k3x9q2ab');
    ['K3X9Q2AB', 'k3x9q2a', 'k3x9q2abc', 'k3x9q2a/', '', null, 12345678, '../../..x'].forEach(f => assert.strictEqual(daily.cleanLinkId(f), null));
    assert.strictEqual(daily.cleanLang('he'), 'he');
    assert.strictEqual(daily.cleanLang('fr'), 'en');
});

const now = noon('2026-11-28');
const post = more => daily.cleanPost(Object.assign({ lang: 'en', day: '2026-11-28', m: 'open', src: 'daily-home', uid: 'abcdefgh12345678' }, more), bank, now);

test('a post: an open and a press become one row, and change no tally', () => {
    assert.deepStrictEqual(post({}), {
        lang: 'en', day: '2026-11-28', add: [],
        row: { content_type: 'daily-home', method: 'open', crew_id: null, locale: 'en', uid: 'abcdefgh12345678' },
    });
    ['whatsapp', 'native', 'copy', 'fool-whatsapp', 'fool-native', 'fool-copy', 'create'].forEach(m => {
        const p = post({ m, k: 2, f: 'k3x9q2ab' });
        assert.deepStrictEqual([p.add, p.row.method], [[], m]);
    });
    assert.strictEqual(post({ m: 'delete' }), null);
    assert.strictEqual(post({ m: undefined }), null);
    // It arrives as text (sendBeacon, text/plain).
    assert.strictEqual(daily.cleanPost(JSON.stringify({ lang: 'he', day: '2026-11-28', m: 'open' }), bank, now).row.locale, 'he');
    assert.strictEqual(daily.cleanPost('{not json', bank, now), null);
    assert.strictEqual(daily.cleanPost(null, bank, now), null);
    assert.strictEqual(post({ lang: 'fr' }), null);
});

test('a post: how the visitor arrived becomes the content type', () => {
    const type = src => post({ src }).row.content_type;
    assert.strictEqual(type(''), 'daily');
    assert.strictEqual(type(undefined), 'daily');
    assert.strictEqual(type('daily'), 'daily');
    ['daily-home', 'daily-seo', 'daily-game', 'daily-share', 'daily-fool'].forEach(t => assert.strictEqual(type(t), t));
    assert.strictEqual(type('fb-he-hanukkah'), 'daily-post');
    assert.strictEqual(type('daily-other'), 'daily-post');
    assert.strictEqual(type('<script>'), 'daily', 'a tag the game would not keep is no tag');
    assert.deepStrictEqual(daily.DAILY_METHODS, ['open', 'truth', 'house', 'friend', 'whatsapp', 'native', 'copy',
        'fool-whatsapp', 'fool-native', 'fool-copy', 'create']);
});

test('a post: a pick adds one to its answer, only for an answer the question has', () => {
    assert.deepStrictEqual(post({ m: 'truth', k: 0 }).add, ['picks/0']);
    assert.deepStrictEqual(post({ m: 'house', k: 3 }).add, ['picks/3']);
    assert.strictEqual(post({ m: 'house', k: 4 }), null, 'the question of the 28th has three lies');
    assert.deepStrictEqual(daily.cleanPost({ lang: 'en', day: '2026-11-29', m: 'house', k: 5 }, bank, noon('2026-11-29')).add, ['picks/5']);
    assert.strictEqual(post({ m: 'house', k: 0 }), null);
    assert.strictEqual(post({ m: 'truth', k: 1 }), null);
    ['1', 1.5, -1, null, undefined, 'f', '../x', { a: 1 }].forEach(k => assert.strictEqual(post({ m: 'house', k }), null, String(k)));
    assert.strictEqual(daily.cleanPost({ lang: 'he', day: '2026-11-28', m: 'truth', k: 0 }, bankOf(q('en', 1, '2026-11-27')), now), null,
        'a language with no question keeps no pick');
});

test('a post: a pick on a friend\'s link counts for the link, and the friend\'s lie for "fooled"', () => {
    assert.deepStrictEqual(post({ m: 'truth', k: 0, f: 'k3x9q2ab' }).add, ['picks/0', 'links/k3x9q2ab/seen']);
    assert.deepStrictEqual(post({ m: 'house', k: 2, f: 'k3x9q2ab' }).add, ['picks/2', 'links/k3x9q2ab/seen']);
    assert.deepStrictEqual(post({ m: 'friend', k: 'f', f: 'k3x9q2ab' }).add, ['picks/f', 'links/k3x9q2ab/seen', 'links/k3x9q2ab/fooled']);
    assert.strictEqual(post({ m: 'friend', k: 'f' }), null, 'no link, no friend');
    assert.strictEqual(post({ m: 'friend', k: 1, f: 'k3x9q2ab' }), null);
    ['../../games', 'K3X9Q2AB', 'k3x9q2ab/seen', 'short', 12345678, { x: 1 }].forEach(f => {
        assert.strictEqual(post({ m: 'truth', k: 0, f }), null, String(f));
        assert.strictEqual(post({ m: 'friend', k: 'f', f }), null, String(f));
    });
    // Every path a post can write stays under its own day.
    const paths = [].concat(...[post({ m: 'friend', k: 'f', f: 'k3x9q2ab' }), post({ m: 'house', k: 1, f: 'zzzzzzzz' })].map(p => p.add));
    paths.forEach(p => assert.match(p, /^(picks\/(\d|f)|links\/[a-z0-9]{8}\/(seen|fooled))$/));
});

test('a post: today or yesterday only, so a pick sent just after midnight still counts for its day', () => {
    const justAfter = utc(2026, 11, 28, 22, 0, 5);
    assert.strictEqual(daily.israelDay(justAfter), '2026-11-29');
    assert.deepStrictEqual(daily.cleanPost({ lang: 'en', day: '2026-11-28', m: 'house', k: 1 }, bank, justAfter).add, ['picks/1']);
    assert.strictEqual(daily.cleanPost({ lang: 'en', day: '2026-11-27', m: 'house', k: 1 }, bank, justAfter), null);
    assert.strictEqual(daily.cleanPost({ lang: 'en', day: '2026-11-30', m: 'open' }, bank, justAfter), null);
    assert.strictEqual(post({ day: 'yesterday' }), null);
    assert.strictEqual(post({ day: undefined }), null);
});

test('a post: a play-test changes nothing and records nothing', () => {
    ['test', 'test-qa', 'TEST', 'test-daily-run'].forEach(src => {
        assert.strictEqual(post({ src }), null, src);
        assert.strictEqual(post({ src, m: 'truth', k: 0 }), null, src);
        assert.strictEqual(post({ src, m: 'friend', k: 'f', f: 'k3x9q2ab' }), null, src);
        assert.strictEqual(post({ src, m: 'create' }), null, src);
    });
    assert.ok(post({ src: 'testing-post' }), 'only "test" and "test-..." are test tags');
});

test('a post: the id is the browser\'s random id or nothing', () => {
    assert.strictEqual(post({ uid: 'abc_DEF-123' }).row.uid, 'abc_DEF-123');
    ['', null, 12, 'a b', 'x'.repeat(65), 'name@example.com'].forEach(uid => assert.strictEqual(post({ uid }).row.uid, null));
    assert.deepStrictEqual(Object.keys(post({}).row).sort(), ['content_type', 'crew_id', 'locale', 'method', 'uid'],
        'existing shares columns only');
});

test('the wiring: /_daily is served before the Hebrew rewrites, and nothing needs a new database rule', () => {
    const root = path.join(__dirname, '..', '..');
    const rewrites = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8')).hosting.rewrites;
    const at = source => rewrites.findIndex(r => r.source === source);
    assert.deepStrictEqual(rewrites[at('/_daily')], { source: '/_daily', function: 'daily' });
    assert.ok(at('/_daily') >= 0 && at('/_daily') < at('/he') && at('/_daily') < at('/he/**') && at('/_daily') < at('**'));
    assert.match(fs.readFileSync(path.join(root, 'functions', 'src', 'firebase.ts'), 'utf8'), /dailyRef = qHistoryRef\.child\('daily'\)/);
    const rules = JSON.parse(fs.readFileSync(path.join(root, 'database-rules.json'), 'utf8')).rules;
    assert.strictEqual(rules.daily, undefined);
    assert.deepStrictEqual(rules.qHistory, { '.read': "auth.uid == 'bl-service-worker'", '.write': "auth.uid == 'bl-service-worker'" },
        'the tallies sit under a path only the server reads and writes');
    const index = fs.readFileSync(path.join(root, 'functions', 'src', 'index.ts'), 'utf8');
    assert.match(index, /exports\.daily = /);
    assert.doesNotMatch(index.slice(index.indexOf('exports.daily = '), index.indexOf('exports.newGame = ')), /questionsRef|gamesRef/,
        'the puzzle never touches the game\'s bank or its games');
});

// The questions are a file of their own (data/daily-questions.json, with its own test). Until it is
// in the checkout the function answers "no question" and the page says so; once it is, the function
// must keep every entry of it.
test('the function keeps every question of the file, when the file is there', (t) => {
    const file = path.join(__dirname, '..', 'data', 'daily-questions.json');
    if (!fs.existsSync(file)) {
        assert.deepStrictEqual(daily.loadDaily(undefined), { en: [], he: [] });
        return t.skip('data/daily-questions.json is not in this checkout yet');
    }
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const loaded = daily.loadDaily(raw);
    assert.strictEqual(loaded.en.length + loaded.he.length, Object.keys(raw).length);
    assert.strictEqual(loaded.en[0].day, loaded.he[0].day, 'both languages start the same day, so their numbers match');
    for (const q of loaded.en.concat(loaded.he)) {
        assert.deepStrictEqual([q.questionText, q.realAnswer, q.fakeAnswers, q.citation], [raw[q.id].questionText, raw[q.id].realAnswer, raw[q.id].fakeAnswers, raw[q.id].citation], q.id);
        assert.deepStrictEqual([q.pack, q.candle], [raw[q.id].pack, raw[q.id].candle], q.id);
    }
});
