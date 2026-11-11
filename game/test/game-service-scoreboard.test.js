// Tests for the scoreboard step of a staged-reveal game (src/app/services/game.service.ts): the phone
// first reads whether the game plays the staged reveal, and must not act on the answer once it has
// left the game. Run: npm test (from game/). Needs Node 20+.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function transpile(file) {
    return ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2015, experimentalDecorators: true },
    }).outputText;
}

function run(js, req) {
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', js)(mod, mod.exports, req);
    return mod.exports;
}

// The shared model, from the top of the repository (the build copies it into src/app).
const model = run(transpile(path.join(__dirname, '..', '..', 'game-model.ts')), () => ({}));
const { GameState } = model;
const { GameService } = run(transpile(path.join(__dirname, '..', 'src', 'app', 'services', 'game.service.ts')), name => {
    if (/game-model$/.test(name)) {
        return model;
    }
    return name === '@angular/core' ? { Injectable: () => () => undefined } : {};
});

/** A phone: the service, the steps of its games, the pages it was sent to, and the pending staged-reveal reads. */
function phone(url) {
    const watchers = {};
    const pages = [];
    const reads = [];
    const api = {
        gameState: pin => ({
            subscribe(fn) {
                watchers[pin] = fn;
                return { unsubscribe() { delete watchers[pin]; } };
            },
        }),
        getGameStateInfo: () => new Promise(() => undefined),
        tickFrom() { },
        isStagedReveal: () => new Promise(resolve => reads.push(resolve)),
    };
    const router = { url: url || '/show-answers/AAAA', navigate: parts => { pages.push(parts.join('/')); router.url = '/' + parts.join('/'); } };
    const settle = () => new Promise(resolve => setImmediate(resolve));
    return { service: new GameService(router, api), step: (pin, state) => watchers[pin] && watchers[pin](state), pages, reads, router, settle };
}

test('a control game: the scoreboard step sends the phone to the scoreboard', async () => {
    const p = phone('/reveal-the-truth/AAAA');
    p.service.register('AAAA');
    p.step('AAAA', GameState.ScoreBoard);
    p.reads[0](false);
    await p.settle();
    assert.deepStrictEqual(p.pages, ['score-board/AAAA']);
});

test('a staged game: the reveal page stays up through the scoreboard step', async () => {
    const p = phone('/reveal-the-truth/AAAA');
    p.service.register('AAAA');
    p.step('AAAA', GameState.ScoreBoard);
    p.reads[0](true);
    await p.settle();
    assert.deepStrictEqual(p.pages, []);
});

test('BACK HOME during the read: the phone is not sent back to the game it left', async () => {
    for (const staged of [false, true]) {
        const p = phone('/reveal-the-truth/AAAA');
        p.service.register('AAAA');
        p.step('AAAA', GameState.ScoreBoard);
        await p.settle();
        p.service.unregister();
        p.router.url = '/';
        p.reads[0](staged);
        await p.settle();
        assert.deepStrictEqual(p.pages, [], `staged ${staged}`);
    }
});

test('another game during the read: the phone is not sent to the old game\'s scoreboard', async () => {
    const p = phone('/reveal-the-truth/AAAA');
    p.service.register('AAAA');
    p.step('AAAA', GameState.ScoreBoard);
    // The player's tap comes in a later turn of the browser than the game's step.
    await p.settle();
    p.service.unregister();
    p.service.register('BBBB');
    // The new game reaches its own scoreboard step before the old game's read returns.
    p.step('BBBB', GameState.GameStaging);
    p.step('BBBB', GameState.ScoreBoard);
    p.pages.length = 0;
    p.reads[0](false);
    await p.settle();
    assert.deepStrictEqual(p.pages, []);
    p.reads[1](false);
    await p.settle();
    assert.deepStrictEqual(p.pages, ['score-board/BBBB']);
});

test('the first step arrives while the phone is still starting to follow: it still gets the scoreboard', async () => {
    const p = phone('/');
    // A database that already knows the step answers inside subscribe itself.
    const api = p.service.apiService;
    api.gameState = () => ({ subscribe(fn) { fn(GameState.ScoreBoard); return { unsubscribe() { } }; } });
    p.service.register('AAAA');
    await p.settle();
    p.reads[0](false);
    await p.settle();
    assert.deepStrictEqual(p.pages, ['score-board/AAAA']);
});
