// Tests for the home's line for a visitor on their own (src/app/pages/landing/daily-line.ts):
// "On your own? Try today's question", under Create on both homes, shown only once the daily
// puzzle is live, its launch read from the puzzle's own question file, and its clicks tagged.
// Run: npm test (from game/), after npm run copy-model. Needs Node 20+.
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
const app = path.join(__dirname, '..', 'src', 'app');
const landing = path.join(app, 'pages', 'landing');
const line = load(path.join(landing, 'daily-line.ts'));
const { homeStrings } = load(path.join(landing, 'home-strings.ts'));
const read = (...p) => fs.readFileSync(path.join(landing, ...p), 'utf8');

test('hidden before the puzzle\'s first day, shown from midnight in Israel that day', () => {
    // 27 November 2026 starts in Israel at 22:00 UTC on the 26th (winter time, UTC+2).
    assert.strictEqual(line.dailyLive('2026-11-27', new Date('2026-11-26T21:59:59Z')), false);
    assert.strictEqual(line.dailyLive('2026-11-27', new Date('2026-11-26T22:00:00Z')), true);
    assert.strictEqual(line.dailyLive('2026-11-27', new Date('2026-11-01T12:00:00Z')), false);
    assert.strictEqual(line.dailyLive('2026-11-27', new Date('2027-03-01T12:00:00Z')), true);
    // In summer (UTC+3) the day turns at 21:00 UTC.
    assert.strictEqual(line.israelDay(new Date('2026-07-01T20:59:59Z')), '2026-07-01');
    assert.strictEqual(line.israelDay(new Date('2026-07-01T21:00:00Z')), '2026-07-02');
});

test('no known first day, or a broken one: the line stays hidden', () => {
    for (const day of [null, undefined, '', '27-11-2026', '2026-11-27T00:00', 20261127]) {
        assert.strictEqual(line.dailyLive(day, new Date('2030-01-01T00:00:00Z')), false, String(day));
    }
});

test('the launch date is the puzzle\'s own: the earliest day in its question file', () => {
    const questions = JSON.parse(fs.readFileSync(path.join(root, 'functions', 'data', 'daily-questions.json'), 'utf8'));
    const first = lang => Object.values(questions).filter(q => q.lang === lang).map(q => q.day).sort()[0] || null;
    const { DAILY_FIRST_DAY } = load(path.join(app, 'daily-launch.ts'));
    assert.deepStrictEqual(DAILY_FIRST_DAY, { en: first('en'), he: first('he') });
    // Only the dates reach the game's bundle, no question or answer.
    assert.ok(!/realAnswer|questionText/.test(fs.readFileSync(path.join(app, 'daily-launch.ts'), 'utf8')));
    // Both homes read it, in the visitor's language, and nothing else sets a date.
    for (const file of ['mobile-landing/mobile-landing', 'desktop-landing/desktop-landing']) {
        const code = read(`${file}.component.ts`);
        assert.match(code, /this\.dailyLive = dailyLive\(DAILY_FIRST_DAY\[this\.t\.lang\], new Date\(\)\)/, file);
        assert.ok(!/20\d\d-\d\d-\d\d/.test(code), file + ' holds no date of its own');
    }
});

test('the line\'s clicks carry their own tag, one the puzzle counts as the home\'s arrival', () => {
    assert.strictEqual(line.dailyHref('en'), '/daily?via=daily-home');
    assert.strictEqual(line.dailyHref('he'), '/he/daily?via=daily-home');
    const server = fs.readFileSync(path.join(root, 'functions', 'src', 'controllers', 'daily.ts'), 'utf8');
    assert.match(server, /DAILY_ARRIVALS = \[[^\]]*'daily-home'/, 'counted as daily-home, apart from search, shares and posts');
    const round = fs.readFileSync(path.join(__dirname, '..', 'seo', 'daily-round-core.js'), 'utf8');
    assert.match(round, /ARRIVALS = \[[^\]]*'daily-home'/, 'kept off round links, like the other fixed arrivals');
});

test('the words, in English and Hebrew', () => {
    assert.strictEqual(homeStrings('en').aloneTry, 'On your own? Try today\'s question');
    assert.strictEqual(homeStrings('he').aloneTry, 'לבד? נסו את השאלה של היום');
});

test('on both homes the line sits right under Create, and replaces the older puzzle link once live', () => {
    const phone = read('mobile-landing', 'mobile-landing.component.html');
    const create = phone.slice(phone.indexOf('<ng-template #create>'), phone.indexOf('</ng-template>', phone.indexOf('<ng-template #create>')));
    assert.match(create, /<\/div>\s*<!--[^]*?-->\s*<a class="alone-line" \*ngIf="dailyLive" \[href\]="dailyHref">\{\{ t\.aloneTry \}\}<\/a>\s*(<!--[^]*?-->\s*<ng-container \*ngIf="picture && tonightShown">[^]*?<\/ng-container><\/ng-container>\s*)?$/);
    assert.match(phone, /<ng-container \*ngIf="!dailyLive">\s*<a class="daily-link"/);

    const computer = read('desktop-landing', 'desktop-landing.component.html');
    assert.match(computer, /<p class="host-hint">\{\{ t\.startHint \}\}<\/p>\s*<!--[^]*?-->\s*<a class="alone-line" \*ngIf="dailyLive" \[href\]="dailyHref">\{\{ t\.aloneTry \}\}<\/a>/);
    assert.match(computer, /<ng-container \*ngIf="!dailyLive">\s*<p class="alone">/);
    assert.strictEqual((computer.match(/class="alone-line"/g) || []).length, 1);
    assert.strictEqual((phone.match(/class="alone-line"/g) || []).length, 1);
});
