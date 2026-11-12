// Tests for which game a phone follows (src/app/services/game.service.ts).
// Run: npm test (from game/). Needs Node 20+.
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
// Only its GameState is used here, so what it imports itself is left empty.
const model = run(transpile(path.join(__dirname, '..', '..', 'game-model.ts')), () => ({}));
const { GameState } = model;
const { GameService } = run(transpile(path.join(__dirname, '..', 'src', 'app', 'services', 'game.service.ts')), name => {
    if (/game-model$/.test(name)) {
        return model;
    }
    if (name === '@angular/core') {
        return { Injectable: () => () => undefined };
    }
    return {};
});

/**
 * A phone: the service, a fake database of game steps, and the pages the phone was sent to.
 * A page the phone only passes through, unseen, is listed with "(unseen)".
 */
function phone() {
    const watchers = {};
    const pages = [];
    const ticks = [];
    const states = {};
    let clock = 1000;
    // The step's id alone (gameState) and the whole step (gamePhase), as the database gives them.
    const watch = (pin, pick) => ({
        subscribe(fn) {
            const w = state => fn(pick(state));
            (watchers[pin] = watchers[pin] || []).push(w);
            if (pin in states) {
                w(states[pin]);
            }
            return { unsubscribe: () => { watchers[pin] = watchers[pin].filter(f => f !== w); } };
        },
    });
    const api = {
        gameState(pin) {
            return watch(pin.toUpperCase(), state => state && state.id);
        },
        gamePhase(pin) {
            return watch(pin.toUpperCase(), state => state && Object.assign({}, state));
        },
        getGameStateInfo(pin) {
            const state = states[pin.toUpperCase()];
            return Promise.resolve({ state: state && { id: state.id, timestamp: 1, deadline: 1 }, now: 100000 });
        },
        tickFrom(pin) { ticks.push(pin.toUpperCase()); },
    };
    const router = {
        navigate: (parts, extras) => {
            pages.push(parts.join('/') + (extras && extras.skipLocationChange ? ' (unseen)' : ''));
            return Promise.resolve(true);
        },
    };
    const service = new GameService(router, api);
    /** The server moves a game to a step: a new occurrence of it, unless `same` (then only the deadline is added). */
    const step = (pin, id, same) => {
        const before = states[pin];
        states[pin] = same ? Object.assign({}, before, { deadline: before.timestamp + 25000 }) : { id, timestamp: clock += 1000 };
        (watchers[pin] || []).slice().forEach(fn => fn(states[pin]));
    };
    /** The database hands a listening phone the step it has again (as after a lost connection, with nothing new). */
    const again = pin => (watchers[pin] || []).slice().forEach(fn => fn(states[pin]));
    const watched = () => Object.keys(watchers).filter(pin => watchers[pin].length);
    return { service, step, again, pages, ticks, watched };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

test('a phone follows the game it registered for', () => {
    const p = phone();
    p.service.register('AAAA');
    p.step('AAAA', GameState.GameStaging);
    p.step('AAAA', GameState.RoundIntro);
    assert.deepStrictEqual(p.pages, ['game-staging/AAAA', 'round-intro/AAAA']);
    p.service.unregister();
});

test('crew rematch: a phone that still follows a finished game follows the new one when it starts', () => {
    const p = phone();
    // The final screen of the first game.
    p.service.register('AAAA');
    p.step('AAAA', GameState.ScoreBoardFinal);
    // Crew page, REMATCH, join: the new game's lobby asks to follow it. Nothing unregistered first.
    p.step('BBBB', GameState.GameStaging);
    p.service.register('BBBB');
    p.pages.length = 0;
    // START.
    p.step('BBBB', GameState.RoundIntro);
    assert.deepStrictEqual(p.pages, ['round-intro/BBBB']);
    assert.deepStrictEqual(p.watched(), ['BBBB']);
    p.service.unregister();
});

test('the game the phone left can no longer move it', () => {
    const p = phone();
    p.service.register('AAAA');
    p.step('AAAA', GameState.ShowQuestion);
    p.step('BBBB', GameState.GameStaging);
    p.service.register('BBBB');
    p.pages.length = 0;
    p.step('AAAA', GameState.ShowAnswers);
    p.step('AAAA', GameState.ScoreBoardFinal);
    assert.deepStrictEqual(p.pages, []);
    p.service.unregister();
});

test('registering for the same game again, in any case of PIN, keeps one listener', () => {
    const p = phone();
    p.service.register('aaaa');
    p.service.register('AAAA');
    p.service.register('AaAa');
    p.step('AAAA', GameState.RoundIntro);
    assert.deepStrictEqual(p.pages, ['round-intro/aaaa']);
    assert.deepStrictEqual(p.watched(), ['AAAA']);
    p.service.unregister();
});

test('going back to the first game follows the first game again', () => {
    const p = phone();
    p.service.register('AAAA');
    p.service.register('BBBB');
    p.service.register('AAAA');
    p.step('BBBB', GameState.RoundIntro);
    p.step('AAAA', GameState.ScoreBoardFinal);
    assert.deepStrictEqual(p.pages, ['score-board-final/AAAA']);
    p.service.unregister();
});

test('after unregister no game moves the phone, and it can follow a game again', () => {
    const p = phone();
    p.service.register('AAAA');
    p.service.unregister();
    p.step('AAAA', GameState.RoundIntro);
    assert.deepStrictEqual(p.pages, []);
    assert.deepStrictEqual(p.watched(), []);
    p.service.register('BBBB');
    p.step('BBBB', GameState.GameStaging);
    assert.deepStrictEqual(p.pages, ['game-staging/BBBB']);
    p.service.unregister();
});

test('the backup timer of the game the phone left never ticks', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const p = phone();
    p.service.register('AAAA');
    p.step('AAAA', GameState.ShowQuestion);
    // The phone moves on before the first game's deadline was read.
    p.step('BBBB', GameState.GameStaging);
    p.service.register('BBBB');
    await new Promise(resolve => setImmediate(resolve));
    t.mock.timers.tick(60000);
    assert.deepStrictEqual(p.ticks, []);
    // The new game's own backup timer still works.
    p.step('BBBB', GameState.ShowQuestion);
    await new Promise(resolve => setImmediate(resolve));
    t.mock.timers.tick(60000);
    assert.deepStrictEqual(p.ticks, ['BBBB']);
    p.service.unregister();
});

