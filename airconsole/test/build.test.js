// The build AirConsole takes: screen.html and controller.html at its root, the API pinned, nothing
// loaded from a server we run, and no <img> on the controller. Builds airconsole/dist first.
// Run: cd airconsole && npm test
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const HERE = path.resolve(__dirname, '..');
const DIST = path.join(HERE, 'dist');
const API = 'https://www.airconsole.com/api/airconsole-1.11.0.js';

test.before(() => {
    execFileSync(process.execPath, [path.join(HERE, 'build.js')], { stdio: 'ignore' });
});

const read = f => fs.readFileSync(path.join(DIST, f), 'utf8');

test('screen.html and controller.html at the root, each with its script and the pinned API', () => {
    ['screen', 'controller'].forEach(page => {
        const html = read(`${page}.html`);
        const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m => m[1]);
        assert.deepStrictEqual(scripts, [API, `${page}.js`], page);
        assert.ok(fs.statSync(path.join(DIST, `${page}.js`)).size > 1000, `${page}.js`);
    });
    for (let i = 0; i < 12; i++) assert.ok(fs.existsSync(path.join(DIST, 'assets', `avatar${i}.png`)));
    assert.ok(fs.existsSync(path.join(DIST, 'assets', 'logo.png')));
});

test('everything but AirConsole\'s API comes from the build itself', () => {
    ['screen.html', 'controller.html', 'style.css'].forEach(f => {
        const urls = (read(f).match(/https?:\/\/[^\s"')]+/g) || []).filter(u => u !== API);
        assert.deepStrictEqual(urls, [], f);
    });
});

test('the controller draws no <img> (AirConsole\'s checklist): pictures are backgrounds', () => {
    ['controller.html', 'controller.js'].forEach(f => assert.ok(!/<img\b/i.test(read(f)), f));
});

test('the scripts call only the game\'s own Firebase project', () => {
    ['screen.js', 'controller.js'].forEach(f => {
        const js = read(f);
        assert.ok(js.includes('bullshit-wtf-prod'), f);
        assert.ok(js.includes('portal-airconsole'), f);
        assert.ok(!/showDefaultUI/.test(js), `${f} must not hide AirConsole's bar`);
    });
});

test('the whole build stays far below AirConsole\'s 50 MB', () => {
    const size = fs.readdirSync(DIST, { recursive: true }).map(f => path.join(DIST, f))
        .filter(f => fs.statSync(f).isFile()).reduce((s, f) => s + fs.statSync(f).size, 0);
    assert.ok(size < 5 * 1024 * 1024, `${size} bytes`);
});
