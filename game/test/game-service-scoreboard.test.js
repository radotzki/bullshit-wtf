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
    let clock = 1000;
    const api = {
        // The whole step, as the database gives it: each new step has a time of its own.
        gamePhase: pin => ({
            subscribe(fn) {
                watchers[pin] = id => fn(id === undefined ? undefined : { id, timestamp: clock += 1000 });
                return { unsubscribe() { delete watchers[pin]; } };
            },
        }),
        getGameStateInfo: () => new Promise(() => undefined),
        tickFrom() { },
        isStagedReveal: () => new Promise(resolve => reads.push(resolve)),
        followSeat: () => () => undefined,
    };
    const router = {
        url: url || '/show-answers/AAAA',
        navigate: (parts, extras) => {
            if (extras && extras.skipLocationChange) {
                pages.push(parts.join('/') + ' (unseen)');
            } else {
                pages.push(parts.join('/'));
                router.url = '/' + parts.join('/');
            }
            return Promise.resolve(true);
        },
    };
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
    api.gamePhase = () => ({ subscribe(fn) { fn({ id: GameState.ScoreBoard, timestamp: 1 }); return { unsubscribe() { } }; } });
    p.service.register('AAAA');
    await p.settle();
    p.reads[0](false);
    await p.settle();
    assert.deepStrictEqual(p.pages, ['score-board/AAAA']);
});

test('the next step arrives during the read: the phone is not sent back to the scoreboard', async () => {
    const p = phone('/reveal-the-truth/AAAA');
    p.service.register('AAAA');
    p.step('AAAA', GameState.ScoreBoard);
    p.step('AAAA', GameState.ShowQuestion);
    p.reads[0](false);
    await p.settle();
    assert.deepStrictEqual(p.pages, ['show-question/AAAA']);
});

// Since a phone that comes back to the same step gets its page built again (GameService.showAgain),
// the scoreboard step reaches a phone by two paths. The staged reveal's rule must hold on both.

test('both paths, a staged game: a phone that saw the reveal again keeps it through the scoreboard step', async () => {
    const p = phone('/reveal-the-truth/AAAA');
    p.service.register('AAAA');
    p.step('AAAA', GameState.RevealTheTruth);
    // Away for a whole question, back in the next reveal: its page is built again.
    p.step('AAAA', GameState.RevealTheTruth);
    await p.settle();
    assert.deepStrictEqual(p.pages, ['reveal-the-truth/AAAA', 'step/AAAA (unseen)', 'reveal-the-truth/AAAA']);
    p.pages.length = 0;
    p.step('AAAA', GameState.ScoreBoard);
    p.reads[0](true);
    await p.settle();
    assert.deepStrictEqual(p.pages, []);
});

test('both paths, a staged game: a phone back in a later scoreboard step missed its reveal, and gets the scoreboard', async () => {
    const p = phone('/reveal-the-truth/AAAA');
    p.service.register('AAAA');
    p.step('AAAA', GameState.ScoreBoard);
    p.reads[0](true);
    await p.settle();
    assert.deepStrictEqual(p.pages, []);
    // Away from here to the next question's scoreboard step: the reveal on its screen is the old one.
    p.step('AAAA', GameState.ScoreBoard);
    await p.settle();
    assert.deepStrictEqual(p.pages, ['step/AAAA (unseen)', 'score-board/AAAA']);
});

test('both paths, a control game: the scoreboard each time, built again for a phone that comes back to it', async () => {
    const p = phone('/reveal-the-truth/AAAA');
    p.service.register('AAAA');
    p.step('AAAA', GameState.ScoreBoard);
    p.reads[0](false);
    await p.settle();
    p.step('AAAA', GameState.ScoreBoard);
    await p.settle();
    assert.deepStrictEqual(p.pages, ['score-board/AAAA', 'step/AAAA (unseen)', 'score-board/AAAA']);
});

// The staged scoreboard step lasts a few milliseconds, and the reveal page stays up through it. A phone
// that drops right then last heard the scoreboard step, but still shows the reveal. What it shows decides
// whether a returning phone gets its page built again.

test('a staged game: a phone that dropped in the scoreboard step and comes back in the next reveal gets the new reveal', async () => {
    const p = phone('/show-answers/AAAA');
    p.service.register('AAAA');
    p.step('AAAA', GameState.RevealTheTruth);
    p.step('AAAA', GameState.ScoreBoard);
    p.reads[0](true);
    await p.settle();
    assert.deepStrictEqual(p.pages, ['reveal-the-truth/AAAA']);
    // Away through the next question and its picks; back in that question's reveal.
    p.step('AAAA', GameState.RevealTheTruth);
    await p.settle();
    assert.deepStrictEqual(p.pages, ['reveal-the-truth/AAAA', 'step/AAAA (unseen)', 'reveal-the-truth/AAAA']);
});

test('a control game, the same drop: the scoreboard, then the new reveal, never through the empty page', async () => {
    const p = phone('/show-answers/AAAA');
    p.service.register('AAAA');
    p.step('AAAA', GameState.RevealTheTruth);
    p.step('AAAA', GameState.ScoreBoard);
    p.reads[0](false);
    await p.settle();
    p.step('AAAA', GameState.RevealTheTruth);
    await p.settle();
    assert.deepStrictEqual(p.pages, ['reveal-the-truth/AAAA', 'score-board/AAAA', 'reveal-the-truth/AAAA']);
});

test('a staged game, the same drop, back in the next question: its page as usual', async () => {
    const p = phone('/show-answers/AAAA');
    p.service.register('AAAA');
    p.step('AAAA', GameState.RevealTheTruth);
    p.step('AAAA', GameState.ScoreBoard);
    p.reads[0](true);
    await p.settle();
    p.step('AAAA', GameState.ShowQuestion);
    await p.settle();
    assert.deepStrictEqual(p.pages, ['reveal-the-truth/AAAA', 'show-question/AAAA']);
});

test('a staged game followed step by step: each page once, never through the empty page', async () => {
    const p = phone('/game-staging/AAAA');
    p.service.register('AAAA');
    for (let q = 0; q < 2; q++) {
        p.step('AAAA', GameState.ShowQuestion);
        p.step('AAAA', GameState.ShowAnswers);
        p.step('AAAA', GameState.RevealTheTruth);
        p.step('AAAA', GameState.ScoreBoard);
        p.reads[q](true);
        await p.settle();
    }
    p.step('AAAA', GameState.ScoreBoardFinal);
    await p.settle();
    assert.deepStrictEqual(p.pages, [
        'show-question/AAAA', 'show-answers/AAAA', 'reveal-the-truth/AAAA',
        'show-question/AAAA', 'show-answers/AAAA', 'reveal-the-truth/AAAA',
        'score-board-final/AAAA',
    ]);
});

test('the PIN in another case, and a query on the address, still count as the page the phone shows', async () => {
    const p = phone('/show-answers/AAAA');
    p.service.register('aaaa');
    p.step('aaaa', GameState.RevealTheTruth);
    p.router.url = '/reveal-the-truth/aaaa?lang=he';
    p.step('aaaa', GameState.ScoreBoard);
    p.reads[0](true);
    await p.settle();
    p.step('aaaa', GameState.RevealTheTruth);
    await p.settle();
    assert.deepStrictEqual(p.pages, ['reveal-the-truth/aaaa', 'step/aaaa (unseen)', 'reveal-the-truth/aaaa']);
});
