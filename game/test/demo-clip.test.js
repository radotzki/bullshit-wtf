// The demo clip on the home (components/demo-clip): 20 silent seconds of one real round, under the
// first screen, in the home's language. Nothing of it loads until it is near the screen; reduced
// motion gets the still alone; the first time half of it is in view counts once for the visits table.
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

const src = path.join(__dirname, '..', 'src');
const clipDir = path.join(src, 'app', 'components', 'demo-clip');
const { clipStrings, watchClip, CLIP_SEEN } = load(path.join(clipDir, 'demo-clip.ts'));
const landing = path.join(src, 'app', 'pages', 'landing');
const phone = fs.readFileSync(path.join(landing, 'mobile-landing', 'mobile-landing.component.html'), 'utf8');
const computer = fs.readFileSync(path.join(landing, 'desktop-landing', 'desktop-landing.component.html'), 'utf8');
const component = fs.readFileSync(path.join(clipDir, 'demo-clip.component.ts'), 'utf8');

function fakeVideo() {
    const v = { muted: false, poster: '', src: '', loop: false, autoplay: false, paused: true, plays: 0, attrs: {} };
    v.play = () => { v.plays++; v.paused = false; return Promise.resolve(); };
    v.pause = () => { v.paused = true; };
    v.setAttribute = (n, x) => { v.attrs[n] = x; };
    v.removeAttribute = (n) => { delete v.attrs[n]; if (n === 'src') { v.src = ''; } };
    return v;
}

function fakeBrowser({ reduced = false, observer = true } = {}) {
    const watchers = [];
    return {
        watchers,
        reducedMotion: () => reduced,
        observe: observer ? (el, margin, threshold, cb) => {
            const w = { margin, threshold, cb, on: true };
            watchers.push(w);
            return () => { w.on = false; };
        } : null,
        near(inside) { watchers.filter(w => w.threshold === 0).forEach(w => w.cb(inside)); },
        inView(inside) { watchers.filter(w => w.threshold > 0).forEach(w => w.cb(inside)); },
    };
}

test('each language has its own clip, still and caption, and the files are in the assets', () => {
    const en = clipStrings('en');
    const he = clipStrings('he');
    assert.strictEqual(clipStrings('fr').src, en.src);
    assert.match(en.src, /demo-round-en\.mp4$/);
    assert.match(he.src, /demo-round-he\.mp4$/);
    for (const c of [en, he]) {
        for (const file of [c.src, c.poster]) {
            const size = fs.statSync(path.join(src, file)).size;
            assert.ok(size > 10000 && size < 600000, `${file}: ${size} bytes`);
        }
        assert.ok(c.caption.length > 10 && c.caption.length < 100, c.caption);
        assert.ok(c.alt.length > 40);
    }
    assert.ok(/[֐-׿]/.test(he.caption) && /[֐-׿]/.test(he.alt));
});

test('nothing loads before the clip is near the screen; then it plays while in view, muted and looping', () => {
    const v = fakeVideo();
    const b = fakeBrowser();
    let seen = 0;
    watchClip(v, {}, clipStrings('en'), b, () => seen++);
    assert.strictEqual(v.src, '');
    assert.strictEqual(v.poster, '');
    assert.ok(v.muted && 'muted' in v.attrs && 'playsinline' in v.attrs);
    b.near(true);
    assert.match(v.src, /demo-round-en\.mp4$/);
    assert.match(v.poster, /demo-round-en-poster\.jpg$/);
    assert.ok(v.loop);
    assert.strictEqual(v.plays, 0, 'loaded, but not on the screen yet');
    b.inView(true);
    assert.strictEqual(v.plays, 1);
    assert.strictEqual(seen, 1);
    b.inView(false);
    assert.ok(v.paused, 'paused off the screen');
    b.inView(true);
    assert.strictEqual(seen, 1, 'counted once a page view');
    assert.strictEqual(v.plays, 2);
    assert.ok(b.watchers.some(w => w.threshold === CLIP_SEEN));
});

