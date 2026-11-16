// Tests for the button that makes a host's computer the big screen
// (src/app/pages/game-staging/big-screen-host.ts). Run: npm test (from game/). Needs Node 20+.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function load(name) {
    const file = path.join(__dirname, '..', 'src', 'app', 'pages', 'game-staging', name);
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2015 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}

const { offerBigScreen, bigScreenStrings, pressedWith, hostStillToJoin } = load('big-screen-host.ts');

const host = { isHost: true, holdsHostKey: true, isPresenter: false, hasPresenter: false, device: 'computer' };
const offer = (over) => offerBigScreen(Object.assign({}, host, over));

test('offered to the host on a computer, in a game with no big screen', () => {
    assert.strictEqual(offer({}), true);
});

test('never on a phone, to a guest, without the host key, or once there is a big screen', () => {
    assert.strictEqual(offer({ device: 'phone' }), false);
    assert.strictEqual(offer({ isHost: false }), false);
    assert.strictEqual(offer({ holdsHostKey: false }), false);
    assert.strictEqual(offer({ hasPresenter: true }), false);
    assert.strictEqual(offer({ isPresenter: true }), false);
});

test('every line is there in English and in Hebrew', () => {
    const en = bigScreenStrings('en');
    const he = bigScreenStrings('he');
    assert.deepStrictEqual(Object.keys(he).sort(), Object.keys(en).sort());
    for (const key of Object.keys(en)) {
        assert.ok(en[key] && he[key], key);
        assert.match(he[key], /[֐-׿]/, key);
        assert.doesNotMatch(en[key], /[֐-׿]/, key);
    }
    // The words name the START button as the Hebrew game shows it.
    assert.match(he.how, /"מתחילים"/);
    assert.match(en.how, /START/);
    assert.strictEqual(bigScreenStrings('fr'), en);
});

test('the page offers the button only through offerBigScreen, and keeps the host key in this browser', () => {
    const dir = path.join(__dirname, '..', 'src', 'app', 'pages', 'game-staging');
    const html = fs.readFileSync(path.join(dir, 'game-staging.component.html'), 'utf8');
    const page = fs.readFileSync(path.join(dir, 'game-staging.component.ts'), 'utf8');
    assert.match(html, /\*ngIf="bigScreenOffer"[^>]*class="big-screen-offer"/);
    assert.match(page, /this\.bigScreenOffer = offerBigScreen\(/);
    assert.match(page, /hostToBigScreen\(this\.pin\)/);
});

test('the big screen keeps "scan the code" up until the host\'s phone joins under the host\'s name', () => {
    // A host on the computer and one guest press the button.
    const note = pressedWith([{ pid: 'host-seat', host: true, nickname: ' Dana ' }, { pid: 'guest', nickname: 'Ben' }]);
    assert.deepStrictEqual(JSON.parse(note), { with: ['guest'], host: 'dana' });
    assert.strictEqual(hostStillToJoin(note, []), true);
    // The host's seat is gone and only the guest is in: the host has not joined yet.
    assert.strictEqual(hostStillToJoin(note, [{ pid: 'guest', nickname: 'Ben' }]), true);
    // The host's phone joins, as a new player under the same name (any case, any spaces).
    assert.strictEqual(hostStillToJoin(note, [{ pid: 'guest', nickname: 'Ben' }, { pid: 'host-phone', nickname: 'DANA' }]), false);
    // The guest leaves after: the host is in, so the line stays gone.
    assert.strictEqual(hostStillToJoin(note, [{ pid: 'host-phone', nickname: 'Dana' }]), false);
});

test('two guests who join before the host after the press leave the line up', () => {
    const note = pressedWith([{ pid: 'host-seat', host: true, nickname: 'Dana' }, { pid: 'ben', nickname: 'Ben' }]);
    // Cleo joins after the press, before the host: the line stays (Product's review of #144, finding 1).
    assert.strictEqual(hostStillToJoin(note, [{ pid: 'ben', nickname: 'Ben' }, { pid: 'cleo', nickname: 'Cleo' }]), true);
    // And so does a third.
    const three = [{ pid: 'ben', nickname: 'Ben' }, { pid: 'cleo', nickname: 'Cleo' }, { pid: 'dov', nickname: 'Dov' }];
    assert.strictEqual(hostStillToJoin(note, three), true);
    // Then the host's phone: the line goes.
    assert.strictEqual(hostStillToJoin(note, three.concat([{ pid: 'host-phone', nickname: 'dana' }])), false);
    // A host alone at the press: two guests first, then the host, in Hebrew.
    const alone = pressedWith([{ pid: 'host-seat', host: true, nickname: 'דנה' }]);
    const guests = [{ pid: 'a', nickname: 'בן' }, { pid: 'b', nickname: 'קליאו' }];
    assert.strictEqual(hostStillToJoin(alone, guests), true);
    assert.strictEqual(hostStillToJoin(alone, guests.concat([{ pid: 'c', nickname: ' דנה' }])), false);
});

test('a guest from before the press who renames to the host\'s name does not end the line', () => {
    const note = pressedWith([{ pid: 'host-seat', host: true, nickname: 'Dana' }, { pid: 'ben', nickname: 'Ben' }]);
    assert.strictEqual(hostStillToJoin(note, [{ pid: 'ben', nickname: 'Dana' }]), true);
});

test('a host who joins under another name keeps the line up for the whole lobby', () => {
    const note = pressedWith([{ pid: 'host-seat', host: true, nickname: 'Dana' }]);
    assert.strictEqual(hostStillToJoin(note, [{ pid: 'p1', nickname: 'Danush' }, { pid: 'p2', nickname: 'Ben' }]), true);
});

test('without the host\'s name in the note, any new player ends the line, as before', () => {
    for (const note of [null, '', 'not json', '{"a":1}', '[1,2]', '{"with":[],"host":null}', '{"with":[],"host":"  "}']) {
        assert.strictEqual(hostStillToJoin(note, []), true, String(note));
        assert.strictEqual(hostStillToJoin(note, [{ pid: 'someone', nickname: 'X' }]), false, String(note));
    }
    // A note kept before this change (a list of ids) still works the old way.
    assert.strictEqual(hostStillToJoin('["guest"]', [{ pid: 'guest' }]), true);
    assert.strictEqual(hostStillToJoin('["guest"]', [{ pid: 'guest' }, { pid: 'new' }]), false);
    assert.deepStrictEqual(JSON.parse(pressedWith(null)), { with: [], host: null });
    // A host's seat with no name: no name to wait for.
    assert.deepStrictEqual(JSON.parse(pressedWith([{ pid: 'h', host: true }])), { with: [], host: null });
});

test('the page keeps the note at the press and shows the line with guests in', () => {
    const dir = path.join(__dirname, '..', 'src', 'app', 'pages', 'game-staging');
    const page = fs.readFileSync(path.join(dir, 'game-staging.component.ts'), 'utf8');
    assert.match(page, /sessionStorage\.setItem\(PRESSED_WITH_KEY \+ this\.pinKey\(\), pressedWith\(/);
    assert.match(page, /hostStillToJoin\(stored\(\(\) => sessionStorage, PRESSED_WITH_KEY \+ this\.pinKey\(\)\)/);
    assert.match(page, /this\.lobby\.sub = this\.b\.joinNow/);
    // The note is written before the switch, so a fast big screen already has it.
    assert.ok(page.indexOf('pressedWith(this.players') < page.indexOf('hostToBigScreen(this.pin)'));
});
