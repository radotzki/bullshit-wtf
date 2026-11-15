// The daily puzzle's rules (seo/daily-core.js), run with the game's own answer and name checks as
// the page gets them (seo/daily-page.js): the friend's lie inside a link, the screen a lie must
// pass before it is sent and again before it is shown, the answers, the links.
// Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const core = require('../seo/daily-core');
const page = require('../seo/daily-page');
const { en, he } = require('../seo/daily-strings');

const shared = page.loadShared();
const lists = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'name-lists.json'), 'utf8'));
const truth = 'dancing';
const lies = ['laughing', 'sneezing', 'hiccuping'];
const screen = (lie, name = '') => core.screenLie(lie, name, truth, lies, shared.isSameAnswer, shared.nameFlag);
const b64 = v => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v), 'utf8').toString('base64url');
const ch = code => String.fromCharCode(code);

test('a lie travels in the link and comes back as typed, in both alphabets', () => {
    for (const [name, lie] of [['Dana', 'singing hymns'], ['דנה', 'לשיר מזמורים'], ['', 'a lie with no name'], ['Zoë', 'crème brûlée 🙂']]) {
        const code = core.encodeLie(name, lie);
        assert.match(code, /^[A-Za-z0-9_-]+$/, 'safe in an address as it is');
        assert.deepStrictEqual(core.decodeLie(code), { name, lie });
        assert.ok(!code.includes(lie) && !decodeURIComponent(code).includes(lie), 'the address does not show the lie');
    }
    assert.deepStrictEqual(core.decodeLie(core.encodeLie('  Dana ', ' two   spaces ')), { name: 'Dana', lie: 'two spaces' });
});

test('a link carries a name and a lie and nothing else', () => {
    const refused = {
        'not base64': '<script>alert(1)</script>',
        'empty': '',
        'no JSON': b64('just text'),
        'an object': b64({ name: 'a', lie: 'b' }),
        'one text': b64(['a']),
        'three texts': b64(['a', 'b', 'c']),
        'a number': b64(['a', 5]),
        'a list inside': b64(['a', ['b']]),
        'no lie': b64(['Dana', '']),
        'a lie of 41 letters': b64(['', 'x'.repeat(41)]),
        'a name of 10 letters': b64(['x'.repeat(10), 'lie']),
        'a line break': b64(['', 'two\nlines']),
        'a direction override': b64(['', 'abc' + ch(0x202e) + 'def']),
        'a zero-width space': b64(['', 'ab' + ch(0x200b) + 'c']),
        'a direction isolate in the name': b64([ch(0x2067) + 'Dana', 'lie']),
        'spaces at the ends': b64(['', ' lie ']),
        'something huge': b64(['', 'x'.repeat(5000)]),
    };
    for (const [what, code] of Object.entries(refused)) {
        assert.strictEqual(core.decodeLie(code), null, what);
    }
    [null, undefined, 5, {}, []].forEach(v => assert.strictEqual(core.decodeLie(v), null));
    assert.deepStrictEqual(core.decodeLie(b64(['', 'x'.repeat(40)])), { name: '', lie: 'x'.repeat(40) }, '40 letters fit');
    assert.deepStrictEqual(core.decodeLie(b64(['x'.repeat(9), 'ש'.repeat(40)])), { name: 'x'.repeat(9), lie: 'ש'.repeat(40) });
});

test('the screen: the truth, however it is typed, is no lie', () => {
    ['dancing', 'Dancing', ' DANCING! ', 'the dancing', '"dancing"'].forEach(l => assert.strictEqual(screen(l), 'truth', l));
    assert.strictEqual(core.screenLie('הלונדון', '', 'לונדון', [], shared.isSameAnswer, shared.nameFlag), 'truth', 'a Hebrew prefix letter');
    assert.strictEqual(screen('prancing'), null);
});

test('the screen: an answer that is already there is taken', () => {
    ['laughing', 'Sneezing', 'the hiccuping.'].forEach(l => assert.strictEqual(screen(l), 'taken', l));
});

test('the screen: slurs and sex words are refused in the lie and in the name, by the game\'s own lists', () => {
    const words = [].concat(lists.hate.any || [], lists.hate.word || [], lists.sex.any || [], lists.sex.word || []).filter(w => w.length <= 9);
    assert.ok(words.length > 10, 'the lists are there');
    for (const w of words) {
        assert.strictEqual(screen(w), 'refused', `the lie "${w}"`);
        assert.strictEqual(screen('a harmless lie', w), 'refused', `the name "${w}"`);
        assert.strictEqual(screen(`really ${w} thing`), 'refused', `"${w}" inside a lie`);
    }
});

