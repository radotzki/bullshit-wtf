// The home's first screen for someone who searched for a party game and never played: what the game
// is (a party game on phones where you fool your friends with made-up answers), that it is free with
// no sign-up and no app, and one button that starts a game, on the first screen of a small phone and
// of a computer, in English and in Hebrew. The code box (#153) stays on top for a guest with a code.
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
const phone = read('mobile-landing', 'mobile-landing.component.html');
const computer = read('desktop-landing', 'desktop-landing.component.html');
const plain = s => s.replace(/ /g, ' ');

test('the first line says it is a party game on phones, and what you do in it, in both languages', () => {
    const en = homeStrings('en').pitch.toLowerCase();
    for (const words of ['party game', 'phones', 'fool your friends', 'made-up answers']) {
        assert.ok(en.includes(words), words);
    }
    const he = homeStrings('he').pitch;
    for (const words of ['משחק חברה', 'בטלפונים', 'ממציאים תשובות', 'עובדים על החברים']) {
        assert.ok(he.includes(words), words);
    }
});

test('the facts say free, no sign-up and no app, in both languages, and stay short', () => {
    const en = plain(homeStrings('en').facts);
    const he = plain(homeStrings('he').facts);
    for (const words of ['Free', 'no sign-up', 'no app']) {
        assert.ok(en.includes(words), words);
    }
    for (const words of ['חינם', 'בלי הרשמה', 'בלי אפליקציה']) {
        assert.ok(he.includes(words), words);
    }
    // One line of a 320 px phone, checked on screen too.
    assert.ok(en.length <= 48 && he.length <= 52, `${en.length} / ${he.length}`);
});

test('the start button and the line under it, the same words on both homes', () => {
    assert.strictEqual(homeStrings('en').start, 'Start a game');
    assert.strictEqual(homeStrings('he').start, 'מתחילים משחק');
    assert.strictEqual(homeStrings('en').startHint, 'Your friends join on their own phones');
    assert.strictEqual(homeStrings('he').startHint, 'החברים מצטרפים, כל אחד מהטלפון שלו');
    const en = homeStrings('en');
    const he = homeStrings('he');
    assert.deepStrictEqual(Object.keys(he).sort(), Object.keys(en).sort());
});

test('phone, never played: code box, the line, the facts, then Start, then the picture, then Join', () => {
    const order = ['<form class="code-box"', '<p class="pitch">', '<p class="facts">', '<ng-container *ngIf="picture">',
        '<ng-container *ngTemplateOutlet="create">', '<div class="picture"', '<ng-container *ngTemplateOutlet="join">'];
    let at = -1;
    for (const mark of order) {
        const next = phone.indexOf(mark, at + 1);
        assert.ok(next > at, `${mark} comes after the one before it`);
        at = next;
    }
    // The stranger's block holds Create once and Join once, and nothing else of the menu.
    const block = phone.slice(phone.indexOf('<ng-container *ngIf="picture">'), phone.indexOf('<ng-container *ngIf="!picture">'));
    assert.strictEqual((block.match(/ngTemplateOutlet="create"/g) || []).length, 1);
    assert.strictEqual((block.match(/ngTemplateOutlet="join"/g) || []).length, 1);
});

test('phone, played before: the old menu, with Join on top for a returning guest', () => {
    const block = phone.slice(phone.indexOf('<ng-container *ngIf="!picture">'), phone.indexOf('<ng-template #join>'));
    assert.match(block, /\*ngTemplateOutlet="first === 'create' \? create : join"/);
    assert.match(block, /\*ngTemplateOutlet="first === 'create' \? join : create"/);
});

test('phone Create says "Start a game" to someone who never played, and keeps its words for the rest', () => {
    const create = phone.slice(phone.indexOf('<ng-template #create>'), phone.indexOf('</ng-template>', phone.indexOf('<ng-template #create>')));
    assert.ok(create.includes('{{ picture ? t.start : t.create }}'));
    assert.ok(create.includes('{{ picture ? t.startHint : t.createHint }}'));
    // Same route, same ?via= tag, same class (the visits log reads a press as the move to /create-game).
    assert.match(create, /class="menu-button create-game"[^>]*routerLink="\/create-game"\s+\[queryParams\]="createQuery"/);
});

test('computer: one Start button through the create flow, with the tag, under the facts', () => {
    assert.strictEqual((computer.match(/routerLink="\/create-game"/g) || []).length, 1);
    assert.match(computer, /<a class="host-button" routerLink="\/create-game" \[queryParams\]="createQuery">[^]*?\{\{ t\.start \}\}[^]*?<\/a>\s*<p class="host-hint">\{\{ t\.startHint \}\}<\/p>/);
    assert.ok(computer.indexOf('class="facts"') < computer.indexOf('class="host-button"'));
});
