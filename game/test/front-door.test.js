// Tests for the phone home page as a front door (src/app/pages/landing/front-door.ts): which
// button leads, who sees the picture of the game, and a post's tag kept through to Create
// (src/app/services/join-source.ts).
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

const app = path.join(__dirname, '..', 'src', 'app');
const door = load(path.join(app, 'pages', 'landing', 'front-door.ts'));
const { homeStrings } = load(path.join(app, 'pages', 'landing', 'home-strings.ts'));
const sourceFile = path.join(app, 'services', 'join-source.ts');

/** A visitor as the home page reads one, from what a browser holds. */
function visitor(stored, tag) {
    return door.readVisitor(key => (key in stored ? stored[key] : null), tag);
}

const guest = { BS_PLAYER: JSON.stringify({ nickname: 'dana', pid: 'p2', uid: 'u2' }) };
const host = { BS_PLAYER: guest.BS_PLAYER, BS_HOST_KEYS: JSON.stringify({ ABCD: 'k' }) };

test('a stranger with no PIN gets Create first, and the picture of the game', () => {
    const v = visitor({});
    assert.deepStrictEqual(v, { played: false, hosted: false, tag: null });
    assert.strictEqual(door.firstButton(v), 'create');
    assert.strictEqual(door.showPicture(v), true);
});

test('a returning guest keeps Join on top and the short menu', () => {
    const v = visitor(guest);
    assert.strictEqual(door.firstButton(v), 'join');
    assert.strictEqual(door.showPicture(v), false);
});

test('someone who has hosted here gets Create first, without the picture', () => {
    const v = visitor(host);
    assert.strictEqual(v.hosted, true);
    assert.strictEqual(door.firstButton(v), 'create');
    assert.strictEqual(door.showPicture(v), false);
    // A host key alone (the seat was cleared) still counts as having played.
    assert.strictEqual(visitor({ BS_HOST_KEYS: host.BS_HOST_KEYS }).played, true);
});

test('a crew member counts as a returning player', () => {
    const v = visitor({ BS_CREWS: JSON.stringify([{ id: 'abc', name: 'Fridays', time: 1 }]) });
    assert.strictEqual(v.played, true);
    assert.strictEqual(door.showPicture(v), false);
    assert.strictEqual(door.firstButton(v), 'join');
});

test('a visit from a post gets Create first, even for a returning guest', () => {
    assert.strictEqual(door.firstButton(visitor(guest, 'fb-he-friday')), 'create');
    assert.strictEqual(door.firstButton(visitor({}, 'fb-he-friday')), 'create');
});

test('storage that is empty, broken or blocked reads as a stranger', () => {
    assert.strictEqual(door.firstButton(visitor({ BS_PLAYER: 'not json', BS_HOST_KEYS: '{', BS_CREWS: '[]' })), 'create');
    assert.strictEqual(visitor({ BS_PLAYER: 'null', BS_HOST_KEYS: '{}' }).played, false);
    const blocked = door.readVisitor(() => { throw new Error('SecurityError'); });
    assert.deepStrictEqual(blocked, { played: false, hosted: false, tag: null });
    assert.strictEqual(door.firstButton(undefined), 'create');
    assert.strictEqual(door.showPicture(undefined), true);
});

test('the Create button carries the post tag, and nothing when there is none', () => {
    assert.deepStrictEqual(door.createQuery('fb-he-hanukkah-parents'), { via: 'fb-he-hanukkah-parents' });
    assert.deepStrictEqual(door.createQuery(null), {});
    assert.deepStrictEqual(door.createQuery(''), {});
});

/** Loads join-source.ts fresh (its memory of the page load starts empty) in a made-up browser. */
function arrive(search, sessionStorage) {
    global.window = { location: { search, pathname: '/' }, localStorage: { getItem: () => null, setItem: () => { } } };
    if (sessionStorage === 'blocked') {
        Object.defineProperty(global.window, 'sessionStorage', { get() { throw new Error('SecurityError'); } });
    } else {
        global.window.sessionStorage = sessionStorage;
    }
    const source = load(sourceFile);
    source.rememberArrivalSource();
    return source;
}

function tabStorage(store) {
    return {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; },
    };
}

test('a post tag is kept from the home page through to Create', () => {
    try {
        const store = {};
        const source = arrive('?via=fb-he-hanukkah-parents', tabStorage(store));
        // The home page hands the tag to the Create button...
        const query = door.createQuery(source.arrivalCampaign());
        assert.deepStrictEqual(query, { via: 'fb-he-hanukkah-parents' });
        // ...and the Create page reads it back from its own address, as it does for the after-game ask.
        assert.strictEqual(source.readCampaign(`?via=${encodeURIComponent(query.via)}`), 'fb-he-hanukkah-parents');
        // A later page of the same tab (the app loaded again, no tag on the address) still has it.
        assert.strictEqual(arrive('', tabStorage(store)).arrivalCampaign(), 'fb-he-hanukkah-parents');
    } finally {
        delete global.window;
    }
});

test('the tag survives a browser that blocks the tab storage, or whose storage refuses to save', () => {
    try {
        assert.strictEqual(arrive('?via=wa-he-hanukkah', 'blocked').arrivalCampaign(), 'wa-he-hanukkah');
        const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => { } };
        const source = arrive('?via=test', full);
        assert.strictEqual(source.arrivalCampaign(), 'test');
        assert.deepStrictEqual(door.createQuery(source.arrivalCampaign()), { via: 'test' });
    } finally {
        delete global.window;
    }
});

test('an invite link, a results card or no tag at all is not a post tag', () => {
    try {
        for (const search of ['', '?via=link', '?via=qr', '?via=results', '?via=Bad Tag!', '?lang=he']) {
            const source = arrive(search, tabStorage({}));
            assert.strictEqual(source.arrivalCampaign(), null, search);
            assert.deepStrictEqual(door.createQuery(source.arrivalCampaign()), {}, search);
        }
    } finally {
        delete global.window;
    }
});

test('the line that says what the game is, in both languages', () => {
    assert.strictEqual(homeStrings('en').pitch, 'Everyone writes a lie. One answer is true. Fool your friends.');
    assert.ok(/[֐-׿]/.test(homeStrings('he').pitch));
    assert.strictEqual(homeStrings('he').pitch.split('. ').length, 3);
});

test('the picture uses a real opening question, with its true answer, in both languages', () => {
    const questions = Object.values(JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', '..', 'functions', 'data', 'opening-questions.json'), 'utf8')));
    for (const lang of ['en', 'he']) {
        const p = door.pictureStrings(lang);
        const text = `${p.before} $blank$ ${p.after}`.trim();
        const q = questions.filter(x => x.lang === lang && x.questionText === text)[0];
        assert.ok(q, `no opening question reads: ${text}`);
        assert.strictEqual(p.truth.toLowerCase(), q.realAnswer.toLowerCase());
        for (const lie of [p.lie, p.otherLie]) {
            assert.notStrictEqual(lie.toLowerCase(), q.realAnswer.toLowerCase());
        }
        assert.strictEqual(p.steps.length, 3);
    }
    assert.strictEqual(door.pictureStrings('fr'), door.pictureStrings('en'));
    const he = door.pictureStrings('he');
    assert.deepStrictEqual(Object.keys(he).sort(), Object.keys(door.pictureStrings('en')).sort());
    for (const value of [he.alt, he.before, he.lie, he.otherLie, he.truth, he.send, he.fooled, he.yourLie, he.theTruth].concat(he.steps)) {
        assert.ok(/[֐-׿]/.test(value) && !/[A-Za-z]/.test(value), `not Hebrew: ${value}`);
    }
});
