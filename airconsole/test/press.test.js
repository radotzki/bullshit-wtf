// How controller buttons act and how their commands reach the screen (src/press.js). AirConsole's
// simulator: START on the master phone did nothing, while Pong (which acts on the press) started.
// Run: cd airconsole && npm test
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { load } = require('./bundle');

let P;
test.before(async () => {
    P = await load('src/press.js');
});

/** A root element stand-in that records listeners and lets a test fire events at a target. */
function root() {
    const on = {};
    return {
        addEventListener: (type, fn) => { (on[type] = on[type] || []).push(fn); },
        fire(type, target, extra) {
            const e = Object.assign({ type, target, cancelable: true, prevented: false, button: 0 }, extra || {});
            e.preventDefault = () => { e.prevented = true; };
            (on[type] || []).forEach(fn => fn(e));
            return e;
        },
        on,
    };
}

function button(act, disabled) {
    const b = { disabled: !!disabled, getAttribute: k => (k === 'data-do' ? act : null) };
    b.closest = () => b;
    return b;
}

const withPointer = { PointerEvent: function () { } };

test('a press alone acts, with no click after it (as on AirConsole\'s simulated phones)', () => {
    const r = root();
    const acts = [];
    P.onPress(r, '[data-do]', b => acts.push(b.getAttribute('data-do')), withPointer);
    const e = r.fire('pointerdown', button('start'));
    assert.deepStrictEqual(acts, ['start']);
    assert.strictEqual(e.prevented, true, 'the press takes no focus');
});

test('a press and its own click act once', () => {
    const r = root();
    const acts = [];
    const b = button('start');
    P.onPress(r, '[data-do]', x => acts.push(x.getAttribute('data-do')), withPointer);
    r.fire('pointerdown', b);
    r.fire('click', b);
    assert.deepStrictEqual(acts, ['start']);
});

test('a press that redrew its button and the click on the new copy act once', () => {
    const r = root();
    const acts = [];
    P.onPress(r, '[data-do]', x => acts.push(x.getAttribute('data-do')), withPointer);
    r.fire('pointerdown', button('start'));
    r.fire('click', button('start'));
    assert.deepStrictEqual(acts, ['start']);
});

test('a click alone acts (a keyboard\'s Enter)', () => {
    const r = root();
    const acts = [];
    P.onPress(r, '[data-do]', x => acts.push(x.getAttribute('data-do')), withPointer);
    r.fire('click', button('locale'));
    assert.deepStrictEqual(acts, ['locale']);
});

test('disabled buttons and other mouse buttons do nothing', () => {
    const r = root();
    const acts = [];
    P.onPress(r, '[data-do]', x => acts.push(x), withPointer);
    r.fire('pointerdown', button('start', true));
    r.fire('click', button('start', true));
    r.fire('pointerdown', button('start'), { button: 2 });
    assert.deepStrictEqual(acts, []);
});

test('without pointer events, touchstart and mousedown are the press', () => {
    const r = root();
    const acts = [];
    P.onPress(r, '[data-do]', x => acts.push(x.getAttribute('data-do')), {});
    assert.ok(r.on.touchstart && r.on.mousedown && !r.on.pointerdown);
    r.fire('touchstart', button('start'));
    r.fire('click', button('start'));
    assert.deepStrictEqual(acts, ['start']);
});

test('commands are numbered by the clock, so a reloaded controller never repeats a number', () => {
    const a = P.nextCommand(null, 'start', 'ABCD', 1000);
    const b = P.nextCommand(a, 'start', 'ABCD', 1000);
    assert.deepStrictEqual(a, { type: 'start', pin: 'ABCD', n: 1000 });
    assert.strictEqual(b.n, 1001);
    const reloaded = P.nextCommand(null, 'start', 'ABCD', 5000);
    assert.ok(reloaded.n > b.n);
});

test('the screen acts once per command, by whichever route comes first, and only for its game', () => {
    const seen = {};
    const cmd = { type: 'start', pin: 'ABCD', n: 7 };
    assert.strictEqual(P.acceptCommand(seen, 1, cmd, 'ABCD'), true, 'the message');
    assert.strictEqual(P.acceptCommand(seen, 1, cmd, 'ABCD'), false, 'the same command in the device state');
    assert.strictEqual(P.acceptCommand(seen, 2, cmd, 'ABCD'), true, 'another device has its own numbers');
    assert.strictEqual(P.acceptCommand(seen, 1, { type: 'start', pin: 'ABCD', n: 8 }, 'ABCD'), true, 'a new press');
    assert.strictEqual(P.acceptCommand(seen, 1, { type: 'start', pin: 'WXYZ', n: 9 }, 'ABCD'), false, 'another game');
    assert.strictEqual(P.acceptCommand(seen, 1, { type: 'start', pin: 'ABCD', n: 9 }, null), false, 'no game yet');
    assert.strictEqual(P.acceptCommand(seen, 1, { type: 'start' }, 'ABCD'), false, 'no number');
    assert.strictEqual(P.acceptCommand(seen, 1, null, 'ABCD'), false);
});

test('the controller presses its buttons through onPress, and the screen reads commands by both routes', () => {
    const fs = require('fs');
    const path = require('path');
    const controller = fs.readFileSync(path.join(__dirname, '..', 'src', 'controller.js'), 'utf8');
    const screen = fs.readFileSync(path.join(__dirname, '..', 'src', 'screen.js'), 'utf8');
    // Only START, language and PLAY AGAIN act on the press (screens that don't scroll). An answer, SEND
    // or NEXT on the press would act on a finger that only meant to scroll the list (Product, 6805700).
    assert.match(controller, /const COMMAND_BUTTONS = '\[data-do="start"\], \[data-do="locale"\], \[data-do="again"\]';/);
    assert.match(controller, /onPress\(app, COMMAND_BUTTONS,/);
    assert.doesNotMatch(controller, /onPress\(app, '\[data-do\]'/);
    assert.match(controller, /setCustomDeviceState\(\{ cmd: command \}\)/);
    assert.match(screen, /air\.onCustomDeviceStateChange = /);
    assert.match(screen, /acceptCommand\(/);
});
