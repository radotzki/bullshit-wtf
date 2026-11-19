// Unit tests for the past daily puzzle pages (controllers/daily-past.ts): which days are public, the
// addresses, the pages and their sitemap. Run with: npm test.
const test = require('node:test');
const assert = require('node:assert');
const daily = require('../dist/controllers/daily');
const past = require('../dist/controllers/daily-past');

const q = (lang, n, day, more) => [`daily-26-${lang}-${String(n).padStart(3, '0')}`, Object.assign({
    day, lang, questionText: `Fact ${n} is $blank$ indeed`, realAnswer: `truth ${n}`,
    fakeAnswers: [`lie ${n}a`, `lie ${n}b`, `lie ${n}c`], citation: 'https://example.org/' + n,
}, more)];
const bank = daily.loadDaily(Object.fromEntries([
    q('en', 1, '2026-11-14'), q('en', 2, '2026-11-15'), q('en', 3, '2026-11-16'), q('en', 4, '2026-11-17'),
    q('en', 5, '2026-11-18'), q('en', 6, '2026-11-19'), q('en', 7, '2026-11-20'),
    q('he', 1, '2026-11-14'), q('he', 2, '2026-11-15'), q('he', 3, '2026-11-16'), q('he', 4, '2026-11-17'),
    q('he', 5, '2026-11-18'), q('he', 6, '2026-11-19'), q('he', 7, '2026-11-20'),
]));
const scripts = { arrival: '<script>/*arrival*/</script>', beacon: '<script>/*beacon*/</script>' };
const at = iso => Date.parse(iso);
const page = (lang, day, now) => past.dayPage(bank, lang, day, now, scripts);

test('a day is public once it has ended in Israel and in Honolulu, never before', () => {
    // 19 Nov, 00:30 in Israel (22:30 UTC on the 18th): Israel's today is the 19th, Honolulu's the 18th.
    assert.strictEqual(past.lastPublicDay(at('2026-11-18T22:30:00Z')), '2026-11-17');
    // 19 Nov 09:59 UTC: Honolulu is still on the 18th.
    assert.strictEqual(past.lastPublicDay(at('2026-11-19T09:59:59Z')), '2026-11-17');
    // 10:00 UTC: midnight in Honolulu, the 18th has ended everywhere.
    assert.strictEqual(past.lastPublicDay(at('2026-11-19T10:00:00Z')), '2026-11-18');
    // Late on the 19th in Israel, still only the 18th.
    assert.strictEqual(past.lastPublicDay(at('2026-11-19T21:59:00Z')), '2026-11-18');
    // In Israel's summer time (UTC+3) too.
    assert.strictEqual(past.lastPublicDay(at('2026-07-01T21:30:00Z')), '2026-06-30');
    assert.strictEqual(past.lastPublicDay(at('2026-07-02T09:59:00Z')), '2026-06-30');
    assert.strictEqual(past.lastPublicDay(at('2026-07-02T10:00:00Z')), '2026-07-01');
    assert.strictEqual(past.nextPublicAt(at('2026-11-19T09:00:00Z')), at('2026-11-19T10:00:00Z'));
    assert.strictEqual(past.nextPublicAt(at('2026-11-19T10:00:00Z')), at('2026-11-20T10:00:00Z'));
});

test('Honolulu has one offset all year (the rule rests on it)', () => {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Honolulu', year: 'numeric', month: '2-digit', day: '2-digit' });
    for (let t = at('2026-01-01T00:00:00Z'); t < at('2028-01-01T00:00:00Z'); t += 3 * 3600 * 1000 + 7 * 60 * 1000) {
        assert.strictEqual(past.usLastDay(t), f.format(new Date(t)), new Date(t).toISOString());
    }
});

test('today, tomorrow and yesterday before it ended in the US have no page, in either language', () => {
    for (const lang of ['en', 'he']) {
        const now = at('2026-11-19T08:00:00Z');
        assert.strictEqual(page(lang, '2026-11-19', now), null, 'today');
        assert.strictEqual(page(lang, '2026-11-20', now), null, 'tomorrow');
        assert.strictEqual(page(lang, '2026-11-18', now), null, 'yesterday, still the 18th in Honolulu');
        assert.ok(page(lang, '2026-11-17', now), 'the day before yesterday');
        assert.ok(page(lang, '2026-11-18', at('2026-11-19T10:00:00Z')), 'yesterday, once it ended in Honolulu');
        assert.strictEqual(page(lang, '2026-11-13', now), null, 'before the first day');
        // The list, the sitemap and the day pages never name a day that isn't public, or its answer.
        const list = past.listPage(bank, lang, now, scripts);
        const map = past.sitemap(bank, now);
        for (const hidden of ['2026-11-18', '2026-11-19', '2026-11-20']) {
            assert.ok(list.indexOf(hidden) < 0, 'list: ' + hidden);
            assert.ok(map.indexOf(hidden) < 0, 'sitemap: ' + hidden);
            assert.ok(page(lang, '2026-11-17', now).indexOf(hidden) < 0, 'the newest page links no later day: ' + hidden);
        }
        for (const n of [5, 6, 7]) {
            assert.ok(list.indexOf(`truth ${n}`) < 0 && list.indexOf(`Fact ${n} `) < 0, 'list: question ' + n);
            assert.ok(map.indexOf(`truth ${n}`) < 0);
        }
        assert.strictEqual(past.answer(bank, (lang === 'he' ? '/he' : '') + '/daily/2026-11-19', now, scripts).status, 404);
    }
});

