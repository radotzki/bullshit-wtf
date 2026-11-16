// A Hebrew speaker who lands on the English home page gets to Hebrew in one tap.
// Search engines are told which home is which (hreflang, tested in search-readable-homes.test.js),
// and a browser set to Hebrew already gets the Hebrew menu on / (home-strings.test.js). This covers
// the rest: a Hebrew speaker whose phone or computer is set to English sees the English menu, and
// the English menu now shows "עברית" in its title bar, as the Hebrew menu shows "English".
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

const pages = path.join(__dirname, '..', 'src', 'app', 'pages');
const read = (...p) => fs.readFileSync(path.join(pages, ...p), 'utf8');
const { homeStrings } = load(path.join(pages, 'landing', 'home-strings.ts'));

const templates = {
    phone: read('landing', 'mobile-landing', 'mobile-landing.component.html'),
    computer: read('landing', 'desktop-landing', 'desktop-landing.component.html'),
    learn: read('learn', 'learn.component.html'),
};

test('the English menu offers Hebrew, and the Hebrew menu offers English', () => {
    assert.strictEqual(homeStrings('en').switchTo, 'he');
    assert.strictEqual(homeStrings('en').switchLabel, 'עברית');
    assert.strictEqual(homeStrings('he').switchTo, 'en');
    assert.strictEqual(homeStrings('he').switchLabel, 'English');
});

for (const [name, html] of Object.entries(templates)) {
    test(`the ${name} menu shows its language switch in both languages`, () => {
        const link = /<a class="lang-switch"[^>]*>/.exec(html);
        assert.ok(link, 'the switch is in the template');
        // Before, *ngIf="t.lang === 'he'" hid it on the English menu.
        assert.ok(!/\*ngIf/.test(link[0]), `the switch is not hidden in one language: ${link[0]}`);
        assert.match(link[0], /\(click\)="switchLanguage\(\)"/);
        // A keyboard reaches it too, since it has no href.
        assert.match(link[0], /tabindex="0"/);
        assert.match(link[0], /\(keydown\.enter\)="switchLanguage\(\)"/);
        assert.match(link[0], /\[attr\.lang\]="t\.switchTo"/);
    });
}

test('the phone bar holds the switch in its corner in both directions', () => {
    const scss = read('landing', 'mobile-landing', 'mobile-landing.component.scss');
    const frame = scss.slice(scss.indexOf('.top-frame {'), scss.indexOf('.lang-switch {'));
    assert.match(frame, /position: relative;/, 'the bar, not the page, places the absolute switch');
    assert.match(scss, /&\[dir="rtl"\] \.lang-switch \{\s*right: auto;\s*left: 12px;/);
});

test('switching only changes the menu language: no address change, so shared links and PINs are untouched', () => {
    for (const file of [['landing', 'mobile-landing', 'mobile-landing.component.ts'],
        ['landing', 'desktop-landing', 'desktop-landing.component.ts']]) {
        const src = read(...file);
        const body = /switchLanguage\(\) \{([\s\S]*?)\n    \}/.exec(src)[1];
        assert.match(body, /setPreferredLocale\(this\.t\.switchTo\)/);
        assert.ok(!/router|location|navigate/i.test(body), `${file[2]} only switches the words`);
    }
});