test('reduced motion: the still alone, no video fetched, never played; still counted once seen', () => {
    const v = fakeVideo();
    const b = fakeBrowser({ reduced: true });
    let seen = 0;
    watchClip(v, {}, clipStrings('he'), b, () => seen++);
    b.near(true);
    b.inView(true);
    assert.match(v.poster, /demo-round-he-poster\.jpg$/);
    assert.strictEqual(v.src, '');
    assert.strictEqual(v.plays, 0);
    assert.strictEqual(seen, 1);
});

test('switching the language swaps the clip; stop disconnects the watchers', () => {
    const v = fakeVideo();
    const b = fakeBrowser();
    const w = watchClip(v, {}, clipStrings('en'), b, () => null);
    w.setClip(clipStrings('he'));
    assert.strictEqual(v.src, '', 'still not loaded before it is near');
    b.near(true);
    assert.match(v.src, /demo-round-he\.mp4$/);
    w.setClip(clipStrings('en'));
    assert.match(v.src, /demo-round-en\.mp4$/);
    w.stop();
    assert.ok(b.watchers.every(x => !x.on));
});

test('a browser with no IntersectionObserver loads it at once', () => {
    const v = fakeVideo();
    watchClip(v, {}, clipStrings('en'), fakeBrowser({ observer: false }), () => null);
    assert.match(v.src, /demo-round-en\.mp4$/);
});

test('the video tag asks for nothing by itself: no src, no poster, preload none, muted, inline', () => {
    const tag = /<video[^>]*>/.exec(component)[0];
    assert.match(tag, /preload="none"/);
    assert.match(tag, /\bmuted\b/);
    assert.match(tag, /\bplaysinline\b/);
    assert.ok(!/\bsrc=|poster=|autoplay/.test(tag), tag);
});

test('placement: under the first screen on both homes, in the home\'s language', () => {
    // Phone, never played: after Start, the picture and Join, so the first screen is as it was.
    const block = phone.slice(phone.indexOf('<ng-container *ngIf="picture">'), phone.indexOf('<ng-container *ngIf="!picture">'));
    assert.ok(block.indexOf('<app-demo-clip [lang]="t.lang">') > block.indexOf('*ngTemplateOutlet="join"'));
    assert.strictEqual((phone.match(/<app-demo-clip/g) || []).length, 1);
    // Computer: after the front door and after the season line and the row of search pages, which
    // stay on the first screen of a 1280 x 720 computer; the clip starts just under it.
    assert.strictEqual((computer.match(/<app-demo-clip/g) || []).length, 1);
    const at = computer.indexOf('<app-demo-clip [lang]="t.lang">');
    assert.ok(at > computer.indexOf('class="front-door"'));
    assert.ok(at > computer.indexOf('<div class="below">'));
    assert.ok(at > computer.indexOf('class="season"') && at > computer.indexOf('class="search-links"'));
});

test('phone: the season line sits under Join, so Join Game stays on a small phone\'s first screen', () => {
    // One season line, in a template placed right after Join in both menus.
    assert.strictEqual((phone.match(/class="season"/g) || []).length, 1);
    const tpl = phone.indexOf('<ng-template #season_line>');
    assert.ok(tpl > 0 && phone.indexOf('class="season"') > tpl);
    // Never played: Join, then the season line, then the clip.
    const block = phone.slice(phone.indexOf('<ng-container *ngIf="picture">'), phone.indexOf('<ng-container *ngIf="!picture">'));
    const join = block.indexOf('*ngTemplateOutlet="join"');
    const line = block.indexOf('*ngTemplateOutlet="season_line"');
    assert.ok(join > 0 && line > join && block.indexOf('<app-demo-clip') > line);
    assert.ok(block.indexOf('*ngTemplateOutlet="create"') < join);
    // Played before: after the two buttons (Create and Join, in either order).
    const back = phone.slice(phone.indexOf('<ng-container *ngIf="!picture">'), phone.indexOf('<ng-template #join>'));
    assert.ok(back.indexOf('*ngTemplateOutlet="season_line"') > back.lastIndexOf("first === 'create' ? join : create"));
});