test('a repeat day (no question of its own) has no page', () => {
    const gap = daily.loadDaily(Object.fromEntries([q('en', 1, '2026-11-14'), q('en', 3, '2026-11-16')]));
    const now = at('2026-11-20T12:00:00Z');
    assert.ok(past.dayPage(gap, 'en', '2026-11-14', now, scripts));
    assert.strictEqual(past.dayPage(gap, 'en', '2026-11-15', now, scripts), null);
    const p16 = past.dayPage(gap, 'en', '2026-11-16', now, scripts);
    assert.ok(p16.indexOf('rel="prev"') < 0, 'no link across the gap');
    assert.ok(p16.indexOf('#3 ·') >= 0, 'numbered as /daily numbers it');
});

test('addresses', () => {
    assert.deepStrictEqual(past.route('/daily/2026-11-18'), { kind: 'day', lang: 'en', day: '2026-11-18' });
    assert.deepStrictEqual(past.route('/he/daily/2026-11-18/'), { kind: 'day', lang: 'he', day: '2026-11-18' });
    assert.deepStrictEqual(past.route('/daily/past'), { kind: 'list', lang: 'en' });
    assert.deepStrictEqual(past.route('/he/daily/past?via=x'), { kind: 'list', lang: 'he' });
    assert.deepStrictEqual(past.route('/sitemap-daily.xml'), { kind: 'sitemap' });
    ['/daily/2026-02-30', '/daily/2026-11-1', '/daily', '/daily/x', '/fr/daily/2026-11-18', '/daily/2026-11-18/x', null, 7]
        .forEach(p => assert.strictEqual(past.route(p), null, String(p)));
});

