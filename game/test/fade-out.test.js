// Tests for fading out the big screen's music (src/app/pages/fade-out.ts).
// Run: npm test (from game/). Needs Node 20+.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function load() {
    const file = path.join(__dirname, '..', 'src', 'app', 'pages', 'fade-out.ts');
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}

const { fadeOutAndUnload } = load();

// Like a howler track: its methods need `this` (howler's stop reads `self._state` and `self._queue`).
function fakeTrack() {
    return {
        _queue: [],
        log: [],
        fade(from, to, ms) { this.log.push(['fade', from, to, ms]); return this; },
        unload() { this._queue.push('unload'); this.log.push(['unload']); return null; },
    };
}

test('fades the track out, then unloads that same track (BULLSHIT-5R)', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const track = fakeTrack();
    fadeOutAndUnload(track);
    assert.deepStrictEqual(track.log, [['fade', 1, 0, 1000]]);
    t.mock.timers.tick(1000);
    assert.deepStrictEqual(track.log, [['fade', 1, 0, 1000], ['unload']]);
});

test('a newer track started during the fade is left playing', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const page = { sound: fakeTrack() };
    const old = page.sound;
    fadeOutAndUnload(page.sound);
    page.sound = fakeTrack();
    t.mock.timers.tick(1000);
    assert.deepStrictEqual(old.log.map(e => e[0]), ['fade', 'unload']);
    assert.deepStrictEqual(page.sound.log, []);
});

test('no big-screen page hands a track method to setTimeout without its track', () => {
    const pages = path.join(__dirname, '..', 'src', 'app', 'pages');
    const offenders = [];
    for (const dir of fs.readdirSync(pages)) {
        const full = path.join(pages, dir);
        if (!fs.statSync(full).isDirectory()) {
            continue;
        }
        for (const f of fs.readdirSync(full).filter(n => n.endsWith('.ts'))) {
            if (/setTimeout\(\s*this\.sound\.\w+\s*,/.test(fs.readFileSync(path.join(full, f), 'utf8'))) {
                offenders.push(`${dir}/${f}`);
            }
        }
    }
    assert.deepStrictEqual(offenders, []);
});