// A phone that sent its lie, lost its connection, and came back in the next question: the database
// hands it the next question's step at once, with the same id as the step it was on. The page it shows
// must be built again, or it keeps "your answer has been submitted" for a question it never saw.
test('a phone that comes back in the next question gets the question page built again', async () => {
    const p = phone();
    p.service.register('AAAA');
    p.step('AAAA', GameState.ShowQuestion);
    // Away: the picks, the reveal and the scores of question 1 pass without this phone.
    p.step('AAAA', GameState.ShowQuestion);
    await settle();
    assert.deepStrictEqual(p.pages, ['show-question/AAAA', 'step/AAAA (unseen)', 'show-question/AAAA']);
    p.service.unregister();
});

test('a phone that comes back in the next picks gets the picking page built again', async () => {
    const p = phone();
    p.service.register('AAAA');
    p.step('AAAA', GameState.ShowAnswers);
    p.step('AAAA', GameState.ShowAnswers);
    await settle();
    assert.deepStrictEqual(p.pages, ['show-answers/AAAA', 'step/AAAA (unseen)', 'show-answers/AAAA']);
    p.service.unregister();
});

test('a phone back inside the step it sent in keeps its page as it is', async () => {
    const p = phone();
    p.service.register('AAAA');
    p.step('AAAA', GameState.ShowQuestion);
    // The server adds the deadline, and the connection drops and comes back, within the same question.
    p.step('AAAA', GameState.ShowQuestion, true);
    p.again('AAAA');
    await settle();
    assert.deepStrictEqual(p.pages, ['show-question/AAAA']);
    p.service.unregister();
});

test('a phone that follows the game step by step is sent to each page once, never through the empty page', async () => {
    const p = phone();
    p.service.register('AAAA');
    p.step('AAAA', GameState.GameStaging);
    for (let q = 0; q < 2; q++) {
        p.step('AAAA', GameState.RoundIntro);
        p.step('AAAA', GameState.ShowQuestion);
        p.step('AAAA', GameState.ShowAnswers);
        p.step('AAAA', GameState.RevealTheTruth);
        p.step('AAAA', GameState.ScoreBoard);
    }
    p.step('AAAA', GameState.ScoreBoardFinal);
    await settle();
    assert.deepStrictEqual(p.pages.filter(page => /unseen/.test(page)), []);
    assert.strictEqual(p.pages.length, 12);
    p.service.unregister();
});

test('a phone that came back and moved on at once is not sent back to the step it left', async () => {
    const p = phone();
    p.service.register('AAAA');
    p.step('AAAA', GameState.ShowQuestion);
    p.step('AAAA', GameState.ShowQuestion);
    // Everyone sent before the page was built again: the picks are on.
    p.step('AAAA', GameState.ShowAnswers);
    await settle();
    assert.deepStrictEqual(p.pages, ['show-question/AAAA', 'step/AAAA (unseen)', 'show-answers/AAAA']);
    p.service.unregister();
});

test('a phone that left the game while the page was built again stays where it went', async () => {
    const p = phone();
    p.service.register('AAAA');
    p.step('AAAA', GameState.ShowQuestion);
    p.step('AAAA', GameState.ShowQuestion);
    p.service.unregister();
    await settle();
    assert.deepStrictEqual(p.pages, ['show-question/AAAA', 'step/AAAA (unseen)']);
});

test('a phone that comes back to a new step keeps its backup timer for it', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const p = phone();
    p.service.register('AAAA');
    p.step('AAAA', GameState.ShowQuestion);
    await settle();
    p.step('AAAA', GameState.ShowQuestion);
    await settle();
    t.mock.timers.tick(60000);
    assert.deepStrictEqual(p.ticks, ['AAAA']);
    p.service.unregister();
});