test('the screen: no link, address, handle or phone number', () => {
    ['see bit.ly/abc', 'http://x', 'HTTPS://EVIL.EXAMPLE', 'www.evil', 'evil.example.com', 'go to x.io now', 'javascript://x', 'me@home', '@dana',
        '0541234567', 'call 12345', 'x'.repeat(41)].forEach(l => assert.strictEqual(screen(l), 'refused', l));
    assert.strictEqual(screen('fine', 'x'.repeat(10)), 'refused', 'a name over 9 letters');
    assert.strictEqual(screen('fine', 'a@b'), 'refused');
    // Ordinary answers pass: numbers, years, initials, sentences.
    ['1,000,000 dollars', 'in 1518', '3.5 million', 'St. Louis', 'the U.S. Army', '9 a.m.', 'his mother-in-law', 'לשיר בקול', '99 red balloons', 'it. Twice.']
        .forEach(l => assert.strictEqual(screen(l), null, l));
    assert.strictEqual(screen(''), 'empty');
    assert.strictEqual(screen('   '), 'empty');
    assert.strictEqual(screen(ch(0x200b) + ch(0x202e)), 'empty', 'only unseen characters is nothing typed');
});

test('markup is only ever text: the screen lets it through, and the page shows it with textContent', () => {
    // Short markup is not refused here on purpose: the guard is that nothing typed is ever HTML.
    assert.strictEqual(screen('<b>bold</b>'), null);
    const client = fs.readFileSync(path.join(__dirname, '..', 'seo', 'daily-client.js'), 'utf8');
    assert.doesNotMatch(client, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/);
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', 'seo', 'daily-core.js'), 'utf8'), /innerHTML|document\./);
});

test('tidy text has no unseen characters and single spaces', () => {
    assert.strictEqual(core.tidy('  a   b\t\nc  '), 'a b c');
    [0x00, 0x1f, 0x7f, 0x9f, 0xad, 0x61c, 0x200b, 0x200e, 0x200f, 0x2028, 0x202a, 0x202e, 0x2066, 0x2069, 0xfeff].forEach(code => {
        assert.strictEqual(core.tidy('a' + ch(code) + 'b').replace(' ', ''), 'ab', 'U+' + code.toString(16));
    });
    assert.strictEqual(core.tidy(null), '');
    assert.strictEqual(core.tidy('שלום עולם'), 'שלום עולם');
});

test('four answers: the truth and three lies, or the truth, two lies and the friend\'s', () => {
    for (let lieCount = 3; lieCount <= 5; lieCount++) {
        for (let i = 0; i < 200; i++) {
            const plain = core.chooseOrder(lieCount, false);
            assert.strictEqual(plain.length, 4);
            assert.ok(plain.includes(0) && !plain.includes('f') && new Set(plain).size === 4 && plain.every(k => k >= 0 && k <= lieCount));
            assert.ok(core.validOrder(plain, lieCount, false));
            const friend = core.chooseOrder(lieCount, true);
            assert.strictEqual(friend.length, 4);
            assert.ok(friend.includes(0) && friend.includes('f') && new Set(friend).size === 4);
            assert.ok(core.validOrder(friend, lieCount, true));
            assert.ok(!core.validOrder(friend, lieCount, false), 'no friend, no friend\'s answer');
        }
    }
    // Every place and every lie comes up.
    const first = new Set();
    const used = new Set();
    for (let i = 0; i < 400; i++) { const o = core.chooseOrder(5, false); first.add(o[0]); o.forEach(k => used.add(k)); }
    assert.strictEqual(used.size, 6);
    assert.ok(first.has(0) && first.size > 3);
    [null, 'x', [], [0], [1, 2, 3, 4], [0, 0, 1, 2], [0, 1, 2, 9], [0, 1, 2, 3, 4], [0, '1', 2, 3], [0, 1.5, 2, 3]].forEach(o => assert.ok(!core.validOrder(o, 3, false), JSON.stringify(o)));
});

test('numbers show from 20 picks on', () => {
    assert.strictEqual(core.MIN_PICKS, 20);
    assert.strictEqual(core.fooledPct({ 0: 7, 1: 12 }, 19), null);
    assert.strictEqual(core.fooledPct({ 0: 8, 1: 12 }, 20), 60);
    assert.strictEqual(core.fooledPct({ 0: 39, 1: 30, 2: 20, f: 11 }, 100), 61);
    assert.strictEqual(core.fooledPct({}, 0), null);
    assert.strictEqual(core.fooledPct(undefined, undefined), null);
    assert.strictEqual(core.percent(1, 3), 33);
    assert.deepStrictEqual([core.pickKind(0), core.pickKind(2), core.pickKind('f')], ['truth', 'house', 'friend']);
});

