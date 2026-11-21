// Tests for the solo run (SoloRun in game-model.ts): its words (src/app/pages/run-strings.ts), the best
// kept on the device and the lobby's word that it did not start (src/app/services/solo-run.ts), how a
// phone reads a run off the game's state, and how its screens are wired.
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
    new Function('module', 'exports', 'require', out)(mod, mod.exports, () => ({}));
    return mod.exports;
}

const root = path.join(__dirname, '..', '..');
const app = path.join(root, 'game', 'src', 'app');
const read = (...p) => fs.readFileSync(path.join(app, ...p), 'utf8');
const { runStrings } = load(path.join(app, 'pages', 'run-strings.ts'));
const solo = load(path.join(app, 'services', 'solo-run.ts'));
const { tasteOf, SOLO_RUN_LIVES, nextSoloRun, newSoloRun, soloRunOptions } = load(path.join(root, 'game-model.ts'));

const en = runStrings('en');
const he = runStrings('he');
const hebrew = /[֐-׿]/;
const latin = /[A-Za-z]/;

test('words in both languages, every one filled, Hebrew in Hebrew letters', () => {
    assert.deepStrictEqual(Object.keys(en).sort(), Object.keys(he).sort());
    assert.strictEqual(runStrings('fr'), en);
    for (const k of Object.keys(en)) {
        const e = typeof en[k] === 'function' ? en[k](3, 3) : en[k];
        const h = typeof he[k] === 'function' ? he[k](3, 3) : he[k];
        assert.ok(e && latin.test(e) && !hebrew.test(e), `en ${k}`);
        assert.ok(h && hebrew.test(h) && !latin.test(h), `he ${k}`);
    }
    assert.strictEqual(en.headline(0), 'NO TRUTH FOUND THIS TIME');
    assert.strictEqual(en.headline(1), 'YOU FOUND 1 TRUTH');
    assert.strictEqual(en.headline(12), 'YOU FOUND 12 TRUTHS');
    assert.strictEqual(he.headline(12), 'מצאת 12 אמיתות');
    assert.ok(en.introHow(SOLO_RUN_LIVES).includes('3 times'));
    assert.ok(en.keepGoingSub(SOLO_RUN_LIVES).includes('3 times'));
});

test('a phone reads the run off the state, and a taste without one has none', () => {
    assert.deepStrictEqual(tasteOf({ taste: { found: 4, length: 5, run: { lives: 2, streak: 3, bestStreak: 3 } } }),
        { found: 4, length: 5, run: { lives: 2, streak: 3, bestStreak: 3 } });
    assert.deepStrictEqual(tasteOf({ taste: { found: 4, length: 5, run: { lives: 9, streak: 'x', bestStreak: -1, gained: true } } }),
        { found: 4, length: 5, run: { lives: SOLO_RUN_LIVES, streak: 0, bestStreak: 0, gained: true } });
    assert.deepStrictEqual(tasteOf({ taste: { found: 1, length: 5 } }), { found: 1, length: 5 });
    assert.strictEqual('run' in tasteOf({ taste: { found: 1, length: 5, run: true } }), false);
    assert.deepStrictEqual(nextSoloRun(newSoloRun(), false), { lives: 2, streak: 0, bestStreak: 0 });
    assert.deepStrictEqual([0, 10, 20].map(soloRunOptions), [3, 4, 5]);
});

test('the best on the device: per language, set once per run, a reopened final screen still says NEW BEST', () => {
    let r = solo.withRun(null, 'en', 'AAAA', 6);
    assert.deepStrictEqual(r.result, { best: 6, isNew: true });
    r = solo.withRun(r.record, 'en', 'AAAA', 6);
    assert.deepStrictEqual(r.result, { best: 6, isNew: true }, 'the same run, its screen opened again');
    r = solo.withRun(r.record, 'en', 'BBBB', 4);
    assert.deepStrictEqual(r.result, { best: 6, isNew: false });
    r = solo.withRun(r.record, 'en', 'CCCC', 6);
    assert.deepStrictEqual(r.result, { best: 6, isNew: false }, 'a tie is no new best');
    r = solo.withRun(r.record, 'he', 'DDDD', 2);
    assert.deepStrictEqual(r.result, { best: 2, isNew: true }, 'Hebrew keeps its own');
    r = solo.withRun(r.record, 'en', 'EEEE', 9);
    assert.deepStrictEqual(r.result, { best: 9, isNew: true });
    assert.deepStrictEqual(solo.withRun('junk', 'en', 'F', 0).result, { best: 0, isNew: false }, 'zero is never a best to celebrate');
});

