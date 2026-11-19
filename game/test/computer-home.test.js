// The computer home as a front door (src/app/pages/landing/desktop-landing): on a computer, 6 of 8
// first-time visitors left the old menu of four equal buttons within 25 seconds without pressing
// anything. It now shows what the phone home shows (the one-line pitch and the picture of a round),
// one big button to host a game on this screen, and a quiet line to today's question.
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

const landing = path.join(__dirname, '..', 'src', 'app', 'pages', 'landing');
const read = (...p) => fs.readFileSync(path.join(landing, ...p), 'utf8');
const { homeStrings } = load(path.join(landing, 'home-strings.ts'));
const html = read('desktop-landing', 'desktop-landing.component.html');
const ts_ = read('desktop-landing', 'desktop-landing.component.ts');
const phone = read('mobile-landing', 'mobile-landing.component.html');

test('the computer home shows the phone home\'s pitch and picture, word for word', () => {
    assert.ok(html.includes('<p class="pitch">{{ t.pitch }}</p>'));
    // The picture is the phone's own markup: same words, same frames.
    const picture = s => s.slice(s.indexOf('<div class="picture"'), s.indexOf('<div class="dots"'))
        .replace(/ \*ngIf="picture"/, '').replace(/\s+/g, ' ');
    assert.strictEqual(picture(html), picture(phone));
    assert.match(ts_, /this\.p = pictureStrings\(locale\)/, 'the picture follows the language switch');
});

test('one big button hosts a game on this screen, through the create flow, keeping the ?via= tag', () => {
    const buttons = html.match(/class="host-button"/g) || [];
    assert.strictEqual(buttons.length, 1);
    assert.match(html, /<a class="host-button" routerLink="\/create-game" \[queryParams\]="createQuery">/);
    assert.match(ts_, /this\.createQuery = createQuery\(this\.tag\)/);
    assert.match(ts_, /this\.tag = arrivalCampaign\(\)/);
    assert.ok(html.indexOf('host-button') < html.indexOf('class="other-ways"'), 'the big button comes before the other ways in');
    assert.match(html, /<span>\{\{ t\.start \}\}<\/span>/);
    assert.strictEqual(homeStrings('en').start, 'Start a game');
    assert.strictEqual(homeStrings('he').start, 'מתחילים משחק');
});

test('join, present and how to play stay one click away', () => {
    for (const route of ['/join-game', '/present-game', '/learn']) {
        assert.ok(html.includes(`routerLink="${route}"`), route);
    }
});

test('someone on their own gets a quiet line to today\'s question, in their language', () => {
    assert.match(html, /<p class="alone">\{\{ t\.alone \}\} <a class="daily-link" \[href\]="t\.lang === 'he' \? '\/he\/daily\?via=daily-home' : '\/daily\?via=daily-home'">\{\{ t\.daily \}\}<\/a><\/p>/);
    assert.strictEqual(homeStrings('en').alone, 'On your own?');
    assert.strictEqual(homeStrings('he').alone, 'לבד?');
});

test('the page keeps its language switch, crews, season line and search links', () => {
    assert.match(html, /<a class="lang-switch"[^>]*\(click\)="switchLanguage\(\)"/);
    assert.ok(html.includes('*ngIf="crews.length"'));
    assert.ok(html.includes('*ngIf="season"'));
    assert.ok(html.includes('*ngFor="let link of links"'));
    assert.match(html, /<div class="arcade-form create-game computer-home" \[attr\.dir\]="t\.dir" \[attr\.lang\]="t\.lang">/);
});

test('both homes draw the picture from one shared stylesheet', () => {
    const shared = read('_round-picture.scss');
    assert.match(shared, /@mixin round-picture\(\$px: 1px, \$rem: 1rem\)/);
    assert.match(read('mobile-landing', 'mobile-landing.component.scss'), /@include rp\.round-picture;/);
    const scss = read('desktop-landing', 'desktop-landing.component.scss');
    assert.match(scss, /@include rp\.round-picture\(/);
    // A dark page under the arcade picture, so the white words read even if it fails to load.
    assert.match(scss, /\.computer-home \{[^}]*background-color: #2f1b2c;/);
});
