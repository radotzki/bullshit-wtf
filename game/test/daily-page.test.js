// The daily puzzle's two pages as the build writes them (seo/daily-page.js), and the ways in from
// the rest of the site. Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const daily = require('../seo/daily-page');
const pages = require('../seo/pages');
const { en, he } = require('../seo/daily-strings');

const root = path.join(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const html = { en: daily.render('en'), he: daily.render('he') };
const meta = (page, name) => (new RegExp(`<meta (?:property|name)="${name}" content="([^"]*)"`).exec(page) || [])[1];

test('two pages, twins of each other, each in its language', () => {
    assert.deepStrictEqual(daily.pages().map(p => p.path), ['/daily', '/he/daily']);
    assert.match(html.en, /<html lang="en" dir="ltr">/);
    assert.match(html.he, /<html lang="he" dir="rtl">/);
    for (const page of [html.en, html.he]) {
        assert.ok(page.includes('<link rel="alternate" hreflang="en" href="https://bullshit.wtf/daily">'));
        assert.ok(page.includes('<link rel="alternate" hreflang="he" href="https://bullshit.wtf/he/daily">'));
    }
    assert.ok(html.en.includes('<link rel="canonical" href="https://bullshit.wtf/daily">'));
    assert.ok(html.he.includes('<link rel="canonical" href="https://bullshit.wtf/he/daily">'));
    assert.ok(html.en.includes('href="/he/daily" hreflang="he"') && html.he.includes('href="/daily" hreflang="en"'), 'each links to the other');
    assert.ok(!/noindex/.test(html.en + html.he), 'the page is meant to be found');
    assert.ok(!pages.some(p => p.path === '/daily' || p.path === '/he/daily'), 'no search page takes its address');
});

test('the link preview is the same every day, with its own picture', () => {
    for (const [lang, s] of [['en', en], ['he', he]]) {
        assert.strictEqual(meta(html[lang], 'og:title'), s.title.replace(/'/g, '\''));
        assert.strictEqual(meta(html[lang], 'og:description'), s.description);
        assert.strictEqual(meta(html[lang], 'og:image'), 'https://bullshit.wtf' + s.image);
        assert.strictEqual(meta(html[lang], 'og:image:width'), '1200');
        assert.strictEqual(meta(html[lang], 'og:image:height'), '630');
        assert.strictEqual(meta(html[lang], 'twitter:card'), 'summary_large_image');
        const file = path.join(root, 'game', 'src', s.image);
        assert.ok(fs.existsSync(file), `${s.image} is in the site's assets`);
        // A PNG's size is in its header: 1200 by 630.
        const png = fs.readFileSync(file);
        assert.deepStrictEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630], s.image);
    }
});

test('before the script runs the page already says what it is, and says so without JavaScript', () => {
    assert.ok(html.en.includes('TODAY&#39;S BULLSHIT</h1>') || html.en.includes('TODAY\'S BULLSHIT</h1>'));
    assert.ok(html.he.includes('הבולשיט היומי</h1>'));
    assert.ok(html.en.includes(en.instruction) && html.he.includes(he.instruction));
    assert.ok(html.en.includes('<noscript>') && html.he.includes('<noscript>'));
});