test('a day page: playable, its answer in a details block, twins, canonical, links and its own tag', () => {
    const now = at('2026-11-20T12:00:00Z');
    const en = page('en', '2026-11-16', now);
    assert.match(en, /<html lang="en" dir="ltr" data-page="plain">/);
    assert.match(en, /<link rel="canonical" href="https:\/\/bullshit\.wtf\/daily\/2026-11-16">/);
    assert.match(en, /hreflang="he" href="https:\/\/bullshit\.wtf\/he\/daily\/2026-11-16"/);
    assert.match(en, /hreflang="x-default" href="https:\/\/bullshit\.wtf\/daily\/2026-11-16"/);
    assert.match(en, /<title>Fact 3 is _____ indeed · Bullshit daily #3<\/title>/);
    assert.match(en, /<meta name="description" content="Which is true: [^"]*truth 3[^"]*\? Pick one, then see the answer, the lies and the source\. Bullshit&#39;s daily puzzle for November 16, 2026\.">/);
    assert.strictEqual((en.match(/<button type="button" class="answer" data-k="\d">/g) || []).length, 4);
    assert.match(en, /<details class="answer-box" id="p-answer">[\s\S]*Fact 3 is truth 3 indeed[\s\S]*The truth: truth 3[\s\S]*The lies: lie 3a, lie 3b, lie 3c[\s\S]*https:\/\/example\.org\/3[\s\S]*<\/details>/);
    assert.match(en, /href="\/daily\/2026-11-15" rel="prev"/);
    assert.match(en, /href="\/daily\/2026-11-17" rel="next"/);
    assert.match(en, /href="\/daily\/past"/);
    assert.match(en, /href="\/create-game\?lang=en&amp;via=daily-past"/);
    assert.match(en, /Play this with friends/);
    assert.ok(en.indexOf('/*arrival*/') > 0 && en.indexOf('/*beacon*/') > 0);
    const he = page('he', '2026-11-16', now);
    assert.match(he, /<html lang="he" dir="rtl" data-page="plain">/);
    assert.match(he, /<link rel="canonical" href="https:\/\/bullshit\.wtf\/he\/daily\/2026-11-16">/);
    assert.match(he, /href="\/create-game\?lang=he&amp;via=daily-past"/);
    assert.match(he, /16 בנובמבר 2026/);
    assert.match(he, /href="\/he\/daily\/past"/);
    // The first day has no day before; the newest public day none after.
    assert.ok(page('en', '2026-11-14', now).indexOf('rel="prev"') < 0);
    assert.ok(page('en', '2026-11-19', now).indexOf('rel="next"') < 0);
});

test('the order of the answers is fixed per question, and the truth is not always first', () => {
    const firsts = new Set();
    for (const [, x] of bank.en.map(v => [0, v])) {
        const a = past.answerOrder(x), b = past.answerOrder(x);
        assert.deepStrictEqual(a, b);
        assert.deepStrictEqual(a.map(o => o.k).sort(), [0, 1, 2, 3]);
        firsts.add(a[0].k);
    }
    assert.ok(firsts.size > 1);
});

test('text from the file is escaped everywhere', () => {
    const bad = daily.loadDaily(Object.fromEntries([q('en', 1, '2026-11-14', {
        questionText: '<script>alert(1)</script> "x" & $blank$', realAnswer: '<b>t</b>', fakeAnswers: ['</details>', '<i>', '"\'>'],
    })]));
    const html = past.dayPage(bad, 'en', '2026-11-14', at('2026-11-20T12:00:00Z'), scripts);
    assert.ok(html.indexOf('<script>alert') < 0 && html.indexOf('<b>t</b>') < 0 && html.indexOf('<i>') < 0);
    assert.strictEqual((html.match(/<\/details>/g) || []).length, 1);
});

test('the list, newest first, and the sitemap with both lists and every public day', () => {
    const now = at('2026-11-20T12:00:00Z');
    const list = past.listPage(bank, 'en', now, scripts);
    assert.ok(list.indexOf('/daily/2026-11-19') < list.indexOf('/daily/2026-11-14'));
    assert.match(list, /href="\/create-game\?lang=en&amp;via=daily-past-list"/);
    assert.match(list, /<link rel="canonical" href="https:\/\/bullshit\.wtf\/daily\/past">/);
    assert.ok(!/truth \d/.test(list), 'the list holds no answer');
    const map = past.sitemap(bank, now);
    assert.strictEqual((map.match(/<url>/g) || []).length, 2 + 6 * 2);
    assert.match(map, /<loc>https:\/\/bullshit\.wtf\/he\/daily\/past<\/loc>/);
    assert.match(map, /<loc>https:\/\/bullshit\.wtf\/he\/daily\/2026-11-19<\/loc>\n    <xhtml:link rel="alternate" hreflang="en" href="https:\/\/bullshit\.wtf\/daily\/2026-11-19"\/>/);
    const empty = past.listPage(bank, 'he', at('2026-11-14T12:00:00Z'), scripts);
    assert.match(empty, /השאלה הראשונה תופיע כאן/);
});

test('answers: status, type, noindex and a cache that ends when the next day turns public', () => {
    const now = at('2026-11-20T09:30:00Z');
    const ok = past.answer(bank, '/daily/2026-11-18', now, scripts);
    assert.strictEqual(ok.status, 200);
    assert.strictEqual(ok.noindex, false);
    assert.strictEqual(ok.cache, 1800);
    assert.strictEqual(past.answer(bank, '/daily/2026-11-18', at('2026-11-20T02:00:00Z'), scripts).cache, 3600);
    assert.strictEqual(past.answer(bank, '/daily/2026-11-18', at('2026-11-20T09:59:50Z'), scripts).cache, 60);
    const no = past.answer(bank, '/he/daily/2026-11-30', now, scripts);
    assert.strictEqual(no.status, 404);
    assert.strictEqual(no.noindex, true);
    assert.match(no.body, /<meta name="robots" content="noindex">/);
    assert.match(no.body, /lang="he"/);
    assert.match(past.answer(bank, '/sitemap-daily.xml', now, scripts).type, /xml/);
});

test('the real question file: every public day renders in both languages, and none ahead of time', () => {
    const real = daily.loadDaily(require('../data/daily-questions.json'));
    const now = at('2026-11-19T03:00:00Z');
    for (const lang of ['en', 'he']) {
        const shown = past.publicQuestions(real[lang], now);
        assert.ok(shown.every(x => x.day <= '2026-11-17'));
        shown.forEach(x => assert.ok(past.dayPage(real, lang, x.day, now, scripts), x.id));
        real[lang].filter(x => x.day >= '2026-11-18').forEach(x => {
            assert.strictEqual(past.dayPage(real, lang, x.day, now, scripts), null, x.id);
        });
    }
    const map = past.sitemap(real, now);
    assert.ok(map.indexOf('2026-11-18') < 0 && map.indexOf('2026-11-19') < 0);
});
