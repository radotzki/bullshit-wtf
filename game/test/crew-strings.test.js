// Tests for the crew page's words (src/app/pages/crew/crew-strings.ts).
// Run: npm test (from game/). Needs Node 20+.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const dir = path.join(__dirname, '..', 'src', 'app', 'pages', 'crew');

function load() {
    const out = ts.transpileModule(fs.readFileSync(path.join(dir, 'crew-strings.ts'), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}

const { crewStrings, localeFromPath } = load();
const en = crewStrings('en');
const he = crewStrings('he');

test('English crews keep the English page', () => {
    assert.strictEqual(crewStrings(undefined), en);
    assert.strictEqual(crewStrings('fr'), en);
    assert.strictEqual(en.dir, 'ltr');
    assert.strictEqual(en.nightTitle, 'NEXT GAME NIGHT');
    assert.strictEqual(en.rematch, 'REMATCH');
    assert.strictEqual(en.played(1), '1 game played');
    assert.strictEqual(en.played(4), '4 games played');
    assert.strictEqual(en.lobby(1, '4321'), '1 player in the lobby, PIN 4321');
    assert.strictEqual(en.lobby(3, '4321'), '3 players in the lobby, PIN 4321');
    assert.strictEqual(en.rematchFailed, null);
    assert.strictEqual(en.weekly('Friday'), 'EVERY FRIDAY IN MY CALENDAR');
    assert.strictEqual(en.weeklySent('Friday'), 'In your calendar: every Friday.');
});

test('Hebrew crews get every string in Hebrew, right to left', () => {
    assert.strictEqual(he.dir, 'rtl');
    assert.deepStrictEqual(Object.keys(he).sort(), Object.keys(en).sort());
    // The night block's functions take a weekday or a list of names.
    const args = { youreIn: ['יום שישי'], nudgeText: [3, 'יום שישי, 20 בנובמבר, 21:00', ['דנה', 'נועה']], inCount: [['דנה', 'נועה']] };
    for (const key of Object.keys(he)) {
        const v = he[key];
        const s = typeof v === 'function' ? v.apply(null, args[key] || [3, '4321']) : v;
        if (key === 'dir') {
            continue;
        }
        assert.ok(/[א-ת]/.test(s), `${key} has Hebrew: ${s}`);
        // No English words, apart from the brand name "Google".
        assert.ok(!/[A-Za-z]{2,}/.test(s.replace('Google', '')), `${key} has no English: ${s}`);
    }
    assert.strictEqual(he.played(1), 'משחק אחד עד עכשיו');
    assert.strictEqual(he.lobby(1, '4321'), 'שחקן אחד כבר בפנים, קוד 4321');
    assert.strictEqual(he.lobby(3, '4321'), '3 שחקנים כבר בפנים, קוד 4321');
    assert.strictEqual(he.weekly('יום שישי'), 'כל יום שישי ביומן שלי');
    assert.strictEqual(he.weeklySent('יום שישי'), 'ביומן: כל יום שישי.');
});

test('the template uses only strings, no English left in it', () => {
    const html = fs.readFileSync(path.join(dir, 'crew.component.html'), 'utf8');
    const text = html
        .replace(/<[^>]*>/g, ' ')        // tags and their attributes
        .replace(/\{\{[^}]*\}\}/g, ' ')  // bindings
        .replace(/♦/g, ' ');
    const words = text.split(/\s+/).filter(w => /[A-Za-z]/.test(w));
    // "Bullshit" is the logo, the same in both languages.
    assert.deepStrictEqual(words, ['Bullshit']);
    for (const key of (html.match(/\bt\.(\w+)/g) || []).map(k => k.slice(2))) {
        assert.ok(key in en, `template uses t.${key}`);
    }
});

test('before the crew loads, /he links are Hebrew', () => {
    assert.strictEqual(localeFromPath('/he/c/abc123'), 'he');
    assert.strictEqual(localeFromPath('/c/abc123'), 'en');
    assert.strictEqual(localeFromPath('/hello'), 'en');
    assert.strictEqual(localeFromPath(''), 'en');
});