test('the lobby hears that its solo game did not start, for its own PIN only', () => {
    const heard = [];
    const stop = solo.onSoloStartFailed(pin => heard.push(pin));
    solo.soloStartFailed('abcd');
    assert.deepStrictEqual(heard, ['ABCD']);
    assert.strictEqual(solo.soloStartFailedFor('ABCD'), true);
    assert.strictEqual(solo.soloStartFailedFor('WXYZ'), false);
    solo.clearSoloStartFailure();
    assert.strictEqual(solo.soloStartFailedFor('ABCD'), false);
    stop();
    solo.soloStartFailed('EFGH');
    assert.deepStrictEqual(heard, ['ABCD']);
    solo.clearSoloStartFailure();
});

test('wiring: "Try it alone" starts a run and a failed start reaches the lobby; the lobby shows its line and button', () => {
    const portal = read('portal', 'portal.service.ts');
    assert.match(portal, /this\.api\.startGame\(quick\.pin, true\)/);
    assert.match(portal, /soloStartFailed\(quick\.pin\)/);
    const html = read('pages', 'game-staging', 'game-staging.component.html');
    assert.match(html, /\*ngIf="soloFailed && !presenter" class="solo-failed"/);
    assert.match(html, /\(click\)="startSolo\(\)"/);
    const lobby = read('pages', 'game-staging', 'game-staging.component.ts');
    assert.match(lobby, /startGame\(this\.pin, true\)/);
    const service = read('services', 'solo-run.service.ts');
    assert.match(service, /startGame\(pin, true\)/);
    assert.match(service, /soloStartFailed\(pin\)/);
    assert.match(read('services', 'api.service.ts'), /run \? \{ pin, hostKey, run: true \} : \{ pin, hostKey \}/);
});

test('wiring: the final screen of a run or taste has INVITE FRIENDS and the solo button together, no trophy', () => {
    const html = read('pages', 'score-board-final', 'score-board-final.component.html');
    const ask = html.slice(html.indexOf('class="taste-ask"'), html.indexOf('class="taste-daily"'));
    assert.ok(ask.includes('class="solo-buttons"'));
    assert.ok(ask.indexOf('taste-invite') < ask.indexOf('solo-again'), 'INVITE FRIENDS first');
    assert.match(ask, /soloRunEnd \? runWords\.playAgain : runWords\.keepGoing/);
    assert.match(html, /\[class\.solo\]="soloTaste"/);
    assert.match(read('pages', 'score-board-final', 'score-board-final.component.scss'), /\.final\.solo \{\s+\.confetti \{ height: 160px; \}\s+\.trophy \{ display: none; \}/);
    // The bar is on each question's three screens, never on a big screen.
    for (const page of ['show-answers', 'reveal-the-truth', 'score-board']) {
        assert.match(read('pages', page, `${page}.component.html`), /<app-run-bar \*ngIf="!presenter" \[pin\]="pin"><\/app-run-bar>/, page);
    }
});

test('a new best is CrazyGames\' happy time, and nothing is told off the portal', () => {
    const portal = load(path.join(app, 'portal', 'portal.ts'));
    let told = 0;
    portal.happyTime();
    portal.setHappyTime(() => told++);
    portal.happyTime();
    assert.strictEqual(told, 1);
    portal.setHappyTime(() => { throw new Error('SDK'); });
    portal.happyTime();
    portal.setHappyTime(null);
    assert.match(read('portal', 'portal.service.ts'), /setHappyTime\(\(\) => this\.call\(\(\) => sdk\.game\.happytime\(\)\)\)/);
    assert.match(read('pages', 'score-board-final', 'score-board-final.component.ts'), /if \(this\.runBest\.isNew\) \{[\s\S]*?happyTime\(\);/);
});