test('the links', () => {
    assert.strictEqual(core.resultUrl('https://bullshit.wtf', en), 'https://bullshit.wtf/daily?via=daily-share');
    assert.strictEqual(core.resultUrl('https://bullshit.wtf', he), 'https://bullshit.wtf/he/daily?via=daily-share');
    const url = core.foolUrl('https://bullshit.wtf', he, 12, 'k3x9q2ab', 'דנה', 'לשיר');
    assert.match(url, /^https:\/\/bullshit\.wtf\/he\/daily\?via=daily-fool&n=12&f=k3x9q2ab&l=[A-Za-z0-9_-]+$/);
    const back = core.readArrival(url.slice(url.indexOf('?')));
    assert.deepStrictEqual([back.tag, back.no, back.f], ['daily-fool', 12, 'k3x9q2ab']);
    assert.deepStrictEqual(core.decodeLie(back.l), { name: 'דנה', lie: 'לשיר' });
    assert.deepStrictEqual(core.readArrival('?via=daily-fool&n=-3&f=k3x9q2ab&l=x').no, -3, 'a day before the first has its own number');
    assert.deepStrictEqual(core.readArrival(''), { tag: '', no: null, f: null, l: '' });
    assert.deepStrictEqual(core.readArrival('?via=%3Cscript%3E&n=1e9&f=../../x&l='), { tag: '', no: null, f: null, l: '' });
    assert.strictEqual(core.readArrival('?via=FB-He-1').tag, 'fb-he-1');
});

test('START A GAME carries the tag the visitor arrived with, or plain daily', () => {
    assert.strictEqual(core.createUrl(en, '', ''), '/create-game?via=daily');
    assert.strictEqual(core.createUrl(en, 'daily-fool', ''), '/create-game?via=daily-fool');
    assert.strictEqual(core.createUrl(he, 'daily-share', ''), '/create-game?via=daily-share&lang=he');
    assert.strictEqual(core.createUrl(en, 'fb-he-hanukkah', ''), '/create-game?via=fb-he-hanukkah', 'a post keeps its own tag');
    assert.strictEqual(core.createUrl(en, 'test', ''), '/create-game?via=test', 'a play-test makes a test game');
    assert.strictEqual(core.createUrl(he, 'daily-home', 'hanukkah'), '/create-game?via=daily-home&lang=he&pack=hanukkah');
    assert.strictEqual(core.createUrl(en, '"><script>', 'purim'), '/create-game?via=daily');
    // Every tag the page can send is one the game keeps (cleanCampaign in game-model).
    const model = fs.readFileSync(path.join(__dirname, '..', '..', 'game-model.ts'), 'utf8');
    assert.ok(model.includes('/^[a-z0-9][a-z0-9-]{0,39}$/'));
    ['daily', 'daily-home', 'daily-seo', 'daily-game', 'daily-share', 'daily-fool'].forEach(t => assert.strictEqual(core.cleanTag(t), t));
});

test('the question, the clock, the answer from the server', () => {
    assert.strictEqual(core.sentence('It is $blank$ today'), 'It is ____ today');
    assert.deepStrictEqual(core.halves('It is $blank$ today'), ['It is ', ' today']);
    assert.deepStrictEqual(core.halves('Ends with $blank$'), ['Ends with ', '']);
    assert.strictEqual(core.clock(7 * 3600e3 + 12 * 60e3 + 44e3 + 999), '07:12:44');
    assert.strictEqual(core.clock(-5), '00:00:00');
    const good = { no: 1, day: '2026-11-27', q: 'A $blank$', truth: 0, options: [0, 1, 2, 3].map(k => ({ k, t: 't' + k })) };
    assert.ok(core.validPuzzle(good));
    assert.ok(!core.validPuzzle(null));
    assert.ok(!core.validPuzzle('<!doctype html>'), 'the app\'s own page in place of the answer');
    assert.ok(!core.validPuzzle(Object.assign({}, good, { options: good.options.slice(0, 3) })));
    assert.ok(!core.validPuzzle(Object.assign({}, good, { options: [{ k: 1, t: 'a' }].concat(good.options.slice(1)) })));
    assert.ok(!core.validPuzzle({ error: 'no-question' }));
    assert.strictEqual(core.safeCite('https://en.wikipedia.org/wiki/X_(y)'), 'https://en.wikipedia.org/wiki/X_(y)');
    ['javascript:alert(1)', 'data:text/html,x', '//evil', '', null, 'https://a b'].forEach(c => assert.strictEqual(core.safeCite(c), ''));
});
