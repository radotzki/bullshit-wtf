// Tests for the "How do I play?" page's words (src/app/pages/learn/learn-strings.ts): both languages
// are whole, and every number the page gives is the one the game uses.
// Run: npm test (from game/). Needs Node 20+.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function load(file) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}

const root = path.join(__dirname, '..', '..');
const app = path.join(root, 'game', 'src', 'app', 'pages');
const read = (...parts) => fs.readFileSync(path.join(...parts), 'utf8');
const { learnStrings, ROUND_ONE, ROUND_FACTORS, GAME_LENGTHS, MAX_PLAYERS } = load(path.join(app, 'learn', 'learn-strings.ts'));
const { homeStrings } = load(path.join(app, 'landing', 'home-strings.ts'));

/** Every string of the page, as one text. */
function allText(t) {
    return [t.title, t.heading, t.intro, ...t.steps, t.pointsHeading, ...t.points.map(p => `${p.label} ${p.value}`),
        t.rounds, t.startHeading, ...t.start, t.screenBefore, t.screenAfter, t.rematch, t.create, t.havePin, t.join].join('\n');
}

test('visitors who do not read Hebrew get the English page', () => {
    const en = learnStrings('en');
    assert.strictEqual(learnStrings(undefined), en);
    assert.strictEqual(learnStrings('fr'), en);
    assert.strictEqual(en.lang, 'en');
    assert.strictEqual(en.dir, 'ltr');
    assert.ok(!/[֐-׿]/.test(allText(en)), 'Hebrew letters on the English page');
    // The typos of the 2018 text stay gone.
    assert.ok(!/citated|When you ready|friends bullshit|answer than you/i.test(allText(en)));
});

test('Hebrew visitors get every word in Hebrew, right to left', () => {
    const he = learnStrings('he');
    const en = learnStrings('en');
    assert.strictEqual(he.lang, 'he');
    assert.strictEqual(he.dir, 'rtl');
    assert.ok(!/[A-Za-z]/.test(allText(he)), `Latin letters on the Hebrew page: ${allText(he).match(/[A-Za-z]+/)}`);
    assert.deepStrictEqual(Object.keys(he).sort(), Object.keys(en).sort());
    for (const key of ['steps', 'points', 'start']) {
        assert.strictEqual(he[key].length, en[key].length, key);
        he[key].forEach(v => assert.ok(/[֐-׿]/.test(v.label || v), `${key} is not Hebrew: ${v.label || v}`));
    }
    // A Hebrew reader is sent to the address that gives the Hebrew menu on any browser.
    assert.strictEqual(he.screenAddress, 'bullshit.wtf/he');
    assert.strictEqual(en.screenAddress, 'bullshit.wtf');
});

test('the points are the game\'s: round 1 as given, rounds 2 and 3 one and a half times and double', () => {
    const intro = read(app, 'round-intro', 'round-intro.component.ts');
    const rounds = [];
    intro.replace(/truth: (\d+), bullshit: (\d+)/g, (m, truth, bullshit) => rounds.push({ truth: +truth, bullshit: +bullshit }));
    const houseLie = read(root, 'functions', 'src', 'controllers', 'house-lie.ts');
    const penalty = JSON.parse(/HOUSE_LIE_PENALTY = (\[[^\]]+\])/.exec(houseLie)[1]);
    assert.strictEqual(rounds.length, 3);
    assert.strictEqual(penalty.length, 3);
    assert.deepStrictEqual(ROUND_FACTORS, [1, 1.5, 2]);
    ROUND_FACTORS.forEach((f, i) => {
        assert.strictEqual(rounds[i].truth, ROUND_ONE.truth * f, `truth, round ${i + 1}`);
        assert.strictEqual(rounds[i].bullshit, ROUND_ONE.fooled * f, `fooled, round ${i + 1}`);
        assert.strictEqual(penalty[i], ROUND_ONE.houseLie * f, `house lie, round ${i + 1}`);
    });
    for (const lang of ['en', 'he']) {
        const t = learnStrings(lang);
        assert.deepStrictEqual(t.points.map(p => p.value), ['+1000', '+500', '-250'].map((v, i) =>
            v[0] + [ROUND_ONE.truth, ROUND_ONE.fooled, ROUND_ONE.houseLie][i]));
        assert.ok(/2\D+3/.test(t.rounds), `${lang}: rounds 2 and 3 are named`);
    }
});

test('the lengths and the player limit are the game\'s', () => {
    const create = read(app, 'create-game', 'create-game.component.html');
    const offered = [];
    create.replace(/name="length" \[value\]="(\d+)"/g, (m, n) => offered.push(+n));
    assert.deepStrictEqual(GAME_LENGTHS, offered);
    const join = read(root, 'functions', 'src', 'controllers', 'join.ts');
    assert.strictEqual(MAX_PLAYERS, +/length === (\d+)\) \{\s*return Promise\.reject\(\{ message: 'Sorry, game is full'/.exec(join)[1]);
    assert.ok(learnStrings('en').start[0].indexOf('5, 7 or 9 questions') >= 0);
    assert.ok(learnStrings('he').start[0].indexOf('5, 7 או 9 שאלות') >= 0);
    assert.ok(learnStrings('en').start[1].indexOf('Up to 8 players') >= 0);
    assert.ok(learnStrings('he').start[1].indexOf('עד 8 שחקנים') >= 0);
});

test('the buttons carry the home menu\'s names, and the big screen is named as a computer shows it', () => {
    for (const lang of ['en', 'he']) {
        const t = learnStrings(lang);
        const home = homeStrings(lang);
        assert.strictEqual(t.create, home.create);
        assert.strictEqual(t.join, home.join);
        assert.strictEqual(t.heading.toLowerCase(), home.learn.toLowerCase());
        assert.strictEqual(t.title, home.name);
        // The reader is sent to a TV or a computer, where the menu shows the short name.
        assert.ok(t.screenAfter.indexOf(home.presentShort) >= 0, `${lang}: ${home.presentShort}`);
        assert.strictEqual(t.switchLabel, home.switchLabel);
        assert.strictEqual(t.switchTo, home.switchTo);
    }
});

test('the page promises nothing that only some games have', () => {
    for (const lang of ['en', 'he']) {
        // The round-1 lie helper is in half of all games (a test), and the staged reveal is not live.
        assert.ok(!/give me a lie|stuck\?|תקועים|תנו לי שקר|source|מקור/i.test(allText(learnStrings(lang))), lang);
    }
});

test('the page has no fixed words left, and ends with the way into a game', () => {
    const html = read(app, 'learn', 'learn.component.html');
    const text = html
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\{\{[\s\S]*?\}\}/g, '')
        .replace(/<[^>]*>/g, '')
        .replace('♦', '');
    assert.ok(!/\S/.test(text), `fixed words in the template: ${text.replace(/\s+/g, ' ').trim()}`);
    const create = html.indexOf('routerLink="/create-game"');
    const join = html.indexOf('routerLink="/join-game"');
    assert.ok(create > html.indexOf('t.rematch') && join > create, 'Create, then Join, after the text');
    assert.ok(html.indexOf('routerLink="/present-game"') < 0, 'the big screen is another device: no link from a phone');
});