test('the page\'s scripts are whole and cannot be cut short by what they hold', () => {
    for (const page of [html.en, html.he]) {
        const scripts = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
        assert.strictEqual(scripts.length, 4, 'the words, the shared checks, the rules, the page script');
        scripts.forEach(js => assert.doesNotThrow(() => new vm.Script(js), 'each parses'));
        assert.ok(!/<\/script/i.test(scripts.join('')) && !scripts.join('').includes('<!--'));
    }
    // Run them, without a document, as far as the page script (which needs one).
    const sandbox = { btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary') };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    [...html.he.matchAll(/<script>([\s\S]*?)<\/script>/g)].slice(0, 3).forEach(m => vm.runInContext(m[1], sandbox));
    assert.strictEqual(sandbox.BSDaily.s.lang, 'he');
    assert.strictEqual(sandbox.BSDaily.s.foolSend, he.foolSend);
    assert.strictEqual(typeof sandbox.BSDailyShared.isSameAnswer, 'function');
    assert.strictEqual(sandbox.BSDailyShared.nameFlag('שלום'), null);
    assert.strictEqual(JSON.stringify(sandbox.BSDailyCore.decodeLie(sandbox.BSDailyCore.encodeLie('דנה', 'לשיר'))), JSON.stringify({ name: 'דנה', lie: 'לשיר' }));
});

test('the checks in the page are the game\'s own, not a copy', () => {
    const shared = daily.loadShared();
    assert.ok(shared.isSameAnswer('The London', 'london') && !shared.isSameAnswer('Paris', 'london'));
    assert.strictEqual(shared.nameFlag('Dana'), null);
    const lists = JSON.parse(read('name-lists.json'));
    assert.ok(['hate', 'sex'].includes(shared.nameFlag(lists.hate.any[0])));
    assert.ok(daily.sharedScript().includes(JSON.stringify(lists.swap_names.en[0])), 'name-lists.json is written in as it is');
});

test('the hint names the most players a game takes, read from the game\'s code', () => {
    const m = /export const MAX_PLAYERS\s*=\s*(\d+)/.exec(read('game-model.ts'));
    assert.strictEqual(daily.maxPlayers(), m ? Number(m[1]) : 8);
    assert.ok(html.en.includes(`"max":${daily.maxPlayers()}`));
});

test('the ways in: search pages, How to play, the home page, the taste\'s final screen', () => {
    assert.strictEqual(daily.linkTo('en', 'daily-seo'), '/daily?via=daily-seo');
    assert.strictEqual(daily.linkTo('he', 'daily-seo'), '/he/daily?via=daily-seo');
    const build = read('game/seo/build-pages.js');
    assert.ok(build.includes('daily.linkTo(s.lang, \'daily-seo\')') && build.includes('daily.strings[s.lang].seoLink'), 'the footer links of every search page');
    const how = pages.filter(p => p.path === '/how-to-play' || p.path === '/he/how-to-play');
    assert.strictEqual(how.length, 2);
    assert.ok(how[0].body.includes(`<a href="/daily?via=daily-seo">${en.seoLink}</a>`));
    assert.ok(how[1].body.includes(`<a href="/he/daily?via=daily-seo">${he.seoLink}</a>`));
    for (const file of ['mobile-landing/mobile-landing', 'desktop-landing/desktop-landing']) {
        const home = read(`game/src/app/pages/landing/${file}.component.html`);
        assert.ok(home.includes('[href]="t.lang === \'he\' ? \'/he/daily?via=daily-home\' : \'/daily?via=daily-home\'">{{ t.daily }}</a>'), file);
    }
    const homeStrings = read('game/src/app/pages/landing/home-strings.ts');
    assert.ok(homeStrings.includes('daily: \'Today\\\'s question: can you spot the truth?\'') && homeStrings.includes('daily: \'השאלה של היום: תמצאו את האמת?\''));
    const final = read('game/src/app/pages/score-board-final/score-board-final.component.html');
    const ask = final.slice(final.indexOf('class="taste-ask"'), final.indexOf('!rematchPin && !soloTaste'));
    assert.ok(ask.indexOf('tasteWords.invite }}') < ask.indexOf('/daily?via=daily-game') && ask.includes('{{ tasteWords.daily }}'), 'under INVITE FRIENDS, on the taste\'s screen only');
    const taste = read('game/src/app/pages/taste-strings.ts');
    assert.ok(taste.includes('daily: \'One question a day: today\\\'s Bullshit\'') && taste.includes('daily: \'שאלה אחת ביום: הבולשיט היומי\''));
    // Every tag on a way in is one the server knows as an arrival.
    const server = read('functions/src/controllers/daily.ts');
    ['daily-home', 'daily-seo', 'daily-game', 'daily-share', 'daily-fool'].forEach(tag => assert.ok(server.includes(`'${tag}'`), tag));
});
