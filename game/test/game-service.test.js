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

/** A phone: the service, a fake database of game steps, and the pages the phone was sent to. */
function phone() {
    const watchers = {};
    const pages = [];
    const ticks = [];
    const states = {};
    const api = {
        gameState(pin) {
            pin = pin.toUpperCase();
            return {
                subscribe(fn) {
                    (watchers[pin] = watchers[pin] || []).push(fn);
                    if (pin in states) {
                        fn(states[pin]);
                    }
                    return { unsubscribe: () => { watchers[pin] = watchers[pin].filter(f => f !== fn); } };
                },
            };
        },
        getGameStateInfo(pin) {
            return Promise.resolve({ state: { id: states[pin.toUpperCase()], timestamp: 1, deadline: 1 }, now: 100000 });
        },
        tickFrom(pin) { ticks.push(pin.toUpperCase()); },
    };
    const router = { navigate: parts => pages.push(parts.join('/')) };
    const service = new GameService(router, api);
    /** The server moves a game to a step. */
    const step = (pin, state) => {
        states[pin] = state;
        (watchers[pin] || []).slice().forEach(fn => fn(state));
    };
    const watched = () => Object.keys(watchers).filter(pin => watchers[pin].length);
    return { service, step, pages, ticks, watched };
}

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
